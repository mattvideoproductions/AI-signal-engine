import { firstSentence, isRisky, type SignalEvent } from './types';

/**
 * Deterministic insight synthesis for a connection between two signals.
 * Safe to run client-side; no LLM required. Swap in an LLM here later for
 * richer takes — the inputs are already structured.
 */

export interface ConnectionInsight {
  icon: string;
  headline: string;
  analysis: string;
  creatorMove: string;
  caution: string | null;
}

function shortName(e: SignalEvent): string {
  return e.related_entities[0] ?? (e.title.length > 42 ? `${e.title.slice(0, 42)}…` : e.title);
}

export function connectionInsight(
  a: SignalEvent,
  b: SignalEvent,
  relationship: string,
  strength: number,
): ConnectionInsight {
  const nameA = shortName(a);
  const nameB = shortName(b);
  const rel = relationship.toLowerCase();
  const combinedInterest = Math.round(((a.viewer_interest_score + b.viewer_interest_score) / 2) * 10) / 10;
  const heat = strength >= 7 ? 'a load-bearing thread' : strength >= 4 ? 'a solid thread' : 'a loose thread';

  let icon = '🧵';
  let headline = `${nameA} ↔ ${nameB}`;
  let analysis = `These two signals are linked (${relationship}). Together they average ${combinedInterest}/10 viewer interest — ${heat} on the board.`;
  let creatorMove = `Mention "${b.title}" as context when covering "${a.title}" — connected stories retain better than isolated ones.`;

  if (rel.includes('compet')) {
    icon = '⚔️';
    headline = `Collision course: ${nameA} vs ${nameB}`;
    analysis = `Both signals are converging on the same ground. ${firstSentence(a.summary)} Meanwhile: ${firstSentence(b.summary)} Framing this as a head-to-head gives the video a spine.`;
    creatorMove = `Open with the rivalry framing — "${nameA} vs ${nameB}" — then resolve who actually benefits. Rivalry beats raw news for retention.`;
  } else if (rel.includes('verif')) {
    icon = '🔍';
    headline = `Claim under review: ${nameA} → ${nameB}`;
    analysis = `One of these signals exists to check the other. The connected claim has not cleared verification — covering it as settled fact would be a credibility hit.`;
    creatorMove = `Turn the verification itself into a segment: walk the audience through what is and isn't proven on screen. Skepticism is content.`;
  } else if (rel.includes('risk')) {
    icon = '⚠️';
    headline = `Risk thread: ${nameA} ⇢ ${nameB}`;
    analysis = `This connection carries the risk story: what happens in "${a.title}" raises the stakes for "${b.title}". Highest risk on the pair: ${Math.max(a.risk_score, b.risk_score)}/10.`;
    creatorMove = `Pair the capability story with its risk counterweight in the same segment — it reads as balanced, not alarmist.`;
  } else if (rel.includes('support')) {
    icon = '🤝';
    headline = `${nameB} powers ${nameA}`;
    analysis = `One signal feeds the other: ${firstSentence(b.summary)} That foundation is what makes "${a.title}" possible.`;
    creatorMove = `Tell it as a cause-and-effect chain — audiences remember "X enabled Y" far better than two separate headlines.`;
  } else if (rel.includes('trend')) {
    icon = '📈';
    headline = `Same wave: ${nameA} + ${nameB}`;
    analysis = `Two independent signals pointing the same direction is the start of a trend line, not a coincidence. Combined interest: ${combinedInterest}/10.`;
    creatorMove = `Zoom out: name the trend, use both stories as evidence, and predict the third data point. Trend-naming videos age well.`;
  } else if (rel.includes('infrastructure')) {
    icon = '🏗️';
    headline = `${nameB} is the layer under ${nameA}`;
    analysis = `This is a stack story: the headline runs on top, the infrastructure runs underneath. ${firstSentence(b.summary)}`;
    creatorMove = `Use the "iceberg" framing — the flashy story above the waterline, the infrastructure below. Great thumbnail energy.`;
  }

  const riskyOne = [a, b].find(isRisky) ?? null;
  const caution = riskyOne
    ? `"${riskyOne.title}" is ${riskyOne.confidence} confidence / risk ${riskyOne.risk_score}/10 — verify before building the video on this thread.`
    : null;

  return { icon, headline, analysis, creatorMove, caution };
}
