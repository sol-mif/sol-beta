// Open it for the person (#1521, src/openfor.ts): the three tools exist only while open.for is on, open what was named
// in the window, and change a setting only on the person's own words from this turn, and only one of their own choices.
// On a settings file of its own (SOL_SETTINGS), so the real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = mkdtempSync(join(tmpdir(), "sol-openfor-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
process.env.SOL_VERSION = "product";   // a tester's Sol: open.for stands on unset now its card stands at product (#1667)
delete process.env.SOL_OPEN_FOR;
after(() => { delete process.env.SOL_OPEN_FOR; delete process.env.SOL_VERSION; rmSync(DIR, { recursive: true, force: true }); });

const O = await import("../src/openfor.ts");
const S = await import("../src/settings.ts");
const T = await import("../src/tools.ts");
const said: object[] = [];
let settingsTold = 0;
O.setOpenForFaces((m) => said.push(m));
S.onSeatSet(() => { settingsTold++; });
const txt = (r: { content: { type: string; text?: string }[] }) => String(r.content[0]?.text ?? "");
const names = () => T.solToolsNow().map((t) => t.name);

test("on for a tester unset (product, #1667); off: none of the three is offered, and a call is refused", async () => {
  assert.equal(S.openFor(), true, "at product a tester's Sol has it on");
  process.env.SOL_OPEN_FOR = "off";
  assert.equal(S.openFor(), false);
  for (const n of ["open_settings", "open_pane", "set_setting"]) assert.ok(!names().includes(n), n);
  const r = await T.runSolTool("open_settings", { drawer: "look" }, { sessionId: "a" });
  assert.equal(r.isError, true);
  assert.deepEqual(said, []);
  delete process.env.SOL_OPEN_FOR;
});

test("on for the team (concept), and by the setting or the env", () => {
  process.env.SOL_VERSION = "concept";
  assert.equal(S.openFor(), true);
  for (const n of ["open_settings", "open_pane", "set_setting"]) assert.ok(names().includes(n), n);
  S.patchSettings({ open: { for: false } });
  assert.equal(S.openFor(), false, "a person's false wins over the stage");
  process.env.SOL_OPEN_FOR = "on";
  assert.equal(S.openFor(), true, "the env wins over the setting");
  delete process.env.SOL_OPEN_FOR;
  S.patchSettings({ open: { for: true } });
  assert.equal(S.openFor(), true);
});

test("open_settings and open_pane tell the window what to open; an unknown one is refused with the list", async () => {
  said.length = 0;
  let r = await T.runSolTool("open_settings", { drawer: "Look" }, { sessionId: "s1" });
  assert.ok(!r.isError, txt(r));
  assert.deepEqual(said.at(-1), { type: "open.for", what: "settings", drawer: "look", sessionId: "s1" });
  r = await T.runSolTool("open_pane", { button: "changes" }, { sessionId: "s1" });
  assert.deepEqual(said.at(-1), { type: "open.for", what: "pane", button: "changes", sessionId: "s1" });
  r = await T.runSolTool("open_settings", { drawer: "colours" }, { sessionId: "s1" });
  assert.equal(r.isError, true);
  assert.match(txt(r), /look/);
  r = await T.runSolTool("open_pane", { button: "rm -rf" }, { sessionId: "s1" });
  assert.equal(r.isError, true);
  assert.equal(said.length, 2);
});

test("set_setting: only on the person's words from this very turn", async () => {
  const was = S.getSettings().look.text;
  // nothing heard in this conversation: refused
  let r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "make the text 18" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  assert.equal(S.getSettings().look.text, was);
  // words the agent made up, not the person's: refused
  O.heard("s2", "can I make the text bigger?");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "yes, make it 18" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  assert.equal(S.getSettings().look.text, was);
  // the next turn says yes: changed, and every window told
  O.heard("s2", "Yes — make it 18, please.");
  const before = settingsTold;
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "yes make it 18" }, { sessionId: "s2" });
  assert.ok(!r.isError, txt(r));
  assert.equal(S.getSettings().look.text, 18);
  assert.equal(settingsTold, before + 1);
  // a later turn without the words: that yes is used up
  O.heard("s2", "thanks");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "yes make it 18" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  assert.equal(S.getSettings().look.text, 18);
  // a bare yes is no ask for a change
  O.heard("s2", "ok");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "ok" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  // only whole words count; "it 18" is not in "make it 180"
  O.heard("s2", "make it 180");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "make it 18" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  // a turn Sol or another session started: the person's words no longer stand
  O.heard("s2", "make it 20 now");
  O.forget("s2");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "make it 20 now" }, { sessionId: "s2" });
  assert.equal(r.isError, true);
  // a Home turn carries its own words
  r = await T.runSolTool("set_setting", { patch: { look: { text: 17 } }, yes: "text at 17" }, { sessionId: "h1", said: "put the text at 17 please" });
  assert.ok(!r.isError, txt(r));
  assert.equal(S.getSettings().look.text, 17);
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "text at 17" }, { sessionId: "h1", said: "what else?" });
  assert.equal(r.isError, true);
  S.patchSettings({ look: { text: 18 } });
  // Chinese and Japanese have no spaces between words (#1639): matched by characters, four at least
  O.heard("s5", "把字放大到18，謝謝");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 19 } }, yes: "把字放大到18" }, { sessionId: "s5" });
  assert.ok(!r.isError, txt(r));
  assert.equal(S.getSettings().look.text, 19);
  O.heard("s5", "字改成 20 好了");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "改成20" }, { sessionId: "s5" });
  assert.ok(!r.isError, "a space beside a character does not count: " + txt(r));
  O.heard("s5", "字可以大一點嗎？");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 21 } }, yes: "好，把字放大" }, { sessionId: "s5" });
  assert.equal(r.isError, true, "words the agent made up");
  O.heard("s5", "好");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 21 } }, yes: "好" }, { sessionId: "s5" });
  assert.equal(r.isError, true, "a bare yes");
  O.heard("s5", "好的");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 21 } }, yes: "好的" }, { sessionId: "s5" });
  assert.equal(r.isError, true, "two characters are one word");
  O.heard("s5", "改成180");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "改成18" }, { sessionId: "s5" });
  assert.equal(r.isError, true, "18 is not in 180");
  O.heard("s5", "はい、文字を大きくしてください");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 18 } }, yes: "文字を大きくして" }, { sessionId: "s5" });
  assert.ok(!r.isError, txt(r));
  O.heard("s5", "はい");
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "はい" }, { sessionId: "s5" });
  assert.equal(r.isError, true, "a bare はい");
  assert.equal(S.getSettings().look.text, 18);
  // another conversation's words are not this one's
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "thanks" }, { sessionId: "s3" });
  assert.equal(r.isError, true);
});

test("set_setting never changes the other engine switches, the version, the counting or the rest of defaults, even when asked", async () => {
  for (const patch of [{ version: "concept" }, { track: { usage: false } }, { reach: { tools: true } }, { open: { for: false } },
    { defaults: { model: { claude: "x" } } }, { defaults: { mode: "auto", seat: "claude" } }, { defaults: { mode: "anything" } },
    { cowork: { v3: "yes" } }, { ui: { next: true, other: 1 } }, { switches: { "open.for": true } }, { switches: { "reach.tools": null } }, { switches: { "reach.room": "off" } }, { switches: { "reach.tools": true } },
    { switches: { "side.sorted": "on" } }, { look: { text: 16 }, home: { whole: true } }]) {
    O.heard("s4", "turn it on");
    const r = await T.runSolTool("set_setting", { patch, yes: "turn it on" }, { sessionId: "s4" });
    assert.equal(r.isError, true, JSON.stringify(patch));
  }
  assert.equal(S.getSettings().track.usage, true);
  assert.equal(S.getSettings().look.text, 18);
  assert.equal(S.getSettings().defaults.seat, "codex");
  assert.equal(S.getSettings().defaults.mode, "default");
});

test("Cowork old or new and the face old or new turn on the person's word, and every answer says which is on (#21)", async () => {
  let v3 = 0, next = 0;
  // the new face stands on by default since the BR1 join (#1615): this person had turned it off
  S.patchSettings({ ui: { next: false } });
  S.onCoworkV3(() => { v3++; });
  S.onUiNext(() => { next++; });
  O.heard("c1", "switch me to the new cowork please");
  let r = await T.runSolTool("set_setting", { patch: { cowork: { v3: true } }, yes: "the new cowork" }, { sessionId: "c1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.coworkV3(), true);
  assert.equal(v3, 1, "the live switch heard it, no restart");
  assert.match(txt(r), /Now: Cowork is the new one \(v3\), the face is the old one/);
  O.heard("c1", "切換到舊的 cowork");
  r = await T.runSolTool("set_setting", { patch: { switches: { "cowork.v3": false } }, yes: "切換到舊的" }, { sessionId: "c1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.coworkV3(), false);
  assert.match(txt(r), /Cowork is the old one/);
  O.heard("c1", "turn on the new interface");
  r = await T.runSolTool("set_setting", { patch: { ui: { next: true } }, yes: "new interface" }, { sessionId: "c1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.uiNext(), true);
  assert.equal(next, 1);
  assert.match(txt(r), /the face is the new one/);
  // not on words they did not say; and an agent's turn (forgotten words) changes nothing
  O.heard("c1", "what is the new interface?");
  r = await T.runSolTool("set_setting", { patch: { ui: { next: false } }, yes: "turn it off" }, { sessionId: "c1" });
  assert.equal(r.isError, true);
  O.forget("c1");
  r = await T.runSolTool("set_setting", { patch: { ui: { next: false } }, yes: "new interface" }, { sessionId: "c1" });
  assert.equal(r.isError, true);
  assert.equal(S.uiNext(), true);
  // opening Settings says it too
  r = await T.runSolTool("open_settings", { drawer: "switches" }, { sessionId: "c1" });
  assert.match(txt(r), /Now: Cowork is the old one, the face is the new one \(ui\.next\)/);
  S.patchSettings({ cowork: { v3: null }, ui: { next: null } });
});

test("a window card's switch is kept in the person's settings and sent to the window in place of its station (#21)", async () => {
  O.heard("w1", "hide the social view please");
  let r = await T.runSolTool("set_setting", { patch: { switches: { "view.social": false } }, yes: "hide the social view" }, { sessionId: "w1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.getSettings().switches?.["view.social"], false);
  assert.equal(S.readings().window["view.social"], false);
  // a card whose screen does not follow the settings yet is refused, so nothing is saved that would change nothing
  O.heard("w1", "turn the sorted sidebar on");
  r = await T.runSolTool("set_setting", { patch: { switches: { "side.sorted": true } }, yes: "sorted sidebar on" }, { sessionId: "w1" });
  assert.equal(r.isError, true, txt(r));
  assert.match(txt(r), /open_settings switches/);
  assert.equal(S.getSettings().switches?.["side.sorted"], undefined);
  O.heard("w1", "put the social view back to normal");
  r = await T.runSolTool("set_setting", { patch: { switches: { "view.social": null } }, yes: "back to normal" }, { sessionId: "w1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.getSettings().switches, undefined);
  S.patchSettings({ switches: { "ui.next": true, "build.snap": 1 } });
  assert.equal(S.getSettings().switches, undefined, "an unknown name or a value that is not a turn is dropped");
});

test("agents.mode is turned by the person's word as the views are: the window reads it from settings.window (#18)", async () => {
  O.heard("w2", "turn agents off please");
  let r = await T.runSolTool("set_setting", { patch: { switches: { "agents.mode": false } }, yes: "turn agents off" }, { sessionId: "w2" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.getSettings().switches?.["agents.mode"], false);
  assert.equal(S.readings().window["agents.mode"], false);
  O.heard("w2", "put agents back to normal");
  r = await T.runSolTool("set_setting", { patch: { switches: { "agents.mode": null } }, yes: "back to normal" }, { sessionId: "w2" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.getSettings().switches, undefined);
  // on by word only where its card stands in this Sol's version: were it short of product, a tester's Sol has none of it
  // yet; product/agents stands at product (#1786), so a tester's Sol (product) turns it on
  const V = await import("../src/versions.ts");
  const table = V.STAGES as Record<string, string>, at = table["agents.mode"];
  const was = process.env.SOL_VERSION;
  try {
    process.env.SOL_VERSION = "product";
    O.heard("w2", "turn agents on please");
    table["agents.mode"] = "complete";
    r = await T.runSolTool("set_setting", { patch: { switches: { "agents.mode": true } }, yes: "turn agents on" }, { sessionId: "w2" });
    assert.equal(r.isError, true, txt(r));
    assert.match(txt(r), /not part of this Sol yet/);
    assert.equal(S.getSettings().switches, undefined);
    table["agents.mode"] = at;
    assert.equal(at, "product", "the card stands at product today (stations.json, #1786)");
    r = await T.runSolTool("set_setting", { patch: { switches: { "agents.mode": true } }, yes: "turn agents on" }, { sessionId: "w2" });
    assert.equal(r.isError, undefined, txt(r));
    assert.equal(S.readings().window["agents.mode"], true);
    S.patchSettings({ switches: { "agents.mode": null } });
    process.env.SOL_VERSION = "concept";
    r = await T.runSolTool("set_setting", { patch: { switches: { "agents.mode": true } }, yes: "turn agents on" }, { sessionId: "w2" });
    assert.equal(r.isError, undefined, txt(r));
    assert.equal(S.readings().window["agents.mode"], true);
    S.patchSettings({ switches: { "agents.mode": null } });
  } finally { process.env.SOL_VERSION = was; table["agents.mode"] = at; }
});

test("asking a teammate's agent and the agents' room turn off at the person's word, and never back on by a seat (the door on #1718, question 4; #36)", async () => {
  O.heard("r1", "stop sending my words to teammates, turn off asking other agents and the room");
  let r = await T.runSolTool("set_setting", { patch: { switches: { "reach.tools": false, "reach.room": false } }, yes: "turn off asking other agents and the room" }, { sessionId: "r1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.deepEqual(S.getSettings().reach, { tools: false, room: false });
  assert.equal(S.reachTools(), false);
  assert.equal(S.reachRoom(), false);
  assert.match(txt(r), /asking teammates' agents is off, the agents' room is off/);
  // back on sends their words out again: never a seat's to do, on any words, first or second (#36); the person's, by hand
  for (const words of ["turn asking other agents back on", "yes go ahead"]) {
    O.heard("r1", words);
    r = await T.runSolTool("set_setting", { patch: { switches: { "reach.tools": true } }, yes: words }, { sessionId: "r1" });
    assert.equal(r.isError, true, txt(r));
    assert.match(txt(r), /only turns off by asking/);
    assert.match(txt(r), /Settings is open on me .*one press turns it on/);
    assert.deepEqual(S.getSettings().reach, { tools: false, room: false });
  }
  assert.deepEqual(said.slice(-2).map((m) => [m.type, (m as { what?: string }).what, (m as { drawer?: string }).drawer]),
    [["open.for", "settings", "me"], ["open.for", "settings", "me"]], "each time, Settings opens on me, at the switch, for the person's press");
  // the room's card stands at product (#1786): a tester's Sol has it, and back on is still the person's own press
  const was = process.env.SOL_VERSION;
  process.env.SOL_VERSION = "product";
  O.heard("r1", "turn the agents room on");
  r = await T.runSolTool("set_setting", { patch: { switches: { "reach.room": true } }, yes: "agents room on" }, { sessionId: "r1" });
  process.env.SOL_VERSION = was;
  assert.equal(r.isError, true, txt(r));
  assert.match(txt(r), /only turns off by asking/);
  assert.equal(S.getSettings().reach?.room, false);
  O.heard("r1", "put the room back to default");
  r = await T.runSolTool("set_setting", { patch: { switches: { "reach.room": null } }, yes: "back to default" }, { sessionId: "r1" });
  assert.equal(r.isError, true, "null is no way back on either");
  // a looser mode with a reach switch: the mode is never the AI's to loosen (#36), so nothing in the patch changes
  O.heard("r1", "accept edits mode and the room off");
  r = await T.runSolTool("set_setting", { patch: { defaults: { mode: "acceptEdits" }, switches: { "reach.room": false } }, yes: "the room off" }, { sessionId: "r1" });
  assert.equal(r.isError, true);
  assert.match(txt(r), /an AI never loosens/);
  assert.equal(S.getSettings().defaults.mode, "default");
  // never without the person's words this turn
  O.heard("r1", "thanks");
  r = await T.runSolTool("set_setting", { patch: { switches: { "reach.room": true } }, yes: "room back on" }, { sessionId: "r1" });
  assert.equal(r.isError, true);
  assert.equal(S.getSettings().reach?.room, false);
});

test("a seat makes the mode new sessions start in stricter, never looser, whatever the person's words or turns (#36)", async () => {
  const from0 = said.length;
  O.heard("m1", "start new sessions in plan mode");
  let r = await T.runSolTool("set_setting", { patch: { defaults: { mode: "plan" } }, yes: "plan mode" }, { sessionId: "m1" });
  assert.equal(r.isError, undefined, "a stricter mode takes one yes");
  assert.equal(S.getSettings().defaults.mode, "plan");
  // every looser mode, asked once, asked again, then "confirmed" in a later turn: never set, by any of these routes
  const words = ["yes I confirm, go ahead", "yes go ahead and turn it on", "好，確定可以"];
  for (const mode of ["default", "acceptEdits", "auto", "bypassPermissions"]) {
    for (const patch of [{ defaults: { mode } }, { look: { text: 17 }, defaults: { mode } }, { switches: { "defaults.mode": mode } } as object]) {
      for (const w of [`start new sessions in ${mode} mode`, ...words]) {
        O.heard("m1", w);
        r = await T.runSolTool("set_setting", { patch, yes: w.split(/[ ，]/).slice(0, 2).join(" ").trim() || w }, { sessionId: "m1" });
        assert.equal(r.isError, true, `${mode} by ${JSON.stringify(patch)} on "${w}"`);
        r = await T.runSolTool("set_setting", { patch, yes: w }, { sessionId: "m1" });
        assert.equal(r.isError, true, `${mode} by ${JSON.stringify(patch)} on "${w}" quoted whole`);
        assert.equal(S.getSettings().defaults.mode, "plan");
      }
    }
  }
  assert.equal(S.getSettings().look.text, 18, "a patch with a looser mode in it changes nothing else either");
  assert.ok(said.slice(from0).some((m) => JSON.stringify(m).includes('"drawer":"defaults"')), "the refusal opens Settings on defaults for the person");
  // the same through Home's turn (said), and from any starting mode up
  for (const from of ["plan", "default", "acceptEdits", "auto"] as const) {
    S.patchSettings({ defaults: { mode: from } });
    for (const mode of ["default", "acceptEdits", "auto", "bypassPermissions"] as const) {
      if (O.LOOSENESS[mode] <= O.LOOSENESS[from]) continue;
      r = await T.runSolTool("set_setting", { patch: { defaults: { mode } }, yes: "yes please" }, { said: "yes please" });
      assert.equal(r.isError, true, `${from} to ${mode} from Home`);
      assert.equal(S.getSettings().defaults.mode, from);
    }
  }
  // lowering stays the person's one word (#1708 kept)
  S.patchSettings({ defaults: { mode: "bypassPermissions" } });
  for (const mode of ["auto", "acceptEdits", "default", "plan"] as const) {
    O.heard("m1", `start new sessions in ${mode} mode please`);
    r = await T.runSolTool("set_setting", { patch: { defaults: { mode } }, yes: `${mode} mode` }, { sessionId: "m1" });
    assert.equal(r.isError, undefined, txt(r));
    assert.equal(S.getSettings().defaults.mode, mode);
  }
  S.patchSettings({ defaults: { mode: "default" } });
});

test("the engine cards' switches turn on the person's word, and the reading follows at once (#1788, gate one q4)", async () => {
  const was = process.env.SOL_VERSION;
  process.env.SOL_VERSION = "concept";
  for (const e of ["SOL_LIVE_CONTEXT", "SOL_LOG_KINDS", "SOL_MAP_GROWN"]) delete process.env[e];
  const reads = () => [S.liveContext(), S.logKinds(), S.mapGrown()];
  assert.deepEqual(reads(), [true, true, true], "the team's Sol: all three on unset (concept)");
  // by name, all three off in one ask
  O.heard("e1", "turn off the live context ring, the narrow log and the grown map please");
  let r = await T.runSolTool("set_setting", { patch: { switches: { "work.liveContext": false, "log.kinds": false, "map.grown": false } }, yes: "the grown map please" }, { sessionId: "e1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.deepEqual([S.getSettings().work, S.getSettings().log, S.getSettings().map], [{ liveContext: false }, { kinds: false }, { grown: false }]);
  assert.deepEqual(reads(), [false, false, false], "read again at once, no restart");
  // by its own key, back on
  O.heard("e1", "turn the live context ring back on");
  r = await T.runSolTool("set_setting", { patch: { work: { liveContext: true } }, yes: "context ring back on" }, { sessionId: "e1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.liveContext(), true);
  assert.match(txt(r), /the person set work\.liveContext on, log\.kinds off, map\.grown off/, "the answer says where they stand");
  // asked on and off at once: refused, never one quietly over the other
  r = await T.runSolTool("set_setting", { patch: { work: { liveContext: false }, switches: { "work.liveContext": true } }, yes: "context ring back on" }, { sessionId: "e1" });
  assert.equal(r.isError, true);
  assert.equal(S.liveContext(), true);
  // the env still wins over the person's setting, as for every switch
  process.env.SOL_LIVE_CONTEXT = "off";
  assert.equal(S.liveContext(), false, "env wins");
  delete process.env.SOL_LIVE_CONTEXT;
  // never without the person's words this turn
  O.heard("e1", "thanks");
  r = await T.runSolTool("set_setting", { patch: { switches: { "map.grown": true } }, yes: "grown map on" }, { sessionId: "e1" });
  assert.equal(r.isError, true);
  assert.equal(S.mapGrown(), false);
  r = await T.runSolTool("set_setting", { patch: { log: { kinds: true } }, yes: "narrow log on" }, { sessionId: "nobody-said" });
  assert.equal(r.isError, true);
  assert.equal(S.logKinds(), false);
  // only the one key, only true or false: nothing else in those objects, and no other engine switch by the same road
  O.heard("e1", "turn it on");
  for (const patch of [{ work: { liveContext: true, other: 1 } }, { log: { kinds: true, since: 3 } }, { map: { grown: "on" } }, { map: {} },
    { switches: { "map.grown": null } }, { switches: { "log.kinds": "on" } }, { work: { liveContext: null } },
    { switches: { "open.for": false } }, { switches: { "pause.signal": true } }, { switches: { "onboarding.reads": false } }, { open: { for: false } }, { pause: { signal: true } }]) {
    r = await T.runSolTool("set_setting", { patch, yes: "turn it on" }, { sessionId: "e1" });
    assert.equal(r.isError, true, JSON.stringify(patch));
  }
  assert.deepEqual(reads(), [true, false, false]);
  assert.equal(S.getSettings().open?.for, true);
  // a tester's Sol (product): work.liveContext and map.grown stand at product (#1786), log.kinds at concept is not there
  // yet: off goes through, on is not offered
  process.env.SOL_VERSION = "product";
  O.heard("e1", "turn the narrow log on");
  r = await T.runSolTool("set_setting", { patch: { switches: { "log.kinds": true } }, yes: "narrow log on" }, { sessionId: "e1" });
  assert.equal(r.isError, true);
  assert.match(txt(r), /not part of this Sol yet/);
  O.heard("e1", "turn the live context ring off");
  r = await T.runSolTool("set_setting", { patch: { switches: { "work.liveContext": false } }, yes: "context ring off" }, { sessionId: "e1" });
  assert.equal(r.isError, undefined, txt(r));
  assert.equal(S.liveContext(), false);
  process.env.SOL_VERSION = was;
});

test("the panes named are the buttons that open one, and the drawers are Settings' own", () => {
  const mac = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "mac", "src");
  const panes = readdirSync(join(mac, "buttons")).filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(mac, "buttons", f), "utf8"))
    .filter((t) => /kind: "pane"/.test(t)).map((t) => /id: "([a-z-]+)"/.exec(t)?.[1]).filter(Boolean).sort();
  assert.deepEqual([...O.PANES].sort(), panes);
  const all = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? all(join(d, e.name)) : e.name.endsWith(".tsx") ? [join(d, e.name)] : []);
  const settings = all(mac).map((f) => readFileSync(f, "utf8")).join("\n");
  for (const d of O.DRAWERS) assert.ok(settings.includes(`toggle("${d}")`), `Settings opens ${d}`);
});
