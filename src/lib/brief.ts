import { randomUUID } from 'node:crypto';
import { buildBundle } from './bundle';
import { store } from './db';
import {
  CATEGORIES,
  firstSentence,
  isRisky,
  signalScore,
  type AppConfig,
  type Confidence,
  type CreatorBrief,
  type SignalEvent,
  type StoryBundle,
} from './types';

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

/** Connected components over resolved connections — natural story clusters. */
function clusterEvents(events: SignalEvent[]): SignalEvent[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const e of events) parent.set(e.id, e.id);
  const ids = new Set(events.map((e) => e.id));
  for (const e of events) {
    for (const c of e.connections) {
      if (c.resolved_target_id && ids.has(c.resolved_target_id)) {
        union(e.id, c.resolved_target_id);
      }
    }
  }

  const groups = new Map<string, SignalEvent[]>();
  for (const e of events) {
    const root = find(e.id);
    const group = groups.get(root) ?? [];
    group.push(e);
    groups.set(root, group);
  }
  return [...groups.values()];
}

/**
 * v1 brief generation is fully deterministic and local — no LLM key needed.
 * To plug in an LLM later, replace (or wrap) this function: every input it
 * uses (events, bundles, config) is already structured for prompting.
 */
export function generateBrief(
  allEvents: SignalEvent[],
  storedBundles: StoryBundle[],
  config: AppConfig,
): CreatorBrief {
  const live = allEvents.filter((e) => e.status === 'live');
  const usable = live.filter(
    (e) => CONFIDENCE_RANK[e.confidence] >= CONFIDENCE_RANK[config.minConfidenceForBrief],
  );
  const pool = usable.length > 0 ? usable : live;
  const ranked = [...pool].sort((a, b) => signalScore(b) - signalScore(a));
  const lead = ranked[0];

  // --- bundles: prefer user-made bundles, fill the rest from graph clusters
  const bundleList: StoryBundle[] = storedBundles.slice(0, 3);
  if (bundleList.length < 3 && pool.length > 0) {
    const used = new Set(bundleList.flatMap((b) => b.event_ids));
    const clusters = clusterEvents(pool.filter((e) => !used.has(e.id)))
      .filter((c) => c.length >= 2)
      .sort(
        (a, b) =>
          b.reduce((s, e) => s + signalScore(e), 0) -
          a.reduce((s, e) => s + signalScore(e), 0),
      );
    for (const cluster of clusters) {
      if (bundleList.length >= 3) break;
      bundleList.push(buildBundle(cluster));
    }
    if (bundleList.length === 0 && ranked.length > 0) {
      bundleList.push(buildBundle(ranked.slice(0, Math.min(4, ranked.length))));
    }
  }

  // --- executive summary
  const catCounts = new Map<string, number>();
  for (const e of live) {
    const label = CATEGORIES[e.category].label;
    catCounts.set(label, (catCounts.get(label) ?? 0) + 1);
  }
  const topCats = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${label} (${n})`);
  const riskyCount = live.filter(isRisky).length;
  const verifyCount = live.reduce(
    (s, e) => s + e.claims_to_verify.length + e.verification_needed.length,
    0,
  );

  const executiveSummary =
    live.length === 0
      ? 'The board is empty. Run a demo scan or point Hermes at /api/events to populate the map.'
      : `Across ${live.length} tracked signals, the board is dominated by ${topCats.join(', ')}. ` +
        `The strongest creator angle right now is "${lead?.title_angle || lead?.title}". ` +
        `${riskyCount} signal${riskyCount === 1 ? '' : 's'} carry elevated risk or low confidence and must not be presented as confirmed. ` +
        `There are ${verifyCount} open verification items to clear before filming.`;

  const strongestAngle = lead
    ? `${lead.title_angle || lead.title} — backed by ${
        lead.connections.filter((c) => c.resolved_target_id).length
      } connected signal(s), ${lead.confidence} confidence, viewer interest ${lead.viewer_interest_score}/10.`
    : 'No signals on the board yet.';

  // --- title ideas (top 5)
  const safeForTitles = ranked.filter((e) => e.risk_score <= config.maxRiskForTitleIdeas);
  const titleIdeas = unique([
    ...safeForTitles.map((e) => e.title_angle).filter(Boolean),
    ...bundleList.map((b) => b.recommended_title),
    ...safeForTitles.map(
      (e) => `${e.related_entities[0] ?? 'AI'}: ${firstSentence(e.summary) || e.title}`,
    ),
  ]).slice(0, 5);

  // --- thumbnail ideas (top 5)
  const thumbnailIdeas = unique([
    ...ranked.map((e) => e.thumbnail_angle).filter(Boolean),
    ...bundleList.map((b) => b.thumbnail_idea),
    'Creator pointing at a glowing relationship map with two rival logos connected by a red "VS" edge',
  ]).slice(0, 5);

  // --- segment outline
  const segmentOutline =
    live.length === 0
      ? []
      : [
          `Cold open (0:00) — ${lead.title_angle || lead.title}`,
          ...bundleList.map(
            (b, i) => `Segment ${i + 1} — ${b.name}: ${firstSentence(b.summary)}`,
          ),
          `Verification corner — walk through the ${verifyCount} open checks on screen (builds trust, great retention beat).`,
          'Outro — what to watch next, and a call to comment with predictions.',
        ];

  const talkingPoints = ranked
    .slice(0, 6)
    .map(
      (e) =>
        `${e.title} — ${firstSentence(e.summary) || 'see source'} [${e.confidence} confidence, ${
          e.source_name || 'no source name'
        }]`,
    );

  const verificationChecklist = unique(
    live.flatMap((e) =>
      [...e.claims_to_verify, ...e.verification_needed].map(
        (item) => `${item} (re: ${e.title.slice(0, 60)})`,
      ),
    ),
  ).slice(0, 14);

  const riskyClaims = unique([
    ...live.flatMap((e) => e.do_not_overstate.map((d) => `${d} (re: ${e.title.slice(0, 60)})`)),
    ...live
      .filter(isRisky)
      .map(
        (e) =>
          `Do not present "${e.title}" as confirmed — ${e.confidence} confidence, risk ${e.risk_score}/10.`,
      ),
  ]);

  const seen = new Set<string>();
  const sources: { name: string; url: string }[] = [];
  for (const e of live) {
    if (e.source_url && !seen.has(e.source_url)) {
      seen.add(e.source_url);
      sources.push({ name: e.source_name || e.source_url, url: e.source_url });
    }
  }

  return {
    id: randomUUID(),
    generated_at: new Date().toISOString(),
    executive_summary: executiveSummary,
    strongest_angle: strongestAngle,
    title_ideas: titleIdeas,
    thumbnail_ideas: thumbnailIdeas,
    bundles: bundleList,
    segment_outline: segmentOutline,
    talking_points: talkingPoints,
    verification_checklist: verificationChecklist,
    risky_claims: riskyClaims,
    sources,
  };
}

export function saveBrief(brief: CreatorBrief): void {
  store().update((data) => {
    data.briefs = [brief, ...data.briefs.filter((b) => b.id !== brief.id)];
  });
}

export function getLatestBrief(): CreatorBrief | null {
  return (
    store()
      .snapshot()
      .briefs.sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] ?? null
  );
}
