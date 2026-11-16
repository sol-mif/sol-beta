import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Cowork v3 slice 7 (fr-30, #560): artifacts, versioned with one gesture back (E16), and the floor (leaving, conflicts,
// waiting to send, a key per machine). The wire's tests run on a team and state of their own, offline, the switch off first.
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3a-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3a-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3a-home-");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

const A = await import("../src/team/v3/artifacts.ts");
const F = await import("../src/team/v3/floor.ts");
const { standIn, usePort } = await import("../src/team/v3/trailport.ts");

const me = { person: "marcocyl04-ux", machine: "macbook" };
const frank = { person: "franktsai2008-eng", machine: "frank-mac" };
const clock = () => { const c = { t: 1_000_000, now: () => (c.t += 1000) }; return c; };
const port = () => standIn({ machine: "macbook", now: clock().now });

test("E16: an artifact edited makes a new version; one gesture back restores the previous one as a new version", () => {
  const p = port();
  const made = A.make(p, { project: "sol", by: me, kind: "document", title: "Release notes, November",
    content: { sections: [{ h: "What is new", p: "The notch shows a quiet card." }, { h: "Fixed", p: "Sessions keep their chip." }] } });
  assert.equal(made.art.version, 1);
  assert.equal(made.art.whose, "marcocyl04-ux", "whose face: who made it");
  assert.equal(made.art.place, "record", "where it lives");
  const before = p.events("sol").length;
  const v2 = A.edit(p, { project: "sol", id: made.art.id, by: frank, content: { sections: [{ h: "What is new", p: "The notch is quiet when nothing needs you." }, { h: "Fixed", p: "Sessions keep their chip." }] } });
  assert.equal(p.events("sol").length, before + 1, "an edit is one event");
  assert.equal(v2.art.version, 2);
  assert.equal(v2.versions.length, 2);
  assert.equal(v2.art.by.person, "franktsai2008-eng");
  assert.equal(v2.art.whose, "marcocyl04-ux", "an edit does not change whose it is");
  // an edit that changes nothing writes nothing
  const same = A.edit(p, { project: "sol", id: made.art.id, by: me, content: v2.versions[1].content });
  assert.equal(same.event, null);
  assert.equal(p.events("sol").length, before + 1);
  // one gesture back: v1 again, as v3; every version still there
  const v3 = A.back(p, { project: "sol", id: made.art.id, by: me });
  assert.equal(v3.art.version, 3);
  assert.equal(v3.versions.length, 3, "nothing deleted");
  assert.deepEqual(v3.versions[2].content, v3.versions[0].content, "v3 is v1's content");
  assert.equal(v3.versions[2].note, "v1 again");
  assert.notDeepEqual(v3.versions[1].content, v3.versions[0].content, "v2 is still v2");
  // back once more is v2 again (the one before the last), as v4
  const v4 = A.back(p, { project: "sol", id: made.art.id, by: me });
  assert.equal(v4.art.version, 4);
  assert.deepEqual(v4.versions[3].content, v4.versions[1].content);
  // any version, named
  const v5 = A.back(p, { project: "sol", id: made.art.id, by: me, to: 1 });
  assert.deepEqual(v5.versions[4].content, v5.versions[0].content);
  assert.throws(() => A.back(p, { project: "sol", id: made.art.id, by: me, to: 5 }), /at/);
});

test("E16: the five kinds, each made whole, listed with two marks and exported in its own format", () => {
  const p = port();
  for (const kind of A.ART_KINDS) A.make(p, { project: "sol", by: me, kind, title: `A ${kind}` });
  A.make(p, { project: "sol", by: frank, kind: "table", title: "Who runs which version", place: "drive",
    content: { cols: ["Version", "Who"], rows: [["dev-20261102", "Marco, Isaac"], ["beta-1031", "nobody, yet"]] } });
  const l = A.list(p, "sol");
  assert.equal(l.length, 6);
  assert.deepEqual([...new Set(l.map((a) => a.kind))], ["document", "page", "table", "canvas", "flow"], "by kind");
  for (const a of l) { assert.ok(a.whose); assert.ok(a.place); }
  assert.ok(l.every((a) => a.waiting), "nothing sent yet: every one waits to send");
  const t = l.find((a) => a.title === "Who runs which version")!;
  assert.equal(t.place, "drive");
  const x = A.exportOf(t, A.get(p, "sol", t.id)!.versions[0].content);
  assert.equal(x.mime, "text/csv");
  assert.equal(x.text, 'Version,Who\ndev-20261102,"Marco, Isaac"\nbeta-1031,"nobody, yet"\n');
  const d = l.find((a) => a.kind === "document")!;
  assert.match(A.exportOf(d, A.get(p, "sol", d.id)!.versions[0].content).text, /^# A document\n\n## What it is/);
  assert.throws(() => A.make(p, { project: "sol", by: me, kind: "spreadsheet", title: "x" }), /document, page, table/);
  assert.throws(() => A.edit(p, { project: "sol", id: "a-nope", by: me, title: "y" }), /no such artifact/);
  assert.deepEqual(A.list(p, "lea"), [], "another project's shelf is its own");
});

test("E16: two Sols editing offline make two versions, both kept in the trail's order", () => {
  const p = port();
  const a = A.make(p, { project: "sol", by: me, kind: "page", title: "What to try: #551", content: { hero: "What to try", p: "Press ⌘K.", cards: [] } });
  A.edit(p, { project: "sol", id: a.art.id, by: me, content: { hero: "What to try", p: "Press ⌘K anywhere.", cards: [] } });
  A.edit(p, { project: "sol", id: a.art.id, by: frank, content: { hero: "What to try", p: "Press ⌘K on a word.", cards: [] } });
  const g = A.get(p, "sol", a.art.id)!;
  assert.equal(g.versions.length, 3);
  assert.deepEqual(g.versions.map((v) => v.by.person), ["marcocyl04-ux", "marcocyl04-ux", "franktsai2008-eng"]);
});

// ---------- the floor ----------
const seeded = () => {
  const p = port();
  p.append({ project: "sol", by: me, kind: "member", item: "marcocyl04-ux", value: { role: "owner" } });
  p.append({ project: "sol", by: frank, kind: "member", item: "franktsai2008-eng", value: { role: "editor" } });
  p.append({ project: "sol", by: frank, kind: "place", item: "pl-drive", value: { kind: "drive", label: "Sol's Drive", by: "franktsai2008-eng" } });
  p.append({ project: "sol", by: frank, kind: "item", item: "i-1", value: { title: "Night cards ask why", whose: "franktsai2008-eng", state: "open", place: "record" } });
  p.append({ project: "sol", by: frank, kind: "item", item: "i-2", value: { title: "Old thing", whose: "franktsai2008-eng", state: "done", place: "record" } });
  p.append({ project: "sol", by: frank, kind: "loose", item: "l-1", value: { title: "notes.key", whose: "franktsai2008-eng", place: "machine" } });
  p.append({ project: "sol", by: { person: "franktsai2008-eng", agent: "claude" }, kind: "item", item: "i-1", field: "note", value: "drafted" });
  return p;
};

test("leaves: someone leaving shows what breaks, one press a line, and the rest of the project keeps working", () => {
  const p = seeded();
  const card = F.leaves(p.record("sol"), p.events("sol"), "franktsai2008-eng", "marcocyl04-ux");
  assert.equal(card.heir, "marcocyl04-ux");
  assert.deepEqual(card.lines.map((l) => [l.kind, l.id]), [["place", "pl-drive"], ["item", "i-1"], ["loose", "l-1"], ["agent", "claude"]],
    "their place's sign-in, their open item (not the done one), the file on their machine, their agent's key");
  assert.ok(card.lines.every((l) => l.press), "one press each");
  const before = p.events("sol").length;
  for (const l of card.lines) F.pressLeave(p, "sol", me, "franktsai2008-eng", l);
  assert.equal(p.events("sol").length, before + 4, "one event a line");
  const r = p.record("sol");
  assert.equal(r.places["pl-drive"].fields.by, "marcocyl04-ux");
  assert.equal(r.items["i-1"].fields.whose, "marcocyl04-ux");
  assert.equal(r.items["i-1"].fields.title, "Night cards ask why", "the item itself is untouched");
  assert.equal(r.members["franktsai2008-eng"].fields["agent.claude"], "revoked");
  assert.deepEqual(F.leaves(r, p.events("sol"), "franktsai2008-eng", "marcocyl04-ux").lines, [], "nothing breaks any more");
  assert.match(F.leaves(r, p.events("sol"), "franktsai2008-eng", "marcocyl04-ux").calm, /Nothing breaks/);
  // and if I leave, the owner after me is Frank (the only other member)
  assert.equal(F.heirOf(r, "marcocyl04-ux", "marcocyl04-ux"), "franktsai2008-eng");
});

test("conflict: two Sols change one field offline; the card shows both and one press keeps one, the other stays on the trail", () => {
  const p = seeded();
  const head = p.events("sol").filter((e) => e.item === "i-1" && e.kind === "item" && !e.field)[0].id;
  // two writes that each saw only the first title: a conflict, as slice 0's record makes it
  p.append({ project: "sol", by: me, kind: "item", item: "i-1", field: "title", value: "Night cards: ask why", base: [head] });
  p.append({ project: "sol", by: frank, kind: "item", item: "i-1", field: "title", value: "Night cards ask for a reason", base: [head] });
  const cards = F.conflictCards(p.record("sol"));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].field, "title");
  assert.equal(cards[0].versions.length, 2, "both versions on one card");
  const theirs = cards[0].versions.find((v) => v.by.person === "franktsai2008-eng")!;
  F.keepVersion(p, "sol", me, { collection: "items", id: "i-1", field: "title", event: theirs.event });
  const r = p.record("sol");
  assert.deepEqual(F.conflictCards(r), [], "settled with one press");
  assert.equal(r.items["i-1"].fields.title, "Night cards ask for a reason");
  assert.ok(p.events("sol").some((e) => e.value === "Night cards: ask why"), "mine is still on the trail: nothing lost");
  assert.throws(() => F.keepVersion(p, "sol", me, { collection: "items", id: "i-1", field: "title", event: theirs.event }), /settled/);
});

test("waiting to send: what the cloud has not kept is one card, by thing", () => {
  const p = seeded();
  const w = F.waitingCard(p, "sol", "the cloud is away");
  assert.equal(w.count, p.events("sol").length);
  assert.ok(w.things.some((t) => t.title === "Night cards ask why"));
  assert.equal(w.away, "the cloud is away");
});

test("interrupt and quiet hours: one me-layer setting; the rule reads it, quiet hours run past midnight", () => {
  const p = seeded();
  assert.equal(F.interruptOf(p.record("sol"), "marcocyl04-ux").layer, "default");
  F.setInterrupt(p, "sol", me, { what: "reds only", quiet: { from: "22:00", to: "07:00" }, zone: "Europe/Brussels" });
  const i = F.interruptOf(p.record("sol"), "marcocyl04-ux");
  assert.equal(i.layer, "me");
  assert.equal(i.what, "reds only");
  assert.equal(F.interruptOf(p.record("sol"), "franktsai2008-eng").layer, "default", "mine is mine");
  const at = (iso: string) => new Date(iso);
  assert.equal(F.isQuiet(i, at("2026-11-01T22:30:00Z")), true, "23:30 in Brussels");
  assert.equal(F.isQuiet(i, at("2026-11-02T05:30:00Z")), true, "06:30 in Brussels");
  assert.equal(F.isQuiet(i, at("2026-11-02T09:00:00Z")), false, "10:00 in Brussels");
  assert.equal(F.mayInterrupt(i, "red", at("2026-11-02T09:00:00Z")), true);
  assert.equal(F.mayInterrupt(i, "ask", at("2026-11-02T09:00:00Z")), false, "reds only");
  assert.equal(F.mayInterrupt(i, "red", at("2026-11-01T22:30:00Z")), false, "quiet holds it");
  assert.equal(F.cleanInterrupt({ what: "everything!", quiet: { from: "25:00", to: "x" } }).what, "reds and direct asks", "a bad value is the default");
  assert.equal(F.cleanInterrupt({ quiet: null }).quiet, null, "never quiet");
});

test("a key per machine: this one under my key, a second machine's key signed under my person key here", async () => {
  const p = seeded();
  const d0 = F.devices(p, "sol", "marcocyl04-ux");
  assert.equal(d0.length, 1);
  assert.equal(d0[0].name, "macbook"); assert.equal(d0[0].here, true); assert.equal(d0[0].vouched, true); assert.equal(d0[0].answers, true);
  const other = standIn({ machine: "nucbox" }).machine0("marcocyl04-ux");   // the NucBox's own key, made there
  F.certify(p, "sol", me, "nucbox", other.pub, "runs the nights");
  const d1 = F.devices(p, "sol", "marcocyl04-ux");
  const nuc = d1.find((d) => d.name === "nucbox")!;
  assert.ok(nuc, "listed");
  assert.equal(nuc.vouched, true, "its key is signed under my person key");
  assert.equal(nuc.here, false);
  assert.equal(nuc.note, "runs the nights");
  const cert = (p.events("sol").find((e) => e.kind === "machine")!.value as { cert: { pkey: string; pub: string } }).cert;
  assert.equal(cert.pkey, p.personPub("marcocyl04-ux"), "signed by my person key");
  assert.equal(cert.pub, other.pub);
  F.setAnswers(p, "sol", me, "nucbox");
  assert.equal(F.devices(p, "sol", "marcocyl04-ux").find((d) => d.answers)?.name, "nucbox");
  assert.throws(() => F.certify(p, "sol", me, "macbook", other.pub), /this machine/);
  assert.throws(() => F.certify(p, "sol", me, "nucbox", "short"), /not a machine key/);
});

// ---------- the wire ----------
const face = () => { const got: any[] = []; return { got, w: { send: (m: object) => { got.push(m); } }, by: (rid: string) => got.find((m) => m.rid === rid) }; };
const settle = () => new Promise((r) => setTimeout(r, 30));

test("F7: with the switch off artifacts, search and the floor get no answer", async () => {
  process.env.SOL_COWORK_V3 = "off";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const f = face(); addTeamFace(f.w);
  for (const type of ["team.v3.artifacts.list", "team.v3.artifacts.make", "team.v3.search.query", "team.v3.floor.get", "team.v3.floor.certify"])
    await handleTeam(f.w, { type, rid: "off-" + type, project: "sol", q: "logo" });
  await settle();
  assert.deepEqual(f.got, [], "nothing answered: today's Cowork");
});

test("the wire with the switch on: answers come back as work.v3.*, by rid", async () => {
  process.env.SOL_COWORK_V3 = "on";
  usePort(port());
  const { answerSeven } = await import("../src/team/v3/floorwire.ts");
  const ctx = { me: "marcocyl04-ux" };
  const made = await answerSeven({ type: "team.v3.artifacts.make", rid: 1, project: "sol", kind: "document", title: "The logo brief" }, ctx);
  assert.equal(made.type, "work.v3.artifacts.make"); assert.equal(made.rid, 1);
  const id = (made.art as { id: string }).id;
  const ed = await answerSeven({ type: "team.v3.artifacts.edit", rid: 2, project: "sol", id, content: { sections: [{ h: "Brief", p: "One line, the o open." }] } }, ctx);
  assert.equal((ed.art as { version: number }).version, 2);
  const bk = await answerSeven({ type: "team.v3.artifacts.back", rid: 3, project: "sol", id }, ctx);
  assert.equal((bk.art as { version: number }).version, 3);
  const s = await answerSeven({ type: "team.v3.search.query", rid: 4, q: "logo" }, ctx);
  assert.equal(s.type, "work.v3.search.query");
  assert.equal((s.groups as { kind: string }[])[0].kind, "artifact");
  const fl = await answerSeven({ type: "team.v3.floor.get", rid: 5, project: "sol" }, ctx);
  assert.equal((fl.devices as unknown[]).length, 1);
  const bad = await answerSeven({ type: "team.v3.artifacts.get", rid: 6, project: "../x" }, ctx);
  assert.equal(bad.error, "which project?");
  usePort(null);
});
