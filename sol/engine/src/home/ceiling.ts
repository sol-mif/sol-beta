// Home 5 (design §8, position two; specs home-plan §6 Home 5): the upper limit, the first thing in Sol that says yes or
// no to a seat's single action. Behind home.whole like all of Home, and narrower still: it looks only at
//   (a) a call made inside a Home Run (runs.ts: a seat's session bound to a Run at its accept, one open Run a session),
//       and a Sol tool's call that names no session while any Run is open: no Run is surely its own, so it needs a
//       press (it fails closed), and
//   (b) a call to a Source door (callSource).
// Every other call, every ordinary seat in an ordinary chat, goes by untouched: the wrappers hand back the inner
// check's own answer, and nothing is written. With the switch off they do not even look.
// The six rules (design §8):
//   1 write first       every checked call writes its line before anything runs (run.about and rung.asked are on the
//                       disk before they return: their rows' fsync)
//   2 only refuse       the guard runs after the seat's own check and can turn its yes into a no, never a no into a
//                       yes: the PreToolUse hook never answers "allow", only "deny" or nothing
//   3 one press, once   a yes is consumed by exactly one call of that act (the same tool and input hash the same): one
//                       rung.did whose cause is the ask. The same call again asks again
//   4 one each          an ask is one rung.asked; its answer one rung.answered (cause the ask); a second answer writes
//                       nothing
//   5 said to the brain a refused call answers "refused: …" to the seat (a deny's message, a tool's error text)
//   6 nobody there      never allowed: a caller that can wait waits on a Today card; one that cannot is refused (why
//                       "away", or "wait" when a window is there but the caller cannot wait), and the card stays.
//                       A yes that comes while the call waits is checked again (the Run still going, the limit
//                       not come down since)
// It fails closed: what a call needs comes from the tables in contract/home/ceiling.ts, never from a name. A door's read,
// propose, draft, do → read, propose, draft, act; the known tools their own rung (Read, Glob, Grep: read; Write, Edit
// and the like: draft inside the Thing's made/ folder, else act; Bash, WebFetch, WebSearch: act); any other tool act.
// The ceiling is the lowest of the source's rung, the folder's and the one frozen into the Thing at its accept (runs.ts
// ceilingAt); a record-only Run's is read. Within it, a press is still needed (design §7.7, send, submit, pay) for a
// door's `do` unless the door says this act needs none (its `presses`), and for every tool not in the table; a name
// that says send, submit or pay adds a press, it never takes one away. An ask's card is a structured object, `ask:
// { tool, fields: [{ key, value }], hidden }`, each field its own part (invisible characters replaced by Unicode class),
// so nothing a seat writes poses as the engine's words; its title is the act alone. A key is matched NFKC-normalised
// (its invisible characters and end spaces dropped), so `ｃｃ` or `b⁠cc` is a target, and shown as written, marked with
// the name it matched (`ｔｏ [≈to]`); a call with two keys at one level that match as one name, or a key that matches
// with `.`, `[` or `]` in it, is refused before any ask (why "keys"). Targets (to, cc, bcc, amount, command, url, path and the like)
// come first and are never hidden; free text's string leaves are, by path. Any field shown that is over 200 characters
// (a target or not: a name never decides) shows its start and its end with its length between, points to the ask's
// value file, which holds the whole call, is listed in `cut`, and a yes on such a card counts only with `opened: true`
// (else it is refused, why "unopened"). Each checked call ends in exactly one of rung.did,
// rung.would (over the ceiling, nothing run; what it would have done in a value file; its mode the true one: none when
// live, "record" in a record-only Run, "replay" in a replay) or rung.refused.
// A record-only Run does nothing above read: the rest is written as rung.would. A replay (a Run with replayOf) is one,
// so it never calls a source's draft or do, and every event it writes carries mode "replay". Of the design's three
// limits only the kind of act is built; time and money have no data yet.
// Where it hooks (specs home-plan §4.4): runSolTool (tools.ts, Sol's own tools, guardSolTool), canUseTool
// (ceilingGuard, index.ts and work/runs.ts) and the PreToolUse / PostToolUse hooks (ceilingHooks), given to each
// Claude seat launched while Home is on, so a seat launched before its session was bound to a Run is checked too. A
// seat launched while Home is off has none, and is never in a Run (#1266). A Sol tool (mcp__sol__*) is checked once,
// in its runner (guardSolTool: runSolTool, and Work's runWorkTool and runOnlyTool), when the seat's server named it a
// runner-checked tool (solChecked) at its launch; any other mcp__sol__ name is checked by the hook and canUseTool like any tool (fail
// closed). A session is bound to a Run only when a seat was launched with the hooks for it (runs.ts guardedSeat): a
// seat that cannot carry them (Codex, say) is never in a Run.
// The hook and canUseTool check one call once (kept by its session, its Run and its tool-use id), on the input that
// runs: an input the permission layer changed after the other one checked it is refused (why "changed"). An answer
// whose press was undone (home.undo of its today.answer) is no answer: no yes stands on it, and its ask is open again.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CanUseTool, HookCallback, HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk";
import { hashOf } from "../canonical.js";
import type { ToolResult, TurnCtx } from "../browser.js";
import type { By } from "../file-trail.js";
import { kernelNow } from "../kernel.js";
import { homeWhole } from "../settings.js";
import type { Rung, SourceId } from "../contract/home/policy.js";
import { CARD_CUT, DOOR_PRESS, DOOR_RUNG, FREE_TEXT, TARGET, TOOLS, type Door } from "../contract/home/ceiling.js";
import type { AnswerHook } from "./hooks.js";
import { changeThing, newThing, type Thing } from "./items.js";
import { ENGINE, YOU, type HomeEv } from "./log.js";
import { lowest, rungAt } from "./rung-reader.js";
import { about, ceilingAt, did, getRun, guardedSeat, inRunOnDisk, modeOf, openRuns, restartRuns, runsOfSession, seatEnded, sourceOf, type Run } from "./runs.js";
import { onOtherRung, rungOf, sourcesMsg, type SourceDoor } from "./sources.js";
import type { Ctx, Unit } from "./unit.js";

export type { Door };
/** a door that can say whether one act of its own needs a press (its metadata; unsaid or throwing: it does) */
export type PressDoor = SourceDoor & { presses?: (op: Door, input: unknown) => boolean };
/** one call to check */
export type Call = {
  tool: string;            // the tool's name; for a door, the act's own name ("send", "save the slides")
  input?: unknown;
  run?: string;            // the Run it is a step of
  thing?: string;          // the Thing it is for, when it is in no Run
  source?: SourceId;       // a door's source
  door?: Door;
  doorPress?: boolean;     // what the door says of this act's press (callSource asks it); unsaid: DOOR_PRESS
  canWait?: boolean;       // it can stop and wait for a press (default yes)
  stray?: true;            // no Run can be found for it while a Run is open (a Sol tool called with no session): it needs
                           // a press whatever it is, and no source's limit is its own
  there?: boolean;         // a window is connected (default: not known, so nobody)
  by?: By;
  signal?: AbortSignal;
};
export type Verdict =
  | { go: true; act: string; ev: HomeEv; step?: HomeEv; run?: Run }
  | { go: false; act: string; said: string; ev: HomeEv };

// ── the names and words that are the engine's pick, in one place, so one edit renames them ───────────────────────
/** a name that says send, submit or pay (inside a word too: "send_message"): one more reason for a press, never the gate */
export const PRESS = /(^|[^a-z])(send|submit|pay)(s|ing)?([^a-z]|$)/i;
/** an ask's card: one an ask, so making it again never makes two */
export const askId = (asked: string): string => `ask-${asked.slice(0, 40)}`;
const ASK_ANSWERS: [string, string] = ["Allow once", "No"];   // the warm one lets it happen, once
const ASK_WHY = "This one always waits for your press. One press lets it happen once.";
const hiddenWhy = (n: number): string => `Not shown here: ${n === 1 ? "1 field" : `${n} fields`} of free text; the whole of it is kept with the ask in the ledger.`;
const said = {
  over: (name: string, at: Rung) => `refused: over the ceiling (${name} is at ${at})`,
  no: "refused: you said no",
  away: "refused: nobody is there to press; a card waits in Today",
  wait: "refused: this needs your press; a card waits in Today, ask again once it is pressed",
  stopped: "refused: stopped while it waited for a press",
  replay: "replay: written in the ledger, not done",
  record: "record only: written in the ledger, not done",
  run: "refused: this Run is not going (blocked or ended)",
  unopened: "refused: pressed before the whole of a long field was shown; nothing was done",
  keys: "refused: two of this call's keys read as one name, or a key reads as a path (. [ ]); nothing was done",
  broke: "refused: the upper limit could not check this call",
  many: "refused: this session is bound to more than one Run, so none is surely its own; nothing was done",
  changed: "refused: the input to run is not the one the upper limit checked; nothing was done",
};
const SOL = "mcp__sol__";
/** the Sol tools whose runner checks their call (guardSolTool), named by the seats' servers at launch */
const CHECKED = new Set<string>();
/** a seat's server says these of its tools are run through guardSolTool (runSolTool, runWorkTool, runOnlyTool) */
export function solChecked(names: Iterable<string>): void { for (const n of names) CHECKED.add(n); }
/** a call the hook and canUseTool leave to its runner: a Sol tool its server named runner-checked. Any other
 *  mcp__sol__ name is theirs to check (a runner that never reaches guardSolTool is never trusted by its prefix) */
const toRunner = (name: string): boolean => name.startsWith(SOL) && CHECKED.has(name.slice(SOL.length));

const val = (e: HomeEv): Record<string, unknown> => (e.value && typeof e.value === "object" ? (e.value as Record<string, unknown>) : {});
const isUndo = (e: HomeEv): boolean => val(e).undo === true;
/** an act's fingerprint: the same call later hashes the same */
export const actOf = (c: Pick<Call, "tool" | "input" | "source" | "door">): string =>
  hashOf({ tool: c.tool, input: c.input ?? null, ...(c.source ? { source: c.source } : {}), ...(c.door ? { door: c.door } : {}) });

/** the path a write tool names, or null */
function pathOf(input: unknown): string | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const p = i.file_path ?? i.notebook_path ?? i.path;
  return typeof p === "string" && isAbsolute(p) ? p : null;
}
/** a path made real through the deepest part of it that is there (a link inside made/ that points out of it is out) */
function realOf(p: string): string {
  const rest: string[] = [];
  let d = resolve(p);
  while (!existsSync(d) && dirname(d) !== d) { rest.unshift(basename(d)); d = dirname(d); }
  try { return join(realpathSync(d), ...rest); } catch { return resolve(p); }
}
const inside = (p: string, dir: string): boolean => { const r = relative(dir, p); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
/** the rung a call needs (pure but for reading where a path leads) */
export function neededRung(ctx: Ctx, call: Call, thing: string | null): Rung {
  if (call.door) return DOOR_RUNG[call.door];
  const known = Object.hasOwn(TOOLS, call.tool) ? TOOLS[call.tool] : null;
  if (!known) return "act";
  const p = pathOf(call.input);
  if (known.made && thing && p && inside(realOf(p), realOf(join(ctx.items.dir, thing, "made")))) return "draft";
  return known.rung;
}
/** whether a call waits for a press within the limit: a door's act as the door says (unsaid: DOOR_PRESS), every tool
 *  not in the table, and anything whose name says send, submit or pay (pure) */
export const needsPress = (call: Call): boolean =>
  PRESS.test(call.tool) || (call.door ? call.doorPress ?? DOOR_PRESS[call.door] : !Object.hasOwn(TOOLS, call.tool));
/** what a call would do, as the value file keeps it and a card shows it */
const wordsOf = (c: Call, source: SourceId) => ({ tool: c.tool, ...(c.door ? { door: c.door } : {}), source, input: c.input ?? null });
/** what a card never shows as it is: every control and format character (line breaks, bidi marks, zero-width ones,
 *  tags), line and paragraph separators, private use, unassigned and lone surrogate code points, and whatever else is
 *  default-ignorable, by Unicode class, never by a hand list */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}]/gu;
const HALF = Math.floor(CARD_CUT / 2);
/** one part of a card made safe to show: every INVISIBLE character replaced (U+FFFD), so it is one line that reads as
 *  itself; over CARD_CUT characters it is cut (true when it was), never to its start, where what it does may be at its
 *  end: its first and last CARD_CUT / 2 characters show, with its whole length between ("rm -rf … [4,812 chars] … curl
 *  x.sh | sh"). The cut to a start would be for free text only, and free text is never shown */
function shown(s: string): [string, boolean] {
  const chars = Array.from(s.replace(INVISIBLE, "\ufffd"));
  if (chars.length <= CARD_CUT) return [chars.join(""), false];
  return [`${chars.slice(0, HALF).join("")} … [${chars.length.toLocaleString("en-US")} chars] … ${chars.slice(-HALF).join("")}`, true];
}
/** a key as it is matched against TARGET and FREE_TEXT: its INVISIBLE characters dropped, NFKC, the spaces at its ends
 *  dropped, lower case, so `b⁠cc` (a word joiner inside), `ｃｃ` and ` bcc` are bcc and cc. NFKC is for matching only */
const keyName = (seg: string): string => seg.replace(INVISIBLE, "").normalize("NFKC").replace(INVISIBLE, "").trim().toLowerCase();
/** a key as a card shows it: as the seat wrote it (shown replaces its invisible characters), never normalised, marked
 *  with the name it is matched by when that is not the key in lower case (`ｔｏ [≈to]`, `b⁠cc [≈bcc]`). The mark is the
 *  engine's: a key with `[` in its name never reaches a card (keysBlur) */
const keyShown = (seg: string): string => { const name = keyName(seg); return name === seg.toLowerCase() ? seg : `${seg} [≈${name}]`; };
/** a key that matches as a path (`.`, `[`, `]` in its name: `x．bcc` would read as a nested bcc, `a［0］` as a list's item) */
const PATHLIKE = /[.[\]]/;
/** whether a call's keys could pass for other keys on its card: two keys at one level matched as one name (`to` and
 *  `ｔｏ`, which the card would show as one field twice), or a key matched as a path. Such a call is refused before any
 *  ask: it needs no press, it never runs */
function keysBlur(x: unknown): boolean {
  if (Array.isArray(x)) return x.some(keysBlur);
  if (!x || typeof x !== "object") return false;
  const names = new Set<string>();
  for (const k of Object.keys(x)) {
    const name = keyName(k);
    if (PATHLIKE.test(name) || names.has(name)) return true;
    names.add(name);
    if (keysBlur((x as Record<string, unknown>)[k])) return true;
  }
  return false;
}
/** a call's input as an ask's card's fields, nested ones by their path ("payment.amount", "to[1]"), each value its own
 *  field: the targets first (TARGET, at any depth, never hidden), then the rest, each by name. Under a free-text key
 *  (FREE_TEXT) the string leaves are hidden, by path; everything else there (an object, a list, a number) is walked
 *  into and shown. A field whose key or value is longer than CARD_CUT, whatever it is called, shows its start and its
 *  end, points to the ask's value file (`whole`), and its key is in `cut` (a press needs `opened`, see press) */
type Fields = { fields: { key: string; value: string; whole?: string }[]; hidden: string[]; cut: string[] };
function fieldsOf(input: unknown, whole: string | undefined): Fields {
  const targets: Fields["fields"] = [], rest: Fields["fields"] = [], hidden: string[] = [], cuts: string[] = [];
  const add = (path: string, v: string, target: boolean): void => {
    const [key, k] = shown(path || "input"), [value, cut] = shown(v);
    if (k || cut) cuts.push(key);
    (target ? targets : rest).push({ key, value, ...((k || cut) && whole ? { whole } : {}) });
  };
  const walk = (x: unknown, path: string, free: boolean, target: boolean): void => {
    if (Array.isArray(x)) { if (!x.length) add(path, "[]", target); x.forEach((v, i) => walk(v, `${path}[${i}]`, free, target)); return; }
    if (x && typeof x === "object") {
      const ks = Object.keys(x).sort();
      if (!ks.length) add(path, "{}", target);
      for (const k of ks) {
        const seg = keyShown(k), name = keyName(k);
        walk((x as Record<string, unknown>)[k], path ? `${path}.${seg}` : seg, free || FREE_TEXT.includes(name), target || TARGET.test(name));
      }
      return;
    }
    if (x === undefined) return;
    if (typeof x === "string" && free && !target) { hidden.push(shown(path)[0]); return; }
    add(path, String(x), target);
  };
  walk(input, "", false, false);
  return { fields: [...targets, ...rest], hidden, cut: cuts };
}
/** an ask's card's call: the act (the source's name and the door's act, or the tool's name) and its fields, each its own
 *  part. The card's title is the act alone: what a seat wrote is never joined into the engine's words */
function askOf(ctx: Ctx, w: unknown, whole: string | undefined): { tool: string; fields: Fields["fields"]; hidden: string[]; cut?: string[] } {
  const o = (w && typeof w === "object" ? w : {}) as { tool?: unknown; door?: unknown; source?: unknown; input?: unknown };
  const name = sourcesMsg(ctx, null).sources.find((s) => s.id === o.source)?.name ?? String(o.source ?? "Sol");
  const [tool] = shown(o.door ? `${name}: ${String(o.tool ?? "")}` : String(o.tool ?? ""));
  const { fields, hidden, cut } = fieldsOf(o.input ?? null, whole);
  return { tool, fields, hidden, ...(cut.length ? { cut } : {}) };
}
/** whether a press on an ask must say the whole was opened: its call has a field too long for its card. Read from the
 *  ask's own words on the log, never from the card a face holds */
const mustOpen = (ctx: Ctx, asked: HomeEv): boolean => (askOf(ctx, ctx.log.words(asked), undefined).cut?.length ?? 0) > 0;
const nameOf = (ctx: Ctx, id: SourceId): string => sourcesMsg(ctx, null).sources.find((s) => s.id === id)?.name ?? id;

// ── the asks waiting, by Home ────────────────────────────────────────────────────────────────────────────────────
/** what a press brings a waiting call: yes, no, or a yes refused because the card's cut values were not opened */
type Pressed = boolean | "unopened";
const WAITING = new WeakMap<Ctx, Map<string, (p: Pressed) => void>>();
const waiting = (ctx: Ctx): Map<string, (p: Pressed) => void> => { let m = WAITING.get(ctx); if (!m) { m = new Map(); WAITING.set(ctx, m); } return m; };
/** the asks as they stand on the log: every ask that is not undone, the answer of each that counts, and the asks a call
 *  went on. An answer counts when it is not undone and the press that made it (the last today.answer on the ask's card
 *  before it) is not undone either: a press undone (home.undo of its answer) is no yes, and its ask is open again */
function asksOf(ctx: Ctx): { asks: HomeEv[]; answer: Map<string, HomeEv>; used: Set<string> } {
  const evs = ctx.log.all();
  const undone = new Set<string>();
  for (const e of evs) if (e.cause && isUndo(e)) undone.add(e.cause);
  const asks: HomeEv[] = [], answer = new Map<string, HomeEv>(), used = new Set<string>(), press = new Map<string, string>();
  for (const e of evs) {
    if (e.kind === "today.answer" && e.item) press.set(e.item, e.id);   // undone or not: an undone press undoes its answer
    // a press spent stays spent: a call went on it, whatever is written after (an undo never gives a yes back)
    if (e.kind === "rung.did" && e.cause && !isUndo(e)) used.add(e.cause);
    if (isUndo(e) || undone.has(e.id)) continue;
    if (e.kind === "rung.asked") asks.push(e);
    else if (e.kind === "rung.answered" && e.cause && !answer.has(e.cause)) {
      const p = press.get(askId(e.cause));
      if (!p || !undone.has(p)) answer.set(e.cause, e);
    }
  }
  return { asks, answer, used };
}
const answerOf = (ctx: Ctx, asked: string): HomeEv | undefined => asksOf(ctx).answer.get(asked);
const outcomeOf = (ctx: Ctx, asked: string): HomeEv | undefined => ctx.log.all().find((e) => (e.kind === "rung.did" || e.kind === "rung.refused") && e.cause === asked);
/** an ask of this act for this Thing answered yes (an answer that counts) and not yet used: the press that lets the next
 *  such call go, once */
function standingYes(ctx: Ctx, act: string, item: string | undefined): HomeEv | undefined {
  const { asks, answer, used } = asksOf(ctx);
  return asks.find((e) => val(e).act === act && e.item === item && answer.get(e.id) !== undefined && val(answer.get(e.id)!).yes === true && !used.has(e.id));
}
/** an ask of this act no answer counts for, no call went on and no call waits on (one a stop, an "away" or an undone
 *  press left): asked again, not twice */
function openAsk(ctx: Ctx, act: string, item: string | undefined): HomeEv | undefined {
  const { asks, answer, used } = asksOf(ctx);
  return asks.find((e) => val(e).act === act && e.item === item && !answer.has(e.id) && !used.has(e.id) && !waiting(ctx).has(e.id));
}

/** the Today card of an ask, made (or opened again) once: true when it moved */
function askCard(ctx: Ctx, asked: HomeEv): boolean {
  const w = ctx.log.words(asked), t = asked.item ? ctx.items.get(asked.item) : null;
  const src = (w as { source?: unknown } | null)?.source, door = (w as { door?: unknown } | null)?.door;
  const hash = (asked as { hash?: unknown }).hash;   // the ask's value file: the whole call, free text and all
  const value = typeof hash === "string" && hash ? `value:${hash}` : undefined;
  const ask = askOf(ctx, w, value), title = ask.tool;
  const why = ask.hidden.length ? `${ASK_WHY} ${hiddenWhy(ask.hidden.length)}` : ASK_WHY;
  const card: Thing = {
    id: askId(asked.id), read: "job", folder: t?.folder ?? "", words: title, state: "asks", waitsOn: "you", at: ctx.now(),
    links: [`rung:${asked.id}`, ...(value ? [value] : [])], made: [],
    card: { source: door && typeof src === "string" ? (src as SourceId) : "sol", title, why, chips: [], answers: [...ASK_ANSWERS], touches: [], edge: title, ask },
  };
  const was = ctx.items.get(card.id);
  if (!was) return newThing(ctx, card, { cause: asked.id, by: ENGINE, ...(asked.mode ? { mode: asked.mode } : {}) }) !== null;
  if (was.state === "done" || was.gone) return changeThing(ctx, card.id, { ...card, gone: undefined }, { cause: asked.id, by: ENGINE }) !== null;
  return false;
}

// ── the check ────────────────────────────────────────────────────────────────────────────────────────────────────
/** one call checked against the ceiling: allowed (rung.did, run.about first inside a Run), over it (rung.would), or
 *  refused (rung.refused). A call that needs a press waits for it when it can */
export async function check(ctx: Ctx, call: Call): Promise<Verdict> {
  const run = call.run ? getRun(ctx, call.run) : null;
  const t = ctx.items.get(run?.thing ?? call.thing ?? "") ?? null;
  const source = call.source ?? sourceOf(ctx, t), by = call.by ?? ENGINE;
  const act = actOf(call), item = t ? { item: t.id } : {};
  const start = run ? ctx.log.all().find((e) => e.kind === "run.start" && e.item === run.id) : undefined;
  const mode = run ? modeOf(run) : {};
  const refuse = (why: string, text: string, cause?: string): Verdict =>
    ({ go: false, act, said: text, ev: ctx.log.write({ kind: "rung.refused", ...item, value: { act, why }, by, ...(cause ?? start?.id ? { cause: cause ?? start!.id } : {}), ...mode }) });
  const go = (rung: Rung, cause?: string): Verdict => {
    const step = run ? about(ctx, run, act, by) : undefined;
    const ev = ctx.log.write({ kind: "rung.did", ...item, value: { act, rung, source }, by, ...(cause ?? step?.id ?? start?.id ? { cause: cause ?? step?.id ?? start!.id } : {}), ...mode });
    return { go: true, act, ev, ...(step ? { step } : {}), ...(run ? { run } : {}) };
  };

  if (call.run && (!run || run.state !== "running")) return refuse("blocked", said.run);
  // keys that would pass for others on a card: refused before anything, never asked (a press could not see them right)
  if (keysBlur(call.input)) return refuse("keys", said.keys);
  const rung = neededRung(ctx, call, t?.id ?? null), at = rungOf(ctx, source);
  // a record-only Run (a replay is one) does nothing above read: its draft and do are written, never called
  const record = run?.mode === "record", replay = run?.replayOf !== undefined;
  // a stray call has no Run, so no Thing's or source's limit is its own: a press is what lets it go
  const ceilingNow = (): Rung => (call.stray ? "act" : ceilingAt(ctx, t ? ctx.items.get(t.id) ?? null : null, source));
  const limit = record ? lowest(ceilingNow(), "read") : ceilingNow();
  const press = call.stray === true || needsPress(call);
  if (rungAt(rung) > rungAt(limit) || (replay && press)) {
    // its true mode: a replay's, a record-only Run's, or none (live: a live Run, or no Run)
    const ev = ctx.log.write({ kind: "rung.would", ...item, value: { act, rung, at, source }, words: wordsOf(call, source), by, ...(start ? { cause: start.id } : {}), ...(replay ? { mode: "replay" as const } : record ? { mode: "record" as const } : {}) });
    return { go: false, act, said: replay ? said.replay : record && rungAt(rung) <= rungAt(ceilingNow()) ? said.record : said.over(nameOf(ctx, source), limit), ev };
  }
  if (!press) return go(rung);

  // always a press: a yes not yet used lets it go; else asked (or the open ask of this act again), then wait or refuse
  const yes = standingYes(ctx, act, t?.id);
  if (yes) return go(rung, yes.id);
  const asked = openAsk(ctx, act, t?.id) ?? ctx.log.write({ kind: "rung.asked", ...item, value: { act, rung }, words: wordsOf(call, source), sync: true, by, ...(start ? { cause: start.id } : {}), ...mode });
  if (askCard(ctx, asked)) ctx.pushToday();
  if (call.canWait === false) return call.there ? refuse("wait", said.wait, asked.id) : refuse("away", said.away, asked.id);
  if (call.signal?.aborted) return refuse("stopped", said.stopped, asked.id);
  return new Promise<Verdict>((done) => {
    const stop = () => { if (waiting(ctx).get(asked.id) !== answer) return; waiting(ctx).delete(asked.id); done(refuse("stopped", said.stopped, asked.id)); };
    const answer = (y: Pressed) => {
      call.signal?.removeEventListener("abort", stop);
      if (y === "unopened") return done(refuse("unopened", said.unopened, asked.id));
      if (!y) return done(refuse("no", said.no, asked.id));
      // a yes is still checked: the Run may have stopped, or the limit come down, while it waited
      if (call.run && getRun(ctx, call.run)?.state !== "running") return done(refuse("blocked", said.run, asked.id));
      const now = ceilingNow();
      done(rungAt(rung) > rungAt(now) ? refuse("over", said.over(nameOf(ctx, source), now), asked.id) : go(rung, asked.id));
    };
    waiting(ctx).set(asked.id, answer);
    call.signal?.addEventListener("abort", stop, { once: true });
  });
}
/** after an allowed call returned (well or not): the step's run.did, inside a Run */
export function finish(ctx: Ctx, v: Verdict): void {
  if (v.go && v.step && v.run) did(ctx, v.run, v.step, v.ev.by);
}

/** a Source door called through the ceiling (design §7.7: the last three doors go through it; read is checked too) */
export async function callSource(ctx: Ctx, door: PressDoor, op: Door, o: Omit<Call, "source" | "door" | "doorPress">): Promise<{ done: true; out: unknown } | { done: false; said: string }> {
  const f = door[op];
  if (!sourcesMsg(ctx, null).sources.some((s) => s.id === door.id) || typeof f !== "function") return { done: false, said: `refused: ${door.name} has no ${op} here` };
  // the door's own word on this act's press; one that does not answer a boolean, or throws, says nothing
  let doorPress: boolean | undefined;
  try { const p = door.presses?.(op, o.input); if (typeof p === "boolean") doorPress = p; } catch { /* unsaid: the table's */ }
  const v = await check(ctx, { ...o, source: door.id, door: op, ...(doorPress !== undefined ? { doorPress } : {}) });
  if (!v.go) return { done: false, said: v.said };
  try { return { done: true, out: await f.call(door, o.input) }; }
  finally { finish(ctx, v); }
}

// ── the press (home.answer on an ask's card, through hooks.ts: Home 4 hands on what is not its own) ───────────────
const press: AnswerHook = async (ctx, t, answer, more) => {
  const id = t.links.find((l) => l.startsWith("rung:"))?.slice(5);
  const asked = id ? ctx.log.all().find((e) => e.id === id && e.kind === "rung.asked") : undefined;
  if (!asked) return false;
  const evs = ctx.log.all();
  let act: HomeEv | undefined;
  for (let i = evs.length - 1; i >= 0 && !act; i--) if (evs[i].kind === "today.answer" && evs[i].item === t.id) act = evs[i];
  changeThing(ctx, t.id, { state: "done", waitsOn: "none" }, { ...(act ? { cause: act.id } : {}), by: YOU });
  if (answerOf(ctx, asked.id)) return true;   // one answer an ask
  const yes = t.card?.answers[0] === answer;
  // a yes on a card with a target too long to show whole counts only when the face says it showed the whole: without
  // it the press is refused (no answer written, so no yes stands) and the waiting call, if any, with it
  if (yes && more?.opened !== true && mustOpen(ctx, asked)) {
    const w = waiting(ctx).get(asked.id);
    if (w) { waiting(ctx).delete(asked.id); w("unopened"); }
    else ctx.log.write({ kind: "rung.refused", ...(asked.item ? { item: asked.item } : {}), value: { act: String(val(asked).act), why: "unopened" }, cause: asked.id, by: YOU, ...(asked.mode ? { mode: asked.mode } : {}) });
    return true;
  }
  ctx.log.write({ kind: "rung.answered", ...(asked.item ? { item: asked.item } : {}), value: { yes }, cause: asked.id, by: YOU, ...(asked.mode ? { mode: asked.mode } : {}) });
  const w = waiting(ctx).get(asked.id);
  if (w) { waiting(ctx).delete(asked.id); w(yes); }
  else if (!yes && !outcomeOf(ctx, asked.id)) ctx.log.write({ kind: "rung.refused", ...(asked.item ? { item: asked.item } : {}), value: { act: String(val(asked).act), why: "no" }, cause: asked.id, by: YOU });
  return true;
};

/** at start: every ask no one answered has its card again (the same id: never two) */
export function reAsk(ctx: Ctx): number {
  const { asks, answer, used } = asksOf(ctx);
  let n = 0;
  for (const e of asks) if (!answer.has(e.id) && !used.has(e.id) && askCard(ctx, e)) n++;
  return n;
}

// ── the wrappers: what index.ts, work/runs.ts and tools.ts put around a seat ─────────────────────────────────────
let latest: Ctx | null = null;
/** the live Home: the one started last, while the kernel is there */
let live: () => Ctx | null = () => (kernelNow() ? latest : null);
/** tests: the Home the wrappers look at; the answer puts the one before back */
export function useLive(f: () => Ctx | null): () => void { const was = live; live = f; return () => { live = was; }; }
/** the Home a wrapper checks in: none while the switch is off */
const homeNow = (): Ctx | null => (homeWhole() ? live() : null);

/** a verdict kept for one call (its session, its Run, its tool-use id), so the hook and canUseTool check it once: it
 *  serves one pass of each, and a third pass is checked again (a press is spent once) */
type Kept = { v: Verdict; session: string; run: string; useId: string; hook: boolean; guard: boolean };
const SEEN = new WeakMap<Ctx, Map<string, Kept>>();
const seen = (ctx: Ctx): Map<string, Kept> => { let m = SEEN.get(ctx); if (!m) { m = new Map(); SEEN.set(ctx, m); } return m; };
/** a check that threw: refused, with nothing written (what failed may be the log itself). Only a wrapper's answer */
const broke = (e: unknown): { go: false; said: string } => ({ go: false, said: `${said.broke}: ${e instanceof Error ? e.message : String(e)}` });
/** the Run a seat's call is in: its session's one open Run, null for an ordinary seat, "many" for a session an older
 *  engine bound to more than one (refused, nothing written: no Run is surely its own) */
function runFor(ctx: Ctx, session: string | undefined): Run | null | "many" {
  const rs = runsOfSession(ctx, session);
  return rs.length > 1 ? "many" : rs[0] ?? null;
}
/** a built-in tool's call checked once, whichever of the hook and canUseTool sees it first (by its session, its Run and
 *  its tool-use id). The input checked is the input that runs: when the other side checked this call on another input
 *  (the permission layer's updatedInput), it is refused (why "changed") and nothing is checked a second time */
async function gate(ctx: Ctx, run: Run, session: string, side: "hook" | "guard", tool: string, input: unknown, useId: string | undefined, o: Pick<Call, "canWait" | "there" | "signal">): Promise<Verdict> {
  const by: By = { person: "seat", agent: "claude" }, act = actOf({ tool, input });
  const key = useId ? JSON.stringify([session, run.id, useId]) : null;
  const had = key ? seen(ctx).get(key) : undefined;
  if (had && !had[side]) {
    had[side] = true;
    if (had.v.act === act) return had.v;
    const ev = ctx.log.write({ kind: "rung.refused", item: run.thing, value: { act, why: "changed" }, cause: had.v.ev.id, by, ...modeOf(run) });
    return { go: false, act, said: said.changed, ev };
  }
  const v = await check(ctx, { tool, input, run: run.id, by, ...o });
  if (key && useId) seen(ctx).set(key, { v, session, run: run.id, useId, hook: side === "hook", guard: side === "guard" });
  return v;
}

/** canUseTool with the ceiling after it: the inner check first, its no stays a no; its yes, inside a Home Run, is
 *  checked. Off, or in no Run, the inner check's own answer comes back as it is */
export function ceilingGuard(inner: CanUseTool, session: () => string | undefined): CanUseTool {
  return (name, input, o) => {
    if (!homeWhole()) return inner(name, input, o);
    return (async () => {
      const r = await inner(name, input, o);
      if (!r || r.behavior !== "allow" || toRunner(name)) return r;   // a no, or no answer, stays as it is
      const ctx = homeNow(), s = session(), run = ctx ? runFor(ctx, s) : null;
      if (!ctx || !run || !s) return r;
      if (run === "many") return { behavior: "deny" as const, message: said.many };
      // a check that throws (the disk full, say) is a no: inside a Run the guard fails closed
      const v = await gate(ctx, run, s, "guard", name, r.updatedInput ?? input, o.toolUseID, { canWait: true, signal: o.signal }).catch(broke);
      return v.go ? r : { behavior: "deny" as const, message: v.said };
    })();
  };
}

/** off: does an open Run hold this session? Read from the Run files. With no kernel (the frame off) there is no Home
 *  to check a call in, and the seat's next launch with it on decides again */
const boundOff = (session: string): boolean => { const k = kernelNow(); return !!k && inRunOnDisk(k.home, session); };

/** the hooks a Claude seat is given while Home is on: PreToolUse checks a call inside a Home Run before it runs (it
 *  sees the calls canUseTool is not asked about) and answers only "deny" or nothing; PostToolUse(Failure) writes the
 *  step's run.did. It cannot wait for a press (a hook has a time limit), so a press it needs is refused with a card.
 *  Off when the seat is launched, none: no round trip on each tool call, and the seat is never bound to a Run (#1266).
 *  The one exception: a session an open Run already holds keeps them, so Home turned on mid-turn finds it checked */
export function ceilingHooks(session: () => string | undefined, there: () => boolean = () => false): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const s0 = session();
  if (!homeWhole() && !(s0 && boundOff(s0))) return {};
  // the seat is launched with these hooks: its session may be bound to a Run (runs.ts guardedSeat). Known now (Work, a
  // resume), or when the SDK first names it (SessionStart, or any call: a new chat's id comes at its init). Each is
  // marked once by this seat, and let go when it ends (SessionEnd)
  const mine = new Set<string>();
  const mark = (s: string | undefined): void => { if (s && !mine.has(s)) { mine.add(s); guardedSeat(s); } };
  mark(s0);
  const start: HookCallback = async (i) => { mark(i.session_id); return {}; };
  const end: HookCallback = async () => { for (const s of mine) seatEnded(s); mine.clear(); return {}; };
  const pre: HookCallback = async (i) => {
    mark(i.session_id);
    if (i.hook_event_name !== "PreToolUse" || toRunner(i.tool_name)) return {};
    const ctx = homeNow(), s = i.session_id || session(), run = ctx ? runFor(ctx, s) : null;
    if (!ctx || !run || !s) return {};
    const deny = (why: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: why } });
    if (run === "many") return deny(said.many);
    const v = await gate(ctx, run, s, "hook", i.tool_name, i.tool_input, i.tool_use_id, { canWait: false, there: there() }).catch(broke);
    return v.go ? {} : deny(v.said);
  };
  const post: HookCallback = async (i) => {
    if (i.hook_event_name !== "PostToolUse" && i.hook_event_name !== "PostToolUseFailure") return {};
    const ctx = homeNow(), s = i.session_id || session();
    if (!ctx || !s) return {};
    for (const [key, k] of seen(ctx)) if (k.session === s && k.useId === i.tool_use_id) { seen(ctx).delete(key); finish(ctx, k.v); }
    return {};
  };
  return { SessionStart: [{ hooks: [start] }], SessionEnd: [{ hooks: [end] }], PreToolUse: [{ hooks: [pre] }], PostToolUse: [{ hooks: [post] }], PostToolUseFailure: [{ hooks: [post] }] };
}

/** runSolTool's door: a call of one of Sol's own tools inside a Home Run is checked; refused, the tool's code is never
 *  reached and the seat reads why. A call that names no session while a Run is open (a block's, runSolTool's default
 *  turn) is no Run's for sure, so it fails closed: it needs a press, and it cannot wait for one (a card waits in Today,
 *  and the yes stands for the same call once). Off, or with no Run open, or a session in no Run, the tool is run as it
 *  is (the same call, the same promise) */
export function guardSolTool(name: string, args: unknown, turn: TurnCtx, f: () => Promise<ToolResult>): Promise<ToolResult> {
  if (!homeWhole()) return f();
  const ctx = homeNow();
  if (!ctx) return f();
  const stray = !turn.sessionId && openRuns(ctx).length > 0, run = stray ? null : runFor(ctx, turn.sessionId);
  if (!stray && !run) return f();
  const refused = (text: string): ToolResult => ({ content: [{ type: "text" as const, text }], isError: true });
  if (run === "many") return Promise.resolve(refused(said.many));
  return (async () => {
    const by: By = { person: "seat", agent: turn.seat ?? "seat" };
    const v = await check(ctx, run ? { tool: name, input: args ?? null, run: run.id, by } : { tool: name, input: args ?? null, stray: true, canWait: false, by });
    if (!v.go) return refused(v.said);
    try { return await f(); } finally { finish(ctx, v); }
  })();
}

export const ceiling: Unit = {
  name: "ceiling",
  start(ctx) {
    latest = ctx;
    onOtherRung(press);
    reAsk(ctx);
    restartRuns(ctx);
  },
};
