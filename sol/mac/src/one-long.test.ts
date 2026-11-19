// node --test src/*.test.ts: the long project's face (#1002, one/long.ts, build.one.long): the dial snaps to three stops,
// a kind he must keep never reaches "you decide", and "since you were here" shows only after a real absence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LONG_FLAG, snap, stepDial, atOf, tookWords, whyOf, showSince, type KindView } from "./one/long.ts";
import { buildSwitch } from "./flag.ts";

const env = (kv: Record<string, string> = {}) => ({ search: () => "", storage: () => ({ getItem: (k: string) => kv[k] ?? null, setItem: () => {}, removeItem: () => {} }) as any });
test("build.one.long is its own switch, off by default", () => {
  assert.equal(LONG_FLAG, "build.one.long");
  assert.equal(buildSwitch(LONG_FLAG, env()).get(), false);
});
test("the dial snaps to three stops; a go, the goal, how it looks never reach 'you decide'", () => {
  assert.equal(snap(0.1, true), "early"); assert.equal(snap(0.6, true), "ask"); assert.equal(snap(0.9, true), "decide");
  assert.equal(snap(1.4, true), "decide"); assert.equal(snap(0.95, false), "ask");
  assert.equal(stepDial("ask", 1, true), "decide"); assert.equal(stepDial("ask", 1, false), "ask"); assert.equal(stepDial("early", -1, true), "early");
  assert.equal(atOf("decide"), 1);
});
test("how long he took, and why the dial sits there", () => {
  assert.equal(tookWords(12_000), "12 s"); assert.equal(tookWords(3 * 3_600_000), "3 h"); assert.equal(tookWords(2 * 86_400_000), "2 d");
  const k = (o: Partial<KindView>): KindView => ({ kind: "a file change", mode: "ask", dial: "auto", lean: 0.5, decidable: true, decided: 0, answers: [], ...o });
  const yes = { at: 0, agreed: true, took: 1, title: "x" }, no = { ...yes, agreed: false };
  assert.equal(whyOf(k({ mode: "decide", answers: [yes, yes, yes, yes, yes, yes], decided: 2 })), "you agreed 5 times running · I decided 2");
  assert.equal(whyOf(k({ mode: "early", answers: [no, yes, no] })), "your answer changed it 2 times");
  assert.equal(whyOf(k({ dial: "ask" })), "you set it");
});
test("since you were here: only after a day away, or 8 hours with something moved", () => {
  const now = 10 * 86_400_000, g = [{ goal: "g", waits: [], moved: [], count: 1 }];
  assert.equal(showSince({ from: now - 2 * 86_400_000, days: 2, decided: 0, goals: [] }, now), true);
  assert.equal(showSince({ from: now - 9 * 3_600_000, days: 0, decided: 0, goals: g }, now), true);
  assert.equal(showSince({ from: now - 3_600_000, days: 0, decided: 0, goals: g }, now), false);
  assert.equal(showSince({ from: 0, days: 0, decided: 0, goals: g }, now), false, "never here before: nothing to say since");
});
