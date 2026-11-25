// The version a Sol runs as (src/versions.ts, settings.ts versionMode()): concept, complete or product, from
// SOL_VERSION, else the setting `version`, else the channel Ship tells (dev: concept, beta: product, #1551); and where a
// switch stands in each, read from the cards' table (stations.json, #1544): a ladder, on in a mode when its station is at
// or past it, settled always, a switch no card names at "hand". The way a station turns one is tried here on the four of
// the first version, each from "hand", and the table is put back as it was. On a settings file of its own
// (SOL_SETTINGS), so the real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-versions-"));
const FILE = join(DIR, "settings.json");
process.env.SOL_SETTINGS = FILE;
const ENVS = ["SOL_VERSION", "SOL_COWORK_V3", "SOL_FRAME", "SOL_STAGE_WHOLE", "SOL_HOME_WHOLE", "SOL_REACH_TOOLS", "SOL_REACH_ROOM", "SOL_ONBOARD_READS", "SOL_LOG_KINDS", "SOL_LIVE_CONTEXT", "SOL_OPEN_FOR"];
for (const k of ENVS) delete process.env[k];
after(() => { for (const k of ENVS) delete process.env[k]; rmSync(DIR, { recursive: true, force: true }); });

const V = await import("../src/versions.ts");
const S = await import("../src/settings.ts");
const onDisk = () => JSON.parse(readFileSync(FILE, "utf8"));

test("the mode: the env's word, else the setting, else the channel; no channel yet is no mode", () => {
  assert.equal(V.modeOf(undefined, undefined, null), null);
  assert.equal(V.modeOf("", "", undefined), null);
  assert.equal(V.modeOf(undefined, undefined, "dev"), "concept");
  assert.equal(V.modeOf(undefined, undefined, "beta"), "product", "a tester's Sol runs as product (#1551)");
  assert.equal(V.modeOf(undefined, "complete", "dev"), "complete", "a pick wins over the channel");
  assert.equal(V.modeOf(undefined, "complete", "beta"), "product", "a tester's Sol has no version to pick (#1637)");
  assert.equal(V.modeOf(undefined, "concept", "beta"), "product");
  assert.equal(V.modeOf("product", "concept", "dev"), "product", "the env can say product");
  assert.equal(V.modeOf(undefined, "Product", "dev"), "product");
  assert.equal(V.modeOf(undefined, "concept", "beta"), "product", "on beta a pick moves nothing (#1637)");
  assert.equal(V.modeOf("concept", "complete", "beta"), "concept", "the env wins over a pick");
  assert.equal(V.modeOf(" Complete ", "concept", "dev"), "complete");
  for (const bad of ["settled", "hand", "both", "on", "1", 1, true, {}, null]) {
    assert.equal(V.modeOf(bad, undefined, "dev"), "concept", `an env of ${JSON.stringify(bad)} says nothing`);
    assert.equal(V.modeOf(undefined, bad, "beta"), "product", `a setting of ${JSON.stringify(bad)} says nothing`);
  }
  assert.equal(V.modeOf(undefined, undefined, "stable"), null, "a channel it does not know is no channel");
});

test("the ladder: a station is on in every mode at or below it, settled always, hand never, and only settled with no mode", () => {
  const table: [string, boolean, boolean, boolean, boolean][] = [   // station, in concept, in complete, in product, with no mode
    ["hand", false, false, false, false],
    ["concept", true, false, false, false],
    ["complete", true, true, false, false],
    ["product", true, true, true, false],
    ["settled", true, true, true, true],
  ];
  for (const [stage, inConcept, inComplete, inProduct, inNone] of table) {
    assert.equal(V.standsOn(stage as any, "concept"), inConcept, `${stage} in concept`);
    assert.equal(V.standsOn(stage as any, "complete"), inComplete, `${stage} in complete`);
    assert.equal(V.standsOn(stage as any, "product"), inProduct, `${stage} in product`);
    assert.equal(V.standsOn(stage as any, null), inNone, `${stage} with no mode`);
  }
  for (const bad of ["both", "toString", ""]) for (const m of [...V.MODES, null]) assert.equal(V.standsOn(bad as any, m), false, `${bad} is no station`);
});

test("the table is the cards': every row of stations.json, both sides, and a row that is not one stands at hand", () => {
  const raw = JSON.parse(readFileSync(new URL("../src/stations.json", import.meta.url), "utf8"));
  assert.deepEqual(V.STAGES, Object.fromEntries(Object.entries(raw).map(([n, r]: [string, any]) => [n, r.station])));
  assert.deepEqual(V.WINDOW_SWITCHES, Object.keys(raw).filter((n) => raw[n].side === "window").sort());
  const t = V.stationsFrom({ a: { station: "product", side: "window" }, b: { station: "both" }, c: "concept", d: { station: "settled" }, e: null });
  assert.deepEqual(t, { stages: { a: "product", d: "settled" }, sides: { a: "window", d: "engine" } });
  for (const bad of [null, [], "x", 1]) assert.deepEqual(V.stationsFrom(bad), { stages: {}, sides: {} });
});

test("a switch's reading: what was set by hand wins both ways, else its stage; a name not in the table is hand", () => {
  const stages = { a: "concept", b: "complete", c: "settled", d: "hand", e: "product" } as const;
  for (const mode of ["concept", "complete", "product", null] as const) {
    for (const name of ["a", "b", "c", "d", "e", "nobody"]) {
      assert.equal(V.onFor(name, mode, true, stages), true, `${name} set on, ${mode}`);
      assert.equal(V.onFor(name, mode, false, stages), false, `${name} set off, ${mode}`);
    }
    assert.equal(V.onFor("nobody", mode, undefined, stages), false);
  }
  assert.equal(V.onFor("a", "concept", undefined, stages), true);
  assert.equal(V.onFor("a", "complete", undefined, stages), false, "a concept not yet passed is not in complete");
  assert.equal(V.onFor("b", "complete", undefined, stages), true);
  assert.equal(V.onFor("b", "concept", undefined, stages), true, "past concept is on in concept too");
  assert.equal(V.onFor("b", "product", undefined, stages), false);
  assert.equal(V.onFor("e", "product", undefined, stages), true);
  assert.equal(V.onFor("c", null, undefined, stages), true);
  assert.equal(V.stageOf("toString"), "hand", "a name every object has is not a switch");
  assert.equal(V.stageOf("constructor", stages), "hand");
});

// the engine's eight at concept (#1113, #1406, #1519, #1521, #1661), stage.whole settled (#1111), the window's eleven at concept
// (#1544; the three views, #1637: a tester's Sol is Build only until each card reaches product); cowork.v3, frame and
// morning.waits are on no card, so they stand at hand
const ENGINE_CONCEPT = ["home.whole", "reach.tools", "reach.room", "onboarding.reads", "log.kinds", "work.liveContext", "open.for", "map.grown"];
const WINDOW = ["agents.mode", "build.one", "build.one.long", "build.one.team", "build.snap", "cross", "look.shown", "side.sorted", "view.cowork", "view.home", "view.social"];
// tools.cards (#1589) stands at product: the tools follow their cards in every mode, and in concept that drops nothing;
// identity.supabase (#1607) at product too: a tester's Sol signs in on Supabase
const TODAY: Record<string, string> = { "stage.whole": "settled", "tools.cards": "product", "identity.supabase": "product", ...Object.fromEntries([...ENGINE_CONCEPT, ...WINDOW].map((n) => [n, "concept"])),
  // moved on by gate one, then past their soak (#1667): on for the team and on a tester's Sol (product)
  "onboarding.reads": "product", "open.for": "product",
  // moved on by the station check of 2026-11-20 (#1717), straight to product (no soak, Frank 2026-11-20): on a tester's Sol too
  "home.whole": "product", "reach.tools": "product",
  // view.home and view.cowork went to product on 2026-11-20 and came back to complete on 2026-11-22 (#1637, Frank): a
  // tester's Sol is Build only until the new interface's move-in; on for the team (concept) and at complete, off at product
  "view.home": "complete", "view.cowork": "complete",
  // moved on by the station check of 2026-11-22 (#1786), to complete and not product while a tester's Sol is Build only
  // (#1637): on for the team (concept) and at complete, off at product
  "agents.mode": "complete", "reach.room": "complete",
  // the new face (#1615, BR1 join, Frank 2026-11-23): ring 3 of docs/port/switch.md, on for the team and a tester's Sol
  // unless they turned it off by hand
  "ui.next": "product" };
const AT_PRODUCT = new Set(["onboarding.reads", "open.for", "home.whole", "reach.tools", "ui.next"]);
/** every switch at hand, so a test tries one station at a time */
const allHand = () => { for (const k of Object.keys(V.STAGES)) (V.STAGES as Record<string, string>)[k] = "hand"; };
const putBack = () => {
  const t = V.STAGES as Record<string, string>;
  for (const k of Object.keys(t)) if (!(k in TODAY)) delete t[k];
  Object.assign(t, TODAY);
};
/** the window's block of the readings: each of its switches, on or off */
const W = (on: boolean) => Object.fromEntries(WINDOW.map((n) => [n, on]));

test("today's table: stage.whole on for everyone (#1111), the engine's eight and the window's eleven on for the team, identity.supabase at product (#1607); cowork.v3, frame and morning.waits at hand", () => {
  assert.deepEqual(V.STAGES, TODAY);
  assert.deepEqual(V.WINDOW_SWITCHES, WINDOW);
  for (const n of ["cowork.v3", "frame", "morning.waits"]) assert.equal(V.stageOf(n), "hand", n);
  assert.equal(V.stageOf("ui.next"), "product", "the new face is on for a tester unless turned off (#1615)");
});

test("absent, the settings are today's: no version key in what a face is sent or in the file, and no mode before Ship speaks", () => {
  assert.equal(S.versionMode(), null);
  assert.equal("version" in S.getSettings(), false);
  assert.equal(existsSync(FILE), false, "reading writes nothing");
  S.patchSettings({ patienceMs: 700 });
  assert.equal("version" in S.getSettings(), false, "a patch of something else does not bring the key in");
  assert.equal("version" in onDisk(), false);
});

test("the channel decides until someone picks; a pick is in the file; null is back to the channel; a bad word changes nothing", async () => {
  S.noteChannel("dev");
  assert.equal(S.versionMode(), "concept");
  S.noteChannel("beta");
  assert.equal(S.versionMode(), "product");
  assert.equal(S.patchSettings({ version: "concept" }).version, "concept", "the pick is kept in the file");
  assert.equal(S.versionMode(), "product", "but a tester's Sol stays product: on beta nothing picked moves it (#1637)");
  S.noteChannel("dev");
  assert.equal(S.patchSettings({ version: "product" }).version, "product", "product is a pick too");
  assert.equal(S.versionMode(), "product");
  assert.equal(S.patchSettings({ version: "concept" }).version, "concept");
  assert.equal(S.versionMode(), "concept", "on dev a pick wins over the channel");
  assert.equal(onDisk().version, "concept");
  const next = await import("../src/settings.ts?next-start");
  assert.equal(next.getSettings().version, "concept", "an engine started now reads it from the file");
  for (const bad of ["settled", "both", "", 1, true, {}, ["complete"]]) {
    S.patchSettings({ version: bad });
    assert.equal(S.getSettings().version, "concept", `${JSON.stringify(bad)} leaves the pick`);
  }
  S.patchSettings({ look: { text: 18 } });
  assert.equal(S.getSettings().version, "concept", "a patch of something else leaves the pick");
  S.patchSettings({ version: "complete" });
  assert.equal(S.versionMode(), "complete");
  S.patchSettings({ version: null });
  assert.equal("version" in S.getSettings(), false);
  assert.equal("version" in onDisk(), false);
  assert.equal(S.versionMode(), "concept", "back to the channel, which is dev here");
  S.noteChannel(null);
  assert.equal(S.versionMode(), null);
  S.noteChannel("stable" as any);
  assert.equal(S.versionMode(), null, "a channel it does not know is none");
});

test("SOL_VERSION wins over the pick and the channel, and an env that says nothing leaves them", () => {
  S.noteChannel("dev");
  S.patchSettings({ version: "complete" });
  process.env.SOL_VERSION = "concept";
  assert.equal(S.versionMode(), "concept");
  process.env.SOL_VERSION = "product";
  assert.equal(S.versionMode(), "product");
  process.env.SOL_VERSION = "nonsense";
  assert.equal(S.versionMode(), "complete");
  delete process.env.SOL_VERSION;
  S.patchSettings({ version: null });
});

const SWITCHES: [string, "coworkV3" | "frameOn" | "stageWhole" | "homeWhole", (v: boolean) => object, string][] = [
  ["cowork.v3", "coworkV3", (v) => ({ cowork: { v3: v } }), "SOL_COWORK_V3"],
  ["frame", "frameOn", (v) => ({ frame: v }), "SOL_FRAME"],
  ["stage.whole", "stageWhole", (v) => ({ stage: { whole: v } }), "SOL_STAGE_WHOLE"],
  ["home.whole", "homeWhole", (v) => ({ home: { whole: v } }), "SOL_HOME_WHOLE"],
];
// an engine started on this settings file: its own copy of settings.ts, so nothing an earlier row set is left in it
let starts = 0;
const started = async (file: object): Promise<typeof S> => { writeFileSync(FILE, JSON.stringify(file)); return import(`../src/settings.ts?start-${starts++}`); };

test("nobody set a switch (a settings file that names none): each of the four reads off in every version, but stage.whole on and home.whole on once a channel or pick names a mode (#1717: at product)", async () => {
  const versions: [string, "dev" | "beta" | null, string | undefined, string | null][] = [   // name, channel, pick, the mode it is
    ["no channel yet", null, undefined, null], ["concept by channel", "dev", undefined, "concept"], ["product by channel", "beta", undefined, "product"],
    ["concept by pick", "dev", "concept", "concept"], ["a pick on beta moves nothing (#1637)", "beta", "concept", "product"], ["complete by pick", "dev", "complete", "complete"], ["product by pick", "dev", "product", "product"],
  ];
  for (const [vname, channel, pick, mode] of versions) {
    const F = await started(pick ? { version: pick } : {});
    F.noteChannel(channel);
    assert.equal(F.versionMode(), mode, vname);
    const st = F.getSettings();
    assert.deepEqual([st.cowork?.v3, st.frame, st.stage?.whole, st.home?.whole], [undefined, undefined, undefined, undefined], `${vname}: no switch is set`);
    for (const [name, read] of SWITCHES) assert.equal(F[read](), name === "stage.whole" || (name === "home.whole" && mode !== null), `${name} never set, ${vname}`);
  }
});

test("the four switches read as before in every version once set: on when set, off when set off, the env first", () => {
  const versions: [string, () => void][] = [
    ["no channel yet", () => { S.noteChannel(null); S.patchSettings({ version: null }); }],
    ["concept by channel", () => { S.noteChannel("dev"); S.patchSettings({ version: null }); }],
    ["product by channel", () => { S.noteChannel("beta"); S.patchSettings({ version: null }); }],
    ["concept by pick", () => { S.noteChannel("beta"); S.patchSettings({ version: "concept" }); }],
    ["complete by pick", () => { S.noteChannel("dev"); S.patchSettings({ version: "complete" }); }],
    ["product by pick", () => { S.noteChannel("dev"); S.patchSettings({ version: "product" }); }],
  ];
  for (const [name, read, patch, env] of SWITCHES) {
    for (const [vname, enter] of versions) {
      enter();
      S.patchSettings(patch(true));
      assert.equal(S[read](), true, `${name} set on, ${vname}`);
      process.env[env] = "off";
      assert.equal(S[read](), false, `${name} set on, env off, ${vname}`);
      delete process.env[env];
      S.patchSettings(patch(false));
      assert.equal(S[read](), false, `${name} set off, ${vname}`);
      process.env[env] = "on";
      assert.equal(S[read](), true, `${name} set off, env on, ${vname}`);
      delete process.env[env];
    }
    assert.equal(S[read](), false);
  }
  S.noteChannel(null); S.patchSettings({ version: null });
});

test("each switch asks by its own name: its station moved in the table, it alone turns, in the modes the ladder gives it, and its hearers hear", async () => {
  const table = V.STAGES as Record<string, string>;
  allHand();   // before the hearers come, so moving the table now is no turn they hear
  const F = await started({});
  const heard: Record<string, boolean[]> = { "cowork.v3": [], "frame": [], "stage.whole": [], "home.whole": [] };
  F.onCoworkV3((on) => { heard["cowork.v3"].push(on); });
  F.onFrame((on) => { heard["frame"].push(on); });
  F.onStageWhole((on) => { heard["stage.whole"].push(on); });
  F.onHomeWhole((on) => { heard["home.whole"].push(on); });
  const reads = () => SWITCHES.map(([, read]) => F[read]());
  const only = (name: string) => SWITCHES.map(([n]) => n === name);
  const none = SWITCHES.map(() => false);
  try {
    for (const [name, , patch, env] of SWITCHES) {
      for (const k of Object.keys(heard)) heard[k].length = 0;
      F.noteChannel(null);
      table[name] = "concept";
      assert.deepEqual(reads(), none, `${name} at concept, no channel yet: shown to nobody`);
      F.noteChannel("dev");
      assert.deepEqual(reads(), only(name), `${name} at concept, in concept`);
      F.noteChannel("beta");
      assert.deepEqual(reads(), none, `${name} at concept, in product (a beta Sol)`);
      table[name] = "complete";
      assert.deepEqual(reads(), none, `${name} at complete, in product`);
      F.patchSettings({ version: "complete" });
      assert.deepEqual(reads(), none, `${name} at complete, complete picked on beta: a tester's Sol stays product (#1637)`);
      F.noteChannel("dev");
      assert.deepEqual(reads(), only(name), `${name} at complete, complete picked`);
      F.patchSettings({ version: "concept" });
      assert.deepEqual(reads(), only(name), `${name} at complete, concept picked: past concept is on there too`);
      F.patchSettings({ version: null });
      F.noteChannel("beta");
      assert.deepEqual(reads(), none, `${name} at complete, back to product by the channel`);
      table[name] = "product";
      F.noteChannel("beta");
      assert.deepEqual(reads(), only(name), `${name} at product, in product`);
      table[name] = "settled";
      F.noteChannel(null);
      assert.deepEqual(reads(), only(name), `${name} settled, no channel yet`);
      process.env[env] = "off";
      assert.deepEqual(reads(), none, `${name} settled, env off`);
      delete process.env[env];
      F.patchSettings(patch(false));
      assert.deepEqual(reads(), none, `${name} settled, set off by hand`);
      table[name] = "hand";
      // each with its hearers (the frame's and Home's since the version: the kernel and Home follow them), once per turn
      // of the reading: on by the channel (dev), off by the channel (beta), on by the pick of complete, off when the
      // pick went, on at product, off when set off by hand
      assert.deepEqual(heard[name], [true, false, true, false, true, false], `${name}'s hearers`);
      for (const k of Object.keys(heard)) if (k !== name) assert.deepEqual(heard[k], [], `${k}'s hearers heard nothing of ${name}`);
    }
  } finally {
    putBack();
  }
  assert.deepEqual(V.STAGES, TODAY, "the table is back as it was");
});

test("a change of version that turns no switch tells no hearer", () => {
  let v3 = 0, whole = 0, frame = 0, home = 0;
  S.onCoworkV3(() => { v3++; });
  S.onStageWhole(() => { whole++; });
  S.onFrame(() => { frame++; });
  S.onHomeWhole(() => { home++; });
  S.noteChannel("dev"); S.noteChannel("beta"); S.noteChannel(null);
  S.patchSettings({ version: "concept" }); S.patchSettings({ version: "complete" }); S.patchSettings({ version: "product" }); S.patchSettings({ version: null });
  assert.deepEqual([v3, whole, frame, home], [0, 0, 0, 0]);
  S.patchSettings({ stage: { whole: true } });
  assert.deepEqual([v3, whole, frame, home], [0, 1, 0, 0], "the switch itself still does");
  S.patchSettings({ frame: true });
  assert.deepEqual([v3, whole, frame, home], [0, 1, 1, 0], "the frame's too, and only its own");
  S.patchSettings({ stage: { whole: false }, frame: false });
});

// ---- before the first switch leaves "hand" (#1246): what a face is sent, and which checkout runs as concept ----

test("a face is sent the engine's reading: nothing added for the engine's switches while all stand at hand, the reading where an env or a station turns one", async () => {
  const table = V.STAGES as Record<string, string>;
  const F = await started({});
  for (const ch of [null, "dev", "beta"] as const) {
    F.noteChannel(ch);
    // reach.room's reading too (#1740): the Agents' room's page follows it in the window
    assert.deepEqual(F.readings(), { stage: { whole: true }, ...(ch !== null ? { home: { whole: true }, ui: { next: true } } : {}), ...(ch === "dev" ? { reach: { room: true } } : {}), window: W(ch === "dev") }, `stage.whole settled, home.whole, reach.room (#1740, concept: dev only) and the window's eleven at concept, channel ${ch}`);
  }
  allHand();
  for (const ch of [null, "dev", "beta"] as const) { F.noteChannel(ch); assert.deepEqual(F.readings(), { window: W(false) }, `all at hand, channel ${ch}: today's settings and the window's eleven off`); }
  F.patchSettings({ frame: true, stage: { whole: false } });
  assert.deepEqual(F.readings(), { window: W(false) }, "set by hand: the setting is the reading, nothing added");
  F.patchSettings({ frame: false });
  process.env.SOL_FRAME = "on";
  assert.deepEqual(F.readings(), { window: W(false) }, "never the frame: the window owns its switch and Home would write a reading back");
  delete process.env.SOL_FRAME;
  process.env.SOL_HOME_WHOLE = "on";
  assert.deepEqual(F.readings(), { home: { whole: true }, window: W(false) }, "an env that turns one is sent as the engine reads it");
  delete process.env.SOL_HOME_WHOLE;
  try {
    table["cowork.v3"] = "concept";
    F.noteChannel("dev");
    assert.deepEqual(F.readings(), { cowork: { v3: true }, window: W(false) }, "a station in this version turns it on for the face too");
    F.noteChannel("beta");
    assert.deepEqual(F.readings(), { window: W(false) }, "and off again in product, where it stands off");
    table["stage.whole"] = "settled";
    assert.deepEqual(F.readings(), { window: W(false) }, "set off by hand: the hand wins, so the reading is the setting");
    F.patchSettings({ stage: { whole: null } as never });
  } finally { putBack(); F.noteChannel(null); }
});

test("which checkout runs as concept: only one that clearly is sol-dev, or a pick; an unclear source is beta, so product", async () => {
  process.env.SOL_NO_SHIP_CHECK = "1";
  const { versionChannelOf, channelOf } = await import("../src/team/ship.ts");
  const dev = ["git@github.com:sol-mif/sol-dev.git", "https://github.com/sol-mif/sol-dev", "https://github.com/sol-mif/sol-dev.git/"];
  for (const o of dev) assert.equal(versionChannelOf(undefined, o), "dev", o);
  const unclear = ["", "git@github.com:sol-mif/sol-beta.git", "https://github.com/someone/sol-dev-fork.git", "/tmp/sol-stage-123", "https://example.com/x/sol.git"];
  for (const o of unclear) assert.equal(versionChannelOf(undefined, o), "beta", `${o || "(no origin)"}: beta, so product`);
  assert.equal(channelOf(undefined, "/tmp/sol-stage-123"), "dev", "where updates come from is left as it was");
  assert.equal(versionChannelOf("dev", ""), "dev", "a pick of dev in Settings › me wins");
  assert.equal(versionChannelOf("beta", dev[0]), "beta", "and so does a pick of beta");
});

// #1406 (Frank 2026-11-17): a switch off by default is on for the team; these four stand at concept, so a dev-channel Sol
// reads them on with nothing set, a tester's stays off, and a person's false and the env's off still win
const TEAM: [string, "reachTools" | "reachRoom" | "onboardReads" | "logKinds" | "liveContext" | "openFor" | "mapGrown", (v: boolean) => object, string][] = [
  ["reach.tools", "reachTools", (v) => ({ reach: { tools: v } }), "SOL_REACH_TOOLS"],
  ["reach.room", "reachRoom", (v) => ({ reach: { room: v } }), "SOL_REACH_ROOM"],
  ["onboarding.reads", "onboardReads", (v) => ({ onboarding: { reads: v } }), "SOL_ONBOARD_READS"],
  ["log.kinds", "logKinds", (v) => ({ log: { kinds: v } }), "SOL_LOG_KINDS"],
  ["work.liveContext", "liveContext", (v) => ({ work: { liveContext: v } }), "SOL_LIVE_CONTEXT"],   // the context ring's live count (#1519)
  ["open.for", "openFor", (v) => ({ open: { for: v } }), "SOL_OPEN_FOR"],   // #1521
  ["map.grown", "mapGrown", (v) => ({ map: { grown: v } }), "SOL_MAP_GROWN"],   // #1661
];
test("the team's four (#1406): on in concept unset, off in complete and with no channel; false and env off win; a bad patch keeps a false", async () => {
  for (const [name, read, patch, env] of TEAM) {
    const F = await started({});
    const tester = AT_PRODUCT.has(name);   // at product, a tester's reads it on too (#1667)
    F.noteChannel(null);
    assert.equal(F[read](), false, `${name}: no channel yet, off`);
    F.noteChannel("beta");
    assert.equal(F[read](), tester, `${name}: a tester's, ${tester ? "on" : "off"}`);
    F.noteChannel("dev");
    assert.equal(F[read](), true, `${name}: the team's, on with nothing set`);
    process.env[env] = "off";
    assert.equal(F[read](), false, `${name}: the env's off wins`);
    delete process.env[env];
    F.patchSettings(patch(false));
    assert.equal(F[read](), false, `${name}: a person's false wins`);
    for (const bad of [{ reach: "x" }, { reach: { tools: "x", room: 1 } }, { onboarding: null }, { onboarding: { reads: "on" } }, { log: [] }, { log: { kinds: 1 } }, { work: "on" }, { work: { liveContext: "on" } }]) {
      F.patchSettings(bad);
      assert.equal(F[read](), false, `${name}: ${JSON.stringify(bad)} keeps the false`);
    }
    F.noteChannel("beta");
    F.patchSettings(patch(true));
    assert.equal(F[read](), true, `${name}: a tester's true turns it on`);
    F.noteChannel(null);
  }
});

// #1551: the done of the engine's modes. A Sol run as product shows none of the eight at concept and keeps the whole
// stage; one run as concept reads every switch as it did before product came
test("SOL_VERSION=product: the eight engine switches at concept all off, stage.whole on, the window's eleven off", async () => {
  const F = await started({});
  const reads = (G: typeof S) => ({ "home.whole": G.homeWhole(), "reach.tools": G.reachTools(), "reach.room": G.reachRoom(), "onboarding.reads": G.onboardReads(),
    "log.kinds": G.logKinds(), "work.liveContext": G.liveContext(), "open.for": G.openFor(), "map.grown": G.mapGrown() });
  process.env.SOL_VERSION = "product";
  try {
    for (const ch of [null, "dev", "beta"] as const) {
      F.noteChannel(ch);
      assert.equal(F.versionMode(), "product");
      assert.deepEqual(reads(F), Object.fromEntries(ENGINE_CONCEPT.map((n) => [n, AT_PRODUCT.has(n)])), `channel ${ch}`);
      assert.equal(F.stageWhole(), true, "stage.whole is settled");
      assert.deepEqual(F.readings(), { stage: { whole: true }, home: { whole: true }, ui: { next: true }, window: W(false) }, "home.whole and ui.next stand at product (#1717, #1615); view.home and view.cowork at complete (#1637): off on a tester's Sol");
    }
    process.env.SOL_VERSION = "concept";
    F.noteChannel("beta");
    assert.deepEqual(reads(F), Object.fromEntries(ENGINE_CONCEPT.map((n) => [n, true])), "concept: all seven on, as the team runs them today");
    assert.deepEqual(F.readings(), { stage: { whole: true }, home: { whole: true }, ui: { next: true }, reach: { room: true }, window: W(true) }, "concept's readings are today's, reach.room's for the window (#1740), and the window's eleven on");
  } finally { delete process.env.SOL_VERSION; F.noteChannel(null); }
});

test("the window's block: its eight switches, each by its station in this mode; a person's setting is the window's to read", async () => {
  const table = V.STAGES as Record<string, string>;
  const F = await started({});
  try {
    for (const [mode, on] of [["concept", true], ["complete", false], ["product", false]] as const) {
      F.patchSettings({ version: mode });
      assert.deepEqual(Object.keys(F.readings().window).sort(), WINDOW, mode);
      // view.home and view.cowork stand at complete (#1637), agents.mode too (#1786): on in concept and complete, off at product
      assert.deepEqual(F.readings().window, { ...W(on), "view.home": mode !== "product", "view.cowork": mode !== "product", "agents.mode": mode !== "product" }, `${mode}: the eight at concept`);
    }
    table["cross"] = "product";
    table["build.snap"] = "complete";
    // were product/agents moved to complete (#18, gate one question 2): the window reads agents.mode from here, so a complete Sol has it
    table["agents.mode"] = "complete";
    for (const [mode, cross, snap] of [["concept", true, true], ["complete", true, true], ["product", true, false]] as const) {
      F.patchSettings({ version: mode });
      assert.equal(F.readings().window["cross"], cross, `cross at product, ${mode}`);
      assert.equal(F.readings().window["build.snap"], snap, `build.snap at complete, ${mode}`);
      assert.equal(F.readings().window["agents.mode"], snap, `agents.mode at complete, ${mode}`);
    }
    F.patchSettings({ version: null });
    F.noteChannel(null);
    assert.deepEqual(F.readings().window, W(false), "no mode yet: none of the eight, not even at product");
    F.patchSettings({ version: "concept", window: { cross: false } });
    assert.equal("window" in F.getSettings(), false, "the block is never written to the settings file");
  } finally { putBack(); F.patchSettings({ version: null }); F.noteChannel(null); }
});

test("the channel learned or changed tells its hearers once, so every face hears the readings again (#1637)", () => {
  let n = 0;
  S.onChannel(() => { n++; });
  S.noteChannel(null);
  const before = n;
  S.noteChannel("dev");
  assert.equal(n, before + 1, "learned");
  S.noteChannel("dev");
  assert.equal(n, before + 1, "the same channel again tells nobody");
  S.noteChannel("beta");
  assert.equal(n, before + 2, "changed");
  S.noteChannel(null);
});
