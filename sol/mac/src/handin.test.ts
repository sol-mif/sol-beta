// node --test src/*.test.ts (npm test here): the hand-in card (#476) asks until it is answered, then says what was done
// in plain words; its head names the project and the feature when the map names one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asking, cardSaid, cardHead } from "./work/handinWords.ts";

test("the hand-in card: two buttons while it asks, then what was done", () => {
  assert.equal(asking({}), true);
  assert.equal(asking({ state: "busy" }), true);
  assert.equal(asking({ state: "in" }), false);
  assert.equal(cardSaid({ state: "in", why: "handed in: ready for the dev review, based on main" }), "brought in: handed in: ready for the dev review, based on main");
  assert.equal(cardSaid({ state: "held", why: "it stays a draft" }), "not tonight: it stays a draft");
  assert.equal(cardSaid({ state: "gone", why: "a newer commit came in" }), "a newer commit came in");
  assert.equal(cardSaid({ state: "gone" }), "this card no longer asks");
  assert.equal(cardSaid({}), "");
});

test("the hand-in card's head: the project, and the feature when there is one", () => {
  assert.equal(cardHead({ repo: "sol-mif/sol-dev" }), "hand in · sol-dev");
  assert.equal(cardHead({ repo: "sol-mif/sol-dev", feature: { id: "fr-12", name: "Open Sol" } }), "hand in · sol-dev · fr-12 Open Sol");
});

test("no word fold on the card", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["./work/HandIn.tsx", "./work/handinWords.ts"]) assert.ok(!/\bfold/i.test(readFileSync(new URL(f, import.meta.url), "utf8")), f);
});

// the side pane (Split.tsx) draws a second session through scoped(w, id): its card presses must name that session, not
// the main one (useWork.ts imports React and the engine's socket, so its source is read here, not run)
test("the side pane's hand-in and review presses go to the side pane's own session", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./work/useWork.ts", import.meta.url), "utf8");
  const scoped = src.slice(src.indexOf("export function scoped("));
  assert.ok(scoped.length > 0 && src.includes("export function scoped("));
  assert.match(scoped, /handIn: \(card: string, choice: "in" \| "not"\) => w\.handIn\(card, choice, id\)/);
  assert.match(scoped, /tonight: \(verdict: string, number\?: number, fix\?: string\) => w\.tonight\(verdict, number, fix, id\)/);
  // the hook's own handIn and tonight take the session last, so scoped's id lands there
  assert.match(src, /handIn: async \(card: string, choice: "in" \| "not", id = live\)/);
  assert.match(src, /tonight: async \(verdict: string, number\?: number, fix\?: string, id = live\)/);
});
