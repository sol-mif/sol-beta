// next.state and the part as a whole (state.ts, movein.ts, parts/next.ts; #1604, slice 7b of #1615): the state a window
// asks for holds places, pos, zones, today's diary and needs (7a's ranked list, only to Sol's own windows; a push to
// every window leaves it out); a broken store is named in notes; the move-in is read and kept through the part. Off (uiNext() false), no next.* message is answered,
// and nothing under the home is written or even read: node:fs is wrapped while every message is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = fs.mkdtempSync(join(tmpdir(), "sol-next-state-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
// the move-in read also reads Claude Code and Codex: here, a person's own (fixture) ones, never this machine's
process.env.CLAUDE_CONFIG_DIR = join(tmp, "claude");
process.env.CODEX_HOME = join(tmp, "codex");
const part = (await import("../parts/next.js")).default;
const { readMoveIn } = await import("./movein.js");
const { pickFolder } = await import("./pick.js");

function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { hs, sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); fs.mkdirSync(d, { recursive: true }); return d; };

test("next.state: places, pos, today's diary and needs, as the contract says; no zones (BR1: only folders)", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("state"), r = rig(h);
  fs.mkdirSync(join(h, "School"), { recursive: true });
  fs.writeFileSync(join(h, "School", "stickies.md"), "- [ ] Jayden: revise cells\n");
  await r.ask({ type: "next.pos.set", id: "h:school", x: 1, y: 2, w: 3, h: 4, by: "person", touched: true });
  await r.ask({ type: "next.zones.set", folder: "School", zone: "life" });
  await r.ask({ type: "next.diary.write", words: "Jayden revised cells" });
  await r.ask({ type: "next.state" });
  const s = r.sent.at(-1);
  assert.equal(s.type, "next.state");
  assert.deepEqual(Object.keys(s).sort(), ["diaryToday", "folders", "movein", "needs", "places", "pos", "type"]);
  assert.deepEqual(s.places.map((p: { id: string; kind: string }) => [p.id, p.kind]), [["School", "life"]]);
  assert.equal(s.pos["h:school"].by, "person");
  assert.equal(r.sent.find((m: { type: string }) => m.type === "next.refused")?.asked, "next.zones.set", "an old face's zone is refused");
  assert.deepEqual(s.diaryToday.lines.map((l: { words: string }) => l.words), ["Jayden revised cells"]);
  assert.ok(Array.isArray(s.needs));
  assert.ok(r.all.filter((m: { type: string }) => m.type === "next.state").every((m: object) => !("needs" in m)), "a push to every window carries no needs");
});

test("a store set aside is named in notes, in a person's words", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("notes"), r = rig(h);
  fs.mkdirSync(join(h, "next"), { recursive: true });
  fs.writeFileSync(join(h, "next", "pos.json"), "nope");
  await r.ask({ type: "next.state" });
  assert.match(r.sent.at(-1).notes[0], /could not be read, so they start fresh; yours are kept aside as pos\.broken-/);
  assert.ok(fs.readdirSync(join(h, "next")).some((f) => f.startsWith("pos.broken-")));
});

test("the move-in through the part: read answers next.movein, keep writes only next/movein.json and the sort's baseline next/tidy.json", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("movein"), r = rig(h);
  fs.mkdirSync(join(h, "Family"), { recursive: true });
  // Claude Code with a skill, and one session in a temporary folder (a throwaway: never a place)
  const proj = join(tmp, "proj-api");
  fs.mkdirSync(join(proj, "src"), { recursive: true });
  fs.mkdirSync(join(tmp, "claude", "projects", "p"), { recursive: true });
  fs.mkdirSync(join(tmp, "claude", "skills", "review"), { recursive: true });
  fs.writeFileSync(join(tmp, "claude", "projects", "p", "s1.jsonl"), JSON.stringify({ type: "user", cwd: proj }) + "\n");
  await r.ask({ type: "next.movein.read" });
  const read = r.sent.at(-1);
  assert.equal(read.type, "next.movein");
  assert.deepEqual(read.places.map((p: { id: string }) => p.id), ["Family"], "a session in a temporary folder is no place");
  assert.deepEqual(read.ais.map((a: { id: string; skills: string[] }) => [a.id, a.skills]), [["app:claude", ["review"]]]);
  assert.deepEqual(read.apps, [{ app: "claude", projects: 0, sessions: 0 }]);
  assert.equal(read.kept, null, "not moved in yet");
  assert.equal(read.lead, null, "nothing said about what leads yet");
  await r.ask({ type: "next.state" });
  assert.deepEqual(r.sent.at(-1).places.map((p: { id: string }) => p.id), ["Family"], "next.state never reads the apps");
  assert.equal(r.sent.at(-1).movein, null);
  await r.ask({ type: "next.movein.keep", keep: ["Family"], drop: ["s-dev-2"], fix: { Family: { zone: "life" } } });
  await r.ask({ type: "next.movein.keep", keep: ["s-dev-2"] });
  const kept = readMoveIn(h)!;
  assert.deepEqual([kept.keep.sort(), kept.drop, kept.fix], [["Family", "s-dev-2"], [], { Family: { zone: "life" } }]);
  assert.equal(r.sent.at(-1).type, "next.movein.kept");
  // the keep writes the move-in, and beside it the sort's baseline (next/tidy.ts considered, builder T, #1615): each kept
  // folder's reading at the move-in, so a later sort offers only what changed since; never anything else
  assert.deepEqual(fs.readdirSync(join(h, "next")).sort(), ["movein.json", "tidy.json"]);
  const base = JSON.parse(fs.readFileSync(join(h, "next", "tidy.json"), "utf8"));
  assert.deepEqual([base.v, base.seen], [1, {}], "the baseline weighs folders only (w:, h:); Family and s-dev-2 are neither");
  assert.deepEqual(fs.readdirSync(h).sort(), ["Family", "next"]);
  // what the person wants to see first: kept beside the answers, said on next.movein and in next.state to every window
  assert.equal(readMoveIn(h)!.lead, null, "skipped: null");
  r.all.length = 0;
  await r.ask({ type: "next.movein.lead", lead: "work" });
  assert.equal(r.sent.at(-1).type, "next.movein.kept");
  assert.equal(r.sent.at(-1).movein.lead, "work");
  assert.equal(r.all.find((m: { type: string }) => m.type === "next.state")?.movein.lead, "work", "every window hears it");
  await r.ask({ type: "next.movein.keep", keep: ["Family"] });
  assert.equal(readMoveIn(h)!.lead, "work", "a keep leaves the lead as it is");
  await r.ask({ type: "next.movein.read" });
  assert.equal(r.sent.at(-1).lead, "work");
  await r.ask({ type: "next.movein.lead", lead: "sideways" });
  assert.deepEqual(r.sent.at(-1), { type: "next.refused", asked: "next.movein.lead", why: "lead is day, work, both or null" });
  assert.equal(readMoveIn(h)!.lead, "work", "a wrong lead changes nothing");
  await r.ask({ type: "next.movein.lead", lead: null });
  assert.equal(readMoveIn(h)!.lead, null, "skipped again");
});

test("off: no next.* message is answered, and nothing under the home is written or read", async () => {
  process.env.SOL_UI_NEXT = "off";
  const h = home("off"), r = rig(h);
  fs.mkdirSync(join(h, "School"), { recursive: true });
  const touched: string[] = [];
  const anyFs = fs as unknown as Record<string, (...a: unknown[]) => unknown>, kept = new Map<string, unknown>();
  for (const [n, f] of Object.entries(anyFs)) {
    if (typeof f !== "function" || !/Sync$|^create|^open|^read|^write|^append/.test(n)) continue;
    kept.set(n, f);
    anyFs[n] = function (this: unknown, ...a: unknown[]) { if (String(a[0]).startsWith(h)) touched.push(`${n} ${a[0]}`); return f.apply(this, a); };
  }
  syncBuiltinESMExports();
  try {
    const all = [
      { type: "next.state" }, { type: "next.pos.set", id: "h:school", x: 1, y: 2, w: 3, h: 4, by: "person", touched: true },
      { type: "next.zones.set", folder: "School", zone: "life" }, { type: "next.diary.get" }, { type: "next.diary.write", words: "Sam" },
      { type: "next.diary.remove", lineId: "dl-000000000000" }, { type: "next.diary.pause", on: true },
      { type: "next.movein.read" }, { type: "next.movein.keep", keep: ["School"] }, { type: "next.traces" }, { type: "next.folder.pick" }, { type: "next.movein.lead", lead: "work" },
      { type: "next.movein.back", batch: "movein-x" }, { type: "next.shelf" }, { type: "next.shelf.put", folder: "h:School" }, { type: "next.shelf.take", folder: "h:School" },
    ];
    assert.deepEqual([...r.hs.keys()].sort(), all.map((m) => m.type).sort(), "every message this part answers is tried");
    for (const m of all) await r.ask(m);
  } finally { for (const [n, f] of kept) anyFs[n] = f as never; syncBuiltinESMExports(); }
  assert.deepEqual([r.sent, r.all], [[], []]);
  assert.deepEqual(touched, []);
  assert.deepEqual(fs.readdirSync(h), ["School"]);
  process.env.SOL_UI_NEXT = "on";
});

test("the folder picker: a chosen folder answers its path and what it holds; cancelled is an answer", async () => {
  if (process.platform !== "darwin") return;
  const dir = join(tmp, "picked-app");
  fs.mkdirSync(join(dir, ".g" + "it"), { recursive: true });
  fs.writeFileSync(join(dir, "CLAUDE.md"), "x");
  const said: string[][] = [];
  const ok = ((_c: string, a: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) => { said.push(a); cb(null, dir + "/\n", ""); }) as never;
  assert.deepEqual(await pickFolder("Choose \"a\" folder", ok), { path: dir, name: "picked-app", kind: "build", repo: true, rules: ["CLAUDE.md"] });
  assert.match(said[0][1], /choose folder with prompt "Choose \\"a\\" folder"/);
  const no = ((_c: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) => cb(new Error("x"), "", "execution error: User canceled. (-128)")) as never;
  assert.deepEqual(await pickFolder(undefined, no), { cancelled: true });
});
