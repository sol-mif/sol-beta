// Team blocks (#429): Cowork's tiles, actions and tools as one registry (team/blocks.ts), Sol's own read from the face's
// blocks.json, live in a project by the `blocks` part of `.sol/project.json`, changed only by a proposal the team
// agrees to in the project's polls (#428). A new kind needs no change to the core; an agent's proposal waits for its
// own person; a block that is off refuses its agent tools. A fake record; every file in a temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-blocks-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const B = await import("../src/team/blocks.ts");
await import("../src/team/tables.ts");   // the table kind (#434), as wire.ts loads it
const J = await import("../src/team/project.ts");
const P = await import("../src/team/polls.ts");
const T = await import("../src/team/tonight.ts");
await import("../src/team/pages.ts");   // the `page` kind (#433), defined as the engine defines it, before the file is read
await import("../src/team/templates.ts");   // and the `template` kind (#435)

const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  let n = 0;
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { content: string }) => { on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++n}` }); return ""; },
  } } as any;
  return { rec, text: (p: string) => on.get(p)?.text };
}
let n = 0;
const fresh = () => { J.project.forget(); P.polls.forget(); T.forgetRhythms(); return `o/blocks-${++n}`; };
const SOL_RHYTHM = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"] };

test("Sol's own blocks: the face's blocks.json, read whole; the tiles, the action and the four tools as they were", () => {
  B.setShipped(null);
  const own = B.shipped();
  assert.deepEqual(own.map((b) => `${b.kind}:${b.id}`), ["tool:calendar", "tool:decisions", "tool:polls", "tool:settings", "tool:folds", "tool:analytics", "tool:features", "tool:live", "page:pages", "template:templates", "table:tables", "tile:whos-on", "tile:eyes", "tile:leads", "action:copy-link"]);
  // every one Sol shipped before blocks existed starts on, so a project nobody changed looks as it did
  // (this week's folds and analytics, team tools of #436/#437, the Features page, #480, live, #485, pages, #433, templates, #435, and tables, #434, came after: they start off and a project turns them on)
  const later = (id: string) => ["folds", "analytics", "features", "live", "pages", "templates", "tables"].includes(id);
  assert.ok(own.every((b) => b.start === (later(b.id) ? "off" : "on")));
  assert.deepEqual(own.find((b) => b.id === "calendar")!.agents, ["room_calendar", "room_event_add"]);
  assert.equal(own.find((b) => b.id === "settings")!.fixed, true);
  // the file is the face's: the same text the face imports
  const raw = JSON.parse(readFileSync(B.BLOCKS_FILE, "utf8"));
  assert.equal(raw.blocks.length, own.length);
  // a project with no word: all live but folds, pages and tables; tools all allowed but theirs
  const v = B.blocksIn({}, own);
  assert.ok(v.every((b) => b.live === !later(b.id) && b.from === "code" && b.known));
  assert.equal(B.toolRefusal("room_calendar", v), null);
  assert.equal(B.toolRefusal("room_things", v), null);   // no block gives it
});

test("blocks.json read with care: a bad entry, an unknown kind, a second of an id left out; an unreadable file is none", () => {
  const own = B.parseShipped(JSON.stringify({ blocks: [
    { id: "a", kind: "tile", name: "A", start: "on" }, { id: "a", kind: "tile", name: "again" }, { id: "Bad Id", kind: "tile", name: "x" },
    { id: "b", kind: "nope", name: "B" }, { id: "c", kind: "action", name: "C", agents: ["room_x", "Not A Tool", "room_x"] },
  ] }));
  assert.deepEqual(own.map((b) => b.id), ["a", "c"]);
  assert.equal(own[0].name, "A");
  assert.deepEqual(own[1].agents, ["room_x"]);
  assert.equal(own[1].start, "off");   // no word: off, so a new block waits for a project to turn it on
  assert.deepEqual(B.parseShipped("not json"), []);
  // with none read, no tool is refused
  assert.equal(B.toolRefusal("room_calendar", B.blocksIn({}, [])), null);
});

test("live: the project's word over the start; a fixed block always; an off block refuses its tools", () => {
  const own = B.parseShipped(readFileSync(B.BLOCKS_FILE, "utf8"));
  const v = B.blocksIn({ calendar: { on: false }, settings: { on: false }, newer: { on: true } }, own);
  assert.equal(v.find((b) => b.id === "calendar")!.live, false);
  assert.equal(v.find((b) => b.id === "settings")!.live, true);   // fixed
  assert.ok(!v.some((b) => b.id === "newer"));                     // a word on a block that is not there is nothing
  assert.match(B.toolRefusal("room_event_add", v)!, /^the calendar is not on in this project/);
  assert.equal(B.toolRefusal("room_polls", v), null);
  assert.deepEqual(B.liveIds(v).includes("calendar"), false);
  // a team's own block cannot claim a tool Sol's own give, past them
  B.defineKind({ kind: "test-page", where: "a test", declarable: true });
  const claim = B.blocksIn({ calendar: { on: false }, mine: { on: true, block: { id: "mine", kind: "test-page", name: "mine", shows: "", does: [], agents: ["room_event_add"], start: "off" } } }, own);
  assert.ok(B.toolRefusal("room_event_add", claim));
});

test("a new kind needs no change to the core: defined in a file of its own, declared by a team, kept by an older Sol", () => {
  const own = B.parseShipped(readFileSync(B.BLOCKS_FILE, "utf8"));
  // a code kind (tile) cannot be declared in a record
  assert.match((B.mergeBlocks({}, { mine: { on: true, block: { kind: "tile", name: "mine" } } }, own) as { error: string }).error, /needs code/);
  // a kind this Sol does not know: refused to propose, kept as written when read, never live here
  assert.match((B.mergeBlocks({}, { road: { on: true, block: { kind: "roadmap", name: "the roadmap" } } }, own) as { error: string }).error, /does not know blocks of kind roadmap/);
  const kept = B.cleanBlocksPart({ road: { on: true, block: { kind: "roadmap", name: "the roadmap", with: { file: ".sol/pages/road.md" } } } })!;
  assert.deepEqual(kept.road.block!.with, { file: ".sol/pages/road.md" });
  const view = B.blocksIn(kept, own).find((b) => b.id === "road")!;
  assert.equal(view.known, false); assert.equal(view.live, false); assert.equal(view.from, "record");
  // round 4's way: one defineKind; its fields cleaned by the kind, a bad one refusing the block
  B.defineKind({ kind: "roadmap", where: "a page in the project's centre", declarable: true,
    clean: (w) => (typeof w.file === "string" && w.file.startsWith(".sol/pages/") ? { file: w.file } : null) });
  assert.match((B.mergeBlocks({}, { road: { on: true, block: { kind: "roadmap", name: "the roadmap", with: { file: "/etc/passwd" } } } }, own) as { error: string }).error, /no block called road/);
  const m = B.mergeBlocks({}, { road: { on: true, block: { kind: "roadmap", name: "the roadmap", fixed: true, start: "on", with: { file: ".sol/pages/road.md", extra: 1 } } } }, own);
  assert.ok("part" in m);
  assert.deepEqual(m.part.road.block!.with, { file: ".sol/pages/road.md" });
  assert.equal(m.part.road.block!.fixed, undefined);   // only Sol's own are fixed
  const live = B.blocksIn(m.part, own).find((b) => b.id === "road")!;
  assert.equal(live.known, true); assert.equal(live.live, true);
  // Sol's own: off, not taken away; fixed, never off; one it does not have, no block
  assert.match((B.mergeBlocks({}, { calendar: null }, own) as { error: string }).error, /turned off, not taken away/);
  assert.match((B.mergeBlocks({}, { settings: { on: false } }, own) as { error: string }).error, /always on/);
  assert.match((B.mergeBlocks({}, { ghost: { on: true } }, own) as { error: string }).error, /no block called ghost/);
  // a team's own taken off with null; the others stay
  const off = B.mergeBlocks({ ...m.part, calendar: { on: false } }, { road: null }, own);
  assert.deepEqual("part" in off && off.part, { calendar: { on: false } });
  assert.equal(B.blocksSummary({ calendar: { on: false } }, {}, own), "the calendar off");
  assert.equal(B.blocksSummary(m.part, {}, own), "the roadmap (roadmap) added");
});

test("a block turned off by agreement: the team agrees in the poll, then it is off, signed, and kept in project.json", async () => {
  B.setShipped(null);
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  const start = { rhythm: T.parseRhythm(JSON.stringify(SOL_RHYTHM)), night: null };
  const r = await J.propose(d, repo, { patch: { blocks: { eyes: { on: false } } }, by: "marcocyl04-ux", why: "we review in the night session", start, at: "2026-10-30T12:00:00.000Z" });
  assert.ok("proposal" in r);
  const p = r.proposal;
  assert.deepEqual(p.needs, ["franktsai2008-eng", "marcocyl04-ux"]);   // the team the settings name
  assert.equal(p.state, "open");
  assert.deepEqual(p.patch.blocks, { eyes: { on: false } });
  assert.deepEqual(p.was.blocks, {});
  const pf = await P.polls.get(d, repo, true);
  const poll = pf.polls.find((x) => x.id === p.poll)!;
  assert.match(poll.question, /^Project settings: blocks: eyes wanted off \([0-9a-f]{8}\)$/);
  // still on until Frank agrees; a second blocks change waits for this one
  assert.equal(J.blockViewsIn(J.parseProject(rec.text(J.PROJECT_PATH))).find((b) => b.id === "eyes")!.live, true);
  assert.match(((await J.propose(d, repo, { patch: { blocks: { leads: { on: false } } }, by: "franktsai2008-eng", start })) as { error: string }).error, /blocks is waiting/);
  await P.polls.change(d, repo, { vote: { id: poll.id, option: J.AGREE, by: "franktsai2008-eng" } });
  const done = await J.settle(d, repo, "2026-10-30T13:00:00.000Z");
  assert.equal(done[0].state, "applied");
  const f = J.parseProject(rec.text(J.PROJECT_PATH));
  assert.deepEqual(f.blocks, { eyes: { on: false } });
  assert.equal(f.set.blocks!.by, "marcocyl04-ux");
  const v = J.viewOf(f, start, (await P.polls.get(d, repo, true)).polls, repo, "sol-mif/sol-dev");
  assert.equal(v.from.blocks, "record");
  assert.equal(v.blocks.find((b) => b.id === "eyes")!.live, false);
  assert.equal(v.blocks.find((b) => b.id === "whos-on")!.live, true);
  // the next change is laid over it: eyes stays off while leads goes off
  const r2 = await J.propose(d, repo, { patch: { blocks: { leads: { on: false } } }, by: "marcocyl04-ux", start });
  assert.deepEqual((r2 as { proposal: { patch: unknown } }).proposal.patch, { blocks: { eyes: { on: false }, leads: { on: false } } });
  // what is already so is no change; settings can never go off
  assert.match(((await J.propose({ record: () => fakeRecord().rec }, fresh(), { patch: { blocks: { eyes: { on: true } } }, by: "marcocyl04-ux", start })) as { error: string }).error, /nothing changes/);
  assert.match(((await J.propose(d, repo, { patch: { blocks: { settings: { on: false } } }, by: "marcocyl04-ux", start })) as { error: string }).error, /always on/);
  // the file as written reads back the same
  assert.equal(J.serializeProject(J.parseProject(J.serializeProject(f))), J.serializeProject(f));
});

test("an agent's proposal: signed as the agent, never agreed for its person, live only once they and the team agree", async () => {
  const repo = fresh(), rec = fakeRecord();
  const d = { record: () => rec.rec };
  // a project that names nobody: a person's own proposal applies at once, an agent's waits for its person
  const r = await J.propose(d, repo, { patch: { blocks: { calendar: { on: false } } }, by: "w0ngtap", start: {}, agent: true, at: "2026-10-30T12:00:00.000Z" });
  assert.ok("proposal" in r);
  assert.equal(r.proposal.state, "open"); assert.equal(r.proposal.agent, true);
  assert.deepEqual(r.proposal.needs, ["w0ngtap"]);
  const pf = await P.polls.get(d, repo, true);
  const poll = pf.polls.find((x) => x.id === r.proposal.poll)!;
  assert.equal(poll.agent, true);
  assert.deepEqual(poll.votes, {});   // the agent never votes
  assert.equal(J.parseProject(rec.text(J.PROJECT_PATH)).proposals[0].agent, true);   // kept as written
  await P.polls.change(d, repo, { vote: { id: poll.id, option: J.AGREE, by: "w0ngtap" } });
  assert.equal((await J.settle(d, repo))[0].state, "applied");
  const views = J.blockViewsIn(J.parseProject(rec.text(J.PROJECT_PATH)));
  assert.match(B.toolRefusal("room_calendar", views)!, /not on in this project/);
  assert.match(B.blocksText(views), /- calendar \(tool\): off · the calendar/);
  // a person's own on a project that names nobody: at once
  const mine = await J.propose(d, repo, { patch: { blocks: { calendar: { on: true } } }, by: "w0ngtap", start: {} });
  assert.equal((mine as { proposal: { state: string } }).proposal.state, "applied");
});

test("the agent tools: room_blocks and room_block_propose offered; a block's tool refused while it is off", async () => {
  const W = await import("../src/work/tools.ts");
  const names = W.WORK_TOOLS.map((t) => t.name) as string[];
  assert.ok(names.includes("room_blocks") && names.includes("room_block_propose"));
  // every agent tool a block names is one Sol has
  for (const b of B.shipped()) for (const t of b.agents) assert.ok(names.includes(t), `${b.id} gives ${t}`);
  const views = B.blocksIn({ calendar: { on: false } });
  const asked: string[] = [];
  W.setWorkHooks({
    blockGate: async (tool: string) => B.toolRefusal(tool, views),
    calendar: async () => { asked.push("calendar"); return "the calendar"; },
    polls: async () => { asked.push("polls"); return "the polls"; },
    blockPropose: async (_f: string, id: string, on: boolean, why: string) => `proposed ${id} ${on} ${why}`,
  } as any);
  const off = await W.runWorkTool("room_calendar", {}, "s1");
  assert.equal(off.isError, true);
  assert.match(off.content[0].text, /the calendar is not on in this project/);
  assert.equal((await W.runWorkTool("room_polls", {}, "s1")).content[0].text, "the polls");
  assert.deepEqual(asked, ["polls"]);
  assert.equal((await W.runWorkTool("room_block_propose", { id: "calendar", on: true, why: "we plan" }, "s1")).content[0].text, "proposed calendar true we plan");
  // hooks without the gate (an older wiring) refuse nothing
  W.setWorkHooks({ calendar: async () => "the calendar" } as any);
  assert.equal((await W.runWorkTool("room_calendar", {}, "s1")).content[0].text, "the calendar");
});
