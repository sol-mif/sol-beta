// The jelly's acts (#1245, body/role.ts): every act names a motion motion.ts knows (a duration and a curve by name), a
// halo state, a depth and a colour role that are in the tokens, and no act wears a meaning colour (rules 16, 17, 33).
// The names are the day builder's API; the three ladder states each map onto one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dur, ease } from "../motion.ts";
import { LOOKS, SYSTEM } from "../kit/tokens.ts";
import { ACTS, ACT_NAMES, ACT_OF, DAY, IN_SCENES, actInfo, isAct } from "./role.ts";
import { SCENES } from "../kit/stage-day/scenes.ts";

test("the acts are the eight, by the names the day builder imports", () => {
  assert.deepEqual([...ACT_NAMES], ["arrive", "sit", "carry", "work", "point", "land", "wait", "mark"]);
  for (const a of ACTS) assert.equal(actInfo(a.name), a);
  assert.ok(isAct("point") && !isAct("needs") && !isAct(null));
});

test("every act names a motion that exists in motion.ts", () => {
  for (const a of ACTS) {
    const ms = dur(a.dur), curve = ease(a.ease);
    assert.ok(typeof ms === "number" && ms > 0, `${a.name}: dur ${a.dur}`);
    assert.ok(typeof curve === "string" && curve.length > 0, `${a.name}: ease ${a.ease}`);
  }
  // only the jelly's endless moves repeat: the breath at rest and the drift at work (rules 20, 27)
  assert.deepEqual(ACTS.filter((a) => a.loop).map((a) => a.name), ["sit", "work"]);
});

test("every act names a halo state, a depth and a colour role from the tokens", () => {
  for (const a of ACTS) {
    assert.ok(a.state in LOOKS.halo.states, `${a.name}: halo state ${a.state}`);
    assert.ok(a.depth in SYSTEM.depth, `${a.name}: depth ${a.depth}`);
    assert.ok(a.role in SYSTEM.role, `${a.name}: role ${a.role}`);
  }
});

test("no act uses a meaning colour: the yellow stays on the block, the red on the steady part", () => {
  const meaning = Object.entries(SYSTEM.role).filter(([, r]) => (r as { fixed?: boolean }).fixed).map(([k]) => k);
  assert.deepEqual(meaning.sort(), ["ask", "done", "wrong"]);
  for (const a of ACTS) assert.ok(!meaning.includes(a.role), `${a.name} wears ${a.role}`);
  // and the sticker's depth is the block's, never the body's
  for (const a of ACTS) assert.notEqual(a.depth, "sticker", a.name);
  // nor does the body's own code reach for a meaning colour
  const src = readFileSync(new URL("./Bodies.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bMEANING\b|FUNCTIONAL|functional\./);
});

test("each act answers one of the jelly's two questions, with one line of reason", () => {
  for (const a of ACTS) {
    assert.ok(a.answers === "what is happening" || a.answers === "what needs me", a.name);
    assert.ok(a.reason.length > 20 && !a.reason.includes("\n"), a.name);
  }
  assert.deepEqual(ACTS.filter((a) => a.answers === "what needs me").map((a) => a.name), ["point"]);
});

test("the ladder's three states map onto acts, and each act's ladder state maps back where it is the ladder's own", () => {
  assert.deepEqual(ACT_OF, { rest: "sit", work: "work", needs: "point" });
  for (const [d, a] of Object.entries(ACT_OF)) assert.equal(actInfo(a).doing, d);
});

test("the day runs through every act once, in the list's order", () => {
  assert.deepEqual(DAY.map((d) => d.act), [...ACT_NAMES]);
});

test("every scene of the day has the jelly doing named acts, the same ones the day plays (never a picture)", () => {
  assert.deepEqual(IN_SCENES.map((x) => x.scene), SCENES.map((x) => x.title));
  for (const [i, x] of IN_SCENES.entries()) {
    assert.deepEqual([...x.acts], [...SCENES[i].role], x.scene);
    // a scene where it only sits is a scene where it is a picture
    assert.ok(x.acts.some((a) => a !== "sit"), `${x.scene}: only sits`);
    assert.ok(x.why.length > 0, x.scene);
  }
});
