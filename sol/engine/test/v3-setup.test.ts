// Cowork v3, slice 5 (fr-30, #558), E13: setup by conversation. Four starts; modules proposed as Yes / Not this cards;
// Yes writes the project's shape (rooms, places, routing, automations, settings) as events; "start like X" copies rooms,
// places, routing, automations and settings and no items.
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("../src/team/v3/port5.ts");
const S = await import("../src/team/v3/setup.ts");
const marco = { person: "marco" }, frank = { person: "frank" };

test("the conversation opens with one question and four starts, then asks where the files live, then shows cards", () => {
  const t0 = S.converse([]);
  assert.equal(t0.step, 0);
  assert.match(t0.say, /Tell me about your project/);
  assert.deepEqual(t0.presses.map((p) => p.label), ["A family", "Two founders", "A class", "A bakery"]);
  const t1 = S.converse([t0.presses[1].words!]);
  assert.equal(t1.step, 1);
  assert.match(t1.say, /files and dates/);
  assert.equal(t1.presses[0].words, "Drive, a shared inbox and Discord", "the answer that fits two founders");
  const t2 = S.converse([t0.presses[1].words!, t1.presses[0].words!]);
  assert.equal(t2.step, 2);
  const ids = t2.cards!.map((c) => c.id);
  assert.deepEqual(ids, ["r:automations", "r:places", "r:artifacts", "p:drive", "p:email", "p:chat", "a:Investor update · the 1st"]);
  assert.deepEqual(t2.presses.map((p) => p.label), ["Yes to all", "Change"]);
  // each of the four starts proposes its own shape
  const shapes = S.STARTS.map((s) => S.converse([s.words, "x"]).cards!.map((c) => c.id).join(","));
  assert.equal(new Set(shapes).size, 4);
  // words after the cards change them: "without email" takes the card off
  const t3 = S.converse([t0.presses[1].words!, t1.presses[0].words!, "without email please"]);
  assert.equal(t3.cards!.find((c) => c.id === "p:email")!.state, "not");
  assert.match(t3.say, /Changed/);
});

test("nothing is written until Yes; Yes writes the project's shape as events, Not this writes nothing", () => {
  const port = P.memoryPort();
  const t2 = S.converse(["Two founders and a launch", "Drive, a shared inbox and Discord"]);
  assert.equal(port.all.length, 0, "the conversation writes nothing");
  const r = S.yes(port, { project: "ledger", by: marco, card: "r:automations" });
  assert.ok(!("error" in r));
  assert.equal(port.all[0].kind, "member", "the first person setting up a project nobody is in becomes its owner");
  const rest = t2.cards!.filter((c) => c.id !== "p:chat").map((c) => c.id);   // Not this on Discord
  const all = S.yesAll(port, { project: "ledger", by: marco, cards: rest });
  assert.ok(!("error" in all));
  const rec = P.recordOf(port.since("ledger"));
  const shape = S.shapeOf(rec);
  assert.deepEqual(shape.rooms, ["automations", "places", "artifacts"], "rooms: the project's setting");
  assert.deepEqual(shape.places.map((p) => p.kind).sort(), ["drive", "email"], "places, to connect; Discord said Not this");
  assert.equal(rec.places.drive.fields.state, "to connect");
  assert.deepEqual(rec.routing, { documents: "drive", mail: "email" }, "routing for the kinds that go there");
  assert.deepEqual(shape.automations.map((a) => a.name), ["Investor update"]);
  assert.equal(rec.automations["au-investor-update"].fields.owner, "marco", "the one who said yes owns it");
  const kinds = new Set(port.all.map((e) => e.kind));
  assert.deepEqual([...kinds].sort(), ["automation", "member", "place", "route", "setting"]);
  // Yes again on what is in writes nothing
  const n = port.all.length;
  S.yesAll(port, { project: "ledger", by: marco, cards: rest });
  assert.equal(port.all.length, n);
  // the cards show what is in
  const again = S.converse(["Two founders and a launch", "Drive"], { now: shape });
  assert.equal(again.cards!.find((c) => c.id === "r:places")!.state, "in");
  // only an owner sets up
  assert.ok("error" in S.yes(port, { project: "ledger", by: frank, card: "r:dev" }));
});

test("start like X copies rooms, places, routing, automations and settings, and no items", () => {
  const port = P.memoryPort();
  // Sol, a project with a shape and things in it
  port.append({ project: "sol", by: marco, kind: "member", item: "marco", value: { role: "owner", in: true } });
  port.append({ project: "sol", by: marco, kind: "member", item: "frank", value: { role: "owner", in: true } });
  port.append({ project: "sol", by: marco, kind: "setting", item: "project", value: { rooms: ["automations", "places", "dev"], what: "One window for all your AI", agentsTalk: true } });
  port.append({ project: "sol", by: marco, kind: "setting", item: "team", value: { read: "always", pings: "reds only" } });
  port.append({ project: "sol", by: frank, kind: "place", item: "github", value: { kind: "github", label: "sol-mif/sol-dev", state: "connected" } });
  port.append({ project: "sol", by: marco, kind: "route", item: "code", field: "place", value: "github" });
  port.append({ project: "sol", by: marco, kind: "automation", item: "au-the-dev-night", value: { name: "The dev night", when: "21:00", words: "every night at 21:00 read the drafts", owner: "frank", on: true } });
  port.append({ project: "sol", by: frank, kind: "item", item: "i-550", value: { title: "#550 Notch quiet card", state: "review" } });
  port.append({ project: "sol", by: frank, kind: "loose", item: "l-1", value: { title: "a note" } });
  port.append({ project: "sol", by: frank, kind: "talk", item: "t-1", value: { thread: "general", text: "hi" } });
  const r = S.startLike(port, { project: "site", by: marco, like: "sol" });
  assert.ok(!("error" in r), JSON.stringify(r));
  const site = port.since("site");
  assert.ok(!site.some((e) => e.kind === "item" || e.kind === "loose" || e.kind === "talk" || e.kind === "artifact"), "no items, loose things or Talk");
  assert.deepEqual(site.filter((e) => e.kind === "member").map((e) => e.item), ["marco"], "no members but the one starting it");
  const rec = P.recordOf(site), shape = S.shapeOf(rec);
  assert.deepEqual(shape.rooms, ["automations", "places", "dev"]);
  assert.deepEqual(shape.places, [{ kind: "github", label: "sol-mif/sol-dev" }]);
  assert.equal(rec.places.github.fields.state, "to connect", "a place comes as a link to connect again: a grant is never copied");
  assert.deepEqual(rec.routing, { code: "github" });
  assert.equal(rec.automations["au-the-dev-night"].fields.owner, "marco");
  assert.equal(rec.automations["au-the-dev-night"].fields.on, false, "copied off, owned by the one who copied");
  assert.deepEqual(rec.settings.team, { read: "always", pings: "reds only" });
  assert.equal(rec.settings.project.agentsTalk, true);
  assert.equal(rec.settings.project.what, undefined, "what it is stays the other project's");
  // its turn in the conversation names it, and adds its rooms to the cards
  const t = S.converse(["A bakery and the studio", "Figma"], { like: { name: "Sol", shape: S.shapeOf(P.recordOf(port.since("sol"))) } });
  assert.ok(t.cards!.some((c) => c.id === "r:dev"));
  assert.match(S.converse([], { like: { name: "Sol", shape } }).say, /^Shaped like Sol/);
  // not in the other project: not yours to copy
  assert.ok("error" in S.startLike(port, { project: "x", by: { person: "isaac" }, like: "sol" }));
});
