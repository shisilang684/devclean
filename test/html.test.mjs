import test from "node:test";
import assert from "node:assert/strict";
import { renderHtmlReport } from "../dist/report-html.js";

const items = [
  {
    id: "pnpm",
    name: "pnpm store",
    path: "C:\\Users\\me\\AppData\\Local\\pnpm\\store",
    risk: "low",
    note: "",
    bytes: 1046478848,
    files: 20700,
    errors: 0,
  },
  {
    id: "ollama",
    name: "Ollama models",
    path: "C:\\Users\\me\\.ollama\\models",
    risk: "high",
    note: "",
    bytes: 64 * 1024 ** 3,
    files: 42,
    errors: 0,
  },
];

test("html report includes the total, items and footer", () => {
  const html = renderHtmlReport(items, { version: "9.9.9", generatedAt: new Date("2026-01-02T03:04:05Z") });
  assert.match(html, /You can reclaim <em>998 MB<\/em>/);
  assert.match(html, /pnpm store/);
  assert.match(html, /Ollama models/);
  assert.match(html, /devclean 9\.9\.9/);
  assert.match(html, /2026-01-02/);
  assert.ok(html.includes('id="devclean-data"'));
});

test("html report escapes unsafe path content", () => {
  const evil = [{ ...items[0], path: "</script><script>alert(1)</script>" }];
  const html = renderHtmlReport(evil, { version: "1.0.0" });
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.ok(html.includes("&lt;/script&gt;"));
});

test("html report survives an empty scan", () => {
  const html = renderHtmlReport([], { version: "1.0.0" });
  assert.match(html, /You can reclaim <em>0 B<\/em>/);
});