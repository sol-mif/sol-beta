// node --test src/side-moves.test.ts: the walk of moving sessions by hand in the side (step 3b, design #1183 §2; Marco
// 2026-11-14: "the side bar is how we should be able to intuitively move sessions around"). Every gesture is played on
// one fixed list of sessions: what it sends (work.under), and the side's rows, in order, after the engine's broadcast.
// The gestures and what Marco sees: home/side-moves.md. The rules: home/sideUnder.ts; the wiring: home/Side.tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropMove, keyMove, aboveOf, undoOf, moveWords, withPending, settle, refusedBack, headOf, drawnOrder, CYCLE, type Move, type Target } from "./home/sideUnder.ts";
import { foldUnder, underWords } from "./home/sideSort.ts";
import type { Row, St } from "./home/sideRows.ts";

const NOW = 1_800_000_000_000;
const O = { kind: "orchestration" as const };
const r = (id: string, ago: number, more: Partial<Row> = {}): Row => ({ id, title: id, cwd: "/p/sol", project: "/p/sol", updatedAt: NOW - ago, ...more });
// the fixed list: two orchestrators with children, one with nothing under it yet, two loose sessions
const LIST: Row[] = [r("n", 100), r("o1", 200, O), r("a", 300, { under: "o1" }), r("b", 400, { under: "o1" }), r("o2", 500, O), r("c", 600, { under: "o2" }), r("o3", 700, O), r("m", 800)];
const st = (x: Row): St => (x.id === "b" ? "needs" : "");

/** the side as drawn, every orchestrator open: ids top to bottom, children marked with a ">" */
const side = (all: Row[]) => foldUnder(all, st, NOW).flatMap((l) => [l.row.id, ...l.kids.map((k) => `>${k.id}`)]);
const order = (all: Row[]) => drawnOrder(foldUnder(all, st, NOW), () => true);
const words = (all: Row[], id: string) => underWords(foldUnder(all, st, NOW).find((l) => l.row.id === id)!.kids.map(st));

/** a stand-in for the engine: what the face sent, and work.sessions after it broadcasts */
function engine(all: Row[]) {
  const sent: object[] = [];
  return {
    sent,
    play(m: Move): Row[] {
      if (m.do !== "under") return all;
      sent.push({ type: "work.under", sessionId: m.sessionId, under: m.under });
      return (all = all.map((x) => (x.id === m.sessionId ? { ...x, under: m.under ?? undefined } : x)));
    },
  };
}
const drag = (sid: string, t: Target, all = LIST) => { const e = engine(all), m = dropMove(all, sid, t); return { m, after: e.play(m), sent: e.sent }; };

test("the fixed list as drawn: each orchestrator with its children under it", () => {
  assert.deepEqual(side(LIST), ["n", "o1", ">a", ">b", "o2", ">c", "o3", "m"]);
  assert.equal(words(LIST, "o1"), "2 under, 1 needs you");
  assert.equal(words(LIST, "o3"), "nothing under yet");
});

test("1. a child dragged out lets go: on a loose row, a folder's tray, the let-go strip (the folder rule)", () => {
  for (const t of [{ on: "n" }, { on: "m" }, { out: true }] as Target[]) {
    const { sent, after } = drag("a", t);
    assert.deepEqual(sent, [{ type: "work.under", sessionId: "a", under: null }], JSON.stringify(t));
    assert.deepEqual(side(after), ["n", "o1", ">b", "a", "o2", ">c", "o3", "m"], JSON.stringify(t));
    assert.equal(words(after, "o1"), "1 under, 1 needs you");
  }
  // inside its own group it stays: its orchestrator's row, the group's room, a sibling
  for (const t of [{ on: "o1" }, { group: "o1" }, { on: "b" }] as Target[]) assert.deepEqual(dropMove(LIST, "a", t), { do: "none" }, JSON.stringify(t));
  // a loose row dropped out of every group is the tray's own drop
  assert.deepEqual(dropMove(LIST, "n", { out: true }), { do: "pass" });
  // while a child is dragged its group's top says "let go here": the side draws it where headOf(the dragged) is the line's head
  assert.equal(headOf(LIST, "a"), "o1");
  assert.equal(headOf(LIST, "n"), "n", "a loose row draws no let-go line anywhere");
});

test("2. a child dragged onto another orchestrator moves there; the old one's words change", () => {
  for (const t of [{ on: "o2" }, { group: "o2" }, { on: "c" }] as Target[]) {
    const { sent, after } = drag("a", t);
    assert.deepEqual(sent, [{ type: "work.under", sessionId: "a", under: "o2" }], JSON.stringify(t));
    assert.deepEqual(side(after), ["n", "o1", ">b", "o2", ">a", ">c", "o3", "m"]);
    assert.equal(words(after, "o1"), "1 under, 1 needs you");
    assert.equal(words(after, "o2"), "2 under");
  }
});

test("3. an orchestration row onto another nests; a loop is refused with the engine's reason, nothing sent", () => {
  const one = drag("o3", { on: "o1" });
  assert.deepEqual(one.sent, [{ type: "work.under", sessionId: "o3", under: "o1" }]);
  assert.deepEqual(side(one.after), ["n", "o1", ">a", ">b", ">o3", "o2", ">c", "m"]);
  const back = drag("o1", { on: "o3" }, one.after);
  assert.deepEqual(back.m, { do: "refused", on: "o3", why: CYCLE });
  assert.deepEqual(back.sent, []);
  assert.deepEqual(side(back.after), side(one.after), "a refusal moves nothing");
  assert.equal(CYCLE, "that would run it under itself");
  const wire = readFileSync(new URL("../../engine/src/work/wire.ts", import.meta.url), "utf8");
  assert.ok(wire.includes(`no("${CYCLE}")`), "the face says the engine's own words");
});

test("a drop that is not a move: a row on itself is swallowed; a loose row on a loose row goes on to the tray", () => {
  assert.deepEqual(dropMove(LIST, "o1", { on: "o1" }), { do: "none" });
  assert.deepEqual(dropMove(LIST, "o1", { group: "o1" }), { do: "none" });
  assert.deepEqual(dropMove(LIST, "n", { on: "m" }), { do: "pass" });
  assert.deepEqual(dropMove(LIST, "n", { on: "o3" }).do, "under", "a loose row onto an orchestrator, as before");
});

test("4. keys on the picked row: ⌘↓ under the nearest orchestration row above, ⌘↑ lets go; the menu names the target", () => {
  const at = order(LIST);
  assert.deepEqual(at, ["n", "o1", "a", "b", "o2", "c", "o3", "m"]);
  let e = engine(LIST);
  const down = keyMove(LIST, at, "m", "down");
  const after = e.play(down);
  assert.deepEqual(e.sent, [{ type: "work.under", sessionId: "m", under: "o3" }]);
  assert.deepEqual(side(after), ["n", "o1", ">a", ">b", "o2", ">c", "o3", ">m"]);
  assert.equal(words(after, "o3"), "1 under");
  // a child passes over the one it is under: c (under o2) goes to o1
  e = engine(LIST);
  e.play(keyMove(LIST, at, "c", "down"));
  assert.deepEqual(e.sent, [{ type: "work.under", sessionId: "c", under: "o1" }]);
  assert.equal(aboveOf(LIST, at, "c"), "o1");
  // nothing above: nothing happens
  assert.deepEqual(keyMove(LIST, at, "n", "down"), { do: "none" });
  assert.equal(aboveOf(LIST, at, "n"), null);
  assert.deepEqual(keyMove(LIST, at, "b", "down"), { do: "none" }, "only its own orchestrator is above b");
  // ⌘↑
  e = engine(LIST);
  assert.deepEqual(side(e.play(keyMove(LIST, at, "a", "up"))), ["n", "o1", ">b", "a", "o2", ">c", "o3", "m"]);
  assert.deepEqual(e.sent, [{ type: "work.under", sessionId: "a", under: null }]);
  assert.deepEqual(keyMove(LIST, at, "n", "up"), { do: "none" }, "a loose row has nothing to leave");
});

test("5. every move undoes: the undo sends the session back where it was, and the toast says what moved", () => {
  const cases: [string, Target, string][] = [["a", { on: "n" }, "let go from o1"], ["a", { on: "o2" }, "moved under o2"], ["o3", { on: "o1" }, "moved under o1"]];
  for (const [sid, t, said] of cases) {
    const e = engine(LIST), m = dropMove(LIST, sid, t);
    assert.equal(m.do, "under");
    if (m.do !== "under") continue;
    assert.equal(moveWords(LIST, m), said);
    const moved = e.play(m), back = e.play(undoOf(m));
    assert.equal(undoOf(m).undo, true, "G7: the undo says so, so the engine sends no second summary");
    assert.deepEqual(side(back), side(LIST), `${sid} back where it was`);
    assert.deepEqual(e.sent.at(-1), { type: "work.under", sessionId: sid, under: LIST.find((x) => x.id === sid)!.under ?? null });
    assert.notDeepEqual(side(moved), side(LIST));
  }
});

test("6. the words change on the press, and the broadcast never brings the old count back", () => {
  const m = dropMove(LIST, "a", { on: "o2" });
  assert.equal(m.do, "under");
  if (m.do !== "under") return;
  let pending = { [m.sessionId]: m.under };
  assert.equal(words(withPending(LIST, pending), "o1"), "1 under, 1 needs you", "drawn at once");
  assert.equal(words(withPending(LIST, pending), "o2"), "2 under");
  // a broadcast from before the move (another session changed) keeps the move drawn
  const stale = LIST.map((x) => (x.id === "m" ? { ...x, title: "renamed" } : x));
  pending = settle(stale, pending);
  assert.deepEqual(pending, { a: "o2" });
  assert.equal(words(withPending(stale, pending), "o1"), "1 under, 1 needs you");
  // the broadcast that carries it settles it: the same words, nothing pending
  const heard = engine(LIST).play(m);
  pending = settle(heard, pending);
  assert.deepEqual(pending, {});
  assert.deepEqual(side(withPending(heard, pending)), side(withPending(LIST, { a: "o2" })));
});

test("7. the side wires every gesture: row and room drops, the keys, the undo, the shake, the let-go line", () => {
  const src = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./home/side.css", import.meta.url), "utf8");
  assert.match(src, /const m = dropMove\(ws, sid, \{ on: s\.id \}\)/, "a drop on a row");
  assert.match(src, /send\(dropMove\(ws, sid, \{ group: head \}\)\)/, "a drop on a group's room");
  assert.match(src, /keyMove\(k\.ws, k\.drawn\(\), k\.live, ev\.key === "ArrowDown" \? "down" : "up"\)/, "⌘↓ ⌘↑ on the picked row");
  assert.match(src, /`put under \$\{titleOf\(to\) \|\| "untitled"\} ⌘↓`/, "the menu lists ⌘↓, one space before the key");
  assert.match(src, /\["release", "release ⌘↑"/, "the menu lists ⌘↑, one space before the key");
  assert.match(src, /const UNDO_MS = 8000;/);
  assert.match(src, /ev\.key\.toLowerCase\(\) === "z" && !ev\.shiftKey && undoRef\.current && !typing && k\.inSide\(\)/, "⌘Z while the toast is up, and only in the side");
  assert.match(src, /el\.matches\(":hover"\) \|\| el\.contains\(document\.activeElement\)/, "in the side: the pointer or the focus");
  assert.match(src, /!k\.live \|\| !k\.shown \|\| k\.pieceOpen\) return;/, "⌘↓ ⌘↑ only with a row picked and the side seen");
  assert.match(src, /const shown = !soft \|\| soft === "open";/, "not while the side slides away in the talk-alone layout");
  assert.match(src, /void w\.under\(m\.sessionId, m\.under, m\.undo\)/, "one message per move: work.under (an undo says so, G7)");
  assert.match(src, /className=\{`hc-letgo\$\{letOver \? " over" : ""\}`\} aria-hidden \{\.\.\.outDrop\}>drop here to let go<\/span>/, "the let-go strip is a drop of its own (out)");
  assert.ok(src.indexOf("className={`hc-letgo") < src.indexOf("{row(l.row,"), "the let-go strip comes before the head row");
  assert.doesNotMatch(css.match(/\.hc-side \.hc-letgo \{[^}]*\}/)![0], /position: absolute/, "its own strip: it takes room, it never paints over the head");
  assert.match(css, /\.hc-side \.hc-letgo \{[^}]*text-align: left/);
  assert.match(src, /\{undo\.words\} · <button type="button" className="hc-undo-b"/, "the toast is one line, undo the word to press");
  assert.match(src, /m\.under === s\.id \|\| m\.under === headOf\(ws, s\.id\)\) \? m\.under : null/, "over another orchestrator's child, that orchestrator lights");
  assert.match(src, /title=\{refused\?\.id === s\.id \? refused\.why : undefined\}/, "the refusal's reason as the row's title");
  assert.match(css, /\.hc-row\.hc-shake \{ animation: hc-shake var\(--d-reveal\)/, "the shake: a reveal long (120 ms)");
  const pal = readFileSync(new URL("./palette.css", import.meta.url), "utf8");
  assert.match(pal, /--d-reveal: 120ms/);
  const doc = readFileSync(new URL("./home/side-moves.md", import.meta.url), "utf8");
  assert.ok(doc.trim().split("\n").filter((l) => l.startsWith("- ")).length >= 10, "side-moves.md: ten gestures, each a line");
});

test("G7: the side sends the undo's mark with the move, and the face's ask carries it to the engine", () => {
  const side = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8"), work = readFileSync(new URL("./work/useWork.ts", import.meta.url), "utf8");
  assert.match(side, /w\.under\(m\.sessionId, m\.under, m\.undo\)/);
  assert.match(work, /"work\.under", \{ sessionId: id, under, \.\.\.\(undo \? \{ undo: true \} : \{\}\) \}/);
});

test("H8: an open orchestrator's group has a room of its own: a drop there lands in the group", () => {
  const src = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./home/side.css", import.meta.url), "utf8");
  assert.match(src, /className=\{`hc-line\$\{orch && open \? " hc-room" : ""\}`\} \{\.\.\.\(orch \? groupDrop\(l\.row\.id\) : \{\}\)\}/, "the room is the group's line, its drop the group's");
  assert.match(css, /\.hc-side \.hc-line\.hc-room \{ padding-bottom: var\(--s2\); \}/, "the room has real height");
  // a drop on the room: a child of its own stays, a loose row goes under, another group's child moves there
  assert.deepEqual(dropMove(LIST, "a", { group: "o1" }), { do: "none" });
  assert.deepEqual(drag("m", { group: "o3" }).sent, [{ type: "work.under", sessionId: "m", under: "o3" }]);
  assert.deepEqual(drag("c", { group: "o1" }).sent, [{ type: "work.under", sessionId: "c", under: "o1" }]);
});

test("H10: over a child of another orchestrator, the move goes under that child's head (the row that lights)", () => {
  const m = dropMove(LIST, "a", { on: "c" });
  assert.equal(m.do === "under" && m.under, "o2");
  assert.equal(headOf(LIST, "c"), "o2");
});

test("H11: a refused move rolls back: off pending, its undo gone; another move's undo stays", () => {
  const m = dropMove(LIST, "a", { on: "o2" });
  assert.equal(m.do, "under");
  if (m.do !== "under") return;
  const u = { m, words: moveWords(LIST, m), at: 1 };
  const r = refusedBack({ a: "o2", m: "o3" }, u, m);
  assert.deepEqual(r.pending, { m: "o3" });
  assert.equal(r.undo, null);
  assert.deepEqual(side(withPending(LIST, r.pending)).slice(0, 4), ["n", "o1", ">a", ">b"], "a is back under o1");
  const other = dropMove(LIST, "m", { on: "o3" });
  if (other.do !== "under") return assert.fail();
  assert.equal(refusedBack({ a: "o2" }, { m: other }, m).undo?.m, other, "the toast of another move stays");
  const src = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(!r\?\.error\) return;\s*setPending\(\(p\) => refusedBack\(p, null, m\)\.pending\);\s*setUndo\(\(u\) => refusedBack\(\{\}, u, m\)\.undo\);/, "the side rolls back on the engine's refusal");
});

test("H11, H13: a nested orchestrator onto its own child, by ⌘↓ or by a drop, is a loop: refused, never released", () => {
  // o3 nested under o1, o4 nested under o3, k under o3
  const L: Row[] = [r("o1", 100, O), r("o3", 200, { ...O, under: "o1" }), r("o4", 300, { ...O, under: "o3" }), r("k", 400, { under: "o3" })];
  // ⌘↓ on o3 where the nearest orchestration row above it is its own nested child o4
  assert.deepEqual(keyMove(L, ["o4", "o3"], "o3", "down"), { do: "refused", on: "o3", why: CYCLE });
  // a drop of o3 on its own plain child k: refused (it used to read as a sibling drop and let o3 go from o1)
  assert.deepEqual(dropMove(L, "o3", { on: "k" }), { do: "refused", on: "k", why: CYCLE });
  // and on its nested orchestrator child
  assert.deepEqual(dropMove(L, "o3", { on: "o4" }), { do: "refused", on: "o4", why: CYCLE });
  // a sibling drop that is no loop keeps it (the folder rule): k onto a plain sibling stays under o3
  const L2 = [...L, r("j", 500, { under: "o3" })];
  assert.deepEqual(dropMove(L2, "k", { on: "j" }), { do: "none" });
  // a head up its own chain takes it up a level: k onto o1 goes under o1
  assert.deepEqual(dropMove(L2, "k", { on: "o1" }), { do: "under", sessionId: "k", under: "o1", was: "o3" });
  const doc = readFileSync(new URL("./home/side-moves.md", import.meta.url), "utf8");
  assert.match(doc, /A nested orchestrator onto its own child/);
});

test("H16: the under and release rules are sideUnder.ts; the rows' motion stays sideMoves.ts", () => {
  const src = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  assert.match(src, /from "\.\/sideUnder"/);
  assert.match(src, /from "\.\/sideMoves"/);
  assert.doesNotMatch(src, /from "\.\/sideMove"/);
});
