// Every Claude Code session on this machine, kept as an index of its transcripts (#917). The SDK's listSessions reads
// the head and tail of every transcript under ~/.claude/projects and searches them on the engine's one thread: on a
// machine with 1,337 of them (4 GB) one call took 6 to 8 s and held the event loop for up to 5 s at a stretch, and
// the list was rebuilt that way after every transcript write anywhere, so an Allow or a chip pressed meanwhile waited.
// A transcript's row depends only on that file (and its custom-title sidecar), so the index keeps each row by the
// file's size and time and reads again only the files that changed, one at a time, giving the loop a turn after each.
// The row itself is the SDK's (getSessionInfo), so it reads the same as listSessions; the one filter getSessionInfo
// leaves out, a session continued in another transcript, is kept here.
import { open, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { getSessionInfo, type SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";

export type Listed = SDKSessionInfo & { file: string };
type Entry = { key: string; row: Listed | null; dep?: string };   // dep: the transcript the row also read (continued in)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIDE = 65536;   // the SDK reads this much of a transcript's head and of its tail
const AT_ONCE = 4;    // files read at a time while some changed
export const projectsDir = () => join(process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"), "projects");

const index = new Map<string, Entry>();   // by transcript path
let sorted: Listed[] = [];
let fresh = false;                         // a pass ended with nothing changed since it began
let at = 0;                                // when the last pass ended
let pass: Promise<Listed[]> | null = null; // one pass at a time; a change during it runs one more after it
let again = false;
let changes = 0;                           // stale() calls so far: a pass is fresh only if none came while it ran

const tick = () => new Promise<void>((r) => setImmediate(r));

/** the list, newest first; a pass runs only when something changed (or after `net` ms, the watcher's safety net) */
export function listed(net = 10_000): Promise<Listed[]> {
  if (fresh && Date.now() - at < net) return Promise.resolve(sorted);
  if (pass) return pass;   // a read during a pass waits on it; only a change (stale) asks for one more
  pass = (async () => {
    try {
      let from: number;
      do { again = false; from = changes; await sweep(); } while (again);
      fresh = changes === from;
      at = Date.now();
      return sorted;
    } finally { pass = null; }
  })();
  return pass;
}
/** something changed (a transcript written, a rename, a delete): the next read looks again */
export function stale() { changes++; fresh = false; if (pass) again = true; }
export const _resetListed = () => { index.clear(); sorted = []; fresh = false; at = 0; };

async function sweep() {
  const root = projectsDir();
  let dirs: string[];
  try { dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); }
  catch { index.clear(); sorted = []; return; }
  const seen = new Map<string, { id: string; key: string }>();
  await Promise.all(dirs.map(async (d) => {
    const dir = join(root, d);
    let names;
    try { names = await readdir(dir, { withFileTypes: true }); } catch { return; }
    const folders = new Set(names.filter((n) => n.isDirectory()).map((n) => n.name));
    await Promise.all(names.map(async (n) => {
      if (!n.name.endsWith(".jsonl")) return;
      const id = n.name.slice(0, -6);
      if (!UUID.test(id)) return;
      const file = join(dir, n.name);
      try {
        const st = await stat(file);
        // a custom title can live beside the transcript (<id>/custom-title.json): its time is part of the key
        let side = 0;
        if (folders.has(id)) side = await stat(join(dir, id, "custom-title.json")).then((s) => s.mtimeMs, () => 0);
        seen.set(file, { id, key: `${st.size}:${st.mtimeMs}:${side}` });
      } catch { /* gone between the listing and the look */ }
    }));
  }));
  for (const f of index.keys()) if (!seen.has(f)) index.delete(f);
  // a row that also read another transcript (continued in) is read again when that one changes too
  // and a twin's row is read again when the other file comes or goes
  const ids = new Map<string, number>();
  for (const { id } of seen.values()) ids.set(id, (ids.get(id) ?? 0) + 1);
  const keyOf = (file: string, dep?: string) => { const s = seen.get(file)!; return s.key + (ids.get(s.id)! > 1 ? "|twin" : "") + (dep ? `|${seen.get(dep)?.key ?? "-"}` : ""); };
  const todo = [...seen].filter(([f]) => { const e = index.get(f); return !e || e.key !== keyOf(f, e.dep); });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, todo.length) }, async () => {
    while (next < todo.length) {
      const [file, { id }] = todo[next++];
      const { row, dep } = await rowOf(file, id, ids.get(id)! > 1);
      index.set(file, { key: keyOf(file, dep), row, ...(dep ? { dep } : {}) });
      await tick();   // the loop's turn: a click waits for one file at most, never the whole folder
    }
  }));
  // one row per session (the SDK keeps the newer of two files with one id), newest first
  const by = new Map<string, Listed>();
  for (const { row } of index.values()) if (row && !(by.get(row.sessionId)!?.lastModified >= row.lastModified)) by.set(row.sessionId, row);
  sorted = [...by.values()].sort((a, b) => b.lastModified - a.lastModified || (a.sessionId < b.sessionId ? 1 : a.sessionId > b.sessionId ? -1 : 0));
}

async function rowOf(file: string, id: string, twins: boolean): Promise<{ row: Listed | null; dep?: string }> {
  let dep: string | undefined;
  try {
    const { head, tail, size } = await ends(file);
    if (!size) return { row: null };
    const into = continuedIn(tail);
    if (into) { dep = join(dirname(file), `${into}.jsonl`); if (await hasMessages(dep)) return { row: null, dep }; }
    // getSessionInfo finds a transcript by its id, in the first folder that has it: the same id in two folders (a
    // folder synced or moved) is looked up first in the folder its head names, and the row that is this file's (by its
    // size) wins; when neither lookup reads this file the row still shows, read off its twin, rather than drop out
    const here = cwdIn(head);
    let info = twins && here ? await getSessionInfo(id, { dir: here }) : await getSessionInfo(id);
    if (twins && info?.fileSize !== size) { const any = await getSessionInfo(id); if (any && (!info || any.fileSize === size)) info = any; }
    if (!info) return { row: null, dep };
    return { row: { ...info, cwd: info.cwd || here || (await cwdDeep(file, id)), file }, dep };
  } catch { return { row: null, dep }; }
}

async function ends(file: string, side = SIDE) {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const buf = Buffer.alloc(Math.min(side, size));
    await fh.read(buf, 0, buf.length, 0);
    const head = buf.toString("utf8");
    let tail = head;
    if (size > side) { await fh.read(buf, 0, buf.length, size - side); tail = buf.toString("utf8"); }
    return { head, tail, size };
  } finally { await fh.close(); }
}

// a session continued in another transcript: its last word is a continued-in line, not a message after it
export function continuedIn(tail: string): string | undefined {
  if (!tail.includes('"type":"continued-in"')) return;
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const cont = l.includes('"type":"continued-in"');
    if (!cont && !l.includes('"type":"user"') && !l.includes('"type":"assistant"')) continue;
    try {
      const o = JSON.parse(l);
      if (cont && o?.type === "continued-in") return typeof o.continuedInSessionId === "string" && UUID.test(o.continuedInSessionId) ? o.continuedInSessionId : undefined;
      if (o?.type === "assistant" && (o.isApiErrorMessage === true || typeof o.message?.stop_reason !== "string")) continue;
      // a user line that is no prompt (meta, a compact summary, tool results) is passed over, as the SDK does
      if (o?.type === "user" && (o.isMeta || o.isCompactSummary || !prompted(o.message?.content))) continue;
      if (o?.type === "user" || o?.type === "assistant") return;
    } catch { /* the cut first line of a tail */ }
  }
}
const prompted = (c: unknown) => typeof c === "string" ? !!c.trim()
  : Array.isArray(c) && c.some((b) => b && typeof b === "object" && (b as { type?: string }).type === "text" && !!String((b as { text?: unknown }).text ?? "").trim());
// the transcript a session went on in has a message: its ends, else the first 16 MB looked through, as the SDK looks
async function hasMessages(file: string) {
  const MARK = '"parentUuid":';
  try {
    const { head, tail, size } = await ends(file);
    if (head.includes(MARK) || tail.includes(MARK)) return true;
    if (size <= SIDE) return false;
    const fh = await open(file, "r");
    try {
      const buf = Buffer.alloc(1024 * 1024);
      for (let pos = 0, carry = ""; pos < 16 * 1024 * 1024 && pos < size; pos += buf.length) {
        const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
        if (bytesRead <= 0) break;
        const text = carry + buf.toString("utf8", 0, bytesRead);
        if (text.includes(MARK)) return true;
        carry = text.slice(-MARK.length);
        await tick();
      }
      return false;
    } finally { await fh.close(); }
  } catch { return false; }
}

// The SDK reads a session's folder off its transcript's first line. A transcript that opens with queue bookkeeping
// ("queue-operation" lines, written when the first prompt was queued) gives it no folder, and a session with no folder
// fell out of the side (2026-10-25: a pinned session gone). The folder is on the first message line instead; that
// line can run to megabytes (pasted screenshots come before its cwd field), so the head is scanned for the field itself
const CWD = /"cwd":"((?:[^"\\]|\\.)+)"/;
const cwdIn = (text: string) => { const m = CWD.exec(text); return m ? JSON.parse(`"${m[1]}"`) as string : ""; };
const deep = new Map<string, string>();   // found once per session: its first message's folder does not change
async function cwdDeep(file: string, id: string): Promise<string> {
  const hit = deep.get(id);
  if (hit) return hit;
  const cwd = await cwdScan(file);
  if (cwd) deep.set(id, cwd);
  return cwd;
}
async function cwdScan(file: string): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    let pos = 0, carry = "";
    while (pos < 8 * 1024 * 1024) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (bytesRead <= 0) break;
      const text = carry + buf.toString("utf8", 0, bytesRead);
      const cwd = cwdIn(text);
      if (cwd) return cwd;
      carry = text.slice(-64);   // a field cut by the chunk edge
      pos += bytesRead;
    }
    return "";
  } finally { await fh.close(); }
}
