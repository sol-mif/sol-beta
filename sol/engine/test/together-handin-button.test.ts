// Hand in by button, any time (#579, team/handin.ts): the hand-in card shows whenever one of my draft PRs is green, in
// the session that opened it (its folder on the branch, or its own `gh pr create`, or that of a background agent it
// started), and the wrap-up box's merge is my press through the card's key: ready if it is a draft, then merged.
// GitHub, git, the sessions and their transcripts are functions over a small made-up world; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-handin-button-")), "work.json");
const H = await import("../src/team/handin.ts");
const T = await import("../src/team/tonight.ts");
type Deps = import("../src/team/handin.ts").CardDeps;

const ME = "marcocyl04-ux", FRANK = "franktsai2008-eng", REPO = "sol-mif/sol-dev";
const RHYTHM = JSON.stringify({ handIn: "20:00", review: "21:00", release: "09:00", zone: "America/New_York", dev: [ME], beta: [FRANK] });
const green = [{ status: "COMPLETED", conclusion: "SUCCESS" }], red = [{ status: "COMPLETED", conclusion: "FAILURE" }];
const SHA = "a".repeat(40);
const pr = (o: Record<string, unknown>) => ({ title: "x", url: `https://github.com/${REPO}/pull/${o.number}`, body: "", isDraft: true, baseRefName: "main", author: { login: ME }, statusCheckRollup: green, headRefOid: SHA, files: [], ...o });

// a transcript's lines as Claude Code writes them: a Bash call, then its result
const call = (id: string, command: string) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
const result = (id: string, content: unknown) => JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] } });

function world(o: { now?: string; prs?: any[]; opened?: Record<string, string[]>; view?: Record<number, object>; sessions?: any[] } = {}) {
  const calls: string[][] = [], bus: any[] = [];
  const prs = o.prs ?? [
    pr({ number: 575, headRefName: "marco/cowork-fr-30-gaps-574", body: "Fixes #574" }),   // built in /tmp by a background agent
    pr({ number: 576, headRefName: "marco/cowork-fr-30-navigation-573", statusCheckRollup: red }),
    pr({ number: 580, headRefName: "marco/x-580" }),                                        // nobody worked on it here
  ];
  const branchOf: Record<string, string> = { "/work/sol": "main", "/wt/a": "marco/cowork-fr-30-gaps-574" };
  const d: Deps = {
    me: () => ME,
    present: () => true,
    folders: async () => ({ [REPO]: "/work/sol" }),
    now: () => new Date(o.now ?? "2026-11-01T14:00:00Z"),   // 09:00 in New York: far from the hand-in hour
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.includes(".default_branch")) return "main\n";
      if (s.startsWith("pr list") && s.includes("--head")) return JSON.stringify(prs.filter((p) => s.includes(`--head ${p.headRefName}`)).map((p) => ({ number: p.number })));
      if (s.startsWith("pr list")) return JSON.stringify(prs);
      if (s.startsWith("pr view")) {
        const p = prs.find((x) => x.number === Number(args[2]));
        return JSON.stringify(p ? { state: "OPEN", isDraft: p.isDraft, author: p.author, baseRefName: p.baseRefName, headRefOid: p.headRefOid, statusCheckRollup: p.statusCheckRollup, url: p.url, ...(o.view?.[p.number] ?? {}) } : {});
      }
      return "";
    },
    git: async (cwd, args) => {
      if (args[0] === "rev-parse") return branchOf[cwd] ? { code: 0, out: `${branchOf[cwd]}\n${cwd}\n` } : { code: 128, out: "" };
      if (args[0] === "remote") return { code: 0, out: "git@github.com:sol-mif/sol-dev.git\n" };
      return { code: 0, out: "" };
    },
    start: async () => "never",
    bus: (m) => bus.push(m),
    sessions: async () => o.sessions ?? [
      { id: "s-lead", cwd: "/work/sol", updatedAt: Date.parse("2026-11-01T13:50:00Z") },    // on main: it handed the work to builders
      { id: "s-other", cwd: "/work/sol", updatedAt: Date.parse("2026-11-01T13:55:00Z") },   // on main too, opened nothing
    ],
    lastItem: async (id) => `${id}-last`,
    unread: () => {},
    opened: async (id) => (o.opened ?? { "s-lead": [`${REPO}#575`, `${REPO}#576`] })[id] ?? [],
  };
  return { d, calls, bus, prs };
}
const fresh = () => { H.forgetHandIn(); T.forgetTonight(); T.forgetRhythms(); };
const said = (calls: string[][], verb: string) => calls.filter((c) => c[0] === "pr" && c[1] === verb);

test("openedIn: a `gh pr create` and its result name the PR it opened; reading a PR opens nothing", () => {
  const lines = [
    call("t1", "cd /tmp/sol-fr30-574 && gh pr create --draft --repo sol-mif/sol-dev --base main --head marco/cowork-fr-30-gaps-574 --body-file /tmp/pr.md"),
    result("t1", "https://github.com/sol-mif/sol-dev/pull/575"),
    call("t2", "gh pr view 576 --repo sol-mif/sol-dev --json url"),
    result("t2", "https://github.com/sol-mif/sol-dev/pull/576"),
    call("t3", "gh  pr   create --fill"),
    result("t3", [{ type: "text", text: "Creating pull request\nhttps://github.com/Sol-Mif/Sol-Dev/pull/590\n" }]),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "I opened https://github.com/sol-mif/sol-dev/pull/600 for you" }] } }),
    "not json, but it says gh pr create",
  ];
  assert.deepEqual([...H.openedIn(lines).found].sort(), ["sol-mif/sol-dev#575", "sol-mif/sol-dev#590"]);
  // a call whose result comes in a later read is still matched
  const seen = H.openedIn([call("t9", "gh pr create --fill")]);
  assert.deepEqual([...seen.found], []);
  H.openedIn([result("t9", "https://github.com/o/r/pull/7")], seen);
  assert.deepEqual([...seen.found], ["o/r#7"]);
});

test("openedInFiles: a transcript and its agents' are read once, then only what was added; a half line waits", async () => {
  fresh();
  const dir = mkdtempSync(join(tmpdir(), "sol-579-tr-"));
  const main = join(dir, "s.jsonl"), agent = join(dir, "agent-a.jsonl");
  writeFileSync(main, JSON.stringify({ type: "user", message: { content: "héllo ✓ — a long line ".repeat(50000) } }) + "\n");
  writeFileSync(agent, call("a1", "gh pr create --draft") + "\n");
  assert.deepEqual(await H.openedInFiles([main, agent, join(dir, "missing.jsonl")]), []);
  const r = result("a1", "https://github.com/sol-mif/sol-dev/pull/575");
  appendFileSync(agent, r.slice(0, 40));   // being written
  assert.deepEqual(await H.openedInFiles([main, agent]), []);
  appendFileSync(agent, r.slice(40) + "\n");
  assert.deepEqual(await H.openedInFiles([main, agent]), ["sol-mif/sol-dev#575"]);
  assert.deepEqual(await H.openedInFiles([agent]), ["sol-mif/sol-dev#575"]);   // kept
});

test("cardSessionOf, the when-rule: the latest touched among the sessions on its branch and those that opened it", () => {
  const onBranch = [{ id: "wt", updatedAt: 10, branch: "b-1" }, { id: "wt-other", updatedAt: 99, branch: "b-2" }];
  const openers = [{ id: "lead", updatedAt: 20, opened: ["o/r#1"] }, { id: "reader", updatedAt: 50, opened: [] }];
  assert.equal(H.cardSessionOf({ repo: "O/R", number: 1, branch: "b-1", onBranch, openers })?.id, "lead");
  assert.equal(H.cardSessionOf({ repo: "o/r", number: 1, branch: "b-1", onBranch: [{ id: "wt", updatedAt: 30, branch: "b-1" }], openers })?.id, "wt");
  assert.equal(H.cardSessionOf({ repo: "o/r", number: 1, branch: "b-9", onBranch, openers: [] }), undefined);
  assert.equal(H.cardSessionOf({ repo: "o/r", number: 2, branch: "b-9", onBranch, openers })?.id, undefined);   // opened by nobody here
});

test("scan at 9am: my green draft's card goes to the session whose background agent opened it, not one that only sits on main", async () => {
  fresh();
  const w = world();
  const put = await H.scan(w.d);
  assert.equal(put.length, 1);
  const [card] = H.handInCardsOf("s-lead");
  assert.deepEqual([card.number, card.after, card.issue], [575, "s-lead-last", 574]);
  assert.equal(card.ask, "#574 is ready. Bring it into sol-dev tonight so Sol developers can try it?");
  assert.equal(H.handInCardsOf("s-other").length, 0);
  assert.equal(said(w.calls, "ready").length + said(w.calls, "merge").length, 0);   // a card hands nothing in by itself
  // without the link (no session opened it, none on its branch) no card, as before
  fresh();
  assert.deepEqual(await H.scan(world({ opened: {} }).d), []);
});

test("mergeTargetOf: the PR the box names, else the session's card, else its branch's, else the one it opened", () => {
  const cards = [{ repo: REPO, number: 575, state: undefined }, { repo: REPO, number: 570, state: "gone" as const }];
  assert.deepEqual(H.mergeTargetOf({ pr: "https://github.com/o/r/pull/9", cards, opened: [] }), { repo: "o/r", number: 9 });
  assert.deepEqual(H.mergeTargetOf({ pr: 576, cards, opened: [`${REPO}#576`] }), { repo: REPO, number: 576 });
  assert.deepEqual(H.mergeTargetOf({ pr: "#12", repo: "o/r", cards: [], opened: [] }), { repo: "o/r", number: 12 });
  assert.equal(H.mergeTargetOf({ pr: "12", cards: [], opened: [] }), null);
  assert.equal(H.mergeTargetOf({ pr: "the big one", repo: "o/r", cards, opened: [] }), null);
  assert.deepEqual(H.mergeTargetOf({ cards, opened: [] }), { repo: REPO, number: 575 });
  assert.deepEqual(H.mergeTargetOf({ cards: [], branchPr: { repo: "o/r", number: 3 }, opened: ["o/r#4"] }), { repo: "o/r", number: 3 });
  assert.deepEqual(H.mergeTargetOf({ cards: [], opened: ["o/r#4"] }), { repo: "o/r", number: 4 });
  assert.equal(H.mergeTargetOf({ cards: [], opened: ["o/r#4", "o/r#5"] }), null);
});

test("the box's merge press: the key, then ready (a draft) and merge on GitHub, in that order; the card says brought in", async () => {
  fresh();
  const w = world();
  await H.scan(w.d);
  // no key, or not Sol's own window: nothing asked of GitHub
  const before = w.calls.length;
  assert.match((await H.mergePress(w.d, { sessionId: "s-lead", window: true, pr: 575 })).error ?? "", /press once more/);
  assert.match((await H.mergePress(w.d, { sessionId: "s-lead", window: false, key: H.cardKeyOf("s-lead", true), pr: 575 })).error ?? "", /Sol's own window/);
  assert.equal(w.calls.length, before);
  const key = H.cardKeyOf("s-lead", true);
  const r = await H.mergePress(w.d, { sessionId: "s-lead", key, window: true, pr: 575 });
  assert.deepEqual(r, { ok: true, number: 575, url: `https://github.com/${REPO}/pull/575` });
  const presses = w.calls.filter((c) => c[0] === "pr" && (c[1] === "ready" || c[1] === "merge"));
  assert.deepEqual(presses, [["pr", "ready", "575", "--repo", REPO], ["pr", "merge", "575", "--repo", REPO, "--merge", "--match-head-commit", SHA]]);
  const [card] = H.handInCardsOf("s-lead");
  assert.deepEqual([card.state, card.why], ["in", "merged from the wrap-up box"]);
});

test("the box's merge press: no PR named, the session's card is meant; a ready PR is only merged; red, someone else's or closed is not", async () => {
  fresh();
  const w = world({ view: { 580: { isDraft: false } } });
  await H.scan(w.d);
  const key = H.cardKeyOf("s-lead", true);
  assert.equal((await H.mergePress(w.d, { sessionId: "s-lead", key, window: true })).number, 575);
  // a key for a session with no card yet, asked by its box
  const k2 = H.cardKeyOf("s-other", true);
  assert.ok(k2 && k2 !== key);
  assert.equal(H.cardKeyOf("s-none"), "");
  const n = said(w.calls, "ready").length;
  assert.deepEqual(await H.mergePress(w.d, { sessionId: "s-other", key: k2, window: true, pr: 580 }), { ok: true, number: 580, url: `https://github.com/${REPO}/pull/580` });
  assert.equal(said(w.calls, "ready").length, n);   // ready already: only merged
  const m = said(w.calls, "merge").length;
  assert.match((await H.mergePress(w.d, { sessionId: "s-other", key: k2, window: true, pr: 576 })).error ?? "", /checks are red/);
  const w2 = world({ view: { 580: { author: { login: FRANK } } } });
  assert.match((await H.mergePress(w2.d, { sessionId: "s-other", key: k2, window: true, pr: 580 })).error ?? "", /franktsai2008-eng's: its author merges it/);
  const w3 = world({ view: { 580: { state: "CLOSED" } } });
  assert.match((await H.mergePress(w3.d, { sessionId: "s-other", key: k2, window: true, pr: 580 })).error ?? "", /closed on GitHub/);
  assert.equal(said(w.calls, "merge").length + said(w2.calls, "merge").length + said(w3.calls, "merge").length, m);
  assert.match((await H.mergePress(w.d, { sessionId: "s-other", key: k2, window: true, pr: "which?" })).error ?? "", /which PR/);
});
