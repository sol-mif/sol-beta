// node --test src/*.test.ts: the Made holder's ✦ rows light the session that made their thing, as the thing's own piece
// does on the canvas (✦ landing, plane/landed.ts; holders/model.ts madeTie): the holder's line at rest and each row
// opened up close. Invented things only (the fixture's landing scene). Signed: marcocyl04-ux's agent (builder F10), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { landedData } from "./next/cv/fixture.ts";
import { lightOff, litNow, madeBy } from "./next/plane/landed-state.ts";
import { madeOf, madeTie } from "./next/holders/model.ts";

type Tie = { "data-made"?: string; onPointerEnter?: () => void; onPointerLeave?: () => void; onFocus?: () => void; onBlur?: () => void };

test("a Made row lights the session that made its thing, and the hand leaving puts it out", () => {
  const d = landedData();
  const note = madeOf(d).find((p) => p.id === "ada-note");
  assert.ok(note, "the note Fix login made is in Made");
  const t = madeTie(note, d) as Tie;
  assert.equal(t["data-made"], "s-Ada");
  lightOff();
  t.onPointerEnter!();
  assert.equal(litNow(), "s-Ada", "pointed at: its session lights");
  t.onPointerLeave!();
  assert.equal(litNow(), null);
  t.onFocus!();
  assert.equal(litNow(), "s-Ada", "by keys too");
  t.onBlur!();
  assert.equal(litNow(), null);
});

test("a made thing no session made ties to nothing", () => {
  const d = landedData();
  const none = madeOf(d).filter((p) => !madeBy(p, d.pieces));
  for (const p of none) assert.deepEqual(madeTie(p, d), {}, p.id);
  assert.deepEqual(madeTie({ id: "x", region: "api", kind: "doc", name: "x", by: "ai", from: "Maya" }, d), {}, "a friend's name is no session");
});

test("both of Made's rows wear the tie: the line at rest and each row opened up close", () => {
  const view = readFileSync(fileURLToPath(new URL("./next/holders/Holders.tsx", import.meta.url)), "utf8");
  assert.match(view, /<MadeLine key=\{p\.id\} p=\{p\} \/>/);
  assert.match(view, /draw=\{\(p\) => <MadeArt key=\{p\.id\} p=\{p\} \/>\}/);
  assert.equal((view.match(/\{\.\.\.(useTie\(p\)|t)\}/g) ?? []).length, 2, "each row spreads its tie");
});
