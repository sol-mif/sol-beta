// node --test src/*.test.ts: BR1's Settings cuts (sweep 5, #1615). In a real Sol no Settings control is drawn whose move
// answers "not yet" with nothing to say why; Connected services, never drawn, is gone; the Seats lines promise no page
// Sol did not open. Signed: marcocyl04-ux's agent (builder E8), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL(`./next/${f}`, import.meta.url), "utf8");

test("live, every Settings move that answers not yet has no control drawn", () => {
  const moves = src("cv/moves/settings.ts"), index = src("settings/index.tsx"), privacy = src("settings/Privacy.tsx"), model = src("settings/model.ts");
  // the history's preview, replay and back-to-default: History is the fixture's; live draws FitHistory
  assert.match(moves, /function preview[\s\S]*?if \(live\(\)\) return notYet\(\);/);
  assert.match(index, /\{w\.live \? <FitHistory w=\{w\} \/> : <History w=\{w\} u=\{u\} \/>\}/, "History (hpv, hgo, hdef) never live");
  // a learned line's Edit: live it is Make it a rule
  assert.match(privacy, /\{w\.live \? <button className="st-tx" onClick=\{\(\) => M\.stAct\("l-keep", f\.k\)\}>Make it a rule<\/button> : <button className="st-tx" onClick=\{\(\) => M\.stAct\("l-edit", f\.k\)\}>Edit<\/button>\}/);
  // a new way, saving one, a tune undone: no control anywhere calls them
  const faces = ["settings/index.tsx", "settings/Privacy.tsx", "settings/History.tsx", "settings/Knob.tsx", "settings/Fits.tsx"].map(src).join("\n");
  for (const a of ["way-new", "way-save", "untune"]) assert.ok(!faces.includes(`"${a}"`), `${a} is pressed nowhere`);
  // the ways and the spend knob: found and drawn only off live
  assert.match(model, /PLACES\.filter\(\(p\) => !\(W\.live && PLACES_NOT_LIVE\.has\(p\.id\)\)\)/, "the ways' place is not found live");
  assert.match(model, /if \(!W\.live\) W\.ways\.forEach/, "no way is found live");
  assert.match(index, /const knob = \(id: string\) => \(w\.live && NOT_LIVE\.has\(id\) \? null :/, "a knob not live is not drawn");
  assert.ok(!/GoRow id="ways"/.test(index), "no row opens the ways");
});

test("Connected services is cut: no block, no row to it", () => {
  const index = src("settings/index.tsx");
  assert.ok(!index.includes('id="st-conn"'), "no Connected services block");
  assert.ok(!index.includes('GoRow id="conn"'), "no row to it");
  assert.ok(!/M\.stAct\("conn-(ask|ok)"/.test(index), "no Connect that only flips a flag");
});

test("the Seats lines promise no page Sol did not open", () => {
  for (const f of ["settings/seats/Seats.tsx", "settings/seats/model.ts"]) {
    assert.doesNotMatch(src(f), /open in your browser/, f);
    assert.doesNotMatch(src(f), /Waiting for its page/, f);
  }
});
