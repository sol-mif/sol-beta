// Cowork v3 (fr-30, gap 9 of #574): the front's greeting follows the local hour: morning, afternoon, evening, night.
// The face's own pure file (mac/src/cowork/v3/greet.ts), read here as notch-buttons.test.ts reads the notch's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { partOfDay, greeting } from "../../mac/src/cowork/v3/greet.ts";

test("each local hour has its part of the day", () => {
  const want = (h: number) => (h < 5 || h >= 22 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
  for (let h = 0; h < 24; h++) assert.equal(partOfDay(h), want(h), `${h}:00`);
  assert.equal(partOfDay(3), "night", "3 at night is not the evening");
  assert.equal(partOfDay(23), "night");
});

test("the greeting reads the local clock, with the name when there is one", () => {
  assert.equal(greeting(new Date(2026, 10, 1, 9, 30), "Marco"), "Good morning, Marco.");
  assert.equal(greeting(new Date(2026, 10, 1, 14, 0), "Marco"), "Good afternoon, Marco.");
  assert.equal(greeting(new Date(2026, 10, 1, 19, 45)), "Good evening.");
  assert.equal(greeting(new Date(2026, 10, 1, 2, 10), "Marco"), "Up late, Marco.");
});
