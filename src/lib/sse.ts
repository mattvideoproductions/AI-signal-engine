import type { AgentStatus, LogEntry, StreamMessage } from './types';

type Send = (chunk: string) => void;

const g = globalThis as unknown as {
  __aseClients?: Map<number, Send>;
  __aseClientSeq?: number;
  __aseStatus?: AgentStatus;
  __aseLogs?: LogEntry[];
};

g.__aseClients ??= new Map();
g.__aseClientSeq ??= 0;
g.__aseStatus ??= 'idle';
g.__aseLogs ??= [];

export function addClient(send: Send): number {
  const id = ++g.__aseClientSeq!;
  g.__aseClients!.set(id, send);
  return id;
}

export function removeClient(id: number): void {
  g.__aseClients!.delete(id);
}

export function clientCount(): number {
  return g.__aseClients!.size;
}

export function broadcast(message: StreamMessage): void {
  const chunk = `data: ${JSON.stringify(message)}\n\n`;
  for (const [id, send] of g.__aseClients!) {
    try {
      send(chunk);
    } catch {
      g.__aseClients!.delete(id);
    }
  }
}

export function getStatus(): AgentStatus {
  return g.__aseStatus!;
}

export function setStatus(status: AgentStatus): void {
  g.__aseStatus = status;
  broadcast({ type: 'status', data: status });
}

export function getLogs(): LogEntry[] {
  return g.__aseLogs!;
}

export function log(msg: string, level: LogEntry['level'] = 'info'): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg };
  g.__aseLogs!.push(entry);
  if (g.__aseLogs!.length > 200) g.__aseLogs!.splice(0, g.__aseLogs!.length - 200);
  broadcast({ type: 'log', data: entry });
}
