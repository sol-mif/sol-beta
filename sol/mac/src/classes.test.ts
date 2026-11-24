// node --test src/*.test.ts (npm test here): two parts of the face never share a style name by accident (#145).
// Every class is global, so a class that is one part's own sized box (worn alone, with a bare rule that sets its size or
// layout) lands that size on anything else that wears it. That squashed the PR ticket (.bad, the 6px warning dot) and
// drew "show to team" as the Show pane's tall box (.wshow), #143. A box worn as a modifier outside its own file, on an
// element that is already sized by its own class, is refused here unless the pair is listed as meant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// pairs meant to share a base, one a variant sized on purpose on top of the other (names in alphabetical order)
const MEANT = new Set([
  "pane+wpane", "tabs+ttabs", "row+woask", "wdiff+wdlines", "wlink+wopen", "cstage+page-in", "desk-stage+stage",
  "cpage+cshared",
  "me+msg",   // away.css's .me is the Away page's own line; that page never draws a chat message
  "ccols+tb-board", "cgantt+tb-tl",   // a table's board and timeline (#434) are the dashboard's own, on any table
  "v5-box+v5-open",   // Join's link box (fr-30 slice 5) is Setup's answer box, capped in width on purpose
  // Marco's window (marco/mine-window, joined 2026-11-10): these pairs are drawn there today and the test was red on that
  // branch alone; kept as his window draws them, each to be given its own name when its part is next touched
  "hb-node+pulse", "hb-reader+hc-sheetcard", "hb-settings+hc-sheetcard", "bar+hc-bar", "pick+s2-row", "p2w-stream+pick", "st-chip+st-chipmore",
  // the night of 2026-11-13 (run branch), each a variant drawn on its base on purpose (morning round)
  "pb+pbench-back",   // the bench is a piece's back being made (front.css styles .pbench-back's .pb-notch on .pb's own)
  "fh+fh-folder", "fh-folder+obf",   // #1088: the onboarding's folder is Home's folder drawn as pieces (onboard/Folder.tsx)
  "sc-wallrest+st-home",   // #1090: a wall's jelly home is the stage's, a point on the seam (wall.css, Wall.tsx sets where)
  // marco/mine joined to main (#1146), each a variant drawn on its base on purpose
  "ha-row+hs-folder", "ha-row+hs-rest", "ha-row+hs-ses",   // every session (sideAll.tsx) is the artifacts card's rows, side.css's .hs-* on .ha-row
  "pc+st-room", "st-room+st-stage",   // one space (pieces/Space.tsx): the stage's room drawn as a piece (pieces.css .pc.st-room.whole)
  "bc-open+fp-part",   // BR1 (#1615): a folder's part opens as the because card's open line (folder/parts/parts.css)
]);

const root = new URL(".", import.meta.url).pathname;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root);
const LAYOUT = /\b(width|height|display|position|padding|margin|flex|inset)\s*:/;

// a bare one-class rule that sizes or lays out: ".bad { width: 6px }", not ".wticket.bad i" or "i.bad"
const sized = new Map<string, string>();
// the kit's type steps (kit/type.css, #762) are worn on top of any part on purpose: a size and line, never a box
for (const f of files.filter((f) => f.endsWith(".css") && relative(root, f) !== join("kit", "type.css"))) {
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!LAYOUT.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      const b = sel.trim().match(/^\.([\w-]+)(?::[\w-]+(?:\([^)]*\))?)*$/);
      if (b && !sized.has(b[1])) sized.set(b[1], relative(root, f));
    }
  }
}

// the class words one element can wear: its strings, and the strings inside its ${…} that are not compared against
const words = (expr: string): string[] => {
  const out: string[] = [];
  for (const m of expr.matchAll(/([=!]==?\s*)?(?:"([^"]*)"|'([^']*)'|`((?:[^`\\]|\\.)*)`)/g)) {
    if (m[1]) continue;
    if (m[4] !== undefined) {
      out.push(...m[4].replace(/\$\{[^}]*\}/g, " ").split(/\s+/));
      for (const inner of m[4].matchAll(/\$\{([^}]*)\}/g)) out.push(...words(inner[1]));
    } else out.push(...(m[2] ?? m[3]).split(/\s+/));
  }
  return [...new Set(out.filter((t) => /^[a-z][\w-]*$/.test(t)))];
};

test("a part's own box is not worn by another part", () => {
  const alone = new Map<string, string>(), worn: { w: string[]; at: string }[] = [];
  for (const f of files.filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
    const at = relative(root, f);
    for (const line of readFileSync(f, "utf8").split("\n")) {
      for (const m of line.matchAll(/className=("[^"]*"|\{`(?:[^`\\]|\\.)*`\}|\{[^}]*\})|look:\s*[^=]*=>\s*(.*)|classList\.(?:toggle|add)\(("[^"]*")/g)) {
        const w = words(m[1] ?? m[2] ?? m[3]).filter((t) => sized.has(t));
        if (w.length === 1 && m[1]?.startsWith('"') && !alone.has(w[0])) alone.set(w[0], at);
        if (w.length >= 2) worn.push({ w, at });
      }
    }
  }
  const clash = new Set<string>();
  for (const { w, at } of worn) for (const box of w) {
    const home = alone.get(box);
    if (!home || home === at) continue;
    for (const o of w) if (o !== box && !MEANT.has([box, o].sort().join("+")))
      clash.add(`.${box} (its own box in ${home}, sized in ${sized.get(box)}) is worn with .${o} in ${at}`);
  }
  assert.deepEqual([...clash], [], "give the one that is not the box its own name (or, if the pair is meant, add it to MEANT)");
});

// The next face (BR1, #1615): its rules are mostly scoped by the face ([data-face="next"] .x), which the test above does not
// read as a part's own box, so two parts there could share a name unseen: the folder page's .fo (notes.css: a padded grid that
// scrolls) landed on the canvas's folder card (.pl-card.fo, plane/folder.css) and clipped its caption, and the two drew
// their own .fo-chip and .fo-lbl. A part is its CSS file's folder.
const nextCss = files.filter((f) => f.endsWith(".css") && relative(root, f).startsWith("next" + "/")).map((f) => ({ at: relative(root, f), src: readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));
const partOf = (at: string) => at.slice(0, at.lastIndexOf("/"));
// each name the next face sizes alone, bare or scoped by the face, and every part that does
const boxes = new Map<string, string[]>();
for (const { at, src } of nextCss) for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!LAYOUT.test(m[2])) continue;
  for (const sel of m[1].split(",")) {
    const b = sel.trim().match(/^(?:\[[^\]]+\]\s+)?\.([\w-]+)(?::[\w-]+(?:\([^)]*\))?)*$/);
    if (b && !(boxes.get(b[1]) ?? []).includes(at)) boxes.set(b[1], [...(boxes.get(b[1]) ?? []), at]);
  }
}
// sized by two parts before this test (2026-11-22), each to be given its own name when its part is next touched
const TWICE = new Set(["nx-right", "ld-said", "ld-foot"]);

test("the next face: one name is one part's box", () => {
  const two = [...boxes].filter(([n, at]) => !TWICE.has(n) && new Set(at.map(partOf)).size > 1).map(([n, at]) => `.${n} is a box in ${at.join(" and ")}`);
  assert.deepEqual(two, [], "give one of them its own name");
});

// what a :has(), :not(), :is() or :where() names is another element (or none), never the one the compound is on
const INNER = /:(?:has|not|is|where)\((?:[^()]|\([^()]*\))*\)/g;
test("the next face: no rule puts two parts' boxes on one element", () => {
  const both = new Set<string>();
  for (const { at, src } of nextCss) for (const m of src.matchAll(/([^{}]+)\{/g)) for (const sel of m[1].split(",")) for (const one of sel.replace(INNER, "").trim().split(/[\s>+~]+/)) {
    const cs = [...one.matchAll(/\.([\w-]+)/g)].map((c) => c[1]).filter((c) => boxes.has(c));
    for (const a of cs) for (const b of cs) if (a < b && partOf(boxes.get(a)![0]) !== partOf(boxes.get(b)![0]) && !MEANT.has(`${a}+${b}`))
      both.add(`.${a}.${b} in ${at}: .${a} is ${boxes.get(a)![0]}'s box, .${b} ${boxes.get(b)![0]}'s`);
  }
  assert.deepEqual([...both], [], "give the one that is not the box its own name (or, if the pair is meant, add it to MEANT)");
});
