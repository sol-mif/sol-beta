// Build becomes yours (#1089, behind `build.yours`): from an offer to a thing the Sol user keeps. yours.ts finds the
// offers (read-only); this file says one at a time, once, makes three versions of it, changes a version by what the
// person says, and keeps the pressed one as an artifact in the project (blocks.ts: it lives once, in the project's home,
// with a ledger), with where it came from and an undo.
//
//   <STATE_DIR>/yours.json   { seen: { [offerId]: { at, how } }, kept: [Kept] }
//
// A version is a small spec (shape, title, fields, words, look), never free HTML: the page is drawn from the spec here,
// so a version changed by words stays inside what a page in the stage may be. A kept tool's press only puts its filled
// ask in the session's box (a page in the stage posts `yours.fill` to the face): the person sends it. Its ceiling is
// "look"; nothing here sends, starts or writes outside the project's home.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import * as pieces from "./pieces.js";   // part 3 (#1092): a piece in the project folder
import { STATE_DIR } from "./state.js";
import { MADE_W, PAGE_CSS } from "./yoursPage.css.js";
import * as stage from "./blocks.js";
import { asksNow, belongs, DAYS, freshen, offers as allOffers, ownWords, readAt, readCount, reading, sentKey, setTypedIn, theirs, type Ask, type Blank, type Offer } from "./yours.js";
import { firstOf, verdict, worth } from "./yoursJev.js";
import { asked, onceWhen } from "./yoursAsked.js";   // the first minute: the person's last asks when fewer than three repeat
import { titleOf } from "./yoursTitle.js";
import { counterNext, formKey, heard, LEARN_AT, valuesFrom, type Edit } from "./yoursLearn.js";

export type Shape = "button" | "rows" | "brief" | "rule" | "pin" | "layout" | "hide" | "checkin";
const SHAPES: Shape[] = ["button", "rows", "brief", "rule", "pin", "layout", "hide", "checkin"];
/** `next`: a counter (its values only counted up): `value` is the next one, never a row each, never dropped */
export type Field = { name: string; value: string; values: string[]; unnamed?: boolean; next?: boolean };
/** a version; shape "pin" is kept only as a chip by the box (no stage room, no block): the shelf draws it */
export type Lay = { dock: "left" | "right" | "bottom" | "full"; width?: number };
export type Spec = { shape: Shape; title: string; fields: Field[]; template: string; size: "s" | "m" | "l"; accent: "pearl" | "plain"; said: string[];
  /** a look (shape "layout", the talk's place): where a new session of the project opens its talk; the face keeps it */
  lay?: Lay };
/** how an offer was answered; "noticed" is Jev's ghost: never said, listed in Build settings › yours to offer by hand;
 *  "unsaid" is Jev's under-the-bar: never said, never listed as the person's "no", and it holds nothing back */
export type Seen = { at: number; how: "shown" | "later" | "no" | "kept" | "noticed" | "unsaid"; jev?: number };
export type Kept = {
  id: string; offer: string; project: string; sessionId: string; title: string; shape: Shape; spec: Spec; at: number;
  ceiling: "look";
  from: { kind: Offer["kind"]; count: number; sessions: number; first: number; last: number; example: string; sentence: string };
  undone?: number;
  /** the piece it also stands as in the project folder (part 3's `.sol/pieces/<piece>.json`), and that folder */
  piece?: string; cwd?: string;
  /** the spec before its last change by words: what that change's undo puts back */
  before?: Spec;
  /** its fills edited before sending (yoursLearn.ts): the same edit three times is offered to it */
  edits?: Edit[];
};
/** typed: per session, what the person sent in it from Build (sentKey of each, the last 200): only those asks of a
 *  Sol-written session are theirs. An older record's number (a session only) counts nothing.
 *  sent: the last SENT_KEEP asks heard from Build, their words (on this machine only, never to Jev): a turn that failed
 *  (no sign-in, a 401) writes no transcript line, and a sent ask is a "you asked" row whether the agent answered or not */
type Sent = { session: string; cwd: string; at: number; text: string };
type File = { seen: Record<string, Seen>; kept: Kept[]; typed?: Record<string, string[] | number>; sent?: Sent[] };
const SENT_KEEP = 50, SENT_MAX = 4000;

const FILE = () => join(STATE_DIR, "yours.json");
let file: File | null = null;
/** true when yours.json is damaged and could not be set aside: nothing is saved over it this run */
let stuck = false;
/** true while yours.json is there but cannot be read (EMFILE, EIO, a lock): nothing is saved, the next call reads again */
let unread = false;
const rec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** a record of the right shape (pure): every seen entry a record with a string `how`, every kept entry a record with a
 *  string id and record `spec` and `from`. Anything else is damage */
/** an older record's kept entry with no spec or from (written before they existed) is filled in, never set aside: his
 *  kept tools stay. Only a field that is there with the wrong type is damage (pure, on a parsed copy) */
export function filledIn(v: unknown): unknown {
  if (!rec(v) || !Array.isArray(v.kept)) return v;
  return { ...v, kept: v.kept.map((k) => {
    if (!rec(k) || typeof k.id !== "string") return k;
    const title = typeof k.title === "string" && k.title ? k.title : "Your tool";
    const shape = typeof k.shape === "string" && SHAPES.includes(k.shape as Shape) ? k.shape : "brief";   // its own, when it says one
    const spec = k.spec === undefined ? { shape, title, fields: [], template: "", size: "m", accent: "pearl", said: [] }
      : rec(k.spec) && !Array.isArray(k.spec.fields) && k.spec.fields === undefined ? { ...k.spec, fields: [] } : k.spec;
    const from = k.from === undefined ? { kind: "ask", count: 1, sessions: 1, first: typeof k.at === "number" ? k.at : 0, last: typeof k.at === "number" ? k.at : 0 } : k.from;
    return { ...k, title, spec, from };
  }) };
}
export function wellFormed(v: unknown): v is File {
  if (!rec(v)) return false;
  if (v.seen !== undefined && (!rec(v.seen) || !Object.values(v.seen).every((x) => rec(x) && typeof x.how === "string"))) return false;
  if (v.sent !== undefined && (!Array.isArray(v.sent) || !v.sent.every((x) => rec(x) && typeof x.session === "string" && typeof x.cwd === "string" && typeof x.at === "number" && typeof x.text === "string"))) return false;
  if (v.typed !== undefined && (!rec(v.typed) || !Object.values(v.typed).every((x) => typeof x === "number" || (Array.isArray(x) && x.every((h) => typeof h === "string"))))) return false;
  if (v.kept !== undefined && (!Array.isArray(v.kept) || !v.kept.every((k) => rec(k) && typeof k.id === "string" && rec(k.spec) && rec(k.from) && (k.cwd === undefined || typeof k.cwd === "string") && (k.piece === undefined || typeof k.piece === "string")))) return false;
  return true;
}
/** the record: only a file that is not there reads as empty. A file that is there but cannot be read is NOT damage:
 *  nothing is saved and it is read again next time (a passing error must never empty the record). A file that reads
 *  but is not a well-formed record is moved aside to yours.json.bad-<time>-<hex> (kept, never wiped) and the record
 *  starts fresh; when it cannot be moved, nothing is saved */
function load(): File {
  if (file) return file;
  let text: string | null = null;
  try { text = readFileSync(FILE(), "utf8"); unread = false; }
  catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") { unread = true; return { seen: {}, kept: [] }; }   // not kept: read again next call
    unread = false;
  }
  if (text !== null) {
    let v: unknown = null;
    try { v = filledIn(JSON.parse(text)); } catch { v = null; }
    if (wellFormed(v)) file = { seen: v.seen ?? {}, kept: v.kept ?? [], typed: v.typed ?? {}, sent: v.sent ?? [] };
    else setAside();
  }
  return (file ??= { seen: {}, kept: [] });
}
function setAside() {
  // the time and a few random letters: two set aside in one millisecond never overwrite each other
  try { renameSync(FILE(), `${FILE()}.bad-${Date.now()}-${randomBytes(3).toString("hex")}`); } catch { stuck = true; }
}
function save() {
  if (stuck || unread) return;
  const f = load();
  if (unread) return;
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = FILE() + ".tmp"; writeFileSync(tmp, JSON.stringify(f, null, 1)); renameSync(tmp, FILE());
}
/** the record cannot be saved now (the list says so) */
const cantSave = () => stuck || unread;
export const _reload = () => { file = null; stuck = false; unread = false; };
setTypedIn((session, text) => { const t = load().typed?.[session]; return Array.isArray(t) && t.includes(sentKey(text)); });

// ---------------------------------------------------------------- the offer, once

type Source = (folder: string, only?: "asks" | "stage") => Offer[];
let warm = () => { asksNow(); };   // the tests' own source reads nothing
const fromRecords: Source = (folder, only) => allOffers({ folder, only });
let source: Source = fromRecords;
/** where the offers come from: the tests' own */
export const setOfferSource = (f: Source | null) => { source = f ?? fromRecords; warm = f ? () => {} : () => { asksNow(); }; };

/** the one offer to say now in a folder, or null. An offer said and not yet answered stays the one said (a session
 *  opened again, another window) for a day, then counts as passed; once answered ("not now", "no", kept) it never comes
 *  back on its own, and the next waits for the quiet gap after the last answer */
export const UNANSWERED_MS = 86_400_000;
/** a quiet room after an answer before the next offer (SOL_YOURS_GAP_MS, the tests' own) */
export const gapMs = () => { const v = Number(process.env.SOL_YOURS_GAP_MS); return Number.isFinite(v) && v >= 0 ? v : 6 * 3_600_000; };
export function offerNow(folder: string, now = Date.now(), said?: string, lay?: Lay | null): Offer | null {
  const f = load();
  // only after a send, and only the offers that send belongs to: they just did it again. An arrangement or a close is
  // held back until the stage can keep the place (an offer that cannot do what it says is not said)
  // or, for the look, right after they set the talk the way they set it in three sessions
  if (said === undefined && !lay) return null;
  // an ask is only ever an ask's offer, a layout only the stage's: each send reads the one record it can belong to
  const found = source(folder, lay ? "stage" : "asks").filter((x) => (lay ? x.target?.kind === "talk" && sameLay(lay, x.target) : said !== undefined && belongs(x, said)));
  for (const [id, x] of Object.entries(f.seen)) if (x.how === "shown" && now - x.at >= UNANSWERED_MS) { f.seen[id] = { at: x.at, how: "later" }; save(); }
  const open = found.find((x) => f.seen[x.id]?.how === "shown");
  if (open) { last.set(open.id, open); return open; }
  // the quiet gap follows an answer the Sol user gave; Jev's silent "noticed" was never said, so it holds nothing back
  // (no gap at all holds nothing back, even when the clock stepped back a few ms under load)
  const gap = gapMs();
  if (gap > 0 && Object.values(f.seen).some((x) => x.how !== "shown" && x.how !== "noticed" && x.how !== "unsaid" && now - x.at < gap)) return null;
  const o = found.find((x) => !f.seen[x.id]);
  if (!o) return null;
  f.seen[o.id] = { at: now, how: "shown" };
  save();
  last.set(o.id, o);
  return o;
}
const last = new Map<string, Offer>();
/** an offer said earlier, by id: from this run's memory, else found again */
export function offerById(id: string, folder: string): Offer | null {
  return last.get(id) ?? source(folder).find((x) => x.id === id) ?? null;
}
export function seen(id: string, how: Seen["how"]) {
  const f = load();
  f.seen[id] = { ...f.seen[id], at: Date.now(), how };   // Jev's reading stays on the record
  save();
  return f.seen[id];
}
/** offers passed with "not now" or "no": Build settings › yours can say one again */
export function passed(): { id: string; how: Seen["how"]; at: number }[] {
  return Object.entries(load().seen).filter(([, s]) => s.how === "later" || s.how === "no").map(([id, s]) => ({ id, ...s })).sort((a, b) => b.at - a.at);
}
/** what Jev thought worth a ghost only: never said; listed to offer by hand */
export function noticed(): { id: string; at: number }[] {
  return Object.entries(load().seen).filter(([, s]) => s.how === "noticed").map(([id, s]) => ({ id, at: s.at })).sort((a, b) => b.at - a.at);
}
/** the first minute (the designer, NOW 04:12 1): this machine's most repeated, at most three, none kept or answered
 *  "no"; Jev's ghosts among them. Listing asks Jev nothing; a row pressed asks only `first` (which version leads), on
 *  the shape alone (shaped → firstOf), as any offer does. Each by hand, no send needed */
export function found(all: Offer[] = (byHand ?? machineOffers)(), n = 3, cwd?: string): Offer[] {
  const f = load();
  const kept = new Set(f.kept.map((k) => k.offer));
  const gone = (id: string) => kept.has(id) || f.seen[id]?.how === "no" || f.seen[id]?.how === "kept";
  const out = all.filter((o) => !gone(o.id)).slice(0, n);
  // fewer than n repeat: their last asks stand in, under "you asked" (the designer, NOW 05:35 1), never near a repeat
  if (out.length < n) {
    const skip = new Set([...kept, ...Object.entries(f.seen).filter(([, s]) => s.how === "no" || s.how === "kept").map(([id]) => id)]);
    out.push(...asked(asksBy(), { n: n - out.length, cwd, heads: all.map((o) => o.head), skip }));
  }
  for (const o of out) last.set(o.id, o);
  return out;
}
let byHand: (() => Offer[]) | null = null;
/** the machine's repeats, grouped once per read (grouping is quadratic in the asks; the list may open often) */
let machine: { at: number; all: Offer[] } | null = null;
const machineOffers = (): Offer[] => {
  const at = readAt();
  if (!machine || machine.at !== at || at === 0) machine = { at, all: allOffers({ only: "asks" }) };
  return machine.all;
};
/** the transcripts' asks and the asks heard from Build that no transcript holds yet (a failed turn writes none): each
 *  judged by the same rules (the engine's own first prompts and a part's or a child's session never count), within the
 *  days read, one row per ask (pure over the record) */
export function withSent(asks: Ask[], now = Date.now()): Ask[] {
  const sent = load().sent ?? [];
  if (!sent.length) return asks;
  const has = new Set(asks.map((a) => `${a.session} ${sentKey(a.text)}`));
  const out = asks.slice(), since = now - DAYS * 86_400_000;
  sent.forEach((x, i) => {
    if (x.at < since || has.has(`${x.session} ${sentKey(x.text)}`) || !ownWords(x.text.trim())) return;
    // as a Sol session's line: his only by the rule (sent from Build, no part's role, no parent)
    const a: Ask = { ...x, afterAgent: sent.slice(0, i).some((y) => y.session === x.session), via: "sdk-cli" };
    if (!theirs(a)) return;
    has.add(`${x.session} ${sentKey(x.text)}`); out.push(a);
  });
  return out;
}
let asksBy: () => Ask[] = () => withSent(asksNow());
/** the tests' own machine-wide offers (and asks: none unless given, so a test never reads this machine's) */
export const setFoundSource = (f: (() => Offer[]) | null, a?: () => Ask[]) => { byHand = f; asksBy = f ? (a ?? (() => [])) : () => withSent(asksNow()); };
/** an offer pressed by hand (from the list): said now, whatever the gap */
export function offerByHand(id: string, cwd?: string): Offer | null {
  // after a restart a "you asked" row is found again the same way (its id is its words' own)
  const o = last.get(id) ?? (byHand ?? machineOffers)().find((x) => x.id === id) ?? asked(asksBy(), { n: 50, cwd }).find((x) => x.id === id) ?? null;
  if (!o) return null;
  const f = load(); f.seen[o.id] = { ...f.seen[o.id], at: Date.now(), how: "shown" }; save();
  last.set(o.id, o);
  return o;
}

/** say an offer again: it is forgotten as seen */
export function again(id: string) { const f = load(); delete f.seen[id]; save(); }

// ---------------------------------------------------------------- versions

// a blank named only by the fallback ("name": the reader could not tell its kind) shows its value alone
const field = (b: Blank): Field => {
  const next = counterNext(b.values);
  return { name: b.name, value: next ?? b.values[0] ?? "", values: b.values, ...(/^name( \d+)?$/.test(b.name) ? { unnamed: true } : {}), ...(next ? { next: true } : {}) };
};
/** an offer seen with the ask just sent (pure): each blank's value from that send first, then the older ones, so the
 *  made tool shows what they just did (and a counter the one after it) */
export function withSaid(o: Offer, said?: string): Offer {
  if (!said || o.kind !== "ask" || !o.blanks.length) return o;
  const v = valuesFrom(o.template, said);
  return { ...o, blanks: o.blanks.map((b) => (Object.hasOwn(v, b.name) && v[b.name] !== b.values[0] ? { ...b, values: [v[b.name], ...b.values.filter((x) => x !== v[b.name])].slice(0, 8) } : b)) };
}
/** a tool's first name (pure): one noun, the first word that is not filler: "you are the reviewer of PR ____" is
 *  "Reviewer", "you are ____ a gardener of the north bed" is "Gardener" (the designer: never the two words before a blank) */
/** a tool's first name, by rule on this machine (yoursTitle.ts): the thing the ask is about, at most two words */
export const titleFrom = (o: Pick<Offer, "words">) => titleOf(o.words) || "Your tool";

/** a blank is a choice when it has two or more values that are not bare numbers, and is no counter (pure; the face's
 *  model.ts isChoice says the same) */
export const isChoice = (f: Pick<Field, "next" | "values">) => !f.next && f.values.length >= 2 && !f.values.every((v) => /^\d+([.,]\d+)?$/.test(v.trim()));
/** the field a tool's rows are made of, everywhere (the page, its size, the piece): the first choice, else the first
 *  field that is no counter (pure) */
export const rowField = (s: Pick<Spec, "fields">) => s.fields.find(isChoice) ?? s.fields.find((f) => !f.next);   // never a counter
/** three made versions of one offer (pure): what it is, shown three ways the person presses between */
export function versionsOf(o: Offer): Spec[] {
  const base = { template: o.template, size: "m" as const, accent: "pearl" as const, said: [] as string[] };
  const title = titleFrom(o);
  if (o.kind === "ask") {
    const fields = o.blanks.map(field);
    // a row each only for a choice: a blank with two or more values that are not bare numbers, never a counter (the
    // designer, NOW 05:35 2). Without one, a pin by the box; an ask sent once (count 1) is the fields and the whole ask
    const choice = fields.some(isChoice);
    const middle: Spec[] = choice ? [{ ...base, shape: "rows", title, fields }] : o.count > 1 ? [{ ...base, shape: "pin", title, fields, size: "s" }] : [];
    return [{ ...base, shape: "button", title, fields }, ...middle, { ...base, shape: "brief", title, fields }];
  }
  // "is it done?": a card on the stage · a pin by the box, one press (picked first: shaped() leads with it) · the fuller ask
  if (o.kind === "checkin") return [
    { ...base, shape: "checkin", title: "Where it stands", fields: [], template: "Where does this stand? One line each: done, waiting on me, next." },
    { ...base, shape: "pin", title: "Is it done?", fields: [], template: "Is it done? Say yes or no first, then what is left, in one line.", size: "s" },
    { ...base, shape: "brief", title: "Where it stands, in full", fields: [], template: "Where does this stand? What landed, what is open (with links), what waits on me, and the next step." },
  ];
  // three that differ in what they do (the design): a rule card on the stage; the same rule as a chip that stands by
  // the box in this project (one press, no stage); the whole sentence to edit
  if (o.kind === "correction") {
    const rule = ruleOf(o.template), short = rule.split(/[,.;]/)[0].trim().slice(0, 28) || "Your rule";
    // the card is titled by the rule itself, as its pin is (the designer, NOW 03:33 2)
    return [
      { ...base, shape: "rule", title: short, fields: [], template: rule },
      { ...base, shape: "pin", title: short, fields: [], template: rule, size: "s" },
      { ...base, shape: "brief", title: "Say it again", fields: [], template: `From now on: ${rule}` },
    ];
  }
  if (o.kind === "arrangement" && o.target?.kind === "talk" && o.target.dock) {
    const lay = { dock: o.target.dock as Lay["dock"], ...(o.target.width !== undefined ? { width: o.target.width } : {}) };
    const title = lay.dock === "bottom" ? "Talk at the foot" : lay.dock === "full" ? "Talk, the whole window" : `Talk on the ${lay.dock}`;
    return [{ ...base, shape: "layout", title, fields: [], template: "", lay }];
  }
  if (o.kind === "arrangement") return [
    { ...base, shape: "layout", title: `${o.target?.title ?? "It"} on the ${o.target?.side ?? "right"}`, fields: [], template: "" },
  ];
  return [{ ...base, shape: "hide", title: `${o.target?.title ?? "It"}, put away`, fields: [], template: "" }];
}
/** a correction as a rule: the words after the "no" (pure) */
export const ruleOf = (t: string) => {
  const r = t.replace(/^\s*(no+[,.!]*|nope[,.!]*|i said|i told you|again[,.!]*|stop[,.!]*|wrong[,.!]*)\s*/i, "").trim();
  return (r.charAt(0).toUpperCase() + r.slice(1)).slice(0, 240);
};

// ---------------------------------------------------------------- changed by saying so

/** the presses a version can take (pure; the face draws the same list, yours/model.ts pushesOf) */
export const pushesOf = (s: Spec): string[] => [
  ...(s.size !== "s" ? ["smaller"] : ["bigger"]), ...(s.accent === "pearl" ? ["plain"] : ["pearl"]),
  ...(s.shape === "button" && s.fields.some((x) => !x.next) ? ["a row each"] : s.shape === "rows" ? ["one button"] : []),
  // a counter is never dropped (the tool would send the same number twice); the row's own blank neither
  ...(s.shape === "button" || s.shape === "rows" ? s.fields.filter((x) => !x.next).slice(1).map((x) => `without ${x.unnamed ? x.value : x.name}`) : []),
];

const SHAPE_WORDS: [RegExp, Shape][] = [[/\b(rows?|a row each|list|one per)\b/i, "rows"], [/\b(one )?button\b/i, "button"], [/\b(the whole|full|brief|all the words|text)\b/i, "brief"]];
/** a version changed by what the person said (pure). It knows a few plain ways to say a change; anything else is kept
 *  in `said` and the version is unchanged, so nothing is guessed. A model behind this is Frank's to wire (for-frank.md) */
export function adjust(s: Spec, words: string): { spec: Spec; changed: string[] } {
  const w = words.trim().slice(0, 300);
  const out: Spec = { ...s, fields: s.fields.map((f) => ({ ...f, values: [...f.values] })), said: [...s.said, w] };
  const changed: string[] = [];
  const name = /\b(?:call it|name it|rename (?:it )?to|title it)\s+["“]?([^"”,;]{1,40}?)["”]?(?=$|[,;]|\s+and\s)/i.exec(w);
  if (name) { out.title = name[1].trim(); changed.push("title"); }
  for (const m of w.matchAll(/\b(?:add|with)\s+(?:a |an |the )?([a-z][\w -]{0,20}?)(?:\s+field)?(?=$|[,.]|\s+and\b)/gi)) {
    const n = m[1].trim().toLowerCase();
    if (n && !out.fields.some((f) => f.name.toLowerCase() === n)) { out.fields.push({ name: n, value: "", values: [] }); out.template = `${out.template}\n${n}: {${n}}`; changed.push(`+${n}`); }
  }
  for (const m of w.matchAll(/\b(?:drop|remove|without|no)\s+(?:the )?([a-z][\w -]{0,20}?)(?:\s+field)?(?=$|[,.]|\s+and\b)/gi)) {
    const n = m[1].trim().toLowerCase();
    const i = out.fields.findIndex((f) => f.name.toLowerCase() === n || (f.unnamed && f.value.toLowerCase() === n));
    if (i >= 0) { const f = out.fields[i]; out.template = out.template.split(`{${f.name}}`).join(f.value); out.fields.splice(i, 1); changed.push(`-${n}`); }
  }
  if (/\b(bigger|larger|big)\b/i.test(w)) { out.size = "l"; changed.push("size"); }
  else if (/\b(smaller|small|tiny|compact)\b/i.test(w)) { out.size = "s"; changed.push("size"); }
  if (/\b(plain|no colou?r|quiet|grey|gray)\b/i.test(w)) { out.accent = "plain"; changed.push("look"); }
  else if (/\b(pearl|shiny|colou?r)\b/i.test(w)) { out.accent = "pearl"; changed.push("look"); }
  if (s.shape === "button" || s.shape === "rows" || s.shape === "brief") for (const [re, sh] of SHAPE_WORDS) if (re.test(w) && !name && out.shape !== sh) { out.shape = sh; changed.push("shape"); break; }
  return { spec: out, changed };
}

// ---------------------------------------------------------------- the page a kept thing is

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** the ask with its fields filled (pure) */
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{([^{}\n]{1,30})\}/g, (m, n) => (n in values ? values[n] : m));

/** the date as the face says it everywhere: "10 Nov" (pure) */
export const dayOf = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
// a kept thing only fills the box, so every press says so (NOW 03:33 2: true words)
const GO: Record<Shape, string> = { button: "use", rows: "use", brief: "use", checkin: "use", rule: "use", pin: "use", layout: "", hide: "" };

/** a version as the page the stage shows (pure): the kept artifact. Drawn with the kit's tokens copied in
 *  (yoursPage.css.ts) at the piece's own width, no title (the block's head says it), no colour of its own. One small
 *  row at its foot says where it came from and undoes it (`yours.undo` to the face) until the stage draws a kept piece
 *  natively. A press posts the filled ask (`yours.fill`); the face puts it in the box */
export function pageOf(s: Spec, from?: Kept["from"], id?: string): string {
  const field = (f: Field, i: number, k: string) => `<label class="f">${f.unnamed ? "" : `<span>${esc(f.name)}</span>`}<input data-n="${esc(f.name)}" value="${esc(f.value)}" ${f.values.length > 1 ? `list="${k}${i}" ` : ""}autocomplete="off">${f.next ? `<i class="nx">next</i>` : ""}${f.values.length > 1 ? `<datalist id="${k}${i}">${f.values.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>` : ""}</label>`;   // a list only when there is more than one to pick
  const go = GO[s.shape] ? `<button class="go" data-go>${esc(GO[s.shape])}</button>` : "";
  let body = "";
  if (s.shape === "button") body = s.fields.map((f, i) => field(f, i, "l")).join("") + go;
  else if (s.shape === "rows") {
    const lead = rowField(s);   // the one rule: the first field that is a choice; a counter is never the row
    // the other blanks above the rows: they are set once, then a row is pressed
    body = s.fields.filter((f) => f !== lead).map((f, i) => field(f, i, "m")).join("")
      + (lead?.values.length ? lead.values.slice(0, 5) : [""]).map((v) => `<button class="row" data-row="${esc(v)}"><b>${esc(v || s.title)}</b><i>use</i></button>`).join("");
  } else if (s.shape === "brief") body = `<p class="brief" data-brief>${esc(fill(s.template, Object.fromEntries(s.fields.map((f) => [f.name, f.value]))))}</p>${go}`;
  else if (s.shape === "checkin" || s.shape === "rule") body = `<p class="say">${esc(s.template)}</p>${go}`;
  else body = `<p class="say">${esc(s.title)}.</p>`;
  const what = from?.kind === "correction" ? "corrections" : from?.kind === "arrangement" ? "sessions" : from?.kind === "closed" ? "closes" : from?.count === 1 ? "ask" : "asks";
  // where it came from, change and undo, quiet: 11px, the dim of the kit (behind the fold once the page can turn)
  const foot = from && id ? `<div style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:11px;line-height:16px;color:var(--mute)"><span>from ${from.count} ${what} · since ${esc(dayOf(from.first))}</span><button data-change style="all:unset;cursor:default;color:var(--dim)">change</button><button data-undo style="all:unset;cursor:default;color:var(--dim)">undo</button></div>` : "";
  const script = `const T=${JSON.stringify(s.template).replace(/</g, "\\u003c")};const ID=${JSON.stringify(id ?? "")};const fill=(t,v)=>t.replace(/\\{([^{}\\n]{1,30})\\}/g,(m,n)=>n in v?v[n]:m);
const vals=()=>{const v={};document.querySelectorAll('input[data-n]').forEach(i=>v[i.dataset.n]=i.value);return v};
const send=t=>parent.postMessage({sol:"yours.fill",text:t},"*");
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>send(fill(T,vals())));
document.querySelectorAll('input[data-n]').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();send(fill(T,vals()))}});
document.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>{const v=vals();const n=${JSON.stringify(rowField(s)?.name ?? "")};if(n)v[n]=b.dataset.row;send(fill(T,v))});
document.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>parent.postMessage({sol:"yours.undo",id:ID},"*"));
document.querySelectorAll('[data-change]').forEach(b=>b.onclick=()=>parent.postMessage({sol:"yours.change",id:ID},"*"));`;
  // the width it is made at, so the stage lays it out there and shows it at its own size (stage/kinds/Page.tsx floorOf)
  const made = MADE_W[s.size] + 32;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="sol-width" content="${made}"><style>${PAGE_CSS}</style></head><body><div class="piece" style="--w:${MADE_W[s.size]}px">${body}${foot}</div><script>${script}</script></body></html>`;
}

// ---------------------------------------------------------------- Jev's picks on an offer

/** a title the rule could not find (its last resort): the face shows it dashed, a press names it (pure) */
export const doubtful = (title: string) => title === "Your tool" || title === "Your rule";
/** an offer's versions, the one Jev would pick first leading when Jev is sure. Jev reads the offer's shape only
 *  (yoursJev.ts): the blanks' names and the title stay the rule's, on this machine */
export async function shaped(o: Offer): Promise<{ versions: Spec[]; lead: number; doubt: boolean }> {
  const versions = versionsOf(o);
  const doubt = doubtful(versions[0]?.title ?? "");
  if (o.kind !== "ask") return { versions, lead: Math.min(1, versions.length - 1), doubt };
  const first = await firstOf(o, versions.map((v) => v.shape));
  const at = first?.v === "act" ? versions.findIndex((v) => v.shape === first.shape) : -1;
  return { versions, lead: at >= 0 ? at : Math.min(1, versions.length - 1), doubt };
}
/** the offer to say after a send, judged once by Jev's worth: "act" (or no Jev) says it; a ghost is only noticed;
 *  under that it is let go */
export async function offerJudged(folder: string, said: string | undefined, now = Date.now(), lay?: Lay | null): Promise<Offer | null> {
  const o = offerNow(folder, now, said, lay);
  if (!o) return null;
  const f = load();
  if (f.seen[o.id]?.jev !== undefined) return o;
  if (o.kind === "arrangement") return o;   // a look is the Sol user's own hand three times: nothing for Jev to judge
  const p = await worth(o, f.kept.filter((k) => !k.undone).length);
  if (p === null) return o;   // no Jev: the rule alone
  const v = verdict(p);
  // Jev's own answer is its own state: a ghost is "noticed", under the bar "unsaid"; never the person's "no". Up to 4 s
  // passed while Jev thought: read the record again, and when the person answered meanwhile (no, later, kept), their
  // answer stands and Jev's reading is only noted beside it
  const g = load(), was = g.seen[o.id];
  if (was && was.how !== "shown") { g.seen[o.id] = { ...was, jev: p }; save(); return null; }
  g.seen[o.id] = { ...(was ?? { at: now, how: "shown" }), jev: p, ...(v === "ghost" ? { how: "noticed" as const } : v === "none" ? { how: "unsaid" as const } : {}) };
  save();
  return v === "act" ? o : null;
}

// ---------------------------------------------------------------- keep, undo, the list

const fromOf = (o: Offer): Kept["from"] => ({ kind: o.kind, count: o.count, sessions: o.sessions, first: o.first, last: o.last, example: o.examples[0] ?? "", sentence: o.sentence });
/** a layout from the face, or null (pure) */
export const layOf = (v: unknown): Lay | null => {
  const o = v as { dock?: unknown; width?: unknown } | null;
  if (!o || !["left", "right", "bottom", "full"].includes(String(o.dock))) return null;
  const w = Number(o.width);
  return { dock: o.dock as Lay["dock"], ...(Number.isFinite(w) && w > 0.05 && w < 0.95 ? { width: Math.round(w * 100) / 100 } : {}) };
};
/** a layout the Sol user just set is the one they set before: the same dock, the width within a twentieth (pure) */
export const sameLay = (a: Lay, b: { dock?: string; width?: number }) => a.dock === b.dock && (a.width === undefined || b.width === undefined ? a.width === b.width : Math.abs(a.width - b.width) <= 0.05);
const cleanSpec = (v: unknown, fallback: Spec): Spec => {
  const s = (v && typeof v === "object" ? v : {}) as Partial<Spec>;
  const shapes: Shape[] = ["button", "rows", "brief", "rule", "pin", "layout", "hide", "checkin"];
  return {
    shape: shapes.includes(s.shape as Shape) ? (s.shape as Shape) : fallback.shape,
    title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 60) : fallback.title,
    fields: Array.isArray(s.fields) ? s.fields.slice(0, 8).map((f) => ({ name: String(f?.name ?? "").slice(0, 30), value: String(f?.value ?? "").slice(0, 400), values: Array.isArray(f?.values) ? f.values.slice(0, 8).map((x) => String(x).slice(0, 400)) : [], ...(f?.unnamed ? { unnamed: true } : {}), ...(f?.next ? { next: true } : {}) })).filter((f) => f.name) : fallback.fields,
    template: typeof s.template === "string" ? s.template.slice(0, 8000) : fallback.template,
    size: s.size === "s" || s.size === "l" ? s.size : "m", accent: s.accent === "plain" ? "plain" : "pearl",
    said: Array.isArray(s.said) ? s.said.slice(-10).map((x) => String(x).slice(0, 300)) : [],
    ...(layOf(s.lay) ? { lay: layOf(s.lay)! } : {}),
  };
};

/** the piece's own box on the stage (pure): its width + 32, its height (by what it holds) + 16, for the block to be the
 *  size of its piece and the stage to arrange the rest */
export function pieceBox(s: Spec): { w: number; h: number } {
  const rows = s.shape === "rows" ? Math.min(5, Math.max(1, rowField(s)?.values.length ?? 1)) * 34 + Math.max(0, s.fields.length - 1) * 44
    : s.shape === "button" ? s.fields.length * 44 + 34 : s.shape === "brief" ? 6 * 20 + 46 : s.shape === "rule" || s.shape === "checkin" ? 3 * 24 + 46 : 48;
  const head = 40, pad = 32, foot = 46;
  return { w: MADE_W[s.size] + 32 + 16, h: head + pad + rows + foot + 16 };   // the page (piece + its 16 each side) and the frame's own edge
}

/** keep a version: an artifact in the project, on this session's stage, and a line in the list of what is yours */
export function keep(w: stage.Who, o: Offer, spec: Spec): { kept: Kept; block: stage.Block | null } {
  const s = cleanSpec(spec, versionsOf(o)[0]);
  const from = fromOf(o);
  const id = `yours-${randomBytes(4).toString("hex")}`;
  if (s.shape === "pin" || s.shape === "layout") {   // only a chip by the box, or a look the face keeps: no stage room, no block; the shelf draws it
    const kept: Kept = { id, offer: o.id, project: w.project, sessionId: w.sessionId, title: s.title, shape: s.shape, spec: s, at: Date.now(), ceiling: "look", from };
    const f = load(); f.kept.push(kept); f.seen[o.id] = { ...f.seen[o.id], at: Date.now(), how: "kept" }; save();
    return { kept, block: null };
  }
  const box = pieceBox(s);
  const spot = stage.freeSpot(box.w, box.h, stage.getStage(w.project, w.sessionId).blocks) ?? { x: stage.PAD, y: stage.PAD };
  const block = stage.compose(w, { kind: "page", title: s.title, body: pageOf(s, from, id), format: "html", id, at: { ...spot, ...box } });
  const kept: Kept = { id: block.id, offer: o.id, project: w.project, sessionId: w.sessionId, title: s.title, shape: s.shape, spec: s, at: Date.now(), ceiling: "look", from };
  const f = load();
  f.kept.push(kept);
  f.seen[o.id] = { ...f.seen[o.id], at: Date.now(), how: "kept" };
  save();
  return { kept, block };
}
/** undo a kept thing: its artifact closed (its ledger says so), its row says undone; undo again brings it back */
export function undo(id: string, by = "you"): Kept {
  const k = load().kept.find((x) => x.id === id);
  if (!k) throw new Error(`nothing kept as ${id}`);
  const w = { project: k.project, sessionId: k.sessionId, by };
  const block = k.spec.shape !== "pin" && stage.getBlock(k.project, id);
  if (!k.undone) { if (block && block.state !== "dead") stage.place(w, { id, close: true }); k.undone = Date.now(); }
  else { if (block) stage.reopen(w, { id }); delete k.undone; }
  pieceUndo(k);
  save();
  return k;
}
/** a kept thing changed by saying so: its spec, its page on the stage and its piece in the folder replaced in place;
 *  the spec before is held for that change's undo (`unchange`). It stays kept */
export function change(id: string, spec: unknown, by = "you"): Kept {
  const k = load().kept.find((x) => x.id === id);
  if (!k) throw new Error(`nothing kept as ${id}`);
  const next = cleanSpec(spec, k.spec);
  next.shape = k.spec.shape;   // a change keeps what it is; only its words, fields, size and look move
  return replace(k, next, k.spec, by);
}
/** the last change taken back: the spec before it, in place */
export function unchange(id: string, by = "you"): Kept {
  const k = load().kept.find((x) => x.id === id);
  if (!k || !k.before) throw new Error("nothing to take back");
  return replace(k, k.before, undefined, by);
}
function replace(k: Kept, next: Spec, before: Spec | undefined, by: string): Kept {
  k.spec = next; k.title = next.title;
  if (before) k.before = before; else delete k.before;
  const b = k.spec.shape !== "pin" && k.spec.shape !== "layout" ? stage.getBlock(k.project, k.id) : null;
  if (b && b.state !== "dead") stage.update({ project: k.project, sessionId: k.sessionId, by }, { id: k.id, body: pageOf(next, k.from, k.id), format: "html", title: next.title });
  k.edits = [];   // edits heard against the template before this change no longer fit it
  if (k.piece && k.cwd && !k.undone) {
    try {
      const f = pieceFile(k.cwd, k.piece);
      // never over a file changed by hand, and never without the exclude line first
      if (existsSync(f) && mine(k) && ignoreKept(k.cwd, k.piece) && dropPiece(k)) pieces.make(k.cwd, summed(recipeOf(k)));
    } catch { /* the folder moved */ }
  }
  save();
  return k;
}
/** a kept tool's fill was sent: its edit heard; the form to offer once the same edit came LEARN_AT times */
export function sent(id: string, text: string, now = Date.now()) {
  const k = load().kept.find((x) => x.id === id);
  if (!k || k.undone || !k.spec.template) return null;
  const r = heard(k.spec.template, k.edits ?? [], text.slice(0, 8000), now);
  k.edits = r.edits;
  // its counters move on from what was just sent (#1048 sent: the tool's next is #1049), its other blanks show it
  const v = valuesFrom(k.spec.template, text);
  if (Object.keys(v).length) {
    k.spec = { ...k.spec, fields: k.spec.fields.map((f) => {
      const got = Object.hasOwn(v, f.name) ? v[f.name] : ""; if (!got) return f;
      // a counter takes only a value it can count on ("#1049"), never words read beside it
      if (f.next && !/^[#A-Za-z-]*\d{1,9}$/.test(got.trim())) return f;
      const values = [got, ...f.values.filter((x) => x !== got)].slice(0, 8);
      const next = f.next ? counterNext(values) : null;
      return { ...f, values, value: next ?? got };
    }) };
    const b = k.spec.shape !== "pin" && k.spec.shape !== "layout" ? stage.getBlock(k.project, k.id) : null;
    if (b && b.state !== "dead") stage.update({ project: k.project, sessionId: k.sessionId, by: "you" }, { id: k.id, body: pageOf(k.spec, k.from, k.id), format: "html", title: k.spec.title });
  }
  save();
  return r.learn;
}
/** the tool takes the edit: its template becomes the form (one press; "undo change" puts it back). Only a form heard
 *  LEARN_AT times is taken, so a face cannot write any template it likes */
export function learn(id: string, form: string, by = "you"): Kept {
  const k = load().kept.find((x) => x.id === id);
  if (!k) throw new Error(`nothing kept as ${id}`);
  if (k.undone) throw new Error("an undone tool learns nothing");
  const key = formKey(form);
  const e = [...(k.edits ?? [])].reverse().find((x) => x.key === key);
  if (!e || (k.edits ?? []).filter((x) => x.key === key).length < LEARN_AT) throw new Error("that edit was not made three times");
  const next: Spec = { ...k.spec, template: e.form, fields: k.spec.fields.filter((f) => e.form.includes(`{${f.name}}`)) };
  k.edits = [];
  return replace(k, next, k.spec, by);
}
/** "not now" on a learned edit: that edit's sends are forgotten, so it is offered again only once it is made three
 *  more times */
export function decline(id: string, form: string): Kept {
  const k = load().kept.find((x) => x.id === id);
  if (!k) throw new Error(`nothing kept as ${id}`);
  const key = formKey(form);
  k.edits = (k.edits ?? []).filter((x) => x.key !== key);
  save();
  return k;
}
export const kept = (): Kept[] => [...load().kept].sort((a, b) => b.at - a.at);
/** the shelf: a project's kept things not undone, first kept first (the row keeps its order as it grows) */
export const shelf = (project: string): Kept[] => load().kept.filter((k) => k.project === project && !k.undone);   // in keep order: the record only appends (a clock that steps back cannot reorder it)

// ---------------------------------------------------------------- the piece in the folder (part 3, #1092)

/** a kept thing as part 3's recipe (pure): it lives in the folder, survives the engine, and can be lent (the recipe
 *  without your values). Its rows are the values it was used with; using it is Build's (the stage, the shelf) */
export function recipeOf(k: Pick<Kept, "id" | "title" | "spec" | "from">): Record<string, unknown> {
  const what = k.from.kind === "correction" ? "corrections" : k.from.count === 1 ? "ask" : "asks";
  const lead = rowField(k.spec);
  const rows = k.spec.shape === "pin" || k.spec.shape === "rule" || !lead ? [{ id: "rule", t: k.spec.template.slice(0, 200) }]
    : lead.values.slice(0, 8).map((v) => ({ id: v.slice(0, 80), t: v.slice(0, 200), note: "used before" }));
  return {
    // named after the kept id (yours-<hex>), never after its title: undo can only ever take out its own file
    name: k.id, title: k.title, view: "list",
    about: `yours · from ${k.from.count} ${what} since ${dayOf(k.from.first)} · in Build it fills your box, never sends`,
    source: { from: "rows", rows }, verbs: ["look"], ceiling: "look",
  };
}
const pieceFile = (cwd: string, name: string) => join(cwd, pieces.DIR, `${name}.json`);
/** the pattern that keeps every kept thing's piece out of the folder's git: one `git add -A` must not publish a person's
 *  past values (the folder may be a team's repo). Written to the repository's own .git/info/exclude, which is never
 *  shared and never tracked, so no file of the team's changes */
export const IGNORE = "yours-*";
/** the repository a folder is in: its root and its git folder (a worktree's .git file points to it), or null */
export function repoOf(cwd: string): { root: string; git: string } | null {
  const r = findRepo(cwd);
  return r === "unknown" ? null : r;
}
/** as repoOf, and "unknown" when a .git is there but cannot be read: then nothing may be written into the folder */
function findRepo(cwd: string): { root: string; git: string } | null | "unknown" {
  for (let d = cwd, i = 0; i < 40; i++) {
    const g = join(d, ".git");
    try {
      if (existsSync(g)) {
        const t = statSync(g).isDirectory() ? null : readFileSync(g, "utf8");
        const m = t ? /^gitdir:\s*(.+)$/m.exec(t) : null;
        const git = m ? (isAbsolute(m[1].trim()) ? m[1].trim() : join(d, m[1].trim())) : g;
        // a worktree's own git folder shares info/exclude with its main repository (commondir)
        let common = git; try { const c = readFileSync(join(git, "commondir"), "utf8").trim(); if (c) common = isAbsolute(c) ? c : join(git, c); } catch { /* not a worktree */ }
        return { root: d, git: common };
      }
    } catch { return "unknown"; }
    const up = dirname(d); if (up === d) return null; d = up;
  }
  return null;
}
/** the exclude line in place before any piece file is written: true when the folder is safe to write into (not in a
 *  repository, or its exclude says so); false when a .git is there and cannot be read or written: write nothing */
export function ignoreKept(cwd: string, name = "yours-00000000"): boolean {
  const r = findRepo(cwd);
  if (r === "unknown") return false;
  if (!r) return true;   // not in a repository: nothing can publish it
  try {
    const rel = relative(r.root, join(cwd, pieces.DIR)).split(sep).join("/");
    // the folder's own name is matched as written: a [, *, ? or \\ in it is not a pattern
    const line = `/${rel.replace(/[[\]*?\\!#]/g, (c) => `\\${c}`)}/${IGNORE}`;
    const f = join(r.git, "info", "exclude");
    let t = ""; try { t = readFileSync(f, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") return false; }
    if (!t.split(/\r?\n/).includes(line)) {
      mkdirSync(dirname(f), { recursive: true });
      appendFileSync(f, `${t && !t.endsWith("\n") ? "\n" : ""}# Build keeps these for one person (#1089): never shared\n${line}\n`);
    }
    // git itself says whether this piece's own path is ignored: a "!" line in the team's .gitignore outranks the exclude,
    // and a file the repo already tracks is never ignored (so it is never written with his values). Asked once per path
    // and kept a few minutes: git runs on the engine's thread
    const path = `${rel}/${name}.json`, key = `${r.root}\n${path}`, was = ignoredSeen.get(key);
    if (was && Date.now() - was.at < IGNORED_MS) return was.ok;
    let ok = false, sure = true;
    try { execFileSync("git", ["-C", r.root, "check-ignore", "-q", "--", path], { stdio: "ignore", timeout: 3000 }); ok = true; }
    catch (e) { ok = false; sure = typeof (e as { status?: unknown }).status === "number"; }   // a timeout is no answer
    if (sure) ignoredSeen.set(key, { ok, at: Date.now() });
    return ok;
  } catch { return false; }
}
const ignoredSeen = new Map<string, { ok: boolean; at: number }>();
const IGNORED_MS = 5 * 60_000;
/** a recipe with its own sum: the hash of every other field as written. A file whose sum no longer matches was changed
 *  by hand, and Build never writes over it. Taken over the recipe as part 3 checks and writes it (its fields, order and
 *  pulse filled in), so the file's text is what was summed */
export function summed(r: Record<string, unknown>): Record<string, unknown> {
  const { sum: _, ...raw } = r;
  const c = pieces.readRecipe(raw);
  const rest = ("error" in c ? raw : c) as Record<string, unknown>;
  return { ...rest, sum: sumOf(rest) };
}
const sumOf = (r: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 16);
/** the file is as Build wrote it last (pure over its text): its sum matches the rest */
export function untouched(text: string): boolean {
  try { const { sum, ...rest } = JSON.parse(text) as Record<string, unknown>; return typeof sum === "string" && sum === sumOf(rest); } catch { return false; }
}
/** a piece file is this kept thing's own: its name is the kept id and its recipe says so (pure over the file's text) */
export function owns(text: string, k: Pick<Kept, "id" | "piece">): boolean {
  if (!k.piece || k.piece !== k.id || !/^yours-[0-9a-f]{8}$/.test(k.id)) return false;
  try { const r = JSON.parse(text) as { name?: unknown; ceiling?: unknown }; return r?.name === k.id && r?.ceiling === "look"; } catch { return false; }
}
/** the piece file is Build's to replace or take out: its own (name, ceiling) and as Build wrote it (its sum matches).
 *  A piece from before sums (no "sum" at all) is taken as Build's once; its next write gives it one */
function mine(k: Kept): boolean {
  if (!k.piece || !k.cwd) return false;
  try {
    const t = readFileSync(pieceFile(k.cwd, k.piece), "utf8");
    return owns(t, k) && (untouched(t) || !("sum" in (JSON.parse(t) as object)));
  } catch { return false; }
}
/** take out a kept thing's piece file, only when it is Build's: a file changed by hand stays */
function dropPiece(k: Kept): boolean {
  if (!k.piece || !k.cwd) return false;
  const f = pieceFile(k.cwd, k.piece);
  try { if (!existsSync(f) || !mine(k)) return false; rmSync(f); return true; } catch { return false; }
}
/** a piece file is in the folder that Build left as it was (changed by hand, or not Build's): the face says "your file
 *  stays" where it would say undone, forgotten or changed */
export function stays(k: Pick<Kept, "piece" | "cwd" | "id">): boolean {
  if (!k.piece || !k.cwd) return false;
  return existsSync(pieceFile(k.cwd, k.piece)) && !mine(k as Kept);
}
/** write the kept thing's piece into the folder, with the folder's pieces on only (the face says so: `pieces`);
 *  quietly nothing when the folder is not one, or the write fails */
export function placePiece(k: Kept, cwd: string): string | undefined {
  if (!cwd || !existsSync(cwd)) return undefined;
  if (!ignoreKept(cwd, k.id)) return undefined;   // not ignored by git (or a repository we cannot read): not written at all
  const r = summed(recipeOf(k));
  const made = pieces.make(cwd, r);
  return made.piece || !made.error ? String(r.name) : undefined;
}
/** undo takes the piece out of the folder (its recipe kept in yours.json); bring it back writes it again */
function pieceUndo(k: Kept) {
  if (!k.piece || !k.cwd) return;
  try {
    if (k.undone) { if (dropPiece(k)) pieces.load(k.cwd); }
    else if (!existsSync(pieceFile(k.cwd, k.piece)) && ignoreKept(k.cwd, k.piece)) pieces.make(k.cwd, summed(recipeOf(k)));
  } catch { /* the folder moved: the kept thing still stands in Build */ }
}
/** forget a kept thing for good: its page closed, its piece out of the folder, its row out of yours.json */
export function forget(id: string, by = "you"): { forgot: string; stays: boolean } {
  const f = load();
  const k = f.kept.find((x) => x.id === id);
  if (!k) throw new Error(`nothing kept as ${id}`);
  const block = k.spec.shape !== "pin" && k.spec.shape !== "layout" ? stage.getBlock(k.project, id) : null;
  if (block && block.state !== "dead") stage.place({ project: k.project, sessionId: k.sessionId, by }, { id, close: true });
  if (dropPiece(k) && k.cwd) { try { pieces.load(k.cwd); } catch { /* moved */ } }
  f.kept = f.kept.filter((x) => x.id !== id);
  save();
  return { forgot: id, stays: stays(k) };
}

// ---------------------------------------------------------------- the wire (work/wire.ts sends every work.yours.*)

export type Reply = (o: object) => void;
/** the folder an ask belongs to (#1131): the run's, when the engine knows it. A brand-new session's first ask comes at
 *  the send, while its run is still opening, and whoFor falls back to the engine's own folder: then the folder the face
 *  sent with it (an absolute path), which is the one the session opens in (pure) */
export const folderOf = (known: string | undefined, sent: unknown, own = process.cwd()): string => {
  const s = typeof sent === "string" && sent.startsWith("/") ? sent : "";
  return known && (known !== own || !s) ? known : s || known || "";
};
const BLANK_SPEC: Spec = { shape: "button", title: "Your tool", fields: [], template: "", size: "m", accent: "pearl", said: [] };
/** one message from the face; the face asks only with `build.yours` on */
export async function hear(m: { type: string; [k: string]: unknown }, reply: Reply, whoFor: (sessionId: string) => Promise<stage.Who & { cwd?: string }> = stage.whoFor) {
  // the engine checks the switch too: the face says it is on with every ask (`on`), else nothing is read or kept
  if (m.on !== true) return reply({ error: "build.yours is off" });
  // any ask (a session opening asks for its shelf) starts the background read, so the next send finds it read
  warm();
  try {
    const sid = String(m.sessionId ?? "");
    switch (m.type) {
      case "work.yours.offer": {
        // a send heard from Build: this session is one the person typed in (its asks are theirs from now on)
        if (typeof m.said === "string" && sid) {
          const f = load(), was = f.typed?.[sid], key = sentKey(m.said), list = Array.isArray(was) ? was : [];
          if (!list.includes(key)) f.typed = { ...(f.typed ?? {}), [sid]: [...list, key].slice(-200) };
          // its words too, for the list: the turn may fail and leave no transcript line (the walk of 2026-11-13, a 401)
          const text = m.said.trim().slice(0, SENT_MAX), cwd = folderOf(await whoFor(sid).then((x) => x.cwd, () => undefined), m.cwd);
          if (text && !(f.sent ?? []).some((x) => x.session === sid && sentKey(x.text) === key)) f.sent = [...(f.sent ?? []), { session: sid, cwd, at: Date.now(), text }].slice(-SENT_KEEP);
          save();
          // only the record (an offer already stands on the line): nothing judged, so no offer is marked shown unseen
          if (m.record === true) return reply({ offer: null, versions: [] });
        }
        if (typeof m.id === "string") {   // by hand, from the list: that offer and its versions, no send needed
          const o = offerByHand(m.id, sid ? await whoFor(sid).then((x) => x.cwd, () => undefined) : undefined);
          if (!o) return reply({ offer: null, versions: [] });
          const { versions, lead, doubt } = await shaped(o);
          return reply({ offer: o, versions, lead, doubt });
        }
        const who = await whoFor(sid);
        const o = await offerJudged(folderOf(who.cwd, m.cwd), typeof m.said === "string" ? m.said.slice(0, 8000) : undefined, Date.now(), layOf(m.lay));
        if (!o) return reply({ offer: null, versions: [] });
        const seenNow = withSaid(o, typeof m.said === "string" ? m.said : undefined);
        const { versions, lead, doubt } = await shaped(seenNow);
        return reply({ offer: seenNow, versions, lead, doubt });
      }
      case "work.yours.seen": return reply({ seen: seen(String(m.id), m.how === "no" ? "no" : "later") });
      case "work.yours.adjust": {
        const spec = cleanSpec(m.spec, BLANK_SPEC), words = String(m.words ?? "");
        // the plain words adjust knows, on this machine; other words stay (the face keeps them selected, the presses beat).
        // What they say never leaves the machine: a model reading them is the person's own agent's, in their session
        return reply(adjust(spec, words));
      }
      case "work.yours.page": return reply({ page: pageOf(cleanSpec(m.spec, BLANK_SPEC)) });
      case "work.yours.keep": {
        const who = await whoFor(sid);
        const o = offerById(String(m.id), String(who.cwd ?? ""));
        if (!o) return reply({ error: "that offer is gone" });
        const r = keep({ project: who.project, sessionId: sid, by: who.by.replace(/'s agent/, "") }, o, m.spec as Spec);
        // a piece in the folder only with the folder's pieces on (build.pieces), and never in the engine's own folder (the
        // folder whoFor falls back to when the session's is unknown)
        const piece = m.pieces === true && r.kept.shape !== "layout" && who.cwd && who.cwd !== process.cwd() ? placePiece(r.kept, String(who.cwd)) : undefined;
        if (piece) { r.kept.piece = piece; r.kept.cwd = String(who.cwd); const f = load(); const x = f.kept.find((y) => y.id === r.kept.id); if (x) { x.piece = piece; x.cwd = r.kept.cwd; } save(); }
        return reply({ ...r, where: piece ? join(pieces.DIR, `${piece}.json`) : null });
      }
      case "work.yours.undo": { const k = undo(String(m.id)); return reply({ kept: k, stays: stays(k) }); }
      case "work.yours.change": { const k = change(String(m.id), m.spec); return reply({ kept: k, stays: stays(k) }); }
      case "work.yours.unchange": { const k = unchange(String(m.id)); return reply({ kept: k, stays: stays(k) }); }
      case "work.yours.forget": return reply(forget(String(m.id)));
      case "work.yours.sent": return reply({ learn: sent(String(m.id), String(m.text ?? "")) });
      case "work.yours.learn": { const k = m.no === true ? decline(String(m.id), String(m.form ?? "")) : learn(String(m.id), String(m.form ?? "")); return reply({ kept: k, stays: stays(k) }); }
      case "work.yours.lay": {   // the kept look changed to another layout (a press on its glyph)
        const k = load().kept.find((x) => x.id === String(m.id));
        const l = layOf(m.lay);
        if (!k || !l) return reply({ error: "no such look" });
        k.spec = { ...k.spec, lay: l }; save();
        return reply({ kept: k });
      }
      case "work.yours.shelf": { const who = await whoFor(sid); return reply({ shelf: shelf(who.project) }); }
      case "work.yours.list": {
        const named = (p: { id: string }) => { const o = last.get(p.id); return { sentence: o?.sentence ?? "", title: o ? versionsOf(o)[0]?.title ?? "" : "" }; };
        // the open folder's asks first: the session open in Build says where (as an offer knows it), else `cwd`
        const cwd = typeof m.cwd === "string" ? m.cwd : sid ? await whoFor(sid).then((x) => x.cwd, () => undefined) : undefined;
        if (!byHand) await freshen();   // an ask sent a minute ago is a row (the tests' own source reads nothing)
        const r = reading();
        const top = r ? [] : found(undefined, 3, cwd).map((o) => ({ id: o.id, ...(o.count === 1 ? { since: onceWhen(o.first) } : {}), opening: (o.examples[0] ?? "").slice(0, 80), title: versionsOf(o)[0]?.title ?? "", count: o.count, first: o.first, sentence: o.sentence, kind: o.kind, blanks: versionsOf(o)[0]?.fields.slice(0, 2).map((x) => ({ name: x.name, value: x.value })) ?? [] }));
        return reply({ stuck: cantSave(), kept: kept().map((k) => ({ ...k, stays: stays(k) })), passed: passed().map((p) => ({ ...p, ...named(p) })), noticed: noticed().map((p) => ({ ...p, ...named(p) })), reading: r, read: readCount(), found: top });
      }
      case "work.yours.again": again(String(m.id)); return reply({ ok: true });
      default: return reply({ error: `unknown ${m.type}` });
    }
  } catch (err) { return reply({ error: err instanceof Error ? err.message : String(err) }); }
}
