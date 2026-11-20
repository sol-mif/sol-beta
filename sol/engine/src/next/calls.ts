// The gate and the ledger for the new face (#1604 slice 7, map.md "the gate and the ledger"; docs/port/notes/s7a.md).
// Behind ui.next (uiNext()): the part (parts/next-calls.ts) answers nothing while it is off.
//   next.call {ai, fn, args}  → {ok, id, gate, line}
//   next.undo {id}            → {ok, id, undone, line}
// An adapter, never a second ledger (Frank's handover, 2026-11-19): the gate is Home 5's check() (home/ceiling.ts), the
// row is one event on the one log through home/log.ts (the Ctx's), and Home's evening fold (home/ledger.ts) reads the
// same rows. Nothing is written beside: no calls.jsonl.
// What a call is today: `fn` is one of the moves the face has (map.md's function table). The 31 functions as the AI's
// tools come later, so today a call is gated and written and no function runs: the row is the call's whole effect.
// Each fn goes through a door of the ladder (read · propose · draft · do), so the ceiling's own tables decide its rung
// and whether it waits for a press (contract/home/ceiling.ts DOOR_RUNG, DOOR_PRESS), never a name.
// The gate, from the one row check() writes:
//   rung.did      "do"       let through (within the limit, no press needed, or a yes not yet spent)
//   rung.would    "draft"    over the limit: what it would have done is kept in the row's value file, nothing done
//   rung.asked    "ask"      it waits for the person's press: a card in Today (check() makes it); the call waits there
//   rung.refused  "refused"  refused before anything (a key that reads as two, say)
// One row a call. Each call that waits is its own ask (check() reuses only an ask no call waits on; then that open ask
// is the call's row and nothing new is written).
// Contract first (map.md "no", Frank's list): split, take_back and withdraw answer {ok:false, why:"not yet"} and write
// nothing; so does a fn not in the table ("not a move").
// The undo of a call (next.undo {id}): a new event, never an edit of the log. The row is answered by one
// rung.refused {act, why:"undone"} whose cause is the row (an outcome, so check() counts the act as no longer
// standing); an ask's card leaves Today with it. A second undo writes nothing and says so. What the call's function
// did would be reversed by its own path (home/undo.ts's, by the act's kind) once the functions run; today none does.
import { DOOR_RUNG, type Door } from "../contract/home/ceiling.js";
import { askId, check, finish, type Verdict } from "../home/ceiling.js";
import { changeThing } from "../home/items.js";
import type { HomeEv } from "../home/log.js";
import type { Ctx } from "../home/unit.js";
import type { By } from "../file-trail.js";

/** the moves the face has (map.md's function table, #1-#31; #15 is three), each through its door */
export const FNS: Readonly<Record<string, Door>> = {
  look: "read", read: "read", needs: "read", since: "read", find: "read", headline: "read",
  group: "propose", ask: "propose", tell: "propose", offer: "propose", point: "propose", beside: "propose",
  make: "draft", place: "draft", attach: "draft", check: "draft", write: "draft", sticky: "draft", due: "draft",
  start: "do", split_run: "do", pass: "do", redirect: "do", pause: "do", resume: "do", stop: "do",
  remove_line: "do", run_sticky: "do", finish: "do", drop: "do",
  split: "do", take_back: "do", withdraw: "do",
};
/** contract first (Frank, #1604 2026-11-19): no contract yet, so no row and no gate. Start's cost and spend limits are
 *  args of start, not moves; a call that carries them is not yet either. Social has no move in the face's table */
export const NOT_YET: ReadonlySet<string> = new Set(["split", "take_back", "withdraw"]);
const MONEY = ["cost", "spend", "limit"];

export type Gate = "do" | "draft" | "ask" | "refused";
export type CallAsk = { ai?: unknown; fn?: unknown; args?: unknown; thing?: unknown };
export type CallAnswer = { ok: true; id: string; gate: Gate; line: string; fn: string } | { ok: false; why: string; fn?: string };
export type UndoAnswer = { ok: true; id: string; undone: true; line: string; again?: true } | { ok: false; id?: string; why: string };

const KINDS: Record<string, Gate> = { "rung.did": "do", "rung.would": "draft", "rung.asked": "ask", "rung.refused": "refused" };
const val = (e: HomeEv): Record<string, unknown> => (e.value && typeof e.value === "object" ? (e.value as Record<string, unknown>) : {});
const word = (s: unknown, max = 60): string => (typeof s === "string" ? s.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, max) : "");

/** who calls: "you" is the person pressing in the face; any other name is an AI (a seat) */
export const byOf = (ai: string): By => (ai === "you" ? { person: "you" } : { person: "seat", agent: ai });

/** the line the face shows under the call (the engine's pick, one place) */
const LINES: Record<Gate, (ai: string, fn: string, said: string) => string> = {
  do: (ai, fn) => `${ai === "you" ? "You" : ai}: ${fn}, let through`,
  draft: (ai, fn, said) => `${ai === "you" ? "You" : ai} would ${fn}; nothing was done (${said.replace(/^refused: /, "")})`,
  ask: (ai, fn) => `${ai === "you" ? "You" : ai} asks before it can ${fn}: a card waits in Today`,
  refused: (_ai, _fn, said) => said,
};

/** next.call: gated by Home 5, one row on the one log. An ask resolves later; its row is written before this returns */
export async function call(ctx: Ctx, a: CallAsk): Promise<CallAnswer> {
  const fn = word(a.fn, 40), ai = word(a.ai) || "you";
  if (!fn || !Object.hasOwn(FNS, fn)) return { ok: false, why: "not a move", ...(fn ? { fn } : {}) };
  const args = a.args && typeof a.args === "object" ? (a.args as Record<string, unknown>) : {};
  if (NOT_YET.has(fn) || (fn === "start" && MONEY.some((k) => k in args))) return { ok: false, why: "not yet", fn };
  const door = FNS[fn];
  const thing = typeof a.thing === "string" ? a.thing : typeof args.thing === "string" ? args.thing : undefined;
  // the row check() writes is caught as it is written (the ask's before check() waits on the press)
  const wrote: HomeEv[] = [];
  const off = ctx.log.on((e) => { if (KINDS[e.kind]) wrote.push(e); });
  let p: Promise<Verdict>;
  try { p = check(ctx, { tool: `next.${fn}`, input: args, door, ...(thing ? { thing } : {}), by: byOf(ai), canWait: true, there: true }); }
  finally { off(); }
  const row = wrote[wrote.length - 1];
  if (!row || row.kind === "rung.asked") {
    // it waits for the press; when it comes, the step is finished like any checked call. An ask of this act still open
    // writes no second ask: the open one is the call's row
    p.then((v) => finish(ctx, v), () => {});
    const asked = row ?? openAskOf(ctx, `next.${fn}`);
    if (!asked) return { ok: false, why: "the gate wrote nothing", fn };
    return { ok: true, id: asked.id, gate: "ask", line: LINES.ask(ai, fn, ""), fn };
  }
  const v = await p;
  finish(ctx, v);
  const gate = KINDS[v.ev.kind] ?? "refused";
  return { ok: true, id: v.ev.id, gate, line: LINES[gate](ai, fn, v.go ? "" : v.said), fn };
}

/** the newest ask of a next.<fn> act with no outcome yet (an ask open from before) */
function openAskOf(ctx: Ctx, tool: string): HomeEv | undefined {
  const evs = ctx.log.all();
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.kind !== "rung.asked") continue;
    const w = ctx.log.words(e) as { tool?: unknown } | null;
    if (w?.tool === tool && !outcome(evs, e.id)) return e;
  }
  return undefined;
}
const outcome = (evs: HomeEv[], id: string): HomeEv | undefined => evs.find((e) => (e.kind === "rung.did" || e.kind === "rung.refused") && e.cause === id);

/** whether a row was undone here: its rung.refused {why: "undone"} */
export const undoneOf = (ctx: Ctx, id: string): HomeEv | undefined =>
  ctx.log.all().find((e) => e.kind === "rung.refused" && e.cause === id && val(e).why === "undone");

/** next.undo {id}: the call no longer stands. One event; a second undo writes nothing */
export function undo(ctx: Ctx, a: { id?: unknown }, ai = "you"): UndoAnswer {
  const id = typeof a.id === "string" ? a.id : "";
  const evs = ctx.log.all(), row = evs.find((e) => e.id === id);
  if (!row || !KINDS[row.kind] || row.kind === "rung.refused") return { ok: false, ...(id ? { id } : {}), why: "no call of that id" };
  if (undoneOf(ctx, id)) return { ok: true, id, undone: true, line: "already undone", again: true };
  // an ask already answered and spent, or a done act whose step ran: its own outcome stands; undoing it is the outcome's
  const out = row.kind === "rung.asked" ? outcome(evs, id) : undefined;
  if (out) return { ok: false, id, why: out.kind === "rung.did" ? "it was let through; undo that one" : "it was already answered" };
  const ev = ctx.log.write({ kind: "rung.refused", ...(row.item ? { item: row.item } : {}), value: { act: String(val(row).act ?? ""), why: "undone" }, cause: id, by: byOf(ai) });
  if (row.kind === "rung.asked") {
    const card = ctx.items.get(askId(id));
    if (card && !card.gone && card.state !== "done") { changeThing(ctx, card.id, { gone: true, waitsOn: "none" }, { cause: ev.id, by: byOf(ai) }); ctx.pushToday(); }
  }
  return { ok: true, id, undone: true, line: "undone: it no longer stands" };
}

/** the calls standing now: every gate row (did, would, asked) not undone and, for an ask, not refused since (a read of
 *  the log, nothing kept; the test's "state before") */
export function standing(ctx: Ctx): { id: string; gate: Gate; act: string; rung: string }[] {
  const evs = ctx.log.all();
  return evs.filter((e) => (e.kind === "rung.did" || e.kind === "rung.would" || e.kind === "rung.asked") && !undoneOf(ctx, e.id)
    && !(e.kind === "rung.asked" && outcome(evs, e.id)?.kind === "rung.refused"))
    .map((e) => ({ id: e.id, gate: KINDS[e.kind], act: String(val(e).act ?? ""), rung: String(val(e).rung ?? "") }));
}

/** the rung each move needs (the face may show it before the call) */
export const rungOfFn = (fn: string) => (Object.hasOwn(FNS, fn) ? DOOR_RUNG[FNS[fn]] : null);
