// node --test src/*.test.ts: Mark up (BR1, #1615; next/markup/model.ts): a press on a piece or a folder is a mark on that
// thing (never the bar or a card), one mark per thing, a few words each; Send gives the session the marks as { thing,
// words } with what Sol knows, read by the engine (next.markup.read) and said with work.say, to the session open now or
// a new one in the first marked folder. Invented folders only (the fixture's Dev). Signed: marcocyl04-ux's agent
// (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { attach as nearWire } from "./next/cv/wire/near.ts";
import { MAX_MARKS, cutOf, doneIn, endMarking, leadOf, markUp, marksOut, mu, nameLine, noteAt, press, readingOrder, removeName, send, stepTo, targetOf, textHere, thingAt, tipDue, toggleMarking, toWords, unmark, whatOf, words } from "./next/markup/model.ts";

type Sent = Record<string, unknown>;
/** an element as thingAt reads it: closest() over a chain of attributes */
const el = (chain: Record<string, string>[]) => ({
  closest(sel: string) {
    for (const a of chain) for (const s of sel.split(",")) {
      const m = s.trim().match(/^\[data-([\w-]+)\]$|^\.pl-area\[data-area\]$|^#([\w-]+)$|^\[role=dialog\]$|^\.([\w-]+)$/);
      if (!m) continue;
      if (m[1] && a["data-" + m[1]] !== undefined) return { dataset: { [m[1]]: a["data-" + m[1]] } };
      if (s.trim() === ".pl-area[data-area]" && a.class === "pl-area" && a["data-area"]) return { dataset: { area: a["data-area"] } };
      if (m[2] && a.id === m[2]) return {};
      if (s.trim() === "[role=dialog]" && a.role === "dialog") return {};
      if (m[3] && a.class === m[3]) return {};
    }
    return null;
  },
}) as unknown as Element;

test("a press: a piece is a mark on that piece (a session by its session), a folder on that folder, the bar or a card none", () => {
  CV.setMode("fixture"); CV.load("dev-morning");
  const ada = CV.D.pieces["s-Ada"];
  assert.deepEqual(thingAt(el([{ "data-piece": "s-Ada" }, { "data-region": "api" }])), { thing: "s-Ada", kind: "session", name: "Fix login", in: ada.region, session: String(ada.sessionId ?? "s-Ada") }, "the piece, not the folder around it");
  assert.deepEqual(thingAt(el([{ "data-piece": "lease" }])), { thing: "lease", kind: "piece", name: "lease renewal", in: "home" });
  assert.deepEqual(thingAt(el([{ class: "pl-area", "data-area": "money" }])), { thing: "money", kind: "folder", name: "money", in: null });
  assert.equal(thingAt(el([{ id: "bar" }, { "data-region": "api" }])), null, "the bar is never a thing");
  assert.equal(thingAt(el([{ role: "dialog" }, { "data-piece": "lease" }])), null, "nor a card");
  assert.equal(thingAt(el([{ "data-piece": "no-such" }])), null);
});

test("marks: one per thing, words on each, taken off, capped; Cancel forgets them", () => {
  CV.setMode("fixture"); CV.load("dev-morning"); markUp(false);
  markUp(true);
  const api = thingAt(el([{ "data-region": "api" }]))!, lease = thingAt(el([{ "data-piece": "lease" }]))!;
  assert.equal(press(api), 0); assert.equal(press(lease), 1); assert.equal(press(api), 0, "the same thing twice is the one mark");
  words(0, "too many in here"); words(1, " this goes first ");
  assert.deepEqual(marksOut(), [{ thing: "api", words: "too many in here", kind: "folder", name: "api", in: null }, { thing: "lease", words: "this goes first", kind: "piece", name: "lease renewal", in: "home" }]);
  unmark(0);
  assert.deepEqual(mu.marks.map((m) => m.thing), ["lease"]);
  for (let i = 0; i < 20; i++) press({ thing: "f" + i, kind: "folder", name: "f" + i, in: null });
  assert.equal(mu.marks.length, MAX_MARKS);
  markUp(false);
  assert.equal(mu.on, false); assert.deepEqual(mu.marks, []);
});

test("a chip's × is named by its mark's words, cut after a whole word, or by its thing when it has none", () => {
  assert.equal(removeName({ name: "api", words: " too many in here " }), "Remove your note “too many in here”");
  assert.equal(removeName({ name: "lease renewal", words: "" }), "Remove “lease renewal” from your message");
  assert.equal(removeName({ name: "api", words: "this folder has far too many old drafts lying about in it" }), "Remove your note “this folder has far too many old drafts…”");
});

test("fixture Send: the session open now gets the marks in its thread, each on its thing, and Mark up closes", async () => {
  CV.setMode("fixture"); CV.load("dev-morning"); markUp(false);
  CV.S.piece = "s-Ada";
  markUp(true);
  press(thingAt(el([{ "data-region": "api" }]))!); words(0, "too many in here");
  mu.text = "sort these out";
  assert.equal(toWords(targetOf()), "to this session");
  assert.equal(await send(), true);
  const last = (CV.D.pieces["s-Ada"].talk as string[]).at(-1)!;
  assert.equal(last, "you: sort these out\nI marked one thing in Sol; each mark is on the thing itself:\n1. On the folder “api” (api): “too many in here”.\nWhen a mark's change is made, say its number and “done” (as in “1 done”), so its pin clears.");
  assert.equal(mu.on, false);
  assert.deepEqual(mu.out, [{ n: 1, thing: "api", kind: "folder", name: "api", done: false }], "the sent mark stays a pin on its thing until its change lands");
  mu.out = [];
  CV.S.piece = null;
});

test("live Send: the engine reads the marks (next.markup.read) and its text is said to a new session in the first marked folder", async () => {
  CV.load("dev-morning"); CV.setMode("live"); markUp(false); CV.S.piece = null;
  const sent: Sent[] = [], subs: ((m: Sent) => void)[] = [];
  const e = { send: (m: Sent) => { sent.push(m); if (m.type === "next.markup.read") queueMicrotask(() => subs.forEach((f) => f({ type: "next.markup", rid: m.rid, ok: true, text: "from the engine" }))); return true; },
    subscribe: (f: (m: Sent) => void) => { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; } } as never;
  const off = nearWire(e);
  try {
    CV.D.regions.find((r) => r.id === "money")!.path = "/Users/you/money";
    markUp(true);
    press(thingAt(el([{ "data-piece": "lease" }]))!); press(thingAt(el([{ "data-region": "money" }]))!); words(1, "the rent lives here");
    assert.equal(toWords(targetOf()), "to a new session in money", "lease's folder has no path; money's has");
    assert.equal(await send(), true);
    const read = sent.find((m) => m.type === "next.markup.read")!;
    assert.deepEqual(read.marks, [{ thing: "lease", words: "", kind: "piece", name: "lease renewal", in: "home" }, { thing: "money", words: "the rent lives here", kind: "folder", name: "money", in: null }]);
    const say = sent.find((m) => m.type === "work.say")!;
    assert.equal(read.text, "the rent lives here", "no words for all: the marks' own words lead, and name the new session");
    assert.equal(say.text, "from the engine\nWhen a mark's change is made, say its number and “done” (as in “1 done”), so its pin clears.");
    assert.equal(say.fresh, true); assert.equal(say.cwd, "/Users/you/money");
    // the session's reply names the done numbers: that pin fades, the other waits
    subs.forEach((f) => f({ type: "work.item", sessionId: "someone-else", item: { kind: "you", text: "1 done" } }));
    assert.deepEqual(mu.out.map((o) => o.done), [false, false], "another session's reply clears nothing");
    subs.forEach((f) => f({ type: "work.item", sessionId: say.sessionId, item: { kind: "you", text: "Money's front now names who owes. 2 done." } }));
    assert.deepEqual(mu.out.map((o) => [o.n, o.done]), [[1, false], [2, true]]);
  } finally { off(); markUp(false); mu.out = []; CV.setMode("fixture"); CV.load("dev-morning"); }
});

test("textHere says the marks as the engine does, without what Sol knows", () => {
  assert.equal(textHere("", [{ thing: "s1", kind: "session", name: "Fix login", in: null, session: "4b1c", words: "" }]), "I marked one thing in Sol; each mark is on the thing itself:\n1. On the session “Fix login” (session 4b1c).");
});

test("by keys (BR1 item 5, builder F): Tab goes in reading order and round, an arrow to the nearest thing that way", () => {
  // three folders in a row, one piece under the middle one (invented ids)
  const at = (thing: string, x: number, y: number) => ({ t: { thing }, x, y, w: 100, h: 60 });
  const s = readingOrder([at("p", 160, 200), at("c", 320, 12), at("a", 0, 0), at("b", 160, 8)]);
  assert.deepEqual(s.map((x) => x.t.thing), ["a", "b", "c", "p"], "a row read left to right, though its tops differ a little");
  assert.equal(stepTo(s, null, "next")?.t.thing, "a", "from nothing: the first");
  assert.equal(stepTo(s, null, "prev")?.t.thing, "p", "from nothing back: the last");
  assert.equal(stepTo(s, "p", "next")?.t.thing, "a", "Tab goes round");
  assert.equal(stepTo(s, "a", "prev")?.t.thing, "p");
  assert.equal(stepTo(s, "a", "right")?.t.thing, "b");
  assert.equal(stepTo(s, "b", "down")?.t.thing, "p", "down: the one under it");
  assert.equal(stepTo(s, "p", "up")?.t.thing, "b", "up: the nearest above, not the one across");
  assert.equal(stepTo(s, "c", "right")?.t.thing, "c", "nothing that way: it stays");
  assert.equal(stepTo([], null, "next"), null);
});

// ---------------------------------------------------------------- the drawing, mine/look/br1/markup.html (builder M)
test("the hand names a thing before the press: its name, what it is and where it sits", () => {
  CV.setMode("fixture"); CV.load("dev-morning");
  assert.equal(nameLine(thingAt(el([{ "data-piece": "lease" }]))!), "lease renewal · a page in home, errands");
  assert.equal(nameLine(thingAt(el([{ "data-region": "money" }]))!), "money · a folder");
  assert.equal(whatOf({ thing: "s-Ada", kind: "session", in: CV.D.pieces["s-Ada"].region }), `a session in ${CV.regionOf(CV.D.pieces["s-Ada"].region)!.name}`);
  assert.equal(whatOf({ thing: "loose", kind: "piece", in: null }), "a piece on the canvas");
});

test("Esc ends marking and keeps the marks in the bar; with none, all of it closes; ⇧⌘M starts and ends it", () => {
  CV.setMode("fixture"); CV.load("dev-morning"); markUp(false);
  toggleMarking(); assert.equal(mu.on, true);
  press(thingAt(el([{ "data-region": "api" }]))!); words(0, "too many in here");
  endMarking();
  assert.equal(mu.on, false); assert.deepEqual(mu.marks.map((m) => m.words), ["too many in here"], "the marks wait in the bar");
  toggleMarking(); assert.equal(mu.on, true); assert.equal(mu.marks.length, 1, "marking again adds to them");
  unmark(0); endMarking();
  assert.equal(mu.on, false); assert.deepEqual(mu.marks, []);
});

test("the reply's done numbers: plain, circled, listed, after done:, never a stray number", () => {
  assert.deepEqual(doneIn("Moved the Diary to the top right. ① done."), [1]);
  assert.deepEqual(doneIn("1 done. Invoices' front now names who owes. 2 done"), [1, 2]);
  assert.deepEqual(doneIn("Marks 1 and 3 are done; #2 is done too"), [1, 2, 3]);
  assert.deepEqual(doneIn("done: 2, 4"), [2, 4]);
  assert.deepEqual(doneIn("I changed 3 files and I'm done", 2), [], "a number past the marks is not a mark");
  assert.deepEqual(doneIn("Working on 2 now"), []);
});

test("a new session is named from the words: the words for all, else the marks' own", () => {
  assert.equal(leadOf(" sort these ", [{ words: "a" }]), "sort these");
  assert.equal(leadOf("", [{ words: " move this to the top right " }, { words: "" }, { words: "show which client owes" }]), "move this to the top right; show which client owes");
  assert.equal(textHere("", [{ thing: "api", kind: "folder", name: "api", in: null, words: "too many" }]).split("\n")[0], "too many");
});

test("a still is cut from the window's shot at the shot's scale, a little around the thing, inside the shot", () => {
  assert.deepEqual(cutOf({ x: 100, y: 50, w: 200, h: 100 }, { w: 2880, h: 1800 }, { w: 1440, h: 900 }), { x: 184, y: 84, w: 432, h: 232 });
  assert.deepEqual(cutOf({ x: 100, y: 50, w: 200, h: 100 }, { w: 2880, h: 1856 }, { w: 1440, h: 900 }), { x: 184, y: 140, w: 432, h: 232 }, "a title bar above the window's points");
  assert.deepEqual(cutOf({ x: 2, y: 2, w: 20, h: 20 }, { w: 1440, h: 900 }, { w: 1440, h: 900 }), { x: 0, y: 0, w: 30, h: 30 }, "never left of or above the shot");
});

test("the first time marking is on, a tip says what Mark up is; it is read once a thing is pinned or marking ends", () => {
  const was = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), store = new Map<string, string>();
  const stub = (v: unknown) => Object.defineProperty(globalThis, "localStorage", { value: v, configurable: true, writable: true });
  stub({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  try {
    assert.equal(tipDue(), true, "never read: due");
    markUp(true);
    assert.equal(tipDue(), true, "marking with nothing pinned: still due");
    press({ thing: "tip-a", kind: "piece", name: "A page", in: null });
    assert.equal(tipDue(), false, "a thing pinned: read");
    markUp(false); store.clear();
    markUp(true); endMarking();
    assert.equal(tipDue(), false, "marking ended: read");
    stub(undefined);
    assert.equal(tipDue(), false, "a window with no storage shows no tip");
  } finally {
    if (was) Object.defineProperty(globalThis, "localStorage", was); else delete (globalThis as { localStorage?: unknown }).localStorage;
    markUp(false);
  }
});

test("a note hangs where it covers no other thing, no note before it and not its own thing, inside the room", () => {
  // a tall piece on the left, two folders in a row, one under the first, an area holding the folders; the room is the
  // canvas under the strip
  const life = { x: 686, y: 163, w: 213, h: 127 }, mine = { x: 920, y: 163, w: 213, h: 127 }, below = { x: 686, y: 313, w: 213, h: 123 };
  const diary = { x: 281, y: 165, w: 359, h: 540 }, area = { x: 660, y: 120, w: 760, h: 400 }, room = { x: 256, y: 160, w: 1180, h: 600 }, size = { w: 210, h: 48 };
  const seen = [diary, area, life, mine, below];
  assert.deepEqual(noteAt(mine, size, room, seen), { x: 920, y: 296 }, "under the thing when that is free; the area holding it does not count");
  const p = noteAt(life, size, room, seen);
  assert.equal(p.y, 296, "the least covered spot when none is free: under, over the next folder's empty tab, never over its own words");
  assert.deepEqual(noteAt(mine, size, room, [...seen, { x: 920, y: 296, ...size }]), { x: 1139, y: 163 }, "beside it when a note is already under it");
  const card = (r: { x: number; w: number; h: number }) => (r.x < 640 ? r.w * r.h : 0);   // a card that is no thing, at the left
  assert.equal(noteAt(life, size, room, [area, life, mine, below], card).y, 296, "a card that is no thing is cover too");
  const edge = noteAt({ x: 1300, y: 700, w: 120, h: 50 }, size, room, []);
  assert.ok(edge.x + size.w <= room.x + room.w && edge.y + size.h <= room.y + room.h && edge.x >= room.x && edge.y >= room.y, "always inside the room");
});
