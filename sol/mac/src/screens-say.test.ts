// Say where in the box (#1090): read on this machine; the named block and screen, else nothing
import { test } from "node:test";
import assert from "node:assert/strict";
import { saidWhere } from "./screens/say.ts";
import { NONE, type ScreensState } from "./screens/model.ts";

const s: ScreensState = { ...NONE, windows: [{ win: "main", role: "whole", live: true, at: 0, screen: { x: 0, y: 0, w: 1512, h: 982 } }, { win: "two", role: "wall", live: true, at: 0, screen: { x: 1512, y: 0, w: 2560, h: 1440 } }] };
const even: ScreensState = { ...s, windows: s.windows.map((w) => ({ ...w, screen: { x: 0, y: 0, w: 1280, h: 800 } })) };
const blocks = [{ id: "p1", title: "the plan" }, { id: "d1", title: "changes · 2 files" }, { id: "n1", title: "review notes" }];
const at = (where: Record<string, string> = {}) => (id: string) => where[id] ?? "main";
const go = (t: string, st = s, where: Record<string, string> = {}) => { const r = saidWhere(t, blocks, st, "main", at(where)); return r ? `${r.block}>${r.to}` : "none"; };

test("a short line naming a block and a screen moves it; anything else is talk for the session", () => {
  assert.equal(go("the plan to the big one"), "p1>two");
  assert.equal(go("changes over there", even), "d1>two");
  assert.equal(go("review notes back here", s, { n1: "two" }), "n1>main");
  assert.equal(go("rename the helper"), "none");
  assert.equal(go("what does the plan say"), "none");
  assert.equal(go("bring it all back here"), "none");
  assert.equal(go("the plan to the big one", s, { p1: "two" }), "none");
  assert.equal(go("please look at the plan on the monitor and tell me what you think"), "none");
  assert.equal(saidWhere("the plan to the big one", blocks, { ...s, windows: [s.windows[0]] }, "main", at()), null);
});
