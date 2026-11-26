import readline from "node:readline";
import process from "node:process";
import type { ScanItem } from "./scan.js";
import { formatBytes, formatCount, truncateMiddle, truncatePath } from "./util/format.js";
import type { Palette } from "./report.js";

export interface TuiState {
  items: ScanItem[];
  selected: boolean[];
  cursor: number;
}

/** Low and medium risk caches start selected; model weights are opt-in. */
export function createTuiState(items: ScanItem[]): TuiState {
  return {
    items,
    selected: items.map((item) => item.risk !== "high"),
    cursor: 0,
  };
}

export function toggleAt(state: TuiState, index = state.cursor): TuiState {
  if (index < 0 || index >= state.items.length) return state;
  const selected = state.selected.slice();
  selected[index] = !selected[index];
  return { ...state, selected };
}

export function setAll(state: TuiState, value: boolean): TuiState {
  return { ...state, selected: state.items.map(() => value) };
}

export function moveCursor(state: TuiState, delta: number): TuiState {
  const next = Math.min(state.items.length - 1, Math.max(0, state.cursor + delta));
  return { ...state, cursor: next };
}

export function selectedItems(state: TuiState): ScanItem[] {
  return state.items.filter((_, index) => state.selected[index]);
}

export function selectionTotals(state: TuiState): { bytes: number; files: number } {
  return selectedItems(state).reduce(
    (acc, item) => ({ bytes: acc.bytes + item.bytes, files: acc.files + item.files }),
    { bytes: 0, files: 0 },
  );
}

export function renderTui(state: TuiState, palette: Palette, width = 100): string[] {
  const p = palette;
  const lines: string[] = [];
  lines.push(p.bold("devclean") + p.dim(" - select what to delete"));
  lines.push("");
  const { bytes, files } = selectionTotals(state);
  lines.push(
    p.dim("  space toggle   a all   n none   arrows move   enter delete   q quit"),
  );
  lines.push("");
  const nameWidth = Math.min(22, Math.max(10, ...state.items.map((item) => item.name.length)));
  const riskWidth = 6;
  const sizeWidth = 9;
  const pathWidth = Math.max(16, width - nameWidth - sizeWidth - riskWidth - 14);

  state.items.forEach((item, index) => {
    const cursor = index === state.cursor;
    const box = state.selected[index] ? p.green("[x]") : p.dim("[ ]");
    const name = (cursor ? p.bold(">") : " ") + " " + box + " " + item.name.padEnd(nameWidth);
    const size = formatBytes(item.bytes).padStart(sizeWidth);
    const risk = item.risk.padEnd(riskWidth);
    const meta = p.dim(truncatePath(item.path, pathWidth));
    lines.push(name + "  " + size + "  " + risk + "  " + meta);
  });

  lines.push("");
  lines.push(
    p.bold("Selected: " + formatBytes(bytes)) +
      p.dim("  (" + formatCount(files) + " files, " + selectedItems(state).length + " of " + state.items.length + ")"),
  );
  return lines;
}

export interface SelectOptions {
  palette: Palette;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

/** Interactive checkbox list. Returns null when the user quits. */
export function selectItems(items: ScanItem[], options: SelectOptions): Promise<ScanItem[] | null> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const palette = options.palette;

  return new Promise((resolve) => {
    let state = createTuiState(items);
    let lines = renderTui(state, palette, output.columns ?? 100);

    const paint = (full: boolean) => {
      if (full) output.write("\u001b[?25l");
      else output.write("\u001b[" + lines.length + "A");
      for (const line of lines) output.write(line + "\u001b[K\n");
      lines = renderTui(state, palette, output.columns ?? 100);
    };

    const done = (result: ScanItem[] | null) => {
      input.setRawMode?.(false);
      input.pause();
      input.removeListener("keypress", onKey);
      output.write("\u001b[?25h\n");
      resolve(result);
    };

    const onKey = (str: string, key: readline.Key) => {
      if (key?.ctrl && key.name === "c") return done(null);
      if (key?.name === "q" || key?.name === "escape") return done(null);
      if (key?.name === "return" || key?.name === "enter") return done(selectedItems(state));
      if (key?.name === "space") state = toggleAt(state);
      else if (key?.name === "up" || (key?.name === "k")) state = moveCursor(state, -1);
      else if (key?.name === "down" || (key?.name === "j")) state = moveCursor(state, 1);
      else if (key?.name === "a") state = setAll(state, true);
      else if (key?.name === "n") state = setAll(state, false);
      else if (str === " ") state = toggleAt(state);
      else return;
      paint(false);
    };

    readline.emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    input.on("keypress", onKey);

    output.write("\u001b[?25l");
    for (const line of lines) output.write(line + "\u001b[K\n");
  });
}