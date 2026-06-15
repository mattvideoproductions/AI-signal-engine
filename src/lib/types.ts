import { z } from 'zod';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORY_KEYS = [
  'model_release',
  'agent_update',
  'product_launch',
  'pricing',
  'research',
  'safety',
  'open_source',
  'infrastructure',
  'rumor',
  'other',
] as const;

export type Category = (typeof CATEGORY_KEYS)[number];

export const CATEGORIES: Record<Category, { label: string; color: string }> = {
  model_release: { label: 'Models', color: '#22d3ee' },
  agent_update: { label: 'Agents', color: '#a78bfa' },
  open_source: { label: 'Open Source', color: '#34d399' },
  safety: { label: 'Safety', color: '#fbbf24' },
  product_launch: { label: 'Product Launches', color: '#60a5fa' },
  pricing: { label: 'Pricing', color: '#f472b6' },
  research: { label: 'Research', color: '#818cf8' },
  infrastructure: { label: 'Infrastructure', color: '#2dd4bf' },
  rumor: { label: 'Rumors', color: '#fb923c' },
  other: { label: 'Other', color: '#94a3b8' },
};

/** The eight categories surfaced as filter chips on the dashboard. */
export const FILTER_CATEGORIES: Category[] = [
  'model_release',
  'agent_update',
  'open_source',
  'safety',
  'product_launch',
  'pricing',
  'research',
  'infrastructure',
];

export const CATEGORY_ICONS: Record<Category, string> = {
  model_release: '🧠',
  agent_update: '🤖',
  open_source: '🔓',
  safety: '🛡️',
  product_launch: '🚀',
  pricing: '💰',
  research: '🔬',
  infrastructure: '🏗️',
  rumor: '👂',
  other: '📡',
};

export type Confidence = 'low' | 'medium' | 'high';
export type AgentStatus = 'idle' | 'scanning' | 'bundling' | 'ready';

// ---------------------------------------------------------------------------
// Buckets — macro sectors rendered as labeled territories on the map.
// Hermes can assign one explicitly via the `bucket` field; otherwise it is
// derived from the category.
// ---------------------------------------------------------------------------

export const BUCKET_KEYS = [
  'intelligence',
  'agents',
  'open',
  'compute',
  'trust',
  'frontier',
] as const;

export type BucketKey = (typeof BUCKET_KEYS)[number];

export const BUCKETS: Record<
  BucketKey,
  { label: string; icon: string; color: string; categories: Category[] }
> = {
  intelligence: { label: 'Intelligence', icon: '🧠', color: '#22d3ee', categories: ['model_release', 'research'] },
  agents: { label: 'Agents & Products', icon: '🤖', color: '#a78bfa', categories: ['agent_update', 'product_launch'] },
  open: { label: 'Open Ecosystem', icon: '🔓', color: '#34d399', categories: ['open_source'] },
  compute: { label: 'Compute & Capital', icon: '⚡', color: '#2dd4bf', categories: ['infrastructure', 'pricing'] },
  trust: { label: 'Trust & Safety', icon: '🛡️', color: '#fbbf24', categories: ['safety', 'rumor'] },
  frontier: { label: 'Uncharted', icon: '🧭', color: '#94a3b8', categories: ['other'] },
};

export function bucketForCategory(category: Category): BucketKey {
  for (const key of BUCKET_KEYS) {
    if (BUCKETS[key].categories.includes(category)) return key;
  }
  return 'frontier';
}

export function resolveBucket(raw: string, category: Category): BucketKey {
  return (BUCKET_KEYS as readonly string[]).includes(raw)
    ? (raw as BucketKey)
    : bucketForCategory(category);
}

/** Local calendar day (YYYY-MM-DD) an event was retrieved — drives the Day Rail. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Event payload (what Hermes POSTs to /api/events)
// ---------------------------------------------------------------------------

export const ConnectionSchema = z.object({
  target_title_or_id: z.string().min(1),
  relationship: z.string().default('related to'),
  strength: z.coerce.number().min(0).max(10).default(5),
  /** The agent's one-sentence explanation of WHY these stories are linked. */
  reason: z.string().max(600).default(''),
});

export const EventPayloadSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(4000).default(''),
  source_url: z.string().max(2000).default(''),
  source_name: z.string().max(200).default(''),
  category: z.enum(CATEGORY_KEYS).default('other'),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  novelty_score: z.coerce.number().min(0).max(10).default(5),
  viewer_interest_score: z.coerce.number().min(0).max(10).default(5),
  risk_score: z.coerce.number().min(0).max(10).default(3),
  verification_needed: z.array(z.string()).default([]),
  claims_to_verify: z.array(z.string()).default([]),
  do_not_overstate: z.array(z.string()).default([]),
  related_entities: z.array(z.string()).default([]),
  connections: z.array(ConnectionSchema).default([]),
  thumbnail_angle: z.string().default(''),
  title_angle: z.string().default(''),
  notes: z.string().default(''),
  /** Macro sector. One of BUCKET_KEYS; anything else falls back to the category-derived bucket. */
  bucket: z.string().default(''),
});

/** Ingest payload may carry `retrieved_at` so Hermes can backfill the day it found a signal. */
export const IngestSchema = EventPayloadSchema.extend({
  retrieved_at: z.string().optional(),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;
export type EventPayloadInput = z.input<typeof EventPayloadSchema>;

export interface StoredConnection {
  target_title_or_id: string;
  relationship: string;
  strength: number;
  /** The agent's one-sentence explanation of why these stories are linked. */
  reason: string;
  /** Event id this connection resolved to, if a match was found. */
  resolved_target_id: string | null;
}

export interface SignalEvent extends Omit<EventPayload, 'connections' | 'bucket'> {
  id: string;
  connections: StoredConnection[];
  bucket: BucketKey;
  status: 'live' | 'draft';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Bundles & briefs
// ---------------------------------------------------------------------------

export const BundleRequestSchema = z.object({
  event_ids: z.array(z.string()).min(1),
  bundle_name: z.string().default(''),
  bundle_goal: z.string().default(''),
});

export interface StoryBundle {
  id: string;
  name: string;
  goal: string;
  event_ids: string[];
  summary: string;
  story_arc: string;
  segment_outline: string[];
  recommended_title: string;
  thumbnail_idea: string;
  verification_checklist: string[];
  source_urls: string[];
  created_at: string;
}

export interface CreatorBrief {
  id: string;
  generated_at: string;
  executive_summary: string;
  strongest_angle: string;
  title_ideas: string[];
  thumbnail_ideas: string[];
  bundles: StoryBundle[];
  segment_outline: string[];
  talking_points: string[];
  verification_checklist: string[];
  risky_claims: string[];
  sources: { name: string; url: string }[];
}

// ---------------------------------------------------------------------------
// Live stream / log
// ---------------------------------------------------------------------------

export interface LogEntry {
  ts: string;
  level: 'info' | 'success' | 'warn';
  msg: string;
}

export type StreamMessage =
  | { type: 'hello'; data: { status: AgentStatus; logs: LogEntry[] } }
  | { type: 'event'; data: SignalEvent }
  | { type: 'status'; data: AgentStatus }
  | { type: 'log'; data: LogEntry }
  | { type: 'bundle'; data: StoryBundle }
  | { type: 'remove'; data: { id: string } }
  | { type: 'clear'; data: null };

// ---------------------------------------------------------------------------
// Sources & settings
// ---------------------------------------------------------------------------

export interface SignalSource {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface AppConfig {
  minConfidenceForBrief: Confidence;
  maxRiskForTitleIdeas: number;
  showEntities: boolean;
  watchTopics: string[];
  /** Topics killed from the board — injected into the Hermes prompt and enforced at ingest. */
  ignoredTopics: string[];
  verificationRules: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  minConfidenceForBrief: 'low',
  maxRiskForTitleIdeas: 8,
  showEntities: true,
  watchTopics: [
    'frontier models',
    'coding agents',
    'open-source weights',
    'AI safety research',
    'GPU pricing',
  ],
  ignoredTopics: [],
  verificationRules:
    'Every benchmark claim needs a second independent source.\n' +
    'Rumors are never presented as confirmed.\n' +
    'Pricing changes are verified against official pricing pages.\n' +
    'Quotes are checked against the original post or paper.',
};

// ---------------------------------------------------------------------------
// Scoring helpers (shared by brief + bundle generators and the UI)
// ---------------------------------------------------------------------------

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 1,
  medium: 0.85,
  low: 0.6,
};

/** Deterministic creator-value score: how much a story matters for a video. */
export function signalScore(e: SignalEvent): number {
  const raw =
    e.novelty_score * 0.35 +
    e.viewer_interest_score * 0.45 +
    (10 - e.risk_score) * 0.2;
  return raw * CONFIDENCE_WEIGHT[e.confidence];
}

export function isRisky(e: SignalEvent): boolean {
  return e.risk_score >= 7 || e.confidence === 'low';
}

export function firstSentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const m = t.match(/^.+?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}
