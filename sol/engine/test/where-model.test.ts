// Home's blank sticky (#1485): with no Jev, the cheapest model in the person's own list says which place
// (src/agent/whereModel.ts). A stub stands in for the model's turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askWhereByModel, seat, whereModelSaid, wherePrompt } from "../src/agent/whereModel.ts";
import { cheapest } from "../src/models.ts";

const F = [{ id: "fin101", name: "FIN101", things: ["a problem set"] }, { id: "law200", name: "LAW200", things: ["a case brief"] }];
const said = (text: string) => async () => text;

test("the cheapest model is the newest of the least able family the list names", () => {
  assert.equal(cheapest(["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]), "claude-haiku-5-5");
  assert.equal(cheapest(["claude-opus-5-5", "claude-sonnet-5-5"]), "claude-sonnet-5-5");
  assert.equal(cheapest(["claude-haiku-5-5", "claude-haiku-4-5-20251001"]), "claude-haiku-5-5");
  assert.equal(cheapest([]), null);
  assert.equal(cheapest(["gpt-6.1-sol"]), null);
});

test("the turn names each place with its id and its last stickies", () => {
  const t = wherePrompt("another problem set", F);
  assert.match(t, /fin101 \(FIN101\): a problem set/);
  assert.match(t, /Sticky: another problem set/);
});

test("the seat has nothing in its hands and keeps no conversation", () => {
  const s = seat("claude-haiku-5-5");
  assert.equal(s.model, "claude-haiku-5-5");
  assert.deepEqual(s.tools, []);
  assert.deepEqual(s.mcpServers, {});
  assert.deepEqual(s.settingSources, []);
  assert.equal(s.persistSession, false);
});

test("only a place that was offered is an answer", () => {
  assert.deepEqual(whereModelSaid('{"place": "law200", "confidence": 0.8, "next": "fin101"}', F), { folder: "law200", confidence: 0.8, near: ["law200", "fin101"] });
  assert.deepEqual(whereModelSaid('Sure: {"place":"fin101","confidence":1.4,"next":"elsewhere"}', F), { folder: "fin101", confidence: 1, near: ["fin101"] });
  assert.equal(whereModelSaid('{"place": "elsewhere", "confidence": 0.9}', F), null);
  assert.equal(whereModelSaid("no idea", F), null);
  assert.equal(whereModelSaid("{not json}", F), null);
});

test("no model, a quiet Sol, an error or a slow answer: null, quietly, and the sticky stays loose", async () => {
  const now = new Date(2026, 10, 19);
  let asked = 0;
  const run = async () => { asked++; return '{"place":"law200","confidence":0.9}'; };
  assert.equal(await askWhereByModel("x", F, { model: null, run, now, quiet: false }), null);
  assert.equal(await askWhereByModel("x", F, { model: "claude-haiku-5-5", run, now, quiet: true }), null);
  assert.equal(await askWhereByModel("x", F.slice(0, 1), { model: "claude-haiku-5-5", run, now, quiet: false }), null);
  assert.equal(asked, 0);   // none of those asked the model
  assert.equal(await askWhereByModel("x", F, { model: "claude-haiku-5-5", run: async () => { throw new Error("signed out"); }, now, quiet: false }), null);
  assert.equal(await askWhereByModel("x", F, { model: "claude-haiku-5-5", run: said("I'm not sure"), now, quiet: false }), null);
  assert.deepEqual(await askWhereByModel("x", F, { model: "claude-haiku-5-5", run, now, quiet: false }), { folder: "law200", confidence: 0.9, near: ["law200"] });
});

test("the sticky's words go to the model it was given, and only the day's cap of times", async () => {
  const now = new Date(2026, 10, 20), seen: { text: string; model: string }[] = [];
  const run = async (text: string, model: string) => { seen.push({ text, model }); return '{"place":"fin101","confidence":0.75}'; };
  const o = { model: "claude-haiku-5-5", run, now, cap: 2, quiet: false };
  assert.ok(await askWhereByModel("swim gala kit", F, o));
  assert.ok(await askWhereByModel("swim gala kit", F, o));
  assert.equal(await askWhereByModel("swim gala kit", F, o), null);   // past the cap
  assert.equal(seen.length, 2);
  assert.ok(seen.every((s) => s.model === "claude-haiku-5-5" && s.text.includes("swim gala kit")));
  assert.ok(await askWhereByModel("swim gala kit", F, { ...o, now: new Date(2026, 10, 21) }));   // a new day
});
