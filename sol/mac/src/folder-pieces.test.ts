// Pieces in Build's project folders (#1092, folderPieces/): the row's look as behaviour, its one figure, where a drop
// lands, the switch off by default. The engine's one-state-two-placements tests are sol/engine/test/pieces.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookOf, figureOf, dropTarget, everyWords, ago, stepsIn, CEILING_WORDS, isPieceId, againIn, keepsOnly, ownLine, sameNoteOf, one } from "./folderPieces/model.ts";
import { BUILD_PIECES, makePiecesSwitch, HOME_PIECES, makeHomePiecesSwitch } from "./folderPieces/flag.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(import.meta.dirname, p), "utf8");

const env = (search = "", kv: Record<string, string> = {}) => ({ storage: () => ({ getItem: (k: string) => kv[k] ?? null, setItem: (k: string, v: string) => { kv[k] = v; } }), search: () => search, target: null });

test("the switch is build.pieces, off by default, on by the link or this window's storage", () => {
  assert.equal(BUILD_PIECES, "build.pieces");
  assert.equal(makePiecesSwitch(env()).get(), false);
  assert.equal(makePiecesSwitch(env("?build.pieces=on")).get(), true);
  assert.equal(makePiecesSwitch(env("", { "build.pieces": "1" })).get(), true);
});

test("Home's pieces switch (#1123): home.pieces, off by default, the same store; its row is in Settings › home, found by \"pieces\"", () => {
  assert.equal(HOME_PIECES, "home.pieces");
  const kv: Record<string, string> = {};
  const sw = makeHomePiecesSwitch(env("", kv));
  assert.equal(sw.get(), false);
  let heard = 0; sw.sub(() => { heard++; });
  sw.set(true);
  assert.equal(kv["home.pieces"], "1", "the row writes the key the storage switch reads");
  assert.equal(heard, 1, "the folder hears it at once, no reload");
  assert.equal(makeHomePiecesSwitch(env("", kv)).get(), true, "a fresh read finds it on");
  // the row draws only in Home's section, and Settings puts it in Home's drawer (.tsx: read from the source)
  assert.match(src("folderPieces/HomePiecesRow.tsx"), /sh\.sel !== "home"/);
  const drawer = /<Drawer name="home"[^>]*>([\s\S]*?)<\/Drawer>/.exec(src("Settings.tsx"));
  assert.ok(drawer, "Settings has a home drawer");
  assert.match(drawer[1], /<HomePiecesRow \/>/);
  assert.equal(src("Settings.tsx").match(/<HomePiecesRow \/>/g)?.length, 1, "one row, in one place");
  // a search for "pieces" finds Home's section (its words), not only Build's switches
  const home = /^\s*"home": \{[^\n]*words: "([^"]*)"/m.exec(src("settingsShell.tsx"));
  assert.ok(home, "SECTIONS has home");
  assert.ok(home[1].split(" ").includes("pieces"));
});

test("a piece's row: at rest, working, wanting you or broken, by behaviour", () => {
  assert.equal(lookOf({ state: "live", wants: 0, at: 1 }), "rest");
  assert.equal(lookOf({ state: "working", wants: 0, at: 1 }), "working");
  assert.equal(lookOf({ state: "live", wants: 0, at: 0 }), "working", "never read yet: it is reading");
  assert.equal(lookOf({ state: "waits", wants: 2, at: 1 }), "you");
  assert.equal(lookOf({ state: "live", wants: 0, at: 1, error: "the address did not answer" }), "broken");
});

test("the row's one figure: what wants you, else a short line, else the count; never a sentence", () => {
  assert.equal(figureOf({ wants: 3, total: 9, at: 1 }), "3");
  assert.equal(figureOf({ wants: 0, total: 9, at: 1, line: "5 on" }), "5 on");
  assert.equal(figureOf({ wants: 0, total: 9, at: 1, line: "five builders running on two machines" }), "9");
  assert.equal(figureOf({ wants: 0, total: 0, at: 1 }), "");
  assert.equal(figureOf({ wants: 0, total: 4, open: 1, at: 1 }), "1", "answered rows are not counted");
  assert.equal(figureOf({ wants: 0, total: 4, open: 0, at: 1 }), "", "all answered: the row is quiet");
  assert.equal(figureOf({ wants: 0, total: 0, at: 0 }), "");
  assert.equal(figureOf({ wants: 0, total: 2, at: 1, error: "x" }), "!");
});

test("a drop lands in the session row under the hand first, else the stage under it, else nowhere", () => {
  assert.deepEqual(dropTarget({ sid: "s1", stage: "s2" }), { session: "s1", on: "row" });
  assert.deepEqual(dropTarget({ stage: "s2" }), { session: "s2", on: "stage" });
  assert.equal(dropTarget({}), null);
});

test("the page's words: the pulse, how long ago, the ceiling; a list body's steps", () => {
  assert.equal(everyWords(60), "every 60 s");
  assert.equal(everyWords(300), "every 5 min");
  assert.equal(everyWords(7200), "every 2 h");
  assert.equal(ago(0), "reading…");
  assert.equal(ago(1000, 1000 + 10_000), "now");
  assert.equal(ago(0 + 1, 1 + 600_000), "10 min ago");
  assert.match(CEILING_WORDS.draft, /asks before acting/);
  assert.deepEqual(stepsIn(JSON.stringify({ steps: [{ t: "a", st: "wait" }], line: "1 waits" })), { steps: [{ t: "a", st: "wait" }], line: "1 waits" });
  assert.deepEqual(stepsIn("not json"), { steps: [] });
});

test("over the open session's room before it has a stage, a drop seats in that session; over the side, nowhere", () => {
  assert.deepEqual(dropTarget({ main: true, live: "s9" }), { session: "s9", on: "stage" });
  assert.equal(dropTarget({ main: true, live: null }), null);
  assert.equal(dropTarget({ main: false, live: "s9" }), null);
});

test("the front: a name brought forward while it is open, else the first that wants you, else nothing", async () => {
  const { frontOf } = await import("./folderPieces/model.ts");
  const S = [{ t: "a", st: "" as const }, { t: "b", st: "wait" as const }, { t: "c", st: "wait" as const }, { t: "d", st: "done" as const }];
  assert.equal(frontOf(S, null), 1);
  assert.equal(frontOf(S, 2), 2);
  assert.equal(frontOf(S, 0), 0, "a name pressed comes forward even when it does not want you");
  assert.equal(frontOf(S, 3), 1, "an answered one never comes back to the front");
  assert.equal(frontOf([{ t: "a", st: "" as const }], null), null);
});

test("the front's button is named by what it does, never yes", async () => {
  const { pressOf } = await import("./folderPieces/model.ts");
  assert.equal(pressOf({ press: "merge", href: "https://x" }), "merge");
  assert.equal(pressOf({ press: "yes" }), "done");
  assert.equal(pressOf({ href: "https://x" }), "open");
  assert.equal(pressOf({}), "done");
});

test("the designer's front: the one that wants you, the rest by name, what was put away; the back's ledger in plain words", async () => {
  const F = await import("./folderPieces/front.ts");
  const S = [{ t: "a", st: "" as const }, { t: "b", st: "wait" as const }, { t: "c", st: "wait" as const }, { t: "d", st: "done" as const }];
  const f = F.frontOf(S);
  assert.equal(f.front?.i, 1);
  assert.deepEqual(f.rest.map((x) => x.i), [0, 2]);
  assert.deepEqual(f.done.map((x) => x.i), [3]);
  assert.equal(F.frontOf(S, 2).front?.i, 2, "a name brought forward leads while it wants you");
  const tells = [{ t: "dev-20261113 goes out at 9am", st: "" as const, press: "read" }, { t: "a PR", st: "" as const }];
  assert.equal(F.frontOf(tells).front?.i, 0, "a piece that never asks leads with its first row when it has a press");
  assert.equal(F.frontOf([{ t: "a", st: "" as const }]).front, null, "without a press: its line, no front");
  assert.equal(F.pressWord({ t: "x", st: "wait", press: "open the PR" }), "open the PR");
  assert.equal(F.pressWord({ t: "x", st: "wait", href: "h" }), "open");
  const L = F.plainLines([{ at: 1, by: "the piece's pulse", ev: "composed", note: "list" }, { at: 2, by: "you", ev: "yes", note: "ticked: #932 the gate" }, { at: 3, by: "you", ev: "carried", note: "to sess-1" }]);
  assert.deepEqual(L.map((l) => `${l.by} · ${l.note}`), ["you · put away #932 the gate", "you · into a session"]);
});

test("a block is a piece's only with a pieces switch on: off, a piece- block is any list", () => {
  assert.equal(isPieceId("piece-waits", true), true);
  assert.equal(isPieceId("piece-waits", false), false, "the switch off draws nothing of a piece");
  assert.equal(isPieceId("list-1", true), false);
});

test("a folder in error is asked again backing off: 1.5 s, doubling, at most a minute", () => {
  assert.equal(againIn(0), 1500);
  assert.equal(againIn(1), 3000);
  assert.equal(againIn(3), 12000);
  assert.equal(againIn(50), 60000);
});

test("a script piece waiting for his yes is quiet, not broken: no red, no figure", () => {
  const p = { state: "live" as const, wants: 0, total: 0, at: 1, error: "asks before it runs this folder's scripts", asks: "3f9a0c" };
  assert.equal(lookOf(p), "rest");
  assert.equal(figureOf(p), "");
});

test("keep puts a question away and opens nothing; any other press may follow its link", () => {
  assert.equal(keepsOnly({ press: "keep" }), true);
  assert.equal(keepsOnly({ press: "try" }), false);
  assert.equal(keepsOnly({}), false);
});

test("the bench: the name writes itself from the presses, the file's name from it, and the recipe is what make writes", async () => {
  const { BLANK, titleOf, nameOf, readable, recipeOf } = await import("./folderPieces/bench.ts");
  const src = [
    { id: "issues", word: "issues", parts: [{ label: "area", options: ["marketing", "cowork"] }, { label: "kind", options: ["decision", "bug"] }] },
    { id: "file:.sol/rhythm.json", word: "rhythm.json" },
    { id: "url", word: "an address", asks: "address" as const },
  ];
  assert.equal(titleOf(BLANK, src), "");
  assert.equal(readable(BLANK, src), false);
  assert.equal(recipeOf(BLANK, src), null, "nothing pressed: nothing to read");
  const d = { ...BLANK, reads: "issues", parts: { area: "marketing", kind: "decision" } };
  assert.equal(titleOf(d, src), "marketing decisions");
  assert.equal(nameOf("Marketing decisions!"), "marketing-decisions");
  const r = recipeOf(d, src)!;
  assert.deepEqual(r.source, { from: "builtin", name: "issues", labels: ["marketing", "decision"] });
  assert.equal(r.name, "marketing-decisions");
  assert.equal(r.tend, undefined, "look only: no sentence");
  assert.ok(recipeOf({ ...d, ceiling: "draft" }, src)!.tend, "drafts or more: the piece does part of its job");
  assert.equal(titleOf({ ...BLANK, reads: "file:.sol/rhythm.json", parts: {} }, src), "rhythm");
  assert.equal(readable({ ...BLANK, reads: "url", parts: {} }, src), false, "an address waits for its line");
  assert.deepEqual(recipeOf({ ...BLANK, reads: "url", parts: {}, line: " http://x/a.json " }, src)!.source, { from: "url", url: "http://x/a.json" });
  assert.equal(titleOf({ ...d, title: "  mine " }, src), "mine", "his own name wins");
});

test("a piece that never asks shows its own line, dim; a note on every row alike is not shown", () => {
  assert.equal(ownLine("changed today", "15", [{ st: "" }]), "15 changed today");
  assert.equal(ownLine("runs", "all idle", [{ st: "" }]), "all idle");
  assert.equal(ownLine("x", undefined, [{ st: "" }, { st: "" }]), "2 x");
  assert.equal(ownLine("x", "3", [{ st: "wait" }]), null, "a piece with something waiting has a front of its own");
  assert.equal(ownLine("waits on me", "5", [{ st: "done" }, { st: "done" }]), null, "all answered: it asks, so nothing waits on you, never 5 waits on me");
  assert.equal(ownLine("x", undefined, []), null);
  // #1125: a count of one says one
  assert.equal(ownLine("recent files", undefined, [{ st: "" }]), "1 recent file");
  assert.equal(ownLine("recent files", "1", [{ st: "" }]), "1 recent file");
  assert.equal(ownLine("recent files", undefined, [{ st: "" }, { st: "" }]), "2 recent files");
  assert.equal(one(1, "git status"), "git status", "its own s stays");
  assert.equal(one(1, "open classes"), "open class");
  assert.equal(one(1, "this"), "this");
  assert.equal(one(3, "recent files"), "recent files");
  assert.equal(sameNoteOf([{ note: "changed today" }, { note: "changed today" }]), true);
  assert.equal(sameNoteOf([{ note: "a" }, { note: "b" }]), false);
  assert.equal(sameNoteOf([{ note: "a" }]), false, "one row's note is its own");
});

test("something else: his words become what his session is asked; it is never read here, and a drafting piece keeps his sentence", async () => {
  const { BLANK, TEND, askOf, readable, recipeOf } = await import("./folderPieces/bench.ts");
  const src = [{ id: "issues", word: "issues" }, { id: "else", word: "something else", asks: "sentence" as const }];
  const d = { ...BLANK, reads: "else", parts: {}, line: "the release notes on the NucBox" };
  assert.equal(readable(d, src), false, "nothing here reads it");
  assert.equal(recipeOf(d, src), null);
  assert.match(askOf(d, src)!, /^Make a piece for this folder that reads the release notes on the NucBox\./);
  assert.equal(askOf({ ...d, line: "  " }, src), null, "nothing to ask yet");
  assert.equal(askOf({ ...BLANK, reads: "issues", parts: {} }, src), null);
  assert.equal(recipeOf({ ...BLANK, reads: "issues", parts: {}, ceiling: "draft" }, src)!.tend, TEND, "drafts: the starting sentence");
  assert.equal(recipeOf({ ...BLANK, reads: "issues", parts: {}, ceiling: "draft", tend: "Mine." }, src)!.tend, "Mine.", "his own sentence");
});

test("a piece is born once: only the names this folder has not shown before drop in", async () => {
  const { newOf } = await import("./folderPieces/born.ts");
  assert.deepEqual(newOf(null, ["a", "b"]), ["a", "b"], "the switch turned on: the folder's pieces pour in once");
  assert.deepEqual(newOf(["a", "b"], ["a", "b"]), [], "a reload: nothing is born again");
  assert.deepEqual(newOf(["a"], ["a", "kept"]), ["kept"], "a tool he keeps lands while he watches");
});

test("the folder's order: new for him, then wanting him, then the rest; the night, picks, waits on me first; five shown, the rest folded by name", async () => {
  const M = await import("./folderPieces/model.ts");
  const p = (name: string, wants = 0, fresh = 0) => ({ name, title: name.replace(/-/g, " "), wants, fresh });
  const all = [p("clash"), p("releases"), p("runs", 3), p("night", 2), p("picks", 40), p("systems"), p("waits-on-me", 23, 1)];
  const o = M.orderOf(all);
  assert.deepEqual(o.map((x) => x.name), ["waits-on-me", "night", "picks", "runs", "clash", "releases", "systems"]);
  const v = M.shownOf(o, false);
  assert.deepEqual(v.shown.map((x) => x.name), ["waits-on-me", "night", "picks", "runs", "clash"]);
  assert.deepEqual(v.folded.map((x) => x.name), ["releases", "systems"]);
  assert.equal(M.shownOf(o, false, "systems").shown.some((x) => x.name === "systems"), true, "the one open in the room is shown");
  assert.equal(M.shownOf(o, true).folded.length, 0, "unfolded: all");
});

test("a folder with no pieces: its starters in order, each a recipe that reads with no address; the line says what a piece is (morning round of 11-13)", async () => {
  const { startersOf, recipeOf, readable, titleOf, BLANK, EMPTY_LINE } = await import("./folderPieces/bench.ts");
  const sources = [{ id: "git", word: "git state" }, { id: "issues", word: "issues" }, { id: "recent", word: "recent files" }, { id: "url", word: "an address", asks: "address" as const }];
  assert.deepEqual(startersOf(sources).map((s) => s.id), ["recent", "git"], "recent first, then git; nothing that needs a line or an address");
  assert.deepEqual(startersOf([{ id: "recent", word: "recent files" }]).map((s) => s.id), ["recent"], "a folder that is not a repository: its recent files");
  const d = { ...BLANK, reads: "recent" };
  assert.ok(readable(d, sources), "pressed by the starter: read at once");
  assert.equal(titleOf(d, sources), "recent files");
  assert.deepEqual(recipeOf(d, sources)?.source, { from: "builtin", name: "recent" });
  assert.match(EMPTY_LINE, /A piece is/);
  assert.match(EMPTY_LINE, /new piece/);
  assert.doesNotMatch(EMPTY_LINE, /SOL_|NucBox/);
});
