// Build becomes yours (#1089, behind `build.yours`): the face's half, pure. The switch (Build's own, a row in Build
// settings › switches), the engine's shapes as the face reads them, and the rules the line and the sheet follow:
// which page in the window may fill the box, how the box is filled (the person sends), the line's words, the list's.
import { buildSwitch, type SwitchEnv } from "../flag.ts";

export const BUILD_YOURS = "build.yours";
export const makeYoursSwitch = (env?: SwitchEnv) => buildSwitch(BUILD_YOURS, env);

export type Blank = { name: string; values: string[] };
export type Offer = { id: string; kind: "ask" | "checkin" | "correction" | "arrangement" | "closed"; count: number; sessions: number; first: number; last: number;
  words: string; examples: string[]; blanks: Blank[]; template: string; sentence: string; folder: string; target?: { title: string; kind?: string; side?: string } };
/** a field; `unnamed`: its kind is not known (no word is better than a wrong one), so it shows its value alone */
/** `next`: a counter (its values only ever counted up, #1042 … #1048): `value` is the NEXT one (#1049); it is never
 *  a row each and never dropped by a press (the engine's rule on this machine; nothing of it is Jev's) */
export type Field = { name: string; value: string; values: string[]; unnamed?: boolean; next?: boolean };
export type Spec = { shape: "button" | "rows" | "brief" | "rule" | "pin" | "layout" | "hide" | "checkin"; title: string; fields: Field[]; template: string; size: "s" | "m" | "l"; accent: "pearl" | "plain"; said: string[];
  /** a look: where a new session of the project opens its talk */
  lay?: { dock: "left" | "right" | "bottom" | "full"; width?: number } };
export type Kept = {
  /** its piece file was changed by hand: Build left it ("your file stays") */
  stays?: boolean; id: string; offer: string; project: string; sessionId: string; title: string; shape: Spec["shape"]; spec: Spec; at: number; ceiling: "look";
  from: { kind: Offer["kind"]; count: number; sessions: number; first: number; last: number; example: string; sentence: string }; undone?: number; before?: Spec;
  /** its piece in the project folder (part 3), with the folder's pieces on: the line says "in the folder" */
  piece?: string };

/** what each version is, in two words under it: the shape, plainly */
export const SHAPE_WORDS: Record<Spec["shape"], string> = {
  button: "fields, one press", rows: "a row each", brief: "the whole ask", rule: "on the stage, one press",
  checkin: "on the stage, one press", layout: "where it stands", hide: "kept closed", pin: "stands by the box",
};

/** the line above the box: the offer's own sentence, its question cut off (the press says it) (pure) */
export function lineOf(o: Pick<Offer, "sentence">): { said: string; ask: string } {
  const m = /^(.*?)([^.?!]*\?)\s*$/.exec(o.sentence.trim());
  return m ? { said: m[1].trim(), ask: m[2].trim() } : { said: o.sentence.trim(), ask: "Keep it?" };
}

/** a page's message that may fill the box: only `yours.fill` with words, from a frame inside the stage or the sheet (pure) */
export function fillFrom(data: unknown, fromFrameIn: boolean): string | null {
  const d = data as { sol?: unknown; text?: unknown } | null;
  if (!fromFrameIn || !d || d.sol !== "yours.fill" || typeof d.text !== "string") return null;
  const t = d.text.trim();
  return t ? t.slice(0, 8000) : null;
}

/** the most lines a filled box shows; the rest is reached by scrolling, from its first line */
export const FILL_LINES = 6;
/** put words in the box the way typing does, so the box's own state follows; the person sends (never this). A long
 *  fill never floods: the box holds at most six lines, scrolled to its first line (the words that say what it is),
 *  the caret at the end; it goes back to its own rule at the Sol user's next key */
export function fillBox(box: HTMLTextAreaElement | null, text: string): boolean {
  if (!box) return false;
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value")?.set;
  if (set) set.call(box, text); else box.value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  // held to six lines by a mark the stylesheet reads (yours.css), in every dock; off at their next key
  box.dataset.yoursFill = "";
  const top = () => { for (const ms of [0, 60, 200]) setTimeout(() => { box.scrollTop = 0; }, ms); };
  const free = (e: Event) => { if (!e.isTrusted) return; delete box.dataset.yoursFill; box.removeEventListener("keydown", free); box.removeEventListener("focus", top); };
  box.addEventListener("keydown", free);
  box.addEventListener("focus", top);
  box.focus({ preventScroll: true });
  try { box.setSelectionRange(text.length, text.length); } catch { /* a box that holds no selection */ }
  // the composer sizes itself on input and scrolls to the caret; the first line is shown once it has settled
  box.scrollTop = 0;
  if (typeof setTimeout === "function") for (const ms of [0, 60, 160, 320, 600]) setTimeout(() => { box.scrollTop = 0; }, ms);
  return true;
}

/** when a kept thing came from, as the list says it (pure) */
export function sinceOf(at: number, now = Date.now()): string {
  const d = Math.round((now - at) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** the presses a version offers under it: only what would change THIS one (pure; the engine's `adjust` reads each) */
/** a blank is a choice when it has two or more values that are not bare numbers, and is no counter (pure) */
export const isChoice = (f: Spec["fields"][number]) => !f.next && f.values.length >= 2 && !f.values.every((v) => /^\d+([.,]\d+)?$/.test(v.trim()));
/** `once`: an ask sent once ("you asked"): nothing to drop yet, it is all theirs */
export const pushesOf = (s: Spec, once = false): string[] => s.shape === "pin" ? [] : [
  ...(s.size !== "s" ? ["smaller"] : ["bigger"]), ...(s.accent === "pearl" ? ["plain"] : ["pearl"]),
  // "a row each" only for a choice (the designer, NOW 05:35 2)
  ...(s.shape === "button" && s.fields.some(isChoice) ? ["a row each"] : s.shape === "rows" ? ["one button"] : []),
  // a counter is never dropped (the tool would send the same number twice); the row's own blank neither
  ...(!once && (s.shape === "button" || s.shape === "rows") ? s.fields.filter((x) => !x.next).slice(1).map((x) => `without ${x.unnamed ? x.value : x.name}`) : []),
];

/** how many kept chips the shelf shows before "+n": three beside a docked talk, five full width (pure) */
export const shelfRoom = (width: number) => (width >= 600 ? 5 : 3);

// a send heard once (the morning round of 2026-11-13: a new session's first ask, its turn failed with a 401, never came
// back as a line, so the line under the stage never asked and the ask was not in Build settings › yours). The box tells
// the engine at the send; the line, when the sent line comes back, takes that same ask instead of asking again.
/** a line nobody typed (a stop's "[Request interrupted…]", a wrapper) is not a send */
export const typedLine = (text: string) => !!text.trim() && !/^\s*(\[Request interrupted|<)/.test(text);
const sentAs = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 400);   // as the engine's sentKey reads it
export const HEARD_MS = 10 * 60_000;
/** which kept tool filled the box last, in which session; `sent` once the one send after it went */
export type Fill = { id: string; at: number; session: string; sent?: boolean };
export const FILL_FRESH_MS = 30 * 60_000;   // the tool learns from what is sent after its fill, within this
/** the send-time decision (Composer's send, #1131), pure: whether this send is a kept tool's fill (its own path tells it
 *  when its line comes back), the fill that stays, and what the engine is told. A fill is for the one send after it: a
 *  fill whose turn failed never came back, so a later send in that session is typed. `cwd`: the folder the session opens
 *  in (a new session's run is still opening when the ask arrives). `standing`: an offer already stands on the line, so
 *  the send is kept as a record only and no other offer is marked shown unseen */
export function atSend(a: { session: string; text: string; cwd?: string; standing: boolean }, fill: Fill | null, now = Date.now()) {
  const mine = fill && fill.session === a.session && now - fill.at < FILL_FRESH_MS ? fill : null;
  const filled = !!mine && !mine.sent;
  const next = !mine ? (fill && fill.session === a.session ? null : fill) : filled ? { ...mine, sent: true } : null;
  const said = { sessionId: a.session, said: a.text, ...(a.cwd?.startsWith("/") ? { cwd: a.cwd } : {}), ...(a.standing ? { record: true } : {}) };
  return { filled, fill: next, said };
}   // a send whose line never came back is forgotten after this
/** the sends told at the box, waiting for their line: `hear` says whether this send is told (once per send, with the
 *  switch on, typed, not a kept tool's fill, which its own path tells); `take` gives a send's ask to its line, once */
export function makeHeard<T>() {
  let held: { session: string; key: string; at: number; ask: T }[] = [];
  const fresh = (now: number) => { held = held.filter((h) => now - h.at < HEARD_MS); };
  return {
    hear(a: { on: boolean; session: string; text: string; filled: boolean }, ask: () => T, now = Date.now()): T | null {
      if (!a.on || !a.session || a.filled || !typedLine(a.text)) return null;
      fresh(now);
      const h = { session: a.session, key: sentAs(a.text), at: now, ask: ask() };
      held.push(h);
      return h.ask;
    },
    take(session: string, text: string, now = Date.now()): T | null {
      fresh(now);
      const i = held.findIndex((h) => h.session === session && h.key === sentAs(text));
      return i < 0 ? null : held.splice(i, 1)[0].ask;
    },
  };
}
