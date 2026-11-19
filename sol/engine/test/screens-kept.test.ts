import { test } from "node:test";
import assert from "node:assert/strict";
import { ScreensBook } from "../src/screens.js";
import { keptAnswer, winName } from "../src/screensKeptPlan.js";

const live = [{ win: "main", role: "whole" as const, live: true, at: 0, screen: { x: 0, y: 0, w: 1512, h: 982 } }, { win: "two", role: "wall" as const, live: true, at: 0, screen: { x: 1512, y: 0, w: 2560, h: 1440 } }];
const body = (k: unknown) => k;
const asked: unknown[] = [];
const ask = (pick: string) => async (b: unknown) => { asked.push(b); return { pick }; };
const read = (a: any) => a?.pick;

test("as you left it: keep records each kind of block on the window it lives on, and the session", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("d1", "two");
  const k = b.keep("proj", ["d1", "p1"], 1000, { kinds: { d1: "diff", p1: "page", x: "NOT A KIND" }, session: "s1" });
  assert.deepEqual(k.kinds, { diff: "two", page: "main" });
  assert.equal(k.session, "s1");
  assert.equal(k.talk, "main");
});

test("as you left it: the same session asks nothing; another one asks once, act gives the live kinds, ghost the offer", async () => {
  const k = { roles: {}, where: {}, at: 0, kinds: { diff: "two", page: "main", plan: "gone" }, session: "s1" };
  asked.length = 0;
  assert.equal(await keptAnswer(k, "s1", live, ask("act"), body, read, (w) => winName(live, w)), null);
  assert.equal(asked.length, 0);
  assert.deepEqual(await keptAnswer(k, "s2", live, ask("act"), body, read, (w) => winName(live, w)), { pick: "act", kinds: { diff: "two", page: "main" } });
  assert.equal(asked.length, 1);
  assert.deepEqual((asked[0] as any).kinds, { diff: "monitor", page: "laptop", plan: "window that is gone" });
  assert.deepEqual(await keptAnswer(k, "s2", live, ask("ghost"), body, read, (w) => w), { pick: "ghost" });
  assert.equal(await keptAnswer(k, "s2", live, ask("none"), body, read, (w) => w), null);
  assert.equal(await keptAnswer({ ...k, kinds: {} }, "s2", live, ask("act"), body, read, (w) => w), null);
});
