// make_automation (next/automation-tool.ts; #1615 BR1, birth.html row 5), on a temp SOL_HOME: a session makes an
// automation paused, with `in` its session, every window is told the list, a time it cannot read and a missing session
// are refused and nothing is written, and the tool is neither listed nor run while ui.next is off. Through
// workspace-tool.ts, the door tools.ts calls.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-autotool-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });

const T = await import("./automation-tool.js");
const A = await import("./automations.js");
const WS = await import("./workspace-tool.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
const said = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join(" ");

test("a session makes it paused, on its own table; every window is told", () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home(), told: { type: string; autos?: { in?: string; on: boolean }[] }[] = [];
  const r = T.runAutoTool("make_automation", { does: "Check every menu's prices and say which changed.", when: "on Mon at 09:00", name: "Check menu prices" }, h, "5f0c-sid", "/v/sites", (m) => told.push(m as never));
  assert.ok(!r.isError, said(r));
  const [a] = A.readAutos(h);
  assert.equal(a.in, "5f0c-sid", "it lives in the session that made it");
  assert.equal(a.on, false, "made paused");
  assert.equal(a.cwd, "/v/sites", "it works in its session's folder");
  assert.equal(a.name, "Check menu prices");
  assert.match(said(r), /paused/);
  assert.match(said(r), /Turn on/);
  assert.equal(told.at(-1)?.type, "next.autos");
  assert.equal(told.at(-1)?.autos?.[0].in, "5f0c-sid", "the windows get its session, to draw it on that table");
});

test("refused, and nothing written: a time it cannot read, no session, an unknown name", () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home(), none = () => {};
  const bad = T.runAutoTool("make_automation", { does: "Check the prices.", when: "sometimes" }, h, "s1", undefined, none);
  assert.ok(bad.isError);
  assert.match(said(bad), /every day at 08:00/, "it says how to say when");
  assert.ok(T.runAutoTool("make_automation", { does: "Check the prices.", when: "every day at 08:00" }, h, undefined, undefined, none).isError, "only a session makes one");
  assert.ok(T.runAutoTool("make_nothing", {}, h, "s1", undefined, none).isError);
  assert.equal(A.readAutos(h).length, 0);
});

test("listed and run through the workspace door only while ui.next is on", async () => {
  const h = home();
  process.env.SOL_UI_NEXT = "off";
  assert.equal(T.autoToolsNow().length, 0);
  assert.ok(!WS.workspaceToolsNow().some((t) => t.name === "make_automation"));
  assert.ok((await WS.runWorkspaceTool("make_automation", { does: "x", when: "every day at 08:00" }, h, "s1")).isError);
  assert.equal(A.readAutos(h).length, 0);
  process.env.SOL_UI_NEXT = "on";
  assert.ok(WS.workspaceToolsNow().some((t) => t.name === "make_automation"));
  const r = await WS.runWorkspaceTool("make_automation", { does: "Sum up the week.", when: "on Fri at 17:00" }, h, "s2");
  assert.ok(!r.isError, said(r));
  assert.equal(A.readAutos(h)[0].in, "s2");
});

test("a session Add's Automation opened is told what it is for", () => {
  assert.match(T.AUTOMATION_PURPOSE, /make_automation/);
  assert.match(T.AUTOMATION_PURPOSE, /what should happen and when/);
});
