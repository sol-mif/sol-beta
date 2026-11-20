// The own model's daily cap is the person's (#1476, gate one question 4): settings own.perDay, 0–500, 0 never, unset 100;
// read at each ask, so a change needs no restart; their AI changes it with set_setting on their own words this turn.
// On a settings file of its own (SOL_SETTINGS), so the real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-own-cap-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
process.env.SOL_OPEN_FOR = "on";
after(() => { delete process.env.SOL_OPEN_FOR; rmSync(DIR, { recursive: true, force: true }); });

const S = await import("../src/settings.ts");
const O = await import("../src/openfor.ts");
const { makeOwn, ownPerDay } = await import("../src/agent/meta/own.ts");
const { jevNote, JEV_NOTE } = await import("../src/agent/agents.ts");
const WORDS = { instructions: "Same job?", yes: "the same", no: "different" };

test("unset: 100 a day; the person's number caps it at the next ask; 0 never asks; null is back to 100", async () => {
  assert.equal(ownPerDay(), 100);
  assert.equal(jevNote(), JEV_NOTE);
  let asked = 0;
  const own = makeOwn({ home: mkdtempSync(join(DIR, "h-")), models: () => ["claude-haiku-5-5"], turn: async () => { asked++; return "0.5"; } });
  S.patchSettings({ own: { perDay: 2 } });
  for (let i = 0; i < 4; i++) await own(WORDS, "a", "b");
  assert.equal(asked, 2, "two a day, read at each ask");
  assert.match(jevNote(), /at most 2 times a day/);
  S.patchSettings({ own: { perDay: 0 } });
  assert.equal(await own(WORDS, "a", "b"), null);
  assert.match(jevNote(), /not to use your own AI/);
  for (const bad of [-1, 501, 2.5, "10"]) { S.patchSettings({ own: { perDay: bad } }); assert.equal(ownPerDay(), 0, `${bad} changes nothing`); }
  S.patchSettings({ own: null });
  assert.equal(ownPerDay(), 100);
});

test("set_setting changes it only on the person's words this turn", async () => {
  O.heard("s1", "only ask my own AI 20 times a day");
  let r = await O.runOpenTool("set_setting", { patch: { own: { perDay: 20 } }, yes: "20 times a day" }, { sessionId: "s1" });
  assert.equal(r.isError, undefined, String(r.content[0].text));
  assert.equal(ownPerDay(), 20);
  O.heard("s1", "what does that do?");
  r = await O.runOpenTool("set_setting", { patch: { own: { perDay: 500 } }, yes: "20 times a day" }, { sessionId: "s1" });
  assert.equal(r.isError, true, "not their words this turn");
  assert.equal(ownPerDay(), 20);
});
