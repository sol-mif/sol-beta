// Build becomes yours (#1089, build.yours): the first minute is never empty. When fewer than three things repeat,
// the person's own last asks stand in under "you asked": each a tool made from ONE ask, one press from its versions.
// Pure, on this machine; listing asks Jev nothing (a row pressed asks only which version leads, on the shape alone). From one ask only what is plainly a value is a blank:
// a number, an #id, a date, a path, a link; one value each. An ask the naming rule cannot name is never a row.
import { blankName, cut, idOf, isCheckin, isCorrection, near, shapeOf, type Ask, type Blank, type Offer } from "./yours.js";
import { titleOf } from "./yoursTitle.js";

const LOOK = 500;          // the newest asks tried at most
const MIN_WORDS = 4;       // "continue", "yes do that": not a tool
const NEAR = 0.55;         // as alike as two asks of one repeat (yours.ts)
const BLANKS = 4, BLANK_WORDS = 80;
/** what is plainly a value in one ask */
const VALUE = /^(#\d+|\d+([.,:]\d+)*|\d{4}-\d{2}-\d{2}|https?:\/\/\S+|~\S*|\S*\/\S*)$/;
/** words ending in s that count nothing */
const NOT_UNIT = /^(this|does|was|has|less|plus|minus|times|always|across|unless|perhaps|its|yes|thus|is|as|us)$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** the offer one ask makes: count 1, each blank with its one value (pure) */
export function onceOffer(a: Ask): Offer {
  const s = shapeOf(a.text);
  const taken = new Set<string>(), blanks: (Blank & { raw: string })[] = [];
  for (const slot of s.slots) {
    if (slot.at >= BLANK_WORDS || blanks.length >= BLANKS) break;
    if (!VALUE.test(slot.raw) || blanks.some((b) => b.raw === slot.raw)) continue;
    let name = blankName(slot.before, slot.raw, taken, slot.after);
    // a bare number is named by what it counts, the plural right after it: "5 lines" is lines, "3 stops" is stops
    // (the chip then reads "5 lines", never a bare 5)
    const unit = slot.after ?? "";
    if (/^number( \d+)?$/.test(name) && /^\d+([.,]\d+)?$/.test(slot.raw) && /^[a-z]{3,}s$/.test(unit) && !NOT_UNIT.test(unit) && !taken.has(unit)) { taken.delete(name); taken.add(unit); name = unit; }
    blanks.push({ name, values: [slot.raw], raw: slot.raw });
  }
  // the value as a whole word only: the 5 of "5 lines" is a blank, the 5 in "15" and "v5" is not
  let template = a.text;
  for (const b of [...blanks].sort((x, y) => y.raw.length - x.raw.length))
    template = template.replace(new RegExp(`(?<![\\w#/.{-])${esc(b.raw)}(?![\\w/}-]|\\.\\w)`, "g"), `{${b.name}}`);
  // the words keep ____ only where a blank is; any other changing word (a name with a digit) stays as typed; a "_" the
  // person typed is a word with no slot behind it, and stays a word
  const isBlank = new Set(blanks.map((b) => b.raw));
  const words = cut(s.words.slice(0, 14).map((w, i) => { if (w !== "_") return w; const sl = s.slots.find((x) => x.at === i); return !sl ? w : isBlank.has(sl.raw) ? "____" : sl.raw; }).join(" "), 90);
  const head = [...s.head].slice(0, 40);
  return {
    id: idOf("ask", head.slice(0, 12).join(" ")), kind: "ask", count: 1, sessions: 1, first: a.at, last: a.at,
    words, examples: [cut(a.text)], blanks: blanks.map(({ name, values }) => ({ name, values })), template,
    sentence: "You asked this. Keep it as a tool?", folder: a.cwd, head, most: 1, alike: 100,
  };
}

/** "once · today", "once · yesterday", "once · 11 Nov": where a repeat's count stands (pure) */
export function onceWhen(at: number, now = Date.now()): string {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const n = Math.round((day(now) - day(at)) / 86_400_000);
  return `once · ${n <= 0 ? "today" : n === 1 ? "yesterday" : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** the asks that stand in: the person's own, the open folder's first, then newest first; four words or more; not a
 *  check-in or a correction; named by the rule; not near a found repeat, a kept or declined thing (`heads`), or each
 *  other; none whose id is in `skip` (kept, answered "no"). At most `n` (pure) */
export function asked(asks: Ask[], o: { n: number; cwd?: string; heads?: string[][]; skip?: Set<string> }): Offer[] {
  if (o.n <= 0) return [];
  const heads = (o.heads ?? []).map((h) => new Set(h));
  // the open folder's first, newest first; only the newest LOOK of them are tried (the engine's one thread: a person's
  // last asks are what this is, never their whole month); the cheap checks before the shape is made
  const order = [...asks].sort((a, b) => (Number(b.cwd === o.cwd) - Number(a.cwd === o.cwd)) || b.at - a.at).slice(0, LOOK);
  const out: Offer[] = [];
  for (const a of order) {
    if (isCheckin(a.text) || isCorrection(a) || a.text.trim().split(/\s+/, MIN_WORDS).length < MIN_WORDS) continue;
    const off = onceOffer(a);
    const h = new Set(off.head);
    if (h.size < 2 || !titleOf(off.words) || o.skip?.has(off.id)) continue;
    if (heads.some((x) => near(h, x) >= NEAR)) continue;
    heads.push(h); out.push(off);
    if (out.length >= o.n) break;
  }
  return out;
}
