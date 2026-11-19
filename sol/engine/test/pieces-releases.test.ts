// Pieces (#1092): releases, a tool that is one program (.sol/pieces/releases.mjs; S/design/tools.md 2). The release
// is named by the day in the project's zone; before the hour it goes out, after it it is late and wants him, a tag of
// today means it went out; nothing merged, no release. Only "Merge pull request" lines are rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const R = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "releases.mjs")).href);
const rhythm = { release: "09:00", zone: "America/New_York" };
const at = (iso: string) => new Date(iso);

test("the release by the day in its zone, and what it does at the hour", () => {
  assert.equal(R.tagOf(at("2026-11-13T03:00:00Z"), "America/New_York"), "dev-20261112", "11pm the night before, in New York");
  assert.equal(R.hourWords("09:00"), "9am");
  assert.equal(R.hourWords("21:30"), "9:30pm");
  const m = [{ id: "pr-1", t: "a" }];
  const before = R.releaseRows({ now: at("2026-11-13T12:00:00Z"), rhythm, lastTag: "dev-20261112", merges: m });
  assert.equal(before.rows[0].t, "dev-20261113 goes out at 9am");
  assert.equal(before.rows[0].wants, undefined, "before the hour nothing wants him");
  const late = R.releaseRows({ now: at("2026-11-13T15:00:00Z"), rhythm, lastTag: "dev-20261112", merges: m });
  assert.equal(late.rows[0].wants, true, "past the hour with no tag of today: it wants him");
  const out = R.releaseRows({ now: at("2026-11-13T15:00:00Z"), rhythm, lastTag: "dev-20261113", merges: [] });
  assert.match(out.rows[0].t, /went out/);
  const none = R.releaseRows({ now: at("2026-11-13T12:00:00Z"), rhythm, lastTag: "dev-20261112", merges: [] });
  assert.match(none.rows[0].t, /^nothing merged since dev-20261112/);
});

test("only a merged pull request is a row: its title, number and branch's owner", () => {
  const log = "Merge pull request #930 from org/frank/lens-824\x1fproduct: engine: The lens is one setting (#824)\n\nmore\x1e\nMerge branch 'main' into x\x1f\x1e";
  assert.deepEqual(R.mergesOf(log, "https://github.com/org/repo"), [{ id: "pr-930", t: "The lens is one setting", note: "#930 · frank", href: "https://github.com/org/repo/pull/930" }]);
});

test("clash: a file two parts change is a row, most parts first; none says so, done", async () => {
  const C = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "clash.mjs")).href);
  assert.equal(C.partOf("origin/marcocyl04-ux/n13-pieces"), "n13-pieces");
  const r = C.clashRows({ pieces: ["a/wire.ts", "b/x.ts"], screens: ["a/wire.ts"], world: ["a/wire.ts", "b/x.ts"], yours: ["c.ts"] }, "mine-run");
  assert.deepEqual(r.rows.map((x: { t: string }) => x.t), ["wire.ts: pieces, screens and world", "x.ts: pieces and world"]);
  assert.equal(r.line, "2");
  const none = C.clashRows({ pieces: ["a.ts"], world: ["b.ts"] }, "mine-run");
  assert.equal(none.rows[0].t, "no file was changed by two parts");
  assert.equal(none.rows[0].done, true);
});

test("who holds what: each label's leads from its path lines or its leads line; an area with no lead wants him", async () => {
  const W = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "who.mjs")).href);
  const text = "# intro\n# label base: the engine, the wire.\n/sol/engine/  @ana-x\n/a /b  @ana-x @ben-y\n# label social: Life with others. No code.\n# leads: @ben-y\n# label sales: deals.\n";
  const a = W.areasOf(text);
  assert.deepEqual(a.map((x: { area: string; leads: string[]; paths: number }) => [x.area, x.leads, x.paths]), [["base", ["ana-x", "ben-y"], 3], ["social", ["ben-y"], 0], ["sales", [], 0]]);
  const r = W.whoRows(a);
  assert.equal(r.line, "2");
  assert.deepEqual(r.rows.find((x: { id: string }) => x.id === "none-sales"), { id: "none-sales", t: "sales: no lead", note: "deals", wants: true, group: "nobody" });
  assert.equal(r.rows.find((x: { id: string }) => x.id === "ben-y-social").note, "Life with others · no code yet");
});

test("gate: a result is the commit, green or each red step in words, and how long ago", async () => {
  const G = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "gate.mjs")).href);
  const at = "2026-11-13T12:00:00Z", now = Date.parse(at) + 90 * 60_000;
  const red = G.gateRow({ sha: "a".repeat(40), at, green: false, dirty: true, steps: [{ name: "lint", ok: false, failed: ["x", "y"] }, { name: "build", ok: true }, { name: "e2e", ok: false, failed: ["e2e:did-not-run"] }] }, "a change", now);
  assert.deepEqual(red, { id: "gate-aaaaaaaaaaaa", t: "red: lint 2, e2e did not run · with changes of its own", note: "aaaaaaaa · a change", fig: "2 h" });
  assert.equal(G.gateRow({ sha: "b".repeat(40), at, green: true, steps: [] }, "", now).t, "green");
});

test("design pages: a page by its title, newest change first, grouped by folder, opened on GitHub at the branch", async () => {
  const D = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "design.mjs")).href);
  assert.equal(D.pageName("a/x.html", "<title>The chat bar, flat · round 2</title>"), "The chat bar, flat");
  assert.equal(D.pageName("a/x.html", "<title>Sol: one spine, four ways</title>"), "Sol: one spine, four ways");
  assert.equal(D.pageName("look/world/index.html", ""), "world");
  assert.equal(D.pageName("look/two-layers.html", ""), "two layers");
  assert.equal(D.webOf("git@github.com:example/proj.git"), "https://github.com/example/proj");
  assert.equal(D.webOf("https://github.com/example/proj.git"), "https://github.com/example/proj");
  assert.equal(D.webOf("/tmp/example"), null);
  const now = Date.parse("2026-11-13T12:00:00Z");
  const rows = D.pageRows([
    { path: "sol/design/home/a.html", name: "old one", at: now - 3 * 86_400_000, subject: "an old change" },
    { path: "mine/look/b.html", name: "new one", at: now - 2 * 3_600_000, subject: "" },
  ], { web: "https://github.com/example/proj", branch: "x/y", now, max: 12 });
  assert.deepEqual(rows.map((r) => [r.t, r.fig, r.group, r.note]), [["new one", "2 h", "mine/look", "mine/look"], ["old one", "3 d", "design/home", "an old change"]]);
  assert.equal(rows[0].href, "https://github.com/example/proj/blob/x/y/mine/look/b.html");
  assert.equal(D.pageRows(rows.map(() => ({ path: "a.html", name: "a", at: 0 })), { web: null, branch: "x" })[0].href, undefined);
});

test("legacy map: what replaced each old part in a few words; an old part still in the code comes first", async () => {
  const L = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "legacy.mjs")).href);
  assert.equal(L.replacedBy({ note: "Replaced by the blob (Blob.tsx, look A, #1). Its old code has a record." }), "now the blob");
  assert.equal(L.replacedBy({ note: "Replaced by: the card (#2; #3). More." }), "now the card");
  assert.equal(L.replacedBy({ note: "Removed in #4; nothing replaced it." }), "Removed in #4; nothing replaced it.");
  assert.equal(L.replacedBy({ failsafe: "none yet", about: "The old row." }), "The old row.");
  assert.equal(L.replacedBy({ failsafe: "Read its notes first." }), "Read its notes first.");
  const rows = L.legacyRows([
    { r: { id: "legacy/a", name: "Gone one" }, left: 0 },
    { r: { id: "legacy/b", name: "One left" }, left: 1 },
    { r: { id: "legacy/c", name: "Three left" }, left: 3 },
  ]);
  assert.deepEqual(rows.map((r) => [r.t, r.group, r.fig, r.id]), [
    ["Three left", "still in the code", "3 files", "legacy-c"], ["One left", "still in the code", "1 file", "legacy-b"], ["Gone one", "gone from the code", "", "legacy-a"]]);
});

test("switches: a row file's switch by its label, its first sentence and where it sits; the oldest first in each place", async () => {
  const W = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "switches.mjs")).href);
  const src = `export function R() { if (!sh || sh.sel !== "switches") return null;
    return <div className="lab"><span>the thing</span><small>It does one thing{on && <> · <button onClick={go}>show me</button></>}. More words. Experimental</small></div><Switch on={on} />; }`;
  assert.deepEqual(W.switchRows(src), [{ label: "the thing", what: "It does one thing.", where: "Build settings › switches" }]);
  assert.deepEqual(W.switchRows(src.replace(`"switches"`, `"me"`))[0].where, "Sol settings › me");
  assert.deepEqual(W.switchRows(src.replace("<Switch", "<Other")), [], "a labelled row with no switch is no switch");
  assert.deepEqual(W.switchRows(src.replace(/sh\.sel !== "switches"/, "x")), [], "a file with no section is a settings page, not a switch row");
  const now = Date.parse("2026-11-13T12:00:00Z");
  const rows = W.rowsOf([
    { label: "new", what: "", where: "Build settings › switches", since: now - 3_600_000 },
    { label: "old", what: "", where: "Build settings › switches", since: now - 5 * 86_400_000 },
    { label: "home", what: "", where: "Sol settings › me", since: now - 86_400_000 * 9 },
  ], now);
  assert.deepEqual(rows.map((r) => [r.t, r.fig]), [["old", "5 d"], ["new", "1 h"], ["home", "9 d"]]);
  assert.equal(W.rowsOf([{ label: "a", what: "It does.", where: "x", since: now - 2 * 86_400_000 }], now)[0].note, "2 d · It does.");
});

test("taste log: his words in front, what they were about beside them, newest day first; both ways the log writes a line", async () => {
  const T = await import(pathToFileURL(join(import.meta.dirname, "..", "..", "..", ".sol", "pieces", "taste.mjs")).href);
  assert.deepEqual(T.entryOf(`- 2026-11-08 15:50 · on the board (board.html): "make it easy". More.`), { day: "2026-11-08", when: "15:50", about: "on the board", words: "make it easy" });
  assert.deepEqual(T.entryOf(`- 2026-11-12, the room (was "one"), his frame: "two parts" and more`), { day: "2026-11-12", when: "", about: "the room, his frame", words: "two parts" });
  assert.equal(T.entryOf(`- 2026-11-12, a pick: no quote here, just words.`).words, "no quote here, just words.");
  assert.equal(T.entryOf("Read when: drawing a visual."), null);
  assert.equal(T.entryOf("# Taste"), null);
  assert.equal(T.cut("a ".repeat(100).trim(), 20).length <= 20, true);
  assert.equal(T.cut("short"), "short");
  const rows = T.tasteRows([T.entryOf(`- 2026-11-05 · old: "a"`.replace(`"a"`, `"old one"`)), T.entryOf(`- 2026-11-12, first: "early"`), T.entryOf(`- 2026-11-12, second: "late"`)]);
  assert.deepEqual(rows.map((r) => [r.note, r.t]), [["11-12 · second", "late"], ["11-12 · first", "early"], ["11-05 · old", "old one"]]);
});
