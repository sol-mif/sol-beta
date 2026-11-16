// Cowork v3's record (fr-30 slice 0, evals E1 and F2): folded from the trail, the same in any order, per item and per
// field; two Sols that change one field offline both keep both versions, on one conflict, and nothing is lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keys } from "../src/team/v3/keys.ts";
import { Trail, type TrailEvent } from "../src/team/v3/trail.ts";
import { fold, conflictOf, settingOf, headsOf } from "../src/team/v3/record.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-v3-record-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
let n = 0;
/** a Sol: its own keys, its own trail, its own clock */
const sol = (person: string, machine: string, start = 1_000) => {
  let t = start;
  const d = join(dir, `${person}-${machine}-${++n}`);
  const trail = new Trail({ file: join(d, "trail.db"), keys: new Keys(join(d, "keys"), machine), now: () => (t += 10) });
  return { trail, by: { person, machine }, tick: (ms: number) => { t += ms; } };
};
const P = "sol";
/** a seeded shuffle, so a failure can be run again */
function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) % 2 ** 31; const j = seed % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** both Sols hear everything the other wrote */
const swap = (a: Trail, b: Trail) => { const x = a.since(P), y = b.since(P); a.merge(y); b.merge(x); };

test("the record folded from the trail is the same record whatever order the events come in, per item and per field", () => {
  const m = sol("marcocyl04-ux", "macbook"), f = sol("franktsai2008-eng", "macbook", 1_005), i = sol("isaac-sol", "legion", 1_003);
  m.trail.append({ project: P, by: m.by, kind: "item", item: "logo", value: { title: "Logo review", due: "2026-11-05", owner: "franktsai2008-eng" } });
  m.trail.append({ project: P, by: m.by, kind: "member", item: "franktsai2008-eng", value: { role: "owner" } });
  m.trail.append({ project: P, by: m.by, kind: "place", item: "drive", value: { kind: "drive", name: "Team Drive" } });
  m.trail.append({ project: P, by: m.by, kind: "route", item: "documents", field: "place", value: "drive" });
  m.trail.append({ project: P, by: m.by, kind: "setting", item: "team", field: "quiet", value: "22-07" });
  swap(m.trail, f.trail); swap(f.trail, i.trail);
  f.trail.append({ project: P, by: f.by, kind: "item", item: "logo", field: "due", value: "2026-11-06" });
  i.trail.append({ project: P, by: i.by, kind: "loose", item: "poll-1", value: { text: "which colour?" } });
  i.trail.append({ project: P, by: i.by, kind: "setting", item: "me:isaac-sol", field: "quiet", value: "off" });
  f.trail.append({ project: P, by: f.by, kind: "route", item: "documents", field: "place", value: "record" });
  swap(m.trail, f.trail); swap(m.trail, i.trail); swap(f.trail, i.trail);
  const all = m.trail.check(P).ok;
  assert.equal(all.length, 9);
  const want = fold(all);
  for (let s = 1; s <= 25; s++) assert.deepEqual(fold(shuffled(all, s)), want, `the order of seed ${s} folds the same record`);
  assert.deepEqual(fold(f.trail.check(P).ok), want, "every Sol folds the same record");
  assert.deepEqual(fold(i.trail.check(P).ok), want);
  // what the record holds
  assert.deepEqual(want.items.logo.fields, { title: "Logo review", due: "2026-11-06", owner: "franktsai2008-eng" });
  assert.equal(want.items.logo.by.person, "marcocyl04-ux", "an item's maker: whose face it shows");
  assert.equal(want.loose["poll-1"].fields.text, "which colour?");
  assert.equal(want.members["franktsai2008-eng"].fields.role, "owner");
  assert.equal(want.places.drive.fields.name, "Team Drive");
  assert.deepEqual(want.routing, { documents: "record" });
  assert.deepEqual(want.settings.team, { quiet: "22-07" });
  assert.equal(settingOf(want, "quiet", "isaac-sol"), "off", "a person's own layer comes first");
  assert.equal(settingOf(want, "quiet", "marcocyl04-ux"), "22-07", "else the team's");
  assert.deepEqual(want.conflicts, [], "each change was made after seeing the one before it");
  assert.equal(want.count, 9);
});

test("conflict: two Sols edit the same field offline; both versions show on one conflict and nothing is lost", () => {
  const m = sol("marcocyl04-ux", "macbook"), f = sol("franktsai2008-eng", "nucbox");
  const made = m.trail.append({ project: P, by: m.by, kind: "item", item: "logo", value: { title: "Logo review", due: "2026-11-05" } });
  swap(m.trail, f.trail);
  // both away from each other: each changes the title, Frank later by the clock
  const a = m.trail.append({ project: P, by: m.by, kind: "item", item: "logo", field: "title", value: "Logo review (Marco)" });
  f.tick(1_000);
  const b = f.trail.append({ project: P, by: f.by, kind: "item", item: "logo", field: "title", value: "Logo review (Frank)" });
  assert.deepEqual(a.base, [made.id], "each saw the first title");
  assert.deepEqual(b.base, [made.id]);
  swap(m.trail, f.trail);
  const rm = fold(m.trail.check(P).ok), rf = fold(f.trail.check(P).ok);
  assert.deepEqual(rm, rf, "both Sols see the same conflict");
  assert.deepEqual(rm.items.logo.conflicts, ["title"], "the item carries the flag the conflict card reads");
  const c = conflictOf(rm, "items", "logo", "title")!;
  assert.ok(c);
  assert.deepEqual(c.versions.map((v) => v.value), ["Logo review (Marco)", "Logo review (Frank)"], "both versions, in the trail's order");
  assert.deepEqual(c.versions.map((v) => v.by.person), ["marcocyl04-ux", "franktsai2008-eng"]);
  assert.equal(c.shown, b.id, "the latest is shown first meanwhile");
  assert.equal(rm.items.logo.fields.title, "Logo review (Frank)");
  assert.equal(rm.items.logo.fields.due, "2026-11-05", "the other fields are not in conflict");
  assert.equal(conflictOf(rm, "items", "logo", "due"), null);
  // one press on Marco's version: an edit that has seen both ends the conflict, on every Sol
  const pick = m.trail.append({ project: P, by: m.by, kind: "item", item: "logo", field: "title", value: c.versions[0].value });
  assert.deepEqual(pick.base, [a.id, b.id].sort(), "the press names both versions it replaces");
  swap(m.trail, f.trail);
  const after = fold(f.trail.check(P).ok);
  assert.deepEqual(after.conflicts, []);
  assert.equal(after.items.logo.conflicts, undefined);
  assert.equal(after.items.logo.fields.title, "Logo review (Marco)");
  assert.equal(f.trail.since(P).filter((e) => e.field === "title").length, 3, "nothing is lost: every version stays on the trail");
});

test("conflict: the same value from both sides is no conflict; an edit after seeing the other replaces it", () => {
  const m = sol("marcocyl04-ux", "macbook"), f = sol("franktsai2008-eng", "nucbox");
  m.trail.append({ project: P, by: m.by, kind: "item", item: "x", field: "done", value: false });
  swap(m.trail, f.trail);
  m.trail.append({ project: P, by: m.by, kind: "item", item: "x", field: "done", value: true });
  f.trail.append({ project: P, by: f.by, kind: "item", item: "x", field: "done", value: true });
  swap(m.trail, f.trail);
  assert.deepEqual(fold(m.trail.check(P).ok).conflicts, [], "two heads, one value");
  // sequential: Frank edits after hearing Marco
  const m2 = m.trail.append({ project: P, by: m.by, kind: "item", item: "y", field: "title", value: "one" });
  f.trail.merge(m.trail.since(P));
  const f2 = f.trail.append({ project: P, by: f.by, kind: "item", item: "y", field: "title", value: "two" });
  assert.deepEqual(f2.base, [m2.id]);
  m.trail.merge(f.trail.since(P));
  const r = fold(m.trail.check(P).ok);
  assert.equal(r.items.y.fields.title, "two");
  assert.equal(r.items.y.conflicts, undefined);
  assert.deepEqual(headsOf(m.trail.since(P), "items", "y", "title").map((e) => e.id), [f2.id]);
});

test("waiting to send shows on the item until the cloud has it", () => {
  const m = sol("marcocyl04-ux", "macbook");
  const e = m.trail.append({ project: P, by: m.by, kind: "item", item: "z", value: { title: "offline" } });
  const r = fold(m.trail.check(P).ok, { waiting: (id) => m.trail.isWaiting(id) });
  assert.equal(r.items.z.waiting, true);
  m.trail.markSent([e.id]);
  assert.equal(fold(m.trail.check(P).ok, { waiting: (id) => m.trail.isWaiting(id) }).items.z.waiting, undefined);
});

test("events the record does not know fold to nothing and break nothing", () => {
  const m = sol("marcocyl04-ux", "macbook");
  m.trail.append({ project: P, by: m.by, kind: "note", value: { text: "end of turn: shipped slice 0" } });
  m.trail.append({ project: P, by: m.by, kind: "item", item: "a", value: { title: "a" } });
  const r = fold(m.trail.check(P).ok as TrailEvent[]);
  assert.deepEqual(Object.keys(r.items), ["a"]);
  assert.equal(r.count, 2);
  assert.throws(() => m.trail.append({ project: P, by: m.by, kind: "item", item: "a", value: "no field" }), /names its field/);
});
