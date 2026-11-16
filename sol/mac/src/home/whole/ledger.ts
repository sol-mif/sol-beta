// The ledger, record-only, the evening fold (#797, plan Part C slice 34; home/whole.md "Record-only", "The thing's
// life", "The engine half": Ledger; scenes 4 and 11), behind sol.home.whole. Face half; the engine half is #829
// (Frank's). The pure half and its stub: signed entries of what was done (by you or by Sol, with its undo where undo is
// real, else why not) and of what Sol would have done a rung up (record-only); "let it, next time" raises that source
// one rung, "not this" teaches; the fold's one line, its day as a line of time, and what was missed. Nothing here draws;
// Record.tsx and Fold.tsx do.
//
// Stubbed until #829 lands: `stub()` answers whole.md's `home.ledger`, `home.ledger.let|not {id}` and `home.undo
// {ledgerId}` with a `home.ledger` message of the shape below. In the engine one ledger is the list's and Sources' too;
// in the face the stub raises a source through Sources' own stub (`raise`), so a "let it" moves the ladder and rewrites
// the policy sentence as #828 will.
import { RUNGS, rungAt, type Rung, type SourceId } from "./policy.ts";

/** an entry (whole.md: Ledger {at, actor, thingId, did|wouldHave, rung, undo}): signed by who did it; `did` what was
 *  done, or `wouldHave` what Sol would have done on `rung` (the rung above the source's) and did not; `undo` is real
 *  until a time, or none with why; `sub` the line under it; `state` what became of it */
export type Entry = {
  id: string; at: number; actor: "you" | "sol"; thingId?: string; source?: SourceId;
  did?: string; wouldHave?: string; rung: Rung; sub: string;
  undo: { kind: "real"; until: number } | { none: true; why: string };
  state?: "undone" | "let" | "not";
};
export type LedgerDone = { ledgerId: string; line: string; entryId: string };
/** the engine's message after every ask (#829): today's entries, and the receipt of what this ask did */
export type LedgerMsg = { type: "home.ledger"; day: string; entries: Entry[]; done: LedgerDone | null };
export type LedgerAsk =
  | { type: "home.ledger" }
  | { type: "home.ledger.let"; id: string }
  | { type: "home.ledger.not"; id: string }
  | { type: "home.undo"; ledgerId: string };

export const SOURCE_NAMES: Record<SourceId, string> = { calendar: "Calendar", mail: "Mail", files: "Files", github: "GitHub", canvas: "Canvas" };
/** the rung above, or none at act */
export const above = (r: Rung): Rung | null => RUNGS[rungAt(r) + 1] ?? null;
export const isWould = (e: Entry) => e.wouldHave !== undefined;
/** what is still waiting for "let it / not this" */
export const openWould = (es: Entry[]) => es.filter((e) => isWould(e) && !e.state);
/** the done entries of the day, by who */
export const doneBy = (es: Entry[]) => {
  const did = es.filter((e) => e.did !== undefined && e.state !== "undone");
  return { you: did.filter((e) => e.actor === "you"), sol: did.filter((e) => e.actor === "sol"), all: did };
};
const W = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const w = (n: number) => W[n] ?? String(n), lw = (n: number) => w(n).toLowerCase();
/** Today's quiet line (pick 5 a): "Sol would have done 2 things today" (the count is a figure, as the scene sets it) */
export function quietLine(es: Entry[]): string | null {
  const n = openWould(es).length;
  return n ? `Sol would have done ${n} ${n === 1 ? "thing" : "things"} today` : null;
}
/** the fold's one line (scene 11: "Seven things off your day. You did three; Sol did four.") */
export function foldLine(es: Entry[]): [string, string] {
  const d = doneBy(es);
  if (!d.all.length) return ["Nothing off your day yet.", ""];
  const first = `${w(d.all.length)} ${d.all.length === 1 ? "thing" : "things"} off your day.`;
  const second = !d.sol.length ? "You did all of it." : !d.you.length ? "Sol did all of it." : `You did ${lw(d.you.length)}; Sol did ${lw(d.sol.length)}.`;
  return [first, second];
}
/** the line under a would-have (scene 4: "Canvas is at read · propose would save them"); `at` is the source's rung now */
export function whyLine(e: Entry, name: string, at: Rung): string {
  if (e.state === "let" || rungAt(at) >= rungAt(e.rung)) return `${name} is at ${at} now · next time Sol does it`;
  if (e.state === "not") return `not this · Sol will not offer it again`;
  return `${name} is at ${at} · ${e.rung} ${e.sub}`;
}
/** an entry's signature (scene 11: "Sol · 08:51", "you · 11:24") */
export const signOf = (e: Entry) => { const d = new Date(e.at); return `${e.actor === "sol" ? "Sol" : "you"} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** whether its undo is still real at `now` */
export const canUndo = (e: Entry, now: number) => "kind" in e.undo && e.undo.until > now && e.state !== "undone";

// ── the fold's line of time ─────────────────────────────────────────────────────────────────────────────────────
/** the day's span on the line: from 8:00 (or the first entry, earlier) to now (at least 22:00) */
export function spanOf(es: Entry[], now: number): [number, number] {
  const d = new Date(now), at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
  const first = Math.min(at(8), ...es.map((e) => e.at));
  return [Math.floor((first - at(0)) / 36e5) * 36e5 + at(0), Math.max(now, at(22))];
}
/** where a moment sits on a line `w` wide (pure) */
export const xAt = (t: number, [a, b]: [number, number], w: number) => Math.round(((t - a) / (b - a)) * w);
/** the hour ticks on the span: every even hour inside it */
export function ticksOf([a, b]: [number, number]): number[] {
  const out: number[] = [], d = new Date(a);
  let t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + (d.getMinutes() || d.getSeconds() ? 1 : 0)).getTime();
  if (new Date(t).getHours() % 2) t += 36e5;
  for (; t <= b; t += 72e5) out.push(t);
  return out;
}

// ── the stub (until #829) ─────────────────────────────────────────────────────────────────────────────────────────
/** today's ledger as the design's day has it (scene 11 for what was done, scene 4 for what Sol would have done) */
export function seedLedger(now: number): Entry[] {
  const d = new Date(now), at = (h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  const real = (t: number) => ({ kind: "real" as const, until: t + 24 * 36e5 });
  const all: Entry[] = [
    { id: "e-hold", at: at(8, 51), actor: "sol", source: "calendar", did: "Held 19–21", sub: "for chem set 6", rung: "propose", undo: real(at(8, 51)) },
    { id: "e-notes", at: at(9, 12), actor: "sol", thingId: "t-bio-notes", source: "files", did: "Bio notes started", sub: "bio 201, from the slides", rung: "draft", undo: real(at(9, 12)) },
    { id: "e-lab", at: at(11, 24), actor: "you", source: "calendar", did: "Lab moved", sub: "to Thu 14:00, your yes", rung: "propose", undo: { none: true, why: "you did it on your calendar" } },
    { id: "e-ch18", at: at(13, 6), actor: "you", did: "Notes: ch 1–8 too", sub: "answered in the notch", rung: "read", undo: { none: true, why: "an answer; change it from the job" } },
    { id: "e-data", at: at(15, 18), actor: "sol", source: "files", did: "Data section drafted", sub: "stats 140, for Maya", rung: "draft", undo: real(at(15, 18)) },
    { id: "e-set6", at: at(19, 0), actor: "you", source: "canvas", did: "Chem set 6 in", sub: "Canvas: 8 of 8", rung: "read", undo: { none: true, why: "handed in on Canvas" } },
    { id: "e-prep", at: at(20, 36), actor: "sol", thingId: "t-lab-prep", source: "files", did: "Lab prep moved", sub: "to Wed night", rung: "draft", undo: real(at(20, 36)) },
    { id: "w-slides", at: at(11, 2), actor: "sol", source: "canvas", wouldHave: "saved lecture 11 slides into bio 201", sub: "would save them", rung: "propose", undo: { none: true, why: "nothing was done" } },
    { id: "w-reply", at: at(11, 18), actor: "sol", source: "mail", wouldHave: "drafted your reply to prof. Ahmed, held for you", sub: "would draft it", rung: "draft", undo: { none: true, why: "nothing was done" } },
  ];
  return all.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
}

/** the engine's answers, in the face. `raise` sets a source a rung up (Sources' own `home.source.set`) and says the
 *  ledger id that undoes it; `lower` undoes it. */
export function stub(now: () => number = Date.now, raise: (id: SourceId, rung: Rung) => string | null = () => null, lower: (ledgerId: string) => void = () => {}) {
  let entries = seedLedger(now());
  const kept = new Map<string, { entries: Entry[]; sources?: string }>();
  let n = 0;
  const day = () => { const d = new Date(now()); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const msg = (done: LedgerDone | null): LedgerMsg => ({ type: "home.ledger", day: day(), entries, done });
  const set = (id: string, change: Partial<Entry>) => { entries = entries.map((e) => (e.id === id ? { ...e, ...change } : e)); };
  return (a: LedgerAsk): LedgerMsg => {
    if (a.type === "home.ledger") return msg(null);
    if (a.type === "home.undo") {
      const was = kept.get(a.ledgerId);
      if (was) { entries = was.entries; if (was.sources) lower(was.sources); kept.delete(a.ledgerId); return msg(null); }
      const e = entries.find((x) => x.id === a.ledgerId);   // an act of the day, undone from the fold
      if (!e || !canUndo(e, now())) return msg(null);
      const ledgerId = `u${++n}`;
      kept.set(ledgerId, { entries });
      set(e.id, { state: "undone" });
      return msg({ ledgerId, entryId: e.id, line: `undone: ${e.did}` });
    }
    const e = entries.find((x) => x.id === a.id);
    if (!e || !isWould(e) || e.state) return msg(null);
    const ledgerId = `l${++n}`;
    if (a.type === "home.ledger.not") {
      kept.set(ledgerId, { entries });
      set(e.id, { state: "not" });
      return msg({ ledgerId, entryId: e.id, line: `not this: Sol will not offer to have ${e.wouldHave}` });
    }
    // let it, next time: the source goes up to the rung this would have needed (one up from where it was)
    const sources = e.source ? raise(e.source, e.rung) : null;
    kept.set(ledgerId, { entries, sources: sources ?? undefined });
    set(e.id, { state: "let" });
    return msg({ ledgerId, entryId: e.id, line: `let it: ${e.source ? SOURCE_NAMES[e.source] : "Sol"} at ${e.rung} now · next time Sol has ${e.wouldHave}` });
  };
}
