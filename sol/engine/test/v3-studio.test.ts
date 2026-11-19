// Cowork v3, slice 6 (fr-30, #559): the studio and the nights as automations. E15: a flow drawn from words, stored as
// words plus flow, run with one trail event per part; the three nights appear as automations that call today's
// scripts (their timers unmoved). Also: the maker owns it, the owner's yes before a shared place, the budget, and F7
// for this slice (the switch off: no answer, nothing loaded).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, studioOf, wordsOf, nameOf, cleanFlow, type Call } from "../src/team/v3/studio.ts";
import { memoryTrail, fileTrail } from "../src/team/v3/studio-trail.ts";
import { nights, nextOf, nightCalendar, calendarWords } from "../src/team/v3/nights.ts";
import { calendarOf } from "../src/team/release.ts";
import { morningCalendar } from "../src/team/morning.ts";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3s-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3s-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3s-home-");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

const MARCO = { person: "marcocyl04-ux", machine: "macbook" };
const FRANK = { person: "franktsai2008-eng", machine: "frank-mac" };
const RHYTHM = { release: "09:00", zone: "America/New_York", dev: ["marcocyl04-ux", "isaac-w"] };

test("E15: the studio draws a flow from words: a trigger, the steps, the outputs", () => {
  const p = parse("every Friday gather what moved and send a summary to Talk");
  assert.deepEqual(p.flow.map((f) => f.part), ["when", "gather", "summarize", "send"], "gather → summarize → send, after the trigger");
  assert.equal(p.trigger?.label, "every Friday");
  assert.deepEqual(p.steps.map((f) => f.part), ["gather", "summarize"]);
  assert.deepEqual(p.outputs.map((f) => [f.label, f.place]), [["Talk", "talk"]]);
  assert.equal(p.words, "every Friday gather what moved and send a summary to Talk", "the words are kept as said");
  const q = parse("Every Friday at 16:00, gather what changed in Plan, summarize it, send it to Talk.");
  assert.deepEqual(q.flow.map((f) => [f.part, f.label]), [["when", "Every Friday at 16:00"], ["gather", "what changed in Plan"], ["summarize", "in a few lines"], ["send", "Talk"]]);
  const r = parse("On the 1st of each month, gather what shipped, draft the update, ask Ben to read it, put it in Drive");
  assert.deepEqual(r.flow.map((f) => f.part), ["when", "gather", "summarize", "ask", "send"]);
  assert.equal(r.outputs[0].place, "drive");
  assert.equal(nameOf(q.flow), "Friday at 16:00: what changed in Plan");
  assert.match(wordsOf(q.flow), /^Every Friday at 16:00, gather what changed in Plan, summarize in a few lines, send to Talk\.$/);
  assert.deepEqual(cleanFlow([{ part: "nope", label: "x" }, { part: "send", label: "my talk" }]), [{ part: "send", label: "my talk", place: "talk" }], "a flow from the face is kept to known parts");
});

test("E15: stored as words plus flow, on the trail, owned by its maker; a dragged change says its words back", () => {
  const trail = memoryTrail();
  const s = studioOf({ trail });
  const au = s.make({ project: "sol", by: MARCO, words: "every Friday gather what moved and send a summary to Talk" });
  assert.equal(trail.all.length, 1, "one event");
  const e = trail.all[0];
  assert.equal(e.kind, "automation");
  assert.equal(e.item, au.id);
  const v = e.value as { words: string; flow: unknown[]; owner: string };
  assert.equal(v.words, "every Friday gather what moved and send a summary to Talk", "the words as said");
  assert.equal(v.flow.length, 4, "beside the flow");
  assert.equal(v.owner, "marcocyl04-ux", "the maker owns it");
  assert.deepEqual(s.list("sol")[0].flow, au.flow, "folded back from the trail as it was stored");
  // a part dragged in: the flow changes and the words are said again from it
  const flow = [...au.flow.slice(0, 2), { part: "ask", label: "Frank" }, ...au.flow.slice(2)];
  const c = s.change({ project: "sol", id: au.id, by: MARCO, flow });
  assert.ok(!("error" in c));
  assert.deepEqual(c.flow.map((f) => f.part), ["when", "gather", "ask", "summarize", "send"]);
  assert.match(c.words, /ask Frank/);
  assert.equal(trail.all.length, 2, "one more event");
  // a file trail keeps it across a restart
  const file = join(tmp("sol-v3s-file-"), "studio-trail.jsonl");
  const ft = fileTrail(file);
  const made = studioOf({ trail: ft }).make({ project: "sol", by: MARCO, words: "every day gather the hand-ins and send to Talk" });
  assert.equal(studioOf({ trail: fileTrail(file) }).get("sol", made.id)?.words, "every day gather the hand-ins and send to Talk");
});

test("E15: a run executes the parts and writes one trail event per part; the run log is folded from them", async () => {
  const trail = memoryTrail();
  const s = studioOf({ trail });
  trail.append({ project: "sol", kind: "item", item: "i-1", by: FRANK, value: { title: "logo" } });
  trail.append({ project: "sol", kind: "item", item: "i-2", by: FRANK, value: { title: "notch" } });
  const au = s.make({ project: "sol", by: MARCO, words: "every Friday gather what moved and send a summary to Talk" });
  const before = trail.all.length;
  const r = await s.run({ project: "sol", au, by: MARCO });
  assert.ok(!("error" in r));
  const runs = trail.all.slice(before);
  assert.equal(runs.length, au.flow.length, "one event per part");
  assert.ok(runs.every((e) => e.kind === "run" && e.item === au.id));
  assert.deepEqual(runs.map((e) => (e.value as { step: number }).step), [0, 1, 2, 3]);
  assert.equal(r.state, "done");
  assert.equal(r.parts[1].result, "found 2 changes", "gather read the trail since the last run");
  assert.equal(r.parts[2].result, "2 lines");
  const log = s.runs("sol", au.id);
  assert.equal(log.length, 1);
  assert.equal(log[0].parts.length, 4);
  // a second run: gather finds nothing new (the run's own events are not changes)
  const r2 = await s.run({ project: "sol", au, by: MARCO });
  assert.ok(!("error" in r2));
  assert.equal(r2.parts[1].result, "found 0 changes");
  assert.equal(s.runs("sol", au.id).length, 2, "the newest first");
  assert.equal(s.runs("sol", au.id)[0].run, r2.run);
});

test("E15: only the maker changes or runs it; anyone may copy it, and then owns the copy", async () => {
  const s = studioOf({ trail: memoryTrail() });
  const au = s.make({ project: "sol", by: FRANK, words: "every Friday gather what moved and send it to Talk" });
  const c = s.change({ project: "sol", id: au.id, by: MARCO, words: "every day gather everything" });
  assert.ok("error" in c && /only franktsai2008-eng changes it/.test(c.error));
  const r = await s.run({ project: "sol", au, by: MARCO });
  assert.ok("error" in r && /only franktsai2008-eng runs it/.test(r.error));
  const mine = s.copy({ project: "sol", from: au, by: MARCO });
  assert.equal(mine.owner, "marcocyl04-ux");
  assert.equal(mine.spend.who, "marcocyl04-ux", "and pays for it");
  assert.deepEqual(mine.flow.map((f) => f.part), au.flow.map((f) => f.part));
});

test("E15: an owner's yes before a part writes to a shared place: one ask event, the run waits, the yes lets it go on", async () => {
  const trail = memoryTrail();
  const owners: Record<string, string> = { drive: "franktsai2008-eng" };
  const s = studioOf({ trail, placeOwner: (_p, place) => owners[place] ?? null });
  const au = s.make({ project: "sol", by: MARCO, words: "On the 1st, gather what shipped, summarize it, put it in Drive" });
  assert.deepEqual(s.needsYes("sol", au), [{ to: "franktsai2008-eng", place: "drive" }], "the card names whose yes");
  const r = await s.run({ project: "sol", au, by: MARCO });
  assert.ok(!("error" in r));
  assert.equal(r.state, "waiting");
  assert.equal(r.waitingFor?.to, "franktsai2008-eng");
  const asks = trail.all.filter((e) => e.kind === "yes.asked");
  assert.equal(asks.length, 1, "one ask event");
  assert.equal(trail.all.filter((e) => e.kind === "run").length, au.flow.length, "the parts before it ran, the send waits on its own line");
  assert.equal(s.asksFor("sol", "franktsai2008-eng").length, 1, "Frank sees the ask");
  assert.equal(s.asksFor("sol", "marcocyl04-ux").length, 0);
  assert.ok("error" in s.yes({ project: "sol", ask: asks[0].id, by: MARCO }), "only the place's owner says yes");
  assert.ok("error" in s.yes({ project: "sol", ask: asks[0].id, by: { person: "franktsai2008-eng", agent: "frank-agent" } }), "never their agent");
  const y = s.yes({ project: "sol", ask: asks[0].id, by: FRANK });
  assert.ok(!("error" in y) && y.run === r.run);
  assert.equal(s.asksFor("sol", "franktsai2008-eng").length, 0, "answered");
  const go = await s.run({ project: "sol", au, by: MARCO, resume: r.run });
  assert.ok(!("error" in go));
  assert.equal(go.state, "done", "the waiting run went on");
  assert.equal(go.parts.length, au.flow.length, "one line per part in the log");
  assert.deepEqual(s.needsYes("sol", au), [], "the yes holds for the next run");
  const again = await s.run({ project: "sol", au, by: MARCO });
  assert.ok(!("error" in again) && again.state === "done");
  assert.equal(trail.all.filter((e) => e.kind === "yes.asked").length, 1, "nothing asked twice");
});

test("E15: whose subscription pays and the budget on each; over the month's budget a run is refused before its first part", async () => {
  const trail = memoryTrail();
  const s = studioOf({ trail, exec: async (f) => ({ result: f.part, cost: f.part === "summarize" ? 0.6 : 0 }) });
  const au = s.make({ project: "sol", by: MARCO, words: "every Friday gather what moved and send a summary to Talk", spend: { limit: 1 } });
  assert.deepEqual(s.spendOf("sol", au), { who: "marcocyl04-ux", limit: 1, run: 0, month: 0 });
  await s.run({ project: "sol", au, by: MARCO });
  await s.run({ project: "sol", au, by: MARCO });
  const sp = s.spendOf("sol", au);
  assert.equal(sp.run, 0.6);
  assert.ok(Math.abs(sp.month - 1.2) < 1e-9);
  const n = trail.all.length;
  const r = await s.run({ project: "sol", au, by: MARCO });
  assert.ok("error" in r && /over its budget/.test(r.error));
  assert.equal(trail.all.length, n, "nothing written");
  const c = s.change({ project: "sol", id: au.id, by: MARCO, spend: { who: "franktsai2008-eng", limit: 5 } });
  assert.ok(!("error" in c) && c.spend.who === "franktsai2008-eng" && c.spend.limit === 5, "whose subscription and the limit are the owner's to set");
});

test("E15: the three nights appear as automations that call today's scripts, at the hours their timers have", () => {
  const now = new Date("2026-11-01T12:00:00Z");   // 07:00 in New York
  const ns = nights({ project: "sol", nightHour: 3, rhythm: RHYTHM, me: "marcocyl04-ux", now });
  assert.deepEqual(ns.map((a) => a.name), ["The dev night", "The release", "The morning"]);
  const calls = ns.map((a) => a.flow.filter((f) => f.call).map((f) => f.call as Call));
  assert.deepEqual(calls, [[{ script: "sol/night", args: ["--dry-run"] }], [{ script: "sol/release", args: ["--dry-run"] }], [{ script: "sol/morning", args: ["--dry-run"] }]], "each calls today's script, a dry run by hand");
  assert.deepEqual(ns.map((a) => a.timer), ["sol-night.timer", "sol-release.timer", "sol-morning.timer"]);
  assert.equal(ns[0].calendar, nightCalendar(3));
  assert.equal(ns[1].calendar, calendarOf(RHYTHM), "the release's time is sol/release --calendar's");
  assert.equal(ns[2].calendar, morningCalendar(RHYTHM), "the morning's is sol/morning --calendar's");
  assert.equal(ns[1].calendar, "*-*-* 09:00:00 America/New_York");
  assert.equal(ns[1].next, "2026-11-01T14:00:00.000Z", "the next release: 09:00 New York today");
  assert.equal(ns[2].next, "2026-11-01T14:30:00.000Z");
  assert.ok(ns.every((a) => a.readonly && a.words && a.flow[0].part === "when" && a.owner === "marcocyl04-ux"));
  assert.ok(ns.every((a) => a.spend.limit === 0), "they run scripts: no agent spend");
  assert.equal(calendarWords(ns[1].calendar!), "every day 09:00 New York");
  // no rhythm: only the night, whose hour is the machine's
  assert.deepEqual(nights({ project: "x", nightHour: 4, rhythm: null, me: "m", now }).map((a) => a.id), ["night-night"]);
  assert.equal(nextOf("*-*-* 09:00:00 America/New_York", new Date("2026-11-01T15:00:00Z"))?.toISOString(), "2026-11-02T14:00:00.000Z", "after the hour: tomorrow");
  assert.equal(nextOf("not a calendar", now), null);
});

test("E15: running a night calls its script (a dry run) and writes one event per part, reading the script's own lines", async () => {
  const trail = memoryTrail(), called: Call[] = [];
  const s = studioOf({ trail, script: async (c) => { called.push(c); return { code: 0, out: "release (dry run: nothing moves)\nwould tag dev-20261101 at abc1234, move dev to it, and tell every Sol\nrelease: dev-20261101 abc1234\nbeta: held, nothing passed" }; } });
  const [, rel] = nights({ project: "sol", nightHour: 3, rhythm: RHYTHM, me: "marcocyl04-ux", now: new Date("2026-11-01T12:00:00Z") });
  const r = await s.run({ project: "sol", au: rel, by: MARCO });
  assert.ok(!("error" in r));
  assert.deepEqual(called, [{ script: "sol/release", args: ["--dry-run"] }], "today's script, once");
  assert.equal(trail.all.length, rel.flow.length, "one event per part");
  assert.equal(r.parts[2].result, "release: dev-20261101 abc1234");
  assert.equal(r.parts[3].result, "would tag dev-20261101 at abc1234, move dev to it, and tell every Sol");
  assert.equal(r.parts[4].result, "beta: held, nothing passed");
  assert.equal(s.list("sol").length, 0, "a night is never stored as an automation: it is read from its timer");
  const failing = studioOf({ trail: memoryTrail(), script: async () => ({ code: 2, out: "release: gh (the GitHub CLI) is not installed" }) });
  const f = await failing.run({ project: "sol", au: rel, by: MARCO });
  assert.ok(!("error" in f) && f.state === "failed" && f.parts.length === 2, "a script that fails stops the run there and says why");
});

test("N5 stays: the three scripts and their timers are not touched by the studio", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  for (const f of ["night", "release", "morning"]) assert.doesNotMatch(readFileSync(join(root, f), "utf8"), /v3|studio/i, `sol/${f} is today's`);
  for (const u of ["sol-night.timer", "sol-release.timer", "sol-morning.timer"]) assert.doesNotMatch(readFileSync(join(root, "engine", "systemd", "user", u), "utf8"), /v3|studio/i);
});

const face = () => { const got: any[] = []; return { got, w: { send: (m: object) => { got.push(m); } } }; };
const settle = () => new Promise((r) => setTimeout(r, 30));
const TYPES = ["list", "parse", "make", "change", "copy", "run", "yes", "log"].map((x) => `team.v3.studio.${x}`);

test("F7: with the switch off the studio's messages get no answer and its module is not loaded", async () => {
  process.env.SOL_COWORK_V3 = "off";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const f = face(); addTeamFace(f.w);
  for (const type of TYPES) await handleTeam(f.w, { type, rid: "off-" + type, project: "sol", words: "every day gather it" });
  await settle();
  assert.deepEqual(f.got, [], "nothing answered: today's Cowork");
  // the module is imported only after the switch says on (wire.ts: `if (!coworkV3()) return;` before the import)
  const wire = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "team", "wire.ts"), "utf8");
  assert.doesNotMatch(wire, /^import .*studio/m, "no static import of the studio");
  const v3 = wire.slice(wire.indexOf("async function handleV3("));   // wire.ts's one v3 block
  assert.ok(v3.indexOf("if (!coworkV3()) return;") >= 0 && v3.indexOf("if (!coworkV3()) return;") < v3.indexOf('await import("./v3/studio-wire.js")'), "the switch is read before the studio loads");
});

test("the switch on: the wire answers work.v3.studio.* by rid, and the nights are listed in a project with a rhythm", async () => {
  process.env.SOL_COWORK_V3 = "on";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const { useStudioTrail, handleStudio } = await import("../src/team/v3/studio-wire.ts");
  useStudioTrail(memoryTrail());
  const f = face(); addTeamFace(f.w);
  await handleTeam(f.w, { type: "team.v3.studio.parse", rid: "p1", words: "every Friday gather what moved and send a summary to Talk" });
  await settle();
  const a = f.got.find((m) => m.rid === "p1");
  assert.equal(a?.type, "work.v3.studio.parse");
  assert.deepEqual(a.parsed.flow.map((x: { part: string }) => x.part), ["when", "gather", "summarize", "send"]);
  const env = { me: "marcocyl04-ux", rhythm: async (p: string) => (p === "sol" ? RHYTHM : null), nightHour: () => 3, now: () => new Date("2026-11-01T12:00:00Z"), projects: () => ["sol", "lea"] };
  const made = await handleStudio({ type: "team.v3.studio.make", rid: "m1", project: "sol", words: "every Friday gather what moved and send a summary to Talk" }, env);
  assert.equal(made.type, "work.v3.studio.make");
  const list = await handleStudio({ type: "team.v3.studio.list", rid: "l1", project: "sol" }, env) as any;
  assert.equal(list.automations.length, 1);
  assert.deepEqual(list.nights.map((n: { id: string }) => n.id), ["night-night", "night-release", "night-morning"]);
  assert.ok(list.nights[1].next, "each with its next run");
  const counts = await handleStudio({ type: "team.v3.studio.list", rid: "c1" }, env) as any;
  assert.deepEqual(counts.counts, { sol: 4, lea: 0 });
  const ch = await handleStudio({ type: "team.v3.studio.change", rid: "x1", project: "sol", id: "night-release", words: "never" }, env) as any;
  assert.match(ch.error, /today's timers and scripts/, "a night is not changed here");
  process.env.SOL_COWORK_V3 = "off";
});
