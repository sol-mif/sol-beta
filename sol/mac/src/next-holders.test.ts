// node --test src/*.test.ts: the holders (BR1 #1615, mine/look/br1/holders.html; next/holders/model.ts): born with every
// home as pieces on the canvas, never over a folder; Archive on a session is one scoped line in what Sol knows, with Undo,
// and found again under Sessions › Archived; a holder from the person's words gathers by them. Invented things only.
// Signed: marcocyl04-ux's agent (builder HO), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { link } from "./next/cv/wire/plane.ts";
import { bindLine, type Line } from "./next/bar/undo.ts";
import * as L from "./next/plane/layout.ts";
import { MADE, SESSIONS, archive, archivedAt, archivedFrom, archivedNow, askHolder, bringBack, gathered, holderIds, reset, restOrder, sessionRank, sessionsOf, termsOf, weekRank, type ArchivedThing } from "./next/holders/model.ts";
import { collect } from "./next/collection-state.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Piece } from "./next/cv/core.ts";

type Sent = Record<string, unknown>;
const meets = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("every home is born with Sessions and Made, placed by the rule beside the folders, over none of them", () => {
  reset(); CV.setMode("fixture");
  for (const scn of ["denise", "dev-morning"]) {
    CV.load(scn);
    assert.deepEqual(holderIds(), [SESSIONS, MADE]);
    const hs = holderIds().map((id) => CV.D.pos![id]);
    assert.ok(hs.every(Boolean), `${scn}: both placed`);
    assert.ok(hs.every((q) => q.by === "rule"));
    for (const r of CV.D.regions.filter((r) => !CV.parentOf(r.id) && !L.isOff(r.id))) for (const q of hs) assert.ok(!meets(q, CV.D.pos![r.id]), `${scn}: a holder over ${r.name}`);
    assert.ok(!meets(hs[0], hs[1]), `${scn}: the two apart`);
  }
});

test("work.sessions' archived rows are the archived list, newest first; the gone and the kept are not in it", () => {
  const a = archivedFrom({ sessions: [
    { id: "s1", title: "Flyer draft", project: "/home/you/bakery", archived: true, updatedAt: 10 },
    { id: "s2", title: "Kept one", archived: false, updatedAt: 30 },
    { id: "s3", title: "Gone one", archived: true, gone: true, updatedAt: 40 },
    { id: "s4", archived: true, updatedAt: 20 },
  ] });
  assert.deepEqual(a.map((x) => [x.id, x.name]), [["s4", "A session"], ["s1", "Flyer draft"]]);
  assert.equal(a[1].region, "w:/home/you/bakery");
});

test("at rest a holder shows what needs the person first, then what is working, then the most recent", () => {
  reset(); CV.setMode("fixture"); CV.load("dev-morning");
  const ps = restOrder(sessionsOf());
  const rank = (p: (typeof ps)[number]) => (Object.values(CV.D.asks).some((a) => a.piece === p.id && !a.answered && !a.withdrawn) ? 0 : p.state === "working" ? 1 : 2);
  for (let i = 1; i < ps.length; i++) assert.ok(rank(ps[i - 1]) <= rank(ps[i]), `${ps[i - 1].name} before ${ps[i].name}`);
});

test("live: ⋯ Archive on a session takes it off the canvas, marks it archived and writes one scoped line with its because; Undo and Bring back put it back", () => {
  reset(); CV.setMode("fixture"); CV.load("dev-morning");
  const p = sessionsOf()[0], rid = String(p.region);
  CV.setMode("live");
  const sent: Sent[] = [], lines: (Line | null)[] = [];
  link.e = { send: (m: Sent) => { sent.push(m); return true; }, subscribe: () => () => {} } as never;
  bindLine((l) => lines.push(l));
  try {
    assert.ok(archive(p.id));
    assert.equal(CV.D.pieces[p.id], undefined, "off the canvas at once");
    assert.deepEqual(archivedNow().map((x) => x.id), [p.id], "under Sessions › Archived");
    assert.deepEqual(sent[0], { type: "work.mark", sessionId: p.id, patch: { archived: true } });
    assert.deepEqual(sent[1], { type: "next.known.fix", how: "hide", what: `the session ${p.name}`, place: rid, reason: `session:${p.id}` }, "one line, scoped to its folder, its because the session");
    assert.equal(sent.length, 2);
    assert.match(lines.at(-1)!.words, /is archived\. It’s in Sessions › Archived$/);
    lines.at(-1)!.undo!();
    assert.ok(CV.D.pieces[p.id], "Undo: back where it was");
    assert.equal(archivedNow().length, 0);
    assert.deepEqual(sent.slice(2), [{ type: "work.mark", sessionId: p.id, patch: { archived: false } }, { type: "next.known.fix", how: "show", what: `the session ${p.name}`, place: rid, reason: `session:${p.id}` }]);
    assert.ok(archive(p.id)); sent.length = 0;
    assert.ok(bringBack(p.id), "Bring back, from Archived");
    assert.deepEqual(sent.map((m) => m.type), ["work.mark", "next.known.fix"]);
    assert.equal(sent[1].how, "show");
    // a session in no folder: its line says everywhere out loud (the engine refuses a fix with no place, K's spine)
    const q = sessionsOf().find((x) => x.id !== p.id)!;
    delete (q as { region?: unknown }).region; sent.length = 0;
    assert.ok(archive(q.id));
    assert.deepEqual(sent[1], { type: "next.known.fix", how: "hide", what: `the session ${q.name}`, place: "everywhere", reason: `session:${q.id}` });
    assert.ok(!archive("no-such"), "nothing to archive: no line");
  } finally { bindLine(null); link.e = null; CV.setMode("fixture"); reset(); }
});

test("a holder from the person's words: named from them, marked new, gathering only what carries every word", () => {
  reset(); CV.setMode("fixture"); CV.load("dev-morning");
  assert.deepEqual(termsOf("keep every client preview link in one place"), ["client", "preview", "link"]);
  const a = askHolder("Keep every client preview link in one place.")!;
  assert.equal(a.name, "Client preview link");
  assert.equal(a.of, "made");
  assert.ok(!a.touched, "✦ until touched");
  assert.deepEqual(holderIds(), [SESSIONS, MADE, a.id], "after the two");
  CV.D.pieces.x1 = { id: "x1", region: CV.D.regions[0].id, kind: "page", name: "Client preview link", by: "ai" };
  CV.D.pieces.x2 = { id: "x2", region: CV.D.regions[0].id, kind: "page", name: "Client invoice", by: "ai" };
  assert.deepEqual(gathered(a).map((p) => p.id), ["x1"]);
  assert.equal(askHolder("keep the in one place"), null, "no words to gather by: no holder");
  reset();
});

test("opened, each list is the one list (Collection, root part 4): what ranks drawn in order, the rest one count line by day", () => {
  reset(); CV.setMode("fixture"); CV.load("dev-morning");
  const NOW = new Date(2026, 10, 22, 15).getTime(), H = 3600_000, DAY = 24 * H;
  const s = (id: string, state: string, last: number): Piece => ({ id, kind: "session", name: id, state, last } as Piece);
  CV.D.asks = { q1: { id: "q1", piece: "ask", q: "which sites?" } as never };
  const ps = [s("old", "done", NOW - 9 * DAY), s("work", "working", NOW - 3 * DAY), s("today", "done", NOW - 2 * H), s("ask", "idle", NOW - 20 * DAY), s("wed", "done", NOW - 4 * DAY)];
  // Recent: needs you, then working, then today's; the rest folded, newest first, one heading a day
  const r = collect(ps, sessionRank("recent", CV.D, NOW), NOW);
  assert.deepEqual(r.drawn.map((p) => p.id), ["ask", "work", "today"]);
  assert.deepEqual(r.rest.map((p) => p.id), ["wed", "old"]);
  assert.equal(r.days.length, 2, "one heading a day");
  // All: the week, newest first; Needs you and Working draw all of theirs
  assert.deepEqual(collect(ps, sessionRank("all", CV.D, NOW), NOW).drawn.map((p) => p.id), ["today", "work", "wed"]);
  assert.deepEqual(collect(ps.filter((p) => p.id === "ask"), sessionRank("needs", CV.D, NOW), NOW).drawn.map((p) => p.id), ["ask"], "an old one that needs you is still drawn");
  // Archived: sessions and folders together, the week drawn, older ones in the count line
  const things: ArchivedThing[] = [{ k: "session", a: { id: "a1", name: "Menu prices", region: "w:/u/x/menu", at: NOW - DAY } },
    { k: "folder", x: { folder: "w:/u/x/old", name: "old", by: "person", why: "you put it there", at: new Date(NOW - 30 * DAY).toISOString() } }];
  const a = collect(things, weekRank(archivedAt, NOW), NOW);
  assert.deepEqual([a.drawn.length, a.rest.length], [1, 1]);
  // the view draws them through Collection, with no list of its own beside it
  const view = readFileSync(fileURLToPath(new URL("./next/holders/Holders.tsx", import.meta.url)), "utf8").split("// ---------------------------------------------------------------- opened up close")[1] ?? "";
  assert.equal((view.match(/<Collection /g) ?? []).length, 4, "Sessions (filters, Archived), Made and an asked holder");
  assert.doesNotMatch(view, /function Groups|\.slice\(|\.sort\(/, "opened, no grouping, cap or order of its own (at rest the card's few lines are its own)");
  reset();
});

test("an opened folder's finished sessions are the Sessions holder's rows: by when each last moved, the older ones one count line, a press opens a tab (walk note item 4)", () => {
  reset(); CV.setMode("fixture"); CV.load("dev-morning");
  const NOW = new Date(2026, 10, 22, 15).getTime(), H = 3600_000, DAY = 24 * H;
  // born long ago and moved today comes first: by last (updatedAt), never by born
  const s = (id: string, born: number, last: number): Piece => ({ id, kind: "session", name: id, state: "done", born, last } as Piece);
  const ps = [s("born-new", NOW - 2 * H, NOW - 2 * H), s("moved-today", NOW - 60 * DAY, NOW - H), s("old", NOW - 40 * DAY, NOW - 20 * DAY)];
  const r = collect(ps, sessionRank("all", CV.D, NOW), NOW);
  assert.deepEqual(r.drawn.map((p) => p.id), ["moved-today", "born-new"]);
  assert.deepEqual(r.rest.map((p) => p.id), ["old"], "older than the week: one count line");
  const src = readFileSync(fileURLToPath(new URL("./next/folder/index.tsx", import.meta.url)), "utf8");
  assert.match(src, /<SessionRow key=\{p\.id\} p=\{p\} here open=\{\(x\) => M\.tabOpen\(x\.id, true\)\} \/>/, "a row's press takes the session out to a tab");
  assert.match(src, /ranking=\{sessionRank\("all"\)\}/);
  assert.doesNotMatch(src, /card\(p, true\)\}/, "no done chips by born");
  reset();
});
