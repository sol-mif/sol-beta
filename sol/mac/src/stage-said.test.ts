// node --test src/*.test.ts: the stage's line of what was just done (#903, stage/said.ts). Every kind of step is said
// done, taken back and done again, in ordinary words, the block named by its title and never by its id; a ⌘Z that finds
// the block closed since says so; the agent's steps are read from two reads of the stage and always said as the agent's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentStep, closerOf, kindOf, kindOne, lostOf, names, sentence, byAgent, type Kind, type Said } from "./stage/said.ts";
import { applySide, stepOf } from "./stage/moving.ts";
import type { Block, Line, Place } from "./stage/model.ts";
import type { Seen } from "./stage/store.ts";
import { EngineStore } from "./stage/engineStore.ts";
import { setStageSaid } from "./flag.ts";

const P = (id: string, x = 12, y = 12, w = 300, h = 200, more: Partial<Place> = {}): Place => ({ id, x, y, w, h, z: 1, ...more });
const TITLES: Record<string, string> = { a: "Plan", b: "Notes", c: "Diff", d: "Week", e: "Tests" };
const title = (id: string) => TITLES[id] ?? "a block";
const say = (s: Said) => sentence(s, title);
const full = (s: Said) => { const x = say(s); return x.back ? `${x.words} · ${x.back}` : x.words; };

// one step of each kind, on block "a" (Plan)
const STEPS: Record<Kind, [Place | null, Place | null]> = {
  moved: [P("a"), P("a", 400, 12)],
  resized: [P("a"), P("a", 12, 12, 500, 300)],
  folded: [P("a"), P("a", 12, 12, 300, 200, { folded: true })],
  opened: [P("a", 12, 12, 300, 200, { folded: true }), P("a")],
  closed: [P("a"), null],
  reopened: [null, P("a")],
  popped: [P("a"), P("a", 12, 12, 300, 200, { popped: true })],
  unpopped: [P("a", 12, 12, 300, 200, { popped: true }), P("a")],
  pinned: [P("a"), P("a", 12, 12, 300, 200, { pinned: true, folded: true })],
  unpinned: [P("a", 12, 12, 300, 200, { pinned: true, folded: true }), P("a", 12, 12, 300, 200, { folded: true })],
};
const stepFor = (k: Kind) => ({ before: { a: STEPS[k][0] }, after: { a: STEPS[k][1] } });

const WANT: Record<Kind, [string, string, string]> = {
  moved: ["Moved Plan · ⌘Z to put it back", "Put Plan back where it was · ⇧⌘Z to do it again", "Moved Plan again · ⌘Z to undo it"],
  resized: ["Resized Plan · ⌘Z to put it back", "Put Plan back to its size · ⇧⌘Z to do it again", "Resized Plan again · ⌘Z to undo it"],
  folded: ["Folded Plan to the tray · ⌘Z to bring it back", "Brought Plan back from the tray · ⇧⌘Z to do it again", "Folded Plan to the tray again · ⌘Z to undo it"],
  opened: ["Opened Plan from the tray · ⌘Z to fold it again", "Folded Plan back to the tray · ⇧⌘Z to do it again", "Opened Plan from the tray again · ⌘Z to undo it"],
  closed: ["Closed Plan · ⌘Z to bring it back", "Brought Plan back · ⇧⌘Z to do it again", "Closed Plan again · ⌘Z to undo it"],
  reopened: ["Brought Plan back · ⌘Z to close it again", "Closed Plan again · ⇧⌘Z to do it again", "Brought Plan back again · ⌘Z to undo it"],
  popped: ["Popped Plan out to its own window · ⌘Z to bring it back", "Brought Plan back from its window · ⇧⌘Z to do it again", "Popped Plan out again · ⌘Z to undo it"],
  unpopped: ["Brought Plan back to the stage · ⌘Z to pop it out again", "Popped Plan out again · ⇧⌘Z to do it again", "Brought Plan back to the stage again · ⌘Z to undo it"],
  pinned: ["Pinned Plan to the notch · ⌘Z to take it off", "Took Plan off the notch · ⇧⌘Z to do it again", "Pinned Plan to the notch again · ⌘Z to undo it"],
  unpinned: ["Took Plan off the notch · ⌘Z to pin it again", "Pinned Plan to the notch again · ⇧⌘Z to do it again", "Took Plan off the notch again · ⌘Z to undo it"],
};

for (const k of Object.keys(STEPS) as Kind[]) {
  test(`a ${k} step is said done, taken back and done again, by the block's title`, () => {
    const st = stepFor(k);
    assert.equal(kindOf(st), k);
    assert.equal(full({ who: "you", how: "did", step: st }), WANT[k][0]);
    assert.equal(full({ who: "you", how: "undid", step: st }), WANT[k][1]);
    assert.equal(full({ who: "you", how: "redid", step: st }), WANT[k][2]);
  });
}

test("a step read from two layouts (moving.ts stepOf) is said as its kind", () => {
  assert.equal(say({ who: "you", how: "did", step: stepOf([P("a")], [P("a", 200, 40)])! }).words, "Moved Plan");
  assert.equal(say({ who: "you", how: "did", step: stepOf([P("a")], [P("a", 12, 12, 320, 200)])! }).words, "Resized Plan");
  assert.equal(say({ who: "you", how: "did", step: stepOf([P("a"), P("b", 400)], [P("a", 12, 12, 300, 200, { folded: true }), P("b", 400)])! }).words, "Folded Plan to the tray");
});

test("several blocks: named together, 'them' for the way back; a tile (moves and resizes) is a move", () => {
  const tile = stepOf([P("a"), P("b", 400), P("c", 12, 400)], [P("a", 0, 0, 600, 400), P("b", 600, 0), P("c", 0, 400, 600, 400)])!;
  assert.equal(full({ who: "you", how: "did", step: tile }), "Moved Plan, Notes and Diff · ⌘Z to put them back");
  assert.equal(full({ who: "you", how: "undid", step: tile }), "Put Plan, Notes and Diff back where they were · ⇧⌘Z to do it again");
  const fold = stepOf([P("a"), P("b", 400)], [P("a", 12, 12, 300, 200, { folded: true }), P("b", 400, 12, 300, 200, { folded: true })])!;
  assert.equal(full({ who: "you", how: "did", step: fold }), "Folded Plan and Notes to the tray · ⌘Z to bring them back");
});

test("names: one, two, three, then 'and n more'; an empty title is 'a block'", () => {
  assert.equal(names(["Plan"]), "Plan");
  assert.equal(names(["Plan", "Notes"]), "Plan and Notes");
  assert.equal(names(["Plan", "Notes", "Diff"]), "Plan, Notes and Diff");
  assert.equal(names(["Plan", "Notes", "Diff", "Week", "Tests"]), "Plan, Notes and 3 more");
  assert.equal(names(["  "]), "a block");
  assert.equal(names([]), "a block");
});

test("a fold the stage made to make room for the agent's newcomer is said as what happened to the block, and ⌘Z still brings it back", () => {
  assert.equal(full({ who: "you", how: "did", step: stepFor("folded"), room: "Week" }), "Plan went to the tray to make room · ⌘Z to bring it back");
});

test("⌘Z on a move whose block was closed since says so, and who closed it when it is known", () => {
  const st = stepFor("moved");
  assert.equal(full({ who: "you", how: "undid", step: st, lost: ["a"], closer: "agent" }), "Plan was closed by the agent since · nothing to put back");
  assert.equal(full({ who: "you", how: "undid", step: st, lost: ["a"], closer: "elsewhere" }), "Plan was closed in another window since · nothing to put back");
  assert.equal(full({ who: "you", how: "undid", step: st, lost: ["a"] }), "Plan was closed since · nothing to put back");
});

test("⌘Z on a tile with one block closed since: the rest put back, the closed one said, and nothing to put back for it", () => {
  const st = stepOf([P("a"), P("b", 400)], [P("a", 0, 0, 600, 400), P("b", 600, 0, 600, 400)])!;
  assert.equal(full({ who: "you", how: "undid", step: st, lost: ["b"], closer: "agent" }), "Put Plan back to its size; Notes was closed by the agent since · nothing to put back for it");
});

test("lostOf: the blocks on the stage at both ends of a step and closed now; a close taken back is never lost", () => {
  const move = stepFor("moved");
  const now: Place[] = [P("b", 400)];
  const r = applySide(now, move.before, move.after);
  assert.deepEqual(r.back, []);
  assert.deepEqual(lostOf(move.before, move.after, (id) => now.some((p) => p.id === id)), ["a"]);
  assert.deepEqual(lostOf(move.before, move.after, () => true), []);
  const close = stepFor("closed");
  assert.deepEqual(lostOf(close.before, close.after, () => false), [], "a close taken back brings the block back: nothing lost");
});

test("closerOf and byAgent: the engine signs an agent's line '<login>'s agent · <session>', the person's '<login> · <session>'", () => {
  assert.equal(byAgent("marco's agent · 1a2b3c4d"), true);
  assert.equal(byAgent("work agent · 1a2b3c4d"), true);
  assert.equal(byAgent("marco · 1a2b3c4d"), false);
  assert.equal(byAgent("you"), false);
  assert.equal(byAgent("the watch"), false);
  const l = (what: string, by: string, at = 1): Line => ({ at, by, what });
  assert.equal(closerOf([l("composed", "marco's agent · x"), l("closed", "marco's agent · x", 2)]), "agent");
  assert.equal(closerOf([l("composed", "marco's agent · x"), l("closed", "marco · x", 2)]), "elsewhere");
  assert.equal(closerOf(undefined), "elsewhere");
});

// ── the agent's steps, from two reads of the stage ──────────────────────────────────────────────────────────────
const AG = "marco's agent · 1a2b3c4d", ME = "marco · 1a2b3c4d";
const B = (id: string, more: Partial<Block> = {}): Block => ({ id, kind: "doc", title: TITLES[id], state: "live", versions: [], sessions: ["s"], ...more } as Block);
const seen = (blocks: Block[], places: Place[], ledger: Record<string, Line[]> = {}): Seen => ({ blocks, stage: { lens: "app", tiled: false, blocks: places }, ledger, ready: true });

test("the agent opened a block: said as the agent's, by its title", () => {
  const was = seen([B("a")], [P("a")]);
  const now = seen([B("a"), B("b")], [P("a"), P("b", 400)], { b: [{ at: 5, by: AG, what: "composed" }] });
  const s = agentStep(was, now)!;
  assert.deepEqual(s, { who: "agent", act: "opened", ids: ["b"] });
  assert.deepEqual(say(s), { words: "The agent opened Notes", back: "", agent: true });
});

test("a block the person composed (asked from the bar) is not called the agent's", () => {
  const was = seen([], []);
  const now = seen([B("a")], [P("a")], { a: [{ at: 5, by: ME, what: "composed" }] });
  assert.equal(agentStep(was, now), null);
});

test("the agent changed a block: a new version of its, or a new line of its that is not a wait", () => {
  const was = seen([B("a", { versions: [{ n: 1, at: 1, by: AG }] })], [P("a")], { a: [{ at: 1, by: AG, what: "composed" }] });
  const v = seen([B("a", { versions: [{ n: 1, at: 1, by: AG }, { n: 2, at: 9, by: AG }] })], [P("a")], was.ledger);
  assert.deepEqual(agentStep(was, v), { who: "agent", act: "changed", ids: ["a"] });
  const ran = seen(was.blocks, [P("a")], { a: [...was.ledger.a, { at: 9, by: AG, what: "ran · tests pass" }] });
  assert.equal(say(agentStep(was, ran)!).words, "The agent changed Plan");
  const waits = seen(was.blocks, [P("a")], { a: [...was.ledger.a, { at: 9, by: AG, what: "waits" }] });
  assert.equal(agentStep(was, waits), null, "a wait is said by the block itself; the line never asks for the eye");
});

test("the agent closed a block: gone from the stage, its close line the agent's", () => {
  const was = seen([B("a"), B("b")], [P("a"), P("b", 400)]);
  const now = seen([B("a"), B("b", { state: "dead" })], [P("a")], { b: [{ at: 9, by: AG, what: "closed" }] });
  assert.equal(full(agentStep(was, now)!), "The agent closed Notes · its ledger keeps it");
});

test("a block closed with no line to say by whom is said as closed in another window, never as the agent's", () => {
  const was = seen([B("a"), B("b")], [P("a"), P("b", 400)]);
  const now = seen([B("a")], [P("a")]);
  const s = agentStep(was, now)!;
  assert.deepEqual(s, { who: "elsewhere", act: "closed", ids: ["b"] });
  assert.equal(say(s).agent, false);
  assert.equal(say(s).words, "Notes was closed in another window");
});

test("a block this window closed is never said as someone else's close", () => {
  const was = seen([B("a"), B("b")], [P("a"), P("b", 400)]);
  const now = seen([B("a")], [P("a")]);
  assert.equal(agentStep(was, now, new Set(["b"])), null);
});

test("the person's own moves are not the agent's: the same blocks with new places say nothing", () => {
  const was = seen([B("a"), B("b")], [P("a"), P("b", 400)]);
  const now = seen([B("a"), B("b")], [P("a", 40, 40), P("b", 400, 300)]);
  assert.equal(agentStep(was, now), null);
});

test("one line at a time: a close comes before an open, an open before a change", () => {
  const was = seen([B("a", { versions: [] }), B("b")], [P("a"), P("b", 400)]);
  const now = seen([B("a", { versions: [{ n: 1, at: 9, by: AG }] }), B("c")], [P("a"), P("c", 12, 400)], { b: [{ at: 9, by: AG, what: "closed" }], c: [{ at: 9, by: AG, what: "composed" }] });
  assert.equal(agentStep(was, now)!.who === "agent" && (agentStep(was, now) as { act: string }).act, "closed");
});

test("no sentence ever shows a block's id", () => {
  const ids = ["blk-7f3a", "term-lz9", "c0ffee12"];
  const t = (id: string) => ({ "blk-7f3a": "Plan", "term-lz9": "Terminal", c0ffee12: "Week" } as Record<string, string>)[id];
  const st = stepOf([P(ids[0]), P(ids[1], 400), P(ids[2], 12, 400)], [P(ids[0], 40), P(ids[1], 440), P(ids[2], 40, 400)])!;
  const all: Said[] = [
    ...(["did", "undid", "redid"] as const).map((how) => ({ who: "you" as const, how, step: st })),
    { who: "you", how: "undid", step: st, lost: [ids[1]], closer: "agent" },
    { who: "agent", act: "opened", ids }, { who: "agent", act: "changed", ids: [ids[0]] }, { who: "agent", act: "closed", ids: [ids[2]] },
    { who: "elsewhere", act: "closed", ids: [ids[1]] },
  ];
  for (const s of all) { const x = sentence(s, t); for (const id of ids) assert.ok(!`${x.words} ${x.back}`.includes(id), `${x.words} names ${id}`); }
});

test("kindOne reads a fold before a size: a block folded and resized at once is a fold", () => {
  assert.equal(kindOne(P("a"), P("a", 0, 0, 100, 100, { folded: true })), "folded");
});

// ── over the engine's socket (engineStore.ts): a close by the agent takes the block out of the next answer, with its lines;
// the change's own line is kept first, so the close is still said as the agent's
test("the agent's close over the socket is said as the agent's, though the next answer no longer carries the block", async () => {
  setStageSaid(true);
  try {
    const answer = (ids: string[]) => ({ stage: { lens: "app", tiled: false, blocks: ids.map((id, i) => P(id, 12 + i * 320)) }, blocks: ids.map((id) => ({ id, kind: "card", title: TITLES[id], state: "live", versions: [], sessions: ["s"] })) });
    let engine = answer(["a", "b"]);
    let hear: (m: unknown) => void = () => {};
    const st = new EngineStore();
    st.connect((async (type: string) => (type === "work.stage.get" ? engine : {})) as never, (f) => { hear = f as never; return () => {}; });
    st.read("s");
    await new Promise((r) => setTimeout(r, 60));
    const reads: Seen[] = [st.read("s")];
    st.subscribe("s", () => reads.push(st.read("s")));
    engine = answer(["a"]);
    hear({ type: "work.stage.changed", sessionId: "s", block: { id: "b", state: "dead", sessions: ["s"] }, line: { n: 2, at: Date.now(), ev: "closed", by: AG } });
    await new Promise((r) => setTimeout(r, 60));
    const last = reads[reads.length - 1];
    assert.ok(!last.stage.blocks.some((p) => p.id === "b"), "the next answer has the block off the stage");
    // the stage measures each read against the one before it, as the line's effect does
    const said = reads.slice(1).map((r, i) => agentStep(reads[i], r)).filter(Boolean);
    assert.equal(said.length, 1, "said once");
    assert.equal(full(said[0]!), "The agent closed Notes · its ledger keeps it");
  } finally { setStageSaid(false); }
});
