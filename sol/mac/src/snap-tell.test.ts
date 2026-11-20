// node --test src/snap-tell.test.ts: the window says its build.snap to the engine (#1701, snap/tell.ts): once at once,
// then only when the switch turns, so turning it off in Settings stops the morning clock right away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tellSnap, snapSwitchMsg } from "./snap/tell.ts";

test("said at once, then at each turn, never twice the same", () => {
  let on = true;
  const subs = new Set<() => void>(), sent: object[] = [];
  const turn = (v: boolean) => { on = v; subs.forEach((f) => f()); };
  const stop = tellSnap((m) => sent.push(m), () => on, (f) => { subs.add(f); return () => { subs.delete(f); }; });
  assert.deepEqual(sent, [{ type: "work.snap.switch", on: true }]);
  turn(false); turn(false); turn(true);
  assert.deepEqual(sent.slice(1), [snapSwitchMsg(false), snapSwitchMsg(true)]);
  stop(); turn(false);
  assert.equal(sent.length, 3, "stopped: nothing more is said");
});
