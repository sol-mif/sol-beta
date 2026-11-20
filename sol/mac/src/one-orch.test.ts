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

test("the anchor's words from the engine read as one line: kept, and renewed (one.ts FIRST_PLAIN, ANCHOR_RENEWED)", () => {
  assert.equal(engineSaid("You are the anchor session: the session this person mostly works in"), "the anchor: this session is kept from now on");
  assert.match(engineSaid("You are the anchor session: the session ... Your folder is /a.\n\nYou are renewal 3 of the same anchor session: ...")!, /^renewed: .*this stage/);
  assert.equal(engineSaid("is this the anchor session?"), null);
});

test("build.orchestration stands at concept (MINE_ON) and is told to the engine from both sides' apps", () => {
  const flag = readFileSync(new URL("./flag.ts", import.meta.url), "utf8");
  assert.match(flag, /MINE_ON = new Set\(\[[^\]]*"build\.orchestration"/);
  for (const f of ["./home/Home.tsx", "./work/WorkApp.tsx"]) {
    const t = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(t, /useOrchestrationToEngine\(\);/, f);
    assert.match(t, /useAnchor\(/, f);
  }
  const o = readFileSync(new URL("./one/orchestration.ts", import.meta.url), "utf8");
  assert.match(o, /type: "work\.orchestration\.on", on/);
});

test("the row menu: promote on a normal row while build.orchestration is on, a fresh copy and demote on every orchestration row, a fresh copy only on the anchor (2026-11-19: the anchor is back beside them); work.kind is what it sends", () => {
  const side = readFileSync(new URL("./home/Side.tsx", import.meta.url), "utf8");
  assert.match(side, /s\.kind === "orchestration"\s*\? \[\["renew", "fresh copy now", \(\) => renewNow\(s\.id\)\][^\n]*\["kind", "demote", \(\) => w\.kind\(s\.id, null\)\]/);
  assert.match(side, /: s\.id === anchorId\(\) \? \[\["renew", "fresh copy now", \(\) => renewNow\(s\.id\)\][^\n]*\]\n/, "the anchor: a fresh copy, never promote");
  assert.match(side, /s\.archived \|\| !orchOn \? \[\] : \[\["kind", "promote to orchestration", \(\) => w\.kind\(s\.id, "orchestration"\)\]/, "promote only with the switch on");
  assert.match(side, /\{onOne && <OneDoor clean on=\{!!one\} onPick=\{onOne\}/, "the anchor's row beside settings");
  const work = readFileSync(new URL("./work/useWork.ts", import.meta.url), "utf8");
  assert.match(work, /kind: \(id: string, kind: "orchestration" \| null\) => ask<[^>]*>\("work\.kind", \{ sessionId: id, kind \}\)/);
  assert.match(work, /under: \(id: string, under: string \| null, undo\?: boolean\) => ask<[^>]*>\("work\.under", \{ sessionId: id, under, \.\.\.\(undo \? \{ undo: true \} : \{\}\) \}\)/, "a refusal is heard; an undo says so (G7)");
});
