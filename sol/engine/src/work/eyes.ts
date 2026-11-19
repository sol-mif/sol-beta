// The agent's eyes on its own stage (#1435). Before this, `read` was the agent's only view: titles and the engine's own
// guess of each block's box, while the one space (the face's pieces/arrange.ts) laid everything out by its own rule and
// never said so. Now the face reports what it drew (`work.stage.seen`, sent by pieces/seen.ts while the switch
// stage.eyes is on), and this file turns the reports into three things the agent gets:
//   landed   one line at the end of compose / update / place / bind: where the block stands, whole or cut or scaled,
//            or that the person is not in this session at all
//   since    the [the stage] paragraph of the next ask (runs.ts): what the person did on the stage since the last turn
//   look     a still of the person's real stage, or one piece, as an image (Sol's own window, `screencapture -l`)
// "In front of the person" is only ever this: the session shown, the window visible, the piece on screen. Nothing here
// tracks eyes, and no sentence says "looked at".
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getTitles } from "../titles.js";
import { hashOf, isPrivate, track } from "../track.js";
import { getTeam } from "../team/settings.js";

export type Box = { x: number; y: number; w: number; h: number };
/** a piece as the face drew it, in the window's CSS pixels: its box, and for what has a body, how that body fits */
export type SeenPiece = {
  id: string; box: Box; large?: boolean; held?: boolean;
  /** a page laid at its own width and scaled to the piece (pageFit): the scale; under 0.5 it is shown as a still */
  scale?: number; still?: boolean;
  /** px of the body below what shows (the person has not scrolled it), in the window's pixels */
  cut?: number;
  /** the data-part at the top of what shows, when the page has parts */
  part?: string;
};
/** what the person did by hand since the last report: the face's own words for it (pieces/seen.ts) */
export type Did = { ev: "opened" | "away" | "closed" | "large" | "back" | "moved" | "widths" | "chat-less" | "chat-more"; id?: string };
export type Seen = {
  sessionId: string; at: number;
  window: { w: number; h: number; visible: boolean; focused: boolean };
  /** the space right of the sidebars, in the window's pixels */
  stage: Box;
  pieces: SeenPiece[];
  /** the artifacts named at the bottom edge (put away, or past the three that stand open) */
  away: string[];
  /** the chat's form: a column, its last lines on the box, one line, or a question shown whole */
  chat?: "col" | "lines" | "line" | "asks";
  did?: Did[];
  /** the agent may arrange this stage (#1437, the face's switch stage.hands) */
  hands?: boolean;
};

/** a report older than this means no face is drawing with the eyes on: say nothing rather than something stale */
export const FRESH_MS = 15 * 60_000;
/** how long a stage tool waits for the face to draw the block it touched */
export const LAND_MS = 1000;
/** an interval between two reports counts as in front of the person for at most this long (they may have walked away) */
const DWELL_CAP = 5 * 60_000;
const MAX_EVENTS = 6;

const TALK = "talk", BOX = "box";
const last = new Map<string, Seen>();
let current: Seen | null = null;
type Ev = { at: number; text: string };
const log = new Map<string, Ev[]>();
const front = new Map<string, Map<string, number>>();
/** since when a piece is held by the person's hand, and the parts the agent took a piece to (#1437): its own scroll is
 *  never told back to it as the person's */
const heldAt = new Map<string, number>(), wentTo = new Map<string, string>(), wentAt = new Map<string, number>();
/** one count for the tracker (#1437, track.ts): what the eyes told the agent and how its moves went, as counts and plain
 *  words, the session as a hash; nothing from a private session. The measure: sol/stage-measure */
export function counted(sid: string, name: string, props: Record<string, number | boolean | string> = {}): void {
  if (!isPrivate(sid)) track(name, { sess: hashOf(sid), ...props }, { mode: "work" });
}
const waiting = new Set<() => void>();

/** whose window it is, in the agent's words: the team settings' first name, else the login, else "the person" (#1532:
 *  the engine ships to every Sol, so no one's name is written here, and the pronoun is "they"); a test sets its own */
const fromTeam = () => { try { const m = getTeam().me; return m?.name?.trim().split(/\s+/)[0] || m?.login || "the person"; } catch { return "the person"; } };
let ownerOf = fromTeam;
export const owner = (): string => ownerOf();
export function setOwner(f?: () => string): void { ownerOf = f ?? fromTeam; }
const Owner = () => { const o = owner(); return o[0].toUpperCase() + o.slice(1); };
const owners = () => { const o = owner(); return o.endsWith("s") ? `${o}'` : `${o}'s`; };

// ---- the reports ----

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const boxOf = (v: any): Box | null => (v && typeof v === "object" && [v.x, v.y, v.w, v.h].every((n) => typeof n === "number" && Number.isFinite(n)) ? { x: v.x, y: v.y, w: Math.max(0, v.w), h: Math.max(0, v.h) } : null);
const word = (v: unknown, n = 80) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, n) : undefined);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DIDS = new Set<Did["ev"]>(["opened", "away", "closed", "large", "back", "moved", "widths", "chat-less", "chat-more"]);
const CHATS = new Set(["col", "lines", "line", "asks"]);

/** a report as it came over the wire, made safe; null when it is not one (pure) */
export function seenOf(v: any, now = Date.now()): Seen | null {
  if (!v || typeof v !== "object" || typeof v.sessionId !== "string" || !ID.test(v.sessionId)) return null;
  const stage = boxOf(v.stage), win = v.window;
  if (!stage || !win || typeof win !== "object") return null;
  const pieces: SeenPiece[] = (Array.isArray(v.pieces) ? v.pieces : []).slice(0, 40).flatMap((p: any) => {
    const box = boxOf(p?.box);
    if (!box || typeof p.id !== "string" || !ID.test(p.id)) return [];
    const s: SeenPiece = { id: p.id, box };
    if (p.large === true) s.large = true;
    if (p.held === true) s.held = true;
    if (typeof p.scale === "number" && p.scale > 0 && p.scale <= 4) s.scale = Math.round(p.scale * 100) / 100;
    if (p.still === true) s.still = true;
    if (num(p.cut) >= 1) s.cut = Math.round(num(p.cut));
    const part = word(p.part, 60); if (part) s.part = part;
    return [s];
  });
  return {
    sessionId: v.sessionId, at: now,
    window: { w: num(win.w), h: num(win.h), visible: win.visible !== false, focused: win.focused === true },
    stage, pieces,
    away: (Array.isArray(v.away) ? v.away : []).filter((x: unknown) => typeof x === "string" && ID.test(x)).slice(0, 40),
    ...(CHATS.has(v.chat) ? { chat: v.chat } : {}),
    did: (Array.isArray(v.did) ? v.did : []).slice(0, 20).flatMap((d: any) => (d && DIDS.has(d.ev) ? [{ ev: d.ev, ...(typeof d.id === "string" && ID.test(d.id) ? { id: d.id } : {}) }] : [])),
    ...(v.hands === true ? { hands: true } : {}),
  };
}

/** the person's hand, and the page's scroll, as words (pure; `title` names a block) */
export function didWords(prev: Seen | undefined, next: Seen, title: (id: string) => string, agents?: (id: string, part: string) => boolean): string[] {
  const out: string[] = [];
  const name = (id?: string) => (id === TALK ? "the chat" : id ? `"${title(id)}"` : "");
  for (const d of next.did ?? []) {
    const n = name(d.id);
    out.push(
      d.ev === "opened" ? `opened ${n}` : d.ev === "away" ? `put away ${n}` : d.ev === "closed" ? `closed ${n}` :
      d.ev === "large" ? `made ${n} large` : d.ev === "back" ? `brought the others back beside ${n}` : d.ev === "moved" ? `moved ${n} (it stays where it was put)` :
      d.ev === "widths" ? "set the columns' widths by hand" : d.ev === "chat-less" ? "made the chat smaller" : "gave the chat more room");
  }
  if (prev && prev.sessionId === next.sessionId) {
    const was = new Map(prev.pieces.map((p) => [p.id, p]));
    for (const p of next.pieces) {
      const q = was.get(p.id);
      if (q && p.part && p.part !== q.part) { if (!agents?.(p.id, p.part)) out.push(`scrolled ${name(p.id)} to ${p.part}`); }
      else if (q && q.cut && p.cut === undefined && p.id !== TALK) out.push(`scrolled to the end of ${name(p.id)}`);
    }
  }
  return out;
}

/** how long each piece was in front of the person between two reports of the same session (pure) */
export function dwell(prev: Seen | undefined, next: Seen): [string, number][] {
  if (!prev || prev.sessionId !== next.sessionId || !prev.window.visible || !prev.window.focused) return [];
  const ms = Math.min(DWELL_CAP, Math.max(0, next.at - prev.at));
  return ms ? prev.pieces.filter((p) => p.id !== BOX).map((p) => [p.id, ms]) : [];
}

const push = (sid: string, text: string, at: number) => {
  const l = log.get(sid) ?? [];
  if (l[l.length - 1]?.text === text) return;
  l.push({ at, text }); if (l.length > 40) l.splice(0, l.length - 40);
  log.set(sid, l);
};
const titleOf = (sid: string) => getTitles()[sid] ?? "another session";

/** the face's report (wire.ts work.stage.seen); `title` names a block of the project */
export function setSeen(v: unknown, title: (id: string) => string = (id) => id): void {
  // the switch turned off in the window (#1532): forget every report at once, so nothing is read or taken from now on
  if (v && typeof v === "object" && (v as { off?: unknown }).off === true) { forget(); return; }
  const next = seenOf(v);
  if (!next) return;
  const prev = last.get(next.sessionId);
  // the window went from one session to another: both sessions hear it
  if (current && current.sessionId !== next.sessionId) {
    push(current.sessionId, `left this session for "${titleOf(next.sessionId)}"`, next.at);
    if (last.has(next.sessionId)) push(next.sessionId, "came back to this session", next.at);
  }
  if (current && current.sessionId === next.sessionId && current.window.visible && !next.window.visible) push(next.sessionId, "hid or minimised Sol's window", next.at);
  const agents = (id: string, part: string) => {
    const k = `${next.sessionId}:${id}`; if (wentTo.get(k)?.toLowerCase() !== part.toLowerCase()) return false;
    counted(next.sessionId, "stage.lens.arrived", { secs: Math.round((next.at - (wentAt.get(k) ?? next.at)) / 100) / 10 });
    wentTo.delete(k); wentAt.delete(k); return true;
  };
  for (const w of didWords(prev, next, title, agents)) push(next.sessionId, w, next.at);
  for (const p of next.pieces) { const k = `${next.sessionId}:${p.id}`; if (p.held && !heldAt.has(k)) heldAt.set(k, next.at); else if (!p.held) heldAt.delete(k); }
  // the time before this report counts for the session shown until now
  const was = current && current.sessionId !== next.sessionId ? current : prev;
  if (was) {
    const f = front.get(was.sessionId) ?? new Map<string, number>();
    for (const [id, ms] of dwell(was, { ...next, sessionId: was.sessionId })) f.set(id, (f.get(id) ?? 0) + ms);
    front.set(was.sessionId, f);
  }
  last.set(next.sessionId, next);
  current = next;
  armKeep(next);
  for (const f of [...waiting]) f();
}

// ---- the still kept when the person leaves ----
// `look` on a session the person is not in had only words; now it also has the stage as it last stood in front of them.
// A session quiet in front of the person for KEEP_QUIET_MS is caught once (Sol's own window, cropped to the stage, the
// same still `look` takes), and kept only if no other session showed in the CONFIRM_MS after, so a still never holds
// the session they went to. In memory only, the last KEEP_MAX sessions; a private session is never kept.
export const KEEP_QUIET_MS = 4000, CONFIRM_MS = 1500;
const KEEP_MAX = 6;
type Kept = { at: number; image: Image; seen: Seen };
const kept = new Map<string, Kept>();
let keepTimer: ReturnType<typeof setTimeout> | null = null;
type Capture = (s: Seen) => Promise<Image | null>;
const realCapture: Capture = async (s) => (process.platform === "darwin" ? (await stillOf(s.stage, s.window)).image : null);
let capture = realCapture, quietMs = KEEP_QUIET_MS, confirmMs = CONFIRM_MS;
/** for tests: catch with this instead of the screen, and wait these instead */
export function _setCapture(c: Capture | null, quiet = KEEP_QUIET_MS, confirm = CONFIRM_MS): void { capture = c ?? realCapture; quietMs = quiet; confirmMs = confirm; }

function armKeep(s: Seen) {
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = null;
  if (!s.window.visible || isPrivate(s.sessionId)) return;
  keepTimer = setTimeout(() => { keepTimer = null; void keepNow(s).catch(() => {}); }, quietMs);
  keepTimer.unref?.();
}
async function keepNow(s: Seen) {
  if (current !== s) return;   // a newer report re-armed it
  const image = await capture(s);
  if (!image) return;
  await new Promise((ok) => setTimeout(ok, confirmMs).unref?.());
  if (current?.sessionId !== s.sessionId || !current.window.visible) return;   // they left as it was caught: the still may hold the next one
  kept.delete(s.sessionId);
  kept.set(s.sessionId, { at: Date.now(), image, seen: s });
  while (kept.size > KEEP_MAX) kept.delete(kept.keys().next().value!);
}
/** when a session's still was kept, if one is (for tests and the read) */
export const keptAt = (sid: string): number | undefined => kept.get(sid)?.at;

const fresh = (now = Date.now()) => !!current && now - current.at < FRESH_MS;
/** a session's last report while it is fresh (#1437: the hands ask it before a move) */
export const reportOf = (sid: string): Seen | undefined => { const s = last.get(sid); return s && Date.now() - s.at < FRESH_MS ? s : undefined; };
/** the person's window reports its stage (#1435): place offers the hand's moves (#1437) in sessions that start while it
 *  does, whatever its switch "the agent arranges the stage" says, since a session's tools are read once as it starts and the
 *  switch can turn after; hands.ts asks the session's own report and refuses in words while it is off (#1547). No window
 *  reporting, place reads as it always has */
export const eyesOn = (): boolean => fresh();
export const heldSince = (sid: string, id: string): number | undefined => heldAt.get(`${sid}:${id}`);
/** the agent took a piece to a part: the scroll that follows is its own */
export const went = (sid: string, id: string, part: string): void => { wentTo.set(`${sid}:${id}`, part); wentAt.set(`${sid}:${id}`, Date.now()); };

// ---- words ----

/** where a box stands on the stage, in the words a person would use (pure) */
export function whereWords(p: SeenPiece, stage: Box): string {
  if (p.large) return "taken large (the whole stage)";
  const cx = (p.box.x + p.box.w / 2 - stage.x) / Math.max(1, stage.w), wide = p.box.w / Math.max(1, stage.w);
  const cy = (p.box.y + p.box.h / 2 - stage.y) / Math.max(1, stage.h);
  const col = wide > 0.8 ? "across the stage" : cx < 0.4 ? "left" : cx > 0.6 ? "right" : "middle";
  const row = p.box.h / Math.max(1, stage.h) > 0.6 ? "" : cy < 0.4 ? ", top" : cy > 0.6 ? ", bottom" : "";
  return `${col}${row}`;
}
/** how a piece's body fits it (pure) */
export function fitWords(p: SeenPiece): string {
  if (p.still) return `too small to read: shown as a still at ${p.scale ?? "<0.5"} scale (double-click its head opens it big)`;
  const bits: string[] = [];
  if (p.scale !== undefined && p.scale < 0.95) bits.push(`scaled to ${p.scale}`);
  if (p.cut) bits.push(`cut: ${p.cut} px below what shows`);
  return bits.length ? bits.join(", ") : "whole";
}
const pieceLine = (p: SeenPiece, s: Seen) => `${whereWords(p, s.stage)}, ${Math.round(p.box.w)}×${Math.round(p.box.h)}, ${fitWords(p)}${p.held ? `, held where ${owner()} put it` : ""}`;

/** the line a stage tool ends with: how the block landed in the person's window, after waiting a moment for it to be
 *  drawn. Empty when no window reports (the eyes off, or no Sol window on this Mac) */
export async function landed(sid: string, id: string, ms = LAND_MS, tag?: { tool: string; kind?: string }): Promise<string> {
  const t0 = Date.now(), r = await landedOf(sid, id, ms, t0);
  if (tag && r.fit) counted(sid, "stage.landed", { tool: tag.tool, ...(tag.kind ? { kind: tag.kind } : {}), fit: r.fit, wait_ms: Date.now() - t0, ...r.n });
  return r.line;
}
type Landed = { line: string; fit?: string; n?: Record<string, number | boolean> };
/** the line and, for the tracker, its one-word fit: elsewhere, hidden, whole, scaled, cut, still, large, away, unseen */
async function landedOf(sid: string, id: string, ms: number, t0: number): Promise<Landed> {
  if (!fresh(t0)) return { line: "" };
  if (current!.sessionId !== sid) return { line: `\nnot in front of ${owner()}: they are in "${titleOf(current!.sessionId)}"`, fit: "elsewhere" };
  if (!current!.window.visible) return { line: `\nnot in front of ${owner()}: Sol's window is hidden or minimised`, fit: "hidden" };
  const drawn = () => { const s = last.get(sid); return s && s.at >= t0 && (s.pieces.some((p) => p.id === id) || s.away.includes(id)) ? s : null; };
  const s = drawn() ?? await new Promise<Seen | null>((ok) => {
    const f = () => { const d = drawn(); if (d) { clearTimeout(t); waiting.delete(f); ok(d); } };
    const t = setTimeout(() => { waiting.delete(f); ok(null); }, ms);
    waiting.add(f);
  });
  // not drawn again in time: the last report still says where it stands, if it says anything
  const r = s ?? last.get(sid);
  const p = r?.pieces.find((x) => x.id === id);
  if (p && r) {
    const fit = p.large ? "large" : p.still ? "still" : p.cut ? "cut" : p.scale !== undefined && p.scale < 0.95 ? "scaled" : "whole";
    const n = { late: !s, w_pct: Math.round((100 * p.box.w) / Math.max(1, r.stage.w)), h_pct: Math.round((100 * p.box.h) / Math.max(1, r.stage.h)),
      ...(p.scale !== undefined ? { scale: Math.round(p.scale * 100) / 100 } : {}), ...(p.cut ? { cut_px: Math.round(p.cut) } : {}), open: r.pieces.filter((x) => x.id !== BOX).length };
    return { line: `\nlanded in ${owners()} window: ${pieceLine(p, r)}`, fit, n };
  }
  if (r?.away.includes(id)) return { line: `\nin ${owners()} window: named at the bottom edge, not open (three stand open; put another away or place this one full)`, fit: "away" };
  return { line: "", fit: "unseen" };
}

/** the agent's read, told by the window: the line for one block, or undefined to keep read's own */
export function whereOf(sid: string, id: string): string | undefined {
  const s = last.get(sid);
  if (!s || !fresh() || Date.now() - s.at > FRESH_MS) return undefined;
  const p = s.pieces.find((x) => x.id === id);
  return p ? `in ${owners()} window ${pieceLine(p, s)}` : s.away.includes(id) ? "named at the bottom edge (not open)" : undefined;
}
/** read's first line from the window: whether the person is here, the window, the chat */
export function headOf(sid: string): string {
  if (!fresh()) return "";
  if (current!.sessionId !== sid) return `Not in front of ${owner()}: they are in "${titleOf(current!.sessionId)}".`;
  const s = current!, chat = s.pieces.some((p) => p.id === TALK) ? ` The chat: ${s.chat === "line" ? "one line on the box" : s.chat === "lines" ? "its last lines on the box" : s.chat === "asks" ? "the question shown whole" : "a column"}.` : "";
  return `${Owner()} is in this session; the stage is ${Math.round(s.stage.w)}×${Math.round(s.stage.h)} of a ${Math.round(s.window.w)}×${Math.round(s.window.h)} window${s.window.visible ? "" : " (hidden now)"}.${chat}`;
}

/** what the person did since the last turn, for the ask's [the stage] paragraph; reading it starts the count again */
export function since(sid: string, title: (id: string) => string = (id) => id): string {
  const ev = log.get(sid) ?? [];
  log.delete(sid);
  const f = front.get(sid);
  front.delete(sid);
  const top = f ? [...f.entries()].filter(([, ms]) => ms >= 20_000).sort((a, b) => b[1] - a[1]).slice(0, 2) : [];
  const mins = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
  const parts = [
    ...ev.slice(-MAX_EVENTS).map((e) => e.text),
    ...(top.length ? [`in front of ${owner()} longest: ${top.map(([id, ms]) => `${id === TALK ? "the chat" : `"${title(id)}"`} ${mins(ms)}`).join(", ")}`] : []),
  ];
  if (parts.length) counted(sid, "stage.since", { events: ev.length, dwell: top.length });
  return parts.length ? `since your last turn: ${parts.join(" · ")}` : "";
}

// ---- look ----

export type Image = { type: "image"; data: string; mimeType: "image/jpeg" };
const run = (cmd: string, args: string[], ms = 10_000) => new Promise<string>((ok, no) =>
  execFile(cmd, args, { timeout: ms, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => (err ? no(new Error(String(errOut || err.message).trim().split("\n")[0])) : ok(String(out)))));
// Sol's main window: the packaged app's owner is "Sol", the dev build's is "face"; layer 0, the largest
const FIND = `ObjC.import('CoreGraphics');
const a = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)); let best = null;
for (let i = 0; i < a.count; i++) { const w = a.objectAtIndex(i); const u = (k) => ObjC.unwrap(w.objectForKey(k));
  const o = u('kCGWindowOwnerName'); if ((o !== 'Sol' && o !== 'face') || u('kCGWindowLayer') !== 0) continue;
  const b = w.objectForKey('kCGWindowBounds'); const area = ObjC.unwrap(b.objectForKey('Width')) * ObjC.unwrap(b.objectForKey('Height'));
  if (!best || area > best.area) best = { id: u('kCGWindowNumber'), area }; }
best ? String(best.id) : '';`;
/** the largest width a still is given at: about 1.5k tokens for the agent */
export const LOOK_W = 1280;

/** the crop in the picture's pixels for a box in the window's CSS pixels (pure) */
export function cropOf(box: Box, win: { w: number }, pxW: number, pxH: number): Box {
  const k = pxW / Math.max(1, win.w);
  const x = Math.max(0, Math.round(box.x * k)), y = Math.max(0, Math.round(box.y * k));
  return { x, y, w: Math.max(1, Math.min(pxW - x, Math.round(box.w * k))), h: Math.max(1, Math.min(pxH - y, Math.round(box.h * k))) };
}

/** a still of the person's real stage (or one piece of it) as they see it now, with what it shows in words */
export async function look(sid: string, a: { id?: string; part?: string }, title: (id: string) => string = (id) => id): Promise<{ text: string; image?: Image }> {
  const tag = { piece: !!a.id, part: !!a.part };
  try { const r = await lookOf(sid, a, title); counted(sid, "stage.look", { ...tag, ok: !!r.image, kept: !!r.kept }); return { text: r.text, ...(r.image ? { image: r.image } : {}) }; }
  catch (e) { counted(sid, "stage.look", { ...tag, ok: false, error: true }); throw e; }
}
async function lookOf(sid: string, a: { id?: string; part?: string }, title: (id: string) => string): Promise<{ text: string; image?: Image; kept?: boolean }> {
  if (!fresh()) throw new Error("no Sol window reports its stage: Sol is not open on this Mac, or the eyes are off (Build settings › switches › the agent sees the stage)");
  if (current!.sessionId !== sid) {
    const where = `Not in front of ${owner()}: they are in "${titleOf(current!.sessionId)}"`, k = kept.get(sid);
    if (!k) return { text: `${where}, so there is no still of this stage. What it held when they left:\n${words(last.get(sid), title)}` };
    const at = new Date(k.at).toTimeString().slice(0, 5);
    return { text: `${where}. The still is this stage as it stood in front of the person at ${at}, before they left; nothing since is in it. What it held then:\n${words(k.seen, title)}`, image: k.image, kept: true };
  }
  if (process.platform !== "darwin") throw new Error("a still of the stage needs the Mac's engine");
  const s = current!;
  if (!s.window.visible) return { text: "Sol's window is hidden or minimised: there is nothing on their screen to show." };
  const p = a.id ? s.pieces.find((x) => x.id === a.id) : undefined;
  if (a.id && !p) return { text: s.away.includes(a.id) ? `"${title(a.id)}" is named at the bottom edge, not open: nothing of it is on their screen.` : `"${a.id}" is not on their screen.` };
  const { image } = await stillOf(p?.box ?? s.stage, s.window);
  const at = new Date().toTimeString().slice(0, 5);
  const partLine = a.part && p ? (p.part === a.part ? ` The part "${a.part}" is at the top of what shows.` : ` The part "${a.part}" is not at the top of what shows${p.part ? ` (what shows starts at "${p.part}")` : ""}; looking never scrolls.`) : "";
  return { text: `${p ? `"${title(p.id)}"` : `${owners()} stage`} at ${at}, as they see it.${partLine}\n${words(s, title)}`, image };
}

/** Sol's own window, cropped to a box in its CSS pixels, as a jpeg at most LOOK_W wide (the Mac's engine only) */
async function stillOf(box: Box, win: { w: number }): Promise<{ image: Image }> {
  const id = (await run("osascript", ["-l", "JavaScript", "-e", FIND])).trim();
  if (!/^\d+$/.test(id)) throw new Error("Sol's window was not found");
  const dir = join(tmpdir(), "sol-look"); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = join(dir, `${randomBytes(6).toString("hex")}.png`), out = f.replace(/\.png$/, ".jpg");
  try {
    await run("screencapture", ["-x", "-o", "-t", "png", "-l", id, f]);
    const dims = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", f]);
    const pxW = Number(/pixelWidth: (\d+)/.exec(dims)?.[1]), pxH = Number(/pixelHeight: (\d+)/.exec(dims)?.[1]);
    if (!pxW || !pxH) throw new Error("the still could not be read");
    const c = cropOf(box, win, pxW, pxH);
    await run("sips", ["--cropOffset", String(c.y), String(c.x), "-c", String(c.h), String(c.w), "-Z", String(LOOK_W), "-s", "format", "jpeg", "-s", "formatOptions", "80", f, "--out", out]);
    return { image: { type: "image", data: readFileSync(out).toString("base64"), mimeType: "image/jpeg" } };
  } finally { rmSync(f, { force: true }); rmSync(out, { force: true }); }
}

/** a report as lines: each piece with where it stands and how it fits, what is named at the bottom edge (pure) */
export function words(s: Seen | undefined, title: (id: string) => string = (id) => id): string {
  if (!s) return "nothing reported yet";
  const lines = s.pieces.filter((p) => p.id !== BOX).map((p) => `- ${p.id === TALK ? "the chat" : `"${title(p.id)}" (${p.id})`}: ${pieceLine(p, s)}`);
  if (s.away.length) lines.push(`- named at the bottom edge: ${s.away.map((id) => `"${title(id)}"`).join(", ")}`);
  return lines.join("\n");
}

/** forget every report and every kept still: the eyes turned off, and every test's start */
function forget(): void {
  last.clear(); log.clear(); front.clear(); waiting.clear(); heldAt.clear(); wentTo.clear(); wentAt.clear(); kept.clear(); current = null;
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = null;
}
/** for tests: forget every report, and the owner's name comes from the team settings again */
export function reset(): void { forget(); setOwner(); }
