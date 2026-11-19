// node --test src/sideSort.test.ts: Build's side sorted by what a session asks of you (home/sideSort.ts, 2026-11-11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortSide, steadySide, foldUnder, underWords, orchSays } from "./home/sideSort.ts";
import { readFileSync } from "node:fs";
import { DAY, type Row, type St } from "./home/sideRows.ts";

const NOW = 1_800_000_000_000;
const r = (id: string, ago: number, more: Partial<Row> = {}): Row => ({ id, title: id, cwd: "/p/sol", project: "/p/sol", updatedAt: NOW - ago, ...more });
const states: Record<string, St> = {};
const st = (x: Row): St => states[x.id] ?? "";
const ids = (ls: { row: Row }[]) => ls.map((l) => l.row.id);

test("each session sits in the first place that fits: needs you, pinned, running, its project, earlier", () => {
  Object.assign(states, { a: "needs", b: "running", c: "running", f: "unread" });
  const s = sortSide([r("a", 9 * DAY), r("b", 0), r("c", 0, { pinned: true }), r("d", 1000), r("e", 2 * DAY), r("f", 5 * DAY), r("g", 8 * DAY), r("h", 1000, { done: true }), r("i", 2 * DAY, { done: true })], st, { stay: 1 }, NOW);
  assert.deepEqual(ids(s.needs), ["a"]);            // however old
  assert.deepEqual(ids(s.pinned), ["c"]);           // pinned wins over running
  assert.deepEqual(ids(s.running), ["b", "f"]);     // at work; finished and not opened yet, however long ago
  assert.deepEqual(ids(s.projects[0].lines), ["d"]);        // touched today
  assert.deepEqual(ids(s.earlier), ["h", "e"]);     // done today; quiet past a day
  // g (over a week) and i (done, over a day) are find's
});

test("a session run by an orchestrator has no line of its own and lifts it", () => {
  for (const k of Object.keys(states)) delete states[k];
  Object.assign(states, { k1: "needs" });
  const O = { kind: "orchestration" as const };
  const s = sortSide([r("o", 3 * DAY, O), r("k1", 0, { under: "o", ...O }), r("k2", 1000, { under: "k1" }), r("old", 9 * DAY, { under: "o" })], st, { stay: 1 }, NOW);
  assert.deepEqual(ids(s.needs), ["o"]);
  assert.equal(s.needs[0].st, "needs");
  assert.deepEqual(s.needs[0].kids.map((k) => k.id), ["k1", "k2"]);   // an orchestrator under one sits with its own under the top; the week-old one is find's
});

test("starting a session never folds it: a parent-only session is a row by recency (Marco 2026-11-14)", () => {
  for (const k of Object.keys(states)) delete states[k];
  const s = sortSide([r("p", 2000), r("k", 1000, { parent: "p" }), r("o", 3000, { kind: "orchestration" }), r("k2", 500, { parent: "o" })], st, { stay: 1 }, NOW);
  assert.deepEqual(ids(s.projects[0].lines), ["k2", "k", "p", "o"]);
  assert.ok(s.projects[0].lines.every((l) => l.kids.length === 0));   // started by an orchestrator is not run by it
});

test("under folds only under an orchestration row; one archived or normal lets it loose", () => {
  for (const k of Object.keys(states)) delete states[k];
  const s = sortSide([r("n", 3000), r("a", 1000, { under: "n" }), r("o", 2000, { kind: "orchestration" }), r("b", 500, { under: "o", parent: "n" }),
    r("x", 4000, { kind: "orchestration", archived: true }), r("c", 100, { under: "x" })], st, { stay: 1 }, NOW);
  const lines = s.projects[0].lines;
  assert.deepEqual(ids(lines), ["c", "a", "o", "n"]);
  assert.deepEqual(lines.find((l) => l.row.id === "o")!.kids.map((k) => k.id), ["b"]);
});

test("an orchestrator's state is the worst of its children's: needs you over running over idle", () => {
  for (const k of Object.keys(states)) delete states[k];
  const O = { kind: "orchestration" as const };
  Object.assign(states, { r1: "running", r2: "running", n2: "needs" });
  const s = sortSide([r("o1", 2 * DAY, O), r("r1", 1000, { under: "o1" }), r("i1", 1000, { under: "o1" }),
    r("o2", 2 * DAY, O), r("r2", 1000, { under: "o2" }), r("n2", 1000, { under: "o2" }), r("o3", 1000, O), r("i3", 1000, { under: "o3" })], st, { stay: 1 }, NOW);
  assert.deepEqual(s.needs.map((l) => [l.row.id, l.st]), [["o2", "needs"]]);
  assert.deepEqual(s.running.map((l) => [l.row.id, l.st]), [["o1", "running"]]);
  assert.deepEqual(s.projects[0].lines.map((l) => [l.row.id, l.st]), [["o3", ""]]);
});

test("a session that is held keeps its place among the active ones", () => {
  for (const k of Object.keys(states)) delete states[k];
  const s = sortSide([r("here", 1000), r("other", 1000)], st, { stay: 1, held: (x) => x.id === "here" }, NOW);
  assert.deepEqual(ids(s.running), ["here"]);
  assert.deepEqual(ids(s.projects[0].lines), ["other"]);
});

test("Home's sessions stay in Home; archived and deleted never show", () => {
  for (const k of Object.keys(states)) delete states[k];
  const s = sortSide([r("x", 0, { project: "/home/jobs" }), r("y", 0, { archived: true }), r("z", 0, { gone: true }), r("ok", 0)], st, { stay: 1, isHome: (x) => x.project === "/home/jobs" }, NOW);
  assert.deepEqual(ids(s.projects.flatMap((p) => p.lines)), ["ok"]);
});

test("an orchestration row's words: how many it runs, and how many need you", () => {
  assert.equal(underWords(["", "running"]), "2 under");
  assert.equal(underWords(["needs", "running", ""]), "3 under, 1 needs you");
  assert.equal(underWords(["needs", "needs"]), "2 under, 2 need you");
  assert.equal(underWords([]), "nothing under yet", "an orchestration row with nothing under it still says what it is");
});

test("G3: in a hold tray an orchestration row that runs or asks you says so; the \"n under\" words only when idle", () => {
  assert.equal(orchSays(true, "running"), "state");
  assert.equal(orchSays(true, "needs"), "state");
  for (const st of ["", "unread", "failed", "done"] as St[]) assert.equal(orchSays(true, st), "under", `idle in a tray (${st || "none"})`);
  for (const st of ["running", "needs", ""] as St[]) assert.equal(orchSays(false, st), "under", "outside the trays: always its words");
  const src = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  assert.match(src, /o\.orch && orchSays\(!!o\.hold, s0\) === "under" \?/, "the row reads orchSays");
  assert.match(src, /o\.hold && s0 === "needs" \? <span className="hc-when hd-said hd-asks">asks you<\/span>/);
  assert.match(src, /\{since && !o\.orch \? when\(since\) : "running"\}/, "an orchestration row says \"running\", not how long");
});

test("G5: one rule for a pinned child, both sidebars: it stays under its orchestrator, pinned marked inside the fold", () => {
  for (const k of Object.keys(states)) delete states[k];
  const O = { kind: "orchestration" as const };
  const all = [r("o", 1000, O), r("p", 9 * DAY, { under: "o", pinned: true }), r("q", 1000, { under: "o", pinned: true }), r("x", 1000)];
  const s = sortSide(all, st, { stay: 1 }, NOW);
  assert.deepEqual(ids(s.pinned), [], "no pinned child is pulled out to the pinned tray");
  const line = foldUnder(all, st, NOW).find((l) => l.row.id === "o")!;
  assert.deepEqual(line.kids.map((k) => k.id).sort(), ["p", "q"], "a pinned child shows in the fold however old");
  const side = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8"), css = readFileSync(new URL("./home/side.css", import.meta.url), "utf8");
  // an orchestration row has no pin over its words (its left mark is the fold), 2026-11-14
  assert.match(side, /o\.sec && \(!o\.kid \|\| s\.pinned\) && !o\.orch && naming !== s\.id && <span role="button" className=\{`hc-pin/, "a pinned child's pin on its row");
  assert.match(css, /\.hc-row\.hc-kid > \.hc-pin\.on \{ opacity: 1; \}/);
  const ws = readFileSync(new URL("./work/WorkSidebar.tsx", import.meta.url), "utf8");
  assert.match(ws, /const nests = \(s: WorkSession\) => !!s\.under && s\.under !== s\.id && orch\.has\(s\.under\);/, "Work's side: pinned and grouped nest too");
  assert.match(ws, /\{depth > 0 && s\.pinned && <small className="tag pin"/, "and mark the pin in the fold");
});

// ---- the fix round on #1191 (2026-11-14): the fold holds in every sort, the wide side too; nothing hides it
test("foldUnder: in any order given, the sessions an orchestrator runs leave the list and sit under it; the order of the rest holds", () => {
  for (const k of Object.keys(states)) delete states[k];
  Object.assign(states, { k2: "needs" });
  const O = { kind: "orchestration" as const };
  // the folder sort and the wide side hand it rows newest first; an orchestrator older than its children still holds them
  const rows = [r("k1", 100, { under: "o" }), r("n", 200), r("k2", 300, { under: "o" }), r("o", 5 * DAY, O), r("p", 400, { parent: "o" })];
  const ls = foldUnder(rows, st, NOW);
  assert.deepEqual(ids(ls), ["n", "o", "p"]);
  const o = ls.find((l) => l.row.id === "o")!;
  assert.deepEqual(o.kids.map((k) => k.id), ["k1", "k2"]);
  assert.equal(o.st, "needs", "lifted by the one that needs you");
  // the chain is read in `all`; a child whose orchestrator is filtered out of this list (the wide side's "needs you")
  // keeps a line of its own, never lost
  assert.deepEqual(ids(foldUnder([r("k2", 300, { under: "o" })], st, NOW, rows)), ["k2"]);
  // an orchestrator with nothing under it is a line of its own, with no kids
  assert.deepEqual(foldUnder([r("o", 0, O)], st, NOW)[0].kids, []);
});

test("sortSide groups by under the same way: the sorted side and foldUnder agree", () => {
  for (const k of Object.keys(states)) delete states[k];
  const O = { kind: "orchestration" as const };
  const rows = [r("o", 1000, O), r("k1", 500, { under: "o" }), r("n", 2000)];
  const s = sortSide(rows, st, { stay: 1 }, NOW);
  const lines = s.projects[0].lines;
  assert.deepEqual(lines.map((l) => [l.row.id, l.kids.map((k) => k.id)]), [["o", ["k1"]], ["n", []]]);
});

test("Side: every view folds by foldUnder; an orchestration row always has its fold and its class; no helpers' pref or line is left", () => {
  const side = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  const prefs = readFileSync(new URL("./home/sidePrefs.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("./Settings.tsx", import.meta.url), "utf8");
  assert.match(side, /foldUnder\(rows, st, Date\.now\(\), ws\.filter/, "the wide side (ws: work.sessions with the moves sent and not yet heard, sideUnder withPending)");
  assert.match(side, /const narrow = foldUnder\(/, "the folder sort");
  assert.match(side, /const ws = withPending\(w\.sessions, pending\);/);
  assert.match(side, /sortSide\(ws, st/, "the sorted side (sortSide folds by foldUnder)");
  assert.match(side, /const orch = l\.row\.kind === "orchestration"/, "the fold, whatever it holds");
  assert.match(side, /\$\{s\.kind === "orchestration" \? " hc-orch" : ""\}/);
  assert.doesNotMatch(side, /helpersWords|prefs\.helpers|hc-kids|hd-kids/);
  assert.doesNotMatch(prefs, /helpers:/);
  assert.doesNotMatch(settings, /p\.helpers/);
  // G4: the sidebar page is found by today's words, not the helpers' ones
  const shell = readFileSync(new URL("./settingsShell.tsx", import.meta.url), "utf8");
  const words = shell.match(/"sidebar": \{[^}]*words: "([^"]*)"/)?.[1] ?? "";
  for (const w of ["orchestration", "under", "promote", "demote"]) assert.ok(words.split(" ").includes(w), `the sidebar page answers "${w}"`);
  for (const w of ["helpers", "agents", "sub", "parent", "folded"]) assert.ok(!words.split(" ").includes(w), `no "${w}"`);
  const css = readFileSync(new URL("./home/side.css", import.meta.url), "utf8");
  assert.match(css, /\.hc-row\.hc-orch[^{]*\{ outline: var\(--hair\) solid var\(--hc-line\)/, "a hairline in the row's own line colour");
});

test("2026-11-17 steady (#1431): a busy session keeps its place in its tray; one arriving goes on top; only a tray change moves a row", () => {
  for (const k of Object.keys(states)) delete states[k];
  const mem = new Map<string, string[]>();
  for (const k of ["a", "b", "c"]) states[k] = "running";
  const O = { kind: "orchestration" as const };
  const draw = (rows: Row[]) => steadySide(mem, sortSide(rows, st, { stay: 1 }, NOW));
  assert.deepEqual(ids(draw([r("a", 3000), r("b", 2000), r("c", 1000)]).running), ["c", "b", "a"], "the first draw is newest first");
  assert.deepEqual(ids(draw([r("a", 10), r("b", 20), r("c", 1000)]).running), ["c", "b", "a"], "a and b wrote since: nobody moves");
  states.d = "running";
  assert.deepEqual(ids(draw([r("a", 10), r("b", 20), r("c", 30), r("d", 500)]).running), ["d", "c", "b", "a"], "one arriving goes on top");
  states.b = "needs";
  const s = draw([r("a", 5), r("b", 20), r("c", 30), r("d", 500)]);
  assert.deepEqual([ids(s.needs), ids(s.running)], [["b"], ["d", "c", "a"]], "a tray change moves it; the rest stay as they were");
  states.b = "running";
  assert.deepEqual(ids(draw([r("a", 5), r("b", 1), r("c", 30), r("d", 500)]).running), ["b", "d", "c", "a"], "back in its tray: on top, as any arrival");
  states.o = "running"; states.k1 = "running"; states.k2 = "running";
  const kids = (ago1: number, ago2: number) => draw([r("o", 100, O), r("k1", ago1, { under: "o" }), r("k2", ago2, { under: "o" })]).running.find((l) => l.row.id === "o")!.kids.map((k) => k.id);
  assert.deepEqual(kids(200, 100), ["k2", "k1"]);
  assert.deepEqual(kids(1, 100), ["k2", "k1"], "an orchestrator's children keep their order too");
  for (const k of ["a", "b", "c", "d"]) states[k] = "";
  const P = (key: string) => ({ cwd: key, project: key });
  const folders = (aAgo: number, bAgo: number) => draw([r("a", aAgo, P("/p/one")), r("b", bAgo, P("/p/two"))]).projects.map((p) => p.key);
  assert.deepEqual(folders(2000, 1000), ["/p/two", "/p/one"]);
  assert.deepEqual(folders(10, 1000), ["/p/two", "/p/one"], "folders keep their order as their sessions write");
});
