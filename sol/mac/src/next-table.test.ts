// node --test src/*.test.ts: a session's table (BR1 inside.html §2 and §3; cv/moves/table.ts). What it uses (what the person
// gave it, its folder's pages) and what it made, as pieces, never folders; a piece dragged in is its next message and on
// its table from then on, with an Undo. Invented people only (the dev-morning fixture).
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { gaveNote, givenWords, tableOf } from "./next/cv/moves/table.ts";

const sessions = () => Object.values(CV.D.pieces).filter((p) => p.kind === "session");
/** a session and a page of the canvas in another folder, so the page is not on its table yet */
function pair() {
  const s = sessions()[0];
  const page = Object.values(CV.D.pieces).find((p) => (p.kind === "doc" || p.kind === "list") && p.region !== s.region && !p.inside);
  assert.ok(s && page, "the fixture has a session and a page elsewhere");
  return { s, page: page! };
}

test("a session's table holds pieces, never folders or sessions, and says where each came from", () => {
  CV.load("dev-morning");
  for (const s of sessions()) {
    const t = tableOf(s.id);
    for (const x of t) {
      assert.ok(!["session", "folder", "starter", "arrivals", "copies"].includes(x.kind), `${s.id}: ${x.kind} is not a piece of its table`);
      assert.ok(x.from.length > 0);
      if (x.how === "folder") assert.equal(CV.D.pieces[x.piece!]?.region, s.region, "its folder's pages are its own folder's");
    }
    if ((s.files ?? 0) > 0) assert.ok(t.some((x) => x.kind === "change" && x.how === "made"), `${s.id}: its change is on its table`);
  }
  assert.deepEqual(tableOf("nobody"), []);
  const notSession = Object.values(CV.D.pieces).find((p) => p.kind !== "session")!;
  assert.deepEqual(tableOf(notSession.id), []);
});

test("a piece dragged into a session: its next message, first on its table, once; Undo takes it off", () => {
  CV.load("dev-morning");
  const { s, page } = pair(), talk = (s.talk ?? []).length;
  const r = CV.M.table_give(s.id, page.id);
  assert.equal(r.ok, true);
  const t = tableOf(s.id);
  assert.equal(t[0].piece, page.id);
  assert.equal(t[0].how, "gave");
  assert.equal(t[0].from, "you gave it");
  assert.equal((CV.D.pieces[s.id].talk ?? []).length, talk + 1);
  assert.match(String(CV.D.pieces[s.id].talk!.at(-1)), /^you: Here is a (page|list) to use: /);
  assert.ok(CV.D.pieces[page.id], "the piece stays on the canvas");
  assert.equal(CV.M.table_give(s.id, page.id).ok, false, "it has it already");
  r.undo?.();
  assert.ok(!tableOf(s.id).some((x) => x.how === "gave"));
});

test("only a session takes a piece, and only a piece is given", () => {
  CV.load("dev-morning");
  const { s, page } = pair();
  assert.equal(CV.M.table_give(page.id, s.id).ok, false);
  assert.equal(CV.M.table_give(s.id, sessions()[1]?.id ?? s.id).ok, false);
  assert.equal(CV.M.table_give(s.id, "nobody").ok, false);
});

test("a note given to a session is on its table, by its first line, under its session id or piece id", () => {
  CV.load("dev-morning");
  const s = sessions()[0];
  gaveNote(String(s.sessionId ?? s.id), "note-x", "keep it short\nand warm");
  const n = tableOf(s.id).find((x) => x.key === "note-x");
  assert.ok(n);
  assert.equal(n!.title, "keep it short");
  assert.equal(n!.kind, "note");
  gaveNote("nobody", "note-y", "lost");
  assert.ok(!sessions().some((p) => tableOf(p.id).some((x) => x.key === "note-y")));
});

test("the words a session reads carry the piece's name and what it says", () => {
  assert.equal(givenWords({ kind: "doc", name: "Brief", text: "the prices" }), "Here is a page to use: Brief\n\nthe prices");
  assert.equal(givenWords({ kind: "list", name: "Groceries" }), "Here is a list to use: Groceries");
});
