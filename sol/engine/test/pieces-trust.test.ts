// Pieces (#1092): what keeps a folder's scripts and files inside it (the lead's third review, 03:36). The yes's code and
// the yes itself only on Sol's own window; a repository is only a folder with its own .git, a worktree only when its
// link points back; a path is inside by its real path; each folder of a project its own watch; the NucBox's address
// a setting, never the repo's. All in folders of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "sol-pieces-trust-")));
process.env.SOL_HOME = join(ROOT, "home");
process.env.SOL_STATE = join(ROOT, "state", "work.json");
const P = await import("../src/work/pieces.ts");
const S = await import("../src/work/pieceSources.ts");
P.setJev(null);
P.setTender(null);
after(() => { P.stopAll(); rmSync(ROOT, { recursive: true, force: true }); });

const repo = (name: string) => { const d = join(ROOT, name); mkdirSync(join(d, ".git"), { recursive: true }); mkdirSync(join(d, ".sol", "pieces"), { recursive: true }); return d; };
const send = async (m: object) => { const out: any[] = []; await P.piecesMsg({ send: (o) => out.push(o) }, m as never); return out[0]; };

test("the yes's code goes only to Sol's own window, and only Sol's own window may send the yes", async () => {
  const d = repo("app");
  writeFileSync(join(d, ".sol", "pieces", "s.mjs"), "console.log('[]')");
  writeFileSync(join(d, ".sol", "pieces", "s.json"), JSON.stringify({ name: "s", source: { from: "script", path: "s.mjs" } }));
  P.load(d);
  for (let i = 0; i < 50 && !P.list(d).pieces[0]?.at; i++) await new Promise((r) => setTimeout(r, 20));
  const other = await send({ type: "work.pieces.list", cwd: d });
  assert.equal(other.pieces[0].asks, "", "another program sees the ask, never the code");
  assert.equal(other.pieces[0].scope, "app and its worktrees");
  const app = await send({ type: "work.pieces.list", cwd: d, fromSol: true });
  assert.match(app.pieces[0].asks, /^[0-9a-f]{24}$/, "Sol's window gets the code");
  assert.match((await send({ type: "work.pieces.trust", cwd: d, code: app.pieces[0].asks })).error, /only Sol's own window/, "a yes from elsewhere, even with the code, is refused");
  assert.equal(P.trusted(d), false);
  assert.equal((await send({ type: "work.pieces.trust", cwd: d, code: app.pieces[0].asks, fromSol: true })).ok, true);
  assert.equal(P.trusted(d), true);
});

test("a repository is a folder with its own .git; a worktree counts as its repository only when its link points back", () => {
  const main = repo("main");
  // a real worktree: <main>/.git/worktrees/wt/gitdir names the worktree's .git
  const wt = join(ROOT, "wt"); mkdirSync(wt);
  mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
  writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
  writeFileSync(join(main, ".git", "worktrees", "wt", "gitdir"), `${join(wt, ".git")}\n`);
  assert.equal(P.repoOf(wt), main, "a worktree is its main checkout's");
  // a hand-written .git file claiming the trusted repository
  const liar = join(ROOT, "liar"); mkdirSync(liar);
  writeFileSync(join(liar, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
  assert.equal(P.repoOf(liar), liar, "a .git file whose worktree does not name it back is its own");
  // a folder with no .git of its own, inside a repository: keyed on itself, not the repository above
  const inner = join(main, "scratch", "copy"); mkdirSync(inner, { recursive: true });
  assert.equal(P.repoOf(inner), inner);
  assert.equal(P.scopeOf(inner), "this folder");
  assert.equal(P.scopeOf(main), "main and its worktrees");
});

test("a path is inside a folder by its real path too; a link that leads out is outside, and the file list skips links", () => {
  const d = repo("links");
  const out = join(ROOT, "outside"); mkdirSync(out); writeFileSync(join(out, "secret.json"), "{}");
  symlinkSync(out, join(d, "away"));
  assert.equal(P.inside(d, "away/secret.json"), null, "through a link, out of the folder");
  writeFileSync(join(d, "here.json"), "{}");
  assert.equal(P.inside(d, "here.json"), join(d, "here.json"));
  assert.equal(P.inside(d, "not-yet.json"), join(d, "not-yet.json"), "a file not there yet is where it is written");
  mkdirSync(join(d, ".sol", "data"), { recursive: true }); writeFileSync(join(d, ".sol", "data", "a.json"), "{}");
  symlinkSync(out, join(d, ".sol", "linked"));
  assert.deepEqual(P.jsonFilesIn(d, ".sol"), [".sol/data/a.json"], "a linked folder is not followed");
});

test("a script's HOME is a scratch folder in the engine's state, not the project and not the person's", () => {
  const env = P.scriptEnv("/some/project", { PATH: "/bin", HOME: "/home/me" });
  assert.equal(env.HOME, join(ROOT, "state", "pieces-script-home"));
  assert.ok(existsSync(env.HOME!));
  assert.equal(env.SOL_PIECE_FOLDER, "/some/project");
});

test("two folders of one project each keep their own watch", () => {
  const a = join(ROOT, "x", "same"), b = join(ROOT, "y", "same");
  for (const d of [a, b]) { mkdirSync(join(d, ".git"), { recursive: true }); mkdirSync(join(d, ".sol", "pieces"), { recursive: true }); }
  P.load(a); P.load(b); P.load(a);
  assert.ok(P.watching().includes(a) && P.watching().includes(b), "both are watched");
});

test("the NucBox's address is one setting outside the repo: the environment, else the engine's state; none says so", () => {
  assert.equal(S.nucbox({ SOL_NUCBOX: "nucbox.tail" }), "nucbox.tail");
  assert.equal(S.nucbox({ SOL_NUCBOX: "bad host; rm" }), null, "only a host's letters");
  const f = join(ROOT, "places.json");
  writeFileSync(f, JSON.stringify({ nucbox: "10.0.0.2" }));
  assert.equal(S.nucbox({}, f), "10.0.0.2");
  assert.equal(S.nucbox({}, join(ROOT, "none.json")), null);
});

test("picks is one program: it reads each part's picks, the bracket that closes one as what it follows", async () => {
  // the program runs only as the piece's program; its two rules are exported for this test
  const m = await import("../../../.sol/pieces/picks.mjs" as string);
  const done = "x\n\nPICKS MADE WITHOUT MARCO (each with the preference it follows)\n- Pieces above the sessions (build-sidebar-sitting: needs-me first).\n- A switch \"in dots\" (home.world3d.dots), off; the solid look stays\n  the default.\n\nSHARED FILE TOUCHED\n- not a pick\n";
  assert.deepEqual(m.picksOf(done), ["Pieces above the sessions (build-sidebar-sitting: needs-me first).", "A switch \"in dots\" (home.world3d.dots), off; the solid look stays the default."]);
  const r = m.rowOf("Pieces above the sessions (build-sidebar-sitting: needs-me first).", "pieces", "u");
  assert.equal(r.t, "Pieces above the sessions");
  assert.equal(r.note, "pieces · follows build-sidebar-sitting: needs-me first");
  assert.equal(r.press, "keep");
  assert.equal(m.rowOf("A switch \"in dots\" (home.world3d.dots), off", "world").note, "world", "a bracket inside the words is the pick's own");
  assert.equal(m.rowOf("His arrangement goes to world.md at his home's root (facts-go-to-home-not-chat: facts about his life live in Home); the designer is asked", "world").t, "His arrangement goes to world.md at his home's root", "a long pick shows its first clause");
  assert.deepEqual(m.picksOf("y".repeat(6000) + "\nPICKS MADE WITHOUT HIM\n- whole one.\n- cut in the mid"), ["whole one."], "a pick the page cut is not shown half");
  assert.deepEqual(m.picksOf("y".repeat(6000) + "\nPICKS MADE WITHOUT HIM\n- whole one.\n- the last, whole too", true), ["whole one.", "the last, whole too"], "the whole file is not cut");
});

test("a piece's agent drafts only after the folder's yes; only Sol's window makes or turns up such a piece", async () => {
  const d = repo("tending");
  writeFileSync(join(d, ".sol", "pieces", "t.json"), JSON.stringify({ name: "t", ceiling: "draft", tend: "Say it.", source: { from: "rows", rows: [{ id: "a", t: "a row", wants: true }] } }));
  let asked = 0;
  P.setTender(async () => { asked++; return "A line."; });
  try {
    P.load(d);
    for (let i = 0; i < 50 && !P.list(d).pieces[0]?.at; i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(asked, 0, "no turn on his account before his yes");
    assert.equal(P.list(d).pieces[0].asks, "", "the piece asks, as a script piece does");
    const m = await send({ type: "work.pieces.make", cwd: d, recipe: { name: "sneaky", ceiling: "act", source: { from: "rows", rows: [] } } });
    assert.match(m.error, /only Sol's own window/, "a program elsewhere cannot make a piece whose agent acts");
    const s = await send({ type: "work.pieces.set", cwd: d, name: "t", ceiling: "spend" });
    assert.match(s.error, /only Sol's own window/, "nor turn a notch");
    // kept on the bench in his own window: still not the yes (the new piece asks like any other)
    const k = await send({ type: "work.pieces.make", cwd: d, fromSol: true, recipe: { name: "mine", ceiling: "draft", tend: "Say it.", source: { from: "rows", rows: [{ t: "b", wants: true }] } } });
    assert.equal(k.error, undefined);
    assert.equal(P.trusted(d), false, "a keep is never the yes for the folder");
    assert.equal(asked, 0, "nor does its agent draft before the yes");
    assert.equal(P.list(d).pieces.find((p: { name: string }) => p.name === "mine")?.asks, "", "the kept piece asks");
    const app = await send({ type: "work.pieces.list", cwd: d, fromSol: true });
    assert.equal((await send({ type: "work.pieces.trust", cwd: d, code: app.pieces.find((p: { asks?: string }) => p.asks)!.asks, fromSol: true })).ok, true);
    for (let i = 0; i < 50 && asked === 0; i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(asked > 0, "then its agent drafts");
  } finally { P.setTender(null); }
});

test("a turn that came back empty is asked once per change of its row, not every pulse", async () => {
  let asked = 0;
  P.setTender(async () => { asked++; return null; });
  try {
    const r = { title: "w", tend: "Say.", ceiling: "draft" as const };
    const w = { t: "x", st: "wait" as const, note: "n" };
    const one = await P.tendSteps(r, ROOT, [w], []);
    const two = await P.tendSteps(r, ROOT, [w], one.steps);
    assert.equal(asked, 1, "the same row is not asked again");
    await P.tendSteps(r, ROOT, [{ ...w, note: "changed" }], two.steps);
    assert.equal(asked, 2, "a changed row is");
  } finally { P.setTender(null); }
});

test("a recipe is written through a fresh .tmp: a link planted at the .tmp is removed, never followed; a linked .sol/pieces is refused", () => {
  const d = repo("planted");
  const victim = join(ROOT, "victim.txt"); writeFileSync(victim, "keep me");
  symlinkSync(victim, join(d, ".sol", "pieces", "x.json.tmp"));
  P.writeInPieces(d, "x.json", "{}\n");
  assert.equal(readFileSync(victim, "utf8"), "keep me", "the planted link's target is untouched");
  assert.equal(readFileSync(join(d, ".sol", "pieces", "x.json"), "utf8"), "{}\n");
  const e = repo("linked"); rmSync(join(e, ".sol", "pieces"), { recursive: true });
  const away = join(ROOT, "away-pieces"); mkdirSync(away);
  symlinkSync(away, join(e, ".sol", "pieces"));
  assert.throws(() => P.writeInPieces(e, "y.json", "{}"), /not inside this folder/);
  assert.ok(!existsSync(join(away, "y.json")));
});

test("a piece that reads pieces: each class's due under the school, nearest first, by the class's own name", async () => {
  const school = join(ROOT, "school");
  const cls = (dir: string, name: string, stickies: string) => {
    const d = join(school, dir); mkdirSync(join(d, ".sol", "pieces"), { recursive: true });
    writeFileSync(join(d, "ground.json"), JSON.stringify({ name, facts: [] }));
    writeFileSync(join(d, "stickies.md"), stickies);
    writeFileSync(join(d, ".sol", "pieces", "due.json"), JSON.stringify({ name: "due", source: { from: "builtin", name: "due" } }));
  };
  const soon = new Date(Date.now() + 2 * 86_400_000), later = new Date(Date.now() + 9 * 86_400_000);
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  cls("xy101", "XY101", `- [ ] Essay draft — due ${day(later)}\n`);
  cls("zz202", "ZZ202", `- [ ] Quiz 2 — ${day(soon)}\n- [x] Old one — ${day(soon)}\n`);
  mkdirSync(join(school, "empty"));   // a folder with no due is left out
  const r = await P.piecesUnder(school, "due");
  assert.deepEqual(r.rows.map((x) => `${x.group}: ${x.t}`), ["ZZ202: Quiz 2", "XY101: Essay draft"], "nearest first, across classes");
  assert.match(r.rows[0].note!, /^ZZ202 · /, "its class first in the why");
  assert.equal(r.rows[0].press, "prepare");
  assert.equal(r.line, "2 d");
  assert.match(r.from!, /due in XY101, ZZ202/);
  // he started Quiz 2 in its class: the class's piece holds it put away, so the school's front and figure move on
  const zz = join(school, "zz202");
  P.load(zz);
  for (let i = 0; i < 100 && !P.list(zz).pieces.find((p) => p.name === "due")?.at; i++) await new Promise((res) => setTimeout(res, 20));
  P.tick(zz, "due", { id: r.rows[0].id!.replace(/^ZZ202:/, ""), t: "Quiz 2" });
  const after = await P.piecesUnder(school, "due");
  assert.deepEqual(after.rows.map((x) => `${x.group}: ${x.t}`), ["XY101: Essay draft"], "a row put away in its class is not the school's");
  assert.equal(after.line, "9 d");
  const ok = P.readRecipe({ name: "due", source: { from: "pieces", name: "due" } });
  assert.ok(!("error" in ok));
  writeFileSync(join(school, "xy101", ".sol", "pieces", "due.json"), JSON.stringify({ name: "due", source: { from: "pieces", name: "due" } }));
  assert.match((await P.piecesUnder(school, "due")).from!, /due in ZZ202$/, "one level: a piece of pieces is not read by another");
});

test("the 05:05 review: a row's href is only http(s); a linked .sol makes nothing outside; a linked recipe is not read", () => {
  const rows = P.rowsOf([{ t: "a", href: "javascript:alert(1)" }, { t: "b", href: "file:///etc/passwd" }, { t: "c", href: "https://example.test/x" }]);
  assert.deepEqual(rows.map((r) => r.href), [undefined, undefined, "https://example.test/x"]);
  const e = join(ROOT, "linked-sol"); mkdirSync(join(e, ".git"), { recursive: true });
  const away = join(ROOT, "away-sol"); mkdirSync(away);
  symlinkSync(away, join(e, ".sol"));
  assert.throws(() => P.writeInPieces(e, "z.json", "{}"), /not inside this folder/);
  assert.ok(!existsSync(join(away, "pieces")), "no folder is made outside before the refusal");
  const d = repo("linked-recipe");
  const outside = join(ROOT, "outside-recipe.json"); writeFileSync(outside, JSON.stringify({ name: "out", source: { from: "rows", rows: [] } }));
  symlinkSync(outside, join(d, ".sol", "pieces", "out.json"));
  const got = P.recipesIn(d);
  assert.equal(got.recipes.length, 0, "a recipe that is a link is not read");
});

test("a thread is read only from the folder's own repository", async () => {
  const T = await import("../src/work/pieceTend.ts");
  assert.equal(T.repoOfRemote("git@github.com:Owner/Repo.git\n"), "owner/repo");
  assert.equal(T.repoOfRemote("https://github.com/owner/repo"), "owner/repo");
  assert.equal(T.repoOfRemote("https://gitlab.example/owner/repo"), null);
});

test("a new sentence lets the old lines and the marks of having asked go: every row is drafted again", async () => {
  const d = repo("resay");
  writeFileSync(join(d, ".sol", "pieces", "t.json"), JSON.stringify({ name: "t", ceiling: "draft", tend: "Say it.", source: { from: "rows", rows: [{ id: "a", t: "a row", wants: true }] } }));
  let asked = 0;
  P.setTender(async () => { asked++; return null; });
  try {
    P.load(d);
    for (let i = 0; i < 50 && !P.list(d).pieces[0]?.at; i++) await new Promise((r) => setTimeout(r, 20));
    const app = await send({ type: "work.pieces.list", cwd: d, fromSol: true });
    await send({ type: "work.pieces.trust", cwd: d, code: app.pieces[0].asks, fromSol: true });
    for (let i = 0; i < 100 && asked === 0; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(asked, 1, "asked once, came back empty");
    const s = await send({ type: "work.pieces.set", cwd: d, name: "t", tend: "Say it another way.", fromSol: true });
    assert.equal(s.error, undefined);
    for (let i = 0; i < 100 && asked < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(asked, 2, "the new sentence asks the row again");
  } finally { P.setTender(null); }
});

test("the review of 07:00: a linked .sol lists nothing; a notch never reads a linked recipe; a tend added by another hand drafts nothing; a renamed source starts at look; another program wakes nothing", async () => {
  // R1: .sol a link out of the folder
  const outside = join(ROOT, "elsewhere-sol"); mkdirSync(join(outside, "pieces"), { recursive: true });
  writeFileSync(join(outside, "pieces", "x.json"), JSON.stringify({ name: "x", source: { from: "rows", rows: [] } }));
  const l = join(ROOT, "linked-sol-2"); mkdirSync(join(l, ".git"), { recursive: true }); symlinkSync(outside, join(l, ".sol"));
  assert.equal(P.recipesIn(l).recipes.length, 0, "a .sol that leads out lists nothing");
  // R8: a notch on a linked recipe
  const B2 = await import("../src/work/pieceBench.ts");
  const d = repo("notch-link");
  const far = join(ROOT, "far.json"); writeFileSync(far, JSON.stringify({ name: "far", source: { from: "rows", rows: [] } }));
  symlinkSync(far, join(d, ".sol", "pieces", "far.json"));
  assert.ok(B2.setNotch(d, "far", { every: 600 }).error, "a linked recipe is not read by a notch");
  // R2 + R6: his word is tied to the piece as it reads
  const t = repo("tend-by-hand");
  writeFileSync(join(t, ".sol", "pieces", "w.json"), JSON.stringify({ name: "w", ceiling: "draft", source: { from: "rows", rows: [{ t: "a", wants: true }] } }));
  P.load(t);
  for (let i = 0; i < 50 && !P.list(t).pieces[0]?.at; i++) await new Promise((r) => setTimeout(r, 20));
  P.grant(t, "w", "act");
  assert.equal(P.heldTo(t, "w", "draft"), "act");
  writeFileSync(join(t, ".sol", "pieces", "w.json"), JSON.stringify({ name: "w", ceiling: "act", tend: "Say.", source: { from: "rows", rows: [{ t: "b", wants: true }] } }));
  P.load(t);
  assert.equal(P.heldTo(t, "w", "act"), "look", "another source under the same name starts again at look");
  // R5: another program asking a folder nobody woke
  const q = repo("asleep");
  writeFileSync(join(q, ".sol", "pieces", "s.json"), JSON.stringify({ name: "s", source: { from: "rows", rows: [{ t: "a" }] } }));
  const got = await send({ type: "work.pieces.list", cwd: q });
  assert.deepEqual(got.pieces, [], "another program sees nothing and wakes nothing");
  assert.equal(P.pulsing((await import("../src/work/blocks.ts")).projectOf(q)).length, 0, "no pulse started");
});
