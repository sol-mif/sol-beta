// Conversion steps for saved data (#422): run in order, safe twice, a copy before each, a failing step stops the rest and
// puts its files back without throwing, a fresh home gets data-version 1 and nothing else. Every home here is a temp
// folder; the real ~/.sol and sol/home are never touched. Then a real engine on a temp home: up, and /health says
// the data's version, also when the version file is broken. And the CI check, sol/engine/convert-check, in a scratch repo.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort, ownHealth } from "./test-engine.ts";
import { runConversions, readVersion, label, KEEP, type Ctx, type Step } from "../src/convert/run.ts";
import { STEPS } from "../src/convert/steps.ts";

const ENGINE = join(import.meta.dirname, "..");
const ROOT = join(ENGINE, "..", "..");
const temps: string[] = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
function home(): Ctx {
  const d = mkdtempSync(join(tmpdir(), "sol-convert-")); temps.push(d);
  mkdirSync(join(d, "home")); mkdirSync(join(d, "engine"));
  return { home: join(d, "home"), dotSol: join(d, "home", ".sol"), engine: join(d, "engine") };
}
/** every file under a folder, relative, with its text */
function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tree(p, base, out); else out[p.slice(base.length + 1)] = readFileSync(p, "utf8");
  }
  return out;
}
const step = (id: number, name: string, run: (c: Ctx) => void, touches: (c: Ctx) => string[] = () => []): Step => ({ id, name, run, touches });

test("convert: steps run in order, each once, and the version follows the last one done", () => {
  const c = home();
  const seen: string[] = [];
  const steps = [1, 2, 3].map((n) => step(n, `s${n}`, () => { seen.push(`s${n}`); }));
  const r = runConversions(c, steps);
  assert.deepEqual(seen, ["s1", "s2", "s3"]);
  assert.deepEqual(r.ran, ["0001-s1", "0002-s2", "0003-s3"]);
  assert.equal(r.ok, true); assert.equal(r.version, 3); assert.equal(readVersion(c.dotSol), 3);
  // a home at 1 runs only what is after 1
  const c2 = home(); writeFileSync((mkdirSync(c2.dotSol), join(c2.dotSol, "data-version")), "1\n");
  seen.length = 0;
  runConversions(c2, steps);
  assert.deepEqual(seen, ["s2", "s3"]);
  // a list out of order runs nothing
  const c3 = home(); seen.length = 0;
  const bad = runConversions(c3, [steps[1], steps[0]]);
  assert.equal(bad.ok, false); assert.match(bad.failed!.error, /out of order/); assert.deepEqual(seen, []);
});

test("convert: running again is safe; a step run again after a stop before its version was written still ends right", () => {
  const c = home();
  const f = join(c.engine, "team.json");
  writeFileSync(f, JSON.stringify({ rhythm: { release: "09:00" } }));
  // a real-looking step: move rhythm out of team.json into a file of its own, written to be safe twice
  const move = step(1, "rhythm-out", (x) => {
    const t = JSON.parse(readFileSync(join(x.engine, "team.json"), "utf8"));
    if (t.rhythm) { writeFileSync(join(x.home, "rhythm.json"), JSON.stringify(t.rhythm)); delete t.rhythm; writeFileSync(join(x.engine, "team.json"), JSON.stringify(t)); }
  }, (x) => [join(x.engine, "team.json"), join(x.home, "rhythm.json")]);
  runConversions(c, [move]);
  const once = { team: readFileSync(f, "utf8"), rhythm: readFileSync(join(c.home, "rhythm.json"), "utf8") };
  const again = runConversions(c, [move]);
  assert.deepEqual(again.ran, []); assert.equal(again.version, 1);
  // the engine stopped after the step but before data-version: the step runs once more and leaves the same data
  writeFileSync(join(c.dotSol, "data-version"), "0\n");
  const rerun = runConversions(c, [move]);
  assert.deepEqual(rerun.ran, ["0001-rhythm-out"]);
  assert.deepEqual({ team: readFileSync(f, "utf8"), rhythm: readFileSync(join(c.home, "rhythm.json"), "utf8") }, once);
  // the shipped steps, twice over on one home, change nothing the second time
  const s = home();
  runConversions(s, STEPS);
  const first = tree(s.home);
  const r2 = runConversions(s, STEPS);
  assert.deepEqual(r2.ran, []); assert.deepEqual(tree(s.home), first);
});

test("convert: the files a step touches are copied before it, kept thirty days, past the last few", () => {
  const c = home();
  const f = join(c.engine, "settings.json");
  writeFileSync(f, '{"old":true}');
  const steps: Step[] = [];
  for (let n = 1; n <= KEEP + 2; n++) steps.push(step(n, `s${n}`, () => writeFileSync(f, JSON.stringify({ n })), () => [f, join(c.home, "never-there.json")]));
  runConversions(c, steps.slice(0, 1));
  const dir = join(c.dotSol, "convert-backup", "0001");
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  assert.equal(m.step, "0001-s1");
  assert.deepEqual(m.files.map((x: { path: string; existed: boolean }) => [x.path, x.existed]), [[f, true], [join(c.home, "never-there.json"), false]]);
  assert.equal(readFileSync(join(dir, "files", "0"), "utf8"), '{"old":true}');   // the file as it was before the step
  assert.equal(readFileSync(f, "utf8"), '{"n":1}');
  runConversions(c, steps);
  // all are younger than thirty days, so all are kept (#426 goes back with them); the age prune is in pin.test.ts
  assert.equal(readdirSync(join(c.dotSol, "convert-backup")).length, KEEP + 2);
  assert.equal(readFileSync(join(c.dotSol, "convert-backup", String(KEEP + 2).padStart(4, "0"), "files", "0"), "utf8"), JSON.stringify({ n: KEEP + 1 }));
});

test("convert: a failing step puts its files back, stops the rest, and nothing throws", () => {
  const c = home();
  const f = join(c.engine, "team.json"), made = join(c.home, "made.json");
  writeFileSync(f, '{"before":1}');
  let third = false;
  const steps = [
    step(1, "fine", () => {}),
    step(2, "breaks", () => { writeFileSync(f, '{"half'); writeFileSync(made, "x"); throw new Error("boom"); }, () => [f, made]),
    step(3, "after", () => { third = true; }),
  ];
  const r = runConversions(c, steps);
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, { step: "0002-breaks", error: "boom", restored: true });
  assert.equal(r.version, 1); assert.equal(readVersion(c.dotSol), 1);
  assert.equal(third, false);
  assert.equal(readFileSync(f, "utf8"), '{"before":1}');   // put back
  assert.equal(existsSync(made), false);                   // a file the step made is gone again
  // fixed in the next build: it runs from where it stopped
  steps[1] = step(2, "breaks", () => {});
  const next = runConversions(c, steps);
  assert.equal(next.ok, true); assert.deepEqual(next.ran, ["0002-breaks", "0003-after"]); assert.equal(third, true);
  // an async step is refused, its files put back
  const a = home();
  const ar = runConversions(a, [step(1, "async", (() => Promise.resolve()) as unknown as (c: Ctx) => void)]);
  assert.match(ar.failed!.error, /synchronous/); assert.equal(readVersion(a.dotSol), 0);
  // a version file that is not a number: nothing runs, nothing is guessed
  const g = home(); mkdirSync(g.dotSol); writeFileSync(join(g.dotSol, "data-version"), "two\n");
  let ran = false;
  const gr = runConversions(g, [step(1, "x", () => { ran = true; })]);
  assert.equal(gr.ok, false); assert.equal(gr.failed!.step, "data-version"); assert.equal(ran, false);
  // a home newer than this build (one that went back): left alone
  const n = home(); mkdirSync(n.dotSol); writeFileSync(join(n.dotSol, "data-version"), "9\n");
  const nr = runConversions(n, [step(1, "x", () => { ran = true; })]);
  assert.equal(nr.ok, true); assert.equal(nr.ahead, true); assert.equal(ran, false); assert.equal(readVersion(n.dotSol), 9);
});

test("convert: a fresh home runs every step to the newest data-version and nothing else is made; no home, nothing made", () => {
  const c = home();
  writeFileSync(join(c.home, "private.json"), '{"apps":[]}');
  const r = runConversions(c, STEPS);
  assert.equal(r.ok, true); assert.deepEqual(r.ran, STEPS.map(label));
  assert.deepEqual(tree(c.home), { "private.json": '{"apps":[]}', ".sol/data-version": `${STEPS.length}\n` });
  assert.deepEqual(tree(c.engine), {});
  const gone = { ...home(), home: join(tmpdir(), "sol-convert-not-there-" + process.pid) };
  const g = runConversions({ ...gone, dotSol: join(gone.home, ".sol") }, STEPS);
  assert.equal(g.skipped, "no home folder"); assert.equal(existsSync(gone.home), false);
});

test("convert: steps.ts lists every NNNN-name.ts in the folder, in order, named as its file", () => {
  const files = readdirSync(join(ENGINE, "src", "convert")).filter((n) => /^\d{4}-.*\.ts$/.test(n)).sort();
  assert.deepEqual(STEPS.map((s) => `${label(s)}.ts`), files);
  STEPS.forEach((s, i) => assert.equal(s.id, i + 1, "numbers go 1, 2, 3 with no gap"));
  for (const p of readFileSync(join(ENGINE, "src", "convert", "SHAPES"), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")))
    assert.ok(existsSync(join(ROOT, p)), `SHAPES names ${p}, which is not there`);
});

test("convert: the engine comes up on a temp home, /health says the data's version, and a broken version file does not stop it", { timeout: 90_000 }, async () => {
  const engines: ChildProcess[] = [];
  try {
    for (const broken of [false, true]) {
      const d = mkdtempSync(join(tmpdir(), "sol-convert-engine-")); temps.push(d);
      mkdirSync(join(d, "home"));
      if (broken) { mkdirSync(join(d, "home", ".sol")); writeFileSync(join(d, "home", ".sol", "data-version"), "not a number"); }
      const port = await freePort();
      const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
        cwd: ENGINE, stdio: "ignore",
        env: {
          ...process.env, SOL_PORT: String(port), SOL_HOME: join(d, "home"), SOL_PROFILE: join(d, "profile"),
          SOL_STATE: join(d, "work.json"), SOL_TEAM: join(d, "team.json"), SOL_LOG: join(d, "engine.log"),
          SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
        },
      });
      engines.push(engine);
      const h = await ownHealth(engine, port);   // this test's engine, not another run's on the port (#938)
      assert.equal(h.ok, true);
      if (broken) { assert.equal(h.data.ok, false); assert.equal(h.data.failed.step, "data-version"); }
      else { assert.equal(h.data.ok, true); assert.equal(h.data.version, STEPS.length); assert.equal(readFileSync(join(d, "home", ".sol", "data-version"), "utf8"), `${STEPS.length}\n`); }
    }
  } finally { for (const e of engines) e.kill(); }
});

test("convert-check: a saved shape changed needs a new step, or the label no-conversion", () => {
  const d = mkdtempSync(join(tmpdir(), "sol-convert-check-")); temps.push(d);
  const git = (...a: string[]) => execFileSync("git", a, { cwd: d, encoding: "utf8" });
  git("init", "-q", "-b", "main"); git("config", "user.name", "t"); git("config", "user.email", "t@t");
  mkdirSync(join(d, "sol", "engine", "src", "convert"), { recursive: true });
  copyFileSync(join(ENGINE, "convert-check"), join(d, "sol", "engine", "convert-check")); chmodSync(join(d, "sol", "engine", "convert-check"), 0o755);
  writeFileSync(join(d, "sol", "engine", "src", "convert", "SHAPES"), "# shapes\nsol/engine/src/settings.ts\n");
  writeFileSync(join(d, "sol", "engine", "src", "settings.ts"), "a\n");
  writeFileSync(join(d, "sol", "engine", "src", "other.ts"), "a\n");
  git("add", "-A"); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD").trim();
  const check = (env: Record<string, string> = {}) => {
    try { return { code: 0, out: execFileSync("bash", [join(d, "sol", "engine", "convert-check"), base], { cwd: d, encoding: "utf8", env: { ...process.env, ...env } }) }; }
    catch (e: any) { return { code: e.status as number, out: String(e.stdout ?? "") }; }
  };
  writeFileSync(join(d, "sol", "engine", "src", "other.ts"), "b\n"); git("add", "-u", "--renormalize"); git("commit", "-qm", "other");
  assert.deepEqual(check(), { code: 0, out: "no saved shape changed\n" });
  writeFileSync(join(d, "sol", "engine", "src", "settings.ts"), "b\n"); git("add", "-u", "--renormalize"); git("commit", "-qm", "shape");
  const no = check();
  assert.equal(no.code, 1); assert.match(no.out, /sol\/engine\/src\/settings\.ts/); assert.match(no.out, /no-conversion/);
  const label = check({ NO_CONVERSION: "true" });
  assert.equal(label.code, 0); assert.match(label.out, /no-conversion says/);
  writeFileSync(join(d, "sol", "engine", "src", "convert", "0002-new-shape.ts"), "x\n"); git("add", "-A"); git("commit", "-qm", "step");
  const yes = check();
  assert.equal(yes.code, 0); assert.match(yes.out, /0002-new-shape\.ts/);
});
