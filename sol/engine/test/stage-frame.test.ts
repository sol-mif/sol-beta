// The frame first (#822; work/blocks.ts, work/tools.ts): with the engine's switch stage.whole on, the agent's compose with
// no body opens its frame at once, working, and it stays working as long as the work (update's more), not 400 ms; the
// making line's fields (file, command, machine) ride on the block while it works and go when it settles; the agent gets
// reopen. With the switch off, all of it is today's: a compose with no body is live, and the tools read as they do. All
// in a home and a settings file of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "sol-frame-"));
const HOME = join(TMP, "home"), REPO = join(TMP, "repo");
mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(TMP, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SETTINGS = join(TMP, "settings.json");
delete process.env.SOL_STAGE_WHOLE;

const S = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");
const settings = await import("../src/settings.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
S.setStageFinder(async (id) => ({ cwd: REPO, by: `agent · ${id.slice(5, 9)}` }));
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: `agent · ${sessionId.slice(5, 9)}`, cwd: REPO });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const onDisk = (id: string) => JSON.parse(readFileSync(join(HOME, project, "blocks", id, "block.json"), "utf8"));
// the switch is read each time; the tools that come and go with it hear it the way Cowork v3's do (noteStageWhole)
const whole = (v?: string) => { if (v === undefined) delete process.env.SOL_STAGE_WHOLE; else process.env.SOL_STAGE_WHOLE = v; settings.noteStageWhole(); };
const tool = (n: string) => tools.WORK_TOOLS.find((t) => t.name === n) as { description: string; shape: Record<string, unknown> } | undefined;
after(() => { S.disarmAll(); S.setStageBus(null); whole(undefined); rmSync(TMP, { recursive: true, force: true }); });

test("on: a compose with no body is the frame, working, and still working 600 ms later; more keeps it so; the last update settles it", async () => {
  const A = "sess-fram0001";
  whole("on");
  try {
    S.asked(A, "make a page of the plan", [{ kind: "page" }]);   // asked by name: not a ghost
    const b = S.compose(who(A), { kind: "page", title: "the plan" });
    assert.equal(b.state, "working", "the frame is up before the first word");
    assert.equal(S.bodyOf(project, b.id)?.text, "", "and empty");
    assert.equal(S.getStage(project, A).blocks.find((p) => p.id === b.id)?.ghost, undefined);
    await wait(600);
    assert.equal(S.getBlock(project, b.id)!.state, "working", "working lasts as long as the work, not 400 ms");
    assert.equal(S.update(who(A), { id: b.id, body: "<h1>The plan</h1>", more: true }).state, "working");
    await wait(S.SETTLE_MS + 100);
    assert.equal(S.getBlock(project, b.id)!.state, "working", "more: true starts no settle");
    assert.equal(S.update(who(A), { id: b.id, body: "<h1>The plan</h1><p>all of it</p>" }).state, "working");
    await wait(S.SETTLE_MS + 60);
    assert.equal(S.getBlock(project, b.id)!.state, "live", "the last update settles after SETTLE_MS, as today");
    assert.deepEqual(S.ledger(project, b.id).map((l) => l.ev), ["composed", "ran", "ran"]);
  } finally { whole(undefined); }
});

test("on: a settle already under way does not end a work that goes on (more after a last update)", async () => {
  const A = "sess-fram0002";
  whole("on");
  try {
    S.asked(A, "make a page", [{ kind: "page" }]);
    const b = S.compose(who(A), { kind: "page", title: "draft" });
    S.update(who(A), { id: b.id, body: "<p>one</p>" });
    S.update(who(A), { id: b.id, body: "<p>one, two</p>", more: true });
    await wait(S.SETTLE_MS + 60);
    assert.equal(S.getBlock(project, b.id)!.state, "working", "the earlier settle stands aside");
    S.update(who(A), { id: b.id, body: "<p>one, two, three</p>" });
    await wait(S.SETTLE_MS + 60);
    assert.equal(S.getBlock(project, b.id)!.state, "live");
  } finally { whole(undefined); }
});

test("on: making rides on the block while it works, is told to the face, and is gone once it settles", async () => {
  const A = "sess-fram0003";
  whole("on");
  try {
    S.asked(A, "show me a page", [{ kind: "page" }]);
    heard.length = 0;
    const b = S.compose(who(A), { kind: "page", title: "site", making: { file: "site/index.html", machine: "this Mac" } });
    assert.deepEqual(b.making, { file: "site/index.html", machine: "this Mac" });
    assert.deepEqual(onDisk(b.id).making, { file: "site/index.html", machine: "this Mac" }, "kept on block.json while it works");
    assert.ok(heard.some((m) => m.block?.id === b.id && m.block.making?.file === "site/index.html"), "it travels with the block");
    const u = S.update(who(A), { id: b.id, body: "<p>half</p>", more: true, making: { command: "npm run build", machine: "the NucBox", junk: 1 } as any });
    assert.deepEqual(u.making, { command: "npm run build", machine: "the NucBox" }, "a new making replaces the old; only its three fields");
    S.place(who(A), { id: b.id, making: { file: "site/about.html" } });
    assert.deepEqual(onDisk(b.id).making, { file: "site/about.html" }, "place carries it too");
    S.update(who(A), { id: b.id, body: "<p>whole</p>" });
    assert.ok(onDisk(b.id).making, "still there while it settles");
    await wait(S.SETTLE_MS + 60);
    const now = onDisk(b.id);
    assert.equal(now.state, "live");
    assert.equal("making" in now, false, "dropped when it settles");
    assert.ok(heard.some((m) => m.block?.id === b.id && m.block.state === "live" && !("making" in m.block)));
    // a block that is not working takes no making: there is nothing being made
    S.place(who(A), { id: b.id, making: { file: "x" } });
    assert.equal("making" in onDisk(b.id), false);
    const c = S.compose(who(A), { kind: "card", title: "done", body: "already whole", making: { file: "y" } });
    assert.equal(c.state, "live");
    assert.equal("making" in onDisk(c.id), false, "a compose with its body is live at once, so no making");
  } finally { whole(undefined); }
});

test("on: a ghost stays a ghost (live, dashed) when composed without a body; its first body makes it solid", () => {
  const A = "sess-fram0004";
  whole("on");
  try {
    S.asked(A, "what do you think", []);
    const g = S.compose(who(A), { kind: "page", title: "an offer" });
    assert.equal(g.state, "live", "the ghost rule is left alone");
    assert.equal(S.getStage(project, A).blocks.find((p) => p.id === g.id)?.ghost, true);
    S.update(who(A), { id: g.id, body: "<p>x</p>", more: true });
    assert.equal(S.getStage(project, A).blocks.find((p) => p.id === g.id)?.ghost, undefined);
    assert.equal(S.getBlock(project, g.id)!.state, "working");
    // the person's own compose (the face's) is never a frame left open
    const p = S.compose(who(A), { kind: "card", title: "mine", person: true });
    assert.equal(p.state, "live");
    // nor is a bound one: its source fills it
    writeFileSync(join(TMP, "notes.md"), "# notes");
    S.asked(A, "show me a page of the notes", [{ kind: "page" }]);
    const bound = S.compose(who(A), { kind: "page", title: "notes", bind: { source: join(TMP, "notes.md"), watch: false } });
    assert.equal(bound.state, "live");
    assert.equal(S.getBlock(project, bound.id)!.state, "live");
  } finally { whole(undefined); }
});

test("on: the agent's tools offer the frame first, more, making and reopen; reopen brings a closed block back", async () => {
  const A = "sess-fram0005";
  whole("on");
  try {
    assert.match(tool("compose")!.description, /no body/);
    assert.ok("making" in tool("compose")!.shape);
    assert.ok("more" in tool("update")!.shape && "making" in tool("update")!.shape);
    assert.ok("making" in tool("place")!.shape);
    assert.ok(tool("reopen"), "reopen is one of the agent's tools");
    S.asked(A, "make a page", [{ kind: "page" }]);
    const r = await tools.runWorkTool("compose", { kind: "page", title: "the page", making: { file: "a.html", machine: "this Mac" } }, A);
    assert.match(text(r), /· working/);
    const id = /composed (\S+)/.exec(text(r))![1];
    assert.deepEqual(S.getBlock(project, id)!.making, { file: "a.html", machine: "this Mac" });
    await tools.runWorkTool("update", { id, body: "<p>a</p>", more: true, making: { command: "make" } }, A);
    assert.equal(S.getBlock(project, id)!.state, "working");
    assert.deepEqual(S.getBlock(project, id)!.making, { command: "make" });
    await tools.runWorkTool("update", { id, body: "<p>ab</p>" }, A);
    await wait(S.SETTLE_MS + 60);
    assert.equal(S.getBlock(project, id)!.state, "live");
    await tools.runWorkTool("place", { id, close: true }, A);
    assert.equal(S.getBlock(project, id)!.state, "dead");
    assert.equal(S.getStage(project, A).blocks.some((p) => p.id === id), false);
    assert.match(text(await tools.runWorkTool("reopen", { id }, A)), /back on the stage/);
    assert.equal(S.getBlock(project, id)!.state, "live");
    assert.ok(S.getStage(project, A).blocks.some((p) => p.id === id), "back where it sat");
    assert.equal(S.ledger(project, id).at(-1)?.ev, "ran");
  } finally { whole(undefined); }
});

test("off: a compose with no body is live, more and making change nothing, and the tools read as they do today", async () => {
  const A = "sess-fram0006";
  whole("off");
  process.env.SOL_REACH_ROOM = "on";   // the press has its own switch, reach.room (#1740); on here, as the team runs it
  const before = Object.fromEntries(["compose", "update", "place"].map((n) => [n, { description: tool(n)!.description, keys: Object.keys(tool(n)!.shape) }]));
  // asks (#1298) is on with stage.whole off too: the press follows reach.room, not the frame
  assert.deepEqual(before.compose.keys, ["kind", "title", "body", "slot", "at", "format", "parent", "waits", "asks"]);
  assert.deepEqual(before.update.keys, ["id", "body", "title", "waits", "format", "asks"]);
  assert.deepEqual(before.place.keys, ["id", "slot", "fold", "carry", "close"]);
  for (const n of ["compose", "update", "place"]) assert.doesNotMatch(before[n].description, /making|more: true|no body/);
  assert.equal(tool("reopen"), undefined, "no reopen");
  const n = tools.WORK_TOOLS.length;
  S.asked(A, "make a page", [{ kind: "page" }]);
  const b = S.compose(who(A), { kind: "page", title: "today", making: { file: "z" } });
  assert.equal(b.state, "live", "a compose with no body is live, as today");
  assert.equal("making" in onDisk(b.id), false);
  S.update(who(A), { id: b.id, body: "<p>x</p>", more: true, making: { command: "c" } });
  assert.equal(S.getBlock(project, b.id)!.state, "working");
  assert.equal("making" in onDisk(b.id), false);
  await wait(S.SETTLE_MS + 60);
  assert.equal(S.getBlock(project, b.id)!.state, "live", "more is not heard: it settles as today");
  S.place(who(A), { id: b.id, close: true });
  assert.match(text(await tools.runWorkTool("reopen", { id: b.id }, A)), /not on/);
  assert.equal(S.getBlock(project, b.id)!.state, "dead", "a reopen the tool was never offered does nothing");
  // turned on and off again while the engine runs: reopen comes and goes, and the text is today's to the byte after
  whole("on");
  assert.equal(tools.WORK_TOOLS.length, n + 1);
  whole("on");
  assert.equal(tools.WORK_TOOLS.length, n + 1, "a second note changes nothing");
  whole("off");
  assert.equal(tools.WORK_TOOLS.length, n);
  for (const k of ["compose", "update", "place"]) {
    assert.equal(tool(k)!.description, before[k].description);
    assert.deepEqual(Object.keys(tool(k)!.shape), before[k].keys);
  }
  delete process.env.SOL_REACH_ROOM;
  assert.equal(existsSync(process.env.SOL_SETTINGS!), false, "the settings file is never written");
});

// a compose that fails on the disk takes nothing: the kind the person named is still theirs, so the retry lands solid, not as
// a ghost, with the switch off (as on main) and on alike. The frame only looks at the named list; the taking stays after the write
for (const sw of ["off", "on"] as const) {
  test(`${sw}: a compose the disk refused leaves the person's ask in place; the retry is no ghost`, () => {
    const A = `sess-framfal${sw === "on" ? 1 : 0}`;
    whole(sw);
    const dir = join(HOME, project, "blocks");
    mkdirSync(dir, { recursive: true });
    try {
      S.asked(A, "make a page", [{ kind: "page" }]);
      chmodSync(dir, 0o555);
      try { assert.throws(() => S.compose(who(A), { kind: "page", title: "the page" })); }
      finally { chmodSync(dir, 0o755); }
      const b = S.compose(who(A), { kind: "page", title: "the page" });
      assert.equal(S.getStage(project, A).blocks.find((p) => p.id === b.id)?.ghost, undefined, "the retry is the solid block asked for");
      assert.equal(b.state, sw === "on" ? "working" : "live");
      // and the ask was used once: the next page of the turn is a ghost
      const g = S.compose(who(A), { kind: "page", title: "another" });
      assert.equal(S.getStage(project, A).blocks.find((p) => p.id === g.id)?.ghost, true);
    } finally { chmodSync(dir, 0o755); whole(undefined); }
  });
}

test("on: a place refused for its carry writes no making; making on place is cleaned to one plain line", () => {
  const A = "sess-fram0007";
  whole("on");
  try {
    S.asked(A, "make a page", [{ kind: "page" }]);
    const b = S.compose(who(A), { kind: "page", title: "half", making: { file: "a.html" } });
    assert.throws(() => S.place(who(A), { id: b.id, carry: "not a session!", making: { file: "half.html" } }), /carry names a session id/);
    assert.deepEqual(onDisk(b.id).making, { file: "a.html" }, "half of a refused call is not applied");
    S.update(who(A), { id: b.id, more: true, making: { command: "ls\n\u202erm -rf ~\u0007", machine: "the\u200bMac" } });
    assert.deepEqual(onDisk(b.id).making, { command: "ls rm -rf ~", machine: "the Mac" }, "no newline, override, bell or zero-width space");
  } finally { whole(undefined); }
});

test("off: place takes no making", () => {
  const A = "sess-fram0008";
  whole("off");
  try {
    S.asked(A, "make a page", [{ kind: "page" }]);
    const b = S.compose(who(A), { kind: "page", title: "today" });
    S.update(who(A), { id: b.id, body: "<p>x</p>" });
    assert.equal(S.getBlock(project, b.id)!.state, "working");
    S.place(who(A), { id: b.id, making: { file: "z.html" } });
    assert.equal("making" in onDisk(b.id), false);
  } finally { whole(undefined); }
});
