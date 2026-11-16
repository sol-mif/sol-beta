// node --test src/*.test.ts (npm test here): the UI system's tokens (#761, #751 slice A1; sol/design/system/ui.md
// "Tokens", "Order" 1-2). tokens.json holds the seven values the night of 2026-11-09 added (blur-drag, pearl-tint,
// wash-rest, c-box, the display and code type steps, breath), the nacre bands and feel.md's five springs; the retired
// ones (t-pill, direction b's file marks, `you` and d-slide) are gone from it, from what
// tokens.mjs writes, and from every use under src; the glow candy stays in the contract until face.css loses its
// hand-set --glow (rule 2). d-turn stays 150 on main (#993: ui.md's 160 is a separate decision). The kit (kit/tokens.ts) reads the same values; --sheen-nacre is what kit/Pearl.tsx draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NACRE, PEARL_TINT, SHADE, SPRING, TIMED, TYPE, CURVE, LOOKS } from "./kit/tokens.ts";

const src = resolve(import.meta.dirname);
const t = JSON.parse(readFileSync(resolve(src, "../../design/system/tokens.json"), "utf8"));
const p = t.palette;
const palette = readFileSync(join(src, "palette.css"), "utf8");
const contract = readFileSync(join(src, "tokens.css"), "utf8");
const declared = (css: string, name: string) => new RegExp(`--${name}:`).test(css);

test("the seven new values are in tokens.json, at ui.md's numbers", () => {
  assert.equal(p.shade.drag, 24, "blur-drag 24");
  assert.equal(p.material.colour["pearl-tint"].value, "rgb(230 225 216 / 0.035)", "pearl-tint, the pearl at .035");
  assert.equal(p.looks.button.takes[p.looks.button.pick].rest, 0.24, "wash-rest .24, on the picked wash");
  assert.equal(p.curve.radius.box, 20, "c-box 20");
  assert.deepEqual(p.scale.type.display, [28, 34], "display 28/34");
  assert.deepEqual(p.scale.type.code, [12, 20], "code 12/20");
  assert.equal(p.motion.duration.breath, 4800, "breath 4800");
});

test("the nacre bands and feel.md's five springs are in", () => {
  assert.ok(p.material.sheen.nacre, "the nacre bands");
  assert.deepEqual(p.motion.spring, {
    note: p.motion.spring.note, mass: 1, clamp: 4, slow: 4,   // the clamp and the slow factor: the motion module (#763)
    settle: { k: 520, c: 40 }, travel: { k: 300, c: 31 }, glide: { k: 200, c: 27 }, lift: { k: 900, c: 54 }, fade: { k: 400, c: 40 },
  });
});

test("the retired are gone from tokens.json", () => {
  assert.equal(p.scale.type.pill, undefined, "t-pill");
  for (const k of ["you", "file-slides", "file-doc", "file-sheet", "file-pdf"]) assert.equal(p.material.colour[k], undefined, k);
  assert.equal(p.motion.duration.slide, undefined, "d-slide");
  assert.equal(p.motion.duration.turn, 150, "d-turn stays main's 150 (#993); ui.md's 160 is a separate decision");
});

test("tokens.mjs wrote them: palette.css has the new names and none of the retired", () => {
  for (const n of ["blur-drag", "c-pearl-tint", "wash-rest", "curve-box", "t-display", "t-display-line", "t-code", "t-code-line", "d-breath", "sheen-nacre"])
    assert.ok(declared(palette, n), `--${n} in palette.css`);
  assert.match(palette, /--d-turn: 150ms;/);
  for (const n of ["t-pill", "c-you", "c-file-slides", "c-file-doc", "c-file-sheet", "c-file-pdf", "d-slide"]) assert.ok(!declared(palette, n), `--${n} retired`);
});

test("glow, the candy accent, stays in the contract until face.css loses its hand-set --glow (rule 2), then retires by a bump", () => {
  assert.equal(t.tokens.glow?.value, "var(--candy)");
  assert.equal(t.tokens.glow?.hand, "face.css", "face.css still sets it by hand for the old UI");
  assert.match(t.tokens.glow?.note ?? "", /\{ from: 1, to: 2, keys: \{ glow: null \} \}/, "the key says how it retires");
  assert.equal(t.contract, 1, "no bump yet");
  assert.ok(declared(contract, "glow"));
});

test("--sheen-nacre is what the kit's Pearl draws: its recipe read from Pearl.tsx", async () => {
  const { NACRE_RECIPE: R } = await import("../../design/system/tokens.mjs");
  const pearl = readFileSync(join(src, "kit/Pearl.tsx"), "utf8");
  const branch = /if \(look === "nacre"\)([\s\S]*?)<\/>\);/.exec(pearl)?.[1] ?? "";
  assert.ok(branch, "Pearl.tsx still has its nacre branch");
  const bands = /repeating-linear-gradient\((\d+)deg, \$\{\[\.\.\.six, six\[0\]\]\.map\(\(c, j\) => `\$\{hex\(c, a\)\} \$\{j \* (\d+)\}px`\)[\s\S]*?filter: "blur\(([\d.]+)px\)"/.exec(branch);
  assert.ok(bands, "the bands: the six and the first again, at the hue, a step apart, blurred");
  assert.deepEqual([Number(bands![1]), Number(bands![2]), Number(bands![3])], [R.angle, R.band, R.soft], "angle, step, blur");
  const top = /linear-gradient\((\d+)deg, \$\{on\(([\d.]+)\)\}, transparent (\d+)%\)/.exec(branch);
  assert.deepEqual(top && top.slice(1).map(Number), [R.top.angle, R.top.a, R.top.to], "the top light");
  const sheen = /radial-gradient\(([\d%]+ [\d%]+) at ([\d%]+ [\d%]+), \$\{on\(([\d.]+)\)\}, transparent (\d+)%\)/.exec(pearl);
  assert.deepEqual(sheen && [sheen[1], sheen[2], Number(sheen[3]), Number(sheen[4])], [R.sheen.size, R.sheen.at, R.sheen.a, R.sheen.to], "the sheen over all");
  assert.equal(LOOKS.pearl.takes.nacre.hue, p.looks.pearl.takes.nacre.hue);
  // and the css carries them, layer by layer, top first, over the pearl
  const css = /--sheen-nacre: ([^;]+);/.exec(palette)?.[1] ?? "";
  assert.ok(css.startsWith(`radial-gradient(${R.sheen.size} at ${R.sheen.at}, rgb(255 255 255 / ${R.sheen.a}), transparent ${R.sheen.to}%), linear-gradient(${R.top.angle}deg, rgb(255 255 255 / ${R.top.a}), transparent ${R.top.to}%), repeating-linear-gradient(${R.angle}deg, `), css.slice(0, 160));
  assert.ok(css.endsWith(`linear-gradient(${p.material.colour.pearl.value}, ${p.material.colour.pearl.value})`));
  // the blur is in the stops: at a step the colour is softened toward its neighbours, between steps it is the line
  const stops = [...css.matchAll(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\) (\d+)px/g)].map((m) => ({ c: [+m[1], +m[2], +m[3]], a: +m[4], x: +m[5] }));
  const period = 6 * R.band;
  assert.equal(stops.at(-1)?.x, period, "one whole period");
  assert.ok(stops.every((s) => s.a === p.looks.pearl.takes.nacre.hue));
  const heart = [255, 46, 78], first = stops[0].c;
  assert.notDeepEqual(first, heart, "at 0 the heart is softened by its neighbours, as blur(3px) does");
  assert.ok(Math.abs(first[1] - heart[1]) < 12, "but only a little");
});

test("the kit reads the same values", () => {
  assert.equal(SHADE.drag, p.shade.drag);
  assert.equal(PEARL_TINT, p.material.colour["pearl-tint"].value);
  assert.equal(CURVE.radius.box, p.curve.radius.box);
  assert.deepEqual([...TYPE.display], p.scale.type.display);
  assert.deepEqual([...TYPE.code], p.scale.type.code);
  assert.equal(TIMED.breath, 4800);
  assert.equal(SPRING.settle.k, 520);
  assert.equal(LOOKS.button.takes.wash.rest, 0.24);
  assert.ok(palette.includes(`--sheen-nacre: ${NACRE};`), "the css nacre is the kit's");
  // the kit's Pearl draws nacre at its take's hue; the css bands carry the same strength
  assert.ok(NACRE.includes(`/ ${LOOKS.pearl.takes.nacre.hue})`));
});

test("nothing under src uses a retired token", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const x = join(d, f); if (statSync(x).isDirectory()) walk(x); else if (/\.(css|tsx?)$/.test(f) && !f.endsWith(".test.ts")) files.push(x); } };
  walk(src);
  const retired = /--(t-pill|c-you|c-file-(slides|doc|sheet|pdf)|d-slide)\b|\bt-pill\b|MOTION\.slide\b/;
  const hits = files.filter((f) => retired.test(readFileSync(f, "utf8"))).map((f) => f.slice(src.length + 1));
  assert.deepEqual(hits, []);
});
