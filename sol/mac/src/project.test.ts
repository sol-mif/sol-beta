// node --test src/*.test.ts (npm test here): the project settings page's pure parts (#428, cowork/projectView.ts).
// Where each part comes from in words, who a change still waits for, and the patch a form sends: each part whole, logins
// split on commas or spaces, an owners row without a lead taken off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromLine, waitsOn, patchOf, formRefusal, hourWord, type ProjectView } from "./cowork/projectView.ts";

const base: Pick<ProjectView, "from" | "set"> = { from: { rhythm: "file", night: "carried", agents: "default", owners: "record" }, set: {} };

test("where a part comes from: signed when the project set it, else the file or the default", () => {
  assert.match(fromLine("rhythm", base, () => "x"), /\.sol\/rhythm\.json/);
  assert.match(fromLine("agents", base, () => "x"), /^the default/);
  const set = { ...base, set: { owners: { by: "frank", at: "2026-10-30T12:00:00Z", proposal: "a1b2c3d4", agreed: ["frank", "marco"] } } };
  assert.equal(fromLine("owners", set, () => "2h ago"), "set by frank, agreed by frank, marco · 2h ago");
});

test("who a change waits for: agreed, not yet, and not asked yet, in the order it names them", () => {
  assert.deepEqual(waitsOn({ needs: ["a", "b", "c"], votes: { a: "agree", c: "not yet" } }), { agreed: ["a"], notYet: ["c"], waiting: ["b"] });
  assert.deepEqual(waitsOn({ needs: [], votes: { a: "agree" } }), { agreed: [], notYet: [], waiting: [] });
});

test("the form's patch: the part whole, logins split, a row without a lead dropped", () => {
  const r = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "", dev: [], beta: [], night: { hour: 3, staleDays: 7 } };
  assert.deepEqual(patchOf({ part: "rhythm", r, dev: "marco, frank", beta: " isaac  ", why: "" }).rhythm!.dev, ["marco", "frank"]);
  assert.deepEqual(patchOf({ part: "rhythm", r, dev: "", beta: "isaac", why: "" }).rhythm!.beta, ["isaac"]);
  assert.deepEqual(patchOf({ part: "agents", a: { share: "more", pick: true }, why: "" }), { agents: { share: "more", pick: true } });
  assert.deepEqual(patchOf({ part: "owners", rows: [{ area: "Cowork", leads: "frank, marco, isaac" }, { area: "engine", leads: "" }, { area: "", leads: "x" }], why: "" }), { owners: { cowork: ["frank", "marco"] } });
  assert.equal(hourWord(3), "03:00");
});

test("the form's patch: each night's backup (#478) when the engine sends them; an older engine's rhythm keeps none", () => {
  const r = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "", dev: [], beta: [], handover: "23:00", devBackup: [], betaBackup: [], night: { hour: 3, staleDays: 7 } };
  const p = patchOf({ part: "rhythm", r, dev: "marco", beta: "frank", devBackup: " frank ", betaBackup: "marco", why: "" }).rhythm!;
  assert.deepEqual([p.devBackup, p.betaBackup, p.handover], [["frank"], ["marco"], "23:00"]);
  const old = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "", dev: [], beta: [], night: { hour: 3, staleDays: 7 } };
  assert.equal("devBackup" in patchOf({ part: "rhythm", r: old, dev: "marco", beta: "frank", why: "" }).rhythm!, false);
});

test("the form says before sending what the engine refuses (#478): a backup with no zone, a handover outside the night", () => {
  const r = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: [], beta: [], handover: "23:00", devBackup: [], betaBackup: [], night: { hour: 3, staleDays: 7 } };
  const f = (more: object = {}, devBackup = "frank") => ({ part: "rhythm" as const, r: { ...r, ...more }, dev: "marco", beta: "frank", devBackup, betaBackup: "", why: "" });
  assert.equal(formRefusal(f()), "");
  assert.match(formRefusal(f({ zone: "" })), /a backup needs the rhythm's zone/);
  assert.equal(formRefusal(f({ zone: "" }, "")), "");                                  // no backup named: any zone
  assert.match(formRefusal(f({ handover: "07:00" })), /must fall between the review hour \(21:00\) and the end of the night \(06:00\)/);
  assert.equal(formRefusal(f({ handover: "00:30" })), "");
});
