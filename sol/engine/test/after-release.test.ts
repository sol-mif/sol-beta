// After a release (#634, freeform #629): migrations by key, re-lint, remake, the one card and its one undo; the palette
// in tokens.json; the functional colours fixed. The home is a copy of sol/design/system/fixtures/after-release (never
// anyone's real home), and contract 2 is its tokens-2.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readThings } from "../src/things.ts";
import { afterRelease, carry, closePass, cssUses, passWire, readContract, recover, relint, renameProps, setFault, setsFixed, undoPass, JOURNAL_DIR, PASS_FILE, type Contract } from "../src/release.ts";
import { loadThings, releaseLines, setsFixed as faceSetsFixed, stateOf, checkRecord } from "../../mac/src/home/frameRules.ts";
import { FIXED_COLOURS, FRAME_PLACES } from "../../mac/src/home/meta.ts";
const tokens = await import("../../design/system/tokens.mjs");

const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = join(SOL, "design/system/fixtures/after-release");
const TWO = join(FIX, "tokens-2.json");
const home = () => { const d = mkdtempSync(join(tmpdir(), "sol-release-")); cpSync(join(FIX, "home"), join(d, "home"), { recursive: true }); return join(d, "home"); };
const rec = (h: string, id: string) => JSON.parse(readFileSync(join(h, "things", id, "record.json"), "utf8"));
const NOW = new Date("2026-11-06T09:00:00Z");

test("the value layer is one file: palette.json is gone, tokens.json holds the palette, and every generated file is what it makes", () => {
  assert.equal(existsSync(join(SOL, "design/palette.json")), false);
  assert.equal(existsSync(join(SOL, "design/palette-build.py")), false);
  const t = tokens.readTokens();
  assert.deepEqual(tokens.problems(t), []);
  for (const [rel, text] of tokens.outputs(t)) assert.equal(readFileSync(join(SOL, "..", rel), "utf8"), text, `${rel} is generated, never edited: run node sol/design/system/tokens.mjs`);
  assert.match(readFileSync(join(SOL, "mac/src/palette.css"), "utf8"), /--red-strong: #fd302d;/, "the preset values reach the face as before");
  assert.match(tokens.problems({ ...t, palette: { ...t.palette, ink: { value: "red" } } }).join("\n"), /palette\.ink\.value/);
  assert.match(tokens.problems({ ...t, palette: undefined }).join("\n"), /palette: the preset values are missing/);
});

test("the functional colours are contract names with fixed values; the face and the engine know the same three, and the same places", () => {
  const t = tokens.readTokens();
  assert.deepEqual(tokens.fixedNames(t), [...FIXED_COLOURS]);
  for (const n of FIXED_COLOURS) assert.match(t.tokens[n].value, /^var\(--(red|yellow|green)-strong\)$/, `--${n} is a palette signal`);
  assert.deepEqual(t.places, [...FRAME_PLACES], "tokens.json's places are the frame's");
  const c = readContract();
  assert.ok(c);
  assert.deepEqual(c.fixed, [...FIXED_COLOURS]);
  assert.match(readFileSync(join(SOL, "mac/src/tokens.css"), "utf8"), /--error: var\(--red-strong\);.*\(fixed\)/);
});

test("setsFixed: the engine's verdict on the shared fixtures (mac/src/home/sets-fixed.json) is the face's; only a css declaration sets a fixed colour", () => {
  const F: { fixed: string[]; cases: { html: string; sets: string[]; why: string }[] } = JSON.parse(readFileSync(join(SOL, "mac/src/home/sets-fixed.json"), "utf8"));
  assert.deepEqual(F.fixed, [...FIXED_COLOURS]);
  for (const k of F.cases) {
    assert.deepEqual(setsFixed(k.html, F.fixed), k.sets, `engine: ${k.why}`);
    assert.deepEqual(faceSetsFixed(k.html), k.sets, `face: ${k.why}`);
  }
});

test("the record check: a thing that sets a fixed colour is refused at load, with why", () => {
  const h = home();
  const wire = readThings(h);
  const days = wire.find((t) => t.id === "days")!;
  const bad = { ...days, html: (days.html ?? "").replace("<style>", "<style>:root { --error: hotpink; }") };
  const out = loadThings([bad], ["card"]);
  assert.equal(out.loaded.length, 0);
  assert.match(out.refused[0].why, /sets --error, a functional colour the contract fixes/);
  rmSync(dirname(h), { recursive: true, force: true });
});

test("carry: keys renamed in the face file and the record, step by step; a retired key in use or a missing step cannot be carried", () => {
  const c: Contract = { contract: 3, places: ["card"], fixed: [], migrations: [{ from: 1, to: 2, keys: { dim: "quiet", a: "b", b: "a" } }, { from: 2, to: 3, keys: { quiet: "hush", gone: null } }] };
  const r = { contract: 1, place: "card", reads: ["a"], writes: [], listens: ["b", "x"] };
  const out = carry("<style>x { color: var(--dim); } y { color: var(--dimmer); --a: 1; top: var(--b) }</style>", r, c);
  assert.ok(out.ok);
  if (out.ok) {
    assert.equal(out.html, "<style>x { color: var(--hush); } y { color: var(--dimmer); --b: 1; top: var(--a) }</style>", "a swap is one step; a longer name is not touched");
    assert.deepEqual(out.record, { contract: 3, place: "card", reads: ["b"], writes: [], listens: ["a", "x"] });
    assert.deepEqual(out.renamed, ["--dim → --quiet", "--a → --b", "--b → --a", "\"a\" → \"b\"", "\"b\" → \"a\"", "--quiet → --hush"]);
  }
  const used = carry("<style>p { color: var(--gone) }</style>", r, c, "v1.html");
  assert.deepEqual(used, { ok: false, why: "contract 3 retired --gone, which v1.html uses" });
  assert.equal(carry("<p>--gone is gone</p><style>/* var(--gone) */ p { content: \"var(--gone)\" }</style>", r, c).ok, true, "a retired key named outside css code is not a use");
  assert.deepEqual(carry("p {}", { ...r, reads: ["gone"] }, c), { ok: false, why: "contract 3 retired \"gone\", which its record names" });
  assert.deepEqual(carry("p {}", r, { ...c, migrations: [c.migrations[1]] }), { ok: false, why: "contract 2 came with no migration from 1" });
  assert.equal(relint("<p>", { place: "sheet" }, c), "asks for the sheet, which contract 3 does not have (card)");
  assert.equal(relint("<style>:root{--live:red}</style>", { place: "card" }, { ...c, fixed: ["live"] }), "sets --live, a functional colour the contract fixes");
  assert.equal(relint("<p>", { place: "card" }, c), null);
});

test("the key rename touches css custom properties only: references, declarations and @property, never text, comments, scripts or strings", () => {
  const html = [
    "<!doctype html><!-- the --dim look: var(--dim) -->",
    "<style>",
    "  :root { --dim: grey; --dimmer: x; }",
    "  @property --dim { syntax: '<color>'; inherits: true; initial-value: grey; }",
    "  .q { color: var( --dim ); border-color: var(--dim, red); } /* var(--dim) stays */",
    "  .s::after { content: \"var(--dim) --dim:\"; }",
    "</style>",
    "<p class=\"q\" style=\"--dim: red; color: var(--dim)\" title=\"--dim: x\">The --dim one, and var(--dim) in prose</p>",
    "<p data-x='style=\"--dim: 1\"'>x</p>",
    "<script>const s = 'var(--dim)'; el.style.setProperty('--dim', '1'); /* <style> */</script>",
    "<textarea>.q { color: var(--dim) }</textarea>",
  ].join("\n");
  const out = renameProps(html, { dim: "quiet" });
  const want = html
    .replace("{ --dim: grey;", "{ --quiet: grey;")
    .replace("@property --dim", "@property --quiet")
    .replace("var( --dim );", "var( --quiet );").replace("var(--dim, red)", "var(--quiet, red)")
    .replace("style=\"--dim: red; color: var(--dim)\"", "style=\"--quiet: red; color: var(--quiet)\"");
  assert.equal(out, want);
  assert.deepEqual([...cssUses(html, ["dim", "dimmer", "gone"])].sort(), ["dim", "dimmer"]);
  assert.deepEqual([...cssUses("<p>var(--gone)</p><script>'--gone:'</script>", ["gone"])], [], "a key in text or a script is not used by the css");
  // a quoted ">" in an attribute does not end the tag early, and a style element's closing tag ends its css
  assert.equal(renameProps("<a title='a > b' style='--dim:1'>--dim</a><style>p{color:var(--dim)}</style>--dim", { dim: "quiet" }), "<a title='a > b' style='--quiet:1'>--dim</a><style>p{color:var(--quiet)}</style>--dim");
});

test("the first start after a release: two things move to contract 2 in a new version, the third is marked remake and still shows; once", () => {
  const h = home();
  const before = Object.fromEntries(["days", "notes", "plan"].map((id) => [id, rec(h, id)]));
  const pass = afterRelease(h, TWO, NOW);
  assert.ok(pass);
  assert.deepEqual(pass.moved.map((m) => [m.id, m.from, m.version, m.renamed]), [["days", 1, 2, ["--dim → --quiet"]], ["notes", 1, 2, ["--dim → --quiet"]]]);
  assert.deepEqual(pass.marked.map((m) => [m.id, m.why]), [["plan", "asks for the sheet, which contract 2 does not have (pane, card, notch)"]]);
  for (const id of ["days", "notes"]) {
    const r = rec(h, id);
    assert.equal(r.contract, 2, `${id} reads contract 2`);
    assert.equal(r.current, 2);
    assert.deepEqual(r.versions[1], { v: 2, file: "v2.html", at: "2026-11-06", contract: 2 });
    const v2 = readFileSync(join(h, "things", id, "v2.html"), "utf8");
    assert.match(v2, /var\(--quiet\)/);
    assert.doesNotMatch(v2, /--dim\b/);
    assert.equal(readFileSync(join(h, "things", id, "v1.html"), "utf8"), readFileSync(join(FIX, "home/things", id, "v1.html"), "utf8"), "nothing deleted, v1 as it was");
  }
  const plan = rec(h, "plan");
  assert.deepEqual(plan.remake, { why: "asks for the sheet, which contract 2 does not have (pane, card, notch)", contract: 2, at: "2026-11-06" });
  assert.equal(plan.current, 1, "it keeps its last working version");
  assert.equal(plan.contract, 1);

  // the face: all three load, the marked one on Home with its last version; each record still holds
  const wire = readThings(h);
  const { loaded, refused } = loadThings(wire, ["card"]);
  assert.deepEqual(refused, [], "GET /things shows no error");
  assert.deepEqual(loaded.map((t) => t.record.id), ["days", "notes", "plan"]);
  const p = loaded.find((t) => t.record.id === "plan")!;
  assert.match(p.html, /the plan/);
  assert.equal(stateOf({ fault: null, loaded: true, made: 1, contract: 2, remake: !!p.record.remake }), "remake");
  for (const t of wire) assert.ok(checkRecord(t.record, t.id, t.ask).ok, `${t.id}'s record holds after the pass`);

  // the one card, drawn from the same GET
  const w = passWire(h);
  assert.ok(w);
  assert.deepEqual(w.moved, [{ id: "days", from: 1, renamed: ["--dim → --quiet"] }, { id: "notes", from: 1, renamed: ["--dim → --quiet"] }]);
  const l = releaseLines(w);
  assert.equal(l.head, "Sol updated to contract 2");
  assert.equal(l.moved, "2 things moved to contract 2: days, notes (--dim → --quiet)");
  assert.deepEqual(l.marked, ["plan: marked remake, asks for the sheet, which contract 2 does not have (pane, card, notch); its last version stays until it is remade"]);

  // once per contract: a second start does nothing
  assert.equal(afterRelease(h, TWO, NOW), null);
  assert.equal(rec(h, "days").current, 2);

  // undo: one step, every record as it read before, the card gone, the new files kept
  const u = undoPass(h);
  assert.deepEqual(u, { undone: ["days", "notes", "plan"], kept: [] });
  for (const id of ["days", "notes", "plan"]) {
    const r = rec(h, id);
    const { versions, ...rest } = r, { versions: was, ...restWas } = before[id];
    assert.deepEqual(rest, restWas, `${id} reads what it read before the pass`);
    assert.deepEqual(versions.slice(0, was.length), was);
  }
  assert.ok(existsSync(join(h, "things", "days", "v2.html")), "the version it wrote stays");
  assert.equal(passWire(h), null, "the card goes");
  assert.equal(afterRelease(h, TWO, NOW), null, "an undone pass is not run again on the next start");
  assert.equal(undoPass(h), null, "undo is one step, once");
  rmSync(dirname(h), { recursive: true, force: true });
});

test("the card: close lets it go and keeps the pass; undo keeps a thing changed since, and says so; nothing to do writes nothing", () => {
  const h = home();
  afterRelease(h, TWO, NOW);
  assert.equal(closePass(h), true);
  assert.equal(passWire(h), null);
  assert.equal(rec(h, "days").contract, 2, "closing undoes nothing");
  assert.equal(closePass(h), false);
  // a newer version made since the pass: undo leaves that thing as it is
  const days = rec(h, "days");
  writeFileSync(join(h, "things", "days", "record.json"), JSON.stringify({ ...days, versions: [...days.versions, { v: 3, file: "v2.html", at: "2026-11-07", contract: 2 }], current: 3 }));
  assert.deepEqual(undoPass(h), { undone: ["notes", "plan"], kept: ["days"] });
  assert.equal(rec(h, "days").current, 3);

  const quiet = mkdtempSync(join(tmpdir(), "sol-release-none-"));
  assert.equal(afterRelease(quiet, TWO, NOW), null, "no things: nothing written");
  assert.equal(existsSync(join(quiet, PASS_FILE)), false);
  mkdirSync(join(quiet, "things"));
  cpSync(join(FIX, "home/things/days"), join(quiet, "things/days"), { recursive: true });
  assert.equal(afterRelease(quiet, join(SOL, "design/system/tokens.json"), NOW), null, "at contract 1 a contract-1 thing has nothing to do");
  assert.equal(existsSync(join(quiet, PASS_FILE)), false);
  const v1 = join(quiet, "things/days/v1.html");
  writeFileSync(v1, readFileSync(v1, "utf8").replace("<style>", "<style>:root { --error: red; }"));
  writeFileSync(join(quiet, "things/days/record.json"), JSON.stringify({ ...rec(quiet, "days"), contract: 2, versions: [{ v: 1, file: "v1.html", at: "2026-11-05", contract: 2 }] }));
  assert.equal(afterRelease(quiet, TWO, NOW), null, "no thing below the contract: no release, no re-lint, no card (the face refuses that one at load)");
  assert.equal(rec(quiet, "days").remake, undefined);
  rmSync(dirname(h), { recursive: true, force: true });
  rmSync(quiet, { recursive: true, force: true });
});

test("the engine: at its first start under contract 2 it runs the pass; GET /things carries the card, POST undo takes it back", { timeout: 90_000 }, async () => {
  const { spawn } = await import("node:child_process");
  const { freePort, ownHealth } = await import("./test-engine.ts");
  const port = await freePort();
  const h = home(), d = dirname(h);
  const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(SOL, "engine"), stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(port), SOL_HOME: h, SOL_TOKENS: TWO, SOL_PROFILE: join(d, "profile"),
      SOL_STATE: join(d, "work.json"), SOL_TEAM: join(d, "team.json"), SOL_LOG: join(d, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    },
  });
  try {
    const health: { contract?: unknown } = await ownHealth(engine, port);   // this test's engine, not another run's on the port (#938)
    assert.equal(health.contract, 2);
    type Wire = { contract: number; things: { id: string; record: { contract: number; remake?: unknown }; error?: string }[]; release: { moved: unknown[]; marked: unknown[] } | null };
    const t = await (await fetch(`http://127.0.0.1:${port}/things`)).json() as Wire;
    assert.equal(t.contract, 2);
    assert.deepEqual(t.things.map((x) => [x.id, x.record.contract, !!x.record.remake, x.error ?? null]), [["days", 2, false, null], ["notes", 2, false, null], ["plan", 1, true, null]]);
    assert.equal(t.release?.moved.length, 2);
    assert.equal(t.release?.marked.length, 1);
    const u = await (await fetch(`http://127.0.0.1:${port}/things/release/undo`, { method: "POST" })).json() as { ok: boolean; undone: string[] };
    assert.deepEqual(u, { ok: true, undone: ["days", "notes", "plan"], kept: [] });
    const after = await (await fetch(`http://127.0.0.1:${port}/things`)).json() as Wire;
    assert.equal(after.release, null, "the card goes");
    assert.deepEqual(after.things.map((x) => [x.id, x.record.contract, !!x.record.remake]), [["days", 1, false], ["notes", 1, false], ["plan", 1, false]]);
    assert.equal((await fetch(`http://127.0.0.1:${port}/things/release/undo`, { method: "POST", headers: { origin: "https://example.com" } })).status, 403, "another site never presses it");
  } finally { engine.kill(); rmSync(d, { recursive: true, force: true }); }
});

// ---- a crash at every write boundary (#635's second read): the next start, or the next press of undo, finishes
// the step whole from its journal, and the home reads byte for byte what a run without the crash leaves ----
const snap = (h: string) => {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out[p.slice(h.length + 1)] = readFileSync(p, "utf8"); } };
  walk(h);
  return out;
};
class Crash extends Error {}
/** the names of the write boundaries `run` passes, in order */
const boundaries = (run: () => unknown) => { const seen: string[] = []; setFault((at) => { seen.push(at); }); try { run(); } finally { setFault(null); } return seen; };
/** `run` with a crash at boundary `at` */
const crashAt = (run: () => unknown, at: string) => { setFault((x) => { if (x === at) throw new Crash(at); }); try { assert.throws(run, Crash, `it reached ${at}`); } finally { setFault(null); } };

test("the pass, cut at every write boundary: the journal is durable before any record is touched, and the next start finishes it whole", () => {
  const clean = home();
  const want = afterRelease(clean, TWO, NOW);
  const end = snap(clean);
  const steps = boundaries(() => afterRelease(home(), TWO, NOW));
  assert.equal(steps[0], "pass journal: temp", "nothing is written before the journal");
  assert.equal(steps.at(-1), "pass marker: rename", "the marker is written last");
  assert.ok(steps.includes("pass things/days/record.json: rename") && steps.includes("pass things/plan/record.json: rename"));
  assert.equal(steps.filter((s) => s.startsWith("pass things/")).length, 2 * 5, "two version files and three records, each a temp and a rename");
  for (const at of steps) {
    const h = home();
    crashAt(() => afterRelease(h, TWO, NOW), at);
    if (steps.indexOf(at) >= 2) {
      // past the journal's rename: it holds every original and the plan
      const j = JSON.parse(readFileSync(join(h, JOURNAL_DIR, "2.journal"), "utf8"));
      assert.deepEqual(j.originals.map((o: { path: string; text: string | null }) => [o.path, o.text === null]), [["things/days/v2.html", true], ["things/days/record.json", false], ["things/notes/v2.html", true], ["things/notes/record.json", false], ["things/plan/record.json", false]]);
      assert.equal(j.originals[1].text, readFileSync(join(FIX, "home/things/days/record.json"), "utf8"), "the original record, byte for byte");
      assert.equal(existsSync(join(h, PASS_FILE)), false, "no marker yet");
    }
    const began = steps.indexOf(at) >= 2;
    // the next start, a day later: a pass begun is finished as journalled (its own date); one not begun runs anew
    const again = afterRelease(h, TWO, began ? new Date("2026-11-07T09:00:00Z") : NOW);
    assert.deepEqual(again, want, `cut at ${at}: the next start finishes the same pass`);
    assert.deepEqual(snap(h), end, `cut at ${at}: the home reads what an uncut pass leaves`);
    // and its undo still puts everything back
    assert.deepEqual(undoPass(h), { undone: ["days", "notes", "plan"], kept: [] });
    for (const id of ["days", "notes", "plan"]) assert.equal(readFileSync(join(h, "things", id, "record.json"), "utf8"), readFileSync(join(FIX, "home/things", id, "record.json"), "utf8"));
    rmSync(dirname(h), { recursive: true, force: true });
  }
  rmSync(dirname(clean), { recursive: true, force: true });
});

test("the undo, cut at every write boundary: the next start or the next press finishes it whole, as it was decided", () => {
  const prep = () => { const h = home(); afterRelease(h, TWO, NOW); const d = JSON.parse(readFileSync(join(h, "things/days/record.json"), "utf8")); writeFileSync(join(h, "things/days/record.json"), JSON.stringify({ ...d, current: 3, versions: [...d.versions, { v: 3, file: "v2.html", at: "2026-11-07", contract: 2 }] })); return h; };
  const clean = prep();
  const want = undoPass(clean);
  assert.deepEqual(want, { undone: ["notes", "plan"], kept: ["days"] });
  const end = snap(clean);
  const fresh = prep();
  const steps = boundaries(() => undoPass(fresh));
  rmSync(dirname(fresh), { recursive: true, force: true });
  assert.deepEqual([steps[0], steps.at(-1)], ["undo journal: temp", "undo marker: rename"]);
  assert.equal(steps.filter((s) => s.startsWith("undo things/")).length, 2 * 2, "two records put back, each a temp and a rename");
  for (const at of steps) for (const resume of ["start", "press"] as const) {
    const h = prep();
    crashAt(() => undoPass(h), at);
    if (steps.indexOf(at) > steps.indexOf("undo things/notes/record.json: rename")) {
      assert.equal(JSON.parse(readFileSync(join(h, "things/notes/record.json"), "utf8")).contract, 1, "notes is already back: a retry must not take it as changed since");
    }
    const began = steps.indexOf(at) >= 2;   // past the undo journal's rename
    if (resume === "start") {
      afterRelease(h, TWO, NOW);
      if (began) assert.equal(undoPass(h), null, `cut at ${at}: finished at start, so undo is once`);
      else assert.deepEqual(undoPass(h), want, `cut at ${at}: nothing had begun, the card's undo still runs it`);
    } else {
      assert.deepEqual(undoPass(h), want, began ? `cut at ${at}: the press finishes the undo as decided` : `cut at ${at}: nothing had begun, the press runs it`);
    }
    assert.deepEqual(snap(h), end, `cut at ${at}, resumed at the ${resume}: the home reads what an uncut undo leaves`);
    assert.equal(passWire(h), null);
    rmSync(dirname(h), { recursive: true, force: true });
  }
  rmSync(dirname(clean), { recursive: true, force: true });
});

test("a journal half written (never renamed in) is nothing; a damaged one stops the pass and touches nothing", () => {
  const h = home();
  mkdirSync(join(h, JOURNAL_DIR));
  writeFileSync(join(h, JOURNAL_DIR, "2.journal.tmp"), "{ \"kind\": \"pa");
  assert.ok(afterRelease(h, TWO, NOW), "a temp journal is cleared and the pass runs");
  assert.equal(existsSync(join(h, JOURNAL_DIR, "2.journal.tmp")), false);
  const d = home(), before = snap(d);
  mkdirSync(join(d, JOURNAL_DIR));
  writeFileSync(join(d, JOURNAL_DIR, "2.journal"), "{ not json");
  assert.throws(() => afterRelease(d, TWO, NOW), /damaged/);
  const { [`${JOURNAL_DIR}/2.journal`]: _j, ...after } = snap(d);
  assert.deepEqual(after, before, "no record touched");
  assert.deepEqual(recover(h), { pass: [], undo: [] }, "a finished home has nothing to recover");
  rmSync(dirname(h), { recursive: true, force: true });
  rmSync(dirname(d), { recursive: true, force: true });
});

// ---- every custom property the face reads has a source (#635's second read, finding 5) ----
test("every var(--name) under sol/mac/src is supplied: by tokens.css or palette.css (generated), a hand-written css declaration, or a property the code sets", () => {
  const SRC = join(SOL, "mac/src");
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules") walk(p); } else if (/\.(css|tsx?|html)$/.test(n)) files.push(p); } };
  walk(SRC);
  const text = Object.fromEntries(files.map((f) => [f.slice(SRC.length + 1), readFileSync(f, "utf8")]));
  const names = (s: string, re: RegExp) => new Set([...s.matchAll(re)].map((m) => m[1]));
  const DECL = /(?<![\w-])--([a-zA-Z0-9_-]+)\s*:/g;
  // the generated sources: what tokens.mjs writes, never edited
  const generated = new Set([...names(tokens.outputs(tokens.readTokens()).filter(([rel]: [string]) => rel.endsWith(".css")).map(([, t]: [string, string]) => t).join("\n"), DECL)]);
  assert.ok(generated.has("ink") && generated.has("error") && generated.has("red-strong"), "tokens.css and palette.css supply the contract's names");
  // the intentional hand-written sources: a css declaration in a face css file, and a property the code sets on an element
  const handCss = new Set<string>(), setByCode = new Set<string>();
  for (const [rel, t] of Object.entries(text)) {
    if (rel === "tokens.css" || rel === "palette.css") continue;
    if (rel.endsWith(".css")) for (const n of names(t.replace(/\/\*[\s\S]*?\*\//g, ""), DECL)) handCss.add(n);
    else {
      for (const n of names(t, /setProperty\(\s*["'`]--([a-zA-Z0-9_-]+)/g)) setByCode.add(n);
      for (const n of names(t, /\[?\s*["'`]--([a-zA-Z0-9_-]+)["'`](?:\s+as\s+\w+)?\s*\]?\s*:/g)) setByCode.add(n);   // a React style object's key
    }
  }
  // known gaps, each said: a name nobody supplies, read only through its fallback (filed to be fixed apart)
  const GAPS: Record<string, string> = { "r-m": "counts.css reads var(--r-m, 12px); no token supplies --r-m, so its 12px fallback always shows" };
  const unsupplied: string[] = [];
  for (const [rel, t] of Object.entries(text)) {
    for (const n of names(t, /var\(\s*--([a-zA-Z0-9_-]+)/g)) {
      if (generated.has(n) || handCss.has(n) || setByCode.has(n) || n in GAPS) continue;
      unsupplied.push(`--${n} (${rel})`);
    }
  }
  assert.deepEqual([...new Set(unsupplied)], [], "a var(--name) with no source: add it to tokens.json (and run tokens.mjs) or declare it by hand where it is meant");
  for (const n of Object.keys(GAPS)) assert.ok(!generated.has(n) && !handCss.has(n) && !setByCode.has(n), `--${n} is supplied now: take it off GAPS`);
  // and the check bites: a reference to a name nobody supplies is caught
  assert.equal(["nobody-sets-this"].some((n) => generated.has(n) || handCss.has(n) || setByCode.has(n)), false);
});
