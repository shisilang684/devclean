import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ADAPTERS } from "../dist/adapters.js";

const env = {
  platform: "win32",
  home: "C:\\Users\\me",
  localAppData: "C:\\Users\\me\\AppData\\Local",
  appData: "C:\\Users\\me\\AppData\\Roaming",
  vars: {},
};

test("adapter ids are unique", () => {
  const ids = ADAPTERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 20);
});

test("every adapter has a name, note, valid risk and absolute paths", () => {
  for (const adapter of ADAPTERS) {
    assert.ok(adapter.name.length > 0, adapter.id + " name");
    assert.ok(adapter.note.length > 0, adapter.id + " note");
    assert.ok(["low", "medium", "high"].includes(adapter.risk), adapter.id + " risk");
    const paths = adapter.paths(env);
    assert.ok(paths.length > 0, adapter.id + " paths");
    for (const p of paths) {
      assert.ok(path.isAbsolute(p), adapter.id + " path not absolute: " + p);
      assert.ok(!p.includes("undefined"), adapter.id + " path has undefined: " + p);
    }
  }
});

test("high risk adapters are exactly the local model runtimes", () => {
  const high = ADAPTERS.filter((a) => a.risk === "high").map((a) => a.id).sort();
  assert.deepEqual(high, ["lmstudio", "ollama"]);
});
