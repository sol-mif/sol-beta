// Drift (#1153, src/team/drift.ts): the mine rule, a change's age in iterations, and a person's drift count. Pure: the
// git log and the tags are given as text and times, so nothing here needs a repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-drift-")), "work.json");
const { inMine, ageOf, touchedOf, driftOf, toCut, CUT_AGE, fingerprint, markerOf, coveredOf, driftHeard, ownBranch, agentIdent } = await import("../src/team/drift.ts");

const DAY = 24 * 3600_000;
const T0 = Date.UTC(2026, 10, 10, 14);           // dev-20261110 made at 9am New York
const TAGS = [T0, T0 + DAY, T0 + 2 * DAY];      // three iterations, a day apart
const s = (ms: number) => String(ms / 1000);
const P = { login: "franktsai2008-eng", name: "Frank", prefix: "frank" };

test("the mine rule: MINE.md and anything under mine/, at the root, and nothing else", () => {
  for (const p of ["MINE.md", "mine/a.md", "mine/deep/x.ts"]) assert.equal(inMine(p), true, p);
  for (const p of ["sol/mine/rebase", "docs/MINE.md", "mine.md", "minefield/a", "MINE.md.bak", "sol/README.md"]) assert.equal(inMine(p), false, p);
});

test("the age: the dev-* tags made after the change's author time", () => {
  assert.equal(ageOf(T0 + 2 * DAY + 1, TAGS), 0, "made since the current iteration was cut");
  assert.equal(ageOf(T0 + DAY + 1, TAGS), 1, "one iteration went out without it");
  assert.equal(ageOf(T0 - 1, TAGS), 3);
  assert.equal(ageOf(T0 + DAY, TAGS), 1, "a tag made at the same second is not after it");
});

test("the age reads the author time: a rebase that renews the committer time leaves it as it was", () => {
  // two commits: the newer touched a.ts again; the older was written before dev-…11 and rebased today
  const log = [`\x01${s(T0 + 2 * DAY + 60_000)}\t${s(T0 + 2 * DAY + 120_000)}`, "", "a.ts", "",
    `\x01${s(T0 + 3_600_000)}\t${s(T0 + 2 * DAY + 120_000)}`, "", "a.ts", "b.ts", ""].join("\n");
  const t = touchedOf(log);
  assert.equal(t.get("a.ts"), T0 + 3_600_000, "a file's age is its oldest own commit's");
  assert.equal(ageOf(t.get("a.ts")!, TAGS), 2, "by the author time; the committer time would say 0");
  assert.equal(ageOf(t.get("b.ts")!, TAGS), 2);
});

test("the drift count: mine's unique paths, the mine rule and the iteration's own content left out, the largest age; open PRs kept beside it", () => {
  const old = T0 + 3_600_000, today = T0 + 2 * DAY + 3_600_000;
  const mine = {
    touched: new Map([["sol/a.ts", old], ["sol/b.ts", today], ["sol/same.ts", old], ["mine/notes.md", old], ["MINE.md", old]]),
    differs: new Set(["sol/a.ts", "sol/b.ts", "mine/notes.md", "MINE.md"]),   // same.ts: its content equals the iteration's
  };
  const open = [
    { pr: 12, branch: "frank/x-12", files: ["sol/b.ts", "sol/c.ts", "mine/x.md"], touched: new Map([["sol/b.ts", today], ["sol/c.ts", today]]) },
    { pr: 13, branch: "frank/y-13", files: ["sol/a.ts"], touched: new Map([["sol/a.ts", today]]) },
  ];
  const d = driftOf(P, mine, open, TAGS);
  assert.deepEqual(d.mine, [{ path: "sol/a.ts", age: 2 }, { path: "sol/b.ts", age: 0 }]);
  assert.deepEqual(d.open.map((o) => o.files.map((f) => f.path)), [["sol/b.ts", "sol/c.ts"], ["sol/a.ts"]]);
  assert.equal(d.off, 2, "mine alone: a.ts and b.ts");
  assert.equal(d.iterations, 2, "the largest age");
  assert.equal(d.openOff, 3, "the open PRs' files, each once: b.ts, c.ts, a.ts");
  assert.equal(d.openIterations, 0, "their own commits are today's");
  const onlyOpen = driftOf(P, null, open, TAGS);
  assert.equal(onlyOpen.off, 0, "open PRs alone are not in the word");
  assert.equal(onlyOpen.iterations, 0);
  assert.deepEqual(toCut(d).map((f) => f.path), ["sol/a.ts"], `mine's files ${CUT_AGE} iteration old or more`);

  const none = driftOf(P, null, [], TAGS);
  assert.equal(none.off, 0);
  assert.equal(none.iterations, 0, "0 when nothing is off");
  assert.equal(driftOf(P, { touched: new Map([["mine/a", old], ["MINE.md", old]]), differs: new Set(["mine/a", "MINE.md"]) }, [], TAGS).off, 0, "a mine holding only its own files is off nothing");
});

test("each file covered once: a marker names each file's mark, and only its owner's markers count", () => {
  const a = fingerprint({ path: "sol/a.ts", blob: "1".repeat(40) }), b = fingerprint({ path: "sol/b.ts", blob: "2".repeat(40) });
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.notEqual(a, fingerprint({ path: "sol/a.ts", blob: "3".repeat(40) }), "a new blob is a new mark");
  const pr = `body\n${markerOf("drift", "franktsai2008-eng", [b, a])}\n`;
  const asked = `${markerOf("drift-ask", "franktsai2008-eng", [b])}\n${markerOf("drift-ask", "isaac-x", [a])}`;
  assert.deepEqual([...coveredOf([pr], "franktsai2008-eng")].sort(), [a, b].sort());
  assert.deepEqual([...coveredOf([asked], "FrankTsai2008-eng")], [b], "another owner's question covers nothing of Frank's");
  assert.equal(coveredOf(["<!-- drift:0123456789ab -->"], "franktsai2008-eng").size, 0, "a marker without an owner covers nothing");
});

test("the word is heard only from a team person and only when newer", () => {
  const team = ["marcocyl04-ux", "franktsai2008-eng"];
  const m = (login: string, at: number) => ({ kind: "drift", from: { login, agent: true }, at, iteration: "dev-20261112", people: [{ person: "franktsai2008-eng", off: 1, iterations: 1 }] });
  const w = driftHeard(m("marcocyl04-ux", 100), null, team);
  assert.equal(w?.at, 100);
  assert.equal(driftHeard(m("stranger", 200), w, team), null, "not a team person");
  assert.equal(driftHeard(m("franktsai2008-eng", 100), w, team), null, "not newer");
  assert.equal(driftHeard(m("franktsai2008-eng", 101), w, team)?.at, 101);
});

test("the agent pushes only its own branch: absent, or one commit of its own (author and committer) on a dev-* tag's commit", () => {
  const tag = "a".repeat(40), me = agentIdent("marcocyl04-ux");
  const head = (parents: string, an = me.name, ae = me.email, cn = me.name, ce = me.email) => ["c".repeat(40), parents, an, ae, cn, ce].join("\t");
  assert.equal(ownBranch("", [tag], "marcocyl04-ux"), null, "not there yet");
  assert.equal(ownBranch(head(tag), [tag], "marcocyl04-ux"), null);
  assert.ok(ownBranch(head(tag, "Frank", "frank@x"), [tag], "marcocyl04-ux"), "someone else's commit");
  assert.ok(ownBranch(head(tag, me.name, me.email, "Frank", "frank@x"), [tag], "marcocyl04-ux"), "the agent's commit amended by its owner: the author kept, the committer not");
  assert.ok(ownBranch(head("b".repeat(40)), [tag], "marcocyl04-ux"), "on top of another commit");
  assert.ok(ownBranch(head(`${tag} ${"b".repeat(40)}`), [tag], "marcocyl04-ux"), "a merge");
});
