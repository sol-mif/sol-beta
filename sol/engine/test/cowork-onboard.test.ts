// Onboarding into a project, with skip (#430): the project's `onboarding` part, changed only by a proposal agreed in
// the polls; the walk built from the settings in force; `.sol/onboarded.json`, each person's own row (a step done or
// skipped, the whole walk finished or skipped, walked again); and facts only until the walk is finished. A fake record.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-onboard-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const J = await import("../src/team/project.ts");
const P = await import("../src/team/polls.ts");
const O = await import("../src/team/onboard.ts");

const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  let puts = 0;
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { content: string }) => { on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++puts}` }); return ""; },
  } } as any;
  return { d: { record: () => rec }, text: (p: string) => on.get(p)?.text, puts: () => puts };
}
let n = 0;
const fresh = () => { J.project.forget(); P.polls.forget(); O.onboarded.forget(); return `o/record-${++n}`; };
const SOL = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"], night: { hour: 3, staleDays: 7 } };
const settings = (over: Partial<{ owners: Record<string, string[]>; agents: { share: "facts" | "more"; pick: boolean } }> = {}) =>
  ({ rhythm: SOL, owners: over.owners ?? { cowork: ["franktsai2008-eng"] }, agents: over.agents ?? { share: "facts" as const, pick: false } });

test("the onboarding part: {} is the default; a welcome and notes made valid; written back as it was read", () => {
  assert.equal(J.cleanOnboarding({}), null);
  assert.equal(J.cleanOnboarding("x"), null);
  const ob = J.cleanOnboarding({ welcome: "  hi\u0007 there\r\n\n\n\nfrom us ", steps: { owners: { on: false, note: "ask Frank" }, night: { note: "x".repeat(400) }, bogus: { on: false } } })!;
  assert.equal(ob.welcome, "hi there\n\nfrom us");
  assert.deepEqual(ob.steps.owners, { on: false, note: "ask Frank" });
  assert.equal(ob.steps.night.on, true); assert.equal(ob.steps.night.note.length, J.NOTE_MAX);
  assert.deepEqual(ob.steps.handin, { on: true, note: "" });
  assert.ok(!("bogus" in ob.steps));
  const f = J.parseProject(JSON.stringify({ v: 1, onboarding: ob }));
  assert.deepEqual(J.parseProject(J.serializeProject(f)).onboarding, ob);
  assert.equal(J.fromWhere(f).onboarding, "record");
  assert.equal(J.fromWhere(J.parseProject("{}")).onboarding, "default");
});

test("a change to the onboarding is a proposal: every reviewer and lead agrees in the polls, then it applies", async () => {
  const repo = fresh(), rec = fakeRecord();
  const start = { rhythm: { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"] }, night: null };
  const want = { welcome: "Welcome to SOL", steps: { owners: { on: false, note: "" } } };
  const r = await J.propose(rec.d, repo, { patch: { onboarding: want }, by: "marcocyl04-ux", start });
  assert.ok("proposal" in r);
  assert.deepEqual(r.proposal.needs, ["franktsai2008-eng", "marcocyl04-ux"]);
  assert.equal(r.proposal.state, "open");
  assert.match(J.summary(r.proposal.patch, r.proposal.was), /^onboarding: the welcome, who owns what left out$/);
  assert.equal(J.parseProject(rec.text(J.PROJECT_PATH)).onboarding, undefined);   // not yet: nobody writes it straight
  // a second change to the onboarding waits for this one
  assert.match(((await J.propose(rec.d, repo, { patch: { onboarding: { welcome: "other" } }, by: "franktsai2008-eng", start })) as { error: string }).error, /waiting for agreement already/);
  await P.polls.change(rec.d, repo, { vote: { id: r.proposal.poll, option: J.AGREE, by: "franktsai2008-eng" } });
  const done = await J.settle(rec.d, repo);
  assert.equal(done[0].state, "applied");
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  assert.equal(f.onboarding!.welcome, "Welcome to SOL");
  assert.equal(f.onboarding!.steps.owners.on, false);
  assert.equal(f.set.onboarding!.by, "marcocyl04-ux");
  // a rhythm file that could not be read: who must agree is unknown, so an onboarding change is refused, never asked of the asker alone
  const unsure = await J.propose(rec.d, fresh(), { patch: { onboarding: { welcome: "x" } }, by: "marcocyl04-ux", start: { rhythm: null, night: null, unsure: true } });
  assert.match((unsure as { error: string }).error, /who must agree is not known/);
  // the same again is nothing
  assert.match(((await J.propose(rec.d, repo, { patch: { onboarding: f.onboarding }, by: "marcocyl04-ux", start })) as { error: string }).error, /nothing changes/);
});

test("the walk: the steps from the settings in force, the left-out ones gone, the project's notes under them", () => {
  const o = O.parseOnboarded("");
  const v = O.walkOf(null, settings(), o, "w0ngtap", "o/r");
  assert.deepEqual(v.steps.map((s) => s.id), ["night", "owners", "handin", "agents"]);
  assert.equal(v.state, "new"); assert.equal(v.due, true); assert.equal(v.custom, false);
  const night = v.steps[0].lines.join("\n");
  assert.match(night, /hand in by 20:00/); assert.match(night, /the dev night at 21:00: marcocyl04-ux reads each change handed in and takes it in/); assert.doesNotMatch(night, /fold/);
  assert.match(night, /fixes until 06:00/); assert.match(night, /release at 09:00.*franktsai2008-eng takes it into beta or holds it/);
  assert.match(night, /America\/New York time/);
  assert.match(v.steps[1].lines[0], /^cowork: franktsai2008-eng$/);
  assert.match(v.steps[2].lines.join("\n"), /only your press hands a change in; your agent never does/);
  assert.match(v.steps[3].lines.join("\n"), /facts only/);
  // no leads, an agent that may pick, more than facts
  const w = O.walkOf(null, settings({ owners: {}, agents: { share: "more", pick: true } }), o, "w0ngtap", "o/r");
  assert.match(w.steps[1].lines[0], /no area has a lead yet/);
  assert.match(w.steps[2].lines.join("\n"), /your agent may take one back to draft/);
  assert.match(w.steps[3].lines[0], /more than facts/);
  // the project's own part: a welcome, a step left out, a note
  const ob = J.cleanOnboarding({ welcome: "hi", steps: { owners: { on: false }, handin: { note: "use sol/take" } } });
  const c = O.walkOf({ onboarding: ob! }, settings(), o, "w0ngtap", "o/r");
  assert.equal(c.welcome, "hi"); assert.equal(c.custom, true);
  assert.deepEqual(c.steps.map((s) => s.id), ["night", "handin", "agents"]);
  assert.equal(c.steps[1].note, "use sol/take");
  // every step left out: nothing to walk, never due
  const none = J.cleanOnboarding({ steps: Object.fromEntries(J.STEPS.map((k) => [k, { on: false }])) });
  assert.equal(O.walkOf({ onboarding: none! }, settings(), o, "w0ngtap", "o/r").due, false);
});

test("who walked it: my own row only; a step done or skipped, the walk finished or skipped whole, walked again", async () => {
  const repo = fresh(), rec = fakeRecord();
  const at = "2026-10-30T12:00:00.000Z";
  const step = (by: string, id: unknown, how: unknown) => O.onboarded.change(rec.d, repo, { step: { by, id, how, at } });
  assert.match(((await step("nobody here", "night", "done")) as { error: string }).error, /sign in/);
  assert.match(((await step("w0ngtap", "nope", "done")) as { error: string }).error, /no such step/);
  assert.match(((await step("w0ngtap", "night", "maybe")) as { error: string }).error, /done or skipped/);
  assert.ok(!("error" in (await step("w0ngtap", "night", "done"))));
  assert.ok(!("error" in (await step("w0ngtap", "owners", "skipped"))));
  const before = rec.puts();
  const again = await step("W0ngTap", "night", "done");   // the same mark again, any case: no commit
  assert.ok(!("error" in again) && !again.changed); assert.equal(rec.puts(), before);
  let o = O.parseOnboarded(rec.text(O.ONBOARDED_PATH));
  assert.deepEqual(o.people.w0ngtap.steps, { night: "done", owners: "skipped" });
  assert.equal(O.stateOf(o.people.w0ngtap), "partway");
  assert.equal(O.walkOf(null, settings(), o, "w0ngtap", repo).due, true);   // partway: it opens again
  assert.equal(O.walkOf(null, settings(), o, "w0ngtap", repo).steps[1].mark, "skipped");
  // Frank skips his whole walk: it no longer opens by itself, and his agent shares facts only
  await O.onboarded.change(rec.d, repo, { finish: { by: "franktsai2008-eng", how: "skipped", at } });
  // Isaac finishes his
  await O.onboarded.change(rec.d, repo, { finish: { by: "w0ngtap", how: "done", at } });
  o = O.parseOnboarded(rec.text(O.ONBOARDED_PATH));
  const v = O.walkOf(null, settings(), o, "franktsai2008-eng", repo);
  assert.equal(v.state, "skipped"); assert.equal(v.due, false);
  assert.deepEqual(v.people.map((p) => [p.login, p.state]), [["franktsai2008-eng", "skipped"], ["w0ngtap", "done"]]);
  const more = { share: "more" as const, pick: false };
  assert.equal(O.shareOf(more, o.people["franktsai2008-eng"]), "facts");
  assert.equal(O.shareOf(more, o.people.w0ngtap), "more");
  assert.equal(O.shareOf(more, undefined), "facts");
  assert.equal(O.shareOf({ share: "facts", pick: false }, o.people.w0ngtap), "facts");
  assert.equal(await O.shareFor(rec.d, repo, "W0NGTAP", more), "more");
  assert.equal(await O.shareFor(rec.d, repo, "franktsai2008-eng", more), "facts");
  // Frank comes back: walked again, his row goes, so the walk is due; finishing it lifts facts only
  await O.onboarded.change(rec.d, repo, { redo: { by: "franktsai2008-eng", at } });
  o = O.parseOnboarded(rec.text(O.ONBOARDED_PATH));
  assert.equal(o.people["franktsai2008-eng"], undefined);
  assert.equal(O.walkOf(null, settings(), o, "franktsai2008-eng", repo).due, true);
  await O.onboarded.change(rec.d, repo, { finish: { by: "franktsai2008-eng", how: "done", at } });
  assert.equal(await O.shareFor(rec.d, repo, "franktsai2008-eng", more), "more");
  // written in one order, read back the same
  o = O.parseOnboarded(rec.text(O.ONBOARDED_PATH));
  assert.equal(O.serializeOnboarded(O.parseOnboarded(O.serializeOnboarded(o))), O.serializeOnboarded(o));
});

test("the file read made valid: bad rows dropped, a newer Sol's file said", () => {
  const o = O.parseOnboarded(JSON.stringify({ v: 2, people: { a: { login: "bad login", at: "2026-10-30T12:00:00Z" }, b: { login: "Frank", at: "nope" }, c: { login: "Isaac", at: "2026-10-30T12:00:00Z", steps: { night: "done", x: "done", owners: "meh" }, all: "eh" } } }));
  assert.deepEqual(Object.keys(o.people), ["isaac"]);
  assert.deepEqual(o.people.isaac.steps, { night: "done" });
  assert.equal(o.people.isaac.all, undefined);
  assert.equal(o.newer, true);
  for (const t of ["", "[]", "nope"]) assert.deepEqual(O.parseOnboarded(t), { v: 1, people: {} });
});

test("agentShare (#432's speaking rules): the project's rule once my walk is finished, facts only before", async () => {
  const repo = fresh(), rec = fakeRecord();
  J.useProject({ things: () => rec.d, where: () => ({ record: repo, code: "" }) });
  try {
    assert.equal(await O.agentShare("o/code", "w0ngtap"), "facts");   // the project's rule is facts
    await J.propose(rec.d, repo, { patch: { agents: { share: "more", pick: false } }, by: "w0ngtap", start: {} });
    assert.equal(await O.agentShare("o/code", "w0ngtap"), "facts");   // more, but not walked through yet
    await O.onboarded.change(rec.d, repo, { finish: { by: "w0ngtap", how: "done", at: "2026-10-30T12:00:00.000Z" } });
    assert.equal(await O.agentShare("o/code", "w0ngtap"), "more");
    assert.equal(await O.agentShare("o/code", "franktsai2008-eng"), "facts");
  } finally { J.useProject(null); }
});
