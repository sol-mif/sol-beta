// node --test src/*.test.ts: Settings › me in a person's words (#948). Marco's read of 2026-11-10: "anyone would be
// confused with this". Each switch row says what the person will see change; nothing of how it is built (a version, a
// path, a dry run, the layouts' count, a placeholder look, the trail or the record).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
/** what a row shows: its name and its small line (each `<div className="lab">…</div>`), and the switch's label */
const shown = (src: string) => [
  ...[...src.matchAll(/<div className="lab">([\s\S]*?)<\/div>/g)].map((m) => m[1]),
  ...[...src.matchAll(/<Switch [^>]*label="([^"]*)"/g)].map((m) => m[1]),
];
const BUILD = /\bv3\b|sol\/|SOL_|dry run|layouts|placeholder|\btrail\b|\brecord\b|\bengine\b|\bclean Home\b|\bthe frame\b/i;

test("#948: the rows under Settings › me say what a person sees change, not how it is built", () => {
  const rows = [...shown(read("cowork/v3/SwitchRow.tsx")), ...shown(read("home/CleanRow.tsx"))];
  assert.equal(rows.length, 6);   // three rows, a name and a label each (the walk row went with the walk, #1054)
  for (const r of rows) assert.doesNotMatch(r, BUILD, r);
  const card = read("cowork/v3/SwitchRow.tsx").match(/className="v3-card"[^>]*>\s*(<p>[\s\S]*?<\/p>)/)?.[1] ?? "";
  assert.ok(card, "the card's line");
  assert.doesNotMatch(card, BUILD);   // the card the first turn-on shows
});
