// parts/next.ts answers only Sol's own windows (#1615), as parts/next-calls.ts does: a socket that is not one of Sol's own
// windows (door.ts doorOpen says no, so fromSol is false) is refused for every next.* message it sends, and nothing is
// read or written under the home for it. Sol's own window is answered; with ui.next off, nobody is.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = fs.mkdtempSync(join(tmpdir(), "sol-next-own-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
process.env.CLAUDE_CONFIG_DIR = join(tmp, "no-claude");
process.env.CODEX_HOME = join(tmp, "no-codex");
const part = (await import("../parts/next.js")).default;
const { NOT_OWN } = await import("../parts/next.js");

const TYPES: [string, object][] = [
  ["next.state", {}],
  ["next.pos.set", { id: "t1", x: 1, y: 2, w: 3, h: 4, by: "person" }],
  ["next.zones.set", { folder: "School", zone: "life" }],
  ["next.diary.get", {}],
  ["next.diary.write", { words: "a line from a stranger page" }],
  ["next.diary.remove", { lineId: "dl-000000000000" }],
  ["next.diary.pause", { on: true }],
  ["next.movein.read", {}],
  ["next.movein.keep", { keep: [], fix: [], drop: [] }],
  ["next.folder.pick", {}],
  ["next.movein.lead", { lead: "work" }],
  ["next.movein.back", { batch: "movein-x" }],
  ["next.shelf", {}],
  ["next.shelf.put", { folder: "h:School" }],
  ["next.shelf.take", { folder: "h:School" }],
  ["next.traces", {}],
];

function rig() {
  const home = fs.mkdtempSync(join(tmp, "home-"));
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: { to: object; msg: any }[] = [], all: any[] = [];
  const win = (fromSol: boolean) => {
    const ws = { readyState: 1, send() {} };
    const h = { HOME: home, PORT: 0, ws, send: (to: object, msg: object) => sent.push({ to, msg }), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol, fromApp: fromSol };
    return { ws, ask: (type: string, m: object) => hs.get(type)!({ type, ...m }, h) };
  };
  return { home, hs, sent, all, win };
}
const files = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);

test("every next.* message from a socket that is not Sol's own is refused to it alone, and nothing is written", async () => {
  process.env.SOL_UI_NEXT = "on";
  const { home, hs, sent, all, win } = rig();
  assert.deepEqual([...hs.keys()].sort(), TYPES.map(([t]) => t).sort(), "every message the part hears is tested here");
  const stranger = win(false);
  for (const [type, m] of TYPES) {
    sent.length = 0;
    await stranger.ask(type, m);
    assert.deepEqual(sent.map((s) => s.msg), [{ type: "next.refused", asked: type, why: NOT_OWN }], type);
    assert.equal(sent[0].to, stranger.ws, `${type}: the refusal goes to the asker alone`);
  }
  assert.deepEqual(all, [], "nothing told to every window for a stranger");
  assert.deepEqual(files(join(home, "next")), [], "nothing written under the home for a stranger");
  delete process.env.SOL_UI_NEXT;
});

test("Sol's own window is answered; with ui.next off, nobody is", async () => {
  process.env.SOL_UI_NEXT = "on";
  const { sent, all, win } = rig();
  const mine = win(true);
  await mine.ask("next.state", {});
  assert.equal(sent.at(-1)!.msg.type, "next.state");
  assert.ok(Array.isArray(sent.at(-1)!.msg.needs), "Sol's own window gets its needs");
  await mine.ask("next.diary.write", { words: "my own line" });
  assert.ok(all.some((m) => m.type === "next.diary"), "a write by Sol's own window is told to every window");
  process.env.SOL_UI_NEXT = "off";
  sent.length = 0; all.length = 0;
  await mine.ask("next.state", {});
  await win(false).ask("next.state", {});
  assert.equal(sent.length + all.length, 0, "nothing while ui.next is off, not even a refusal");
  delete process.env.SOL_UI_NEXT;
});
