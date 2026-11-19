// The lens is one setting (#824; settings.ts, work/blocks.ts): with the engine's switch stage.whole on, every session's
// stage answers the person's one lens (the setting `lens`, app when unset) in place of the one in its stage.json; a
// layout that names a lens writes the setting, not stage.json, and the agent's read names it. With the switch off, the
// lens is each session's own, as today (test/stage-lens.test.ts), and stage.json still holds it, so turning the switch
// off again gives every session its lens back. All in a home and a settings file of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "sol-lens-one-"));
const HOME = join(TMP, "home"), REPO = join(TMP, "repo");
mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(TMP, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
const SET = join(TMP, "set");   // the settings file in a folder of its own, so a test can make only it unwritable
mkdirSync(SET);
const FILE = join(SET, "settings.json");
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SETTINGS = FILE;
delete process.env.SOL_STAGE_WHOLE;

const S = await import("../src/work/blocks.ts");
const settings = await import("../src/settings.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const whole = (v?: string) => { if (v === undefined) delete process.env.SOL_STAGE_WHOLE; else process.env.SOL_STAGE_WHOLE = v; };
const ownLens = (sid: string) => JSON.parse(readFileSync(join(HOME, project, "sessions", sid, "stage.json"), "utf8")).lens;
const onDisk = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
after(() => { chmodSync(SET, 0o755); S.disarmAll(); S.setStageBus(null); whole(undefined); rmSync(TMP, { recursive: true, force: true }); });

const A = "sess-lens0001", B = "sess-lens0002";
S.compose(who(A), { kind: "page", title: "one", body: "x" });
S.compose(who(B), { kind: "card", title: "two", body: "x" });

test("off: the settings are today's, with no lens key, and each session keeps its own lens", () => {
  whole("off");
  try {
    assert.equal("lens" in settings.getSettings(), false, "no lens key until someone sets it");
    S.layout(project, A, { lens: "ide" });
    assert.equal(S.getStage(project, A).lens, "ide");
    assert.equal(S.getStage(project, B).lens, "app", "the other session keeps its own");
    assert.equal("lens" in settings.getSettings(), false, "a layout writes stage.json, not the setting");
    // the setting, set while the switch is off, is heard by nobody on the stage
    settings.patchSettings({ lens: "cli" });
    assert.equal(S.getStage(project, A).lens, "ide");
    assert.equal(S.getStage(project, B).lens, "app");
  } finally { whole(undefined); settings.patchSettings({ lens: null }); }
});

test("on: every session's stage answers the person's lens, app while it is unset, and the agent's read names it", () => {
  whole("on");
  try {
    assert.equal(settings.getSettings().lens, undefined);
    assert.equal(S.getStage(project, A).lens, "app", "unset is app, whatever stage.json says");
    settings.patchSettings({ lens: "tui" });
    assert.deepEqual(onDisk().lens, "tui");
    assert.equal(S.getStage(project, A).lens, "tui");
    assert.equal(S.getStage(project, B).lens, "tui");
    assert.equal(S.withProject(project, B).lens, "tui", "what work.stage.get answers");
    assert.match(S.read(who(A)), /^The stage \(tui\)/);
  } finally { whole(undefined); }
});

test("on: a layout that names a lens writes the setting, both stages answer it, and stage.json keeps each session's own", () => {
  whole("on");
  try {
    settings.patchSettings({ lens: "tui" });
    heard.length = 0;
    const st = S.layout(project, A, { lens: "cli" });
    assert.equal(st.lens, "cli");
    assert.equal(settings.getSettings().lens, "cli");
    assert.equal(onDisk().lens, "cli");
    assert.equal(S.getStage(project, A).lens, "cli");
    assert.equal(S.getStage(project, B).lens, "cli");
    assert.equal(heard.at(-1)?.stage?.lens, "cli", "work.stage.changed carries the person's lens");
    assert.equal(ownLens(A), "ide", "stage.json is not where the lens goes with the switch on");
    // a change on the stage that is not the lens saves stage.json and leaves its own lens alone too
    S.layout(project, B, { tiled: true });
    assert.equal(S.getStage(project, B).lens, "cli");
    assert.equal(ownLens(B), "app");
  } finally { whole(undefined); }
});

test("on: an unknown lens changes nothing, by a layout or by the settings", () => {
  whole("on");
  try {
    settings.patchSettings({ lens: "cli" });
    for (const bad of ["nope", "gui", "", 3, null, { tui: true }]) {
      assert.equal(S.layout(project, A, { lens: bad } as never).lens, "cli", JSON.stringify(bad));
      settings.patchSettings({ lens: bad === null ? "nope" : bad });
      assert.equal(settings.getSettings().lens, "cli", JSON.stringify(bad));
      assert.equal(S.getStage(project, B).lens, "cli");
    }
    settings.patchSettings({ lens: null });
    assert.equal("lens" in settings.getSettings(), false, "null takes the setting away");
    assert.equal(S.getStage(project, A).lens, "app");
  } finally { whole(undefined); }
});

test("the switch off again gives each session back the lens its stage.json kept", () => {
  whole("on");
  settings.patchSettings({ lens: "tui" });
  assert.equal(S.getStage(project, A).lens, "tui");
  whole("off");
  try {
    assert.equal(S.getStage(project, A).lens, "ide");
    assert.equal(S.getStage(project, B).lens, "app");
    S.layout(project, B, { lens: "cli" });
    assert.equal(ownLens(B), "cli", "off, a layout's lens goes to stage.json as today");
    assert.equal(settings.getSettings().lens, "tui", "and not to the setting");
  } finally { whole(undefined); settings.patchSettings({ lens: null }); }
});

test("a layout that changes the lens tells the lens's hearers once; the same lens again, or the switch off, tells nobody", () => {
  const told: string[] = [];
  settings.onLens((l) => told.push(l));
  whole("on");
  try {
    S.layout(project, A, { lens: "ide" });
    S.layout(project, B, { lens: "ide" });
    assert.deepEqual(told, ["ide"]);
    whole("off");
    S.layout(project, A, { lens: "tui" });
    assert.deepEqual(told, ["ide"]);
  } finally { whole(undefined); settings.patchSettings({ lens: null }); }
});

test("the engine's lenses are one list: settings and the stage name the same four", () => {
  assert.deepEqual([...settings.LENSES], [...S.LENSES]);
  assert.deepEqual([...settings.LENSES], ["app", "tui", "cli", "ide"]);
});

test("on: a settings file the disk refuses still saves the rest of the layout, and the lens stays the one on disk, told to nobody", () => {
  const told: string[] = [];
  settings.onLens((l) => told.push(l));
  whole("on");
  try {
    settings.patchSettings({ lens: "tui" });
    S.layout(project, A, { tiled: false });
    heard.length = 0;
    chmodSync(SET, 0o555);   // the settings file cannot be written; stage.json's folder still can
    let st: any;
    try { st = S.layout(project, A, { lens: "cli", tiled: true }); } finally { chmodSync(SET, 0o755); }
    assert.equal(st.tiled, true, "the layout's other changes are kept");
    assert.equal(S.getStage(project, A).tiled, true, "and saved in stage.json");
    assert.equal(st.lens, "tui", "the answer names the lens on disk");
    assert.equal(settings.getSettings().lens, "tui", "the engine's memory agrees with the file");
    assert.equal(onDisk().lens, "tui");
    assert.equal(S.getStage(project, B).lens, "tui");
    assert.equal(heard.at(-1)?.stage?.lens, "tui", "work.stage.changed names no lens that is not on disk");
    assert.deepEqual(told, [], "no face is told a lens that is not on disk");
    // the settings themselves: a refused write leaves memory as the file is
    chmodSync(SET, 0o555);
    try { assert.throws(() => settings.patchSettings({ lens: "ide" })); } finally { chmodSync(SET, 0o755); }
    assert.equal(settings.getSettings().lens, "tui");
    assert.equal(existsSync(FILE + ".tmp"), false, "no half-written file is left");
  } finally { chmodSync(SET, 0o755); whole(undefined); settings.patchSettings({ lens: null }); }
});
