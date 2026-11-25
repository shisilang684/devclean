import { promises as fs } from "node:fs";
import path from "node:path";

export interface SizeResult {
  bytes: number;
  files: number;
  dirs: number;
  errors: number;
}

const EMPTY: SizeResult = { bytes: 0, files: 0, dirs: 0, errors: 0 };

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    const st = await fs.stat(target);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function statBatch(files: string[], result: SizeResult): Promise<void> {
  const CONCURRENCY = 64;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const slice = files.slice(i, i + CONCURRENCY);
    const sizes = await Promise.all(
      slice.map(async (file) => {
        try {
          const st = await fs.stat(file);
          return st.isFile() ? st.size : 0;
        } catch {
          result.errors += 1;
          return 0;
        }
      }),
    );
    for (const size of sizes) {
      result.bytes += size;
      result.files += 1;
    }
  }
}

/**
 * Walk a directory tree without following symlinks and sum file sizes.
 * Uses a breadth-first queue so very deep trees cannot blow the call stack.
 */
export async function dirSize(root: string, batch = 24): Promise<SizeResult> {
  const result: SizeResult = { ...EMPTY };
  let pending: string[] = [root];

  while (pending.length > 0) {
    const chunk = pending.splice(0, batch);
    const listings = await Promise.all(
      chunk.map(async (dir) => {
        try {
          return await fs.readdir(dir, { withFileTypes: true });
        } catch {
          result.errors += 1;
          return [];
        }
      }),
    );

    for (let i = 0; i < chunk.length; i += 1) {
      result.dirs += 1;
      const dir = chunk[i];
      const files: string[] = [];
      for (const entry of listings[i]) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          pending.push(full);
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
      if (files.length > 0) await statBatch(files, result);
    }
  }
  return result;
}

/** Delete a path recursively. Returns an error message instead of throwing. */
export async function removePath(target: string): Promise<string | null> {
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

/** Directory names considered reclaimable inside a project tree. */
export const PROJECT_ARTIFACTS = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  ".next",
  ".nuxt",
  ".turbo",
  ".parcel-cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
]);

/** Files that mark a directory as a project root. */
export const PROJECT_MARKERS = new Set([
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile",
  "requirements.txt",
  ".git",
]);

/** Directories that are never worth descending into. */
export const SYSTEM_DIRS = new Set([
  "AppData",
  "Application Data",
  "Windows",
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "$Recycle.Bin",
  "System Volume Information",
  "node_modules",
  "site-packages",
  "Library",
  "Caches",
]);

export interface ProjectHit {
  path: string;
  name: string;
  root: string;
  bytes: number;
  files: number;
}

/**
 * Find package/build directories inside real projects under `root`.
 * A directory counts as a project only when it contains a known project
 * marker (package.json, .git, Cargo.toml, ...), which keeps caches that
 * belong to the OS or to Python's standard library out of the report.
 * Does not descend into an artifact once it matches.
 */
export async function findProjectArtifacts(
  root: string,
  maxDepth = 6,
  onProgress?: (visited: number) => void,
): Promise<ProjectHit[]> {
  const hits: ProjectHit[] = [];
  const queue: Array<{ dir: string; depth: number; projectRoot: string | null }> = [
    { dir: root, depth: 0, projectRoot: null },
  ];
  let visited = 0;

  while (queue.length > 0) {
    const chunk = queue.splice(0, 16);
    const listings = await Promise.all(
      chunk.map(async ({ dir }) => {
        try {
          return await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return [];
        }
      }),
    );

    for (let i = 0; i < chunk.length; i += 1) {
      const { dir, depth, projectRoot } = chunk[i];
      visited += 1;
      if (onProgress && visited % 50 === 0) onProgress(visited);
      if (depth >= maxDepth) continue;

      const entries = listings[i];
      const hasMarker = entries.some((entry) => PROJECT_MARKERS.has(entry.name));
      const currentRoot = projectRoot ?? (hasMarker ? dir : null);
      const next: Array<{ dir: string; depth: number; projectRoot: string | null }> = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (PROJECT_ARTIFACTS.has(entry.name)) {
          if (currentRoot) hits.push({ path: full, name: entry.name, root: currentRoot, bytes: 0, files: 0 });
        } else if (
          !entry.name.startsWith(".") &&
          !SYSTEM_DIRS.has(entry.name) &&
          entry.name !== "__pycache__"
        ) {
          next.push({ dir: full, depth: depth + 1, projectRoot: currentRoot });
        }
      }
      queue.push(...next);
    }
  }
  return hits;
}
