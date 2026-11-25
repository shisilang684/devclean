import path from "node:path";
import { ADAPTERS, detectEnv, type Adapter, type CacheCandidate, type Env, type Risk } from "./adapters.js";
import { dirSize, isDirectory } from "./util/fs.js";

export interface ScanItem {
  id: string;
  name: string;
  path: string;
  risk: Risk;
  note: string;
  bytes: number;
  files: number;
  errors: number;
}

export interface ScanOptions {
  env?: Env;
  only?: string[];
  onScanStart?: (candidate: CacheCandidate) => void;
  onScanDone?: (item: ScanItem) => void;
}

/** Resolve adapters to cache paths that actually exist on this machine. */
export async function discover(options: { env?: Env; only?: string[] } = {}): Promise<CacheCandidate[]> {
  const env = options.env ?? detectEnv();
  const only = options.only && options.only.length > 0 ? new Set(options.only) : null;
  const seen = new Set<string>();
  const candidates: CacheCandidate[] = [];

  const adapters: Adapter[] = ADAPTERS.filter((adapter) => !only || only.has(adapter.id));
  for (const adapter of adapters) {
    for (const raw of adapter.paths(env)) {
      const resolved = path.resolve(raw);
      const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!(await isDirectory(resolved))) continue;
      candidates.push({
        id: adapter.id,
        name: adapter.name,
        path: resolved,
        risk: adapter.risk,
        note: adapter.note,
      });
    }
  }
  return candidates;
}

export async function scanCandidates(candidates: CacheCandidate[], options: ScanOptions = {}): Promise<ScanItem[]> {
  const items: ScanItem[] = [];
  for (const candidate of candidates) {
    options.onScanStart?.(candidate);
    const size = await dirSize(candidate.path);
    const item: ScanItem = { ...candidate, ...size };
    items.push(item);
    options.onScanDone?.(item);
  }
  items.sort((a, b) => b.bytes - a.bytes);
  return items;
}

export async function scanAll(options: ScanOptions = {}): Promise<{ items: ScanItem[]; candidates: CacheCandidate[] }> {
  const candidates = await discover({ env: options.env, only: options.only });
  const items = await scanCandidates(candidates, options);
  return { items, candidates };
}

export function totalOf(items: Array<{ bytes: number; files: number }>): { bytes: number; files: number } {
  return items.reduce(
    (acc, item) => ({ bytes: acc.bytes + item.bytes, files: acc.files + item.files }),
    { bytes: 0, files: 0 },
  );
}
