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
process.env.SOL_VERSION = "complete";   // a tester's Sol: open.for stands off until set
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

test("off: none of the three is offered, and a call is refused", async () => {
  assert.equal(S.openFor(), false);
  for (const n of ["open_settings", "open_pane", "set_setting"]) assert.ok(!names().includes(n), n);
  const r = await T.runSolTool("open_settings", { drawer: "look" }, { sessionId: "a" });
  assert.equal(r.isError, true);
  assert.deepEqual(said, []);
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
  // another conversation's words are not this one's
  r = await T.runSolTool("set_setting", { patch: { look: { text: 20 } }, yes: "thanks" }, { sessionId: "s3" });
  assert.equal(r.isError, true);
});

test("set_setting never changes a switch, the version or the counting, even when asked", async () => {
  for (const patch of [{ version: "concept" }, { track: { usage: false } }, { reach: { tools: true } }, { open: { for: false } }, { defaults: { mode: "bypassPermissions" } }, { look: { text: 16 }, home: { whole: true } }]) {
    O.heard("s4", "turn it on");
    const r = await T.runSolTool("set_setting", { patch, yes: "turn it on" }, { sessionId: "s4" });
    assert.equal(r.isError, true, JSON.stringify(patch));
  }
  assert.equal(S.getSettings().track.usage, true);
  assert.equal(S.getSettings().look.text, 18);
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
