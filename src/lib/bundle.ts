import { randomUUID } from 'node:crypto';
import { store } from './db';
import {
  CATEGORIES,
  firstSentence,
  signalScore,
  type Category,
  type SignalEvent,
  type StoryBundle,
} from './types';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function dominantCategory(events: SignalEvent[]): Category {
  const counts = new Map<Category, number>();
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  let best: Category = 'other';
  let max = 0;
  for (const [cat, n] of counts) {
    if (n > max) {
      max = n;
      best = cat;
    }
  }
  return best;
}

/**
 * Deterministic bundle builder — turns a set of related events into a
 * filmable story package. No LLM required.
 */
export function buildBundle(
  events: SignalEvent[],
  name = '',
  goal = '',
): StoryBundle {
  const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ranked = [...events].sort((a, b) => signalScore(b) - signalScore(a));
  const lead = ranked[0];
  const category = dominantCategory(events);
  const entities = unique(events.flatMap((e) => e.related_entities)).slice(0, 5);

  const bundleName =
    name.trim() ||
    `${CATEGORIES[category].label}: ${entities[0] ?? lead.title.slice(0, 48)}`;

  const summary =
    `${events.length} connected signal${events.length === 1 ? '' : 's'} centered on ` +
    `${entities.slice(0, 3).join(', ') || CATEGORIES[category].label.toLowerCase()}. ` +
    `Lead story: ${lead.title}. ${firstSentence(lead.summary)}` +
    (goal.trim() ? ` Goal: ${goal.trim()}` : '');

  const storyArc = ordered
    .map((e, i) => {
      const opener =
        i === 0 ? 'It opens with' : i === ordered.length - 1 ? 'It lands on' : 'Then';
      return `${opener} "${e.title}" (${e.confidence} confidence)`;
    })
    .join(' → ');

  const segmentOutline = [
    `Cold open: ${lead.title_angle || lead.title}`,
    ...ordered.map((e) => `Beat — ${e.title}: ${firstSentence(e.summary) || e.title}`),
    'Close: what this means for the next 90 days, and what to watch.',
  ];

  const verificationChecklist = unique(
    events.flatMap((e) =>
      [...e.claims_to_verify, ...e.verification_needed].map(
        (item) => `[${e.source_name || e.title.slice(0, 40)}] ${item}`,
      ),
    ),
  );

  const sourceUrls = unique(events.map((e) => e.source_url).filter(Boolean));

  return {
    id: randomUUID(),
    name: bundleName,
    goal: goal.trim(),
    event_ids: events.map((e) => e.id),
    summary,
    story_arc: storyArc,
    segment_outline: segmentOutline,
    recommended_title:
      lead.title_angle || `${entities[0] ?? 'AI'} just moved the goalposts: ${lead.title}`,
    thumbnail_idea:
      lead.thumbnail_angle ||
      `Split frame: ${entities[0] ?? 'the lead story'} logo vs a glowing "${CATEGORIES[category].label}" headline bar`,
    verification_checklist: verificationChecklist,
    source_urls: sourceUrls,
    created_at: new Date().toISOString(),
  };
}

export function saveBundle(bundle: StoryBundle): void {
  store().update((data) => {
    data.bundles = [bundle, ...data.bundles.filter((b) => b.id !== bundle.id)];
  });
}

export function listBundles(): StoryBundle[] {
  return store()
    .snapshot()
    .bundles.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
