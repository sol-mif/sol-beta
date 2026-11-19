// Cowork v3's trail (fr-30 slice 0, evals E1, E2, F3): every write one signed event, chained per writer; content
// erasable to its hash with the chain still whole; a tampered event refused and named while the rest still fold.
// Two "machines" are two key folders with their own machine names; nothing leaves this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keys, certOk } from "../src/team/v3/keys.ts";
import { Trail, verify, canonical, hashOf, eventId, bodyOf, type TrailEvent } from "../src/team/v3/trail.ts";
import { fold } from "../src/team/v3/record.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-trail-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const sol = (machine: string, clock?: () => number) => {
  const d = join(dir, `${machine}-${++n}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { keys, trail: new Trail({ file: join(d, "trail.db"), keys, ...(clock ? { now: clock } : {}) }) };
};
const P = "sol";
const marco = (machine: string, agent?: string) => ({ person: "marcocyl04-ux", machine, ...(agent ? { agent } : {}) });

test("a write is one signed event, chained after its writer's last one; each machine and agent its own chain", () => {
  const mac = sol("macbook"), t = mac.trail;
  const a = t.append({ project: P, by: marco("macbook"), kind: "item", item: "logo", value: { title: "Logo review", due: "2026-11-05" } });
  const b = t.append({ project: P, by: marco("macbook"), kind: "item", item: "logo", field: "owner", value: "franktsai2008-eng" });
  const c = t.append({ project: P, by: marco("macbook", "claude"), kind: "loose", item: "idea-1", value: { text: "a poll card" } });
  assert.equal(a.prev, "", "the first event of a writer has no previous");
  assert.equal(b.prev, a.id, "the next one names the one before it");
  assert.equal(c.prev, "", "the agent's key is its own writer, with its own chain");
  assert.notEqual(c.key, a.key);
  assert.equal(a.id, eventId(bodyOf(a)), "an event's id is the hash of its signed body");
  assert.equal(a.hash, hashOf(a.value), "the body points at its content by hash");
  assert.deepEqual(a.fields, ["due", "title"]);
  assert.ok(certOk(a.cert) && a.cert.kind === "machine" && a.cert.name === "macbook" && a.cert.pkey === mac.keys.person("marcocyl04-ux").pub);
  assert.ok(certOk(c.cert) && c.cert.kind === "agent" && c.cert.name === "claude", "an agent key is signed under its person's key");
  assert.deepEqual(a.by, marco("macbook"));
  assert.deepEqual([a.seq, b.seq, c.seq], [1, 2, 3]);
  const v = t.check(P);
  assert.equal(v.bad.length, 0);
  assert.equal(v.ok.length, 3);
  assert.deepEqual(t.since(P, 1).map((e) => e.id), [b.id, c.id], "since gives what came after a seq");
  assert.throws(() => mac.keys.signerFor(marco("nucbox")), /holds the key of macbook/, "a Sol signs only as its own machine");
});

test("the keys stay in the state dir, private, and are made once", () => {
  const d = join(dir, "keys-only");
  const k = new Keys(d, "macbook");
  const p = k.person("marcocyl04-ux"), m = k.machineKey("marcocyl04-ux");
  assert.equal(new Keys(d, "macbook").person("marcocyl04-ux").pub, p.pub, "read back, never made again");
  assert.equal(new Keys(d, "macbook").machineKey("marcocyl04-ux").pub, m.pub);
  assert.equal(statSync(join(d, "marcocyl04-ux", "person.pem")).mode & 0o777, 0o600);
  assert.equal(statSync(join(d, "marcocyl04-ux")).mode & 0o777, 0o700);
  assert.throws(() => k.person("../etc"), /login/);
});

test("erase: an event's content becomes its hash, and the chain still verifies", () => {
  const { trail: t } = sol("macbook");
  const a = t.append({ project: P, by: marco("macbook"), kind: "item", item: "x", value: { title: "my phone number is 555" } });
  const b = t.append({ project: P, by: marco("macbook"), kind: "item", item: "x", field: "done", value: true });
  assert.equal(t.erase(a.id, { person: "franktsai2008-eng" }), false, "only the content's own person erases it");
  assert.equal(t.erase(a.id, marco("macbook")), true);
  const e = t.get(a.id)!;
  assert.equal(e.erased, true);
  assert.equal(e.value, undefined, "the content is gone");
  assert.equal(e.hash, a.hash, "its hash stays in its place");
  assert.equal(e.sig, a.sig);
  assert.doesNotMatch(canonical(t.raw.prepare("SELECT body FROM event WHERE id = ?").get(a.id)), /phone number is 555/, "not on the disk either");   // the words, not "555" alone: an id or signature can hold it
  const v = t.check(P);
  assert.deepEqual(v.bad, [], "the erased event and the ones after it all verify");
  assert.deepEqual(v.ok.map((x) => x.id).sort(), [a.id, b.id, t.since(P, 2)[0].id].sort(), "with the erase event itself on the trail");
  assert.equal(t.since(P, 2)[0].kind, "erase");
  const r = fold(v.ok);
  assert.equal(r.items.x.fields.title, null, "an erased field folds to nothing");
  assert.deepEqual(r.items.x.erased, ["title"]);
  assert.equal(r.items.x.fields.done, true);
  assert.equal(r.erasedCount, 1);
  // the erase travels: another Sol holding the content erases it when the erase event merges in
  const other = sol("nucbox").trail;
  other.merge([a, b]);
  assert.equal(other.get(a.id)!.value !== undefined, true);
  const m = other.merge(t.since(P, 0));
  assert.deepEqual(m.bad, []);
  assert.equal(other.get(a.id)!.erased, true);
  assert.equal(other.get(a.id)!.value, undefined);
  assert.deepEqual(other.check(P).bad, []);
});

const corrupt = (t: Trail, id: string, f: (body: string) => string) => {
  const r = t.raw.prepare("SELECT body FROM event WHERE id = ?").get(id) as { body: string };
  t.raw.prepare("UPDATE event SET body = ? WHERE id = ?").run(f(r.body), id);
};

test("tamper: a changed byte on the disk is named, the rest still fold", () => {
  const { trail: t } = sol("macbook");
  const ev = [0, 1, 2, 3, 4].map((i) => t.append({ project: P, by: marco("macbook"), kind: "item", item: `i${i}`, value: { title: `thing ${i}` } }));
  corrupt(t, ev[2].id, (s) => s.replace("thing 2", "thing 9"));
  const v = t.check(P);
  assert.deepEqual(v.bad.map((b) => [b.id, b.why]), [[ev[2].id, "content"]], "the changed content names its event");
  assert.equal(v.ok.length, 4, "the events after it still chain to it by id and verify");
  const r = fold(v.ok);
  assert.deepEqual(Object.keys(r.items).sort(), ["i0", "i1", "i3", "i4"]);
  // a changed time: its words no longer make its id
  corrupt(t, ev[3].id, (s) => s.replace(/"at":(\d+)/, (_m, x) => `"at":${Number(x) + 1}`));
  assert.deepEqual(t.check(P).bad.map((b) => b.why).sort(), ["content", "id"]);
  // a row that is not JSON any more is named too, and the one after it still finds its previous
  corrupt(t, ev[1].id, (s) => s.slice(0, 20));
  const w = t.check(P);
  assert.deepEqual(w.bad.map((b) => b.why).sort(), ["content", "id", "unreadable"]);
  assert.deepEqual(w.ok.map((e) => e.item).sort(), ["i0", "i4"]);
});

test("tamper: a bad signature, an uncertified key, a missing link, a fork and another person key are refused and named", () => {
  // two clocks, a minute apart (#1622): verify() pins a person's key from the first event in time order, and on a fast
  // machine a's e1 and mallory's forged event tie on one millisecond, where the key string decides and mallory's
  // random key is pinned half the time. With mallory a minute later, the pin is always a's.
  const T = Date.UTC(2026, 10, 19, 10, 0, 0);
  const a = sol("macbook", () => T), mallory = sol("macbook", () => T + 60_000);
  const e1 = a.trail.append({ project: P, by: marco("macbook"), kind: "item", item: "k", value: { title: "one" } });
  const e2 = a.trail.append({ project: P, by: marco("macbook"), kind: "item", item: "k", field: "title", value: "two" });
  const e3 = a.trail.append({ project: P, by: marco("macbook"), kind: "item", item: "k", field: "title", value: "three" });
  const frank = a.trail.append({ project: P, by: { person: "franktsai2008-eng", machine: "macbook" }, kind: "item", item: "f", value: { title: "frank's" } });
  // a signature swapped for another event's
  const badSig = { ...e2, sig: e1.sig };
  // someone else's key claiming to be marco: another person key than the one pinned
  const forged = mallory.trail.append({ project: P, by: marco("macbook"), kind: "item", item: "k", field: "title", value: "mine now" });
  // a machine's key claiming that machine with no certificate from its person: well signed, but nobody vouched for it
  const k = a.keys.signerFor(marco("macbook"));
  const { cert: _c, ...noCertBody } = bodyOf(e1);
  const bare = { ...noCertBody, id: eventId(noCertBody as never), sig: k.sign(canonical(noCertBody)), value: e1.value, seq: 0 };
  // a fork: a second event after e1 by the same key, made by hand with that key
  const forkBody = bodyOf({ ...bodyOf(e2), hash: hashOf("fork"), at: e2.at + 1 });
  const fork = { ...forkBody, id: eventId(forkBody), sig: k.sign(canonical(forkBody)), value: "fork", seq: 0 } as TrailEvent;
  const v = verify([e1, badSig, e3, frank, forged, bare, fork]);
  const why = Object.fromEntries(v.bad.map((b) => [b.id === forged.id ? "forged" : b.id === fork.id ? "fork" : b.id === bare.id ? "bare" : b.id === e2.id ? "e2" : b.id, b.why]));
  assert.equal(why.e2, "signature");
  assert.equal(why.forged, "person key");
  assert.equal(why.bare, "key");
  assert.ok(v.bad.every((b) => b.line.length > 5), "each named with one line");
  assert.ok(v.ok.some((e) => e.id === frank.id) && v.ok.some((e) => e.id === e1.id), "the rest still fold");
  // e3's previous is e2, whose signature is bad but whose id is present: e3 itself verifies
  assert.ok(v.ok.some((e) => e.id === e3.id));
  // without e2 at all: e3's chain is missing a link
  assert.deepEqual(verify([e1, e3]).bad.map((b) => [b.id, b.why]), [[e3.id, "chain"]]);
  // the fork: two events after e1 by one key, the later refused
  assert.deepEqual(verify([e1, e2, fork]).bad.map((b) => [b.id, b.why]), [[fork.id, "fork"]]);
  // merged into a trail, the refused ones are named and never kept
  const b = sol("nucbox").trail;
  const m = b.merge([e1, badSig, e3, frank, forged]);
  assert.deepEqual(m.bad.map((x) => x.why).sort(), ["chain", "person key", "signature"], "e3 waits: its previous was refused");
  assert.equal(b.get(forged.id), null);
  assert.equal(m.added.length, 2, "e1 and frank's");
  assert.equal(b.merge([e2, e3]).added.length, 2, "the real e2 arrives, then e3 chains");
  assert.equal(b.merge([fork]).bad[0].why, "fork", "a fork of what is already kept");
  assert.equal(b.merge([e1]).already, 1, "the same event twice is kept once");
});
