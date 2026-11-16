// node --test src/*.test.ts (npm test here): Calm (#795, plan Part C slice 32; home/whole/quiet.ts, Calm.tsx).
// The Try line: answer the last card: Home settles into one breathing line. With the stub's three things answered in
// turn, the list empties, Home is calm, the one line reads "Nothing needs you." with what moves and what is next under
// it, the glass breathes 4800 ms in the jelly's colours, and the last answer's undo brings the card back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stub, lineOf, type TodayMsg, type DoneMsg, type Thing } from "./home/whole/today.ts";
import { BREATH, GLOW, breathOf, calmLine, dayOf, isCalm, nextOf } from "./home/whole/quiet.ts";
import { JELLY, LOOKS, SHADE } from "./kit/tokens.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();   // a Monday morning
const todayOf = (ms: (TodayMsg | DoneMsg)[]) => ms.find((m): m is TodayMsg => m.type === "home.today")!;
const doneOf = (ms: (TodayMsg | DoneMsg)[]) => ms.find((m): m is DoneMsg => m.type === "home.done")!;
const mapOf = (things: Thing[]) => new Map(things.map((t) => [t.id, t]));

test("answer the last card: Home settles into one line", () => {
  const ask = stub(() => NOW);
  let t = todayOf(ask({ type: "home.today" }));
  assert.equal(isCalm(t.today), false, "three things wait: not calm");
  let last: DoneMsg | null = null;
  while (t.today.needs.length) {
    const id = t.today.needs[0], card = t.things.find((x) => x.id === id)!.card!;
    const r = ask({ type: "home.answer", thingId: id, answer: card.answers[0] });
    last = doneOf(r); t = todayOf(r);
    assert.equal(isCalm(t.today), t.today.needs.length === 0);
  }
  assert.ok(isCalm(t.today), "the last card answered, Home is calm");
  assert.equal(lineOf(0, t.today.moving.length)[0], "Nothing needs you.");
  const sub = calmLine(t.today, mapOf(t.things), NOW);
  assert.match(sub, /are moving on their own\./, "the quiet line says what moves");
  assert.match(sub, /Your next thing: bio 201 lecture, today 10:00\./, "and what is next on the week");
  // what did I just do, and undo it: the last answer's undo brings its card back, and Home is no longer calm
  const back = todayOf(ask({ type: "home.undo", ledgerId: last!.ledgerId }));
  assert.equal(back.today.needs.length, 1);
  assert.equal(isCalm(back.today), false);
});

test("not calm before the list has loaded", () => {
  assert.equal(isCalm(null), false);
  assert.equal(isCalm(undefined), false);
});

test("the quiet line: what moves, nearest due first, then the next thing that is yours", () => {
  const th = (id: string, words: string, due?: number): Thing => ({ id, read: "job", folder: "x", words, state: "moving", waitsOn: "agent", due, at: NOW, links: [], made: [] });
  const things = mapOf([th("a", "lab prep", NOW + 9e6), th("b", "bio notes", NOW + 1e6)]);
  const hour = 36e5;
  const week = [
    { id: "p", kind: "proposal" as const, at: NOW + hour, label: "study block?" },          // a proposal is not yours yet
    { id: "e", kind: "event" as const, at: NOW + 30 * hour, label: "chem lab" },
    { id: "old", kind: "event" as const, at: NOW - hour, label: "gone" },                     // already past
  ];
  assert.equal(nextOf(week, NOW)?.id, "e");
  assert.equal(calmLine({ needs: [], moving: ["a", "b"], week, line: "" }, things, NOW),
    `Bio notes and lab prep are moving on their own. Your next thing: chem lab, ${dayOf(NOW + 30 * hour, NOW)}.`);
  assert.equal(calmLine({ needs: [], moving: ["a"], week: [], line: "" }, things, NOW), "Lab prep is moving on its own.");
  assert.equal(calmLine({ needs: [], moving: [], week: [], line: "" }, things, NOW), "", "nothing moves, nothing next: the one line alone");
  assert.equal(dayOf(NOW + 30 * hour, NOW), "tomorrow 14:40");
  // a name keeps its own wording: no article in front (#859 C32-4)
  const named = [{ id: "m", kind: "big" as const, at: NOW + hour, label: "Mum's birthday" }];
  assert.match(calmLine({ needs: [], moving: [], week: named, line: "" }, things, NOW), /^Your next thing: Mum's birthday, today 9:40\.$/);
});

test("the glass breathes 4800 ms, ease-in-out, in the jelly's colours", () => {
  assert.equal(BREATH.ms, 4800);
  assert.equal(BREATH.ease, "ease-in-out");
  // the light and the softness are the kit's breath (#859 C32-1): the halo's take at rest, and the glass's blur
  assert.equal(GLOW.light, LOOKS.halo.takes[LOOKS.halo.states.rest].light);
  assert.equal(GLOW.blur, SHADE.blur);
  const [warm, green] = breathOf();
  assert.ok(warm.includes(`${JELLY.six[1]}${Math.round(GLOW.light / 3 * 255).toString(16)}`), "the warm centre is a third of the take's light");
  for (const h of [JELLY.six[1], JELLY.six[2], JELLY.six[4]]) assert.ok(warm.includes(h), `the warm pool carries ${h}`);
  assert.ok(green.includes(JELLY.six[5]), "the second pool carries the jelly's green");
  // the drawn half wears the breath on both pools and keeps its CSS to layout (no typed colour or duration there)
  const tsx = readFileSync(new URL("./home/whole/Calm.tsx", import.meta.url), "utf8");
  assert.match(tsx, /hcalm-breathe \$\{BREATH\.ms\}ms \$\{BREATH\.ease\}/);
  const css = readFileSync(new URL("./home/whole-calm.css", import.meta.url), "utf8");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|\d+m?s\b/i);
});

test("the switch: First.tsx shows Calm only when the list is calm, and keeps the receipt with its undo", () => {
  const src = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(src, /isCalm\(v\.today\) \? <Calm /);
  const calmAt = src.indexOf("C32 */}"), receiptAt = src.indexOf("<Receipt />");   // C36: the receipt is one component, shared with the places
  assert.ok(calmAt > 0 && receiptAt > calmAt, "the receipt sits outside the calm switch, so it shows in calm too");
});
