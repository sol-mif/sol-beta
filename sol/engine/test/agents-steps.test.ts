// Agents (#1327, the calm pass, 2026-11-17): two steps of one place. Inside one place, a pair of rules Jev's feeds
// question scores in the half band (0.45-0.7) becomes an ask, "One agent for these two steps?", never a join; Keep
// together joins them (undo splits), Keep apart is never asked again (undo asks again). Once agents.json exists Sol
// joins nothing by itself, so the late look asks even a same-band pair. Jev null: the person's own model is asked once
// about the pairs code left alone; each yes is the same ask with no score, and the floor says once that Jev would ask
// fewer. No model either: code's links only. An invented home (a choir), a fake Jev, a fake turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensure, ensureWith, group, list, loadAgents, noted, undo, JEV_NOTE, type Say } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { answerJoin } from "../src/agent/meta/join.ts";
import { feedsPrompt, feedsSaid } from "../src/agent/meta/chains.ts";
import { JEV_HALF, JEV_SAME } from "../src/agent/meta/numbers.ts";
import { parsePolicy } from "../src/agent/store.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { NOW, make, type Spec } from "./agents-fixtures.ts";

const AT = "2026-11-16T00:00:00.000Z";
/** a choir's place: picking the songs, then sending their sheet music (one uses what the other makes, no file named
 *  for code to link), and the hall's hours (its own piece of work) */
const CHOIR: Spec = {
  "choir/policy.md": "# policy\n\n- [watch] clock: Sunday 18:00 pick the songs for the choir's Thursday rehearsal\n- [watch, draft] clock: Monday 09:00 the sheet music for this week's songs to every singer\n- [watch] clock: Friday 08:00 the hall's opening hours into hall.md\n",
  "choir/hall.md": "# hall",
};
const PAIR = ["choir#clock-1", "choir#clock-2"];
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
const songs = (s: string) => /\bsongs\b/.test(s);
/** a fake Jev: the two song steps feed each other at `p`; anything else at 0.1; rules of one job at 0.1 */
const jev = (p = 0.6) => {
  const n = { feeds: 0 };
  const ask: Ask = async (q, a, b) => { if (q === "feeds") { n.feeds++; return songs(a) && songs(b) ? p : 0.1; } return 0.1; };
  return { ask, n };
};
const HALF = 0.6;
/** a fake turn of the person's own model: yes to each numbered pair whose two steps both name the songs */
const turn = () => {
  const said: string[] = [];
  const say: Say = async (prompt) => {
    said.push(prompt);
    const pairs = [...prompt.matchAll(/^(\d+)\. first: (.*)\n\s+second: (.*)$/gm)];
    return pairs.map((m) => `${m[1]}: ${songs(m[2]) && songs(m[3]) ? "yes" : "no"}`).join("\n");
  };
  return { say, said };
};
const keys = (j: { rules: { folder: string; rule: string }[] }) => j.rules.map((r) => `${r.folder}#${r.rule}`);
const routinesIn = (l: { folderRules: { folder: string; rule: string }[] }) => l.folderRules.map((x) => `${x.folder}#${x.rule}`);
const host = (ask: Ask, say?: Say) => new Agents({ home: make(CHOIR), ask, now: () => NOW, ...(say ? { say } : {}) });

test("a half-band pair inside one place: one ask, no join; a same-band pair still joins and asks nothing", async () => {
  assert.ok(HALF >= JEV_HALF && HALF < JEV_SAME);
  const r = await group(foldersOf(CHOIR), AT, jev(HALF).ask);
  assert.equal(r.agents.length, 0, "not joined: no agent");
  assert.equal(r.routines.length, 3, "each step stays a routine");
  assert.equal(r.asks.length, 1, "asked once");
  const [k] = r.asks;
  assert.equal(k.inPlace, true);
  assert.equal(k.p, HALF);
  assert.deepEqual(keys(k), PAIR, "in the policy's order");
  assert.deepEqual(k.places, ["choir", "choir"]);
  assert.equal(k.names[0], k.names[1], "one place, said once on both sides");
  const same = await group(foldersOf(CHOIR), AT, jev(0.8).ask);
  assert.deepEqual([same.agents.length, same.routines.length, same.asks.length], [1, 1, 0], "the same band joins as before");
  const under = await group(foldersOf(CHOIR), AT, jev(0.3).ask);
  assert.deepEqual([under.agents.length, under.asks.length], [0, 0], "under the band: nothing asked");
});

test("Keep together: one agent doing both steps, a change line; undo splits it and asks again", async () => {
  const { ask } = jev();
  const a = host(ask);
  await ensureWith(a, ask);
  const l = list(a);
  assert.equal(l.joins.length, 1);
  const j = l.joins[0];
  assert.equal(j.inPlace, true);
  assert.deepEqual(j.agents.map((x: any) => x.id), ["", ""], "two routines: no agent yet");
  assert.ok(j.agents.every((x: any) => x.name && x.name !== j.names[0]), "a routine side is said by what it makes, not by its place");
  const r = answerJoin(a, j.id, "together") as any;
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "merged");
  assert.match(r.change.line, /is one agent now, doing both steps in /);
  const after = list(a);
  assert.equal(after.agents.length, 1);
  assert.deepEqual(after.agents[0].rules.map((x: any) => `${x.folder}#${x.rule}`), PAIR);
  assert.deepEqual(routinesIn(after), ["choir#clock-3"], "the hall's hours stay a routine");
  assert.equal(after.joins.length, 0);
  assert.equal(undo(a, r.change.id).ok, true);
  const back = list(a);
  assert.deepEqual(back.agents, []);
  assert.deepEqual(routinesIn(back), [...PAIR, "choir#clock-3"]);
  assert.equal(back.joins.length, 1, "asked again");
});

test("Keep apart: never asked again, even when the place's rules change; undo asks again", async () => {
  const { ask } = jev();
  const a = host(ask);
  await ensureWith(a, ask);
  const r = answerJoin(a, list(a).joins[0].id, "apart") as any;
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "apart");
  assert.match(r.change.line, /stay apart; Sol won't ask about them again\.$/);
  assert.equal(list(a).joins.length, 0);
  // a new rule in the place: the late look asks Jev again, and the pair kept apart is not among its asks
  writeFileSync(join(a.d.home, "choir/policy.md"), `${CHOIR["choir/policy.md"]}- [watch] clock: Saturday 10:00 the attendance list into who.md\n`);
  const again = jev();
  await ensureWith(a, again.ask);
  assert.ok(again.n.feeds > 0, "a new rule set: looked again");
  assert.deepEqual(list(a).joins, [], "kept apart: never asked again");
  assert.equal(undo(a, r.change.id).ok, true);
  assert.equal(list(a).joins.length, 1, "undone: asked again");
});

test("the late look (agents.json written first, no Jev): a same-band pair of steps is asked, never joined", async () => {
  const a = host(async () => null);
  ensure(a);   // the keeper's tick: grouped by code
  const before = loadAgents(a.d.home)!;
  assert.deepEqual([before.agents.length, before.routines!.length], [0, 3]);
  const { ask } = jev(0.8);
  await ensureWith(a, ask);
  const l = list(a);
  assert.equal(l.agents.length, 0, "Sol joins nothing by itself once agents.json exists");
  assert.equal(l.joins.length, 1);
  assert.equal(l.joins[0].inPlace, true);
  assert.deepEqual(keys(loadAgents(a.d.home)!.joins[0]), PAIR);
});

test("Jev null with the person's own model: one turn about the place's pairs; its yes is an ask with no score", async () => {
  const { say, said } = turn();
  const a = host(async () => null, say);
  await ensureWith(a, async () => null);
  assert.equal(said.length, 1, "one turn, all pairs in it");
  assert.ok(!/choir/i.test(said[0]), "the place is masked in what the model reads");
  const l = list(a);
  assert.equal(l.agents.length, 0, "a yes is never a join");
  assert.equal(l.joins.length, 1);
  assert.equal(l.joins[0].p, null, "no score");
  assert.equal(l.joins[0].inPlace, true);
  assert.deepEqual(keys(loadAgents(a.d.home)!.joins[0]), PAIR);
  // the floor's one line about Jev, said once
  assert.equal(l.jevNote, JEV_NOTE);
  assert.deepEqual(noted(a), { ok: true });
  assert.equal(list(a).jevNote, undefined, "seen: gone for good");
  assert.ok(loadAgents(a.d.home)!.jevNote?.seen);
});

test("the late look without Jev, with the person's own model: one turn per rule set, its yes an ask; Jev later still looks", async () => {
  const { say, said } = turn();
  const a = host(async () => null, say);
  ensure(a);   // the keeper's tick: agents.json first, grouped by code
  assert.equal(said.length, 0, "the code grouping has no turn");
  await ensureWith(a, async () => null);
  assert.equal(said.length, 1, "the late look asks the person's own model once");
  assert.ok(!/choir/i.test(said[0]), "the place is masked");
  const l = list(a);
  assert.equal(l.agents.length, 0, "a yes is never a join");
  assert.equal(l.joins.length, 1);
  assert.equal(l.joins[0].p, null, "no score");
  assert.equal(l.joins[0].inPlace, true);
  assert.deepEqual(keys(loadAgents(a.d.home)!.joins[0]), PAIR);
  assert.equal(l.jevNote, JEV_NOTE, "the floor says once that Jev would ask fewer");
  assert.equal(loadAgents(a.d.home)!.looked, undefined, "without Jev nothing is recorded as looked");
  await ensureWith(a, async () => null);
  assert.equal(said.length, 1, "the same rule set: no second turn");
  // Jev comes: it looks, and the pair already asked is not asked twice
  const { ask, n } = jev(HALF);
  await ensureWith(a, ask);
  assert.ok(n.feeds > 0, "Jev looked");
  assert.equal(list(a).joins.length, 1, "asked once");
  assert.equal(loadAgents(a.d.home)!.looked !== undefined, true);
  // a new rule in the place: one more turn
  writeFileSync(join(a.d.home, "choir/policy.md"), `${CHOIR["choir/policy.md"]}- [watch] clock: Saturday 10:00 the attendance list into who.md\n`);
  await ensureWith(a, async () => null);
  assert.equal(said.length, 2, "a new rule set: asked again");
});

test("Jev null and no model (offline, a test): code's links only, nothing asked, no line about Jev", async () => {
  const a = host(async () => null);
  await ensureWith(a, async () => null);
  const l = list(a);
  assert.deepEqual([l.agents.length, l.joins.length], [0, 0]);
  assert.equal(l.jevNote, undefined);
  // a model that cannot answer is the same
  const quiet = host(async () => null, async () => null);
  await ensureWith(quiet, async () => null);
  assert.deepEqual(list(quiet).joins, []);
});

test("the turn's prompt and its answer (pure): numbered pairs in, the yes lines out", () => {
  const step = (rule: string, sentence: string) => ({ place: "choir", folder: "choir", rule, sentence, source: "clock", names: ["choir"] });
  const p = feedsPrompt([[step("clock-1", "Sunday 18:00 pick the songs for the choir's rehearsal"), step("clock-2", "Monday 09:00 the sheet music for this week's songs")]]);
  assert.match(p, /^1\. first: clock: .*songs/m);
  assert.match(p, /^\s+second: clock: .*songs/m);
  assert.ok(!/choir/i.test(p), "the place's name is masked");
  assert.deepEqual(feedsSaid("1: yes\n2: no\n3: YES", 3), [0, 2]);
  assert.deepEqual(feedsSaid("4: yes\nmaybe", 3), [], "out of range or unreadable is no yes");
  assert.deepEqual(feedsSaid(null, 2), []);
});
