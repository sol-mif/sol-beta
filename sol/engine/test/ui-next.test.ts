// The new face's switch ui.next (#1604, docs/port/switch.md): read like cowork.v3, the env SOL_UI_NEXT first, then the
// person's setting ui.next, then where its card's station stands in this Sol's version (hand: off until set). The face
// is sent it already resolved (readings). On a settings file of its own (SOL_SETTINGS), so the real one is never touched.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-ui-next-"));
const FILE = join(DIR, "settings.json");
process.env.SOL_SETTINGS = FILE;
const ENVS = ["SOL_VERSION", "SOL_UI_NEXT"];
for (const k of ENVS) delete process.env[k];
after(() => { for (const k of ENVS) delete process.env[k]; rmSync(DIR, { recursive: true, force: true }); });
writeFileSync(FILE, "{}");

const V = await import("../src/versions.ts");
const S = await import("../src/settings.ts");
const onDisk = () => JSON.parse(readFileSync(FILE, "utf8"));

test("clean keeps ui.next only as a boolean, and drops anything else under ui", () => {
  assert.deepEqual(S.clean({ ui: { next: true } }).ui, { next: true });
  assert.deepEqual(S.clean({ ui: { next: false, other: 1 } }).ui, { next: false });
  assert.equal(S.clean({ ui: { next: "yes" } }).ui, undefined);
  assert.equal(S.clean({}).ui, undefined, "never written until someone turns it");
});

test("the env wins both ways, then the setting, then the station (hand: off in every mode)", () => {
  S.noteChannel("dev");
  // nobody set it: the card stands at hand, so off even in concept
  assert.equal(V.stageOf("ui.next"), "hand", "its card stands at hand (ring 1: a person's own setting)");
  assert.equal(S.uiNext(), false);
  // the station, when a ring moves the card: on in concept once it stands at concept
  const was = Object.getOwnPropertyDescriptor(V.STAGES, "ui.next");
  (V.STAGES as Record<string, string>)["ui.next"] = "concept";
  try {
    assert.equal(S.uiNext(), true, "a station at concept turns it on for a dev-channel Sol");
    S.patchSettings({ ui: { next: false } });
    assert.equal(S.uiNext(), false, "a person who turned it off stays off through a ring's move");
  } finally {
    if (was) Object.defineProperty(V.STAGES, "ui.next", was); else delete (V.STAGES as Record<string, string>)["ui.next"];
  }
  // the setting
  S.patchSettings({ ui: { next: true } });
  assert.deepEqual(onDisk().ui, { next: true });
  assert.equal(S.uiNext(), true);
  // the env first, both ways
  process.env.SOL_UI_NEXT = "off";
  assert.equal(S.uiNextEnv(), "off");
  assert.equal(S.uiNext(), false, "SOL_UI_NEXT=off wins over the setting");
  S.patchSettings({ ui: { next: false } });
  process.env.SOL_UI_NEXT = "on";
  assert.equal(S.uiNext(), true, "SOL_UI_NEXT=on wins over the setting");
  delete process.env.SOL_UI_NEXT;
  assert.equal(S.uiNextEnv(), "");
  assert.equal(S.uiNext(), false);
});

test("the face's settings message carries ui.next resolved, and the hearers hear each change once", () => {
  S.patchSettings({ ui: { next: false } });
  const heard: boolean[] = [];
  S.onUiNext((on) => heard.push(on));
  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(S.readings().ui, { next: true }, "the env's reading is sent where it differs from the setting");
  S.noteUiNext(); S.noteUiNext();
  delete process.env.SOL_UI_NEXT;
  S.noteUiNext();
  assert.equal(S.readings().ui, undefined, "where they agree nothing is added");
  S.patchSettings({ ui: { next: true } });
  assert.deepEqual(heard, [true, false, true]);
  S.patchSettings({ ui: { next: false } });
});
