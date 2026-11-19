// The lint at generation (#1245, item 1; brand.md, "How the system is worked on": a rewriter, never a refusal). It takes
// whatever an agent composed (a spec, or something near one) and returns it rewritten into the one system, each rewrite
// a note, so the person always sees Sol and the agent learns what it got wrong. The rewrites, by rule
// (sol/design/system/rules.md):
//   a colour as hex, rgb() or a name → its nearest role, or dropped when it has none (rule 20)
//   a depth not one of the five → the nearest, then the nearest this piece takes (rule 1)
//   a tilt on anything but a sticker → 0 (rule 36); a sticker's over 3° → 3
//   a glow, a shadow, a blur → dropped (rule 5); an outline, a border, a ring → dropped (rule 3)
//   a font, a size, a weight → dropped (rule 23)
//   more than one piece moving in the set's colours → the first keeps moving, the rest are stilled (rule 20)
//   more than one thing lifted → the first stays lifted, the rest go back to the card (rule 8)
//   a meaning colour on a piece's fill → moved to a sticker or a coin on it (rules 17, 18)
//   an unknown piece → the nearest by name, or a card with its words
//   an unknown state, prop or value → the nearest, clamped, or dropped
// A prop's other names (text for words, width for w) are read as the prop without a note: a spelling, not the system.
// Plain TypeScript, no React: lint.test.ts runs it under node.
import { FUNCTIONAL } from "../../creature/palette.ts";
import { PEARL } from "../tokens.ts";
import {
  BLOCK_STATES, DEPTHS, GAPS, KINDS, MAX_TILT, MEANINGS, NAMES, PIECES, def,
  type Depth, type Meaning, type PieceDef, type PieceName, type Prop, type Role, type Spec, type Value,
} from "./spec.ts";

export type Linted = { spec: Spec; notes: string[] };
type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const cut = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const MEANING_WORD: Record<Meaning, string> = { done: "done", ask: "your call", wrong: "wrong" };
const MEANING_COLOUR: Record<Meaning, string> = { done: "green", ask: "yellow", wrong: "red" };
/** how deep a spec may nest, and how many pieces it may hold, before the rest is cut */
const MAX_DEPTH = 8, MAX_PIECES = 160;

// ---- names: the nearest piece -----------------------------------------------------------------------------------
/** the edits between two words (insert, delete, change, and a swap of two neighbours: "Crad" is one from "Card") */
export function distance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
type Seed = { piece: PieceName; props?: Record<string, Value>; why?: string };
/** what agents (and the web) call the pieces; each maps to the piece that does that job here */
const SYNONYMS: Record<string, Seed> = {
  button: { piece: "Pill" }, btn: { piece: "Pill" }, chip: { piece: "Pill" }, toggle: { piece: "Pill" }, segmented: { piece: "Pill" }, tabs: { piece: "Pill" },
  badge: { piece: "Sticker" }, tag: { piece: "Sticker" }, stamp: { piece: "Sticker" }, sticky: { piece: "Sticker" }, note: { piece: "Sticker" },
  dot: { piece: "Coin" }, indicator: { piece: "Coin" }, status: { piece: "Coin" }, avatar: { piece: "Coin" },
  progress: { piece: "MeterBar" }, progressbar: { piece: "MeterBar" }, bar: { piece: "MeterBar" }, gauge: { piece: "Meter" }, slider: { piece: "MeterBar" },
  input: { piece: "Field" }, textfield: { piece: "Field" }, textinput: { piece: "Field" }, textarea: { piece: "Field" }, search: { piece: "Field" }, textbox: { piece: "Field" },
  heading: { piece: "Text", props: { role: "heading" } }, title: { piece: "Text", props: { role: "heading" } }, header: { piece: "Text", props: { role: "heading" } },
  h1: { piece: "Text", props: { role: "heading" } }, h2: { piece: "Text", props: { role: "heading" } }, h3: { piece: "Text", props: { role: "heading" } },
  p: { piece: "Text" }, paragraph: { piece: "Text" }, span: { piece: "Text" }, body: { piece: "Text" }, description: { piece: "Text" }, markdown: { piece: "Text" },
  label: { piece: "Text", props: { role: "caption" } }, caption: { piece: "Text", props: { role: "caption" } }, subtitle: { piece: "Text", props: { role: "caption" } }, small: { piece: "Text", props: { role: "caption" } },
  number: { piece: "Text", props: { role: "number" } }, stat: { piece: "Text", props: { role: "number" } }, metric: { piece: "Text", props: { role: "number" } },
  kpi: { piece: "Text", props: { role: "number" } }, counter: { piece: "Text", props: { role: "number" } }, bignumber: { piece: "Text", props: { role: "number" } },
  vstack: { piece: "Stack", props: { direction: "column" } }, column: { piece: "Stack", props: { direction: "column" } }, col: { piece: "Stack", props: { direction: "column" } },
  hstack: { piece: "Stack", props: { direction: "row" } }, flex: { piece: "Stack" }, box: { piece: "Stack" }, div: { piece: "Stack" }, container: { piece: "Stack" },
  group: { piece: "Stack" }, section: { piece: "Stack" }, grid: { piece: "Stack", props: { direction: "row" } }, view: { piece: "Stack" },
  panel: { piece: "Card" }, tile: { piece: "Card" }, widget: { piece: "Card" }, surface: { piece: "Card" }, paper: { piece: "Card" }, sheet: { piece: "Card" },
  window: { piece: "Block" }, modal: { piece: "Block" }, dialog: { piece: "Block" }, popover: { piece: "Block" }, folder: { piece: "Block" },
  list: { piece: "List" }, ul: { piece: "List" }, ol: { piece: "List" }, menu: { piece: "List" }, table: { piece: "List" },
  listitem: { piece: "Row" }, li: { piece: "Row" }, item: { piece: "Row" }, option: { piece: "Row" }, menuitem: { piece: "Row" }, tr: { piece: "Row" },
  session: { piece: "SessionRow" }, file: { piece: "FileTile" }, attachment: { piece: "FileTile" }, document: { piece: "FileTile" },
  spinner: { piece: "RunMark", props: {}, why: "a drift, never a spinner (rule 27)" }, loader: { piece: "RunMark", why: "a drift, never a spinner (rule 27)" },
  jelly: { piece: "HaloDial" }, halo: { piece: "HaloDial" }, mascot: { piece: "HaloDial" }, creature: { piece: "HaloDial" },
  notification: { piece: "Ping" }, notifications: { piece: "Ping" }, inbox: { piece: "Ping" }, bell: { piece: "Ping" },
};
/** the nearest piece to a name: exact, then a known other name, then the nearest spelling; null when nothing is near */
export function nearestPiece(name: string): Seed | null {
  const n = norm(name);
  const exact = NAMES.find((p) => norm(p) === n);
  if (exact) return { piece: exact };
  if (SYNONYMS[n]) return SYNONYMS[n];
  const pool: [string, Seed][] = [...NAMES.map((p) => [norm(p), { piece: p }] as [string, Seed]), ...Object.entries(SYNONYMS)];
  let best: [number, Seed] | null = null;
  for (const [k, seed] of pool) { const d = distance(n, k); if (!best || d < best[0]) best = [d, seed]; }
  return best && best[0] <= Math.max(1, Math.floor(n.length * 0.3)) ? best[1] : null;
}

// ---- colours: the nearest role ----------------------------------------------------------------------------------
const CSS_NAMES: Record<string, string> = {
  red: "#ff0000", crimson: "#dc143c", tomato: "#ff6347", orange: "#ffa500", coral: "#ff7f50", gold: "#ffd700", yellow: "#ffff00", amber: "#ffbf00",
  green: "#008000", lime: "#00ff00", emerald: "#50c878", mint: "#98ff98", teal: "#008080", cyan: "#00ffff", blue: "#0000ff", navy: "#000080",
  indigo: "#4b0082", purple: "#800080", violet: "#ee82ee", magenta: "#ff00ff", pink: "#ffc0cb", hotpink: "#ff69b4", white: "#ffffff",
  black: "#000000", gray: "#808080", grey: "#808080", silver: "#c0c0c0", brown: "#8b4513",
};
/** what agents call a role: each word to the role it is */
const ROLE_WORDS: Record<string, Role | null> = {
  rest: "rest", muted: "rest", neutral: "rest", default: "rest", secondary: "rest", subtle: "rest", quiet: "rest", ink: "rest", dim: "rest", mute: "rest",
  picked: "picked", pearl: "picked", selected: "picked", chosen: "picked", yours: "picked", nacre: "picked",
  sol: "sol", jelly: "sol", primary: "sol", accent: "sol", brand: "sol", working: "sol", running: "sol", rainbow: "sol",
  done: "done", success: "done", ok: "done", good: "done", positive: "done", complete: "done", completed: "done", passed: "done",
  ask: "ask", yourcall: "ask", warning: "ask", warn: "ask", caution: "ask", attention: "ask", pending: "ask", waiting: "ask", needsyou: "ask",
  wrong: "wrong", error: "wrong", danger: "wrong", fail: "wrong", failed: "wrong", negative: "wrong", critical: "wrong", destructive: "wrong", broken: "wrong",
  info: null, information: null,
};
const rgbOf = (h: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(h.trim());
  if (m) {
    const x = m[1].length <= 4 ? m[1].slice(0, 3).split("").map((c) => c + c).join("") : m[1].slice(0, 6);
    if (x.length !== 6) return null;
    const n = parseInt(x, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(h.trim());
  if (r) return [+r[1], +r[2], +r[3]];
  const s = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(h.trim());
  if (s) {
    const H = +s[1] / 360, S = +s[2] / 100, L = +s[3] / 100;
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
    const f = (t: number) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return [f(H + 1 / 3), f(H), f(H - 1 / 3)];
  }
  return null;
};
const hsl = ([r, g, b]: [number, number, number]) => {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === R ? 60 * (((G - B) / d) % 6) : mx === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l };
};
// the meanings' own hues (functional, the soft shades the UI wears) and the pearl's lightness: the anchors of the map
const hueOf = (c: readonly number[]) => hsl([c[0], c[1], c[2]]).h;
const ANCHOR = { done: hueOf(FUNCTIONAL.green.soft), ask: hueOf(FUNCTIONAL.yellow.soft), wrong: hueOf(FUNCTIONAL.red.soft), pearl: hsl(rgbOf(PEARL)!).l };
const arc = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/** a colour as css (hex, rgb, hsl, a name) or a role's word, to its role: undefined when it is no colour at all, null
 *  when it is a colour with no role (rule 20: grey, so dropped) */
export function roleOf(v: unknown): Role | null | undefined {
  if (typeof v !== "string") return undefined;
  const w = norm(v);
  if (w in ROLE_WORDS) return ROLE_WORDS[w];
  const c = rgbOf(CSS_NAMES[w] ?? v);
  if (!c) return undefined;
  const { h, l } = hsl(c), chroma = (Math.max(...c) - Math.min(...c)) / 255;
  if (chroma < 0.12 || l < 0.1 || l > 0.97) return l >= ANCHOR.pearl - 0.06 && l <= 0.97 ? "picked" : "rest";
  // the meanings are near their own hues; the jelly's warm hues between them (pink, coral, orange) are Sol's; blue to
  // violet is no role in this system
  const near = (["wrong", "ask", "done"] as const).map((m) => [m, arc(h, ANCHOR[m])] as const).sort((a, b) => a[1] - b[1])[0];
  if (near[1] <= (near[0] === "done" ? 50 : 14)) return near[0];
  if (arc(h, 25) <= 18 || arc(h, 335) <= 16) return "sol";
  return null;
}

// ---- the rest of the vocabulary -----------------------------------------------------------------------------------
/** a depth's other names, as an index on the five (rule 1) */
const DEPTH_WORDS: Record<string, number> = {
  well: 0, sunk: 0, sunken: 0, inset: 0, inner: 0, hollow: 0, flat: 1, card: 1, base: 1, resting: 1, raised: 2, control: 2, button: 2,
  elevated: 3, lifted: 3, floating: 3, float: 3, high: 3, modal: 3, overlay: 3, top: 3, popover: 3, sticker: 4, badge: 4,
};
export function nearestDepth(v: unknown): Depth | null {
  if (typeof v === "number" && Number.isFinite(v)) return DEPTHS[Math.max(0, Math.min(4, Math.round(v > 4 ? v / 6 : v)))];
  if (typeof v === "boolean") return v ? "lifted" : "card";
  if (typeof v !== "string") return null;
  const n = norm(v);
  if (/^\d+$/.test(n)) return nearestDepth(+n);
  if (n in DEPTH_WORDS) return DEPTHS[DEPTH_WORDS[n]];
  const best = Object.keys(DEPTH_WORDS).map((k) => [k, distance(n, k)] as const).sort((a, b) => a[1] - b[1])[0];
  return best[1] <= 2 ? DEPTHS[DEPTH_WORDS[best[0]]] : null;
}
/** among the depths a piece takes, the nearest to `d` (ties go down: calmer) */
const within = (d: Depth, of: readonly Depth[]) => [...of].sort((a, b) => Math.abs(DEPTHS.indexOf(a) - DEPTHS.indexOf(d)) - Math.abs(DEPTHS.indexOf(b) - DEPTHS.indexOf(d)) || DEPTHS.indexOf(a) - DEPTHS.indexOf(b))[0];

/** a state's other names, as one of five ideas; each piece says which of its states that idea is */
const STATE_IDEAS: Record<string, "work" | "wait" | "done" | "wrong" | "rest" | "picked" | "made"> = {
  working: "work", running: "work", loading: "work", busy: "work", thinking: "work", inprogress: "work", progress: "work", processing: "work", live: "work", generating: "work",
  waiting: "wait", pending: "wait", blocked: "wait", needsyou: "wait", needsinput: "wait", yourcall: "wait", ask: "wait", attention: "wait", review: "wait", queued: "wait",
  done: "done", success: "done", complete: "done", completed: "done", finished: "done", ok: "done", passed: "done", merged: "done",
  error: "wrong", failed: "wrong", failure: "wrong", broken: "wrong", fail: "wrong", wrong: "wrong", danger: "wrong",
  idle: "rest", rest: "rest", resting: "rest", default: "rest", normal: "rest", inactive: "rest", static: "rest",
  selected: "picked", picked: "picked", active: "picked", current: "picked", chosen: "picked", on: "picked",
  new: "made", created: "made", made: "made", added: "made",
};
const IDEA_STATE: Partial<Record<PieceName, Partial<Record<string, string>>>> = {
  Block: { work: "working", wait: "waiting", done: "done", wrong: "broken", rest: "resting" },
  RunMark: { work: "running", wait: "queued", done: "done", wrong: "failed", rest: "queued" },
  SessionRow: { work: "active-running", picked: "active", rest: "rest" },
  HaloDial: { work: "working", rest: "rest", made: "arriving" },
  Pill: { work: "sol-working", picked: "picked", rest: "rest" },
  FileTile: { made: "made", rest: "rest" },
};
function nearestState(piece: PieceName, v: string, of: readonly string[]): string {
  if (of.includes(v)) return v;
  const n = norm(v), lower = of.find((s) => norm(s) === n);
  if (lower) return lower;
  const idea = STATE_IDEAS[n], by = idea && IDEA_STATE[piece]?.[idea];
  if (by) return by;
  const best = of.map((s) => [s, distance(n, norm(s))] as const).sort((a, b) => a[1] - b[1])[0];
  return best[1] <= 2 ? best[0] : of[0];
}

// prop keys: what each family of other names means
const GLOW = /^(glow|shadow|boxshadow|textshadow|dropshadow|bloom|halo|neon|blur|filter|backdropfilter|luminance|emissive)$/;
const OUTLINE = /^(border|borderwidth|bordercolou?r|outline|ring|stroke)$/;
const FONT = /^(font|fontfamily|fontsize|fontweight|fontstyle|typeface|family|letterspacing|texttransform|lineheight|weight)$/;
const TILT = /^(tilt|rotate|rotation|angle|skew|transform)$/;
const COLOUR = /^(colou?r|fill|background|backgroundcolou?r|bg|tint|accent|textcolou?r|intent|theme|highlight|hue|variant|tone|role|kindcolou?r)$/;
const DEPTH_KEY = /^(depth|elevation|layer|z|zindex|raised|lifted|elevated)$/;
const ALIAS: Record<string, string> = {
  size: "d", level: "value", width: "w", maxwidth: "w", minwidth: "w", diameter: "d", spacing: "gap", space: "gap", dir: "direction", orientation: "direction", flexdirection: "direction",
  axis: "direction", justify: "align", alignitems: "align", subtitle: "note", description: "note", detail: "note", meta: "aside", time: "aside", trailing: "aside",
  badge: "aside", progress: "value", percent: "value", pct: "value", v: "value", fill_level: "value", filename: "name", file: "name", ext: "kind", extension: "kind", type_: "kind",
  icon: "glyph", selected: "picked", active: "picked", current: "picked", options: "words", items: "words", choices: "words", placeholdertext: "placeholder",
  heading: "title", header: "title", name: "title", content: "words", label: "words", text: "words", value: "words", count: "count", position: "at", place: "at",
};
/** the pieces' word props, in the order an unknown prop's words are tried */
const WORD_KEYS = ["words", "title", "label", "text", "content", "value", "name", "body", "message", "summary", "note", "description"];

// ---- the walk -------------------------------------------------------------------------------------------------
type Ctx = { notes: string[]; count: number; cut: boolean };
const labelOf = (piece: string, props: Record<string, Value>) => {
  const w = [props.title, props.words, props.name, props.label, props.value].find((x) => typeof x === "string" && x.trim());
  const ws = Array.isArray(props.words) ? props.words.join(" · ") : null;
  return `${piece}${w ? ` "${cut(String(w))}"` : ws ? ` "${cut(ws)}"` : ""}`;
};
const degOf = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = /(-?[\d.]+)\s*(deg|rad|turn)?/.exec(/rotate[^(]*\(([^)]*)\)/i.exec(v)?.[1] ?? v);
  if (!m) return null;
  const n = +m[1];
  return m[2] === "rad" ? (n * 180) / Math.PI : m[2] === "turn" ? n * 360 : n;
};
const fmt = (n: number) => `${+n.toFixed(1)}°`;
const sticker = (m: Meaning): Spec => ({ piece: "Sticker", props: { words: MEANING_WORD[m], role: m, at: "edge" } });
const coin = (m: Meaning): Spec => ({ piece: "Coin", props: { role: m, d: 14 } });

/** a value checked against its prop: the value kept, rewritten (with why), or dropped (null) */
function checkProp(p: Prop, v: unknown): { v: Value | null; why?: string } {
  switch (p.t) {
    case "text": {
      if (typeof v === "number" || typeof v === "boolean") return { v: String(v) };
      if (Array.isArray(v)) return { v: cut(v.map(String).join(" "), p.max), why: "a list read as words" };
      if (typeof v !== "string") return { v: null, why: "not words" };
      const s = v.replace(/\s+/g, " ").trim();
      return s.length > p.max ? { v: cut(s, p.max), why: `cut to ${p.max} letters` } : { v: s };
    }
    case "num": {
      let n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
      if (!Number.isFinite(n)) return { v: null, why: "not a number" };
      let why: string | undefined;
      if (p.max === 1 && n > 1 && n <= 100) { why = `${n} read as ${n}%`; n = n / 100; }
      if (n < p.min || n > p.max) { const c = Math.max(p.min, Math.min(p.max, n)); why = `${+n.toFixed(2)} → ${c}, its range is ${p.min} to ${p.max}`; n = c; }
      return { v: Math.round(n * 1000) / 1000, why };
    }
    case "bool": return typeof v === "boolean" ? { v } : { v: v === "true" || v === 1 || v === "yes", why: "read as a yes or no" };
    case "enum": {
      const s = String(v), n = norm(s);
      if (p.of.includes(s)) return { v: s };
      const hit = p.of.find((o) => norm(o) === n) ?? p.of.map((o) => [o, distance(n, norm(o))] as const).sort((a, b) => a[1] - b[1]).find(([, d]) => d <= 2)?.[0];
      if (hit) return { v: hit, why: hit === s ? undefined : `"${cut(s, 16)}" → ${hit}` };
      if (typeof v === "number") { const near = [...p.of].filter((o) => !Number.isNaN(+o)).sort((a, b) => Math.abs(+a - v) - Math.abs(+b - v))[0]; if (near) return { v: near, why: `${v} → ${near}` }; }
      return { v: null, why: `"${cut(s, 16)}" is not one of ${p.of.join(", ")}` };
    }
    case "words": {
      const l = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*[,|·]\s*/) : [v]).map((x) => (isObj(x) ? String(x.label ?? x.words ?? x.text ?? "") : String(x))).filter(Boolean);
      return l.length > p.max ? { v: l.slice(0, p.max), why: `${l.length} words → ${p.max}` } : { v: l };
    }
    case "kind": {
      if (typeof v === "number") return { v: KINDS[Math.abs(Math.round(v)) % KINDS.length] };
      const s = norm(String(v)).replace(/^.*\.(\w+)$/, "$1"), k = KINDS.find((x) => x === s) ?? (s === "markdown" || s === "txt" ? "md" : s === "image" || s === "jpg" || s === "jpeg" || s === "svg" ? "png" : s === "ts" || s === "js" || s === "jsx" || s === "code" ? "tsx" : s === "doc" || s === "word" ? "docx" : s === "xls" || s === "csv" || s === "sheet" ? "xlsx" : s === "ppt" || s === "slides" ? "pptx" : undefined);
      return k ? { v: k, why: k === String(v) ? undefined : `"${cut(String(v), 12)}" → ${k}` } : { v: "md", why: `"${cut(String(v), 12)}" is no kind here → md` };
    }
    case "gap": {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (!Number.isFinite(n)) return { v: null, why: "not a number" };
      const g = [...GAPS].sort((a, b) => Math.abs(a - n) - Math.abs(b - n))[0];
      return { v: g, why: g === n ? undefined : `${n} → ${g}, the nearest step of the scale` };
    }
    default: return { v: null };   // role, depth and tilt are rewritten before a prop is checked
  }
}

function walk(raw: unknown, ctx: Ctx, depth: number): Spec[] {
  if (raw == null || raw === false) return [];
  if (typeof raw === "string" || typeof raw === "number") return String(raw).trim() ? walk({ piece: "Text", words: String(raw) }, ctx, depth) : [];
  if (Array.isArray(raw)) return walk({ piece: "Stack", children: raw }, ctx, depth);
  if (!isObj(raw)) return [];
  if (depth > MAX_DEPTH || ctx.count >= MAX_PIECES) {
    if (!ctx.cut) ctx.notes.push(`the spec went deeper than ${MAX_DEPTH} or past ${MAX_PIECES} pieces; the rest was cut`);
    ctx.cut = true;
    return [];
  }
  ctx.count++;
  const notes = ctx.notes;

  // 1. the piece
  const asked = [raw.piece, raw.type, raw.component, raw.element, raw.tag].find((x) => typeof x === "string") as string | undefined;
  const seed: Seed | null = asked ? nearestPiece(asked) : null;
  let piece: PieceName = seed?.piece ?? "Card";
  const unknown = !seed;

  // 2. its props: props, the keys beside piece, and a style's keys, all in one bag
  const bag: Raw = {};
  const take = (o: unknown) => { if (isObj(o)) for (const [k, v] of Object.entries(o)) if (k === "style") take(v); else bag[k] = v; };
  for (const [k, v] of Object.entries(raw)) if (!["piece", "type", "component", "element", "tag", "props", "state", "children"].includes(k)) bag[k] = v;
  take(raw.style); take(raw.props);
  delete bag.style;
  let kids: unknown[] = ([] as unknown[]).concat(raw.children ?? bag.children ?? []);
  delete bag.children;
  let stateAsked = raw.state ?? bag.state ?? bag.status;
  delete bag.state; delete bag.status;

  const props: Record<string, Value> = { ...(seed?.props ?? {}) };
  if (unknown) {
    // an unknown piece: a card with its words
    const words = WORD_KEYS.map((k) => bag[k]).filter((x) => typeof x === "string" && x.trim()) as string[];
    notes.push(`${asked ? `"${cut(asked, 20)}"` : "a piece with no name"} is no piece here, nor near one: a Card${words.length ? " with its words" : ""}`);
    kids = [...words.map((w, i) => ({ piece: "Text", role: i === 0 && words.length > 1 ? "heading" : "words", words: w })), ...kids];
    for (const k of WORD_KEYS) delete bag[k];
  } else if (asked !== piece) {
    notes.push(`"${cut(asked!, 20)}" → ${piece}${seed!.why ? `: ${seed!.why}` : ", the nearest piece"}`);
  }
  const D: PieceDef = def(piece);
  const who = () => labelOf(piece, { ...props, ...(typeof bag.title === "string" ? { title: bag.title } : {}), ...(typeof bag.words === "string" ? { words: bag.words } : {}), ...(typeof bag.text === "string" ? { words: bag.text } : {}) });
  let moved: Meaning | null = null;
  let state: string | undefined;

  // 3. each key in the bag
  for (const [key0, v] of Object.entries(bag)) {
    if (v === undefined || v === null) continue;
    const k = norm(key0);
    if (GLOW.test(k)) { notes.push(`${who()}: ${key0} dropped; nothing glows but the jelly's halo, and depth is the piece's own drop (rule 5)`); continue; }
    if (OUTLINE.test(k)) { notes.push(`${who()}: ${key0} dropped; depth shows as fill, rim and drop, never an outline (rule 3)`); continue; }
    if (FONT.test(k)) {
      notes.push(`${who()}: ${key0} dropped; all text is SF Pro at the scale's sizes, set by the piece (rule 23)`); continue;
    }
    if (TILT.test(k)) {
      const deg = degOf(v);
      if (k === "transform" && deg === null) { notes.push(`${who()}: transform dropped; a piece moves only by the system's moves`); continue; }
      if (piece !== "Sticker") { if (deg) notes.push(`${who()}: tilt ${fmt(deg)} → 0; only a sticker sits off square (rule 36)`); continue; }
      if (deg === null) { notes.push(`${who()}: ${key0} dropped; not an angle`); continue; }
      const t = Math.max(-MAX_TILT, Math.min(MAX_TILT, deg));
      if (t !== deg) notes.push(`${who()}: tilt ${fmt(deg)} → ${fmt(t)}; a sticker sits at most ${MAX_TILT}° off square (rule 36)`);
      props.tilt = Math.round(t * 10) / 10;
      continue;
    }
    if (DEPTH_KEY.test(k)) {
      const dp = D.props as Record<string, Prop>, P = dp.depth;
      const d = nearestDepth(v);
      if (!P || P.t !== "depth") {
        if (piece === "Block" || !d || d === "card") { if (!P) { if (d && d !== "card") notes.push(`${who()}: depth ${String(v)} dropped; a ${piece} sits at the depth its state gives it (rule 1)`); } continue; }
        notes.push(`${who()}: depth ${String(v)} dropped; a ${piece} sits at the depth its state gives it (rule 1)`); continue;
      }
      const to = d ? within(d, P.of) : "card";
      if (String(v) !== to) notes.push(`${who()}: depth ${cut(String(v), 14)} → ${to}${d && d !== to ? `, the nearest a ${piece} takes` : ", the nearest of the five"} (rule 1)`);
      props.depth = to;
      continue;
    }
    const prop = (D.props as Record<string, Prop>)[key0] ?? (D.props as Record<string, Prop>)[ALIAS[k] ?? ""];
    const pkey = (D.props as Record<string, Prop>)[key0] ? key0 : ALIAS[k];
    // a word prop that is its own here (Text's role, Num's tone) before it is read as a colour
    if (prop && prop.t === "enum" && COLOUR.test(k)) {
      const r = checkProp(prop, v);
      if (r.v !== null && !r.why) { props[pkey!] = r.v; continue; }
    }
    if (COLOUR.test(k) || (prop?.t === "role")) {
      if (k === "variant" && typeof v === "string" && D.states && roleOf(v) === undefined) { stateAsked ??= v; continue; }
      const role = roleOf(v);
      const was = typeof v === "string" ? cut(v, 18) : String(v);
      if (role === undefined) { notes.push(`${who()}: ${key0} ${was} dropped; not a colour (rule 20)`); continue; }
      if (role === null) { notes.push(`${who()}: ${key0} ${was} dropped; it has no role here, so it is grey (rule 20)`); continue; }
      const P = (D.props as Record<string, Prop>).role;
      if (P && P.t === "role") {
        if (P.of.includes(role)) {
          if (v !== role) notes.push(`${who()}: ${key0} ${was} → ${role}, its nearest role (rule 20)`);
          props.role = role;
        } else {
          const to = piece === "Sticker" ? "picked" : null;
          notes.push(`${who()}: ${key0} ${was} (${role}) ${to ? `→ ${to}; a sticker is pearl or a meaning` : "dropped; a coin is a meaning or Sol's bands"} (rules 16, 17)`);
          if (to) props.role = to;
        }
        continue;
      }
      if ((MEANINGS as readonly string[]).includes(role)) {
        const m = role as Meaning;
        if (["Block", "Card", "Row", "SessionRow", "Pill"].includes(piece)) { moved = m; notes.push(`${who()}: the ${MEANING_COLOUR[m]} on its fill (${was}) moved to a ${piece === "Block" || piece === "Card" ? "sticker" : "coin"} on it; a meaning is a mark, never a fill (rules 17, 18)`); }
        else notes.push(`${who()}: ${key0} ${was} dropped; a meaning's colour sits on a sticker or a coin, never on ${piece === "Text" || piece === "Num" ? "words" : `a ${piece}`} (rule 18)`);
        continue;
      }
      if (role === "picked" && (piece === "Row" || piece === "SessionRow" || piece === "Pill")) {
        notes.push(`${who()}: ${key0} ${was} → picked, the pearl (rule 14)`);
        if (piece === "Row") props.picked = true; else stateAsked = piece === "Pill" ? "picked" : "active";
        continue;
      }
      if (role === "sol" && piece === "Pill") { notes.push(`${who()}: ${key0} ${was} → Sol's bands, its sol state (rule 16)`); stateAsked = "sol"; continue; }
      if (piece === "Meter" || piece === "MeterBar") { notes.push(`${who()}: ${key0} ${was} dropped; how full Sol is always wears Sol's warm bands (rule 16)`); continue; }
      notes.push(`${who()}: ${key0} ${was} dropped; ${role === "rest" ? "it is grey at rest already (rule 13)" : role === "sol" ? "Sol's bands are worn only by what Sol is doing (rule 16)" : "the pearl is only what you picked (rule 14)"}`);
      continue;
    }
    if (!prop) {
      // its words under another name, or nothing
      if (D.words && WORD_KEYS.includes(k) && props[D.words] === undefined && typeof v === "string") { const r = checkProp(D.props[D.words as keyof typeof D.props] as Prop, v); if (r.v !== null) props[D.words] = r.v; continue; }
      notes.push(`${who()}: ${key0} dropped; a ${piece} takes ${Object.keys(D.props).filter((x) => x !== "still").join(", ") || "no props"}`);
      continue;
    }
    const r = checkProp(prop, v);
    if (r.v === null) { notes.push(`${who()}: ${pkey} dropped, ${r.why}`); continue; }
    if (r.why) notes.push(`${who()}: ${pkey} ${r.why}`);
    props[pkey!] = r.v;
  }

  // 4. its state
  if (stateAsked !== undefined) {
    const s = String(stateAsked);
    if (!D.states) notes.push(`${who()}: state "${cut(s, 16)}" dropped; a ${piece} has no states`);
    else { state = nearestState(piece, s, D.states); if (state !== s) notes.push(`${who()}: state "${cut(s, 16)}" → ${state}`); }
  }
  if (moved && piece === "Block") {
    const to = { done: "done", ask: "waiting", wrong: "broken" }[moved];
    if (!state || state === "resting" || state === to) { state = to; moved = null; }   // its state draws the mark; else a sticker below
  }

  // 5. what it holds: words to its words prop (or a List's rows, or Text in a holder), pieces walked and checked
  const out: Spec = { piece, props };
  if (state) out.state = state;
  const after: Spec[] = [], children: Spec[] = [];
  const isWords = (x: unknown) => typeof x === "string" || typeof x === "number";
  const strings = kids.filter(isWords).map(String).filter((x) => x.trim());
  let objects: unknown[] = kids.filter((x) => !isWords(x));
  const wp = D.words ? (D.props as Record<string, Prop>)[D.words] : undefined;
  if (piece === "List") objects = [...strings.map((t) => ({ piece: "Row", title: t })), ...objects];
  else if (D.holds === "any") objects = [...strings, ...objects];
  else if (strings.length && wp && props[D.words!] === undefined) { const r = checkProp(wp, wp.t === "words" ? strings : strings.join(" ")); if (r.v !== null) props[D.words!] = r.v; }
  else if (strings.length) objects = [...strings, ...objects];
  const walked = objects.flatMap((x) => walk(x, ctx, depth + 1));
  if (D.holds === "none") {
    if (walked.length) { notes.push(`${who()}: holds no pieces; ${walked.length === 1 ? "its one was" : `its ${walked.length} were`} moved beside it`); after.push(...walked); }
  } else {
    for (const c of walked) {
      if (D.holds === "any" || D.holds.includes(c.piece)) { children.push(c); continue; }
      const w = c.props.title ?? c.props.words ?? c.props.name ?? c.props.label;
      if (piece === "List" && (typeof w === "string" || Array.isArray(w))) {
        notes.push(`${labelOf(c.piece, c.props)}: a List holds rows; it became a Row`);
        children.push({ piece: "Row", props: { title: cut(Array.isArray(w) ? w.join(" ") : w, 60) } });
        continue;
      }
      notes.push(`${labelOf(c.piece, c.props)}: dropped; a ${piece} holds ${(D.holds as readonly string[]).join(" or ")} only`);
    }
  }
  // the meaning that came off its fill, as its mark (Block draws it from its state)
  if (moved) {
    const m = moved, has = children.some((c) => (c.piece === "Sticker" || c.piece === "Coin") && c.props.role === m);
    if (!has) children.unshift(piece === "Card" || piece === "Block" ? sticker(m) : coin(m));
  }
  if (children.length) out.children = children;
  if (D.holds === "any" && !children.length && piece !== "Block" && piece !== "Card" && !unknown) {
    notes.push(`${who()}: held nothing; dropped`);
    return after;
  }
  return [out, ...after];
}

/** the moving pieces (rule 20) and the lifted ones (rule 8), in reading order: the first of each keeps it */
function onePerWindow(root: Spec, notes: string[]) {
  let moving = false, lifted = false;
  const visit = (s: Spec) => {
    const D = def(s.piece);
    if (D.moves?.(s.state)) {
      if (moving && !s.props.still) { s.props.still = true; notes.push(`${labelOf(s.piece, s.props)}: stilled; one thing moves in the set's colours at a time (rule 20)`); }
      moving = moving || !s.props.still;
    }
    const up = s.props.depth === "lifted" || (s.piece === "Block" && s.state === "waiting" && s.props.depth !== "card");
    if (up) {
      if (lifted) {
        if (s.props.depth === "lifted") { s.props.depth = "card"; notes.push(`${labelOf(s.piece, s.props)}: lifted → card; only the one thing that waits on you is lifted (rule 8)`); }
        else { s.props.depth = "card"; notes.push(`${labelOf(s.piece, s.props)}: waits on you, but another is lifted already; it keeps its sticker at the card's depth (rule 8)`); }
      }
      lifted = true;
    }
    s.children?.forEach(visit);
  };
  visit(root);
}

/** a spec, or anything an agent wrote for one (a JSON string, an array, a near-spec), rewritten into the one system */
export function lint(input: unknown): Linted {
  const notes: string[] = [];
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); }
    catch { notes.push("not JSON: the words go in a card"); raw = { piece: "Card", children: [input.slice(0, 240)] }; }
  }
  const ctx: Ctx = { notes, count: 0, cut: false };
  const top = walk(raw, ctx, 0);
  const spec: Spec = top.length === 1 ? top[0] : top.length ? { piece: "Stack", props: { direction: "column", gap: 16 }, children: top } : { piece: "Card", props: {} };
  if (!top.length) notes.push("the spec held nothing to draw: an empty card");
  onePerWindow(spec, notes);
  return { spec, notes };
}

export { BLOCK_STATES, PIECES };
