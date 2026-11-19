// node --test src/*.test.ts: Home and Build, one place (#1031): its switch is off by default and named `cross`; every CSS
// rule waits for it (or draws only what cross itself draws); its row is in Settings › me; and with it off, nothing new
// is wired: no row is liftable, the stage and the talk take nothing, the spine's waits stay empty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSwitch, readSwitch, type SwitchEnv } from "./flag.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const env = (o: Record<string, string> = {}): SwitchEnv => ({ storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => "", target: new EventTarget() });

test("cross is off by default, on by storage or the link", () => {
  assert.equal(buildSwitch("cross", env()).get(), false);
  assert.equal(buildSwitch("cross", env({ cross: "1" })).get(), true);
  assert.equal(readSwitch("cross", "?cross=on", null), true);
  assert.match(read("./cross/flag.ts"), /export const CROSS = "cross"/);
});

test("every rule of cross.css waits for the switch or the hand, or styles only what cross draws", () => {
  const css = read("./cross/cross.css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "").replace(/@media[^{]+\{/g, "");
  const sels = css.split("}").map((r) => r.split("{")[0].trim()).filter(Boolean).flatMap((r) => r.split(",").map((x) => x.trim()));
  const guarded = (s: string) => s.startsWith(':root[data-cross="on"]') || s.startsWith(":root[data-cross-hand]") || s.startsWith(".cross-") || /\[data-cross-hold\]/.test(s);
  assert.deepEqual(sels.filter((s) => !guarded(s)), []);
});

test("the switch has its row in Settings › me", () => {
  assert.match(read("./cross/CrossRow.tsx"), /sh\.sel !== "me"/);
  assert.match(read("./Settings.tsx"), /<CrossRow \/>/);
});

test("with the switch off nothing new is wired: drop targets and the layer all ask for it", () => {
  const stage = read("./stage/Stage.tsx"), home = read("./home/Home.tsx"), app = read("./App.tsx");
  assert.match(stage, /\.\.\.\(cross \? \{ "data-cross-drop": "stage" \}/);
  assert.match(home, /\.\.\.\(cross \? \{ "data-cross-drop": "talk" \}/);
  assert.match(app, /\{cross && <CrossLayer e=\{e\} \/>\}/);
  // the hand and the shelf refuse while it is off; the talk takes no piece
  assert.match(read("./cross/hand.ts"), /if \(!crossOn\(\) \|\| busy/);
  assert.match(read("./cross/shelf.ts"), /if \(!crossOn\(\) \|\|/);
  assert.match(read("./cross/store.ts"), /if \(!crossOn\(\) \|\| !state\.pieces\.length\) return \[\]/);
});
