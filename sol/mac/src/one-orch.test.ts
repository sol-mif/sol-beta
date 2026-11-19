// node --test src/*.test.ts: two kinds of session (2026-11-14, the design #1183): the engine's words to an orchestration
// session read as one line of its talk (one/engineSaid.ts), and the row menu offers promote or demote (home/Side.tsx).
// The engine's texts are written here as one.ts starts them (PROMOTED, DEMOTED, joined, ORCH_RENEWED, the reports).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { engineSaid } from "./one/engineSaid.ts";

test("the engine's orchestration words read as one line each; the person's words stay theirs", () => {
  assert.match(engineSaid("<promoted>\nYou are now an orchestration session (Sol).")!, /^promoted: /);
  assert.match(engineSaid("<demoted>\nYou are a normal session again")!, /^demoted: .*loose/);
  assert.equal(engineSaid("<session joined>\n\"the side row\" (kid-1) in /x.\nWaits on: nothing.\n</session joined>"), "a session joined: the side row");
  assert.equal(engineSaid("<session joined>\nsomething else"), "a session joined: its summary came in");
  assert.match(engineSaid("<reports from sessions under you>\n- a (b): done")!, /reports came in from the sessions under it/);
  assert.match(engineSaid("You are an orchestration session in Build (Sol), \"x\": ... Your folder is /a.\n\nYou are renewal 2 of this session: ...")!, /^renewed: /);
  assert.equal(engineSaid("You are an orchestration session in Build (Sol), I said, promote me"), null, "the person's own words are never taken for the engine's");
  assert.equal(engineSaid("promote this one please"), null);
});

test("the row menu: promote on a normal row, a fresh copy and demote on every orchestration row (#1209: no row is kept apart); work.kind is what it sends", () => {
  const side = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  assert.match(side, /s\.kind === "orchestration"\s*\? \[\["renew", "fresh copy now", \(\) => renewNow\(s\.id\)\][^\n]*\["kind", "demote", \(\) => w\.kind\(s\.id, null\)\]/);
  assert.doesNotMatch(side, /anchorId/);
  assert.match(side, /\["kind", "promote to orchestration", \(\) => w\.kind\(s\.id, "orchestration"\)\]/);
  const work = readFileSync(new URL("./work/useWork.ts", import.meta.url), "utf8");
  assert.match(work, /kind: \(id: string, kind: "orchestration" \| null\) => ask<[^>]*>\("work\.kind", \{ sessionId: id, kind \}\)/);
  assert.match(work, /under: \(id: string, under: string \| null, undo\?: boolean\) => ask<[^>]*>\("work\.under", \{ sessionId: id, under, \.\.\.\(undo \? \{ undo: true \} : \{\}\) \}\)/, "a refusal is heard; an undo says so (G7)");
});
