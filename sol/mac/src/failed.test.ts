// A failed turn said once, in short plain words, its full text one click away (#1125, failed.ts). Pure on a talk's lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { failWords, withFailure } from "./failed.ts";
import type { Msg } from "./useEngine.ts";

const LONG = "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.example.invalid/v1/responses";
const me = (text: string): Msg => ({ who: "me", text });
const note = (text: string, id: string): Msg => ({ who: "tool", kind: "note", id, text, done: true });

test("a refused sign-in is one short line; the notes that said it fold into its detail", () => {
  const prev = [me("make a list of my classes"), note(`Reconnecting... 1/5 (${LONG})`, "n1"), note(`Falling back from WebSockets to HTTPS transport. ${LONG}`, "n2")];
  const out = withFailure(prev, LONG);
  const tools = out.filter((m) => m.who === "tool");
  assert.equal(tools.length, 1, "one line, not three");
  assert.equal(tools[0].kind, "error");
  assert.ok(tools[0].text.length <= 100 && !/401|bearer/i.test(tools[0].text), "plain words, no status code");
  assert.match(tools[0].detail!, /Reconnecting[\s\S]*Falling back[\s\S]*Missing bearer/, "the full text is one click away");
  assert.equal(out[0].text, "make a list of my classes", "what he said stays");
});

test("the same failure said again is not a second line", () => {
  const once = withFailure([me("hi")], LONG);
  assert.equal(withFailure(once, LONG).filter((m) => m.kind === "error").length, 1);
});

test("an earlier turn's lines are its own; another failure keeps its first line", () => {
  const earlier = [me("one"), note(`Falling back ${LONG}`, "n1"), me("two")];
  const out = withFailure(earlier, "Error: the folder is gone\nat x.ts:3");
  assert.equal(out.length, 4, "the earlier note stays, the new failure is added");
  assert.equal(out[3].text, "the folder is gone");
  assert.equal(failWords(""), "something went wrong");
});
