import path from "node:path";
import { PROJECT_ARTIFACTS, removePath } from "./util/fs.js";
import type { ScanItem } from "./scan.js";

export interface CleanOutcome {
  item: ScanItem | { path: string; name: string; bytes: number };
  ok: boolean;
  error?: string;
}

function normalize(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Refuse to delete anything that is not a known cache or project artifact. */
export function isSafeTarget(target: string, knownCachePaths: Set<string>): boolean {
  const resolved = path.resolve(target);
  const key = normalize(resolved);
  for (const known of knownCachePaths) {
    if (normalize(known) === key) return true;
  }
  return PROJECT_ARTIFACTS.has(path.basename(resolved));
}

export async function cleanItems(
  items: Array<Pick<ScanItem, "path" | "name" | "bytes">>,
  knownCachePaths: Set<string>,
  onItem?: (outcome: CleanOutcome) => void,
): Promise<{ freed: number; outcomes: CleanOutcome[] }> {
  let freed = 0;
  const outcomes: CleanOutcome[] = [];
  for (const item of items) {
    if (!isSafeTarget(item.path, knownCachePaths)) {
      const outcome: CleanOutcome = { item, ok: false, error: "refused: not a recognized cache path" };
      outcomes.push(outcome);
      onItem?.(outcome);
      continue;
    }
    const error = await removePath(item.path);
    const outcome: CleanOutcome = { item, ok: error === null, error: error ?? undefined };
    if (outcome.ok) freed += item.bytes;
    outcomes.push(outcome);
    onItem?.(outcome);
  }
  return { freed, outcomes };
}
