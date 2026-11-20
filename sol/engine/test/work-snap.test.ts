// Pieces that snap (#1024, build.snap): the table is kept across a restart; a built row is a real instruction, run
// piece by piece on the engine's events (a session's turn ending), never on a timer; a check's RED goes to the job after
// it; your hand stops the row until the person's go; a row's runs are counted (its wear); a morning row runs once a day.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-snap-"));
process.env.SOL_STATE = join(dir, "work.json");
const snap = await import("../src/work/snap.ts");

let said: { to: string; text: string; fresh?: string }[] = [], told: any[] = [], allowed: boolean[] = [];
const words = new Map<string, string>();
const known = new Set(["s-job", "s-fix"]);
let n = 0;
const wire = () => snap.setSnapDeps({
  say: async (to, text, fresh) => { said.push({ to, text, ...(fresh ? { fresh: fresh.cwd } : {}) }); },
  exists: async (id) => known.has(id),
  lastWords: async (id) => words.get(id) ?? "",
  perm: () => ({ answer: (a) => { allowed.push(a); } }),
  tell: (m) => told.push(m),
  one: () => "the-one",
  newId: () => `new-${++n}`,
});
/** what was said to sessions, without the one session being told a row was built */
const sw = () => said.filter((x) => !/a row was built/.test(x.text));
const flush = () => new Promise((r) => setTimeout(r, 20));
const B = (id: string, kind: any, label: string, ref = label) => ({ id, kind, label, ref });
const row = (bricks: any[], id = "row") => snap.putTable([{ id, x: 10, y: 20, bricks }]);
const ends = async (sid: string, w = "done") => { words.set(sid, w); snap.hears({ type: "work.run", sessionId: sid, ended: true }); await flush(); };

beforeEach(() => { said = []; told = []; allowed = []; words.clear(); n = 0; snap._reload(); wire(); snap.putTable([]); });

test("the table is kept: put, then read again after the engine restarts; what is not a piece is left out", () => {
  snap.putTable([{ id: "a", x: 12.4, y: 30, bricks: [B("t", "when", "now"), { id: "x", kind: "rocket", label: "no", ref: "no" }, B("f", "source", "sol-dev", "/x/sol-dev")] }, { id: "empty", bricks: [] }]);
  snap._reload(); wire();
  const s = snap.sections();
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].bricks.map((b) => b.kind), ["when", "source"]);
  assert.equal(s[0].x, 12);
  assert.ok(JSON.parse(readFileSync(join(dir, "snap.json"), "utf8")).sections.length === 1);
});

test("a pressed row is said to its sessions one at a time, each moving on only when the last one's turn ends", async () => {
  row([B("t", "when", "now"), B("f", "source", "play", "/p/play"), B("j", "job", "make the greeting friendlier", "s-job"), B("c", "check", "the tests", "tests")]);
  const r = await snap.runSection("row");
  assert.equal(sw().length, 1, "only the job is said; nothing else yet");
  assert.equal(sw()[0].to, "s-job");
  assert.match(sw()[0].text, /step 3 of 4/);
  assert.match(sw()[0].text, /Work in \/p\/play/);
  assert.deepEqual(r.states, { t: "done", f: "done", j: "live", c: "wait" });
  await flush();
  assert.equal(sw().length, 1, "no timer moves it on");
  await ends("s-job", "Made it warmer.");
  assert.equal(sw().length, 2);
  assert.equal(sw()[1].to, "s-job", "the tests run in the job's own session");
  assert.match(sw()[1].text, /GREEN/);
  assert.equal(r.states.c, "live");
  await ends("s-job", "All 3 pass.\nGREEN");
  assert.equal(r.result, "done");
  assert.equal(snap.sections()[0].runs, 1, "a run is counted: the row's wear");
  assert.ok(told.some((m) => m.type === "work.snap.run" && m.run.ended));
  assert.ok(said.some((s) => s.to === "the-one" && /a built row ran/.test(s.text)), "the one session hears that its row ran");
});

test("a check's RED goes to the job after it, as what to fix; with nothing after it the row ends red", async () => {
  row([B("j", "job", "make it", "s-job"), B("c", "check", "a second read", "read"), B("j2", "job", "fix it", "s-fix")]);
  const r = await snap.runSection("row");
  await ends("s-job");
  assert.equal(sw()[1].to, "new-1", "a second read is a fresh session");
  assert.equal(sw()[1].fresh, process.cwd());
  await ends("new-1", "The name is wrong.\nRED");
  assert.equal(r.states.c, "red");
  assert.equal(sw()[2].to, "s-fix");
  assert.match(sw()[2].text, /fix it first:\nThe name is wrong/);
  await ends("s-fix");
  assert.equal(r.result, "red", "a row that saw red says so, even fixed after");
  row([B("j", "job", "make it", "s-job"), B("c", "check", "the tests", "tests")], "row2");
  const r2 = await snap.runSection("row2");
  await ends("s-job"); await ends("s-job", "1 failed\nRED");
  assert.equal(r2.result, "red");
});

test("your hand stops the row and asks; go goes on, stop ends it; asks are counted on the row", async () => {
  row([B("j", "job", "merge it", "s-job"), { ...B("h", "hand", "your hand", "hand"), hand: "proposed", why: "a merge: yours to say yes" }, B("j2", "job", "fix it", "s-fix")]);
  const r = await snap.runSection("row");
  await ends("s-job");
  assert.equal(r.states.h, "ask");
  assert.equal(sw().length, 1, "nothing goes past the hand");
  assert.equal(snap.sections()[0].asked, 1);
  await snap.hand(r.id, "h", true);
  assert.equal(r.states.h, "done");
  assert.equal(sw()[1].to, "s-fix");
  const r2 = await snap.runSection("row").catch((e) => e);
  assert.equal(r2.id, r.id, "pressed again while it runs: the same run");
  await ends("s-fix");
  const r3 = await snap.runSection("row");
  await ends("s-job");
  await snap.hand(r3.id, "h", false);
  assert.equal(r3.result, "stopped");
  assert.equal(r3.states.j2, "skip");
  assert.equal(snap.sections()[0].runs, 1, "a stopped run is not worn in");
});

test("a job waiting on an allow lifts as asking; the person's answer goes to its permission", async () => {
  row([B("t", "when", "now"), B("j", "job", "run it", "s-job")]);
  const r = await snap.runSection("row");
  snap.hears({ type: "work.run", sessionId: "s-job", waiting: 1 });
  assert.equal(r.states.j, "ask");
  await snap.hand(r.id, "j", true);
  assert.deepEqual(allowed, [true]);
  assert.equal(r.states.j, "live");
});

test("a turn that failed is never done: the row stops there, red, and the rest is let go", async () => {
  row([B("j", "job", "make it", "s-job"), B("c", "check", "the tests", "tests")]);
  const r = await snap.runSection("row");
  words.set("s-job", "Failed to authenticate");
  snap.hears({ type: "work.run", sessionId: "s-job", ended: true, failed: true }); await flush();
  assert.equal(r.states.j, "red");
  assert.equal(r.states.c, "skip");
  assert.equal(r.result, "red");
  assert.match(r.lines.join("\n"), /its turn failed: Failed to authenticate/);
  assert.equal(sw().filter((s) => s.to === "s-job").length, 1, "the tests were never asked");
  // a turn that ends on a sign-in error is failed too, whatever its flag says
  row([B("j", "job", "make it", "s-job"), B("c", "check", "the tests", "tests")], "row3");
  const r3 = await snap.runSection("row3");
  await ends("s-job", "Failed to authenticate: OAuth session expired and could not be refreshed");
  assert.equal(r3.states.j, "red");
  // a check that gives no verdict is not a pass
  row([B("j", "job", "make it", "s-job"), B("c", "check", "the tests", "tests")], "row4");
  const r4 = await snap.runSection("row4");
  await ends("s-job"); await ends("s-job", "I ran them.");
  assert.equal(r4.states.c, "red");
  assert.equal(r4.result, "red");
});

test("one piece alone does not run; a run cut by a restart says it stopped", async () => {
  row([B("t", "when", "now")]);
  await assert.rejects(snap.runSection("row"), /one piece alone/);
  row([B("t", "when", "now"), B("j", "job", "x", "s-job")]);
  await snap.runSection("row");
  snap._reload(); wire();
  const last = snap.runOf("row")!;
  assert.equal(last.result, "stopped");
  assert.equal(last.states.j, "skip");
});

test("a morning row is due once a day from nine", () => {
  const s = { id: "m", x: 0, y: 0, bricks: [B("t", "when", "each morning", "morning"), B("j", "job", "x", "s-job")] } as any;
  assert.equal(snap.dueToday(s, new Date(2026, 10, 11, 8, 59)), false);
  assert.equal(snap.dueToday(s, new Date(2026, 10, 11, 9, 1)), true);
  assert.equal(snap.dueToday({ ...s, ranAt: new Date(2026, 10, 11, 9, 2).getTime() }, new Date(2026, 10, 11, 15)), false);
  assert.equal(snap.dueToday({ ...s, ranAt: new Date(2026, 10, 10, 9, 2).getTime() }, new Date(2026, 10, 11, 9, 30)), true);
  assert.equal(snap.dueToday({ ...s, bricks: [B("t", "when", "now"), s.bricks[1]] }, new Date(2026, 10, 11, 10)), false);
});

test("a verdict is read from the last word", () => {
  assert.equal(snap.verdict("all good\nGREEN"), "green");
  assert.equal(snap.verdict("two fail\n**RED**"), "red");
  assert.equal(snap.verdict("nothing said"), null);
});

test("the one session puts the person's hand where it matters, six words why; never next to a hand, never where they freed it", () => {
  const s = { id: "r", x: 0, y: 0, bricks: [B("t", "when", "now"), B("j", "job", "merge the branch", "s-job"), B("c", "check", "the tests", "tests")], free: [] as string[] } as any;
  const r = snap.handAt(s, 1, "a merge is yours to say, always", "h1") as any;
  assert.deepEqual(r.bricks.map((b: any) => b.kind), ["when", "job", "hand", "check"]);
  assert.equal(r.bricks[2].why, "a merge is yours to say,", "six words at most");
  assert.equal(r.bricks[2].hand, "proposed");
  assert.match(String(snap.handAt(r, 1, "x")), /already there/);
  assert.match(String(snap.handAt({ ...s, free: ["j"] }, 1, "x")), /took your hand out/);
  assert.match(String(snap.handAt(s, 9, "x")), /no piece/);
});

test("a row newly built with a job is told to the one session once", async () => {
  said = [];
  row([B("t", "when", "now"), B("f", "source", "play", "/p"), B("j", "job", "make it", "s-job")], "told-row");
  await flush();
  assert.equal(said.filter((x) => x.to === "the-one" && /a row was built/.test(x.text)).length, 1);
  row([B("t", "when", "now"), B("f", "source", "play", "/p"), B("j", "job", "make it", "s-job")], "told-row");
  await flush();
  assert.equal(said.filter((x) => x.to === "the-one" && /a row was built/.test(x.text)).length, 1, "not twice");
  assert.match(snap.rowsText(), /told-row \(ran 0×, asked 0×\):\n  0\. when: now/);
});

test("the morning clock follows build.snap: off stops it at once and is kept across a restart; on starts it again (#1679)", () => {
  process.env.SOL_VERSION = "product";   // a tester's Sol: build.snap's station (concept) stands off there
  try {
    snap._reload();
    snap.startClock(60_000);
    assert.equal(snap.clockRunning(), false, "off by its station, nothing said: no clock");
    snap.startClock(60_000, true);
    assert.equal(snap.clockRunning(), true, "the bench was opened (the window's switch on) by a window that says nothing more: as before");
    snap.setSnapOn(false);
    assert.equal(snap.clockRunning(), false, "off stops it at once");
    snap.startClock(60_000, true);
    assert.equal(snap.clockRunning(), false, "once the window said off, opening never starts it");
    snap._reload();
    assert.equal(snap.snapOn(), false, "the word is kept across a restart");
    snap.setSnapOn(true);
    assert.equal(snap.clockRunning(), true, "on starts it again");
    snap._reload();
    snap.startClock(60_000);
    assert.equal(snap.clockRunning(), true, "kept on across a restart");
  } finally { snap.stopClock(); delete process.env.SOL_VERSION; }
});
