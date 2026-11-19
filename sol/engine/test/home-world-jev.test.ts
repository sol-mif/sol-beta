// Home's world (#1093): Jev's pick 1, where a dropped sticky belongs (src/agent/whereJev.ts). A stub stands in for Jev.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askWhere, whereBody, whereSaid } from "../src/agent/whereJev.ts";

const F = [{ id: "fin101", name: "FIN101", things: ["a problem set"] }, { id: "law200", name: "LAW200", things: ["a case brief"] }];

test("the question's options are the folders, each with its last stickies", () => {
  const b = whereBody("another problem set", F);
  assert.equal(b.questions.where.type, "choice");
  assert.deepEqual(Object.keys(b.questions.where.criteria), ["fin101", "law200"]);
  assert.match(b.state.folders, /fin101 \(FIN101\): a problem set/);
});

test("only a folder that was offered is an answer", () => {
  assert.deepEqual(whereSaid({ answers: { where: { choice: "fin101", confidence: 0.82 } } }, F), { folder: "fin101", confidence: 0.82, near: ["fin101"] });
  assert.equal(whereSaid({ answers: { where: { choice: "elsewhere", confidence: 0.9 } } }, F), null);
  assert.equal(whereSaid({ answers: {} }, F), null);
});

test("near: the two likeliest folders by Jev's probabilities, the chosen one first (Home's blank sticky, #1483)", () => {
  const G = [...F, { id: "kids/lia", name: "Lia", things: [] }];
  const said = whereSaid({ answers: { where: { choice: "law200", confidence: 0.55, probabilities: { fin101: 0.1, law200: 0.55, "kids/lia": 0.35 } } } }, G);
  assert.deepEqual(said, { folder: "law200", confidence: 0.55, near: ["law200", "kids/lia"] });
  // a probability for a folder not offered is never a chip
  assert.deepEqual(whereSaid({ answers: { where: { choice: "fin101", confidence: 0.5, probabilities: { fin101: 0.5, elsewhere: 0.4 } } } }, F)?.near, ["fin101"]);
});

test("no key, an error or a slow answer: null, quietly", async () => {
  assert.equal(await askWhere("x", F, { key: null }), null);
  assert.equal(await askWhere("x", F, { key: "k", fetch: (async () => { throw new Error("down"); }) as any }), null);
  const slow = ((_: any, o: any) => new Promise((_r, no) => o.signal.addEventListener("abort", () => no(new Error("aborted"))))) as any;
  assert.equal(await askWhere("x", F, { key: "k", fetch: slow, budget: 50 }), null);
  const ok = (async () => ({ ok: true, json: async () => ({ answers: { where: { choice: "law200", confidence: 0.6 } } }) })) as any;
  assert.deepEqual(await askWhere("x", F, { key: "k", fetch: ok }), { folder: "law200", confidence: 0.6, near: ["law200"] });
});

test("pick 2: the options are the waiting things, and only one of them is an answer", async () => {
  const { firstBody, firstSaid, askFirst } = await import("../src/agent/whereJev.ts");
  const W = [{ id: "cls#0", words: "a draft for the group", age: "2 h", behind: "the group's schema" }, { id: "job#1", words: "a cover letter", age: "1 d", behind: "" }];
  assert.deepEqual(Object.keys(firstBody(W).questions.first.criteria), ["cls#0", "job#1"]);
  assert.deepEqual(firstSaid({ answers: { first: { choice: "job#1", confidence: 0.8 } } }, W), { first: "job#1", confidence: 0.8 });
  assert.equal(firstSaid({ answers: { first: { choice: "x", confidence: 0.9 } } }, W), null);
  assert.equal(await askFirst(W, { key: null }), null);
  assert.equal(await askFirst(W.slice(0, 1), { key: "k" }), null, "one thing: nothing to order");
});

test("pick 6: a folder's form is one of the six, else nothing", async () => {
  const { formBody, formSaid, askForm } = await import("../src/agent/whereJev.ts");
  assert.deepEqual(Object.keys(formBody({ name: "photography", part: "hobbies", things: ["edit the Tokyo set"] }).questions.form.criteria), ["books", "tray", "jar", "bell", "plant", "box"]);
  assert.deepEqual(formSaid({ answers: { form: { choice: "plant", confidence: 0.74 } } }), { form: "plant", confidence: 0.74 });
  assert.equal(formSaid({ answers: { form: { choice: "rocket", confidence: 0.9 } } }), null);
  assert.equal(await askForm({ name: "x", part: "y", things: [] }, { key: null }), null);
});

test("pick 3: Jev is told the title and the talk's shape only, never the text of a prompt or a reply", async () => {
  const { shapeOf, doneBody, doneSaid, askDone } = await import("../src/agent/doneJev.ts");
  const items = [
    { kind: "me", text: "please fix the login SECRET-PROMPT" }, { kind: "tool", text: "x" }, { kind: "tool", text: "y" },
    { kind: "you", text: "Fixed: the login holds now. SECRET-REPLY" }, { kind: "you", text: "sub SECRET-SUB", parent: "t1" },
  ];
  const s = shapeOf(items, 1000, 61000);
  assert.deepEqual(s, { turns: 1, tools: 2, errors: 0, last: "reply", asks: false, quiet_s: 60 });
  assert.equal(shapeOf([{ kind: "me", text: "a" }, { kind: "you", text: "Shall I push it?  " }], undefined, 0).asks, true, "a question is a yes, worked out here");
  assert.equal(shapeOf([{ kind: "me", text: "a" }, { kind: "error", text: "boom" }], undefined, 0).last, "error");
  assert.equal(shapeOf([], undefined, 0).last, "none");
  const body = JSON.stringify(doneBody("fix the login", s));
  for (const secret of ["SECRET", "please fix", "Fixed", "holds now"]) assert.ok(!body.includes(secret), `no text of the talk in the request: ${secret}`);
  assert.ok(body.includes("fix the login"), "the title, as the engine holds it");
  assert.equal(doneSaid({ answers: { finished: { noul: 0.83 } } }), 0.83);
  assert.equal(doneSaid({ answers: {} }), null);
  assert.equal(await askDone("t", s, { key: null }), null);
  assert.equal(await askDone("t", shapeOf([], undefined, 0), { key: "k" }), null, "an empty talk: nothing asked");
  let sent = "";
  const ok = (async (_u: string, init: { body: string }) => { sent = init.body; return { ok: true, json: async () => ({ answers: { finished: { noul: 1.4 } } }) }; }) as any;
  assert.equal(await askDone("t", s, { key: "k", fetch: ok }), 1);
  assert.ok(sent && !sent.includes("SECRET"), "what goes over the wire holds no text of the talk");
});

test("pick 5: where the world opens is one of the places, told titles and names only", async () => {
  const { opensBody, opensSaid, askOpens } = await import("../src/agent/opensJev.ts");
  const places = [{ id: "school", name: "school" }, { id: "jobs", name: "jobs" }, { id: "edge", name: "front edge" }];
  const b = opensBody({ hour: 9.6, waiting: ["a paper"], working: [], places, recent: ["school", "school", "jobs", "school", "jobs", "school"] });
  assert.equal(b.state.hour, "9");
  assert.equal(b.state.recent_at_this_hour, "school; jobs; school; jobs; school", "the last five only");
  assert.deepEqual(Object.keys(b.questions.opens.criteria), ["school", "jobs", "edge"]);
  assert.deepEqual(opensSaid({ answers: { opens: { choice: "jobs", confidence: 0.8 } } }, places), { part: "jobs", confidence: 0.8 });
  assert.equal(opensSaid({ answers: { opens: { choice: "gym", confidence: 0.9 } } }, places), null, "only a place offered");
  assert.equal(await askOpens({ hour: 9, waiting: [], working: [], places, recent: [] }, { key: null }), null);
  assert.equal(await askOpens({ hour: 9, waiting: [], working: [], places: places.slice(0, 1), recent: [] }, { key: "k" }), null, "one place: nothing to pick");
});

test("pick 4: two names, kinds and a count; never asked under three days; the answer is 0..1 or nothing", async () => {
  const { tiedBody, tiedSaid, askTied } = await import("../src/agent/tiedJev.ts");
  const b = tiedBody({ a: { name: "IS223", kind: "folder" }, b: { name: "pathfinder", kind: "project" }, days: 3.7 });
  assert.equal(b.state.days_opened_together, "3");
  assert.equal(b.questions.tied.type, "noul");
  assert.equal(tiedSaid({ answers: { tied: { noul: 0.6 } } }), 0.6);
  assert.equal(tiedSaid({}), null);
  assert.equal(await askTied({ a: { name: "a", kind: "folder" }, b: { name: "b", kind: "folder" }, days: 2 }, { key: "k" }), null, "under three days: not asked");
  assert.equal(await askTied({ a: { name: "a", kind: "folder" }, b: { name: "b", kind: "folder" }, days: 3 }, { key: null }), null);
});

test("agent.finished: only a session the engine lists is asked, as \"a work session\" and its shape, never its words", async () => {
  const { finishedFor } = await import("../src/agent/doneJev.ts");
  const told: unknown[] = [];
  const ask = (async (title: string, s: unknown) => { told.push({ title, s }); return 0.9; }) as any;
  const d = { sessions: async () => [{ id: "s1", updatedAt: 1000 }], items: async () => [{ kind: "me", text: "SECRET prompt" }, { kind: "you", text: "SECRET done." }], ask, now: 11000 };
  assert.equal(await finishedFor("s1", d), 0.9);
  assert.equal((told[0] as any).title, "a work session");
  assert.ok(!JSON.stringify(told).includes("SECRET"), "no words of the talk reach the question");
  assert.equal(await finishedFor("nope", d), null, "a session the engine does not list: nothing asked");
  assert.equal(await finishedFor("s1", { ...d, sessions: async () => { throw new Error("x"); } }), null, "an error: nothing");
  assert.equal(told.length, 1);
});
