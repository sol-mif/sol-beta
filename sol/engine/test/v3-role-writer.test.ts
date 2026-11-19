// Cowork v3 (#1049): a role event counts only when an owner wrote it. Both folds of the role table (people.ts foldPeople,
// port5.ts recordOf) read the trail in one order every Sol agrees on (time, writer, its place in the writer's chain, id),
// and set aside a member event whose writer could not make it at that point: the first owner names themself while nobody
// is in; after that only an owner changes anyone's role or lets anyone in or out, a member may only take themself out,
// an agent never writes a role, and a project keeps one owner at least. The same events in any order fold the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldPeople, roleOf as roleInPeople, type Event } from "../src/team/v3/people.ts";
import { recordOf, roleOf, inProject, type Ev } from "../src/team/v3/port5.ts";

let seq = 0;
const ev = (who: string, kind: string, data: Record<string, unknown>, at = ++seq): Event =>
  ({ project: "p", actor: { who }, kind, data, id: `e${String(++seq).padStart(4, "0")}`, seq, at: new Date(Date.UTC(2026, 10, 11, 10, 0, 0, at)).toISOString(), hash: "", prev: "" });
let n = 0;
const m = (person: string, item: string, value: Record<string, unknown>, at = ++n, by: Partial<Ev["by"]> = {}): Ev =>
  ({ id: `m${String(++n).padStart(4, "0")}`, seq: n, at, project: "p", by: { person, ...by }, kind: "member", item, value });
const shuffle = <T>(xs: T[], seed: number): T[] => { const a = [...xs]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2 ** 31; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

test("#1049 repro, people.ts: a guest's own role event and an editor's out of the owner are set aside", () => {
  const trail = [ev("marco", "member.in", { who: "marco", role: "owner" }), ev("marco", "member.in", { who: "frank", role: "editor" }), ev("marco", "member.in", { who: "visitor", role: "guest" })];
  trail.push(ev("visitor", "member.role", { who: "visitor", role: "owner" }), ev("frank", "member.out", { who: "marco" }));
  const p = foldPeople(trail);
  assert.equal(roleInPeople(p, "marco"), "owner");
  assert.equal(roleInPeople(p, "frank"), "editor");
  assert.equal(roleInPeople(p, "visitor"), "guest");
});

test("#1049 repro, port5.ts: a guest's own member event and their out of the owner are set aside", () => {
  const evs = [m("marco", "marco", { role: "owner", in: true, first: true }), m("marco", "visitor", { role: "guest", in: true, letInBy: "marco" })];
  evs.push(m("visitor", "visitor", { role: "owner", in: true }), m("visitor", "marco", { in: false }));
  const rec = recordOf(evs);
  assert.equal(roleOf(rec, "marco"), "owner");
  assert.equal(roleOf(rec, "visitor"), "guest");
});

test("the first owner: only someone naming themself owner while nobody is in", () => {
  // someone letting another in before anyone is in counts nothing; the first self-named owner does
  const p = foldPeople([ev("frank", "member.in", { who: "isaac", role: "owner" }), ev("frank", "member.in", { who: "frank", role: "editor" }), ev("marco", "member.in", { who: "marco", role: "owner" })]);
  assert.deepEqual([...p.members.values()].map((x) => [x.who, x.role]), [["marco", "owner"]]);
  // a second self-named owner once someone is in is a stranger's claim
  const q = foldPeople([ev("marco", "member.in", { who: "marco", role: "owner" }), ev("visitor", "member.in", { who: "visitor", role: "owner" })]);
  assert.equal(roleInPeople(q, "visitor"), null);
  const rec = recordOf([m("marco", "marco", { role: "owner", in: true, first: true }), m("visitor", "visitor", { role: "owner", in: true, first: true })]);
  assert.deepEqual(inProject(rec), [{ who: "marco", role: "owner" }]);
});

test("an owner sets anyone's role and lets anyone out; a member only takes themself out", () => {
  const evs = [m("marco", "marco", { role: "owner", in: true }), m("marco", "frank", { role: "editor", in: true }), m("marco", "isaac", { role: "editor", in: true }),
    m("marco", "frank", { role: "owner" }), m("frank", "isaac", { role: "guest" }), m("isaac", "isaac", { in: false }), m("isaac", "isaac", { role: "owner", in: true })];
  const rec = recordOf(evs);
  assert.equal(roleOf(rec, "frank"), "owner");
  assert.equal(roleOf(rec, "isaac"), null);   // out by their own press; their way back in is an owner's
});

test("an owner steps down only while another owner stays; the last owner is never taken out", () => {
  const p = foldPeople([ev("marco", "member.in", { who: "marco", role: "owner" }), ev("marco", "member.in", { who: "frank", role: "editor" }),
    ev("marco", "member.role", { who: "marco", role: "editor" }), ev("marco", "member.out", { who: "marco" })]);
  assert.equal(roleInPeople(p, "marco"), "owner");
  const q = foldPeople([ev("marco", "member.in", { who: "marco", role: "owner" }), ev("marco", "member.in", { who: "frank", role: "owner" }), ev("marco", "member.role", { who: "marco", role: "editor" })]);
  assert.equal(roleInPeople(q, "marco"), "editor");
  // two owners who put each other out at once: the first in the trail's order counts, the second's writer is out by then
  const evs = [m("marco", "marco", { role: "owner", in: true }), m("marco", "frank", { role: "owner", in: true }), m("marco", "frank", { in: false }, 50), m("frank", "marco", { in: false }, 50)];
  const want = inProject(recordOf(evs));
  assert.equal(want.length, 1);
  for (let s = 1; s < 30; s++) assert.deepEqual(inProject(recordOf(shuffle(evs, s))), want);
});

test("an agent never writes a role, not even its own person's", () => {
  const rec = recordOf([m("marco", "marco", { role: "owner", in: true }), m("marco", "frank", { role: "owner", in: true }, undefined, { agent: "sol" })]);
  assert.equal(roleOf(rec, "frank"), null);
  const p = foldPeople([ev("marco", "member.in", { who: "marco", role: "owner" }), { ...ev("marco", "member.in", { who: "frank", role: "owner" }), actor: { who: "marco", agent: true } }]);
  assert.equal(roleInPeople(p, "frank"), null);
});

test("a demoted owner's later role events count nothing; an undo of a member event revives nothing", () => {
  const evs = [m("marco", "marco", { role: "owner", in: true }), m("marco", "frank", { role: "owner", in: true }), m("frank", "marco", { role: "guest" }), m("marco", "marco", { role: "owner" })];
  assert.equal(roleOf(recordOf(evs), "marco"), "guest");
  // frank's promotion taken back by its own writer after frank put marco down would rewrite the past: not followed
  const promo = evs[1];
  const undo: Ev = { id: "u1", seq: 99, at: 99, project: "p", by: { person: "marco" }, kind: "undo", value: { of: promo.id } };
  assert.equal(roleOf(recordOf([...evs, undo]), "frank"), "owner");
  assert.equal(roleOf(recordOf([...evs, undo]), "marco"), "guest");
});

test("one order on every Sol: the same events in any arrival order fold to one table", () => {
  const evs = [m("marco", "marco", { role: "owner", in: true }), m("marco", "frank", { role: "editor", in: true }), m("marco", "visitor", { role: "guest", in: true }),
    m("visitor", "visitor", { role: "owner" }), m("frank", "marco", { in: false }), m("marco", "frank", { role: "owner" }), m("frank", "marco", { role: "editor" }, 60), m("marco", "frank", { in: false }, 60)];
  // a store's seq is its own: an arrival order is a different seq on each Sol
  const want = inProject(recordOf(evs));
  for (let s = 1; s < 40; s++) assert.deepEqual(inProject(recordOf(shuffle(evs, s).map((e, i) => ({ ...e, seq: i + 1 })))), want);
  const pe = [ev("marco", "member.in", { who: "marco", role: "owner" }), ev("marco", "member.in", { who: "frank", role: "owner" }),
    ev("frank", "member.out", { who: "marco" }, 70), ev("marco", "member.out", { who: "frank" }, 70)];
  const roles = (es: Event[]) => [...foldPeople(es).members.values()].map((x) => `${x.who}:${x.role}`).sort();
  const w2 = roles(pe);
  assert.equal(w2.length, 1);
  for (let s = 1; s < 30; s++) assert.deepEqual(roles(shuffle(pe, s).map((e, i) => ({ ...e, seq: i + 1 }))), w2);
});

test("one writer's events in one millisecond keep their chain's order", () => {
  // the first owner and the people they let in, written in the same millisecond on one key: the chain says which came first
  const k = "k".repeat(64);
  const ids = ["ff", "0a", "77"];
  const evs: Ev[] = [{ who: "marco", role: "owner" }, { who: "frank", role: "editor" }, { who: "visitor", role: "guest" }].map((x, i) =>
    ({ id: ids[i], seq: 3 - i, at: 5, project: "p", by: { person: "marco", machine: "mac" }, kind: "member", item: x.who, value: { role: x.role, in: true }, key: k, prev: i ? ids[i - 1] : "" }));
  assert.deepEqual(inProject(recordOf(evs)).map((x) => x.who).sort(), ["frank", "marco", "visitor"]);
});

// the clean-context review's cases: the two folds read one shape of a member event, whatever writes it
import { doorPort } from "../src/team/v3/people.ts";
import type { TrailEvent } from "../src/team/v3/trail.ts";
const both = (evs: Ev[]) => {
  const port = doorPort({ append: () => { throw new Error("read only"); }, since: () => evs.map((e) => ({ ...e, key: e.key ?? e.by.person, prev: e.prev ?? "" }) as unknown as TrailEvent), check: () => ({ ok: [], bad: [] }) });
  const people = Object.fromEntries([...foldPeople(port.since("p")).members.values()].map((x) => [x.who, x.role]));
  const record = Object.fromEntries(inProject(recordOf(evs)).map((x) => [x.who, x.role]));
  return { people, record };
};

test("an imported project: both folds see its members, so nobody else founds it", () => {
  const evs = [m("o", "o", { login: "o", role: "owner", in: true, imported: {} }), m("o", "e", { login: "e", role: "editor", in: true, imported: {} }), m("e", "e", { role: "owner", in: true, first: true })];
  const { people, record } = both(evs);
  assert.deepEqual(people, { o: "owner", e: "editor" });
  assert.deepEqual(record, people);
});

test("a member event that does not say in as a boolean counts nothing, in both folds", () => {
  const evs = [m("o", "o", { role: "owner", in: true }), m("o", "g", { role: "guest", in: true }), m("g", "g", { in: "no" }), m("o", "x", { role: "editor" })];
  const { people, record } = both(evs);
  assert.deepEqual(people, { o: "owner", g: "guest" });
  assert.deepEqual(record, people);
});

test("someone leaving writes only that they left; a time with a fraction folds the same in both", () => {
  const evs = [m("o", "o", { role: "owner", in: true }), m("o", "g", { role: "guest", in: true }), m("g", "g", { in: false, role: "owner" }), m("o", "g", { role: "guest", in: true })];
  assert.equal(roleOf(recordOf(evs), "g"), "guest");
  const fx = [m("a", "a", { role: "owner", in: true }, 1), m("a", "b", { role: "owner", in: true }, 2), m("a", "b", { in: false }, 50.7), m("b", "a", { in: false }, 50.2)];
  const r = both(fx);
  assert.equal(Object.keys(r.record).length, 1);
  assert.deepEqual(r.record, r.people);
});

test("many member events that count nothing keep the fold quick", () => {
  const evs: Ev[] = [m("o", "o", { role: "owner", in: true })];
  for (let i = 0; i < 5000; i++) evs.push({ id: `it${i}`, seq: 0, at: 3, project: "p", by: { person: "o" }, kind: "item", item: `i${i}`, value: { title: "x" } });
  for (let i = 0; i < 10000; i++) evs.push(m(`g${i}`, `g${i}`, { role: "owner", in: true }));
  // the best of three runs, the bound unchanged: one run on a busy check runner can be slow for reasons not its own (#1144)
  let best = Infinity;
  for (let k = 0; k < 3 && best >= 400; k++) {
    const t0 = performance.now();
    assert.deepEqual(inProject(recordOf(evs)), [{ who: "o", role: "owner" }]);
    best = Math.min(best, performance.now() - t0);
  }
  assert.ok(best < 400, `took ${Math.round(best)} ms at best of three`);
});
