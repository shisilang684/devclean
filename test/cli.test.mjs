import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args], { cwd: root, timeout: 60000 }, (error, stdout, stderr) => {
      resolve({ code: error && typeof error.code === "number" ? error.code : error ? 1 : 0, stdout, stderr });
    });
  });
}

test("--version matches package.json", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const { code, stdout } = await run(["--version"]);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), pkg.version);
});

test("--help prints usage and exits 0", async () => {
  const { code, stdout } = await run(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /Usage/);
  assert.match(stdout, /devclean clean -i/);
});

test("scan --json emits parseable JSON for an empty selection", async () => {
  const { code, stdout } = await run(["scan", "--json", "--only", "no-such-cache"]);
  assert.equal(code, 0);
  const data = JSON.parse(stdout);
  assert.deepEqual(data.items, []);
  assert.equal(data.totalBytes, 0);
});

test("clean --dry-run deletes nothing even with --yes", async () => {
  const { code, stdout } = await run(["clean", "--dry-run", "--yes", "--only", "no-such-cache"]);
  assert.equal(code, 0);
  assert.match(stdout, /Nothing to clean|nothing was deleted/i);
});

test("report explains an empty scan instead of writing an empty file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "devclean-report-"));
  const out = path.join(dir, "r.html");
  const { code, stdout } = await run(["report", "--only", "no-such-cache", "--out", out]);
  assert.equal(code, 0);
  assert.match(stdout, /Nothing to report/);
  await assert.rejects(fs.access(out));
  await fs.rm(dir, { recursive: true, force: true });
});