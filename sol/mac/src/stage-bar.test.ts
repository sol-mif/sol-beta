// node --test src/*.test.ts: the stage's bar (#698): the ask split into chips as play.html's parse and preview do, the
// words that place a thing, a dropped chip's slot kept, what goes to the engine beside the words, the parts' words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askStage, beside, ghostAt, isAsk, parse, preview, slotOf, slotRect } from "./stage/ask.ts";
import { barState, keptOn, pointAt, sent, setThings, slotThing, wordsIn } from "./stage/bar.ts";
import { partWords } from "./stage/kinds/parts.ts";
import { SIZES } from "./stage/model.ts";

const STAGE = { w: 1000, h: 600 };
/** a kind's born size (model.ts SIZES, the v4 tiles, #738) */
const born = (k: keyof typeof SIZES) => ({ w: SIZES[k][0], h: SIZES[k][1] });

test("parse: the What to try ask is three things, each its kind and title", () => {
  const t = parse("show the week, the kit's side and a diff of Side.tsx");
  assert.deepEqual(t.map((x) => [x.kind, x.title]), [["page", "the week"], ["page", "the kit's side"], ["diff", "Side.tsx"]]);
  assert.deepEqual(parse("open localhost:1420 and the gate").map((x) => [x.kind, x.title]), [["browser", "localhost:1420"], ["card", "the gate"]]);
  assert.deepEqual(parse("stills of the three sides, and a table of the legacy rows").map((x) => [x.kind, x.title]), [["shots", "stills · the three sides"], ["table", "the legacy rows"]]);
  assert.deepEqual(parse("run the lint; show me the terminal").map((x) => x.kind), ["terminal", "terminal"]);
  assert.deepEqual(parse("show the plan and a list of the next steps").map((x) => [x.kind, x.title]), [["list", "the plan"], ["list", "the next steps"]]);
  assert.equal(parse("this one's padding is off").length, 1);
  assert.deepEqual(parse("  "), []);
});

test("#735: a message with commas or paragraphs is one message, never chips; no placeholder title", () => {
  // Marco's four-paragraph message: four chips appeared, one titled "the kit's side" from nowhere
  const long = "I like how the stage lets me tile things.\n\nThe chat is fixed at the bottom, make it move.\n\nAnd the components look cheap, fix the UI.\n\nAlso the kit's side.";
  assert.equal(parse(long).length, 1);
  assert.equal(parse("the plan looks right, the diff too, and the terminal is slow").length, 1);
  assert.equal(parse("make the fixes first regardless of the UI, because there are too many functional problems").length, 1);
  assert.equal(parse("show the week, and tell me why the gate is red").length, 1);   // a part that is a sentence: no chips
  assert.equal(parse("the week on the left, and a diff of Side.tsx").length, 1);     // no asking verb: no chips
  // Marco's message of 17:20: five chips and two cards titled "the gate" on main; all of it is talk
  const his = "but yeah and for like the 743 thing its hard to see each shot, cos they're so small, make these changes so i can actually see everything";
  assert.equal(isAsk(his), false);
  assert.equal(parse(his).length, 1);
  assert.ok(preview(his, []).every((t) => t.title !== "the gate"));
  assert.equal(isAsk("show the week, the kit's side and a diff of Side.tsx"), true);
  assert.equal(isAsk("show the week\nand the diff"), false);
  assert.ok(preview(long, []).every((t) => t.title !== "the kit's side"));   // no placeholder title
  assert.ok(preview(long, []).length < 2);   // BarChips shows chips from two: none for this message
  assert.equal(preview("show the week, the kit's side and a diff of Side.tsx", []).length, 3);   // a real ask still makes three
});

test("the words place a thing: a side, full, the bottom; beside a block by its title", () => {
  assert.deepEqual(slotOf("the week on the left"), { words: "the week", slot: "left" });
  assert.equal(slotOf("the diff on the right half").slot, "right");
  assert.equal(slotOf("the gate full").slot, "full");
  assert.equal(slotOf("the terminal at the bottom").slot, "bottom");
  assert.deepEqual(slotOf("the gate beside the week"), { words: "the gate", slot: null, beside: "the week" });
  const [a, b] = parse("show the week on the left and the gate beside the week");
  assert.deepEqual([a.title, a.slot, b.title, b.beside], ["the week", "left", "the gate", "the week"]);
  const week = { id: "w", x: 12, y: 12, w: 440, h: 300, z: 1, title: "the week" };
  assert.deepEqual(beside(STAGE, "card", "week", [week]), { x: 464, y: 12, ...born("card") });
  assert.equal(beside(STAGE, "card", "the moon", [week]), null);
  assert.deepEqual(slotRect(STAGE, "left"), { x: 12, y: 12, w: 482, h: 576 });
});

test("preview: a dropped chip keeps its slot while its kind stays; beside is laid out on the stage", () => {
  const one = preview("show the week, the kit's side and a diff of Side.tsx", []);
  const drop = { x: 500, y: 20, w: 440, h: 290 };
  const was = one.map((t, i) => (i === 2 ? { ...t, slot: drop, dropped: true } : t));
  const two = preview("show the week, the kit's side and a diff of Side.tsx please", was);
  assert.deepEqual(two[2].slot, drop);
  const three = preview("show the week, the kit's side and a table of rows", was);
  assert.equal(three[2].slot, null);   // the third is a table now: the diff's spot is not its
  const week = { id: "w", x: 12, y: 12, w: 440, h: 300, z: 1, title: "the week" };
  assert.deepEqual(preview("show the notes, and the gate beside the week", [], STAGE, [week])[1].slot, { x: 464, y: 12, ...born("card") });
  assert.deepEqual(preview("", one), []);
});

test("the ghost of a dragged chip: its kind's size, kept on the stage", () => {
  const d = born("diff");
  assert.deepEqual(ghostAt(STAGE, "diff", 990, 590), { x: STAGE.w - 12 - d.w, y: STAGE.h - 12 - d.h, ...d });
  assert.deepEqual(ghostAt(STAGE, "card", 0, 0), { x: 12, y: 12, ...born("card") });
});

test("askStage: two things or more go as chips; a target goes alone; nothing is nothing", () => {
  assert.equal(askStage(parse("show the week"), []), undefined);
  assert.deepEqual(askStage(parse("show the week"), [{ id: "week", part: "Thu" }]), { on: [{ id: "week", part: "Thu" }] });
  const s = askStage(parse("show the week on the left, and a diff of Side.tsx"), []);
  assert.deepEqual(s, { things: [{ kind: "page", title: "the week", slot: "left" }, { kind: "diff", title: "Side.tsx" }] });
});

test("the bar's store: chips set, a drop's slot, a target, cleared when sent", () => {
  setThings(parse("show the week, the kit's side and a diff of Side.tsx"));
  slotThing(1, { x: 1, y: 2, w: 340, h: 232 });
  assert.equal(barState().things[1].dropped, true);
  pointAt([{ id: "week", part: "Thu", words: "the week › Thu" }]);
  assert.equal(barState().on[0].words, "the week › Thu");
  const before = barState();
  pointAt([{ id: "week", part: "Thu", words: "the week › Thu" }]);
  assert.equal(barState(), before);   // the same target again changes nothing
  sent();
  assert.deepEqual([barState().things, barState().on], [[], []]);
});

test("a page's part as words: its heading and the line's first word or three", () => {
  assert.equal(partWords("14:00 dentist · waits on you", "Thu"), "Thu › 14:00");
  assert.equal(partWords("Thu", "Thu"), "Thu");
  assert.equal(partWords("", "Thu"), "Thu");
  assert.equal(partWords("A page the agent wrote for this ask"), "A page the");
});

test("⌘↑ and ⌘↓ are the box's own while it has words: the strip lifts only from an empty box or from outside one", () => {
  // the sweep: ⌘↑ in a box with two lines lifted the talk over the stage instead of putting the caret at the top
  const field = (value: string) => { const f = { value, closest: (q: string) => (/textarea/.test(q) ? f : null) }; return f as unknown as EventTarget; };
  assert.equal(wordsIn(field("line one\nline two")), true);
  assert.equal(wordsIn(field("   ")), false);
  assert.equal(wordsIn({ closest: () => null } as unknown as EventTarget), false);   // the stage, a button: not a field
  assert.equal(wordsIn(null), false);
});

test("#953: only the reference icon attaches; a hover, a scroll or a click in a block attaches nothing", async () => {
  const { attach, detach } = await import("./stage/bar.ts");
  sent();
  // the icon pressed: the block (or its lit part) goes with the next message, shown beside the box; pressed again, off
  attach({ id: "home", words: "Home" });
  attach({ id: "home", part: "9", words: "Home › 9" });
  assert.deepEqual(barState().on.map((o) => o.words), ["Home", "Home › 9"]);
  attach({ id: "home", words: "Home" });
  assert.deepEqual(barState().on.map((o) => o.words), ["Home › 9"]);
  detach({ id: "home", part: "9" });   // its × beside the box
  assert.deepEqual(barState().on, []);
  attach({ id: "home", words: "Home" });
  sent();   // gone after the send
  assert.deepEqual(barState().on, []);
  // the stage's hover and a page's own parts (a hover, a click, a scroll in its frame) only light a part: nothing in
  // them reaches the bar or the engine. Marco's message of 2026-11-10 came with "on: Home … › 9" this way
  const { readFileSync } = await import("node:fs");
  const stage = readFileSync(new URL("./stage/Stage.tsx", import.meta.url), "utf8");
  const between = (a: string, b: string) => { const i = stage.indexOf(a); assert.ok(i >= 0, a); return stage.slice(i, stage.indexOf(b, i)); };
  const hover = between("const onOver =", "const unlitPages ="), page = between("const hear =", "window.addEventListener(\"message\"");
  for (const f of [hover, page]) assert.doesNotMatch(f, /\btarget\(|pointAt\(|attach\(|store\.point/);
  assert.match(readFileSync(new URL("./stage/kinds/Frame.tsx", import.meta.url), "utf8"), /className="st-ref" onClick=\{onRef\}/);
});

test("#1042: a block that left the stage leaves the box's \"on\"; one that is still there stays", () => {
  const on = [{ id: "a", words: "the week" }, { id: "b", part: "Thu", words: "the plan › Thu" }];
  assert.deepEqual(keptOn(on, new Set(["a"])), [{ id: "b", part: "Thu", words: "the plan › Thu" }]);
  assert.deepEqual(keptOn(on, new Set(["a", "b"])), []);
  assert.equal(keptOn(on, new Set(["c"])), null);   // nothing pointed at it: the bar is not written
  assert.equal(keptOn([], new Set(["a"])), null);
});
