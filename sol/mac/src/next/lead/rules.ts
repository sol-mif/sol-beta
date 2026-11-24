// One lead per piece (round 7, #1615; the mockup's merge/lead.js, its rules as they are): what a piece of many parts is,
// who leads it, its one line, a part's state, the hand-offs out to a teammate, and the runs one lapsed sign-in holds up,
// joined into one ask. Pure on the store (D, open); the moves (cv/moves/lead.ts) and the views (lead/*.tsx) read these.
//   partsOf multi aisOn leadOf asksOf   a piece and its parts
//   leadBits saidWords partState        the words the views draw
//   talkWords changedWords              a run's face line and what it did, its files when it has a count
//   joined lapsed held                  the joined blocker (D.lapsed)
//   withs waitsOn                       what was handed out, per canvas
//   partsSum                            the parts a need line names, added (count 30)
// Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { D, hooks, open, piecesIn, type Ask, type Data, type Piece } from "../cv/core.ts";
import { folderName } from "../place.ts";

/** a hand-off out: the part is on a teammate's wait {who, at}; back: signed by them */
export type With = { who: string; at: string };
export type Back = { by: string; at: string; what: string; text?: string };
type Part = Piece & { with?: With; back?: Back; blocked?: string };
/** D.lapsed: a sign-in that lapsed, the parts it holds carry blocked:<id>; st is the seat's own state while Seats (slice
 *  6b) is not on the branch: lapsed, wait (its page is open), in */
export type Lapse = { since: string; by?: string; st?: "lapsed" | "wait" | "in" };

export const CAUSE: Record<string, string> = { gh: "GitHub" };
/** past this many parts, the rows at Middle fold into one line (lead.js SUM) */
export const SUM = 6;

export const partsOf = (p: Piece | undefined | null): Part[] => (p && p.parts && !/stopped|taken back/.test(String(p.state || "")) ? (p.parts as Part[]) : []);
export const multi = (p: Piece | undefined | null): boolean => !!p && !p.part && partsOf(p).length >= 2;
export const aisOn = (p: Piece): string[] => [...new Set([p.ai, ...partsOf(p).map((x) => x.ai)].filter((x): x is string => !!x))];
/** the lead: the one the person named, else the first AI on it, once a second AI is on it too */
export const leadOf = (p: Piece): string | null => (p.lead as string) || (aisOn(p).length >= 2 ? (p.splitBy || p.ai || null) : null);
export function asksOf(p: Piece): Ask[] { const ids = new Set(partsOf(p).map((x) => x.id)); return open().filter((a) => a.piece === p.id || (!!a.part && ids.has(a.part))); }

/** the seat's state, from Seats when it is there (hooks.seats, slice 6b), else the lapse's own */
type Seats = { acctSt?: (id: string) => string | undefined };
export function seatSt(id: string, d: Data = D): string {
  const l = (d.lapsed as Record<string, Lapse> | undefined)?.[id];
  if (!l) return "in";
  const s = (hooks as unknown as { seats?: Seats }).seats?.acctSt?.(id);
  return s || l.st || "lapsed";
}
export const lapsed = (id: string, d: Data = D): boolean => !!(d.lapsed as Record<string, Lapse> | undefined)?.[id] && seatSt(id, d) === "lapsed";
export const held = (x: Part): boolean => !!(x.blocked && lapsed(x.blocked));

/** a lead as a person reads it: the part it runs, by that part's name, never the AI's (BR1 #1615: a session is not its
 *  AI); the AI that split the job and runs no part of its own is "the first part" */
export const partWord = (p: Piece, ai: string): string => { const x = partsOf(p).find((q) => q.ai === ai); return x ? `“${x.name}”` : "The first part"; };
/** a piece of many parts in one line, by its lead: "“Write the copy” leads · 3 parts · 1 ask" (the first bit is bold) */
export function leadBits(p: Piece): string[] {
  const ps = partsOf(p), n = ps.length, k = asksOf(p).length, l = leadOf(p), h = ps.filter(held), w = ps.filter((x) => x.with);
  const bits = [l ? `${partWord(p, l)} leads` : "One on it", `${n} parts`];
  if (k) bits.push(`${k} ask${k === 1 ? "" : "s"}`);
  if (h.length) bits.push(`${h.length} wait on ${CAUSE[h[0].blocked!] || "a sign-in"}`);
  if (w.length) bits.push(`${w.length} with ${w[0].with!.who}`);
  return bits;
}
/** whether the line's aura is still (it asks, or a part waits on a sign-in) */
export const leadStill = (p: Piece): boolean => !!asksOf(p).length || partsOf(p).some(held);

/** the one line said when a second AI joins, and the name its one press gives the lead to (F4) */
export type Said = { first: string; joined: string; changed?: boolean };
export function saidWords(p: Piece): { words: string; other: string } | null {
  const s = p.leadSaid as Said | undefined;
  if (!s) return null;
  const l = leadOf(p) || s.first, other = s.joined === l ? s.first : s.joined;
  return { words: s.changed ? `${partWord(p, l)} leads now, by you.` : `${partWord(p, s.joined)} joined; ${partWord(p, l).replace(/^The/, "the")} leads, first on it.`, other };
}

/** a run's face line (plane/Face.tsx, lead/views.tsx): its files changed when it has a count; with none no count at
 *  all, never "undefined" nor a made-up 0 (BR1, #1615) */
export const talkWords = (files?: number): string => (Number.isFinite(files) ? `talk · change ${files} files` : "talk");
/** what a run did, for the Diary's headline and its line: "changed N files", or "worked" with no count */
export const changedWords = (files?: number): string => (Number.isFinite(files) ? `changed ${files} files` : "worked");
export const KIND: Record<string, string> = { session: "run", sticky: "sticky", page: "page", person: "a person’s part" };
const TAGW: Record<string, string> = { working: "working", done: "done", asks: "asks you", held: "waits on a sign-in" };
/** a part's state: its class and its words */
export function partState(x: Part): [string, string] {
  const a = open().some((q) => q.part === x.id);
  if (x.with) return ["with", `with ${x.with.who}`];
  if (a) return ["asks", "asks you"];
  if (held(x)) return ["held", TAGW.held];
  if (x.back) return ["done", `back from ${x.back.by}`];
  return [x.state === "done" ? "done" : "working", TAGW[String(x.state)] || String(x.state || "working")];
}
/** past SUM parts: "14 working · 2 ask you · 7 wait on a sign-in · 5 done" */
export function sumWords(p: Piece): string {
  const ps = partsOf(p), n = (s: string) => ps.filter((x) => partState(x)[0] === s).length;
  return ([["working", "working"], ["asks", "ask you"], ["held", "wait on a sign-in"], ["done", "done"]] as const).filter(([k]) => n(k)).map(([k, w]) => `${n(k)} ${w}`).join(" · ");
}

/** the AIs in a folder: each session's, each part's, each job's, once */
export const aisIn = (rid: string): number => new Set(piecesIn(rid).filter((p) => p.kind === "session" || p.kind === "job").flatMap(aisOn)).size;
export const findPart = (pid: string, id: string): Part | null => (D.pieces[pid]?.parts as Part[] | undefined)?.find((x) => x.id === id) || null;

// ---------------------------------------------------------------- hand-offs, per canvas

export type Hand = { who: string; pid: string; id: string };
const WITH = new WeakMap<object, Hand[]>();
/** the parts on a teammate's wait (per canvas: a load starts clean) */
export function withs(d: Data = D): Hand[] { let w = WITH.get(d); if (!w) { w = []; WITH.set(d, w); } return w; }
/** what waits on a teammate from you ("1 from you" on their row) */
export const waitsOn = (who: string): number => withs().filter((h) => h.who === who).length;
/** the group page's line under its waits: what you handed out (F2: never one of your waits, never in your count) */
export const others = () => withs().map((h) => ({ h, x: findPart(h.pid, h.id), p: D.pieces[h.pid] })).filter((o): o is { h: Hand; x: Part; p: Piece } => !!o.x && !!o.p);

// ---------------------------------------------------------------- joined asks: runs held by one cause, one ask

export type Joined = { id: string; type: "join"; target: string; n: number; by: Record<string, number>; since: string; cause: string };
export function joined(d: Data = D): Joined[] {
  const lp = d.lapsed as Record<string, Lapse> | undefined;
  if (!lp) return [];
  const out: Joined[] = [];
  for (const id of Object.keys(lp)) {
    if (!lapsed(id, d)) continue;
    const by: Record<string, number> = {};
    let n = 0;
    for (const p of Object.values(d.pieces)) for (const x of partsOf(p)) if (x.blocked === id) { n++; by[p.region] = (by[p.region] || 0) + 1; }
    if (n) out.push({ id: `join:${id}`, type: "join", target: id, n, by, since: lp[id].since, cause: CAUSE[id] || id });
  }
  return out;
}
/** "api 7 · web 5" */
export const byWords = (t: Joined) => Object.entries(t.by).map(([r, n]) => `${folderName(r)} ${n}`).join(" · ");

/** the parts a need line names, added: "12 asks (2 from life) · 7 from people" is 19; a bare "19" is 19 (lead.js partsSum) */
export function partsSum(t: string): number {
  t = t.replace(/\([^)]*\)/g, "");
  const one = (x: string) => (x === "One" ? 1 : +x);
  let sum = 0, k = 0;
  for (const m of t.matchAll(/(One|\d+)\s(?:things?\s(?:here\s)?|asks?\s|more\s(?:asks?\s)?outside|from people|needs?\s)/g)) { sum += one(m[1]); k++; }
  return k ? sum : +((t.match(/\d+/) || [])[0] ?? NaN);
}
