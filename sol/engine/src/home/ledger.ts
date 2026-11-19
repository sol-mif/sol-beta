// Home 6 (#829; face #797): the ledger, record-only, the evening fold, behind home.whole. A projection, no store: one
// message, `home.ledger { day, entries, done }` (contract/home/ledger.ts), computed from the log and the Thing store on
// every ask, never stored (R8); the same log gives the same message, byte for byte.
//   entries   today's (local day, never later than now) events, in the order of their time:
//               rung.would  what Sol would have done a rung up and did not (Home 5; a replay's left out): `wouldHave` is the
//                           act's name from its value file, `rung` the rung it needed, no undo ("nothing was done")
//               rung.did    a checked act Sol did above read (a read is no act off the day): no undo from here
//               thing.done  a Thing made done, by you or by Sol (`by`); Sol's has a real undo for 24 h
//             An entry's id is its event's id, so a receipt's ledgerId and an entry id are one namespace (face-wire §8.3)
//   state     "let"     a source.set (not undone) has the would-have as its cause and took its source to the rung the
//                       would-have needed (a raise one rung short leaves it open: let it again)
//             "not"     a policy.learned { what: "not" } (not undone) has it as its cause
//             "undone"  a reverse event of the done (cause the done, or the same act on the same Thing) is not undone
// The asks, each answered with one home.ledger to the asker, its receipt in `done` (the face keeps the last it gets):
//   home.ledger            the state, done null. Nothing written
//   home.ledger.let {id}   an open would-have: its source raised one rung (the lock: one rung at a time, design l.538),
//                          through Home 4's setRung, with `cause` the would-have: source.set (the ledgerId), policy.write
//                          (its sentence rewritten), rung.ceiling. home.sources to every window. A would-have two rungs
//                          up stays open after the first press, and its receipt says so. Nothing re-runs here: the next
//                          same act goes
//   home.ledger.not {id}   an open would-have: policy.learned { what: "not" } (the ledgerId, cause the would-have; its
//                          words, what it would have done, in a value file). Nothing raised
//   home.undo {ledgerId}   (routed here by kind, undo.ts) a let or a not by its receipt: Home 4 reverses it and answers
//                          home.sources; the ledger follows to every window (below). One of Sol's done Things by its
//                          entry id while its undo is real: the Thing put back (one reverse event, cause the entry),
//                          answered with a new receipt whose ledgerId is that reverse event, itself undoable (the
//                          Thing done again, one more reverse event); an entry with no undo: done null. The 24 h are
//                          the entry's `until`, not the day: a done of 23:50 can be undone at 00:05
// After a change of what it shows, wherever it came from (a Today answer, Home 5's limit, Sources' undo), the ledger
// goes to every window once, after the asker's own answers; the ledger's own asks send it to every window, then the
// asker its receipt.
import type { Face } from "../browser.js";
import { LedgerLetAsk, LedgerNotAsk, type Entry, type LedgerDone, type LedgerMsg } from "../contract/home/ledger.js";
import { RUNGS, SOURCE_IDS, type Rung, type SourceId } from "../contract/home/policy.js";
import { putThing, verOf, type Thing } from "./items.js";
import { YOU, type HomeEv } from "./log.js";
import { above, rungAt } from "./rung-reader.js";
import { pushSources, rungOf, setRung, sourcesMsg } from "./sources.js";
import { isUndone } from "./undo.js";
import type { Ctx, Handler, Reverser, Unit } from "./unit.js";

// ── the words: Marco's where his face says them (sol/mac/src/home/whole/ledger.ts on marco/mine-run), the rest the
//    engine's pick, in one place so one edit renames them ────────────────────────────────────────────────────────────
/** how long Sol's act can be undone from here (his l.91) */
export const REAL_MS = 24 * 36e5;
const WOULD_WHY = "nothing was done";                                                                    // his l.100-101
const YOURS_WHY = "an answer; change it from the job";                                                   // his l.96
const letLine = (name: string, rung: Rung, would: string): string => `let it: ${name} at ${rung} now · next time Sol has ${would}`;   // his l.139
const notLine = (would: string): string => `not this: Sol will not offer to have ${would}`;            // his l.133
const undoneLine = (did: string): string => `undone: ${did}`;                                           // his l.125
// the engine's pick
const VERB: Record<Rung, string> = { read: "read it", propose: "suggest it", draft: "draft it", act: "do it" };
/** the line under a would-have: the face shows `<rung> <sub>` ("propose would suggest it") */
const wouldSub = (rung: Rung): string => `would ${VERB[rung]}`;
const DID_WHY = (name: string): string => `done through ${name}; take it back there`;
const STEP = (name: string): string => `a step through ${name}`;
const ERASED = "something whose words were erased";
/** a raise one rung short of what the would-have needed */
const shortLine = (name: string, rung: Rung, needs: Rung): string => `let it: ${name} at ${rung} now · one rung at a time; let it again for ${needs}`;
/** the learned id a "not this" is kept under: one an act */
const notId = (act: string): string => `not-${act.slice(0, 16)}`;

// ── reading the log ──────────────────────────────────────────────────────────────────────────────────────────────
const val = (e: HomeEv): Record<string, unknown> => (e.value && typeof e.value === "object" ? (e.value as Record<string, unknown>) : {});
const isUndo = (e: HomeEv): boolean => val(e).undo === true;
const isRung = (x: unknown): x is Rung => (RUNGS as readonly unknown[]).includes(x);
const isSourceId = (x: unknown): x is SourceId => (SOURCE_IDS as readonly unknown[]).includes(x);
const startOfDay = (ms: number): number => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** the local date as the face has it: "YYYY-M-D", no zero padding (his l.112) */
export const dayOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const toolOf = (w: unknown): string | null => {
  const t = w && typeof w === "object" ? (w as { tool?: unknown }).tool : undefined;
  return typeof t === "string" && t.trim() ? t : null;
};

/** today's entries, oldest first (R8: the same log and store give the same list). `since` (the undo's 24 h) reaches
 *  further back than the day's start */
export function entriesOf(ctx: Ctx, since?: number): Entry[] {
  const now = ctx.now(), day0 = since ?? startOfDay(now), evs = ctx.log.all();
  // the acts that have a reverse event naming them, and the ones that have a live one
  const undone = new Set<string>();
  for (const e of evs) if (e.cause && isUndo(e)) undone.add(e.cause);
  const live = (e: HomeEv): boolean => !isUndo(e) && !undone.has(e.id);
  const names = new Map<string, string>();
  const nameOf = (id: SourceId): string => {
    if (!names.size) for (const s of sourcesMsg(ctx, null).sources) names.set(s.id, s.name);
    return names.get(id) ?? id;
  };
  const out: Entry[] = [];
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.at < day0 || e.at > now || e.mode === "replay" || isUndo(e)) continue;
    const v = val(e), source = isSourceId(v.source) ? v.source : undefined;
    const base = { id: e.id, at: e.at, ...(e.item ? { thingId: e.item } : {}), ...(source ? { source } : {}) };
    if (e.kind === "rung.would" && isRung(v.rung)) {
      const would = toolOf(ctx.log.words(e)) ?? ERASED;
      const reached = (x: HomeEv): boolean => isRung(val(x).to) && rungAt(val(x).to as Rung) >= rungAt(v.rung as Rung);
      const state = evs.some((x) => x.kind === "source.set" && x.cause === e.id && live(x) && reached(x)) ? "let"
        : evs.some((x) => x.kind === "policy.learned" && x.cause === e.id && val(x).what === "not" && live(x)) ? "not" : undefined;
      out.push({ ...base, actor: "sol", wouldHave: would, rung: v.rung, sub: wouldSub(v.rung), undo: { none: true, why: WOULD_WHY }, ...(state ? { state } : {}) });
    } else if (e.kind === "rung.did" && isRung(v.rung) && v.rung !== "read") {
      const t = e.item ? ctx.items.get(e.item) : null;
      const name = source ? nameOf(source) : "Sol";
      const did = actName(ctx, evs, i) ?? t?.words ?? STEP(name);
      out.push({ ...base, actor: e.by.person === "you" ? "you" : "sol", did, rung: v.rung, sub: t && t.words !== did ? t.words : t?.folder ?? "", undo: { none: true, why: DID_WHY(name) } });
    } else if (e.kind === "thing.done" && e.item) {
      const t = (typeof v.ver === "string" ? ctx.items.version(e.item, v.ver) : null) ?? ctx.items.get(e.item);
      const f = t?.frozen as { rung?: unknown; scope?: { source?: unknown } } | undefined;
      const src = isSourceId(f?.scope?.source) ? f!.scope!.source as SourceId : isSourceId(t?.card?.source) ? t!.card!.source as SourceId : undefined;
      const sol = e.by.person !== "you";
      // undone: a reverse event of this done, or of the act it followed from on the same Thing, that is not undone
      const back = evs.some((x) => isUndo(x) && x.item === e.item && x.seq > e.seq && (x.kind === "thing.state" || x.kind === "thing.done")
        && (x.cause === e.id || (!!e.cause && x.cause === e.cause)) && !undone.has(x.id));
      out.push({
        id: e.id, at: e.at, actor: sol ? "sol" : "you", thingId: e.item, ...(src ? { source: src } : {}), did: t?.words ?? e.item,
        rung: isRung(f?.rung) ? f!.rung as Rung : "read", sub: t?.folder ?? "",
        undo: sol ? { kind: "real", until: e.at + REAL_MS } : { none: true, why: YOURS_WHY }, ...(back ? { state: "undone" as const } : {}),
      });
    }
  }
  // by time; the log's order where two are at the same ms (a stable sort)
  return out.sort((a, b) => a.at - b.at);
}
/** the name of a done act: from the ask it waited on, else from a would-have of the same act before it */
function actName(ctx: Ctx, evs: HomeEv[], i: number): string | null {
  const e = evs[i], act = val(e).act;
  const asked = e.cause ? evs.find((x) => x.id === e.cause && x.kind === "rung.asked") : undefined;
  if (asked) { const n = toolOf(ctx.log.words(asked)); if (n) return n; }
  for (let j = i - 1; j >= 0; j--) if (evs[j].kind === "rung.would" && val(evs[j]).act === act) return toolOf(ctx.log.words(evs[j]));
  return null;
}

/** the whole ledger now */
export const ledgerMsg = (ctx: Ctx, done: LedgerDone | null): LedgerMsg => ({ type: "home.ledger", day: dayOf(ctx.now()), entries: entriesOf(ctx), done });

// ── answering ────────────────────────────────────────────────────────────────────────────────────────────────────
/** the last ledger every window was sent, so a change it did not see goes out once and a non-change never does */
const LAST = new WeakMap<Ctx, string>();
const waiting = new WeakSet<Ctx>();
/** the ledger to every window */
export function pushLedger(ctx: Ctx): void {
  waiting.delete(ctx);
  const m = ledgerMsg(ctx, null);
  LAST.set(ctx, JSON.stringify(m));
  ctx.all(m);
}
/** after what the asker is answered (a microtask later): the ledger to every window, if what it shows changed */
function soon(ctx: Ctx): void {
  if (waiting.has(ctx)) return;
  waiting.add(ctx);
  queueMicrotask(() => {
    if (!waiting.has(ctx)) return;
    waiting.delete(ctx);
    const m = ledgerMsg(ctx, null), s = JSON.stringify(m);
    if (LAST.get(ctx) === s) return;
    LAST.set(ctx, s);
    ctx.all(m);
  });
}
/** the kinds an entry is made from or changed by */
const KINDS = new Set(["rung.would", "rung.did", "thing.done", "source.set", "policy.learned", "thing.state"]);

const plain = (ctx: Ctx, face: Face): void => face.send(ledgerMsg(ctx, null));
/** a change answered: every window's ledger, then the asker's own with its receipt */
function answered(ctx: Ctx, face: Face, done: LedgerDone): void {
  pushLedger(ctx);
  face.send(ledgerMsg(ctx, done));
}
/** an open would-have of today, by its id, and its event */
function openWould(ctx: Ctx, id: string): { e: HomeEv; entry: Entry & { wouldHave: string } } | null {
  const entry = entriesOf(ctx).find((x) => x.id === id);
  if (!entry || entry.wouldHave === undefined || entry.state) return null;
  const e = ctx.log.all().find((x) => x.id === id);
  return e ? { e, entry: entry as Entry & { wouldHave: string } } : null;
}

const ask: Handler = (ctx, face) => plain(ctx, face);

/** let it: the source one rung up, toward the rung the would-have needed (one rung at a time, design l.538: a
 *  would-have two rungs up takes two presses, and is let at the second). Only ever up: a would-have whose source is
 *  already there (it was held by a folder or a Run's frozen rung, or raised since) raises nothing and writes nothing */
const letIt: Handler = (ctx, face, msg) => {
  const m = LedgerLetAsk.safeParse(msg);
  const w = m.success ? openWould(ctx, m.data.id) : null;
  const source = w?.entry.source;
  const from = source ? rungOf(ctx, source) : null, to = from ? above(from) : null;
  if (!w || !source || !to || rungAt(w.entry.rung) <= rungAt(from!)) return plain(ctx, face);
  const act = setRung(ctx, source, to, w.e.id, YOU);
  if (!act) return plain(ctx, face);
  const name = sourcesMsg(ctx, null).sources.find((s) => s.id === source)?.name ?? source;
  pushSources(ctx);
  const line = to === w.entry.rung ? letLine(name, to, w.entry.wouldHave) : shortLine(name, to, w.entry.rung);
  answered(ctx, face, { ledgerId: act.id, entryId: w.entry.id, line });
};

/** not this: learned, nothing raised */
const notThis: Handler = (ctx, face, msg) => {
  const m = LedgerNotAsk.safeParse(msg);
  const w = m.success ? openWould(ctx, m.data.id) : null;
  if (!w) return plain(ctx, face);
  const act = ctx.log.write({ kind: "policy.learned", item: notId(String(val(w.e).act ?? w.e.id)), value: { what: "not" }, words: w.entry.wouldHave, cause: w.e.id, by: YOU });
  answered(ctx, face, { ledgerId: act.id, entryId: w.entry.id, line: notLine(w.entry.wouldHave) });
};

/** home.undo of a done Thing's entry: Sol's, today, its undo real and not used, and the Thing still as the done left it.
 *  Anything else: done null, nothing written */
const undoDone: Reverser = (ctx, face, ev) => {
  const entry = entriesOf(ctx, ctx.now() - REAL_MS).find((x) => x.id === ev.id);
  if (!entry || !("kind" in entry.undo) || entry.undo.until <= ctx.now() || entry.state === "undone") return plain(ctx, face);
  const v = val(ev), cur = ev.item ? ctx.items.get(ev.item) : null;
  const was: Thing | null = cur && typeof v.from === "string" ? ctx.items.version(cur.id, v.from) : null;
  if (!cur || !was || verOf(cur) !== v.ver) return plain(ctx, face);
  const back = putThing(ctx, was, { cause: ev.id, undo: true, by: YOU });
  if (!back) return plain(ctx, face);
  ctx.pushToday();
  answered(ctx, face, { ledgerId: back.id, entryId: entry.id, line: undoneLine(entry.did ?? "") });
};
/** home.undo of that receipt: the Thing done again, as it was (one reverse event, cause the receipt), done null. Once */
const redoDone: Reverser = (ctx, face, u) => {
  const v = val(u), cur = u.item ? ctx.items.get(u.item) : null;
  const again: Thing | null = cur && typeof v.from === "string" ? ctx.items.version(cur.id, v.from) : null;
  if (isUndone(ctx, u.id) || !cur || !again || verOf(cur) !== v.ver) return plain(ctx, face);
  if (!putThing(ctx, again, { cause: u.id, undo: true, by: YOU })) return plain(ctx, face);
  ctx.pushToday();
  pushLedger(ctx);
  face.send(ledgerMsg(ctx, null));
};
/** home.undo of an entry with no undo here (a would-have, an act done through a source): the state, done null */
const noUndo: Reverser = (ctx, face) => plain(ctx, face);

export const ledger: Unit = {
  name: "ledger",
  handlers: { "home.ledger": ask, "home.ledger.let": letIt, "home.ledger.not": notThis },
  start(ctx) {
    LAST.set(ctx, JSON.stringify(ledgerMsg(ctx, null)));
    ctx.log.on((e) => { if (KINDS.has(e.kind)) soon(ctx); });
  },
  // "undo thing.done": the undo of an undo whose act was a thing.done (undo.ts), the one undo the face can undo again
  reverse: { "thing.done": undoDone, "undo thing.done": redoDone, "rung.would": noUndo, "rung.did": noUndo },
};
