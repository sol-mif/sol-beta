// The team strip (#1167, src/team/strip.ts) and the drift word's detail (src/team/drift.ts saidPeople, driftWordOf):
// who is ✓ on the iteration, which release the rest run and how far behind, each person's drift from the word or the
// drift file, the clock lines, and a word that never outgrows the hub's 4 KB. Pure: nothing here needs a repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-strip-")), "work.json");
const { stripOf, behindOf } = await import("../src/team/strip.ts");
const { saidPeople, driftWordOf } = await import("../src/team/drift.ts");
const { MSG_MAX } = await import("../src/hub/relay-hub.ts");

const NOW = Date.parse("2026-11-14T18:00:00Z");
const tags = ["dev-20261112-0900", "dev-20261113-0900", "dev-20261114-0153", "dev-20261114-0900"].map((name, i) => ({ name, sha: String(i).repeat(40), at: NOW - (4 - i) * 3600_000 }));
const iteration = { name: "dev-20261114-0900", sha: "3".repeat(40), at: NOW - 3600_000 };
const people = [
  { login: "franktsai2008-eng", name: "Frank", prefix: "frank" },
  { login: "w0ngtap", name: "Isaac", prefix: "isaac" },
  { login: "marcocyl04-ux", name: "Marco", prefix: "marco" },
];
const said = (person: string, machine: string, tag: string, at = NOW - 60_000) =>
  ({ login: person, person, machine, tag, sha: "a".repeat(40), branch: "dev" as const, at });

test("iterations behind: the dev-* tags newer than the one run, none for the iteration or an unknown tag", () => {
  assert.equal(behindOf("dev-20261114-0900", tags), 0);
  assert.equal(behindOf("dev-20261113-0900", tags), 2);
  assert.equal(behindOf("dev-20261112-0900", tags), 3);
  assert.equal(behindOf("main", tags), 0);
});

test("each person from docs/people, in order: ✓ on the iteration, or the release they run and how far behind, or off", () => {
  const s = stripOf({ people, iteration, tags, word: null, now: NOW, words: [
    said("marcocyl04-ux", "nucbox", "dev-20261114-0900"), said("marcocyl04-ux", "mac", "dev-20261114-0900", NOW - 120_000),
    said("franktsai2008-eng", "legion", "dev-20261113-0900"),
  ] });
  assert.deepEqual(s.people.map((p) => p.name), ["Frank", "Isaac", "Marco"], "the people are the data's, in its order");
  const [frank, isaac, marco] = s.people;
  assert.equal(marco.on, true);
  assert.deepEqual(marco.runs.map((r) => r.machine), ["nucbox", "mac"], "newest word first");
  assert.equal(frank.on, false);
  assert.deepEqual(frank.runs.map((r) => [r.tag, r.behind]), [["dev-20261113-0900", 2]]);
  assert.equal(isaac.on, false);
  assert.equal(isaac.why, "off", "no Sol of theirs heard: off");
  assert.equal(s.driftAt, null);
  assert.equal(frank.drift, null, "no word: no drift said, never 'nothing off'");
});

test("no dev-* tag here: nobody is on or off an iteration, each says there is none yet", () => {
  const s = stripOf({ people, iteration: null, tags: [], word: null, now: NOW, words: [said("marcocyl04-ux", "nucbox", "dev-20261114-0900")] });
  assert.deepEqual(s.people.map((p) => [p.on, p.why]), people.map(() => [false, "no iteration"]));
});

test("drift: the word's counts and its detail for this iteration; the drift file's whole lists where it was measured", () => {
  const word = driftWordOf({ iteration: iteration.name, at: NOW - 1000, people: [
    { person: "marcocyl04-ux", off: 5, iterations: 6, openOff: 900, openIterations: 16, prs: 41, open: [{ pr: 1165, files: 12 }], mine: [{ path: "sol/README.md", age: 6 }] },
    { person: "franktsai2008-eng", off: 0, iterations: 0, openOff: 135, openIterations: 2, prs: 22 },
  ] })!;
  const s = stripOf({ people, iteration, tags, words: [], word, now: NOW });
  const [frank, isaac, marco] = s.people;
  assert.equal(s.driftAt, NOW - 1000);
  assert.deepEqual(marco.drift, { off: 5, iterations: 6, openOff: 900, openIterations: 16, prs: 41, files: [{ path: "sol/README.md", age: 6 }], open: [{ pr: 1165, files: 12 }] },
    "prs is the word's count, not the length of the list it could carry");
  assert.equal(frank.drift?.prs, 22);
  assert.equal(frank.drift?.files, null, "an older runner's word carries no lists: unknown, not empty");
  assert.equal(isaac.drift, null);

  const file = { at: NOW - 500, iteration, left: [], people: [{ login: "marcocyl04-ux", name: "Marco", prefix: "marco", off: 5, iterations: 6, openOff: 900, openIterations: 16,
    mine: [{ path: "sol/README.md", age: 6 }, { path: "sol/PROTOCOL.md", age: 6 }], open: [{ pr: 1165, branch: "marco/x", files: [{ path: "a", age: 0 }] }, { pr: 1158, branch: "marco/y", files: [] }] }] };
  const m = stripOf({ people, iteration, tags, words: [], word, file, now: NOW }).people[2];
  assert.equal(m.drift?.files?.length, 2, "the measuring machine's file has the whole list");
  assert.deepEqual(m.drift?.open, [{ pr: 1165, files: 1 }, { pr: 1158, files: 0 }]);
  assert.equal(m.drift?.prs, 2);
});

test("a word for an older iteration is not this one's drift: named as old, nobody's count shown", () => {
  const word = driftWordOf({ iteration: "dev-20261113-0900", at: NOW - 86_400_000, people: [{ person: "marcocyl04-ux", off: 5, iterations: 6 }] })!;
  const s = stripOf({ people, iteration, tags, words: [], word, now: NOW });
  assert.equal(s.driftOld, "dev-20261113-0900");
  assert.equal(s.driftAt, null);
  assert.ok(s.people.every((p) => p.drift === null));
});

test("the clock lines follow the rhythm: drift 15 minutes after the release, integrate two hours before", () => {
  assert.deepEqual(stripOf({ people, iteration, tags, words: [], word: null, rhythm: { release: "09:00", zone: "America/New_York" } }).next,
    { drift: "09:15", integrate: "07:00", zone: "America/New_York" });
  assert.deepEqual(stripOf({ people, iteration, tags, words: [], word: null, rhythm: { release: "01:00" } }).next, { drift: "01:15", integrate: "23:00", zone: "" });
  assert.equal(stripOf({ people, iteration, tags, words: [], word: null }).next, null);
});

test("the word said on the relay stays under the hub's limit and keeps every count, however much there is", () => {
  const many = (n: number, f: (i: number) => any) => Array.from({ length: n }, (_, i) => f(i));
  const big = people.map((p) => ({ ...p, off: 80, iterations: 9, openOff: 932, openIterations: 16,
    mine: many(80, (i) => ({ path: `文書/${"名前".repeat(12)}/file-${i}.ts`, age: 3 })),
    open: many(70, (i) => ({ pr: 1000 + i, branch: `x/${i}`, files: many(20, (j) => ({ path: `f${j}`, age: 1 })) })) }));
  const out = saidPeople(big);
  const msg = JSON.stringify({ kind: "drift", from: { login: "marcocyl04-ux", agent: true, name: "Marco" }, at: NOW, iteration: iteration.name, people: out });
  assert.ok(Buffer.byteLength(msg) < MSG_MAX, `${Buffer.byteLength(msg)} bytes`);   // a path past ASCII is more bytes than characters
  assert.deepEqual(out.map((p) => [p.person, p.off, p.prs]), people.map((p) => [p.login, 80, 70]), "every count survives");
  assert.ok(out[0].open.length > 0, "detail fills what room there is");
  // no open PRs: the paths fill the room, and they are counted in bytes
  const paths = saidPeople(big.map((p) => ({ ...p, open: [] })));
  const pmsg = JSON.stringify({ kind: "drift", from: { login: "marcocyl04-ux", agent: true, name: "Marco" }, at: NOW, iteration: iteration.name, people: paths });
  assert.ok(Buffer.byteLength(pmsg) < MSG_MAX, `${Buffer.byteLength(pmsg)} bytes`);
  assert.ok(paths[0].mine.length > 0, "the files fill what room there is");
  const back = driftWordOf({ iteration: iteration.name, people: out })!;
  assert.equal(back.people[0].prs, 70);
  assert.deepEqual(back.people[0].open, out[0].open);
});

test("the word's detail is kept only when sound", () => {
  const w = driftWordOf({ iteration: iteration.name, people: [{ person: "w0ngtap", off: 1, iterations: 1, mine: [{ path: "a\nb", age: 1 }, { path: "ok.md", age: -2 }, 7], open: [{ pr: -1 }, { pr: 9, files: "x" }] }] })!;
  assert.deepEqual(w.people[0].mine, [{ path: "ok.md", age: 0 }]);
  assert.deepEqual(w.people[0].open, [{ pr: 9, files: 0 }]);
  assert.equal("prs" in w.people[0], false, "no count said: none made up");
});
