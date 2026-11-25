#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { discover, scanAll, scanCandidates, totalOf, type ScanItem } from "./scan.js";
import { dirSize, findProjectArtifacts } from "./util/fs.js";
import { createPalette, renderTable, renderSummary, renderJson, removeFooter, type Palette } from "./report.js";
import { cleanItems } from "./clean.js";
import { formatBytes, formatCount, truncateMiddle } from "./util/format.js";

const VERSION = "0.1.0";

type FlagValue = string | boolean;
type Flags = Record<string, FlagValue>;

interface Parsed {
  command: string;
  positionals: string[];
  flags: Flags;
}

const COMMANDS = new Set(["scan", "clean", "projects", "help"]);
const VALUE_FLAGS = new Set(["only", "top", "depth"]);

function parseArgs(argv: string[]): Parsed {
  const flags: Flags = {};
  const positionals: string[] = [];
  let command = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (arg === "-v") {
      flags.version = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (VALUE_FLAGS.has(body)) {
        flags[body] = argv[i + 1] ?? "";
        i += 1;
      } else {
        flags[body] = true;
      }
      continue;
    }
    if (!command && COMMANDS.has(arg)) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command: command || "scan", positionals, flags };
}

function helpText(p: Palette): string {
  const lines = [
    p.bold("devclean " + VERSION) + p.dim(" - find and reclaim the gigabytes your dev tools are hoarding"),
    "",
    p.bold("Usage"),
    "  devclean                  scan the caches your dev tools left behind",
    "  devclean clean            delete low and medium risk caches",
    "  devclean projects [dir]   find node_modules, .venv, __pycache__, target",
    "  devclean clean --all      include local LLM weights (high risk)",
    "",
    p.bold("Options"),
    "  --json           print machine-readable JSON",
    "  --only <ids>     comma separated adapter ids (npm,pip,cargo,...)",
    "  --top <n>        show only the n largest entries",
    "  --all            include high risk caches when cleaning",
    "  --yes            skip the confirmation prompt",
    "  --dry-run        show what would be deleted, delete nothing",
    "  --depth <n>      projects: maximum directory depth (default 6)",
    "  --no-color       disable ANSI colors",
    "  -h, --help       show this help",
    "  -v, --version    show the version",
    "",
    p.dim("Docs: https://github.com/shisilang684/devclean"),
  ];
  return lines.join("\n");
}

function fail(message: string): never {
  process.stderr.write("devclean: " + message + "\n");
  process.exit(1);
}

function progressReporter(p: Palette, enabled: boolean): { start: (label: string) => void; done: (label: string, size: string) => void; finish: () => void } {
  if (!enabled) {
    return { start: () => {}, done: () => {}, finish: () => {} };
  }
  let last = "";
  return {
    start(label: string) {
      last = label;
      process.stderr.write("\r" + p.dim("  scanning " + label + "...").padEnd(78));
    },
    done(_label: string, size: string) {
      process.stderr.write("\r" + p.dim("  scanned " + last + ": " + size).padEnd(78));
    },
    finish() {
      process.stderr.write("\r" + " ".repeat(78) + "\r");
    },
  };
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function parseOnly(flags: Flags): string[] | undefined {
  const raw = flags.only;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function commandScan(parsed: Parsed, p: Palette): Promise<void> {
  const json = Boolean(parsed.flags.json);
  const progress = progressReporter(p, !json && Boolean(process.stderr.isTTY));
  const started = Date.now();
  const { items } = await scanAll({
    only: parseOnly(parsed.flags),
    onScanStart: (candidate) => progress.start(candidate.name),
    onScanDone: (item) => progress.done(item.name, formatBytes(item.bytes)),
  });
  progress.finish();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const topRaw = parsed.flags.top;
  const top = typeof topRaw === "string" ? Number.parseInt(topRaw, 10) : 0;
  const shown = top > 0 ? items.slice(0, top) : items;

  if (json) {
    process.stdout.write(renderJson(shown, VERSION) + "\n");
    return;
  }
  if (shown.length === 0) {
    process.stdout.write(p.green("Nothing to clean - no dev caches found.") + "\n");
    return;
  }

  process.stdout.write(renderTable(shown, { palette: p }) + "\n\n");
  process.stdout.write(renderSummary(shown, p) + p.dim("  (" + elapsed + "s)") + "\n");
  const footer = removeFooter(shown);
  if (footer) process.stdout.write(p.cyan(footer) + "\n");
}

async function commandClean(parsed: Parsed, p: Palette): Promise<void> {
  const includeHigh = Boolean(parsed.flags.all);
  const json = Boolean(parsed.flags.json);
  const progress = progressReporter(p, !json && Boolean(process.stderr.isTTY));
  const { items: all, candidates } = await scanAll({
    only: parseOnly(parsed.flags),
    onScanStart: (candidate) => progress.start(candidate.name),
    onScanDone: (item) => progress.done(item.name, formatBytes(item.bytes)),
  });
  progress.finish();

  const targets = all.filter((item) => includeHigh || item.risk !== "high");
  if (targets.length === 0) {
    process.stdout.write(p.green("Nothing to clean.") + "\n");
    return;
  }

  const total = totalOf(targets);
  if (json) {
    process.stdout.write(renderJson(targets, VERSION) + "\n");
    if (!parsed.flags.yes) return;
  } else {
    process.stdout.write(renderTable(targets, { palette: p }) + "\n\n");
    process.stdout.write(renderSummary(targets, p) + "\n");
  }

  if (parsed.flags["dry-run"]) {
    process.stdout.write(p.yellow("Dry run - nothing was deleted.") + "\n");
    return;
  }

  if (!parsed.flags.yes) {
    if (!process.stdin.isTTY) {
      fail("refusing to delete without --yes (stdin is not a TTY)");
    }
    const ok = await confirm(
      p.bold("Delete " + formatCount(total.files) + " files (" + formatBytes(total.bytes) + ")? ") + p.dim("[y/N] "),
    );
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  const known = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.path);
    known.add(process.platform === "win32" ? resolved.toLowerCase() : resolved);
  }
  const { freed, outcomes } = await cleanItems(targets, known);
  const failures = outcomes.filter((outcome) => !outcome.ok);
  for (const outcome of failures) {
    process.stderr.write(p.red("  failed: " + outcome.item.path + " - " + (outcome.error ?? "unknown")) + "\n");
  }
  process.stdout.write("\n" + p.green(p.bold("Reclaimed " + formatBytes(freed))) + "\n");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function commandProjects(parsed: Parsed, p: Palette): Promise<void> {
  const root = path.resolve(parsed.positionals[0] ?? process.cwd());
  const depthRaw = parsed.flags.depth;
  const depth = typeof depthRaw === "string" ? Number.parseInt(depthRaw, 10) : 6;
  const json = Boolean(parsed.flags.json);
  const wanted = new Set(parsed.positionals.slice(1));

  if (process.stderr.isTTY && !json) process.stderr.write(p.dim("  scanning " + root + "...") + "\n");
  let hits = await findProjectArtifacts(root, Number.isFinite(depth) ? depth : 6);
  if (wanted.size > 0) hits = hits.filter((hit) => wanted.has(hit.name));

  const measured = await mapLimit(hits, 4, async (hit) => {
    const size = await dirSize(hit.path);
    return { ...hit, bytes: size.bytes, files: size.files };
  });
  measured.sort((a, b) => b.bytes - a.bytes);

  const items: ScanItem[] = measured.map((hit) => ({
    id: "project",
    name: hit.name,
    path: hit.path,
    risk: "low",
    note: "Project artifact - reinstall with your package manager.",
    bytes: hit.bytes,
    files: hit.files,
    errors: 0,
  }));

  const topRaw = parsed.flags.top;
  const top = typeof topRaw === "string" ? Number.parseInt(topRaw, 10) : 0;
  const shown = top > 0 ? items.slice(0, top) : items;

  if (json) {
    process.stdout.write(renderJson(shown, VERSION) + "\n");
    return;
  }
  if (shown.length === 0) {
    process.stdout.write(p.green("No project artifacts found under " + root) + "\n");
    return;
  }

  process.stdout.write(renderTable(shown, { palette: p }) + "\n\n");
  process.stdout.write(renderSummary(shown, p) + "\n");
  if (!parsed.flags.clean) {
    process.stdout.write(p.dim("Add --clean to delete these, e.g. devclean projects " + root + " --clean") + "\n");
    return;
  }
  if (parsed.flags["dry-run"]) {
    process.stdout.write(p.yellow("Dry run - nothing was deleted.") + "\n");
    return;
  }
  if (!parsed.flags.yes) {
    if (!process.stdin.isTTY) fail("refusing to delete without --yes (stdin is not a TTY)");
    const total = totalOf(shown);
    const ok = await confirm(
      p.bold("Delete " + formatCount(total.files) + " files (" + formatBytes(total.bytes) + ")? ") + p.dim("[y/N] "),
    );
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }
  const { freed } = await cleanItems(shown, new Set());
  process.stdout.write("\n" + p.green(p.bold("Reclaimed " + formatBytes(freed))) + "\n");
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const colorEnabled = Boolean(process.stdout.isTTY) && !parsed.flags["no-color"] && !process.env.NO_COLOR;
  const p = createPalette(colorEnabled);

  if (parsed.flags.version) {
    process.stdout.write(VERSION + "\n");
    return;
  }
  if (parsed.flags.help || parsed.command === "help") {
    process.stdout.write(helpText(p) + "\n");
    return;
  }

  if (parsed.command === "clean") {
    await commandClean(parsed, p);
    return;
  }
  if (parsed.command === "projects") {
    await commandProjects(parsed, p);
    return;
  }
  await commandScan(parsed, p);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("devclean: " + message + "\n");
  process.exit(1);
});
