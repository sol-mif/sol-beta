// The generator takes a sentence (#1245, second run): `say(sentence)` turns what an agent says in plain words ("a run
// laying out the spreads, three steps, the second one now, 6 of 10") into a spec of kit pieces (spec.ts PIECES), with no
// model call: a rule-based composer over the kit's own vocabulary. The sentence is cut into clauses (at commas, colons,
// "with"); the first names the thing (a run, files, a question, a count, a handover, a thread, sessions, a decision, a
// stamp, a card, a note) and is the block's title; each other clause adds to it (a number of steps, lines, files or
// sessions; "the second one now"; "6 of 10"; "one active"; "a decision to …"; "a done stamp at 9:04"; "decided at
// 8:41"; "yours now"; "big"; a file kind). What it makes goes through the lint (lint.ts), so it is always the one
// system; a sentence it cannot place gives a note card with the sentence in it and a note, never a throw.
// Plain TypeScript, no React: say.test.ts runs it under node.
import { lint } from "./lint.ts";
import { KINDS, type Spec } from "./spec.ts";

export type Said = { spec: Spec; notes: string[] };

/** the words for a thing, each to the kind of block it is (the README's table) */
export const VOCABULARY = {
  run: ["run", "job", "task"],
  files: ["files", "file", "covers", "images", "image", "photos", "photo", "pictures"],
  question: ["question", "ask"],
  count: ["count", "number", "tally"],
  handover: ["handover", "hand-over"],
  thread: ["thread", "chat", "conversation"],
  sessions: ["sessions", "session"],
  decision: ["decision"],
  stamp: ["stamp", "sticker"],
  card: ["card", "block"],
  note: ["note"],
} as const;
export type Thing = keyof typeof VOCABULARY;

const NUMBERS: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1,
};
const WORD_OF = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** the most of one thing a sentence may ask for: a block holds a few, never a wall (rule 38's calm) */
const MOST = 8;
const numberOf = (w: string): number | null => (/^\d+$/.test(w) ? +w : w.toLowerCase() in NUMBERS ? NUMBERS[w.toLowerCase()] : null);
const article = (s: string) => s.replace(/^(a|an)\s+/i, "");

/** the thing a clause names, and the words around its noun */
function thingOf(clause: string): { thing: Thing; before: string; after: string } | null {
  const words = clause.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    for (const [thing, nouns] of Object.entries(VOCABULARY) as [Thing, readonly string[]][]) {
      if ((nouns as readonly string[]).includes(words[i].toLowerCase())) return { thing, before: words.slice(0, i).join(" "), after: words.slice(i + 1).join(" ") };
    }
  }
  return null;
}

/** what the clauses after the first said, gathered */
type Bits = {
  steps?: number; now?: number; of?: [number, number]; lines?: number; files?: number; sessions?: number; active?: number;
  kind?: string; done?: string; decided?: string; decision?: string; yours?: boolean; big?: boolean; count?: number; words: string[];
  /** what the steps or the sessions are called ("two steps called the front and the back"), so a block never says "step one" */
  stepNames?: string[]; sessionNames?: string[];
};
/** "the front and the back", "the front / the back": the names a clause gives, in order */
const namesOf = (c: string) => c.split(/\s+and\s+|\s*\/\s*/).map((w) => w.trim()).filter(Boolean);
function gather(clauses: string[], bits: Bits, notes: string[]) {
  for (const c of clauses) {
    const l = c.toLowerCase();
    let m: RegExpExecArray | null;
    if ((m = /^(\d+|\w+) (steps?|sessions?) (?:called|named) (.+)$/.exec(l)) && numberOf(m[1]) != null) {
      const names = namesOf(c.slice(c.length - m[3].length));
      if (m[2].startsWith("step")) { bits.steps = numberOf(m[1])!; bits.stepNames = names; } else { bits.sessions = numberOf(m[1])!; bits.sessionNames = names; }
    } else if ((m = /^(\d+|\w+) (?:steps?)$/.exec(l)) && numberOf(m[1]) != null) bits.steps = numberOf(m[1])!;
    else if ((m = /^(\d+|\w+) lines?$/.exec(l)) && numberOf(m[1]) != null) bits.lines = numberOf(m[1])!;
    else if ((m = /^(\d+|\w+) (?:files?|images?|photos?)$/.exec(l)) && numberOf(m[1]) != null) bits.files = numberOf(m[1])!;
    else if ((m = /^(\d+|\w+) sessions?$/.exec(l)) && numberOf(m[1]) != null) bits.sessions = numberOf(m[1])!;
    else if ((m = /^(?:the )?(\w+)(?: one| step)? (?:is )?now$/.exec(l)) && m[1] in ORDINALS) bits.now = ORDINALS[m[1]];
    else if ((m = /^(\d+) (?:of|out of) (\d+)$/.exec(l))) bits.of = [+m[1], +m[2]];
    else if ((m = /^(\w+) active$/.exec(l)) && (numberOf(m[1]) != null || m[1] in ORDINALS)) bits.active = m[1] in ORDINALS ? ORDINALS[m[1]] : 1;
    else if ((m = /^(?:a |the )?(?:done )?(?:stamp|sticker)(?: done)?(?: at (.+))?$/.exec(l))) bits.done = m[1] ?? "";
    else if ((m = /^(?:done|landed|drawn|finished) at (.+)$/.exec(l))) bits.done = m[1];
    else if ((m = /^decided(?: at (.+))?$/.exec(l))) bits.decided = m[1] ?? "";
    else if ((m = /^(?:a |the )?decision(?: to| on)? (.+)$/.exec(l))) bits.decision = c.slice(c.length - m[1].length);
    else if (/^(?:yours|your call)(?: now)?$/.test(l)) bits.yours = true;
    else if (/^(?:big|large|huge)$/.test(l)) bits.big = true;
    else if (KINDS.includes(l.replace(/^\./, "").replace(/s$/, ""))) bits.kind = l.replace(/^\./, "").replace(/s$/, "");
    else if ((m = /^(\d+)$/.exec(l))) bits.count = +m[1];
    else if (c) bits.words.push(c);
  }
  if ((bits.steps ?? 0) > MOST || (bits.lines ?? 0) > MOST || (bits.files ?? 0) > MOST || (bits.sessions ?? 0) > MOST) {
    notes.push(`more than ${MOST} of one thing: ${MOST} drawn, a block holds a few`);
  }
}
const few = (n: number | undefined) => Math.max(0, Math.min(MOST, n ?? 0));
const nth = (i: number) => (i < WORD_OF.length ? WORD_OF[i] : String(i));

/** the stamp a block wears when it is done or decided: the done sticker at its corner (rule 17, a meaning on a sticker) */
const stamp = (word: string, at: string): Spec => ({ piece: "Sticker", props: { words: at ? `${word} ${at}` : word, role: "done", at: "corner" } });
/** a decision, or a question, left to the person: the ask coin and its words in a row (rule 17) */
const askRow = (words: string): Spec => ({ piece: "Stack", props: { direction: "row", gap: 12, align: "center" }, children: [
  { piece: "Coin", props: { role: "ask", d: 22 } },
  { piece: "Text", props: { words } },
] });

/** the sentence, said as a spec, and the notes of what it could not place or the lint changed */
export function sayOut(sentence: unknown): Said {
  const notes: string[] = [];
  const raw = typeof sentence === "string" ? sentence.trim() : "";
  const s = raw.replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  const clauses = s.split(/\s*(?:[,;]|:(?!\d))\s*|\s+with\s+/).map((c) => c.trim().replace(/^with /, "")).filter(Boolean);
  const head = clauses[0] ? thingOf(clauses[0]) : null;
  if (!head) {
    notes.push(raw ? `"${raw.length > 40 ? `${raw.slice(0, 39)}…` : raw}" names nothing the kit draws: a note card with the sentence in it` : "nothing was said: an empty note card");
    const r = lint({ piece: "Block", props: { title: "a note" }, children: raw ? [{ piece: "Text", props: { words: raw.slice(0, 240) } }] : [] });
    return { spec: r.spec, notes: [...notes, ...r.notes] };
  }
  const bits: Bits = { words: [] };
  gather(clauses.slice(1), bits, notes);
  const { thing } = head;
  const before = article(head.before).trim(), after = head.after.trim();
  // a number before the noun is how many ("two files", "two sessions")
  const counted = before && numberOf(before.split(" ")[0]) != null ? numberOf(before.split(" ")[0])! : undefined;
  const lead = counted != null ? before.split(" ").slice(1).join(" ") : before;
  const from = after.replace(/^(?:from|of|for|on|about) /i, "");
  const children: Spec[] = [];
  let title = clauses[0].replace(/^(a|an) /i, "");
  let state: string | undefined;

  if (thing === "run") {
    // a run: the work it does is its title; its meter, then its steps (the one now in pearl, rule 14); working until done
    title = after || "the run";
    if (bits.of) children.push({ piece: "Meter", props: { label: `${bits.of[0]} of ${bits.of[1]}`, value: bits.of[1] ? Math.min(1, bits.of[0] / bits.of[1]) : 0 } });
    const n = few(bits.steps), now = bits.now === -1 ? n : bits.now;
    // a done run's steps say done, as a built run's do (build.tsx's Step); a step left unnamed is its number
    for (let i = 1; i <= n; i++) children.push({ piece: "Row", props: { title: bits.stepNames?.[i - 1] ?? `step ${nth(i)}`,
      ...(i === now ? { aside: "now", picked: true } : bits.done != null ? { aside: "done" } : {}) } });
    // done, the stamp says it alone (rule 17: a meaning said once); else it works, the one thing moving (rule 20)
    state = bits.done != null ? undefined : "working";
  } else if (thing === "files") {
    title = from || lead || "the files";
    const n = few(counted ?? bits.files ?? 1), kind = bits.kind ?? "png";
    const tiles: Spec[] = Array.from({ length: n }, (_, i) => ({ piece: "FileTile", props: { kind, name: `${title.replace(/^the /, "")} ${i + 1}.${kind}` } }));
    children.push(tiles.length > 1 ? { piece: "Stack", props: { direction: "row", gap: 12 }, children: tiles } : tiles[0]);
  } else if (thing === "question" || thing === "decision") {
    // a question for the person: the block waits, the question on an ask coin (rule 17), "yours now" its words' end
    const q = thing === "decision" ? (after.replace(/^(?:to|on) /i, "") || bits.words.shift() || "") : (bits.words.shift() || after || "");
    title = thing === "decision" ? "a decision" : "a question";
    if (q) children.push(askRow(bits.yours ? `${q}: yours now` : q));
    state = bits.decided != null ? "done" : "waiting";
  } else if (thing === "count") {
    // a count: big is the display cut (rule 23's number); no number said, the ping draws what came
    title = from || "the count";
    if (bits.count != null) children.push(bits.big ? { piece: "Text", props: { words: String(bits.count), role: "number" } } : { piece: "Num", props: { value: String(bits.count) } });
    else children.push({ piece: "Ping", props: {}, state: bits.big ? "fanned" : "three" });
  } else if (thing === "handover") {
    // "a handover of the order from the café": what is handed over is the title, who from its caption
    const m = /^(?:of (.+?))?\s*(?:from (.+))?$/i.exec(after) ?? [];
    const what = m[1], who = m[2] ?? (m[1] ? undefined : from || undefined);
    title = what ?? (who ? `a handover from ${who}` : "a handover");
    if (who) children.push({ piece: "Text", props: { words: what ? `handed over by ${who}` : `handed over from ${who}`, role: "caption" } });
  } else if (thing === "thread") {
    title = clauses[0].replace(/^(a|an) /i, "");
    const n = few(bits.lines);
    if (n) children.push({ piece: "List", props: { count: String(n) }, children: Array.from({ length: n }, (_, i) => ({ piece: "Row", props: { title: `line ${nth(i + 1)}` } })) });
  } else if (thing === "sessions") {
    title = from || lead || "the sessions";
    bits.sessions ??= counted ?? 1;
  } else if (thing === "stamp") {
    title = from || "a stamp";
    bits.done ??= "";
  } else {
    title = from || lead || (thing === "note" ? "a note" : "a card");
  }

  // what any thing may also hold: sessions (one active, pearl), a decision, words, the stamp
  if (bits.sessions && thing !== "files") {
    const n = few(bits.sessions);
    for (let i = 1; i <= n; i++) children.push({ piece: "SessionRow", props: { title: bits.sessionNames?.[i - 1] ?? `session ${nth(i)}` }, state: i === bits.active ? "active" : "rest" });
  }
  if (bits.decision && thing !== "decision") children.push(askRow(bits.yours ? `${bits.decision}: yours now` : bits.decision));
  for (const w of bits.words) children.push({ piece: "Text", props: { words: w } });
  if (bits.done != null) children.push(stamp("done", bits.done));
  if (bits.decided != null) children.push(stamp("decided", bits.decided));
  if (!state && bits.yours && !bits.decision) state = "waiting";

  const spec: Spec = { piece: "Block", props: { title: title.slice(0, 48) }, ...(state ? { state } : {}), children };
  const r = lint(spec);
  return { spec: r.spec, notes: [...notes, ...r.notes] };
}

/** the sentence, said as a spec of kit pieces; never throws */
export const say = (sentence: unknown): Spec => sayOut(sentence).spec;
