// Home 3 (#827): the five reads for a sentence (face #792; specs home-plan §6 Home 3, face-wire.md §3.2). A sentence is
// split into parts, each read by the judge (judge.ts) over the five and filed to a folder by the filer (filer.ts); on
// Enter each part becomes a Thing where it lands, with one receipt and one undo for all of them. The rule judge and the
// rule filer are the only ones: nothing leaves the machine.
//   home.say {text}       home.read {text, ms, parts} to the asker, read against the week Today sends and the folders
//                         of the Things. Nothing is written: the face would ask on every key
//   home.file {parts}     thing.file first (its id is the receipt's ledgerId; the parts as sent are its words, in a value
//                         file), then thing.new for each part that makes a Thing (a date the week already holds makes
//                         none), then one judge.read for each part, what the judge reads of it now, all with `cause` the
//                         thing.file. home.done {did: "file", thingIds, line} to the asker, home.today to every window
//   home.learn {learned}  an override: judge.override (the part's words in a value file), then policy.learned
//                         {what: "seen"} under the learned line's id (contract/home/reads.ts), `cause` the override.
//                         home.today, unchanged, to the asker; no receipt (the face sends it before the home.file)
//   undo of a filing      thing.file {undo: true} with `cause` the filing, then every Thing it made gone, each a
//                         thing.state {gone: true, undo: true}. Refused, nothing written, when one of them changed since
//   a stop half-way       (the engine killed, a write that threw) is finished, never left: the ids of a filing's Things
//                         come from its thing.file's id and its parts' places, so at the next start (`start`) a filing
//                         whose thing.file is on the log makes the Things and judge.reads it has not yet, from the parts
//                         in its value file and at the time on its line; an undo whose thing.file {undo} is on the log
//                         puts gone the Things not yet gone, there and at the next press of undo. A filing whose words
//                         were erased is not made again
// A Thing for you on a later day is stored as the face makes it (waitsOn "none"); Today counts it as waiting on you once
// its day has come (today.ts `joined`).
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Mark } from "../contract/home/today.js";
import { FileAsk, Filed, LearnAsk, learnedId, learnedText, SayAsk, type Part, type ReadMsg } from "../contract/home/reads.js";
import { ruleFiler, type Filer } from "./filer.js";
import { labelOf, bare, ruleJudge, verdictOf, type Judge } from "./judge.js";
import { newThing, putThing, verOf, type Thing } from "./items.js";
import { ENGINE, YOU, type HomeEv } from "./log.js";
import { sendToday, todayMsg } from "./today.js";
import { isUndone } from "./undo.js";
import type { Ctx, Handler, Reverser, Unit } from "./unit.js";

/** the judge and the filer the engine uses: the rule ones, the factory default (design §7.6, §7.9) */
const JUDGE: Judge = ruleJudge;
const FILER: Filer = ruleFiler;

/** a sentence read (MR reads.ts readOf): the judge's parts, each with the filer's folder; ms as measured */
export function readSentence(sentence: string, week: Mark[], now: number, folders: string[] = [], judge: Judge = JUDGE, filer: Filer = FILER): ReadMsg {
  const t0 = performance.now();
  const parts: Part[] = judge.read(sentence, week, now).map(({ text, read, p, ...when }) => ({ text, read, p, folder: filer.file(text, folders).folder, ...when }));
  return { type: "home.read", text: sentence, ms: Math.round(performance.now() - t0), parts };
}

// ── words (MR reads.ts l.135-169) ──
const startOf = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const hm = (ms: number) => { const d = new Date(ms); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** a day as the person says it: "today", "tomorrow", "Thursday" */
export function dayWord(at: number, now: number): string {
  const n = Math.round((startOf(at) - startOf(now)) / 864e5);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : new Date(at).toLocaleDateString("en-GB", { weekday: "long" });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (at: number, now: number) => `${cap(dayWord(at, now))} ${hm(at)}`;
/** the receipt once filed, one clause a part ("jobs · for you, Thursday 13:00, after your bio exam · it joins this list
 *  Thursday morning, prepared") */
export function receiptLine(parts: Filed[], now: number): string {
  return parts.map((f) => {
    const after = f.after ? `, after your ${f.after}` : "";
    if (f.read === "you") return f.at !== undefined
      ? `${f.folder} · for you, ${when(f.at, now)}${after} · it joins this list ${dayWord(f.at, now) === "today" ? "now" : `${cap(dayWord(f.at, now))} morning`}, prepared`
      : `${f.folder} · for you · on this list now`;
    if (f.read === "date") return f.found ? `${labelOf(f.text)} · already on your calendar, nothing added` : `${labelOf(f.text)} · on your calendar${f.at !== undefined ? `, ${when(f.at, now)}` : ""}`;
    if (f.read === "job") return `${f.folder} · a job, started${f.at !== undefined ? ` · ready ${when(f.at, now)}` : ""}`;
    if (f.read === "make") return `${f.folder} · a thing to make, ready on Build's stage`;
    return `${f.folder} · a note, kept`;
  }).join("; ");
}

/** the Thing a filed part becomes (MR reads.ts l.172-183), or null for a date the week already holds. A field the face
 *  leaves undefined is left out */
export function thingOf(f: Filed, id: string, now: number): Thing | null {
  const base = { id, folder: f.folder, words: f.read === "you" || f.read === "date" ? labelOf(f.text) : bare(f.text), at: now, links: [], made: [] };
  const due = f.at !== undefined ? { due: f.at } : {};
  if (f.read === "date") return f.found ? null : { ...base, read: "date", state: "read", waitsOn: "none", ...due };
  if (f.read === "you") {
    const today = f.at === undefined || startOf(f.at) <= startOf(now);
    return { ...base, read: "you", state: "you", waitsOn: today ? "you" : "none", ...due,
      card: { source: "sol", title: cap(bare(f.text)) + ".", why: `Only you do it${f.after ? `, after your ${f.after}` : ""}; Sol has it prepared.`, chips: [], answers: ["done", "move it"], touches: [], edge: labelOf(f.text) } };
  }
  if (f.read === "job") return { ...base, read: "job", state: "moving", waitsOn: "agent", due: f.at ?? now + 6 * 36e5 };
  if (f.read === "make") return { ...base, read: "make", state: "read", waitsOn: "none" };
  return { ...base, read: "note", state: "read", waitsOn: "none" };
}

/** the folders the person has: those of the Things, in the order made (as the face gives the judge) */
const foldersOf = (things: { folder: string }[]): string[] => [...new Set(things.map((t) => t.folder))];

/** home.say {text}: the read, to the asker; nothing written. One that does not parse: an empty read */
const say: Handler = (ctx, face, msg) => {
  const m = SayAsk.safeParse(msg);
  if (!m.success) return face.send({ type: "home.read", text: "", ms: 0, parts: [] });
  const t = todayMsg(ctx);
  face.send(readSentence(m.data.text, t.today.week, ctx.now(), foldersOf(t.things)));
};

/** the id of the Thing a filing's part makes: from the filing's id and the part's place, so a filing a stop cut short
 *  is finished with the same ids */
export const thingIdOf = (act: string, i: number): string => `it-${createHash("sha256").update(`${act}:${i}`).digest("hex").slice(0, 12)}`;
const makes = (f: Filed): boolean => !(f.read === "date" && f.found);
const isUndo = (e: HomeEv): boolean => (e.value as { undo?: unknown } | undefined)?.undo === true;

/** a filing's Things and judge.reads, those not on the log yet (`have`: the Things made and the reads written before a
 *  stop; none at the filing): the ids of the Things it made, in the parts' order */
function fill(ctx: Ctx, act: HomeEv, parts: Filed[], now: number, week: Mark[], have = { things: new Set<string>(), reads: 0 }): string[] {
  const ids: string[] = [];
  parts.forEach((f, i) => {
    const t = thingOf(f, thingIdOf(act.id, i), now);
    if (t && (have.things.has(t.id) || newThing(ctx, t, { cause: act.id, by: YOU }))) ids.push(t.id);
  });
  let k = 0;
  parts.forEach((f, i) => {
    const t0 = performance.now(), r = JUDGE.read(f.text, week, now)[0], ms = Math.round(performance.now() - t0);
    if (!r || k++ < have.reads) return;
    const id = thingIdOf(act.id, i), item = makes(f) && ids.includes(id) ? { item: id } : {};
    ctx.log.write({ kind: "judge.read", ...item, value: { question: "read", verdict: verdictOf(r.p[r.read]), read: r.read, p: r.p, judge: JUDGE.name, ms }, cause: act.id, by: ENGINE });
  });
  return ids;
}

/** home.file {parts}: thing.file, a Thing for each part that makes one, a judge.read for each part; the receipt */
const file: Handler = (ctx, face, msg) => {
  const m = FileAsk.safeParse(msg);
  if (!m.success) return sendToday(ctx, face);
  const parts = m.data.parts, now = ctx.now(), week = todayMsg(ctx).today.week;
  const act = ctx.log.write({ kind: "thing.file", value: { n: parts.length, made: parts.filter(makes).length }, words: parts, by: YOU });
  const ids = fill(ctx, act, parts, now, week);
  face.send({ type: "home.done", ledgerId: act.id, thingId: ids[0] ?? "", thingIds: ids, did: "file", line: `↳ ${receiptLine(parts, now)}` });
  ctx.pushToday();
};

/** home.learn {learned}: the override and its learned line; Today unchanged, to the asker */
const learn: Handler = (ctx, face, msg) => {
  const m = LearnAsk.safeParse(msg);
  if (!m.success || m.data.learned.from === m.data.learned.to) return sendToday(ctx, face);
  const l = m.data.learned;
  const o = ctx.log.write({ kind: "judge.override", value: { question: "read", from: l.from, to: l.to }, words: l.text, by: YOU });
  ctx.log.write({ kind: "policy.learned", item: learnedId(l), value: { what: "seen" }, words: learnedText(l), cause: o.id, by: YOU });
  sendToday(ctx, face);
};

/** the Things a filing made (its thing.new), as they are now */
const madeBy = (ctx: Ctx, evs: HomeEv[], act: string) =>
  evs.filter((e) => e.kind === "thing.new" && e.cause === act && e.item).map((e) => ({ ver: (e.value as { ver?: string } | undefined)?.ver, cur: ctx.items.get(e.item!) }));
/** an undo whose reverse act is on the log, finished: each Thing the filing made that is not gone yet, gone. How many */
function finishUnfile(ctx: Ctx, evs: HomeEv[], act: string): number {
  let n = 0;
  for (const { cur } of madeBy(ctx, evs, act)) if (cur && !cur.gone && putThing(ctx, { ...cur, gone: true }, { cause: act, undo: true, by: YOU })) n++;
  return n;
}

/** the undo of a filing: every Thing it made, gone; refused while one of them is not as the filing made it. One whose
 *  reverse act is there already is finished, not done twice */
const unfile: Reverser = (ctx, face, ev: HomeEv) => {
  if (isUndone(ctx, ev.id)) return finishUnfile(ctx, ctx.log.all(), ev.id) ? ctx.pushToday() : sendToday(ctx, face);
  const things = madeBy(ctx, ctx.log.all(), ev.id);
  if (things.some(({ ver, cur }) => !cur || cur.gone || verOf(cur) !== ver)) return sendToday(ctx, face);
  const n = (ev.value as { n?: unknown } | undefined)?.n;
  ctx.log.write({ kind: "thing.file", value: { n: typeof n === "number" ? n : 0, made: things.length, undo: true }, cause: ev.id, by: YOU });
  for (const { cur } of things) putThing(ctx, { ...cur!, gone: true }, { cause: ev.id, undo: true, by: YOU });
  ctx.pushToday();
};

/** at start: every filing and every undo of one that a stop cut short, finished (after Home 1's reconcile). A filing
 *  whose Things and reads are all there is passed over without reading its parts again */
export function finishFilings(ctx: Ctx): void {
  const evs = ctx.log.all(), by = new Map<string, HomeEv[]>();
  for (const e of evs) if (e.cause) { const l = by.get(e.cause); if (l) l.push(e); else by.set(e.cause, [e]); }
  const week = () => todayMsg(ctx).today.week;
  for (const act of evs) {
    if (act.kind !== "thing.file" || isUndo(act)) continue;
    const after = by.get(act.id) ?? [];
    if (after.some(isUndo)) { finishUnfile(ctx, evs, act.id); continue; }
    const v = act.value as { n?: unknown; made?: unknown } | undefined;
    const things = new Set(after.filter((e) => e.kind === "thing.new" && e.item).map((e) => e.item!)), reads = after.filter((e) => e.kind === "judge.read").length;
    if (things.size >= Number(v?.made ?? 0) && reads >= Number(v?.n ?? 0)) continue;
    const parts = Filed.array().safeParse(ctx.log.words(act));
    if (!parts.success) continue;
    fill(ctx, act, parts.data, act.at, week(), { things, reads });
  }
}

export const reads: Unit = {
  name: "reads",
  handlers: { "home.say": say, "home.file": file, "home.learn": learn },
  start: finishFilings,
  reverse: { "thing.file": unfile },
};
