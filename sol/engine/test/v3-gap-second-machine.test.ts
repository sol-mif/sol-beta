// Cowork v3 (fr-30, gap 10 of #574): a person's second machine. The first machine (it holds the person key) shows a
// one-time code; the second types it; through the cloud trail's pair mailbox (sol/cloud/src/trail.ts, here on a real
// HTTP server on 127.0.0.1) the first signs the second's machine and agent keys under the person key and vouches for it
// on the floor, so "my devices" lists it; the second keeps the certificates and writes as the same person, in a
// project the first pinned. A wrong code, another person's ticket or a code used twice pairs nothing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TrailStore, trailRoutes, TRAIL_ROUTES } from "../../cloud/src/trail.ts";
import * as K from "../src/team/v3/keys.ts";
import { Trail } from "../src/team/v3/trail.ts";
import { fold } from "../src/team/v3/record.ts";
import { slice0Port } from "../src/team/v3/trailport.ts";
import { Pairing, httpMailbox, slotOf, newCode, codeOk } from "../src/team/v3/pair.ts";
import { answerSeven, _setPairing } from "../src/team/v3/floorwire.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-gap-pair-"));
const ME = "marcocyl04-ux";
const db = new DatabaseSync(join(dir, "rooms.db"));
const store = new TrailStore(db);
const route = trailRoutes({ store, ip: () => "127.0.0.1", isMember: () => true,
  gate: async ({ headers }) => { const t = String(headers.authorization ?? "").replace(/^Bearer /, ""); return t.startsWith("sol1.") ? { login: t.slice(5) } : null; } });
const server: Server = createServer((req, res) => { void route(req, res).then((hit) => { if (!hit) { res.writeHead(404); res.end(); } }); });
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(() => { server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
const box = (login: string) => httpMailbox({ base: BASE, ticket: () => `sol1.${login}` });

test("a code: 8 signs, the cloud's route is the trail's", () => {
  const c = newCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.ok(codeOk(c.toLowerCase().replace("-", " ")), "typed in lower case with a space, it is the same code");
  assert.ok(TRAIL_ROUTES.test(`/relay/pair/${slotOf(c)}`));
  assert.ok(!TRAIL_ROUTES.test("/relay/pair/nothex"));
});

test("pair the MacBook to the NucBox by a code: its keys signed under my one key, listed in my devices, writing as me", async () => {
  const keysA = new K.Keys(join(dir, "a"), "nucbox"), keysB = new K.Keys(join(dir, "b"), "macbook");
  const trailA = new Trail({ file: ":memory:", keys: keysA }), trailB = new Trail({ file: ":memory:", keys: keysB });
  trailA.append({ project: "sol", by: { person: ME, machine: "nucbox" }, kind: "member", item: ME, value: { role: "owner" } });   // A pins my person key in sol
  assert.notEqual(keysB.personKeyOf(ME), keysA.person(ME).pub, "before pairing, the MacBook's keys are under a key of its own");
  const portA = slice0Port({ v3: () => ({ trail: trailA as never, keys: keysA as never }), fold: fold as never }, K as never);
  const a = new Pairing({ keys: keysA, login: ME, mailbox: box(ME) }), b = new Pairing({ keys: keysB, login: ME, mailbox: box(ME) });
  _setPairing(a);
  const offer = await answerSeven({ type: "team.v3.floor.offer", project: "sol", rid: 1 }, { me: ME, port: portA });
  assert.equal(offer.type, "work.v3.floor.offer");
  const code = String(offer.code);
  assert.ok(codeOk(code));
  assert.deepEqual((await answerSeven({ type: "team.v3.floor.paired", project: "sol" }, { me: ME, port: portA })).state, "waiting");
  // on the MacBook: the code typed
  assert.deepEqual((await b.done()).state === "none", true);
  const asked = await b.ask(code.toLowerCase());
  assert.ok("ok" in asked, JSON.stringify(asked));
  assert.equal((await b.done() as { state: string }).state, "waiting");
  // the NucBox looks: signs, answers, vouches on the floor
  const took = await answerSeven({ type: "team.v3.floor.paired", project: "sol" }, { me: ME, port: portA }) as any;
  assert.equal(took.state, "paired", JSON.stringify(took).slice(0, 300));
  assert.equal(took.name, "macbook");
  const mac = (took.devices as { name: string; vouched: boolean; here: boolean }[]).find((d) => d.name === "macbook");
  assert.ok(mac && mac.vouched && !mac.here, "my devices lists the MacBook, vouched for");
  // the MacBook keeps the certificates
  const got = await b.done();
  assert.equal((got as { state: string }).state, "paired", JSON.stringify(got));
  assert.equal(keysB.personKeyOf(ME), keysA.person(ME).pub, "its keys are under my one key now");
  assert.equal(keysB.agent(ME, "claude").cert?.pkey, keysA.person(ME).pub, "its agents' too");
  // and writes as me where the NucBox pinned my key
  const e = trailB.append({ project: "sol", by: { person: ME, machine: "macbook" }, kind: "item", item: "i-1", value: { title: "From the MacBook" } });
  const merged = trailA.merge([e]);
  assert.deepEqual(merged.bad, []);
  assert.equal(fold(trailA.check("sol").ok).items["i-1"].fields.title, "From the MacBook");
  // the cloud trail keeps both, under one pinned person key
  assert.deepEqual(store.append("sol", ME, [...trailA.since("sol")]).refused, []);
  _setPairing(null);
});

test("pairs nothing: a wrong code, another person's ticket, a code used twice, a certificate for a key it does not hold", async () => {
  const keysA = new K.Keys(join(dir, "a2"), "nucbox"), keysB = new K.Keys(join(dir, "b2"), "macbook");
  const a = new Pairing({ keys: keysA, login: ME, mailbox: box(ME) });
  const { code } = a.offer();
  // Frank's ticket on my slot: the slot is mine from its first side
  const frank = new Pairing({ keys: new K.Keys(join(dir, "f"), "frank-mac"), login: "franktsai2008-eng", mailbox: box("franktsai2008-eng") });
  assert.ok("ok" in await new Pairing({ keys: keysB, login: ME, mailbox: box(ME) }).ask(code));
  assert.match(String((await frank.ask(code) as { error?: string }).error), /someone else's|said already/);
  assert.equal(((await a.take()) as { state: string }).state, "paired");
  // the same code again: said already
  assert.match(String((await new Pairing({ keys: keysB, login: ME, mailbox: box(ME) }).ask(code) as { error?: string }).error), /said already/);
  // a wrong code reaches an empty slot
  const b = new Pairing({ keys: keysB, login: ME, mailbox: box(ME) });
  assert.ok("error" in await b.ask("ABCD"));
  // certificates for keys this machine does not hold are refused whole
  const stranger = keysA.vouch(ME, "machine", "macbook", keysA.machineKey(ME).pub);
  assert.throws(() => keysB.adopt(ME, [stranger]), /does not hold/);
  assert.notEqual(keysB.personKeyOf(ME), keysA.person(ME).pub);
});
