// Sent back (#421, team/tonight.ts press, team/sentback.ts, team/broke.ts): a slight send back is a draft with a label and
// the reviewer's words to fix; the reviewer's own Sol re-checks it alone before `until` and takes it in only on a pass, at
// the head it showed its agent, through the one tool that session alone has. Every case outside the limits becomes
// severe or is left alone, never taken in. Severe shows "back from last night". "This broke" labels the PR and tells its
// author and the beta reviewer; brokenIn names what a release holds.
// GitHub is a function that answers from a small made-up repo and writes down its arguments; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-sentback-")), "work.json");
const T = await import("../src/team/tonight.ts");
const S = await import("../src/team/sentback.ts");
const B = await import("../src/team/broke.ts");
const Tools = await import("../src/work/tools.ts");
const { noteLine } = await import("../src/team/feed.ts");
type Deps = import("../src/team/tonight.ts").TonightDeps;

// New York; the night of Oct 31 ends at 06:00 on Nov 1, after the clocks went back (EST): 11:00Z
const RHYTHM = JSON.stringify({ review: "21:00", until: "06:00", release: "09:00", dev: ["marcocyl04-ux", "w0ngtap"], beta: ["franktsai2008-eng"], zone: "America/New_York" });
const H0 = "a".repeat(40), H1 = "b".repeat(40), H2 = "c".repeat(40);
const NIGHT = "2026-10-31";
const SENT_AT = "2026-11-01T01:30:00Z";   // 21:30 on Oct 31 in New York
const SENT = `**Sent back** (slight) in the dev review of ${NIGHT}: a small fix tonight, then it folds in.\n\n**What to fix:** the dot must stay a dot in the email field\n\n${T.sentMark(NIGHT, H0)}\n\n— marcocyl04-ux (review session)`;
const DIFF = "diff --git a/sol/engine/src/browser.ts b/sol/engine/src/browser.ts\n--- a/sol/engine/src/browser.ts\n+++ b/sol/engine/src/browser.ts\n@@ -1,2 +1,2 @@\n-const dot = 'Delete';\n+const dot = '.';\n";
const PR = { number: 411, title: "Browser: a typed dot", url: "https://github.com/o/r/pull/411", state: "OPEN", isDraft: false, headRefOid: H1, baseRefName: "main", headRefName: "franktsai2008-eng/dot", author: { login: "franktsai2008-eng" }, labels: [{ name: "sent-back:slight" }] };

type O = { me?: string; now?: string; prs?: any[]; events?: string; comments?: any[]; status?: string; diff?: string; view?: any; present?: boolean; fail?: RegExp };
function world(o: O = {}) {
  const calls: string[][] = [], started: { id?: string; cwd: string; repo: string; title: string; text: string }[] = [], pings: any[] = [];
  const d: Deps = {
    me: () => o.me ?? "marcocyl04-ux",
    present: () => o.present ?? true,
    folders: async () => ({ "o/r": "/work/r" }),
    now: () => new Date(o.now ?? "2026-11-01T03:00:00Z"),   // 23:00 on Oct 31 in New York
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (o.fail && o.fail.test(s)) throw new Error("GraphQL: Head branch was modified\nmore");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.startsWith("api repos/o/r --jq .default_branch")) return "main\n";
      if (s.startsWith("pr list") && s.includes("sent-back:slight")) return JSON.stringify(o.prs ?? [PR]);
      if (s.startsWith("api repos/o/r/issues/411/events")) return o.events ?? `marcocyl04-ux\t${SENT_AT}\n`;
      if (s.startsWith("api repos/o/r/issues/411/comments")) return (o.comments ?? [{ author: "marcocyl04-ux", at: SENT_AT, body: SENT }]).map((c) => JSON.stringify(c)).join("\n");
      if (s.startsWith("api repos/o/r/compare/") && s.includes(".status")) return (o.status ?? "ahead") + "\n";
      if (s.startsWith("api repos/o/r/compare/")) return o.diff ?? DIFF;
      if (s.startsWith("pr view")) return JSON.stringify(o.view ?? PR);
      return "";
    },
    start: async (a) => { started.push(a); return a.id ?? "no-id"; },
    bus: () => {},
    say: () => {},
    ping: (p) => pings.push(p),
  };
  return { d, calls, started, pings };
}
const fresh = () => { T.forgetTonight(); T.forgetRhythms(); S.forgetSentBack(); };
const said = (calls: string[][]) => calls.filter((c) => c[0] === "pr" && c[1] === "comment").map((c) => c[6]);
const merged = (calls: string[][]) => calls.filter((c) => c[0] === "pr" && c[1] === "merge");
const labels = (calls: string[][]) => calls.filter((c) => c[0] === "api" && c[2] === "POST" && /labels$/.test(c[3])).map((c) => c[5])
  .concat(calls.filter((c) => c[0] === "api" && c[2] === "DELETE" && c[3].includes("/labels/")).map((c) => "-" + decodeURIComponent(c[3].split("/").pop()!)));
const drafted = (calls: string[][]) => calls.some((c) => c[0] === "pr" && c[1] === "ready" && c.includes("--undo"));

// ---- the press in the dev review ----

const OPEN = [{ number: 411, title: "Browser: a typed dot", url: "https://github.com/o/r/pull/411", body: "x", isDraft: false, headRefOid: H0, baseRefName: "main", author: { login: "franktsai2008-eng" }, labels: [], files: [{ path: "sol/engine/src/browser.ts" }], additions: 2, deletions: 1 }];
async function reviewWorld(o: { fail?: RegExp; view?: object; open?: any[] } = {}) {
  const w = world({ now: "2026-11-01T01:05:00Z", fail: o.fail });
  const gh = w.d.gh;
  w.d.gh = async (args) => {
    const s = args.join(" ");
    if (s.startsWith("pr list") && s.includes("--state open")) { w.calls.push(args); return JSON.stringify(o.open ?? OPEN); }
    if (s.includes(".github/CODEOWNERS")) { w.calls.push(args); return ""; }
    if (s.startsWith("pr view")) { w.calls.push(args); if (o.fail?.test(s)) throw new Error("x"); return JSON.stringify({ state: "OPEN", baseRefName: "main", headRefOid: H0, statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "SUCCESS" }], ...(o.view ?? {}) }); }
    return gh(args);
  };
  const [id] = await T.tick(w.d);
  w.calls.length = 0;
  return { ...w, id, press: (verdict: "slight" | "severe" | "fold", fix?: string) => T.press(w.d, { sessionId: id, verdict, number: 411, key: T.keyOf(id), window: true, ...(fix !== undefined ? { fix } : {}) }) };
}

test("slight: says what to fix, or nothing happens; then a draft, the label, the words and the head it was sent back at", async () => {
  fresh();
  const w = await reviewWorld();
  assert.ok(w.id);
  assert.match((await w.press("slight")).error!, /say what to fix in #411/);
  assert.match((await w.press("slight", "  <!-- -->  ")).error!, /say what to fix/);
  assert.equal(w.calls.length, 0);
  assert.deepEqual(await w.press("slight", "the dot must stay a dot"), { ok: true });
  assert.ok(drafted(w.calls));
  assert.deepEqual(labels(w.calls), ["labels[]=sent-back:slight", "-sent-back:severe"]);
  const words = said(w.calls)[0];
  assert.match(words, /^\*\*Sent back\*\* \(slight\) in the dev review of 2026-10-31/);
  assert.match(words, /\*\*What to fix:\*\* the dot must stay a dot/);
  assert.equal(T.SENT_MARK.exec(words)?.[2], H0);
  assert.equal(S.fixOf(words), "the dot must stay a dot");
  // the comment goes before the label, so the re-check never sees the label without its words
  const at = (f: (c: string[]) => boolean) => w.calls.findIndex(f);
  assert.ok(at((c) => c[1] === "comment") < at((c) => c[0] === "api" && c[2] === "POST"));
});

test("slight: a PR that cannot be made a draft again is not sent back; severe goes on and says so", async () => {
  fresh();
  const w = await reviewWorld({ fail: /^pr ready/ });
  assert.match((await w.press("slight", "fix it")).error!, /could not be made a draft again/);
  assert.deepEqual([labels(w.calls), said(w.calls)], [[], []]);
  w.calls.length = 0;
  assert.deepEqual(await w.press("severe", "it needs a second look"), { ok: true });
  assert.deepEqual(labels(w.calls), ["labels[]=sent-back:severe", "-sent-back:slight"]);
  assert.doesNotMatch(said(w.calls)[0], /sol:sent-back/);   // only a slight one carries the marker
});

test("into takes the sent-back labels off; severe ones show back from last night on the next card", async () => {
  fresh();
  const w = await reviewWorld({ open: [{ ...OPEN[0], labels: [{ name: "sent-back:severe" }] }] });
  const card = T.cardsOf(w.id)[0];
  assert.equal(card.changes[0].back, true);
  assert.match(T.firstWords(card, "marcocyl04-ux"), /back from last night/);
  assert.deepEqual(await w.press("fold"), { ok: true });
  assert.deepEqual(labels(w.calls), ["-sent-back:slight", "-sent-back:severe"]);
  assert.equal(T.changeOf(OPEN[0] as any, "").back, undefined);
});

// ---- the rules of the re-check (pure) ----

const rhythm = () => T.parseRhythm(RHYTHM)!;
const check = (o: Partial<Parameters<typeof S.slightCheck>[0]> = {}) => S.slightCheck({
  pr: PR, events: [{ actor: "marcocyl04-ux", at: SENT_AT }], comments: [{ author: "marcocyl04-ux", at: SENT_AT, body: SENT }],
  rhythm: rhythm(), me: "marcocyl04-ux", now: new Date("2026-11-01T03:00:00Z"), base: "main", ...o,
});

test("slightCheck: go, with the night, the head sent back at, the head now and the words to fix", () => {
  assert.deepEqual(check(), { go: { night: NIGHT, from: H0, head: H1, fix: "the dot must stay a dot in the email field" } });
  assert.equal(S.deadlineOf(rhythm(), NIGHT).toISOString(), "2026-11-01T11:00:00.000Z");   // 06:00 EST, the clocks went back
});

test("slightCheck: every case outside the limits is never a go", () => {
  const kind = (v: ReturnType<typeof S.slightCheck>) => Object.keys(v)[0];
  // not ours to touch: labelled by the author, by another dev reviewer, not labelled at all, closed
  assert.equal(kind(check({ events: [{ actor: "franktsai2008-eng", at: SENT_AT }] })), "skip");
  assert.equal(kind(check({ events: [{ actor: "w0ngtap", at: SENT_AT }] })), "skip");
  assert.equal(kind(check({ events: [] })), "skip");
  assert.equal(kind(check({ pr: { ...PR, labels: [] } })), "skip");
  assert.equal(kind(check({ pr: { ...PR, state: "MERGED" } })), "skip");
  // the reviewer's: severe
  assert.match((check({ comments: [] }) as any).severe, /no send back/);
  assert.match((check({ comments: [{ author: "franktsai2008-eng", at: SENT_AT, body: SENT }] }) as any).severe, /no send back/);   // the author's forged words
  assert.match((check({ events: [{ actor: "marcocyl04-ux", at: "2026-10-29T01:30:00Z" }] }) as any).severe, /not made on the night/);
  assert.match((check({ comments: [{ author: "marcocyl04-ux", at: SENT_AT, body: SENT.replace(/\*\*What to fix:\*\*[^\n]*/, "") }] }) as any).severe, /does not say what to fix/);
  assert.match((check({ pr: { ...PR, baseRefName: "frank/stack" } }) as any).severe, /now goes into frank\/stack, not main/);
  const late = check({ now: new Date("2026-11-01T11:00:00Z") }) as any;
  assert.deepEqual([late.draft, /ended before it was re-checked/.test(late.severe)], [false, true]);
  // not yet
  assert.match((check({ pr: { ...PR, isDraft: true } }) as any).wait, /not marked ready/);
  assert.match((check({ pr: { ...PR, headRefOid: H0 } }) as any).wait, /no new commits/);
});

test("slightCheck: the dev night's backup's own send back is re-checked by the backup's Sol, from the handover only (#478)", () => {
  const backed = { ...rhythm(), devBackup: ["franktsai2008-eng"] };
  const LATE = "2026-11-01T03:30:00Z";   // 23:30 on Oct 31 in New York, after the 23:00 handover
  const sent = (put: string, said = put) => ({ events: [{ actor: "franktsai2008-eng", at: put }], comments: [{ author: "franktsai2008-eng", at: said, body: SENT }], now: new Date("2026-11-01T04:00:00Z") });
  assert.ok("go" in check({ ...sent(LATE), rhythm: backed, me: "franktsai2008-eng" }));
  // at 21:30, before the handover, it was still Marco's: a backup's send back then (by hand on GitHub) is never a go
  const early = check({ ...sent(SENT_AT), rhythm: backed, me: "franktsai2008-eng" }) as any;
  assert.deepEqual([early.draft, /before the handover hour \(23:00\)/.test(early.severe)], [true, true]);
  assert.ok("severe" in check({ ...sent(LATE, SENT_AT), rhythm: backed, me: "franktsai2008-eng" }));   // its comment early
  assert.ok("severe" in check({ ...sent(SENT_AT, LATE), rhythm: backed, me: "franktsai2008-eng" }));   // its label early
  assert.ok("go" in check({ now: new Date("2026-11-01T04:00:00Z"), rhythm: backed }));             // the reviewer's at 21:30: as before
  assert.ok("skip" in check({ ...sent(LATE), rhythm: backed }));                       // Marco's Sol leaves it to Frank's
  assert.ok("skip" in check({ ...sent(LATE), me: "franktsai2008-eng" }));              // no backup named: not a reviewer's
  assert.ok("skip" in check({ ...sent(LATE), rhythm: { ...backed, zone: "" }, me: "franktsai2008-eng" }));   // no zone: no backup
});

test("the window between the label and its comment: a fresh label with no comment waits, an old one is severe", () => {
  // the press writes the comment first, but GitHub may list the label before the comment: the tick must not call a
  // send back that is still being made one without words, and `severed` would keep it that way
  const put = new Date(Date.parse(SENT_AT) + 60_000);
  const fresh = check({ comments: [], now: new Date(+put + 2 * 60_000), events: [{ actor: "marcocyl04-ux", at: put.toISOString() }] }) as any;
  assert.match(fresh.wait, /comment is not there yet/);
  const old = check({ comments: [], now: new Date(+put + S.FRESH), events: [{ actor: "marcocyl04-ux", at: put.toISOString() }] }) as any;
  assert.match(old.severe, /no send back/);
});

test("overLimits: a rewritten history, the checks and rules, a big fix or nothing changed are refused", () => {
  assert.equal(S.overLimits("ahead", DIFF), null);
  assert.match(S.overLimits("diverged", DIFF)!, /history was rewritten/);
  assert.match(S.overLimits("behind", DIFF)!, /history was rewritten/);
  assert.match(S.overLimits("identical", "")!, /nothing changed/);
  assert.match(S.overLimits("ahead", DIFF.replace(/sol\/engine\/src\/browser\.ts/g, ".github/workflows/ci.yml"))!, /\.github/);
  const big = "diff --git a/x b/x\n" + Array.from({ length: 301 }, (_, i) => `+line ${i}`).join("\n");
  assert.match(S.overLimits("ahead", big)!, /301 lines/);
  assert.deepEqual(S.diffStats(DIFF), { files: ["sol/engine/src/browser.ts"], lines: 2 });
});

// ---- the re-check ----

test("tick: the re-check opens once, in my folder, with the words and the diff fenced, and its tool is that session's alone", async () => {
  fresh();
  const w = world();
  const did = await S.sentBackTick(w.d);
  assert.equal(did.length, 1);
  const s = w.started[0];
  assert.ok(s.id);
  assert.deepEqual([s.cwd, s.repo, s.title], ["/work/r", "o/r", `re-check #411 · ${NIGHT}`]);
  assert.match(s.text, /<room-content [0-9a-f]+>[\s\S]*the dot must stay a dot[\s\S]*\+const dot = '\.';[\s\S]*<\/room-content/);
  assert.match(s.text, /recheck_answer/);
  assert.match(s.text, /never merge or push yourself/);
  assert.doesNotMatch(s.text, /\bfold/i);   // #477
  assert.deepEqual(Tools.toolsOnlyFor(s.id!).map((t) => t.name), ["recheck_answer"]);
  assert.deepEqual(Tools.toolsOnlyFor("another-session"), []);
  assert.match((await Tools.runOnlyTool("another-session", "recheck_answer", { pass: true, reason: "fine" })).content[0].text, /not this session's tool/);
  assert.ok(w.calls.some((c) => c.join(" ") === `api repos/o/r/compare/${H0}...${H1} --jq .status`));
  assert.deepEqual(await S.sentBackTick(w.d), []);   // once a head
  assert.equal(w.started.length, 1);
  assert.equal(merged(w.calls).length, 0);           // opening takes nothing in
});

test("a pass takes that change alone into r, one merge commit and its branch deleted, at the head shown, and posts the reason signed; the tool is gone after one answer", async () => {
  fresh();
  const w = world();
  await S.sentBackTick(w.d);
  const id = w.started[0].id!;
  w.calls.length = 0;
  assert.match((await Tools.runOnlyTool(id, "recheck_answer", { pass: true })).content[0].text, /a reason/);   // asked again, not used up
  const r = await Tools.runOnlyTool(id, "recheck_answer", { pass: true, reason: "the dot stays a dot; nothing else changed" });
  assert.match(r.content[0].text, /^#411 went into r\./);
  assert.deepEqual(merged(w.calls), [["pr", "merge", "411", "--repo", "o/r", "--merge", "--match-head-commit", H1]]);
  assert.ok(w.calls.some((c) => c.join(" ") === "api -X DELETE repos/o/r/git/refs/heads/franktsai2008-eng/dot"));
  assert.deepEqual(labels(w.calls), ["-sent-back:slight"]);
  assert.equal(said(w.calls)[0], `**Re-checked**, and into r as one merge commit (its branch is deleted), after the slight send back of the dev review of ${NIGHT}: the dot stays a dot; nothing else changed\n\n— marcocyl04-ux's agent`);
  assert.equal(noteLine({ repo: "o/r", number: 411, at: SENT_AT, author: "marcocyl04-ux", body: said(w.calls)[0] })?.text, "re-checked #411, into r");
  assert.deepEqual(w.pings.map((p) => p.to), ["franktsai2008-eng"]);
  assert.deepEqual(Tools.toolsOnlyFor(id), []);
  assert.match((await Tools.runOnlyTool(id, "recheck_answer", { pass: true, reason: "again" })).content[0].text, /not this session's tool/);
  assert.equal(merged(w.calls).length, 1);
});

test("a fail, a change that moved, a draft, a new base, a red check or an answer after the night: severe, never taken in", async () => {
  const cases: [string, O, { pass: boolean; reason: string }, RegExp, boolean][] = [
    ["fail", {}, { pass: false, reason: "the dot is still eaten in the password field" }, /still eaten/, true],
    ["moved", { view: { ...PR, headRefOid: H2 } }, { pass: true, reason: "ok" }, /changed during the re-check/, true],
    ["draft", { view: { ...PR, isDraft: true } }, { pass: true, reason: "ok" }, /made a draft during/, true],
    ["base", { view: { ...PR, baseRefName: "dev" } }, { pass: true, reason: "ok" }, /go into dev/, true],
    ["red", { view: { ...PR, statusCheckRollup: [{ name: "engine", status: "COMPLETED", conclusion: "FAILURE" }] } }, { pass: true, reason: "ok" }, /stays on its branch: a check is red \(engine\)/, false],
    ["conflict", { view: { ...PR, mergeable: "CONFLICTING" } }, { pass: true, reason: "ok" }, /it conflicts/, false],
    ["unknown", { view: { ...PR, mergeable: "UNKNOWN" } }, { pass: true, reason: "ok" }, /not worked out yet whether it merges cleanly/, false],
  ];
  for (const [name, o, ans, why, draft] of cases) {
    fresh();
    const w = world(o);
    await S.sentBackTick(w.d);
    const id = w.started[0].id!;
    w.calls.length = 0;
    assert.match((await Tools.runOnlyTool(id, "recheck_answer", ans)).content[0].text, /^not taken into r/, name);
    assert.equal(merged(w.calls).length, 0, name);
    assert.deepEqual(labels(w.calls), ["labels[]=sent-back:severe", "-sent-back:slight"], name);
    assert.match(said(w.calls)[0], why, name);
    assert.match(said(w.calls)[0], /^\*\*Sent back\*\* \(severe\) after the slight send back/, name);
    assert.equal(drafted(w.calls), draft, name);
  }
  // the answer comes after `until`
  fresh();
  const w = world();
  await S.sentBackTick(w.d);
  const id = w.started[0].id!;
  w.calls.length = 0;
  w.d.now = () => new Date("2026-11-01T11:00:00Z");
  assert.match((await Tools.runOnlyTool(id, "recheck_answer", { pass: true, reason: "ok" })).content[0].text, /^not taken into r/);
  assert.equal(merged(w.calls).length, 0);
  assert.equal(drafted(w.calls), false);
  // GitHub refuses the merge: severe, said why
  fresh();
  const g = world({ fail: /^pr merge/ });
  await S.sentBackTick(g.d);
  assert.match((await Tools.runOnlyTool(g.started[0].id!, "recheck_answer", { pass: true, reason: "ok" })).content[0].text, /^not taken into r.*did not go into r: GraphQL: Head branch was modified/);
});

test("tick: after until, too big, rewritten, not my send back, not a dev reviewer, my window away: no re-check", async () => {
  // the night ended before a re-check: severe, left as it was (no draft), once
  fresh();
  const late = world({ now: "2026-11-01T12:00:00Z" });
  assert.equal((await S.sentBackTick(late.d)).length, 1);
  assert.deepEqual([late.started.length, merged(late.calls).length, drafted(late.calls)], [0, 0, false]);
  assert.match(said(late.calls)[0], /ended before it was re-checked/);
  assert.deepEqual(await S.sentBackTick(late.d), []);
  // a fix over the limits: severe, a draft again
  for (const o of [{ status: "diverged" }, { diff: DIFF.replace(/sol\/engine\/src\/browser\.ts/g, ".github/CODEOWNERS") }] as O[]) {
    fresh();
    const w = world(o);
    await S.sentBackTick(w.d);
    assert.deepEqual([w.started.length, merged(w.calls).length, drafted(w.calls)], [0, 0, true]);
  }
  // nothing done at all
  for (const o of [{ events: `w0ngtap\t${SENT_AT}\n` }, { events: `franktsai2008-eng\t${SENT_AT}\n` }, { me: "franktsai2008-eng" }, { present: false }, { prs: [{ ...PR, isDraft: true }] }] as O[]) {
    fresh();
    const w = world(o);
    assert.deepEqual(await S.sentBackTick(w.d), [], JSON.stringify(o));
    assert.deepEqual([w.started.length, said(w.calls).length, labels(w.calls).length], [0, 0, 0], JSON.stringify(o));
  }
});

test("an open re-check made severe by the morning loses its tool, so a late answer does nothing", async () => {
  fresh();
  const w = world();
  await S.sentBackTick(w.d);
  const id = w.started[0].id!;
  w.d.now = () => new Date("2026-11-01T11:30:00Z");
  await S.sentBackTick(w.d);
  assert.deepEqual(Tools.toolsOnlyFor(id), []);
  w.calls.length = 0;
  assert.match((await Tools.runOnlyTool(id, "recheck_answer", { pass: true, reason: "ok" })).content[0].text, /not this session's tool/);
  assert.equal(w.calls.length, 0);
});

// ---- this broke ----

test("this broke: the label, one signed comment, a card to the author and the beta reviewer, never to me", async () => {
  fresh();
  const w = world({ me: "w0ngtap" });
  const r = await B.thisBroke(w.d, { repo: "o/r", number: 411, why: "typing a dot\nopens the menu", agent: false });
  assert.deepEqual(r.told, ["franktsai2008-eng"]);   // the author is the beta reviewer: one card
  assert.deepEqual(labels(w.calls), ["labels[]=broke"]);
  assert.equal(said(w.calls)[0], "**This broke**: typing a dot opens the menu\n\n— w0ngtap");
  assert.deepEqual(w.pings, [{ to: "franktsai2008-eng", line: "#411 broke: typing a dot opens the menu (w0ngtap)", issue: 411, repo: "o/r" }]);
  fresh();
  const a = world({ me: "franktsai2008-eng", view: { ...PR, author: { login: "marcocyl04-ux" } } });
  const r2 = await B.thisBroke(a.d, { repo: "o/r", number: 411, why: "the menu", agent: true });
  assert.deepEqual(r2.told, ["marcocyl04-ux"]);
  assert.match(said(a.calls)[0], /— franktsai2008-eng's agent$/);
  await assert.rejects(B.thisBroke(a.d, { repo: "o/r", number: 411, why: "  ", agent: true }), /say in a line what broke/);
  await assert.rejects(B.thisBroke(a.d, { repo: "nope", number: 411, why: "x", agent: true }), /not a repository/);
  assert.equal(noteLine({ repo: "o/r", number: 411, at: SENT_AT, author: "franktsai2008-eng", body: said(a.calls)[0] })?.text, "said #411 broke: the menu");
  assert.equal(noteLine({ repo: "o/r", number: 411, at: SENT_AT, author: "marcocyl04-ux", body: S.foldedWords(NIGHT, "ok", "marcocyl04-ux") })?.agent, true);
});

test("brokenIn: the merged changes still wearing broke that the release holds; an unanswered question counts as held", async () => {
  const merged = [
    { number: 1, title: "in it", url: "u1", mergeCommit: { oid: "1".repeat(40) } },
    { number: 2, title: "after it", url: "u2", mergeCommit: { oid: "2".repeat(40) } },
    { number: 3, title: "the release itself", url: "u3", mergeCommit: { oid: "3".repeat(40) } },
    { number: 4, title: "GitHub did not say", url: "u4", mergeCommit: { oid: "4".repeat(40) } },
  ];
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const s = args.join(" ");
    if (s.startsWith("pr list")) return JSON.stringify(merged);
    if (s.includes("1".repeat(40))) return "ahead\n";
    if (s.includes("2".repeat(40))) return "behind\n";
    if (s.includes("3".repeat(40))) return "identical\n";
    throw new Error("HTTP 502");
  };
  assert.deepEqual((await B.brokenIn({ gh }, "o/r", "dev-20261031")).map((x) => x.number), [1, 3, 4]);
  assert.ok(calls[0].includes("--label") && calls[0].includes("broke") && calls[0].includes("merged"));
  assert.equal(calls[1].join(" "), `api repos/o/r/compare/${"1".repeat(40)}...dev-20261031 --jq .status`);
  await assert.rejects(B.brokenIn({ gh }, "o/r", "dev..main"), /not a release/);
});

test("the guard refuses a session that puts on a sent-back label or writes the re-check's marker", async () => {
  const { execFileSync } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "sentback-guard-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "marco/mine"); g("config", "sol.login", "marcocyl04-ux"); g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");   // a sol-dev checkout (#479)
  const call = (tool_name: string, tool_input: object) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name, tool_input, cwd: dir }) });
  const refused = (out: string) => out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  assert.equal(refused(call("Bash", { command: "gh pr edit 411 --add-label sent-back:slight" })), "sent-back");
  assert.equal(refused(call("Bash", { command: `gh pr comment 411 --body '<!-- sol:sent-back slight night=2026-10-31 head=abc1234 -->'` })), "sent-back");
  assert.equal(refused(call("Write", { file_path: "/tmp/s.sh", content: "gh api -X POST repos/o/r/issues/1/labels -f 'labels[]=sent-back:severe'" })), "sent-back");
  assert.equal(refused(call("Edit", { file_path: join(dir, "sol/engine/src/team/sentback.ts"), old_string: "x", new_string: "sent-back:slight" })), "");
  assert.equal(refused(call("Bash", { command: "gh pr view 411 --json labels" })), "");
});
