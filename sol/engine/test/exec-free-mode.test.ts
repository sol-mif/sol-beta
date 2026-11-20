// The mode a ticket's executor (and an orchestration's session) starts on, from its mandate's `free` and the person's Work
// default (runs.ts modeFor). With the default at bypassPermissions every session an agent starts runs unasked (Frank,
// 2026-11-20); with any other default, the mandate tells ask-first from edits-on-its-own as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const top = mkdtempSync(join(tmpdir(), "sol-free-mode-"));
process.env.SOL_SETTINGS = join(top, "settings.json");
writeFileSync(process.env.SOL_SETTINGS, JSON.stringify({ defaults: { mode: "bypassPermissions" } }));
const { modeFor } = await import("../src/work/runs.ts");

test("a bypass default is handed to the sessions agents start, whatever the mandate's free", () => {
  assert.equal(modeFor("edits", "bypassPermissions"), "bypassPermissions");
  assert.equal(modeFor("ask", "bypassPermissions"), "bypassPermissions");
});

test("any other default leaves the mandate's free to tell ask from edits", () => {
  assert.equal(modeFor("edits", "default"), "acceptEdits");
  assert.equal(modeFor("ask", "default"), "default");
  assert.equal(modeFor("edits", "acceptEdits"), "acceptEdits");
  assert.equal(modeFor("ask", "plan"), "default");
});

test("no free named: no mode is set, the session keeps what it had", () => {
  assert.equal(modeFor(undefined, "default"), undefined);
  assert.equal(modeFor(undefined, "bypassPermissions"), undefined);
});

test("the default read from the settings file is the one used when none is given", () => {
  assert.equal(modeFor("ask"), "bypassPermissions");
});

const { modeFollowers } = await import("../src/work/runs.ts");
const marks = { c1: { parent: "orch" }, c2: { parent: "orch" }, other: { parent: "elsewhere" }, grand: { parent: "c1" } };
const tickets = [
  { executor: { sessionId: "ex1" }, subs: [{ kind: "session", key: "orch" }] },
  { executor: { sessionId: "ex2" }, subs: [{ kind: "session", key: "someone-else" }] },
  { subs: [{ kind: "session", key: "orch" }] },   // no executor yet
];

test("the sessions under a switched one: the ones it started (live) and its tickets' executors, nobody else", () => {
  const got = modeFollowers("orch", "bypassPermissions", ["orch", "c1", "c2", "other", "grand"], marks, tickets).sort();
  assert.deepEqual(got, ["c1", "c2", "ex1"]);   // grand follows c1 when c1 moves, not orch directly
});

test("a session that is not live is not followed; a plan switch is handed to nobody", () => {
  assert.deepEqual(modeFollowers("orch", "acceptEdits", ["c1"], marks, []), ["c1"]);
  assert.deepEqual(modeFollowers("orch", "plan", ["c1", "c2"], marks, tickets), []);
});
