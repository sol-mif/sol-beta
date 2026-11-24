// The bar is always agentic (#1615 BR1, Marco 2026-11-22 21:20; engine parts/next-canvas.ts, next/canvas-tool.ts): what
// the bar's known moves (cv/say) do not take goes to the home's standing canvas session as next.canvas.say, with the
// window's picture of the canvas (what is where, its name, folded, the folder it sits in) for the agent's canvas_read, and
// the pieces dropped on the bar as chips (their id and title). While the agent works the frame's line says so and the
// pill's aura turns; its words come back as next.canvas.said and stay on the frame's line until OK, with "Open its
// talk" beside it: the standing session in a tab (openAgent). Its moves come as
// next.pos.ai and are done as the hand would: a folder takes its pieces along, a fold takes its folded size; the result
// is kept by the engine as the AI's (next.pos.set, by "ai"). Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { D, M, MODE, change, hooks, regionOf, render, type Pos } from "../core.ts";
import type { Piece } from "../types.ts";
import * as L from "../../plane/layout.ts";
import { isHolder, nameOf as holderName } from "../../holders/model.ts";
import type { Engine } from "./types.ts";

export const canvasLink: { e: Engine | null } = { e: null };
/** the frame's held line (frame.hold, set by Next.tsx as hooks.flash is): the agent at work stays said until it answers */
export const agentLine: { hold: null | ((text: string | null) => void) } = { hold: null };
export type Chip = { id: string; title: string };
/** the bar's agent as the pill draws it: working while a turn runs, the chips waiting to go with the next words */
export const agentBar: { working: boolean; chips: Chip[] } = { working: false, chips: [] };

const WORKING = "Sol is on it…";

/** what a thing on the canvas is called and what kind it is, as the person sees it */
export function thingOf(id: string): { name: string; kind: string; in?: string } | null {
  if (id === L.DIARY) return { name: "the Diary", kind: "diary" };
  if (isHolder(id)) return { name: holderName(id), kind: "holder" };
  const r = regionOf(id);
  if (r) return { name: r.name, kind: "folder", ...(r.parent ? { in: r.parent } : {}) };
  const p = D.pieces[id];
  if (p) return { name: p.kind === "session" ? L.titleOf(p) : p.name || p.kind, kind: p.kind, ...(p.region ? { in: p.region } : {}) };
  return null;
}

/** the window's picture of the canvas for the agent's canvas_read: every thing with a place, not taken off */
export function picture(): { id: string; name: string; kind: string; x: number; y: number; w: number; h: number; folded: boolean; in?: string }[] {
  const pos: Record<string, Pos> = { ...(D.zones && !D.pos?.[L.DIARY] ? { [L.DIARY]: { ...D.zones.page, by: "rule", touched: false, at: 0 } as Pos } : {}), ...(D.pos || {}) };
  const out: ReturnType<typeof picture> = [];
  for (const [id, q] of Object.entries(pos)) {
    if (!q || ![q.x, q.y, q.w, q.h].every(Number.isFinite) || L.isOff(id) || D.pieces[id]?.inside) continue;
    const t = thingOf(id);
    if (t) out.push({ id, ...t, x: q.x, y: q.y, w: q.w, h: q.h, folded: !!q.folded });
  }
  return out.slice(0, 400);
}

/** a piece or folder dropped on the bar rides with the next words; once each */
export function chipOn(id: string): boolean {
  const t = thingOf(id);
  if (!t || agentBar.chips.some((c) => c.id === id) || agentBar.chips.length >= 12) return false;
  agentBar.chips = [...agentBar.chips, { id, title: t.name }];
  render();
  return true;
}
/** the pointer over the bar while a piece is dragged (screen px): the bar takes it as a chip, and says so (next.css
 *  nx-talk-over); every drag of the canvas asks here (plane/index.tsx, plane/Pieces.tsx dragFrom) */
export const overBar = (x: number, y: number): boolean => typeof document !== "undefined" && !!document.elementFromPoint(x, y)?.closest("#talk");
export const barOver = (on: boolean): void => { if (typeof document !== "undefined") document.getElementById("talk")?.classList.toggle("nx-talk-over", on); };
export function chipOff(id: string): void {
  agentBar.chips = agentBar.chips.filter((c) => c.id !== id);
  render();
}

/** the bar's words (and its chips) to the canvas session; false when there is no engine to take them */
export function askAgent(text: string): boolean {
  const e = canvasLink.e;
  if (MODE !== "live" || !e) return false;
  const chips = agentBar.chips;
  e.send({ type: "next.canvas.say", text, ...(chips.length ? { chips } : {}), canvas: picture() });
  agentBar.chips = [];
  working(true);
  return true;
}

function working(on: boolean): void {
  agentBar.working = on;
  agentLine.hold?.(on ? WORKING : null);
  render();
}

/** the bar's standing session in a tab, as any session opens (Marco's re-walk 23:31: its talk could not be opened). No
 *  list draws it (the engine marks it canvas), so its piece is made here when first asked for: in no folder and off the
 *  canvas (inside the bar), idle so no count of working sessions takes it, and not the list's (no from: "work"), so the
 *  list's next push keeps it. Its tab's view asks the engine for its talk by its id, as a session's does */
export function openAgent(sid: string): boolean {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sid)) return false;
  // shaped as the list makes a session's (cv/wire/plane.ts fromSessions), so its view reads every field it reads there
  if (!D.pieces[sid]) D.pieces[sid] = { id: sid, sessionId: sid, region: "", inside: "bar", kind: "session", name: "Sol's agent", ai: "Claude", copy: "main", branch: "main", state: "idle", talk: [], term: { lines: [], waiting: null, stateWord: "" } } as unknown as Piece;
  return M.tabOpen(sid, true).ok !== false;
}

/** Help's bar line hears every next.canvas.said (learn/help.ts sets it): a help one is its line, another ends a wait */
export const helpBar: { heard: ((m: Record<string, unknown>) => void) | null } = { heard: null };

/** the agent's turn: working, or done with its words (kept on the frame's line until OK), with its talk a press away */
export function heardSaid(m: { working?: unknown; text?: unknown; session?: unknown; help?: unknown }): void {
  // a "how do I…" answered by Help (sol/engine/src/next/help): its one line is the bar's (learn/BarLine.tsx), never the frame's
  helpBar.heard?.(m as Record<string, unknown>);
  if (m.help === true) { if (m.working !== true && agentBar.working) working(false); return; }
  if (m.working === true) { if (!agentBar.working) working(true); return; }
  working(false);
  const t = typeof m.text === "string" ? m.text.trim() : "", sid = typeof m.session === "string" ? m.session : "";
  if (!t) return;
  if (sid) hooks.flash?.(t, { label: "Open its talk", run: () => { openAgent(sid); } }, { label: "OK", run: () => {} });
  else hooks.flash?.(t, { label: "OK", run: () => {} });
}

/** an AI's move (next.pos.ai) done as the hand would, then kept as the AI's */
export function heardMove(m: { id?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; folded?: unknown; at?: unknown }): void {
  const id = typeof m.id === "string" ? m.id : "";
  const [x, y, w, h] = [m.x, m.y, m.w, m.h].map(Number);
  if (!id || ![x, y, w, h].every(Number.isFinite)) return;
  const folded = m.folded === true;
  change((d) => {
    const before = JSON.parse(JSON.stringify(d.pos || {})) as Record<string, Pos>;
    if (id === L.DIARY) L.moveDiary(x, y);
    const q = d.pos?.[id];
    if (!q) { d.pos = { ...(d.pos || {}), [id]: { x, y, w, h, by: "ai", touched: true, folded, at: Number(m.at) || Date.now() } }; }
    else {
      const folds = !!q.folded !== folded;
      if (folds) L.fold(id, folded, "rule");
      if (q.x !== x || q.y !== y) {
        if (regionOf(id)) L.dragFolder(id, x - q.x, y - q.y);
        else if (id !== L.DIARY) { q.x = x; q.y = y; }
      }
      if (!folds && !folded && (q.w !== w || q.h !== h)) { q.w = w; q.h = h; }   // a size said; a folded one keeps its tab
    }
    for (const [k, p] of Object.entries(d.pos || {})) {
      if (JSON.stringify(before[k]) === JSON.stringify(p)) continue;
      p.by = "ai"; p.touched = true; delete p.hand;
      L.keptPlace(k, p);
      canvasLink.e?.send({ type: "next.pos.set", id: k, x: p.x, y: p.y, w: p.w, h: p.h, by: "ai", touched: true, folded: !!p.folded, ...(p.in !== undefined ? { in: p.in } : {}) });
    }
  });
}

export function attach(e: Engine): void | (() => void) {
  canvasLink.e = e;
  const off = e.subscribe((m: { type?: string; asked?: string; why?: string }) => {
    if (m?.type === "next.canvas.said") heardSaid(m as never);
    else if (m?.type === "next.pos.ai") heardMove(m as never);
    else if (m?.type === "next.refused" && m.asked === "next.canvas.say") { working(false); if (m.why) hooks.flash?.(`Sol's agent: ${m.why}`); }
  });
  return () => { off(); if (canvasLink.e === e) canvasLink.e = null; if (agentBar.working) working(false); };
}
