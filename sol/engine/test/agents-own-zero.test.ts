// The own model's daily number holds on both ways Agents asks it (#1476): Jev's questions in Jev's place (meta/own.ts
// makeOwn) and the one turn about a place's pairs of steps (meta/chains.ts, Host.d.say, cappedSay). At 0 neither starts
// a model, in the first grouping and in the late look; at 1 the two ways share the one count. An invented home (a
// choir), a fake model; on a settings file of its own (SOL_SETTINGS), so the real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { make, NOW, type Spec } from "./agents-fixtures.ts";

const DIR = mkdtempSync(join(tmpdir(), "sol-own-zero-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
after(() => rmSync(DIR, { recursive: true, force: true }));

const S = await import("../src/settings.ts");
const { ensure, ensureWith } = await import("../src/agent/agents.ts");
const { Agents } = await import("../src/agent/index.ts");
const { makeAsk } = await import("../src/agent/meta/jev.ts");
const { makeOwn } = await import("../src/agent/meta/own.ts");

/** a choir's place: two song steps (one uses what the other makes, no file between them) and the hall's hours */
const CHOIR: Spec = {
  "choir/policy.md": "# policy\n\n- [watch] clock: Sunday 18:00 pick the songs for the choir's Thursday rehearsal\n- [watch, draft] clock: Monday 09:00 the sheet music for this week's songs to every singer\n- [watch] clock: Friday 08:00 the hall's opening hours into hall.md\n",
  "choir/hall.md": "# hall",
};

/** a Sol on the choir with no Jev key: both ways to the person's own model are counted fakes. Its own model gives no
 *  number to Jev's questions (`said`), so the pairs go on to the turn about steps, as with no model at all */
function sol(said = "not sure") {
  const home = make(CHOIR);
  const n = { own: 0, say: 0 };
  const ask = makeAsk({ key: null, own: makeOwn({ home, now: () => NOW, models: () => ["claude-haiku-5-5"], turn: async () => { n.own++; return said; } }) });
  const say = async () => { n.say++; return "1: no"; };
  const a = new Agents({ home, ask, say, now: () => NOW });
  return { a, ask, n };
}

test("own.perDay 0: the first grouping starts no model, neither Jev's questions nor the turn about steps", async () => {
  S.patchSettings({ own: { perDay: 0 } });
  const { a, ask, n } = sol();
  await ensureWith(a, ask);
  assert.deepEqual(n, { own: 0, say: 0 });
});

test("own.perDay 0: the late look starts no model either", async () => {
  S.patchSettings({ own: { perDay: 0 } });
  const { a, ask, n } = sol();
  ensure(a);   // the keeper's tick: agents.json first, by code
  await ensureWith(a, ask);
  await ensureWith(a, ask);
  assert.deepEqual(n, { own: 0, say: 0 });
});

test("unset, the turn about steps still runs; at 1 the two ways share one count a day", async () => {
  S.patchSettings({ own: null });
  const free = sol();
  await ensureWith(free.a, free.ask);
  assert.ok(free.n.own > 0, "Jev's questions go to the own model");
  assert.equal(free.n.say, 1, "no number from it: the one turn about the place's steps");
  S.patchSettings({ own: { perDay: 1 } });
  const one = sol();
  await ensureWith(one.a, one.ask);
  assert.equal(one.n.own + one.n.say, 1, "one a day, whichever way asked first");
});
