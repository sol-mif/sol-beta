// Real friends in BR1's Social (#1615, src/social/friends.ts): a friend link is a room of two on Sol's cloud. Here the
// cloud is a small stand-in with the routes friends.ts asks (POST /rooms, GET /peek/<code>, GET /rooms/<code> that makes a
// member, its members with the maker, DELETE members/me), so two people, ana and ben, and a third, cy, can be walked
// through it with their own files. The same walk ran against sol/cloud's real startCloud on the NucBox (#1615's PR).
// Nothing here touches a cloud, a team.json or the person's state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const T = mkdtempSync(join(tmpdir(), "sol-friends-"));
process.env.SOL_STATE = join(T, "state");
process.env.SOL_TEAM = join(T, "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
const F = await import("../src/social/friends.ts");

const HUB = "https://cloud.example.net/relay";
type Room = { name: string; maker: string; members: { login: string; at: number }[] };
function cloud() {
  const rooms = new Map<string, Room>();
  let n = 0, clock = 1;
  const json = (status: number, v: unknown) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url: string | URL, init: RequestInit = {}) => {
    const u = new URL(String(url)), p = u.pathname.replace(/^\/relay/, ""), method = init.method ?? "GET";
    const who = String((init.headers as Record<string, string>)?.authorization ?? "").replace(/^Bearer t:/, "");
    if (p.startsWith("/peek/")) { const r = rooms.get(p.slice(6)); return r ? json(200, { code: p.slice(6), name: r.name }) : json(404, { error: "no group has this code" }); }
    if (!who) return json(403, { error: "no ticket" });
    if (method === "POST" && p === "/rooms") {
      const body = JSON.parse(String(init.body));
      const code = "ABCDEFGH"[n++] + "XYZ23";   // the hub's alphabet: no 0, 1, I or O (hub-types.ts CODE)
      rooms.set(code, { name: body.name, maker: who, members: [{ login: who, at: clock++ }] });
      return json(200, { code, room: { name: body.name, provider: "cloud", org: "", repos: [] } });
    }
    const m = /^\/rooms\/([A-Z0-9]{6})(\/members(\/me)?)?$/.exec(p), r = m ? rooms.get(m[1]) : undefined;
    const isIn = r?.members.some((x) => x.login === who);
    if (m && !m[2] && r) { if (!isIn) r.members.push({ login: who, at: clock++ }); return json(200, { room: { name: r.name, provider: "cloud" } }); }
    if (!r || !isIn) return json(404, { error: "no room" });
    if (m![3] && method === "DELETE") { r.members = r.members.filter((x) => x.login !== who); return json(200, { left: true }); }
    return json(200, { members: r.members, maker: r.maker });
  };
  return { rooms, fetch: fetch as typeof globalThis.fetch };
}
const as = (c: ReturnType<typeof cloud>, who: string | null) => ({ file: join(T, `${who}-${Math.random()}.json`), hub: () => HUB, login: () => who,
  ticket: async () => `t:${who}`, fetch: c.fetch, now: () => 1, random: () => "ab12" });

test("a friend link: made once and handed out again while it waits, opened by one friend, then each sees the other", async () => {
  const c = cloud(), ana = as(c, "ana"), ben = as(c, "ben");
  const l = await F.makeLink(ana);
  assert.ok(l.ok);
  assert.equal(l.link, `${HUB}/j/${l.code}`);
  assert.equal(c.rooms.get(l.code)!.name, "Friend · ana · ab12", "its name says whose link it is (the join page shows it)");
  assert.equal((statSync(ana.file).mode & 0o777), 0o600);
  assert.deepEqual(await F.makeLink(ana), { ok: true, link: l.link, code: l.code, again: true }, "no second room while it waits");
  const b = await F.addFriend(ben, `here: ${l.link}`);
  assert.ok(b.ok && !b.already);
  const [an, bn] = [await F.friendsNow(ana), await F.friendsNow(ben)];
  assert.deepEqual(an.friends.map((f) => [f.code, f.mine, f.people]), [[l.code, true, ["ben"]]]);
  assert.deepEqual(bn.friends.map((f) => [f.code, f.mine, f.people]), [[l.code, false, ["ana"]]]);
  const l2 = await F.makeLink(ana);
  assert.ok(l2.ok && l2.code !== l.code, "a used link is never handed out again");
});

test("a used link turns a third person away and nobody sees them; a group's code, my own link and words are refused", async () => {
  const c = cloud(), ana = as(c, "ana"), ben = as(c, "ben"), cy = as(c, "cy");
  const l = await F.makeLink(ana);
  assert.ok(l.ok);
  assert.ok((await F.addFriend(ben, l.code)).ok);
  const third = await F.addFriend(cy, l.code);
  assert.equal(third.ok, false);
  assert.match((third as { why: string }).why, /someone opened that link already/);
  assert.equal(c.rooms.get(l.code)!.members.some((m) => m.login === "cy"), false, "cy left at once");
  assert.deepEqual((await F.friendsNow(ben)).friends[0].people, ["ana"]);
  c.rooms.set("GRUPP2", { name: "Study group", maker: "ana", members: [{ login: "ana", at: 0 }] });
  assert.match((await F.addFriend(ben, "GRUPP2") as { why: string }).why, /a group's \(Study group\): join it in Cowork/);
  assert.equal(c.rooms.get("GRUPP2")!.members.length, 1, "peeked, never joined");
  const own = as(c, "ana"); const l3 = await F.makeLink(own);
  assert.ok(l3.ok);
  assert.match((await F.addFriend(as(c, "ana"), l3.link) as { why: string }).why, /your own link/);
  assert.match((await F.addFriend(ben, "hello there") as { why: string }).why, /not a friend link/);
  assert.match((await F.addFriend(ben, "ZZZZZ9") as { why: string }).why, /no friend link has that code/);
});

test("a friend link opened from a browser is only peeked first: whose it is, nobody made a member, then the yes adds", async () => {
  const c = cloud(), ana = as(c, "ana"), ben = as(c, "ben");
  const l = await F.makeLink(ana);
  assert.ok(l.ok);
  assert.equal(F.whoseLink("Friend · ana · ab12"), "ana");
  assert.equal(F.whoseLink("Study group"), "");
  assert.deepEqual(await F.peekFriend(ben, `sol://join?code=${l.code}`), { ok: true, code: l.code, who: "ana", name: "Friend · ana · ab12" });
  assert.deepEqual(c.rooms.get(l.code)!.members.map((m) => m.login), ["ana"], "a peek joins nothing");
  assert.match((await F.peekFriend(ana, l.link) as { why: string }).why, /your own link/);
  c.rooms.set("GRUPP2", { name: "Study group", maker: "ana", members: [{ login: "ana", at: 0 }] });
  assert.match((await F.peekFriend(ben, "GRUPP2") as { why: string }).why, /a group's \(Study group\)/);
  assert.ok((await F.addFriend(ben, `sol://join?code=${l.code}`)).ok);
  assert.deepEqual(await F.peekFriend(ben, l.code), { ok: true, code: l.code, who: "ana", name: "Friend · ana · ab12", already: true });
});

test("unfriend leaves the room: gone from both sides; a Sol not signed in to the cloud is told to sign in", async () => {
  const c = cloud(), ana = as(c, "ana"), ben = as(c, "ben");
  const l = await F.makeLink(ana);
  assert.ok(l.ok);
  await F.addFriend(ben, l.code);
  assert.deepEqual(await F.unfriend(ben, l.code), { ok: true });
  assert.deepEqual((await F.friendsNow(ben)).friends, []);
  assert.deepEqual((await F.friendsNow(ana)).friends[0].people, [], "ana's link waits again");
  const out = as(c, null);
  assert.deepEqual(await F.makeLink(out), { ok: false, why: F.SIGN_IN });
  assert.equal((await F.friendsNow(out)).signIn, F.SIGN_IN);
  assert.equal(F.codeIn("sol://join?code=w4j6vv"), "W4J6VV");
  // what a pasted link carries around it: a period, a comma, a bracket, quotes, a space, a new line, words after it
  const L = "https://cloud.example.net/relay/j/CL69LK";
  for (const pasted of [`${L}.`, `${L},`, `(${L})`, `[${L}]`, `"${L}"`, `'${L}'`, `“${L}”`, `${L} `, `${L}\n`, `<${L}>`, `here: ${L}. see you`, `${L}?x=1`, "CL69LK.", "(cl69lk)"])
    assert.equal(F.codeIn(pasted), "CL69LK", JSON.stringify(pasted));
  assert.equal(F.codeIn(`${L}7`), "", "seven letters after /j/ is not a code");
});

test("a quiet Sol (SOL_QUIET) asks the cloud nothing: no link is made and it says why", async () => {
  const c = cloud(), ana = as(c, "ana");
  let asked = 0;
  const counted = { ...ana, fetch: (async (u: string | URL, i?: RequestInit) => { asked++; return c.fetch(u, i); }) as typeof globalThis.fetch };
  process.env.SOL_QUIET = "1";
  try {
    const l = await F.makeLink(counted);
    assert.equal(l.ok, false);
    assert.match((l as { why: string }).why, /quiet/);
    assert.equal(asked, 0, "nothing left this Mac");
  } finally { delete process.env.SOL_QUIET; }
});
