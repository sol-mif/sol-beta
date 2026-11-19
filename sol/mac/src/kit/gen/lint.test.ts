// node --test src/kit/gen/lint.test.ts (and npm test, through src/gen.test.ts): the generator's lint (#1245, item 1).
// One test per rewrite, each against the rule it keeps (sol/design/system/rules.md); then the whole wrong spec of the
// dev page's test, and that a linted spec lints clean (the rewriter's fixed point).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lint, nearestDepth, nearestPiece, roleOf } from "./lint.ts";
import { PIECES, type Spec } from "./spec.ts";

const one = (s: unknown) => lint(s);
const has = (notes: string[], re: RegExp) => assert.ok(notes.some((n) => re.test(n)), `a note matching ${re}: ${JSON.stringify(notes)}`);
const walk = (s: Spec, f: (s: Spec) => void) => { f(s); s.children?.forEach((c) => walk(c, f)); };
const all = (s: Spec) => { const out: Spec[] = []; walk(s, (x) => out.push(x)); return out; };

test("a clean spec passes untouched, with no notes", () => {
  const spec = { piece: "Block", props: { title: "the release notes", w: 420 }, state: "done", children: [
    { piece: "Text", props: { role: "words", words: "three lines, posted" } },
    { piece: "Meter", props: { value: 0.4, label: "today's use" } },
  ] };
  const r = one(spec);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.spec, spec);
});

test("a colour as hex or a name → its nearest role (rule 20)", () => {
  assert.equal(roleOf("#22c55e"), "done");
  assert.equal(roleOf("green"), "done");
  assert.equal(roleOf("#f4c82a"), "ask");
  assert.equal(roleOf("gold"), "ask");
  assert.equal(roleOf("#ef4444"), "wrong");
  assert.equal(roleOf("rgb(255, 0, 0)"), "wrong");
  assert.equal(roleOf("hsl(25, 95%, 60%)"), "sol");
  assert.equal(roleOf("#ff4888"), "sol");
  assert.equal(roleOf("#e6e1d8"), "picked");
  assert.equal(roleOf("#555"), "rest");
  assert.equal(roleOf("success"), "done");
  assert.equal(roleOf("danger"), "wrong");
  const r = one({ piece: "Sticker", props: { words: "shipped", color: "#16a34a" } });
  assert.equal(r.spec.props.role, "done");
  has(r.notes, /color #16a34a → done.*rule 20/);
});

test("a colour with no role is dropped: it is grey (rule 20)", () => {
  assert.equal(roleOf("#2563eb"), null);
  assert.equal(roleOf("purple"), null);
  const r = one({ piece: "Card", props: { background: "#2563eb" }, children: ["hi"] });
  assert.equal(r.spec.props.background, undefined);
  assert.equal(r.spec.children!.length, 1);
  has(r.notes, /#2563eb dropped; it has no role here.*rule 20/);
});

test("a depth not one of the five → the nearest, then the nearest the piece takes (rule 1)", () => {
  assert.equal(nearestDepth("floating"), "lifted");
  assert.equal(nearestDepth("sunken"), "well");
  assert.equal(nearestDepth(2), "control");
  assert.equal(nearestDepth(24), "sticker");
  const a = one({ piece: "Card", props: { elevation: "floating" }, children: ["x"] });
  assert.equal(a.spec.props.depth, "lifted");
  has(a.notes, /depth floating → lifted.*rule 1/);
  const b = one({ piece: "Block", props: { title: "t", depth: "well" } });
  assert.equal(b.spec.props.depth, "card");
  has(b.notes, /depth well → card, the nearest a Block takes/);
  const c = one({ piece: "Card", props: { depth: "card" }, children: ["x"] });
  assert.deepEqual(c.notes, []);
});

test("a tilt on anything but a sticker → 0 (rule 36)", () => {
  const r = one({ piece: "Card", props: { tilt: 6 }, style: { transform: "rotate(-4deg)" }, children: ["x"] });
  assert.equal(r.spec.props.tilt, undefined);
  has(r.notes, /tilt 6° → 0.*rule 36/);
  has(r.notes, /tilt -4° → 0.*rule 36/);
  const s = one({ piece: "Sticker", props: { words: "new", tilt: -2 } });
  assert.equal(s.spec.props.tilt, -2);
  assert.deepEqual(s.notes, []);
});

test("a sticker's tilt over 3° → 3 (rule 36)", () => {
  const r = one({ piece: "Sticker", props: { words: "new", rotate: "12deg" } });
  assert.equal(r.spec.props.tilt, 3);
  has(r.notes, /tilt 12° → 3°.*rule 36/);
  assert.equal(one({ piece: "Sticker", props: { words: "x", tilt: -9 } }).spec.props.tilt, -3);
});

test("a glow or a shadow → dropped (rule 5); an outline → dropped (rule 3)", () => {
  const r = one({ piece: "Block", props: { title: "t", glow: "0 0 20px #f0f", boxShadow: "0 8px 30px black", border: "1px solid #fff" } });
  assert.deepEqual(Object.keys(r.spec.props), ["title"]);
  has(r.notes, /glow dropped.*rule 5/);
  has(r.notes, /boxShadow dropped.*rule 5/);
  has(r.notes, /border dropped.*rule 3/);
});

test("a font → dropped (rule 23)", () => {
  const r = one({ piece: "Text", props: { words: "hello", fontFamily: "Comic Sans MS", fontSize: 40, fontWeight: 800 } });
  assert.deepEqual(r.spec.props, { words: "hello" });
  for (const k of ["fontFamily", "fontSize", "fontWeight"]) has(r.notes, new RegExp(`${k} dropped.*rule 23`));
});

test("more than one moving piece in the set's colours → the rest stilled (rule 20)", () => {
  const r = one({ piece: "Stack", children: [
    { piece: "SessionRow", props: { title: "a" }, state: "active-running" },
    { piece: "RunMark", state: "running" },
    { piece: "HaloDial", state: "working" },
    { piece: "RunMark", state: "done" },
  ] });
  const [a, b, c, d] = r.spec.children!;
  assert.equal(a.props.still, undefined);
  assert.equal(b.props.still, true);
  assert.equal(c.props.still, true);
  assert.equal(d.props.still, undefined, "a finished mark does not move");
  assert.equal(b.state, "running", "stilled keeps its state");
  assert.equal(r.notes.filter((n) => /stilled.*rule 20/.test(n)).length, 2);
});

test("a meaning colour on a piece's fill → moved to a sticker or a coin on it (rules 17, 18)", () => {
  const card = one({ piece: "Card", props: { background: "#facc15" }, children: [{ piece: "Text", props: { words: "post it?" } }] });
  assert.equal(card.spec.props.background, undefined);
  assert.deepEqual(card.spec.children![0], { piece: "Sticker", props: { words: "your call", role: "ask", at: "edge" } });
  has(card.notes, /yellow on its fill.*moved to a sticker.*rules 17, 18/);
  const row = one({ piece: "Row", props: { title: "the build", color: "red" } });
  assert.deepEqual(row.spec.children, [{ piece: "Coin", props: { role: "wrong", d: 14 } }]);
  // a block says it by its state: the ask is its "needs you" sticker, lifted
  const block = one({ piece: "Block", props: { title: "post?", fill: "warning" } });
  assert.equal(block.spec.state, "waiting");
  assert.equal(block.spec.children, undefined);
  // words never wear a meaning
  const words = one({ piece: "Text", props: { words: "failed", color: "#ff0000" } });
  assert.equal(words.spec.props.color, undefined);
  has(words.notes, /never on words.*rule 18/);
});

test("an unknown piece → the nearest by name, or a card with its words", () => {
  assert.equal(nearestPiece("Crad")?.piece, "Card");
  assert.equal(nearestPiece("button")?.piece, "Pill");
  assert.equal(nearestPiece("Badge")?.piece, "Sticker");
  assert.equal(nearestPiece("ProgressBar")?.piece, "MeterBar");
  assert.equal(nearestPiece("Zorblax"), null);
  const near = one({ piece: "Buton", props: { words: ["ok"] } });
  assert.equal(near.spec.piece, "Pill");
  has(near.notes, /"Buton" → Pill/);
  const far = one({ piece: "Zorblax", props: { title: "the plan", body: "three steps" } });
  assert.equal(far.spec.piece, "Card");
  assert.deepEqual(far.spec.children!.map((c) => c.props.words), ["the plan", "three steps"]);
  has(far.notes, /"Zorblax" is no piece here.*a Card with its words/);
  const spin = one({ piece: "Spinner" });
  assert.equal(spin.spec.piece, "RunMark");
  has(spin.notes, /never a spinner \(rule 27\)/);
});

test("an unknown state, a number out of range, a gap off the scale, an unknown prop → the nearest, clamped, or dropped", () => {
  const r = one({ piece: "Stack", props: { gap: 20, onClick: "x" }, children: [
    { piece: "Block", props: { title: "t" }, state: "loading" },
    { piece: "MeterBar", props: { value: 72 } },
    { piece: "Coin", props: { role: "done", size: 80 } },
  ] });
  assert.equal(r.spec.props.gap, 16);
  assert.equal(r.spec.props.onClick, undefined);
  const [b, m, c] = r.spec.children!;
  assert.equal(b.state, "working");
  assert.equal(m.props.value, 0.72);
  assert.equal(c.props.d, 30);
  has(r.notes, /gap 20 → 16/);
  has(r.notes, /onClick dropped/);
  has(r.notes, /72 read as 72%/);
});

test("only the one thing that waits on you is lifted (rule 8)", () => {
  const r = one({ piece: "Stack", children: [
    { piece: "Block", props: { title: "a" }, state: "waiting" },
    { piece: "Card", props: { depth: "lifted" }, children: ["b"] },
  ] });
  assert.equal(r.spec.children![1].props.depth, "card");
  has(r.notes, /lifted → card.*rule 8/);
});

test("the dev page's wrong spec (hex colours, glows, three tilted cards, a font) comes out in the system, and lints clean after", () => {
  const wrong = { piece: "Stack", props: { direction: "row", gap: 18 }, children: [1, 2, 3].map((i) => ({
    piece: "Card", props: { background: i === 1 ? "#ff3b30" : "#0a84ff", rotate: i * 4, boxShadow: "0 0 40px rgba(255,0,200,.8)", fontFamily: "Papyrus" },
    children: [{ piece: "Heading", text: `step ${i}`, color: "#bf5af2" }, { piece: "Badge", text: "live", color: "#30d158", tilt: 10 }],
  })) };
  const r = one(wrong);
  for (const s of all(r.spec)) {
    assert.ok(s.piece in PIECES, `${s.piece} is a piece`);
    for (const k of ["background", "rotate", "boxShadow", "fontFamily", "color", "text"]) assert.equal(s.props[k], undefined, `${s.piece} has no ${k}`);
    if (s.piece !== "Sticker") assert.equal(s.props.tilt, undefined);
    else assert.ok(Math.abs(Number(s.props.tilt ?? 0)) <= 3);
  }
  assert.equal(r.spec.props.gap, 16);
  assert.ok(r.notes.length >= 12, `${r.notes.length} notes`);
  const again = lint(r.spec);
  assert.deepEqual(again.notes, []);
  assert.deepEqual(again.spec, r.spec);
});

test("anything an agent might hand over is drawn: a JSON string, broken JSON, an array, nothing", () => {
  assert.equal(lint('{"piece":"Num","props":{"value":"42"}}').spec.piece, "Num");
  const broken = lint("{piece: Card");
  assert.equal(broken.spec.piece, "Card");
  has(broken.notes, /not JSON/);
  assert.equal(lint([{ piece: "Text", words: "a" }, "b"]).spec.piece, "Stack");
  assert.equal(lint(null).spec.piece, "Card");
  const deep: Record<string, unknown> = { piece: "Card", children: [] };
  let at = deep;
  for (let i = 0; i < 20; i++) { const next = { piece: "Card", children: [] as unknown[] }; (at.children as unknown[]).push(next); at = next; }
  has(lint(deep).notes, /the rest was cut/);
});
