// Cowork v3, slice 4 (fr-30, #557): places and routing. E11 (a kind's chip moved changes the routing in the record;
// the connect card's reach before and after; revoke is one press), F6 (a sign-in expired: red, Sign in again, the
// routing kept, nothing lost), and the switch off (F7 for this slice: no answer, the module not loaded).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryTrail, fileTrail, foldPlaces } from "../src/team/v3/places-trail.ts";
import * as P from "../src/team/v3/places.ts";

// the wire's tests run on a team and state of their own, offline, the switch off first
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3p-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3p-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3p-home-");
process.env.SOL_COWORK_V3_PLACES = join(tmp("sol-v3p-trail-"), "places.jsonl");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

const room = { id: "sol", provider: "github" as const, repos: ["sol-mif/sol-dev"], folder: "/work/sol", mine: true };
function setup(o: { google?: P.SignInState; github?: P.SignInState; others?: string[]; full?: P.Fullness | null; role?: P.Ctx["role"] } = {}) {
  let clock = 1_000_000;
  const t = memoryTrail({ now: () => clock });
  const sign = { github: o.github ?? "in", google: o.google ?? "in" } as Record<"github" | "google", P.SignInState>;
  const c: P.Ctx = {
    project: "sol", name: "Sol", me: "marco", ...(o.role ? { role: o.role } : {}), others: o.others ?? [],
    seed: P.placesFromRoom(room, { me: "marco", hasRecord: true, machine: "macbook" }),
    signIn: (k) => sign[k],
    count: (p) => (p.kind === "github" ? { n: 312, unit: "issues and PRs" } : p.kind === "drive" ? { n: 14, unit: "files" } : null),
    fullness: () => (o.full === undefined ? { used: 16.4, of: 20, unit: "MB" } : o.full),
    now: () => clock,
  };
  return { t, c, sign, tick: (ms: number) => { clock += ms; } };
}
const kindsAt = (v: P.View, id: string) => v.places.find((p) => p.id === id)?.kinds.map((k) => k.kind) ?? [];

test("places come from today's record: the record, the repository, the calendar in the record, the folder on this machine", () => {
  const { t, c } = setup();
  const v = P.viewOf(t.since("sol"), c);
  assert.deepEqual(v.places.map((p) => p.id), ["record", "github", "calendar", "folder"]);
  assert.equal(v.places.find((p) => p.id === "github")!.label, "sol-mif/sol-dev");
  assert.equal(v.places.find((p) => p.id === "folder")!.label, "sol on macbook");
  // each kind goes to its natural place; documents to the record until Drive is connected
  assert.deepEqual(v.routing, { code: "github", documents: "record", dates: "calendar", items: "record" });
  assert.deepEqual(kindsAt(v, "github"), ["code"]);
  assert.equal(v.places.find((p) => p.id === "github")!.kinds[0].n, 312);
  assert.equal(v.places.find((p) => p.id === "github")!.line, "312 issues and PRs");
  assert.deepEqual(v.open, ["drive"]);
  assert.equal(t.since("sol").length, 0, "reading writes nothing");
});

test("E11: the connect card shows the reach before the grant and the same reach after; the grant is one event", () => {
  const { t, c } = setup();
  const b = P.before(c, "drive", "Sol / Design");
  assert.equal(b.signIn, "google");
  assert.equal(b.signedIn, true);
  assert.deepEqual(b.reach.reads, ["titles and changes in this folder"]);
  assert.deepEqual(b.reach.never, ["the rest of your Drive", "files shared with you"]);
  const r = P.connect(t, c, "drive", "Sol / Design");
  assert.ok("event" in r, JSON.stringify(r));
  assert.equal(t.since("sol").length, 1);
  assert.equal(r.event.kind, "place");
  assert.deepEqual(r.reach, b.reach, "after the grant, the reach is the one shown before");
  assert.match(r.line, /^Connected Google Drive: Sol reads titles and changes in this folder, writes new documents/);
  const v = P.viewOf(t.since("sol"), c);
  assert.equal(v.routing.documents, "drive", "documents go to Drive once it is there");
  assert.equal(v.places.find((p) => p.id === "drive")!.kinds[0].n, 14);
  // no token in the trail, ever
  assert.doesNotMatch(JSON.stringify(t.since("sol")), /token|refresh|secret/i);
});

test("E11: connecting needs the sign-in first, and says which", () => {
  const { t, c } = setup({ google: "out" });
  assert.deepEqual(P.connect(t, c, "drive", "Sol / Design"), { signIn: "google" });
  assert.equal(t.since("sol").length, 0);
});

test("E11: a kind's chip dragged to another place changes the routing in the record, one event, with Undo", () => {
  const { t, c } = setup();
  P.connect(t, c, "drive", "Sol / Design");
  const n = t.since("sol").length;
  const r = P.reroute(t, c, "documents", "record");
  assert.ok("event" in r, JSON.stringify(r));
  assert.equal(t.since("sol").length, n + 1, "one event");
  assert.equal(r.event.kind, "route");
  assert.equal(r.event.item, "documents");
  assert.equal(r.event.field, "place");
  assert.equal(r.event.value, "record");
  assert.equal(foldPlaces(t.since("sol")).routing.documents, "record", "the record's routing says it");
  const v = P.viewOf(t.since("sol"), c);
  assert.deepEqual(kindsAt(v, "record").sort(), ["documents", "items"]);
  assert.match(r.line, /New documents go to Sol's record now\. What is already in Google Drive stays there\./);
  const u = P.undo(t, c, r.token);
  assert.ok("event" in u);
  assert.equal(P.viewOf(t.since("sol"), c).routing.documents, "drive");
  assert.deepEqual(P.undo(t, c, r.token), { error: "nothing to take back" });
});

test("E11: Undo after 8 s is refused", () => {
  const { t, c, tick } = setup();
  const r = P.reroute(t, c, "code", "record");
  assert.ok("token" in r);
  tick(8001);
  assert.ok("error" in P.undo(t, c, r.token));
  assert.equal(P.viewOf(t.since("sol"), c).routing.code, "record");
});

test("E11: with others in the project, the move waits for them to agree and writes nothing until then", () => {
  const { t, c } = setup({ others: ["frank", "isaac"] });
  const r = P.reroute(t, c, "code", "record");
  assert.ok("ask" in r);
  assert.deepEqual(r.ask, ["frank", "isaac"]);
  assert.equal(t.since("sol").length, 0);
  const ok = P.reroute(t, c, "code", "record", { agreed: true });
  assert.ok("event" in ok);
  assert.equal(P.viewOf(t.since("sol"), c).routing.code, "record");
});

test("E11: revoke is one press, one event; the files stay, the routing is kept, new ones go to the record", () => {
  const { t, c } = setup();
  P.connect(t, c, "drive", "Sol / Design");
  const n = t.since("sol").length;
  const r = P.revoke(t, c, "drive");
  assert.ok("event" in r);
  assert.equal(t.since("sol").length, n + 1);
  assert.match(r.line, /The files stay where they are/);
  const v = P.viewOf(t.since("sol"), c);
  const d = v.places.find((p) => p.id === "drive")!;
  assert.equal(d.state, "revoked");
  assert.equal(v.routing.documents, "drive", "the routing is kept");
  assert.equal(v.next.documents, "record", "new documents go to the record while it is revoked");
  assert.deepEqual(P.revoke(t, c, "record"), { error: "Sol's record is the project; it cannot be revoked" });
  assert.ok("error" in P.reroute(t, c, "items", "drive"), "nothing is routed to a revoked place");
  assert.ok("event" in P.undo(t, c, r.token));
  assert.equal(P.viewOf(t.since("sol"), c).places.find((p) => p.id === "drive")!.state, "ok");
});

test("F6: a place's sign-in expired: it turns red with Sign in again, its routing is kept, nothing is lost", () => {
  const { t, c, sign } = setup();
  P.connect(t, c, "drive", "Sol / Design");
  P.reroute(t, c, "dates", "drive");
  const before = P.viewOf(t.since("sol"), c);
  sign.google = "expired";
  const v = P.viewOf(t.since("sol"), c);
  const d = v.places.find((p) => p.id === "drive")!;
  assert.equal(d.state, "red");
  assert.equal(d.signIn, "google", "the face's press is Sign in again, through Google's own sign-in");
  assert.match(d.line, /sign-in expired.*nothing is lost/);
  assert.deepEqual(v.routing, before.routing, "the routing to it is kept");
  assert.deepEqual(kindsAt(v, "drive").sort(), ["dates", "documents"]);
  assert.equal(d.count?.n, 14, "what it held is still counted");
  assert.equal(v.next.documents, "drive", "new documents still go there, and wait for the sign-in");
  // signing in again connects it again: one event, the same label, the same routing
  sign.google = "in";
  const again = P.connect(t, c, "drive");
  assert.ok("event" in again);
  const after = P.viewOf(t.since("sol"), c);
  assert.equal(after.places.find((p) => p.id === "drive")!.state, "ok");
  assert.equal(after.places.find((p) => p.id === "drive")!.label, "Sol / Design");
  assert.deepEqual(after.routing, before.routing);
});

test("F6: expired on someone else's sign-in is theirs: the place stays as it is here", () => {
  const { t, c, sign } = setup();
  t.append({ project: "sol", by: { person: "isaac" }, kind: "place", item: "drive", value: { kind: "drive", label: "Sol / Design", by: "isaac", state: "on" } });
  sign.google = "expired";
  const d = P.viewOf(t.since("sol"), c).places.find((p) => p.id === "drive")!;
  assert.equal(d.state, "ok");
  assert.equal(d.line, "14 files");
});

test("the record's fullness, and where files go when it is full", () => {
  const { t, c } = setup({ full: { used: 20, of: 20, unit: "MB" } });
  const v = P.viewOf(t.since("sol"), c);
  assert.equal(v.record!.high, true);
  assert.equal(v.record!.full, true);
  assert.equal(v.record!.overflow, "github");
  assert.equal(v.record!.line, "when full, files go to GitHub");
  assert.equal(v.next.items, "github", "the record is full: new items go to the overflow");
  P.connect(t, c, "drive", "Sol / Design");
  const r = P.setOverflow(t, c, "drive");
  assert.ok("event" in r);
  assert.equal(P.viewOf(t.since("sol"), c).record!.overflow, "drive");
  assert.ok("error" in P.setOverflow(t, c, "record"));
});

test("let in: joining is not access; each place grants it here or says who to ask", async () => {
  const { t, c } = setup();
  t.append({ project: "sol", by: { person: "isaac" }, kind: "place", item: "drive", value: { kind: "drive", label: "Sol / Design", by: "isaac", state: "on" } });
  const v = P.viewOf(t.since("sol"), c);
  const a = P.letIn(v, "frank", (p) => p.kind === "github");
  const by = Object.fromEntries(a.map((x) => [x.place, x]));
  assert.equal(by.record.can, "in");
  assert.equal(by.github.can, "grant");
  assert.equal(by.drive.can, "ask");
  assert.equal(by.drive.ask, "isaac");
  assert.equal(by.drive.line, "ask isaac for access");
  let asked = "";
  const g = await P.grant(t, c, "github", "frank", async (p, who) => { asked = `${p.label} ${who}`; return null; });
  assert.ok("event" in g);
  assert.equal(asked, "sol-mif/sol-dev frank");
  assert.equal(g.event.field, "in.frank");
});

test("a guest sees the places and changes nothing", async () => {
  const { t, c } = setup({ role: "guest" });
  const v = P.viewOf(t.since("sol"), c);
  assert.equal(v.guest, true);
  assert.ok("error" in P.reroute(t, c, "code", "record"));
  assert.ok("error" in P.revoke(t, c, "github"));
  assert.ok("error" in P.connect(t, c, "drive", "x"));
  assert.ok("error" in (await P.grant(t, c, "github", "frank", async () => null)));
  assert.equal(t.since("sol").length, 0);
});

test("the stand-in trail keeps one JSON line per event and reads it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "v3-places-"));
  const f = join(dir, "places.jsonl");
  const t = fileTrail(f);
  t.append({ project: "sol", by: { person: "marco" }, kind: "route", item: "code", field: "place", value: "record" });
  assert.equal(readFileSync(f, "utf8").trim().split("\n").length, 1);
  assert.equal(foldPlaces(fileTrail(f).since("sol")).routing.code, "record");
});

test("the fold is the same in any order (per object, per field, the latest write wins)", () => {
  const t = memoryTrail({ now: (() => { let n = 0; return () => ++n; })() });
  t.append({ project: "sol", by: { person: "marco" }, kind: "route", item: "code", field: "place", value: "drive" });
  t.append({ project: "sol", by: { person: "frank" }, kind: "route", item: "code", field: "place", value: "record" });
  t.append({ project: "sol", by: { person: "marco" }, kind: "place", item: "drive", value: { kind: "drive", label: "A", state: "on" } });
  t.append({ project: "sol", by: { person: "marco" }, kind: "place", item: "drive", field: "label", value: "B" });
  const a = foldPlaces(t.since("sol")), b = foldPlaces([...t.since("sol")].reverse());
  assert.deepEqual(a, b);
  assert.equal(a.routing.code, "record");
  assert.equal(a.places.drive.fields.label, "B");
});

const face = () => { const got: any[] = []; return { got, w: { send: (m: object) => { got.push(m); } }, by: (rid: string) => got.find((m) => m.rid === rid) }; };

test("F7: the switch off: team.v3.places.* get no answer; on, they answer as work.v3.places.*", async () => {
  process.env.SOL_COWORK_V3 = "off";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const f = face(); addTeamFace(f.w as never);
  for (const type of ["read", "reach", "connect", "revoke", "reroute", "overflow", "undo", "letin", "grant"])
    await handleTeam(f.w, { type: `team.v3.places.${type}`, rid: `off-${type}`, project: "team" });
  assert.deepEqual(f.got, [], "nothing answered: today's Cowork");
  process.env.SOL_COWORK_V3 = "on";
  const { getTeam } = await import("../src/team/settings.ts");
  const project = getTeam().rooms[0]?.id ?? "team";
  await handleTeam(f.w, { type: "team.v3.places.read", rid: "on-1", project });
  const a = f.by("on-1");
  assert.equal(a?.type, "work.v3.places.read");
  assert.ok(a.view?.places.some((p: P.Place) => p.id === "record"), JSON.stringify(a));
  await handleTeam(f.w, { type: "team.v3.places.reroute", fromSol: true, rid: "on-2", project, kind: "dates", place: "record" });
  const b = f.by("on-2");
  assert.ok(b?.error || b?.event, JSON.stringify(b));
  await handleTeam(f.w, { type: "team.v3.places.read", rid: "on-3", project: "no-such-project" });
  assert.equal(f.by("on-3")?.error, "which project?");
  process.env.SOL_COWORK_V3 = "off";
});
