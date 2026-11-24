// The because's fix, its words (next/because/fix.ts; BR1, #1615; mine/look/br1/because.html scene 2): the preview's
// headline says how many things Sol does would change and from when; the frame's line once kept; the fixer held.
// Signed: marcocyl04-ux's agent (builder F).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOW_W, changed, howW, placeWord, fixerNow, kept, lineOf, setFixer, waysOf, type Fixer } from "./next/because/fix.ts";
import { previewOf } from "./next/because/fixture.ts";
import { attach, fixerOf, knownEngine, placerOf, sourceSet } from "./next/cv/wire/because.ts";
import { DRAG_W, PLACE_W, samePlacedW, placeSaid, placeWays, placedOf, placerNow, solPlaced } from "./next/because/place.ts";
import * as CV from "./next/cv/index.ts";
import * as Shelf from "./next/shelf/model.ts";
import { known, type Known } from "./next/known.ts";
import { keysOf } from "./next/cv/wire/needs.ts";
import * as B from "./next/diary/book.ts";

test("a fix's preview: how many things change, from when only when they all start together", () => {
  assert.equal(changed([]), "Nothing Sol does would change. Keep it anyway?", "nothing changes: said, and still a choice");
  assert.equal(changed([{ what: "thesis", from: "before 11", to: "19:00", when: "tomorrow" }]), "1 thing changes from tomorrow");
  assert.equal(changed(previewOf("fact:1", "not-anymore", "evenings")), "2 things change from tomorrow", "Ana's scene 2");
  assert.equal(changed([{ what: "a", to: "b", when: "tomorrow" }, { what: "c", to: "d", when: "now" }]), "2 things change", "two starts: no one from");
  assert.equal(changed([{ what: "a", to: "b" }]), "1 thing changes", "no when: none said");
  assert.equal(kept(previewOf("fact:2", "not-true")), "Kept: 1 thing changes from tomorrow");
  assert.equal(kept([]), "Kept: what Sol knows is changed");
  assert.deepEqual(Object.values(HOW_W), ["That’s right", "That’s wrong", "It’s out of date", "Only in this folder"], "the four ways, in the design's order, in plain words");
  assert.equal(howW("only-here", "w:/u/ana/thesis"), "Only in thesis", "Only here's hover names the folder");
  assert.equal(howW("only-here"), "Only in this folder", "no place: the folder unnamed");
  assert.equal(howW("not-true", "w:/u/ana/thesis"), "That’s wrong", "the rest as they are");
  assert.equal(placeWord("/u/ana/studio-site/"), "studio-site");
  assert.equal(previewOf("fact:1", "right").length, 0, "Right changes nothing");
});

test("the fixer is held once a wire has it, and taken away", () => {
  assert.equal(fixerNow(), null, "none until the engine has the fix: the because offers Not true alone");
  const f: Fixer = { fix: async () => ({ changes: [], token: "t" }), settle: async () => {} };
  setFixer(f);
  assert.equal(fixerNow(), f);
  setFixer(null);
  assert.equal(fixerNow(), null);
});

test("the engine's preview, said: its when words, a fact that goes, a from that is the what itself", () => {
  assert.equal(changed([{ what: "Uses Numbers here", from: "Uses Numbers here", to: null, when: "from the next read" }]), "1 thing changes from the next read", "never 'from from'");
  assert.equal(changed([{ what: "a", to: null, when: "now" }]), "1 thing changes now");
  assert.deepEqual(lineOf({ what: "Orders close at noon", from: "Orders close at noon", to: null, when: "now" }), { what: "Orders close at noon", from: null, to: "Sol stops using it" });
  assert.deepEqual(lineOf({ what: "Orders close at noon", from: "everywhere", to: "orders", when: "now" }), { what: "Orders close at noon", from: "everywhere", to: "orders" });
});

test("the ways to answer a fact where the because sits: Only here for a told fact of a wider place", () => {
  const all = ["right", "not-true", "not-anymore", "only-here"];
  assert.deepEqual(waysOf({ k: "fact:1", place: null }, "w:/u/ana/thesis"), all, "a told fact about the person, on a folder: Only here moves it there");
  assert.deepEqual(waysOf({ k: "fact:2", place: "/u/ana/studio-site" }, "w:/u/ana/studio-site"), all.slice(0, 3), "already only there");
  assert.deepEqual(waysOf({ k: "fact:1", place: null }), all.slice(0, 3), "no place to move it to");
  assert.deepEqual(waysOf({ k: "seen:/u/ana/taxes:quiet", place: "/u/ana/taxes" }, "w:/u/ana/life"), all.slice(0, 3), "the engine moves only a told fact");
});

/** an engine as the people builder's answers (sol/PROTOCOL.md "next.known"): replies carry the rid they were asked with */
function fakeEngine(answer: (m: Record<string, unknown>) => Record<string, unknown> | null) {
  const subs = new Set<(m: unknown) => void>(), sent: Record<string, unknown>[] = [];
  const emit = (m: unknown) => { for (const f of [...subs]) f(m); };
  const e = {
    send: (m: Record<string, unknown>) => { sent.push(m); const r = answer(m); if (r) queueMicrotask(() => emit({ type: m.type, ...(m.rid !== undefined ? { rid: m.rid } : {}), ...r })); return true; },
    subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
  return { e, sent, emit };
}

test("the fixer over the engine: right saves at once, the rest preview then keep or back; a refusal is not taken", async () => {
  let refreshed = 0;
  const { e, sent } = fakeEngine((m) => m.k === "fact:gone" ? { ok: false, why: "no fact of that key now" }
    : m.how === "right" ? { ok: true, saved: true, token: "t1" }
    : m.how ? { ok: true, preview: { changes: [{ what: "Orders close at noon", from: "Orders close at noon", to: null, when: "now" }], token: "t2" } }
    : m.keep ? { ok: true, kept: true, token: m.token } : { ok: true, back: true });
  const { asker } = await import("./agents/model.ts");
  const a = asker(e.send, e.subscribe as never, { prefix: "t" });
  const fx = fixerOf(a.ask, () => { refreshed++; });
  assert.deepEqual(await fx.fix({ k: "fact:d1", how: "right" }), { changes: [], token: "t1" }, "right: saved, nothing to preview");
  assert.equal(refreshed, 1, "a saved fact reads next.you again");
  const p = await fx.fix({ k: "fact:d1", how: "not-anymore", now: "Orders close at two" });
  assert.equal(p?.token, "t2");
  assert.equal(sent.at(-1)?.now, "Orders close at two", "the new words go with it");
  await fx.settle("t2", true);
  assert.deepEqual({ token: sent.at(-1)?.token, keep: sent.at(-1)?.keep }, { token: "t2", keep: true });
  assert.equal(refreshed, 2);
  await fx.settle("t2", false);
  assert.equal(sent.at(-1)?.back, true);
  assert.equal(await fx.fix({ k: "fact:gone", how: "not-true" }), null, "refused: the card stays as it was");
  a.close();
});

test("the engine's same rides on the preview, and a scope is kept by next.known.same with the keys of these", async () => {
  const these = [{ k: "part:w:/home/you/orders:hours", place: "w:/home/you/orders", fact: "Orders close at noon" }, { k: "plan:p1", place: null, fact: "Orders close at noon" }];
  const { e, sent } = fakeEngine((m) => m.type === "next.known.same" ? { ok: true, reach: m.reach, rule: "r1", token: "t9" }
    : m.how === "not-true" ? { ok: true, preview: { changes: [], token: "t3" }, same: { reason: "fact:d1", n: 2, these } }
    : m.how ? { ok: true, preview: { changes: [], token: "t4" }, same: null } : { ok: true, kept: true });
  const { asker } = await import("./agents/model.ts");
  const a = asker(e.send, e.subscribe as never, { prefix: "t" });
  const fx = fixerOf(a.ask, () => {});
  const p = await fx.fix({ k: "fact:d1", how: "not-true" });
  assert.deepEqual(p?.same, { reason: "fact:d1", n: 2, these }, "beside the preview, carried on it");
  assert.equal((await fx.fix({ k: "fact:d1", how: "not-anymore" }))?.same, null, "none: nothing asked");
  assert.equal(await fx.same?.({ reason: "fact:d1", how: "not-true", reach: "these", to: these.map((t) => t.k) }), true);
  assert.deepEqual({ type: sent.at(-1)?.type, reach: sent.at(-1)?.reach, to: sent.at(-1)?.to }, { type: "next.known.same", reach: "these", to: these.map((t) => t.k) });
  await fx.same?.({ reason: "fact:d1", how: "not-true", reach: "everywhere" });
  assert.equal(sent.at(-1)?.to, undefined, "everywhere names no keys");
  a.close();
});

test("the wire sends nothing an engine without the because would refuse; with read.off it holds the fixer and next.known", async () => {
  const facts: Known[] = [{ k: "fact:d1", fact: "Orders close at noon", source: "you said", by: "person", place: "w:/u/denise/orders" }];
  const { e, sent, emit } = fakeEngine((m) => m.type === "next.known" ? { ok: true, at: "you", facts }
    : m.type === "next.you.source" ? { ok: true, token: "s1", source: m.source, read: m.read, ...(m.read ? { when: "from the next read" } : {}) }
    : m.type === "next.you.fact.fix" ? { ok: true, back: true } : null);
  const off = attach(e as never);
  emit({ type: "next.you", ok: true, you: { read: { sources: ["files"] } } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 0, "an older engine: nothing sent");
  assert.equal(fixerNow(), null);
  assert.equal(await sourceSet("files", false), null, "no switch to press");
  emit({ type: "next.you", ok: true, you: { read: { sources: ["files"], off: [] } } });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(fixerNow(), "the fixer is held");
  assert.deepEqual(knownEngine(), facts, "next.known read");
  const r = await sourceSet("calendar-store", false);
  assert.ok(r?.back, "off gives Back");
  await r!.back!();
  assert.deepEqual({ type: sent.at(-2)?.type, token: sent.at(-2)?.token, back: sent.at(-2)?.back }, { type: "next.you.fact.fix", token: "s1", back: true }, "Back is fact.fix's token");
  assert.equal(sent.at(-1)?.type, "next.you", "then next.you again");
  assert.equal((await sourceSet("calendar-store", true))?.back, null, "on: from the next read, no Back");
  off();
  assert.equal(fixerNow(), null, "taken off with the wire");
  assert.equal(knownEngine(), null);
});

test("known() reads next.known's list in place of next.you's adapters, Settings' lines folded on top", () => {
  const engine: Known[] = [
    { k: "talk", fact: "Sol talks to you: brief", source: "you picked it", by: "person", place: null },
    { k: "fact:d1", fact: "Orders close at noon", source: "you said", by: "person", place: "w:/u/denise/orders" },
    { k: "seen:w:/u/denise/cakes:quiet", fact: "Quiet lately", source: "what Sol read", by: "sol", place: "w:/u/denise/cakes" },
  ];
  const learned: Known[] = [{ k: "learned:7", fact: "You send invoices on Fridays", source: "seen 3 times", by: "sol", place: null }];
  const you = { parts: [{ id: "w:/u/denise/hidden", name: "hidden", share: 0.5, from: ["files"], tools: [], ais: 0, level: 1, faded: true, new: false, main: false, at: Array(24).fill(0), facts: 0 }] } as never;
  assert.deepEqual(known("you", { you, engine, learned }).map((f) => f.k), ["talk", "learned:7", "fact:d1", "seen:w:/u/denise/cakes:quiet"], "the person's own, Settings' lines, then each place; next.you's own adapters not read");
  assert.deepEqual(known("/u/denise/orders", { engine }).map((f) => f.k), ["fact:d1"], "a place, said as its path");
  assert.deepEqual(known("you", { engine, dropped: ["w:/u/denise/cakes"] }).map((f) => f.k), ["talk", "fact:d1"], "a dropped place says nothing");
});

test("an ask and a Diary line carry the keys of what Sol acted on, as the engine sends them, and nothing made up (item 4)", () => {
  assert.deepEqual(keysOf(["fact:1", "learned:3"]), { because: ["fact:1", "learned:3"] }, "a session's ask: its told facts' keys");
  assert.deepEqual(keysOf(["fact:1", 7, "", null]), { because: ["fact:1"] }, "only words are keys");
  assert.deepEqual(keysOf([]), {}, "told nothing: no because");
  assert.deepEqual(keysOf(undefined), {}, "an engine without it: no because");
  const id = B.note({ who: "Your AI", what: "Moved the invoice ask to the top.", ...keysOf(["learned:3"]), force: true })!;
  assert.deepEqual(B.byId(id)?.because, ["learned:3"], "the line keeps its keys");
  const plain = B.note({ who: "Your AI", what: "Opened the grocery list.", force: true })!;
  assert.equal(B.byId(plain)?.because, undefined, "a line with no why carries none: the Diary draws no because");
});

test("a folder Sol placed answers as a placement, not a fact: That's right, off the shelf, or the drag said (item 4)", () => {
  assert.equal(placedOf("placed:w:/home/you/kite"), "w:/home/you/kite");
  assert.equal(placedOf("fact:1"), null, "a fact is not a placement");
  assert.equal(placedOf("placed:"), null, "no folder: none");
  assert.equal(solPlaced({ k: "placed:w:/home/you/kite", by: "sol" }), true);
  assert.equal(solPlaced({ k: "placed:w:/home/you/kite", by: "person" }), false, "one the person put there is theirs: nothing to answer");
  assert.deepEqual(placeWays(true), ["right", "take"], "archived: it can come back");
  assert.deepEqual(placeWays(false), ["right"], "nested: That's right alone, the move is the drag");
  assert.deepEqual(Object.values(PLACE_W), ["That’s right", "Put this folder back where it was"], "plain words, each a whole action (Jev: clear)");
  assert.equal(samePlacedW(2), "Your AI archived 2 other folders for the same reason. Bring them back too?");
  assert.equal(samePlacedW(1), "Your AI archived 1 other folder for the same reason. Bring it back too?");
  assert.match(DRAG_W, /Drag it/, "the fix for a nested folder is the same drag as everywhere");
  assert.equal(placeSaid("take", "kite"), "kite is back where it was");
  assert.equal(placeSaid("right", "kite"), "It stays where it is");
});

test("the placer over the engine: seen, the same read before the take, off the shelf with Back, these taken off too (item 4)", async () => {
  Shelf.reset(); CV.setMode("live");
  let shelf = [{ folder: "w:/home/you/kite", name: "kite", by: "sol", why: "one day only", at: "2026-11-20T09:00:00.000Z" },
    { folder: "w:/home/you/garden", name: "garden", by: "sol", why: "one day only", at: "2026-11-20T09:00:00.000Z" },
    { folder: "w:/home/you/rosa-notes", name: "rosa-notes", by: "person", why: "you put it there", at: "2026-11-19T09:00:00.000Z" }];
  const these = [{ k: "placed:w:/home/you/garden", place: "w:/home/you/garden", fact: "Sol archived garden because one day only" }];
  const { e, sent } = fakeEngine((m) => m.type === "next.placed.seen" ? (m.folder === "w:/home/you/gone" ? { ok: false, why: "Sol placed no folder of that name" } : { ok: true, folder: m.folder })
    : m.type === "next.known.same.of" ? { ok: true, reason: m.reason, same: { reason: m.reason, n: 1, these } }
    : m.type === "next.known.same" ? { ok: true, reach: m.reach, rule: "r1", token: "t9" }
    : m.type === "next.shelf.take" ? (shelf = shelf.filter((x) => x.folder !== m.folder), { ok: true })
    : m.type === "next.shelf" ? { shelf } : null);
  const offShelf = Shelf.attach(e as never);
  try {
    await new Promise((r) => setTimeout(r, 5));
    const { asker } = await import("./agents/model.ts");
    const a = asker(e.send, e.subscribe as never, { prefix: "t" });
    let refreshed = 0;
    const pl = placerOf(a.ask, e.send, () => { refreshed++; });
    assert.equal(pl.onShelf("w:/home/you/kite"), true);
    assert.equal(pl.onShelf("w:/home/you/rosa-notes"), false, "the person's own archived folder is not Sol's to take back here");
    assert.equal(await pl.right("w:/home/you/kite"), true);
    assert.deepEqual({ type: sent.at(-1)?.type, folder: sent.at(-1)?.folder }, { type: "next.placed.seen", folder: "w:/home/you/kite" });
    assert.equal(await pl.right("w:/home/you/gone"), false, "refused: not taken");
    assert.deepEqual(await pl.sameOf("placed:w:/home/you/kite", "w:/home/you/kite"), { reason: "placed:w:/home/you/kite", n: 1, these });
    assert.equal(await pl.take("w:/home/you/thesis", "thesis"), null, "not archived: nothing to take");
    const back = await pl.take("w:/home/you/kite", "kite");
    assert.ok(back, "taken: its Back is held");
    assert.ok(sent.some((m) => m.type === "next.shelf.take" && m.folder === "w:/home/you/kite"), "through the shelf's own wire");
    back!();
    assert.deepEqual({ type: sent.at(-1)?.type, folder: sent.at(-1)?.folder, name: sent.at(-1)?.name }, { type: "next.shelf.put", folder: "w:/home/you/kite", name: "kite" }, "Back archives it again");
    assert.equal(await pl.same({ reason: "placed:w:/home/you/kite", reach: "these", to: these.map((t) => t.k) }), true);
    const kept = sent.find((m) => m.type === "next.known.same")!;
    assert.deepEqual({ how: kept.how, reach: kept.reach, to: kept.to }, { how: "put-back", reach: "these", to: ["placed:w:/home/you/garden"] }, "kept as a move back for these");
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(sent.some((m) => m.type === "next.shelf.take" && m.folder === "w:/home/you/garden"), "these come off the shelf too");
    assert.ok(refreshed >= 3, "what Sol knows is read again after each");
    a.close();
  } finally { offShelf(); CV.setMode("fixture"); Shelf.reset(); }
});

test("the wire holds the placer with the fixer, and lets both go when the engine loses them (item 4)", async () => {
  const { e, emit } = fakeEngine((m) => m.type === "next.known" ? { ok: true, at: "you", facts: [] } : null);
  const off = attach(e as never);
  assert.equal(placerNow(), null, "none before the engine says it has the because");
  emit({ type: "next.you", ok: true, you: { read: { off: [] } } });
  assert.ok(placerNow(), "held with the fixer");
  emit({ type: "next.you", ok: true, you: { read: {} } });
  assert.equal(placerNow(), null, "an engine without it: let go");
  off();
});
