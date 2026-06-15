import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, type AppConfig, type CreatorBrief, type SignalEvent, type SignalSource, type StoryBundle } from './types';

interface DataFile {
  version: 1;
  events: SignalEvent[];
  bundles: StoryBundle[];
  briefs: CreatorBrief[];
  sources: SignalSource[];
  config: AppConfig;
}

const EMPTY_DATA: DataFile = {
  version: 1,
  events: [],
  bundles: [],
  briefs: [],
  sources: [],
  config: DEFAULT_CONFIG,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveDataPath(): string {
  const configured = process.env.DATA_FILE || process.env.DATABASE_URL;
  if (!configured) return path.join(process.cwd(), 'data', 'signal.json');
  const raw = configured.replace(/^file:/, '');
  const jsonPath = raw.endsWith('.db') ? raw.replace(/\.db$/, '.json') : raw;
  return path.isAbsolute(jsonPath)
    ? jsonPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), jsonPath);
}

function normalizeData(raw: Partial<DataFile>): DataFile {
  return {
    version: 1,
    events: Array.isArray(raw.events) ? raw.events : [],
    bundles: Array.isArray(raw.bundles) ? raw.bundles : [],
    briefs: Array.isArray(raw.briefs) ? raw.briefs : [],
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    config: { ...DEFAULT_CONFIG, ...(raw.config ?? {}) },
  };
}

class JsonStore {
  private readonly filePath = resolveDataPath();
  private data: DataFile | null = null;

  private read(): DataFile {
    if (this.data) return this.data;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.data = clone(EMPTY_DATA);
      this.write(this.data);
      return this.data;
    }
    try {
      this.data = normalizeData(JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<DataFile>);
    } catch {
      this.data = clone(EMPTY_DATA);
      this.write(this.data);
    }
    return this.data;
  }

  private write(data: DataFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  update(mutator: (data: DataFile) => void): void {
    const data = this.read();
    mutator(data);
    this.write(data);
  }

  snapshot(): DataFile {
    return clone(this.read());
  }
}

const g = globalThis as unknown as { __aseJsonStore?: JsonStore };

export function store(): JsonStore {
  return (g.__aseJsonStore ??= new JsonStore());
}
