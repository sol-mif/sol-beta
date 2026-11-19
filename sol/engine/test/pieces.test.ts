// Pieces (#1092, work/pieces.ts): a project folder holds pieces beside its sessions. One recipe file makes one piece; its
// state is one block in the project's home with one ledger, whether it is read as a page (the folder's list, open) or
// dropped into a session's stage (carry); a tick in either is the other's; closed in a session it goes back to the
// folder. All in a home and a folder of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "sol-pieces-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-pieces-repo-"));
mkdirSync(join(REPO, ".git"));
mkdirSync(join(REPO, ".sol", "pieces"), { recursive: true });
process.env.SOL_HOME = HOME;
process.env.SOL_STATE = join(HOME, "state", "work.json");   // the engine's state (a folder's yes to its scripts): the test's own

const B = await import("../src/work/blocks.ts");
const P = await import("../src/work/pieces.ts");
const heard: any[] = [];
B.setStageBus((m) => heard.push(m));
P.setPiecesBus((m) => heard.push(m));
P.setJev(null);   // never the real Jev in a test: a stub where a test wants one
P.setTender(null);   // never a real agent turn in a test
const project = B.projectOf(REPO);
const recipe = (name: string, o: object) => writeFileSync(join(REPO, ".sol", "pieces", `${name}.json`), JSON.stringify({ name, ...o }));
const settle = async (name: string) => { for (let i = 0; i < 50; i++) { const p = P.list(REPO).pieces.find((x) => x.name === name); if (p && p.at > 0 && p.state !== "working") return p; await new Promise((r) => setTimeout(r, 20)); } throw new Error(`${name} never settled`); };
after(() => { P.stopAll(); B.setStageBus(null); rmSync(HOME, { recursive: true, force: true }); rmSync(REPO, { recursive: true, force: true }); });

test("a recipe is read and checked: its name, view, source, pulse and ceiling filled in or refused with why", () => {
  const ok = P.readRecipe({ name: "waits", title: "waits on me", source: { from: "rows", rows: ["a", { t: "b", wants: true }] }, pulse: { every: 5 } });
  assert.ok(!("error" in ok));
  if ("error" in ok) return;
  assert.equal(ok.view, "list");
  assert.equal(ok.ceiling, "look");
  assert.equal(ok.pulse.every, P.MIN_EVERY, "a pulse is never faster than the floor");
  assert.deepEqual(ok.source, { from: "rows", rows: [{ t: "a" }, { t: "b", wants: true }] });
  assert.match((P.readRecipe({ name: "Bad Name", source: { from: "rows", rows: [] } }) as { error: string }).error, /lower case/);
  assert.match((P.readRecipe({ name: "x", view: "terminal", source: { from: "rows", rows: [] } }) as { error: string }).error, /view is one of/);
  assert.match((P.readRecipe({ name: "x", source: { from: "shell", cmd: "rm -rf /" } }) as { error: string }).error, /source.from/);
  assert.match((P.readRecipe({ name: "x", ceiling: "everything", source: { from: "rows", rows: [] } }) as { error: string }).error, /ceiling/);
});

test("a path a recipe names stays inside the folder", () => {
  assert.equal(P.inside(REPO, "../etc/passwd"), null);
  assert.equal(P.inside(REPO, "/etc/passwd"), null);
  assert.equal(P.inside(REPO, "a/b.json"), join(REPO, "a", "b.json"));
});

test("one recipe file makes one piece in the folder, held by no session, at rest, working or wanting you", async () => {
  recipe("waits", { title: "waits on me", source: { from: "rows", rows: [{ id: "pr-1", t: "#1070 the set stage", wants: true }, { id: "pr-2", t: "#1090 the systems registry" }] }, ceiling: "draft", verbs: ["look", "draft"] });
  const p = await settle("waits");
  assert.equal(p.id, "piece-waits");
  assert.equal(p.title, "waits on me");
  assert.equal(p.wants, 1, "one row wants you");
  assert.equal(p.total, 2);
  assert.equal(p.open, 2);
  assert.equal(p.state, "live", "its first read is its backlog: it wants you in ink, no yellow (the next new row earns it)");
  assert.equal(p.fresh, 0);
  assert.equal(p.ceiling, "draft");
  assert.deepEqual(p.sessions, [], "in the folder, not in a session yet");
  const b = B.getBlock(project, "piece-waits")!;
  assert.equal(b.kind, "list");
  assert.deepEqual(B.ledger(project, "piece-waits").map((l) => l.ev), ["composed"]);
  assert.ok(heard.some((m) => m.type === "work.pieces.changed" && m.cwd === REPO), "the faces hear the folder changed");
});

test("one state, two placements: the page and the session's block are the same block, one ledger", async () => {
  const S1 = "sess-pieces01";
  // dropped into a session: the same block on its stage, no copy
  const r = P.drop(REPO, "waits", S1);
  assert.equal(r.block.id, "piece-waits");
  assert.ok(B.getStage(project, S1).blocks.some((x) => x.id === "piece-waits"), "on the session's stage");
  assert.equal(B.allBlocks(project).filter((b) => b.title === "waits on me").length, 1, "no copy was made");
  // ticked in the session (the list kind's yes is the engine's update, as the face sends it)
  const steps = JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps;
  steps[0].st = "done";
  B.update({ project, sessionId: S1, by: "you" }, { id: "piece-waits", body: JSON.stringify({ steps }) });
  // the page reads it ticked: one body
  const page = P.open(REPO, "waits");
  assert.equal(JSON.parse(page.seen!.body!.text!).steps[0].st, "done");
  assert.equal(page.piece!.sessions[0], S1);
  // ticked on the page: the session's block reads it too
  P.tick(REPO, "waits", 1);
  const inSession = B.seen(project, "piece-waits")!;
  assert.deepEqual(JSON.parse(inSession.body!.text!).steps.map((s: { st: string }) => s.st), ["done", "done"]);
  assert.equal(inSession.state, "live", "nothing wants you now");
  // one ledger across both, signed line over line
  const L = B.ledger(project, "piece-waits");
  assert.deepEqual(L.map((l) => l.ev), ["composed", "carried", "ran", "yes"]);
  assert.ok(B.ledgerWhole(L));
});

test("the pulse reads again and keeps the person's ticks on the rows that are still there", async () => {
  await P.now(REPO, "waits");
  const steps = JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps;
  assert.deepEqual(steps.map((s: { st: string }) => s.st), ["done", "done"], "a tick survives the next read");
  // a new row from the source arrives wanting you
  recipe("waits", { title: "waits on me", source: { from: "rows", rows: [{ id: "pr-1", t: "#1070 the set stage", wants: true }, { id: "pr-3", t: "#1093 a new one", wants: true }] }, ceiling: "draft", verbs: ["look", "draft"] });
  P.load(REPO);
  const p = await settle("waits");
  assert.equal(p.wants, 1, "the new row wants you; the ticked one stays answered");
  assert.equal(p.state, "waits");
  // its source changes the put-away row's title: it is back
  recipe("waits", { title: "waits on me", source: { from: "rows", rows: [{ id: "pr-1", t: "#1070 the set stage, now green", wants: true }, { id: "pr-3", t: "#1093 a new one", wants: true }] }, ceiling: "draft", verbs: ["look", "draft"] });
  P.load(REPO);
  assert.equal((await settle("waits")).wants, 2, "a new title brings a put-away row back");
});

test("closed in a session, a piece goes back to the folder, never dead", async () => {
  const S1 = "sess-pieces01";
  B.place({ project, sessionId: S1, by: "you" }, { id: "piece-waits", close: true });
  await new Promise((r) => setImmediate(r));
  const b = B.getBlock(project, "piece-waits")!;
  assert.notEqual(b.state, "dead");
  assert.deepEqual(b.sessions, []);
  assert.ok(!B.getStage(project, S1).blocks.some((x) => x.id === "piece-waits"), "off the session's stage");
  assert.ok(P.list(REPO).pieces.some((x) => x.name === "waits"), "still in the folder");
});

test("a file source, a url with its fixture, a script; a broken recipe is named, not thrown", async () => {
  writeFileSync(join(REPO, "rows.json"), JSON.stringify({ rows: ["one", "two"], line: "two things" }));
  recipe("fromfile", { view: "table", source: { from: "file", path: "rows.json" } });
  recipe("fromurl", { source: { from: "url", url: "http://127.0.0.1:9/never", fixture: "rows.json" } });
  writeFileSync(join(REPO, ".sol", "pieces", "count.mjs"), "console.log(JSON.stringify({ rows: [{ t: 'from the script', now: true }] }))");
  P.trust(REPO, P.askCode(REPO));   // a folder's scripts run only after his yes (its own test below)
  recipe("fromscript", { view: "card", source: { from: "script", path: "count.mjs" } });
  writeFileSync(join(REPO, ".sol", "pieces", "broken.json"), "{ not json");
  P.load(REPO);
  const f = await settle("fromfile"), u = await settle("fromurl"), s = await settle("fromscript");
  assert.equal(f.total, 0, "a table's body is not steps");
  assert.deepEqual(JSON.parse(B.bodyOf(project, "piece-fromfile")!.text!).rows.map((r: string[]) => r[1]), ["one", "two"]);
  assert.equal(u.total, 2);
  assert.match(u.from, /did not answer/, "the fixture is said, never passed off as live");
  assert.equal(B.getBlock(project, "piece-fromscript")!.kind, "card");
  assert.match(B.bodyOf(project, "piece-fromscript")!.text!, /from the script/);
  assert.ok(P.list(REPO).errors.some((e) => e.file === "broken.json"));
});

test("a recipe written by an agent makes a piece without anyone asking for a list again", async () => {
  recipe("made", { title: "made by an agent", source: { from: "rows", rows: ["hello"] } });
  for (let i = 0; i < 60 && !P.list(REPO).pieces.some((x) => x.name === "made"); i++) await new Promise((r) => setTimeout(r, 25));
  assert.ok(heard.some((m) => m.type === "work.pieces.changed"));
  assert.ok(P.list(REPO).pieces.some((x) => x.name === "made"));
});

test("the three first tools read their places by rule: waits, runs, systems", async () => {
  const S = await import("../src/work/pieceSources.ts");
  assert.equal(S.checksOf([{ conclusion: "SUCCESS" }, { conclusion: "SKIPPED" }]), "green");
  assert.equal(S.checksOf([{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }]), "red");
  assert.equal(S.checksOf([{ status: "IN_PROGRESS", conclusion: null }]), "waiting");
  assert.equal(S.checksOf([]), "waiting");
  const now = Date.parse("2026-11-13T06:00:00Z");
  const w = S.waitsRows([
    { number: 2, title: "red", isDraft: false, url: "u2", updatedAt: "2026-11-13T01:00:00Z", statusCheckRollup: [{ conclusion: "FAILURE" }] },
    { number: 3, title: "draft", isDraft: true, url: "u3", updatedAt: "2026-11-13T01:00:00Z", statusCheckRollup: [{ conclusion: "SUCCESS" }] },
    { number: 4, title: "green newer", isDraft: false, url: "u4", updatedAt: "2026-11-13T05:00:00Z", statusCheckRollup: [{ conclusion: "SUCCESS" }] },
    { number: 5, title: "green older", isDraft: false, url: "u5", updatedAt: "2026-11-13T02:00:00Z", statusCheckRollup: [{ conclusion: "SUCCESS" }] },
  ], [{ number: 9, title: "work · decision: pick one (#900)", url: "u9", updatedAt: "2026-11-12T06:00:00Z", labels: [{ name: "work" }] },
    { number: 10, title: "marketing: the site's words", url: "u10", updatedAt: "2026-11-12T06:00:00Z", labels: [{ name: "marketing" }] },
    { number: 11, title: "a call for Marco", url: "u11", updatedAt: "2026-11-12T06:00:00Z", labels: [{ name: "sales" }], assignees: [{ login: "marco" }] }], now, { login: "marco", areas: ["work", "base"] });
  assert.deepEqual(w.rows.map((r) => r.id), ["pr-5", "pr-4", "d-9", "d-11"], "green PRs oldest first; red and drafts are not his press; decisions his by area or assignee");
  assert.ok(w.rows.every((r) => r.wants));
  assert.equal(w.rows[0].press, "open the PR", "a piece never merges: the press opens the PR");
  assert.equal(w.rows[2].press, "answer");
  assert.equal(w.rows[2].t, "Pick one", "the tracker's prefixes and issue mark dropped");
  assert.equal(S.cleanTitle("product: engine: the gate runs a PR's check lines (#837)"), "The gate runs a PR's check lines");
  assert.equal(S.cleanTitle("Build: pieces beside sessions (Part of #821)"), "Pieces beside sessions");
  assert.deepEqual(S.areasLed("# label base: x\n/sol/engine/  @marco\n# label marketing: y\n/site/  @isaac\n", "marco"), ["base"]);
  const r = S.runsRows({ machines: { nucbox: { runs: [] }, legion: { room_why: "too loaded" } }, runs: [
    { id: "sol-build-a", machine: "nucbox", state: "working", since: 1000 },
    { id: "sol-build-b", machine: "nucbox", state: "failed", why: "exit 1", since: 1000 },
  ] }, "http://board/", 1000 + 3600, { builders: [{ name: "n13-x", machine: "legion", alive: true, status: "walking" }] });
  assert.equal(r.line, "2 on");
  assert.deepEqual(r.rows.map((x) => [x.group, x.t, x.now ?? false, x.wants ?? false]), [["NucBox", "a", true, false], ["NucBox", "b", false, true], ["Legion", "n13-x", true, false]]);
  const idle = S.runsRows({ machines: { legion: { room_why: "room for 3" } } });
  assert.deepEqual(idle.rows.map((x) => [x.t, x.note]), [["idle", "room for 3"]], "a machine with nothing running says idle");
  const sy = S.systemsRows([
    { id: "build", name: "Building, the line" }, { id: "build/gate", state: "live" }, { id: "build/night", name: "The night job", state: "broken", breaks: "no warnings" },
    { id: "money", name: "Money" }, { id: "app", name: "App" }, { id: "app/x", state: "live" },
  ], { health: { "app/x": { lamp: "red" } } });
  assert.deepEqual(sy.rows.filter((x) => x.wants).map((x) => x.id), ["app/x", "build/night"], "a red lamp before a record marked broken");
  assert.equal(sy.line, "2 broken");
  assert.equal(sy.rows.find((x) => x.id === "area-money")?.note, "nothing stands here");
  assert.equal(sy.rows.find((x) => x.id === "area-build")?.note, "1 live · 1 broken");
});

test("Home's due: a class folder's stickies, the dated first, one due within a week wants a start", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const now = new Date(2026, 10, 13, 9);   // Fri 13 Nov 2026
  assert.equal(S.dueIn("Essay draft — due Nov 20", now)?.getDate(), 20);
  assert.equal(S.dueIn("quiz 11/17", now)?.getMonth(), 10);
  assert.equal(S.dueIn("final, Jan 8", now)?.getFullYear(), 2027, "a date far behind today is next year's");
  assert.equal(S.dueIn("read chapter 10", now), null);
  const md = ["# XY202 · your stickies", "- [ ] Read chapter 10 — notes for Monday", "- [x] Quiz 3 — Nov 10", "- [ ] Case write-up — due Nov 30", "- [ ] Project proposal — due Nov 17 ← now"].join("\n");
  const r = S.dueRows(md, now);
  assert.deepEqual(r.rows.map((x) => x.t), ["Project proposal", "Case write-up", "Read chapter 10"], "the dated first, nearest first; done ones gone");
  assert.equal(r.rows[0].wants, true);
  assert.equal(r.rows[0].press, "start");
  assert.equal(r.rows[0].note, "Tue Nov 17 · your sticky", "the note starts with the day, then where it is from");
  assert.equal(r.rows[0].fig, "4 d", "the figure says when");
  assert.equal(r.rows[1].wants ?? false, false, "a later one does not want you yet");
  assert.equal(r.line, "4 d");
});

test("Home's due reads what the folder knows too: a dated fact with no sticky is a row of its own; one a sticky covers is the sticky's", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const now = new Date(2026, 10, 13, 9);
  const md = ["- [ ] Project proposal — due Nov 17", "- [x] Quiz 3 — Nov 10"];
  const facts = [
    { k: "project proposal due", v: "Nov 17", src: "syllabus.pdf" },          // the sticky has it: one row, the sticky's
    { k: "midterm exam", v: "Nov 15", src: "XY101 syllabus.pdf" },             // no sticky: its own row, wanting a start
    { k: "quiz 3", v: "Nov 10", src: "syllabus.pdf" },                          // done as a sticky: not due again
    { k: "absences left", v: "Nov 14", src: "syllabus.pdf" },                   // a count, not a thing to do
    { k: "final paper", v: "Dec 9", src: "canvas/announcements.md" },
    { k: "office hours", v: "Tuesdays 2pm", src: "syllabus.pdf" },             // no date: not a due thing
    { k: "old reading", v: "Oct 1", src: "syllabus.pdf" },                     // long past
    { k: "gone", v: "Nov 16", src: "x", state: "gone" },
  ];
  const r = S.dueRows(md.join("\n"), now, facts);
  assert.deepEqual(r.rows.map((x) => x.t), ["Midterm exam", "Project proposal", "Final paper"]);
  assert.equal(r.rows[0].note, "Sun Nov 15 · on the syllabus · no sticky yet");
  assert.equal(r.rows[0].fig, "2 d");
  assert.equal(r.rows[0].wants, true);
  assert.equal(r.rows[0].press, "prepare", "an exam is prepared for");
  assert.equal(r.rows[1].press, "start");
  assert.equal(S.dueWord("Read chapter 10"), "read");
  assert.equal(S.dueWord("Quiz 4"), "prepare");
  assert.equal(S.dueWord("Case write-up"), "start");
  assert.equal(r.rows[1].note, "Tue Nov 17 · your sticky");
  assert.equal(r.rows[2].note, "Wed Dec 9 · on announcements · no sticky yet");
  assert.equal(r.line, "2 d", "the line is the nearest, whichever it came from");
  assert.equal(S.dueRows("", now, []).rows.length, 0);
  const made = S.dueRows("- [ ] Midterm exam\n- [ ] Project proposal — due Nov 17\n- [x] Quiz 3 — Nov 10", now, facts);
  assert.deepEqual(made.rows.map((x) => `${x.t} ${x.fig ?? ""} ${x.note}`).slice(0, 2), ["Midterm exam 2 d Sun Nov 15 · your sticky", "Project proposal 4 d Tue Nov 17 · your sticky"], "a sticky put up from a fact keeps the fact's date");
  const doneIt = S.dueRows("- [x] Midterm exam\n- [ ] Project proposal — due Nov 17", now, facts);
  assert.ok(!doneIt.rows.some((x) => x.t === "Midterm exam"), "its sticky done: the row is put away, the syllabus's date and all");
});

test("yellow is earned: only what came since he last looked; a look makes it ink, a new row brings it back", async () => {
  recipe("earn", { source: { from: "rows", rows: [{ id: "a", t: "first", wants: true }] } });
  P.load(REPO);
  let p = await settle("earn");
  assert.equal(p.fresh, 0, "a tool's first read is its backlog, not news");
  assert.equal(p.wants, 1);
  assert.equal(p.state, "live");
  await new Promise((r) => setTimeout(r, 5));
  recipe("earn", { source: { from: "rows", rows: [{ id: "a", t: "first", wants: true }, { id: "c", t: "after the first read", wants: true }] } });
  P.load(REPO);
  p = await settle("earn");
  assert.equal(p.fresh, 1, "what came after the first read is news");
  assert.equal(p.state, "waits");
  P.seen(REPO, "earn");
  p = P.list(REPO).pieces.find((x) => x.name === "earn")!;
  assert.equal(p.fresh, 0, "he looked: nothing is new");
  assert.equal(p.wants, 2, "it still wants him, in ink");
  assert.equal(B.getBlock(project, "piece-earn")!.state, "live", "its block stops asking");
  await new Promise((r) => setTimeout(r, 5));
  recipe("earn", { source: { from: "rows", rows: [{ id: "a", t: "first", wants: true }, { id: "c", t: "after the first read", wants: true }, { id: "b", t: "second", wants: true }] } });
  P.load(REPO);
  p = await settle("earn");
  assert.equal(p.fresh, 1, "only the row that came after the look");
  assert.equal(p.state, "waits");
});

test("Jev's front: sure moves its row to the front, half sure marks it, unsure or silent keeps the plain order; asked only when the waiting rows change", async () => {
  const st = (t: string, w = true) => ({ t, st: (w ? "wait" : "") as "wait" | "", id: t });
  const rows = [st("a"), st("b"), st("c"), st("x", false)];
  let asked = 0;
  P.setJev(async () => { asked++; return { answers: { front: { choice: "c", confidence: 0.82 } } }; });
  const r1 = await P.jevFront(rows, []);
  assert.deepEqual(r1.steps.map((x) => x.t), ["c", "a", "b", "x"], "sure: c is first");
  assert.equal(r1.pick?.tier, "acts");
  const r2 = await P.jevFront(rows, rows, r1.pick);
  assert.deepEqual(r2.steps.map((x) => x.t), ["c", "a", "b", "x"], "the same pick again, without asking");
  assert.equal(asked, 1);
  P.setJev(async () => ({ answers: { front: { choice: "b", confidence: 0.5 } } }));
  const r3 = await P.jevFront(rows, []);
  assert.deepEqual(r3.steps.map((x) => x.t), ["a", "b", "c", "x"], "half sure: the order stays");
  assert.equal(r3.steps[1].ghost, true, "and its row is marked");
  P.setJev(async () => null);
  assert.deepEqual((await P.jevFront(rows, [])).steps.map((x) => x.t), ["a", "b", "c", "x"], "no Jev: the plain order");
  P.setJev(null);
});

test("Jev's word on a change: sure keeps the yellow, unsure does not earn it, an unchanged row is not asked again", async () => {
  const at = Date.now();
  const rows = [{ t: "run failed", st: "wait" as const, id: "r1", note: "failed", at }, { t: "count moved", st: "wait" as const, id: "r2", note: "12", at }];
  let asked = 0;
  P.setJev(async (body: any) => { asked++; return { answers: { wants: { noul: String(body.state.after).startsWith("run failed") ? 0.9 : 0.2 } } }; });
  const s1 = await P.jevNeeds("runs", rows, []);
  assert.deepEqual(s1.map((x) => x.needs), ["acts", "none"]);
  assert.equal(P.freshOf(s1, 0), 1, "only the sure one earns the yellow");
  const s2 = await P.jevNeeds("runs", rows, s1);
  assert.equal(asked, 2, "unchanged rows are not asked again");
  assert.deepEqual(s2.map((x) => x.needs), ["acts", "none"]);
  P.setJev(null);
  assert.equal(P.freshOf(await P.jevNeeds("runs", rows, []), 0), 2, "no Jev: the plain rule");
});

test("the night: each builder's questions to him in front with their defaults, then the builders by name", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const done = "X\n\nDECISIONS FOR MARCO (yes/no; the default is in effect)\n1. Pieces above sessions? (default: yes)\n- Keep it? Default: no, it waits.\n\nPICKS MADE WITHOUT MARCO\n- a pick\n";
  assert.deepEqual(S.questionsOf(done), [{ q: "Pieces above sessions?", dflt: "yes" }, { q: "Keep it?", dflt: "no, it waits" }]);
  assert.deepEqual(S.questionsOf("nothing asked"), []);
  const r = S.nightRows([{ name: "n13-a", short: "a", title: "Part A", alive: "True", status: "walking", done, pr: 1098, since: 1000 }, { name: "n13-b", title: "Part B", alive: false, status: "done" }], undefined, 1000 + 2.5 * 3600);
  assert.deepEqual(r.rows.map((x) => [x.t, x.wants ?? false, x.now ?? false, x.press ?? ""]), [["Pieces above sessions?", true, false, "keep"], ["Keep it?", true, false, "keep"], ["Part A", false, true, ""], ["Part B", false, false, ""]].filter((x) => x[0] !== "Part B"));
  assert.equal(r.rows[0].href, "https://github.com/sol-mif/sol-dev/pull/1098", "change it: the PR");
  assert.equal(r.rows[0].note, "a · default: yes, in effect");
  assert.equal(r.rows[2].note, "2.5 h", "a part at work: its title and how long, no status sentence");
  assert.equal(r.line, "2", "what he must answer");
  assert.equal(S.nightRows([{ name: "c", done, pr: { number: 7, url: "https://x/pull/7" } }]).rows.find((x) => x.press === "keep")!.href, "https://x/pull/7", "a PR given as an object");
  assert.equal(S.nightRows([{ name: "on", alive: true }, { name: "on2", alive: "True" }]).line, "2 on", "nothing wants him: how many are on");
});

test("the night: what he can try comes first, ready or joined, then a part that stopped, then the questions", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const lead = "## 01:08, from the orchestrator\n- notes\n\n## 02:57, from the orchestrator\njoined: systems (run branch is now x)";
  const r = S.nightRows([
    { name: "n13-onboard", short: "onboard", title: "Onboarding, one flow", alive: "True", since: 0, done: "n13-onboard · night\n\nDECISION FOR MARCO\n1. One flow? (default: yes)\n· draft PR #1096 (base x)", pr: "None", lead: "" },
    { name: "n13-systems", short: "systems", title: "Systems registry", alive: "True", done: "READY TO JOIN: 1cd1e2f3", pr: 1097, stills: "[{'name': 'a.png'}, {'name': 'b.png'}]", lead },
    { name: "n13-pieces", short: "pieces", title: "Pieces", alive: "True", done: "x", pr: 1098, lead: "## 02:24, from the orchestrator: JOINED at d48e9b6c" },
    { name: "n13-world", short: "world", title: "World", alive: "False", ended: "True", done: "stopped", pr: 1100 },
  ], undefined, 3600);
  assert.deepEqual(r.rows.map((x) => `${x.press ?? ""}:${x.t}`), ["try:Systems registry", "try:Pieces", "read:World", "keep:One flow?", ":Onboarding, one flow"]);
  assert.equal(r.rows[0].note, "ready to join · 2 stills");
  assert.equal(r.rows[0].href, "https://github.com/sol-mif/sol-dev/pull/1097#user-content-what-to-try");
  assert.equal(r.rows[1].note, "joined 02:24");
  assert.equal(r.rows[3].href, "https://github.com/sol-mif/sol-dev/pull/1096", "a PR the page does not give yet, from the part's done.txt");
  assert.deepEqual(S.joinedAt({ name: "n13-systems", short: "systems" }, [{ name: "x", lead }]), { at: "02:57" });
  assert.equal(S.joinedAt({ name: "n13-sys", short: "sys" }, [{ name: "x", lead }]), null, "a whole word, not part of one");
  assert.equal(r.line, "4");
  const noPr = S.nightRows([{ name: "n13-systems", title: "Systems", done: "READY TO JOIN: x\n\nHOW MARCO TRIES IT (one press): http://board:8815/ (the NucBox)." }]);
  assert.equal(noPr.rows[0].href, "http://board:8815/", "a part with no PR: the address it gives to try");
  assert.equal(S.shortDefault("only you. Frank or Isaac opening the board see nothing"), "only you");
  assert.equal(S.shortDefault("yes, it lives there under the registry folder for good and ever more"), "yes, it lives there under the registry…");
  const kept = P.readRecipe({ name: "n", keepOrder: true, source: { from: "rows", rows: [] } });
  assert.equal((kept as { keepOrder?: boolean }).keepOrder, true, "a recipe may keep its source's order");
});

// ---- the reviewer's list (02:24) ----
test("a folder's script runs only after his yes, with no more of the engine's environment than it needs, and is stopped when slow", async () => {
  const R2 = mkdtempSync(join(tmpdir(), "sol-pieces-trust-"));
  mkdirSync(join(R2, ".git")); mkdirSync(join(R2, ".sol", "pieces"), { recursive: true });
  const write = (f: string, v: string) => writeFileSync(join(R2, ".sol", "pieces", f), v);
  write("env.mjs", "console.log(JSON.stringify({ rows: [{ t: 'key:' + (process.env.SOL_TEST_SECRET ?? 'none') }, { t: 'folder:' + (process.env.SOL_PIECE_FOLDER ? 'yes' : 'no') }] }))");
  write("env.json", JSON.stringify({ name: "env", source: { from: "script", path: "env.mjs" } }));
  process.env.SOL_TEST_SECRET = "jev-key";
  try {
    P.load(R2);
    let p = await (async () => { for (let i = 0; i < 50; i++) { const x = P.list(R2).pieces.find((y) => y.name === "env"); if (x && x.at > 0) return x; await new Promise((r) => setTimeout(r, 20)); } throw new Error("never read"); })();
    assert.equal(typeof p.asks, "string", "it asks before the folder's first script run");
    assert.equal(p.total, 0, "nothing ran");
    assert.equal(P.trusted(R2), false);
    assert.equal(typeof p.asks, "string", "the ask carries a one-time code");
    assert.throws(() => P.trust(R2, "made-up"), /not one this engine asked for/, "a yes without the code it was shown is refused");
    assert.equal(P.trusted(R2), false);
    const code = P.askCode(R2);   // what Sol's window is given with the ask (the wire's own test: pieces-trust.test.ts)
    P.trust(R2, code);
    assert.equal(P.trusted(R2), true, "remembered for the repository");
    assert.throws(() => P.trust(R2, code), /not one/, "a code is spent by its yes");
    for (let i = 0; i < 100 && !(p = P.list(R2).pieces.find((y) => y.name === "env")!).total; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(p.asks, undefined);
    const rows = JSON.parse(B.bodyOf(B.projectOf(R2), "piece-env")!.text!).steps.map((x: { t: string }) => x.t);
    assert.deepEqual(rows, ["key:none", "folder:yes"], "the engine's secrets stay out; where it is, in");
    const env = P.scriptEnv("/x", { PATH: "/bin", HOME: "/h", JEV_KEY: "k", ANTHROPIC_API_KEY: "a" });
    assert.deepEqual(Object.keys(env).sort(), ["HOME", "PATH", "SOL_PIECE_FOLDER"]);
    assert.notEqual(env.HOME, "/h", "a HOME of its own: the person's ~/.config is not where it looks");
    assert.notEqual(env.HOME, "/x", "and not the project (git or npm would write dotfiles there)");
    write("slow.mjs", "setTimeout(() => console.log('[]'), 10000)");
    P.setScriptMs(200);
    const slow = P.readRecipe({ name: "slow", source: { from: "script", path: "slow.mjs" } });
    if ("error" in slow) throw new Error(slow.error);
    await assert.rejects(P.readSource(R2, slow), /took over/, "a slow script is stopped, said in words");
  } finally { delete process.env.SOL_TEST_SECRET; P.setScriptMs(30_000); rmSync(R2, { recursive: true, force: true }); }
});

test("a pulse never throws, even when the home cannot be written (a timer starts it; a rejection would stop the engine)", async () => {
  recipe("safe", { source: { from: "rows", rows: ["a"] } });
  P.load(REPO);
  await settle("safe");
  const was = process.env.SOL_HOME, file = join(REPO, "not-a-folder");
  writeFileSync(file, "x");
  process.env.SOL_HOME = file;   // every write under it fails
  try {
    const k = { cwd: REPO, project, recipe: P.readRecipe({ name: "safe", source: { from: "file", path: "gone.json" } }) as never, at: 0, from: "" };
    await assert.doesNotReject(P.pulse(k));
    assert.ok((k as { error?: string }).error, "it says its error instead");
  } finally { process.env.SOL_HOME = was; }
});

test("make refuses a bad name and never writes over another piece's file", () => {
  recipe("taken", { source: { from: "rows", rows: ["mine"] } });
  assert.match(P.make(REPO, { name: "taken", source: { from: "rows", rows: ["theirs"] } }).error!, /there already/);
  assert.match(JSON.stringify(JSON.parse(readFileSync(join(REPO, ".sol", "pieces", "taken.json"), "utf8"))), /mine/, "the first file stands");
  assert.match(P.make(REPO, { name: "../escape", source: { from: "rows", rows: [] } }).error!, /lower case/);
  assert.match(P.make(REPO, { name: "Big", source: { from: "rows", rows: [] } }).error!, /lower case/);
  assert.ok(!P.make(REPO, { name: "fresh-one", source: { from: "rows", rows: ["x"] } }).error);
});

test("a message's folder is one only when it is absolute and there", () => {
  assert.equal(P.folderOf(REPO), REPO);
  assert.equal(P.folderOf("relative/path"), null);
  assert.equal(P.folderOf(join(REPO, "nope")), null);
  assert.equal(P.folderOf(join(REPO, "rows.json")), null, "a file is not a folder");
  assert.equal(P.folderOf(42), null);
});

test("a deleted recipe stops its pulse; a project nobody asks about stops all of them, and starts again at the next ask", async () => {
  recipe("brief", { source: { from: "rows", rows: ["x"] } });
  P.load(REPO);
  assert.ok(P.pulsing(project).includes("brief"));
  rmSync(join(REPO, ".sol", "pieces", "brief.json"));
  P.load(REPO);
  assert.ok(!P.pulsing(project).includes("brief"), "its recipe gone, its pulse gone");
  P.setIdleMs(1);
  try {
    await new Promise((r) => setTimeout(r, 10));
    // a piece that reads every second (the floor is 30 s; set by hand here): its idle limit is the engine's
    const k = { cwd: REPO, project, recipe: { ...(P.readRecipe({ name: "safe", source: { from: "rows", rows: [] } }) as object), pulse: { every: 0.001 } } as never, at: 0, from: "" };
    await P.pulse(k);   // the timer's next pulse finds nobody asked
    assert.deepEqual(P.pulsing(project), [], "nobody asked: every pulse of the project stopped");
    P.setIdleMs(10 * 60_000);
    P.list(REPO);   // an ask starts it again
    assert.ok(P.pulsing(project).length > 0, "asked again: pulsing again");
  } finally { P.setIdleMs(10 * 60_000); }
});

test("a press names its row by id and title: after the order changes it ticks that row, never the one now in its place", async () => {
  const steps = [{ id: "b", t: "second" }, { id: "a", t: "first" }];
  assert.equal(P.rowAt(steps, { id: "a", t: "first" }), 1);
  assert.equal(P.rowAt(steps, { id: "a", t: "renamed" }), -1, "a changed row is another row");
  assert.equal(P.rowAt(steps, 0), 0);
  assert.equal(P.rowAt(steps, 7), -1);
  recipe("order", { source: { from: "rows", rows: [{ id: "a", t: "first", wants: true }, { id: "b", t: "second", wants: true }] } });
  P.load(REPO);
  await settle("order");
  P.tick(REPO, "order", { id: "b", t: "second" });
  const now = JSON.parse(B.bodyOf(project, "piece-order")!.text!).steps;
  assert.equal(now.find((x: { id: string }) => x.id === "b").st, "done");
  assert.equal(now.find((x: { id: string }) => x.id === "a").st, "wait");
});

test("a tick made while a pulse was reading (Jev asked) is kept, not written over", () => {
  const before = [{ t: "a", st: "wait" as const, id: "1" }, { t: "b", st: "wait" as const, id: "2" }];
  const latest = [{ t: "a", st: "done" as const, id: "1" }, { t: "b", st: "wait" as const, id: "2" }];   // he ticked a meanwhile
  const fromSource = [{ t: "b", st: "wait" as const, id: "2" }, { t: "a", st: "wait" as const, id: "1" }, { t: "c", st: "wait" as const }];
  const out = P.keepTicks(fromSource, before, latest);
  assert.deepEqual(out.map((x) => `${x.t}:${x.st}`), ["b:wait", "a:done", "c:wait"]);
  assert.equal(P.keepTicks(fromSource, before, before), fromSource, "nothing he did: the pulse's own");
});

test("a piece dropped on a session of another project is refused, not seated where its stage never looks", async () => {
  const OTHER = mkdtempSync(join(tmpdir(), "sol-pieces-other-"));
  mkdirSync(join(OTHER, ".git"));
  try {
    recipe("carry", { source: { from: "rows", rows: ["x"] } });
    P.load(REPO);
    await settle("carry");
    assert.throws(() => P.drop(REPO, "carry", "sess-x", "you", undefined, OTHER), /another project/);
    assert.deepEqual(B.getBlock(project, "piece-carry")!.sessions, []);
    assert.doesNotThrow(() => P.drop(REPO, "carry", "sess-y", "you", undefined, REPO));
    const sent: any[] = [];
    P.setSessionFolderOf(async () => OTHER);
    await P.piecesMsg({ send: (o) => sent.push(o) }, { type: "work.pieces.drop", cwd: REPO, name: "carry", sessionId: "sess-z" });
    assert.match(sent[0].error, /another project/, "the wire asks where the session works");
  } finally { rmSync(OTHER, { recursive: true, force: true }); }
});

test("systems reads the board, else the registry's own records in the folder (no health, said), else its fixture", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const R3 = mkdtempSync(join(tmpdir(), "sol-pieces-sys-"));
  try {
    mkdirSync(join(R3, "sol", "systems", "records", "app"), { recursive: true });
    writeFileSync(join(R3, "sol", "systems", "records", "app.json"), JSON.stringify({ id: "app", name: "The app", state: "live" }));
    writeFileSync(join(R3, "sol", "systems", "records", "app", "face.json"), JSON.stringify({ id: "app/face", name: "The face", parent: "app", state: "broken", breaks: "the window is black" }));
    writeFileSync(join(R3, "sol", "systems", "records", "app", "bad.json"), "{ nope");
    assert.deepEqual(P.jsonFilesIn(R3, "sol/systems/records").sort(), ["sol/systems/records/app.json", "sol/systems/records/app/bad.json", "sol/systems/records/app/face.json"]);
    assert.deepEqual(P.jsonFilesIn(R3, "../.."), [], "never outside the folder");
    const down = async () => { throw new Error("no board"); };
    const h = { getJson: down, readJson: (p: string) => JSON.parse(readFileSync(join(R3, p), "utf8")), jsonFiles: (d: string) => P.jsonFilesIn(R3, d) };
    const r = await S.builtinSource(R3, { name: "systems", url: "http://127.0.0.1:9" }, h);
    assert.match(r.from!, /sol\/systems\/records .*health not read/);
    assert.equal(r.rows[0].t, "The face", "a record that says broken is in front");
    assert.equal(r.rows[0].href, undefined, "no board to link to");
    const up = await S.builtinSource(R3, { name: "systems", url: "http://board" }, { ...h, getJson: async (u: string) => (u.endsWith("/api/registry") ? { records: [{ id: "x", name: "X", state: "broken" }] } : {}) });
    assert.equal(up.from, "http://board");
    assert.equal(up.rows[0].href, "http://board/#x");
    const none = await S.builtinSource(R3, { name: "systems", url: "http://127.0.0.1:9", fixture: "f.json" }, { ...h, jsonFiles: () => [], readJson: () => ({ records: [{ id: "y", name: "Y", state: "broken" }] }) });
    assert.match(none.from!, /f\.json/);
  } finally { rmSync(R3, { recursive: true, force: true }); }
});

test("a yes to a folder's scripts is kept by the repository's real path, outside any checkout: a same-named folder elsewhere is not let in", () => {
  const A = realpathSync(mkdtempSync(join(tmpdir(), "sol-pieces-a-"))), Bp = realpathSync(mkdtempSync(join(tmpdir(), "sol-pieces-b-")));   // macOS: /var is a link (#1258)
  try {
    for (const d of [A, Bp]) { mkdirSync(join(d, "same"), { recursive: true }); mkdirSync(join(d, "same", ".git")); }
    const one = join(A, "same"), two = join(Bp, "same");
    assert.equal(B.projectOf(one), B.projectOf(two), "one project name");
    P.trust(one, P.askCode(one));
    assert.equal(P.trusted(one), true);
    assert.equal(P.trusted(two), false, "the same name in another place is another repository");
    assert.equal(P.repoOf(join(one, "deep")), join(one, "deep"), "a folder with no .git of its own is keyed on itself, never on the repository above it");
    const kept = JSON.parse(readFileSync(join(HOME, "state", "pieces-trust.json"), "utf8"));
    assert.ok(kept[one] > 0, "kept in the engine's state, by the real path");
    assert.ok(!existsSync(join(one, "pieces-trust.json")) && !existsSync(join(HOME, B.projectOf(one), "pieces-trust.json")), "nothing written into a checkout or the home a repo carries");
  } finally { rmSync(A, { recursive: true, force: true }); rmSync(Bp, { recursive: true, force: true }); }
});

test("two folders of one project shown at once each keep their own pieces: neither removes or restarts the other's", async () => {
  const Q = mkdtempSync(join(tmpdir(), "sol-pieces-q-"));
  try {
    // two checkouts of one repository name: the same project, each its own .sol/pieces
    const one = join(Q, "a", "proj"), two = join(Q, "b", "proj");
    for (const d of [one, two]) { mkdirSync(join(d, ".git"), { recursive: true }); mkdirSync(join(d, ".sol", "pieces"), { recursive: true }); }
    writeFileSync(join(one, ".sol", "pieces", "mine.json"), JSON.stringify({ name: "mine", source: { from: "rows", rows: ["a"] } }));
    writeFileSync(join(one, ".sol", "pieces", "both.json"), JSON.stringify({ name: "both", source: { from: "rows", rows: ["from one"] } }));
    writeFileSync(join(two, ".sol", "pieces", "both.json"), JSON.stringify({ name: "both", source: { from: "rows", rows: ["from two"] } }));
    const proj = B.projectOf(one);
    P.load(one);
    const before = P.list(one).pieces.find((x) => x.name === "both")!;
    P.load(two);
    P.load(one);
    P.load(two);
    assert.ok(P.pulsing(proj).includes("mine"), "the other folder's list does not remove a piece it did not make");
    const after = P.list(two).pieces.find((x) => x.name === "both")!;
    assert.equal(after.title, before.title);
    assert.equal(P.pulsing(proj).filter((n) => n === "both").length, 1, "one pulse for the name, the first folder's");
  } finally { P.stopAll(); rmSync(Q, { recursive: true, force: true }); }
});

test("a piece that reads less often than the idle limit is not stopped while it is still shown", async () => {
  recipe("slowpulse", { source: { from: "rows", rows: ["x"] }, pulse: { every: 3600 } });
  P.load(REPO);
  await settle("slowpulse");
  P.setIdleMs(1);
  try {
    await new Promise((r) => setTimeout(r, 10));
    const k = { cwd: REPO, project, recipe: P.readRecipe({ name: "slowpulse", source: { from: "rows", rows: ["x"] }, pulse: { every: 3600 } }) as never, at: 0, from: "" };
    await P.pulse(k);
    assert.ok(P.pulsing(project).includes("slowpulse"), "an hourly piece asked a moment ago is kept: its limit is two of its own pulses");
  } finally { P.setIdleMs(10 * 60_000); }
});

test("tend: a read-only turn per row that newly wants him, three a pulse, kept while the row is the same; never at look", async () => {
  const T = await import("../src/work/pieceTend.ts");
  assert.deepEqual(T.READ_ONLY, [], "no tools at all: the thread is read for it");
  assert.equal(T.saidOf("  \"Merge after the check.\"  "), "Merge after the check.");
  assert.equal(T.saidOf("Turn on **yours** first, then press `once · today`."), "Turn on yours first, then press once · today.");
  assert.equal(T.saidOf(""), null);
  assert.equal(T.saidOf('Draft: "Merge it once the check is green."'), "Merge it once the check is green.", "no label, no quotes");
  assert.equal(T.saidOf("I couldn't read the #1085 thread (404), so this draft comes from the records"), null, "a turn that could not read shows nothing");
  assert.equal(T.saidOf("Marco's answer isn't in the thread, so I can't state his position on the five open questions."), null, "a turn that declines shows nothing");
  assert.deepEqual(T.threadOf("https://github.com/sol-mif/sol-dev/pull/932"), { repo: "sol-mif/sol-dev", kind: "pr", n: 932 });
  assert.deepEqual(T.threadOf("https://github.com/sol-mif/sol-dev/issues/1085#x"), { repo: "sol-mif/sol-dev", kind: "issue", n: 1085 });
  assert.equal(T.threadOf("http://example.test:8815/#a"), null);
  assert.equal(T.saidOf("word ".repeat(80)), null, "nothing whole fits in 160 letters: no line");
  const long = "It changes the gate's check runner. A broken body could hang the gate, so check that a bad line fails fast. Then also look at the timing of every single check and the logs.";
  assert.equal(T.saidOf(long), "It changes the gate's check runner. A broken body could hang the gate, so check that a bad line fails fast.", "ends at the last whole sentence that fits, never at …");
  assert.equal(T.saidOf("The gate runs a PR's check lines when its body is handed in.", "The gate runs a PR's check lines when its body is handed in"), null, "a line that says the title again is no line");
  assert.equal(T.saidOf("A malformed body could hang the gate; check a bad line fails fast.", "The gate runs a PR's check lines"), "A malformed body could hang the gate; check a bad line fails fast.");
  const asked: string[] = [];
  P.setTender(async (a) => { asked.push(a.row.t); return a.row.t === "b" ? null : `do ${a.row.t}`; });
  try {
    const w = (t: string, note = "") => ({ t, st: "wait" as const, ...(note ? { note } : {}) });
    const r = { title: "waits", tend: "Draft the answer.", ceiling: "draft" as const };
    const one = await P.tendSteps(r, REPO, [w("a"), w("b"), w("c"), w("d"), { t: "e", st: "" as const }], []);
    assert.deepEqual(asked, ["a", "b", "c"], "three a pulse, waiting rows only");
    assert.deepEqual(one.steps.map((x) => x.said ?? ""), ["do a", "", "do c", "", ""], "no answer: no said");
    assert.deepEqual(one.told, ["a", "c"]);
    asked.length = 0;
    const two = await P.tendSteps(r, REPO, [w("a"), w("b"), w("c", "changed"), w("d")], one.steps);
    assert.deepEqual(asked, ["c", "d"], "the same row keeps its line (or its empty answer); a changed or not yet asked one is asked");
    assert.equal(two.steps[0].said, "do a");
    asked.length = 0;
    const look = await P.tendSteps({ ...r, ceiling: "look" }, REPO, [w("x")], []);
    assert.deepEqual(asked, [], "a look-only piece does nothing between visits");
    assert.equal(look.steps[0].said, undefined);
    const none = await P.tendSteps({ title: "t", ceiling: "draft" }, REPO, [w("x")], []);
    assert.equal(none.steps[0].said, undefined, "no sentence, no turn");
    P.setTender(async () => { throw new Error("down"); });
    assert.equal((await P.tendSteps(r, REPO, [w("y")], [])).steps[0].said, undefined, "an error shows nothing");
    assert.equal((P.readRecipe({ name: "t", tend: "Say it.", source: { from: "rows", rows: [] } }) as { tend?: string }).tend, "Say it.");
  } finally { P.setTender(null); }
});

test("making one by hand: the folder's sources are found, a draft is read once and kept nowhere, a notch rewrites the recipe", async () => {
  const Bn = await import("../src/work/pieceBench.ts");
  const S = await import("../src/work/pieceSources.ts");
  const labels = { labels: [{ group: "area", name: "cowork" }, { group: "area", name: "old", description: "Retired: gone" }, { group: "kind", name: "bug" }, { group: "kind", name: "decision" }, { group: "state", name: "now" }] };
  assert.deepEqual(Bn.labelParts(labels), [{ label: "area", options: ["cowork"] }, { label: "kind", options: ["bug", "decision"] }], "areas and kinds; a retired one left out");
  const src = Bn.sourcesOf({ repo: true, labels, jsonUnderSol: [".sol/rhythm.json", ".sol/pieces/waits.json"], ground: false, stickies: false });
  assert.deepEqual(src.map((x) => x.id), ["recent", "git", "issues", "prs", "file:.sol/rhythm.json", "url", "else"], "the starters first; a piece's own recipe is not a source; the last is something else; no runs without the NucBox");
  assert.deepEqual(Bn.sourcesOf({ repo: true, labels, jsonUnderSol: [], ground: false, stickies: false, nucbox: true }).map((x) => x.id), ["recent", "git", "issues", "prs", "runs", "url", "else"], "the runs where the NucBox is known");
  assert.deepEqual(Bn.sourcesOf({ repo: false, jsonUnderSol: [], ground: true, stickies: true }).map((x) => x.word), ["recent files", "what it knows", "an address", "something else"], "a Home folder");
  assert.deepEqual(Bn.sourcesOf({ repo: false, jsonUnderSol: [], ground: false, stickies: false }).map((x) => x.id), ["recent", "url", "else"], "a fresh folder: its recent files read at once");
  // a draft read once: rows back, no file, no block
  const before = P.list(REPO).pieces.length;
  const t = await Bn.tryRecipe(REPO, { name: "draft-one", source: { from: "rows", rows: [{ t: "x", wants: true }] } });
  assert.equal(t.steps?.[0].t, "x");
  assert.equal(t.steps?.[0].st, "wait");
  assert.ok(!existsSync(join(REPO, ".sol", "pieces", "draft-one.json")), "nothing written");
  assert.equal(B.getBlock(project, "piece-draft-one"), null, "no block");
  assert.equal(P.list(REPO).pieces.length, before);
  assert.match((await Bn.tryRecipe(REPO, { name: "Bad" })).error!, /lower case/);
  // a notch
  recipe("notched", { title: "notched", source: { from: "rows", rows: ["a"] }, about: "kept" });
  assert.deepEqual(Bn.setNotch(REPO, "notched", { every: 3600 }), { ok: true });
  assert.deepEqual(Bn.setNotch(REPO, "notched", { ceiling: "draft" }), { ok: true });
  const f = JSON.parse(readFileSync(join(REPO, ".sol", "pieces", "notched.json"), "utf8"));
  assert.equal(f.pulse.every, 3600);
  assert.equal(f.ceiling, "draft");
  assert.deepEqual(f.verbs, ["look", "draft"]);
  assert.equal(f.about, "kept", "the rest of the file stays as written");
  assert.match(Bn.setNotch(REPO, "notched", { every: 5 }).error!, /between/);
  assert.match(Bn.setNotch(REPO, "notched", { ceiling: "everything" }).error!, /ceiling/);
  assert.match(Bn.setNotch(REPO, "../x", { every: 60 }).error!, /no such/);
  assert.match(Bn.setNotch(REPO, "missing", { every: 60 }).error!, /no recipe/);
  assert.deepEqual(Bn.setNotch(REPO, "notched", { tend: "  Say what   to press.  " }), { ok: true });
  assert.equal(JSON.parse(readFileSync(join(REPO, ".sol", "pieces", "notched.json"), "utf8")).tend, "Say what to press.", "his sentence, as one line");
  assert.deepEqual(Bn.setNotch(REPO, "notched", { tend: "" }), { ok: true });
  assert.equal(JSON.parse(readFileSync(join(REPO, ".sol", "pieces", "notched.json"), "utf8")).tend, undefined, "empty lets it go");
  assert.match(Bn.setNotch(REPO, "notched", { tend: 3 }).error!, /sentence/);
  // the two new builtins' rows
  const is = S.issuesRows([{ number: 5, title: "A bug", url: "u", updatedAt: "2026-11-10T09:00:00Z", labels: [{ name: "cowork" }, { name: "bug" }, { name: "now" }] }], Date.parse("2026-11-13T09:00:00Z"));
  assert.deepEqual(is.rows[0], { id: "issue-5", t: "A bug", note: "#5 · 3 d", href: "u", now: true }, "its labels were what he pressed: the note says what they do not");
  const pr = S.prsRows([{ number: 9, title: "A PR", url: "u", isDraft: true, updatedAt: "" } as never]);
  assert.equal(pr.rows[0].note, "#9 · draft");
  const withLabels = P.readRecipe({ name: "x", source: { from: "builtin", name: "issues", labels: ["cowork", "bug", "$(rm)"] } });
  assert.deepEqual((withLabels as { source: { labels?: string[] } }).source.labels, ["cowork", "bug"], "only label-shaped words reach gh");
});

test("a gh failure is said in words, never as its command line", async () => {
  const S = await import("../src/work/pieceSources.ts");
  assert.equal(S.ghWhy("To get started with GitHub CLI, please run:  gh auth login\n"), "GitHub is not signed in here (gh auth login)");
  assert.equal(S.ghWhy("", { killed: true }), "GitHub did not answer in 20 s");
  assert.equal(S.ghWhy(""), "GitHub did not answer");
  assert.doesNotMatch(S.ghWhy("could not find label 'x'"), /--json|issue list/);
});

test("a tending piece shows its rows at once; its own lines follow when the turns answer", async () => {
  let answer!: (s: string) => void;
  P.setTender(() => new Promise<string>((ok) => { answer = ok; }));
  try {
    recipe("tends", { source: { from: "rows", rows: [{ id: "a", t: "the row", wants: true }] }, ceiling: "draft", tend: "Say it." });
    P.load(REPO);
    // his window's word that it may draft (a make or a notch there); without it the file's tend drafts nothing
    for (let i = 0; i < 50 && !P.keptIn(project, "tends"); i++) await new Promise((r) => setTimeout(r, 20));
    P.grant(REPO, "tends", "draft");
    void P.now(REPO, "tends");
    let body: any = null;
    for (let i = 0; i < 50 && !body; i++) { await new Promise((r) => setTimeout(r, 20)); const t = B.bodyOf(project, "piece-tends")?.text; if (t) body = JSON.parse(t); }
    assert.equal(body?.steps?.[0]?.t, "the row", "the row is there while the turn is still out");
    assert.equal(body.steps[0].said, undefined);
    assert.equal(P.list(REPO).pieces.find((x) => x.name === "tends")!.state, "working", "the square breathes while it tends");
    answer("Press it.");
    for (let i = 0; i < 50 && !JSON.parse(B.bodyOf(project, "piece-tends")!.text!).steps[0].said; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(JSON.parse(B.bodyOf(project, "piece-tends")!.text!).steps[0].said, "Press it.");
    assert.ok(B.seen(project, "piece-tends", 20).lines.some((l: { note?: string }) => /drafted a line for the row/.test(l.note ?? "")), "and the ledger says so");
  } finally { P.setTender(null); }
});

test("the starters (morning round of 11-13): a fresh folder's recent files and git state read with no address; a NucBox source says so in words", async () => {
  const S = await import("../src/work/pieceSources.ts");
  const Bn = await import("../src/work/pieceBench.ts");
  const now = Date.parse("2026-11-13T09:00:00Z");
  const r = S.recentRows([{ path: "old.md", at: now - 3 * 86_400_000 }, { path: "notes/today.md", at: now - 5 * 60_000 }, { path: "plan.txt", at: now - 2 * 3_600_000 }], now);
  assert.deepEqual(r.rows.map((x) => [x.t, x.fig]), [["notes/today.md", "5 min"], ["plan.txt", "2 h"], ["old.md", "3 d"]], "newest first, each with how long ago");
  assert.equal(r.line, "3 files");
  assert.equal(S.recentRows([], now).line, "no files yet");
  assert.equal(S.recentRows(Array.from({ length: 20 }, (_, i) => ({ path: `f${i}`, at: now - i })), now).rows.length, 12, "twelve at most");
  const g = S.gitRows("## main...origin/main [ahead 2]\n M a.ts\n?? new.md\nR  b.ts -> c.ts\n", `abc1234\t${now / 1000 - 3600}\tFirst thing\n`, now);
  assert.deepEqual(g.rows.map((x) => [x.t, x.note ?? "", x.group]), [["on main", "3 not committed · 2 to push", "now"], ["a.ts", "changed", "not committed"], ["new.md", "new", "not committed"], ["c.ts", "renamed", "not committed"], ["First thing", "abc1234", "last commits"]]);
  assert.equal(g.line, "3 not committed");
  assert.deepEqual(S.gitRows("## No commits yet on main\n", "", now).rows.map((x) => [x.t, x.note]), [["on main", "nothing to commit"]], "a repository with no commit yet");
  // a fresh folder, read from the disk: its own files, a dot folder and node_modules left out; git in a fresh repository
  const d = mkdtempSync(join(tmpdir(), "sol-starter-"));
  try {
    writeFileSync(join(d, "notes.md"), "x"); mkdirSync(join(d, "node_modules")); writeFileSync(join(d, "node_modules", "m.js"), "x");
    mkdirSync(join(d, ".hidden")); writeFileSync(join(d, ".hidden", "h.md"), "x");
    assert.deepEqual(Bn.sources(d).map((x) => x.id), ["recent", "url", "else"]);
    const t = await Bn.tryRecipe(d, { name: "recent-files", source: { from: "builtin", name: "recent" } });
    assert.equal(t.error, undefined);
    assert.deepEqual(t.steps?.map((x) => x.t), ["notes.md"], "only the folder's own files");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: d });
    const gt = await Bn.tryRecipe(d, { name: "git-state", source: { from: "builtin", name: "git" } });
    assert.equal(gt.error, undefined);
    assert.equal(gt.steps?.[0].t, "on main");
    assert.ok(gt.steps?.some((x) => x.t === "notes.md"), "its new file, not committed");
  } finally { rmSync(d, { recursive: true, force: true }); }
  // a NucBox source with no address: the reason in words, never the setting's name
  const was = process.env.SOL_NUCBOX, st = process.env.SOL_STATE;
  delete process.env.SOL_NUCBOX; process.env.SOL_STATE = join(tmpdir(), "sol-no-such-state", "work.json");
  try {
    await assert.rejects(S.builtinSource("/", { name: "runs" }, { getJson: async () => ({}), readJson: () => ({}) }), (e: Error) => e.message === S.NO_NUCBOX && !/SOL_NUCBOX/.test(e.message));
  } finally { if (was !== undefined) process.env.SOL_NUCBOX = was; if (st !== undefined) process.env.SOL_STATE = st; else delete process.env.SOL_STATE; }
});
