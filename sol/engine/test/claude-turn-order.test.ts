// A Claude turn in Home (index.ts sayClaude) hands ceilingHooks a way to read its session id, and ceilingHooks reads it
// as it is made. The id was a `let` declared below the options that call ceilingHooks, so the read threw ("Cannot access
// 'sessionId' before initialization") and every Claude turn in Home ended there, Home on or off. No test runs a real
// Claude turn (it needs the model), so this holds the two halves apart: the hooks do read at once, and in sayClaude the
// id is declared above everything that reads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ceilingHooks } from "../src/home/ceiling.ts";

test("ceilingHooks reads the session as it is made, so the caller's id has to be there already", () => {
  let reads = 0;
  ceilingHooks(() => { reads++; return undefined; });
  assert.equal(reads, 1, "one read, at once");
  assert.throws(() => { ceilingHooks(() => late); let late: string | undefined; void late; }, ReferenceError, "a let read above its own line throws");
});

test("in sayClaude the session id is declared above the options that read it", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const from = src.indexOf("async function sayClaude(");
  assert.ok(from > 0, "sayClaude is in index.ts");
  const body = src.slice(from, src.indexOf("\nasync function ", from + 1));
  const decl = body.indexOf("let sessionId");
  assert.ok(decl > 0, "sayClaude declares its session id");
  for (const reader of ["ceilingHooks(", "ceilingGuard("]) {
    const at = body.indexOf(reader);
    assert.ok(at > 0, `sayClaude calls ${reader}`);
    assert.ok(decl < at, `the id is declared above ${reader}`);
  }
});
