// Project settings (#428): `.sol/project.json` in the project's record through the kit's store. The defaults; the
// starting values from a committed `.sol/rhythm.json` and the night job's file; the record taking over, also for
// tonight's rhythm loader; compare-and-swap conflicts; the proposal and its agreement through polls; and conversion
// step 0002, which moves team.json's `night` out. A fake record and a fake gh; every file is in a temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-project-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const J = await import("../src/team/project.ts");
const P = await import("../src/team/polls.ts");
const T = await import("../src/team/tonight.ts");
const NF = await import("../src/team/nightfile.ts");
const S = await import("../src/team/settings.ts");
const { runConversions } = await import("../src/convert/run.ts");
const { STEPS } = await import("../src/convert/steps.ts");

const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord(files: Record<string, string> = {}) {
  const on = new Map(Object.entries(files).map(([p, t]) => [p, { text: t, sha: "s0" }]));
  const puts: { path: string; message: string; sha?: string }[] = [];
  const fail: string[] = [];
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { message: string; content: string; sha?: string }) => {
      puts.push({ path, message: w.message, sha: w.sha });
      const f = fail.shift() ?? "";
      if (f) throw ghError(f);
      on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${puts.length}` });
      return "";
    },
  } } as any;
  return { rec, puts, fail, text: (p: string) => on.get(p)?.text, set: (p: string, t: string) => on.set(p, { text: t, sha: `x${Math.random()}` }) };
}
const SOL_RHYTHM = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"] };
/** the same as read: no backup named, the handover at its default (#478) */
const SOL_READ = { ...SOL_RHYTHM, handover: "23:00", devBackup: [], betaBackup: [] };
let n = 0;
const fresh = () => { J.project.forget(); P.polls.forget(); T.forgetRhythms(); return `o/record-${++n}`; };   // a record repo of its own each test

test("defaults: an empty or broken file is the defaults; every read answers them with nothing wired", async () => {
  for (const t of ["", "not json", "[]", "{}"]) {
    const f = J.parseProject(t);
    assert.deepEqual(J.rhythmIn(f), J.RHYTHM_DEFAULT);
    assert.deepEqual(J.agentsIn(f), { share: "facts", pick: false });
    assert.deepEqual(J.ownersIn(f), {});
    assert.equal(f.onboarding, undefined);
    assert.deepEqual(J.onboardingIn(f), J.onboardingDefault());
    assert.equal(JSON.parse(J.serializeProject(f)).onboarding && Object.keys(JSON.parse(J.serializeProject(f)).onboarding).length, 0);   // still written as {}
    assert.deepEqual(f.proposals, []);
  }
  assert.deepEqual(J.RHYTHM_DEFAULT.night, { hour: 3, staleDays: 7 });
  J.useProject(null);
  assert.deepEqual(await J.projectRhythm(), J.RHYTHM_DEFAULT);
  assert.deepEqual(await J.agentRules(), { share: "facts", pick: false });
  assert.deepEqual(await J.owners(), {});
  assert.equal(await J.mayAgentsPick(), false);
  // bad values fall back; an unknown zone is each machine's clock; an area with no lead is left out, two leads at most
  const f = J.parseProject(JSON.stringify({ v: 1, rhythm: { review: "25:00", zone: "Mars/Base", dev: ["ok-login", "bad login!"], night: { hour: 30 } },
    agents: { share: "everything", pick: "yes" }, owners: { Cowork: ["a", "b", "c"], "": ["x"], empty: [] } }));
  assert.equal(f.rhythm!.review, "21:00"); assert.equal(f.rhythm!.zone, ""); assert.deepEqual(f.rhythm!.dev, ["ok-login"]); assert.deepEqual(f.rhythm!.night, { hour: 3, staleDays: 7 });
  assert.deepEqual(f.agents, { share: "facts", pick: false });
  assert.deepEqual(f.owners, { cowork: ["a", "b"] });
  // the same file twice is the same text: a write that changes nothing is never a commit
  assert.equal(J.serializeProject(J.parseProject(J.serializeProject(f))), J.serializeProject(f));
  assert.equal(J.parseProject(JSON.stringify({ v: 2 })).newer, undefined);   // a file with backups (#478) is ours
  assert.equal(J.parseProject(JSON.stringify({ v: 3 })).newer, true);
});

test("starting values: the committed rhythm file and the night job's file, until the record has its own", async () => {
  const start = { rhythm: T.parseRhythm(JSON.stringify(SOL_RHYTHM)), night: { hour: 22, staleDays: 3 } };
  const r = J.rhythmIn(J.parseProject(""), start);
  assert.deepEqual(r, { ...SOL_READ, night: { hour: 22, staleDays: 3 } });
  assert.deepEqual(J.fromWhere(J.parseProject(""), start), { rhythm: "file", night: "carried", agents: "default", owners: "default", blocks: "default", onboarding: "default" });
  // through the wiring: the record has nothing, so the rhythm is the file's (read with gh), the night the file beside team.json
  const repo = fresh(), rec = fakeRecord();
  const night = join(DIR, "night-start.json");
  NF.writeNightFile(night, { hour: 22, staleDays: 3 }, "team.json");
  const asked: string[] = [];
  const gh = async (args: string[]) => { asked.push(args.join(" ")); if (args[1] === "repos/sol-mif/sol-dev/contents/.sol/rhythm.json") return JSON.stringify(SOL_RHYTHM); throw ghError("gh: Not Found (HTTP 404)"); };
  J.useProject({ things: () => ({ record: () => rec.rec }), where: () => ({ record: repo, code: "sol-mif/sol-dev" }), gh, nightFile: night });
  assert.deepEqual(await J.projectRhythm(), { ...SOL_READ, night: { hour: 22, staleDays: 3 } });
  // tonight's loader, its API as it was: the file, since the record has no rhythm
  assert.deepEqual(await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev", true), { ...SOL_READ, from: ".sol/rhythm.json" });
  // the record gets its own (a change agreed): the loader reads it from now on, and the file is not asked
  rec.set(J.PROJECT_PATH, JSON.stringify({ v: 1, rhythm: { ...SOL_RHYTHM, review: "22:00", beta: ["isaac"], night: { hour: 4, staleDays: 5 } } }));
  J.project.forget(); T.forgetRhythms();
  const before = asked.length;
  const own = await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev");
  assert.equal(own!.review, "22:00"); assert.deepEqual(own!.beta, ["isaac"]);
  assert.equal(asked.length, before);
  assert.equal((await J.projectRhythm()).night.hour, 4);
  // the night job's file follows the record
  assert.equal(J.keepNight(await J.project.get({ record: () => rec.rec }, repo), night), true);
  assert.deepEqual(NF.readNightFile(night), { hour: 4, staleDays: 5 });
  // the record cannot be read for a moment: what was known stays; with nothing known the file answers but is not kept,
  // so the record's own rhythm comes back on the next read
  const down = { record: () => ({ files: { ...rec.rec.files, readSha: async () => { throw ghError("gh: connection reset"); } } }) } as any;
  J.useProject({ things: () => down, where: () => ({ record: repo, code: "sol-mif/sol-dev" }), gh, nightFile: night });
  J.project.forget();
  assert.equal((await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev"))!.review, "21:00");   // nothing known: the file, not kept
  J.useProject({ things: () => ({ record: () => rec.rec }), where: () => ({ record: repo, code: "sol-mif/sol-dev" }), gh, nightFile: night });
  assert.equal((await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev"))!.review, "22:00");   // the record again at once
  let fail = false;
  T.setRhythmSource(async () => { if (fail) throw new Error("record down"); return { ...SOL_RHYTHM, review: "22:00" }; });
  assert.equal((await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev"))!.review, "22:00");
  fail = true;
  assert.equal((await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev", true))!.review, "22:00");   // known: kept
  // the rhythm file cannot be read (not a 404): who must agree is unknown, so a rhythm or agents change is refused
  const repo2 = fresh(), rec2 = fakeRecord();
  const ghDown = async () => { throw ghError("gh: HTTP 502"); };
  J.useProject({ things: () => ({ record: () => rec2.rec }), where: () => ({ record: repo2, code: "sol-mif/sol-dev" }), gh: ghDown, nightFile: night });
  const unsure = await J.startOf("sol-mif/sol-dev");
  assert.equal(unsure.unsure, true);
  assert.match(((await J.propose({ record: () => rec2.rec }, repo2, { patch: { rhythm: { dev: ["bob"] } }, by: "bob", start: unsure })) as { error: string }).error, /who must agree is not known/);
  assert.match(((await J.propose({ record: () => rec2.rec }, repo2, { patch: { agents: { share: "more", pick: false } }, by: "bob", start: unsure })) as { error: string }).error, /who must agree is not known/);
  // a repository with no rhythm file (404) is sure: the defaults, and nobody named
  T.forgetRhythms();
  J.useProject({ things: () => ({ record: () => rec2.rec }), where: () => ({ record: repo2, code: "o/no-file" }), gh, nightFile: night });
  assert.equal((await J.startOf("o/no-file")).unsure, undefined);
  // a repo in no project here: the loader reads the file as before
  J.useProject({ things: () => ({ record: () => rec.rec }), where: () => ({ record: "", code: "" }), gh, nightFile: night });
  assert.deepEqual(await T.rhythmOf({ gh, now: () => new Date() }, "sol-mif/sol-dev", true), { ...SOL_READ, from: ".sol/rhythm.json" });
  J.useProject(null);
});

test("compare-and-swap: a conflict reads again and keeps the other's change; three conflicts say so", async () => {
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  const at = "2026-10-30T12:00:00.000Z";
  // someone writes the onboarding between my read and my put: GitHub says 409, I read again and both are kept
  rec.fail.push("gh: is at abc but expected def (HTTP 409)");
  const op = { propose: { id: "aaaaaaaa", patch: { agents: { share: "more" as const, pick: false } }, was: { agents: { share: "facts" as const, pick: false } }, needs: ["marcocyl04-ux"], poll: "bbbbbbbb", by: "marcocyl04-ux", at } };
  const realPut = rec.rec.files.putBody;
  let once = true;
  rec.rec.files.putBody = async (r: string, p: string, w: any) => { if (once) { once = false; rec.set(J.PROJECT_PATH, JSON.stringify({ v: 1, onboarding: { welcome: "hi from frank" } })); } return realPut(r, p, w); };
  const r = await J.project.change(d, repo, op);
  assert.ok(!("error" in r) && r.changed);
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  assert.equal(f.onboarding?.welcome, "hi from frank");
  assert.equal(f.proposals.length, 1);
  assert.equal(rec.puts.length, 2);
  rec.rec.files.putBody = realPut;
  // three conflicts in a row: said, nothing lost
  rec.fail.push("gh: x (HTTP 409)", "gh: x (HTTP 409)", "gh: x (HTTP 409)");
  const r3 = await J.project.change(d, repo, { propose: { ...op.propose, id: "cccccccc", patch: { owners: { cowork: ["frank"] } }, was: { owners: {} } } });
  assert.deepEqual(r3, { error: "someone else changed it, try again" });
  // a newer Sol's file is never written over
  rec.set(J.PROJECT_PATH, JSON.stringify({ v: 3 }));
  const r4 = await J.project.change(d, repo, { withdraw: { id: "aaaaaaaa", by: "marcocyl04-ux", at } });
  assert.match((r4 as { error: string }).error, /newer Sol/);
});

test("a proposal: the people it names agree in a poll, then it applies, signed; not yet waits; one open a part", async () => {
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  const start = { rhythm: T.parseRhythm(JSON.stringify(SOL_RHYTHM)), night: null };
  // Marco asks to make Isaac the beta reviewer too: Marco (dev), Frank (beta) and Isaac (named now) must agree
  const r = await J.propose(d, repo, { patch: { rhythm: { beta: ["franktsai2008-eng", "w0ngtap"] } }, by: "marcocyl04-ux", why: "Isaac checks beta too", start, at: "2026-10-30T12:00:00.000Z" });
  assert.ok("proposal" in r);
  const p = r.proposal;
  assert.deepEqual(p.needs, ["franktsai2008-eng", "marcocyl04-ux", "w0ngtap"]);
  assert.equal(p.state, "open"); assert.equal(p.by, "marcocyl04-ux"); assert.equal(p.why, "Isaac checks beta too");
  assert.deepEqual(p.was.rhythm!.beta, ["franktsai2008-eng"]);
  assert.deepEqual(p.patch.rhythm!.beta, ["franktsai2008-eng", "w0ngtap"]);
  assert.equal(p.patch.rhythm!.review, "21:00");   // the rest as it was, from the starting file
  let pf = await P.polls.get(d, repo, true);
  const poll = pf.polls.find((x) => x.id === p.poll)!;
  assert.match(poll.question, /^Project settings: rhythm: beta franktsai2008-eng, w0ngtap \([0-9a-f]{8}\)$/);
  assert.deepEqual(poll.options, ["agree", "not yet"]);
  assert.deepEqual(poll.votes, { "marcocyl04-ux": 0 });   // the one who asks agrees
  // a second change to the rhythm waits for this one
  const busy = await J.propose(d, repo, { patch: { rhythm: { review: "22:00" } }, by: "franktsai2008-eng", start });
  assert.match((busy as { error: string }).error, /waiting for agreement already/);
  // nothing that is already so is a proposal
  assert.match(((await J.propose(d, repo, { patch: { agents: { share: "facts", pick: false } }, by: "marcocyl04-ux", start })) as { error: string }).error, /nothing changes/);
  // Frank agrees, Isaac says not yet: it waits
  await P.polls.change(d, repo, { vote: { id: poll.id, option: J.AGREE, by: "franktsai2008-eng" } });
  await P.polls.change(d, repo, { vote: { id: poll.id, option: J.NOT_YET, by: "w0ngtap" } });
  assert.deepEqual(await J.settle(d, repo), []);
  assert.equal(J.parseProject(rec.text(J.PROJECT_PATH)).rhythm, undefined);
  // a vote under another case of the same login that disagrees with the first is no agreement (pure)
  assert.equal(J.verdict({ needs: ["w0ngtap"] }, { ...poll, votes: { w0ngtap: J.NOT_YET, W0ngTap: J.AGREE } }), "waits");
  assert.equal(J.verdict({ needs: ["w0ngtap"] }, { ...poll, votes: { W0ngTap: J.AGREE } }), "passed");
  // Isaac changes his vote: it applies, signed, and its poll closes
  await P.polls.change(d, repo, { vote: { id: poll.id, option: J.AGREE, by: "w0ngtap" } });
  const done = await J.settle(d, repo, "2026-10-30T13:00:00.000Z");
  assert.equal(done.length, 1); assert.equal(done[0].state, "applied");
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  assert.deepEqual(f.rhythm!.beta, ["franktsai2008-eng", "w0ngtap"]);
  assert.equal(f.rhythm!.zone, "America/New_York");
  assert.deepEqual(f.set.rhythm, { by: "marcocyl04-ux", at: "2026-10-30T13:00:00.000Z", proposal: p.id, agreed: ["franktsai2008-eng", "marcocyl04-ux", "w0ngtap"] });
  pf = await P.polls.get(d, repo, true);
  assert.ok(pf.polls.find((x) => x.id === poll.id)!.closed);
  // settled twice is nothing more
  assert.deepEqual(await J.settle(d, repo), []);
  // the page's view: in force, where from, the proposal newest first with its votes
  const v = J.viewOf(f, start, pf.polls, repo, "sol-mif/sol-dev");
  assert.equal(v.from.rhythm, "record");
  assert.equal(v.proposals[0].state, "applied");
  assert.deepEqual(v.proposals[0].votes, { "marcocyl04-ux": "agree", "franktsai2008-eng": "agree", w0ngtap: "agree" });
});

test("a proposal: no one named applies at once; a closed poll refuses; withdraw is the asker's; a moved part is outdated", async () => {
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  // agent rules on a project that names nobody yet: the asker's own agreement is enough
  const a = await J.propose(d, repo, { patch: { agents: { share: "more", pick: true } }, by: "frank", start: {} });
  assert.ok("proposal" in a); assert.equal(a.proposal.state, "applied");
  assert.equal(await J.mayAgentsPick(), false);   // nothing wired: the read's defaults
  J.useProject({ things: () => d, where: () => ({ record: repo, code: "" }) });
  assert.deepEqual(await J.agentRules(), { share: "more", pick: true });
  assert.equal(await J.mayAgentsPick(), true);
  // the hand-in's word (#420, handin.ts) is the record's from now on, its API as it was; the file is not asked
  const H = await import("../src/team/handin.ts");
  const noFile = async () => { throw new Error("the file must not be asked"); };
  assert.equal(await H.agentsMayPick({ gh: noFile, now: () => new Date() }, "o/code", true), true);
  // owners: Frank leads cowork; now the table names Frank, so a change to agent rules needs him
  const o = await J.propose(d, repo, { patch: { owners: { cowork: ["frank"] } }, by: "frank", start: {} });
  assert.ok("proposal" in o); assert.equal(o.proposal.state, "applied");
  assert.deepEqual(await J.owners(), { cowork: ["frank"] });
  const b = await J.propose(d, repo, { patch: { agents: { share: "facts", pick: true } }, by: "marco", start: {} });
  assert.ok("proposal" in b); assert.deepEqual(b.proposal.needs, ["frank"]); assert.equal(b.proposal.state, "open");
  // only the asker withdraws
  assert.match(((await J.withdraw(d, repo, { id: b.proposal.id, by: "frank" })) as { error: string }).error, /only the one who proposed/);
  const w = await J.withdraw(d, repo, { id: b.proposal.id, by: "marco" });
  assert.ok("proposal" in w); assert.equal(w.proposal.state, "withdrawn");
  assert.ok((await P.polls.get(d, repo, true)).polls.find((x) => x.id === b.proposal.poll)!.closed);
  // a poll closed by hand before everyone agreed: refused
  const c = await J.propose(d, repo, { patch: { owners: { cowork: ["frank", "marco"] } }, by: "marco", start: {} });
  assert.ok("proposal" in c);
  await P.polls.change(d, repo, { close: { id: c.proposal.poll, by: "frank", at: "2026-10-30T14:00:00.000Z" } });
  const refused = await J.settle(d, repo);
  assert.equal(refused[0].state, "refused");
  assert.deepEqual(await J.owners(), { cowork: ["frank"] });
  // pure: a part the record changed since the proposal was made is never overwritten
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  const stale: any = { id: "dddddddd", by: "marco", at: "2026-10-30T15:00:00.000Z", patch: { owners: { base: ["marco"] } }, was: { owners: { old: ["x"] } }, needs: ["marco"], poll: "eeeeeeee", state: "open" };
  const out = J.applyProject({ ...f, proposals: [...f.proposals, stale] }, { settle: { polls: [{ id: "eeeeeeee", question: "q", options: ["agree", "not yet"], votes: { marco: 0 }, by: "marco", at: "x" }], at: "2026-10-30T16:00:00.000Z" } });
  assert.equal(out.result!.settled![0].state, "outdated");
  assert.deepEqual(out.file.owners, { cowork: ["frank"] });
  J.useProject(null);
});

test("conversion step 0002: team.json's night moves to night.json beside it, safe twice; settings no longer keep it", () => {
  const root = mkdtempSync(join(DIR, "conv-"));
  const c = { home: join(root, "home"), dotSol: join(root, "home", ".sol"), engine: join(root, "engine") };
  mkdirs(c);
  const team = join(c.engine, "team.json");
  writeFileSync(team, JSON.stringify({ me: { login: "marco", name: "M" }, night: { hour: 22, staleDays: 3 }, speak: { github: true } }, null, 2) + "\n", { mode: 0o600 });
  const r = runConversions(c, STEPS);
  assert.equal(r.ok, true); assert.deepEqual(r.ran.slice(0, 2), ["0001-baseline", "0002-rhythm-from-team-json"]);
  const t = JSON.parse(readFileSync(team, "utf8"));
  assert.equal("night" in t, false); assert.deepEqual(t.speak, { github: true }); assert.equal(t.me.login, "marco");
  assert.equal(statSync(team).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(c.engine, "night.json"), "utf8")), { hour: 22, staleDays: 3, from: "team.json" });
  assert.deepEqual(NF.nightNow(join(c.engine, "night.json")), { hour: 22, staleDays: 3 });
  // the copy before the step holds team.json as it was
  assert.match(readFileSync(join(c.dotSol, "convert-backup", "0002", "files", "0"), "utf8"), /"hour": 22/);
  // the engine stopped before data-version was written: the step runs again and ends the same
  const after1 = { team: readFileSync(team, "utf8"), night: readFileSync(join(c.engine, "night.json"), "utf8") };
  writeFileSync(join(c.dotSol, "data-version"), "1\n");
  assert.equal(runConversions(c, STEPS).ran[0], "0002-rhythm-from-team-json");
  assert.deepEqual({ team: readFileSync(team, "utf8"), night: readFileSync(join(c.engine, "night.json"), "utf8") }, after1);
  // and again at the newest version: nothing runs
  assert.deepEqual(runConversions(c, STEPS).ran, []);
  // a stop between the two writes (night.json written, team.json still with night): the same end
  writeFileSync(team, JSON.stringify({ me: { login: "marco", name: "M" }, night: { hour: 22, staleDays: 3 }, speak: { github: true } }, null, 2) + "\n");
  writeFileSync(join(c.dotSol, "data-version"), "1\n");
  runConversions(c, STEPS);
  assert.deepEqual({ team: readFileSync(team, "utf8"), night: readFileSync(join(c.engine, "night.json"), "utf8") }, after1);
  // fields it does not know (#418's channel, anything newer) are left as they are, in their order
  const cx = { ...c, home: join(root, "hx"), dotSol: join(root, "hx", ".sol"), engine: join(root, "ex") }; mkdirs(cx);
  writeFileSync(join(cx.engine, "team.json"), JSON.stringify({ channel: "dev", me: { login: "marco" }, night: { hour: 2, staleDays: 4 }, future: { a: [1, { b: null }] } }));
  runConversions(cx, STEPS);
  assert.deepEqual(JSON.parse(readFileSync(join(cx.engine, "team.json"), "utf8")), { channel: "dev", me: { login: "marco" }, future: { a: [1, { b: null }] } });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(cx.engine, "team.json"), "utf8"))), ["channel", "me", "future"]);
  // a bad night is the defaults; no night, or no team.json, leaves everything as it was
  const c2 = { ...c, home: join(root, "h2"), dotSol: join(root, "h2", ".sol"), engine: join(root, "e2") }; mkdirs(c2);
  writeFileSync(join(c2.engine, "team.json"), JSON.stringify({ night: { hour: 99 } }));
  runConversions(c2, STEPS);
  assert.deepEqual(NF.readNightFile(join(c2.engine, "night.json")), { hour: 3, staleDays: 7 });
  const c3 = { ...c, home: join(root, "h3"), dotSol: join(root, "h3", ".sol"), engine: join(root, "e3") }; mkdirs(c3);
  writeFileSync(join(c3.engine, "team.json"), '{"speak":{"github":false}}');
  runConversions(c3, STEPS);
  assert.equal(readFileSync(join(c3.engine, "team.json"), "utf8"), '{"speak":{"github":false}}');
  assert.equal(existsSync(join(c3.engine, "night.json")), false);
  const c4 = { ...c, home: join(root, "h4"), dotSol: join(root, "h4", ".sol"), engine: join(root, "e4") }; mkdirs(c4);
  assert.equal(runConversions(c4, STEPS).ok, true);
  assert.equal(existsSync(join(c4.engine, "night.json")), false);
  // settings.ts reads no night any more, and never writes one back
  assert.equal("night" in S.cleanTeam({ night: { hour: 22, staleDays: 3 } }), false);
  // no file: the night job's defaults
  assert.deepEqual(NF.nightNow(join(c4.engine, "night.json"), join(c4.engine, "team.json")), { hour: 3, staleDays: 7 });
  // nothing to move: no copy is taken
  assert.equal(existsSync(join(c3.dotSol, "convert-backup")), false);
  assert.equal(existsSync(join(c4.dotSol, "convert-backup")), false);
  // data-version is the home's, team.json the engine folder's: a home already at 2 meeting a team.json that still holds
  // night (another engine folder, a file put back) is not converted again, and its numbers are read where they are
  const e5 = join(root, "e5"); mkdirSync(e5);
  writeFileSync(join(e5, "team.json"), JSON.stringify({ night: { hour: 23, staleDays: 5 } }));
  assert.deepEqual(runConversions({ ...c, engine: e5 }, STEPS).ran, []);
  assert.deepEqual(NF.nightNow(join(e5, "night.json"), join(e5, "team.json")), { hour: 23, staleDays: 5 });
  // night.json, once there, wins over the left-over
  NF.writeNightFile(join(e5, "night.json"), { hour: 1, staleDays: 2 }, "record");
  assert.deepEqual(NF.nightNow(join(e5, "night.json"), join(e5, "team.json")), { hour: 1, staleDays: 2 });
});

function mkdirs(c: { home: string; engine: string }) { mkdirSync(c.home, { recursive: true }); mkdirSync(c.engine, { recursive: true }); }

test("each night's backup (#478): in the rhythm with the 23:00 handover; naming one in needs that person's agreement", async () => {
  // a rhythm written before #478 reads as no backup and the 23:00 handover; a bad hour is the default
  const old = J.parseProject(JSON.stringify({ v: 1, rhythm: { ...SOL_RHYTHM, night: { hour: 3, staleDays: 7 } } }));
  assert.deepEqual([old.rhythm!.devBackup, old.rhythm!.betaBackup, old.rhythm!.handover], [[], [], "23:00"]);
  assert.equal(J.cleanRhythm({ handover: "25:00" })!.handover, "23:00");
  assert.deepEqual(J.RHYTHM_DEFAULT.devBackup, []);
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  const start = { rhythm: T.parseRhythm(JSON.stringify(SOL_RHYTHM)), night: null };
  // Marco proposes Frank as the dev night's backup and himself as the beta night's: both agree, Frank too
  const r = await J.propose(d, repo, { patch: { rhythm: { devBackup: ["franktsai2008-eng"], betaBackup: ["marcocyl04-ux"] } }, by: "marcocyl04-ux", start, at: "2026-10-30T12:00:00.000Z" });
  assert.ok("proposal" in r);
  assert.equal(r.proposal.state, "open");
  assert.deepEqual(r.proposal.needs, ["franktsai2008-eng", "marcocyl04-ux"]);
  assert.equal(J.summary(r.proposal.patch, r.proposal.was), "rhythm: dev backup franktsai2008-eng, beta backup marcocyl04-ux");
  await P.polls.change(d, repo, { vote: { id: r.proposal.poll, option: J.AGREE, by: "franktsai2008-eng" } });
  assert.equal((await J.settle(d, repo))[0].state, "applied");
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  assert.deepEqual([f.rhythm!.devBackup, f.rhythm!.betaBackup, f.rhythm!.handover], [["franktsai2008-eng"], ["marcocyl04-ux"], "23:00"]);
  // written as version 2 once it names a backup, so a Sol from before #478 refuses to write it rather than drop them
  assert.equal(JSON.parse(rec.text(J.PROJECT_PATH)).v, 2);
  assert.equal(J.versionOf({ rhythm: { ...f.rhythm!, devBackup: [], betaBackup: [] }, proposals: [] }), 1);
  assert.equal(J.versionOf({ rhythm: { ...f.rhythm!, devBackup: [], betaBackup: [], handover: "23:30" }, proposals: [] }), 2);
  // naming a backup out asks them too: Isaac backs up dev, Frank leaves it
  const needs = J.needsFor({ rhythm: { ...f.rhythm!, devBackup: ["w0ngtap"] } }, { rhythm: f.rhythm! }, { rhythm: f.rhythm!, owners: {} }, "marcocyl04-ux");
  assert.deepEqual(needs, ["franktsai2008-eng", "marcocyl04-ux", "w0ngtap"]);
});

test("a rhythm change naming a backup needs a zone, and a handover inside the night (#478)", async () => {
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  const noZone = T.parseRhythm(JSON.stringify({ ...SOL_RHYTHM, zone: "" }));
  const r = await J.propose(d, repo, { patch: { rhythm: { devBackup: ["franktsai2008-eng"] } }, by: "marcocyl04-ux", start: { rhythm: noZone, night: null }, at: "2026-10-30T12:00:00.000Z" });
  assert.match((r as { error: string }).error, /a backup needs the rhythm's zone/);
  const start = { rhythm: T.parseRhythm(JSON.stringify(SOL_RHYTHM)), night: null };
  for (const handover of ["07:00", "20:30", "21:00", "06:00"]) {
    const x = await J.propose(d, repo, { patch: { rhythm: { devBackup: ["franktsai2008-eng"], handover } }, by: "marcocyl04-ux", start, at: "2026-10-30T12:00:00.000Z" });
    assert.match((x as { error: string }).error, /must fall between the review hour \(21:00\) and the end of the night \(06:00\)/, handover);
  }
  assert.equal(J.rhythmRefusal({ ...J.RHYTHM_DEFAULT, zone: "America/New_York", devBackup: ["a"], handover: "00:30" }), "");   // past midnight is still the night
  assert.equal(J.rhythmRefusal({ ...J.RHYTHM_DEFAULT, handover: "07:00" }), "");                                             // no backup: nothing to refuse
  assert.equal(rec.puts.length, 0);
});
