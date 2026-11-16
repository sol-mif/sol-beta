// Who leads each label (#117, #438): asked from Cowork as a proposal in the project's settings; nothing lands on main.
// GitHub is a function that writes down its arguments; nothing here reaches the network. The guard is run for real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { devOnly } from "./dev-copy.ts";

const { leadsOf, cleanLeads, setLeads, leadsLine, askLine, pressLeads, CODEOWNERS } = await import("../src/team/press.ts");
const { owners } = await import("../src/team/claims.ts");
type Deps = import("../src/team/press.ts").PressDeps;

// the repo's own file, read in a dev checkout; a tester's copy has none, and the two tests on it skip (#300)
const DEV_FILE = devOnly(".github/CODEOWNERS");
const REAL = DEV_FILE ? "" : readFileSync(resolve(import.meta.dirname, "../../../.github/CODEOWNERS"), "utf8");
const SMALL = [
  "# label base: the engine.",
  "/sol/engine/                 @marco",
  "/sol/keep /sol/back  @marco",
  "",
  "# label cowork: the team.",
  "/sol/mac/src/cowork/         @marco @frank",
  "/sol/engine/src/team/        @marco",
  "",
  "# label social: no code yet.",
  "# leads: @marco",
  "",
].join("\n");

test("leadsOf reads each label's leads off CODEOWNERS, the social leads line too", { skip: DEV_FILE }, () => {
  const l = leadsOf(SMALL);
  assert.deepEqual(l.base, ["marco"]);
  assert.deepEqual(l.cowork, ["marco", "frank"]);
  assert.deepEqual(l.social, ["marco"]);
  assert.deepEqual(l.life, [], "a label with no line has no leads");
  const real = leadsOf(REAL);
  assert.deepEqual(Object.keys(real), ["life", "work", "cowork", "social", "base", "product"]);
  for (const k of Object.keys(real)) assert.ok(real[k].length >= 1 && real[k].length <= 2, `${k} has one or two leads in the repo's own file`);
});

test("cleanLeads: one or two people, each once, no bots", () => {
  assert.deepEqual(cleanLeads(["@frank", "isaac"]), ["frank", "isaac"]);
  assert.deepEqual(cleanLeads(["frank", "Frank"]), ["frank"]);
  assert.match(String(cleanLeads([])), /needs one lead/);
  assert.match(String(cleanLeads(["a", "b", "c"])), /at most two/);
  assert.match(String(cleanLeads(["dependabot[bot]"])), /not a person/);
  assert.match(String(cleanLeads(["bad login!"])), /not a person/);
  assert.match(String(cleanLeads("frank")), /a list/);
});

test("setLeads moves people on one label's lines, never a path, and keeps the columns", { skip: DEV_FILE }, () => {
  const next = setLeads(SMALL, "cowork", ["frank", "isaac"]);
  assert.match(next, /^\/sol\/mac\/src\/cowork\/         @frank @isaac$/m, "the gap before the owners is kept");
  assert.match(next, /^\/sol\/engine\/src\/team\/        @frank @isaac$/m);
  assert.match(next, /^\/sol\/engine\/                 @marco$/m, "another label is untouched");
  assert.deepEqual(owners(next), owners(SMALL), "what each label holds reads exactly as before");
  assert.deepEqual(leadsOf(next).cowork, ["frank", "isaac"]);
  assert.match(setLeads(SMALL, "social", ["isaac"]), /^# leads: @isaac$/m, "a label with no code: its leads line");
  assert.match(setLeads(SMALL, "base", ["frank"]), /^\/sol\/keep \/sol\/back  @frank$/m, "a line of several paths");
  assert.throws(() => setLeads(SMALL, "life", ["frank"]), /no line for life/);
  // on the repo's own file: every label can be set, and only the owners change
  for (const label of ["life", "work", "cowork", "social", "base", "product"]) {
    const n = setLeads(REAL, label, ["frank"]);
    assert.deepEqual(owners(n), owners(REAL), `${label}: the paths are the same`);
    assert.deepEqual(leadsOf(n)[label], ["frank"]);
    assert.equal(n.split("\n").length, REAL.split("\n").length);
  }
});

test("the ping says it in one line: applied, or asked of the people it waits for", () => {
  assert.equal(leadsLine("cowork", ["frank"], ["marco"], "marco"), "cowork is now led by frank (was marco), set by marco");
  assert.equal(askLine("cowork", ["frank", "isaac"], ["marco"], "marco"), "marco proposes cowork led by frank and isaac (now marco): agree or not yet in the project's settings");
});

type Asked = { repo: string; owners: Record<string, string[]>; by: string };
function fake(o: { people?: string[]; table?: Record<string, string[]>; state?: "open" | "applied"; needs?: string[]; refuse?: string; team?: string[]; inSight?: string[] } = {}) {
  const calls: string[][] = [];
  const pings: { to: string; line: string; repo: string }[] = [];
  const asked: Asked[] = [];
  const d: Deps = {
    login: async () => "marco",
    team: () => o.team ?? ["frank", "isaac", "marco"],
    ping: (to, line, repo) => { pings.push({ to, line, repo }); return (o.inSight ?? [to]).includes(to); },
    table: async () => o.table ?? { base: ["marco"], cowork: ["marco", "frank"], social: ["marco"] },
    propose: async (repo, owners, by) => {
      asked.push({ repo, owners, by });
      if (o.refuse) return { error: o.refuse };
      return { proposal: { id: "abcd1234", by, at: "2026-10-30T10:00:00Z", patch: { owners }, was: {}, needs: o.needs ?? ["frank", "marco", "wong-tap"], poll: "p0110000", state: o.state ?? "open" } };
    },
    gh: async (args) => {
      calls.push(args);
      const a = args.join(" ");
      if (a.includes("/collaborators")) return (o.people ?? ["frank", "isaac", "marco", "Wong-Tap"]).join("\n") + "\n";
      return "";
    },
  };
  return { d, calls, pings, asked };
}

test("the press asks the project: the whole table with one label changed, never a write to main; who it waits for is pinged", async () => {
  const { d, calls, pings, asked } = fake();
  const r = await pressLeads(d, { repo: "acme/sol", label: "cowork", leads: ["frank", "wong-tap"] });
  assert.ok("ok" in r, JSON.stringify(r));
  assert.deepEqual(r.leads, ["frank", "Wong-Tap"], "GitHub's own spelling of a login");
  assert.deepEqual(r.was, ["marco", "frank"]);
  assert.deepEqual(asked, [{ repo: "acme/sol", by: "marco", owners: { base: ["marco"], cowork: ["frank", "Wong-Tap"], social: ["marco"] } }], "the other labels kept as they are");
  assert.deepEqual(r.proposal, { id: "abcd1234", state: "open", needs: ["frank", "marco", "wong-tap"] });
  assert.ok(!calls.some((c) => c.includes("PUT") || c.includes("-X")), "nothing written on GitHub");
  assert.deepEqual(pings.map((p) => p.to).sort(), ["frank", "wong-tap"], "the people it waits for, but the one who pressed");
  assert.ok(pings.every((p) => p.repo === "acme/sol" && /^marco proposes cowork led by frank and Wong-Tap \(now marco and frank\)/.test(p.line)));
});

test("applied at once (it named only me): the team hears it as before", async () => {
  const { d, pings } = fake({ state: "applied", needs: ["marco"], table: { base: ["marco"] } });
  const r = await pressLeads(d, { repo: "acme/sol", label: "base", leads: ["marco", "frank"] });
  assert.ok("ok" in r && r.proposal?.state === "applied");
  assert.deepEqual(pings.map((p) => p.to).sort(), ["frank", "isaac"]);
  assert.ok(pings.every((p) => /base is now led by marco and frank \(was marco\), set by marco/.test(p.line)));
});

test("the press refuses: not a person on the repo, a bad label, too many; the project's refusal is said", async () => {
  const r2 = await pressLeads(fake().d, { repo: "acme/sol", label: "cowork", leads: ["stranger"] });
  assert.match(String((r2 as { error: string }).error), /stranger has no access to acme\/sol; invite them on GitHub first/);
  assert.match(String((await pressLeads(fake().d, { repo: "acme/sol", label: "music", leads: ["frank"] }) as { error: string }).error), /the labels are/);
  assert.match(String((await pressLeads(fake().d, { repo: "acme/sol", label: "base", leads: ["a", "b", "c"] }) as { error: string }).error), /at most two/);
  const busy = fake({ refuse: "a change to the owners is waiting for agreement already" });
  const r3 = await pressLeads(busy.d, { repo: "acme/sol", label: "base", leads: ["frank"] });
  assert.match(String((r3 as { error: string }).error), /waiting for agreement already/);
  assert.equal(busy.pings.length, 0);
});

test("the same leads again: nothing asked, nobody pinged", async () => {
  const { d, asked, pings } = fake();
  const r = await pressLeads(d, { repo: "acme/sol", label: "base", leads: ["marco"] });
  assert.ok("ok" in r && r.unchanged);
  assert.equal(asked.length, 0);
  assert.equal(pings.length, 0);
});

test("the guard refuses an agent the same write by hand (main-by-api), and lets the rest through", () => {
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "press-guard-"));
  execFileSync("git", ["init", "-q", "-b", "marco/cowork-leads-117"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git"], { cwd: dir });   // a sol-dev checkout (#479)
  execFileSync("git", ["config", "sol.login", "marcocyl04-ux"], { cwd: dir });
  const run = (command: string) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir }) });
  const put = "gh api -X PUT repos/acme/sol/contents/.github/CODEOWNERS -f message=x -f content=eA== -f sha=1";
  assert.match(run(put), /main-by-api/, "a contents write with no branch lands on main");
  assert.match(run(`${put} -f branch=main`), /main-by-api/);
  assert.match(run("gh api --method PATCH repos/acme/sol/git/refs/heads/main -f sha=abc"), /main-by-api/);
  assert.equal(run(`${put.replace("-f sha=1", "")} -f branch=frank/plan`), "", "a write on a person's own branch (their plan page) goes through");
  assert.equal(run("gh api repos/acme/sol/contents/.github/CODEOWNERS?ref=main --jq .sha"), "", "reading is never refused");
});
