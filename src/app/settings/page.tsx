'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hermesTaskPrompt, type AgentPromptMode } from '@/lib/hermes';
import { CATEGORIES, CATEGORY_KEYS, type AppConfig, type SignalSource } from '@/lib/types';

interface EnvStatus {
  appPasswordSet: boolean;
  ingestTokenSet: boolean;
  demoMode: boolean;
  llmKeySet: boolean;
}

const INGEST_TOKEN_STORAGE_KEY = 'ai-signal-engine.ingest-token';
const PROMPT_MODE_STORAGE_KEY = 'ai-signal-engine.prompt-mode';

/**
 * Copy text to the clipboard, working in BOTH secure (https/localhost) and
 * plain-http contexts. `navigator.clipboard` is undefined over http://VPS_IP,
 * which is exactly how this app is accessed on a VPS, so we fall back to a
 * hidden <textarea> + execCommand('copy'). Returns true on success.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Selects the visible prompt text so the user can press Ctrl+C / Cmd+C manually. */
function selectPromptText(): void {
  const el = document.getElementById('hermes-prompt');
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass p-5">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [sources, setSources] = useState<SignalSource[]>([]);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [scanMsg, setScanMsg] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [tokenMsg, setTokenMsg] = useState('');
  const [origin, setOrigin] = useState('https://YOUR_DOMAIN');
  const [ingestToken, setIngestToken] = useState('');
  const [promptMode, setPromptMode] = useState<AgentPromptMode>('hermes');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setIngestToken(window.localStorage.getItem(INGEST_TOKEN_STORAGE_KEY) ?? '');
    const savedMode = window.localStorage.getItem(PROMPT_MODE_STORAGE_KEY);
    if (savedMode === 'hermes' || savedMode === 'general') setPromptMode(savedMode);
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEnv(d.env);
          setConfig(d.config);
        }
      })
      .catch(() => undefined);
    fetch('/api/sources')
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((d: { sources: SignalSource[] }) => setSources(d.sources))
      .catch(() => undefined);
  }, []);

  function updateIngestToken(value: string) {
    setIngestToken(value);
    setTokenMsg('');
    if (value.trim()) {
      window.localStorage.setItem(INGEST_TOKEN_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(INGEST_TOKEN_STORAGE_KEY);
    }
  }

  function updatePromptMode(mode: AgentPromptMode) {
    setPromptMode(mode);
    window.localStorage.setItem(PROMPT_MODE_STORAGE_KEY, mode);
  }

  async function saveConfig(patch: Partial<AppConfig>) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const d = (await res.json()) as { config: AppConfig };
      setConfig(d.config);
      setSaveMsg('Saved ✓');
      window.setTimeout(() => setSaveMsg(''), 2000);
    }
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl) return;
    setBusy(true);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, url: newUrl }),
      });
      if (res.ok) {
        const d = (await res.json()) as { source: SignalSource };
        setSources((prev) => [...prev, d.source]);
        setNewName('');
        setNewUrl('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteSource(id: string) {
    await fetch(`/api/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function scanNow() {
    setBusy(true);
    setScanMsg('Scanning sources…');
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const d = (await res.json()) as { created: number; errors: string[] };
      setScanMsg(
        `Created ${d.created} draft event(s).${d.errors.length > 0 ? ` Errors: ${d.errors.join(' · ')}` : ''}`,
      );
    } catch {
      setScanMsg('Scan failed.');
    } finally {
      setBusy(false);
    }
  }

  const prompt = hermesTaskPrompt(origin, {
    watchTopics: config?.watchTopics,
    ignoredTopics: config?.ignoredTopics,
  }, ingestToken, promptMode);

  async function copyPrompt() {
    const token = ingestToken.trim();
    if (!token) {
      setTokenMsg('Paste the INGEST_TOKEN from .env first. This is not the dashboard login password.');
      return;
    }

    const res = await fetch('/api/ingest/check', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    if (!res.ok) {
      setTokenMsg(
        res.status === 401
          ? 'That token was rejected. Use INGEST_TOKEN from .env, not APP_PASSWORD / dashboard password.'
          : `Dashboard token check failed with HTTP ${res.status}. Make sure the server is healthy, then try again.`,
      );
      return;
    }

    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopied(true);
      setTokenMsg('Token verified. Prompt copied for Hermes.');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setTokenMsg(
        'Token verified, but the browser blocked clipboard access (this happens over plain http://). ' +
          'The prompt is selected below — press Ctrl+C (or Cmd+C) to copy it.',
      );
      selectPromptText();
    }
  }

  const inputCls =
    'rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-400/50';

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="glass flex items-center gap-3 px-5 py-4">
        <div>
          <h1 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-violet-300 bg-clip-text text-xl font-bold text-transparent">
            Settings
          </h1>
          <p className="text-xs text-slate-500">Private configuration · secrets never leave the server</p>
        </div>
        <Link href="/" className="ml-auto rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          ← Dashboard
        </Link>
      </header>

      {/* --- access & tokens --- */}
      <Section title="Access & Ingest Tokens">
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-44 text-slate-400">Dashboard password</span>
            {env && <StatusPill ok={env.appPasswordSet} okLabel="APP_PASSWORD set" badLabel="NOT SET — app is open!" />}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-44 text-slate-400">Ingest token (Hermes)</span>
            {env && <StatusPill ok={env.ingestTokenSet} okLabel="INGEST_TOKEN set" badLabel="NOT SET — ingest disabled" />}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-44 text-slate-400">Demo mode</span>
            {env && <StatusPill ok={env.demoMode} okLabel="Enabled" badLabel="Disabled" />}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-44 text-slate-400">LLM key (optional)</span>
            {env && <StatusPill ok={env.llmKeySet} okLabel="Configured" badLabel="Not configured (deterministic briefs)" />}
          </div>
          <p className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-xs leading-relaxed text-slate-400">
            Secrets are read from environment variables on the server and are never sent to the browser —
            this page only shows whether they exist. To rotate a secret, edit <code className="text-cyan-300">.env</code>{' '}
            on the VPS and restart the container.
          </p>
        </div>
      </Section>

      {/* --- webhook docs --- */}
      <Section title="Hermes Webhook — Ingest Endpoint">
        <div className="space-y-3 text-sm text-slate-300">
          <p className="text-xs text-slate-400">Hermes (or any tool) posts one JSON event per signal to:</p>
          <pre className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-950/70 p-3 font-mono text-[11px] leading-relaxed text-cyan-200">
{`POST ${origin}/api/events
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json`}
          </pre>
          <p className="text-xs text-slate-400">Example with curl:</p>
          <pre className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
{`curl -X POST ${origin}/api/events \\
  -H "Authorization: Bearer $INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Example Lab ships new model",
    "summary": "Example Lab released a new frontier model today.",
    "source_url": "https://example.com/blog/new-model",
    "source_name": "Example Lab Blog",
    "category": "model_release",
    "confidence": "high",
    "novelty_score": 8,
    "viewer_interest_score": 7,
    "risk_score": 2,
    "verification_needed": [],
    "claims_to_verify": ["benchmark numbers are vendor-reported"],
    "do_not_overstate": [],
    "related_entities": ["Example Lab"],
    "connections": [],
    "thumbnail_angle": "",
    "title_angle": "",
    "notes": ""
  }'`}
          </pre>
          <p className="text-xs text-slate-500">
            Other endpoints: <code>GET /api/events</code>, <code>DELETE /api/events</code>,{' '}
            <code>POST /api/bundle</code>, <code>POST /api/brief</code>, <code>GET /api/stream</code> (SSE).
          </p>
        </div>
      </Section>

      {/* --- hermes prompt --- */}
      <Section title="Agent Task Prompt (copy into your agent)">
        <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-slate-700/50 bg-slate-950/40 p-1">
          {(['hermes', 'general'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updatePromptMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                promptMode === mode
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              {mode === 'hermes' ? 'Hermes' : 'General agent'}
            </button>
          ))}
        </div>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Dashboard ingest token for this agent</span>
          <input
            type="password"
            value={ingestToken}
            onChange={(e) => updateIngestToken(e.target.value)}
            placeholder="Paste the INGEST_TOKEN from your dashboard .env"
            autoComplete="off"
            spellCheck={false}
            className={`${inputCls} w-full font-mono`}
          />
        </label>
        <button
          onClick={copyPrompt}
          className="mb-3 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110"
        >
          {copied ? '✓ Copied!' : '⧉ Copy prompt'}
        </button>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          This token is the static <code className="text-cyan-300">INGEST_TOKEN</code> from the dashboard&apos;s{' '}
          <code className="text-cyan-300">.env</code>, not a Hermes setting. It is remembered only in this browser
          and inserted into the copied prompt.
        </p>
        <p className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-xs leading-relaxed text-cyan-100/80">
          For live web research, use a local browser first. In Hermes, set Agent Browser Engine to <code>auto</code>{' '}
          or <code>chrome</code>. In other agents, use their browser, Playwright, or computer-control tool. Browser
          Use, Browserbase, Brave, and Exa keys are optional; RSS is only the fallback when local browser search is
          unavailable. For Hermes CLI, start <code>launch-browser.bat</code> or <code>./launch-browser.sh</code>.
          On a fresh Linux VPS, run <code>./install-browser-linux.sh</code> first if Chromium is missing. Then run{' '}
          <code>/browser connect</code>.
        </p>
        {tokenMsg && (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
            tokenMsg.startsWith('Token verified')
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
              : 'border-amber-500/30 bg-amber-950/20 text-amber-200'
          }`}>
            {tokenMsg}
          </p>
        )}
        <pre id="hermes-prompt" className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700/50 bg-slate-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
          {prompt}
        </pre>
      </Section>

      {/* --- sources --- */}
      <Section title="Real Sources (RSS feeds / pages)">
        <form onSubmit={addSource} className="mb-4 flex flex-wrap gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (optional)" className={`${inputCls} w-44`} />
          <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/feed.xml" className={`${inputCls} min-w-64 flex-1`} />
          <button type="submit" disabled={busy || !newUrl} className="rounded-lg bg-cyan-500/90 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-40">
            + Add
          </button>
          <button type="button" onClick={scanNow} disabled={busy || sources.length === 0} className="rounded-lg border border-slate-600/60 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700/60 disabled:opacity-40">
            ⟳ Scan sources now
          </button>
        </form>
        {scanMsg && <p className="mb-3 text-xs text-amber-300">{scanMsg}</p>}
        <ul className="space-y-2">
          {sources.length === 0 && (
            <li className="text-xs text-slate-600">
              No sources yet. Prefer RSS feeds, official blogs, changelogs, and GitHub release feeds
              (e.g. <code>https://github.com/OWNER/REPO/releases.atom</code>). Scans create low-confidence{' '}
              <em>draft</em> events for Hermes to enrich later.
            </li>
          )}
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
              <span className="text-sm font-medium text-slate-200">{s.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{s.url}</span>
              <button onClick={() => deleteSource(s.id)} className="rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40">
                remove
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* --- categories & thresholds --- */}
      {config && (
        <Section title="Categories, Thresholds & Verification Rules">
          <div className="space-y-5 text-sm text-slate-300">
            <div>
              <p className="mb-2 text-xs text-slate-400">
                Event categories (fixed schema — these match the Hermes payload contract):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_KEYS.map((c) => (
                  <span key={c} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: CATEGORIES[c].color, background: `${CATEGORIES[c].color}14`, border: `1px solid ${CATEGORIES[c].color}35` }}>
                    {CATEGORIES[c].label} <code className="opacity-60">{c}</code>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Min confidence for briefs
                <select
                  value={config.minConfidenceForBrief}
                  onChange={(e) => saveConfig({ minConfidenceForBrief: e.target.value as AppConfig['minConfidenceForBrief'] })}
                  className={inputCls}
                >
                  <option value="low">low (include everything)</option>
                  <option value="medium">medium</option>
                  <option value="high">high only</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Max risk for title ideas
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={config.maxRiskForTitleIdeas}
                  onChange={(e) => saveConfig({ maxRiskForTitleIdeas: Number(e.target.value) })}
                  className={`${inputCls} w-20`}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={config.showEntities}
                  onChange={(e) => saveConfig({ showEntities: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
                Show entity nodes on map by default
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-slate-400">Watch topics (one per line — included in the Hermes prompt context):</p>
              <textarea
                defaultValue={config.watchTopics.join('\n')}
                onBlur={(e) => saveConfig({ watchTopics: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                rows={4}
                className={`${inputCls} w-full font-mono text-xs`}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs text-slate-400">
                Ignored topics — killed from the board via 🚫 on the map. Hermes is told to skip these
                and the ingest endpoint rejects matching signals:
              </p>
              {config.ignoredTopics.length === 0 ? (
                <p className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-600">
                  Nothing ignored yet. Use &ldquo;🚫 Ignore topic&rdquo; in a node&apos;s inspector to add one.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {config.ignoredTopics.map((topic) => (
                    <li key={topic} className="flex items-center gap-2 rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-1.5">
                      <span className="text-rose-300">🚫</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{topic}</span>
                      <button
                        onClick={() => saveConfig({ ignoredTopics: config.ignoredTopics.filter((t) => t !== topic) })}
                        className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      >
                        un-ignore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs text-slate-400">Verification rules (your editorial standards):</p>
              <textarea
                defaultValue={config.verificationRules}
                onBlur={(e) => saveConfig({ verificationRules: e.target.value })}
                rows={5}
                className={`${inputCls} w-full font-mono text-xs`}
              />
            </div>
            {saveMsg && <p className="text-xs text-emerald-400">{saveMsg}</p>}
          </div>
        </Section>
      )}
    </main>
  );
}
