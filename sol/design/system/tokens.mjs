#!/usr/bin/env node
// Tokens as data (#630, #634, freeform #629): the one file of names and values, tokens.json, and the one script that
// writes the face's variables from it. The face's build runs it first (sol/mac/package.json), so no output is ever
// written by hand:
//   sol/mac/src/palette.css         the preset values (`palette`: functional colours, gradients, creature, scale, material, motion)
//   sol/mac/src/creature/palette.ts the same values for code (the creature, the ring, a timer)
//   sol/mac/src/tokens.css          the contract's names (`tokens`), laid from those values
//   sol/mac/src/kit/tokens.ts       the kit's values for code (#674: shade, glass, jelly, curve, font, looks), and NEXT
//   sol/mac/src/kit/next.css        the new face's set (`next`, #1604), scoped to [data-face="next"], read only under next/
// It refuses a contract it cannot trust: a contract number without a migration for each bump, a migration that is not
// { from, to: from + 1, keys: { old: new or null } }, a place list that is not words, a token without its value or the
// rule it serves, a palette value that is not #rrggbb. Since #1183 no token is written by hand in face.css: it imports tokens.css;
// a token still marked `hand` must agree with face.css, and a drift fails here. A token marked `fixed` is a functional
// colour (the meaning channel): a block may read it and never set it (mac/src/home/frameRules.ts refuses one that does).
//   node sol/design/system/tokens.mjs            writes the files
//   node sol/design/system/tokens.mjs --check    the same, and exits 1 when a committed file was stale or the data is wrong
// Plain node, no packages.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "../../..");
export const TOKENS = "sol/design/system/tokens.json";
export const OUT = "sol/mac/src/tokens.css";
export const PALETTE_CSS = "sol/mac/src/palette.css";
export const PALETTE_TS = "sol/mac/src/creature/palette.ts";
export const KIT_TS = "sol/mac/src/kit/tokens.ts";
export const FACE = "sol/mac/src/face.css";
export const NEXT_CSS = "sol/mac/src/kit/next.css";
const NAME = /^[a-z][a-z0-9-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const readTokens = (root = ROOT) => JSON.parse(readFileSync(join(root, TOKENS), "utf8"));

/** what is wrong with the palette, one line each (pure) */
function paletteProblems(p) {
  const out = [];
  if (!p || typeof p !== "object") return ["palette: the preset values are missing"];
  const hex = (where, v) => { if (typeof v !== "string" || !HEX.test(v)) out.push(`palette.${where}: ${JSON.stringify(v)} is not #rrggbb`); };
  for (const name of ["green", "yellow", "red"]) for (const step of ["soft", "strong"]) hex(`functional.${name}.${step}`, p.functional?.[name]?.[step]);
  for (const [name, g] of Object.entries(p.gradients ?? {})) {
    const n = Array.isArray(g?.stops) ? g.stops.length : 0;
    if (n < 3 || n > 5) out.push(`palette.gradients.${name}: ${n} stops, wants 3 to 5`);
    else g.stops.forEach((s, i) => hex(`gradients.${name}.stops[${i}]`, s));
  }
  for (const name of ["home", "work"]) if (!p.gradients?.[name]) out.push(`palette.gradients: the seat gradient ${name} is missing`);
  for (const [name, v] of Object.entries(p.creature?.colours ?? {})) hex(`creature.colours.${name}`, v);
  hex("ink.value", p.ink?.value);
  hex("paper.value", p.paper?.value);
  for (const k of ["scale", "material", "motion", "shade", "glass", "jelly", "curve", "looks"]) if (!p[k] || typeof p[k] !== "object") out.push(`palette.${k}: missing`);
  if (!out.length) out.push(...kitProblems(p));
  return out;
}

const alpha = (v) => Number(/\/\s*([\d.]+)\)\s*$/.exec(v ?? "")?.[1] ?? NaN);
/** the contract's names each shade step is laid into: the step and the token must say the same number */
const SHADE_TOKENS = { side: "side", card: "surface", raised: "raised", box: "island", pop: "pop" };

/** what is wrong with the kit's groups (pure): the shade, the jelly's colours, the looks' picks */
function kitProblems(p) {
  const out = [], num = (where, v) => { if (typeof v !== "number" || !(v >= 0)) out.push(`palette.${where}: ${JSON.stringify(v)} is not a number`); };
  const sh = p.shade;
  if (!HEX.test(sh.black ?? "")) out.push("palette.shade.black: not #rrggbb");
  num("shade.window", sh.window); num("shade.blur", sh.blur); num("shade.drag", sh.drag);
  for (const k of Object.keys(SHADE_TOKENS)) num(`shade.steps.${k}`, sh.steps?.[k]);
  for (const [k, v] of Object.entries(sh.on ?? {})) num(`shade.on.${k}`, v);
  // the readable set behind the run's switches (#891): a near-solid window, words at 4.5:1 or more, a solid block step
  for (const k of ["window", "dim", "mute"]) { num(`shade.read.${k}`, sh.read?.[k]); if (!(sh.read?.[k] <= 1)) out.push(`palette.shade.read.${k}: an opacity, 0 to 1`); }
  if (!(sh.read?.block in (sh.steps ?? {}))) out.push(`palette.shade.read.block: ${JSON.stringify(sh.read?.block)} is not one of shade.steps`);
  const cols = p.creature?.colours ?? {};
  for (const set of ["six", "warm"]) {
    const names = p.jelly[set];
    if (!Array.isArray(names) || !names.length) out.push(`palette.jelly.${set}: a list of the creature's colours`);
    else for (const n of names) if (!cols[n]) out.push(`palette.jelly.${set}: ${n} is not one of creature.colours`);
  }
  for (const k of ["angle", "soft", "veil"]) num(`jelly.${k}`, p.jelly[k]);
  for (const [k, v] of Object.entries(p.curve.radius ?? {})) num(`curve.radius.${k}`, v);
  for (const k of ["size", "grid", "stroke"]) num(`glyph.${k}`, p.glyph?.[k]);
  if (typeof p.font?.value !== "string") out.push("palette.font.value: the type's family");
  for (const [name, l] of Object.entries(p.looks)) {
    if (name === "note") continue;
    const takes = l?.takes ?? {}, letters = Object.values(takes).map((t) => t?.take);
    if (!Object.keys(takes).length) { out.push(`palette.looks.${name}: no takes`); continue; }
    if (new Set(letters).size !== letters.length || !letters.every((x) => /^[a-c]$/.test(x ?? ""))) out.push(`palette.looks.${name}: each take has its own letter, a b or c`);
    if (l.states) { for (const [st, t] of Object.entries(l.states)) if (!takes[t]) out.push(`palette.looks.${name}.states.${st}: ${t} is not one of its takes`); }
    else if (!takes[l.pick]) out.push(`palette.looks.${name}.pick: ${JSON.stringify(l.pick)} is not one of its takes (an alternate is kept, never deleted)`);
  }
  const sp = p.motion?.spring ?? {};
  num("motion.spring.mass", sp.mass);
  num("motion.spring.clamp", sp.clamp);
  num("motion.spring.slow", sp.slow);
  for (const k of SPRINGS) { num(`motion.spring.${k}.k`, sp[k]?.k); num(`motion.spring.${k}.c`, sp[k]?.c); }
  const wash = p.looks.button?.takes?.[p.looks.button?.pick] ?? {};
  for (const k of ["rest", "hover", "press"]) num(`looks.button.takes.${p.looks.button?.pick}.${k}`, wash[k]);
  if (typeof p.looks.pearl?.takes?.nacre?.hue !== "number") out.push("palette.looks.pearl.takes.nacre: no hue (the nacre bands' strength)");
  for (const [k, v] of Object.entries(p.material?.sheen ?? {})) if (v?.value === "kit" && k !== "nacre") out.push(`palette.material.sheen.${k}: only nacre is drawn from the kit`);
  if (typeof p.material?.colour?.["pearl-tint"]?.value !== "string") out.push("palette.material.colour.pearl-tint: missing (a frozen block's fill)");
  for (const [k, m] of Object.entries(p.system?.move ?? {})) {
    if (!(m.d in (p.motion?.duration ?? {}))) out.push(`palette.system.move.${k}: ${m.d} is not one of motion.duration`);
    if (!(m.e in (p.motion?.easing ?? {}))) out.push(`palette.system.move.${k}: ${m.e} is not one of motion.easing`);
  }
  for (const k of ["well", "card", "control", "lifted", "sticker"]) if (!p.system?.depth?.[k]) out.push(`palette.system.depth.${k}: missing`);
  if (typeof p.looks.card?.takes?.[p.looks.card?.pick]?.radius !== "number") out.push("palette.looks.card: the picked take has no radius (the kit's card corner)");
  return out;
}

/** feel.md's springs, by name (ui.md Motion): each { k, c } at the one mass */
const SPRINGS = ["settle", "travel", "glide", "lift", "fade"];

/** the contract's shade tokens that drift from palette.shade (pure): the one black's numbers have one home */
function shadeDrift(t) {
  const sh = t.palette?.shade, tk = t.tokens ?? {}, out = [];
  if (!sh?.steps) return out;
  if (tk["base-color"] && tk["base-color"].value.toLowerCase() !== String(sh.black).toLowerCase()) out.push(`tokens.base-color: ${tk["base-color"].value}, but palette.shade.black is ${sh.black}`);
  if (tk["base-alpha"] && Number(tk["base-alpha"].value) !== sh.window) out.push(`tokens.base-alpha: ${tk["base-alpha"].value}, but palette.shade.window is ${sh.window}`);
  if (tk["base-blur"] && tk["base-blur"].value !== `${sh.blur}px`) out.push(`tokens.base-blur: ${tk["base-blur"].value}, but palette.shade.blur is ${sh.blur}`);
  for (const [step, name] of Object.entries(SHADE_TOKENS))
    if (tk[name] && alpha(tk[name].value) !== sh.steps[step]) out.push(`tokens.${name}: its shade is ${alpha(tk[name].value)}, but palette.shade.steps.${step} is ${sh.steps[step]}`);
  return out;
}

/** what is wrong with the data, one line each (pure); none is a contract the face can stand on */
export function problems(t) {
  const out = [];
  if (!Number.isInteger(t?.contract) || t.contract < 1) out.push("contract: a whole number from 1");
  if (!Array.isArray(t?.migrations)) out.push("migrations: a list (empty at 1)");
  else {
    t.migrations.forEach((m, i) => {
      if (!Number.isInteger(m?.from) || m.from < 1) out.push(`migrations[${i}]: "from" is the contract a record leaves, 1 or more`);
      if (!Number.isInteger(m?.to) || m.to !== m?.from + 1) out.push(`migrations[${i}]: "to" is the next contract, from + 1 (one entry per bump)`);
      const keys = m?.keys;
      if (!keys || typeof keys !== "object" || Array.isArray(keys) || !Object.keys(keys).length) out.push(`migrations[${i}]: "keys" is { old: new }, a new name or null for retired`);
      else for (const [k, v] of Object.entries(keys)) if (!NAME.test(k) || !(v === null || (typeof v === "string" && NAME.test(v) && v !== k))) out.push(`migrations[${i}].keys.${k}: a name to a new name, or to null`);
      if (Number.isInteger(m?.to) && Number.isInteger(t?.contract) && m.to > t.contract) out.push(`migrations[${i}]: step ${m.to} is past the contract, ${t.contract}`);
    });
    for (let n = 2; Number.isInteger(t?.contract) && n <= t.contract; n++) {
      const k = t.migrations.filter((m) => m?.to === n).length;
      if (!k) out.push(`migrations: the step to ${n} has no entry (a contract change ships with its migration)`);
      else if (k > 1) out.push(`migrations: the step to ${n} has ${k} entries; one per bump`);
    }
  }
  if (!Array.isArray(t?.places) || !t.places.length || !t.places.every((p) => typeof p === "string" && NAME.test(p))) out.push("places: a list of the places a block may render in");
  const toks = t?.tokens;
  if (!toks || typeof toks !== "object" || !Object.keys(toks).length) out.push("tokens: none");
  else for (const [k, v] of Object.entries(toks)) {
    if (!NAME.test(k)) out.push(`tokens.${k}: a name is lowercase words joined by -`);
    if (typeof v?.value !== "string" || !v.value.trim()) out.push(`tokens.${k}: no value`);
    if (typeof v?.serves !== "string" || !v.serves.trim()) out.push(`tokens.${k}: no axiom or rule it serves`);
    if (typeof v?.value === "string" && /[;{}]/.test(v.value)) out.push(`tokens.${k}: a value is one css value, no ; { }`);
    if (v?.fixed !== undefined && v.fixed !== true) out.push(`tokens.${k}: fixed is true or left out`);
  }
  out.push(...paletteProblems(t?.palette));
  if (toks && t?.palette) out.push(...shadeDrift(t));
  out.push(...nextProblems(t?.next));
  return out;
}

/** the new face's set (#1604): its groups, by role; each value one css value (a colour, a family, a shadow, a curve, a
 *  time, a move) or, in the px groups, a number of px (a corner, a part's size; to the half pixel) (pure). The new face
 *  reads these names only, never a value of its own. motion and size came with the frame look (#1879) */
export const NEXT_GROUPS = ["colour", "aura", "font", "radius", "shadow", "easing", "motion", "size"];
export const NEXT_PX = new Set(["radius", "size"]);
export function nextProblems(n) {
  if (!n || typeof n !== "object") return ["next: the new face's set is missing"];
  const out = [];
  for (const g of NEXT_GROUPS) {
    const vals = Object.entries(n[g] ?? {}).filter(([k]) => k !== "note");
    if (!vals.length) { out.push(`next.${g}: missing`); continue; }
    for (const [k, v] of vals) {
      if (!NAME.test(k)) out.push(`next.${g}.${k}: a name is lowercase words joined by -`);
      if (NEXT_PX.has(g) ? !(typeof v === "number" && v >= 0) : !(typeof v === "string" && v.trim() && !/[;{}]/.test(v))) out.push(`next.${g}.${k}: ${JSON.stringify(v)} is not one ${NEXT_PX.has(g) ? "number of px" : "css value"}`);
    }
  }
  const names = NEXT_GROUPS.flatMap((g) => Object.keys(n[g] ?? {}).filter((k) => k !== "note"));
  for (const k of new Set(names)) if (names.filter((x) => x === k).length > 1) out.push(`next: --${k} is named twice`);
  return out;
}

/** the new face's set as css (pure): its names scoped to the new face's root, so today's --paper, --ink, --r stay as they are */
export function nextCss(n) {
  const out = [`/* generated by sol/design/system/tokens.mjs from sol/design/system/tokens.json (next): edit the json, never this file */`,
    `/* the new face's set (#1604): read only under sol/mac/src/next, whose root carries data-face="next" */`, `[data-face="next"] {`];
  for (const g of NEXT_GROUPS) for (const [k, v] of Object.entries(n[g])) if (k !== "note") out.push(`  --${k}: ${NEXT_PX.has(g) ? `${half(v)}px` : v};`);
  out.push("}");
  return out.join("\n") + "\n";
}

/** the names of the functional colours a block may never set (pure) */
export const fixedNames = (t) => Object.entries(t?.tokens ?? {}).filter(([, v]) => v?.fixed === true).map(([k]) => k);

/** the css of the contract's names (pure): deterministic, so a stale file is told */
export function css(t) {
  const lines = Object.entries(t.tokens).map(([k, v]) => `  --${k}: ${v.value};   /* ${v.serves.replace(/\*\//g, "* /")}${v.fixed ? " (fixed)" : ""} */`);
  return `/* generated by sol/design/system/tokens.mjs from sol/design/system/tokens.json (contract ${t.contract}): edit the json, never this file */\n:root {\n  --contract: ${t.contract};\n${lines.join("\n")}\n}\n`;
}

const HEAD = "generated by sol/design/system/tokens.mjs from sol/design/system/tokens.json (palette): edit the json, never this file";
const rgb = (h) => `[${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}]`;
const int = (v) => Math.trunc(Number(v));
/** a type size to the half pixel (the block's head title is 12.5, #738); a whole size prints as before */
const half = (v) => Math.round(Number(v) * 2) / 2;

/** the css of the preset values (pure), once palette-build.py's: the same lines in the same order */
export function paletteCss(p) {
  const out = [`/* ${HEAD} */`, ":root {"];
  for (const name of ["green", "yellow", "red"]) for (const step of ["soft", "strong"]) out.push(`  --${name}-${step}: ${p.functional[name][step].toLowerCase()};`);
  for (const [name, g] of Object.entries(p.gradients)) out.push(`  --${name}: linear-gradient(90deg, ${g.stops.map((s) => s.toLowerCase()).join(", ")});`);
  for (const [name, v] of Object.entries(p.creature.colours)) out.push(`  --${name}: ${v.toLowerCase()};`);
  out.push(`  --ink: ${p.ink.value.toLowerCase()};`, `  --paper: ${p.paper.value.toLowerCase()};`);
  // the scale (the layout skill): spaces, type, control heights, corners, the hairline
  const sc = p.scale;
  for (const [name, v] of Object.entries(sc.space)) out.push(`  --${name}: ${int(v)}px;`);
  for (const [name, [size, line]] of Object.entries(sc.type)) out.push(`  --t-${name}: ${half(size)}px;`, `  --t-${name}-line: ${int(line)}px;`);
  for (const [name, v] of Object.entries(sc.height)) out.push(`  --h-${name}: ${int(v)}px;`);
  for (const [name, v] of Object.entries(sc.radius)) out.push(`  --r-${name}: ${int(v)}px;`);
  out.push("  --hair: 1px;");
  // the material and the motion (the design root's one material system): colours, sheens, shadows, durations, curves
  for (const [group, prefix] of [["colour", "c"], ["sheen", "sheen"], ["shadow", "shadow"], ["filter", "filter"]])
    for (const [name, v] of Object.entries(p.material[group] ?? {})) out.push(`  --${prefix}-${name}: ${v.value === "kit" ? nacre(p) : v.value};`);
  for (const [name, v] of Object.entries(p.motion.duration)) out.push(`  --d-${name}: ${int(v)}ms;`);
  for (const [name, v] of Object.entries(p.motion.easing)) out.push(`  --e-${name}: ${v};`);
  // the kit (#674): the one black's steps, the continuous corners, the jelly's bands
  for (const [name, v] of Object.entries(p.shade.steps)) out.push(`  --shade-${name}: ${v.toFixed(2)};`);
  for (const k of ["window", "dim", "mute"]) out.push(`  --read-${k}: ${p.shade.read[k].toFixed(2)};`);
  for (const [name, v] of Object.entries(curveRadius(p))) out.push(`  --curve-${name}: ${int(v)}px;`);
  out.push(`  --jelly: ${jellyBands(p)};`);
  // the blur of a block while dragged, and the button's wash in its pick at rest, hover and press (ui.md, #761)
  out.push(`  --blur-drag: ${int(p.shade.drag)}px;`);
  const wash = p.looks.button.takes[p.looks.button.pick];
  for (const k of ["rest", "hover", "press"]) out.push(`  --wash-${k}: ${wash[k].toFixed(2)};`);
  out.push("}");
  return out.join("\n") + "\n";
}

/** the same values for code (pure), once palette-build.py's */
export function paletteTs(p) {
  const fn = p.functional, out = [`// ${HEAD}`, "export type RGB = readonly [number, number, number];", ""];
  out.push("/** functional colours: fixed signals, each with a soft and a strong step */", "export const FUNCTIONAL = {");
  for (const name of ["green", "yellow", "red"]) out.push(`  /** ${fn[name].note} */`, `  ${name}: { soft: ${rgb(fn[name].soft)} as RGB, strong: ${rgb(fn[name].strong)} as RGB },`);
  out.push("} as const;", "/** decorative gradients in the creature's family, reusable for cosmetics; sol is the creature's own */", "export const GRADIENTS = {");
  for (const [name, g] of Object.entries(p.gradients)) out.push(`  /** ${g.note} */`, `  ${name}: [${g.stops.map(rgb).join(", ")}] as readonly RGB[],`);
  out.push("} as const;", "export type GradientName = keyof typeof GRADIENTS;", `/** ${p.creature.note} */`, "export const CREATURE = {");
  for (const [name, v] of Object.entries(p.creature.colours)) out.push(`  ${name}: ${rgb(v)} as RGB,`);
  out.push("} as const;", "export type CreatureColour = keyof typeof CREATURE;");
  out.push(`/** ${p.ink.note} */`, `export const INK: RGB = ${rgb(p.ink.value)};`, `/** ${p.paper.note} */`, `export const PAPER_RGB: RGB = ${rgb(p.paper.value)};`);
  out.push("/** the motion's durations in ms (tokens.json palette.motion), for a timer in code; css uses --d-<name> */", "export const MOTION = {");
  for (const [name, v] of Object.entries(p.motion.duration)) out.push(`  ${name}: ${int(v)},`);
  out.push("} as const;");
  return out.join("\n") + "\n";
}

const hexOf = (p, names) => names.map((n) => p.creature.colours[n].toLowerCase());
/** the kit's corners: curve.radius with the card's, which is looks.card's pick (pure) */
const curveRadius = (p) => ({ ...p.curve.radius, card: p.looks.card.takes[p.looks.card.pick].radius });
/** the jelly's colours as one gradient, bands at its angle, soft-edged (pure); the kit's jellyBands() lays the same */
export function jellyBands(p) {
  const six = hexOf(p, p.jelly.six), n = six.length, pc = (v) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`;
  return `linear-gradient(${p.jelly.angle}deg, ${six.map((c, j) => `${c} ${pc(j / n + p.jelly.soft)}, ${c} ${pc((j + 1) / n - p.jelly.soft)}`).join(", ")})`;
}

/** how the kit's Pearl draws nacre (kit/Pearl.tsx, the nacre branch), as numbers: the bands' angle and step, the blur
 *  that softens them, the top light over them and the sheen over all; the on colour is white over the one black
 *  (kit/paint.ts on()). sol/mac/src/tokens.test.ts reads Pearl.tsx and fails when the two drift. */
export const NACRE_RECIPE = {
  angle: 104, band: 26, soft: 3, sample: 2,
  top: { angle: 180, a: 0.35, to: 60 },
  sheen: { size: "70% 120%", at: "18% 0%", a: 0.55, to: 70 },
};
/** the nacre as one css value (pure): what the kit's Pearl lays, layer by layer, top first: the sheen, the top light,
 *  the jelly's six at the nacre take's hue in bands with the blur baked into their stops (a css background takes no
 *  filter, so the bands are the Gaussian of the Pearl's blur, sampled every `sample` px over one period), the pearl */
export function nacre(p) {
  const R = NACRE_RECIPE, a = p.looks.pearl.takes.nacre.hue, six = hexOf(p, p.jelly.six), pearl = p.material.colour.pearl.value.toLowerCase();
  const on = (x) => `rgb(255 255 255 / ${x})`;
  const cols = six.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const period = cols.length * R.band;
  // the bands before the blur: a colour at each step, linear between, repeating
  const raw = (x) => {
    const u = ((x % period) + period) % period, j = Math.floor(u / R.band), f = u / R.band - j, c0 = cols[j], c1 = cols[(j + 1) % cols.length];
    return c0.map((v, i) => v + (c1[i] - v) * f);
  };
  // css blur(Npx) is a Gaussian with standard deviation N; along the bands' direction it is all that changes them
  const reach = Math.ceil(R.soft * 3), w = [];
  for (let k = -reach; k <= reach; k++) w.push(Math.exp(-(k * k) / (2 * R.soft * R.soft)));
  const sum = w.reduce((s, v) => s + v, 0);
  const soft = (x) => w.reduce((acc, wk, i) => { const c = raw(x + i - reach); return acc.map((v, n) => v + (c[n] * wk) / sum); }, [0, 0, 0]);
  const stops = [];
  for (let x = 0; x <= period; x += R.sample) stops.push(`rgb(${soft(x).map((v) => Math.round(v)).join(" ")} / ${a}) ${x}px`);
  return [
    `radial-gradient(${R.sheen.size} at ${R.sheen.at}, ${on(R.sheen.a)}, transparent ${R.sheen.to}%)`,
    `linear-gradient(${R.top.angle}deg, ${on(R.top.a)}, transparent ${R.top.to}%)`,
    `repeating-linear-gradient(${R.angle}deg, ${stops.join(", ")})`,
    `linear-gradient(${pearl}, ${pearl})`,
  ].join(", ");
}

/** the kit's values for code (pure): sol/mac/src/kit/tokens.ts */
export function kitTs(p, n) {
  const j = (v) => JSON.stringify(v);
  const looks = Object.fromEntries(Object.entries(p.looks).filter(([k]) => k !== "note").map(([k, { note, ...rest }]) => [k, rest]));
  return [
    `// ${HEAD.replace("(palette)", "(palette: shade, glass, jelly, curve, glyph, font, looks, motion; material.colour)")}`,
    "// The kit's values (#674): every primitive in sol/mac/src/kit reads these and holds none of its own.",
    "",
    "/** the one black in its shade steps: the window, its blur, the surfaces; `on`, the on colour's strengths */",
    `export const SHADE = ${j({ black: p.shade.black, window: p.shade.window, blur: p.shade.blur, drag: p.shade.drag, steps: p.shade.steps, on: p.shade.on, read: p.shade.read })} as const;`,
    "export type Step = keyof typeof SHADE.steps;",
    "/** the glass and the jelly's light on it; glass is every surface's default, raised and box are named */",
    `export const GLASS = ${j({ light: p.glass.light, surfaces: p.glass.surfaces })} as const;`,
    "export type Surface = keyof typeof GLASS.surfaces;",
    "/** the jelly's colours, the accent source: the six and the warm four as #rrggbb, and how they lie as bands */",
    `export const JELLY = ${j({ six: hexOf(p, p.jelly.six), warm: hexOf(p, p.jelly.warm), angle: p.jelly.angle, soft: p.jelly.soft, veil: p.jelly.veil })} as const;`,
    "/** the continuous corner: the smoothing of Apple's squircle and the kit's radii (the card's is looks.card's pick) */",
    `export const CURVE = ${j({ smoothing: p.curve.smoothing, radius: curveRadius(p) })} as const;`,
    "/** the ground (#1183): the jelly's colours as one soft mass under the window, its takes (Ground.tsx) */",
    `export const GROUND = ${j({ ...p.ground, note: undefined, takes: Object.fromEntries(Object.entries(p.ground.takes).map(([n, t]) => [n, { ...t, blobs: t.blobs.map(([c, ...at]) => [p.creature.colours[c] ?? c, ...at]) }])) })} as const;`,
    "/** the glyphs (#764): drawn on a `grid`, set in a `size` box, the stroke `stroke` px at any size */",
    `export const GLYPH = ${j({ size: p.glyph.size, grid: p.glyph.grid, stroke: p.glyph.stroke })} as const;`,
    "/** the pearl, what has you; deep, the words on it */",
    `export const PEARL = ${j(p.material.colour.pearl.value)};`,
    `export const DEEP = ${j(p.material.colour.deep.value)};`,
    "/** the pearl's tint, a frozen block's fill; the nacre as css, what the Pearl draws (tokens.mjs NACRE_RECIPE, checked against Pearl.tsx) */",
    `export const PEARL_TINT = ${j(p.material.colour["pearl-tint"].value)};`,
    `export const NACRE = ${j(nacre(p))};`,
    "/** the type: the family and the scale's sizes, [size, line] */",
    `export const TYPE = ${j({ family: p.font.value, ...p.scale.type })} as const;`,
    "/** the looks: each its takes, named, with the letter it had on the kit page; `pick` the default, the rest alternates;",
    " *  the halo's takes are the jelly's states (`states`) */",
    `export const LOOKS = ${JSON.stringify(looks, null, 2)} as const;`,
    "/** the one system (#1213, sol/design/system/rules.md): depth steps, colour roles, shapes, type roles, moves; every accent piece and the body draw from it */",
    `export const SYSTEM = ${j(Object.fromEntries(Object.entries(p.system).filter(([k]) => k !== "note")))} as const;`,
    "/** the timed motion in ms and its curves (ui.md Motion), feel.md's springs at mass 1 { k stiffness, c damping }, the clamp in px and the slow factor; motion.ts runs them */",
    `export const TIMED = ${j(p.motion.duration)} as const;`,
    `export const EASE = ${j(p.motion.easing)} as const;`,
    `export const SPRING = ${j(Object.fromEntries([["mass", p.motion.spring.mass], ["clamp", p.motion.spring.clamp], ["slow", p.motion.spring.slow], ...SPRINGS.map((k) => [k, p.motion.spring[k]])]))} as const;`,
    'export type Spring = Exclude<keyof typeof SPRING, "mass" | "clamp" | "slow">;',
    "export type Look = keyof typeof LOOKS;",
    ...(n ? ["/** the new face's set (#1604, tokens.json next): its roles for code; css reads the same names from kit/next.css */",
      `export const NEXT = ${j(Object.fromEntries(NEXT_GROUPS.map((g) => [g, Object.fromEntries(Object.entries(n[g]).filter(([k]) => k !== "note"))])))} as const;`] : []),
    "",
  ].join("\n");
}

/** every file this writes, with its text (pure) */
export const outputs = (t) => [[PALETTE_CSS, paletteCss(t.palette)], [PALETTE_TS, paletteTs(t.palette)], [OUT, css(t)], [KIT_TS, kitTs(t.palette, t.next)], [NEXT_CSS, nextCss(t.next)]];

/** the face.css :root values a `hand` token disagrees with (pure): [{ name, json, face }] */
export function drift(t, faceCss) {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(faceCss.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
  const face = new Map([...root.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  return Object.entries(t.tokens).filter(([, v]) => v.hand === "face.css")
    .map(([k, v]) => ({ name: k, json: v.value, face: face.get(k) ?? null })).filter((d) => d.face !== d.json);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = readTokens();
  const bad = problems(t);
  if (bad.length) { for (const b of bad) console.error(`tokens: ${TOKENS}: ${b}`); process.exit(1); }
  const stale = [];
  for (const [rel, text] of outputs(t)) {
    const out = join(ROOT, rel), was = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (text !== was) { writeFileSync(out, text); stale.push(rel); }
  }
  const d = drift(t, readFileSync(join(ROOT, FACE), "utf8"));
  for (const x of d) console.error(`tokens: --${x.name} is ${JSON.stringify(x.json)} in tokens.json but ${x.face === null ? "missing" : JSON.stringify(x.face)} in ${FACE}: one of the two is changed by hand`);
  console.log(`tokens: contract ${t.contract}, ${Object.keys(t.tokens).length} tokens (${fixedNames(t).length} fixed), ${t.places.length} places, ${t.migrations.length} migrations${stale.length ? `; written ${stale.join(", ")}` : ""}`);
  if (d.length) process.exit(1);
  if (process.argv.includes("--check") && stale.length) { console.error(`tokens: ${stale.join(", ")} ${stale.length > 1 ? "were" : "was"} stale; rewritten now: commit`); process.exit(1); }
}
