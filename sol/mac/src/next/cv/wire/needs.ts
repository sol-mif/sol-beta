// owned by slice 2 (Needs), docs/port/slices.md
// The asks, live (#1615; docs/port/map.md rows 3 and 18): today's engine has no one ranked list (slice 7's next.needs
// is to come), so the Needs list is made here from today's messages, the same meaning as the old face's:
//   - home.today: Home's Things that wait on the person (today.needs), the stage's waiting blocks among them when the
//     engine's home.whole is on (PROTOCOL.md "Home 2"); answered with home.answer (its card's warm answer), later with
//     home.later.
//   - work.thread / work.item: a session's permission asks (an item of kind "perm" in state "ask"); answered with
//     work.perm { allow: true }. They have no later in the engine: "later" moves them down here only.
//   - next.needs (slice 7's ranked list, when it comes): taken as it is, in place of the two above.
// Rank is computed, never claimed (needs/rank.ts TIER): a permission holds an AI up (3), a Thing with a date is due (4),
// any other Thing is other (6); inside each tier the engine's own order. agent.answer has no ask here yet: an agent's
// tickets are read per folder (agent.tickets), which nothing in the new face asks for yet (notes/needs.md).
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { D, change, now, subscribe, type Ask } from "../core.ts";
import { TIER } from "../../needs/rank.ts";
import type { Engine } from "./types.ts";

type Thing = { id: string; read: string; folder: string; words: string; state: string; waitsOn: string; due?: number; card?: { title?: string; answers?: [string, string] } };
type PermItem = { id: string; kind: string; state?: string; tool?: string; input?: Record<string, unknown>; title?: string };
type Mine = Ask & { live: "thing" | "perm" | "next"; thingId?: string; sessionId?: string; itemId?: string; yesWords?: string };

/** the asks as the engine has them now, by id; and what was sent for each, so nothing is sent twice */
const asks = new Map<string, Mine>();
const sent = new Map<string, string>();

/** one ask from a Thing of Home's list */
export function fromThing(t: Thing, i: number): Mine {
  const tier = t.due ? TIER.due : TIER.other;
  return {
    id: "t:" + t.id, rank: tier + i * 0.01, piece: t.folder || "home", kind: t.read === "job" ? "code" : "life", source: t.card?.title ? `${t.folder || "Home"} · ${t.card.title}` : t.folder || "Home",
    text: t.words, how: "inplace", answered: false, live: "thing", thingId: t.id, ...(t.card?.answers?.[0] ? { yes: t.card.answers[0] } : {}),
  };
}
/** one ask from a session's permission item */
export function fromPerm(sessionId: string, it: PermItem, i: number): Mine {
  const what = it.tool === "Bash" && typeof it.input?.command === "string" ? `run ${String(it.input.command).slice(0, 80)}` : it.title || `use ${it.tool ?? "a tool"}`;
  return {
    id: `p:${sessionId}:${it.id}`, rank: TIER.holds + i * 0.01, piece: sessionId, kind: "code", source: `${it.tool ?? "a tool"} · permission`,
    text: `allow ${what}?`, how: "inplace", answered: false, live: "perm", sessionId, itemId: it.id, yes: "Allow",
  };
}

/** the store's asks made the engine's: the ones gone are dropped, new ones added (a new one waits for a pause to peek),
 *  the person's own answers kept until the engine's next word */
function settle(fresh: Mine[], kinds: Mine["live"][], first: boolean): void {
  change((d, s) => {
    const ids = new Set(fresh.map((a) => a.id));
    for (const [id, a] of asks) if (kinds.includes(a.live) && !ids.has(id)) { asks.delete(id); delete d.asks[id]; s.pending = s.pending.filter((x) => x !== id); if (s.peek === id) s.peek = null; if (s.askLine === id) s.askLine = null; }
    for (const a of fresh) {
      const had = d.asks[a.id];
      if (had) { Object.assign(had, { ...a, answered: had.answered, rank: had.rank > 100 ? a.rank + 100 : a.rank }); asks.set(a.id, had as Mine); continue; }
      d.asks[a.id] = a; asks.set(a.id, a);
      if (!first) { s.pending.push(a.id); s.pendAt[a.id] = now(); }
    }
  });
}

export function attach(e: Engine): () => void {
  let seenToday = false, nextSeen = false;
  const perms: Record<string, PermItem[]> = {};
  const permAsks = (first: boolean) => {
    const out: Mine[] = [];
    let i = 0;
    for (const [sid, items] of Object.entries(perms)) for (const it of items) out.push(fromPerm(sid, it, i++));
    settle(out, ["perm"], first);
  };
  const offMsg = e.subscribe((m: { type?: string; [k: string]: any }) => {
    if (m.type === "next.needs" && Array.isArray(m.needs)) {   // slice 7's list, when it comes: it is the one list
      nextSeen = true;
      settle(m.needs.map((n: { id: string; piece: string; words: string; kind?: "code" | "life"; yes?: string; serious?: boolean; rank: number; why?: string }) =>
        ({ id: n.id, rank: n.rank, piece: n.piece, kind: n.kind ?? "life", source: n.why ?? "", text: n.words, how: "inplace", answered: false, serious: !!n.serious, live: "next", ...(n.yes ? { yes: n.yes } : {}) } as Mine)), ["next", "thing", "perm"], false);
      return;
    }
    if (nextSeen) return;
    if (m.type === "home.today" && m.today && Array.isArray(m.things)) {
      const by = new Map<string, Thing>((m.things as Thing[]).map((t) => [t.id, t]));
      const list = (m.today.needs as string[]).map((id) => by.get(id)).filter((t): t is Thing => !!t && t.waitsOn === "you" && t.state !== "done");
      settle(list.map(fromThing), ["thing"], !seenToday);
      seenToday = true;
    } else if (m.type === "work.thread" && m.sessionId) {
      perms[m.sessionId] = ((m.items ?? []) as PermItem[]).filter((it) => it.kind === "perm" && it.state === "ask");
      permAsks(true);
    } else if (m.type === "work.item" && m.sessionId && m.item) {
      const it = m.item as PermItem, list = (perms[m.sessionId] ??= []).filter((x) => x.id !== it.id);
      if (it.kind === "perm" && it.state === "ask") list.push(it);
      perms[m.sessionId] = list;
      if (it.kind === "perm") permAsks(false);
    }
  });
  // the person's answers, said to the engine with today's messages (whatever answered: a press, ⌘↩, the line, "yes")
  const offStore = subscribe(() => {
    for (const [id, a] of asks) {
      const now = D.asks[id];
      if (!now) continue;
      const did = now.answered ? "yes" : now.rank > 100 ? "later" : "";
      if (!did || sent.get(id) === did) continue;
      sent.set(id, did);
      if (a.live === "thing" && a.thingId) e.send(did === "yes" ? { type: "home.answer", thingId: a.thingId, answer: typeof now.yes === "string" ? now.yes : "yes" } : { type: "home.later", thingId: a.thingId });
      else if (a.live === "perm" && did === "yes" && a.sessionId) e.send({ type: "work.perm", sessionId: a.sessionId, id: a.itemId, allow: true });
    }
  });
  e.send({ type: "home.today" });
  return () => { offMsg(); offStore(); asks.clear(); sent.clear(); };
}
