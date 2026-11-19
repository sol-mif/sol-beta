// #1281: a session's agent looks at and presses a way's moves, with its person there (team/v3/way-tools.ts). Real trails
// in a temp folder, written through the real door; the card is handed in. Frank's NucBox runs the way; the way names
// Frank's agent beside Marco (explorer) and beside Frank (keeper), and both agreed. Nothing leaves this test's folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-tools-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_COWORK_WAYS = "on";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [{ id: "room-lab", name: "Lab", provider: "github", org: "acme", repos: ["acme/lab"], code: "ABCDEF" }] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { WAYFILE, rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { WAY_NAMES, runWayTool, wayTools, waysNow } = await import("../src/team/way-tools.ts");
const { seatTools } = await import("../src/tools.ts");
const { WAYS_ENV, teamWaysOn } = await import("../src/team/v3/way-switch.ts");
const { load } = await import("../src/way/load.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
FILE.roles.explorer.who.push("agent:frank");
FILE.roles.keeper.who.push("agent:frank");
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
let count = 0;
const sol = (machine: string) => {
  const d = join(dir, `${machine}-${++count}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")) };
};
const FRANK = { person: "frank", machine: "nucbox" };
/** Marco agrees on his Mini; the Mini and the NucBox swap what they hold */
function marco(nuc: Sol, value: unknown, at: number) {
  const mini = sol("mini");
  mini.trail.merge(nuc.trail.since(P));
  mini.trail.append({ project: P, by: { person: "marco", machine: "mini" }, kind: "way.agreed", value, at });
  nuc.trail.merge(mini.trail.since(P));
}
function started() {
  const nuc = sol("nucbox");
  const put = (kind: string, value: unknown, at: number, more: { item?: string } = {}) => nuc.trail.append({ project: P, by: FRANK, kind, value, at, ...more });
  put("member", { role: "owner", in: true }, T(0), { item: "frank" });
  put("member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(WAYFILE, FILE, T(2), { item: L.ver });
  marco(nuc, { way: WAY, to: L.ver, role: "explorer" }, T(10));
  put("way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(11));
  put("way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  put("way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  return nuc;
}
type Sol = ReturnType<typeof sol>;
const text = (r: { content: { text: string }[] }) => r.content[0].text;
/** the tools on one Sol at one clock, the card answering `yes` and keeping what it was shown */
const on = (s: Sol, m: number, yes: boolean | null = true) => {
  const shown: { title: string; description: string; decisionReason: string; input: Record<string, unknown> }[] = [];
  const deps = { me: () => "frank", projects: () => [P], sol: () => s, clock: () => T(m), card: async (_: unknown, c: (typeof shown)[number]) => { shown.push(c); return yes; } };
  return { shown, run: (name: string, args: unknown) => runWayTool(name, args, { sessionId: "s1" }, deps) as Promise<{ content: { text: string }[]; isError?: boolean }> };
};
const MAKE = { project: P, way: WAY, thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } };

test("#1281 way_look: the moves my agent may press and those only I may, with the ways off nothing listed", async () => {
  const nuc = started();
  const t = on(nuc, 30);
  let r = text(await t.run("way_look", {}));
  assert.match(r, /lab · sol\.drafts .*0 things/);
  assert.match(r, /yours to press[\s\S]*new draft → make \(to on_switch\), sets title, switch/);
  await t.run("way_press", MAKE);
  r = text(await t.run("way_look", { project: P, way: WAY }));
  assert.match(r, /d1: a draft, on_switch/);
  assert.match(r, /d1 → want \(to wanted\)/);
  assert.match(r, /d1 → extend \(to same\), has a rule/);
  // the switch: off, the tools are not offered and answer nothing
  assert.deepEqual(wayTools().map((x) => x.name), ["way_look", "way_press"]);
  assert.ok(seatTools().some((x) => WAY_NAMES.has(x.name)));
  // the tools ask the switch as way-switch.ts does, whatever it says
  for (const v of ["on", "ON ", "1", "true", "off", "", "yes", "0"]) {
    process.env[WAYS_ENV] = v;
    assert.equal(waysNow(), teamWaysOn(), JSON.stringify(v));
  }
  process.env[WAYS_ENV] = "off";
  try {
    assert.deepEqual(wayTools(), []);
    assert.ok(!seatTools().some((x) => WAY_NAMES.has(x.name)), "not offered to a seat");
    assert.equal((await t.run("way_look", {})).isError, true);
  } finally { process.env[WAYS_ENV] = "on"; }
});

test("#1281 way_press: a card with every value, then written as my agent; a no, or no card, writes nothing; a refusal is never written", async () => {
  const nuc = started();
  const n = () => rowsOf(nuc.trail, P).length;
  // no card can be shown (no Work session): nothing
  let before = n();
  let r = await on(nuc, 30, null).run("way_press", MAKE);
  assert.equal(r.isError, true);
  assert.match(text(r), /no card/);
  assert.equal(n(), before);
  // the person says no
  const no = on(nuc, 30, false);
  r = await no.run("way_press", MAKE);
  assert.match(text(r), /said no/);
  assert.equal(n(), before);
  assert.equal(no.shown.length, 1);
  assert.equal(no.shown[0].title, `Your agent presses "make" on a new draft, d1, writing title = "New logo"; switch = "logo_v2"`, "every value in the title the window and the notch show whole");
  assert.match(no.shown[0].decisionReason, /It writes title = "New logo"; switch = "logo_v2"\./);
  // values too long to show whole: not offered, no card, nothing written
  const long = on(nuc, 30);
  r = await long.run("way_press", { ...MAKE, set: { title: "x".repeat(500), switch: "logo_v2" } });
  assert.equal(r.isError, true);
  assert.match(text(r), /too long to show whole/);
  assert.equal(long.shown.length, 0);
  assert.equal(n(), before);
  // yes: written, signed by Frank's agent's key
  const yes = on(nuc, 31);
  r = await yes.run("way_press", MAKE);
  assert.match(text(r), /^pressed: make on d1, 4 events/);
  const mine = rowsOf(nuc.trail, P).slice(before);
  assert.deepEqual(mine.map((e) => e.kind), ["way.made", "way.move", "way.set", "way.note"]);
  assert.ok(mine.every((e) => e.by.agent === "claude" && e.by.person === "frank" && e.key === nuc.keys.agent("frank", "claude").pub));
  assert.ok(mine.every((e) => (e.value as { because?: string }).because === undefined || e.kind === "way.set" || e.kind === "way.note"), "the press names no event");
  // refused moves: judged first, no card, nothing on the trail (a rule whose check nobody ran here; a move from another
  // state; an unknown thing)
  assert.match(text(await on(nuc, 32).run("way_press", { project: P, way: WAY, thing: "d1", move: "want" })), /^pressed: want on d1/);
  before = n();
  for (const ask of [{ thing: "d1", move: "promote" }, { thing: "d1", move: "pull" }, { thing: "zz", move: "want" }]) {
    const t = on(nuc, 33);
    r = await t.run("way_press", { project: P, way: WAY, ...ask });
    assert.equal(r.isError, true, ask.move);
    assert.match(text(r), /refused before anything was written: (rule_unread|wrong_state|unknown_thing)/);
    assert.equal(t.shown.length, 0, "no card for a refusal");
  }
  assert.equal(n(), before, "no way.refused on the trail");
  // a move into a state that owes an act: the card names it, the answer says nothing runs it
  const drop = on(nuc, 34);
  r = await drop.run("way_press", { project: P, way: WAY, thing: "d1", move: "drop" });
  assert.match(drop.shown[0].title, /^Your agent presses "drop" on d1; then owes switch\.off \(nothing runs it yet\)$/);
  assert.match(text(r), /owes switch\.off on d1/);
});

test("#1281 a way's press is a go: the one session never answers its card for the person", async () => {
  const { kindOf, modeOf } = await import("../src/work/oneLong.ts");
  const k = kindOf({ id: "p", at: 0, kind: "needs", title: "", perm: "perm:x", tool: "mcp__sol__way_press" });
  assert.equal(k, "a go");
  assert.equal(modeOf([true, true, true, true, true], "auto", k), "ask", "five agreed answers do not let it decide");
  assert.equal(modeOf([], "decide", k), "ask", "nor the dial set to decide");
  assert.equal(kindOf({ id: "p", at: 0, kind: "needs", title: "", perm: "perm:x", tool: "Edit" }), "a file change", "another tool as it was");
});

test("#1281 way_press: a version applied while the card waited makes the yes write nothing", async () => {
  const nuc = started();
  const other = { ...FILE, name: `${FILE.name} 2`, prev: L.ver };
  const L2 = load(other);
  // the card waits; meanwhile a second version is put on the trail, agreed by every role and applied
  const deps = {
    me: () => "frank", projects: () => [P], sol: () => nuc, clock: () => T(40),
    card: async () => {
      const put = (kind: string, value: unknown, at: number, item?: string) => nuc.trail.append({ project: P, by: FRANK, kind, value, at, ...(item ? { item } : {}) });
      put(WAYFILE, other, T(33), L2.ver);
      put("way.proposed", { way: WAY, from: L.ver, slots: [] }, T(34), L2.ver);
      put("way.agreed", { way: WAY, to: L2.ver, role: "explorer" }, T(35));
      put("way.agreed", { way: WAY, to: L2.ver, role: "keeper" }, T(35));
      marco(nuc, { way: WAY, to: L2.ver, role: "explorer" }, T(35));
      put("way.applied", { way: WAY, from: L.ver, to: L2.ver, reader: 1 }, T(36));
      return true;
    },
  };
  const r = await runWayTool("way_press", MAKE, { sessionId: "s1" }, deps) as { content: { text: string }[]; isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(text(r), /would be refused \(old_version\)/);
  assert.ok(!rowsOf(nuc.trail, P).some((e) => e.by.agent), "nothing of the agent's on the trail");
  assert.match(text(await on(nuc, 41).run("way_look", { project: P })), new RegExp(`version ${L2.ver.slice(0, 12)}`), "the second version is the one in force");
});
