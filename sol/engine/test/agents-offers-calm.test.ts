// Agents (#1429): Agents open with nothing changing is quiet. The loop it broke: agents.offers ran the late look, whose
// end told every face (agents.changed); the face read the list, and each new list read agents.offers again, about 40
// round trips a second. Here a face as the real one is (AgentsView: the list on agents.changed, the offers when the
// list's offersKey changes) and the old face (the offers on every list) stay open ten seconds over an invented home:
// a few messages at the start, then none. Invented homes, a fake Jev and a fake turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensure, listNow, loadAgents, lookInFlight, onAgentsChanged, saveAgents } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { offers } from "../src/agent/meta/offer.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { NOW, NURSE, make } from "./agents-fixtures.ts";

const OPEN_MS = 10_000;
const CAP = 50;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROTA = { name: "Rota", job: "puts each new rota for <place> into your calendar", steps: ["a new rota", "read it", "your shifts into the calendar"], parameter: "the ward", kind: "ward" };
const jev: Ask = async (q) => { await wait(5); return q === "rule" ? 0.2 : 0.9; };

/** the home as a person has it: agents.json written by the keeper, so the first list starts the late look */
const open = () => {
  const home = make(NURSE);
  const a = new Agents({ home, now: () => NOW, ask: jev, say: async () => `ok\n${JSON.stringify(ROTA)}` });
  ensure(a);
  return { home, a };
};

/** a face: one list at a time (a push during a read reads once more after it, useAgents.ts), every message counted
 *  with the time it went. `everyList`: the old face, the offers read again on every list */
function face(a: Agents, everyList: boolean) {
  const sent: { type: string; at: number }[] = [];
  let busy = false, again = false, stamp: string | null = null;
  const t0 = Date.now();
  const read = async () => {
    if (sent.length >= CAP) return;   // a loop stops here, so the test fails rather than spinning the clock away
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        sent.push({ type: "agents.list", at: Date.now() - t0 });
        const l = await listNow(a, jev);
        if (everyList || l.offersKey !== stamp) {
          stamp = l.offersKey;
          sent.push({ type: "agents.offers", at: Date.now() - t0 });
          await offers(a);
        }
      } while (again && sent.length < CAP);
    } finally { busy = false; }
  };
  return { sent, read };
}

for (const everyList of [false, true]) {
  test(`Agents open ten seconds with nothing changing: a few messages, then none (${everyList ? "the offers on every list" : "the offers when offersKey changes"})`, { timeout: OPEN_MS + 5_000 }, async () => {
    const { home, a } = open();
    const f = face(a, everyList);
    onAgentsChanged(() => void f.read());
    try {
      await f.read();
      await wait(OPEN_MS);
      assert.equal(lookInFlight(a), null, "the late look ended");
      assert.equal(loadAgents(home)!.offers.length, 1, "the offer was written: a real change, told once");
      assert.ok(f.sent.length <= 8, `a small fixed number, not a loop: ${f.sent.length} messages (${f.sent.map((s) => s.type).join(", ")})`);
      const late = f.sent.filter((s) => s.at > 2_000);
      assert.deepEqual(late, [], "nothing after the first two seconds");
    } finally { onAgentsChanged(() => {}); }
  });
}

test("a save of what is stored already tells no face", () => {
  const { home } = open();
  let pushed = 0;
  onAgentsChanged(() => { pushed++; });
  try {
    const f = loadAgents(home)!;
    saveAgents(home, f);   // as read (the first save after a load may write it in today's shape once)
    const n = pushed;
    saveAgents(home, loadAgents(home)!);
    assert.equal(pushed, n, "the same file again: nothing told");
    f.never.push({ words: "x", sources: [], kind: null });
    saveAgents(home, f);
    assert.equal(pushed, n + 1, "a real change: told once");
  } finally { onAgentsChanged(() => {}); }
});

test("a read of the offers never starts the late look", async () => {
  const { a } = open();
  let pushed = 0;
  onAgentsChanged(() => { pushed++; });
  try {
    await offers(a);
    assert.equal(lookInFlight(a), null, "no look started by agents.offers");
    const n = pushed;
    await offers(a);
    await offers(a);
    assert.equal(pushed, n, "the offers read again with nothing new: nothing told");
  } finally { onAgentsChanged(() => {}); }
});
