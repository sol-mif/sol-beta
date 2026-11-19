// Home and Build, one place (#1031): what crossed between the two by hand, kept by the engine so it stays. Two kinds:
//   carried  a Home thing (a folder's card, a note, a source) put down on Build's stage: composed there as the person's
//            own block, holding the folder's facts; Home keeps a chip of it
//   seated   a block of Build's stage put down on a Home folder: it lives in the folder's "made here", by reference
//            (the same block, one ledger), until it is taken back
// And the pieces a folder hands the talk: a line the agent reads under the person's words (homeLine). Each crossing has
// its undo (undo), and every face hears the whole list after a change (cross.state). The file is SOL_HOME/cross.json.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type Knows = { kind: string; label: string };
/** a Home thing as the face hands it over: its words, its folder's path, what the folder knows */
export type HomeThing = { id: string; words: string; place: string; path: string; knows?: Knows[]; url?: string };
export type Carried = { id: string; kind: "carried"; thing: string; place: string; path: string; words: string; block: string; session: string; at: number };
export type Seated = { id: string; kind: "seated"; block: string; session: string; place: string; title: string; blockKind: string; at: number };
export type Crossing = Carried | Seated;
export type CrossState = { crossings: Crossing[] };

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** a thing from the wire, cleaned: words and path short, at most 12 facts */
export function cleanThing(t: any): HomeThing | null {
  if (!t || typeof t !== "object") return null;
  const words = clip(t.words, 200), place = clip(t.place, 80);
  if (!words || !place) return null;
  const knows = Array.isArray(t.knows) ? t.knows.slice(0, 12).map((k: any) => ({ kind: clip(k?.kind, 20), label: clip(k?.label, 120) })).filter((k: Knows) => k.label) : [];
  const url = typeof t.url === "string" && /^https?:\/\//.test(t.url) ? t.url.slice(0, 2000) : undefined;
  return { id: clip(t.id, 80) || place, words, place, path: clip(t.path, 160) || place, knows, ...(url ? { url } : {}) };
}

/** the body of the block a Home thing becomes on the stage (markdown): its words, then what its folder knows */
export function carriedBody(t: HomeThing): string {
  const facts = (t.knows ?? []).map((k) => `- ${k.label}${k.kind ? ` (${k.kind})` : ""}`);
  return [`# ${t.words}`, "", `From Home › ${t.path}.`, ...(facts.length ? ["", "What the folder knows:", ...facts] : [])].join("\n");
}

/** how the Home line begins: a session's title is the person's words before it (titleOf) */
export const HOME_HEAD = "The person brought these from Home (their folders) into this talk";
/** a session's title from its first prompt: the person's words, never the Home line read under them (a prompt that is
 *  only the Home line keeps its first piece's words) */
export function titleOf(t: string): string {
  // the stage's paragraph (work/blocks.ts ASK, "[the stage]") is read under the words too: never the title either
  const at = t.indexOf("[the stage]");
  if (at > 0 && t.slice(0, at).trim()) t = t.slice(0, at).trim();
  const i = t.indexOf(HOME_HEAD);
  if (i < 0) return t;
  const words = t.slice(0, i).trim();
  if (words) return words;
  const m = /- Home › ([^:\n]+): ([^;\n(]+)/.exec(t.slice(i));
  return m ? m[2].trim() : t;
}

/** the line the agent reads under the person's words, for the pieces a folder handed the talk (none: "") */
export function homeLine(pieces: unknown): string {
  const list = (Array.isArray(pieces) ? pieces : []).map(cleanThing).filter((t): t is HomeThing => !!t).slice(0, 6);
  if (!list.length) return "";
  return [`${HOME_HEAD}; use them as what you already know:`,
    ...list.map((t) => `- Home › ${t.path}: ${t.words}${t.knows?.length ? `; the folder knows ${t.knows.map((k) => k.label).join(", ")}` : ""}${t.url ? ` (${t.url})` : ""}`)].join("\n");
}

export class CrossBook {
  private list: Crossing[] = [];
  constructor(private file: string) { this.list = this.read(); }
  private read(): Crossing[] {
    try { const j = JSON.parse(readFileSync(this.file, "utf8")); return Array.isArray(j?.crossings) ? j.crossings : []; } catch { return []; }
  }
  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ crossings: this.list }, null, 1));
    renameSync(tmp, this.file);
  }
  state(): CrossState { return { crossings: [...this.list] }; }
  carried(t: HomeThing, block: string, session: string): Carried {
    const c: Carried = { id: randomUUID(), kind: "carried", thing: t.id, place: t.place, path: t.path, words: t.words, block, session, at: Date.now() };
    this.list = [...this.list.filter((x) => !(x.kind === "carried" && x.thing === t.id && x.block === block)), c];
    this.save();
    return c;
  }
  seat(a: { block: string; session: string; place: string; title: string; blockKind: string }): Seated {
    // a block sits in one folder at a time: put down on another, it moves
    const s: Seated = { id: randomUUID(), kind: "seated", block: clip(a.block, 80), session: clip(a.session, 80), place: clip(a.place, 80), title: clip(a.title, 80), blockKind: clip(a.blockKind, 20), at: Date.now() };
    this.list = [...this.list.filter((x) => !(x.kind === "seated" && x.block === s.block)), s];
    this.save();
    return s;
  }
  /** a crossing taken back: gone from the list, returned so its other half can be undone too (a carried block closed) */
  undo(id: string): Crossing | null {
    const c = this.list.find((x) => x.id === id) ?? null;
    if (!c) return null;
    this.list = this.list.filter((x) => x.id !== id);
    this.save();
    return c;
  }
}

export const crossFile = (home: string) => join(home, "cross.json");

// ---- say it and Settings moves (#1031): a sentence read into the look's settings ----
// Plain rules for now, no model: the words a person uses for the look's rows (text, see-through, blur, the base, the
// bubble, Home's skin). A sentence that names none gives nothing, so nothing moves unless it was asked for. Each change
// is a row with where it was and where it goes, so the face can move that row while you watch.
export type Look = { color: string; alpha: number; blur: number; bubble: string; text: number; skin: string };
export type Moved = { row: "text" | "opacity" | "blur" | "base" | "bubble" | "skin"; from: string | number; to: string | number };
const BASES: [RegExp, string][] = [[/\bblack\b/, "#000000"], [/\b(deep )?blue\b/, "#06101f"], [/\b(aubergine|purple|plum)\b/, "#2a1030"], [/\b(forest|green)\b/, "#0c2418"], [/\bwhite\b/, "#ffffff"]];
const BUBBLE_NAMES = ["edge", "slab", "glass", "outline", "bare", "classic"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function lookFromWords(said: string, look: Look): { patch: Partial<Look>; moved: Moved[] } {
  const t = ` ${String(said ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  const p: Partial<Look> = {};
  const more = (w: string) => new RegExp(`\\b(more|less|much|bit|lot)? ?${w}\\b`).test(t);
  // the words' size
  const size = t.match(/\btext (?:to |at |size )?(\d{2})\b/);
  if (size) p.text = clamp(+size[1], 12, 24);
  else if (/\b(bigger|larger|large|easier to read|can t read|cannot read)\b/.test(t) && /\b(text|words|font|read|letters|type)\b/.test(t)) p.text = clamp(look.text + 3, 12, 24);
  else if (/\b(smaller|tinier|tighter)\b/.test(t) && /\b(text|words|font|letters|type)\b/.test(t)) p.text = clamp(look.text - 2, 12, 24);
  // calmer: less of the desktop, softer behind
  if (/\b(calmer|calm|quieter|less busy|less noise|focus)\b/.test(t)) { p.alpha = clamp(+(look.alpha + 0.12).toFixed(2), 0.5, 1); p.blur = clamp(look.blur + 12, 0, 64); }
  // see-through, or solid
  if (/\b(see through|seethrough|transparent|clearer|glassier|show the desktop|lighter)\b/.test(t)) p.alpha = clamp(+(look.alpha - 0.14).toFixed(2), 0.5, 1);
  if (/\b(solid|opaque|not see through|less see through|darker)\b/.test(t)) p.alpha = clamp(+(look.alpha + 0.14).toFixed(2), 0.5, 1);
  // blur
  if (/\bno blur\b|\bsharp\b|\bcrisp\b/.test(t)) p.blur = 0;
  else if (more("blur") && /\bless blur\b/.test(t)) p.blur = clamp(look.blur - 16, 0, 64);
  else if (/\b(more blur|blurrier|blur more|softer)\b/.test(t)) p.blur = clamp(look.blur + 16, 0, 64);
  // the base: only when the window or its colour is named ("make it forest", "a blue window")
  if (/\b(window|base|background|colour|color|make it|theme)\b/.test(t)) for (const [re, c] of BASES) if (re.test(t)) { p.color = c; break; }
  // the bubble, by its name next to "bubble"
  if (/\bbubbles?\b/.test(t)) { const b = BUBBLE_NAMES.find((n) => new RegExp(`\\b${n}\\b`).test(t)); if (b) p.bubble = b; }
  // Home's skin
  if (/\b(skin|home)\b/.test(t)) { if (/\bink\b|\blines only\b/.test(t)) p.skin = "ink"; else if (/\bpearl\b/.test(t)) p.skin = "pearl"; }
  const ROW: Record<keyof Look, Moved["row"]> = { text: "text", alpha: "opacity", blur: "blur", color: "base", bubble: "bubble", skin: "skin" };
  const moved = (Object.keys(p) as (keyof Look)[]).filter((k) => p[k] !== look[k]).map((k) => ({ row: ROW[k], from: look[k], to: p[k]! }));
  const patch = Object.fromEntries((Object.keys(p) as (keyof Look)[]).filter((k) => p[k] !== look[k]).map((k) => [k, p[k]])) as Partial<Look>;
  return { patch, moved };
}
