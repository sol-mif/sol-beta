// BR1 root part 2 (#1615, mine/look/br1/strategy/root.html): what a place is. placeOf is the one source of a folder's
// name, state, line and counts; a quiet session counts as much as a working one, so a folder is "empty" only when every
// count is 0. With invented people: Denise (a writer: Life folders of notes and pages) and Dev (a coder: one repo, its
// sessions in every state). Then every fixture scene, and the lint: the copies placeOf replaced are gone from next/.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { countsOf, homeDirOf, insideOf, knowing, listed, placeFrom, placeOf, ranked, standOf, tilde, unnamed } from "./next/place.ts";
import type { Ask, Data, Piece, Region } from "./next/cv/types.ts";
import { tidyTitle, titleOf } from "./next/plane/layout.ts";

const R = (id: string, name: string, more: Partial<Region> = {}): Region => ({ id, name, kind: id.startsWith("h:") ? "life" : "code", ...more });
const S = (id: string, region: string, state: string, more: Partial<Piece> = {}): Piece => ({ id, region, kind: "session", name: id, state, term: { lines: [], waiting: null, stateWord: "" }, ...more });
const N = (id: string, region: string, kind = "sticky", text = "call the vet"): Piece => ({ id, region, kind, name: id, text });
const A = (id: string, piece: string): Ask => ({ id, rank: 1, piece, kind: "code", source: "test", text: "Merge it?", how: "inplace", answered: false });

// ---------------------------------------------------------------- Denise: a writer, Life folders, no sessions

const garden = R("h:garden", "Garden"), novel = R("h:novel", "The novel");
const deniseGarden = [N("g1", "h:garden"), N("g2", "h:garden", "sticky", "plant the bulbs")];
const deniseNovel = [N("n1", "h:novel", "page", "chapter three"), N("n2", "h:novel"), N("n3", "h:novel", "page", "the ending")];

test("Denise: notes only, nothing in hand: quiet, and it says what is inside", () => {
  const g = placeFrom(garden, deniseGarden, []);
  assert.deepEqual(g.counts, { asks: 0, working: 0, quiet: 0, done: 0, pieces: 2, files: 0 });
  assert.equal(g.state, "quiet");
  assert.equal(g.empty, false, "two notes: not empty");
  assert.equal(g.line, "Nothing running · two notes");
  assert.equal(g.name, "Garden");
  assert.equal(placeFrom(novel, deniseNovel, []).line, "Nothing running · two pages, one note");
});

test("Denise: an ask on a note makes the folder active: one needs you", () => {
  const g = placeFrom(garden, deniseGarden, [A("k1", "g2")]);
  assert.equal(g.state, "active");
  assert.equal(g.counts.asks, 1);
  assert.equal(g.line, "One needs you");
});

test("Denise says the novel is done, then keeps it: the state follows her, the counts stay", () => {
  const d = placeFrom(R("h:novel", "The novel", { done: true }), deniseNovel, []);
  assert.equal(d.state, "done");
  assert.equal(d.line, "Done · two pages, one note");
  const k = placeFrom(R("h:novel", "The novel", { done: true, kept: true }), deniseNovel, []);
  assert.equal(k.state, "kept");
  assert.equal(k.counts.pieces, 3, "kept: out of view, all of it intact");
});

// ---------------------------------------------------------------- Dev: a repo with sessions in every state

const api = R("w:/code/api", "api");
const devApi = [
  S("w1", api.id, "working", { files: 12 }), S("w2", api.id, "working", { files: 3 }), S("w3", api.id, "working"),
  S("a1", api.id, "working"),                                  // asks (an open ask on it)
  S("f1", api.id, "failed"),                                   // needs Dev: its last run failed
  S("d1", api.id, "done", { files: 40 }), S("d2", api.id, "idle", { copies: [{ name: "c", state: "merged" }] }),
  S("i1", api.id, "idle"), S("i2", api.id, "idle"), S("i3", api.id, "paused"), S("i4", api.id, "stopped"),
];

test("Dev: three in hand, two need him, two done, four at rest; files are what the pieces say", () => {
  const p = placeFrom(api, devApi, [A("k1", "a1")]);
  assert.deepEqual(p.counts, { asks: 2, working: 3, quiet: 4, done: 2, pieces: 11, files: 55 });
  assert.equal(p.state, "active");
  assert.equal(p.line, "Three in hand, two need you, two done");
});

test("Dev: two asks on one session count twice; the session itself is not counted again", () => {
  assert.equal(countsOf(devApi, [A("k1", "a1"), A("k2", "a1")]).asks, 3, "two asks on a1, and f1 failed");
});

test("Dev: a session waiting at its terminal, or a part asked, needs him", () => {
  const no = () => false;
  assert.equal(standOf(S("t", api.id, "working", { term: { lines: [], waiting: "y/n", stateWord: "" } }), no), "asks");
  assert.equal(standOf(S("t", api.id, "working", { term: { lines: [], waiting: null, stateWord: "tests: 2 failing" } }), no), "asks");
  assert.equal(standOf(S("p", api.id, "working", { parts: [S("p.1", api.id, "working")] }), (id) => id === "p.1"), "asks");
  assert.equal(standOf({ id: "s", region: api.id, kind: "starter", name: "s" }, no), "working");
});

test("Dev's old repo: 38 quiet sessions are inside it: never empty, never \"Nothing\"", () => {
  const old = Array.from({ length: 38 }, (_, i) => S("o" + i, "w:/code/old", "idle"));
  const p = placeFrom(R("w:/code/old", "old"), old, []);
  assert.equal(p.empty, false);
  assert.equal(p.counts.quiet, 38);
  assert.equal(p.counts.pieces, 38);
  assert.equal(p.line, "Nothing running · 38 sessions");
  assert.doesNotMatch(p.line, /nothing in it/i);
});

test("Dev's old repo with none of its 38 sessions drawn: the read's count is its line, never its name alone (scope 06:31)", () => {
  const p = placeFrom(R("w:/code/old", "old"), [], [], 0, 38);
  assert.equal(p.empty, false);
  assert.equal(p.line, "Nothing running · 38 sessions");
  assert.equal(placeFrom(R("w:/code/old", "old"), [N("n", "w:/code/old")], [], 0, 38).line, "Nothing running · 38 sessions, one note", "with a note beside them");
  assert.equal(placeFrom(R("w:/code/old", "old"), [S("d1", "w:/code/old", "done"), S("d2", "w:/code/old", "done")], [], 0, 38).line, "Nothing running · 38 sessions", "two drawn done of the 38 are not \"Two sessions done\"");
  const drawn = Array.from({ length: 40 }, (_, i) => S("o" + i, "w:/code/old", "idle"));
  assert.equal(placeFrom(R("w:/code/old", "old"), drawn, [], 0, 38).line, "Nothing running · 40 sessions", "more drawn than read: the drawn count");
  assert.equal(placeFrom(R("w:/code/old", "old"), [S("w", "w:/code/old", "working")], [], 0, 38).line, "One in hand", "an active folder's line is unchanged");
});

test("Dev: every session done reads as done, not as quiet", () => {
  assert.equal(placeFrom(api, [S("d1", api.id, "done"), S("d2", api.id, "done")], []).line, "Two sessions done");
});

test("an empty folder: empty only when every count is 0, and only then \"Nothing in it yet\"", () => {
  const p = placeFrom(R("w:/code/new", "new"), [], []);
  assert.equal(p.empty, true);
  assert.ok(Object.values(p.counts).every((n) => n === 0));
  assert.equal(p.line, "Nothing in it yet");
  assert.equal(p.state, "quiet");
});

test("an empty folder Sol knows something about says what it knows, never \"Nothing in it yet\" (scope (e), try 5's my-sol)", () => {
  const p = placeFrom(R("w:/code/new", "new"), [], []);
  assert.equal(knowing(p, []).line, "Nothing in it yet", "knowing nothing: the empty line");
  const one = knowing(p, ["Has CLAUDE.md"]);
  assert.equal(one.line, "Has CLAUDE.md");
  assert.equal(one.bare, one.line, "a small card says the same");
  assert.equal(one.empty, true, "still no session there: its page still offers the first one");
  assert.equal(knowing(p, ["A repo", "Has CLAUDE.md", "Claude Code works here"]).line, "A repo · Has CLAUDE.md · 1 more");
  const busy = placeFrom(api, [S("d1", api.id, "done")], []);
  assert.equal(knowing(busy, ["A repo"]).line, busy.line, "a folder with sessions keeps its own line");
});

test("a session named by its first words: no raw home path, never a cut word (scope (c), try 5's Done list)", () => {
  assert.equal(tidyTitle("You are the agent of the folder la245 (/Users/someone/comp…"), "You are the agent of the folder la245…");
  assert.equal(tidyTitle("Read /home/you/notes/plan.md and tidi…"), "Read ~/notes/plan.md and…");
  assert.equal(tidyTitle("Fix the login page"), "Fix the login page", "a whole name stays as it is");
  assert.equal(tidyTitle("Look at /Users/you/code/app"), "Look at ~/code/app");
  assert.equal(titleOf({ id: "s", region: "r", kind: "session", name: "You are the agent of the folder la245 (/Users/someone/comp…" }), "You are the agent of the folder la245…", "every view's title");
});

test("before the engine's sessions are heard a folder is not read yet, never empty: \"Reading…\", then the right line (BR1 hold, scope 09:48)", async () => {
  const p = placeFrom(R("w:/code/new", "new"), [], [], 0, 0, false);
  assert.equal(p.line, "Reading…");
  assert.equal(p.empty, false, "not yet heard: no empty state");
  assert.equal(placeFrom(R("w:/code/new", "new"), [], [], ["Garden"], 0, false).line, "Inside: Garden", "its folders are known: said");
  assert.equal(placeFrom(R("w:/code/new", "new"), [], [], 0, 38, false).line, "Nothing running · 38 sessions", "the read's count is known: said, in the words pass's quiet word");
  // live, through the plane's wire: every folder is drawn before work.sessions comes
  const { attach } = await import("./next/cv/wire/plane.ts");
  CV.setMode("live");
  try {
    CV.setData({ regions: [R("w:/code/api", "api"), R("w:/code/new", "new")], pieces: {}, asks: {}, ais: [] });
    const subs = new Set<(m: unknown) => void>();
    const off = attach({ subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => subs.delete(f); }, send: () => true } as never) as () => void;
    assert.equal(placeOf("w:/code/api").line, "Reading…", "a folder with sessions, before they are loaded");
    assert.notEqual(placeOf("w:/code/new").line, "Nothing in it yet");
    for (const f of subs) f({ type: "work.sessions", projects: [{ path: "/code/api", name: "api" }, { path: "/code/new", name: "new" }], sessions: [{ id: "s1", project: "/code/api", title: "fix login" }] });
    assert.equal(placeOf("w:/code/api").line, "Nothing running · one session", "loaded: its line");
    assert.equal(placeOf("w:/code/new").line, "Nothing in it yet", "loaded and every count 0: now empty");
    off();
    assert.equal(placeOf("w:/code/new").line, "Reading…", "a new engine is not heard yet");
  } finally { CV.setMode("fixture"); }
});

test("a folder made without a name is named by what is put in it; until then \"Folder\", the next free one", () => {
  const r = R("folder", "Folder", { named: false });
  assert.equal(placeFrom(r, [], []).name, "Folder");
  assert.equal(placeFrom(r, [S("s", "folder", "working", { name: "fix-login" })], []).name, "Fix login", "a session's task");
  assert.equal(placeFrom(r, [N("n", "folder", "sticky", "groceries for the weekend trip")], []).name, "groceries for the weekend", "a note's first words, whole");
  assert.equal(placeFrom(R("g", "Garden"), [S("s", "g", "working", { name: "fix-login" })], []).name, "Garden", "a name the person gave stays");
  assert.equal(unnamed(["Garden"]), "Folder");
  assert.equal(unnamed(["Folder", "folder 2"]), "Folder 3");
});

test("many kinds: the two biggest, then the rest as one count", () => {
  const ps = [N("a", "x"), N("b", "x"), N("c", "x", "page"), N("d", "x", "list"), N("e", "x", "row")];
  assert.equal(placeFrom(R("x", "x"), ps, []).line, "Nothing running · two notes, one page, two more things");
});

// ---------------------------------------------------------------- placeOf on the store: every scene

test("every fixture scene: placeOf counts everything a folder holds; \"Nothing\" only on a folder with nothing", () => {
  let seen = 0;
  for (const name of Object.keys(CV.SCEN)) {
    if (!CV.load(name)) continue;
    for (const r of CV.D.regions) {
      const p = placeOf(r.id), n = CV.piecesIn(r.id).length;
      assert.equal(p.counts.pieces, n, `${name}: ${r.id}`);
      assert.equal(p.empty, n === 0, `${name}: ${r.id} empty`);
      assert.equal(/^Nothing in it/.test(p.line), n === 0, `${name}: ${r.id} says "${p.line}" with ${n} inside`);
      assert.equal(ranked(r.id).length, CV.piecesIn(r.id).filter((x) => !x.inside).length, `${name}: ${r.id}: the contents card lists the quiet ones too`);
      seen++;
    }
  }
  assert.ok(seen > 10, "the scenes hold folders");
});

test("placeOf follows the store: an ask raised, the next read says so", () => {
  CV.load("denise");
  const r = CV.D.regions.find((x) => CV.piecesIn(x.id).length)!, pc = CV.piecesIn(r.id)[0];
  const before = placeOf(r.id).counts.asks;
  CV.D.asks.kz = { ...A("kz", pc.id) };
  CV.render();
  assert.equal(placeOf(r.id).counts.asks, before + 1);
  assert.equal(placeOf(r.id).state, "active");
});

// ---------------------------------------------------------------- the place's other rules: which folders, one path form

test("listed: a work folder the read did not list is not drawn, unless added, kept or newer than the read", () => {
  const d: Data = { regions: [R("w:/a", "a", { from: "work" }), R("w:/b", "b", { from: "work" }), R("w:/c", "c", { from: "work" }), R("w:/d", "d", { from: "work" })], pieces: {
    sb: S("sb", "w:/b", "idle"), sc: S("sc", "w:/c", "working", { born: 200 }) }, asks: { kb: A("kb", "sb") }, ais: [] };
  listed(d, [{ id: "w:/a", n: "a" }, { id: "h:trip", n: "Trip", z: "Life" }], { kept: ["w:/k"], added: ["/d"], at: 100 });
  assert.deepEqual(d.regions.map((r) => r.id).sort(), ["h:trip", "w:/a", "w:/c", "w:/d", "w:/k"]);
  assert.ok(!d.pieces.sb && !d.asks.kb, "an unlisted folder's sessions and asks go with it");
  assert.ok(d.pieces.sc, "a session started after the read is the person's: kept");
});

test("listed: every folder of the engine's one list is drawn, with no session in it and before the read answers", () => {
  const folders = [{ id: "w:/u/lucy/api", name: "API", path: "/u/lucy/api" }, { id: "h:health", name: "health" }, { id: "w:/u/lucy/notes", name: "notes", path: "/u/lucy/notes" }];
  // a reload: next.state's `folders` first, no read yet, no session anywhere
  const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
  listed(d, [], { kept: [], added: [], at: 0, folders });
  assert.deepEqual(d.regions.map((r) => [r.id, r.name, r.kind, r.from, r.path]), [
    ["w:/u/lucy/api", "API", "code", "work", "/u/lucy/api"], ["h:health", "health", "life", "places", undefined], ["w:/u/lucy/notes", "notes", "code", "work", "/u/lucy/notes"]]);
  // the read: notes is a folder of the person's life, its row says so; api already drawn stays one
  const e: Data = { regions: [R("w:/u/lucy/api", "api", { from: "work" })], pieces: {}, asks: {}, ais: [] };
  listed(e, [{ id: "w:/u/lucy/api", n: "api" }, { id: "w:/u/lucy/notes", n: "notes", z: "Life" }], { kept: [], added: [], at: 0, folders });
  assert.deepEqual(e.regions.map((r) => r.id).sort(), ["h:health", "w:/u/lucy/api", "w:/u/lucy/notes"]);
  assert.equal(e.regions.find((r) => r.id === "w:/u/lucy/notes")!.kind, "life");
});

test("a path in one form: the home from an app's label, else /Users/<name>; under it ~/…", () => {
  const home = homeDirOf([{ path: "/Users/you/code/api", label: "~/code/api" }]);
  assert.equal(home, "/Users/you");
  assert.equal(homeDirOf([{ path: "/home/someone/notes" }]), "/home/someone");
  assert.equal(tilde("/Users/you/code/api", home), "~/code/api");
  assert.equal(tilde("/Volumes/ext/scans", home), "/Volumes/ext/scans");
});

// ---------------------------------------------------------------- the lint: the copies placeOf replaced are gone

const NEXT = fileURLToPath(new URL("./next/", import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = dir + f; return statSync(p).isDirectory() ? files(p + "/") : /\.tsx?$/.test(f) ? [p] : []; });
test("the old place sites are gone from next/: no signals(), moved(), sessionsWords, smallOf, reg(), fixed folder labels", () => {
  const GONE: [RegExp, string][] = [
    [/export function signals\(/, "signals()"], [/export function moved\(/, "moved()"], [/sessionsWords/, "sessionsWords"], [/\bsmallOf\b/, "smallOf"],
    [/const reg\s*=\s*\(/, "the sidebar's reg()"], [/["'`]New folder["'`]/, "a fixed \"New folder\""], [/Nothing inside/, "\"Nothing inside\""],
    [/function homeOf\(places/, "the move-in's own homeOf"], [/export function listed\(d: typeof D/, "the move-in's own listed()"],
  ];
  const hits: string[] = [];
  for (const f of files(NEXT)) {
    const t = readFileSync(f, "utf8"), at = f.slice(NEXT.length);
    for (const [re, what] of GONE) if (re.test(t)) hits.push(`${at}: ${what}`);
    if (at.startsWith("cv/wire/") && /\bfiles: 0\b/.test(t)) hits.push(`${at}: the wire's files: 0 (no engine message gives them)`);
  }
  assert.deepEqual(hits, []);
});

// BR1 (orchestrator 07:32, #1615): a folder's card line names the folders in it, where it said ", N folders"
test("a card line names the folders inside: none, one, two, seven", () => {
  const seven = ["Garden", "Kids", "Trips", "Taxes", "Car", "Recipes", "Books"];
  assert.equal(insideOf([]), "");
  assert.equal(insideOf(["Garden"]), "inside: Garden");
  assert.equal(insideOf(["Garden", "Kids"]), "inside: Garden and Kids");
  assert.equal(insideOf(seven), "inside: Garden, Kids and 5 more");
  const house = R("h:house", "House"), notes = [N("n1", "h:house"), N("n2", "h:house")];
  assert.equal(placeFrom(house, notes, [], []).line, "Nothing running · two notes", "0: no tail");
  assert.equal(placeFrom(house, notes, [], ["Garden"]).line, "Nothing running · two notes · inside: Garden");
  assert.equal(placeFrom(house, notes, [], ["Garden", "Kids"]).line, "Nothing running · two notes · inside: Garden and Kids");
  assert.equal(placeFrom(house, notes, [], seven).line, "Nothing running · two notes · inside: Garden, Kids and 5 more");
  assert.equal(placeFrom(house, [], [], seven).line, "Inside: Garden, Kids and 5 more", "only folders: their names, never \"Nothing\"");
  assert.equal(placeFrom(R("w:/code/sol", "sol"), [S("w", "w:/code/sol", "working")], [], ["engine", "mac"]).line, "One in hand · inside: engine and mac", "an active line names them too");
  assert.equal(placeFrom(house, [], [], 0, 38).line, "Nothing running · 38 sessions", "the read's count, no folders");
  assert.ok(!/\bfolders?\b/.test(placeFrom(house, notes, [], seven).line), "no \", N folders\" tail left");
});
