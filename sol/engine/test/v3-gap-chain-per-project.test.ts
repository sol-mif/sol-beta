// Cowork v3 (fr-30, gap 3 of #574): one chain per writer per project. A teammate who writes in two projects makes two
// chains; a Sol that holds only one of the projects (and the cloud, which keeps each project apart) verifies that
// project's chain whole. Events of the first version (from 2026-10-31 until CHAIN_PER_PROJECT) chained across projects
// and still verify, as the start of their writer's chain in the project.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TrailStore } from "../../cloud/src/trail.ts";
import { Keys } from "../src/team/v3/keys.ts";
import { Trail, bodyOf, canonical, eventId, hashOf, ACROSS_FROM, CHAIN_PER_PROJECT, type TrailEvent } from "../src/team/v3/trail.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-gap-chain-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const frank = { person: "franktsai2008-eng", machine: "frank-mac" }, me = { person: "marcocyl04-ux", machine: "macbook" };

test("a writer in two projects: each project's chain is whole on its own, on the cloud and on a Sol holding only one", () => {
  const fk = new Keys(join(dir, "frank"), "frank-mac");
  const f = new Trail({ file: ":memory:", keys: fk });
  f.append({ project: "kaat", by: frank, kind: "item", item: "k-1", value: { title: "Prices" } });
  const s1 = f.append({ project: "sol", by: frank, kind: "item", item: "s-1", value: { title: "Logo" } });
  f.append({ project: "kaat", by: frank, kind: "item", item: "k-2", value: { title: "Stock" } });
  const s2 = f.append({ project: "sol", by: frank, kind: "item", item: "s-2", value: { title: "Icons" } });
  assert.equal(s1.prev, "", "his first event in sol starts sol's chain, not after his kaat one");
  assert.equal(s2.prev, s1.id, "his next in sol follows his last in sol");
  // the cloud, which keeps each project apart, keeps sol's chain whole
  const db = new DatabaseSync(":memory:"), store = new TrailStore(db);
  const sent = store.append("sol", frank.person, f.since("sol"));
  assert.deepEqual(sent.refused, []);
  assert.equal(sent.kept.length, 2);
  // a Sol that holds only sol merges it from the cloud, strict, and its check is clean
  const m = new Trail({ file: ":memory:", keys: new Keys(join(dir, "me"), "macbook") });
  m.append({ project: "sol", by: me, kind: "member", item: frank.person, value: { role: "editor" } });
  const got = m.merge(store.since("sol", 0).events);
  assert.deepEqual(got.bad, []);
  assert.equal(got.added.length, 2);
  assert.deepEqual(m.check("sol").bad, []);
  db.close();
});

test("an event of the first version chained across projects still verifies, on the cloud and on a Sol", () => {
  const fk = new Keys(join(dir, "frank-v1"), "frank-mac");
  const at = ACROSS_FROM + 3_600_000;
  assert.ok(at < CHAIN_PER_PROJECT);
  const f = new Trail({ file: ":memory:", keys: fk, now: () => at });
  const k1 = f.append({ project: "kaat", by: frank, kind: "item", item: "k-1", value: { title: "Prices" } });
  // what the first version wrote: v 1, its previous the writer's last event anywhere (here in kaat)
  const signer = fk.signerFor(frank), value = { title: "Logo" };
  const body = bodyOf({ v: 1, project: "sol", by: frank, kind: "item", item: "s-1", fields: ["title"], hash: hashOf(value), at: at + 10, prev: k1.id, key: signer.pub, cert: signer.cert } as never);
  const v1 = { ...body, id: eventId(body), sig: signer.sign(canonical(body)), value, seq: 0 } as TrailEvent;
  const db = new DatabaseSync(":memory:"), store = new TrailStore(db);
  assert.deepEqual(store.append("sol", frank.person, [v1]).refused, [], "the cloud keeps it as the start of his sol chain");
  const m = new Trail({ file: ":memory:", keys: new Keys(join(dir, "me-v1"), "macbook") });
  assert.deepEqual(m.merge([v1]).bad, [], "a Sol without kaat keeps it");
  assert.deepEqual(m.check("sol").bad, []);
  // the same across-projects link, written as the second version, is refused: from now on a chain is per project
  const body2 = bodyOf({ ...body, v: 2 } as never);
  const v2 = { ...body2, id: eventId(body2), sig: signer.sign(canonical(body2)), value, seq: 0 } as TrailEvent;
  const fresh = new TrailStore(new DatabaseSync(":memory:"));
  assert.match(fresh.append("sol", frank.person, [v2]).refused[0]?.why ?? "", /before it/);
  assert.equal(new Trail({ file: ":memory:", keys: new Keys(join(dir, "me-v2"), "macbook") }).merge([v2]).bad[0]?.why, "chain");
  db.close();
});
