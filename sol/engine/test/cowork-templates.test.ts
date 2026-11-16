// Templates, and agents as members (#435, D3 of #413; team/templates.ts, team/agents.ts). Templates are pages in their own
// folder of the record, `.sol/templates/<id>.md`: a page saved as one, a page made from one with its blanks filled, a
// template taken out, a table's template in the folder never read as a page's. Agents: each member's agent on the roster
// as `<login>'s agent`, the members check (a list read, none to read, a read that failed), and an agent never votes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-templates-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const P = await import("../src/team/pages.ts");
const T = await import("../src/team/templates.ts");
const A = await import("../src/team/agents.ts");
const B = await import("../src/team/blocks.ts");
const PL = await import("../src/team/polls.ts");

const at = "2026-10-30T15:00:00.000Z";
const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  const puts: { path: string; message: string }[] = [];
  const removed: { path: string; message: string }[] = [];
  let n = 0;
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { message: string; content: string; sha?: string }) => {
      const f = on.get(path);
      if (f && w.sha !== f.sha) throw ghError(w.sha ? "gh: is at x but expected y (HTTP 409)" : "gh: Invalid request. \"sha\" wasn't supplied. (HTTP 422)");
      puts.push({ path, message: w.message });
      on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++n}` });
      return "";
    },
    remove: async (_r: string, path: string, w: { sha: string; message: string }) => { const f = on.get(path); if (!f || f.sha !== w.sha) throw ghError("gh: sha does not match (HTTP 409)"); on.delete(path); removed.push({ path, message: w.message }); return ""; },
    list: async (_r: string, dir: string) => {
      const here = [...on.entries()].filter(([p]) => p.startsWith(dir + "/"));
      if (!here.length) throw ghError("gh: Not Found (HTTP 404)");
      return JSON.stringify(here.map(([p, f]) => ({ name: p.slice(dir.length + 1), path: p, sha: f.sha, size: f.text.length, type: "file" })));
    },
  } } as any;
  return { d: { record: () => rec }, on, puts, removed, set: (p: string, t: string) => on.set(p, { text: t, sha: `x${++n}` }) };
}
let k = 0;
const fresh = () => { P.pages.forget(); T.templates.forget(); return `o/templates-${++k}`; };

test("a template's blanks: {{date}} the day in the project's zone, {{me}} who made it, {{title}} the page's; others stay", () => {
  assert.equal(T.dayIn("2026-10-31T02:30:00.000Z", "America/New_York"), "2026-10-30");
  assert.equal(T.dayIn("2026-10-31T02:30:00.000Z", "UTC"), "2026-10-31");
  assert.equal(T.dayIn("not a time"), "");
  const body = "# {{title}}\n\n{{ date }} · notes by {{me}} · {{Today}} · {{owner}}\n";
  assert.equal(T.fillTemplate(body, { day: "2026-10-30", me: "frank's agent", title: "standup" }), "# standup\n\n2026-10-30 · notes by frank's agent · 2026-10-30 · {{owner}}\n");
  assert.equal(T.titleFrom("  my notes\n", "standup", "2026-10-30"), "my notes");
  assert.equal(T.titleFrom(undefined, "standup", "2026-10-30"), "standup 2026-10-30");
});

test("a page saved as a template is a file of its own in .sol/templates, signed, and the pages list never shows it", async () => {
  const repo = fresh(), r = fakeRecord();
  const made = await P.pages.change(r.d, repo, { make: { title: "Standup", body: "# {{date}}\n\n- [ ] what I did\n- [ ] what is next\n" } }, { by: "isaac", at });
  assert.ok("page" in made);
  const saved = await T.saveAsTemplate(r.d, repo, { page: "standup", title: "Daily standup", who: { by: "frank", at } });
  assert.ok("page" in saved, JSON.stringify(saved));
  assert.equal(saved.page.id, "daily-standup");
  const text = r.on.get(".sol/templates/daily-standup.md")!.text;
  assert.match(text, /^---\nsol: page 1\ntitle: "Daily standup"\nmade: frank\nby: frank\n/);
  assert.match(text, /- \[ \] what I did/);
  assert.match(r.puts.at(-1)!.message, /^templates: made Daily standup \(by frank\)$/);
  assert.deepEqual((await T.templates.list(r.d, repo, true)).map((t) => t.id), ["daily-standup"]);
  assert.deepEqual((await P.pages.list(r.d, repo, true)).map((p) => p.id), ["standup"]);
  // a page that is not there, said
  assert.match((await T.saveAsTemplate(r.d, repo, { page: "nope", who: { by: "frank", at } }) as { error: string }).error, /no such page/);
});

test("make from template: a new page with the blanks filled, signed by the agent; its id from its title; the template unchanged", async () => {
  const repo = fresh(), r = fakeRecord();
  r.set(".sol/templates/meeting.md", "---\nsol: page 1\ntitle: \"Meeting\"\nmade: frank\nby: frank\nat: 2026-10-29T10:00:00.000Z\nparts: 1\n---\n# {{title}}\n\n{{date}}, taken by {{me}}\n");
  const tpl = r.on.get(".sol/templates/meeting.md")!.text;
  const out = await T.agentFromTemplate(r.d, { repo, may: true, login: "frank", template: "meeting", at: "2026-10-31T02:30:00.000Z", zone: "America/New_York", members: "" });
  assert.match(out, /made the page Meeting 2026-10-30 \(meeting-2026-10-30\) from the template meeting, signed as frank's agent/);
  const page = r.on.get(".sol/pages/meeting-2026-10-30.md")!.text;
  assert.match(page, /\nby: frank\nagent: true\n/);
  assert.match(page, /# Meeting 2026-10-30\n\n2026-10-30, taken by frank's agent\n$/);
  assert.match(r.puts.at(-1)!.message, /^pages: made Meeting 2026-10-30 \(— frank's agent\)$/);
  assert.equal(r.on.get(".sol/templates/meeting.md")!.text, tpl);
  // a person's, with a title of their own
  const mine = await T.pageFromTemplate(r.d, repo, { template: "meeting", title: "Kickoff", who: { by: "isaac", at } });
  assert.ok("page" in mine);
  assert.equal(mine.page.id, "kickoff");
  assert.match(mine.page.body, /taken by isaac\n$/);
  // no such template; a newer Sol's refused
  assert.match((await T.pageFromTemplate(r.d, repo, { template: "nope", who: { by: "isaac", at } }) as { error: string }).error, /no template nope here/);
  r.set(".sol/templates/later.md", "---\nsol: page 9\ntitle: \"Later\"\nparts: 1\n---\nwords\n");
  assert.match((await T.pageFromTemplate(r.d, repo, { template: "later", who: { by: "isaac", at } }) as { error: string }).error, /newer Sol/);
});

test("an agent's template moves are refused where it may not write, and where its person is not a member", async () => {
  const repo = fresh(), r = fakeRecord();
  r.set(".sol/pages/plan.md", "---\nsol: page 1\ntitle: \"Plan\"\nparts: 1\n---\nwords\n");
  assert.match(await T.agentTemplateSave(r.d, { repo, may: false, login: "frank", page: "plan", members: "" }), /^not saved: my agent may not speak on GitHub/);
  assert.match(await T.agentTemplateSave(r.d, { repo, may: true, login: "frank", page: "plan", members: "frank's agent may save a template only as a member's agent" }), /^not saved: frank's agent may save/);
  assert.equal(r.on.has(".sol/templates/plan.md"), false);
  assert.match(await T.agentTemplateSave(r.d, { repo, may: true, login: "frank", page: "plan", members: "" }), /saved the page plan as the template Plan \(plan\), signed as frank's agent/);
  assert.match(r.on.get(".sol/templates/plan.md")!.text, /\nby: frank\nagent: true\n/);
});

test("a template taken out: its head by compare-and-swap, signed; a table's template in the folder is never read as a page's", async () => {
  const repo = fresh(), r = fakeRecord();
  r.set(".sol/templates/old.md", "---\nsol: page 1\ntitle: \"Old\"\nparts: 1\n---\nwords\n");
  r.set(".sol/templates/sprint.json", JSON.stringify({ v: 1, kind: "table", rows: [] }));
  assert.deepEqual((await T.templates.list(r.d, repo, true)).map((t) => t.id), ["old"]);
  const out = await T.templates.remove(r.d, repo, "old", { by: "isaac" });
  assert.deepEqual(out, { removed: "old" });
  assert.equal(r.on.has(".sol/templates/old.md"), false);
  assert.equal(r.on.has(".sol/templates/sprint.json"), true);
  assert.match(r.removed[0].message, /^templates: took out Old \(by isaac\)$/);
  assert.deepEqual(await T.templates.remove(r.d, repo, "old", { by: "isaac" }), { error: "it is not there any more" });
  // the kinds of template: a page now; a table adds its own (#434)
  assert.deepEqual(T.templateKinds().map((x) => [x.kind, x.ext]), [["page", "md"]]);
});

test("the templates block: a kind of its own, Sol's block off until the project turns it on, its three agent tools refused till then", () => {
  assert.ok(B.kindOf("template"));
  B.setShipped(null);
  const own = B.shipped().find((b) => b.id === T.TEMPLATES_BLOCK)!;
  assert.equal(own.kind, "template");
  assert.equal(own.start, "off");
  assert.deepEqual(own.agents, ["room_templates", "room_page_from_template", "room_template_save"]);
  assert.match(B.toolRefusal("room_page_from_template", B.blocksIn({}))!, /templates is not on in this project/);
  assert.equal(B.toolRefusal("room_page_from_template", B.blocksIn({ templates: { on: true } })), null);
  assert.match(T.templatesText([], "o/r"), /no templates yet/);
  assert.match(T.templatesText([{ id: "standup", title: "Standup", made: "a", by: "frank", agent: true, at, size: 3 }], "o/r"), /- standup · Standup · last by frank's agent · 2026-10-30/);
});

test("agents on the roster: each member's, beside its human, working when its human's session is; none for a guest", () => {
  const roster = [
    { who: "frank", agent: false, state: "working", session: { title: "the goal page" }, since: 5 },
    { who: "isaac", agent: false, state: "here", since: 3 },
    { who: "guest", agent: false, state: "here", since: 1 },
  ];
  const a = A.agentsOf(["frank", "isaac", "marcocyl04-ux"], roster, "marcocyl04-ux");
  assert.deepEqual(a.map((x) => x.name), ["marcocyl04-ux's agent", "frank's agent", "isaac's agent"]);
  assert.deepEqual(a[1], { name: "frank's agent", of: "frank", working: true, session: "the goal page", since: 5 });
  assert.equal(a[2].working, false);
  // no members list (no org, no cloud group): the people seen, me first
  assert.deepEqual(A.agentsOf([], roster, "me").map((x) => x.of), ["me", "frank", "isaac", "guest"]);
  assert.equal(A.agentOfName("frank's agent"), "frank");
  assert.equal(A.agentOfName("frank"), "");
  assert.equal(A.signed("frank", true), "frank's agent");
  assert.equal(A.signed("frank"), "frank");
});

test("the members check: a member's agent in, someone else's out, a failed read shut, a project with no list left to its record", () => {
  const list = { source: true as const, list: ["Frank", "isaac"] };
  assert.deepEqual(A.memberGate({ login: "frank", agent: true }, list), { ok: true });
  const out = A.memberGate({ login: "mallory", agent: true }, list, "write a page");
  assert.equal((out as { gate: string }).gate, "members");
  assert.match((out as { error: string }).error, /mallory's agent may write a page only as a member's agent, and mallory is not one/);
  const shut = A.memberGate({ login: "frank", agent: true }, { source: true, list: null });
  assert.equal((shut as { gate: string }).gate, "unknown");
  assert.equal((A.memberGate({ login: "frank" }, { source: true, list: [] }) as { gate: string }).gate, "unknown");
  assert.deepEqual(A.memberGate({ login: "anyone", agent: true }, { source: false }), { ok: true });
  assert.match((A.memberGate({ login: "mallory" }, list) as { error: string }).error, /^mallory is not one of this project's members$/);
});

test("the members read wired: strict, a throw is a shut list; nothing wired, no list", async () => {
  A.useMembersRead(null);
  assert.deepEqual(await A.membersNow(), { source: false });
  let asked: boolean | null = null;
  A.useMembersRead(async (strict) => { asked = strict; return { source: true, list: ["frank"] }; });
  assert.equal(await A.memberRefusal({ login: "frank", agent: true }), "");
  assert.equal(asked, true);
  assert.match(await A.memberRefusal({ login: "isaac", agent: true }, "make a page"), /isaac's agent may make a page only as a member's agent/);
  A.useMembersRead(async () => { throw new Error("gh: 502"); });
  assert.match(await A.memberRefusal({ login: "frank", agent: true }), /could not tell who this project's members are/);
  A.useMembersRead(null);
});

test("an agent never votes: a settings agreement waits for its person", () => {
  const f = { v: 1 as const, polls: [{ id: "p1", question: "turn templates on?", options: ["agree", "not yet"], votes: {}, by: "frank", at, agent: true as const }] };
  const r = PL.applyPolls(f, { vote: { id: "p1", option: 0, by: "frank", agent: true } });
  assert.equal(r.changed, false);
  assert.match(r.error!, /frank's agent may not vote: only people agree/);
  const ok = PL.applyPolls(f, { vote: { id: "p1", option: 0, by: "frank" } });
  assert.equal(ok.changed, true);
  assert.equal(A.humanOnly({ login: "frank" }, "vote"), null);
});
