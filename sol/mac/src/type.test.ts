// node --test src/*.test.ts (npm test here): the six type steps as kit classes (#762, #751 slice A2; sol/design/system/
// ui.md "Type"). kit/type.css has .t-display .t-title .t-read .t-body .t-code .t-label, each at its step's size and line
// from palette.css (tokens.json palette.scale.type), its weight and tracking; face.css loads it, so the whole face can
// use them. No kit CSS sets text-transform uppercase or small caps: tracked capitals are retired, a label is sentence case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const src = resolve(import.meta.dirname);
const kit = join(src, "kit");
const type = readFileSync(join(kit, "type.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const palette = readFileSync(join(src, "palette.css"), "utf8");
/** a palette variable's px */
const px = (name: string) => { const m = palette.match(new RegExp(`--${name}:\\s*([\\d.]+)px`)); assert.ok(m, `--${name} in palette.css`); return +m[1]; };
/** a class's declarations, by property */
const rule = (cls: string) => {
  const m = type.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `.${cls} in kit/type.css`);
  return Object.fromEntries(m[1].split(";").map((d) => d.split(":").map((x) => x.trim())).filter(([k, v]) => k && v));
};
/** a value through palette.css: a variable of the type scale is the px palette.css gives it */
const resolved = (v: string) => { const m = v.match(/^var\(--([a-z-]+)\)$/); return m ? px(m[1]) : NaN; };

const STEPS = [
  ["display", 28, 34, "600", "-0.02em"],
  ["title", 20, 28, "600", "-0.01em"],
  ["read", 15, 24, "400", "0"],
  ["body", 13, 20, "400", "0"],
  ["code", 12, 20, "400", "0"],
  ["label", 11, 16, "400", "0.01em"],
] as const;

test("the six steps are kit classes at ui.md's sizes, weights and tracking", () => {
  for (const [step, size, line, weight, track] of STEPS) {
    const r = rule(`t-${step}`);
    assert.equal(resolved(r["font-size"]), size, `${step} size ${size}`);
    assert.equal(resolved(r["line-height"]), line, `${step} line ${line}`);
    assert.equal(r["font-weight"], weight, `${step} weight ${weight}`);
    assert.equal(r["letter-spacing"], track, `${step} tracking ${track}`);
  }
  assert.match(rule("t-code")["font-family"], /^var\(--mono\b.*monospace\)$/, "code is the mono");
});

test("weights 400, 500 and 600 only", () => {
  for (const [, w] of type.matchAll(/font-weight:\s*(\d+)/g)) assert.ok(["400", "500", "600"].includes(w), `weight ${w}`);
});

test("face.css loads the kit's type, so every screen can use the classes", () => {
  assert.match(readFileSync(join(src, "face.css"), "utf8"), /@import "\.\/kit\/type\.css";/);
});

test("no kit CSS sets text-transform uppercase or small caps", () => {
  const files = readdirSync(kit).filter((f) => f.endsWith(".css"));
  assert.ok(files.includes("type.css"));
  for (const f of files) {
    const css = readFileSync(join(kit, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /text-transform\s*:\s*uppercase/i, `${f}: text-transform uppercase`);
    assert.doesNotMatch(css, /font-variant-caps\s*:\s*(all-)?small-caps/i, `${f}: small caps`);
  }
});

test("the stage's meta and its crumb chip are the label step, and face.css's shared labels are not capitals", () => {
  assert.match(readFileSync(join(src, "stage/kinds/Frame.tsx"), "utf8"), /className=\{?[`"]st-meta t-label\b/);   // his window's frame adds "cut" in a template (#872)
  assert.match(readFileSync(join(src, "stage/BarChips.tsx"), "utf8"), /className="st-cchip t-label"/);
  assert.doesNotMatch(readFileSync(join(src, "stage/kinds/Page.tsx"), "utf8"), /small-caps|uppercase/);
  const face = readFileSync(join(src, "face.css"), "utf8");
  assert.doesNotMatch(face, /text-transform\s*:\s*uppercase|small-caps/);
});
