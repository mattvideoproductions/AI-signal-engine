import { hasEventWithSourceUrl, insertEvent } from './events';
import { listSources } from './settings';
import { broadcast, log } from './sse';
import type { Category, EventPayload } from './types';

/**
 * Minimal real-source scanner: fetches RSS/Atom feeds (or falls back to the
 * page <title>) and creates low-confidence DRAFT events for Hermes to enrich
 * later. Polite by design: one fetch per source, max 5 items, 10s timeout.
 */

interface FeedItem {
  title: string;
  url: string;
  date: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function pickAtomLink(block: string): string {
  const m =
    block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ??
    block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : '';
}

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of rssItems) {
    items.push({
      title: pickTag(block, 'title'),
      url: pickTag(block, 'link') || pickAtomLink(block),
      date: pickTag(block, 'pubDate') || pickTag(block, 'dc:date'),
      snippet: pickTag(block, 'description').slice(0, 500),
    });
  }
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    for (const block of atomEntries) {
      items.push({
        title: pickTag(block, 'title'),
        url: pickAtomLink(block),
        date: pickTag(block, 'updated') || pickTag(block, 'published'),
        snippet: (pickTag(block, 'summary') || pickTag(block, 'content')).slice(0, 500),
      });
    }
  }
  return items.filter((i) => i.title && i.url).slice(0, 5);
}

function guessCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/\b(open[- ]?source|weights|apache|mit license)\b/.test(t)) return 'open_source';
  if (/\b(agent|agentic|autonomous)\b/.test(t)) return 'agent_update';
  if (/\b(model|llm|frontier|foundation)\b/.test(t)) return 'model_release';
  if (/\b(safety|alignment|guardrail|red[- ]team)\b/.test(t)) return 'safety';
  if (/\b(price|pricing|cost|billing|free tier)\b/.test(t)) return 'pricing';
  if (/\b(gpu|datacenter|data center|cloud|inference|cluster)\b/.test(t)) return 'infrastructure';
  if (/\b(paper|research|benchmark|study)\b/.test(t)) return 'research';
  if (/\b(launch|release|ship|introduc)\b/.test(t)) return 'product_launch';
  return 'other';
}

async function fetchWithTimeout(url: string, ms = 10_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Signal-Engine/1.0 (private research dashboard; RSS reader)',
        Accept: 'application/rss+xml, application/atom+xml, text/html;q=0.9, */*;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function scanSources(): Promise<{ created: number; errors: string[] }> {
  const sources = listSources();
  const errors: string[] = [];
  let created = 0;

  if (sources.length === 0) {
    return { created: 0, errors: ['No sources configured. Add feeds in /settings first.'] };
  }

  log(`Source scan started — ${sources.length} source(s).`);

  for (const source of sources) {
    try {
      const body = await fetchWithTimeout(source.url);
      let items = parseFeed(body);

      if (items.length === 0) {
        // Not a feed — fall back to the page itself as a single draft item.
        const title = pickTag(body, 'title');
        const descMatch = body.match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
        );
        if (title) {
          items = [
            {
              title,
              url: source.url,
              date: '',
              snippet: descMatch ? decodeEntities(descMatch[1]) : '',
            },
          ];
        }
      }

      for (const item of items) {
        if (hasEventWithSourceUrl(item.url)) continue;
        const payload: EventPayload = {
          title: item.title.slice(0, 280),
          summary: item.snippet || 'Draft event from source scan — awaiting Hermes enrichment.',
          source_url: item.url,
          source_name: source.name,
          category: guessCategory(`${item.title} ${item.snippet}`),
          confidence: 'low',
          novelty_score: 5,
          viewer_interest_score: 5,
          risk_score: 5,
          verification_needed: ['Draft from raw feed — Hermes has not analyzed this yet'],
          claims_to_verify: [],
          do_not_overstate: [],
          related_entities: [],
          connections: [],
          thumbnail_angle: '',
          title_angle: '',
          notes: item.date ? `Published: ${item.date}` : '',
          bucket: '',
        };
        const stored = insertEvent(payload, 'draft');
        broadcast({ type: 'event', data: stored });
        created++;
      }
      log(`Scanned ${source.name}: ${items.length} item(s) found.`, 'success');
    } catch (err) {
      const msg = `Failed to scan ${source.name}: ${err instanceof Error ? err.message : 'error'}`;
      errors.push(msg);
      log(msg, 'warn');
    }
  }

  log(`Source scan finished — ${created} new draft event(s).`, created > 0 ? 'success' : 'info');
  return { created, errors };
}
