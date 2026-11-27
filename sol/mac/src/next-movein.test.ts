// node --test src/*.test.ts: the move-in (port slice 11, #1615; merge/movein.js, NOTES.md "Round 6"): a row left alone is
// kept, Fix renames, Drop rests (a session's only AI rests with it), an unsure row's answers drop or merge, "These are
// mine" leaves the canvas holding exactly the kept rows with one Diary line per change, an unsure row left for later is
// exactly one more Needs-you ask (answered there it goes), and live every move answers "not yet".
// Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { DATA, answerTo, apply, blank, gone, linesOf, rowMove, tally, type Choices } from "./next/movein/data.ts";
import { DONE, clear, ed, st } from "./next/movein/state.ts";
import { answer, items } from "./next/people/queue.ts";
import { applyLive, backLive, choicesOf, footOf, fromRead, heard, keepLive, keptHeard, keptN, link, relinked, toKeep } from "./next/movein/live.ts";
import { live, LIVE } from "./next/movein/state.ts";
import { FITS_PX, fx, heldByHand, layOutAgain, leadShown, heardFrom, heardLead, leadNow, setLead, startLead, win } from "./next/movein/seenFirst.ts";
import { CODER_READ } from "./next/movein/fixture.ts";
import { DIARY, Z_PERSON, dragFolder, fold, layoutPlane, moveDiary } from "./next/plane/layout.ts";
import { groupFar } from "./next/plane/groupFar.ts";
import { forgettable, known, ofPart } from "./next/known.ts";
import { wanted } from "./next/movein/welcomeWhen.ts";
import { LOOK_MS, SEEN, dayDone, firstWord, letsMoveIn, sup } from "./next/movein/startup-state.ts";
import { placeFrom, placeOf } from "./next/place.ts";
import { rowOfFolder } from "./next/movein/state.ts";
import { earlier } from "./next/folder/head.ts";
import { nestWords, newNests } from "./next/cv/wire/plane.ts";
import type { Piece } from "./next/cv/types.ts";

const same = (a: string[], b: string[]) => assert.deepEqual([...a].sort(), [...b].sort());

test("rules: a row left alone is kept, Fix renames, Drop rests, a session's only AI rests with it, Bring back undoes both", () => {
  const p = DATA["jayden"], c = blank();
  const pick = ({ kept, fixed, dropped, shelved, hidden }: ReturnType<typeof tally>) => ({ kept, fixed, dropped, shelved, hidden });
  assert.deepEqual(pick(tally(p, c)), { kept: p.rows.length, fixed: 0, dropped: 0, shelved: 0, hidden: 0 });
  rowMove(p, c, "cs", "fix", "CS 101 (mine)");
  rowMove(p, c, "s-Bo", "drop");
  assert.equal(c.drop["Bo"], "s-Bo", "Bo had one session: it rests with it");
  assert.deepEqual(pick(tally(p, c)), { kept: p.rows.length - 2, fixed: 1, dropped: 2, shelved: 0, hidden: 2 }, "a chat and an AI are hidden, never shelved");
  rowMove(p, c, "s-Bo", "keep");
  assert.ok(!gone(c, { id: "Bo" }) && !gone(c, { id: "s-Bo" }), "Bring back brings both");
  rowMove(p, c, "cs", "fix", "CS 101 (class + repo)");
  assert.equal(c.name["cs"], undefined, "the old name again is no fix");
  // Dev's Ada has one session too, Rex shares none: dropping s-Rex rests Rex
  const d = DATA["dev-morning"], e = blank();
  rowMove(d, e, "s-Rex", "drop");
  assert.equal(e.drop["Rex"], "s-Rex");
});

test("applied: the canvas holds exactly the kept rows, a merge moves the pieces, and the Diary gets one line per change", () => {
  CV.load("denise");
  const p = DATA["denise"], c: Choices = blank();
  rowMove(p, c, "house", "fix", "home (mine)");
  c.merge["mia-place"] = "kids";
  rowMove(p, c, "work", "drop");
  const D = structuredClone(CV.D);
  const before = Object.values(D.pieces).filter((x) => x.region === "mia-place").map((x) => x.id);
  apply(D, p, c);
  same(D.regions.map((r) => r.id), ["house", "kids"]);
  assert.equal(D.regions.find((r) => r.id === "house")!.name, "home (mine)");
  for (const id of before) assert.equal(D.pieces[id]?.region, "kids", "merged pieces move into kids");
  assert.deepEqual(D.ais.map((a) => a.name), ["June"]);
  const ls = linesOf("denise", p, c);
  assert.equal(ls.length, 4, "the move, the fix, the merge, the drop");
  // first-timer P 2 and 4: plain facts, and a folder removed has one home, Sessions › Archived (holders.html), which its
  // Diary line names; the Diary drops that "Bring back in …" while it shows its own Bring back (diary/index.tsx)
  assert.equal(ls[0].what, "You moved in. Sol looked at 4 folders and 1 AI · 1 renamed · 1 merged · 1 archived.");
  const work = ls.find((l) => l.key === "movein:denise:work")!;
  assert.match(work.what, /is archived; nothing was deleted\.$/);
  assert.match(work.why, /Bring back in Sessions › Archived$/);
  assert.equal(work.why.replace(/ · Bring back in .*$/, ""), "Moving in");
  assert.ok(!ls.some((l) => /rest|30 days/.test(l.what)), "no line says resting or 30 days");
});

test("zones are gone from the move-in's words: an old zone answer writes nothing, and no Diary line says a folder is in Build or Life", () => {
  const p = DATA["denise"], c: Choices = blank();
  answerTo(c, { id: "u9", q: "?", w: "", opts: [["Life", "zone:work:Life"]] }, "zone:work:Life", "Life");
  assert.equal(c.zone, undefined);
  assert.ok(!linesOf("denise", p, c).some((l) => / is in (Build|Life) now/.test(l.what)));
});

test("the moves: These are mine loads the canvas with the choices, a later row is one more ask, answering it lowers the count", () => {
  for (const name of ["dev-morning", "denise", "jayden", "fresh"]) {
    clear(); CV.load(name);
    const p = DATA[name];
    const n0 = items().length;
    assert.ok(CV.M.move_in(name).ok);
    assert.equal(st.open, name);
    const place = p.rows.find((r) => r.k === "place")!, drop = p.rows.filter((r) => r.k === "place").pop()!;
    CV.M.move_in_row(place.id, "fix", place.n + " (mine)"); CV.M.move_in_row(drop.id, "drop"); CV.M.move_in_skip(p.unsure[0].id);
    assert.ok(ed(name).later[p.unsure[0].id]);
    assert.ok(CV.M.these_are_mine().ok);
    assert.equal(st.open, null);
    assert.equal(CV.S.dist, "far");
    const cd = DONE[name];
    same(CV.D.regions.map((r) => r.id), p.rows.filter((r) => r.k === "place" && !gone(cd, r)).map((r) => r.id));
    same(CV.D.ais.map((a) => a.name), p.rows.filter((r) => r.k === "ai" && !gone(cd, r)).map((r) => r.n));
    const mv = items().filter((x) => x.type === "ext" && x.of === "movein");
    assert.equal(items().length, n0 + 1, `${name}: one more ask`);
    assert.equal(mv.length, 1);
    assert.equal(mv[0].id, `mv:${name}:${p.unsure[0].id}`);
    assert.ok(answer(mv[0].id, p.unsure[0].opts[1][0]));
    assert.equal(items().length, n0, `${name}: answered, it goes`);
  }
  clear();
});

test("the apps' page (BR1 card check): no Later and no question; These are mine leaves nothing for Needs you, notes is a folder like the rest", () => {
  clear(); CV.load("coder");
  try {
    const p = DATA["coder"], n0 = items().length;
    assert.ok(p.apps?.length, "Kim's page is the apps' page");
    assert.deepEqual(p.unsure, [], "Sol asks nothing about what kind a folder is");
    assert.ok(CV.M.move_in("coder").ok);
    assert.ok(CV.M.these_are_mine().ok);
    assert.ok(!DONE["coder"].skipped, "going on is not skipping the page");
    assert.equal(items().filter((x) => x.type === "ext" && x.of === "movein").length, 0, "no move-in ask");
    assert.equal(items().length, n0, "nothing more in Needs you");
    assert.ok(CV.D.regions.some((r) => r.id === "w:/Users/you/notes"), "notes, with no code, is on the canvas");
  } finally { clear(); CV.load("dev-morning"); }
});

test("Back (first-timer P 1): the page closes keeping nothing of it, the canvas as it was; its Undo opens it again with the changes", () => {
  clear(); CV.load("coder");
  try {
    const regions = JSON.stringify(CV.D.regions), before = DONE["coder"];
    assert.ok(CV.M.move_in("coder").ok);
    CV.M.move_in_row("w:/Users/you/code/cli", "drop"); CV.M.move_in_row("w:/Users/you/code/web", "fix", "website");
    const b = CV.M.move_in_close();
    assert.ok(b.ok);
    assert.equal(st.open, null, "closed");
    assert.equal(DONE["coder"], before, "nothing kept");
    assert.equal(JSON.stringify(CV.D.regions), regions, "the canvas as it was");
    b.undo();
    assert.equal(st.open, "coder");
    assert.equal(ed("coder").drop["w:/Users/you/code/cli"], 1, "its Undo has the changes made there");
    CV.M.move_in_close();
    assert.ok(CV.M.move_in("coder").ok);
    assert.equal(ed("coder").drop["w:/Users/you/code/cli"], undefined, "opened again after a Back: nothing of it was kept");
    CV.M.move_in_close();
  } finally { clear(); CV.load("dev-morning"); }
});

test("a later answer that drops a row loads the canvas again without it; an undo puts the choices back", () => {
  clear(); CV.load("jayden");
  CV.M.move_in("jayden"); CV.M.move_in_skip("u1"); CV.M.these_are_mine();
  assert.ok(CV.D.regions.some((r) => r.id === "job"));
  const mv = items().find((x) => x.id === "mv:jayden:u1")!;
  assert.ok(answer(mv.id, "Let it rest"));
  assert.ok(!CV.D.regions.some((r) => r.id === "job"), "summer job rests");
  CV.M.move_in("jayden");
  const d = CV.M.move_in_row("cs", "drop");
  assert.ok(ed("jayden").drop["cs"]);
  d.undo();
  assert.ok(!ed("jayden").drop["cs"]);
  clear();
});

test("live: every move-in move answers not yet, and nothing opens", () => {
  clear(); CV.load("dev-morning");
  CV.setMode("live");
  try {
    for (const m of ["move_in", "move_in_row", "move_in_answer", "move_in_skip", "these_are_mine"]) {
      const r = CV.M[m]("dev-morning");
      assert.equal(r.ok, false); assert.equal(r.why, "not yet");
    }
    assert.equal(st.open, null);
  } finally { CV.load("dev-morning"); clear(); }
});

// ---------------------------------------------------------------- BR1 (#1615): Claude Code and Codex read, the lead, the welcome

type Sent = Record<string, unknown>;
const fakeEngine = (sent: Sent[]) => ({ send: (m: Sent) => { sent.push(m); return true; }, subscribe: () => () => {} }) as never;

test("live read: each project a folder row with its small line, one with no code a folder too (nothing asked), an app a kept row, names only", () => {
  const p = fromRead(CODER_READ);
  const api = p.rows.find((r) => r.n === "api")!, notes = p.rows.find((r) => r.n === "notes")!, cc = p.rows.find((r) => r.id === "app:claude")!;
  assert.equal(api.id, "w:/Users/you/code/api", "the id of the folder the plane draws for it");
  // BR1 root part 2: how much a folder holds is its place's line (place.ts placeOf), never a second count from the read;
  // the row's small line is where it is, and what it is comes as known()'s chips (Marco, 2026-11-21: the count moves to the folder)
  assert.equal(api.small, "~/code/api", "where it is; its sessions are the place's line");
  assert.equal(p.rows.find((r) => r.n === "cli")!.small, "~/code/cli");
  assert.ok(!p.rows.some((r) => /\d+ sessions?/.test(r.small ?? "") || /\d/.test(r.plus ?? "")), "no row counts on its own");
  assert.equal(api.sessions, 38, "the read's 36 Claude Code and 2 Codex sessions go with the row to its folder");
  const apiPlace = placeFrom({ id: api.id, name: "api", kind: "code" }, Array.from({ length: api.sessions! }, (_, i) => ({ id: `s${i}`, region: api.id, kind: "session", name: `s${i}`, state: "idle" }) as Piece), []);
  assert.equal(apiPlace.counts.quiet, 38, "the count lives on the folder, through its place");
  assert.equal(apiPlace.line, "Nothing running · 38 sessions", "and the folder says it");
  // what Sol learned of a folder is said through known(), as chips under its line (BR1 root part 5, step 6)
  assert.deepEqual(known(api.id, { found: [api.found!] }).map((f) => [f.k, f.fact, f.source]), [
    ["seen:/Users/you/code/api:holds", "A repo", "your code"], ["seen:/Users/you/code/api:ais", "Claude Code and Codex work here", "your AI chats"],
    ["seen:/Users/you/code/api:rules:CLAUDE.md", "Has CLAUDE.md", "your code"]]);
  assert.ok(known(api.id, { found: p.rows.flatMap((r) => (r.found ? [r.found] : [])) }).every((f) => f.place === api.id && !forgettable(f.k)), "a row's chips are its own, read, nothing to forget");
  assert.deepEqual(known(notes.id, { found: [notes.found!] }).map((f) => f.fact).slice(0, 1), ["No code in it"], "a project with no code says so");
  assert.equal(api.plus, "its sessions, kept inside it", "what Sol does: a session lives inside its folder (decision b)");
  assert.equal(fromRead({ ...CODER_READ, places: [{ ...CODER_READ.places![2], sessions: { claude: 1 } }] }).rows.find((r) => r.n === "cli")!.plus, "its sessions, kept inside it");
  assert.equal(api.z, "Build");
  assert.ok(!notes.unsure && !notes.z, "no code: a folder like the rest, with nothing asked of it");
  assert.deepEqual(p.unsure, [], "Sol asks nothing about what kind a folder is");
  assert.equal(cc.small, "6 skills · 3 connected tools (names only) · asks before it edits");
  assert.ok(cc.locked && cc.plus);
  assert.deepEqual(p.apps!.map((a) => `${a.name} · ${a.projects} · ${a.sessions}`), ["Claude Code · 4 · 61", "Codex · 2 · 9"]);
  assert.equal(footOf(p, blank()), "4 folders · 70 sessions · 2 AIs");
});

test("the same fact on every screen: what the move-in found of a folder is screen 4's and Settings › You's fact, one key, the same words, said once", () => {
  const api = fromRead(CODER_READ).rows.find((r) => r.n === "api")!;
  const part = { id: api.found!.id, name: "api", share: 0.4, tools: [], ais: 2, level: null, faded: false, new: false, main: false, at: Array(24).fill(0),
    from: ["claude-sessions", "codex-sessions"], facts: 0 } as Parameters<typeof ofPart>[0];
  const a = known(api.id, { found: [api.found!] }).find((f) => f.k.endsWith(":ais"))!, b = ofPart(part).find((f) => f.k.endsWith(":ais"))!;
  assert.deepEqual([a.k, a.fact, a.source, a.from], [b.k, b.fact, b.source, b.from]);
  const both = known("you", { you: { parts: [part] } as never, found: [api.found!] });
  assert.equal(both.filter((f) => f.k === a.k).length, 1, "heard from the read and from next.you: said once");
  assert.ok(both.some((f) => f.fact === "A repo"), "what only the read knows stays");
});

test("read 2 (migration.html B): a folder the person's words opened is a row with their words kept apart (said); a folder Sol saw has none", () => {
  const path = "/Users/someone/Documents/Typography Course";
  const p = fromRead({ ...CODER_READ, places: [...CODER_READ.places!, { id: path, name: "Typography Course", path, from: "said", kind: null, said: ["typography"] }] });
  const t = p.rows.find((r) => r.n === "Typography Course")!;
  assert.deepEqual(t.said, ["typography"]);
  assert.equal(t.id, `w:${path}`);
  assert.ok(p.rows.filter((r) => r.k === "place" && r.n !== "Typography Course").every((r) => !r.said), "what Sol saw carries no words of the person's");
});

test("live read (#1757): every path in one form, ~/…; a Sol work folder too, which the engine gives with no label", () => {
  const p = fromRead({ ...CODER_READ, places: [...CODER_READ.places!,
    { id: "/Users/you/World Building", name: "World Building", path: "/Users/you/World Building", from: "work", kind: null },
    { id: "/Volumes/ext/scans", name: "scans", path: "/Volumes/ext/scans", from: "work", kind: null },
    { id: "errands", name: "errands", path: "/sol/home/errands", from: "home", kind: "life", holds: { stickies: 3, things: 1 } }] });
  const small = (n: string) => p.rows.find((r) => r.n === n)!.small;
  assert.equal(small("World Building"), "~/World Building");
  assert.equal(small("scans"), "/Volumes/ext/scans", "outside the home: the path as it is");
  assert.ok(!p.rows.some((r) => r.small?.startsWith("/Users/")));
  assert.equal(p.rows.find((r) => r.n === "errands")!.plus, "its stickies and things on this folder");
  assert.equal(p.rows.find((r) => r.n === "World Building")!.plus, undefined, "nothing read, nothing said");
});

test("live keep: the choices go to next.movein.keep, each kept app project becomes a folder of Sol's, and only those are made on the plane", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    CV.D.regions.push({ id: "h:errands", name: "errands", kind: "life", from: "places" });
    heard({ ...CODER_READ, places: [...CODER_READ.places!, { id: "errands", name: "errands", path: "/sol/errands", from: "home", kind: "life" }] });
    assert.equal(st.open, LIVE, "Claude Code was read and nothing was kept yet: the screen opens on its own");
    const p = live.data[LIVE], c = blank();
    c.drop["w:/Users/you/code/cli"] = 1; c.name["w:/Users/you/code/web"] = "website"; c.drop["app:claude"] = 1;
    DONE[LIVE] = c;
    keepLive(c);
    const k = sent.find((m) => m.type === "next.movein.keep") as unknown as ReturnType<typeof toKeep>;
    assert.ok(k.drop.includes("w:/Users/you/code/cli") && !k.drop.includes("app:claude"), "an app's row is never dropped");
    assert.deepEqual(k.fix["w:/Users/you/code/web"], { name: "website" });
    assert.ok(!Object.values(k.fix).some((f) => "zone" in f || "later" in f), "no zone is written at move-in, nothing left for later");
    same(sent.filter((m) => m.type === "work.folder").map((m) => String(m.path)), ["/Users/you/code/api", "/Users/you/code/web", "/Users/you/notes"]);
    applyLive();
    same(CV.D.regions.map((r) => r.id), ["h:errands", "w:/Users/you/code/api", "w:/Users/you/code/web", "w:/Users/you/notes"]);
    assert.equal(CV.D.regions.find((r) => r.id === "w:/Users/you/code/web")!.name, "website");
    // what the engine kept comes back as the same choices
    const back = choicesOf({ keep: k.keep, fix: k.fix, drop: k.drop }, p);
    assert.equal(back.drop["w:/Users/you/code/cli"], 1); assert.equal(back.name["w:/Users/you/code/web"], "website"); assert.equal(back.zone, undefined);
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; st.open = null; CV.load("dev-morning");
  }
});

test("live Back (BR1 item 7): the keep's batch is the one Back, These are mine's Undo sends next.movein.back, never a keep again; refused, the read opens again", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    heard(CODER_READ);
    assert.equal(backLive(), false, "no keep yet: nothing to take back");
    keptHeard({ batch: "movein-dev1", placed: [] } as never);
    assert.equal(live.batch, "movein-dev1");
    assert.equal(backLive(), true);
    assert.deepEqual(sent.at(-1), { type: "next.movein.back", batch: "movein-dev1" });
    keptHeard({ ok: true, batch: "movein-dev1", undone: ["placed:w:/Users/you/code/api"], movein: { keep: [] } });
    assert.equal(live.batch, null, "taken back: the batch is spent");
    sent.length = 0;
    keptHeard({ ok: false, again: true });
    assert.deepEqual(sent, [{ type: "next.movein.read" }], "refused: Sol reads again");
    assert.equal(link.openOnAnswer, true, "and the screen opens on the answer");
  } finally {
    link.e = was; link.openOnAnswer = false; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.batch = null; st.open = null; CV.load("dev-morning");
  }
});

test("live, Archived's Bring back (BR1 order 2): a folder the move-in removed, kept again by the engine, is drawn at once, never removed by the older choice", () => {
  const sent: Sent[] = [], was = link.e, API = "w:/Users/you/code/api";
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    const rows = fromRead(CODER_READ).rows.filter((r) => r.k === "place").map((r) => r.id);
    assert.ok(rows.includes(API));
    const keep = rows.filter((x) => x !== API);
    heard({ ...CODER_READ, kept: { keep, fix: {}, drop: [API] }, folders: keep.map((id) => ({ id, name: id.split("/").pop()! })) } as never);
    assert.ok(DONE[LIVE].drop[API], "removed at the move-in");
    assert.ok(!CV.D.regions.some((r) => r.id === API), "not drawn");
    // the engine's answer to next.shelf.take: kept again, the one list with it
    keptHeard({ movein: { keep: [...keep, API], fix: {}, drop: [] }, folders: [...keep, API].map((id) => ({ id, name: id.split("/").pop()! })) } as never);
    applyLive();
    assert.ok(!DONE[LIVE].drop[API], "the choice follows the engine's answers");
    assert.ok(CV.D.regions.some((r) => r.id === API), "drawn at once, no reload");
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.batch = null; live.folders = []; live.kept = []; st.open = null; CV.load("dev-morning");
  }
});

test("live listed (#1758): the folders the read listed are the plane's, before and after These are mine; one it did not list is not drawn, unless the person's", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  const ses = (id: string, region: string, born?: number) => ({ id, region, kind: "session", name: id, from: "work", ...(born ? { born } : {}) });
  try {
    // what work.sessions drew: a read folder, Sol's own wake folder and a scratch copy a session ran in
    CV.D.regions.push({ id: "w:/Users/you/code/api", name: "api", kind: "code", from: "work" }, { id: "w:/sol/wake/work", name: "work", kind: "code", from: "work" }, { id: "w:/Users/you/scratch/merge", name: "merge", kind: "code", from: "work" });
    CV.D.pieces.s1 = ses("s1", "w:/Users/you/code/api", 1) as never; CV.D.pieces.s2 = ses("s2", "w:/sol/wake/work", 1) as never; CV.D.pieces.s3 = ses("s3", "w:/Users/you/scratch/merge", 1) as never;
    heard({ ...CODER_READ, places: [...CODER_READ.places!, { id: "life", name: "life", path: "/sol/home/life", from: "home", kind: null }] });
    const ids = () => CV.D.regions.map((r) => r.id);
    assert.ok(!ids().includes("w:/sol/wake/work") && !ids().includes("w:/Users/you/scratch/merge"), "not listed: not drawn, behind the screen too");
    assert.ok(!CV.D.pieces.s2 && !CV.D.pieces.s3 && CV.D.pieces.s1, "their sessions go with them; a listed folder's stay");
    assert.ok(ids().includes("w:/Users/you/code/api"));
    const life = CV.D.regions.find((r) => r.id === "h:life");
    assert.equal(life?.name, "life", "the Sol home's empty folder home.places did not give is drawn");
    assert.equal(life?.kind, "life");
    // after the read: a session the person starts in a folder the read never saw is drawn, and a folder this face added
    CV.D.regions.push({ id: "w:/Users/you/new", name: "new", kind: "code", from: "work" }, { id: "w:/Users/you/picked", name: "picked", kind: "code", from: "work" });
    CV.D.pieces.s4 = ses("s4", "w:/Users/you/new", live.at + 1) as never;
    live.added.push("/Users/you/picked");
    DONE[LIVE] = blank();
    applyLive();
    assert.ok(ids().includes("w:/Users/you/new") && CV.D.pieces.s4, "started after the read: the person's, drawn");
    assert.ok(ids().includes("w:/Users/you/picked"), "added from this face: drawn");
    assert.ok(!ids().includes("w:/sol/wake/work"), "still not drawn after These are mine");
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.added = []; live.at = 0; st.open = null; CV.load("dev-morning");
  }
});

test("live kept (#1615 BR1): a folder the person kept is drawn on the canvas even when this read does not list it, its sessions with it", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    // Marco's try: he kept my-sol at the move-in; this Mac's read lists sol only, and work.sessions drew one my-sol session
    CV.D.regions.push({ id: "w:/Users/you/my-sol", name: "my-sol", kind: "code", from: "work" });
    CV.D.pieces.m1 = { id: "m1", region: "w:/Users/you/my-sol", kind: "session", name: "m1", from: "work" } as never;
    heard({ ...CODER_READ, kept: { keep: ["w:/Users/you/my-sol", "w:/Users/you/empty", "app:claude"], fix: {}, drop: [] } });
    const ids = () => CV.D.regions.map((r) => r.id);
    assert.ok(ids().includes("w:/Users/you/my-sol") && CV.D.pieces.m1, "kept, not listed: drawn, its session stays");
    const empty = CV.D.regions.find((r) => r.id === "w:/Users/you/empty");
    assert.equal(empty?.name, "empty", "kept with no session on this Mac: drawn, named by its folder");
    assert.equal(empty?.kind, "code");
    assert.ok(!ids().includes("app:claude"), "an app is not a folder");
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.added = []; live.at = 0; live.kept = []; st.open = null; CV.load("dev-morning");
  }
});

test("a found row reads the opened folder's facts (BR1 order 4c): a folder with sessions and none drawn never says \"Nothing in it yet\", though its line was asked before the read came", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    // Lucy's api is on the canvas before the read answers, with no session drawn in it; the canvas asks its line first
    const API = "w:/Users/you/code/api";
    CV.D.regions.push({ id: API, name: "api", kind: "code", from: "work" });
    assert.equal(placeOf(API).line, "Reading…", "nothing read, nothing drawn, the engine's sessions not heard: not read yet, never empty (BR1 hold, scope 09:48)");
    heard(CODER_READ);
    assert.equal(rowOfFolder(API)?.sessions, 38);
    assert.equal(earlier(rowOfFolder(API)), "38 earlier sessions in Claude Code and Codex", "the opened folder's head");
    assert.equal(placeOf(API).line, "Nothing running · 38 sessions", "the row's line and the folder card read the same read, once it came");
    assert.ok(!placeOf(API).empty);
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.added = []; live.at = 0; live.kept = []; live.folders = []; st.open = null; CV.load("dev-morning");
  }
});

test("a second checkout of a listed repo stands inside its folder as another copy, never at the top (BR1 order 4e)", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  try {
    // Lucy worked in a worktree of api (~/work/api-face/mac): the engine's read says it is another copy of api
    const API = "w:/Users/you/code/api", MAC = "w:/Users/you/work/api-face/mac";
    const read = { ...CODER_READ, places: [...CODER_READ.places!, { id: "/Users/you/work/api-face/mac", name: "mac", path: "/Users/you/work/api-face/mac", from: "claude", kind: "build", holds: { repo: true }, sessions: { claude: 6 }, copyOf: "/Users/you/code/api" }] } as Parameters<typeof fromRead>[0];
    const mac = fromRead(read).rows.find((r) => r.id === MAC)!;
    assert.equal(mac.copyOf, API, "the row names the repo's folder");
    assert.ok(known(MAC, { found: [mac.found!] }).some((f) => f.fact === "Another copy of api"), "and says so as a chip");
    assert.equal(fromRead(CODER_READ).rows.find((r) => r.id === API)!.copyOf, undefined, "the repo itself is no copy");
    heard({ ...read, kept: { keep: [API, MAC], fix: {}, drop: [] } } as never);
    const r = CV.D.regions.find((x) => x.id === MAC);
    assert.deepEqual([r?.parent, r?.parentBy, r?.copy], [API, "rule", true], "drawn inside api, by rule, as a copy");
    assert.equal(CV.D.regions.find((x) => x.id === API)?.parent, undefined, "api stays at the top");
    const n = newNests(CV.D.regions, new Set());
    assert.equal(nestWords(n.filter((x) => x.id === MAC)), "mac is inside api now: another copy of it on your disk", "said on the frame's line, never \"as on your disk\"");
    // where the person put it stays theirs
    r!.parentBy = "person"; delete r!.parent;
    applyLive();
    assert.equal(CV.D.regions.find((x) => x.id === MAC)?.parent, undefined, "the person took it out: it stays out");
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.added = []; live.at = 0; live.kept = []; live.folders = []; st.open = null; CV.load("dev-morning");
  }
});

test("a Life folder made live is the engine's too (next.folder.make), with the id the move-in read gives it back; a Build one stays the window's", async () => {
  const { link: plink } = await import("./next/cv/wire/plane.ts");
  const sent: Sent[] = [], was = plink.e;
  CV.load("dev-morning"); CV.setMode("live");
  plink.e = fakeEngine(sent);
  try {
    const r = CV.M.newFolder("Trip to Lisbon", "life");
    assert.ok(r.ok);
    assert.equal(r.id, "h:Trip to Lisbon", "as the read lists SOL_HOME/Trip to Lisbon, so listed() and a restart find the same folder");
    assert.deepEqual(sent.filter((m) => m.type === "next.folder.make"), [{ type: "next.folder.make", name: "Trip to Lisbon", zone: "life" }]);
    assert.equal(CV.M.newFolder("Trip to Lisbon", "life").id, "h:Trip to Lisbon", "the same name is the same folder");
    const b = CV.M.newFolder("tools", "build");
    assert.ok(b.ok && !String(b.id).startsWith("h:"));
    assert.equal(sent.filter((m) => m.type === "next.folder.make").length, 2, "nothing sent for a Build folder");
  } finally { plink.e = was; CV.setMode("fixture"); CV.load("dev-morning"); }
});

test("lead: what the person sees first is D.movein.lead, chosen in Settings › Start screen; live it goes to next.movein.lead; unchosen on the very first run in a window under 1280 px reads as day", () => {
  const sent: Sent[] = [], was = link.e, w0 = win.w;
  link.e = fakeEngine(sent); win.w = () => 900;
  try {
    // the fixture: a new person keeps the default start screen; a choice is kept across loads
    fx.lead = null; CV.load("empty");
    assert.equal(leadNow(), null); assert.equal(startLead(), "day");
    setLead("work"); CV.load("empty");
    assert.equal(leadNow(), "work"); assert.equal(CV.D.movein?.lead, "work");
    // live: the very first run (no movein.json yet), nothing chosen
    CV.setMode("live"); heardLead.said = false; CV.D.movein = undefined;
    heardFrom(null);
    assert.ok(heardLead.said); assert.equal(leadNow(), null);
    assert.equal(startLead(), "day", "unchosen on the first run: My day");
    setLead("both");
    assert.deepEqual(sent.at(-1), { type: "next.movein.lead", lead: "both" });
    // a later run with an answer kept
    heardLead.said = false; heardFrom({ lead: "both" });
    assert.equal(leadNow(), "both"); assert.equal(startLead(), "both");
    heardLead.said = false; heardFrom({ lead: null });
    assert.equal(startLead(), "day", "unchosen, a later run: still My day (first-timer P 6)");
    assert.equal(leadShown(), "day", "and the Start screen row checks My day, never Both");
  } finally { link.e = was; win.w = w0; CV.setMode("fixture"); fx.lead = null; heardLead.said = false; CV.load("dev-morning"); }
});

// Marco 2026-11-22 14:10 (BR1 conform 1, "both when it fits"): unchosen on a first run, a window 1280 px wide or wider
// opens on Both, the Diary beside the cards (frame.html, bar-folder.html); narrower, My day; a choice holds at every width
test("lead: unchosen, Both where the window holds them side by side (1280 and up), My day below; a choice is kept at every width", () => {
  const w0 = win.w;
  try {
    fx.lead = null; CV.load("empty");
    for (const [w, l] of [[2560, "both"], [1440, "both"], [FITS_PX, "both"], [FITS_PX - 1, "day"], [900, "day"]] as const) {
      win.w = () => w;
      assert.equal(startLead(), l, `${w} px wide, unchosen: ${l}`); assert.equal(leadShown(), l, `and the Start screen row checks ${l}`);
    }
    fx.lead = null; CV.load("dev-morning"); win.w = () => 900;
    assert.equal(startLead(), null, "not a first run: the plane's own, at any width");
    for (const pick of ["day", "work", "both"] as const) {
      setLead(pick); CV.load("empty");
      for (const w of [900, 1440, 2560]) { win.w = () => w; assert.equal(startLead(), pick, `${pick} picked holds at ${w} px`); }
    }
  } finally { win.w = w0; fx.lead = null; CV.load("dev-morning"); }
});

test("lead: the move-in screen and the welcome card no longer ask what the person sees first; Settings › Start screen does (Marco, 2026-11-22)", () => {
  const src = (f: string) => readFileSync(new URL(`./next/movein/${f}`, import.meta.url), "utf8");
  for (const f of ["index.tsx", "Welcome.tsx"]) assert.ok(!/LeadCard|leadOpen|see first\?/.test(src(f)), `${f} still asks it`);
  assert.ok(/<LeadRow \/>/.test(readFileSync(new URL("./next/settings/index.tsx", import.meta.url), "utf8")), "Settings › Start screen draws the choice");
});

test("the Start screen row: checked is what the canvas leads with; the person's own places hold it until it is laid out again, and Back puts them back (BR1 first-timer 5, builder F)", () => {
  try {
    fx.lead = null; CV.load("dev-morning");
    assert.equal(leadShown(), "both", "unsaid, not a first run: both side by side, never My day checked over another canvas");
    fx.lead = null; CV.load("empty"); win.w = () => 900;
    assert.equal(leadShown(), "day", "the very first run in a narrow window opens on My day");
    win.w = () => 1440;
    assert.equal(leadShown(), "both", "and in a window that holds both, on Both");
    CV.load("dev-morning");
    CV.D.pos = { ...(CV.D.pos || {}), "r:test": { x: 10, y: 10, w: 100, h: 80, by: "person", touched: true, at: 0 } } as typeof CV.D.pos;
    assert.ok(heldByHand());
    const back = layOutAgain("work");
    assert.equal(leadNow(), "work"); assert.ok(!heldByHand(), "laid out again: no place is the person's");
    back();
    assert.ok(heldByHand(), "Back: the person's places as they were"); assert.equal(CV.D.pos?.["r:test"]?.x, 10);
  } finally { win.w = () => 1440; fx.lead = null; CV.load("dev-morning"); }
});

test("a fold alone is not an arrangement: Sol never says the person arranged the canvas after only folding the Diary, and a pick lays it out (BR1 first-timer, scope 07:59)", () => {
  try {
    fx.lead = null; fx.asked = false; CV.load("dev-morning");
    const P = () => CV.D.pos!;
    assert.ok(fold(DIARY, true), "the Diary folds to its spine");
    assert.equal(P()[DIARY].by, "person"); assert.equal(P()[DIARY].hand, "fold", "folded where the rule put it: only a fold");
    assert.ok(!heldByHand(), "a fold holds nothing: the held line (you arranged these yourself) never shows");
    setLead("day");
    assert.ok(!P()[DIARY]?.folded, "My day picked: the Diary leads open, the fold went with the rule's places");
    // a real rearrange holds: the Diary moved after a fold, a folder dragged and then folded
    assert.ok(fold(DIARY, true)); assert.ok(moveDiary(P()[DIARY].x + 40, P()[DIARY].y));
    assert.equal(P()[DIARY].hand, undefined, "moved: the person's arrangement now"); assert.ok(heldByHand());
    fx.lead = null; fx.asked = false; CV.load("dev-morning"); layoutPlane();   // My day folds every folder to a tab: back to the rule's own (asked reads as My day)
    const rid = CV.D.regions.find((r) => P()[r.id] && !P()[r.id].folded)!.id;
    assert.ok(dragFolder(rid, 30, 0)); assert.ok(fold(rid, true));
    assert.equal(P()[rid].hand, undefined, "folded after a drag: still the person's own place"); assert.ok(heldByHand());
  } finally { fx.lead = null; fx.asked = false; CV.load("dev-morning"); }
});

// BR1 conform 1 (orchestrator 13:50, panel home 9 s after the move-in): My day folded the folders to tabs 8 px apart, the
// distance at which the canvas joins cards, and held each tab as a card (160 px at least), so the three tabs were drawn
// as one "3 folders" group under the Diary. Each tab is its own, at the person's zoom and a step out from it
test("My day: each folder is its own tab along the Diary's foot, never one group of them (BR1 conform 1)", () => {
  const was = { ...CV.S.cam };
  try {
    fx.lead = null; CV.load("dev-morning"); setLead("day");
    const P = CV.D.pos!, tabs = CV.D.regions.filter((r) => !CV.parentOf(r.id) && P[r.id]?.folded).map((r) => r.id);
    assert.ok(tabs.length >= 3, "the folders are tabs");
    assert.ok(tabs.every((id) => P[id].y >= P[DIARY].y + P[DIARY].h), "along the Diary's foot");
    for (const z of [Z_PERSON, Z_PERSON * 0.8]) {
      CV.S.cam = { ...was, z };
      const g = groupFar([], () => true, (q) => q);
      for (const id of tabs) assert.ok(g.alone(id), `${id} drawn alone at zoom ${z.toFixed(3)}, not in a group`);
    }
  } finally { CV.S.cam = was; fx.lead = null; CV.load("dev-morning"); }
});

test("welcome: wanted on an empty canvas with nothing found, gone once a folder or a session exists", () => {
  CV.load("empty"); clear();
  assert.ok(wanted(CV.D));
  CV.M.newFolder("Life", "life");
  assert.ok(!wanted(CV.D));
  CV.load("dev-morning");
  assert.ok(!wanted(CV.D), "a scenario with folders never shows it");
});

// BR1 hold H4 (try 4): Settings › "Add your files and AI chats" said "15 kept" while the screen it opens and the canvas
// said 13 folders: it counted the move-in's rows, its AIs among them. One number: the kept folders, the engine's one list
test("Settings' kept count is the kept folders: live the engine's one list, never the move-in's rows with its AIs", () => {
  const p = DATA["jayden"], c = blank();
  const places = p.rows.filter((r) => r.k === "place").length;
  assert.ok(tally(p, c).kept > places, "the scenario keeps more rows than folders (AIs, chats)");
  assert.equal(keptN(p, c), places, "outside live: the folders the move-in keeps");
  const one = p.rows.find((r) => r.k === "place")!;
  rowMove(p, c, one.id, "drop");
  assert.equal(keptN(p, c), places - 1, "a folder removed is not kept");
  CV.setMode("live");
  try {
    live.folders = Array.from({ length: 13 }, (_, i) => ({ id: `w:/Users/you/f${i}`, name: `f${i}`, path: `/Users/you/f${i}` }));
    assert.equal(keptN(p, c), 13, "live: next.state's folders, what the canvas draws");
    live.folders = [];
    assert.equal(keptN(p, c), null, "live, the list not heard: no number");
  } finally { live.folders = []; CV.setMode("fixture"); }
});

// BR1 hold (try 5): "Back without saving" on the screen Settings' "Add your files and AI chats" opens closed Settings too.
// Settings stays under the screen: Back and Esc go back one step, to it; Keep these goes on to the canvas
test("from Settings, Back without saving goes back to Settings; Keep these closes it, onto the canvas", () => {
  CV.load("coder"); clear(); st.open = null;
  try {
    CV.M.page("settings");
    assert.equal(CV.S.page, "settings");
    assert.ok(CV.M.move_in().ok);
    assert.equal(CV.S.page, "settings", "opening the screen leaves Settings under it");
    assert.ok(CV.M.move_in_close().ok);
    assert.equal(st.open, null, "the screen is down");
    assert.equal(CV.S.page, "settings", "Back: one step, to Settings");
    assert.ok(CV.M.move_in().ok);
    assert.ok(CV.M.these_are_mine().ok);
    assert.equal(CV.S.page, null, "Keep these: Settings closes with the screen");
  } finally { st.open = null; if (CV.S.page) CV.M.page(null); clear(); CV.load("dev-morning"); }
});

// BR1 hold H4 (try 5): "Here's what you already have", opened from Settings' "13 folders kept", listed 12 folders: life
// was kept (next.state folders) but this read no longer found it. The page lists every kept folder, so both say 13
test("live: every kept folder is a row of the move-in page, one this read does not find too, so it says Settings' number", () => {
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  clear(); CV.load("empty"); CV.setMode("live");
  const named = (ids: string[]) => ids.map((id) => ({ id, name: id.slice(2).split("/").pop()!, ...(id.startsWith("w:") ? { path: id.slice(2) } : {}) }));
  const places = () => live.data[LIVE].rows.filter((r) => r.k === "place");
  try {
    const read = fromRead(CODER_READ).rows.filter((r) => r.k === "place").map((r) => r.id);
    const keep = [...read, "h:life", "w:/Users/you/quiet"];
    heard({ ...CODER_READ, kept: { keep, fix: {}, drop: [] }, folders: named(keep) } as never);
    const p = live.data[LIVE], c = DONE[LIVE];
    assert.deepEqual(places().map((r) => r.id), keep, "the read's folders, then the kept ones it did not find");
    assert.equal(keptN(p, c), keep.length, "Settings' number");
    assert.ok(footOf(p, c).startsWith(`${keep.length} folders`), footOf(p, c));
    const life = places().find((r) => r.id === "h:life")!;
    assert.equal(life.n, "life");
    assert.equal(life.small, "in your Sol home");
    assert.ok(p.rows.findIndex((r) => r.id === "w:/Users/you/quiet") < p.rows.findIndex((r) => r.k === "ai"), "with the folders, before the AIs");
    // kept later (Archived's Bring back, a folder added): a row at once, never twice
    const more = [...keep, "w:/Users/you/later"];
    keptHeard({ movein: { keep: more, fix: {}, drop: [] }, folders: named(more) } as never);
    keptHeard({ movein: { keep: more, fix: {}, drop: [] }, folders: named(more) } as never);
    assert.deepEqual(places().map((r) => r.id), more);
    // removed on this page and kept: the row stays, as removed, with Bring back
    const left = more.filter((id) => id !== "h:life");
    keptHeard({ movein: { keep: left, fix: {}, drop: ["h:life"] }, folders: named(left) } as never);
    assert.ok(places().some((r) => r.id === "h:life") && gone(DONE[LIVE], places().find((r) => r.id === "h:life")!), "life stays a row, removed");
    assert.equal(keptN(live.data[LIVE], DONE[LIVE]), left.length);
    assert.ok(footOf(live.data[LIVE], DONE[LIVE]).startsWith(`${left.length} folders`));
  } finally {
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.batch = null; live.folders = []; live.kept = []; st.open = null; CV.load("dev-morning");
  }
});

test("the first-launch start-up: up once when nothing was ever kept and this Mac has not seen it; the move-in and the welcome card wait under it; Let’s move in goes into the read", () => {
  const store = new Map<string, string>(), had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
  const sent: Sent[] = [], was = link.e;
  link.e = fakeEngine(sent);
  const reset = () => { sup.up = false; sup.day = false; sup.words = ""; sup.pressed = false; sup.decided = false; sup.from = 0; sup.owed = 0; };
  try {
    // nothing kept, never seen: up, judged once
    reset(); clear(); CV.load("empty"); CV.setMode("live");
    firstWord(null);
    assert.ok(sup.up, "nothing kept and never seen: the start-up is up");
    firstWord({ keep: [] });
    assert.ok(sup.up, "judged once: a later word does not take it down");
    // it opens on "What do you do, day to day?" (migration.html A): Continue keeps the words as written, once
    assert.ok(sup.day, "it opens on the day-to-day question, before the beats");
    sent.length = 0;
    dayDone("  I run a small studio, and evenings a course  ");
    assert.ok(!sup.day && sup.up, "Continue: the beats come next");
    assert.deepEqual(sent.filter((m) => m.type === "next.you.day"), [{ type: "next.you.day", words: "I run a small studio, and evenings a course" }], "the words go to the person's You, as written");
    dayDone("again"); assert.equal(sent.filter((m) => m.type === "next.you.day").length, 1, "asked once");
    // read 2 (migration.html B): the same read asked again after the words, behind the beats, with no screen of its own
    assert.deepEqual(sent.map((m) => m.type), ["next.you.day", "next.movein.read"], "the words, then read 2");
    // read 1 answers under it: the move-in waits, the welcome card too, and Let’s move in waits for read 2
    heard({ ...CODER_READ, kept: null } as never);
    assert.equal(st.open, null, "the move-in waits under the start-up");
    assert.equal(wanted(CV.D), false, "no welcome card under the start-up");
    letsMoveIn();
    assert.ok(sup.up && sup.pressed, "read 2 has not answered: one quiet line");
    heard({ ...CODER_READ, kept: null } as never);
    assert.equal(store.get(SEEN), "1", "Let’s move in marks it seen");
    assert.ok(!sup.up, "it goes");
    assert.equal(st.open, LIVE, "and the move-in opens on the read");
    // pressed before the read answered: it says it is looking, and goes on the answer
    st.open = null; live.ready = false; live.data = {}; live.answered = false; store.clear();
    reset(); clear(); CV.load("empty"); CV.setMode("live");
    firstWord(null);
    sent.length = 0;
    dayDone("");
    assert.ok(!sup.day && !sent.some((m) => m.type === "next.you.day"), "Skip keeps nothing");
    assert.ok(!sent.some((m) => m.type === "next.movein.read"), "and asks no read 2: read 1 is the answer");
    letsMoveIn();
    assert.ok(sup.up && sup.pressed, "the read has not answered: having a look around");
    heard({ ...CODER_READ, kept: null } as never);
    assert.ok(!sup.up, "the answer takes it down");
    assert.equal(st.open, LIVE, "and opens the move-in");
    // something kept, or seen on this Mac: Sol just opens
    reset(); firstWord({ keep: ["h:life"] });
    assert.ok(!sup.up, "something was kept: no start-up");
    reset(); store.set(SEEN, "1"); firstWord(null);
    assert.ok(!sup.up, "seen on this Mac: no start-up");
  } finally {
    reset();
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete (globalThis as { localStorage?: unknown }).localStorage;
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.batch = null; live.folders = []; live.kept = []; st.open = null; CV.load("dev-morning");
  }
});

test("the start-up never waits for ever: a read lost with the link (the engine renewing) is asked again when it is back, and with no answer Sol opens after LOOK_MS (Isaac's update, 2026-11-25)", (t) => {
  const store = new Map<string, string>(), had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
  // a link that can be down: socket.ts puts nothing on a socket that is not open, and says false
  const sent: Sent[] = [], was = link.e;
  let down = false;
  link.e = { send: (m: Sent) => { if (down) return false; sent.push(m); return true; }, subscribe: () => () => {} } as never;
  const reset = () => { sup.up = false; sup.day = false; sup.words = ""; sup.told = false; sup.pressed = false; sup.decided = false; sup.from = 0; sup.owed = 0; };
  const fresh = () => { st.open = null; live.ready = false; live.data = {}; live.answered = false; store.clear(); reset(); clear(); CV.load("empty"); CV.setMode("live"); };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    // read 1 lost at attach (the link not open yet): the start-up comes up on next.state, and the press waits
    fresh(); firstWord(null); dayDone("");
    letsMoveIn();
    assert.ok(sup.up && sup.pressed, "having a look around");
    sent.length = 0;
    relinked();
    assert.deepEqual(sent.map((m) => m.type), ["next.movein.read"], "the link up again: the read asked again");
    heard({ ...CODER_READ, kept: null } as never);
    assert.ok(!sup.up && st.open === LIVE, "its answer takes the start-up down and opens the move-in");
    // the words and read 2 both lost while the engine renewed: both go again, the press waits for that one answer
    fresh(); firstWord(null);
    heard({ ...CODER_READ, kept: null } as never);   // read 1 answered before the words
    down = true; sent.length = 0;
    dayDone("I teach");
    assert.equal(sent.length, 0, "nothing went out");
    letsMoveIn();
    assert.ok(sup.pressed, "read 2 owed");
    down = false; relinked();
    assert.deepEqual(sent.map((m) => m.type), ["next.you.day", "next.movein.read"], "the words, then the read, once each");
    relinked();
    assert.equal(sent.filter((m) => m.type === "next.you.day").length, 1, "the words told once");
    heard({ ...CODER_READ, kept: null } as never);
    assert.ok(!sup.up, "one answer is enough");
    // a link up with nothing owed asks nothing
    sent.length = 0; relinked();
    assert.equal(sent.length, 0, "answered and nothing owed: no read");
    // the engine never answers: Sol opens after LOOK_MS, never stays on the line
    fresh(); firstWord(null); dayDone("");
    letsMoveIn();
    t.mock.timers.tick(LOOK_MS - 1);
    assert.ok(sup.up, "still looking just before");
    t.mock.timers.tick(1);
    assert.ok(!sup.up && !sup.pressed, "no answer: the start-up goes");
    assert.equal(store.get(SEEN), "1", "and it was marked seen at the press, so it does not come back");
  } finally {
    reset();
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete (globalThis as { localStorage?: unknown }).localStorage;
    link.e = was; CV.setMode("fixture"); clear();
    live.ready = false; live.data = {}; live.asked = false; live.answered = false; live.batch = null; live.folders = []; live.kept = []; st.open = null; CV.load("dev-morning");
  }
});

test("the welcome card's sign in is Sol.app's own: outside it neither AI is drawn, and no line tells a person to run a command (sweep 4)", () => {
  const w = readFileSync(new URL("./next/movein/Welcome.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(w, /auth login|codex login/, "never a terminal command");
  assert.equal((w.match(/if \(!inApp\(\)\) return;/g) ?? []).length, 2, "outside Sol.app: no status asked, no sign-in pressed");
  assert.match(w, /\{ais\.every\(\(a\) => a\.st === "\?"\) \? null : <div className="wl-ai">/, "with neither known, no Your AI line");
});

test("Claude Code's and Codex's rows are only read: never a stop for the keys or a press that does nothing (sweep 3)", () => {
  const ais = fromRead(CODER_READ).rows.filter((r) => r.k === "ai" && r.app);
  assert.ok(ais.length >= 2 && ais.every((r) => r.locked && !r.found), "locked, nothing Sol learned to show");
  const src = readFileSync(new URL("./next/movein/index.tsx", import.meta.url), "utf8");
  assert.match(src, /const still = !!r\.locked && !\(r\.found && !out\);/, "a locked row with nothing to show is still");
  assert.match(src, /tabIndex=\{still \? undefined : 0\}/, "a still row takes no focus");
  assert.match(src, /querySelectorAll<HTMLElement>\("#mvi \.mv-row\[tabindex\]"\)/, "the arrow keys' list is the rows that take focus");
});
