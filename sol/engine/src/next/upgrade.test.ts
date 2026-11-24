// A frozen BR1 home read by this engine (BR1, #1615): every later engine runs this against src/next/fixtures/br1-home/, which
// is what a person on BR1 has on their disk after moving in and a session of presses (fixtures/make-br1-home.ts made it with
// BR1's own writers; nine of its seventeen stores have their version taken out, for the ones written before versions). It
// holds when a person on BR1 takes an update and keeps their data: every store reads with the same counts and values, none
// is set aside, an unversioned store is v1, and one write through each writer stamps the version and changes nothing else.
// A newer engine that changes a store's shape must read the old shape here (a version above 1 migrates it), never fail.
// Invented people only. Signed: marcocyl04-ux's agent (versions helper).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, versionOf, writeJson } from "./file.js";
import { readFolderSessions, moveSession, foldersMsg } from "./folders.js";
import { readMoveIn, setLead, keptFolders } from "./movein.js";
import { setupsOf, sortingFolders, dropLine } from "./setup.js";
import { knownNow, noteFix, readStore as readKnown } from "./you-known.js";
import { contextOf, addFact } from "./context.js";
import { lookOf, pressPart } from "./look.js";
import { readPos, setPos } from "./pos.js";
import { readTabs, openTab } from "./tabs.js";
import { readRaises, judge as raiseJudge } from "./raise.js";
import { readNotes, write as writeNote } from "./notes.js";
import { readPause, pauseDiary } from "./diary.js";
import { readBack, goBack } from "./seats.js";
import { weighed, considered } from "./tidy.js";
import { readAutos, make as makeAuto } from "./automations.js";
import { readPlans, propose as proposePlan } from "./plans.js";
import { claudeReadings, notedClaude } from "./pace.js";
import { readEvents as readFits, personSet } from "./fits.js";
import { goAll } from "./atwork.js";
import { NOW } from "./fixtures/make-br1-home.js";
import { recordHomeOf, type Where } from "./you.js";

const golden = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "br1-home");
const roots: string[] = [];
after(() => { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); });
/** the golden home copied to its own SOL_HOME: a test never writes in the fixture */
const homeCopy = () => { const d = fs.mkdtempSync(join(tmpdir(), "sol-upgrade-")); roots.push(d); fs.cpSync(golden, d, { recursive: true }); return d; };
const files = (home: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : out.push(join(d, e.name).slice(home.length + 1)); };
  walk(home);
  return out.sort();
};
const json = (home: string, rel: string): Record<string, unknown> => JSON.parse(fs.readFileSync(join(home, rel), "utf8"));
/** a store without its version: what "nothing else changed" compares */
const bare = (o: Record<string, unknown>) => { const { v: _v, ...rest } = o; return rest; };
const whereOf = (sol: string): Where => ({ sol, user: sol, rec: recordHomeOf(sol, sol) });
const STUDIO = "w:/Users/someone/studio/site", MENUS = "w:/Users/someone/studio/menus", JOURNAL = "w:/Users/someone/calm/journal", GARDEN = "w:/Users/someone/calm/garden";

// the nine stores BR1's first builds wrote without a version (the golden has them without one), and the eight with
const UNVERSIONED = ["automations", "back", "diary/pause", "drafts", "folders", "looks", "pace/claude", "plans", "pos"];
const VERSIONED = ["context", "fits", "known", "movein", "raises", "setups", "tabs", "tidy"];

test("the golden home is what it says: seventeen stores, nine without a version, no path of a real person", () => {
  const home = homeCopy();
  assert.deepEqual(files(home), [...UNVERSIONED, ...VERSIONED].map((s) => `next/${s}.json`).sort());
  for (const s of UNVERSIONED) assert.equal("v" in json(home, `next/${s}.json`), false, `${s} has no version in the golden`);
  for (const s of VERSIONED) assert.equal(json(home, `next/${s}.json`).v, 1, `${s} is v1 in the golden`);
  for (const f of files(home)) assert.doesNotMatch(fs.readFileSync(join(home, f), "utf8"), /\/Users\/(?!someone)|\/home\/|@[\w-]+\.\w+/, `${f} holds a real path or an address`);
});

test("every store reads as it was written: the same counts and values, none set aside, an unversioned one is v1", () => {
  const sol = homeCopy(), before = files(sol), w = whereOf(sol);
  for (const f of before) {
    const r = readJson(join(sol, f));
    assert.equal(r.aside, undefined, `${f} was set aside`);
    assert.equal(versionOf(r.data), 1, `${f} reads as v1`);
  }
  // folders (folders.json: a session kept in a folder)
  const kept = Object.values(readFolderSessions(sol));
  assert.equal(kept.length, 1);
  assert.deepEqual({ folder: kept[0].folder, title: kept[0].title, at: kept[0].at, working: kept[0].working }, { folder: STUDIO, title: "Fix the lunch menu on the site", at: NOW + 10, working: true });
  assert.equal(Object.keys(foldersMsg(sol).sessions).length, 1);
  // move-in
  const m = readMoveIn(sol)!;
  assert.deepEqual([m.v, m.keep, m.drop, m.lead], [1, [STUDIO, MENUS, JOURNAL, GARDEN], [], "both"]);
  assert.equal(keptFolders(m).length, 4);
  assert.deepEqual(Object.keys(weighed(sol)!), [STUDIO, MENUS, JOURNAL, GARDEN]);
  // setups (every folder set up; the journal's was kept by the person; one line dropped in the studio)
  assert.deepEqual(sortingFolders(sol), [STUDIO, MENUS, JOURNAL, GARDEN]);
  const sets = setupsOf(sol), by = (f: string) => sets.find((s) => s.folder === f)!;
  assert.equal(sets.length, 4);
  assert.equal(by(JOURNAL).set?.by, "person");
  assert.equal(by(STUDIO).set?.by, "sol");
  assert.equal(by(JOURNAL).look, "paper", "the person's look for the journal");
  assert.equal(by(STUDIO).look, "workbench");
  assert.equal(by(STUDIO).read.lines.some((l) => l.key === "looks"), false, "the dropped line stays dropped");
  // known(): the facts and the corrections (a forget and its back are two lines)
  const k = readKnown(sol);
  assert.deepEqual([k.fixes.length, k.placed.length, k.changes.length, k.done.length], [5, 3, 6, 1]);
  assert.deepEqual(k.fixes.slice(0, 2).map((f) => f.how), ["hide", "show"]);
  assert.equal(k.fixes[0].reason, k.fixes[1].reason);
  const lines = knownNow(w, {}, NOW + 100).facts;
  assert.equal(lines.filter((f) => f.k.startsWith("fix:")).length, 5);
  const ctx = contextOf(sol, STUDIO);
  assert.equal(ctx.ok && ctx.facts.map((f) => f.fact).join("|"), "Prices are in euros");
  assert.equal((contextOf(sol, JOURNAL) as { facts: unknown[] }).facts.length, 1);
  // looks
  assert.deepEqual(lookOf(sol, STUDIO, NOW).order.slice(0, 3), ["changed", "coming", "working"]);
  assert.deepEqual((json(sol, "next/looks.json") as { presses: unknown }).presses, { [STUDIO]: { changed: 2, coming: 1 } });
  // positions
  const pos = readPos(sol).pos;
  assert.deepEqual(Object.keys(pos), [STUDIO, JOURNAL]);
  assert.deepEqual([pos[STUDIO].x, pos[STUDIO].y, pos[STUDIO].w, pos[STUDIO].h, pos[STUDIO].by], [120, 80, 320, 200, "person"]);
  // tabs
  const t = readTabs(sol);
  assert.deepEqual([t.tabs.map((x) => x.id), t.front, t.taken.note?.n], [["s-note-1", "s-doc-2"], "s-note-1", 1]);
  // a raise answered
  const r = readRaises(sol);
  assert.deepEqual(Object.keys(r.judged), ["a1"]);
  assert.deepEqual([r.judged.a1.care.level, r.judged.a1.judged], [2, true]);
  // the rest
  assert.deepEqual(readNotes(sol).map((n) => [n.id, n.text, n.folder]), [["n-1", "ring the florist", JOURNAL]]);
  assert.deepEqual([readAutos(sol).length, readAutos(sol)[0].name], [1, "Weekly menu"]);
  assert.deepEqual([readPlans(sol).length, readPlans(sol)[0].steps.length], [1, 2]);
  assert.deepEqual(claudeReadings(sol).map((x) => [x.window, x.used]), [["five_hour", 40]]);
  assert.equal(readFits(sol).length, 9, "the fits the move-in and the press wrote");
  assert.equal(readFits(sol).filter((e) => e.kind === "fit.set" && e.scope === "Users/someone/calm/journal" && e.take === "paper").length, 1, "the person's look for the journal");
  assert.deepEqual(readPause(sol), { from: NOW + 27, skipped: 0 });
  assert.deepEqual(readBack(sol), { at: NOW + 28, was: true });
  // reading wrote nothing, set nothing aside
  assert.deepEqual(files(sol), before, "no file made, none set aside");
  assert.equal(files(sol).some((f) => /\.broken-/.test(f) || f.endsWith(".tmp")), false);
});

test("a read leaves a file exactly as it was: no version is written by looking", () => {
  const sol = homeCopy(), was = new Map(files(sol).map((f) => [f, fs.readFileSync(join(sol, f), "utf8")]));
  readFolderSessions(sol); readMoveIn(sol); setupsOf(sol); readKnown(sol); readPos(sol); readTabs(sol); readRaises(sol); readNotes(sol); readAutos(sol); readPlans(sol); claudeReadings(sol); readPause(sol); readBack(sol); lookOf(sol, STUDIO, NOW);
  for (const [f, text] of was) assert.equal(fs.readFileSync(join(sol, f), "utf8"), text, `${f} changed by a read`);
});

/** one write; then the store is v1 and everything but the named change is as it was */
async function wrote(sol: string, rel: string, write: () => unknown, change: (before: Record<string, unknown>, after: Record<string, unknown>) => void) {
  const before = json(sol, rel);
  await write();
  const after = json(sol, rel);
  assert.equal(after.v, 1, `${rel} is stamped v1 after a write`);
  assert.deepEqual(readJson(join(sol, rel)).aside, undefined);
  change(bare(before), bare(after));
}
const same = (b: Record<string, unknown>, a: Record<string, unknown>) => assert.deepEqual(a, b);
const but = (key: string, b: Record<string, unknown>, a: Record<string, unknown>) => { const { [key]: x, ...rb } = b, { [key]: y, ...ra } = a; assert.deepEqual(ra, rb, `only ${key} may change`); return [x, y]; };

test("one write through each writer: the version is stamped, nothing else changes but what the write is", async () => {
  const sol = homeCopy(), w = whereOf(sol), hands = { start: async () => {}, status: () => "idle", lastWords: () => null, say: async () => {} } as never;
  // the unversioned ones: the write is the same as the one that made them, so the file is the same with its version
  await wrote(sol, "next/pos.json", () => setPos(sol, { id: STUDIO, x: 120, y: 80, w: 320, h: 200, by: "person" }, NOW + 21), same);
  await wrote(sol, "next/drafts.json", () => writeNote(sol, { id: "n-1", text: "ring the florist", x: 40, y: 40, folder: JOURNAL }, NOW + 25), same);
  await wrote(sol, "next/back.json", () => goBack(sol, NOW + 28, true, () => {}), same);
  await wrote(sol, "next/diary/pause.json", () => pauseDiary(sol, false, NOW + 40), (b, a) => assert.deepEqual(a, { ...b, to: NOW + 40 }));
  await wrote(sol, "next/looks.json", () => pressPart(sol, { folder: GARDEN, part: "read" }, NOW + 41), (b, a) => {
    const [x, y] = but("presses", b, a) as [Record<string, unknown>, Record<string, unknown>];
    assert.deepEqual(y, { ...x, [GARDEN]: { read: 1 } });
  });
  const sid = Object.keys(readFolderSessions(sol))[0];
  await wrote(sol, "next/folders.json", () => moveSession(sol, { sessionId: sid, folder: MENUS }, hands, NOW + 42), (b, a) => {
    const [x, y] = but("sessions", b, a) as [Record<string, Record<string, unknown>>, Record<string, Record<string, unknown>>];
    assert.deepEqual(y[sid], { ...x[sid], folder: MENUS, moved: NOW + 42 });
  });
  await wrote(sol, "next/plans.json", () => proposePlan(sol, { title: "Close the books", why: "month end", steps: [{ name: "Count", does: "Count the till" }] }, { by: { who: "you" }, now: NOW + 43 }), (b, a) => {
    const [x, y] = but("plans", b, a) as [unknown[], unknown[]];
    assert.deepEqual([x.length, y.length], [1, 2]);
    assert.deepEqual(y[0], x[0], "the plan that was there is as it was");
  });
  await wrote(sol, "next/automations.json", () => makeAuto(sol, { does: "Back up the menus", when: "every day at 09:00" }, NOW + 44), (b, a) => {
    const [x, y] = but("autos", b, a) as [unknown[], unknown[]];
    assert.deepEqual([x.length, y.length], [1, 2]);
    assert.deepEqual(y[0], x[0]);
  });
  await wrote(sol, "next/pace/claude.json", () => notedClaude(sol, { rateLimitType: "seven_day", status: "allowed", utilization: 0.1 }, NOW + 45), (b, a) => {
    const [x, y] = but("windows", b, a) as [Record<string, unknown>, Record<string, unknown>];
    assert.deepEqual(Object.keys(x), ["five_hour"]);
    assert.deepEqual(Object.keys(y), ["five_hour", "seven_day"]);
    assert.deepEqual(y.five_hour, x.five_hour);
  });
  await wrote(sol, "next/fits.json", () => personSet(sol, { knob: "folder.look", scope: "Users/someone/calm/garden", take: "plain" }, NOW + 46), (b, a) => {
    const [x, y] = but("events", b, a) as [unknown[], unknown[]];
    assert.equal(y.length, x.length + 1);
    assert.deepEqual(y.slice(0, x.length), x);
  });
  // the versioned ones keep it, and change only what the write is
  await wrote(sol, "next/movein.json", () => setLead(sol, { lead: "both" }, NOW + 1), same);
  await wrote(sol, "next/tabs.json", () => openTab(sol, { id: "s-note-1", by: "person", kind: "note" }, NOW + 50), same);
  await wrote(sol, "next/tidy.json", () => considered(sol, Object.entries(weighed(sol)!).map(([folder, reading]) => ({ folder, reading })) as never, Object.keys(weighed(sol)!), NOW), same);
  await wrote(sol, "next/raises.json", () => raiseJudge(sol, [{ id: "a1", folder: STUDIO, words: "Approve the new menu page", from: "a block on the stage asks", stopped: false }], { now: NOW + 60, lines: {}, bar: "usual" }, null), same);
  await wrote(sol, "next/setups.json", () => dropLine(sol, { folder: JOURNAL, line: "organized" }), (b, a) => {
    const [x, y] = but("dropped", b, a) as [Record<string, unknown>, Record<string, unknown>];
    assert.deepEqual(y, { ...x, [JOURNAL]: ["organized"] });
  });
  await wrote(sol, "next/context.json", () => addFact(sol, { place: GARDEN, fact: "Tomatoes by June", source: "you told this folder" }, "person", NOW + 70), (b, a) => {
    const [x, y] = but("facts", b, a) as [unknown[], unknown[]];
    assert.equal(y.length, x.length + 1);
  });
  await wrote(sol, "next/known.json", () => noteFix(w, { how: "keep", what: "the garden's setup", place: GARDEN, reason: `setup:${GARDEN}` }, NOW + 71), (b, a) => {
    const { fixes: f1, changes: c1, ...r1 } = b, { fixes: f2, changes: c2, ...r2 } = a;   // a fix line is one fix and one change
    assert.deepEqual(r2, r1);
    assert.deepEqual([(f2 as unknown[]).length, (c2 as unknown[]).length], [(f1 as unknown[]).length + 1, (c1 as unknown[]).length + 1]);
    assert.deepEqual((f2 as unknown[]).slice(0, (f1 as unknown[]).length), f1);
  });
  // every store carries its version now, every one still reads, none was set aside, and nothing new appeared
  assert.equal(files(sol).length, 17);
  for (const s of [...UNVERSIONED, ...VERSIONED]) assert.equal(json(sol, `next/${s}.json`).v, 1, `${s} is v1`);
  assert.equal(files(sol).some((f) => /\.broken-/.test(f) || f.endsWith(".tmp")), false);
  goAll(sol, () => undefined);
  assert.deepEqual(json(sol, "next/atwork.json"), { v: 1 }, "a store written empty is stamped too");
});

test("a store of a version this engine does not know is read as it is and never wiped or set aside", () => {
  const sol = homeCopy(), f = join(sol, "next", "pos.json");
  fs.writeFileSync(f, JSON.stringify({ v: 7, pos: { [STUDIO]: { x: 1, y: 2, w: 3, h: 4, by: "person", at: 5, touched: false, folded: false } }, later: { a: 1 } }));
  const r = readJson(f);
  assert.equal(r.aside, undefined);
  assert.equal(versionOf(r.data), 7);
  assert.deepEqual(readPos(sol).pos[STUDIO], { x: 1, y: 2, w: 3, h: 4, by: "person", touched: false, folded: false, at: 5 });
  assert.equal(files(sol).some((x) => /\.broken-/.test(x)), false);
  fs.writeFileSync(f, JSON.stringify({ v: "two", pos: {} }));
  assert.equal(versionOf(readJson(f).data), 1, "a version that is not a number is no version: v1");
});

test("writeJson stamps an object once, leaves a version already there, and leaves an array alone", () => {
  const d = fs.mkdtempSync(join(tmpdir(), "sol-upgrade-")); roots.push(d);
  writeJson(join(d, "a.json"), { x: 1 });
  writeJson(join(d, "b.json"), { v: 3, x: 1 });
  writeJson(join(d, "c.json"), [1]);
  assert.deepEqual(json(d, "a.json"), { v: 1, x: 1 });
  assert.deepEqual(json(d, "b.json"), { v: 3, x: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(join(d, "c.json"), "utf8")), [1]);
});
