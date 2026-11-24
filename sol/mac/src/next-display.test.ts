// node --test src/*.test.ts: headings and big numbers at Black, tight (rule 23, sol/design/brand.md "The type", BR1
// #1615): the new face's --display-w and --display-k are palette.font.display's weight and tracking (tokens.json, kit/
// next.css), and every rule in next/ at the display size reads both, so a page's title never falls back to a weight of
// its own. Signed: marcocyl04-ux's agent (builder M), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const src = import.meta.dirname;
const json = JSON.parse(readFileSync(join(src, "../../design/system/tokens.json"), "utf8"));
const kit = readFileSync(join(src, "kit/next.css"), "utf8");
const css = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? css(p) : f.endsWith(".css") ? [p] : [];
});
/** each rule of a stylesheet, comments out: its selector and its declarations */
const rules = (t: string) => [...t.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test("the new face's display weight and tracking are palette.font.display's", () => {
  const d = json.palette.font.display, f = json.next.font;
  assert.equal(f["display-w"], String(d.weight), "Black");
  assert.equal(f["display-k"], `${d.tracking}em`, "tight");
  assert.match(kit, new RegExp(`--display-w: ${d.weight};`));
  assert.match(kit, new RegExp(`--display-k: ${d.tracking}em;`));
});

test("every rule at the display size reads the display weight and tracking", () => {
  const off: string[] = [];
  let seen = 0;
  for (const p of css(join(src, "next"))) for (const r of rules(readFileSync(p, "utf8"))) {
    if (!/var\(--t-display\)/.test(r.body)) continue;
    seen++;
    if (!/var\(--display-w\)/.test(r.body) || !/letter-spacing:\s*var\(--display-k\)/.test(r.body)) off.push(`${relative(src, p)}: ${r.sel}`);
  }
  assert.ok(seen >= 10, `the face's display-size rules are found (${seen})`);
  assert.deepEqual(off, [], "a heading at the display size with a weight or tracking of its own");
});

// The same Black a step looser at the title and count sizes, where -0.04em closes the word spaces (orchestrator 69beb1e5
// on builder M's specimen, 2026-11-22): --title-k, and a Black heading there reads it, never the display tracking
test("a Black heading at the title or count size reads the title tracking", () => {
  assert.equal(json.next.font["title-k"], "-0.02em");
  assert.match(kit, /--title-k: -0\.02em;/);
  const off: string[] = [];
  let seen = 0;
  for (const p of css(join(src, "next"))) for (const r of rules(readFileSync(p, "utf8"))) {
    if (!/var\(--display-w\)/.test(r.body) || !/var\(--t-(title|big)\)/.test(r.body) || /var\(--t-display\)/.test(r.body)) continue;
    seen++;
    if (!/letter-spacing:\s*var\(--title-k\)/.test(r.body)) off.push(`${relative(src, p)}: ${r.sel}`);
  }
  assert.ok(seen >= 10, `the face's Black title-size rules are found (${seen})`);
  assert.deepEqual(off, [], "a Black heading at the title or count size with the display tracking or one of its own");
});
