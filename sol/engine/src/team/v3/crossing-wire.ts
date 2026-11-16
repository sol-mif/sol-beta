// Cowork v3, slice 1 (fr-30, #554): the crossing's four messages, team.v3.cross.{propose,send,undo,landed}. wire.ts
// routes them here only with the switch on (settings.ts coworkV3) and imports this file dynamically, so with it off
// nothing of this loads and the messages get today's no-answer (F7). Answers go back by rid to the asking face, typed
// work.v3.cross.*: the Home and Work face hears only work.* on its socket (mac/src/useEngine.ts), and the stage is theirs.
import { getTeam } from "../settings.js";
import { teamMembers } from "../members.js";
import { workState } from "../../work/state.js";
import { workBus } from "../../work/wire.js";
import { crossing, type Ctx, type Kind, type Proposal } from "./crossing.js";

type Wire = { send: (m: object) => void };
const KINDS: Kind[] = ["item", "note", "document", "automation"];
// what this engine proposed: Send takes the face's words for the title (it may have been changed on the card) and
// everything else from here, so a face cannot send something to a project its session is not in
const issued = new Map<string, Proposal>();
const remember = (p: Proposal | null) => { if (p) { issued.set(p.id, p); if (issued.size > 500) issued.delete(issued.keys().next().value!); } return p; };
const me = () => { const t = getTeam(); return { who: t.me.login || "me" }; };

/** the session's project chip, as the engine knows it (its mark), else as the face says (a session just filed) */
export function ctxOf(sessionId: string, face: { room?: unknown; roomName?: unknown; topic?: unknown }): Ctx {
  const t = getTeam();
  const id = workState().marks[sessionId]?.roomId || (typeof face.room === "string" ? face.room : "");
  const room = id ? t.rooms.find((r) => r.id === id) : undefined;
  const name = room?.name || (typeof face.roomName === "string" ? face.roomName : "") || id;
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    project: id ? { id, name } : null,
    people: teamMembers().map((login) => ({ login })),
    me: t.me.login, today: iso,
    topic: typeof face.topic === "string" ? face.topic : undefined,
  };
}

export async function handleCrossing(w: Wire, m: any, rid: string | number | undefined): Promise<void> {
  const c = crossing();
  switch (m.type) {
    case "team.v3.cross.propose": {
      const sid = String(m.sessionId ?? "");
      const ctx = ctxOf(sid, m);
      const kind = KINDS.includes(m.kind) ? (m.kind as Kind) : null;
      const p = kind && typeof m.title === "string" ? c.proposeThing(sid, { kind, title: m.title, words: typeof m.text === "string" ? m.text : undefined }, ctx)
        : c.propose(sid, String(m.text ?? ""), ctx);
      return w.send({ type: "work.v3.cross.proposal", rid, proposal: remember(p) });
    }
    case "team.v3.cross.send": {
      const face = m.proposal ?? {};
      const p = issued.get(String(face.id ?? ""));
      if (!p) return w.send({ type: "work.v3.cross.sent", rid, error: "that card was not made here; make it again" });
      const title = typeof face.title === "string" && face.title.trim() ? face.title.trim().slice(0, 200) : p.title;
      try {
        const s = await c.send({ ...p, title }, me());
        return w.send({ type: "work.v3.cross.sent", rid, token: s.token, until: s.until, event: s.event, again: !!s.again });
      } catch (e) { return w.send({ type: "work.v3.cross.sent", rid, error: String((e as Error)?.message ?? e).slice(0, 200) }); }
    }
    case "team.v3.cross.undo": {
      const r = await c.undo(String(m.token ?? ""), me());
      return w.send({ type: "work.v3.cross.undone", rid, ...r });
    }
    case "team.v3.cross.landed": {
      // what crossed into the project and stayed, from the others (my own I sent, I know)
      const mine = getTeam().me.login;
      const events = (await c.landed(String(m.project ?? ""))).filter((e) => e.actor.who !== mine);
      return w.send({ type: "work.v3.cross.landed", rid, events });
    }
  }
}

/** the agent's `cross` tool (work/tools.ts): a proposal on the session's agent mark; the agent never sends */
export function agentProposes(sessionId: string, text: string): { ok: boolean; proposal?: Proposal; why?: string } {
  const ctx = ctxOf(sessionId, {});
  if (!ctx.project) return { ok: false, why: "this session has no project chip: there is nowhere to cross to" };
  const p = remember(crossing().propose(sessionId, text, ctx));
  if (!p) return { ok: false, why: "those words make no item, note, document or automation; say it as a message" };
  workBus({ type: "work.v3.cross.proposed", proposal: p });
  return { ok: true, proposal: p };
}
