#!/usr/bin/env node
/**
 * Hermes Agent — the research/reasoning layer for AI Signal Engine.
 *
 * Pipeline:  fetch real AI-news RSS  ->  a Nous Hermes / your LLM structures,
 * scores, and connects the stories into the dashboard schema  ->  POST each
 * one to /api/events so it animates onto the map.
 *
 * Zero npm dependencies — uses Node 18+ built-in fetch. Run from anywhere:
 *   node agent.mjs            # one scan
 *   node agent.mjs --watch 30 # scan now, then every 30 minutes (always-on)
 *   node agent.mjs --dry-run  # analyze + print, do NOT post
 *   node agent.mjs --mock     # skip the LLM, post raw feed items as drafts
 *   node agent.mjs --fresh    # ignore the seen-cache, re-consider everything
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEN_FILE = path.join(HERE, '.seen.json');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile(file, overwrite) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '');
    if (overwrite || !(key in process.env)) process.env[key] = val;
  }
}
// Precedence: real shell env > hermes-agent/.env > dashboard ../.env
loadEnvFile(path.join(HERE, '.env'), false);
loadEnvFile(path.join(HERE, '..', '.env'), false);

const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const MAX_ITEMS = Number(process.env.HERMES_MAX_ITEMS || 8);

const PROVIDERS = {
  anthropic: { key: 'ANTHROPIC_API_KEY', model: 'claude-haiku-4-5-20251001' },
  openai: { key: 'OPENAI_API_KEY', model: 'gpt-4o-mini' },
  gemini: { key: 'GEMINI_API_KEY', model: 'gemini-2.0-flash' },
  openrouter: { key: 'OPENROUTER_API_KEY', model: 'nousresearch/hermes-3-llama-3.1-70b' },
};

function pickProvider() {
  const forced = process.env.HERMES_PROVIDER;
  if (forced) {
    if (!PROVIDERS[forced]) throw new Error(`Unknown HERMES_PROVIDER "${forced}"`);
    return forced;
  }
  for (const name of Object.keys(PROVIDERS)) {
    if (process.env[PROVIDERS[name].key]) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pretty logging (great on camera)
// ---------------------------------------------------------------------------

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  violet: (s) => `\x1b[35m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const ts = () => new Date().toLocaleTimeString([], { hour12: false });
const log = (msg) => console.log(`${C.dim(ts())}  ${msg}`);

// ---------------------------------------------------------------------------
// RSS / Atom fetching + parsing (compact, dependency-free)
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}
function pickAtomLink(block) {
  const m =
    block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
    block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : '';
}
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    items.push({
      title: pickTag(b, 'title'),
      url: pickTag(b, 'link') || pickAtomLink(b),
      date: pickTag(b, 'pubDate') || pickTag(b, 'dc:date'),
      snippet: pickTag(b, 'description').slice(0, 600),
    });
  }
  if (items.length === 0) {
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const b of entries) {
      items.push({
        title: pickTag(b, 'title'),
        url: pickAtomLink(b),
        date: pickTag(b, 'updated') || pickTag(b, 'published'),
        snippet: (pickTag(b, 'summary') || pickTag(b, 'content')).slice(0, 600),
      });
    }
  }
  return items.filter((i) => i.title && i.url);
}

async function fetchText(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'AI-Signal-Engine-Hermes/1.0 (+research dashboard)',
        Accept: 'application/rss+xml, application/atom+xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function gatherItems(feeds) {
  const all = [];
  for (const feed of feeds) {
    try {
      const xml = await fetchText(feed.url);
      const items = parseFeed(xml).slice(0, 6).map((i) => ({ ...i, source_name: feed.name }));
      log(`${C.green('✓')} ${feed.name}: ${items.length} item(s)`);
      all.push(...items);
    } catch (err) {
      log(`${C.amber('•')} ${feed.name}: skipped (${err.message})`);
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Seen-cache so reruns don't repost the same stories
// ---------------------------------------------------------------------------

function loadSeen() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}
function saveSeen(seen) {
  const arr = [...seen].slice(-500);
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(arr));
  } catch {
    /* non-fatal */
  }
}

// ---------------------------------------------------------------------------
// The Hermes prompt — turn raw items into scored, connected events
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Hermes, the research engine behind a private creator-intelligence dashboard for a tech-news YouTuber.

You will be given raw headlines/snippets scraped from AI-news RSS feeds. Select the genuinely significant ones for a creator tracking the AI race and convert each into a structured signal. Ignore filler, listicles, ads, and anything not about AI models/agents/tools/safety/infrastructure/pricing/open-source/research.

Output ONLY a JSON array (no prose, no markdown fences). Each element:
{
  "title": "tight headline, <= 140 chars",
  "summary": "2-3 factual sentences, no hype",
  "source_url": "the item's URL (copy exactly from input)",
  "source_name": "the item's source name (copy from input)",
  "category": "model_release | agent_update | product_launch | pricing | research | safety | open_source | infrastructure | rumor | other",
  "bucket": "intelligence | agents | open | compute | trust | frontier",
  "confidence": "low | medium | high",
  "novelty_score": 1-10,
  "viewer_interest_score": 1-10,
  "risk_score": 1-10,
  "verification_needed": ["what a human must check"],
  "claims_to_verify": ["specific unproven claims"],
  "do_not_overstate": ["framings to avoid"],
  "related_entities": ["companies/models/tools"],
  "connections": [{ "target_title_or_id": "exact title of ANOTHER item in this same batch", "relationship": "related to | competes with | supports | same trend | requires verification | infrastructure layer | risk connection", "strength": 1-10, "reason": "one sentence explaining why these two are linked" }],
  "thumbnail_angle": "one visual idea",
  "title_angle": "one honest, clickable video title",
  "notes": ""
}

Rules:
- Be honest with confidence. Single-source/vendor-claimed = medium at most. Speculation = low + category "rumor".
- Put benchmark/performance claims in claims_to_verify.
- Connect related items to each other using their EXACT titles from this batch.
- Return between 1 and ${MAX_ITEMS} items. If nothing qualifies, return [].`;

function buildUserMessage(items) {
  const lines = items.map(
    (it, i) =>
      `[$${i + 1}] source_name: ${it.source_name}\nurl: ${it.url}\ntitle: ${it.title}\nsnippet: ${it.snippet || '(none)'}`,
  );
  return `Here are ${items.length} raw items. Analyze and return the JSON array of signals.\n\n${lines.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Model adapters — return the model's raw text
// ---------------------------------------------------------------------------

async function callModel(provider, model, system, user) {
  const key = process.env[PROVIDERS[provider].key];

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content.map((c) => c.text || '').join('');
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  // openai + openrouter share the OpenAI chat-completions shape
  const base = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractJsonArray(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const v = JSON.parse(trimmed);
    return Array.isArray(v) ? v : [];
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Heuristic fallback (--mock): structure items WITHOUT an LLM
// ---------------------------------------------------------------------------

function guessCategory(text) {
  const t = text.toLowerCase();
  if (/\b(open[- ]?source|weights|apache|mit license)\b/.test(t)) return 'open_source';
  if (/\b(agent|agentic|autonomous)\b/.test(t)) return 'agent_update';
  if (/\b(model|llm|frontier|foundation)\b/.test(t)) return 'model_release';
  if (/\b(safety|alignment|guardrail|red[- ]team)\b/.test(t)) return 'safety';
  if (/\b(price|pricing|cost|billing|free tier)\b/.test(t)) return 'pricing';
  if (/\b(gpu|datacenter|data center|cloud|inference|cluster)\b/.test(t)) return 'infrastructure';
  if (/\b(paper|research|benchmark|study|arxiv)\b/.test(t)) return 'research';
  if (/\b(launch|release|ship|introduc)\b/.test(t)) return 'product_launch';
  return 'other';
}
function mockStructure(items) {
  return items.map((it) => ({
    title: it.title.slice(0, 140),
    summary: it.snippet || 'Draft from raw feed — awaiting enrichment.',
    source_url: it.url,
    source_name: it.source_name,
    category: guessCategory(`${it.title} ${it.snippet}`),
    confidence: 'low',
    novelty_score: 5,
    viewer_interest_score: 5,
    risk_score: 5,
    verification_needed: ['Raw feed draft — not yet analyzed by a model'],
    claims_to_verify: [],
    do_not_overstate: [],
    related_entities: [],
    connections: [],
    thumbnail_angle: '',
    title_angle: '',
    notes: it.date ? `Published: ${it.date}` : '',
  }));
}

// ---------------------------------------------------------------------------
// Post to the dashboard
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postEvent(ev) {
  const res = await fetch(`${DASHBOARD_URL}/api/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${INGEST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(ev),
  });
  return res;
}

// ---------------------------------------------------------------------------
// One scan
// ---------------------------------------------------------------------------

async function runScan(opts) {
  const { feeds } = opts;
  console.log('');
  log(C.bold(C.cyan('━━━ Hermes scan starting ━━━')));

  const seen = opts.fresh ? new Set() : loadSeen();
  const raw = await gatherItems(feeds);
  const fresh = raw.filter((i) => !seen.has(i.url)).slice(0, MAX_ITEMS);

  if (fresh.length === 0) {
    log(C.dim('No new items since last scan. (Use --fresh to re-consider everything.)'));
    return 0;
  }
  log(`Found ${C.bold(fresh.length)} fresh item(s) to analyze.`);

  let events;
  if (opts.mock) {
    log(C.violet('Mock mode: structuring without an LLM…'));
    events = mockStructure(fresh);
  } else {
    log(`${C.violet('🧠 ' + opts.provider + ' (' + opts.model + ')')} analyzing the batch…`);
    const text = await callModel(opts.provider, opts.model, SYSTEM_PROMPT, buildUserMessage(fresh));
    events = extractJsonArray(text);
    if (events.length === 0) {
      log(C.amber('Model returned no usable signals this round.'));
      return 0;
    }
    log(`Hermes shaped ${C.bold(events.length)} signal(s).`);
  }

  let posted = 0;
  for (const ev of events) {
    if (!ev || !ev.title) continue;
    if (opts.dryRun) {
      console.log(C.dim('   would post: ') + ev.title + C.dim(`  [${ev.category || '?'} / ${ev.confidence || '?'}]`));
      continue;
    }
    try {
      const res = await postEvent(ev);
      if (res.status === 201) {
        posted++;
        log(`${C.green('📤 posted')} ${ev.title} ${C.dim(`[${ev.category}/${ev.confidence}]`)}`);
      } else if (res.status === 202) {
        log(`${C.amber('🚫 ignored topic')} ${ev.title}`);
      } else {
        log(`${C.red('✗ ' + res.status)} ${ev.title} ${C.dim((await res.text()).slice(0, 120))}`);
      }
    } catch (err) {
      log(`${C.red('✗ network')} ${ev.title} ${C.dim(err.message)}`);
    }
    await sleep(1600); // space them out so they animate onto the map
  }

  for (const i of fresh) seen.add(i.url);
  if (!opts.dryRun) saveSeen(seen);
  log(C.bold(C.green(`━━━ Scan complete — ${posted} signal(s) on the board ━━━`)));
  return posted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { dryRun: false, mock: false, fresh: false, watch: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') a.dryRun = true;
    else if (argv[i] === '--mock') a.mock = true;
    else if (argv[i] === '--fresh') a.fresh = true;
    else if (argv[i] === '--watch') a.watch = Number(argv[i + 1] || 30) || 30;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!INGEST_TOKEN) {
    console.error(C.red('No INGEST_TOKEN set. Copy hermes-agent/.env.example to .env and fill it in.'));
    process.exit(1);
  }

  let provider = null;
  let model = '';
  if (!args.mock) {
    provider = pickProvider();
    if (!provider) {
      console.error(
        C.red('No model API key found.') +
          ' Set one of ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY in hermes-agent/.env,\n' +
          'or run with --mock to test the pipeline without a model.',
      );
      process.exit(1);
    }
    model = process.env.HERMES_MODEL || PROVIDERS[provider].model;
  }

  const feedsCfg = JSON.parse(fs.readFileSync(path.join(HERE, 'feeds.json'), 'utf8'));
  const feeds = feedsCfg.feeds || [];

  log(`Dashboard: ${C.cyan(DASHBOARD_URL)}`);
  log(`Brain:     ${args.mock ? C.violet('mock (no LLM)') : C.violet(provider + ' / ' + model)}`);
  log(`Sources:   ${feeds.length} feed(s)`);
  if (args.dryRun) log(C.amber('DRY RUN — nothing will be posted.'));

  const opts = { feeds, provider, model, ...args };

  await runScan(opts);

  if (args.watch > 0) {
    log(C.dim(`Watch mode: next scan in ${args.watch} min. Ctrl+C to stop.`));
    setInterval(() => {
      runScan(opts).catch((e) => log(C.red('Scan error: ' + e.message)));
    }, args.watch * 60_000);
  }
}

main().catch((err) => {
  console.error(C.red('Fatal: ' + err.message));
  process.exit(1);
});
