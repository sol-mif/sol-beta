// The conversion steps run for real on a BR1 person's home (#1881, row 3 of #1820). src/next/upgrade.test.ts reads the
// frozen BR1 home (src/next/fixtures/br1-home) through this engine's readers; this runs the steps over it first. A BR1
// home is at data-version 3 (0003-next-baseline), so a copy of the golden one is set to 3, every step from 0004 on runs
// over it, and then every store reads back with the same counts, none set aside, and a field this engine does not know
// is still there. With no step past 0003 yet, the home is left exactly as it was; a stand-in step after the newest one
// proves the way a real one will take: a copy before it, its files put back when it fails, and going back over it.
// Going back is also what the first start after the keeper's go-back meets (keep swap_back, .went-back, #1576): the
// older engine finds the data ahead and runs nothing, and with the keeper's mark backAtStart (row A, #1887) puts the BR1
// home back as it was; with no mark it leaves it. Every home is a temp copy; the fixture is never written.
// Signed: franktsai2008-eng's agent (#1881).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversions, readVersion, writeVersion, label, BACKUP_DIR, type Ctx, type Step } from "./run.js";
import { STEPS } from "./steps.js";
import { backAtStart, WENT_BACK } from "./back.js";
import { readJson, writeJson } from "../next/file.js";
import { readFolderSessions } from "../next/folders.js";
import { readMoveIn } from "../next/movein.js";
import { setupsOf } from "../next/setup.js";
import { readStore as readKnown } from "../next/you-known.js";
import { contextOf } from "../next/context.js";
import { lookOf } from "../next/look.js";
import { readPos } from "../next/pos.js";
import { readTabs } from "../next/tabs.js";
import { readRaises } from "../next/raise.js";
import { readNotes } from "../next/notes.js";
import { readPause } from "../next/diary.js";
import { readBack } from "../next/seats.js";
import { weighed } from "../next/tidy.js";
import { readAutos } from "../next/automations.js";
import { readPlans } from "../next/plans.js";
import { claudeReadings } from "../next/pace.js";
import { readEvents as readFits } from "../next/fits.js";
import { NOW } from "../next/fixtures/make-br1-home.js";

const golden = join(dirname(fileURLToPath(import.meta.url)), "..", "next", "fixtures", "br1-home");
const BR1 = 3;   // a BR1 home's data-version: 0003-next-baseline is the last step BR1 ran
const LATER = { from: "a newer Sol", keep: [1, 2] };   // a field no engine here knows
const STUDIO = "w:/Users/someone/studio/site", JOURNAL = "w:/Users/someone/calm/journal";
const temps: string[] = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** the golden home copied to a temp SOL_HOME at data-version 3, every store given a field no engine knows */
function br1Home(): Ctx {
  const d = fs.mkdtempSync(join(tmpdir(), "sol-upgrade-run-")); temps.push(d);
  const home = join(d, "home"), engine = join(d, "engine");
  fs.cpSync(golden, home, { recursive: true });
  fs.mkdirSync(engine);
  const c: Ctx = { home, dotSol: join(home, ".sol"), engine };
  fs.mkdirSync(c.dotSol);
  writeVersion(c.dotSol, BR1);
  for (const f of stores(c)) {
    const p = join(home, f), o = JSON.parse(fs.readFileSync(p, "utf8"));
    fs.writeFileSync(p, JSON.stringify({ ...o, later: LATER }, null, 2) + "\n");
  }
  return c;
}
/** every file under a folder, relative, with its text */
function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tree(p, base, out); else out[p.slice(base.length + 1)] = fs.readFileSync(p, "utf8");
  }
  return out;
}
/** the stores, relative to the home: next/... */
const stores = (c: Ctx) => Object.keys(tree(join(c.home, "next"))).map((f) => `next/${f}`).sort();

/** what each store holds, counted through the engine's own readers: the same after any step, or a person lost something */
function counts(c: Ctx): Record<string, unknown> {
  const sol = c.home, k = readKnown(sol), plans = readPlans(sol), ctx = (f: string) => { const r = contextOf(sol, f); return r.ok ? r.facts.length : -1; };
  return {
    folders: Object.keys(readFolderSessions(sol)).length,
    movein: readMoveIn(sol)?.keep.length ?? -1,
    tidy: Object.keys(weighed(sol) ?? {}).length,
    setups: setupsOf(sol).length,
    known: [k.fixes.length, k.placed.length, k.changes.length, k.done.length],
    context: [ctx(STUDIO), ctx(JOURNAL)],
    looks: lookOf(sol, STUDIO, NOW).order.length,
    pos: Object.keys(readPos(sol).pos).length,
    tabs: readTabs(sol).tabs.length,
    raises: Object.keys(readRaises(sol).judged).length,
    drafts: readNotes(sol).length,
    automations: readAutos(sol).length,
    plans: [plans.length, plans.reduce((n, p) => n + p.steps.length, 0)],
    claude: claudeReadings(sol).length,
    fits: readFits(sol).length,
    pause: readPause(sol) ? 1 : 0,
    back: readBack(sol) ? 1 : 0,
  };
}
/** every store still reads, none set aside, none half-written, and each still has the field no engine knows */
function allRead(c: Ctx, names: string[]) {
  assert.deepEqual(stores(c), names, "no store gone, none made, none set aside");
  for (const f of names) {
    const r = readJson(join(c.home, f));
    assert.equal(r.aside, undefined, `${f} was set aside`);
    assert.deepEqual(r.data.later, LATER, `${f} kept the field it does not know`);
  }
}

/** the steps after BR1's, as this engine has them, then a stand-in after the newest: it rewrites every store whole, as
 *  a real step that changes a shape does, keeping what it does not know; `fail` throws once half of them are written */
function standIn(c: Ctx, fail = false): Step {
  const id = (STEPS.at(-1)?.id ?? 0) + 1;
  return {
    id, name: "stand-in",
    touches: () => stores(c).map((f) => join(c.home, f)),
    run: () => {
      stores(c).forEach((f, i, all) => {
        if (fail && i === Math.floor(all.length / 2)) throw new Error("the stand-in stops half way");
        const p = join(c.home, f);
        writeJson(p, { ...readJson(p).data, steppedBy: id });
      });
    },
  };
}
const after3 = STEPS.filter((s) => s.id > BR1);

test("upgrade: the golden home is a BR1 home: seventeen stores, data-version 3, and this engine knows every step up to it", () => {
  const c = br1Home();
  assert.equal(stores(c).length, 17);
  assert.equal(readVersion(c.dotSol), BR1);
  assert.deepEqual(STEPS.slice(0, BR1).map(label), ["0001-baseline", "0002-rhythm-from-team-json", "0003-next-baseline"]);
});

test("upgrade: every step from 0004 on runs over a BR1 home; every store reads back with the same counts and keeps what it does not know", () => {
  const c = br1Home(), names = stores(c), was = counts(c);
  const r = runConversions(c, STEPS);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  assert.equal(r.ahead, undefined);
  assert.deepEqual(r.ran, after3.map(label), "every step past 0003 ran, and only those");
  assert.equal(readVersion(c.dotSol), STEPS.at(-1)!.id);
  allRead(c, names);
  assert.deepEqual(counts(c), was);
});

test("upgrade: with no step past 0003, a BR1 home is left exactly as it was: no file changed, no copy taken", { skip: after3.length ? "0004 is here: the test above runs it" : false }, () => {
  const c = br1Home(), was = tree(c.home);
  const r = runConversions(c, STEPS);
  assert.deepEqual([r.ok, r.ran, r.version], [true, [], BR1]);
  assert.deepEqual(tree(c.home), was);
  assert.equal(fs.existsSync(join(c.dotSol, BACKUP_DIR)), false);
});

test("upgrade: a stand-in step after the newest runs over the BR1 home: copied first, the same counts, nothing it does not know lost", () => {
  const c = br1Home(), names = stores(c), was = counts(c), s = standIn(c);
  const r = runConversions(c, [...STEPS, s]);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  assert.deepEqual(r.ran, [...after3, s].map(label));
  assert.equal(readVersion(c.dotSol), s.id);
  allRead(c, names);
  for (const f of names) assert.equal(readJson(join(c.home, f)).data.steppedBy, s.id, `${f} went through the step`);
  assert.deepEqual(counts(c), was);
  const m = JSON.parse(fs.readFileSync(join(c.dotSol, BACKUP_DIR, String(s.id).padStart(4, "0"), "manifest.json"), "utf8"));
  assert.equal(m.files.length, names.length, "every store it touches was copied before it");
});

test("upgrade: a step that fails half way over a BR1 home puts every store back as it was and stays at its version", () => {
  const c = br1Home(), s = standIn(c, true);
  const ran = runConversions(c, after3);   // the real steps first, so the home is where the stand-in meets it
  assert.equal(ran.ok, true);
  const was = tree(c.home);
  const r = runConversions(c, [...STEPS, s]);
  assert.equal(r.ok, false);
  assert.deepEqual([r.failed?.step, r.failed?.restored], [label(s), true]);
  assert.equal(readVersion(c.dotSol), STEPS.at(-1)?.id ?? 0);
  const now = tree(c.home);
  for (const f of stores(c)) assert.equal(now[f], was[f], `${f} put back as it was`);
});

/** a newer release ran the stand-in over the BR1 home and did not start three times: keep's swap_back moved the code
 *  back, not the data. The older engine's first start runs nothing on data ahead of it and touches no file */
function wentAhead(c: Ctx): Step {
  const s = standIn(c);
  assert.equal(runConversions(c, [...STEPS, s]).ok, true);
  const newer = tree(c.home);
  const r = runConversions(c, STEPS);
  assert.deepEqual([r.ok, r.ahead, r.ran, r.version], [true, true, [], s.id]);
  assert.deepEqual(tree(c.home), newer, "ahead: not a file touched");
  return s;
}

test("upgrade: the first start after the keeper went back (#1576): the older engine finds the data ahead, and backAtStart puts the BR1 home back", () => {
  const c = br1Home(), first = tree(join(c.home, "next")), was = counts(c);
  const s = wentAhead(c);
  // that start as start.ts runs it, with the keeper's mark beside the engine (row A, #1887)
  fs.writeFileSync(join(c.engine, WENT_BACK), "aaaaaaa\tbbbbbbb\n");
  const latest = STEPS.at(-1)?.id ?? 0, r = backAtStart(c, runConversions(c, STEPS));
  assert.equal(r.ahead, false);
  assert.deepEqual([r.back?.from, r.back?.to, r.version], [s.id, latest, latest]);
  assert.ok(r.back && "kept" in r.back, JSON.stringify(r.back));
  assert.equal(readVersion(c.dotSol), latest);
  assert.deepEqual(tree(join(c.home, "next")), first, "every store as the BR1 home had it");
  allRead(c, stores(c));
  assert.deepEqual(counts(c), was);
  // and that engine's next start runs nothing more and goes back over nothing
  const again = backAtStart(c, runConversions(c, STEPS));
  assert.deepEqual([again.ok, again.ahead, again.ran, again.back], [true, undefined, [], undefined]);
});

test("upgrade: data ahead with no mark from the keeper (an older Sol run by hand) is left as it is", () => {
  const c = br1Home();
  const s = wentAhead(c), newer = tree(c.home);
  const r = backAtStart(c, runConversions(c, STEPS));
  assert.deepEqual([r.ahead, r.back, r.version], [true, undefined, s.id]);
  assert.deepEqual(tree(c.home), newer);
});
