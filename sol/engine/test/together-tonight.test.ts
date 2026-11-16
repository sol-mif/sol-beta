// The review session (#416, team/tonight.ts): the rhythm read from the project, the night a moment belongs to (in a
// zone, across a change of clocks), what is due, the summary of each change (area, risk, what to try), the card placed
// after the first turn, and every press: Into <project> merges the change as summarised (one merge commit, its branch
// deleted after; a conflict or a red check stops it) and says so on the PR, a send back says
// so (severe makes it a draft again), a beta pass or hold writes on the digest issue, and only the reviewer presses,
// from Sol's own window with the card's key. Only PRs on the default branch are handed in; GitHub is asked before any
// press, so a review opened twice never writes twice.
// GitHub is a function that answers from a small made-up repo and writes down its arguments; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-tonight-")), "work.json");
const T = await import("../src/team/tonight.ts");
const { noteLine } = await import("../src/team/feed.ts");
type Deps = import("../src/team/tonight.ts").TonightDeps;

const RHYTHM = JSON.stringify({ review: "21:00", release: "09:00", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"], zone: "Asia/Taipei" });
const CODEOWNERS = "# label base: the engine\n/sol/engine/src/ @marcocyl04-ux\n# label cowork: the team\n/sol/engine/src/team/ @franktsai2008-eng\n/sol/mac/src/cowork/ @franktsai2008-eng\n# label life: the face\n/sol/mac/src/ @marcocyl04-ux\n";
const body = (tryLine: string, felt = "felt") => `What changed.\n\n## What to try\n${tryLine}\n\nFelt or silent: ${felt}\n\n— someone's agent`;
const OPEN = [
  { number: 411, title: "Browser: a typed dot", url: "https://github.com/o/r/pull/411", body: body("Type a dot in a page; it stays a dot."), isDraft: false, headRefOid: "aaa", baseRefName: "main", author: { login: "franktsai2008-eng" }, labels: [], files: [{ path: "sol/engine/src/browser.ts" }], additions: 20, deletions: 3 },
  { number: 415, title: "Dictate anywhere", url: "https://github.com/o/r/pull/415", body: body("Hold the key and talk."), isDraft: true, headRefOid: "bbb", baseRefName: "main", author: { login: "marcocyl04-ux" }, labels: [], files: [], additions: 900, deletions: 0 },
  { number: 352, title: "Analytics research", url: "https://github.com/o/r/pull/352", body: "A page.\n\nWhat to try: read it.\nFelt or silent: silent", isDraft: false, headRefOid: "ccc", baseRefName: "main", author: { login: "franktsai2008-eng" }, labels: [{ name: "cowork" }], files: [{ path: "docs/analytics/x.md" }], additions: 80, deletions: 0 },
];
const MERGED = [
  { ...OPEN[0], mergedAt: "2026-10-30T14:00:00Z" },                             // Oct 30 22:00 Taipei: folded the night before
  { ...OPEN[2], number: 340, mergedAt: "2026-10-31T00:30:00Z" },                // Oct 31 08:30: before the release
  { ...OPEN[2], number: 341, mergedAt: "2026-10-31T02:00:00Z" },                // 10:00: after the release, tomorrow's
  { ...OPEN[2], number: 339, mergedAt: "2026-10-30T10:00:00Z" },                // 18:00 the day before: an older release
  { ...OPEN[2], number: 342, mergedAt: "2026-10-31T00:40:00Z", baseRefName: "frank/stack" },   // in the window, but not on main
];
const STACKED = { ...OPEN[2], number: 420, title: "Stacked on another branch", headRefOid: "ddd", baseRefName: "frank/stack" };

type View = { state?: string; baseRefName?: string; headRefOid?: string } & import("../src/team/tonight.ts").HeadView;
function world(o: { me?: string; now?: string; fail?: RegExp; digest?: number; open?: unknown[]; folders?: Record<string, string>; rhythm?: string | null; present?: boolean;
  view?: Record<number, View>; said?: (string | { body: string; at?: string; edited?: true })[]; startFails?: boolean } = {}) {
  const calls: string[][] = [], started: { cwd: string; repo: string; title: string; text: string }[] = [], items: object[] = [], pings: object[] = [];
  let n = 0;
  const d: Deps = {
    me: () => o.me ?? "marcocyl04-ux",
    present: () => o.present ?? true,
    folders: async () => o.folders ?? { "o/r": "/work/r" },
    now: () => new Date(o.now ?? "2026-10-31T13:05:00Z"),   // 21:05 in Taipei
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (o.fail && o.fail.test(s)) throw new Error("GraphQL: Pull request is not mergeable (mergePullRequest)\nmore");
      if (s.includes(".sol/rhythm.json")) { if (o.rhythm === null) throw new Error("gh: Not Found (HTTP 404)"); return o.rhythm ?? RHYTHM; }
      if (s.includes(".github/CODEOWNERS")) return CODEOWNERS;
      if (s.startsWith("api repos/") && s.includes(".default_branch")) return "main\n";
      if (s.startsWith("pr view")) {
        const n = Number(args[2]), p = (o.open ?? OPEN).find((x: any) => x.number === n) as any;
        return JSON.stringify({ state: "OPEN", baseRefName: p?.baseRefName ?? "main", headRefOid: p?.headRefOid ?? "", headRefName: `franktsai2008-eng/change-${n}`, isCrossRepository: false,
          author: { login: "franktsai2008-eng" }, mergeable: "MERGEABLE", statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "SUCCESS" }], ...(o.view?.[n] ?? {}) });
      }
      // GitHub says who wrote each comment: here, the login its signature line names ("— login (review session)")
      if (s.startsWith("issue view")) return JSON.stringify({ comments: (o.said ?? []).map((x) => {
        const c = typeof x === "string" ? { body: x } : x;
        return { body: c.body, author: { login: /— (\S+) \(review session\)\s*$/.exec(c.body)?.[1] ?? "" }, createdAt: c.at ?? "2026-10-31T13:00:00Z", includesCreatedEdit: !!c.edited };
      }) });
      if (s.startsWith("pr list") && /--(head|base) \S+ --json number /.test(s)) return "[]";   // no other PR on a change's branch (dropBranch)
      if (s.startsWith("pr list") && s.includes("--state open")) return JSON.stringify(o.open ?? OPEN);
      if (s.startsWith("pr list") && s.includes("--state merged")) return JSON.stringify(MERGED);
      if (s.startsWith("issue list")) return JSON.stringify(o.digest === 0 ? [] : [{ number: o.digest ?? 377, title: "Night digest" }]);
      return "";
    },
    start: async (a) => { started.push(a); return `session-${++n}-abcdef`; },
    bus: (m) => { if (o.startFails && !(m as any).retried) { (m as any).retried = true; o.startFails = false; throw new Error("the face went away"); } items.push(m); },
    ping: (p) => pings.push(p),
  };
  return { d, calls, started, items, pings };
}
const fresh = () => { T.forgetTonight(); T.forgetRhythms(); };
/** a press as Sol's window makes it: with the card's key */
const pressAs = (d: Deps, sessionId: string, verdict: import("../src/team/tonight.ts").Verdict, number?: number) =>
  T.press(d, { sessionId, verdict, ...(number ? { number } : {}), key: T.keyOf(sessionId), window: true });

test("parseRhythm: the reviewers and the hours; a file with no reviewer, or not JSON, is none", () => {
  const r = T.parseRhythm(RHYTHM)!;
  assert.deepEqual([r.review, r.release, r.until, r.handIn, r.zone, r.dev, r.beta], ["21:00", "09:00", "06:00", "20:00", "Asia/Taipei", ["marcocyl04-ux"], ["franktsai2008-eng"]]);
  assert.equal(T.parseRhythm(JSON.stringify({ review: "21:00" })), null);
  assert.equal(T.parseRhythm("nope"), null);
  const odd = T.parseRhythm(JSON.stringify({ review: "25:00", dev: "marcocyl04-ux", beta: ["bad login!"], zone: "Mars/Olympus" }))!;
  assert.deepEqual([odd.review, odd.dev, odd.beta, odd.zone], ["21:00", ["marcocyl04-ux"], [], ""]);
});

test("nightOf: the day once the hour has passed, the day before until the morning, else none", () => {
  const r = T.parseRhythm(RHYTHM)!;
  assert.equal(T.nightOf(r, new Date("2026-10-31T12:59:00Z")), null);           // 20:59 Taipei
  assert.equal(T.nightOf(r, new Date("2026-10-31T13:00:00Z")), "2026-10-31");   // 21:00
  assert.equal(T.nightOf(r, new Date("2026-10-31T21:30:00Z")), "2026-10-31");   // 05:30 the next morning
  assert.equal(T.nightOf(r, new Date("2026-10-31T22:00:00Z")), null);           // 06:00
});

test("momentOf: a wall-clock time in a zone, right on both sides of a change of clocks", () => {
  assert.equal(T.momentOf("2026-10-31", "21:00", "Asia/Taipei").toISOString(), "2026-10-31T13:00:00.000Z");
  assert.equal(T.momentOf("2026-10-24", "21:00", "Europe/Amsterdam").toISOString(), "2026-10-24T19:00:00.000Z");   // summer time
  assert.equal(T.momentOf("2026-10-25", "21:00", "Europe/Amsterdam").toISOString(), "2026-10-25T20:00:00.000Z");   // winter time
  assert.equal(T.dayPlus("2026-11-01", -1), "2026-10-31");
});

test("dueReviews: each role that names me, once a night", () => {
  const rhythm = T.parseRhythm(RHYTHM)!, now = new Date("2026-10-31T13:05:00Z");
  assert.deepEqual(T.dueReviews({ repo: "o/r", rhythm, me: "MarcoCyl04-UX", now, opened: () => false }).map((x) => [x.role, x.night]), [["dev", "2026-10-31"]]);
  assert.deepEqual(T.dueReviews({ repo: "o/r", rhythm, me: "franktsai2008-eng", now, opened: () => false }).map((x) => x.role), ["beta"]);
  assert.deepEqual(T.dueReviews({ repo: "o/r", rhythm, me: "w0ngtap", now, opened: () => false }), []);
  assert.deepEqual(T.dueReviews({ repo: "o/r", rhythm, me: "marcocyl04-ux", now, opened: (k) => k === "o/r|dev|2026-10-31" }), []);
});

test("the summary of a change: what to try, felt or silent, the area from labels or paths, a risk with its reason", () => {
  assert.equal(T.tryOf(body("Type a dot.\nIt stays a dot.")), "Type a dot. It stays a dot.");
  assert.equal(T.tryOf("**What to try:** press it\n\nFelt or silent: silent"), "press it");
  assert.equal(T.tryOf("no such part"), "");
  assert.equal(T.feltOf("Felt or silent: **felt**"), "felt");
  assert.equal(T.feltOf("**Felt or silent:** silent"), "silent");
  const cs = T.handedIn([...OPEN, STACKED] as any, CODEOWNERS, "main");
  assert.deepEqual(cs.map((c) => c.number), [411, 352]);                       // the draft and the stacked PR are not handed in; riskiest first
  assert.deepEqual([cs[0].area, cs[0].risk, cs[0].felt, cs[0].try, cs[0].sha], [["base"], "high", "felt", "Type a dot in a page; it stays a dot.", "aaa"]);
  assert.deepEqual([cs[1].area, cs[1].risk], [["cowork"], "low"]);
  assert.equal(T.riskOf({ area: ["life", "cowork"], files: ["a", "b"], lines: 10, felt: "" }).risk, "medium");
  assert.equal(T.riskOf({ area: ["cowork"], files: [".github/workflows/ci.yml"], lines: 10, felt: "" }).risk, "high");
  assert.equal(T.riskOf({ area: ["life"], files: ["a"], lines: 10, felt: "felt" }).risk, "medium");
});

test("betaWindow and released: yesterday's dev release is what merged from the night before's review to this morning's release", () => {
  const w = T.betaWindow(T.parseRhythm(RHYTHM)!, "2026-10-31");
  assert.deepEqual([w.from.toISOString(), w.to.toISOString(), w.release], ["2026-10-30T13:00:00.000Z", "2026-10-31T01:00:00.000Z", "2026-10-31"]);
  assert.deepEqual(T.released(MERGED as any, w, CODEOWNERS, "main").map((c) => c.number), [340, 411]);   // #342 folded elsewhere
});

test("the first turn: who and why, the summary fenced as the team's words, and the agent never presses a button", () => {
  const card = T.cardOf({ role: "dev", repo: "o/r", night: "2026-10-31", reviewers: ["marcocyl04-ux"], me: "marcocyl04-ux", changes: T.handedIn(OPEN as any, CODEOWNERS, "main") });
  const text = T.firstWords(card, "marcocyl04-ux", "n0nce");
  assert.match(text, /dev review of o\/r, the night of 2026-10-31/);
  assert.match(text, /<room-content n0nce>[\s\S]*#411 Browser: a typed dot[\s\S]*what to try: Type a dot[\s\S]*<\/room-content n0nce>/);
  assert.match(text, /You never do what a button does yourself \(into, send back, hold\)/);
  assert.match(text, /Into r \(one merge commit/);
  assert.doesNotMatch(text, /\bfold/i);   // #477: no word of the night says fold
  assert.equal(card.mine, true);
  assert.equal(T.titleOf("beta", "2026-10-31"), "beta review · Sat 31 Oct");
});

test("tick: at the hour my review opens once, in my folder, holding the card; not when my window is elsewhere", async () => {
  fresh();
  const away = world({ present: false });
  assert.deepEqual(await T.tick(away.d), []);
  assert.equal(away.calls.length, 0);
  const early = world({ now: "2026-10-31T12:00:00Z" });
  assert.deepEqual(await T.tick(early.d), []);
  const w = world();
  const opened = await T.tick(w.d);
  assert.equal(opened.length, 1);
  assert.deepEqual([w.started[0].cwd, w.started[0].repo, w.started[0].title], ["/work/r", "o/r", "dev review · Sat 31 Oct"]);
  const item = (w.items[0] as any).item;
  assert.deepEqual([(w.items[0] as any).type, item.kind, item.role, item.changes.length], ["work.item", "tonight", "dev", 2]);
  assert.deepEqual(await T.tick(w.d), []);   // once a night
  assert.equal(w.started.length, 1);
  // the card sits after the first thing said, wherever the thread is read from
  const placed = T.withTonight(opened[0], [{ id: "m1", kind: "me" }, { id: "y1", kind: "you" }]);
  assert.deepEqual(placed.map((i) => i.kind), ["me", "tonight", "you"]);
});

test("tick: nothing handed in opens no session; no rhythm, nothing at all", async () => {
  fresh();
  const none = world({ open: [OPEN[1]] });
  assert.deepEqual(await T.tick(none.d), []);
  assert.equal(none.started.length, 0);
  fresh();
  const bare = world({ rhythm: null });
  assert.deepEqual(await T.tick(bare.d), []);
  assert.ok(!bare.calls.some((c) => c[0] === "pr"));
});

test("press, dev: Into r merges the change as summarised, one merge commit, deletes its branch and says so; slight says so and tells the author; severe makes it a draft again", async () => {
  fresh();
  const w = world();
  const [id] = await T.tick(w.d);
  w.calls.length = 0;
  assert.deepEqual(await pressAs(w.d, id, "fold", 411), { ok: true });
  assert.deepEqual(w.calls[0].slice(0, 3), ["pr", "view", "411"]);             // GitHub asked first
  assert.deepEqual(w.calls[1], ["pr", "merge", "411", "--repo", "o/r", "--merge", "--match-head-commit", "aaa"]);
  const folded = w.calls.find((c) => c[1] === "comment")!;
  assert.equal(folded.slice(0, 5).join(" "), "pr comment 411 --repo o/r");
  // after the merge, never before, and only once GitHub says no other open PR is from it or on it
  assert.deepEqual(w.calls.slice(2, 5).map((c) => c.slice(0, 8).join(" ")), [
    "pr list --repo o/r --state open --head franktsai2008-eng/change-411",
    "pr list --repo o/r --state open --base franktsai2008-eng/change-411",
    "api -X DELETE repos/o/r/git/refs/heads/franktsai2008-eng/change-411",
  ]);
  assert.match(folded[6], /^\*\*Into r\*\* in the dev review of 2026-10-31: one merge commit, so one revert undoes it; its branch is deleted\.\n\n— marcocyl04-ux \(review session\)$/);
  assert.equal(T.cardsOf(id)[0].changes[0].error, undefined);
  assert.match((await pressAs(w.d, id, "slight", 411)).error!, /went into r already/);
  w.calls.length = 0;
  assert.deepEqual(await pressAs(w.d, id, "severe", 352), { ok: true });
  assert.ok(!w.calls.some((c) => c[1] === "merge"));
  assert.deepEqual(w.calls[1], ["pr", "ready", "352", "--repo", "o/r", "--undo"]);
  assert.match(w.calls.find((c) => c[1] === "comment")![6], /^\*\*Sent back\*\* \(severe\).*is a draft again/);
  assert.deepEqual(w.pings, [{ to: "franktsai2008-eng", line: "#352 was sent back (severe) in tonight's dev review", issue: 352, repo: "o/r" }]);
  const card = T.cardsOf(id)[0];
  assert.deepEqual(card.changes.map((c) => c.state), ["folded", "severe"]);
  assert.match((await pressAs(w.d, id, "pass")).error!, /Into r or Send back/);
});

test("press: a fold GitHub refuses stays open with the reason; only the reviewer presses", async () => {
  fresh();
  const w = world({ fail: /^pr merge/ });
  const [id] = await T.tick(w.d);
  const r = await pressAs(w.d, id, "fold", 411);
  assert.match(r.error!, /not mergeable/);
  const c = T.cardsOf(id)[0].changes.find((x) => x.number === 411)!;
  assert.deepEqual([c.state, c.error], [undefined, "GraphQL: Pull request is not mergeable (mergePullRequest)"]);
  assert.ok(!w.calls.some((x) => x[1] === "comment"));   // nothing said when nothing happened
  const other = world({ me: "w0ngtap" });
  assert.match((await pressAs(other.d, id, "slight", 411)).error!, /only marcocyl04-ux presses these/);
  assert.match((await pressAs(w.d, "nope-nope-nope", "fold", 411)).error!, /no review card/);
});

test("press, beta: the whole release goes into beta or is held, on the digest issue; no button for one change", async () => {
  fresh();
  const w = world({ me: "franktsai2008-eng" });
  const [id] = await T.tick(w.d);
  const card = T.cardsOf(id)[0];
  assert.deepEqual([card.role, card.release, card.changes.map((c) => c.number)], ["beta", "2026-10-31", [340, 411]]);
  assert.match((await pressAs(w.d, id, "fold", 411)).error!, /Into beta or Hold, for the whole release/);
  w.calls.length = 0;
  assert.deepEqual(await pressAs(w.d, id, "pass"), { ok: true });
  assert.deepEqual(w.calls[2].slice(0, 4), ["issue", "comment", "377", "--repo"]);
  assert.equal(w.calls[2][6], "**Beta passed**: the dev release of 2026-10-31 goes to beta whole (#340, #411).\n\n— franktsai2008-eng (review session)");
  assert.match((await pressAs(w.d, id, "hold")).error!, /went into beta already/);
  fresh();
  const lost = world({ me: "franktsai2008-eng", digest: 0 });
  const [id2] = await T.tick(lost.d);
  assert.match((await pressAs(lost.d, id2, "hold")).error!, /no open issue "Night digest"/);
  assert.equal(T.cardsOf(id2)[0].verdict?.state, undefined);   // can be pressed again
});

test("openNow: a review opened by hand, even off the hour, by its reviewer; anyone else gets no card at all (#478)", async () => {
  fresh();
  const w = world({ now: "2026-10-31T04:00:00Z" });
  const r = await T.openNow(w.d, { role: "dev" });
  assert.ok(r.session);
  assert.equal(T.cardsOf(r.session!)[0].mine, true);
  const before = w.started.length;
  assert.match((await T.openNow(w.d, { role: "beta" })).error!, /the beta review of o\/r is shown only to franktsai2008-eng/);
  assert.equal(w.started.length, before);                                             // no session, no card
  assert.match((await T.openNow(world({ rhythm: null }).d, { role: "dev" })).error!, /no project here has a rhythm/);
});

test("the feed: a review's words are Cowork's lines for everyone", () => {
  const note = (body: string, author = "marcocyl04-ux") => noteLine({ repo: "o/r", number: 411, at: "2026-10-31T13:10:00Z", author, body, url: "https://github.com/o/r/pull/411#c1" });
  const into = note(T.prComment("fold", "2026-10-31", "marcocyl04-ux", false, { repo: "o/r" }));
  assert.deepEqual([into?.kind, into?.text, into?.agent], ["reviewed", "#411 into r", false]);
  // the words before #477 still read, so a week's history counts
  assert.equal(note("**Folded** into the dev release, in the dev review of 2026-10-30.\n\n— marcocyl04-ux (review session)")?.text, "#411 into r");
  assert.equal(note(T.betaComment("pass", { release: "2026-10-31", night: "2026-10-31", changes: [] }, "f"))?.text, "the dev release of 2026-10-31 into beta");
  assert.equal(note(T.prComment("slight", "2026-10-31", "m"))?.text, "sent back #411 (slight)");
  assert.equal(note(T.betaComment("hold", { release: "2026-10-31", night: "2026-10-31", changes: [] }, "f"))?.text, "held the dev release of 2026-10-31 from beta");
});

// ---- the review's fixes (PR #449 review) ----

test("a press needs Sol's own window and the card's key, which is never in the session's words or on disk", async () => {
  fresh();
  const w = world();
  const [id] = await T.tick(w.d);
  const key = T.keyOf(id);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(T.keyOf(id), key);                                                     // one key a card, this engine run
  assert.ok(!w.started[0].text.includes(key));                                        // not in the first turn
  assert.ok(!JSON.stringify(w.items).includes(key));                                  // not in what the faces get
  const { readdirSync } = await import("node:fs");
  const dir = join(process.env.SOL_STATE!, "..", "tonight");
  for (const f of readdirSync(dir)) assert.ok(!readFileSync(join(dir, f), "utf8").includes(key), f);   // not on disk
  w.calls.length = 0;
  assert.match((await T.press(w.d, { sessionId: id, verdict: "fold", number: 411, key, window: false })).error!, /Sol's own window/);
  assert.match((await T.press(w.d, { sessionId: id, verdict: "fold", number: 411 , window: true })).error!, /press once more/);
  assert.match((await T.press(w.d, { sessionId: id, verdict: "fold", number: 411, key: "0".repeat(32), window: true })).error!, /press once more/);
  assert.equal(w.calls.length, 0);                                                    // GitHub never asked
  assert.equal(T.keyOf("no-such-session"), "");
});

test("the guard refuses a shell that presses the card or opens a review by hand", async () => {
  const { execFileSync } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "tonight-guard-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "marco/mine"); g("config", "sol.login", "marcocyl04-ux"); g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");   // a sol-dev checkout: the team's rules hold (#479)
  const call = (tool_name: string, tool_input: object) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name, tool_input, cwd: dir }) });
  const run = (command: string) => call("Bash", { command });
  const refused = (out: string) => out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  assert.equal(refused(run(`node -e 'ws.send(JSON.stringify({type:"team.tonight.press",verdict:"fold"}))'`)), "tonight");
  assert.equal(refused(run(`echo '{"type":"team.tonight.key"}' | websocat ws://127.0.0.1:7777`)), "tonight");
  assert.equal(refused(run(`curl -s -X POST -d '{"role":"dev"}' 127.0.0.1:7777/tonight`)), "tonight");
  assert.equal(refused(run(`cat sol/engine/src/team/tonight.ts`)), "");
  assert.equal(refused(run(`npx tsx --test test/together-tonight.test.ts`)), "");
  // split across strings, and a script written to run later
  assert.equal(refused(run(`node -e 'ws.send(JSON.stringify({type:"team."+"tonight.press"}))'`)), "tonight");
  assert.equal(refused(call("Write", { file_path: "/tmp/p.mjs", content: `const t = "team" + "." + "tonight" + ".press"; ws.send(JSON.stringify({ type: t }));` })), "tonight");
  assert.equal(refused(call("Write", { file_path: "/tmp/p.mjs", content: `ws.send(JSON.stringify({ type: "team.tonight.key" }))` })), "tonight");
  assert.equal(refused(call("Edit", { file_path: join(dir, "scripts/go.sh"), old_string: "x", new_string: "curl -X POST 127.0.0.1:7777/tonight" })), "tonight");
  assert.equal(refused(call("NotebookEdit", { notebook_path: "/tmp/n.ipynb", new_source: "await press('tonight.press')" })), "tonight");
  assert.equal(refused(call("MultiEdit", { file_path: "/tmp/p.mjs", edits: [{ old_string: "a", new_string: "x.tonight.key" }] })), "tonight");
  // Sol's own source and docs that name it may still be edited; harmless paths are not refused
  assert.equal(refused(call("Edit", { file_path: join(dir, "sol/engine/src/team/wire.ts"), old_string: "x", new_string: `case "team.tonight.press":` })), "");
  assert.equal(refused(call("Write", { file_path: join(dir, "sol/PROTOCOL.md"), content: "`team.tonight.key` and `POST /tonight`" })), "");
  assert.equal(refused(run(`ls /tmp/v2work/tonight/ && mkdir -p ~/notes/tonight/`)), "");
  assert.equal(refused(run(`cat /tmp/tonight/a.json`)), "");
});

test("into: a stacked PR is never on the card; GitHub's base and head are checked again; no head known, nothing done", async () => {
  fresh();
  const w = world({ open: [...OPEN, STACKED], view: { 411: { baseRefName: "frank/stack" } } });
  const [id] = await T.tick(w.d);
  assert.ok(w.calls.some((c) => c[0] === "pr" && c[1] === "list" && c.includes("--base") && c.includes("main")));
  assert.deepEqual(T.cardsOf(id)[0].changes.map((c) => c.number), [411, 352]);
  assert.equal(T.cardsOf(id)[0].base, "main");
  assert.match((await pressAs(w.d, id, "fold", 411)).error!, /goes into frank\/stack, not main; nothing was done/);
  assert.ok(!w.calls.some((c) => c[1] === "merge"));
  fresh();
  const moved = world({ view: { 411: { headRefOid: "zzz" } } });
  const [id2] = await T.tick(moved.d);
  assert.match((await pressAs(moved.d, id2, "fold", 411)).error!, /changed since this summary/);
  assert.ok(!moved.calls.some((c) => c[1] === "merge"));
  T.cardsOf(id2)[0].changes[1].sha = "";
  moved.calls.length = 0;
  assert.match((await pressAs(moved.d, id2, "fold", 352)).error!, /no known head/);
  assert.equal(moved.calls.length, 0);
});

test("opened twice: a change already in or closed on GitHub, or a release already decided, is said on the card and written nowhere", async () => {
  fresh();
  const w = world({ view: { 411: { state: "MERGED" }, 352: { state: "CLOSED" } } });
  const [id] = await T.tick(w.d);
  w.calls.length = 0;
  assert.deepEqual(await pressAs(w.d, id, "severe", 411), { ok: true, already: true });
  assert.deepEqual(await pressAs(w.d, id, "fold", 352), { ok: true, already: true });
  assert.deepEqual(T.cardsOf(id)[0].changes.map((c) => c.state), ["folded", "closed"]);
  assert.deepEqual(w.calls.map((c) => c[1]), ["view", "view"]);                       // no comment, no undo, no merge
  fresh();
  const b = world({ me: "franktsai2008-eng", said: ["**Beta held**: the dev release of 2026-10-31 stays off beta (#340).\n\n— franktsai2008-eng (review session)"] });
  const [id2] = await T.tick(b.d);
  b.calls.length = 0;
  assert.deepEqual(await pressAs(b.d, id2, "pass"), { ok: true, already: true });
  assert.equal(T.cardsOf(id2)[0].verdict?.state, "hold");
  assert.ok(!b.calls.some((c) => c[1] === "comment"));
  assert.equal(T.decidedBefore([{ body: "**Beta passed**: the dev release of 2026-10-30 goes to beta whole (#1).\n\n— f" }], "2026-10-31"), "");
});

test("a card read back from disk is never stuck on busy", async () => {
  fresh();
  const w = world({ me: "franktsai2008-eng" });
  const [id] = await T.tick(w.d);
  const card = T.cardsOf(id)[0];
  card.changes[0].state = "busy"; card.verdict = { state: "busy" };
  T.putCard(id, card, () => {});                                                       // written as the engine stopped
  const { writeFileSync, mkdirSync } = await import("node:fs");   // the file kept, the memory dropped
  const file = join(process.env.SOL_STATE!, "..", "tonight", `${id}.json`);
  const kept = readFileSync(file, "utf8");
  T.forgetTonight(); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, kept);
  const back = T.cardsOf(id)[0];
  assert.deepEqual([back.changes[0].state, back.verdict?.state], [undefined, undefined]);
});

test("fold: folded on GitHub stays folded when its comment does not go (tried twice); severe says draft only when it is", async () => {
  fresh();
  const w = world({ fail: /^pr comment 411/ });
  const [id] = await T.tick(w.d);
  w.calls.length = 0;
  assert.deepEqual(await pressAs(w.d, id, "fold", 411), { ok: true });
  const c = T.cardsOf(id)[0].changes.find((x) => x.number === 411)!;
  assert.equal(c.state, "folded");
  assert.match(c.error!, /^into r; the comment on GitHub did not go/);
  assert.equal(w.calls.filter((x) => x[1] === "comment").length, 2);
  fresh();
  const nodraft = world({ fail: /^pr ready/ });
  const [id2] = await T.tick(nodraft.d);
  nodraft.calls.length = 0;
  assert.deepEqual(await pressAs(nodraft.d, id2, "severe", 352), { ok: true });
  const said = nodraft.calls.find((x) => x[1] === "comment")![6];
  assert.match(said, /^\*\*Sent back\*\* \(severe\)/);
  assert.doesNotMatch(said, /draft/);
});

test("a try that failed after its session was made puts the card on that session, not a second one", async () => {
  fresh();
  const w = world({ startFails: true });
  assert.deepEqual(await T.tick(w.d), []);                                             // the card did not go: no review yet
  assert.equal(w.started.length, 1);
  const later = { ...w.d, now: () => new Date("2026-10-31T13:20:00Z") };               // ten minutes on, tried again
  const [id] = await T.tick(later);
  assert.equal(w.started.length, 1);                                                   // the same session
  assert.equal(id, "session-1-abcdef");
  assert.equal(T.cardsOf(id)[0].kind, "tonight");
  assert.deepEqual(await T.tick(later), []);                                           // and now it is opened
});

test("the project's rhythm: Marco reviews dev, Frank beta, at 21:00 New York time", () => {
  const r = T.parseRhythm(readRepoRhythm())!;
  assert.deepEqual([r.review, r.zone, r.dev, r.beta], ["21:00", "America/New_York", ["marcocyl04-ux"], ["franktsai2008-eng"]]);
});
function readRepoRhythm() { return readFileSync(new URL("../../../.sol/rhythm.json", import.meta.url), "utf8"); }

// ---- the buttons renamed (#477): Into <project> is one merge commit, its branch deleted; a conflict or red check stops it ----

test("stopOf: a conflict, a red check, checks still running (only when told to wait); green or none is no stop", () => {
  // no checks at all, or a stale one, is waited on like one running; GitHub not knowing yet whether it merges stops it
  assert.match(T.stopOf({}), /no checks yet/);
  assert.match(T.stopOf({ mergeable: "UNKNOWN", statusCheckRollup: [] }), /not worked out yet/);
  assert.match(T.stopOf({ mergeable: "MERGEABLE", statusCheckRollup: [] }), /no checks yet/);
  assert.equal(T.stopOf({ mergeable: "MERGEABLE", statusCheckRollup: [] }, false), "", "the re-check does not wait on checks");
  assert.match(T.stopOf({ mergeable: "UNKNOWN", statusCheckRollup: [] }, false), /not worked out yet/, "but never merges blind");
  assert.match(T.stopOf({ statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "STALE" }] }), /still running/);
  assert.equal(T.stopOf({ mergeable: "MERGEABLE", statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "SUCCESS" }, { context: "ci/x", state: "SUCCESS" }] }), "");
  assert.match(T.stopOf({ mergeable: "CONFLICTING" }), /conflicts/);
  assert.equal(T.stopOf({ statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "FAILURE" }] }), "a check is red (engine)");
  assert.equal(T.stopOf({ statusCheckRollup: [{ name: "a", conclusion: "TIMED_OUT" }, { context: "b", state: "ERROR" }] }), "2 checks are red (a, b)");
  assert.match(T.stopOf({ statusCheckRollup: [{ name: "engine", status: "IN_PROGRESS" }] }), /still running/);
  assert.match(T.stopOf({ statusCheckRollup: [{ context: "ci/x", state: "PENDING" }] }), /still running/);
  assert.equal(T.stopOf({ statusCheckRollup: [{ name: "engine", status: "IN_PROGRESS" }] }, false), "");
  // only skipped or neutral checks is no checks yet, as the hand-in's checksOf reads it (#476); one success beside them is green
  assert.match(T.stopOf({ statusCheckRollup: [{ name: "skip", status: "COMPLETED", conclusion: "SKIPPED" }, { name: "n", status: "COMPLETED", conclusion: "NEUTRAL" }] }), /no checks yet/);
  assert.equal(T.stopOf({ statusCheckRollup: [{ name: "skip", status: "COMPLETED", conclusion: "SKIPPED" }, { name: "engine", status: "COMPLETED", conclusion: "SUCCESS" }] }), "");
});

test("dropBranch: only the author's own branch, with no other open PR on it; gone already is fine; any other refusal is said", async () => {
  const calls: string[][] = [];
  // GitHub as dropBranch asks it: the DELETE answers `del`, the two PR lists `head`/`base`, a habits page `page`
  const gh = (o: { del?: () => string; head?: string; base?: string; page?: string } = {}) => async (a: string[]) => {
    calls.push(a);
    const s = a.join(" ");
    if (s.startsWith("pr list") && s.includes("--head")) return o.head ?? "[]";
    if (s.startsWith("pr list") && s.includes("--base")) return o.base ?? "[]";
    if (s.includes("/contents/docs/people/")) { if (o.page === undefined) throw new Error("gh: Not Found (HTTP 404)"); return o.page; }
    return o.del ? o.del() : "";
  };
  const ok = gh();
  const me = { login: "franktsai2008-eng" };
  const own = (b: string) => ({ headRefName: b, isCrossRepository: false, author: me });
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "x", isCrossRepository: true }, "main"), "it is on a fork");
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "main" }, "main"), "main is a branch Sol never deletes");
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "beta" }, "main"), "beta is a branch Sol never deletes");
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "trunk" }, "trunk"), "trunk is a branch Sol never deletes");
  assert.equal(await T.dropBranch(ok, "o/r", {}, "main"), "GitHub did not say which branch it is");
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "a/../b" }, "main"), "GitHub did not say which branch it is");
  // each person's long-lived branches stay, as claims.ts keeps them nobody's claim
  for (const b of ["marco/plan", "franktsai2008-eng/mine", "isaac/shots"]) assert.equal(await T.dropBranch(ok, "o/r", { ...own(b) }, "main"), `${b} is a branch Sol never deletes`);
  assert.equal(calls.length, 0);
  // not the author's <prefix>/<name>: no prefix (shots, gh-pages), release/..., someone else's, no author said
  for (const b of ["shots", "gh-pages", "release/2026-10"]) assert.equal(await T.dropBranch(ok, "o/r", own(b), "main"), `${b} is not franktsai2008-eng's own branch, so Sol leaves it`);
  assert.equal(await T.dropBranch(gh({ page: "login: marcocyl04-ux\n" }), "o/r", own("marco/x-1"), "main"), "marco/x-1 is not franktsai2008-eng's own branch, so Sol leaves it");
  assert.equal(await T.dropBranch(ok, "o/r", { headRefName: "franktsai2008-eng/x" }, "main"), "franktsai2008-eng/x is not the author's own branch, so Sol leaves it");
  assert.ok(!calls.some((c) => c.includes("DELETE")), "nothing deleted so far");
  // the author's login as the prefix, or their first name by their habits page (sol/take's branch names)
  calls.length = 0;
  assert.equal(await T.dropBranch(ok, "o/r", own("franktsai2008-eng/a.b_c-1"), "main"), "");
  assert.deepEqual(calls.map((c) => c.slice(0, 8).join(" ")), [
    "pr list --repo o/r --state open --head franktsai2008-eng/a.b_c-1",
    "pr list --repo o/r --state open --base franktsai2008-eng/a.b_c-1",
    "api -X DELETE repos/o/r/git/refs/heads/franktsai2008-eng/a.b_c-1",
  ]);
  assert.equal(await T.dropBranch(gh({ page: "login: franktsai2008-eng\n\n# Frank\n" }), "o/r", own("frank/dot-12"), "main"), "");
  // another open PR from it (sent elsewhere) or stacked on it: it stays, said; GitHub not answering keeps it too
  calls.length = 0;
  assert.equal(await T.dropBranch(gh({ head: JSON.stringify([{ number: 420 }]) }), "o/r", own("franktsai2008-eng/x"), "main"), "#420 is open from it");
  assert.equal(await T.dropBranch(gh({ base: JSON.stringify([{ number: 421 }, { number: 422 }]) }), "o/r", own("franktsai2008-eng/x"), "main"), "#421, #422 are open on it");
  const deaf = async (a: string[]) => { calls.push(a); if (a[0] === "pr") throw new Error("gh: HTTP 502\nmore"); return ""; };
  assert.equal(await T.dropBranch(deaf, "o/r", own("franktsai2008-eng/x"), "main"), "GitHub did not say whether another PR uses it: gh: HTTP 502");
  assert.ok(!calls.some((c) => c.includes("DELETE")), "never deleted while another PR may use it");
  // the DELETE's answers
  assert.equal(await T.dropBranch(gh({ del: () => { throw new Error("gh: Reference does not exist (HTTP 422)"); } }), "o/r", own("franktsai2008-eng/x"), "main"), "");
  assert.equal(await T.dropBranch(gh({ del: () => { throw new Error("gh: Resource not accessible by integration (HTTP 403)\nmore"); } }), "o/r", own("franktsai2008-eng/x"), "main"), "GitHub would not delete it: gh: Resource not accessible by integration (HTTP 403)");
  // a ruleset or a protected branch also answers 422: only "Reference does not exist" (or a 404) is gone
  assert.match(await T.dropBranch(gh({ del: () => { throw new Error("gh: Cannot delete this branch: protected by a ruleset (HTTP 422)"); } }), "o/r", own("franktsai2008-eng/x"), "main"), /^GitHub would not delete it: .*ruleset/);
});

test("the button says the project's name on GitHub, even when the folder's remote names the repository's old home", async () => {
  fresh(); T.forgetNames();
  const old = { "marcocyl04-ux/ecosystem": "/work/r" };
  const w = world({ folders: old });
  const gh = w.d.gh;
  w.d.gh = async (a: string[]) => (a.join(" ") === "api repos/marcocyl04-ux/ecosystem --jq .name" ? "sol-dev\n" : gh(a));
  const [id] = await T.tick(w.d);
  const card = T.cardsOf(id)[0];
  assert.equal(card.into, "sol-dev");
  assert.match(w.started[0].text, /Into sol-dev \(one merge commit/);
  T.forgetNames();   // an engine started again: the card keeps the name
  const r = await T.press(w.d, { sessionId: id, verdict: "fold", number: 411, key: T.keyOf(id), window: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  const said = w.calls.find((c) => c[0] === "pr" && c[1] === "comment");
  assert.match(said![said!.length - 1], /^\*\*Into sol-dev\*\*/);
});

test("press, dev: a red check or a conflict stops Into r before anything is done; a branch that stays is said on the card", async () => {
  fresh();
  const red = world({ view: { 411: { statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "FAILURE" }] } } });
  const [id] = await T.tick(red.d);
  red.calls.length = 0;
  assert.equal((await pressAs(red.d, id, "fold", 411)).error, "#411 stays on its branch: a check is red (engine)");
  assert.deepEqual(red.calls.map((c) => c[1]), ["view"]);   // no merge, no delete, no comment
  assert.equal(T.cardsOf(id)[0].changes[0].state, undefined);   // can be pressed again once it is green
  fresh();
  const clash = world({ view: { 411: { mergeable: "CONFLICTING" } } });
  const [id2] = await T.tick(clash.d);
  assert.match((await pressAs(clash.d, id2, "fold", 411)).error!, /stays on its branch: it conflicts/);
  assert.ok(!clash.calls.some((c) => c[1] === "merge"));
  fresh();
  const fork = world({ view: { 411: { isCrossRepository: true } } });
  const [id3] = await T.tick(fork.d);
  assert.deepEqual(await pressAs(fork.d, id3, "fold", 411), { ok: true });
  assert.ok(!fork.calls.some((c) => c[0] === "api" && c[2] === "DELETE" && c[3].includes("/git/refs/")));
  const c = T.cardsOf(id3)[0].changes[0];
  assert.deepEqual([c.state, c.error], ["folded", "into r; its branch stays: it is on a fork"]);
  assert.match(fork.calls.find((x) => x[1] === "comment")![6], /^\*\*Into r\*\* .*its branch stays \(it is on a fork\)\./);
});

// ---- a backup for each night (#478) ----

/** Marco reviews dev, Frank backs it up; Frank reviews beta, Marco backs it up; the handover at 23:00 Taipei (15:00Z) */
const BACKED = JSON.stringify({ ...JSON.parse(RHYTHM), devBackup: ["franktsai2008-eng"], betaBackup: ["marcocyl04-ux"] });
const AT_HANDOVER = "2026-10-31T15:05:00Z";

test("the rhythm's backups and handover: read with their defaults, the handover after the review hour", () => {
  const r = T.parseRhythm(BACKED)!;
  assert.deepEqual([r.devBackup, r.betaBackup, r.handover], [["franktsai2008-eng"], ["marcocyl04-ux"], "23:00"]);
  const plain = T.parseRhythm(RHYTHM)!;
  assert.deepEqual([plain.devBackup, plain.betaBackup, plain.handover], [[], [], "23:00"]);
  assert.equal(T.parseRhythm(JSON.stringify({ devBackup: ["franktsai2008-eng"] })), null);   // a backup alone names no reviewer
  assert.equal(T.handoverOf(r, "2026-10-31").toISOString(), "2026-10-31T15:00:00.000Z");
  // a handover past midnight is the next morning's, still the same night
  assert.equal(T.handoverOf({ ...r, handover: "00:30" }, "2026-10-31").toISOString(), "2026-10-31T16:30:00.000Z");
});

test("who sees a night: the reviewer from the review hour, the backup from the handover, nobody else ever", () => {
  const r = T.parseRhythm(BACKED)!, early = new Date("2026-10-31T13:05:00Z"), late = new Date(AT_HANDOVER);
  assert.equal(T.seatOf(r, "dev", "MarcoCyl04-UX", "2026-10-31", early), "reviewer");
  assert.equal(T.seatOf(r, "dev", "franktsai2008-eng", "2026-10-31", early), "early");
  assert.equal(T.seatOf(r, "dev", "franktsai2008-eng", "2026-10-31", late), "backup");
  assert.equal(T.seatOf(r, "dev", "w0ngtap", "2026-10-31", late), "");
  assert.equal(T.seatOf(r, "dev", "", "2026-10-31", late), "");
  const due = (me: string, now: Date) => T.dueReviews({ repo: "o/r", rhythm: r, me, now, opened: () => false }).map((x) => `${x.role}${x.backup ? "+backup" : ""}`);
  assert.deepEqual(due("franktsai2008-eng", early), ["beta"]);
  assert.deepEqual(due("franktsai2008-eng", late), ["dev+backup", "beta"]);
  assert.deepEqual(due("marcocyl04-ux", early), ["dev"]);
  assert.deepEqual(due("marcocyl04-ux", late), ["dev", "beta+backup"]);
  assert.deepEqual(due("w0ngtap", late), []);
  assert.deepEqual(due("franktsai2008-eng", new Date("2026-10-31T21:00:00Z")), ["dev+backup", "beta"]);   // 5am: still the night
});

test("at the handover the backup's Sol opens what is still waiting; a beta release already decided opens nothing", async () => {
  fresh();
  const frank = world({ me: "franktsai2008-eng", rhythm: BACKED, now: AT_HANDOVER });
  const opened = await T.tick(frank.d);
  assert.equal(opened.length, 2);                                                     // the dev review (backup) and his beta review
  const dev = T.cardsOf(opened[0])[0];
  assert.deepEqual([dev.role, dev.backup, dev.mine, dev.reviewers, dev.backups], ["dev", true, true, ["marcocyl04-ux"], ["franktsai2008-eng"]]);
  assert.equal(dev.handoverAt, "2026-10-31T15:00:00.000Z");
  assert.match(frank.started[0].text, /names franktsai2008-eng as the dev review's backup, and the reviewer had not pressed by the handover hour/);
  assert.equal(T.cardsOf(opened[1])[0].backup, undefined);                            // his own night
  // Marco backs up beta: Frank passed it already, so nothing opens for Marco but his own dev review
  fresh();
  const marco = world({ rhythm: BACKED, now: AT_HANDOVER, said: ["**Beta passed**: the dev release of 2026-10-31 goes to beta whole (#340).\n\n— franktsai2008-eng (review session)"] });
  const mine = await T.tick(marco.d);
  assert.deepEqual(mine.map((id) => T.cardsOf(id)[0].role), ["dev"]);
  assert.deepEqual(await T.tick(marco.d), []);                                          // and not asked again tonight
  // not yet decided: it opens for him, as the backup
  fresh();
  const open = world({ rhythm: BACKED, now: AT_HANDOVER });
  const both = await T.tick(open.d);
  assert.deepEqual(both.map((id) => [T.cardsOf(id)[0].role, T.cardsOf(id)[0].backup ?? false]), [["dev", false], ["beta", true]]);
  // before the handover the backup's Sol opens nothing of the other night
  fresh();
  const before = world({ me: "franktsai2008-eng", rhythm: BACKED });
  assert.deepEqual((await T.tick(before.d)).map((id) => T.cardsOf(id)[0].role), ["beta"]);
});

test("only the reviewer and the backup press, the backup from the handover; checked by the engine, whatever the window shows", async () => {
  fresh();
  const marco = world({ rhythm: BACKED });
  const [id] = await T.tick(marco.d);
  const card = T.cardsOf(id)[0];
  assert.deepEqual([card.backups, card.handoverAt], [["franktsai2008-eng"], "2026-10-31T15:00:00.000Z"]);
  const isaac = world({ me: "w0ngtap", rhythm: BACKED, now: AT_HANDOVER });
  assert.match((await pressAs(isaac.d, id, "severe", 411)).error!, /only marcocyl04-ux or their backup franktsai2008-eng presses these/);
  const frankEarly = world({ me: "franktsai2008-eng", rhythm: BACKED });
  assert.match((await pressAs(frankEarly.d, id, "severe", 411)).error!, /marcocyl04-ux's until the handover hour/);
  assert.equal(isaac.calls.length + frankEarly.calls.length, 0);                      // GitHub never asked
  const frank = world({ me: "franktsai2008-eng", rhythm: BACKED, now: AT_HANDOVER });
  assert.deepEqual(await pressAs(frank.d, id, "severe", 411), { ok: true });
  assert.match(frank.calls.find((c) => c[1] === "comment")!.at(-1)!, /— franktsai2008-eng \(review session\)/);
  // a card's words name both
  assert.equal(T.pressersOf(card), "marcocyl04-ux or their backup franktsai2008-eng");
  assert.equal(T.pressersOf({ reviewers: ["a"], backups: [] }), "a");
});

test("a press by either closes it for both: on the other's press, and on the other's card within five minutes", async () => {
  fresh();
  const rhythm = T.parseRhythm(BACKED)!;
  const marco = world({ rhythm: BACKED });
  const [mine] = await T.tick(marco.d);
  // Frank's Sol at the handover, its own card of the same night
  const frank = world({ me: "franktsai2008-eng", rhythm: BACKED, now: AT_HANDOVER });
  const r = await T.openReview(frank.d, { repo: "o/r", folder: "/work/r", role: "dev", night: "2026-10-31", rhythm, backup: true });
  assert.ok(r.session);
  // Frank sent #411 back severe: on GitHub it is a draft wearing the label. Marco's fold is told, and nothing is written
  const after = world({ rhythm: BACKED, now: AT_HANDOVER, view: { 411: { isDraft: true, labels: [{ name: "sent-back:severe" }] } as any, 352: { state: "MERGED" } } });
  assert.deepEqual(await pressAs(after.d, mine, "fold", 411), { ok: true, already: true });
  assert.ok(!after.calls.some((c) => c[1] === "merge" || c[1] === "comment"));
  assert.equal(T.cardsOf(mine)[0].changes.find((c) => c.number === 411)!.state, "severe");
  // #352 folded by Frank: Marco's card says so at the next look, without a press
  assert.equal(await T.refreshCards(after.d), 1);
  assert.equal(T.cardsOf(mine)[0].changes.find((c) => c.number === 352)!.state, "folded");
  assert.ok(after.items.some((m: any) => m.sessionId === mine && m.item.kind === "tonight"));
  assert.equal(await T.refreshCards(after.d), 0);                                       // once in five minutes
  // a change sent back on an earlier night wears the label already: only folded or closed counts for it
  assert.equal(T.doneOnGitHub({ isDraft: true, labels: [{ name: "sent-back:slight" }] }, { back: true }), "");
  assert.equal(T.doneOnGitHub({ isDraft: true, labels: [{ name: "sent-back:slight" }] }, {}), "slight");
  assert.equal(T.doneOnGitHub({ isDraft: true, labels: [] }, {}), "");                  // its author took it back: as before
});

test("a card made for someone who is not the night's reviewer or backup shows nothing", async () => {
  fresh();
  const w = world();
  const [id] = await T.tick(w.d);
  T.putCard(id, { ...T.cardsOf(id)[0], mine: false }, () => {});
  assert.deepEqual(T.withTonight(id, [{ id: "m1", kind: "me" } as any]).map((i) => i.kind), ["me"]);
});

test("a verdict on the digest counts only when the night's reviewer or backup wrote it: anyone else's words open and close nothing", async () => {
  const fake = "**Beta passed**: the dev release of 2026-10-31 goes to beta whole (#340).\n\n— w0ngtap (review session)";
  assert.equal(T.decidedBefore([{ body: fake, author: { login: "w0ngtap" }, createdAt: "2026-10-31T15:10:00Z" }], "2026-10-31", { reviewers: ["franktsai2008-eng"], backups: ["marcocyl04-ux"], from: 0 }), "");
  assert.equal(T.decidedBefore([{ body: fake, author: { login: "MarcoCyl04-UX" }, createdAt: "2026-10-31T15:10:00Z" }], "2026-10-31", { reviewers: ["franktsai2008-eng"], backups: ["marcocyl04-ux"], from: Date.parse("2026-10-31T15:00:00Z") }), "pass");
  // Marco backs up beta: someone else's "Beta passed" does not keep his card from opening at the handover
  fresh();
  const marco = world({ rhythm: BACKED, now: AT_HANDOVER, said: [fake] });
  const both = await T.tick(marco.d);
  assert.deepEqual(both.map((id) => [T.cardsOf(id)[0].role, T.cardsOf(id)[0].backup ?? false]), [["dev", false], ["beta", true]]);
  // nor does it close the card: a refresh leaves it open, and his press writes the verdict
  const beta = both[1];
  const later = world({ rhythm: BACKED, now: "2026-10-31T15:20:00Z", said: [fake] });
  assert.equal(await T.refreshCards(later.d), 0);
  assert.equal(T.cardsOf(beta)[0].verdict?.state, undefined);
  assert.deepEqual(await pressAs(later.d, beta, "hold"), { ok: true });
  assert.ok(later.calls.some((c) => c[0] === "issue" && c[1] === "comment"));
});

test("the backup's word on the digest counts from the handover only, and an edited one never: the reviewer's press is not told 'already'", async () => {
  const held = (at: string, more: { edited?: true } = {}) => ({ body: "**Beta held**: the dev release of 2026-10-31 stays off beta (#340).\n\n— marcocyl04-ux (review session)", at, ...more });
  // Marco, the beta backup, wrote "Beta held" by hand at 22:00 Taipei (14:00Z), before the 23:00 handover
  fresh();
  const frank = world({ me: "franktsai2008-eng", rhythm: BACKED, now: "2026-10-31T14:30:00Z", said: [held("2026-10-31T14:00:00Z")] });
  const [beta] = await T.tick(frank.d);                                               // before the handover: his beta review alone
  assert.equal(T.cardsOf(beta)[0].role, "beta");
  assert.deepEqual(await pressAs(frank.d, beta, "pass"), { ok: true });                // Into beta is written
  assert.ok(frank.calls.some((c) => c[0] === "issue" && c[1] === "comment"));
  // after the handover it counts: the press is told, and nothing is written twice
  fresh();
  const later = world({ me: "franktsai2008-eng", rhythm: BACKED, now: "2026-10-31T15:30:00Z", said: [held("2026-10-31T15:10:00Z")] });
  const [, beta2] = await T.tick(later.d);
  assert.deepEqual(await pressAs(later.d, beta2, "pass"), { ok: true, already: true });
  assert.equal(T.cardsOf(beta2)[0].verdict?.state, "hold");
  // an edited one never counts, whoever wrote it and whenever
  fresh();
  const ed = world({ me: "franktsai2008-eng", rhythm: BACKED, now: "2026-10-31T15:30:00Z", said: [held("2026-10-31T15:10:00Z", { edited: true }), { body: "**Beta passed**: the dev release of 2026-10-31 goes to beta whole (#340).\n\n— franktsai2008-eng (review session)", at: "2026-10-31T13:10:00Z", edited: true }] });
  const [, beta3] = await T.tick(ed.d);
  assert.deepEqual(await pressAs(ed.d, beta3, "pass"), { ok: true });
  // the same rule, pure
  const by = { reviewers: ["franktsai2008-eng"], backups: ["marcocyl04-ux"], from: Date.parse("2026-10-31T15:00:00Z") };
  assert.equal(T.decidedBefore([{ body: held("").body, author: { login: "marcocyl04-ux" }, createdAt: "2026-10-31T14:59:00Z" }], "2026-10-31", by), "");
  assert.equal(T.decidedBefore([{ body: held("").body, author: { login: "marcocyl04-ux" }, createdAt: "2026-10-31T15:00:00Z" }], "2026-10-31", by), "hold");
});

test("the backup's card ends with the night: no press after `until`, and no seat (#478)", async () => {
  fresh();
  const frank = world({ me: "franktsai2008-eng", rhythm: BACKED, now: AT_HANDOVER });
  const [dev] = await T.tick(frank.d);
  const card = T.cardsOf(dev)[0];
  assert.equal(card.untilAt, "2026-10-31T22:00:00.000Z");                               // 06:00 Taipei the next morning
  const nextDay = world({ me: "franktsai2008-eng", rhythm: BACKED, now: "2026-11-01T13:30:00Z" });   // 21:30 the day after
  assert.match((await pressAs(nextDay.d, dev, "fold", 411)).error!, /the night of 2026-10-31 has ended .*as its backup you press only until then/);
  assert.equal(nextDay.calls.length, 0);
  const r = T.parseRhythm(BACKED)!;
  assert.equal(T.seatOf(r, "dev", "franktsai2008-eng", "2026-10-31", new Date("2026-10-31T22:00:00Z")), "");
  assert.equal(T.seatOf(r, "dev", "marcocyl04-ux", "2026-10-31", new Date("2026-10-31T22:00:00Z")), "reviewer");   // the reviewer's card is as before
});

test("a backup counts only with a zone, a handover inside the night, and, on the beta night, both rhythm files agreeing (#478)", async () => {
  const r = T.parseRhythm(BACKED)!;
  assert.deepEqual([T.backupsOf(r, "dev"), T.backupOff(r, "dev")], [["franktsai2008-eng"], ""]);
  const noZone = { ...r, zone: "" };
  assert.deepEqual(T.backupsOf(noZone, "dev"), []);
  assert.match(T.backupOff(noZone, "dev"), /names a dev backup but no zone/);
  assert.equal(T.seatOf(noZone, "dev", "franktsai2008-eng", "2026-10-31", new Date(AT_HANDOVER)), "");
  assert.match(T.backupOff({ ...r, handover: "07:00" }, "dev"), /not between the review hour 21:00 and 06:00/);
  assert.equal(T.handoverFits({ review: "21:00", until: "06:00", handover: "00:30" }), true);
  assert.equal(T.handoverFits({ review: "21:00", until: "06:00", handover: "21:00" }), false);
  // read from the record: the committed file must say the same beta backup, handover and zone
  fresh();
  T.setRhythmSource(async () => JSON.parse(BACKED));
  try {
    const marco = world({ rhythm: RHYTHM, now: AT_HANDOVER });                          // the file names no backup
    const got = (await T.rhythmOf(marco.d, "o/r"))!;
    assert.equal(got.from, ".sol/project.json");
    assert.match(T.agreeOn(got), /betaBackup: \.sol\/project\.json says marcocyl04-ux, \.sol\/rhythm\.json says nobody/);
    assert.deepEqual([T.backupsOf(got, "beta"), T.backupsOf(got, "dev")], [[], ["franktsai2008-eng"]]);   // the dev backup is the record's alone
    assert.match((await T.openNow(marco.d, { role: "beta" })).error!, /does not open for its backup: .*NucBox beta pass/);
    T.forgetRhythms();
    const agreed = world({ rhythm: BACKED, now: AT_HANDOVER });
    const both = (await T.rhythmOf(agreed.d, "o/r"))!;
    assert.deepEqual([T.agreeOn(both), T.backupsOf(both, "beta")], ["", ["marcocyl04-ux"]]);
  } finally { T.setRhythmSource(null); fresh(); }
  // refusals say which file and values they used
  fresh();
  const isaac = world({ me: "w0ngtap", rhythm: BACKED, now: AT_HANDOVER });
  assert.match((await T.openNow(isaac.d, { role: "dev" })).error!, /\(\.sol\/rhythm\.json: dev marcocyl04-ux, dev backup franktsai2008-eng, handover 23:00 Asia\/Taipei\)/);
  // a backup who is the reviewer too is said once
  assert.equal(T.pressersOf({ reviewers: ["marcocyl04-ux"], backups: ["MarcoCyl04-UX"] }), "marcocyl04-ux");
});

test("openNow and the backup: refused before the handover, opened after it", async () => {
  fresh();
  const early = world({ me: "franktsai2008-eng", rhythm: BACKED });
  assert.match((await T.openNow(early.d, { role: "dev" })).error!, /the dev review of o\/r is marcocyl04-ux's until 11pm; it opens for you then/);
  assert.equal(early.started.length, 0);
  const late = world({ me: "franktsai2008-eng", rhythm: BACKED, now: AT_HANDOVER });
  const r = await T.openNow(late.d, { role: "dev" });
  assert.equal(T.cardsOf(r.session!)[0].backup, true);
});
