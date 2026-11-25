#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { renderHtmlReport } from "./report-html.js";
import { selectItems } from "./tui.js";
import { discover, scanAll, scanCandidates, totalOf, type ScanItem } from "./scan.js";
import { dirSize, findProjectArtifacts, pathExists } from "./util/fs.js";
import { createPalette, renderTable, renderSummary, renderJson, removeFooter, type Palette } from "./report.js";
import { cleanItems } from "./clean.js";
import { ADAPTERS, detectEnv } from "./adapters.js";
import { loadConfig } from "./config.js";
import { formatBytes, formatCount, truncateMiddle } from "./util/format.js";

const VERSION = "0.5.0";

type FlagValue = string | boolean;
type Flags = Record<string, FlagValue>;

interface Parsed {
  command: string;
  positionals: string[];
  flags: Flags;
}

const COMMANDS = new Set(["scan", "clean", "projects", "report", "config", "help"]);
const VALUE_FLAGS = new Set(["only", "top", "depth", "out"]);

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
    if (arg === "-i") {
      flags.interactive = true;
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
    "  devclean clean -i         pick caches interactively",
    "  devclean projects [dir]   find node_modules, .venv, __pycache__, target",
    "  devclean report           write a shareable HTML report of the scan",
    "  devclean config           show the config file (ignore lists, custom caches)",
    "  devclean clean --all      include local LLM weights (high risk)",
    "",
    p.bold("Options"),
    "  --json           print machine-readable JSON",
    "  --only <ids>     comma separated adapter ids (npm,pip,cargo,...)",
    "  --top <n>        show only the n largest entries",
    "  --all            include high risk caches when cleaning",
    "  -i, --interactive pick caches to delete in a list",
    "  --yes            skip the confirmation prompt",
    "  --dry-run        show what would be deleted, delete nothing",
    "  --depth <n>      projects: maximum directory depth (default 6)",
    "  --out <file>     report: output path (default devclean-report.html)",
    "  --open           report: open the file after writing it",
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

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[cols - 1]!;
}

function closestId(id: string, ids: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of ids) {
    const score = editDistance(id, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore <= Math.max(1, Math.floor(id.length / 3)) ? best : undefined;
}

/** Warn about --only ids that match no adapter or custom cache. */
async function warnUnknownOnly(parsed: Parsed, p: Palette): Promise<void> {
  const only = parseOnly(parsed.flags);
  if (!only || only.length === 0) return;
  const config = await loadConfig(detectEnv());
  const known = [...ADAPTERS.map((adapter) => adapter.id), ...config.extra.map((extra) => extra.id)];
  const unknown = only.filter((id) => !known.includes(id));
  if (unknown.length === 0) return;
  for (const id of unknown) {
    const hint = closestId(id, known);
    process.stderr.write(
      p.yellow('warning: unknown cache id "' + id + '"') +
        (hint ? p.dim(' - did you mean "' + hint + '"?') : "") +
        "\n",
    );
  }
  if (unknown.length === only.length) {
    process.stderr.write(p.dim("known ids: " + known.join(", ")) + "\n");
  }
}

async function commandScan(parsed: Parsed, p: Palette): Promise<void> {
  const only = parseOnly(parsed.flags);
  await warnUnknownOnly(parsed, p);
  const json = Boolean(parsed.flags.json);
  const progress = progressReporter(p, !json && Boolean(process.stderr.isTTY));
  const started = Date.now();
  const { items } = await scanAll({
    only,
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
    const message =
      only && only.length > 0
        ? "No caches matched --only " + only.join(",") + "."
        : "No dev caches found on this machine.";
    process.stdout.write(p.green(message) + "\n");
    return;
  }

  process.stdout.write(renderTable(shown, { palette: p }) + "\n\n");
  process.stdout.write(renderSummary(shown, p) + p.dim("  (" + elapsed + "s)") + "\n");
  const footer = removeFooter(shown);
  if (footer) process.stdout.write(p.cyan(footer) + "\n");
}

async function commandClean(parsed: Parsed, p: Palette): Promise<void> {
  await warnUnknownOnly(parsed, p);
  const includeHigh = Boolean(parsed.flags.all);
  const json = Boolean(parsed.flags.json);
  const progress = progressReporter(p, !json && Boolean(process.stderr.isTTY));
  const { items: all, candidates } = await scanAll({
    only: parseOnly(parsed.flags),
    onScanStart: (candidate) => progress.start(candidate.name),
    onScanDone: (item) => progress.done(item.name, formatBytes(item.bytes)),
  });
  progress.finish();

  let targets = all.filter((item) => includeHigh || item.risk !== "high");
  if (targets.length === 0) {
    process.stdout.write(p.green("Nothing to clean.") + "\n");
    return;
  }

  let picked = false;
  if (!json && (parsed.flags.interactive || parsed.flags.i) && process.stdin.isTTY && process.stdout.isTTY) {
    picked = true;
    const chosen = await selectItems(all, { palette: p });
    if (!chosen) {
      process.stdout.write("Aborted.\n");
      return;
    }
    if (chosen.length === 0) {
      process.stdout.write(p.dim("Nothing selected.") + "\n");
      return;
    }
    targets = chosen;
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

  if (!parsed.flags.yes && !picked) {
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


async function commandReport(parsed: Parsed, p: Palette): Promise<void> {
  const json = Boolean(parsed.flags.json);
  const progress = progressReporter(p, !json && Boolean(process.stderr.isTTY));
  const { items } = await scanAll({
    only: parseOnly(parsed.flags),
    onScanStart: (candidate) => progress.start(candidate.name),
    onScanDone: (item) => progress.done(item.name, formatBytes(item.bytes)),
  });
  progress.finish();

  if (items.length === 0) {
    process.stdout.write(p.green("Nothing to report - no dev caches found.") + "\n");
    return;
  }

  const outRaw = parsed.flags.out;
  const out = path.resolve(typeof outRaw === "string" && outRaw.length > 0 ? outRaw : "devclean-report.html");
  const html = renderHtmlReport(items, { version: VERSION });
  await writeFile(out, html, "utf8");
  const total = totalOf(items);
  process.stdout.write(p.green("Wrote " + out) + p.dim(" (" + formatBytes(Buffer.byteLength(html)) + ", " + formatCount(total.files) + " files scanned)") + "\n");

  if (parsed.flags.open) {
    const { spawn } = await import("node:child_process");
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", out] : [out];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  }
}

async function commandConfig(parsed: Parsed, p: Palette): Promise<void> {
  const env = detectEnv();
  const config = await loadConfig(env);
  const exists = await pathExists(config.sourcePath);

  if (parsed.flags.json) {
    process.stdout.write(
      JSON.stringify(
        { path: config.sourcePath, exists, ignore: config.ignore, extra: config.extra, warnings: config.warnings },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write(p.bold("Config") + "\n  " + config.sourcePath + "\n\n");
  for (const warning of config.warnings) process.stdout.write(p.yellow("warning: " + warning) + "\n");

  if (!exists) {
    process.stdout.write(p.dim("No config file yet. Create one to ignore caches or add your own:") + "\n\n");
    process.stdout.write(
      [
        "{",
        '  "ignore": ["maven"],',
        '  "extra": [',
        '    { "name": "Bazel cache", "path": "~/.cache/bazel", "risk": "medium" }',
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
    return;
  }

  if (config.ignore.length === 0) process.stdout.write("ignore: none\n");
  else process.stdout.write("ignore: " + config.ignore.join(", ") + "\n");
  if (config.extra.length === 0) process.stdout.write("extra:  none\n");
  else {
    process.stdout.write("extra:\n");
    for (const item of config.extra) {
      process.stdout.write("  " + item.name + "  " + item.risk + "  " + item.path + "\n");
    }
  }
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
  if (parsed.command === "report") {
    await commandReport(parsed, p);
    return;
  }
  if (parsed.command === "projects") {
    await commandProjects(parsed, p);
    return;
  }
  if (parsed.command === "config") {
    await commandConfig(parsed, p);
    return;
  }
  await commandScan(parsed, p);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("devclean: " + message + "\n");
  process.exit(1);
});