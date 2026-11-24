// #1802: a folder's last word follows a session that is continued. The folder writes back what a session said when one
// of its turns ends (work/runs.ts onTurnEnd), not only when the 5 s clock happens to see it working and then quiet: a
// continued turn (the window's work.say) can start and end between two looks, and the folder kept the first answer.
// Against a temp SOL_HOME, settings and state, with fake session hands and a fake turn-end signal: no session starts.
// Signed: franktsai2008-eng's agent (#1802, #1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-folders-continue-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
process.env.CLAUDE_CONFIG_DIR = join(tmp, "claude");
process.env.CODEX_HOME = join(tmp, "codex");
process.env.SOL_UI_NEXT = "on";
const F = await import("./folders.js");
const { setOneDeps } = await import("../work/one.js");
const notesPart = await import("../parts/next-notes.js");
const part = notesPart.default;

let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
const API = `w:${join(tmp, "code", "api")}`;
const settle = () => new Promise((r) => setTimeout(r, 30));

/** the engine as the folder part sees it: runs that are busy or quiet, last words, and every turn's end */
function engine() {
  const runs = new Map<string, { working: boolean; busy: boolean; perms: { size: number } }>(), words = new Map<string, string>();
  const says: { id: string; text: string }[] = [];
  setOneDeps({
    say: async (id, text) => { says.push({ id, text }); runs.set(id, { working: true, busy: true, perms: { size: 0 } }); },
    run: (id) => runs.get(id) as never,
    sessions: async () => [],
    lastWords: async (id) => words.get(id) ?? "",
    tell: () => {},
  });
  const hs = new Map<string, (m: any, h: any) => unknown>(), starts: ((e: any) => void)[] = [];
  let ends: ((id: string) => void) | null = null;
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: (f: (e: any) => void) => starts.push(f), route: () => {} } as never, (fn) => { ends = fn; });
  const h = home(), told: any[] = [], sent: any[] = [];
  const e = { HOME: h, PORT: 0, send() {}, everyone: (m: object) => told.push(m) };
  for (const f of starts) f(e);
  const heard = { ...e, ws: {}, send: (_w: unknown, m: object) => sent.push(m), fromSol: true, fromApp: true, conn: { chars: 0 } };
  const ask = (type: string, m: object) => hs.get(type)!(m, heard);
  /** one turn of the session, short, as a one-word answer is: it works, says `w` and goes quiet between two looks of
   *  the folders' 5 s clock; the engine tells the turn's end (to whoever listens), then the clock looks once */
  const turn = async (id: string, w: string) => {
    runs.set(id, { working: true, busy: true, perms: { size: 0 } });
    words.set(id, w);
    runs.set(id, { working: false, busy: false, perms: { size: 0 } });
    ends?.(id);
    await settle();
    await F.watch(h, notesPart.folderHands());
  };
  return { h, ask, turn, runs, words, says, told, sent, end: (id: string) => ends?.(id) };
}

test("#1802: a session continued after its first answer moves its folder's last word on, told to every window", async () => {
  const x = engine();
  await x.ask("next.folder.start", { folder: API, text: "Reply with the one word: ok" });
  const sessionId = x.sent.find((m) => m.type === "next.folder.started")?.sessionId as string;
  assert.ok(sessionId, "the session started in the folder");

  await x.turn(sessionId, "ok");
  assert.deepEqual(F.folderMsg(x.h, API).backs.map((b) => b.words), ["ok"]);

  // the bar's talk move continues the same session (work.say): a short turn, never seen working by the clock
  await x.turn(sessionId, "again");
  const msg = F.folderMsg(x.h, API);
  assert.deepEqual(msg.backs.map((b) => b.words), ["again"], "the folder's last word is the session's latest, one entry per session");
  assert.equal(msg.sessions.find((s) => s.sessionId === sessionId)?.working, false);
  const lastTold = x.told.filter((m) => m.type === "next.folder" && m.folder === API).at(-1);
  assert.deepEqual(lastTold?.backs.map((b: { words: string }) => b.words), ["again"], "every window hears it, no next.folder.get needed");
  // a third turn the same day: still one entry, still one Diary line a day (folders.ts writeBack)
  await x.turn(sessionId, "and once more");
  assert.deepEqual(F.folderMsg(x.h, API).backs.map((b) => b.words), ["and once more"]);
});

test("#1802: a turn's end that finds the session still busy leaves it to the clock; a session no folder keeps is left alone", async () => {
  const h = home(), runs = new Map<string, "working" | "idle">(), words = new Map<string, string>();
  const hands: import("./folders.js").FolderHands = {
    start: async (id) => { runs.set(id, "working"); },
    status: (id) => runs.get(id) ?? "idle",
    lastWords: async (id) => words.get(id) ?? "",
    say: async () => {},
  };
  const s = await F.startIn(h, { folder: API, text: "Tidy the docs" }, hands);
  assert.ok(s.ok);
  const id = s.ok ? s.sessionId : "";
  runs.set(id, "idle"); words.set(id, "Docs tidied.");
  assert.deepEqual(await F.turnEnded(h, id, hands), [API]);
  assert.equal(F.folderMsg(h, API).backs[0].words, "Docs tidied.");
  // continued; its turn ended but its agents still work: marked working, written back by the clock once quiet
  runs.set(id, "working"); words.set(id, "Half the index rebuilt.");
  assert.deepEqual(await F.turnEnded(h, id, hands), [API]);
  assert.equal(F.folderMsg(h, API).sessions[0].working, true);
  assert.equal(F.folderMsg(h, API).backs[0].words, "Docs tidied.", "nothing written while it works");
  assert.deepEqual(await F.turnEnded(h, id, hands), [], "told again while still working: no change");
  runs.set(id, "idle"); words.set(id, "Index rebuilt.");
  assert.deepEqual(await F.watch(h, hands), [API]);
  assert.equal(F.folderMsg(h, API).backs[0].words, "Index rebuilt.");
  assert.equal(F.folderMsg(h, API).sessions[0].working, false);
  // a session no folder keeps (the canvas bar's, a loose one): nothing read, nothing written
  assert.deepEqual(await F.turnEnded(h, "aaaaaaaa-0000-4000-8000-000000000000", hands), []);
});

test("#1802: with the new face off, a turn's end writes nothing", async () => {
  const x = engine();
  await x.ask("next.folder.start", { folder: API, text: "Reply with the one word: ok" });
  const sessionId = x.sent.find((m) => m.type === "next.folder.started")?.sessionId as string;
  process.env.SOL_UI_NEXT = "off";
  try {
    x.runs.set(sessionId, { working: false, busy: false, perms: { size: 0 } });
    x.words.set(sessionId, "ok");
    x.end(sessionId);
    await settle();
    assert.deepEqual(F.folderMsg(x.h, API).backs, []);
  } finally { process.env.SOL_UI_NEXT = "on"; }
});

test("#1802: only a turn that was under way is written back; a run closing while it rests is not a turn", () => {
  let told: ((id: string) => void) | null = null;
  const runs = new Map<string, { turnFrom: number }>(), heard: string[] = [];
  notesPart.turnsOf({ onTurnEnd: (fn) => { told = fn; }, getRun: (id) => runs.get(id) })((id) => heard.push(id));
  runs.set("turn-under-way", { turnFrom: Date.now() }); told!("turn-under-way");
  runs.set("idle-close", { turnFrom: 0 }); told!("idle-close");
  told!("no-run-at-all");
  assert.deepEqual(heard, ["turn-under-way"]);
});

test("#1802: a session filed into another folder while its turn's words are read stays filed, and writes back there", async () => {
  const h = home(), DOCS = `${API}/docs`, runs = new Map<string, "working" | "idle">();
  let during: (() => void) | null = null;
  const hands: import("./folders.js").FolderHands = {
    start: async (id) => { runs.set(id, "working"); },
    status: (id) => runs.get(id) ?? "idle",
    // the folder's agent (setup.ts, its own line, not the folders' clock) files the quiet session while its words are read
    lastWords: async () => { during?.(); during = null; return "Docs tidied."; },
    say: async () => {},
  };
  const s = await F.startIn(h, { folder: API, text: "Tidy the docs" }, hands);
  const id = s.ok ? s.sessionId : "";
  runs.set(id, "idle");
  await F.turnEnded(h, id, hands);   // the first turn: written back, no longer working, so it may be filed
  during = () => assert.equal(F.refile(h, id, API, DOCS), true, "the agent files it");
  assert.deepEqual(await F.turnEnded(h, id, hands), [DOCS]);
  assert.equal(F.readFolderSessions(h)[id]?.folder, DOCS, "the move is kept, not saved over");
  assert.equal(F.folderMsg(h, DOCS).backs[0]?.words, "Docs tidied.", "its words land where it now is");
});
