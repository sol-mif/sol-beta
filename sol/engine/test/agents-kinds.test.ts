// Agents' meta (#1327, pass 2): places and kinds over invented homes. A kind is siblings with the same shape, at any
// depth, a source's items included; Jev weighs the pairs the shape lets through (0.7 in, 0.45–0.7 ask, under out).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { placesOf, verbOf, itemsIn } from "../src/agent/meta/places.ts";
import { jaccard, overlap, kindsOf, kindName, shapeScore, shapeWords, joinsKind } from "../src/agent/meta/kinds.ts";
import { metaBody, metaSaid, makeAsk, noJev, type Ask } from "../src/agent/meta/jev.ts";
import { make, EMPTY, FREELANCER, NURSE, PARENT } from "./agents-fixtures.ts";

const ids = (k: { members: { place: string; ask?: true }[] }) => k.members.map((m) => `${m.place}${m.ask ? "?" : ""}`).sort();

test("places: folders three deep, a folder that owns its insides is not walked, a source's items one level down", () => {
  const { places, unread } = placesOf(make(NURSE));
  assert.deepEqual(unread, []);
  assert.deepEqual(places.map((p) => p.id), ["life", "life/house", "life/learning", "life/pay", "work", "work#ward-a", "work#ward-c", "work#day-unit"]);
  const a = places.find((p) => p.id === "work#ward-a")!;
  assert.deepEqual([a.name, a.parent, a.folder, a.sources, a.verbs], ["Ward A", "work", "work", ["rota"], ["rota"]]);
  // the shape never holds the name
  assert.ok(!JSON.stringify([a.files, a.sources, a.verbs]).toLowerCase().includes("ward a"));
});

test("places: an empty home has none; a broken items.json gives no items, never a crash", () => {
  assert.deepEqual(placesOf(make(EMPTY)).places, []);
  assert.deepEqual(itemsIn("{not json"), []);
  assert.deepEqual(itemsIn(JSON.stringify({ rota: [{ name: "no id" }, { id: "x" }] })), [{ source: "rota", id: "x", name: "x" }]);
});

test("a sticky's verb is its first word that is not a date", () => {
  assert.equal(verbOf("Friday update → Acme"), "update");
  assert.equal(verbOf("Nov 3 market stall"), "market");
  assert.equal(verbOf("Dec 24 · ask for a swap"), "ask");
  assert.equal(verbOf("12 34"), null);
});

test("shape: the overlap (|A∩B| / min) over the parts both places have", () => {
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assert.equal(overlap(["a", "b"], ["b", "c"]), 1 / 2);
  assert.equal(overlap(["a"], ["a", "b", "c"]), 1, "one side holding all of the other's and more");
  assert.equal(overlap([], ["a"]), 0);
  assert.equal(shapeScore({ files: [".md", ".fig"], sources: [], verbs: ["update"] }, { files: [".fig"], sources: [], verbs: ["update"] }), 1);
  assert.equal(shapeScore({ files: [".md", ".fig"], sources: [], verbs: ["update"] }, { files: [".fig", ".png"], sources: [], verbs: ["update"] }), 0.75);
  assert.equal(shapeScore({ files: [], sources: [], verbs: [] }, { files: [".md"], sources: [], verbs: [] }), 0, "nothing in common to tell");
  assert.equal(kindName({ name: "Clients" } as never), "client");
  assert.equal(kindName({ name: "Families" } as never), "family");
  assert.equal(kindName(undefined, "rota"), "rota");
});

test("kinds: a nurse's wards are one kind one level down (the rota's items); her life's folders are not a kind", async () => {
  const k = await kindsOf(placesOf(make(NURSE)).places, noJev);
  assert.equal(k.length, 1);
  assert.deepEqual(ids(k[0]), ["work#day-unit", "work#ward-a", "work#ward-c"]);
  assert.equal(k[0].parent, "work");
});

test("kinds: a parent's two children (a school's items) and two clubs (folders) are two kinds", async () => {
  const k = await kindsOf(placesOf(make(PARENT)).places, noJev);
  assert.deepEqual(k.map(ids), [["clubs/football", "clubs/swim"], ["kids#ana", "kids#ben"]]);
});

test("kinds: Jev decides the pairs the shape lets through: in, ask, out", async () => {
  const places = placesOf(make(FREELANCER)).places;
  assert.deepEqual((await kindsOf(places, noJev)).map(ids), [["clients/acme", "clients/bloom", "clients/northwind"]], "Jev null: the shape alone");
  const asked: [string, string][] = [];
  // Jev: the two with hours are the same kind; the one with a logo only is half
  const half: Ask = async (q, a, b) => { asked.push([a, b]); assert.equal(q, "kind"); return a.includes(".md") && b.includes(".md") ? 0.9 : 0.5; };
  const k = await kindsOf(places, half);
  assert.deepEqual(k.map(ids), [["clients/acme", "clients/bloom?", "clients/northwind"]]);
  assert.ok(asked.every(([a, b]) => !/acme|bloom|northwind/i.test(a + b)), "Jev sees shapes, never names");
  const out: Ask = async (_q, a, b) => (a.includes(".md") && b.includes(".md") ? 0.9 : 0.2);
  assert.deepEqual((await kindsOf(places, out)).map(ids), [["clients/acme", "clients/northwind"]]);
});

test("kinds: a new sibling with the shape joins by code; one of another shape does not", () => {
  const home = make(FREELANCER);
  mkdirSync(join(home, "clients", "kite"), { recursive: true });
  writeFileSync(join(home, "clients", "kite", "hours.md"), "");
  writeFileSync(join(home, "clients", "kite", "stickies.md"), "- [ ] Update the brand board\n");
  mkdirSync(join(home, "clients", "taxes"), { recursive: true });
  writeFileSync(join(home, "clients", "taxes", "q4.xlsx"), "");
  const places = placesOf(home).places, by = (id: string) => places.find((p) => p.id === id)!;
  const members = [by("clients/acme"), by("clients/northwind")];
  assert.equal(joinsKind(members, by("clients/kite")), true);
  assert.equal(joinsKind(members, by("clients/taxes")), false);
});

test("Jev's kind, job and fix questions: a pure body, a pure reader, null without a key", async () => {
  const b = metaBody("job", "read: rota", "read: school");
  assert.equal(b.questions.same.type, "noul");
  assert.deepEqual(b.state, { first: "read: rota", second: "read: school" });
  assert.equal(metaSaid({ answers: { same: { noul: 0.82 } } }), 0.82);
  assert.equal(metaSaid({ answers: { same: { noul: 7 } } }), 1);
  assert.equal(metaSaid({ answers: {} }), null);
  assert.equal(await makeAsk({ key: null })("kind", "a", "b"), null);
  let sent: any = null;
  const fake = (async (_u: string, o: any) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { same: { noul: 0.6 } } }) }; }) as unknown as typeof fetch;
  assert.equal(await makeAsk({ key: "k", fetch: fake })("fix", "a → b", "c → d"), 0.6);
  assert.match(sent.questions.same.instructions, /same fix/);
  const broken = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  assert.equal(await makeAsk({ key: "k", fetch: broken })("job", "a", "b"), null);
});
