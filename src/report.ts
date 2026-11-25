import type { ScanItem } from "./scan.js";
import type { Risk } from "./adapters.js";
import { formatBytes, formatCount, percent, truncateMiddle, truncatePath, bar, plural } from "./util/format.js";

export interface Palette {
  bold: (s: string) => string;
  dim: (s: string) => string;
  cyan: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  red: (s: string) => string;
  magenta: (s: string) => string;
}

const IDENTITY = (s: string) => s;

export function createPalette(enabled: boolean): Palette {
  const wrap = (code: number) => (s: string) => (enabled ? `\u001b[${code}m${s}\u001b[0m` : s);
  return {
    bold: wrap(1),
    dim: wrap(2),
    cyan: wrap(36),
    green: wrap(32),
    yellow: wrap(33),
    red: wrap(31),
    magenta: wrap(35),
  };
}

export function riskColor(p: Palette, risk: Risk): (s: string) => string {
  if (risk === "high") return p.red;
  if (risk === "medium") return p.yellow;
  return p.green;
}

function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

function termWidth(): number {
  const width = process.stdout.columns || 0;
  return width > 40 ? width : 100;
}

export interface TableOptions {
  palette?: Palette;
  showPath?: boolean;
  title?: string;
}

/** Render cache rows as an aligned table. */
export function renderTable(items: ScanItem[], options: TableOptions = {}): string {
  const p = options.palette ?? createPalette(false);
  const showPath = options.showPath !== false;
  const total = items.reduce((sum, item) => sum + item.bytes, 0);
  const nameWidth = Math.min(24, Math.max(10, ...items.map((item) => item.name.length)));
  const sizeWidth = 9;
  const shareWidth = 20;
  const filesWidth = 6;
  const riskWidth = 6;
  const fixedWidth = nameWidth + sizeWidth + shareWidth + filesWidth + riskWidth + 10;
  const pathWidth = showPath ? Math.max(18, termWidth() - fixedWidth) : 0;

  const lines: string[] = [];
  const header = [
    padRight("CACHE", nameWidth),
    padLeft("SIZE", sizeWidth),
    padRight("SHARE", shareWidth),
    padLeft("FILES", filesWidth),
    padRight("RISK", riskWidth),
    showPath ? "PATH" : "",
  ]
    .filter(Boolean)
    .join("  ");
  lines.push(p.dim(header));

  for (const item of items) {
    const share = percent(item.bytes, total);
    const shareText = `${bar(share, 14)} ${share.toFixed(0).padStart(3)}%`;
    const cells = [
      padRight(truncateMiddle(item.name, nameWidth), nameWidth),
      p.bold(padLeft(formatBytes(item.bytes), sizeWidth)),
      p.cyan(shareText),
      padLeft(formatCount(item.files), filesWidth),
      padRight(item.risk, riskWidth),
      showPath ? p.dim(truncatePath(item.path, pathWidth)) : "",
    ].filter(Boolean);
    // Color the risk cell only.
    cells[4] = riskColor(p, item.risk)(padRight(item.risk, riskWidth));
    lines.push(cells.join("  "));
  }
  return lines.join("\n");
}

export function renderSummary(items: Array<{ bytes: number; files: number }>, palette: Palette): string {
  const total = items.reduce((acc, item) => ({ bytes: acc.bytes + item.bytes, files: acc.files + item.files }), {
    bytes: 0,
    files: 0,
  });
  return (
    palette.bold(`Total: ${formatBytes(total.bytes)}`) +
    palette.dim(` across ${plural(items.length, "location")}, ${formatCount(total.files)} files`)
  );
}

export interface JsonReport {
  version: string;
  generatedAt: string;
  platform: string;
  totalBytes: number;
  totalFiles: number;
  items: Array<Omit<ScanItem, "errors"> & { errors: number }>;
}

export function renderJson(items: ScanItem[], version: string): string {
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const totalFiles = items.reduce((sum, item) => sum + item.files, 0);
  const report: JsonReport = {
    version,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    totalBytes,
    totalFiles,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      risk: item.risk,
      note: item.note,
      bytes: item.bytes,
      files: item.files,
      errors: item.errors,
    })),
  };
  return JSON.stringify(report, null, 2);
}

export function removeFooter(items: ScanItem[]): string {
  const cleanable = items.filter((item) => item.risk !== "high");
  const lowBytes = cleanable.reduce((sum, item) => sum + item.bytes, 0);
  if (lowBytes === 0) return "";
  return "Reclaim " + formatBytes(lowBytes) + " with devclean clean";
}