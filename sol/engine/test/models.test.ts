import { test } from "node:test";
import assert from "node:assert/strict";
import { family, flagships, latest, KEEP, FALLBACK, cached } from "../src/models.ts";

// the rows the Claude CLI gave on 2026-11-09 (supportedModels): aliases, a new version not yet behind its alias, old ones
const ROWS = [
  { value: "default", resolvedModel: "claude-opus-5-5" },
  { value: "opus", resolvedModel: "claude-opus-5-5" },
  { value: "claude-fable-5-2", resolvedModel: "claude-fable-5-2" },
  { value: "sonnet", resolvedModel: "claude-sonnet-5-5" },
  { value: "haiku", resolvedModel: "claude-haiku-5-5" },
  { value: "fable", resolvedModel: "claude-fable-5-1" },
  { value: "claude-haiku-4-5-20251001", resolvedModel: "claude-haiku-4-5-20251001" },
  { value: "claude-sonnet-5", resolvedModel: "claude-sonnet-5" },
  { value: "claude-opus-5", resolvedModel: "claude-opus-5" },
  { value: "claude-fable-5", resolvedModel: "claude-fable-5" },
  { value: "claude-opus-4-8", resolvedModel: "claude-opus-4-8" },
];

test("a family and its version are read from the id", () => {
  assert.deepEqual(family("claude-fable-5-2"), { name: "fable", version: [5, 2] });
  assert.deepEqual(family("claude-haiku-4-5-20251001"), { name: "haiku", version: [4, 5] });
  assert.deepEqual(family("claude-opus-5"), { name: "opus", version: [5, 0] });
  assert.equal(family("gpt-6.1-sol"), null);
});

test("the newest of each family, most able first, even when its alias still points at the older one", () => {
  assert.deepEqual(flagships(ROWS, []), { models: ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], default: "claude-opus-5-5" });
});

test("a new version replaces its family's old one with nothing written here", () => {
  const next = flagships([...ROWS, { value: "opus", resolvedModel: "claude-opus-5-6" }, { value: "claude-mythos-6", resolvedModel: "claude-mythos-6" }]);
  assert.deepEqual(next.models, ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-6", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-mythos-6"]);
  assert.equal(next.default, "claude-opus-5-6", "the CLI's default, moved to its family's newest");
});

test("an old pick runs as its family's newest; a Codex name or an alias stays as it is", () => {
  const list = flagships(ROWS, []).models;
  assert.equal(latest("claude-fable-5-1", list, []), "claude-fable-5-2", "with nothing kept");
  assert.equal(latest("claude-opus-4-8", list), "claude-opus-5-5");
  assert.equal(latest("claude-opus-5-5", list), "claude-opus-5-5");
  assert.equal(latest("gpt-6.1-sol", list), "gpt-6.1-sol");
  assert.equal(latest("opus", list), "opus");
});

test("Fable 5.1 is kept: in the list right after Fable 5.2, and a pick of it runs as 5.1", () => {
  assert.ok(KEEP.includes("claude-fable-5-1"));
  const { models, default: def } = flagships(ROWS);
  assert.deepEqual(models, ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.equal(def, "claude-opus-5-5", "keeping an old version does not move the default");
  assert.equal(latest("claude-fable-5-1", models), "claude-fable-5-1");
  assert.equal(latest("claude-fable-5-1", ["claude-fable-5-2"]), "claude-fable-5-1", "kept even before the list has it");
  assert.equal(latest("claude-fable-5-2", models), "claude-fable-5-2");
});

test("a kept version the CLI no longer offers drops from the list; KEEP is the only list of what stays", () => {
  const rows = ROWS.filter((r) => r.resolvedModel !== "claude-fable-5-1");
  assert.deepEqual(flagships(rows).models, ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.deepEqual(flagships(ROWS, ["claude-fable-5-1", "claude-opus-4-8", "claude-opus-5"]).models,
    ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-sonnet-5-5", "claude-haiku-5-5"]);
});

test("the fallback, before the CLI answers, holds Fable 5.1 beside Fable 5.2", () => {
  assert.deepEqual(FALLBACK.models.slice(0, 2), ["claude-fable-5-2", "claude-fable-5-1"]);
  assert.equal(latest("claude-fable-5-1", FALLBACK.models), "claude-fable-5-1");
});

test("a cached list written before KEEP, or under another KEEP, is not used; the fallback (with 5.1) is", () => {
  const old = JSON.stringify({ models: ["claude-fable-5-2", "claude-opus-5-5"], default: "claude-opus-5-5" });
  assert.equal(cached(old), null, "the list #864 wrote before KEEP");
  assert.equal(cached(JSON.stringify({ ...JSON.parse(old), keep: [] })), null);
  const now = { models: ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5"], default: "claude-opus-5-5" };
  assert.deepEqual(cached(JSON.stringify({ ...now, keep: KEEP })), now);
  assert.equal(cached("not json"), null);
});

test("a CLI whose default is Fable 5.1 keeps it as Sol's default", () => {
  const rows = [...ROWS.filter((r) => r.value !== "default"), { value: "default", resolvedModel: "claude-fable-5-1" }];
  assert.equal(flagships(rows).default, "claude-fable-5-1");
  assert.equal(flagships(rows, []).default, "claude-fable-5-2", "with nothing kept, it moves to the newest");
});
