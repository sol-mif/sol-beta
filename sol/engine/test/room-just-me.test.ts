// Gate one q2 on the card product/cowork/room (#1740): a new Sol has no table, and its AI never makes one on a guess
// (open_table takes only the person's own words this turn). The room's press "set up a table just for me" sends the
// person's AI those words as their own line (mac/src/cowork/whole/room-chat.ts JUST_ME), so the AI's open_table makes
// the table on Sol's cloud; the same tool with words the person did not say still makes nothing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.SOL_VERSION = "concept";   // Cowork stands on (view.cowork), as where the room is on today
const T = await import("../src/team/table-tools.ts");
after(() => { delete process.env.SOL_VERSION; });

// the face's own words, read from its file, so the two never drift apart
const face = readFileSync(new URL("../../mac/src/cowork/whole/room-chat.ts", import.meta.url), "utf8");
const JUST_ME = /export const JUST_ME = "([^"]+)";/.exec(face)?.[1] ?? "";

test("q2: the press's words are the person's turn, and open_table makes the just-me table on them", async () => {
  assert.ok(JUST_ME, "the face says JUST_ME");
  const made: string[] = [];
  const make = async (name: string) => { made.push(name); return { room: { id: "just-me", name, code: "K7Q2MX" } }; };
  const r = await T.runTableTool("open_table", { name: "just me", yes: "start a Cowork table just for me" }, { said: JUST_ME }, make);
  assert.equal(r.isError, undefined, r.content[0].text);
  assert.deepEqual(made, ["just me"]);
  assert.match(r.content[0].text, /made the table just me; its code is K7Q2MX/);
});

test("q2: without those words in the turn, nothing is made: the AI never sets a table up on its own", async () => {
  const made: string[] = [];
  const make = async (name: string) => { made.push(name); return { room: { id: "x", name, code: "K7Q2MX" } }; };
  const r = await T.runTableTool("open_table", { name: "just me", yes: "start a Cowork table just for me" }, { said: "what is on my plate today?" }, make);
  assert.equal(r.isError, true);
  assert.deepEqual(made, []);
});
