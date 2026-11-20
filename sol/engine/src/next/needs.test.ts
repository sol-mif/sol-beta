// next/needs.ts (#1604 slice 7): one ranked list over Home's Today, the sessions' permissions, the stage's asks and
// the agents' drafts, ranked as the face ranks (sol/mac/src/next/needs/rank.ts TIER, cv/wire/needs.ts), read only.
// The panel's people only.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryLog } from "../home/log.js";
import { makeCtx, startHome } from "../home/wire.js";
import { newThing, type Thing } from "../home/items.js";
import { gather, rankNeeds, TIER, type NeedsIn } from "./needs.js";
import part, { useHome, useReaders } from "../parts/next-calls.js";

const NOW = Date.UTC(2026, 10, 19, 9, 0);
const dirs: string[] = [];
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
beforeEach(() => { process.env.SOL_UI_NEXT = "on"; });

const thing = (id: string, words: string, o: Partial<Thing> = {}): Thing =>
  ({ id, read: "you", folder: "Jayden's school", words, state: "asks", waitsOn: "you", at: NOW - 1000, links: [], made: [], ...o });

test("the face's tiers, the same numbers", () => {
  assert.deepEqual(TIER, { serious: 1, money: 2, holds: 3, due: 4, other: 6 });
});

test("ranked as the face ranks: a permission holds (3), a dated Thing is due (4), any other is other (6); each source's order kept inside a tier", () => {
  const i: NeedsIn = {
    things: [
      { id: "a", read: "you", folder: "Denise", words: "Sign the trip form", state: "asks", waitsOn: "you" },
      { id: "b", read: "job", folder: "Min-ji", words: "Pay the rent by Friday", state: "asks", waitsOn: "you", due: NOW + 864e5, card: { title: "Rent", answers: ["Pay it", "Later"] } },
      { id: "c", read: "you", folder: "", words: "Reply to Sam", state: "asks", waitsOn: "you" },
    ],
    perms: [{ sessionId: "dev-1", item: { id: "p1", tool: "Bash", input: { command: "npm test" } } }],
    stage: [{ project: "tomas", id: "b1", title: "the logo", q: "Keep the blue one?", choices: ["yes", "no"] }],
    drafts: [{ folder: "denise", sticky: "Ask the landlord", line: "did: draft: a letter to the landlord, letter.md" }],
  };
  const got = rankNeeds(i);
  assert.deepEqual(got.map((n) => [n.id, n.rank]), [
    ["p:dev-1:p1", 3], ["t:b", 4], ["t:a", 6], ["t:c", 6.01], ["s:tomas/b1", 6.02], ["d:denise:Ask the landlord", 6.03],
  ]);
  const p = got[0];
  assert.deepEqual({ words: p.words, kind: p.kind, yes: p.yes, serious: p.serious, due: p.due }, { words: "allow run npm test?", kind: "code", yes: "Allow", serious: false, due: null });
  assert.equal(got[1].yes, "Pay it");
  assert.equal(got[1].due, NOW + 864e5);
  assert.equal(got[3].piece, "home", "a Thing in no folder is Home's");
  for (const n of got) for (const k of ["id", "piece", "words", "kind", "serious", "due", "rank", "why"]) assert.ok(k in n, `${n.id} has ${k}`);
});

test("a stage block Home already has as a Thing is one ask, not two; a serious stage ask ranks first", () => {
  const got = rankNeeds({
    things: [{ id: "it-1", read: "job", folder: "tomas", words: "Keep the blue one?", state: "asks", waitsOn: "you", links: ["block:tomas/b1"] }],
    perms: [], drafts: [],
    stage: [{ project: "tomas", id: "b1", title: "the logo", q: "Keep the blue one?", choices: ["yes", "no"] }, { project: "dev", id: "b2", title: "prod", q: "Run the migration on prod?", choices: ["yes", "no"], serious: true }],
  });
  assert.deepEqual(got.map((n) => n.id), ["s:dev/b2", "t:it-1"]);
  assert.equal(got[0].rank, 1);
});

test("Today is read as Home orders it, and nothing is written", () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-next-needs-"));
  dirs.push(dir);
  const ctx = makeCtx({ home: dir, log: memoryLog(() => NOW), now: () => NOW, all: () => {} });
  startHome(ctx);
  newThing(ctx, thing("it-000000000001", "Sign Jayden's trip form"));
  newThing(ctx, thing("it-000000000002", "Book Denise's dentist", { due: NOW + 3600_000 }));
  const n = ctx.log.all().length;
  const got = gather({ home: () => ctx });
  assert.deepEqual(got.things.map((t) => t.id), ["it-000000000002", "it-000000000001"], "the dated one first: Today's own order");
  assert.equal(ctx.log.all().length, n, "read only");
  assert.deepEqual(rankNeeds(got).map((x) => x.rank), [4, 6]);
});

test("the part answers next.needs with the list; a reader that throws leaves its source out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-next-needs-"));
  dirs.push(dir);
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const unuse = useHome(() => null), unread = useReaders({ perms: () => { throw new Error("no runs"); }, drafts: () => [{ folder: "sam", sticky: "Groceries", line: "did: ask: order the groceries, list.md" }] });
  try {
    const got: any[] = [];
    await on.get("next.needs")!({ type: "next.needs", rid: 7 }, { HOME: dir, fromSol: true, face: { send: (m: object) => got.push(m) } });
    assert.equal(got.length, 1);
    assert.equal(got[0].type, "next.needs");
    assert.equal(got[0].rid, 7);
    assert.deepEqual(got[0].needs.map((n: any) => [n.id, n.yes, n.rank]), [["d:sam:Groceries", "Do it", 6]]);
    assert.deepEqual(readdirSync(dir), [], "nothing written");
    const other: any[] = [];
    await on.get("next.needs")!({ type: "next.needs" }, { HOME: dir, fromSol: false, face: { send: (m: object) => other.push(m) } });
    assert.deepEqual(other, [{ type: "next.needs", ok: false, why: "only Sol's own windows" }]);
  } finally { unuse(); unread(); }
});
