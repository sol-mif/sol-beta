// Cowork v3 (fr-30, gaps 5 and 6 of #574): sol/PROTOCOL.md names every team.v3.* request the engine answers and every
// work.v3.* answer it sends, in rounds 95 and 96; and specs/features.json has the cloud's index.ts (it wires the trail)
// among fr-30's paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SRC = join(ROOT, "sol", "engine", "src", "team");
const doc = readFileSync(join(ROOT, "sol", "PROTOCOL.md"), "utf8");
const v3 = doc.slice(doc.indexOf("# Round 95: Cowork v3"));

test("PROTOCOL.md has every team.v3.* the engine answers and every work.v3.* it sends", () => {
  const code = [join(SRC, "wire.ts"), ...readdirSync(join(SRC, "v3")).filter((f) => f.endsWith(".ts")).map((f) => join(SRC, "v3", f))].map((f) => readFileSync(f, "utf8")).join("\n");
  const names = [...new Set([...code.matchAll(/"((?:team|work)\.v3\.[a-z.]+)"/g)].map((m) => m[1]))].sort();
  assert.ok(names.length > 60, `${names.length} names`);
  // under a slice's heading its own names may be said short (`.thread`, `list`, `get | make`): then its group is named
  // in the round, and its last part stands as a word of its own
  const said = (n: string) => {
    if (v3.includes(n)) return true;
    const parts = n.split("."), group = parts.slice(0, 3).join("."), rest = parts.slice(3).join(".").replace(/\./g, "\\.");
    return (v3.includes(group) || v3.includes(`work.v3.${parts[2]}.*`)) && new RegExp(`[\`.\\s|(]${rest}[\`\\s{|,)]`).test(v3);
  };
  const missing = names.filter((n) => !said(n));
  assert.deepEqual(missing, []);
  assert.match(v3, /# Round 96: Cowork v3's rooms on the socket/);
});

test("fr-30's paths in specs/features.json have the cloud's index.ts", () => {
  const fs = JSON.parse(readFileSync(join(ROOT, "specs", "features.json"), "utf8"));
  const all = (Array.isArray(fs) ? fs : fs.features ?? Object.values(fs).flat()) as { id: string; paths: string[] }[];
  const f = all.find((x) => x.id === "fr-30");
  assert.ok(f, "fr-30 is there");
  assert.ok(f!.paths.includes("sol/cloud/src/index.ts"));
  assert.ok(f!.paths.includes("sol/cloud/src/trail.ts"));
});
