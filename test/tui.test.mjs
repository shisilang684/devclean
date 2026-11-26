import test from "node:test";
import assert from "node:assert/strict";
import {
  createTuiState,
  toggleAt,
  setAll,
  moveCursor,
  selectedItems,
  selectionTotals,
  renderTui,
} from "../dist/tui.js";
import { createPalette } from "../dist/report.js";

const items = [
  { id: "a", name: "pnpm store", path: "C:\\cache\\pnpm", risk: "low", note: "", bytes: 1000, files: 10, errors: 0 },
  { id: "b", name: "Ollama models", path: "C:\\models", risk: "high", note: "", bytes: 9000, files: 2, errors: 0 },
  { id: "c", name: "npm cache", path: "C:\\cache\\npm", risk: "low", note: "", bytes: 500, files: 5, errors: 0 },
];

test("high risk items start unselected", () => {
  const state = createTuiState(items);
  assert.deepEqual(state.selected, [true, false, true]);
  assert.deepEqual(selectedItems(state).map((i) => i.id), ["a", "c"]);
  assert.equal(selectionTotals(state).bytes, 1500);
});

test("toggle and bulk selection", () => {
  let state = createTuiState(items);
  state = toggleAt(state, 1);
  assert.equal(state.selected[1], true);
  state = setAll(state, false);
  assert.equal(selectedItems(state).length, 0);
  state = setAll(state, true);
  assert.equal(selectedItems(state).length, 3);
});

test("cursor stays in bounds", () => {
  let state = createTuiState(items);
  state = moveCursor(state, -5);
  assert.equal(state.cursor, 0);
  state = moveCursor(state, 99);
  assert.equal(state.cursor, 2);
});

test("render shows every item and the running total", () => {
  const state = createTuiState(items);
  const lines = renderTui(state, createPalette(false), 100);
  const text = lines.join("\n");
  assert.ok(text.includes("pnpm store"));
  assert.ok(text.includes("Ollama models"));
  assert.ok(text.includes("Selected: 1.5 KB"));
  assert.ok(text.includes("[ ] Ollama"));
});
