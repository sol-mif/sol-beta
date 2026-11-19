// node --test src/*.test.ts: the press shown first (#917) is behind `work.press` (#1272): off for everyone unless the
// link or this window's storage turns it on, and never on by itself where this Sol runs as concept (MINE_ON).
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORK_PRESS, makePressSwitch } from "./work/press.ts";
import { MINE_ON } from "./flag.ts";

const env = (search = "", kv: Record<string, string> = {}) => ({ storage: () => ({ getItem: (k: string) => kv[k] ?? null, setItem: (k: string, v: string) => { kv[k] = v; } }), search: () => search, target: null });

test("work.press is off by default and turned on by the link or storage", () => {
  assert.equal(makePressSwitch(env()).get(), false);
  assert.equal(makePressSwitch(env("?work.press=on")).get(), true);
  assert.equal(makePressSwitch(env("", { [WORK_PRESS]: "1" })).get(), true);
  assert.equal(makePressSwitch(env("?work.press=off", { [WORK_PRESS]: "1" })).get(), false);
});

test("work.press is not among the switches a marked window reads on untouched", () => {
  assert.equal(MINE_ON.has(WORK_PRESS), false);
});
