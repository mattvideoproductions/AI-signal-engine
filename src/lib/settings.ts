import { randomUUID } from 'node:crypto';
import { store } from './db';
import { DEFAULT_CONFIG, type AppConfig, type SignalSource } from './types';

export function getConfig(): AppConfig {
  return { ...DEFAULT_CONFIG, ...store().snapshot().config };
}

export function addIgnoredTopic(topic: string): AppConfig {
  const current = getConfig();
  const normalized = topic.trim();
  if (!normalized || current.ignoredTopics.some((t) => t.toLowerCase() === normalized.toLowerCase())) {
    return current;
  }
  return setConfig({ ignoredTopics: [...current.ignoredTopics, normalized] });
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch };
  store().update((data) => {
    data.config = next;
  });
  return next;
}

export function listSources(): SignalSource[] {
  return store()
    .snapshot()
    .sources.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function addSource(name: string, url: string): SignalSource {
  const source: SignalSource = {
    id: randomUUID(),
    name: name.trim() || new URL(url).hostname,
    url: url.trim(),
    created_at: new Date().toISOString(),
  };
  store().update((data) => {
    data.sources.push(source);
  });
  return source;
}

export function removeSource(id: string): void {
  store().update((data) => {
    data.sources = data.sources.filter((s) => s.id !== id);
  });
}
