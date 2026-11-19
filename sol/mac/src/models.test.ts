// node --test src/*.test.ts: the pill's friendly model names (models.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { prettyModel, modelLine, follow } from "./models.ts";

test("the names Marco asked for", () => {
  assert.equal(prettyModel("claude-fable-5-1", "claude"), "Fable 5.1");
  assert.equal(prettyModel("claude-fable-5-2", "claude"), "Fable 5.2");
  assert.equal(prettyModel("claude-opus-5-5", "claude"), "Opus 5.5");
  assert.equal(prettyModel("claude-sonnet-5-5"), "Sonnet 5.5");
  assert.equal(prettyModel("claude-haiku-5-5"), "Haiku 5.5");
  assert.equal(prettyModel("gpt-5.6-luna", "codex"), "GPT-5.6 Luna");
  assert.equal(prettyModel("gpt-5.6", "codex"), "GPT-5.6");
  assert.equal(prettyModel("gpt-6.1-sol", "codex"), "GPT-6.1 Sol");
  assert.equal(prettyModel("gpt-6-sol", "codex"), "GPT-6 Sol");
  assert.equal(prettyModel("gpt-5.6-terra", "codex"), "GPT-5.6 Terra");
});

test("an id it has not met: the seat's prefix goes, the version gets its dots, the family its capital", () => {
  assert.equal(prettyModel("x-y-5-1", "x"), "Y 5.1");
  assert.equal(prettyModel("claude-zephyr-6-0", "claude"), "Zephyr 6.0");
  assert.equal(prettyModel("claude-zephyr-6-0", "codex"), "Claude Zephyr-6.0");
  assert.equal(prettyModel("gpt-7-mini", "codex"), "GPT-7 Mini");
  assert.equal(prettyModel("o3", "codex"), "O3");
  assert.equal(prettyModel("claude-opus-5-5[1m]", "claude"), "Opus 5.5 [1m]");
  assert.equal(prettyModel("", "claude"), "–");
});

test("the list's line carries the id beside the name", () => {
  assert.equal(modelLine("claude-fable-5-1", "claude"), "Fable 5.1 · claude-fable-5-1");
  assert.equal(modelLine("o3"), "O3 · o3");
});

test("an old saved pick follows its family into the list", () => {
  const list = ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
  assert.equal(follow("claude-fable-5-1", list), "claude-fable-5-2");
  assert.equal(follow("claude-opus-5-5", list), "claude-opus-5-5");
  assert.equal(follow("gpt-6.1-sol", list), "gpt-6.1-sol");
  assert.equal(follow("", list), "");
});

test("a pick with a tail is not a version and stays as it is", () => {
  assert.equal(follow("claude-opus-5-5[1m]", ["claude-opus-5-6"]), "claude-opus-5-5[1m]");
});

test("a kept version the list offers stays as it is, beside its family's newest", () => {
  const list = ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
  assert.equal(follow("claude-fable-5-1", list), "claude-fable-5-1");
  assert.equal(follow("claude-fable-5-2", list), "claude-fable-5-2");
  assert.deepEqual(list.slice(0, 2).map((m) => prettyModel(m, "claude")), ["Fable 5.2", "Fable 5.1"]);
});
