// Cowork v3's stage state (fr-30, slice 1): per session, the one thing the composer made (or the agent proposed and
// was opened), its crossing (ready, sent with 8 s of Undo, kept in Home), what arrived from the project, and what the
// agent proposes, waiting as a count until pressed. The engine is the one source (team.v3.cross.*); this only holds
// what is on screen. Loaded only when the switch is on.
import { useSyncExternalStore } from "react";
import type { useEngine } from "../../useEngine";
import { askV3 } from "./ask";

export type Kind = "item" | "note" | "document" | "automation";
export type Proposal = { id: string; kind: Kind; title: string; project: string; projectName: string; spot: string; date?: string; whose?: string; whoseName?: string; from: string; words: string };
export type Thing = Proposal & { state: "ready" | "sending" | "sent" | "kept"; token?: string; until?: number; at: number; by: "you" | "agent" };
type Eng = Pick<ReturnType<typeof useEngine>, "send" | "subscribe">;

// fresh: what I sent into a project this sitting, the +N on its row in the sidebar (my own, so never the accent)
type State = { things: Record<string, Thing>; proposed: Record<string, Proposal[]>; arrived: Record<string, { n: number; who: string[]; titles: string[] }>; fresh: Record<string, number> };
let st: State = { things: {}, proposed: {}, arrived: {}, fresh: {} };
const subs = new Set<() => void>();
const set = (f: (s: State) => State) => { st = f(st); subs.forEach((x) => x()); };
export const useV3 = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st);
export const v3State = () => st;

// the engine's pushes for the stage (the agent's proposals, what arrived); a question is ask.ts askV3, the one listener
let eng: Eng | null = null;
let off: (() => void) | null = null;
export function attach(e: Eng) {
  if (eng === e) return;
  off?.(); eng = e;
  off = e.subscribe((m) => {
    // the agent's `cross` tool: a proposal waits on the session's agent mark, never opened by itself
    if (m?.type === "work.v3.cross.proposed" && m.proposal?.from) {
      const p = m.proposal as Proposal;
      set((s) => ({ ...s, proposed: { ...s.proposed, [p.from]: [...(s.proposed[p.from] ?? []).filter((x) => x.id !== p.id), p] } }));
    }
    // something crossed into a project from someone else's Home: the arrived row counts it
    if (m?.type === "work.v3.cross.arrived" && typeof m.project === "string") {
      set((s) => { const a = s.arrived[m.project] ?? { n: 0, who: [], titles: [] }; return { ...s, arrived: { ...s.arrived, [m.project]: { n: a.n + 1, who: [...new Set([...a.who, String(m.who ?? "")])].filter(Boolean), titles: [...a.titles, String(m.title ?? "")] } } }; });
    }
  });
}
export const ask = <T = any>(type: string, body: object, wait = 15_000): Promise<T> => askV3<T>(type, body, wait) as Promise<T>;

const put = (sessionId: string, t: Thing | null) => set((s) => {
  const things = { ...s.things };
  if (t) things[sessionId] = t; else delete things[sessionId];
  return { ...s, things };
});
export const thingOf = (sessionId: string | null) => (sessionId ? st.things[sessionId] ?? null : null);

/** the composer's words: the engine makes them a thing (true) or says they are a message (false) */
export async function make(e: Eng, a: { sessionId: string; room: string; roomName: string; topic: string; text: string; kind?: Kind }): Promise<boolean> {
  attach(e);
  const r = await ask<{ proposal?: Proposal | null; error?: string }>("team.v3.cross.propose", { sessionId: a.sessionId, text: a.text, room: a.room, roomName: a.roomName, topic: a.topic, ...(a.kind ? { kind: a.kind } : {}) });
  if (!r.proposal) return false;
  put(a.sessionId, { ...r.proposal, state: "ready", at: Date.now(), by: "you" });
  return true;
}
/** an agent's proposal opened by its person's press: it takes the stage like a made thing */
export function openProposal(sessionId: string, id: string) {
  const p = (st.proposed[sessionId] ?? []).find((x) => x.id === id);
  if (!p) return;
  set((s) => ({ ...s, proposed: { ...s.proposed, [sessionId]: (s.proposed[sessionId] ?? []).filter((x) => x.id !== id) } }));
  put(sessionId, { ...p, state: "ready", at: Date.now(), by: "agent" });
}
export const dropProposal = (sessionId: string, id: string) =>
  set((s) => ({ ...s, proposed: { ...s.proposed, [sessionId]: (s.proposed[sessionId] ?? []).filter((x) => x.id !== id) } }));
export function retitle(sessionId: string, title: string) {
  const t = thingOf(sessionId);
  if (t && t.state === "ready" && title.trim()) put(sessionId, { ...t, title: title.trim() });
}
/** Send: one event on the trail (a second press is the same one, F4), then 8 s of Undo */
export async function sendThing(sessionId: string): Promise<{ ok: boolean; why?: string }> {
  const t = thingOf(sessionId);
  if (!t || (t.state !== "ready" && t.state !== "sending")) return { ok: false, why: "nothing to send" };
  put(sessionId, { ...t, state: "sending" });
  const { state: _s, token: _t, until: _u, at: _a, by: _b, ...proposal } = t;
  const r = await ask<{ token?: string; until?: number; error?: string }>("team.v3.cross.send", { proposal });
  const now = thingOf(sessionId);
  if (!r.token || !now) { if (now) put(sessionId, { ...now, state: "ready" }); return { ok: false, why: r.error ?? "not sent" }; }
  put(sessionId, { ...now, state: "sent", token: r.token, until: Date.now() + 8000 });
  bump(t.project, 1);
  return { ok: true };
}
export async function undoThing(sessionId: string): Promise<{ ok: boolean; why?: string }> {
  const t = thingOf(sessionId);
  if (!t || t.state !== "sent" || !t.token) return { ok: false };
  const r = await ask<{ ok?: boolean; error?: string; why?: string }>("team.v3.cross.undo", { token: t.token });
  if (!r.ok) return { ok: false, why: r.why ?? r.error };
  const now = thingOf(sessionId);
  if (now) put(sessionId, { ...now, state: "ready", token: undefined, until: undefined });
  bump(t.project, -1);
  return { ok: true };
}
/** the 8 s ran out: the thing is in the project, the stage gives the pane back */
export const settle = (sessionId: string) => { const t = thingOf(sessionId); if (t?.state === "sent") put(sessionId, null); };
export const keep = (sessionId: string) => { const t = thingOf(sessionId); if (t && t.state === "ready") put(sessionId, { ...t, state: "kept" }); };
export const putAway = (sessionId: string) => put(sessionId, null);
const bump = (project: string, d: number) => set((s) => ({ ...s, fresh: { ...s.fresh, [project]: Math.max(0, (s.fresh[project] ?? 0) + d) } }));
/** what came into a project from others, asked once when a session of it opens (team.v3.cross.landed) */
export async function askArrived(project: string) {
  const r = await ask<{ events?: { actor: { who: string }; body?: { title?: string } }[] }>("team.v3.cross.landed", { project });
  const ev = r.events ?? [];
  set((s) => ({ ...s, arrived: { ...s.arrived, [project]: { n: ev.length, who: [...new Set(ev.map((e) => e.actor.who))], titles: ev.map((e) => String(e.body?.title ?? "")) } } }));
}
export const seenArrived = (project: string) => set((s) => { const a = { ...s.arrived }; delete a[project]; return { ...s, arrived: a }; });
