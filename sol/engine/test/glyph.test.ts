// The kit's glyphs (#764, ui.md Components, ui.html (f)): all 22 render, each a 24 × 24 svg with ui.html's drawing in
// it, at mute at rest and dim on hover. A face test: the face's own runner (node --test) cannot load a .tsx, the
// engine's (tsx) can, as the motion tests reach into the face; react comes from the face's own packages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Glyph, GLYPHS, GLYPH_SETS, glyphColour, type GlyphName } from "../../mac/src/kit/Glyph.tsx";
import { GLYPH, SHADE } from "../../mac/src/kit/tokens.ts";
import { dim, mute } from "../../mac/src/kit/paint.ts";
import { anyWhole } from "../../mac/src/flag.ts";

const face = createRequire(fileURLToPath(new URL("../../mac/package.json", import.meta.url)));
const { createElement } = face("react") as typeof import("react");
const { renderToStaticMarkup } = face("react-dom/server") as typeof import("react-dom/server");
const draw = (name: GlyphName, hover?: boolean) => renderToStaticMarkup(createElement(Glyph, { name, hover }));
const attr = (svg: string, a: string) => new RegExp(`<svg[^>]*\\s${a}="([^"]*)"`).exec(svg)?.[1];

test("the glyphs: the 22 of ui.html's three sets (7 acts, 7 sources, 8 kinds), each named once", () => {
  assert.equal(GLYPHS.length, 22);
  assert.deepEqual(GLYPH_SETS.map((s) => s.glyphs.length), [7, 7, 8]);
  assert.deepEqual(GLYPH_SETS.flatMap((s) => s.glyphs.map(([g]) => g)), GLYPHS);
  // the kit exports it (its index also loads the kit's css, which only the face's build reads)
  assert.match(readFileSync(new URL("../../mac/src/kit/index.ts", import.meta.url), "utf8"), /export \{ Glyph, GLYPHS, GLYPH_SETS, type GlyphName \} from "\.\/Glyph"/);
  for (const act of ["hold", "fold", "freeze", "focus", "close"]) assert.ok(GLYPHS.includes(act as GlyphName), act);
});

test("the glyphs: each of the 22 renders as one 24 × 24 svg with its drawing inside, the 20 grid centred", () => {
  assert.equal(GLYPH.size, 24);
  for (const name of GLYPHS) {
    const svg = draw(name);
    assert.equal((svg.match(/<svg\b/g) ?? []).length, 1, name);
    assert.equal(attr(svg, "width"), "24", `${name} width`);
    assert.equal(attr(svg, "height"), "24", `${name} height`);
    assert.equal(attr(svg, "viewBox"), "-2 -2 24 24", `${name} viewBox`);
    assert.equal(attr(svg, "stroke-width"), String(GLYPH.stroke), `${name} stroke`);
    assert.equal(attr(svg, "stroke-linecap"), "round", `${name} round ends`);
    assert.equal(attr(svg, "data-glyph"), name);
    assert.match(svg, /<(path|rect|circle)\b[^>]*\/?>/, `${name} draws something`);
  }
});

test("the glyphs: mute at rest, dim on hover, the on colour's own strengths", () => {
  // the strengths paint.ts drew from: the readable set while a whole switch is on (stage.whole is, by default, #691)
  const sh = anyWhole() ? SHADE.read : SHADE.on;
  assert.equal(mute, dim.replace(String(sh.dim), String(sh.mute)));
  for (const name of GLYPHS) {
    assert.match(attr(draw(name), "style") ?? "", new RegExp(`color:${mute.replace(/[().]/g, "\\$&")}`), `${name} at rest`);
    assert.match(attr(draw(name, true), "style") ?? "", new RegExp(`color:${dim.replace(/[().]/g, "\\$&")}`), `${name} on hover`);
  }
});

test("the glyphs: with `hover` unset the pointer decides, and the kit page's rest row leaves it unset (#850 R2)", () => {
  assert.equal(glyphColour(undefined, false), mute, "unset, the pointer away: mute");
  assert.equal(glyphColour(undefined, true), dim, "unset, the pointer over: dim");
  assert.equal(glyphColour(true, false), dim, "held at dim");
  assert.equal(glyphColour(false, true), mute, "held at mute, whatever the pointer");
  const glyph = readFileSync(new URL("../../mac/src/kit/Glyph.tsx", import.meta.url), "utf8");
  assert.match(glyph, /onPointerEnter: \(\) => setOver\(true\)/, "the pointer's arrival sets over");
  assert.match(glyph, /onPointerLeave: \(\) => setOver\(false\)/, "its leaving clears it");
  assert.match(glyph, /color: glyphColour\(hover, over\)/, "the colour reads both");
  const page = readFileSync(new URL("../../mac/src/kit/stage.tsx", import.meta.url), "utf8");
  assert.match(page, /<Glyph name=\{g\} hover=\{hover \|\| undefined\} \/>/, "the rest row is not held at mute");
});
