// node --test src/*.test.ts: the version switch's rules (#1295): what is lit, and what a press writes
import { test } from "node:test";
import assert from "node:assert/strict";
import { litOf, pressOf } from "./versionPick.ts";

test("lit: product while this Sol follows beta or picked here on complete, else the version the engine runs it as; nothing before it answers", () => {
  assert.equal(litOf(null), null);
  assert.equal(litOf({ channel: "dev", mode: "concept" }), "concept");
  assert.equal(litOf({ channel: "dev", mode: "complete" }), "complete");
  assert.equal(litOf({ channel: "beta", mode: "complete" }), "product");
  assert.equal(litOf({ channel: "dev", mode: null }), null, "the channel not known yet: nothing lit");
  assert.equal(litOf({ channel: "dev", mode: "complete" }, "product"), "product", "#1427: product picked here, still on dev");
  assert.equal(litOf({ channel: "dev", mode: "concept" }, "product"), "concept", "the engine runs concept: the old pick does not hold");
});

test("a press: concept and complete write the version; product writes complete and keeps the channel (#1427)", () => {
  assert.deepEqual(pressOf("concept", { channel: "dev" }), { version: "concept" });
  assert.deepEqual(pressOf("complete", { channel: "dev" }), { version: "complete" });
  assert.deepEqual(pressOf("product", { channel: "dev" }), { version: "complete" }, "no channel turns, updates go on");
  assert.deepEqual(pressOf("complete", { channel: "beta" }), { version: "complete", channel: "dev" }, "leaving beta follows dev again");
});
