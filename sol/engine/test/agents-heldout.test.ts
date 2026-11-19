// Agents (#1327, pass 2): the three general flaws the held-out test found, over invented homes. Each test failed on the
// code before the fix (jobs.ts and kinds.ts at db82c6ad) and passes after.
//   1 kinds    a sibling that does more than the others (more sources, more files) is still one of them; a sibling of
//              another shape under the same parent stays out; Jev sees what a place holds, never its name
//   2 rules    two rules of one job, one terse and one with extra outputs, are one job when Jev answers by the core;
//              the extras stay the richer place's own lines
//   3 clocks   Jev null: two clock rules that read and make different things are different jobs
import { test } from "node:test";
import assert from "node:assert/strict";
import { placesOf } from "../src/agent/meta/places.ts";
import { jaccard, kindsOf, shapeScore, shapeWords } from "../src/agent/meta/kinds.ts";
import { SHAPE_MIN } from "../src/agent/meta/numbers.ts";
import { noJev, type Ask, type Question } from "../src/agent/meta/jev.ts";
import { group, groupByCode } from "../src/agent/agents.ts";
import { sentenceFor } from "../src/agent/meta/render.ts";
import { parsePolicy } from "../src/agent/store.ts";
import { CLUB_NEWS, TWO_CLOCKS, WARDS, make, type Spec } from "./agents-fixtures.ts";

const AT = "2026-11-16T00:00:00.000Z";
const ids = (k: { members: { place: string; ask?: true }[] }) => k.members.map((m) => `${m.place}${m.ask ? "?" : ""}`).sort();
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));

test("held-out 1: the ward that does more still joins the ward kind; the group project under the same parent stays out", async () => {
  const places = placesOf(make(WARDS)).places, by = (id: string) => places.find((p) => p.id === id)!;
  const west = by("wards/west"), north = by("wards/north"), project = by("wards/union-project");
  // the flaw: Jaccard over the union punished the richer ward for its extra sources and files
  const jacc = (["files", "sources", "verbs"] as const).reduce((s, k) => s + jaccard(west[k], north[k]), 0) / 3;
  assert.ok(jacc < SHAPE_MIN, `Jaccard dropped it (${jacc.toFixed(2)})`);
  assert.ok(shapeScore(west, north) >= SHAPE_MIN, "the overlap keeps it");
  assert.ok(shapeScore(project, north) < SHAPE_MIN, "another shape stays out");
  const wards = ["wards/east", "wards/north", "wards/south", "wards/west"];
  assert.deepEqual((await kindsOf(places, noJev)).map(ids), [wards], "Jev null: the shape alone");
  // Jev answers by what each place holds and its rules: it must be shown them, and never the place's name
  const seen: string[] = [];
  const jev: Ask = async (q, a, b) => { assert.equal(q, "kind"); seen.push(a, b); return [a, b].every((s) => /handover\//.test(s) && /open tasks into tasks\.md/.test(s)) ? 0.9 : 0.2; };
  assert.deepEqual((await kindsOf(places, jev)).map(ids), [wards]);
  assert.ok(seen.length >= 6);
  assert.ok(seen.every((s) => !/north|east|south|west|union/i.test(s)), "Jev never sees a place's name");
  assert.match(shapeWords(west), /holds: .*audits\/.*handover\//);
  assert.match(shapeWords(west), /linked sources: folder, mail, teams/);
});

test("held-out 1: a place's own name is masked out of what it holds and its rules", () => {
  const w = shapeWords({ id: "clients/kite", name: "Kite", files: [".md"], sources: [], verbs: [], entries: ["kite-brief.md", "made/"], rules: ["Fri 16:00 the hours into an update for Kite"] });
  assert.ok(!/kite/i.test(w), w);
  assert.match(w, /<place>-brief\.md, made\//);
});

test("held-out 2: one job written tersely in one place and with extras in another is one agent, the extras that place's lines", async () => {
  const asked: Question[] = [];
  // a fake Jev: the strict question (same input, same thing made, same steps) says no; asked about the core, yes
  const core = (s: string) => s.split(";")[0].replace(/<time>|\d\d:\d\d/g, "").replace(/\s+/g, " ").trim();
  const jev: Ask = async (q, a, b) => { asked.push(q); return q === "rule" ? (core(a) === core(b) ? 0.9 : 0.2) : 0.3; };
  const r = await group(foldersOf(CLUB_NEWS), AT, jev);
  assert.ok(asked.length && asked.every((q) => q === "rule"), "rules are asked the rule question");
  assert.equal(r.agents.length, 1);
  const [ag] = r.agents;
  assert.deepEqual(ag.rules.map((x) => x.folder), ["clubs/chess", "clubs/swim"]);
  assert.equal(ag.template, "every night 21:00 read the club's page and put what changed into news.md", "the core is the terse rule");
  assert.deepEqual(ag.learned!.map((l) => [l.place, l.line]), [["clubs/swim", "list the new gala dates in dates.md"], ["clubs/swim", "draft a note to the coach"]]);
  // the swim rule says its extras already: written back, nothing is said twice; the chess rule gets none of them
  const swim = ag.places!.find((p) => p.place === "clubs/swim")!, chess = ag.places!.find((p) => p.place === "clubs/chess")!;
  assert.equal(sentenceFor(ag, swim).sentence, swim.base);
  assert.equal(sentenceFor(ag, chess).sentence, chess.base);
  // its core rewritten (a kept change), the extras come back as that place's lines
  assert.match(sentenceFor(ag, { ...swim, base: "every night read the club's page into news.md" }).sentence, /Always: list the new gala dates in dates\.md\. Always: draft a note to the coach\.$/);
});

test("held-out 3: Jev null, two clock rules that read and make different things stay two jobs", async () => {
  // two jobs of one rule each in one place each: two routines (rule 3), never one agent
  const two = (r: { agents: unknown[]; routines: unknown[] }) => [r.agents.length, r.routines.length];
  assert.deepEqual(two(groupByCode(foldersOf(TWO_CLOCKS), AT)), [0, 2]);
  assert.deepEqual(two(await group(foldersOf(TWO_CLOCKS), AT, noJev)), [0, 2]);
  // the clock alone never makes a job: two rules that say only when (nothing read, nothing made) stay apart too
  const bare: Spec = { "a/policy.md": "- [watch] clock: 05:30 the orders\n", "b/policy.md": "- [watch] clock: 06:00 the post\n" };
  assert.deepEqual(two(groupByCode(foldersOf(bare), AT)), [0, 2]);
});
