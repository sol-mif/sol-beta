// The hand-in card (#476, team/handin.ts): once a draft PR of mine is ready to hand in (for now GitHub's checks green on
// its latest commit, readyToHandIn; the checks and the gate #481 later), the Work session that worked on it (its folder on the PR's
// branch, the latest one) shows "fr-12 is ready. Bring it into sol-dev tonight so Sol developers can try it?". Only the
// press hands it in (the PR marked ready on the default branch); Not tonight leaves it a draft and is not asked again
// for that commit that day. The feature comes from specs/features.json by the PR's files.
// GitHub, git and the sessions are functions over a small made-up world; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-handin-card-")), "work.json");
const H = await import("../src/team/handin.ts");
const T = await import("../src/team/tonight.ts");
type Deps = import("../src/team/handin.ts").CardDeps;

const ME = "marcocyl04-ux", FRANK = "franktsai2008-eng";
const RHYTHM = JSON.stringify({ handIn: "20:00", review: "21:00", release: "09:00", zone: "America/New_York", dev: [ME], beta: [FRANK] });
const green = [{ status: "COMPLETED", conclusion: "SUCCESS" }], red = [{ status: "COMPLETED", conclusion: "FAILURE" }];
const SHA = "a".repeat(40), SHA2 = "b".repeat(40);
const pr = (o: Record<string, unknown>) => ({ title: "x", url: "https://github.com/sol-mif/sol-dev/pull/1", body: "", isDraft: true, baseRefName: "main", author: { login: ME }, statusCheckRollup: green, headRefOid: SHA, files: [], ...o });

// a side copy with the feature map in it
const TOP = mkdtempSync(join(tmpdir(), "wt-a-"));
mkdirSync(join(TOP, "specs"));
writeFileSync(join(TOP, "specs", "features.json"), JSON.stringify({ version: 1, features: [
  { id: "fr-01", name: "Open Sol", slug: "open-sol", type: "product", label: "base", paths: ["sol/mac/src/app.ts"] },
  { id: "fr-12", name: "The hand-in", slug: "hand-in", type: "internal", label: "cowork", paths: ["sol/engine/src/team/handin.ts", "sol/mac/src/work/**"] },
] }));

function world(o: { now?: string; prs?: any[]; present?: boolean; me?: string; sessions?: any[]; view?: Record<number, object>; onList?: () => Promise<void> } = {}) {
  const calls: string[][] = [], bus: any[] = [], unread: string[] = [];
  const prs = o.prs ?? [
    pr({ number: 500, title: "The hand-in card", headRefName: "marco/a-500", body: "Part of #476.", files: [{ path: "sol/engine/src/team/handin.ts" }, { path: "sol/mac/src/work/HandIn.tsx" }, { path: "sol/mac/src/app.ts" }] }),
    pr({ number: 501, headRefName: "marco/b-501", statusCheckRollup: red }),
    pr({ number: 502, headRefName: "marco/c-502", isDraft: false }),
    pr({ number: 503, headRefName: "marco/nobody-503" }),
    pr({ number: 504, headRefName: "marco/d-504", baseRefName: "marco/b-501" }),
    pr({ number: 505, headRefName: "frank/e-505", author: { login: FRANK } }),
  ];
  const branchOf: Record<string, string> = { "/wt/a": "marco/a-500", "/wt/a2": "marco/a-500", "/wt/b": "marco/b-501", "/wt/c": "marco/c-502", "/wt/d": "marco/d-504", "/wt/e": "frank/e-505" };
  const d: Deps = {
    me: () => o.me ?? ME,
    present: () => o.present ?? true,
    folders: async () => ({ "sol-mif/sol-dev": "/work/sol" }),
    now: () => new Date(o.now ?? "2026-10-30T18:00:00Z"),   // 14:00 New York
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.includes(".default_branch")) return "main\n";
      if (s.startsWith("pr list")) { await o.onList?.(); return JSON.stringify(prs); }
      if (s.startsWith("pr view")) {
        const p = prs.find((x) => x.number === Number(args[2]));
        return JSON.stringify({ state: "OPEN", isDraft: p?.isDraft, author: p?.author, baseRefName: p?.baseRefName, headRefOid: p?.headRefOid, statusCheckRollup: p?.statusCheckRollup, ...(o.view?.[Number(args[2])] ?? {}) });
      }
      return "";
    },
    git: async (cwd, args) => {
      if (args[0] === "rev-parse") return branchOf[cwd] ? { code: 0, out: `${branchOf[cwd]}\n${cwd === "/wt/a" ? TOP : cwd}\n` } : { code: 128, out: "" };
      if (args[0] === "remote") return { code: 0, out: "git@github.com:sol-mif/sol-dev.git\n" };
      return { code: 0, out: "" };
    },
    start: async () => "never",
    bus: (m) => bus.push(m),
    sessions: async () => o.sessions ?? [
      { id: "s-a", cwd: "/wt/a", updatedAt: Date.parse("2026-10-30T17:00:00Z") },
      { id: "s-a-old", cwd: "/wt/a2", updatedAt: Date.parse("2026-10-30T09:00:00Z") },
      { id: "s-b", cwd: "/wt/b", updatedAt: Date.parse("2026-10-30T17:00:00Z") },
      { id: "s-c", cwd: "/wt/c", updatedAt: Date.parse("2026-10-30T17:00:00Z") },
      { id: "s-d", cwd: "/wt/d", updatedAt: Date.parse("2026-10-30T17:00:00Z") },
      { id: "s-e", cwd: "/wt/e", updatedAt: Date.parse("2026-10-30T17:00:00Z") },
      { id: "s-gone", cwd: "/wt/a", updatedAt: Date.parse("2026-10-30T17:30:00Z"), archived: true },
    ],
    lastItem: async (id) => `${id}-last`,
    unread: (id) => unread.push(id),
  };
  return { d, calls, bus, unread, prs };
}
const fresh = () => { H.forgetHandIn(); T.forgetTonight(); T.forgetRhythms(); };

test("readyToHandIn: GitHub's checks green on the latest commit; red, running or none is not ready", () => {
  assert.equal(H.readyToHandIn({ statusCheckRollup: green }), true);
  assert.equal(H.readyToHandIn({ statusCheckRollup: [...green, ...red] }), false);
  assert.equal(H.readyToHandIn({ statusCheckRollup: [{ status: "IN_PROGRESS" }] }), false);
  assert.equal(H.readyToHandIn({ statusCheckRollup: [] }), false);
  assert.equal(H.readyToHandIn({}), false);
});

test("the feature a change belongs to: the most of its files, by the map's globs; none without a map or a match", () => {
  assert.equal(H.underGlob("sol/mac/src/work/**", "sol/mac/src/work/HandIn.tsx"), true);
  assert.equal(H.underGlob("sol/**/handin.ts", "sol/handin.ts"), true);
  assert.equal(H.underGlob("sol/**/handin.ts", "sol/engine/src/team/handin.ts"), true);
  assert.equal(H.underGlob("sol/*/x.ts", "sol/a/b/x.ts"), false);
  assert.equal(H.underGlob("sol/engine", "sol/engine/src/a.ts"), true);
  assert.equal(H.underGlob("sol/engine", "sol/engine2/a.ts"), false);
  assert.equal(H.underGlob("a.b", "aXb"), false);
  const map = { features: [{ id: "fr-01", name: "Open Sol", paths: ["a/**"] }, { id: "fr-02", name: "Two", paths: ["b/*"] }] };
  assert.deepEqual(H.featureFor(map, ["b/1", "b/2", "a/1"]), { id: "fr-02", name: "Two" });
  assert.deepEqual(H.featureFor(map, ["b/1", "a/1"]), { id: "fr-01", name: "Open Sol" });   // a tie: the first in the map
  assert.equal(H.featureFor(map, ["c/1"]), null);
  assert.equal(H.featureFor(null, ["a/1"]), null);
  assert.equal(H.featureFor({ features: [{ id: "bad", name: "x", paths: ["a/**"] }] }, ["a/1"]), null);
});

test("the card's question: the feature, else the issue, else the PR; tomorrow night once the review hour passed", () => {
  assert.equal(H.askOf({ repo: "sol-mif/sol-dev", number: 500, feature: { id: "fr-12" }, issue: 476 }), "fr-12 is ready. Bring it into sol-dev tonight so Sol developers can try it?");
  assert.equal(H.askOf({ repo: "sol-mif/sol-dev", number: 500, issue: 476 }), "#476 is ready. Bring it into sol-dev tonight so Sol developers can try it?");
  assert.equal(H.askOf({ repo: "sol-mif/sol-dev", number: 500, late: true }), "#500 is ready. Bring it into sol-dev tomorrow night so Sol developers can try it?");
  assert.equal(H.askOf({ repo: "o/r", number: 7 }), "#7 is ready. Bring it into r tonight so the team can try it?");
  assert.equal(H.issueOf("Part of #476.", "x"), 476);
  assert.equal(H.issueOf("closes #12", "x"), 12);
  assert.equal(H.issueOf("", "marco/cowork-r5a-the-hand-476"), 476);
  assert.equal(H.issueOf("", "main"), null);
});

test("scan: one card for my ready draft, in the latest session on its branch, with the feature; nothing else asked", async () => {
  fresh();
  const w = world();
  const put = await H.scan(w.d);
  assert.deepEqual(put, [`handin:500:${SHA.slice(0, 12)}:2026-10-30`]);
  const [card] = H.handInCardsOf("s-a");
  assert.equal(card.ask, "fr-12 is ready. Bring it into sol-dev tonight so Sol developers can try it?");
  assert.deepEqual([card.kind, card.number, card.sha, card.issue, card.feature?.name, card.after, card.author], ["handin", 500, SHA, 476, "The hand-in", "s-a-last", ME]);
  assert.equal(H.handInCardsOf("s-a-old").length, 0);   // the older session on the same branch gets none
  assert.equal(H.handInCardsOf("s-gone").length, 0);    // an archived one neither
  for (const id of ["s-b", "s-c", "s-d", "s-e"]) assert.equal(H.handInCardsOf(id).length, 0, id);   // red, ready already, not on main, someone else's
  assert.deepEqual(w.unread, ["s-a"]);
  assert.ok(w.bus.some((m) => m.type === "work.item" && m.sessionId === "s-a" && m.item.kind === "handin"));
  assert.ok(w.calls.some((c) => c.join(" ").startsWith(`pr list --repo sol-mif/sol-dev --state open --author ${ME}`)));
  assert.ok(!w.calls.some((c) => c[1] === "ready" || c[1] === "merge"));   // a card hands nothing in
  // not asked twice; and not more often than every two minutes
  assert.deepEqual(await H.scan(w.d, true), []);
  assert.equal(H.handInCardsOf("s-a").length, 1);
  const n = w.calls.length;
  assert.deepEqual(await H.scan(w.d), []);
  assert.equal(w.calls.length, n);
});

test("scan: nothing with my window elsewhere; tomorrow night after the review hour; #issue with no feature map", async () => {
  fresh();
  const away = world({ present: false });
  assert.deepEqual(await H.scan(away.d, true), []);
  fresh();
  const late = world({ now: "2026-10-31T01:30:00Z", sessions: [{ id: "s-x", cwd: "/wt/b", updatedAt: Date.parse("2026-10-31T01:00:00Z") }], prs: [pr({ number: 510, headRefName: "marco/b-501", body: "Part of #9" })] });
  await H.scan(late.d, true);
  assert.equal(H.handInCardsOf("s-x")[0].ask, "#9 is ready. Bring it into sol-dev tomorrow night so Sol developers can try it?");
  // a session older than three days is not the one that is working on it
  fresh();
  const old = world({ sessions: [{ id: "s-old", cwd: "/wt/a", updatedAt: Date.parse("2026-10-20T00:00:00Z") }] });
  assert.deepEqual(await H.scan(old.d, true), []);
});

test("Bring it in: only from Sol's window with the card's key, only the author; it marks the PR ready, and the card says so", async () => {
  fresh();
  const w = world();
  const [id] = await H.scan(w.d, true);
  assert.equal(H.cardKeyOf("s-none"), "");
  const key = H.cardKeyOf("s-a");
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.match((await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: false })).error!, /only Sol's own window/);
  assert.match((await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key: "nope", window: true })).error!, /opened again/);
  const frank = world({ me: FRANK });
  assert.match((await H.bring(frank.d, { sessionId: "s-a", id, choice: "in", key, window: true })).error!, /only marcocyl04-ux hands this change in/);
  assert.ok(!w.calls.some((c) => c[1] === "ready"));
  assert.deepEqual(await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true }), { ok: true });
  assert.ok(w.calls.some((c) => c.join(" ") === "pr ready 500 --repo sol-mif/sol-dev"));
  const card = H.handInCardsOf("s-a")[0];
  assert.equal(card.state, "in");
  assert.match(card.why!, /handed in: ready for the dev review, based on main/);
  assert.deepEqual(await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true }), { already: true });   // pressed once only
  assert.equal(w.calls.filter((c) => c[1] === "ready").length, 1);
  // the cards sit after the item they were put after, else at the end
  const items = H.withHandIn("s-a", [{ id: "x", kind: "me" }, { id: "s-a-last", kind: "you" }, { id: "y", kind: "me" }]);
  assert.deepEqual(items.map((i) => i.id), ["x", "s-a-last", id, "y"]);
  assert.deepEqual(H.withHandIn("s-a", [{ id: "z", kind: "me" }]).map((i) => i.id), ["z", id]);
  assert.deepEqual(H.withHandIn("s-none", [{ id: "z", kind: "me" }]).map((i) => i.id), ["z"]);
});

test("Bring it in, refused: a newer commit since the card, a base that changed; ready on GitHub already is said", async () => {
  fresh();
  let w = world({ view: { 500: { headRefOid: SHA2 } } });
  let [id] = await H.scan(w.d, true);
  let key = H.cardKeyOf("s-a");
  assert.match((await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true })).error!, /a newer commit came in/);
  assert.equal(H.handInCardsOf("s-a")[0].state, "gone");
  assert.ok(!w.calls.some((c) => c[1] === "ready"));
  fresh();
  w = world({ view: { 500: { baseRefName: "other" } } });
  [id] = await H.scan(w.d, true); key = H.cardKeyOf("s-a");
  assert.match((await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true })).error!, /based on other, not main/);
  assert.equal(H.handInCardsOf("s-a")[0].state, undefined);   // still asks: the error is on the card
  assert.match(H.handInCardsOf("s-a")[0].error!, /based on other/);
  fresh();
  w = world({ view: { 500: { statusCheckRollup: red } } });   // checks went red between the card and the press
  [id] = await H.scan(w.d, true); key = H.cardKeyOf("s-a");
  assert.match((await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true })).error!, /checks are not green any more/);
  assert.equal(H.handInCardsOf("s-a")[0].state, "gone");
  assert.ok(!w.calls.some((c) => c[1] === "ready"));
  fresh();
  w = world({ view: { 500: { isDraft: false } } });
  [id] = await H.scan(w.d, true); key = H.cardKeyOf("s-a");
  assert.deepEqual(await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true }), { already: true });
  assert.equal(H.handInCardsOf("s-a")[0].state, "in");
  assert.ok(!w.calls.some((c) => c[1] === "ready"));
});

test("Not tonight: it stays a draft, no card again for that commit today; a new commit or the next day asks again", async () => {
  fresh();
  const w = world();
  const [id] = await H.scan(w.d, true);
  const key = H.cardKeyOf("s-a");
  assert.deepEqual(await H.bring(w.d, { sessionId: "s-a", id, choice: "not", key, window: true }), { ok: true });
  assert.ok(!w.calls.some((c) => c[1] === "ready"));   // nothing on GitHub
  assert.equal(H.handInCardsOf("s-a")[0].state, "held");
  assert.equal(H.heldToday("sol-mif/sol-dev", 500, SHA, "2026-10-30"), true);
  assert.deepEqual(await H.scan(w.d, true), []);       // no nagging that day
  // the 8pm list says it is held because of the press
  const at8 = world({ now: "2026-10-31T00:05:00Z" });
  const mine = [H.mineOf(at8.prs[0], "main", [])];
  if (H.heldToday("sol-mif/sol-dev", 500, mine[0].sha, "2026-10-30")) mine[0].notTonight = true;
  const words = H.handInWords({ repo: "sol-mif/sol-dev", day: "2026-10-30", me: ME, base: "main", rhythm: T.parseRhythm(RHYTHM)!, mine, pick: false, clashesChecked: true }, "n0nce");
  assert.match(words, /Going in tonight \(0\):\n\nnothing yet/);
  assert.match(words, /held: Not tonight was pressed on its card/);
  // the next day: asked again, same commit
  const next = world({ now: "2026-10-31T18:00:00Z" });
  assert.deepEqual(await H.scan(next.d, true), [`handin:500:${SHA.slice(0, 12)}:2026-10-31`]);
  // a new commit, green: asked again the same day
  fresh();
  const one = world();
  await H.scan(one.d, true);
  await H.bring(one.d, { sessionId: "s-a", id: H.handInCardsOf("s-a")[0].id, choice: "not", key: H.cardKeyOf("s-a"), window: true });
  const moved = world({ prs: [pr({ number: 500, headRefName: "marco/a-500", headRefOid: SHA2 })] });
  assert.deepEqual(await H.scan(moved.d, true), [`handin:500:${SHA2.slice(0, 12)}:2026-10-30`]);
});

test("a card still asking whose change moved on says so: a newer commit, red checks, handed in on GitHub, closed", async () => {
  for (const [prs, why] of [
    [[pr({ number: 500, headRefName: "marco/a-500", headRefOid: SHA2, statusCheckRollup: [{ status: "IN_PROGRESS" }] })], /a newer commit came in/],
    [[pr({ number: 500, headRefName: "marco/a-500", statusCheckRollup: red })], /checks are not green any more/],
    [[pr({ number: 500, headRefName: "marco/a-500", isDraft: false })], /handed in on GitHub/],
    [[], /no longer open on GitHub/],
  ] as const) {
    fresh();
    await H.scan(world().d, true);
    await H.scan(world({ prs: prs as any }).d, true);
    const c = H.handInCardsOf("s-a")[0];
    assert.equal(c.state, "gone");
    assert.match(c.why!, why);
  }
});

test("a press the engine stopped in the middle of asks again after a restart; the cards are kept on disk", async () => {
  fresh();
  const w = world();
  const [id] = await H.scan(w.d, true);
  H.putHandIn("s-a", { ...H.handInCardsOf("s-a")[0], state: "busy" }, () => {});
  H.forgetHandIn();   // the engine's memory gone, the file stays
  const c = H.handInCardsOf("s-a")[0];
  assert.equal(c.id, id);
  assert.equal(c.state, undefined);
});

test("a card left unanswered asks again the next day, and the old one stops asking; a PR from a fork gets no card", async () => {
  fresh();
  const [first] = await H.scan(world().d, true);
  assert.deepEqual(await H.scan(world().d, true), []);   // still asking today: once
  const next = world({ now: "2026-10-31T18:00:00Z" });
  assert.deepEqual(await H.scan(next.d, true), [`handin:500:${SHA.slice(0, 12)}:2026-10-31`]);
  const cards = H.handInCardsOf("s-a");
  assert.equal(cards.find((c) => c.id === first)!.state, "gone");
  assert.equal(cards.filter((c) => !c.state).length, 1);
  fresh();
  assert.deepEqual(await H.scan(world({ prs: [pr({ number: 500, headRefName: "marco/a-500", isCrossRepository: true })] }).d, true), []);
});

test("a press while GitHub is being asked is not overwritten by the scan's older view", async () => {
  fresh();
  const w = world();
  const [id] = await H.scan(w.d, true);
  const key = H.cardKeyOf("s-a");
  // the next scan sees the PR handed in on GitHub, but the press lands while it waits for the list
  const late = world({ prs: [pr({ number: 500, headRefName: "marco/a-500", isDraft: false })], onList: async () => {
    assert.deepEqual(await H.bring(w.d, { sessionId: "s-a", id, choice: "in", key, window: true }), { ok: true });
  } });
  await H.scan(late.d, true);
  const c = H.handInCardsOf("s-a").find((x) => x.id === id)!;
  assert.equal(c.state, "in");
  assert.match(c.why!, /handed in/);
});

test("after the review hour the card asks about tomorrow night, and Not tonight holds that night, also past midnight", async () => {
  fresh();
  const s = [{ id: "s-a", cwd: "/wt/a", updatedAt: Date.parse("2026-10-31T01:50:00Z") }];
  const at = (now: string) => world({ now, sessions: s });
  // the review night (pure): before the review hour today's, from it on tomorrow's, in the rhythm's zone
  const r = T.parseRhythm(RHYTHM)!;
  assert.equal(H.reviewNightOf(r, new Date("2026-10-30T18:00:00Z")), "2026-10-30");   // 14:00 New York
  assert.equal(H.reviewNightOf(r, new Date("2026-10-31T01:00:00Z")), "2026-10-31");   // 21:00, the review hour
  assert.equal(H.reviewNightOf(r, new Date("2026-10-31T04:05:00Z")), "2026-10-31");   // 00:05 the next day
  // 22:00 New York: a card about tomorrow night, pressed Not tonight
  const [id] = await H.scan(at("2026-10-31T02:00:00Z").d, true);
  assert.equal(id, `handin:500:${SHA.slice(0, 12)}:2026-10-31`);
  assert.match(H.handInCardsOf("s-a")[0].ask, /tomorrow night/);
  assert.deepEqual(await H.bring(at("2026-10-31T02:01:00Z").d, { sessionId: "s-a", id, choice: "not", key: H.cardKeyOf("s-a"), window: true }), { ok: true });
  // 00:05 and 14:00 the next day are still that night: no card
  assert.deepEqual(await H.scan(at("2026-10-31T04:05:00Z").d, true), []);
  assert.deepEqual(await H.scan(at("2026-10-31T18:00:00Z").d, true), []);
  // that night's 8pm list says it is held by the press
  const w8 = at("2026-11-01T00:00:00Z");
  const mine = [H.mineOf(w8.prs[0], "main", [])];
  assert.equal(H.heldToday("sol-mif/sol-dev", 500, SHA, H.reviewNightOf(r, w8.d.now())), true);
  assert.match(H.heldWhy({ ...mine[0], notTonight: true }, "main"), /Not tonight was pressed/);
  // past that night's review hour it asks again, about the next night
  assert.deepEqual(await H.scan(at("2026-11-01T01:30:00Z").d, true), [`handin:500:${SHA.slice(0, 12)}:2026-11-01`]);
  // an unanswered card from 22:00 is not asked again at 00:05 either
  fresh();
  const [first] = await H.scan(at("2026-10-31T02:00:00Z").d, true);
  assert.deepEqual(await H.scan(at("2026-10-31T04:05:00Z").d, true), []);
  assert.equal(H.handInCardsOf("s-a").find((c) => c.id === first)!.state, undefined);
});

test("checks that were all skipped or neutral are not green: at least one must pass", () => {
  assert.equal(H.checksOf([{ status: "COMPLETED", conclusion: "SKIPPED" }]), "none");
  assert.equal(H.checksOf([{ status: "COMPLETED", conclusion: "NEUTRAL" }, { status: "COMPLETED", conclusion: "SKIPPED" }]), "none");
  assert.equal(H.checksOf([{ status: "COMPLETED", conclusion: "SKIPPED" }, ...green]), "passing");
  assert.equal(H.readyToHandIn({ statusCheckRollup: [{ status: "COMPLETED", conclusion: "SKIPPED" }] }), false);
  assert.match(H.heldWhy(H.mineOf(pr({ number: 9, headRefName: "x", statusCheckRollup: [{ status: "COMPLETED", conclusion: "SKIPPED" }] }) as any, "main", []), "main"), /no checks have run/);
});

test("Not tonight presses older than a week are let go when another is kept", async () => {
  fresh();
  const w = world();
  const [id] = await H.scan(w.d, true);
  await H.bring(w.d, { sessionId: "s-a", id, choice: "not", key: H.cardKeyOf("s-a"), window: true });
  assert.equal(H.heldToday("sol-mif/sol-dev", 500, SHA, "2026-10-30"), true);
  const later = world({ now: "2026-11-09T19:00:00Z", sessions: [{ id: "s-b", cwd: "/wt/b", updatedAt: Date.parse("2026-11-09T18:00:00Z") }],
    prs: [pr({ number: 501, headRefName: "marco/b-501" })] });
  const [id2] = await H.scan(later.d, true);
  await H.bring(later.d, { sessionId: "s-b", id: id2, choice: "not", key: H.cardKeyOf("s-b"), window: true });
  assert.equal(H.heldToday("sol-mif/sol-dev", 501, SHA, "2026-11-09"), true);
  assert.equal(H.heldToday("sol-mif/sol-dev", 500, SHA, "2026-10-30"), false);   // ten days old: gone
});
