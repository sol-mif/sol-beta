// Cowork v3, slice 5 (fr-30, #558), E14: join by link. The owner lets a person in with one press; their arrival is per
// role (owner, editor, guest) and they count in the project.
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("../src/team/v3/port5.ts");
const J = await import("../src/team/v3/join.ts");
const marco = { person: "marco" }, noor = { person: "noor" }, ben = { person: "ben" };

function world() {
  const port = P.memoryPort();
  port.append({ project: "ledger", by: marco, kind: "setting", item: "project", value: { rooms: ["automations", "places"], what: "Two founders and a launch" } });
  port.append({ project: "ledger", by: marco, kind: "place", item: "drive", value: { kind: "drive", label: "Google Drive", state: "to connect" } });
  return port;
}

test("a link per project, expiring; the trail keeps its hash, never the token", () => {
  const port = world();
  const l = J.makeLink(port, { project: "ledger", by: marco, now: 1000 });
  assert.ok(!("error" in l));
  assert.match(l.url, /^sol:\/\/join\?project=ledger&t=/);
  assert.deepEqual(J.parseLink(l.url), { project: "ledger", token: l.token });
  assert.equal(l.until, 1000 + J.LINK_TTL);
  assert.ok(!JSON.stringify(port.all).includes(l.token), "the token itself is never on the trail");
  assert.equal(P.roleOf(P.recordOf(port.since("ledger")), "marco"), "owner", "the first to make a link of a project nobody is in owns it");
  assert.ok("error" in J.makeLink(port, { project: "ledger", by: noor }), "only an owner makes a link");
  assert.ok("error" in J.openLink(port, { url: l.url, by: noor, now: l.until + 1 }), "expired");
  assert.ok("error" in J.openLink(port, { url: "sol://join?project=ledger&t=not-the-token-at-all-xx", by: noor }), "a token that is not the project's");
  assert.equal(J.parseLink("https://evil.example/join?project=ledger&t=abc"), null);
});

test("opening is not access; the owner lets them in with one press; they count in the project", () => {
  const port = world();
  const l = J.makeLink(port, { project: "ledger", by: marco, now: 1000 });
  assert.ok(!("error" in l));
  const o = J.openLink(port, { url: l.url, by: noor, name: "Noor Haddad", now: 2000 });
  assert.ok("asked" in o && o.role === "editor");
  assert.equal(P.roleOf(P.recordOf(port.since("ledger")), "noor"), null, "asked, not in");
  assert.deepEqual(J.waitingOf(port.since("ledger")).map((w) => w.who), ["noor"]);
  J.openLink(port, { url: l.url, by: noor, now: 2100 });
  assert.equal(port.all.filter((e) => e.kind === "join.asked").length, 1, "opened twice, one ask");
  assert.ok("error" in J.letIn(port, { project: "ledger", who: "noor", by: noor }), "only an owner lets in");
  assert.ok("error" in J.letIn(port, { project: "ledger", who: "ben", by: marco }), "someone who never opened the link");
  const before = port.all.length;
  const r = J.letIn(port, { project: "ledger", who: "noor", by: marco });
  assert.ok(!("error" in r));
  assert.equal(port.all.length, before + 1, "one press, one event");
  assert.equal(r.event.kind, "member");
  assert.deepEqual(r.member, { who: "noor", role: "editor" });
  assert.equal(r.count, 2, "Noor counts in the project");
  assert.deepEqual(P.inProject(P.recordOf(port.since("ledger"))).map((m) => m.who).sort(), ["marco", "noor"]);
  assert.equal(J.waitingOf(port.since("ledger")).length, 0);
  const again = J.openLink(port, { url: l.url, by: noor, now: 3000 });
  assert.ok("already" in again && again.already === "editor", "in already: the link says so");
});

test("arrival per role: an owner sees the setup, an editor three things, a guest what it is, view only", () => {
  const port = world();
  const l = J.makeLink(port, { project: "ledger", by: marco, now: 1000 });
  const g = J.makeLink(port, { project: "ledger", by: marco, role: "guest", now: 1000 });
  assert.ok(!("error" in l) && !("error" in g));
  J.openLink(port, { url: l.url, by: noor, now: 2000 });
  J.openLink(port, { url: g.url, by: ben, now: 2000 });
  assert.equal(J.arrivals(port, { project: "ledger", who: "noor", name: "Ledger" }).you.role, null, "waiting: no arrival yet");
  J.letIn(port, { project: "ledger", who: "noor", by: marco });
  J.letIn(port, { project: "ledger", who: "ben", by: marco });
  const own = J.arrivals(port, { project: "ledger", who: "marco", name: "Ledger" }).you;
  assert.equal(own.role, "owner");
  assert.ok(own.role === "owner" && own.rooms.includes("Automations") && own.rooms.includes("Talk"));
  const ed = J.arrivals(port, { project: "ledger", who: "noor", name: "Ledger" }).you;
  assert.ok(ed.role === "editor");
  assert.deepEqual(ed.three.map((x) => x.k), ["What it is", "How things get in and out", "What my agent may do"]);
  assert.equal(ed.three[0].v, "Two founders and a launch");
  assert.deepEqual(ed.three[1].marks, ["drive"]);
  const gu = J.arrivals(port, { project: "ledger", who: "ben", name: "Ledger" });
  assert.ok(gu.you.role === "guest" && gu.you.line === "view only, no agent");
  assert.deepEqual(gu.stills.map((s) => s.role), ["owner", "editor", "guest"], "the three as stills");
  assert.equal(gu.members.length, 3, "all three count in the project");
  assert.deepEqual(J.AGENT_MAY.guest, [], "a guest has no agent here");
});
