import { randomUUID } from 'node:crypto';
import { store } from './db';
import { resolveBucket, type EventPayload, type SignalEvent, type StoredConnection } from './types';

export function listEvents(): SignalEvent[] {
  return store()
    .snapshot()
    .events.map((e) => ({ ...e, bucket: resolveBucket(e.bucket, e.category) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getEventsByIds(ids: string[]): SignalEvent[] {
  const set = new Set(ids);
  return listEvents().filter((e) => set.has(e.id));
}

export function hasEventWithSourceUrl(url: string): boolean {
  if (!url) return false;
  return listEvents().some((e) => e.source_url === url);
}

/**
 * Resolve `target_title_or_id` against existing events by id, exact title,
 * or fuzzy containment — Hermes usually references stories by title.
 */
function resolveConnections(
  payload: EventPayload,
  existing: SignalEvent[],
): StoredConnection[] {
  return payload.connections.map((c) => {
    const needle = c.target_title_or_id.trim().toLowerCase();
    const target = existing.find((e) => {
      if (e.id === c.target_title_or_id) return true;
      const title = e.title.toLowerCase();
      return title === needle || title.includes(needle) || needle.includes(title);
    });
    return {
      target_title_or_id: c.target_title_or_id,
      relationship: c.relationship,
      strength: c.strength,
      reason: c.reason ?? '',
      resolved_target_id: target?.id ?? null,
    };
  });
}

export function insertEvent(
  payload: EventPayload,
  status: 'live' | 'draft' = 'live',
  retrievedAt?: string,
): SignalEvent {
  const existing = listEvents();
  const connections = resolveConnections(payload, existing);
  const id = randomUUID();
  const createdAt =
    retrievedAt && !Number.isNaN(Date.parse(retrievedAt))
      ? new Date(retrievedAt).toISOString()
      : new Date().toISOString();
  const bucket = resolveBucket(payload.bucket, payload.category);
  const stored: SignalEvent = { ...payload, id, connections, bucket, status, created_at: createdAt };

  store().update((data) => {
    data.events.push(stored);
  });

  return stored;
}

/** Deletes a single event; returns it (for ignore-list bookkeeping) or null. */
export function deleteEvent(id: string): SignalEvent | null {
  const event = listEvents().find((e) => e.id === id) ?? null;
  if (event) {
    store().update((data) => {
      data.events = data.events.filter((e) => e.id !== id);
    });
  }
  return event;
}

/** Clears the board: all events and bundles. Briefs are kept as history. */
export function clearEvents(): void {
  store().update((data) => {
    data.events = [];
    data.bundles = [];
  });
}
