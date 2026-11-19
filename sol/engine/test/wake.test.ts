// Wake (#1151): a comment on GitHub wakes my agent only where my rule allows it: my own login by `mine`, a listed login
// by `others` (on only once the terms line was read); a line must start "@<me>'s agent"; a bot, a quote, an edited
// comment, a woken agent's answer, an old comment and a comment heard before never wake it; the limits a thread and a day
// hold and are kept before a session starts; a woken session is on the ask-first mode; one woken by another person is
// narrow, its three tools held to its thread; my agent that may not speak on GitHub is never woken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askIn, judge, poll, onHeard, readKept, wakeFor, rulesOf, anyOn, narrowTools, narrowAgain, repoPath, commentOf, DAY_MAX, WAKE_MARK, ANSWERS_MAX, type Comment, type Kept, type WakeDeps, type Given } from "../src/team/wake.ts";
import { cleanTeam, cleanWake, cleanWakeAsk, wakeAskDue, wakeLineOn, type TeamSettings, type WakeRule } from "../src/team/settings.ts";

const ME = "frank-x";
const REPO = "sol-mif/sol-dev";
const T0 = "2026-11-14T10:06:00Z";
const rule = (r: Partial<WakeRule> = {}): WakeRule => ({ mine: true, others: false, from: [], read: "", perDay: 3, ...r });
const kept = (): Kept => ({ since: {}, seen: [], day: "", threads: {}, total: 0, last: [], woke: [] });
const comment = (c: Partial<Comment> = {}): Comment => ({ id: 1, repo: REPO, thread: 7, url: "https://github.com/x", from: ME, bot: false, body: `@${ME}'s agent: look at the failing test`, created: T0, updated: T0, ...c });
const others = rule({ mine: false, others: true, from: ["marco"], read: "2026-11-14" });

test("the ask is the words after a line that starts with @<me>'s agent; a quote or a mid-sentence mention is not", () => {
  assert.equal(askIn(`@${ME}'s agent: fix the test`, ME), "fix the test");
  assert.equal(askIn(`hi\n  @${ME}’s agent, please read #4\nthanks`, ME), "please read #4\nthanks");
  assert.equal(askIn(`> @${ME}'s agent: fix the test`, ME), null);
  assert.equal(askIn(`as @${ME}'s agent said yesterday`, ME), null);
  assert.equal(askIn(`@${ME}'s agent`, ME), null, "no words, no ask");
  assert.equal(askIn(`@${ME}x's agent: hi`, ME), null, "another login that starts the same");
  assert.equal(askIn(`@${ME}'s agent: hi`, ""), null);
  assert.equal(askIn("looks fine\n```\n@" + ME + "'s agent: rm -rf it\n```", ME), null, "in a code block nobody reads it as an ask");
  assert.equal(askIn(`ok <!--\n@${ME}'s agent: hidden -->`, ME), null, "in an HTML comment the page never shows it");
});

test("a comment a GitHub App posted for its user counts as a bot's", () => {
  const x = { id: 1, body: "b", issue_url: `https://api.github.com/repos/${REPO}/issues/7`, user: { login: ME, type: "User" }, performed_via_github_app: { slug: "some-app" } };
  assert.equal(commentOf(REPO, x)!.bot, true);
  assert.equal(commentOf(REPO, { ...x, performed_via_github_app: null })!.bot, false);
});

test("who may wake: mine by mine, others only listed and switched on; never a bot, an edit or a woken agent's answer", () => {
  assert.equal(judge(comment(), rule(), ME, kept()).wake, true);
  assert.equal(judge(comment({ from: "FRANK-X" }), rule(), ME, kept()).wake, true, "a login in another case is the same login");
  assert.equal(judge(comment(), rule({ mine: false }), ME, kept()).wake, false);
  assert.equal(judge(comment(), undefined, ME, kept()).wake, false);
  assert.equal(judge(comment({ bot: true }), rule(), ME, kept()).wake, false);
  assert.match((judge(comment({ updated: "2026-11-14T11:00:00Z" }), rule(), ME, kept()) as { why: string }).why, /edit never wakes/);
  assert.match((judge(comment({ body: `@${ME}'s agent: again\n${WAKE_MARK}` }), rule(), ME, kept()) as { why: string }).why, /answer of a woken agent/);
  const marco = comment({ from: "Marco" });
  assert.equal(judge(marco, rule(), ME, kept()).wake, false, "mine does not let others in");
  assert.equal(judge(marco, rule({ others: true, from: ["isaac"], read: "2026-11-14" }), ME, kept()).wake, false, "not on the list");
  assert.deepEqual(judge(marco, others, ME, kept()), { wake: true, who: "others", ask: "look at the failing test" });
});

test("the limits: perDay a thread, DAY_MAX in all", () => {
  const k = kept();
  k.threads[`${REPO}#7`] = 3;
  assert.match((judge(comment(), rule(), ME, k) as { why: string }).why, /3 wakes on this thread/);
  assert.equal(judge(comment({ thread: 8 }), rule(), ME, k).wake, true);
  k.total = DAY_MAX;
  assert.match((judge(comment({ thread: 8 }), rule(), ME, k) as { why: string }).why, /most in a day/);
});

test("the setting: off by default, others on only with a login and the day the terms were read, junk dropped", () => {
  assert.deepEqual(cleanTeam({}).wake, {});
  const w = cleanWake({
    [REPO]: { mine: true, others: true, from: ["marco", "bad login!", "marco"], perDay: 99 },
    "a/b": { others: true, from: ["marco"], read: "2026-11-14", perDay: 0, may: "edits" },
    "not a repo": { mine: true },
    "../x": { mine: true },
  });
  assert.deepEqual(Object.keys(w), [REPO, "a/b"]);
  assert.equal(w[REPO].others, false, "no read day: others stays off");
  assert.deepEqual(w[REPO].from, ["marco"]);
  assert.equal(w[REPO].perDay, 10);
  assert.deepEqual(w["a/b"], { mine: false, others: true, from: ["marco"], read: "2026-11-14", perDay: 1 });
  assert.equal(cleanWake({ [REPO]: { others: true, from: [], read: "2026-11-14" } })[REPO].others, false, "nobody to hear");
});

function deps(over: Partial<TeamSettings> = {}, comments: unknown[] = [], file = join(mkdtempSync(join(tmpdir(), "wake-")), "wake.json")) {
  const said: { id: string; text: string; cwd: string; who: string }[] = [];
  const claimed: number[] = [];
  let claimOk = true;
  const given = new Map<string, Given[]>();
  const named: string[] = [];
  const asked: string[] = [];
  const posted: { args: string[]; input: string }[] = [];
  let now = Date.parse("2026-11-14T10:05:00Z");
  const team = { ...cleanTeam({ me: { login: ME } }), wake: { [REPO]: rule() }, ...over } as TeamSettings;
  let n = 0;
  let newest: unknown[] = [];
  const d: WakeDeps = {
    team: () => team,
    gh: async (args) => { asked.push(args.join(" ")); return JSON.stringify(args.join(" ").includes("direction=desc") ? newest : comments); },
    ghIn: async (args, input) => { posted.push({ args, input }); return "{}"; },
    say: async (id, text, cwd, who) => { said.push({ id, text, cwd, who }); },
    claim: async (_repo, id) => { claimed.push(id); return claimOk; },
    give: (id, tools) => { given.set(id, tools); },
    name: (id, title) => { named.push(`${id} ${title}`); },
    home: "/state/wake/work",
    file,
    now: () => now,
    newId: () => `s${++n}`,
  };
  return { d, said, given, named, asked, posted, claimed, file, team, tick: (ms: number) => { now += ms; }, newest: (l: unknown[]) => { newest = l; }, claimTaken: () => { claimOk = false; } };
}
const api = (id: number, body: string, login = ME, updated = T0, type = "User", created = updated) =>
  ({ id, body, html_url: `https://github.com/${REPO}/issues/7#c${id}`, issue_url: `https://api.github.com/repos/${REPO}/issues/7`, created_at: created, updated_at: updated, user: { login, type } });

test("the first read starts at GitHub's newest comment; the next wakes once for a comment meant for my agent", async () => {
  const t = deps({}, [api(10, `@${ME}'s agent: rerun the gate`), api(11, "an ordinary comment"), api(12, `@${ME}'s agent: hi`, "github-actions[bot]", undefined, "Bot")]);
  t.newest([api(9, `@${ME}'s agent: from before the rule`, ME, "2026-11-14T10:00:00Z")]);
  assert.deepEqual(await poll(t.d), []);
  assert.equal(readKept(t.file).since[REPO], "2026-11-14T10:00:00Z", "GitHub's clock, not this Mac's");
  const woke = await poll(t.d);
  assert.equal(woke.length, 1);
  assert.equal(woke[0].session, "s1");
  assert.match(t.asked[1], /^api repos\/sol-mif\/sol-dev\/issues\/comments\?since=2026-11-14T10%3A00%3A00Z&sort=updated&direction=asc&per_page=100$/);
  assert.equal(t.said.length, 1);
  assert.deepEqual(readKept(t.file).last.map((w) => w.no ?? w.session), ["s1", "a bot's comment"], "the bot's ask is kept as refused");
  assert.match(t.said[0].text, /rerun the gate/);
  assert.match(t.said[0].text, /every edit and every command waits/);
  assert.equal(t.said[0].cwd, "/state/wake/work");
  assert.equal(t.said[0].who, "mine", "marked woken, so every run of it is bare");
  assert.deepEqual(t.claimed, [10], "👀 put on the comment first");
  assert.deepEqual(t.given.get("s1")!.map((x) => `${x.name}${x.beside ? " beside" : ""}`), ["wake_thread beside", "wake_file beside", "wake_answer beside"], "mine keeps its ordinary tools");
  assert.match(t.named[0], /^s1 wake: sol-mif\/sol-dev#7 from frank-x$/);
  assert.deepEqual(await poll(t.d), [], "a comment heard before never wakes again");
  assert.equal(t.said.length, 1);
});

test("an old comment edited after the rule came on never wakes it", async () => {
  const t = deps({}, [api(20, `@${ME}'s agent: do it`, ME, "2026-11-14T10:07:00Z", "User", "2026-01-01T00:00:00Z")]);
  await poll(t.d);
  assert.deepEqual(await poll(t.d), []);
  assert.match(readKept(t.file).last[0].no!, /edit never wakes/);
});

test("another Sol of mine that put 👀 there first has it: this one starts nothing and uses no count", async () => {
  const t = deps();
  t.claimTaken();
  const k = kept();
  const w = await wakeFor(t.d, comment(), k);
  assert.match(w!.no!, /another Sol of mine/);
  assert.equal(t.said.length, 0);
  assert.equal(k.total, 0);
});

test("my own wake starts in the empty folder, never my checkout, where it could read a key with no card", async () => {
  const room = { ...cleanTeam({}).rooms[0], repos: [REPO], folder: "/rooms/sol" };
  const t = deps({ rooms: [room] });
  await wakeFor(t.d, comment(), kept());
  assert.equal(t.said[0].cwd, "/state/wake/work");
  assert.match(t.said[0].text, /empty folder: anything else on this machine/);
});

test("another person's wake is narrow: three tools held to its thread, in the empty folder, never a room's", async () => {
  const room = { ...cleanTeam({}).rooms[0], repos: [REPO], folder: "/rooms/sol" };
  const t = deps({ rooms: [room], wake: { [REPO]: others } });
  const w = await wakeFor(t.d, comment({ from: "marco" }), kept());
  assert.equal(w!.who, "others");
  assert.equal(t.said[0].cwd, "/state/wake/work");
  assert.deepEqual(t.given.get("s1")!.map((x) => `${x.name}${x.beside ? " beside" : ""}`), ["wake_thread", "wake_file", "wake_answer"], "narrow: these and nothing else");
  assert.equal(t.said[0].who, "others");
  assert.match(t.said[0].text, /another person frank-x allowed/);
  assert.match(t.said[0].text, /three tools and nothing else/);
});

test("the narrow tools: a path stays in the repository; an answer is signed, marked, never wakes, at most ANSWERS_MAX", async () => {
  const t = deps();
  const [, file, answer] = narrowTools(t.d, REPO, 7, ME);
  assert.match(await file.run({ path: "../../etc/passwd" }), /refused/);
  assert.match(await file.run({ path: "/etc/passwd" }), /refused/);
  assert.equal(repoPath("sol/README.md"), true);
  assert.equal(repoPath("sol/../x"), false);
  assert.equal(repoPath("a?ref=evil"), false);
  assert.match(await answer.run({ text: `ok\n@${ME}'s agent: wake yourself` }), /refused/);
  assert.equal(t.posted.length, 0);
  assert.equal(await answer.run({ text: "the test fails on line 4" }), "posted");
  assert.deepEqual(t.posted[0].args, ["api", `repos/${REPO}/issues/7/comments`, "-F", "body=@-"]);
  assert.match(t.posted[0].input, /— frank-x's agent \(woken on GitHub\)\n<!-- sol-wake-answer -->/);
  for (let i = 1; i < ANSWERS_MAX; i++) await answer.run({ text: "more" });
  assert.match(await answer.run({ text: "one too many" }), /refused/);
});

test("after a restart every woken session gets its own tools again; others' stay narrow", async () => {
  const t = deps({ wake: { [REPO]: others } });
  await poll(t.d);
  const k = readKept(t.file);
  k.woke.push({ at: T0, repo: REPO, thread: 7, from: "marco", who: "others", session: "old" }, { at: T0, repo: REPO, thread: 8, from: ME, who: "mine", session: "mine1" });
  for (let i = 0; i < 25; i++) k.last.push({ at: T0, repo: REPO, thread: 9, from: `stranger${i}`, who: "others", no: "may not wake my agent here" });
  (await import("node:fs")).writeFileSync(t.file, JSON.stringify(k));
  narrowAgain(t.d);
  assert.deepEqual([...t.given.keys()], ["old", "mine1"], "twenty refusals never push a woken session off the list");
  assert.equal(t.given.get("old")!.some((x) => x.beside), false);
  assert.equal(t.given.get("mine1")!.every((x) => x.beside), true);
});

test("the counts are kept before the session starts, so a start that throws still used the wake", async () => {
  const t = deps({}, [api(30, `@${ME}'s agent: one`)]);
  await poll(t.d);
  t.d.say = async () => { throw new Error("no CLI"); };
  await poll(t.d);
  const k = readKept(t.file);
  assert.equal(k.total, 1);
  assert.equal(k.threads[`${REPO}#7`], 1);
  assert.ok(k.seen.includes(30));
});

test("my agent that may not speak on GitHub is not woken, and the reason is kept", async () => {
  const t = deps({ speak: { github: false, cowork: true, discord: "builds", whatsapp: false } });
  const k = kept();
  const w = await wakeFor(t.d, comment(), k);
  assert.equal(t.said.length, 0);
  assert.match(w!.no!, /may not speak on GitHub/);
  assert.equal(k.total, 0);
});

test("the counts start again on a new day", async () => {
  const t = deps();
  const k = kept();
  for (let i = 0; i < 3; i++) await wakeFor(t.d, comment({ id: i }), k);
  assert.match((await wakeFor(t.d, comment({ id: 9 }), k))!.no!, /3 wakes on this thread/);
  t.tick(24 * 3600_000);
  assert.ok((await wakeFor(t.d, comment({ id: 10 }), k))!.session);
});

test("a full page in one second moves the reading on a second, so it never reads the same page for ever", async () => {
  const page = Array.from({ length: 100 }, (_, i) => api(100 + i, "x", ME, "2026-11-14T10:00:00Z"));
  const t = deps({}, page);
  t.newest([api(1, "x", ME, "2026-11-14T10:00:00Z")]);
  await poll(t.d);
  await poll(t.d);
  assert.equal(readKept(t.file).since[REPO], "2026-11-14T10:00:01Z");
});

test("a rule turned off forgets where it read, so turning it on again never wakes for the time between", async () => {
  const t = deps();
  await poll(t.d);
  t.team.wake[REPO] = rule({ mine: false });
  await poll(t.d);
  assert.equal(readKept(t.file).since[REPO], undefined);
});

// The one question (#1313): yes lets my group's members wake my agent on the group's repositories, the narrow way;
// only for the group I answered for, a GitHub group with an org
const YES = { answer: "yes" as const, at: "2026-11-16", room: "team" };
const GH_ROOM = { id: "team", name: "sol-dev", provider: "github" as const, org: "sol-mif", repos: [REPO, "sol-mif/other"], hub: "", key: "", code: "", gate: "key" as const, folder: "", mine: true, joined: false };
test("the answer: never asked by default; only with its day and group; later asks again on another day; another group asks again", () => {
  assert.deepEqual(cleanTeam({}).wakeAsk, { answer: "", at: "", room: "" });
  assert.deepEqual(cleanWakeAsk({ answer: "yes", room: "team" }), { answer: "", at: "", room: "" }, "no day is no answer");
  assert.deepEqual(cleanWakeAsk({ answer: "yes", at: "2026-11-16" }), { answer: "", at: "", room: "" }, "no group is no answer");
  assert.deepEqual(cleanWakeAsk({ answer: "maybe", at: "2026-11-16", room: "team" }), { answer: "", at: "", room: "" });
  assert.deepEqual(cleanWakeAsk(YES), YES);
  assert.equal(wakeAskDue({ answer: "", at: "", room: "" }, "team", "2026-11-16"), true);
  assert.equal(wakeAskDue({ answer: "later", at: "2026-11-16", room: "team" }, "team", "2026-11-16"), false, "not again the same day");
  assert.equal(wakeAskDue({ answer: "later", at: "2026-11-16", room: "team" }, "team", "2026-11-17"), true);
  assert.equal(wakeAskDue({ answer: "no", at: "2026-11-16", room: "team" }, "team", "2027-01-01"), false);
  assert.equal(wakeAskDue(YES, "team", "2027-01-01"), false);
  assert.equal(wakeAskDue(YES, "kao", "2026-11-16"), true, "another group in use asks again");
  // the two lines of a yes, each turned off on its own in Settings
  assert.deepEqual(cleanWakeAsk({ ...YES, off: ["asks", "x", "asks"] }), { ...YES, off: ["asks"] });
  assert.deepEqual(cleanWakeAsk({ answer: "no", at: "2026-11-16", room: "team", off: ["wake"] }), { answer: "no", at: "2026-11-16", room: "team" }, "off only with yes");
  assert.equal(wakeLineOn(YES, "team", "wake"), true);
  assert.equal(wakeLineOn(YES, "team", "asks"), true);
  assert.equal(wakeLineOn(YES, "kao", "asks"), false, "another group");
  assert.equal(wakeLineOn({ ...YES, off: ["asks"] }, "team", "asks"), false);
  assert.equal(wakeLineOn({ ...YES, off: ["asks"] }, "team", "wake"), true);
  assert.equal(wakeLineOn({ answer: "later", at: "2026-11-16", room: "team" }, "team", "asks"), false);
});

test("the rules in force: yes adds my group's members on its repositories, narrow; no answer, no, another group or a cloud group keeps mine alone", () => {
  const t = { ...cleanTeam({ me: { login: ME } }), rooms: [GH_ROOM], room: "team", repos: [REPO, "sol-mif/other"], wake: {} } as TeamSettings;
  assert.deepEqual(rulesOf(t, ["marco", ME]), {}, "not asked: nothing");
  assert.deepEqual(rulesOf({ ...t, wakeAsk: { answer: "no", at: "2026-11-16", room: "team" } }, ["marco"]), {});
  assert.equal(anyOn(t), false);
  const y = { ...t, wakeAsk: YES };
  assert.equal(anyOn(y), true);
  assert.deepEqual(rulesOf(y, ["marco", "FRANK-X", "isaac"])[REPO], { mine: false, others: true, from: ["marco", "isaac"], read: "2026-11-16", perDay: 3 }, "me never among them");
  assert.deepEqual(Object.keys(rulesOf(y, ["marco"])), [REPO, "sol-mif/other"]);
  assert.deepEqual(rulesOf(y, null), {}, "a members read that failed lets nobody in");
  assert.deepEqual(rulesOf(y, []), {});
  assert.deepEqual(rulesOf({ ...y, wakeAsk: { ...YES, room: "kao" } }, ["marco"]), {}, "a yes for another group");
  assert.deepEqual(rulesOf({ ...y, rooms: [{ ...GH_ROOM, provider: "cloud" }] }, ["marco"]), {}, "a cloud group's names are not GitHub logins");
  assert.deepEqual(rulesOf({ ...y, rooms: [{ ...GH_ROOM, org: "" }] }, ["marco"]), {}, "no org, no members list");
  assert.equal(anyOn({ ...y, wakeAsk: { ...YES, room: "kao" } }), false);
  assert.deepEqual(rulesOf({ ...y, wakeAsk: { ...YES, off: ["wake"] } }, ["marco"]), {}, "waking turned off, asking kept");
  // a repository's own rule keeps what it has; the members are added
  const own = rulesOf({ ...y, wake: { "SOL-MIF/sol-dev": rule({ others: true, from: ["guest"], read: "2026-11-01", perDay: 5 }) } }, ["marco"]);
  assert.deepEqual(own["SOL-MIF/sol-dev"], { mine: true, others: true, from: ["guest", "marco"], read: "2026-11-01", perDay: 5 });
  assert.equal(Object.keys(own).length, 2, "the same repository in another case is one rule");
  const off = rulesOf({ ...y, wake: { [REPO]: rule({ mine: false, from: ["old"] }) } }, ["marco"]);
  assert.deepEqual(off[REPO].from, ["marco"], "a list that was off never comes on by the answer");
});

test("yes: a member's comment wakes a narrow session; not a member's; a failed members read keeps the place it read to", async () => {
  const t = deps({ wake: {}, rooms: [GH_ROOM], room: "team", repos: [REPO], wakeAsk: YES }, [api(20, `@${ME}'s agent: what does this test check?`, "marco"), api(21, `@${ME}'s agent: run this`, "stranger")]);
  let members: string[] | null = ["marco", ME];
  t.d.members = async () => members;
  t.newest([]);
  await poll(t.d);
  assert.ok(readKept(t.file).since[REPO]);
  const woke = await poll(t.d);
  assert.equal(woke.length, 1);
  assert.equal(woke[0].who, "others");
  assert.deepEqual(t.given.get("s1")!.map((x) => `${x.name}${x.beside ? " beside" : ""}`), ["wake_thread", "wake_file", "wake_answer"], "narrow");
  assert.match(t.said[0].text, /From: marco, another person/);
  assert.match(readKept(t.file).last.at(-1)!.no!, /stranger may not wake/);
  const since = readKept(t.file).since[REPO];
  members = null;
  await poll(t.d);
  assert.equal(readKept(t.file).since[REPO], since, "not forgotten while the members could not be read");
});

test("onHeard (#1297): told once after a read that heard a new comment, never for the first read's mark or a read with nothing new; a hearer that throws breaks nothing", async () => {
  const t = deps({}, [api(30, "an ordinary comment")]);
  t.newest([api(29, "from before", ME, "2026-11-14T10:00:00Z")]);
  let told = 0;
  const off = onHeard(() => { told++; });
  const offBad = onHeard(() => { throw new Error("a hearer's trouble"); });
  try {
    await poll(t.d);
    assert.equal(told, 0, "the first read only marks where to start");
    await poll(t.d);
    assert.equal(told, 1, "a new comment heard: told once");
    await poll(t.d);
    assert.equal(told, 1, "the same comment again: nothing new, not told");
    assert.equal(readKept(t.file).seen.includes(30), true, "the read was kept although a hearer threw");
  } finally { off(); offBad(); }
  const t2 = deps({}, [api(31, "another")]);
  await poll(t2.d); await poll(t2.d);
  assert.equal(readKept(t2.file).seen.includes(31), true, "heard");
  assert.equal(told, 1, "a hearer that stopped listening is not told");
});
