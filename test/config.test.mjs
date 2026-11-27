import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, configPath } from "../dist/config.js";
import { discover } from "../dist/scan.js";

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "devclean-config-"));
}

function fakeEnv(root, configFile) {
  const home = path.join(root, "home");
  return {
    platform: "win32",
    home,
    localAppData: path.join(home, "AppData", "Local"),
    appData: path.join(home, "AppData", "Roaming"),
    vars: configFile ? { DEVCLEAN_CONFIG: configFile } : {},
  };
}

test("a missing config file is not an error", async () => {
  const root = await tempDir();
  const config = await loadConfig(fakeEnv(root, path.join(root, "nope.json")));
  assert.deepEqual(config.ignore, []);
  assert.deepEqual(config.extra, []);
  assert.deepEqual(config.warnings, []);
  await fs.rm(root, { recursive: true, force: true });
});

test("ignore entries and extra caches are parsed, with home expansion", async () => {
  const root = await tempDir();
  const file = path.join(root, "config.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      ignore: ["maven", "C:\\junk"],
      extra: [{ name: "Bazel Cache", path: "~/.cache/bazel", risk: "low", note: "test" }],
    }),
  );
  const config = await loadConfig(fakeEnv(root, file));
  assert.deepEqual(config.ignore, ["maven", "C:\\junk"]);
  assert.equal(config.extra.length, 1);
  assert.equal(config.extra[0].id, "bazel-cache");
  assert.equal(config.extra[0].risk, "low");
  assert.equal(config.extra[0].path, path.join(root, "home", ".cache", "bazel"));
  await fs.rm(root, { recursive: true, force: true });
});

test("malformed config reports warnings and does not throw", async () => {
  const root = await tempDir();
  const file = path.join(root, "config.json");
  await fs.writeFile(file, "{ not json");
  const config = await loadConfig(fakeEnv(root, file));
  assert.equal(config.extra.length, 0);
  assert.equal(config.warnings.length, 1);
  assert.match(config.warnings[0], /not valid JSON/);
  await fs.rm(root, { recursive: true, force: true });
});

// This fixture builds a Windows-style AppData layout, so it only runs on Windows.
const windowsOnly = process.platform === "win32" ? false : "windows-only layout";

test("discover applies ignore and custom caches", { skip: windowsOnly }, async () => {
  const root = await tempDir();
  const home = path.join(root, "home");
  const local = path.join(home, "AppData", "Local");
  await fs.mkdir(path.join(local, "npm-cache", "_cacache"), { recursive: true });
  await fs.mkdir(path.join(home, ".m2", "repository"), { recursive: true });
  await fs.mkdir(path.join(home, ".cache", "bazel"), { recursive: true });

  const file = path.join(root, "config.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      ignore: ["maven"],
      extra: [{ name: "Bazel cache", path: path.join(home, ".cache", "bazel"), risk: "medium" }],
    }),
  );

  const env = fakeEnv(root, file);
  const ids = (await discover({ env })).map((c) => c.id).sort();
  assert.deepEqual(ids, ["bazel-cache", "npm"]);
  await fs.rm(root, { recursive: true, force: true });
});

test("configPath respects DEVCLEAN_CONFIG", () => {
  const env = fakeEnv("C:\\root", "C:\\tmp\\custom.json");
  assert.equal(configPath(env), "C:\\tmp\\custom.json");
});