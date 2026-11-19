// The four seams (#1320, src/seams/README.md): sign-in and the Sol ID, data storage, group chat, wake. Each is asked
// through one getter, today's is what was there before, and another put behind it is what the callers then use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const ACCOUNTS = join(tmp("sol-seam-acc-"), "cloud", "accounts.json");
Object.assign(process.env, { SOL_TEAM: join(tmp("sol-team-"), "team.json"), SOL_TEAM_OFFLINE: "1", SOL_STATE: join(tmp("sol-state-"), "work.json"), SOL_HOME: tmp("sol-home-"), SOL_CLOUD_ACCOUNTS: ACCOUNTS });
delete process.env.DISCORD_WEBHOOK;

const { identity, useIdentity, cloudIdentity, CLOUD_FILE, identityOf, supabaseIdentity } = await import("../src/seams/identity.ts");
const { dataStore, useDataStore, hubStore, bothStores } = await import("../src/seams/store.ts");
const { groupChat, useGroupChat, relayChat } = await import("../src/seams/chat.ts");
const { wakeUp, useWake, relayWake } = await import("../src/seams/wake.ts");
const { hubLogin, onCloud } = await import("../src/team/relay.ts");
const { patchTeam } = await import("../src/team/settings.ts");
const { typed, _talkSend, _talkAt } = await import("../src/team/talk.ts");
const { setTrackHome, sendPending } = await import("../src/track.ts");
const { resetCloud } = await import("../src/team/cloud.ts");

patchTeam({ me: { login: "marco", name: "Marco" } });

test("sign-in: today's reads the accounts file and gives names only, never the renewal token; another behind it is who I am", () => {
  assert.equal(CLOUD_FILE, ACCOUNTS, "the same file as before (SOL_CLOUD_ACCOUNTS)");
  mkdirSync(dirname(ACCOUNTS), { recursive: true });
  writeFileSync(ACCOUNTS, JSON.stringify({ "https://cloud.example/relay": { login: "marco-sol", refresh: "r".repeat(43), at: 1 } }));
  const i = cloudIdentity(ACCOUNTS);
  assert.deepEqual(i.on("https://cloud.example/relay"), { login: "marco-sol" });
  assert.equal(i.on("https://other.example/relay"), null);
  assert.deepEqual(i.accounts(), [{ hub: "https://cloud.example/relay", login: "marco-sol" }]);

  assert.equal(hubLogin(), "marco", "no account on the hub in use: my GitHub login, as before");
  assert.equal(onCloud(), false);
  useIdentity({ ...i, on: () => ({ login: "someone-else" }) });
  try {
    assert.equal(hubLogin(), "someone-else", "the relay asks the seam, not the file");
    assert.equal(onCloud(), true);
  } finally { useIdentity(null); }
  assert.equal(hubLogin(), "marco");
  assert.equal(typeof identity().verifier(), "function");
});

test("sign-in on Supabase (#1351, #1607): SOL_IDENTITY decides when set, else the switch; signed in nowhere it names nobody, has no id and no ticket", async () => {
  const file = join(tmp("sol-seam-sb-"), "cloud", "supabase.json");
  const sb = supabaseIdentity(file);
  assert.deepEqual(sb.accounts(), []);
  assert.equal(sb.on("https://cloud.example/relay"), null);
  assert.equal(await sb.ticket("https://cloud.example/relay"), "");
  assert.equal(await sb.signOut("https://cloud.example/relay"), false);
  assert.deepEqual(await sb.signIn("http://evil.example/relay"), { ok: false, error: "a cloud is signed in to over https only" });
  mkdirSync(dirname(ACCOUNTS), { recursive: true });
  writeFileSync(ACCOUNTS, JSON.stringify({ "https://cloud.example/relay": { login: "marco", refresh: "r".repeat(43), at: 1 } }));
  resetCloud();
  assert.deepEqual(identityOf({}, () => false).accounts().map((a) => a.login), ["marco"], "unset, the switch off: today's cloud sign-in");
  assert.equal(identityOf({}, () => false).id(), "", "the cloud's own has no one id");
  assert.equal(await identityOf({}, () => false).bearer(), "", "and no token of its own for the data store");
  assert.equal(await identityOf({ SOL_SUPABASE_ACCOUNT: file }, () => true).bearer(), "", "Supabase's, signed in nowhere: none either");
  assert.deepEqual(identityOf({ SOL_SUPABASE_ACCOUNT: file }, () => true).on("https://cloud.example/relay"), null, "unset, the switch on: Supabase's");
  assert.equal(identityOf({ SOL_IDENTITY: "cloud" }, () => true).id(), "", "a word in SOL_IDENTITY wins over the switch");
  assert.deepEqual(identityOf({ SOL_IDENTITY: "cloud" }).accounts().map((a) => a.login), ["marco"]);
  assert.deepEqual(identityOf({ SOL_IDENTITY: "supabase", SOL_SUPABASE_ACCOUNT: file }).on("https://cloud.example/relay"), null, "supabase: not the cloud's accounts");
});

test("data: nowhere until a store is named; the hub's posts a day's file; another store gets the same headers and body", async () => {
  useDataStore(null);
  assert.equal(dataStore().usage(), null, "nowhere: nothing is sent");
  const posts: string[] = [];
  const f = (async (url: any, init: any) => { posts.push(`${init.method} ${url}`); return { status: 200 }; }) as unknown as typeof fetch;
  assert.equal(hubStore(() => null, f).usage(), null);
  assert.equal(await hubStore(() => "https://box.example/relay/track", f).usage()!({ a: "1" }, "x"), 200);
  assert.deepEqual(posts, ["POST https://box.example/relay/track"]);
  // the sign-in's token on a post (#1607) is Supabase's to read: the hub is handed the post without it
  const seen: Record<string, string>[] = [];
  const f2 = (async (_url: any, init: any) => { seen.push(init.headers); return { status: 200 }; }) as unknown as typeof fetch;
  await hubStore(() => "https://box.example/relay/track", f2).usage()!({ a: "1", authorization: "Bearer t" }, "x");
  assert.deepEqual(Object.keys(seen[0]!).filter((k) => k === "authorization"), []);
  assert.equal(seen[0]!.a, "1");

  const home = tmp("sol-seam-track-");
  setTrackHome(home, { version: "abc1234", consent: () => ({ usage: true }), who: () => ({ name: "marco", id: "", user: "m" }), now: () => new Date(2026, 10, 16, 12) });
  mkdirSync(join(home, "track"), { recursive: true });
  writeFileSync(join(home, "track", "2026-11-15.jsonl"), JSON.stringify({ name: "engine.up" }) + "\n");
  const put: { headers: Record<string, string>; body: string }[] = [];
  useDataStore({ usage: () => async (headers, body) => { put.push({ headers, body }); return 201; } });
  try {
    const r = await sendPending(dataStore().usage());
    assert.deepEqual(r.sent, ["2026-11-15.jsonl"]);
    assert.equal(put.length, 1);
    assert.equal(put[0].headers["x-sol-day"], "2026-11-15");
    assert.match(put[0].headers["x-sol-sha256"], /^[0-9a-f]{64}$/);
    assert.ok(readdirSync(join(home, "track")).includes("2026-11-15.sent"));
  } finally { useDataStore(null); }
});

test("data: two stores at once (#1350): each gets the day; the worse answer is the one the sender reads", async () => {
  const at = (s: number, got: string[], name: string) => hubStore(() => name, (async () => { got.push(name); return { status: s }; }) as unknown as typeof fetch);
  const both = async (x: number, y: number) => { const got: string[] = []; const s = await bothStores(at(x, got, "hub"), at(y, got, "supabase")).usage()!({}, "b"); return { s, got: got.sort() }; };
  assert.deepEqual(await both(200, 201), { s: 200, got: ["hub", "supabase"] });
  assert.equal((await both(409, 200)).s, 409, "kept already on one, kept on the other: done");
  assert.equal((await both(200, 0)).s, 0, "one did not answer: asked again later");
  assert.equal((await both(410, 200)).s, 410, "one refused for good: not asked again");
  assert.equal((await both(410, 503)).s, 503, "refused on one, down on the other: asked again");
  const calls: string[] = [];
  let up = 0;
  const hub = hubStore(() => "hub", (async () => { calls.push("hub"); return { status: 200 }; }) as unknown as typeof fetch);
  const sb = hubStore(() => "sb", (async () => { calls.push("sb"); return { status: up }; }) as unknown as typeof fetch);
  const two = bothStores(hub, sb), h = { "x-sol-sha256": "a".repeat(64) };
  assert.equal(await two.usage()!(h, "b"), 0, "Supabase down: asked again");
  assert.equal(await two.usage()!(h, "b"), 0);
  up = 201;
  assert.equal(await two.usage()!(h, "b"), 409, "the hub kept it already, without a post; Supabase now kept it");
  assert.deepEqual(calls, ["hub", "sb", "sb", "sb"], "the hub got the day once, not on every retry");
  const none = hubStore(() => null);
  assert.equal(bothStores(none, none).usage(), null, "nowhere on both: nothing is sent");
  const got: string[] = [];
  assert.equal(await bothStores(none, at(200, got, "supabase")).usage()!({}, "b"), 200, "the hub not there: Supabase alone");
  assert.deepEqual(got, ["supabase"]);
});

test("group chat: a line said goes out through the seam; today's is the relay (down here: not sent)", async () => {
  _talkAt(tmp("sol-seam-talk-"), tmp("sol-seam-home-"));
  _talkSend(null);
  const said: { line: Record<string, unknown>; agent: boolean }[] = [];
  useGroupChat({ ...relayChat(), say: (line, agent) => { said.push({ line, agent }); return true; } });
  try {
    const r = await typed("general", "the board is up");
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.sent, true);
    assert.equal(said.length, 1);
    assert.equal(said[0].line.thread, "general");
    assert.equal(said[0].line.text, "the board is up");
    assert.equal(said[0].agent, false);
  } finally { useGroupChat(null); }
  assert.equal(groupChat().say({ thread: "general", text: "x" }, false), false, "the relay is not up in a test");
  assert.equal(groupChat().older().where(), null, "a room not on a cloud pages nothing");
});

test("wake: today's is the relay's ping (down here: not sent); another carrier is the one asked", () => {
  useWake(null);
  assert.equal(wakeUp().send({ to: "frank", pingKind: "chat", line: "hi" }), false, "the relay is not up in a test");
  const sent: Record<string, unknown>[] = [];
  useWake({ ...relayWake(), send: (p) => { sent.push(p); return true; } });
  try {
    assert.equal(wakeUp().send({ to: "frank", pingKind: "decision", line: "look" }, true), true);
    assert.deepEqual(sent, [{ to: "frank", pingKind: "decision", line: "look" }]);
  } finally { useWake(null); }
});
