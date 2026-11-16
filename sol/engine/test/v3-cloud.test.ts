// Cowork v3's trail on Sol's cloud (fr-30 slice 0, evals E3 and F1): the cloud's own code (sol/cloud/src/trail.ts) on
// a real HTTP server on this machine, its table in a SQLite file of its own (rooms.db's place), and two Sols' engines
// syncing to it with httpCloud. The cloud appends and answers since; a Sol that was away catches up and merges; the
// cloud away, a write lands locally, waits to send, and reaches the cloud later once. Nothing leaves 127.0.0.1.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TrailStore, trailRoutes } from "../../cloud/src/trail.ts";
import { Keys } from "../src/team/v3/keys.ts";
import { Trail, type TrailEvent } from "../src/team/v3/trail.ts";
import { fold } from "../src/team/v3/record.ts";
import { Sync, httpCloud, type Cloud } from "../src/team/v3/sync.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-cloud-"));
const P = "bkq2cl";   // a project on the cloud is its room's code
const MEMBERS = new Set(["marcocyl04-ux", "franktsai2008-eng"]);

// the cloud: the hub's ticket gate stood in by "sol1.<login>", its member table by a set
const db = new DatabaseSync(join(dir, "rooms.db"));
const store = new TrailStore(db);
const route = trailRoutes({
  store, ip: () => "127.0.0.1", isMember: (code, login) => code === P && MEMBERS.has(login),
  gate: async ({ headers }) => { const t = String(headers.authorization ?? "").replace(/^Bearer /, ""); return t.startsWith("sol1.") ? { login: t.slice(5) } : null; },
});
const server: Server = createServer((req, res) => { void route(req, res).then((hit) => { if (!hit) { res.writeHead(404); res.end(); } }); });
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(() => { server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

let n = 0;
// a person's key folder is shared by their Sols (the person key is one; each machine's key its own), and every Sol in
// these tests is a machine of its own
const sol = (person: string, machine: string, cloud?: (c: Cloud) => Cloud) => {
  const d = join(dir, `${person}-${++n}`);
  const trail = new Trail({ file: join(d, "trail.db"), keys: new Keys(join(dir, "keys"), `${machine}-${n}`) });
  const http = httpCloud({ base: BASE, ticket: () => `sol1.${person}` });
  return { trail, sync: new Sync(trail, cloud ? cloud(http) : http), by: { person, machine: `${machine}-${n}` } };
};
const rows = () => (db.prepare("SELECT count(*) AS n FROM trail WHERE project = ?").get(P) as { n: number }).n;
const raw = async (path: string, login: string, init: RequestInit = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer sol1.${login}`, "content-type": "application/json" } });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};

test("the cloud trail appends and answers since; a Sol that was away catches up and merges", async () => {
  const m = sol("marcocyl04-ux", "macbook"), f = sol("franktsai2008-eng", "nucbox");
  m.trail.append({ project: P, by: m.by, kind: "item", item: "logo", value: { title: "Logo review", due: "2026-11-05" } });
  m.trail.append({ project: P, by: m.by, kind: "member", item: "franktsai2008-eng", value: { role: "editor" } });
  const pushed = await m.sync.push(P);
  assert.equal(pushed.sent, 2);
  assert.equal(pushed.waiting, 0);
  assert.equal(rows(), 2);
  // Frank was away: he wrote on his own Sol meanwhile, then comes back
  f.trail.append({ project: P, by: f.by, kind: "loose", item: "idea", value: { text: "use the moon" } });
  const back = await f.sync.run(P);
  assert.equal(back.push.sent, 1);
  assert.equal(back.pull.added.length, 2, "Marco's two events came down");
  assert.deepEqual(back.pull.bad, []);
  assert.equal(f.trail.cursor(P), 3, "his cursor is the cloud's last seq");
  const again = await m.sync.pull(P);
  assert.equal(again.added.length, 1, "Marco gets Frank's");
  assert.deepEqual(fold(m.trail.check(P).ok), fold(f.trail.check(P).ok), "both Sols fold the same record");
  // since a seq, straight from the route
  const s = await raw(`/relay/rooms/${P}/trail?since=2`, "marcocyl04-ux");
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.events.map((e: TrailEvent) => e.kind), ["loose"]);
  assert.equal(s.body.seq, 3);
  assert.equal(s.body.more, false);
  // an erase from the content's own person erases it on the cloud too, and the chain still verifies on a third Sol
  const id = m.trail.since(P)[0].id;
  assert.ok(m.trail.erase(id, m.by));
  await m.sync.push(P);
  const late = sol("franktsai2008-eng", "legion");
  await late.sync.pull(P);
  assert.equal(late.trail.get(id)!.erased, true);
  assert.equal(late.trail.get(id)!.value, undefined);
  assert.deepEqual(late.trail.check(P).bad, []);
});

test("the cloud keeps the room's members out of nobody's trail and refuses what does not verify", async () => {
  const m = sol("marcocyl04-ux", "macbook");
  const e = m.trail.append({ project: P, by: m.by, kind: "item", item: "q", value: { title: "q" } });
  assert.equal((await raw(`/relay/rooms/${P}/trail`, "stranger")).status, 404, "a non-member: the same 404 as no room");
  assert.equal((await raw(`/relay/rooms/nosuch/trail`, "marcocyl04-ux")).status, 404);
  assert.equal((await fetch(`${BASE}/relay/rooms/${P}/trail`)).status, 403, "no ticket, no trail");
  const send = (login: string, events: unknown[]) => raw(`/relay/rooms/${P}/trail`, login, { method: "POST", body: JSON.stringify({ events }) });
  // someone else's event, sent by Frank
  const r1 = await send("franktsai2008-eng", [e]);
  assert.match(r1.body.refused[0].why, /its own person/);
  // a changed value
  const r2 = await send("marcocyl04-ux", [{ ...e, value: { title: "changed" } }]);
  assert.match(r2.body.refused[0].why, /content/);
  // a changed body
  const r3 = await send("marcocyl04-ux", [{ ...e, at: e.at + 1 }]);
  assert.match(r3.body.refused[0].why, /words/);
  // a link that is not there yet
  const e2 = m.trail.append({ project: P, by: m.by, kind: "item", item: "q", field: "title", value: "q2" });
  const r4 = await send("marcocyl04-ux", [e2]);
  assert.match(r4.body.refused[0].why, /before it/);
  // the chain sent whole is kept whole, and twice is kept once
  const r5 = await send("marcocyl04-ux", [e, e2]);
  assert.deepEqual(r5.body.kept, [e.id, e2.id]);
  const before = rows();
  assert.deepEqual((await send("marcocyl04-ux", [e, e2])).body.kept, [e.id, e2.id]);
  assert.equal(rows(), before, "no duplicate");
});

test("away: a write lands locally, shows waiting to send, and reaches the cloud later without a duplicate", async () => {
  let down = true, lose = false;
  // the cloud away (no answer at all), then back but losing its first answer after keeping the events
  const flaky = (c: Cloud): Cloud => ({
    async append(p, ev) { if (down) throw new Error("fetch failed"); const r = await c.append(p, ev); if (lose) { lose = false; throw new Error("the answer was lost"); } return r; },
    since: (p, s) => (down ? Promise.reject(new Error("fetch failed")) : c.since(p, s)),
  });
  const m = sol("marcocyl04-ux", "macbook", flaky);
  const start = rows();
  const e = m.trail.append({ project: P, by: m.by, kind: "item", item: "offline", value: { title: "made on the plane" } });
  assert.equal(fold(m.trail.check(P).ok).items.offline.fields.title, "made on the plane", "the write is there at once, local first");
  const r1 = await m.sync.push(P);
  assert.equal(r1.away, "fetch failed");
  assert.equal(r1.sent, 0);
  assert.equal(r1.waiting, 1);
  assert.equal(m.sync.isWaiting(e.id), true);
  assert.equal(fold(m.trail.check(P).ok, { waiting: (id) => m.sync.isWaiting(id) }).items.offline.waiting, true, "the item shows waiting to send");
  assert.equal(m.sync.state(P).away, "fetch failed");
  const p1 = await m.sync.pull(P);
  assert.equal(p1.away, "fetch failed", "a pull while away loses nothing either");
  // back, but the first answer is lost after the cloud kept the event: the retry keeps it once
  down = false; lose = true;
  const r2 = await m.sync.push(P);
  assert.equal(r2.away, "the answer was lost");
  assert.equal(m.sync.isWaiting(e.id), true, "still waiting: this Sol never heard it was kept");
  assert.equal(rows(), start + 1, "the cloud has it");
  const r3 = await m.sync.push(P);
  assert.equal(r3.sent, 1);
  assert.equal(r3.waiting, 0);
  assert.equal(rows(), start + 1, "and has it once");
  assert.equal(m.sync.isWaiting(e.id), false);
  assert.equal(fold(m.trail.check(P).ok, { waiting: (id) => m.sync.isWaiting(id) }).items.offline.waiting, undefined);
  assert.equal(m.sync.state(P).away, "");
});
