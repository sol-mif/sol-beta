// node --test src/*.test.ts: an orchestration session's renewal as the side hears it (home/sideKept.ts, 2026-11-14)
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshRenewals, handingOver, type OrchKept } from "./home/sideRenewals.ts";

test("each renewal is told once, oldest first; one heard before stays seen", () => {
  const seen = new Set<string>();
  const a: OrchKept[] = [{ sessionId: "o1b", renewals: [{ from: "o1", to: "o1b", at: 10 }] }];
  assert.deepEqual(freshRenewals(a, seen), [{ from: "o1", to: "o1b" }]);
  assert.deepEqual(freshRenewals(a, seen), [], "the same word again moves nothing");
  const b: OrchKept[] = [{ sessionId: "o1c", renewals: [{ from: "o1", to: "o1b", at: 10 }, { from: "o1b", to: "o1c", at: 30 }] }, { sessionId: "o2b", renewals: [{ from: "o2", to: "o2b", at: 20 }] }];
  assert.deepEqual(freshRenewals(b, seen), [{ from: "o2", to: "o2b" }, { from: "o1b", to: "o1c" }]);
});

test("the rows handing over are the ones writing their handover now", () => {
  assert.deepEqual([...handingOver([{ sessionId: "a", renewing: { at: 1 } }, { sessionId: "b", renewing: null }, { sessionId: "c" }])], ["a"]);
});
