import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirSize, findProjectArtifacts } from "../dist/util/fs.js";
import { discover } from "../dist/scan.js";
import { cleanItems, isSafeTarget } from "../dist/clean.js";

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "devclean-test-"));
}

async function writeFile(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.alloc(bytes, 1));
}

test("dirSize sums nested files", async () => {
  const root = await tempDir();
  await writeFile(path.join(root, "a.txt"), 1000);
  await writeFile(path.join(root, "nested", "b.txt"), 2000);
  await writeFile(path.join(root, "nested", "deep", "c.txt"), 3000);
  const result = await dirSize(root);
  assert.equal(result.bytes, 6000);
  assert.equal(result.files, 3);
  await fs.rm(root, { recursive: true, force: true });
});

test("dirSize returns empty for a missing directory", async () => {
  const result = await dirSize(path.join(os.tmpdir(), "devclean-does-not-exist-" + Date.now()));
  assert.equal(result.bytes, 0);
  assert.equal(result.files, 0);
  assert.ok(result.errors > 0);
});

test("findProjectArtifacts only reports artifacts inside projects", async () => {
  const root = await tempDir();
  // A project with a marker and a node_modules folder.
  await writeFile(path.join(root, "app", "package.json"), 10);
  await writeFile(path.join(root, "app", "node_modules", "dep", "index.js"), 5000);
  // A cache-like folder with no project marker must be ignored.
  await writeFile(path.join(root, "random", "node_modules", "x.js"), 5000);
  const hits = await findProjectArtifacts(root, 6);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "node_modules");
  assert.equal(path.basename(path.dirname(hits[0].path)), "app");
  await fs.rm(root, { recursive: true, force: true });
});

test("discover honors a custom env and skips missing paths", async () => {
  const root = await tempDir();
  const home = path.join(root, "home");
  const local = path.join(home, "AppData", "Local");
  await writeFile(path.join(local, "npm-cache", "_cacache", "content", "x"), 100);
  await writeFile(path.join(home, ".cargo", "registry", "cache", "y"), 100);

  const env = {
    platform: "win32",
    home,
    localAppData: local,
    appData: path.join(home, "AppData", "Roaming"),
    vars: {},
  };
  const candidates = await discover({ env });
  const ids = candidates.map((c) => c.id).sort();
  assert.deepEqual(ids, ["cargo", "npm"]);
  await fs.rm(root, { recursive: true, force: true });
});

test("cleanItems refuses unknown paths and deletes known caches", async () => {
  const root = await tempDir();
  const cache = path.join(root, "cache");
  await writeFile(path.join(cache, "data.bin"), 4096);
  const unknown = path.join(root, "important");
  await writeFile(path.join(unknown, "notes.txt"), 10);

  const known = new Set([path.resolve(cache)]);
  assert.equal(isSafeTarget(cache, known), true);
  assert.equal(isSafeTarget(unknown, known), false);

  const { freed, outcomes } = await cleanItems(
    [
      { path: cache, name: "cache", bytes: 4096 },
      { path: unknown, name: "important", bytes: 10 },
    ],
    known,
  );
  assert.equal(freed, 4096);
  assert.equal(outcomes.filter((o) => o.ok).length, 1);
  assert.equal(outcomes.filter((o) => !o.ok).length, 1);
  await fs.access(unknown);
  await fs.rm(root, { recursive: true, force: true });
});
