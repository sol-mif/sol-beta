// node --test src/*.test.ts: show, don't say (#1020): its switch is off by default, named look.shown, and turned on the
// flag.ts ways (storage "1", the page's link, another window's change); the CSS waits for data-shown="on" on <html>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSwitch, readSwitch, type SwitchEnv } from "./flag.ts";

const LOOK_SHOWN = "look.shown";
function env(o: Record<string, string> = {}, search = "") {
  const target = new EventTarget();
  const e: SwitchEnv = { storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => search, target };
  return { e, o, fire: (key: string | null) => target.dispatchEvent(Object.assign(new Event("storage"), { key })) };
}

test("look.shown is off by default", () => {
  assert.equal(buildSwitch(LOOK_SHOWN, env().e).get(), false);
  assert.match(readFileSync(new URL("./shown/flag.ts", import.meta.url), "utf8"), /export const LOOK_SHOWN = "look\.shown"/);
});

test("on by storage, by the link, and by another window's change; the link wins for one load", () => {
  assert.equal(buildSwitch(LOOK_SHOWN, env({ [LOOK_SHOWN]: "1" }).e).get(), true);
  assert.equal(readSwitch(LOOK_SHOWN, "?look.shown=on", null), true);
  assert.equal(readSwitch(LOOK_SHOWN, "?look.shown=off", { getItem: () => "1" }), false);
  const w = env(), s = buildSwitch(LOOK_SHOWN, w.e);
  w.o[LOOK_SHOWN] = "1"; w.fire(LOOK_SHOWN);
  assert.equal(s.get(), true);
});

test("every rule of shown.css waits for the switch, so with it off nothing on screen changes", () => {
  const css = readFileSync(new URL("./shown/shown.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
  // a .sh- class is drawn only when the switch is on (the mode's mark, the bubbles, the maps), so it needs no guard
  const loose = rules.flatMap((r) => r.split(",").map((x) => x.trim())).filter((sel) => !sel.startsWith(':root[data-shown="on"]') && !sel.startsWith(".sh-"));
  assert.deepEqual(loose, []);
});

test("a word taken off the screen stays for a screen reader: folded by clipping, never display:none", () => {
  const css = readFileSync(new URL("./shown/shown.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /display:\s*none/);
});

test("the switch has its row in Settings › look", () => {
  const row = readFileSync(new URL("./shown/ShownRow.tsx", import.meta.url), "utf8"), settings = readFileSync(new URL("./Settings.tsx", import.meta.url), "utf8");
  assert.match(row, /sh\.sel !== "look"/);
  assert.match(settings, /<ShownRow \/>/);
});

test("the dial moves look.shown by degrees: words (off), marks, pictures; and the middle stop writes the lines again", async () => {
  const f = await import("./shown/flag.ts");
  assert.equal(f.degree(), 0);   // off by default: words
  f.setDegree(1); assert.equal(f.degree(), 1); assert.equal(f.shown(), true);
  f.setDegree(2); assert.equal(f.degree(), 2);
  f.setDegree(0); assert.equal(f.degree(), 0); assert.equal(f.shown(), false);
  f.setDegree(1); f.setDegree(0); f.setDegree(1); assert.equal(f.degree(), 1);   // back on, the step it was left at
  f.setDegree(0);
  const css = readFileSync(new URL("./shown/shown.css", import.meta.url), "utf8");
  assert.match(css, /\[data-shown-deg="1"\] \.settings-shell \.lab small/);
});
