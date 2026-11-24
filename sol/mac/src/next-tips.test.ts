// The first-time tips (next/tips/tips.ts, BR1 #1615): each moment shows once, read the moment it shows, and no
// storage means no tip. Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tipAt, tipGone, tipNow, tipSub } from "./next/tips/tips-state.ts";

const fake = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
const put = (s: unknown) => Object.defineProperty(globalThis, "localStorage", { value: s, configurable: true, writable: true });

test("no storage, no tip", () => {
  put(undefined);
  assert.equal(tipAt("keep"), false);
  assert.equal(tipNow(), null);
});

test("each moment shows the first time only, and is read when it shows", () => {
  const s = fake(); put(s);
  let told = 0; const off = tipSub(() => { told++; });
  assert.equal(tipAt("keep"), true);
  assert.equal(tipNow(), "keep");
  assert.deepEqual(JSON.parse(s.m.get("sol.tips")!), ["keep"]);
  tipGone();
  assert.equal(tipNow(), null);
  assert.equal(tipAt("keep"), false, "a second Keep open shows nothing");
  assert.equal(tipNow(), null);
  assert.equal(tipAt("tab"), true);
  assert.equal(tipAt("esc"), true, "a new moment replaces the tip showing");
  assert.equal(tipNow(), "esc");
  assert.deepEqual(JSON.parse(s.m.get("sol.tips")!), ["keep", "tab", "esc"]);
  tipGone(); off();
  assert.equal(told, 5);
});

test("a broken store reads as nothing read", () => {
  const s = fake(); s.m.set("sol.tips", "{not json"); put(s);
  assert.equal(tipAt("tab"), true);
  tipGone();
  put(undefined);
});
