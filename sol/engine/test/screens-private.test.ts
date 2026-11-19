// What the person types to the agent is a prompt and stays on this machine (#1090, the orchestrator's rule, 13 Nov):
// a spy on every request to Jev from the screens part; none holds a word of the message. Say where decides here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Parts } from "../src/parts.ts";
import part from "../src/parts/screens.ts";
import { sayHere, sayWindows } from "../src/screensSayPlan.ts";

process.env.JEV_API_KEY = "test-key-not-real";
const bodies: string[] = [];
globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => { bodies.push(String(init?.body ?? "")); return new Response("{}", { status: 200 }); }) as typeof fetch;

function engine() {
  const p = new Parts();
  const sent: { to: string; m: any }[] = [];
  const faces: { name: string; ws: any }[] = [];
  const e = { HOME: mkdtempSync(join(tmpdir(), "sol-screens-priv-")), PORT: 0, send: (ws: any, m: object) => sent.push({ to: ws.name, m }), everyone: (m: object) => faces.forEach((f) => sent.push({ to: f.name, m })) };
  const face = (name: string) => { const ws = Object.assign(new EventEmitter(), { name, readyState: 1, send: () => {} }); faces.push({ name, ws }); return ws; };
  const say = (ws: any, m: any) => p.heard(m.type)!(m, { ...e, ws, face: { send: () => {} }, conn: { chars: 0 }, fromSol: true, fromApp: true });
  return { p, e, sent, face, say };
}

test("no word the person typed reaches Jev: arrange, where, kept; say where moves the named block here, told to the asker", async () => {
  const { p, e, sent, face, say } = engine();
  (p as any).file = "parts/screens.ts"; await part(p); (p as any).file = "";
  await (p as any).starts[0].fn(e);
  const A = face("A"), B = face("B");
  await say(A, { type: "screens.hello", win: "main", role: "whole", screen: { x: 0, y: 0, w: 1512, h: 982 } });
  await say(B, { type: "screens.hello", win: "two", role: "wall", screen: { x: 1512, y: 0, w: 2560, h: 1440 } });
  const SECRET = "zebracrimson quarterly figures";
  const open = [{ id: "p1", title: "the plan" }, { id: "d1", title: "changes · 2 files" }];
  await say(A, { type: "screens.arrange", ask: `${SECRET} please review`, here: ["the plan"], there: [], open });
  await say(A, { type: "screens.where", block: "d1", title: "changes", kind: "diff", ask: SECRET, here: [], there: [] });
  await say(A, { type: "screens.keep", project: "/p", blocks: ["d1"], session: "s1", kinds: { d1: "diff" } });
  await say(A, { type: "screens.keptAsk", project: "/p", session: "s2", blocks: [{ title: "x", kind: "diff" }], ask: SECRET });
  assert.ok(bodies.length >= 2, `Jev was asked (${bodies.length})`);
  for (const b of bodies) for (const w of ["zebracrimson", "quarterly", "figures", "please review"]) assert.ok(!b.includes(w), `a body holds "${w}"`);
  // said here: the plan to the big one moves, the asker is told (its ⌘Z), nothing goes to Jev for it
  const before = bodies.length;
  await say(A, { type: "screens.arrange", ask: "the plan to the big one", here: [], there: [], open });
  assert.equal(bodies.length, before);
  assert.equal([...sent].reverse().find((s) => s.m.type === "screens.state")?.m.where.p1, "two");
  assert.ok(sent.some((s) => s.to === "A" && s.m.type === "screens.said" && s.m.block === "p1"));
});

test("say where, read here: a block named by its title and a screen by how a person calls it; else nothing; never all", () => {
  const wins = sayWindows([{ win: "main", here: true, bigger: false }, { win: "two", here: false, bigger: true }]);
  const blocks = [{ id: "p1", title: "the plan" }, { id: "d1", title: "changes · 2 files" }, { id: "n1", title: "review notes" }];
  const to = (s: string, where: Record<string, string> = {}) => { const m = sayHere(s, blocks, wins, where); return m.kind === "put" ? `${m.block}>${m.to}` : "none"; };
  assert.equal(to("the plan to the big one"), "p1>two");
  assert.equal(to("put the review notes on the monitor"), "n1>two");
  assert.equal(to("changes over there"), "d1>two");
  assert.equal(to("bring the plan back here", { p1: "two" }), "p1>main");
  assert.equal(to("rename the helper"), "none");
  assert.equal(to("what does the plan say"), "none");
  assert.equal(to("bring it all back here"), "none");
  assert.equal(to("the plan to the big one", { p1: "two" }), "none");
  assert.equal(to("please look at the plan on the monitor and then tell me what you think of it"), "none");
});
