// Cowork v3, slice 1 (fr-30, #554): the crossing. The composer in a session that carries a project chip makes a thing
// (an item, a note, a document or an automation) instead of a message; the thing's own foot strip says where it goes,
// "→ <project> · <spot>  Send  Keep in Home". Send writes one event on the trail and gives an undo token good for 8 s;
// Undo writes a second event that points at the first, so nothing is ever deleted and what a project holds is the fold
// of sent minus undone. Nothing leaves Home another way. Loaded only when the switch is on (settings.ts coworkV3):
// wire.ts and work/tools.ts import this file dynamically, behind it.
import { randomUUID } from "node:crypto";

// ---- the trail, as this slice uses it (one place to change when slice 0's team/v3/trail.ts lands) ----
// Slice 0 owns the trail: signed, hash-chained per writer, folded into the record. This slice needs only append and a
// read since a sequence number: the memory trail below is the tests', doorTrail (the end of this file) the engine's.
export type Actor = { who: string; agent?: boolean };
export type TrailDraft = { kind: string; project: string; actor: Actor; what: string; ref?: string; body?: Record<string, unknown> };
export type TrailEvent = TrailDraft & { id: string; seq: number; at: string };
export interface TrailPort {
  append(e: TrailDraft): TrailEvent | Promise<TrailEvent>;
  since(seq: number, project?: string): TrailEvent[] | Promise<TrailEvent[]>;
}
export function memoryTrail(now: () => number = Date.now): TrailPort & { all: TrailEvent[] } {
  const all: TrailEvent[] = [];
  return {
    all,
    append(e) { const ev = { ...e, id: randomUUID(), seq: all.length + 1, at: new Date(now()).toISOString() }; all.push(ev); return ev; },
    since(seq, project) { return all.filter((e) => e.seq > seq && (!project || e.project === project)); },
  };
}
// ---- end of the trail's door

export type Kind = "item" | "note" | "document" | "automation";
export type Spot = "plan" | "space" | "artifacts" | "automations";
export const SPOT: Record<Kind, Spot> = { item: "plan", note: "space", document: "artifacts", automation: "automations" };
export const SPOT_NAME: Record<Spot, string> = { plan: "Plan", space: "Space", artifacts: "Artifacts", automations: "Automations" };
const LABEL: Record<Kind, string> = { item: "an item", note: "a note", document: "a document", automation: "an automation" };
export const UNDO_MS = 8000;

export type Person = { login: string; name?: string };
export type Ctx = { project: { id: string; name: string } | null; people?: Person[]; me?: string; today?: string; topic?: string };
export type Proposal = {
  id: string; kind: Kind; title: string; project: string; projectName: string; spot: Spot; date?: string;
  whose?: string;   // the login it is for (an item for Frank), absent: the maker's own
  whoseName?: string;   // the word that named them ("Frank"), for the card
  from: string;     // the session it was made in
  words: string;    // what was typed, kept so the item's history can say it
};

// ---- the autocomposer: words to a thing ----
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (s: string) => new Date(s + "T12:00:00Z");
/** a date in the words, relative to today (YYYY-MM-DD): "by Nov 5", "5 Nov", "tomorrow", "friday" */
export function parseDate(t: string, today: string): { iso: string; phrase: string } | null {
  const y = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  // a month well before this one is next year's ("by Jan 3" said in November)
  const mk = (mi: number, day: number) => { const yr = mi + 1 < month - 1 ? y + 1 : y; return `${yr}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; };
  let m = t.match(/\b(?:by|on|before|due)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (m) return { iso: mk(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)), Number(m[2])), phrase: m[0] };
  m = t.match(/\b(?:by|on|before|due)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (m) return { iso: mk(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)), Number(m[1])), phrase: m[0] };
  m = t.match(/\b(?:by|on|before|due)?\s*(today|tonight|tomorrow)\b/i);
  if (m) { const d = dayOf(today); if (/tomorrow/i.test(m[1])) d.setUTCDate(d.getUTCDate() + 1); return { iso: iso(d), phrase: m[0] }; }
  m = t.match(/\b(?:by|on|before|due)\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/i);
  if (m) {
    const wd = DAYS.indexOf(m[1].toLowerCase().slice(0, 3)), d = dayOf(today);
    let add = (wd - d.getUTCDay() + 7) % 7; if (add === 0) add = 7;
    d.setUTCDate(d.getUTCDate() + add); return { iso: iso(d), phrase: m[0] };
  }
  return null;
}
const FLOWY = /\b(?:every|each)\s+(?:day|evening|morning|night|week|month|hour|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri)\w*|\bwhenever\b|\bwhen\b.+\b(?:happens|lands|arrives|merges|opens|turns red)\b|^automate\b/i;
const DOC = /^(?:(?:write|draft|start|make)\s+(?:up\s+)?(?:a|an|the)\s+(?:doc|document|page|brief|spec|write-?up|one-?pager)\b(?:\s+(?:about|on|for|of))?|(?:doc|document)\s*:)/i;
const NOTE = /^(?:note\s*(?:for the team)?\s*[:,-]?|tell the team\b(?:\s+that)?|let the team know\b(?:\s+that)?|remember that\b|for the team\s*:)/i;
const MAKES = /\b(item|todo|to-do|task|remind|should go|assign|due|by)\b/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s.,:;!-]+|[\s.,:;!-]+$/g, "").trim();
/** who in the project the words name: a capitalised word that is a person's first name or the start of their login */
function whoIn(t: string, people: Person[], me?: string): { login: string; phrase: string } | null {
  for (const m of t.matchAll(/\b(?:(to|for|with|ask|remind)\s+)?([A-Z][a-z]{2,})\b/g)) {
    const w = m[2].toLowerCase();
    const p = people.find((x) => x.login !== me && ((x.name ?? "").split(/\s+/)[0].toLowerCase() === w || x.login.toLowerCase().startsWith(w)));
    if (p) return { login: p.login, phrase: m[0] };
  }
  return null;
}
/** what the words make, or null when they are a message (the composer then sends them as today) */
export function parse(text: string, ctx: Ctx): { kind: Kind; title: string; date?: string; whose?: string; whoseName?: string } | null {
  const t = text.trim();
  if (!t || t.startsWith("/")) return null;
  const today = ctx.today ?? iso(new Date());
  if (FLOWY.test(t)) return { kind: "automation", title: cap(tidy(t.replace(/^automate\s*:?\s*/i, ""))) };
  const doc = t.match(DOC);
  if (doc) return { kind: "document", title: cap(tidy(t.slice(doc[0].length))) || ctx.topic || "Untitled" };
  const note = t.match(NOTE);
  if (note) return { kind: "note", title: cap(tidy(t.slice(note[0].length))) || "A note" };
  const d = parseDate(t, today), who = whoIn(t, ctx.people ?? [], ctx.me);
  if (!d && !who && !MAKES.test(t)) return null;
  let title: string;
  if (/^(this|it|that)\b/i.test(t) || /\b(this|that)\s+(should|needs|goes)\b/i.test(t)) title = ctx.topic || "Untitled";
  else {
    let s = t;
    if (d) s = s.replace(d.phrase, " ");
    if (who) s = s.replace(who.phrase, " ");
    s = s.replace(/\b(should go|goes|needs to go|make (an? )?(item|task)|remind|by|on|due)\b/gi, " ");
    title = cap(tidy(s)) || ctx.topic || "Untitled";
  }
  return { kind: "item", title, ...(d ? { date: d.iso } : {}), ...(who ? { whose: who.login, whoseName: who.phrase.replace(/^\w+\s+(?=[A-Z])/, "") } : {}) };
}

// ---- propose, send, undo ----
export type Sent = { token: string; event: TrailEvent; until: number; again?: boolean };
export function crossingOf(deps: { trail: TrailPort; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const sent = new Map<string, Promise<Sent>>();    // proposal id -> its live send (F4: a second press is the same event)
  const tokens = new Map<string, { proposal: string; event: TrailEvent; until: number; undone?: TrailEvent }>();
  return {
    propose(sessionId: string, text: string, ctx: Ctx): Proposal | null {
      if (!ctx.project) return null;   // a session with no project chip is today's session (fr-07)
      const p = parse(text, ctx);
      if (!p) return null;
      return { id: "x-" + randomUUID(), ...p, project: ctx.project.id, projectName: ctx.project.name, spot: SPOT[p.kind], from: sessionId, words: text.trim() };
    },
    /** a thing whose kind and title are already known (the page pane's page, sent as a document) */
    proposeThing(sessionId: string, thing: { kind: Kind; title: string; words?: string }, ctx: Ctx): Proposal | null {
      if (!ctx.project || !SPOT[thing.kind]) return null;
      const title = tidy(thing.title) || ctx.topic || "Untitled";
      return { id: "x-" + randomUUID(), kind: thing.kind, title, project: ctx.project.id, projectName: ctx.project.name, spot: SPOT[thing.kind], from: sessionId, words: thing.words ?? title };
    },
    send(p: Proposal, actor: Actor): Promise<Sent> {
      // the first press holds the place before the trail answers, so a second press in the same instant is the same send
      const had = sent.get(p.id);
      if (had) return had.then((s) => ({ ...s, again: true }));
      const where = `${p.projectName} · ${SPOT_NAME[p.spot]}`;
      const go = (async () => {
        const event = await deps.trail.append({
          kind: "crossing.sent", project: p.project, actor, what: `sent ${LABEL[p.kind]} to ${where}`,
          body: { proposal: p.id, kind: p.kind, title: p.title, spot: p.spot, ...(p.date ? { date: p.date } : {}), ...(p.whose ? { whose: p.whose } : {}), from: p.from, words: p.words },
        });
        const s: Sent = { token: randomUUID(), event, until: now() + UNDO_MS };
        tokens.set(s.token, { proposal: p.id, event, until: s.until });
        return s;
      })();
      sent.set(p.id, go);
      go.catch(() => sent.delete(p.id));   // a trail that refused: the next press tries again
      return go;
    },
    /** Undo within 8 s: a second event pointing at the first; after that the thing stays where it went */
    async undo(token: string, actor: Actor): Promise<{ ok: true; event: TrailEvent; already?: boolean } | { ok: false; why: string }> {
      const t = tokens.get(token);
      if (!t) return { ok: false, why: "nothing to undo with that token" };
      if (t.undone) return { ok: true, event: t.undone, already: true };
      if (now() > t.until) return { ok: false, why: "too late to undo: it has been in the project for more than 8 seconds" };
      t.undone = await deps.trail.append({ kind: "crossing.undone", project: t.event.project, actor, what: "took it back to Home", ref: t.event.id });
      sent.delete(t.proposal);   // undone, the same card may be sent again: a new event then
      return { ok: true, event: t.undone };
    },
    /** what crossed into a project and stayed: sent minus undone, in order (the fold this slice needs) */
    async landed(project: string): Promise<TrailEvent[]> {
      const all = await deps.trail.since(0, project);
      const gone = new Set(all.filter((e) => e.kind === "crossing.undone" && e.ref).map((e) => e.ref));
      return all.filter((e) => e.kind === "crossing.sent" && !gone.has(e.id));
    },
  };
}
export type Crossing = ReturnType<typeof crossingOf>;

// ---- slice 0's trail behind this slice's two calls (door.ts: signed, the project id made there) ----
// A crossing lands as the thing itself, so the project's record and its Plan hold it with no step between:
//   an item     → an `item` event (title, state open, date?, whose, place record), `via` naming the crossing
//   a note, a document → a `loose` event of that kind
//   an automation → the studio's own `automation` event (studio.ts write: name, words, the flow drawn from them, owner,
//                 on, spend), so the Automations room holds it as an automation, owned and paid by its sender
//   Undo        → an `undo` event { of: the sent event }, the same undo the Plan's own Undo writes (plan.ts)
// Read back, an event carrying `via.crossing` is this slice's crossing.sent, and an undo its crossing.undone.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type DoorLike = Pick<import("./door.js").Door, "append" | "since" | "all" | "get">;
export function doorTrail(open: () => Promise<DoorLike>): TrailPort {
  const iso = (n: number) => new Date(n).toISOString();
  const by = async (a: Actor) => (await import("./door.js")).byOf(a.who, a.agent);
  const back = (e: import("./trail.js").TrailEvent): TrailEvent | null => {
    const v = isObj(e.value) ? e.value : {}, via = isObj(v.via) ? v.via : null;
    const actor: Actor = { who: e.by.person, ...(e.by.agent ? { agent: true } : {}) };
    if ((e.kind === "item" || e.kind === "loose" || e.kind === "automation") && via && typeof via.crossing === "string") {
      const whose = typeof v.whose === "string" && v.whose !== e.by.person ? v.whose : undefined;
      return { kind: "crossing.sent", project: e.project, actor, what: String(via.what ?? ""), id: e.id, seq: e.seq, at: iso(e.at),
        body: { proposal: via.crossing, kind: via.kind, title: v.title ?? v.name, spot: via.spot, ...(typeof v.date === "string" ? { date: v.date } : {}), ...(whose ? { whose } : {}), from: via.session, words: via.words } };
    }
    if (e.kind === "undo" && typeof v.of === "string") return { kind: "crossing.undone", project: e.project, actor, what: "took it back to Home", ref: v.of, id: e.id, seq: e.seq, at: iso(e.at) };
    return null;
  };
  return {
    async append(d) {
      const t = await open();
      let e: import("./trail.js").TrailEvent;
      if (d.kind === "crossing.sent" && (d.body ?? {}).kind === "automation") {
        const b = d.body ?? {}, S = await import("./studio.js"), owner = String(b.whose ?? d.actor.who);
        const words = String(b.words ?? b.title ?? ""), flow = S.parse(words).flow;
        const via = { crossing: b.proposal, kind: b.kind, spot: b.spot, words: b.words, session: b.from, what: d.what };
        e = t.append({ project: d.project, by: await by(d.actor), kind: "automation", item: `au-${String(b.proposal).replace(/^x-/, "")}`,
          value: { what: "made it in Home", name: String(b.title ?? "").slice(0, 80) || S.nameOf(flow), words, flow, owner, on: true,
            spend: { who: owner, limit: S.DEFAULT_LIMIT }, via } });
      } else if (d.kind === "crossing.sent") {
        const b = d.body ?? {}, item = b.kind === "item";
        const via = { crossing: b.proposal, kind: b.kind, spot: b.spot, words: b.words, session: b.from, what: d.what };
        e = t.append({ project: d.project, by: await by(d.actor), kind: item ? "item" : "loose", item: `${item ? "i" : "l"}-${String(b.proposal).replace(/^x-/, "")}`,
          value: { title: b.title, whose: b.whose ?? d.actor.who, place: "record", ...(item ? { state: "open", from: [], ...(b.date ? { date: b.date } : {}) } : { kind: b.kind }), via } });
      } else if (d.kind === "crossing.undone" && d.ref) {
        const sent = t.get(d.ref);
        e = t.append({ project: d.project, by: await by(d.actor), kind: "undo", ...(sent?.item ? { item: sent.item } : {}), value: { of: d.ref } });
      } else throw new Error(`the crossing writes no ${d.kind}`);
      return back(e) ?? { ...d, id: e.id, seq: e.seq, at: iso(e.at) };
    },
    async since(seq, project) {
      const t = await open();
      return (project ? t.since(project, seq) : t.all(seq)).flatMap((e) => { const x = back(e); return x ? [x] : []; });
    },
  };
}

// the one this engine uses: slice 0's trail through the door
let one: Crossing | null = null;
export const crossing = (): Crossing => (one ??= crossingOf({ trail: doorTrail(() => import("./door.js").then((m) => m.door())) }));
export const _setCrossing = (c: Crossing | null) => { one = c; };
