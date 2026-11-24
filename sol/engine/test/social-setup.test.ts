// Share a setup (#1615, src/social/setup.ts): Denise gives how she works to Dev, her friend, through their friend room's
// files. The cloud is a small stand-in with the routes friends.ts and setup.ts ask (rooms, peek, members, files with
// their version), and each person has a home of their own in a temp folder. Invented people only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const T = mkdtempSync(join(tmpdir(), "sol-setup-"));
process.env.SOL_STATE = join(T, "state");
process.env.SOL_TEAM = join(T, "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
const F = await import("../src/social/friends.ts");
const S = await import("../src/social/setup.ts");
const Fits = await import("../src/next/fits.ts");
const W = await import("../src/next/workspace.ts");

const HUB = "https://cloud.example.net/relay";
type Room = { name: string; maker: string; members: { login: string; at: number }[]; files: Map<string, { sha: string; by: string; content: string }> };
function cloud() {
  const rooms = new Map<string, Room>();
  let n = 0, clock = 1;
  const json = (status: number, v: unknown) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url: string | URL, init: RequestInit = {}) => {
    const u = new URL(String(url)), p = u.pathname.replace(/^\/relay/, ""), method = init.method ?? "GET";
    const who = String((init.headers as Record<string, string>)?.authorization ?? "").replace(/^Bearer t:/, "");
    if (p.startsWith("/peek/")) { const r = rooms.get(p.slice(6)); return r ? json(200, { code: p.slice(6), name: r.name }) : json(404, { error: "no" }); }
    if (!who) return json(403, { error: "no ticket" });
    if (method === "POST" && p === "/rooms") {
      const body = JSON.parse(String(init.body)), code = "ABCDEFGH"[n++] + "XYZ23";
      rooms.set(code, { name: body.name, maker: who, members: [{ login: who, at: clock++ }], files: new Map() });
      return json(200, { code, room: { name: body.name } });
    }
    const m = /^\/rooms\/([A-Z0-9]{6})(\/members(\/me)?|\/files)?$/.exec(p), r = m ? rooms.get(m[1]) : undefined;
    const isIn = r?.members.some((x) => x.login === who);
    if (m && !m[2] && r) { if (!isIn) r.members.push({ login: who, at: clock++ }); return json(200, { room: { name: r.name } }); }
    if (!r || !isIn) return json(404, { error: "no room" });
    if (m![2] === "/files") {
      const path = u.searchParams.get("path");
      if (path === null) return json(200, { files: [...r.files].map(([k, f]) => ({ path: k, sha: f.sha, size: Buffer.from(f.content, "base64").length, by: f.by, at: 1 })) });
      if (method === "GET") { const f = r.files.get(path); return json(200, { file: f ? { path, sha: f.sha, by: f.by, at: 1, content: f.content } : null }); }
      const v = JSON.parse(String(init.body)), had = r.files.get(path);
      if ((had?.sha ?? null) !== (v.sha ?? null)) return json(409, { error: "the file changed since it was read" });
      const sha = createHash("sha1").update(v.content).digest("hex");
      r.files.set(path, { sha, by: who, content: v.content });
      return json(200, { file: { path, sha } });
    }
    if (m![3] && method === "DELETE") { r.members = r.members.filter((x) => x.login !== who); return json(200, { left: true }); }
    return json(200, { members: r.members, maker: r.maker });
  };
  return { rooms, fetch: fetch as typeof globalThis.fetch };
}
const as = (c: ReturnType<typeof cloud>, who: string) => ({ file: join(T, `${who}-${Math.random()}.json`), hub: () => HUB, login: () => who,
  ticket: async () => `t:${who}`, fetch: c.fetch, now: () => 1, random: () => "ab12" });
const homeOf = (who: string) => { const h = mkdtempSync(join(T, `${who}-home-`)); return h; };
function folder(home: string, name: string, lines: string) { mkdirSync(join(home, name), { recursive: true }); writeFileSync(join(home, name, "stickies.md"), `# ${name} · your stickies\n\n${lines}`); }

/** Denise's home: two folders with stickies (words and notes that must never leave), one fit she set, one Sol set */
function denise() {
  const h = homeOf("denise");
  folder(h, "Studio", "- [ ] Who paid — the rent split with the landlord's number 555-0101\n  - did: drafted the reminder\n- [x] Old done thing\n");
  folder(h, "Clients", "- [ ] Clients together\n");
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(join(h, "next", "you.json"), JSON.stringify({ knows: [{ fact: "Denise is allergic to cats" }] }));
  Fits.personSet(h, { knob: "diary.look", scope: "~", take: "calm" });
  Fits.solSet(h, { knob: "diary.size", scope: "~", take: "big", reason: "she opens it daily", count: 4 });
  return h;
}

test("the card is drawn from her Sol: folders by name, open stickies by title, her own fits; never words, notes or what Sol knows", () => {
  const h = denise();
  const c = S.draft(h, "denise", 5);
  assert.deepEqual(c.parts, [
    { id: "p:Clients", kind: "place", name: "Clients", pieces: ["Clients together"] },
    { id: "p:Studio", kind: "place", name: "Studio", pieces: ["Who paid"] },
    { id: "f:diary.look", kind: "fit", knob: "diary.look", take: "calm" },
  ], "a done sticky, Sol's own fit and the engine's next/ folder stay home");
  const all = JSON.stringify(c);
  for (const never of ["555-0101", "landlord", "drafted the reminder", "allergic", "Old done thing", "diary.size"]) assert.ok(!all.includes(never), never);
});

test("Denise gives the parts she picks; Dev sees the card, takes some, gets them marked from her; Back takes them away", async () => {
  const c = cloud(), dn = as(c, "denise"), dv = as(c, "dev"), dh = denise(), vh = homeOf("dev");
  const l = await F.makeLink(dn);
  assert.ok(l.ok);
  assert.ok((await F.addFriend(dv, l.link)).ok);
  assert.deepEqual(await S.send(dn, dh, l.code, []), { ok: false, why: "pick at least one part to give" });
  const sent = await S.send(dn, dh, l.code, ["p:Studio", "f:diary.look"]);
  assert.deepEqual(sent, { ok: true, sent: 2, to: "your friend" });
  assert.deepEqual(await S.cards(dn), { ok: true, cards: [] }, "her own card is never shown to her");
  const got = await S.cards(dv);
  assert.ok(got.ok);
  assert.equal(got.cards.length, 1);
  assert.equal(got.cards[0].from, "denise");
  assert.deepEqual(got.cards[0].parts.map((p) => p.id), ["p:Studio", "f:diary.look"]);
  // she gives again: the same file, a new version; a take of the old version is refused
  assert.ok((await S.send(dn, dh, l.code, ["p:Studio", "p:Clients", "f:diary.look"])).ok);
  assert.match((await S.take(dv, vh, l.code, got.cards[0].sha, []) as { why: string }).why, /changed or is gone/);
  const now = await S.cards(dv);
  assert.ok(now.ok && now.cards[0].parts.length === 3);
  const t = await S.take(dv, vh, l.code, now.cards[0].sha, ["p:Studio", "f:diary.look"]);
  assert.ok(t.ok);
  assert.equal(t.from, "denise");
  assert.equal(t.made, 2, "one sticky and one fit");
  assert.match(readFileSync(join(vh, "Studio", "stickies.md"), "utf8"), /Who paid/);
  assert.equal(existsSync(join(vh, "Clients")), false, "a part not picked stays out");
  const plan = W.plansOf(vh).find((p) => p.id === t.plan)!;
  assert.equal(plan.source, "from denise", "the change says whose it was: the face marks its pieces with it");
  const fit = Fits.takeOf(vh, "diary.look", "~");
  assert.deepEqual([fit.take, fit.author, fit.source], ["calm", "person", "from denise"]);
  assert.match((await S.take(dv, vh, l.code, now.cards[0].sha, ["p:Studio"]) as { why: string }).why, /all of that already/);
  assert.deepEqual(S.backTake(vh, t.plan, t.fits), { ok: true });
  assert.equal(existsSync(join(vh, "Studio")), false, "Back took the folder away");
  assert.equal(Fits.takeOf(vh, "diary.look", "~").take, null);
});

test("a card names a folder only: a path, a hidden folder or the engine's own is never written; a stranger's card is not read", async () => {
  const vh = homeOf("dev");
  const card = S.cardOf({ v: 1, from: "x", parts: [{ kind: "place", name: "../escape", pieces: ["a"] }, { kind: "place", name: "next", pieces: ["a"] }, { kind: "place", name: ".ssh", pieces: ["a"] }, { kind: "fit", knob: "bad knob", take: "x" }] })!;
  assert.equal(S.specOf(vh, card, new Set(card.parts.map((p) => p.id))).spec, null);
  assert.equal(card.parts.some((p) => p.kind === "fit"), false);
  assert.equal(S.cardOf({ v: 2, parts: [] }), null);
  const c = cloud();
  assert.deepEqual(await S.cards(as(c, "dev")), { ok: true, cards: [] }, "no friend rooms, no cards");
});
