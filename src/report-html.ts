import type { ScanItem } from "./scan.js";
import { formatBytes, formatCount } from "./util/format.js";

export interface HtmlReportOptions {
  version: string;
  generatedAt?: Date;
  title?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function platformName(): string {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "darwin") return "macOS";
  return "Linux";
}

const CSS = String.raw`:root{--bg:#0b0e14;--panel:#11151f;--line:#232a3a;--text:#c9d1d9;--dim:#8b949e;--green:#7ee787;--blue:#58a6ff;--yellow:#d29922;--red:#f85149;}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,#16202f 0%,#0b0e14 55%);color:var(--text);font:15px/1.55 ui-sans-serif,-apple-system,'Segoe UI',Roboto,sans-serif;padding:48px 24px 64px}
.wrap{max-width:1080px;margin:0 auto}
header{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:28px;flex-wrap:wrap}
.brand{font:600 15px ui-monospace,'Cascadia Code',Consolas,monospace;color:var(--green);letter-spacing:.2px}
.brand span{color:var(--dim);font-weight:400}
h1{font-size:44px;line-height:1.1;margin:0 0 6px;letter-spacing:-.02em;font-weight:650}
h1 em{font-style:normal;color:var(--green)}
.meta{color:var(--dim);font-size:13.5px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.map{display:block;width:100%;height:auto}
.legend{display:flex;gap:18px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line);color:var(--dim);font-size:12.5px}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:middle}
table{width:100%;border-collapse:collapse;margin-top:26px;font-size:13.5px}
th{text-align:left;color:var(--dim);font-weight:500;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid #1a202c;vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.path{color:var(--dim);font:12px ui-monospace,'Cascadia Code',Consolas,monospace;word-break:break-all}
.risk{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
.low{color:var(--green)}.medium{color:var(--yellow)}.high{color:var(--red)}
footer{margin-top:30px;color:var(--dim);font-size:12.5px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
footer a{color:var(--blue);text-decoration:none}
.rect{transition:opacity .15s}
.rect:hover{opacity:.8}
@media (max-width:640px){h1{font-size:32px}}`;

const SCRIPT = String.raw`(function () {
  var data = JSON.parse(document.getElementById("devclean-data").textContent);
  var W = 1080, H = 520, PAD = 3;
  var svg = document.getElementById("map");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  var ns = "http://www.w3.org/2000/svg";
  var colors = { low: "#2ea043", medium: "#d29922", high: "#f85149" };
  var items = data.items.filter(function (it) { return it.bytes > 0; }).map(function (it) {
    return { name: it.name, bytes: it.bytes, files: it.files, risk: it.risk, path: it.path, v: it.bytes };
  });
  function bytes(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " B";
  }
  var total = items.reduce(function (s, it) { return s + it.bytes; }, 0) || 1;
  var floor = total * 0.06;
  items.forEach(function (it) { it.v = Math.max(it.bytes, floor); });
  function worst(row, length) {
    var sum = 0, max = 0, min = Infinity;
    for (var i = 0; i < row.length; i++) {
      var v = row[i].v;
      sum += v;
      if (v > max) max = v;
      if (v < min) min = v;
    }
    if (sum <= 0) return Infinity;
    var s2 = sum * sum, l2 = length * length;
    return Math.max((l2 * max) / s2, s2 / (l2 * min));
  }
  function layout(list, x, y, w, h, out) {
    var rest = list.slice();
    while (rest.length) {
      var length = Math.min(w, h);
      var row = [rest[0]];
      var j = 1;
      while (j < rest.length) {
        var cand = row.concat([rest[j]]);
        if (worst(cand, length) <= worst(row, length)) { row = cand; j++; } else { break; }
      }
      var rowSum = 0, restSum = 0;
      for (var a = 0; a < row.length; a++) rowSum += row[a].v;
      for (var b = 0; b < rest.length; b++) restSum += rest[b].v;
      var area = (rowSum / restSum) * w * h;
      if (w >= h) {
        var th = area / w;
        var cx = x;
        for (var c = 0; c < row.length; c++) {
          var cw = (row[c].v / rowSum) * w;
          out.push({ item: row[c], x: cx, y: y, w: cw, h: th });
          cx += cw;
        }
        y += th; h -= th;
      } else {
        var tw = area / h;
        var cy = y;
        for (var d = 0; d < row.length; d++) {
          var ch = (row[d].v / rowSum) * h;
          out.push({ item: row[d], x: x, y: cy, w: tw, h: ch });
          cy += ch;
        }
        x += tw; w -= tw;
      }
      rest = rest.slice(row.length);
    }
  }
  items.sort(function (a, b) { return b.v - a.v; });
  var rects = [];
  layout(items, 0, 0, W, H, rects);
  function svgText(x, y, size, fill, content) {
    var t = document.createElementNS(ns, "text");
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.setAttribute("fill", fill);
    t.setAttribute("font-size", String(size));
    t.setAttribute("font-family", "ui-monospace, 'Cascadia Code', Consolas, monospace");
    t.textContent = content;
    return t;
  }
  function fit(text, size) {
    var max = Math.max(0, Math.floor(size / 7.4));
    if (max <= 1) return "";
    return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
  }
  rects.forEach(function (r) {
    if (r.w < PAD * 2 || r.h < PAD * 2) return;
    var g = document.createElementNS(ns, "g");
    var rect = document.createElementNS(ns, "rect");
    rect.setAttribute("class", "rect");
    rect.setAttribute("x", r.x + PAD / 2);
    rect.setAttribute("y", r.y + PAD / 2);
    rect.setAttribute("width", Math.max(0, r.w - PAD));
    rect.setAttribute("height", Math.max(0, r.h - PAD));
    rect.setAttribute("rx", "5");
    rect.setAttribute("fill", colors[r.item.risk] || colors.low);
    rect.setAttribute("fill-opacity", "0.22");
    rect.setAttribute("stroke", colors[r.item.risk] || colors.low);
    rect.setAttribute("stroke-opacity", "0.5");
    var title = document.createElementNS(ns, "title");
    title.textContent = r.item.name + " - " + r.item.path + " (" + r.item.files + " files)";
    g.appendChild(rect);
    g.appendChild(title);
    if (r.w > 90 && r.h > 24) {
      var nameLine = fit(r.item.name, Math.min(r.w - 20, 260));
      if (r.h >= 44) {
        g.appendChild(svgText(r.x + 11, r.y + 21, 13, "#e6edf3", nameLine));
        g.appendChild(svgText(r.x + 11, r.y + 40, 12, "#9aa4b2", bytes(r.item.bytes)));
      } else {
        var compact = fit(r.item.name + "  " + bytes(r.item.bytes), Math.min(r.w - 20, 320));
        g.appendChild(svgText(r.x + 11, r.y + 17, 11.5, "#d7dee8", compact));
      }
    }
    svg.appendChild(g);
  });
})();`;

export function renderHtmlReport(items: ScanItem[], options: HtmlReportOptions): string {
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const totalFiles = items.reduce((sum, item) => sum + item.files, 0);
  const generatedAt = options.generatedAt ?? new Date();
  const cleanableBytes = items.filter((item) => item.risk !== "high").reduce((sum, item) => sum + item.bytes, 0);
  const highBytes = totalBytes - cleanableBytes;
  const title = options.title ?? "devclean report";

  const data = {
    version: options.version,
    generatedAt: generatedAt.toISOString(),
    platform: process.platform,
    totalBytes,
    totalFiles,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      risk: item.risk,
      bytes: item.bytes,
      files: item.files,
    })),
  };

  const rows = items
    .map(
      (item) =>
        "<tr><td>" +
        escapeHtml(item.name) +
        '</td><td class="num">' +
        formatBytes(item.bytes) +
        '</td><td class="num">' +
        formatCount(item.files) +
        '</td><td class="risk ' +
        item.risk +
        '">' +
        item.risk +
        '</td><td class="path">' +
        escapeHtml(item.path) +
        "</td></tr>",
    )
    .join("\n");

  const subtitle =
    formatBytes(cleanableBytes) +
    " reclaimable" +
    (highBytes > 0 ? " - " + formatBytes(highBytes) + " high risk" : "") +
    " - " +
    items.length +
    (items.length === 1 ? " cache" : " caches") +
    ", " +
    formatCount(totalFiles) +
    " files - " +
    escapeHtml(platformName()) +
    " - " +
    generatedAt.toISOString().slice(0, 10);

  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>" + escapeHtml(title) + "</title>",
    "<style>",
    CSS,
    "</style>",
    '</head><body><div class="wrap">',
    "<header>",
    '<div class="brand">devclean <span>report</span></div>',
    '<div class="meta">' + subtitle + "</div>",
    "</header>",
    "<h1>You can reclaim <em>" + formatBytes(cleanableBytes) + "</em></h1>",
    '<p class="meta">' +
      items.length +
      " caches found. High-risk items (local model weights) are never included in the total above.</p>",
    '<div class="panel" style="margin-top:22px">',
    '<svg id="map" class="map" role="img" aria-label="Treemap of developer caches"></svg>',
    '<div class="legend">',
    '<span><i style="background:#2ea043"></i>low risk</span>',
    '<span><i style="background:#d29922"></i>medium risk</span>',
    '<span><i style="background:#f85149"></i>high risk</span>',
    '<span style="margin-left:auto">area = size on disk</span>',
    "</div></div>",
    '<table><thead><tr><th>Cache</th><th class="num">Size</th><th class="num">Files</th><th>Risk</th><th>Path</th></tr></thead><tbody>',
    rows,
    "</tbody></table>",
    "<footer>",
    "<span>Generated by devclean " +
      escapeHtml(options.version) +
      " on " +
      generatedAt.toISOString().replace("T", " ").slice(0, 19) +
      " UTC</span>",
    '<span><a href="https://github.com/shisilang684/devclean">github.com/shisilang684/devclean</a></span>',
    "</footer></div>",
    '<script id="devclean-data" type="application/json">' + escapeJsonForScript(data) + "</script>",
    "<script>",
    SCRIPT,
    "</script>",
    "</body></html>",
  ].join("\n");
}