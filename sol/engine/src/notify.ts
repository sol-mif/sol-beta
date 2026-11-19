// One notification (#845): one moment, one place, never two. The engine is the one sender; nothing else in Sol tells
// Marco that something wants him (Work's pings, the old ping routing, the phone ack and work.notify are gone).
//
// A moment is made here, by the engine, for:
//   done        a turn ended and it is his move (Work, or a Life turn)
//   question    Claude asks him something (AskUserQuestion, ExitPlanMode)
//   permission  Claude asks to use a tool
//   failed      a turn stopped with an error
//   green       his PR's checks are green: the hand-in card asks
//   hand        a teammate handed him an issue
//   stable      a new stable to update to
//   ping        the agent's `ping` tool, one line in its words
//
// The gate is whether Sol is on his screen, not whether it has focus. The window says so in presence { visible }
// (creature.ts onScreen: not minimized, not hidden, not under a full-screen app or another space, display awake):
//   visible       -> the window face only, which holds the moment until he acts or waves it off
//   not visible   -> one native banner on the engine's Mac, nothing kept
// The destination is chosen when the moment is made and never moves (one place). Wire, to the destination's faces:
//   { type: "moment", id, kind, sessionId?, seat, line, at }   made (and again to a face of that role that says hello)
//   { type: "moment.gone", id }                                 seen, waved off, answered, replaced or expired
// From the faces: { type: "seen", id } or { type: "seen", all: true }: counts only from the moment's destination. Opening a session in the window is seeing: every moment of
// that session goes, wherever it is. Acting is seeing too: an answered ask, a new turn in the session, a card pressed.
// One per (kind, session) at a time (the newer replaces the older); a ping one per (seat, line) within 30 s; 12 at most.
// Settings (settings.ts notify): each kind on or off. A kind off makes no moment at all.

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { ToolResult, TurnCtx, Face } from "./browser.js";
import { onScreen, pinged, askTitle, type Role } from "./creature.js";
import { getSettings, type MomentKind } from "./settings.js";
import { getTitles } from "./titles.js";
import { banner as macBanner } from "./work/machine.js";

export { MOMENT_KINDS, type MomentKind } from "./settings.js";
export type Dest = "window";
export type Moment = { id: string; kind: MomentKind; sessionId?: string; seat: string; line: string; at: number; dest: Dest; key?: string };

const CAP = 12, SAME_MS = 30_000;
const kept: Moment[] = [];
const faces = new Map<Face, Role | undefined>();
let banner: (title: string, body: string) => unknown = macBanner;
let prefs = () => getSettings().notify;   // the tests set their own, never the settings file

const wire = ({ dest: _d, key: _k, ...m }: Moment) => ({ type: "moment", ...m });
const to = (dest: Dest, m: object) => { for (const [f, r] of faces) if (r === dest) f.send(m); };

export function addMomentFace(f: Face) { faces.set(f, undefined); }   // nothing until it says which face it is
export function momentFaceIs(f: Face, role: Role) {
  faces.set(f, role);
  for (const m of kept) if (m.dest === role) f.send(wire(m));   // only its own
}
export function removeMomentFace(f: Face) { faces.delete(f); }

/** where a moment goes now: the gate */
export function placeNow(): Dest | "banner" {
  return onScreen() ? "window" : "banner";
}

function drop(m: Moment) {
  const i = kept.indexOf(m);
  if (i < 0) return;
  kept.splice(i, 1);
  to(m.dest, { type: "moment.gone", id: m.id });
}
const dropWhere = (f: (m: Moment) => boolean) => { for (const m of kept.filter(f)) drop(m); };

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);
const titleOf = (sessionId?: string, cwd?: string) => (sessionId && getTitles()[sessionId]) || (cwd ? basename(cwd) : "");

/** make a moment: the one way anything in Sol tells Marco. Null when its kind is off, or it went as a banner. */
export function moment(kind: MomentKind, line: string, o: { sessionId?: string; seat?: string; key?: string } = {}): Moment | null {
  if (prefs()?.moments?.[kind] === false) return null;
  const text = clean(line);
  if (!text) return null;
  const now = Date.now(), seat = o.seat ?? "claude";
  if (kind === "ping") {
    const same = kept.find((m) => m.kind === "ping" && m.seat === seat && m.line === text && now - m.at < SAME_MS);
    if (same) return same;
  } else if (o.key) {
    if (kept.some((m) => m.key === o.key)) return kept.find((m) => m.key === o.key)!;   // the same thing told twice
  }
  // one per (kind, session): the newer replaces the older
  if (kind !== "ping" && o.sessionId) dropWhere((m) => m.kind === kind && m.sessionId === o.sessionId);
  const dest = placeNow();
  const m: Moment = { id: randomUUID(), kind, ...(o.sessionId ? { sessionId: o.sessionId } : {}), seat, line: text, at: now, dest: "window", ...(o.key ? { key: o.key } : {}) };
  if (dest === "banner") {   // Sol is not on his screen: one native banner, nothing kept
    const t = titleOf(o.sessionId);
    void Promise.resolve(banner(t ? `Sol · ${t}` : "Sol", text)).catch(() => {});
    return null;
  }
  kept.push(m);
  while (kept.length > CAP) drop(kept[0]);
  to(dest, wire(m));
  return m;
}

/** seen: only from the face it was sent to; `all` waves off every one that face holds */
export function seen(id: string | undefined, from?: Face, all = false): number {
  const role = from ? faces.get(from) : undefined;
  const mine = (m: Moment) => !from || role === m.dest;
  const list = kept.filter((m) => mine(m) && (all || m.id === id));
  for (const m of list) drop(m);
  return list.length;
}
/** opening a session is seeing: its moments go, wherever they are */
export function sessionSeen(sessionId: string) { if (sessionId) dropWhere((m) => m.sessionId === sessionId); }

// ---- what the engine hears, made into moments ----
const ASKS = new Set(["AskUserQuestion", "ExitPlanMode"]);
// which sessions a face shows now (work/wire.ts viewed), told by index.ts: the engine's own tests leave it empty
let looking: (sessionId: string) => boolean = () => false;
export function watchViews(f: (sessionId: string) => boolean) { looking = f; }
/** he is looking at it right now: Sol on screen with that session open. Nothing to tell. */
const inFront = (sessionId?: string) => !!sessionId && looking(sessionId) && onScreen();

/** a message the engine sent its faces (the Work bus, Hand, Ship, a Life turn's end): a moment, if it is one */
export function heard(m: any) {
  if (!m || typeof m.type !== "string") return;
  const sid = typeof m.sessionId === "string" ? m.sessionId : undefined;
  if (m.type === "work.item" && m.item && sid) {
    const it = m.item;
    if (it.kind === "perm") {
      const key = `perm:${it.id}`;
      if (it.state !== "ask") return dropWhere((x) => x.key === key);   // answered, from anywhere
      if (inFront(sid)) return;
      const q = ASKS.has(String(it.tool));
      const line = it.tool === "AskUserQuestion" ? String(it.input?.questions?.[0]?.question ?? "") || askTitle(it) : askTitle(it);
      moment(q ? "question" : "permission", line, { sessionId: sid, key });
    } else if (it.kind === "handin") {
      const key = `handin:${it.id}`;
      if (it.state) return dropWhere((x) => x.key === key);   // pressed, moved on or gone
      moment("green", `#${it.number} is green: bring it in?${it.title ? ` ${it.title}` : ""}`, { sessionId: sid, key });
    }
  } else if (m.type === "work.run" && sid) {
    if (m.busy && !m.ended) return dropWhere((x) => x.sessionId === sid && (x.kind === "done" || x.kind === "failed"));   // he acted
    if (!m.ended || m.waiting || inFront(sid)) return;
    const t = titleOf(sid, m.cwd);
    moment(m.failed ? "failed" : "done", m.failed ? `${t || "a session"} stopped with an error` : `${t || "a session"}: done, your move`, { sessionId: sid });
  } else if (m.type === "life.done" && sid) {
    if (m.stopped || inFront(sid)) return;
    const t = titleOf(sid);
    moment(m.ok === false ? "failed" : "done", m.ok === false ? `${t || "a chat"} stopped with an error` : `${t || "a chat"}: your move`, { sessionId: sid, seat: String(m.seat ?? "codex") });
  } else if (m.type === "team.handed" && !m.review) {
    moment("hand", `${m.from ?? "someone"} handed you #${m.issue}${m.title ? ` ${m.title}` : ""}`, { seat: "team", key: `hand:${m.id}` });
  } else if (m.type === "team.stable") {
    if (!m.sha || !m.behind) return dropWhere((x) => x.kind === "stable");   // updated, pinned: nothing to tell
    if (m.channel === "dev") return;   // a dev release installs itself at a quiet moment (ship.ts): nothing to press
    dropWhere((x) => x.kind === "stable" && x.key !== `stable:${m.sha}`);
    moment("stable", `a new stable: ${m.tag || String(m.sha).slice(0, 7)}${m.by ? ` from ${m.by}` : ""}`, { seat: "team", key: `stable:${m.sha}` });
  }
}

/** tests */
export const _moments = () => kept;
export const _setBanner = (f: typeof banner) => { banner = f; };
export const _setPrefs = (p: ReturnType<typeof prefs>) => { prefs = () => p; };
export const _reset = () => { kept.length = 0; faces.clear(); looking = () => false; banner = macBanner; prefs = () => getSettings().notify; };

// ---- the agent's ping tool: one line, made a moment like any other ----
const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
export const PING_TOOLS = [
  {
    name: "ping",
    description: "Ping Marco: one short line in your own words (what is done, or what needs him). It reaches him in one place: Sol's window if it is on his screen, else one banner on his Mac. Use it when he asked to be told when something is finished, or when a long task ends. One line, no markdown.",
    shape: {
      line: z.string().describe("One short line, what Marco should know (e.g. \"the sidebar's timer row is in\")."),
      sessionId: z.string().optional().describe("The conversation a press on the ping opens; this one if left out."),
    },
  },
];

export async function runPingTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  const a = (args ?? {}) as { line?: unknown; sessionId?: unknown };
  const line = typeof a.line === "string" ? a.line.trim() : "";
  if (name !== "ping") return { ...text(`Unknown tool: ${name}`), isError: true };
  if (!line) return { ...text("A ping needs a line."), isError: true };
  const sid = typeof a.sessionId === "string" && a.sessionId ? a.sessionId : turn.sessionId;
  const where = placeNow();
  const p = moment("ping", line, { sessionId: sid, seat: turn.seat ?? "codex" });
  pinged(turn.seat ?? "codex", sid);   // a ping is activity in its conversation (creature.turn)
  turn.sink?.({ id: p?.id ?? randomUUID(), kind: "desk", text: `pinging Marco: ${clean(line)}`, done: true, ok: true });
  if (prefs()?.moments?.ping === false) return text("Not sent: Marco has pings off in Settings.");
  return text(where === "banner" ? "Pinged as a banner on his Mac." : `Pinged. It is in the ${where}; Marco sees it there until he opens it or waves it off.`);
}
