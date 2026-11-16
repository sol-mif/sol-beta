// node --test src/*.test.ts (npm test here): the Scoped and Approve card (#482) says what the engine sent: the ask, why
// Sol refuses the press now, and once pressed, who pressed and when, with no button left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpointWords, type Checkpoint } from "./work/presses.ts";

const card = (o: Partial<Checkpoint> = {}): Checkpoint => ({
  id: "checkpoint:fr-12:scoped:x", press: "scoped", feature: "fr-12", folder: "specs/features/fr-12-open-sol", title: "fr-12 · Open Sol", why: null, ...o,
});

test("the Scoped card: the ask and the press", () => {
  const w = checkpointWords(card());
  assert.equal(w.head, "scoped · fr-12");
  assert.match(w.ask, /Is fr-12 · Open Sol scoped\?/);
  assert.equal(w.button, "Scoped");
  assert.equal(w.done, ""); assert.equal(w.blocked, "");
});

test("an open question: the card says Sol refuses it, and why", () => {
  assert.equal(checkpointWords(card({ why: "1 open question: Does it open on login?" })).blocked, "Sol refuses it until: 1 open question: Does it open on login?");
});

test("the Approve card, busy, then done with who and when", () => {
  assert.equal(checkpointWords(card({ press: "approve" })).button, "Approve");
  assert.match(checkpointWords(card({ press: "approve" })).ask, /Approve the evals of fr-12 · Open Sol\?/);
  assert.equal(checkpointWords(card({ press: "approve", state: "busy" })).button, "…");
  assert.equal(checkpointWords(card({ press: "approve", state: "done", by: "marcocyl04-ux", on: "2026-10-31" })).done, "Approved by marcocyl04-ux on 2026-10-31");
  assert.equal(checkpointWords(card({ state: "done", by: "franktsai2008-eng", on: "2026-10-31" })).done, "Scoped by franktsai2008-eng on 2026-10-31");
});
