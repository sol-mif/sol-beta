// Agents' desk (#1327, pass 2, the flow) over invented homes: its work read from what each place's runs made (a file
// that cannot be read is named), the other places of its kind as tiles to press in, and how far it goes, with undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { list, undo } from "../src/agent/agents.ts";
import { answerOffer, offers } from "../src/agent/meta/offer.ts";
import { scope } from "../src/agent/meta/learn.ts";
import { desk, linesOf, trust } from "../src/agent/meta/desk.ts";
import { appendLedger, readPolicy } from "../src/agent/store.ts";
import { noJev } from "../src/agent/meta/jev.ts";
import { FREELANCER, NOW, make } from "./agents-fixtures.ts";

const H = 3_600_000;
const UPDATE = { name: "Friday update", job: "drafts <place> a short update from the week's hours", steps: ["the week's hours", "a short update", "drafted to the client"], parameter: "client", kind: "client" };
const ACME = "clients/acme", NORTH = "clients/northwind";

async function kept(places: string[]) {
  const home = make(FREELANCER);
  const a = new Agents({ home, now: () => NOW, ask: noJev, say: async () => JSON.stringify(UPDATE), turn: async () => ({ report: "ready", said: "ok", thread: null, ms: 0 }) });
  const [of] = (await offers(a)).offers;
  const r = answerOffer(a, of.id, "keep", places) as any;
  assert.equal(r.ok, true);
  return { home, a, ag: r.agent as { id: string; places: { place: string; folder: string; rule: string }[] } };
}

test("a made thing reads as its lines, headings' marks off, blank lines out", () => {
  assert.deepEqual(linesOf("# Hi\n\nline one  \n\n  \nline two"), ["Hi", "line one", "line two"]);
});

test("desk: its work is each place's last runs, newest first, as lines; a file it cannot read is named; nothing yet is empty", async () => {
  const { home, a, ag } = await kept([ACME, NORTH]);
  assert.deepEqual((desk(a, ag.id) as any).work, [], "nothing made yet");
  const [acme, north] = ag.places;
  mkdirSync(join(home, ACME, "drafts"), { recursive: true });
  writeFileSync(join(home, ACME, "drafts", "update.md"), "Hi,\nThis week: 6 h.\nRegards");
  appendLedger(join(home, ACME), { at: NOW + H, rule: acme.rule, read: "hours.md", made: "drafts/update.md", held: "nothing" });
  appendLedger(join(home, NORTH), { at: NOW + 2 * H, rule: north.rule, read: "hours.md", made: "drafts/gone.md", held: "nothing" });
  const w = (desk(a, ag.id) as any).work;
  assert.deepEqual(w.map((x: any) => x.place), [NORTH, ACME], "newest first");
  assert.deepEqual(w[1].lines, ["Hi,", "This week: 6 h.", "Regards"]);
  assert.equal(w[1].file, "drafts/update.md", "the file it read, so the face can write the person's fix into it");
  assert.equal(w[0].unread, "drafts/gone.md could not be read");
  assert.equal(desk(a, "nobody").ok, false);
});

test("desk: the other places of its kind are tiles to press in; one taken out comes back as such", async () => {
  const { a, ag } = await kept([ACME]);
  const more = (desk(a, ag.id) as any).more.map((m: any) => m.place);
  assert.ok(more.includes(NORTH), "a sibling client is offered");
  assert.ok(!more.includes(ACME), "never a place it is in");
  scope(a, { id: ag.id, remove: ACME });
  scope(a, { id: ag.id, add: NORTH });
  const back = (desk(a, ag.id) as any).more.find((m: any) => m.place === ACME);
  assert.equal(back.why, "taken out by you");
});

test("trust: how far is written into every place's rule, with undo; does is refused for work others see", async () => {
  const { home, a, ag } = await kept([ACME, NORTH]);
  const before = readFileSync(join(home, ACME, "policy.md"), "utf8");
  assert.equal(list(a).agents[0].reach, "drafts");
  assert.match(String((trust(a, ag.id, "does") as any).why), /drafts at most/);
  const r = trust(a, ag.id, "looks") as any;
  assert.equal(r.ok, true);
  assert.match(r.change.line, /how far, drafts → looks/);
  for (const p of ag.places) assert.equal(readPolicy(join(home, p.folder)).rules.find((x) => x.id === p.rule)!.mode, "watch");
  assert.deepEqual(list(a).agents[0].places.map((p: any) => p.trust), ["looks", "looks"]);
  undo(a, r.change.id);
  assert.equal(readFileSync(join(home, ACME, "policy.md"), "utf8"), before);
  assert.equal(trust(a, ag.id, "everything").ok, false);
});

test("the answer to \"Always like this?\" lands on that fix: just once closes the ask; always learns it, one fix", async () => {
  const { fix } = await import("../src/agent/meta/learn.ts");
  const { a, ag } = await kept([ACME, NORTH]);
  await fix(a, { id: ag.id, place: ACME, before: "Regards", after: "Best" });
  assert.equal(list(a).agents[0].asks.length, 1);
  await fix(a, { id: ag.id, place: ACME, before: "Regards", after: "Best", always: false });
  assert.equal(list(a).agents[0].asks.length, 0, "just once: the ask is answered");
  await fix(a, { id: ag.id, place: NORTH, before: "Cheers", after: "Thanks" });
  const r = (await fix(a, { id: ag.id, place: NORTH, before: "Cheers", after: "Thanks", always: true })) as any;
  assert.equal(r.learned.place, NORTH);
  assert.deepEqual(r.learned.fixes.length, 1, "the asked fix, not a copy of it");
  assert.equal(list(a).agents[0].asks.length, 0);
});
