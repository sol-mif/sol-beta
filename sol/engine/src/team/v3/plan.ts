// Cowork v3, slice 2 (fr-30, #555): Space and Plan, the front, and the one "needs me" count, all folded from the trail.
// Nothing here keeps a state of its own: every write is one event appended to the trail, and every read folds the
// trail again (items and loose things per project, asks, hands and yeses). The front, the plan's four views, the stage
// chip and the notch all read the same fold, so the numbers cannot disagree.
//
// The trail adapter is the top of this file and the only place that knows slice 0's trail: `trailNow` is slice 0's,
// through door.ts (doorTrail below); the memory and file trails are the tests'.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------- the trail adapter
export type Actor = { who: string; agent?: boolean };
/** one event, as this slice reads it: `kind` is what happened, `item` the thing it is about, `data` its content */
export type Ev = { id: string; seq: number; at: string; project: string; actor: Actor; kind: string; item?: string; where?: string; data: Record<string, unknown> };
export type NewEv = { project: string; actor: Actor; kind: string; item?: string; where?: string; data?: Record<string, unknown>; at?: string };
export interface Trail {
  append(e: NewEv): Ev | Promise<Ev>;
  since(seq: number): Ev[] | Promise<Ev[]>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** whatever slice 0's module hands back, read as this slice's Ev (it names fields kind/what, data/body/content) */
export function fromRaw(raw: unknown, n = 0): Ev | null {
  if (!isObj(raw)) return null;
  const kind = typeof raw.kind === "string" ? raw.kind : typeof raw.what === "string" ? raw.what : "";
  const project = typeof raw.project === "string" ? raw.project : "";
  if (!kind || !project) return null;
  const a = isObj(raw.actor) ? raw.actor : {};
  const data = [raw.data, raw.body, raw.content].find(isObj) ?? {};
  return {
    id: typeof raw.id === "string" ? raw.id : String(raw.hash ?? raw.seq ?? n),
    seq: typeof raw.seq === "number" ? raw.seq : n,
    at: typeof raw.at === "string" ? raw.at : new Date(typeof raw.at === "number" ? raw.at : 0).toISOString(),
    project,
    actor: { who: typeof a.who === "string" ? a.who : String(raw.who ?? ""), ...(a.agent === true ? { agent: true } : {}) },
    kind,
    ...(typeof raw.item === "string" ? { item: raw.item } : {}),
    ...(typeof raw.where === "string" ? { where: raw.where } : {}),
    data,
  };
}

/** a trail in memory: the tests', and the shape of the file one below */
export function memoryTrail(seed: Ev[] = []): Trail & { all: Ev[] } {
  const all = [...seed];
  return {
    all,
    append(e) {
      const ev: Ev = { id: randomUUID(), seq: all.length + 1, at: e.at ?? new Date().toISOString(), project: e.project, actor: e.actor, kind: e.kind,
        ...(e.item ? { item: e.item } : {}), ...(e.where ? { where: e.where } : {}), data: e.data ?? {} };
      all.push(ev);
      return ev;
    },
    since: (seq) => all.filter((x) => x.seq > seq),
  };
}

/** until slice 0's trail is here: the same events, one JSON line each, in the engine's state dir */
export function fileTrail(file: string): Trail {
  const read = (): Ev[] => {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").map((l, i) => { try { return fromRaw(JSON.parse(l), i + 1); } catch { return null; } }).filter((x): x is Ev => !!x);
  };
  const mem = memoryTrail(read());
  return {
    append(e) {
      const ev = mem.append(e) as Ev;
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(ev) + "\n", { mode: 0o600 });
      return ev;
    },
    since: (seq) => mem.since(seq),
  };
}

// ---------------------------------------------------------------- slice 0's trail, seen as this slice's
// This slice's kinds are slice 0's: a loose thing is a `loose` event, an item an `item` event (its fields the value, so
// slice 0's record folds them too), anything else (ask, yes.asked, undo, item.seen) the same kind with `data` as its
// value. Read back, the first `item` of an id is item.made and the ones after item.set (the fold below decides), and
// `where` rides in the value. The door (door.ts) signs as the person, on this machine or as their agent, and turns the
// room id into the project id.
const SLICE0: Record<string, string> = { "loose.dropped": "loose", "item.made": "item", "item.set": "item" };
type DoorLike = Pick<import("./door.js").Door, "append" | "all">;
export function doorTrail(open: () => Promise<DoorLike>): Trail {
  const back = (e: import("./trail.js").TrailEvent): Ev => {
    const v = isObj(e.value) ? { ...e.value } : e.field !== undefined ? { [e.field]: e.value } : {};
    const where = typeof v.where === "string" ? v.where : undefined;
    delete v.where;
    return { id: e.id, seq: e.seq, at: new Date(e.at).toISOString(), project: e.project, actor: { who: e.by.person, ...(e.by.agent ? { agent: true } : {}) },
      kind: e.kind, ...(e.item ? { item: e.item } : {}), ...(where ? { where } : {}), data: v };
  };
  return {
    async append(e) {
      const t = await open(), { byOf } = await import("./door.js");
      const value = { ...(e.data ?? {}), ...(e.where ? { where: e.where } : {}) };
      return back(t.append({ project: e.project, by: byOf(e.actor.who, e.actor.agent), kind: SLICE0[e.kind] ?? e.kind, ...(e.item ? { item: e.item } : {}),
        value, ...(e.at ? { at: Date.parse(e.at) } : {}) }));
    },
    async since(seq) { return (await open()).all(seq).map(back); },
  };
}

let shared: Trail | null = null;
/** the trail this engine writes to: slice 0's, through the door (the file trail above is kept for a test's own file) */
export async function trailNow(_file?: string): Promise<Trail> {
  return (shared ??= doorTrail(() => import("./door.js").then((m) => m.door())));
}
/** tests */
export const _setTrail = (t: Trail | null) => { shared = t; };

// ---------------------------------------------------------------- the record this slice folds
export type State = "open" | "doing" | "review" | "blocked" | "done";
export const STATES: State[] = ["open", "doing", "review", "blocked", "done"];
export type Item = {
  id: string; project: string; title: string; state: State; date?: string; place: string; whose: string; madeBy: string;
  from: string[]; dateWhy?: string; at: string;
  /** handed to `whose` by someone else, not yet touched by them: it counts in their "needs me" */
  handedBy?: string;
};
export type Loose = { id: string; project: string; kind: string; title: string; whose: string; place: string; meta?: string; at: string };
export type Ask = { id: string; project: string; from: string; to: string; text: string; about?: string; at: string };
export type Yes = { id: string; project: string; from: string; to: string; what: string; at: string };
export type PlanRecord = { items: Item[]; loose: Loose[]; asks: Ask[]; yeses: Yes[]; people: Record<string, string[]> };

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asState = (v: unknown, d: State): State => (STATES.includes(v as State) ? (v as State) : d);

/** the whole fold: every event in order, an undone one as if it never happened (it stays on the trail) */
export function foldPlan(evs: Ev[]): PlanRecord {
  const sorted = [...evs].sort((a, b) => a.seq - b.seq);
  const undone = new Set(sorted.filter((e) => e.kind === "undo").map((e) => str(e.data.of)));
  // People's hand (people.ts handSend): a crossing addressed to a face, taken back by its own sender's crossing.undone
  const handsBy = new Map(sorted.filter((e) => e.kind === "crossing.sent" && e.data.kind === "hand" && str(e.data.undo)).map((e) => [str(e.data.undo), e.actor.who.toLowerCase()]));
  const handsUndone = new Set(sorted.filter((e) => e.kind === "crossing.undone" && handsBy.get(str(e.data.undo)) === e.actor.who.toLowerCase()).map((e) => str(e.data.undo)));
  const items = new Map<string, Item>(), loose = new Map<string, Loose>(), asks = new Map<string, Ask>(), yeses = new Map<string, Yes>();
  const people: Record<string, Set<string>> = {};
  for (const e of sorted) {
    if (e.kind === "undo" || undone.has(e.id)) continue;
    if (e.actor.who) (people[e.project] ??= new Set()).add(e.actor.who);
    const d = e.data, id = e.item ?? "";
    // slice 0's kinds (the trail's own, crossings and Talk write them): the first of an id makes it, the next ones set it
    const kind = e.kind === "item" ? (items.has(id) ? "item.set" : "item.made") : e.kind === "loose" ? (loose.has(id) ? "loose.set" : "loose.dropped") : e.kind;
    if (d.gone === true && (kind === "item.set" || kind === "loose.set")) { items.delete(id); loose.delete(id); continue; }
    switch (kind) {
      case "loose.dropped":
        if (id) loose.set(id, { id, project: e.project, kind: str(d.kind, "note"), title: str(d.title, "untitled"), whose: str(d.whose, e.actor.who), place: str(d.place, "record"), ...(d.meta ? { meta: str(d.meta) } : {}), at: e.at });
        break;
      case "loose.set": {
        const l = loose.get(id);
        if (l) { if (typeof d.title === "string" && d.title.trim()) l.title = d.title.trim(); if (typeof d.place === "string") l.place = d.place; if (typeof d.whose === "string" && d.whose) l.whose = d.whose; }
        break;
      }
      case "item.made": {
        if (!id) break;
        const from = Array.isArray(d.from) ? d.from.map(String) : [];
        for (const l of from) loose.delete(l);
        const whose = str(d.whose, e.actor.who);
        items.set(id, { id, project: e.project, title: str(d.title, "untitled"), state: asState(d.state, "open"), ...(ISO.test(str(d.date)) ? { date: str(d.date) } : {}),
          place: str(d.place, "record"), whose, madeBy: e.actor.who, from, ...(d.dateWhy ? { dateWhy: str(d.dateWhy) } : {}), at: e.at,
          ...(whose !== e.actor.who ? { handedBy: e.actor.who } : {}) });
        break;
      }
      case "item.set": {
        const it = items.get(id);
        if (!it) break;
        if (typeof d.title === "string" && d.title.trim()) it.title = d.title.trim();
        if ("state" in d) it.state = asState(d.state, it.state);
        if ("date" in d) { if (ISO.test(str(d.date))) { it.date = str(d.date); delete it.dateWhy; } else delete it.date; }
        if (typeof d.place === "string") it.place = d.place;
        if (typeof d.whose === "string" && d.whose && d.whose !== it.whose) {
          it.whose = d.whose;
          if (d.whose !== e.actor.who) it.handedBy = e.actor.who; else delete it.handedBy;
        } else if (e.actor.who === it.whose) delete it.handedBy;   // touched by the one it was handed to: in their hands now
        break;
      }
      case "crossing.sent": {   // a hand: whose is theirs from Send, and it counts in their "needs me" until they touch it
        const it = items.get(id), to = str(d.to);
        if (!it || d.kind !== "hand" || !to || handsUndone.has(str(d.undo))) break;
        it.whose = to;
        if (to !== e.actor.who) it.handedBy = e.actor.who; else delete it.handedBy;
        break;
      }
      case "item.seen": { const it = items.get(id); if (it && e.actor.who === it.whose) delete it.handedBy; break; }
      case "ask":
        if (id) asks.set(id, { id, project: e.project, from: e.actor.who, to: str(d.to), text: str(d.text), ...(d.about ? { about: str(d.about) } : {}), at: e.at });
        break;
      case "ask.answered": asks.delete(str(d.of, id)); break;
      case "yes.asked":
        if (id) yeses.set(id, { id, project: e.project, from: e.actor.who, to: str(d.to), what: str(d.what), at: e.at });
        break;
      case "yes.given": case "yes.refused": yeses.delete(str(d.of, id)); break;
    }
  }
  return { items: [...items.values()], loose: [...loose.values()], asks: [...asks.values()], yeses: [...yeses.values()],
    people: Object.fromEntries(Object.entries(people).map(([k, v]) => [k, [...v]])) };
}

// ---------------------------------------------------------------- what needs me: one count
export type Need = { kind: "ask" | "hand" | "yes"; id: string; project: string; from: string; line: string; item?: string };
/** asks addressed to me, items handed to me, an owner's yes asked of me: one list, its length the one count */
export function needsList(rec: PlanRecord, me: string, project?: string): Need[] {
  if (!me) return [];
  const inP = (p: string) => !project || p === project;
  const out: Need[] = [];
  for (const a of rec.asks) if (a.to === me && a.from !== me && inP(a.project)) out.push({ kind: "ask", id: a.id, project: a.project, from: a.from, line: a.text || `${a.from} asks you`, ...(a.about ? { item: a.about } : {}) });
  for (const i of rec.items) if (i.whose === me && i.handedBy && i.handedBy !== me && i.state !== "done" && inP(i.project)) out.push({ kind: "hand", id: i.id, project: i.project, from: i.handedBy, line: i.title, item: i.id });
  for (const y of rec.yeses) if (y.to === me && y.from !== me && inP(y.project)) out.push({ kind: "yes", id: y.id, project: y.project, from: y.from, line: y.what });
  return out;
}
export const needsMe = (rec: PlanRecord, me: string, project?: string) => needsList(rec, me, project).length;

// ---------------------------------------------------------------- dates: the one clock is the caller's `today`
const toD = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toI = (dt: Date) => dt.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return toI(d); };
const dow = (iso: string) => toD(iso).getUTCDay();
export const nextFriday = (today: string) => addDays(today, ((5 - dow(today) + 7) % 7) || 7);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** a date in words ("by Nov 5", "on the 14th", "Friday", "tomorrow", "next week", 2026-11-05), else null */
export function dateIn(text: string, today: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (iso) return iso[1];
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/) ?? null;
  const dm = md ? null : t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (md || dm) {
    const mon = MONTHS.indexOf((md ? md[1] : dm![2]).slice(0, 3)), day = Number(md ? md[2] : dm![1]);
    if (day >= 1 && day <= 31) {
      let y = Number(today.slice(0, 4));
      const c = () => `${y}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (c() < today) y++;
      return c();
    }
  }
  const nth = t.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
  if (nth) {
    const day = Number(nth[1]); const [y, m] = today.split("-").map(Number);
    let c = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (c < today) { const n = toD(`${y}-${String(m).padStart(2, "0")}-01`); n.setUTCMonth(n.getUTCMonth() + 1); c = `${toI(n).slice(0, 8)}${String(day).padStart(2, "0")}`; }
    return day >= 1 && day <= 31 ? c : null;
  }
  if (/\btoday\b|\btonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\bnext week\b/.test(t)) return addDays(today, ((1 - dow(today) + 7) % 7) || 7);
  for (let i = 0; i < 7; i++) if (new RegExp(`\\b${DAYS[i]}\\b`).test(t)) return addDays(today, ((i - dow(today) + 7) % 7) || 7);
  return null;
}
/** the date a loose thing gets as it becomes an item: where it was dropped, what it says, or next Friday */
export function guessDate(text: string, today: string, dropped?: string | null): { date: string; why: string } {
  if (dropped && ISO.test(dropped)) return { date: dropped, why: "where you dropped it" };
  const d = dateIn(text, today);
  return d ? { date: d, why: "date from what it says" } : { date: nextFriday(today), why: "date guessed" };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** a loose thing's words made an item's title: a verb for what it is */
export function guessTitle(l: Pick<Loose, "kind" | "title">): string {
  const clean = l.title.replace(/\.(pdf|png|jpe?g|fig|docx?)$/i, "").replace(/[-_]/g, " ").replace(/^re:\s*/i, "").trim();
  const v: Record<string, (t: string) => string> = {
    pdf: (t) => `Read the ${t}`, photo: (t) => `Look at ${t}`, link: (t) => `Look at ${t}`, email: (t) => `Answer: ${t}`,
    sketch: (t) => `Design: ${t.replace(/^./, (c) => c.toLowerCase())}`, poll: (t) => `Decide: ${t.replace(/\?$/, "")}`,
  };
  const f = v[l.kind];
  if (f) return f(clean);
  const s = clean.replace(/^(we should|we need to|maybe|i think)\s+/i, "");
  return cap(s.length > 60 ? s.slice(0, 59).replace(/[\s,.;:]+$/, "") + "…" : s) || "Untitled";
}

// ---------------------------------------------------------------- the views: the same items, four ways
export type Views = {
  list: string[];
  board: Record<"open" | "doing" | "review" | "done", string[]>;
  calendar: { days: { day: string; ids: string[] }[]; undated: string[] };
  timeline: { rows: { id: string; start: string; end: string }[]; undated: string[] };
};
const RANK: Record<State, number> = { review: 0, doing: 1, blocked: 1, open: 2, done: 9 };
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => RANK[a.state] - RANK[b.state] || (a.date ?? "9999") .localeCompare(b.date ?? "9999") || a.at.localeCompare(b.at));
}
export function views(items: Item[]): Views {
  const s = sortItems(items);
  const board: Views["board"] = { open: [], doing: [], review: [], done: [] };
  for (const i of s) board[i.state === "blocked" ? "doing" : i.state].push(i.id);
  const byDay = new Map<string, string[]>();
  for (const i of s) if (i.date) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i.id]);
  const dated = s.filter((i) => i.date).sort((a, b) => a.date!.localeCompare(b.date!));
  return {
    list: s.map((i) => i.id),
    board,
    calendar: { days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, ids]) => ({ day, ids })), undated: s.filter((i) => !i.date).map((i) => i.id) },
    timeline: { rows: dated.map((i) => ({ id: i.id, start: addDays(i.date!, i.state === "done" ? -4 : -3), end: i.date! })), undated: s.filter((i) => !i.date).map((i) => i.id) },
  };
}

// ---------------------------------------------------------------- the front: one tile per project
export type Project = { id: string; name: string };
export type Next = { label: string; kind: Need["kind"] | "due"; whose: string; place: string; item?: string };
export type Tile = { project: string; name: string; count: number; next: Next | null; more: number; quiet: boolean; faces: string[] };
export function front(rec: PlanRecord, me: string, projects: Project[], today: string): Tile[] {
  const all = new Map(projects.map((p) => [p.id, p] as const));
  for (const p of [...rec.items, ...rec.loose].map((x) => x.project)) if (!all.has(p)) all.set(p, { id: p, name: p });
  const tiles = [...all.values()].map((p): Tile => {
    const needs = needsList(rec, me, p.id);
    const n0 = needs[0];
    const itemOf = (id?: string) => rec.items.find((i) => i.id === id);
    let next: Next | null = null;
    if (n0) {
      const it = itemOf(n0.item);
      next = n0.kind === "ask" ? { label: `Answer ${n0.from}`, kind: "ask", whose: n0.from, place: "chat", ...(n0.item ? { item: n0.item } : {}) }
        : n0.kind === "hand" ? { label: `${n0.line} · from ${n0.from}`, kind: "hand", whose: me, place: it?.place ?? "record", item: n0.id }
        : { label: `Say yes: ${n0.line}`, kind: "yes", whose: n0.from, place: "record" };
    } else {
      const due = sortItems(rec.items.filter((i) => i.project === p.id && i.date && i.state !== "done" && i.date >= today)).sort((a, b) => a.date!.localeCompare(b.date!))[0];
      if (due) next = { label: `${due.title} · ${due.date}`, kind: "due", whose: due.whose, place: due.place, item: due.id };
    }
    return { project: p.id, name: p.name, count: needs.length, next, more: Math.max(0, needs.length - 1), quiet: needs.length === 0, faces: rec.people[p.id] ?? [] };
  });
  return tiles.sort((a, b) => Number(a.quiet) - Number(b.quiet) || b.count - a.count || a.name.localeCompare(b.name));
}
/** the rooms of a project that hold something (this slice's: Space and Plan), so the sidebar shows a room only once it is used */
export function roomsOf(rec: PlanRecord, project: string): string[] {
  const has = rec.items.some((i) => i.project === project) || rec.loose.some((l) => l.project === project);
  return has ? ["plan"] : [];
}

// ---------------------------------------------------------------- the writes: one event each, and Undo
export const readAll = async (t: Trail) => foldPlan(await t.since(0));

/** a thought, a file or a link dropped in the space: a loose thing */
export async function drop(t: Trail, o: { project: string; actor: Actor; title: string; kind?: string; place?: string; meta?: string }) {
  const title = o.title.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!o.project || !title) return { error: "a loose thing needs a project and words" };
  const url = /^(https?:\/\/|www\.)\S+$/i.test(title);
  const id = `l-${randomUUID().slice(0, 8)}`;
  const ev = await t.append({ project: o.project, actor: o.actor, kind: "loose.dropped", item: id, where: o.place ?? "record",
    data: { kind: o.kind ?? (url ? "link" : "note"), title, place: o.place ?? "record", whose: o.actor.who, ...(o.meta ? { meta: o.meta } : {}) } });
  return { loose: id, undo: ev.id };
}

/** a loose thing onto the plan's lane: one event makes it an item with a guessed date; the event's id is the Undo */
export async function toItem(t: Trail, o: { project: string; actor: Actor; loose: string | string[]; today: string; target?: { date?: string | null; state?: string | null }; place?: string }) {
  const rec = await readAll(t);
  const ids = Array.isArray(o.loose) ? o.loose : [o.loose];
  const list = ids.map((id) => rec.loose.find((l) => l.id === id && l.project === o.project));
  if (!ids.length || list.some((l) => !l)) return { error: "that loose thing is not in this space any more (made an item already, or undone)" };
  const ls = list as Loose[];
  const g = guessDate(ls.map((l) => l.title).join(" "), o.today, o.target?.date);
  const title = ls.length > 1 ? `${guessTitle(ls[0])} and ${ls.length - 1} more` : guessTitle(ls[0]);
  const id = `i-${randomUUID().slice(0, 8)}`;
  const state = asState(o.target?.state, "open");
  const ev = await t.append({ project: o.project, actor: o.actor, kind: "item.made", item: id, where: o.place ?? "record",
    data: { title, date: g.date, dateWhy: g.why, state, place: o.place ?? "record", whose: ls[0].whose || o.actor.who, from: ids } });
  const item = foldPlan(await t.since(0)).items.find((i) => i.id === id)!;
  return { item, undo: ev.id, why: g.why };
}

/** Undo: one more event; the one it undoes stays on the trail and folds as if it never happened */
export async function undo(t: Trail, o: { project: string; actor: Actor; token: string }) {
  const evs = await t.since(0);
  const of = evs.find((e) => e.id === o.token);
  if (!of || of.kind === "undo") return { error: "nothing to undo there" };
  if (evs.some((e) => e.kind === "undo" && e.data.of === o.token)) return { ok: true, already: true };   // pressed twice: one undo
  if (of.actor.who !== o.actor.who) return { error: "only the one who did it undoes it" };
  await t.append({ project: of.project, actor: o.actor, kind: "undo", item: of.item, where: of.where, data: { of: o.token } });
  return { ok: true };
}

/** a change to an item from a view: its state (board), its date (calendar), its words, or whose (a hand) */
export async function move(t: Trail, o: { project: string; actor: Actor; item: string; state?: string; date?: string | null; title?: string; whose?: string }) {
  const rec = await readAll(t);
  if (!rec.items.some((i) => i.id === o.item && i.project === o.project)) return { error: "that item is not in this plan" };
  const data: Record<string, unknown> = {};
  if (o.state && STATES.includes(o.state as State)) data.state = o.state;
  if (o.date !== undefined) data.date = o.date && ISO.test(o.date) ? o.date : null;
  if (typeof o.title === "string" && o.title.trim()) data.title = o.title.trim().slice(0, 240);
  if (typeof o.whose === "string" && o.whose) data.whose = o.whose;
  if (!Object.keys(data).length) return { error: "nothing to change" };
  const ev = await t.append({ project: o.project, actor: o.actor, kind: "item.set", item: o.item, data });
  return { ok: true, undo: ev.id };
}
