'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('Invalid password.');
      }
    } catch {
      setError('Connection error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="glass-strong w-full max-w-md p-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-cyan shadow-[0_0_12px_2px_rgba(34,211,238,0.6)]" />
          <h1 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-violet-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            AI Signal Engine
          </h1>
        </div>
        <p className="mb-8 text-sm text-slate-400">
          Private agent-powered signal intelligence map
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-400">
              Access Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="••••••••••••"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Verifying…' : 'Enter the Observatory'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Private instance · all access logged locally
        </p>
      </div>
    </main>
  );
}
