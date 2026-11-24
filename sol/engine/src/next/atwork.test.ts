// See what's at work (BR1 item 7): Pause everything and Go on (atwork.ts), against a temp SOL_HOME with fake runs, so
// no session starts. Invented: Rosa's two automations and three sessions.
// Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-atwork-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const A = await import("./automations.js");
const W = await import("./atwork.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };

/** a run as hold() sees it: working or not, held or not */
const run = (id: string, working: boolean) => {
  const r = { id, working, paused: false, hold(on: boolean) { r.paused = on; } };
  return r;
};

function rosa() {
  const h = home();
  const sum = A.make(h, { does: "Sum up the night's changes", when: "every day at 09:00" });
  const sort = A.make(h, { does: "Sort the new scans", when: "every day at 18:00" });
  assert.ok(sum.ok && sort.ok);
  A.set(h, { id: sum.auto.id, on: true });     // made paused (Add's "Make it, paused"), then turned on
  A.set(h, { id: sort.auto.id, on: false });   // paused by hand before
  const runs = new Map([["s-fix", run("s-fix", true)], ["s-docs", run("s-docs", true)], ["s-old", run("s-old", false)]]);
  return { h, sum: sum.auto.id, sort: sort.auto.id, runs, of: (id: string) => runs.get(id) };
}

test("Pause everything holds what was shown and running: working sessions, automations that were on", () => {
  const r = rosa();
  const got = W.holdAll(r.h, { sessions: ["s-fix", "s-old"], autos: [r.sum, r.sort] }, r.of, 1000);
  assert.ok(got.ok);
  assert.deepEqual(got.held, { at: 1000, folder: null, sessions: ["s-fix"], autos: [r.sum] }, "a quiet session and an automation already off are not held");
  assert.equal(r.runs.get("s-fix")!.paused, true);
  assert.equal(r.runs.get("s-docs")!.paused, false, "not shown: not held");
  assert.equal(A.readAutos(r.h).find((a) => a.id === r.sum)!.on, false);
  assert.deepEqual(W.atworkMsg(r.h, [...r.runs.values()]), { type: "next.atwork", held: got.held, paused: ["s-fix"] });
});

test("Go on lets go only what the hold kept: the automation paused by hand stays paused", () => {
  const r = rosa();
  W.holdAll(r.h, { folder: "w:/code/site", sessions: ["s-fix"], autos: [r.sum, r.sort] }, r.of);
  assert.deepEqual(W.goAll(r.h, r.of), { sessions: 1, autos: 1 });
  assert.equal(r.runs.get("s-fix")!.paused, false);
  const on = Object.fromEntries(A.readAutos(r.h).map((a) => [a.id, a.on]));
  assert.equal(on[r.sum], true);
  assert.equal(on[r.sort], false, "paused by hand before the hold");
  assert.equal(W.readHeld(r.h), null);
});

test("nothing running or due: nothing held, said in words; a second folder's hold reads as everything's", () => {
  const r = rosa();
  const none = W.holdAll(r.h, { sessions: ["s-old"], autos: [r.sort] }, r.of);
  assert.equal(none.ok, false);
  assert.equal(W.readHeld(r.h), null);
  W.holdAll(r.h, { folder: "w:/code/site", sessions: ["s-fix"] }, r.of);
  const two = W.holdAll(r.h, { folder: "h:garden", sessions: ["s-docs"] }, r.of);
  assert.ok(two.ok);
  assert.equal(two.held.folder, null);
  assert.deepEqual(two.held.sessions, ["s-fix", "s-docs"]);
});
