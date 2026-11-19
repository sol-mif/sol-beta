// Broke reverts (#1562, part of #1559): a merged change marked broke gets a revert PR through GitHub's
// revertPullRequest, titled `Revert "<title>" (#<n> broke)`, its body the finding, its issue, what to try and the agent's
// signature, assigned to its author, never merged by the machine. An unmerged PR gets none; a second press opens none
// while one is open; GitHub refusing leaves one comment on the broke PR and the mark stands.
// GitHub is a function that answers from a small made-up repo and writes down its arguments; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-broke-")), "work.json");
const B = await import("../src/team/broke.ts");
const T = await import("../src/team/tonight.ts");

const RHYTHM = JSON.stringify({ review: "21:00", until: "06:00", release: "09:00", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"], zone: "America/New_York" });
const PR = { number: 451, id: "PR_kwDO451", title: "Home: the made lines", url: "https://github.com/o/r/pull/451", state: "MERGED",
  author: { login: "marcocyl04-ux" }, body: "**Issue**: Fixes #1490\n", closingIssuesReferences: [{ number: 1490 }] };

type O = { view?: any; open?: any[]; refuse?: string };
function world(o: O = {}) {
  const calls: string[][] = [], asked: { query: string; vars: Record<string, string> }[] = [], pings: any[] = [];
  let n = 0;
  const d: import("../src/team/broke.ts").BrokeDeps = {
    me: () => "franktsai2008-eng",
    now: () => new Date("2026-11-19T07:00:00Z"),
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.startsWith("api repos/o/r --jq .default_branch")) return "main\n";
      if (s.startsWith("pr view")) return JSON.stringify(o.view ?? PR);
      if (s.startsWith("pr list")) return JSON.stringify(o.open ?? []);
      return "";
    },
    graphql: async (query, vars) => {
      asked.push({ query, vars });
      if (o.refuse) throw new Error(`GraphQL: ${o.refuse}\nmore`);
      n++;
      return JSON.stringify({ data: { revertPullRequest: { revertPullRequest: { number: 600 + n, url: `https://github.com/o/r/pull/${600 + n}` } } } });
    },
    ping: (p) => pings.push(p),
  };
  return { d, calls, asked, pings };
}
const said = (calls: string[][]) => calls.filter((c) => c[0] === "pr" && c[1] === "comment").map((c) => c[6]);
const fresh = () => { T.forgetTonight(); T.forgetRhythms(); };
const WHY = { repo: "o/r", number: 451, why: "the home page\nshows nothing", agent: true };

test("a merged change marked broke gets a revert PR: its title, the finding, its issue, what to try, signed, assigned to its author", async () => {
  fresh();
  const w = world();
  const r = await B.thisBroke(w.d, WHY);
  assert.deepEqual(r.revert, { number: 601, url: "https://github.com/o/r/pull/601" });
  assert.equal(w.asked.length, 1);
  assert.match(w.asked[0].query, /revertPullRequest\(input: \{ pullRequestId: \$id/);
  const v = w.asked[0].vars;
  assert.equal(v.id, "PR_kwDO451");
  assert.equal(v.title, 'Revert "Home: the made lines" (#451 broke)');
  assert.match(v.body, /it broke: the home page shows nothing/);
  assert.match(v.body, /\*\*Issue\*\*: Part of #1490\b/);
  assert.match(v.body, /\*\*What to try\*\*: /);
  assert.match(v.body, /never merged by it: @marcocyl04-ux or a person merges it/);
  assert.match(v.body, /\n\n— franktsai2008-eng's agent$/);
  assert.deepEqual(w.calls.find((c) => c[0] === "pr" && c[1] === "edit"), ["pr", "edit", "601", "--repo", "o/r", "--add-assignee", "marcocyl04-ux"]);
  assert.ok(!w.calls.some((c) => c[0] === "pr" && c[1] === "merge"), "never merged by the machine");
  assert.equal(said(w.calls).length, 1, "the broke comment alone");
  assert.deepEqual(w.calls.filter((c) => c.join(" ").includes("labels[]=broke")).length, 1, "the label still goes on");
});

test("a PR that names no issue: the revert is part of #1562; one whose body says Part of #n: that one", async () => {
  fresh();
  const a = world({ view: { ...PR, closingIssuesReferences: [], body: "" } });
  await B.thisBroke(a.d, WHY);
  assert.match(a.asked[0].vars.body, /Part of #1562\b/);
  fresh();
  const b = world({ view: { ...PR, closingIssuesReferences: [], body: "**Issue**: Part of #1559" } });
  await B.thisBroke(b.d, WHY);
  assert.match(b.asked[0].vars.body, /Part of #1559\b/);
});

test("an unmerged PR marked broke gets no revert", async () => {
  fresh();
  for (const state of ["OPEN", "CLOSED"]) {
    const w = world({ view: { ...PR, state } });
    const r = await B.thisBroke(w.d, WHY);
    assert.equal(r.revert, undefined, state);
    assert.equal(w.asked.length, 0, state);
    assert.ok(!w.calls.some((c) => c[0] === "pr" && (c[1] === "list" || c[1] === "edit")), state);
  }
});

test("a second press opens nothing while a revert titled (#n broke) is open", async () => {
  fresh();
  const w = world({ open: [{ number: 77, title: 'Revert "Home: the made lines" (#4510 broke)' }, { number: 601, title: 'Revert "Home: the made lines" (#451 broke)', url: "https://github.com/o/r/pull/601", headRefName: "revert-451-marco/made", isCrossRepository: false }] });
  const r = await B.thisBroke(w.d, WHY);
  assert.deepEqual(r.revert, { number: 601, url: "https://github.com/o/r/pull/601", already: true });
  assert.equal(w.asked.length, 0);
  assert.ok(!w.calls.some((c) => c[0] === "pr" && c[1] === "edit"));
  // a look-alike for another PR is not this one's
  const x = world({ open: [{ number: 77, title: 'Revert "x" (#4510 broke)', headRefName: "revert-4510-x" }] });
  assert.equal((await B.thisBroke(x.d, WHY) as any).revert.number, 601);
  // a PR merely titled so, not on GitHub's revert branch, does not stand in for the revert
  const z = world({ open: [{ number: 88, title: 'Revert "Home: the made lines" (#451 broke)', headRefName: "someone/else" }] });
  assert.equal((await B.thisBroke(z.d, WHY) as any).revert.number, 601);
  // nor one from a fork on a branch named like it
  const f = world({ open: [{ number: 89, title: 'Revert "Home: the made lines" (#451 broke)', headRefName: "revert-451-x", isCrossRepository: true }] });
  assert.equal((await B.thisBroke(f.d, WHY) as any).revert.number, 601);
});

test("GitHub will not open one: one comment on the broke PR says why, and the mark stands", async () => {
  fresh();
  const w = world({ refuse: "This pull request cannot be reverted" });
  const r = await B.thisBroke(w.d, WHY);
  assert.deepEqual(r.revert, { error: "GraphQL: This pull request cannot be reverted" });
  const c = said(w.calls);
  assert.equal(c.length, 2, "the broke comment and one more");
  assert.match(c[1], /^\*\*No revert opened\*\*: GitHub would not open one \(GraphQL: This pull request cannot be reverted\); the broke mark stands\./);
  assert.match(c[1], /— franktsai2008-eng's agent$/);
  assert.equal(w.calls.filter((x) => x.join(" ").includes("labels[]=broke")).length, 1, "the label stays on");
  assert.ok(!w.calls.some((x) => x[0] === "pr" && x[1] === "edit"));
});

test("the default GraphQL goes through gh api graphql, the query and each variable a field", async () => {
  fresh();
  const w = world();
  delete (w.d as any).graphql;
  const gh = w.d.gh;
  w.d.gh = async (args) => args[0] === "api" && args[1] === "graphql"
    ? (await gh(args), JSON.stringify({ data: { revertPullRequest: { revertPullRequest: { number: 650, url: "u" } } } }))
    : gh(args);
  const r = await B.thisBroke(w.d, WHY);
  assert.equal((r.revert as any).number, 650);
  const g = w.calls.find((c) => c[0] === "api" && c[1] === "graphql")!;
  assert.equal(g[2], "-f");
  assert.match(g[3], /^query=mutation/);
  assert.ok(g.includes("id=PR_kwDO451"));
  assert.ok(g.includes('title=Revert "Home: the made lines" (#451 broke)'));
});
