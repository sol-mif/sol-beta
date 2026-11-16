// The bar's half of the stage (#698, sitting 4): asking for many things at once, and point and say. Ported from the
// prototype (mine/look/stage/play.html, its `parse`, `preview`, the chips' `slot`, `said`), pure so the face's tests
// reach it (src/stage-bar.test.ts). The words split into parts as you type (";", a new line, ", and", "and" before a new
// thing, a comma); each part gets a kind by its first words and a title; a chip dropped on the stage, or the words ("on
// the left", "beside the week", "full"), give it a slot. The chips are hints for the agent's compose calls, never a hard
// split: the engine hands them on under the words (sol/engine/src/work/blocks.ts askLine).
import { GAP, PAD, bornSize, zoneRect, type Kind, type Place, type Rect, type Size } from "./model.ts";

/** a named slot (the engine's), or the spot a chip was dropped on */
export type Slot = "full" | "left" | "right" | "top" | "bottom" | Rect;
/** one chip: a part of the ask */
export type Thing = { kind: Kind; title: string; url?: string; slot: Slot | null; beside?: string; dropped?: boolean };
/** what the person points at: a block, or a part of it (any element with data-part) */
export type Target = { id: string; part?: string };

const VERBS = /^(please\s+)?(show( me)?|open|put|give me|make|draw|get|run|and|also|then)\s+/i;
const SPLIT = /\s*(?:;|,\s*and\s+|\band\s+(?=(?:a |an |the |my |me |show|open|run|stills|localhost|\w+ of))|,\s+)\s*/i;
// an ask for things starts with an asking verb or names a kind outright ("stills of", "a diff of"); #735: an ordinary
// message with commas or paragraphs is one message, never chips
const ASK = /^(please\s+)?(show( me)?|open|put|give me|make|draw|get|run|stills?\s+of|screenshots?\s+of|an?\s+(diff|table|list|page|card)\s+of)\b/i;
// a part that reads as a sentence is not a thing: a verb of being, a reason, a question, a full stop, or too many words
const SENTENCE = /[.?!](\s|$)|\b(is|are|was|were|isn't|aren't|should|would|could|think|because|but|when|why|how)\b/i;
const WORDS_MAX = 8;

/** is this message an ask for things (chips), not a message with commas in it (#735)? One line, it starts with an
 *  asking verb, and every part is a short noun phrase */
export function isAsk(text: string): boolean {
  const s = text.trim();
  if (!s || /\n/.test(s) || s.length > 200 || !ASK.test(s)) return false;
  return s.split(SPLIT).map((p) => p.trim()).filter(Boolean).every((p) => p.split(/\s+/).length <= WORDS_MAX && !SENTENCE.test(p));
}

/** the ask split into things, each with a kind and a title (play.html `parse`); the words that place a thing ("on the
 *  left", "full") are read off it first. A message that is not an ask for things is one thing, so no chips show */
export function parse(text: string): Thing[] {
  const s0 = text.trim();
  if (!s0) return [];
  const parts = isAsk(s0) ? s0.split(SPLIT).map((s) => s.trim()).filter(Boolean) : [s0];
  return parts.map((raw) => {
    const { words: s, slot, beside } = slotOf(raw);
    const t = s.replace(VERBS, "").replace(VERBS, "").trim();
    const kind: Kind = /diff/i.test(t) ? "diff" : /still|shot|screenshot/i.test(t) ? "shots" : /localhost|http|site|browser|open /i.test(s) ? "browser"
      : /terminal|lint|run |test/i.test(s) ? "terminal" : /table|rows/i.test(t) ? "table" : /gate|ci|status|stable/i.test(t) ? "card"
      : /\b(list|steps|plan)\b/i.test(t) ? "list" : "page";
    const url = (t.match(/localhost:\d+|https?:\/\/\S+|\w+\.\w{2,}\/?\S*/) || [])[0];
    // the title is the person's own words for the thing: "a table of the legacy rows" → "the legacy rows"; no placeholder
    const named = t.replace(/^an?\s+(table|list|page|card)\s+of\s+/i, "").replace(/^(a|an|the)\s+/i, "the ").slice(0, 28);
    const title = kind === "browser" ? url || "browser"
      : kind === "diff" ? (t.match(/of\s+(\S+)/) || [, "the diff"])[1]!
      : kind === "terminal" ? t.replace(/^the /, "").slice(0, 24) || "terminal"
      : kind === "shots" ? "stills · " + t.replace(/^(stills?|shots?|screenshots?)\s*(of\s+)?/i, "").slice(0, 20)
      : named || (kind === "card" ? "a card" : kind === "table" ? "a table" : kind === "list" ? "a list" : "a page");
    return { kind, title, ...(url ? { url } : {}), slot, ...(beside ? { beside } : {}) };
  });
}

// the words that place a thing: a side, the whole stage, the top or the bottom, or beside a block by its title
const PLACES: [RegExp, Exclude<Slot, Rect>][] = [
  [/\s*\b(?:on|to|at)\s+the\s+left(?:\s+half)?\b/i, "left"], [/\s*\b(?:on|to|at)\s+the\s+right(?:\s+half)?\b/i, "right"],
  [/\s*\b(?:(?:at|on|along)\s+the\s+bottom|below)\b/i, "bottom"], [/\s*\b(?:(?:at|on|along)\s+the\s+top|on\s+top)\b/i, "top"],
  [/\s*\b(?:full(?:\s*screen)?|the\s+whole\s+stage|big)$/i, "full"],
];
/** the place words read off a part of the ask: the words left, and the slot they name; "beside <title>" is kept as
 *  `beside`, laid out against the stage's blocks by `beside` below */
export function slotOf(words: string): { words: string; slot: Slot | null; beside?: string } {
  for (const [re, slot] of PLACES) if (re.test(words)) return { words: words.replace(re, "").trim(), slot };
  const b = BESIDE.exec(words);
  return b ? { words: words.slice(0, b.index).trim(), slot: null, beside: b[1] } : { words, slot: null };
}
const BESIDE = /\s+(?:beside|next to)\s+(.+?)\s*$/i;

/** the spot right of the block whose title the words name (else left of it, else under it), sized as the kind is born */
export function beside(stage: Size, kind: Kind, title: string, places: (Place & { title: string })[]): Rect | null {
  const q = title.toLowerCase().replace(/^(the|a|an)\s+/, "");
  const o = places.find((p) => p.title.toLowerCase().replace(/^(the|a|an)\s+/, "").startsWith(q));
  if (!o) return null;
  const s = bornSize(stage, kind);
  if (o.x + o.w + GAP + s.w <= stage.w - PAD) return { x: o.x + o.w + GAP, y: o.y, ...s };
  if (o.x - GAP - s.w >= PAD) return { x: o.x - GAP - s.w, y: o.y, ...s };
  return { x: o.x, y: Math.min(o.y + o.h + GAP, stage.h - PAD - s.h), ...s };
}

/** the chips as the words change (play.html `preview`): a slot a chip was given stays with it while its kind is the same.
 *  One thing is no chips: the chips show from two */
export function preview(text: string, was: Thing[], stage?: Size, places: (Place & { title: string })[] = []): Thing[] {
  if (!text.trim()) return [];
  return parse(text).map((t, i) => {
    const old = was[i];
    if (old?.slot && old.kind === t.kind && old.dropped) return { ...t, slot: old.slot, dropped: true };   // dropped on the stage: kept
    if (!t.slot && t.beside && stage) { const r = beside(stage, t.kind, t.beside, places); if (r) return { ...t, slot: r }; }
    return t;
  });
}

/** a named slot as the stage's own rect, for the ghost */
export const slotRect = (stage: Size, s: Slot): Rect => (typeof s === "object" ? s
  : s === "top" ? { ...zoneRect(stage, "full"), h: zoneRect(stage, "bottom").h } : zoneRect(stage, s));

/** the ghost of a chip dragged over the stage at x, y: its kind's size, kept on the stage (play.html's dragover) */
export function ghostAt(stage: Size, kind: Kind, x: number, y: number): Rect {
  const s = bornSize(stage, kind);
  return { x: Math.max(PAD, Math.min(x - s.w / 2, stage.w - s.w - PAD)), y: Math.max(PAD, Math.min(y - 20, stage.h - s.h - PAD)), ...s };
}

/** what the engine is sent beside the words: the chips (two or more) with their slots, and the target */
export function askStage(things: Thing[], on: Target[]): { things?: { kind: Kind; title: string; slot?: Slot }[]; on?: Target[] } | undefined {
  const t = things.length > 1 ? things.map(({ kind, title, slot }) => ({ kind, title, ...(slot ? { slot } : {}) })) : undefined;
  return t || on.length ? { ...(t ? { things: t } : {}), ...(on.length ? { on } : {}) } : undefined;
}

/** a target as the bar's chip says it: the week › Thu › 14:00 */
export const targetWords = (title: string, part?: string) => (part ? `${title} › ${part}` : title);
