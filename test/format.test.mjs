import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatCount, percent, truncateMiddle } from "../dist/util/format.js";

test("formatBytes handles zero and small values", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
});

test("formatBytes scales through units", () => {
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(10 * 1024 * 1024), "10.0 MB");
  assert.equal(formatBytes(3.5 * 1024 ** 3), "3.5 GB");
  assert.equal(formatBytes(120 * 1024 ** 2), "120 MB");
});

test("formatCount abbreviates", () => {
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1500), "1.5k");
  assert.equal(formatCount(2_400_000), "2.4M");
});

test("percent is clamped", () => {
  assert.equal(percent(50, 100), 50);
  assert.equal(percent(200, 100), 100);
  assert.equal(percent(1, 0), 0);
});

test("truncateMiddle keeps both ends", () => {
  const out = truncateMiddle("C:\\Users\\someone\\AppData\\Local\\pnpm\\store", 30);
  assert.equal(out.length, 30);
  assert.ok(out.startsWith("C:\\Users"));
  assert.ok(out.endsWith("store"));
  assert.ok(out.includes("..."));
});
