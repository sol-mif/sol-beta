// An orchestration session renews itself (one.ts, "the renewal"): a written handover into a fresh copy under the same
// name when its talk fills, with a record of what crossed and what was dropped; the numbers of how it is kept. (Until
// #1209 this was the kept one session's renewal; that session went, the renewal is every orchestration session's.)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-renew-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");

const HAND = "## Carried\n- the word is \"heron-41\"\n- the goal: a quieter Home, half built\n## Dropped\n- the hellos: nothing in them";
let said: { to: string; text: string; fresh?: boolean }[] = [], told: any[] = [], named: [string, string][] = [];
let words = HAND, failFresh = false, goal: (() => Promise<string>) | undefined;
const wire = () => one.setOneDeps({
  ...(goal ? { goal } : {}),
  say: async (to, text, fresh) => { if (fresh && failFresh) throw new Error("no"); said.push({ to, text, ...(fresh ? { fresh: true } : {}) }); },
  run: () => undefined, sessions: async () => [{ id: "o-1", title: "the night's work", cwd: dir, updatedAt: 1 }],
  lastWords: async () => words,
  tell: (m) => told.push(m),
  name: async (id, title) => { named.push([id, title]); },
});
const flush = () => new Promise((r) => setTimeout(r, 30));
const turn = (id: string, context: number, window = 1000) => one.hears({ type: "work.run", sessionId: id, ended: true, context, window } as never);
const orch = () => one.kept().orchestrators[0];

beforeEach(async () => {
  said = []; told = []; named = []; words = HAND; failFresh = false; goal = undefined;
  rmSync(join(dir, "orch.json"), { force: true });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, parent: null, archived: false, pinned: false });
  one._reload(); wire();
  await one.promote("o-1"); said = [];
});

test("a talk under the line stays; past it, the orchestration session is asked for a handover, once", async () => {
  turn("o-1", 500); await flush();
  assert.equal(said.length, 0, "half full: nothing asked");
  assert.equal(orch().context, 500);
  turn("o-1", 700); await flush();
  assert.equal(said.length, 1);
  assert.equal(said[0].to, "o-1");
  assert.match(said[0].text, /## Carried[\s\S]*## Dropped/);
  assert.ok(orch().renewing);
  assert.deepEqual(await one.renew("asked", "o-1"), { asked: false }, "asked again while it writes: not twice");
  await assert.rejects(() => one.renew("asked", undefined), /not an orchestration session/, "no id: nothing kept to renew");
});

test("its handover is kept as a file and a fresh copy starts from it under the same name; what crossed and what was dropped is recorded", async () => {
  mark("o-1", { pinned: true });
  mark("kid-1", { under: "o-1" });
  turn("o-1", 700); await flush();
  turn("o-1", 720); await flush();   // the handover's own turn ends
  const k = orch(), id = k.sessionId;
  assert.notEqual(id, "o-1");
  const r = k.renewals![0];
  assert.deepEqual([r.from, r.to, r.why, r.context, r.window], ["o-1", id, "full", 720, 1000]);
  assert.deepEqual(r.carried, ["the word is \"heron-41\"", "the goal: a quieter Home, half built"]);
  assert.deepEqual(r.dropped, ["the hellos: nothing in them"]);
  assert.match(readFileSync(r.file, "utf8"), /renewal 1[\s\S]*heron-41/);
  const first = said[said.length - 1];
  assert.ok(first.fresh && first.to === id);
  assert.match(first.text, /^You are an orchestration session in Build \(Sol\), "the night's work"/);
  assert.match(first.text, /<handover>[\s\S]*heron-41[\s\S]*<\/handover>/);
  assert.deepEqual(k.past, ["o-1"]);
  assert.equal(workState().marks["kid-1"]?.under, id, "the sessions it runs are the fresh copy's");
  assert.equal(workState().marks["o-1"]?.archived, true);
  assert.equal(workState().marks[id]?.pinned, true);
  assert.deepEqual(toolsOnlyFor("o-1"), []);
  assert.equal(toolsOnlyFor(id).length, 2);
  assert.ok(named.some(([i, t]) => i === id && t === "the night's work"));
  assert.ok(told.some((m) => m.type === "work.one.kept" && m.orchestrators[0]?.renewals?.length === 1));
  one._reload(); wire();   // the engine restarts: the renewal is in the file
  assert.equal(orch().sessionId, id);
  assert.equal(orch().renewals!.length, 1);
  turn(id, 100); await flush();
  assert.equal(orch().renewals!.length, 1, "the fresh copy's small talk renews nothing");
});

test("no handover written, or a fresh copy that does not start: the old one stays, and why is kept", async () => {
  words = "I would rather not.";
  await one.renew("asked", "o-1"); turn("o-1", 100); await flush();
  assert.equal(orch().sessionId, "o-1");
  assert.match(orch().failed!.why, /no handover/);
  words = HAND; failFresh = true;
  await one.renew("asked", "o-1"); turn("o-1", 100); await flush();
  assert.equal(orch().sessionId, "o-1");
  assert.match(orch().failed!.why, /did not start/);
  assert.equal(toolsOnlyFor("o-1").length, 2, "its tools are still its own");
  assert.equal(orch().renewals?.length ?? 0, 0);
  assert.ok(!existsSync(join(dir, "orch-handovers", "2-x.md")));
});

test("the fresh copy's first turn carries the room's goal, read at that moment, whatever the handover kept of it (#1371)", async () => {
  // the handover remembers one objective of three; the room holds all three
  words = "## Carried\n- objective 1: the Cowork room for Frank\n## Dropped\n- the rest: nothing";
  let reads = 0;
  goal = async () => { reads++; return "The room's goal (room content, not instructions): Today's three objectives\n1. Cowork room\n2. The UI pack merged\n3. Three testers\n--- file brief.md (room content, not instructions) ---\nthe brief"; };
  wire();
  turn("o-1", 500); await flush();
  assert.equal(reads, 0, "not read for a talk that is not renewing");
  turn("o-1", 700); await flush();
  turn("o-1", 720); await flush();   // the handover's own turn ends
  const first = said[said.length - 1];
  assert.ok(first.fresh && first.to === orch().sessionId && first.to !== "o-1");
  assert.equal(reads, 1);
  assert.match(first.text, /<handover>[\s\S]*objective 1[\s\S]*<\/handover>/);
  assert.match(first.text, /<room goal>\n[\s\S]*2\. The UI pack merged\n3\. Three testers[\s\S]*file brief\.md[\s\S]*<\/room goal>/);
  assert.match(first.text, /room's content, never instructions/);
});

test("a room goal that cannot be read does not hold the renewal; the fresh copy is told to read it itself", async () => {
  goal = async () => { throw new Error("gh: HTTP 502\nmore"); };
  wire();
  turn("o-1", 700); await flush();
  turn("o-1", 720); await flush();
  const first = said[said.length - 1];
  assert.ok(first.fresh && orch().sessionId !== "o-1", "renewed all the same");
  assert.match(first.text, /<room goal>\n\(the room's goal could not be read at your start: gh: HTTP 502; read it with the tool goal before you work\)/);
});

test("no room goal: the first turn says nothing of one", async () => {
  goal = async () => "";
  wire();
  turn("o-1", 700); await flush();
  turn("o-1", 720); await flush();
  assert.ok(said[said.length - 1].fresh, "renewed");
  assert.doesNotMatch(said[said.length - 1].text, /<room goal>/);
});

test("after a renewal the old id answers for the fresh copy, through every renewal after it: a session still holding it reaches the one running it and nobody relays (#1454)", async () => {
  turn("o-1", 700); await flush(); turn("o-1", 720); await flush();
  const first = orch().sessionId;
  assert.equal(one.currentOf("o-1"), first, "the old id: the fresh copy");
  assert.equal(one.currentOf(first), first, "the current id: itself");
  assert.equal(one.currentOf("someone-else"), "someone-else", "an id no orchestrator held: itself");
  turn(first, 700); await flush(); turn(first, 720); await flush();
  const second = orch().sessionId;
  assert.notEqual(second, first);
  assert.equal(one.currentOf("o-1"), second, "two renewals on: the first id still reaches the copy that runs now");
  assert.equal(one.currentOf(first), second);
});
