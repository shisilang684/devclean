import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ADAPTERS } from "../dist/adapters.js";

const winEnv = {
  platform: "win32",
  home: "C:\\Users\\me",
  localAppData: "C:\\Users\\me\\AppData\\Local",
  appData: "C:\\Users\\me\\AppData\\Roaming",
  vars: {},
};

const darwinEnv = {
  platform: "darwin",
  home: "/Users/me",
  localAppData: "/Users/me/Library/Application Support",
  appData: "/Users/me/Library/Application Support",
  vars: {},
};

const linuxEnv = {
  platform: "linux",
  home: "/home/me",
  localAppData: "/home/me/.local/share",
  appData: "/home/me/.config",
  vars: {},
};

test("adapter ids are unique", () => {
  const ids = ADAPTERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 20);
});

test("every adapter has a name, note and valid risk", () => {
  for (const adapter of ADAPTERS) {
    assert.ok(adapter.name.length > 0, adapter.id + " name");
    assert.ok(adapter.note.length > 0, adapter.id + " note");
    assert.ok(["low", "medium", "high"].includes(adapter.risk), adapter.id + " risk");
  }
});

// The adapters build paths with the host path module, so a simulated Windows
// environment on a POSIX runner must still be judged with win32 semantics.
test("windows env produces absolute windows paths", () => {
  for (const adapter of ADAPTERS) {
    const paths = adapter.paths(winEnv);
    assert.ok(paths.length > 0, adapter.id + " paths");
    for (const p of paths) {
      assert.ok(path.win32.isAbsolute(p), adapter.id + " not absolute: " + p);
      assert.ok(!p.includes("undefined"), adapter.id + " has undefined: " + p);
    }
  }
});

test("posix envs produce absolute paths and never contain undefined", () => {
  for (const env of [darwinEnv, linuxEnv]) {
    for (const adapter of ADAPTERS) {
      const paths = adapter.paths(env);
      for (const p of paths) {
        assert.ok(path.posix.isAbsolute(p), adapter.id + " (" + env.platform + ") not absolute: " + p);
        assert.ok(!p.includes("undefined"), adapter.id + " has undefined: " + p);
      }
    }
  }
});

test("high risk adapters are exactly the local model runtimes", () => {
  const high = ADAPTERS.filter((a) => a.risk === "high").map((a) => a.id).sort();
  assert.deepEqual(high, ["lmstudio", "ollama"]);
});
