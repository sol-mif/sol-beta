// Home's first screen (#791, plan Part C slice 28, home/whole.md "The list's rules", "A card"), behind sol.home.whole.
// The pure half: the shapes the engine sends (home/whole.md "The engine half": Thing, Today), the list's order, the one
// line in words, and the stack (one card in front, the others as edges). Nothing here draws; First.tsx does.
//
// Stubbed until the engine half lands (#790, slice 27, Frank's): the engine on main knows no `home.today`,
// `home.answer`, `home.later` or `home.undo`, so `stub()` below answers them in the face, shaped exactly as the engine
// will: a `home.today` message `{ type, today, things }` after every ask, and a `home.done` receipt after an answer or a
// later. Swapping it for the engine is the transport's one line in store.ts.

import { receiptLine, thingOf, type Filed, type Learned } from "./reads.ts";   // C29 (#792)

/** where a thing came from, the card's glyph and the first word of its meta row */
export type Source = "canvas" | "mail" | "calendar" | "files" | "people" | "github" | "sol";
/** a context chip under the why: a file mark, a person, or a slot of time (whole.md "A card") */
export type Chip = { kind: "file"; ext: string; label: string } | { kind: "person"; label: string } | { kind: "slot"; label: string };
/** one node of "this touches": what the thing is joined to, a title and one line under it */
export type Touch = { source: Source; title: string; note: string };
/** the thing (whole.md "The engine half"): one id for Home's card, the ribbon mark, Build's block and the folder rows.
 *  `card` is what Home's card shows of it, sent with it so the face computes nothing of the engine's. */
export type Thing = {
  id: string;
  read: "note" | "date" | "you" | "job" | "make";
  folder: string;                          // the crumb, "school › chem 110"
  words: string;                           // the sentence or the source line it came from
  state: "read" | "moving" | "asks" | "you" | "proposed" | "done";
  waitsOn: "you" | "agent" | "none";
  due?: number;                            // ms since the epoch
  at: number;                              // when it entered the list (its age)
  blocks?: boolean;                        // a running job waits on it
  links: string[];
  made: string[];
  card?: {
    source: Source;
    title: string;
    why: string;
    chips: Chip[];
    answers: [string, string];             // the warm one first, then the plain one
    touches: Touch[];                      // at most three
    edge: string;                          // the one line an edge shows behind the front card
  };
};
/** Today (whole.md "The engine half"): computed, never stored */
/** one mark on the ribbon (C30, #793; home/whole.md "The ribbon"): an event (a pearl capsule, `big` the nacre one), a
 *  proposal of Sol's (dashed until kept), a thing for you (a yellow ring), a deadline (a pin), a running job (a warm
 *  thread from `from` to its due point `at`). Times are ms since the epoch; `end` closes an event or a proposal. */
export type Mark = { id: string; kind: "event" | "big" | "proposal" | "kept" | "you" | "due" | "thread"; at: number; end?: number; from?: number; label: string; thingId?: string; yours?: boolean };
export type Today = { needs: string[]; moving: string[]; week: Mark[]; line: string };
export type TodayMsg = { type: "home.today"; today: Today; things: Thing[] };
/** a receipt for what the person just did, with the ledger id its undo names (home.undo {ledgerId}, slice 34) */
export type DoneMsg = { type: "home.done"; ledgerId: string; thingId: string; did: "answer" | "later" | "file"; answer?: string
  thingIds?: string[]; line?: string };   // C29: a filing's receipt names every thing it made, and its line

export type Ask =
  | { type: "home.today" }
  | { type: "home.answer"; thingId: string; answer: string }
  | { type: "home.later"; thingId: string }
  | { type: "home.undo"; ledgerId: string }
  | { type: "home.file"; parts: Filed[] }      // C29 (#792): Enter files each part as read
  | { type: "home.learn"; learned: Learned };  // C29: an override, a learned line

/** the list's order (whole.md "The list's rules"): the deadline nearest now, then whatever blocks a running job, then
 *  age (the oldest first); a thing moved by "later" goes to the back, in the order it was moved */
export function order(things: Thing[], later: string[] = []): string[] {
  const back = new Set(later);
  const needs = things.filter((t) => t.waitsOn === "you" && t.state !== "done" && !back.has(t.id));
  needs.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || Number(!!b.blocks) - Number(!!a.blocks) || a.at - b.at);
  const tail = later.map((id) => things.find((t) => t.id === id)).filter((t): t is Thing => !!t && t.waitsOn === "you" && t.state !== "done");
  return [...needs, ...tail].map((t) => t.id);
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);
/** the one line (whole.md "The list's rules"): the count in words, then what is moving. "Three things need you. Two are
 *  moving on their own." Two sentences, so the face can set the second dimmer. */
export function lineOf(needs: number, moving: number): [string, string] {
  const first = needs === 0 ? "Nothing needs you." : needs === 1 ? "One thing needs you." : `${word(needs)} things need you.`;
  const second = moving === 0 ? "" : moving === 1 ? "One is moving on its own." : `${word(moving)} are moving on their own.`;
  return [first, second];
}

/** the stack (whole.md, pick 1 a): the card in front and the others as edges behind it, in the list's order. `front` is
 *  the one the person brought forward by pressing its edge; gone from the list, the first in order stands in front. */
export function stackOf(needs: string[], front?: string | null): { front: string | null; edges: string[] } {
  const f = front && needs.includes(front) ? front : needs[0] ?? null;
  return { front: f, edges: needs.filter((id) => id !== f) };
}

/** the front, as the screen keeps it (#854 R1): the card brought forward by hand, and for each receipt the card that
 *  was in front when it was made, so its undo puts that card back in front, not just back in the list */
export type FrontState = { front: string | null; kept: Record<string, string | null> };
export const FRONT0: FrontState = { front: null, kept: {} };
/** an edge pressed: that card comes forward */
export const frontPress = (s: FrontState, id: string): FrontState => ({ ...s, front: id });
/** an answer or a later made a receipt: the front goes back to the list's order, and the card shown is kept with it */
export const frontActed = (s: FrontState, ledgerId: string, shown: string | null): FrontState => ({ front: null, kept: { ...s.kept, [ledgerId]: shown } });
/** that receipt undone: the card that was in front comes back in front */
export function frontUndone(s: FrontState, ledgerId: string): FrontState {
  const { [ledgerId]: was, ...kept } = s.kept;
  return { front: was ?? null, kept };
}

/** "when", the meta row's yellow word: a deadline as the person says it, else how long it has waited */
export function whenOf(t: Pick<Thing, "due" | "at">, now: number): string {
  const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (t.due !== undefined) {
    const d = new Date(t.due), n = new Date(now);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 864e5);
    if (t.due < now) return "overdue";
    if (days === 0) return d.getHours() >= 18 ? `due tonight ${hm(d)}` : `due today ${hm(d)}`;
    if (days === 1) return `due tomorrow ${hm(d)}`;
    return `due ${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()}`;
  }
  const m = Math.max(0, Math.round((now - t.at) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}

/** the receipt's words for what was just done */
export function receiptOf(d: DoneMsg, t?: Thing): string {
  if (d.line) return d.line;   // C29: a filing's own receipt line
  const what = t?.card?.title ?? t?.words ?? "that";
  if (d.did === "later") return `Moved to later: ${what}`;
  // #891: a title that ends in the question the answer answers ("… is ready. Send it?") drops it: never said twice
  const q = d.answer ? `${d.answer}?`.toLowerCase() : "";
  const said = q && what.toLowerCase().endsWith(q) ? what.slice(0, -q.length).trimEnd() : what;
  return `${d.answer ?? "Answered"}: ${said}`;
}

// ── the stub (until #790): the engine's half, answered in the face ──────────────────────────────────────────────────
/** the three things that wait and the two that move, as the design's first scene has them (home/whole.html scene 1) */
export function seed(now: number): Thing[] {
  const day = new Date(now), at = (h: number, m = 0, plus = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + plus, h, m).getTime();
  const base = { links: [], made: [] };
  return [
    { ...base, id: "t-chem-set6", read: "you", folder: "school › chem 110", words: "chem 110 set 6", state: "you", waitsOn: "you", due: at(23, 59), at: now - 5 * 36e5,
      card: { source: "canvas", title: "Chem 110 set 6 is due tonight. Two of eight left.", why: "Problems 7 and 8 are on equilibrium; your notes from lecture 9 cover both. Your evening is free from 19:00.",
        chips: [{ kind: "slot", label: "set 6 · 6 of 8 in" }, { kind: "file", ext: "pdf", label: "lecture 9 notes" }, { kind: "slot", label: "free 19:00–21:00" }],
        answers: ["hold 19–21 for it", "I’ll do it now"],
        touches: [{ source: "canvas", title: "Canvas", note: "set 6 · problems 7, 8" }, { source: "calendar", title: "your calendar", note: "free tonight 19:00–21:00" }, { source: "files", title: "chem 110", note: "lecture 9 notes, your words" }],
        edge: "set 6 due tonight · two of eight left" } },
    { ...base, id: "t-maya-data", read: "you", folder: "work › stats group", words: "Maya asked twice for your data section", state: "asks", waitsOn: "you", at: now - 26 * 36e5, blocks: true,
      card: { source: "mail", title: "Maya asked twice for your data section.", why: "The stats group report is drafted around it; the job that writes the summary waits on your table.",
        chips: [{ kind: "person", label: "Maya" }, { kind: "file", ext: "xlsx", label: "survey data" }, { kind: "slot", label: "group Wed 11" }],
        answers: ["draft it from my sheet", "I’ll send it"],
        touches: [{ source: "mail", title: "Mail", note: "two asks from Maya, since yesterday" }, { source: "files", title: "stats group", note: "the report, drafted" }, { source: "people", title: "Maya", note: "stats 140, the group" }],
        edge: "Maya asked twice for your data section" } },
    { ...base, id: "t-shopify-app", read: "job", folder: "jobs › applications", words: "Shopify application", state: "proposed", waitsOn: "you", at: now - 3 * 36e5,
      card: { source: "sol", title: "Your Shopify application is ready. Send it?", why: "Sol filled it from your CV and the cover letter you kept; the posting closes Saturday.",
        chips: [{ kind: "file", ext: "docx", label: "cover letter" }, { kind: "file", ext: "pdf", label: "CV" }, { kind: "slot", label: "closes Sat 14" }],
        answers: ["send it", "let me read it"],
        touches: [{ source: "sol", title: "the application", note: "filled by Sol, not sent" }, { source: "files", title: "jobs", note: "CV and the cover letter" }],
        edge: "Shopify application · send it?" } },
    { ...base, id: "t-lab-prep", read: "job", folder: "school › chem 110", words: "lab prep", state: "moving", waitsOn: "agent", due: at(12, 0, 1), at: now - 36e5 },   // C30: its thread runs from now to tomorrow noon
    { ...base, id: "t-bio-notes", read: "job", folder: "school › bio 201", words: "notes from lecture 9", state: "moving", waitsOn: "agent", due: now + 3 * 36e5, at: now - 2 * 36e5 },   // C30: due in three hours
  ];
}

/** the engine's answers, in the face: every ask gets a `home.today` back, an answer or a later a `home.done` first */
export function stub(now: () => number = Date.now) {
  let things = seed(now());
  let later: string[] = [];
  const learned: Learned[] = [];   // C29
  const kept = new Map<string, { things: Thing[]; later: string[] }>();
  let n = 0;
  const today = (): TodayMsg => {
    const needs = order(things, later), moving = things.filter((t) => t.state === "moving").map((t) => t.id);
    return { type: "home.today", today: { needs, moving, week: weekOf(things, now()), line: lineOf(needs.length, moving.length).filter(Boolean).join(" ") }, things };
  };
  return (ask: Ask): (TodayMsg | DoneMsg)[] => {
    if (ask.type === "home.today") return [today()];
    // C29 (#792): a learned line is kept (the engine's; the stub keeps nothing it shows), and the list is as it was
    if (ask.type === "home.learn") { learned.push(ask.learned); return [today()]; }
    // C29: Enter files each part: the things they become join the list (or the week), one receipt, one undo for all
    if (ask.type === "home.file") {
      const ledgerId = `l${++n}`, t0 = now();
      kept.set(ledgerId, { things, later });
      const made = ask.parts.map((f, i) => thingOf(f, `t-f${n}-${i}`, t0)).filter((x): x is Thing => !!x);
      things = [...things, ...made];
      const ids = made.map((x) => x.id);
      return [{ type: "home.done", ledgerId, thingId: ids[0] ?? "", thingIds: ids, did: "file", line: `↳ ${receiptLine(ask.parts, t0)}` }, today()];
    }
    if (ask.type === "home.undo") {
      const was = kept.get(ask.ledgerId);
      if (was) { things = was.things; later = was.later; kept.delete(ask.ledgerId); }
      return [today()];
    }
    const t = things.find((x) => x.id === ask.thingId);
    if (!t || t.waitsOn !== "you") return [today()];
    const ledgerId = `l${++n}`;
    kept.set(ledgerId, { things, later });
    if (ask.type === "home.later") {
      later = [...later.filter((id) => id !== t.id), t.id];
      return [{ type: "home.done", ledgerId, thingId: t.id, did: "later" }, today()];
    }
    // answered: it leaves the list; the warm answer of a thing for you sets a job going on it (whole.md "The thing's life")
    // C31 (#794): a question from a job (state "asks") answered, either way, lets that job go on at once
    const warm = ask.answer === t.card?.answers[0], goes = t.state === "asks" || (warm && t.read !== "you");
    things = things.map((x) => (x.id !== t.id ? x : { ...x, state: goes ? "moving" : "done", waitsOn: goes ? "agent" : "none" }));
    return [{ type: "home.done", ledgerId, thingId: t.id, did: "answer", answer: ask.answer }, today()];
  };
}

// ── the week (C30, #793): what the engine will send as Today.week, stubbed here until #790 ─────────────────────────────
/** the week's marks: the calendar's (events, Sol's proposals, things for you on their day) as the design's first scene
 *  has them, plus what the list knows: a pin for each thing for you with a deadline, a thread for each running job with
 *  a due point. Computed from the things, as the engine computes it, so an answer that sets a job going adds its thread. */
export function weekOf(things: Thing[], now: number): Mark[] {
  const day = new Date(now), at = (plus: number, h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + plus, h, m).getTime();
  // C29 (#867 F1): the calendar sits on its weekdays (the scenes' week, from a Monday), so "Thursday" in a sentence and
  // Thursday on the ribbon are one day whatever today is; a day already past this week is next week's, off the ribbon
  const on = (dow: number, h: number, m = 0) => at((dow - day.getDay() + 7) % 7, h, m);
  const cal: Mark[] = [
    { id: "w-bio-lecture", kind: "event", at: on(1, 10), end: on(1, 11, 30), label: "bio 201 lecture" },
    { id: "w-chem-lab", kind: "event", at: on(2, 14), end: on(2, 17), label: "chem lab" },
    { id: "w-stats-group", kind: "event", at: on(3, 16), end: on(3, 17, 30), label: "stats group" },
    { id: "w-study", kind: "proposal", at: on(3, 19), end: on(3, 21), label: "study block?" },
    { id: "w-bio-exam", kind: "big", at: on(4, 10), end: on(4, 12), label: "bio exam" },
    { id: "w-dentist", kind: "you", at: on(5, 9), label: "book the dentist", yours: true },   // C29: "call Sam" is now the Try's own sentence (#792), filed
    { id: "w-shopify", kind: "due", at: on(6, 17), label: "Shopify closes" },
    { id: "w-grandma", kind: "event", at: on(0, 11), end: on(0, 12), label: "call grandma" },
  ];
  const live = things.flatMap((t): Mark[] => {
    if (t.due === undefined) return [];
    // C29 (#792): a thing for you before its day is a yellow ring on it; a date filed from a sentence is an event
    if (t.read === "you" && t.state === "you" && t.waitsOn === "none") return [{ id: `w-${t.id}`, kind: "you", at: t.due, label: t.words, thingId: t.id, yours: true }];
    if (t.read === "date" && t.state === "read") return [{ id: `w-${t.id}`, kind: "event", at: t.due, end: t.due + 36e5, label: t.words, thingId: t.id }];
    if (t.state === "moving") return [{ id: `w-${t.id}`, kind: "thread", from: t.at, at: t.due, label: t.words, thingId: t.id }];
    if (t.waitsOn === "you") return [{ id: `w-${t.id}`, kind: "due", at: t.due, label: t.words, thingId: t.id, yours: true }];
    return [];
  });
  return [...cal, ...live].sort((a, b) => a.at - b.at);
}
