// Cowork v3, slice 5 (fr-30, #558): Talk on the trail. One general thread per project and one thread per thing in it
// (an item, a loose thing, an artifact), keyed by the thing's own id, so a thread opens beside its row wherever the row
// is drawn. Today's Talk (team/talk.ts, the face's Talk.tsx) is not replaced: the face draws these lines with the same
// Talk, given this transport (cowork/v3/Talk.tsx).
// Every line is one `talk` event. Writing @name names a member: each name is one `ask` event { to, text, about, line }
// (the shape slice 2's needsMe counts: kind "ask", the login in `to`), and the person named answers by saying anything
// in that thread (one `ask.answered` event { of } per ask), or with the answer press. A line becomes a loose thing in
// one gesture: one `loose` event (the kind slice 0's record folds), its `from` naming the line; a second press is the
// same loose thing and no event. A guest reads and never writes; an agent writes here only when the project allows it.
import { newId, recordOf, roleOf, type By, type Ev, type Port, type Rec } from "./port5.js";

export const GENERAL = "general";
export const TEXT_MAX = 4000;
export type ThingKind = "item" | "loose" | "artifact";
export type Line = { id: string; thread: string; from: string; agent?: string; at: number; text: string; asks: string[]; loose?: string };
export type Thread = { id: string; kind: "general" | ThingKind; title: string; whose?: string; place?: string; state?: string;
  lines: number; last?: Line; asksMe: number };
export type Ask = { id: string; project: string; from: string; to: string; text: string; about: string; line: string; at: number };

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const val = (e: Ev): Record<string, unknown> => (e.value && typeof e.value === "object" && !Array.isArray(e.value) ? e.value as Record<string, unknown> : {});
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** the things of a project that have a thread: items not done, loose things, artifacts (pure) */
export function thingsOf(rec: Rec): { id: string; kind: ThingKind; title: string; whose?: string; place?: string; state?: string }[] {
  const out: ReturnType<typeof thingsOf> = [];
  const add = (kind: ThingKind, o: { id: string; by: By; fields: Record<string, unknown> }) =>
    out.push({ id: o.id, kind, title: str(o.fields.title, o.id), whose: str(o.fields.whose, o.by.person), place: str(o.fields.place, "record"), ...(o.fields.state ? { state: str(o.fields.state) } : {}) });
  for (const o of Object.values(rec.items)) if (o.fields.state !== "done") add("item", o);
  for (const o of Object.values(rec.loose)) if (!o.fields.gone) add("loose", o);
  for (const o of Object.values(rec.artifacts)) add("artifact", o);
  return out;
}

/** the people @name can reach: the members, and anyone who has written in the project (pure) */
export function namesOf(evs: Ev[], rec: Rec): string[] {
  const s = new Map<string, string>();
  for (const m of Object.values(rec.members)) if (m.fields.in === true) s.set(m.id.toLowerCase(), m.id);
  for (const e of evs) if (!s.has(e.by.person.toLowerCase())) s.set(e.by.person.toLowerCase(), e.by.person);
  return [...s.values()];
}
/** who a line names with @: logins of the people it can reach, each once, in the order written (pure) */
export function mentions(text: string, people: string[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(^|[^\w@])@([A-Za-z0-9][A-Za-z0-9-]{0,38})/g)) {
    const w = people.find((p) => same(p, m[2].replace(/-+$/, "")));
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/** a project's lines, in the order said, each with what it asked and the loose thing made of it (pure) */
export function linesOf(evs: Ev[], thread?: string): Line[] {
  const lines = new Map<string, Line>();
  for (const e of [...evs].sort((a, b) => a.at - b.at || a.seq - b.seq)) {
    const v = val(e);
    if (e.kind === "talk" && e.item) {
      const t = str(v.thread, GENERAL);
      if (thread !== undefined && t !== thread) continue;
      lines.set(e.item, { id: e.item, thread: t, from: e.by.person, ...(e.by.agent ? { agent: e.by.agent } : {}), at: e.at, text: str(v.text),
        asks: Array.isArray(v.asks) ? v.asks.map(String) : [] });
    } else if (e.kind === "loose" && e.item && str(v.from).startsWith("talk:")) {
      const l = lines.get(str(v.from).slice(5));
      if (l) l.loose = e.item;
    }
  }
  return [...lines.values()];
}

/** the asks still open in a project: named and not answered (pure); `to` narrows to one person */
export function openAsks(evs: Ev[], to?: string): Ask[] {
  const asks = new Map<string, Ask>();
  for (const e of [...evs].sort((a, b) => a.at - b.at || a.seq - b.seq)) {
    const v = val(e);
    if (e.kind === "ask" && e.item) asks.set(e.item, { id: e.item, project: e.project, from: e.by.person, to: str(v.to), text: str(v.text), about: str(v.about, GENERAL), line: str(v.line), at: e.at });
    else if (e.kind === "ask.answered") asks.delete(str(v.of, e.item ?? ""));
  }
  return [...asks.values()].filter((a) => !to || (same(a.to, to) && !same(a.from, to)));
}

/** the threads of a project as the side lists them: general, then the things that have lines (newest first), then the
 *  rest; how many asks to me wait in each (pure) */
export function threadsOf(evs: Ev[], me: string): Thread[] {
  const rec = recordOf(evs), lines = linesOf(evs), mine = openAsks(evs, me);
  const of = (id: string) => lines.filter((l) => l.thread === id);
  const one = (id: string, kind: Thread["kind"], title: string, extra: Partial<Thread> = {}): Thread => {
    const ls = of(id);
    return { id, kind, title, ...extra, lines: ls.length, ...(ls.length ? { last: ls[ls.length - 1] } : {}), asksMe: mine.filter((a) => a.about === id).length };
  };
  const things = thingsOf(rec).map((t) => one(t.id, t.kind, t.title, { whose: t.whose, place: t.place, ...(t.state ? { state: t.state } : {}) }));
  things.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0) || a.title.localeCompare(b.title));
  return [one(GENERAL, "general", GENERAL), ...things];
}

type Who = { project: string; by: By };
function mayWrite(rec: Rec, by: By): string {
  const role = roleOf(rec, by.person);
  if (role === "guest") return "a guest reads Talk; they do not write in it";
  if (by.agent && rec.settings.project.agentsTalk !== true) return "agents are quiet in this project's Talk: its owners can let them post facts";
  return "";
}

/** one line said in a thread: one `talk` event, one `ask` per person it names, and the asks to me in that thread
 *  answered (one `ask.answered` each) */
export function say(port: Port, o: Who & { thread: string; text: string }): { line: Line; asks: Ask[]; answered: string[] } | { error: string } {
  const text = (o.text ?? "").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? c : " ")).trim();
  if (!text) return { error: "say something first" };
  if (text.length > TEXT_MAX) return { error: `a line is ${TEXT_MAX} characters at most` };
  const evs = port.since(o.project), rec = recordOf(evs);
  const thread = o.thread || GENERAL;
  if (thread !== GENERAL && !thingsOf(rec).some((t) => t.id === thread)) return { error: "that thing is not in this project" };
  const no = mayWrite(rec, o.by);
  if (no) return { error: no };
  const named = mentions(text, namesOf(evs, rec)).filter((w) => !same(w, o.by.person));
  const id = newId("t");
  const e = port.append({ project: o.project, by: o.by, kind: "talk", item: id, value: { thread, text, ...(named.length ? { asks: named } : {}) } });
  const asks = named.map((to) => {
    const a = port.append({ project: o.project, by: o.by, kind: "ask", item: `a-${id.slice(2)}-${to.toLowerCase()}`, value: { to, text: trunc(text, 280), about: thread, line: id } });
    return { id: a.item!, project: o.project, from: o.by.person, to, text: trunc(text, 280), about: thread, line: id, at: a.at };
  });
  // the person named answers by speaking in that thread
  const answered = o.by.agent ? [] : openAsks(evs, o.by.person).filter((a) => a.about === thread).map((a) => {
    port.append({ project: o.project, by: o.by, kind: "ask.answered", item: a.id, value: { of: a.id, line: id } });
    return a.id;
  });
  return { line: { id, thread, from: o.by.person, ...(o.by.agent ? { agent: o.by.agent } : {}), at: e.at, text, asks: named }, asks, answered };
}

/** the answer press: an ask to me, answered without a line */
export function answer(port: Port, o: Who & { ask: string }): { answered: string } | { error: string } {
  const a = openAsks(port.since(o.project)).find((x) => x.id === o.ask);
  if (!a) return { error: "that ask is answered already" };
  if (!same(a.to, o.by.person)) return { error: "only the person it names answers it" };
  port.append({ project: o.project, by: o.by, kind: "ask.answered", item: a.id, value: { of: a.id } });
  return { answered: a.id };
}

/** a line made a loose thing in the project's space: one gesture, one `loose` event; the same line again is the same
 *  loose thing, and no event */
export function toLoose(port: Port, o: Who & { line: string }): { loose: string; event?: Ev; already?: true } | { error: string } {
  const evs = port.since(o.project), rec = recordOf(evs);
  const l = linesOf(evs).find((x) => x.id === o.line);
  if (!l) return { error: "that line is not in this project" };
  if (l.loose) return { loose: l.loose, already: true };
  if (roleOf(rec, o.by.person) === "guest") return { error: "a guest reads Talk; they do not move it" };
  const thing = l.thread === GENERAL ? null : thingsOf(rec).find((t) => t.id === l.thread);
  const title = trunc(l.text.replace(/^@[\w-]+[,:]?\s*/, "").replace(/\s+/g, " "), 70);
  const event = port.append({ project: o.project, by: o.by, kind: "loose", item: `l-${l.id.slice(2)}`,
    value: { kind: "note", title, quote: l.text, whose: l.from, place: "record", from: `talk:${l.id}`, thread: l.thread, fromLine: `Talk › ${thing?.title ?? GENERAL}` } });
  return { loose: event.item!, event };
}
