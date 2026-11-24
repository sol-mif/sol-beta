// Today, the one list (#790; design §7.8; specs home-plan §6 Home 1): computed from the Thing store and the log on every
// ask, never stored (R8), and sent whole as `home.today` (contract/home/today.ts). Home and the spine's count
// both read the same message: after any change it goes to every window (pushToday), the receipt only to the asker.
//   who is on it   every Thing that waits on you and is not done (and not gone). A Thing for you on a later day (read
//                  "you", state "you", waitsOn "none", with a due) joins it once the start of its day has come
//   the order      four segments, never reordered among themselves: due before the start of tomorrow (or overdue);
//                  blocking a running job; the others; the ones pressed "later", in the order pressed. Inside each of
//                  the first three, the sorter's order: the default is the face's own comparator (deadline, then
//                  blocks, then age). A sorter that answers other ids than it was given is passed over for the default
//                  and one plugin.trouble is written
//   moving         the Things whose state is "moving"
//   line           the face's lineOf: "Three things need you. Two are moving on their own."
//   week           the marks the Things make (the face's weekOf, its `live` half); the calendar's own marks have no
//                  source in the engine and are not sent
//   things         every Thing not gone, in the order made; a done one only on the day it was done (so a receipt
//                  can still name it)
// today.shown is written when a window asks for the list (home.today) and the order it is sent differs from the last
// one written; the list pushed after a change writes nothing more (an undo is exactly one event).
import type { Face } from "../browser.js";
import { hashOf } from "../canonical.js";
import { AnswerAsk, LaterAsk, type Mark, type TodayMsg } from "../contract/home/today.js";
import { answerHook } from "./hooks.js";
import { changeThing, toFace, type Thing } from "./items.js";
import { YOU, type HomeEv } from "./log.js";
import type { Ctx, Handler } from "./unit.js";
import { placesMsg } from "./places.js";
import { EVERYWHERE, noteFixIn } from "../next/you-known.js";

const startOfDay = (ms: number, plus = 0): number => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus).getTime(); };
/** a Thing for you on a later day has joined the list once its day has come (pure) */
export const joined = (t: Thing, now: number): boolean => t.read === "you" && t.state === "you" && t.waitsOn === "none" && t.due !== undefined && startOfDay(t.due) <= now;
/** a Thing as the list sees it now (pure): one that has joined waits on you */
export const seen = (t: Thing, now: number): Thing => (joined(t, now) ? { ...t, waitsOn: "you" } : t);
/** whether it is on the list (pure) */
export const waits = (t: Thing): boolean => t.waitsOn === "you" && t.state !== "done" && !t.gone;

/** the face's own order, the default sorter's comparator (MR today.ts l.66) */
export const dumb = (a: Thing, b: Thing): number => (a.due ?? Infinity) - (b.due ?? Infinity) || Number(!!b.blocks) - Number(!!a.blocks) || a.at - b.at;
const DEFAULT = "default";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);
/** the one line, in two sentences (MR today.ts l.75-79) */
export function lineOf(needs: number, moving: number): [string, string] {
  const first = needs === 0 ? "Nothing needs you." : needs === 1 ? "One thing needs you." : `${word(needs)} things need you.`;
  const second = moving === 0 ? "" : moving === 1 ? "One is moving on its own." : `${word(moving)} are moving on their own.`;
  return [first, second];
}

/** the Things pressed "later" and not undone, the oldest press first; a press again moves it to the end (pure) */
export function laterOf(evs: HomeEv[]): string[] {
  const undone = new Set(evs.filter((e) => e.cause && (e.value as { undo?: unknown } | undefined)?.undo === true).map((e) => e.cause!));
  let out: string[] = [];
  for (const e of evs) {
    if (e.kind !== "today.later" || !e.item || (e.value as { undo?: unknown } | undefined)?.undo === true || undone.has(e.id)) continue;
    out = [...out.filter((id) => id !== e.item), e.item];
  }
  return out;
}

/** the week's marks the Things make (pure; MR today.ts weekOf, its `live` part), by time */
export function weekOf(things: Thing[]): Mark[] {
  const marks = things.flatMap((t): Mark[] => {
    if (t.due === undefined) return [];
    if (t.read === "you" && t.state === "you" && t.waitsOn === "none") return [{ id: `w-${t.id}`, kind: "you", at: t.due, label: t.words, thingId: t.id, yours: true }];
    if (t.read === "date" && t.state === "read") return [{ id: `w-${t.id}`, kind: "event", at: t.due, end: t.due + 36e5, label: t.words, thingId: t.id }];
    if (t.state === "moving") return [{ id: `w-${t.id}`, kind: "thread", from: t.at, at: t.due, label: t.words, thingId: t.id }];
    if (t.waitsOn === "you") return [{ id: `w-${t.id}`, kind: "due", at: t.due, label: t.words, thingId: t.id, yours: true }];
    return [];
  });
  return marks.sort((a, b) => a.at - b.at);
}

/** the sorter troubles already written, by context and sorter: one a sorter, not one an ask */
const troubled = new WeakMap<Ctx, Set<string>>();
/** one segment in the sorter's order (it is given the segment in the default order), checked: the same ids, none
 *  twice; else the default and one plugin.trouble */
function sortSegment(ctx: Ctx, seg: Thing[]): string[] {
  const sorted = [...seg].sort(dumb), plain = sorted.map((t) => t.id);
  const s = ctx.sorter;
  if (!s || !seg.length) return plain;
  let got: unknown;
  try { got = s.sort(sorted.map((t) => ({ ...t }))); } catch (err) { got = err instanceof Error ? err : null; }
  const ids = new Set(seg.map((t) => t.id));
  if (Array.isArray(got) && got.length === seg.length && new Set(got).size === got.length && got.every((id) => ids.has(id))) return got as string[];
  const said = troubled.get(ctx) ?? new Set<string>();
  troubled.set(ctx, said);
  if (!said.has(s.name)) {
    said.add(s.name);
    const why = got instanceof Error ? `it threw: ${got.message}` : `it answered ${Array.isArray(got) ? got.length : 0} ids for a segment of ${seg.length}, or others than it was given: the default order stands`;
    ctx.log.write({ kind: "plugin.trouble", item: s.name, value: { where: "home.sorter", why } });
  }
  return plain;
}

export type Shown = { msg: TodayMsg; order: string[]; dumb: string[]; sorter: string };
/** Today now (R8: the same store and log give the same message, to the byte) */
export function todayOf(ctx: Ctx): Shown {
  const now = ctx.now(), evs = ctx.log.all(), tomorrow = startOfDay(now, 1), today0 = startOfDay(now);
  const doneAt = new Map<string, number>(), made = new Map<string, number>();
  for (const e of evs) {
    if (e.kind === "thing.done" && e.item) doneAt.set(e.item, e.at);
    if (e.kind === "thing.new" && e.item && !made.has(e.item)) made.set(e.item, e.seq);
  }
  // the Things in the order they were made (as the face keeps its own list), then any the log does not name, by age
  const things = ctx.items.all().sort((a, b) => (made.get(a.id) ?? Infinity) - (made.get(b.id) ?? Infinity)).filter((t) => !t.gone && (t.state !== "done" || (doneAt.get(t.id) ?? -Infinity) >= today0)).map((t) => seen(t, now));
  const on = things.filter(waits), later = laterOf(evs).filter((id) => on.some((t) => t.id === id)), back = new Set(later);
  const front = on.filter((t) => !back.has(t.id));
  const first = front.filter((t) => t.due !== undefined && t.due < tomorrow);
  const second = front.filter((t) => !first.includes(t) && t.blocks === true);
  const third = front.filter((t) => !first.includes(t) && !second.includes(t));
  const segs = [first, second, third];
  const order = [...segs.flatMap((s) => sortSegment(ctx, s)), ...later];
  const plain = [...segs.flatMap((s) => [...s].sort(dumb).map((t) => t.id)), ...later];
  const moving = things.filter((t) => t.state === "moving").map((t) => t.id);
  const msg: TodayMsg = {
    type: "home.today",
    today: { needs: order, moving, week: weekOf(things), line: lineOf(order.length, moving.length).filter(Boolean).join(" ") },
    things: things.map(toFace),
  };
  return { msg, order, dumb: plain, sorter: ctx.sorter?.name ?? DEFAULT };
}
/** the list as one message */
export const todayMsg = (ctx: Ctx): TodayMsg => todayOf(ctx).msg;
/** the plain state to one window: what a no-op, a refused ask or an unknown id is answered with (R4, R5, R9) */
export const sendToday = (ctx: Ctx, face: Face): void => face.send(todayMsg(ctx));
/** the last today.shown on the log, or null */
const lastShown = (ctx: Ctx): HomeEv | null => { const evs = ctx.log.all(); for (let i = evs.length - 1; i >= 0; i--) if (evs[i].kind === "today.shown") return evs[i]; return null; };

/** home.today: the list to the window that asked; today.shown when the order differs from the last one written */
const ask: Handler = (ctx, face) => {
  const s = todayOf(ctx), order = hashOf(s.order);
  if ((lastShown(ctx)?.value as { order?: unknown } | undefined)?.order !== order)
    ctx.log.write({ kind: "today.shown", value: { order, dumb: hashOf(s.dumb), sorter: s.sorter, n: s.order.length } });
  face.send(s.msg);
};

/** the Thing an answer or a later is about, as the list sees it, when it is on the list; else null (the plain state) */
function onList(ctx: Ctx, id: string): Thing | null {
  const t = ctx.items.get(id);
  return t && !t.gone && waits(seen(t, ctx.now())) ? t : null;
}

/** a Thing's folder as a fix's place: the folder on the disk its crumb names (w:<path>), else the crumb as Home says it;
 *  in no folder, everywhere */
export function placeOfThing(ctx: Ctx, t: Thing): string {
  if (!t.folder) return EVERYWHERE;
  let ref: string | undefined;
  try { ref = placesMsg(ctx).places.find((p) => p.path === t.folder && p.from.source === "files")?.from.ref; } catch { ref = undefined; }
  return ref && ref.startsWith("/") ? `w:${ref}` : t.folder;
}
/** one store (#1615): the person's Later, answer or Undo on a need is one fix line in what Sol knows, at the Thing's
 *  folder, because of the Thing (thing:<id>) */
export const noteNeed = (ctx: Ctx, t: Thing, how: "later" | "answer" | "undo", now?: string): void =>
  void noteFixIn(ctx.home, { how, what: `“${t.words}”`, place: placeOfThing(ctx, t), reason: `thing:${t.id}`, ...(now ? { now } : {}) }, ctx.now());

/** home.answer {thingId, answer}: today.answer first (the receipt's ledgerId), then the Thing's change. A link with a
 *  hook (hooks.ts) goes to it first; else the face's own rule (MR today.ts l.192-193): a question from a job, or the
 *  warm answer on what is not "for you", sets it moving (a job goes on it); anything else is done */
const answer: Handler = async (ctx, face, msg) => {
  const m = AnswerAsk.safeParse(msg);
  if (!m.success) return sendToday(ctx, face);
  const t = onList(ctx, m.data.thingId);
  if (!t) return sendToday(ctx, face);
  const said = m.data.answer, which = t.card?.answers[0] === said ? 0 : t.card?.answers[1] === said ? 1 : -1;
  const shown = lastShown(ctx);
  const act = ctx.log.write({ kind: "today.answer", item: t.id, value: { which }, ...(which === -1 ? { words: said } : {}), ...(shown ? { cause: shown.id } : {}), by: YOU });
  noteNeed(ctx, t, "answer", said);
  const hook = answerHook(t);
  if (!hook || !(await hook(ctx, t, said, { opened: m.data.opened === true }))) {
    const goes = t.state === "asks" || (which === 0 && t.read !== "you");
    changeThing(ctx, t.id, goes ? { state: "moving", waitsOn: "agent" } : { state: "done", waitsOn: "none" }, { cause: act.id, by: YOU });
  }
  face.send({ type: "home.done", ledgerId: act.id, thingId: t.id, did: "answer", answer: said });
  ctx.pushToday();
};

/** home.later {thingId}: today.later, the Thing itself unchanged; it goes to the back of the list */
const later: Handler = (ctx, face, msg) => {
  const m = LaterAsk.safeParse(msg);
  if (!m.success) return sendToday(ctx, face);
  const t = onList(ctx, m.data.thingId);
  if (!t) return sendToday(ctx, face);
  const act = ctx.log.write({ kind: "today.later", item: t.id, by: YOU });
  noteNeed(ctx, t, "later");
  face.send({ type: "home.done", ledgerId: act.id, thingId: t.id, did: "later" });
  ctx.pushToday();
};

export const TODAY_HANDLERS: Record<string, Handler> = { "home.today": ask, "home.answer": answer, "home.later": later };
