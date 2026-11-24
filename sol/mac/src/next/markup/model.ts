// Mark up (BR1, #1615; the BR1 design of 2026-11-22 ~00:20, mine/look/br1/customize.html "Point at it moves to the chat
// bar"): the first entry of the chat bar's attach menu. The person presses things in Sol itself, a folder or a piece, and
// types a few words on each; every mark is pinned to its thing, never drawn on a flat picture. Sending gives the session
// the marks, each { thing id, words }, with what Sol knows of each thing: live, the engine reads them (next.markup.read,
// engine next/markup.ts) into the message, said to the session open now or to a new one in the first marked folder
// (work.say); on the fixture the same words are made here and put in the session's thread. MarkUp.tsx draws it.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { D, S, MODE, regionOf, render, type Piece } from "../cv/core.ts";
import { titleOf } from "../plane/layout.ts";
import { engine } from "../cv/wire/near.ts";
import { said } from "../bar/undo.ts";
import { place } from "../layers.ts";

export type Kind = "folder" | "piece" | "session";
/** what a press landed on: the thing's id and what the face knows of it */
export type Thing = { thing: string; kind: Kind; name: string; in: string | null; session?: string };
/** shot: the id of the screenshot the mark was pinned on (the attach menu's Screenshot of the app), never a point on it */
export type Mark = Thing & { words: string; shot?: string };
/** what the attach menu put in the message: the app's screenshot, a photo or a file; path is where the engine kept it
 *  (null on the fixture), url a picture for the card */
export type Att = { id: string; kind: "shot" | "photo" | "file"; name: string; path: string | null; url: string | null };

export const MAX_MARKS = 12;
/** the canvas's own things only: a press on the bar, a card, a dialog or Mark up itself is never a mark */
const NOT_THINGS = "#bar,#bar-card,#talk,[data-frame-line],[role=dialog],.mu-ui";

/** a mark sent: its number in that message, pinned on its thing until the session's reply says the number is done */
export type Out = { n: number; thing: string; kind: Kind; name: string; done: boolean };
/** on: marking (the hand pins things); the marks stay in the bar after Esc until they are sent or taken back. out: the
 *  pins of the last message sent, each fading as its change lands. shooting: the stills are being taken, nothing of
 *  Mark up is drawn */
export const mu = { on: false, marks: [] as Mark[], hover: null as Thing | null, text: "", sending: false, sent: null as { text: string; to: string } | null,
  files: [] as Att[], pinOn: null as string | null, out: [] as Out[], shooting: false };
const subs = new Set<() => void>();
let version = 0;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const versionNow = () => version;
const tell = () => { version++; subs.forEach((f) => f()); };

/** a CSS attribute selector for one value */
const at = (name: string, v: string) => `[${name}="${v.replace(/["\\]/g, "\\$&")}"]`;
/** where a thing is drawn: a piece by its id, a folder by its card at Far or its body nearer (as fit mode finds them) */
export const selOf = (t: Pick<Thing, "thing" | "kind">) => (t.kind === "folder" ? `${at("data-region", t.thing)},.pl-area${at("data-area", t.thing)}` : at("data-piece", t.thing));
/** the element a selector finds, on the canvas first: a folder's sidebar row comes before its card in the page */
export const elOf = (sel: string): Element | null => document.querySelector("#view")?.querySelector(sel) ?? document.querySelector(sel);

/** what an element is, for Mark up: the piece that holds it, else the folder; null for anything else */
export function thingAt(el: Element | null): Thing | null {
  if (!el?.closest || el.closest(NOT_THINGS)) return null;
  const pe = el.closest("[data-piece]") as HTMLElement | null, p: Piece | undefined = pe ? D.pieces[pe.dataset.piece ?? ""] : undefined;
  if (pe && p) {
    const session = p.kind === "session" ? String(p.sessionId ?? p.id) : undefined;
    return { thing: p.id, kind: session ? "session" : "piece", name: p.kind === "session" ? titleOf(p) : p.name, in: p.region ?? null, ...(session ? { session } : {}) };
  }
  const re = el.closest("[data-region]") as HTMLElement | null, body = re ? null : (el.closest(".pl-area[data-area]") as HTMLElement | null);
  const rid = re?.dataset.region ?? body?.dataset.area, r = rid ? regionOf(rid) : undefined;
  return r ? { thing: r.id, kind: "folder", name: r.name, in: null } : null;
}

/** the first time marking is on, a tip under its strip says what Mark up is (markup.html, "Tutorial tip"); once a thing
 *  is pinned or marking ends it has been read, kept in the window's storage. With no storage, no tip */
export const TIP_WORDS = "Press anything to pin a note to it. Sol gets the thing, not a picture.";
const TIP_KEY = "sol.markup.tip";
export const tipDue = (): boolean => { try { const v = globalThis.localStorage?.getItem(TIP_KEY); return v !== undefined && v !== "1"; } catch { return false; } };
const tipRead = (): void => { try { globalThis.localStorage?.setItem(TIP_KEY, "1"); } catch { /* storage refused: it shows again next time */ } };

/** Mark up on (the attach menu's entry, ⇧⌘M) or off; off forgets the marks */
export function markUp(on = true): void {
  mu.on = on; mu.hover = null;
  if (!on) { mu.marks = []; mu.text = ""; mu.sending = false; mu.files = []; mu.pinOn = null; tipRead(); }
  tell();
  if (on) mountNow();
}
const mountNow = () => { if (typeof document !== "undefined") void import("./mount.ts").then((m) => m.mount()); };
/** Esc: marking ends, the marks stay in the bar until they are sent or taken back; with none, all of it closes */
export function endMarking(): void {
  if (!mu.marks.length && !mu.files.length) return markUp(false);
  mu.on = false; mu.hover = null; mu.pinOn = null; tipRead(); tell();
}
/** ⇧⌘M from anywhere: marking starts, or ends when it is on */
export const toggleMarking = () => (mu.on ? endMarking() : markUp(true));
/** something of Mark up is drawn: marking, marks waiting in the bar, or sent pins waiting for their change */
export const shown = () => mu.on || mu.marks.length > 0 || mu.files.length > 0 || mu.out.length > 0;

/** what a thing is, in a few words, as the hand's outline and a note say it: "a folder", "a page in Client sites" */
export function whatOf(t: Pick<Thing, "thing" | "kind" | "in">): string {
  const r = t.in ? regionOf(t.in) : undefined, inn = r ? ` in ${r.name}` : t.kind === "folder" ? "" : " on the canvas";
  if (t.kind === "folder") { const up = regionOf(t.thing)?.parent; const pr = up ? regionOf(up) : undefined; return pr ? `a folder in ${pr.name}` : "a folder"; }
  if (t.kind === "session") return `a session${inn}`;
  return `${PIECE_W[D.pieces[t.thing]?.kind ?? ""] ?? "a piece"}${inn}`;
}
const PIECE_W: Record<string, string> = { page: "a page", doc: "a page", sticky: "a note", note: "a note", code: "a piece of code", stills: "a set of stills", row: "a row", block: "a block", diary: "a piece", life: "a piece" };
/** the name the outline carries before the press: "Menu prices · a page in Client sites" */
export const nameLine = (t: Pick<Thing, "thing" | "kind" | "in" | "name">) => `${t.name} · ${whatOf(t)}`;

/** the numbers a reply says are done: "1 done", "① done", "#2 is done", "marks 1 and 3 are done", "done: 2, 3" */
export function doneIn(text: string, max = MAX_MARKS): number[] {
  const CIRC = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫", out = new Set<number>();
  const t = text.replace(/[①-⑫]/g, (c) => String(CIRC.indexOf(c) + 1));
  const list = String.raw`#?\d{1,2}(?:\s*(?:,|and|&)\s*#?\d{1,2})*`, nums = (s: string) => (s.match(/\d{1,2}/g) ?? []).map(Number);
  for (const m of t.matchAll(new RegExp(String.raw`(?:\b(?:marks?|pins?)\s+)?(${list})\s+(?:is\s+|are\s+)?(?:now\s+)?done\b`, "gi"))) nums(m[1]).forEach((n) => out.add(n));
  for (const m of t.matchAll(new RegExp(String.raw`\bdone\s*:\s*(${list})`, "gi"))) nums(m[1]).forEach((n) => out.add(n));
  return [...out].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
}
/** a reply from the session the marks went to: the numbers it says are done fade, and go once faded */
export function heard(session: string, text: string): number[] {
  if (!mu.out.length || mu.sent?.to !== session) return [];
  const ns = doneIn(text, mu.out.length).filter((n) => mu.out.some((o) => o.n === n && !o.done));
  if (!ns.length) return [];
  mu.out = mu.out.map((o) => (ns.includes(o.n) ? { ...o, done: true } : o)); tell();
  setTimeout(() => { mu.out = mu.out.filter((o) => !o.done); tell(); }, FADE_MS);
  return ns;
}
export const FADE_MS = 1200;
/** the line the session is asked to answer by, so each pin can go as its change lands */
export const DONE_ASK = "When a mark's change is made, say its number and “done” (as in “1 done”), so its pin clears.";
/** a press on a thing: a new mark, or the one already on it (its index) */
export function press(t: Thing): number {
  const i = mu.marks.findIndex((m) => m.thing === t.thing);
  if (i >= 0) return i;
  if (mu.marks.length >= MAX_MARKS) return -1;
  mu.marks = [...mu.marks, { ...t, words: "", ...(mu.pinOn ? { shot: mu.pinOn } : {}) }];
  tipRead(); tell();
  return mu.marks.length - 1;
}
/** an attachment in the message; a screenshot is pinned on next: each press after it is a pin on the thing under it */
export function attach(a: Att): void {
  mu.files = [...mu.files.filter((f) => f.id !== a.id), a];
  if (a.kind === "shot") mu.pinOn = a.id;
  if (!mu.on) markUp(true); else tell();
}
export function detach(id: string): void {
  mu.files = mu.files.filter((f) => f.id !== id);
  if (mu.pinOn === id) mu.pinOn = null;
  mu.marks = mu.marks.map((m) => (m.shot === id ? (({ shot: _s, ...rest }) => rest)(m) : m));
  tell();
}
/** the attachments as lines of the message: each its kind, name and path; a screenshot says which marks are pinned on it */
export function filesText(files: readonly Att[] = mu.files, marks: readonly Mark[] = mu.marks): string[] {
  if (!files.length) return [];
  const what = { shot: "Screenshot of the app", photo: "Photo", file: "File" } as const;
  return ["Attached:", ...files.map((f) => {
    const pins = marks.map((m, i) => (m.shot === f.id ? i + 1 : 0)).filter(Boolean);
    const on = f.kind === "shot" && pins.length ? ` (${pins.length === 1 ? `mark ${pins[0]} is` : `marks ${pins.join(", ")} are`} pinned on it, each on the thing under it)` : "";
    return `- ${f.kind === "shot" ? what.shot : `${what[f.kind]} “${f.name}”`}${f.path ? `: ${f.path}` : ""}${on}`;
  })];
}
export function hover(t: Thing | null): void { if (mu.hover?.thing !== t?.thing) { mu.hover = t; tell(); } }

// ---------------------------------------------------------------- by keys (BR1 item 5, builder F)
// With the card open and the keys not in a field, Tab and the arrows move a ring between the things drawn on the canvas
// (Tab in reading order, an arrow to the nearest one that way), Enter marks the ringed one and puts the cursor in its
// words, Esc leaves; MarkUp.tsx holds the keys.

/** the thing the keys ring, its id; null until Tab or an arrow is pressed */
export const kb = { at: null as string | null };
export function ringAt(id: string | null): void { if (kb.at !== id) { kb.at = id; tell(); } }
export type Seen = { t: Thing; x: number; y: number; w: number; h: number };
/** the things drawn in the view now, each once, in reading order (rows top to bottom, then left to right) */
export function thingsOnScreen(): Seen[] {
  const view = document.getElementById("view"), vr = view?.getBoundingClientRect();
  if (!view || !vr) return [];
  const out = new Map<string, Seen>();
  for (const el of view.querySelectorAll("[data-piece],[data-region],.pl-area[data-area]")) {
    const t = thingAt(el), r = el.getBoundingClientRect();
    if (!t || out.has(t.thing) || !r.width || !r.height || r.right <= vr.left || r.left >= vr.right || r.bottom <= vr.top || r.top >= vr.bottom) continue;
    out.set(t.thing, { t, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return readingOrder([...out.values()]);
}
type Box = { x: number; y: number; w: number; h: number };
const over = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const holds = (a: Box, b: Box) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
/** where a mark's note hangs: a pop-up beside its thing, each side placed by the root's place() (layers.ts) in the
 *  order under, right, above, left; the first that covers no thing (its own too) and no note already placed, else the
 *  one covering least. A thing that holds this one (its folder's area) does not count. `busy` adds what else a spot
 *  covers (a card that is no thing, as the Diary). */
export function noteAt(b: Box, size: { w: number; h: number }, room: Box, others: readonly Box[], busy: (r: Box) => number = () => 0, gap = 6): { x: number; y: number } {
  const near = others.filter((o) => !holds(o, b) || holds(b, o));
  let best: { x: number; y: number } | null = null, least = Infinity;
  for (const side of ["below", "right", "above", "left"] as const) {
    const p = place(b, size, room, side, gap), cost = near.reduce((n, o) => n + over(p, o), 0) + busy(p);
    if (cost === 0) return { x: p.x, y: p.y };
    if (cost < least) { least = cost; best = { x: p.x, y: p.y }; }
  }
  return best!;
}

/** rows first: two things whose tops are within half the smaller's height are one row, read left to right */
export function readingOrder<T extends { x: number; y: number; h: number }>(s: T[]): T[] {
  return [...s].sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
}
export type Way = "next" | "prev" | "left" | "right" | "up" | "down";
/** the thing a key goes to from `at`: Tab the next in reading order (round), an arrow the nearest whose centre lies that
 *  way, a step across counting double; from nothing, the first (or for prev the last) */
export function stepTo<T extends { t: { thing: string }; x: number; y: number; w: number; h: number }>(s: T[], at: string | null, way: Way): T | null {
  if (!s.length) return null;
  const i = s.findIndex((x) => x.t.thing === at);
  if (i < 0) return way === "prev" || way === "up" || way === "left" ? s[s.length - 1] : s[0];
  if (way === "next") return s[(i + 1) % s.length];
  if (way === "prev") return s[(i - 1 + s.length) % s.length];
  const c = (x: T) => ({ x: x.x + x.w / 2, y: x.y + x.h / 2 }), o = c(s[i]);
  let best: T | null = null, bd = Infinity;
  for (const x of s) {
    if (x === s[i]) continue;
    const p = c(x), dx = p.x - o.x, dy = p.y - o.y;
    const along = way === "right" ? dx : way === "left" ? -dx : way === "down" ? dy : -dy, across = way === "right" || way === "left" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) continue;
    const d = along + 2 * across;
    if (d < bd) { bd = d; best = x; }
  }
  return best ?? s[i];
}
export function words(i: number, w: string): void { if (mu.marks[i]) { mu.marks = mu.marks.map((m, j) => (j === i ? { ...m, words: w } : m)); tell(); } }
export function unmark(i: number): void { mu.marks = mu.marks.filter((_, j) => j !== i); tell(); }
/** a chip's × is named by its mark's words (cut after a whole word), or by its thing when it has none */
export function removeName(m: Pick<Mark, "name" | "words">): string {
  const w = m.words.trim().replace(/\s+/g, " ");
  if (!w) return `Remove “${m.name}” from your message`;
  if (w.length <= 40) return `Remove your note “${w}”`;
  const sp = w.slice(0, 41).lastIndexOf(" ");
  return `Remove your note “${(sp > 0 ? w.slice(0, sp) : w.slice(0, 40)).replace(/[\s,.;:–-]+$/, "")}…”`;
}
export function setText(w: string): void { mu.text = w; tell(); }

/** the marks as they ride in the message: each { thing, words } and what the face knows of the thing */
export const marksOut = (marks: readonly Mark[] = mu.marks) => marks.map(({ thing, words, kind, name, in: inn, session }) => ({ thing, words: words.trim(), kind, name, in: inn, ...(session ? { session } : {}) }));

/** where the message goes: the session open now, else a new session in the first marked folder that has a path */
export function targetOf(marks: readonly Mark[] = mu.marks): { session: string; piece: string | null; fresh: boolean; cwd?: string; folder?: string } {
  const p = S.piece ? D.pieces[S.piece] : undefined;
  if (p && p.kind === "session") return { session: String(p.sessionId ?? p.id), piece: p.id, fresh: false };
  const folder = marks.map((m) => (m.kind === "folder" ? m.thing : m.in)).find((x): x is string => !!x && !!regionOf(x)?.path);
  return { session: uuid(), piece: null, fresh: true, ...(folder ? { cwd: regionOf(folder)!.path as string, folder } : {}) };
}
/** where the message goes, in words */
export function toWords(to: ReturnType<typeof targetOf>): string {
  if (!to.fresh) return "to this session";
  return to.folder ? `to a new session in ${regionOf(to.folder)?.name ?? to.folder}` : "to a new session";
}
const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `mu-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** the message's first line: the person's words for all, else the marks' own words; a new session is named from it */
export const leadOf = (words: string, marks: readonly Pick<Mark, "words">[]) => words.trim() || marks.map((m) => m.words.trim()).filter(Boolean).join("; ");

/** the message on the fixture (the engine's next/markup.ts textOf says the same, with what Sol knows) */
export function textHere(words: string, marks: readonly Mark[]): string {
  const where = (m: Mark) => (m.kind === "folder" ? `the folder “${m.name}” (${m.thing})` : `the ${m.kind} “${m.name}” (${m.session ? `session ${m.session}` : m.thing}${m.in ? `, in ${regionOf(m.in)?.name ?? m.in}` : ""})`);
  const lines = marks.map((m, i) => `${i + 1}. On ${where(m)}${m.words.trim() ? `: “${m.words.trim()}”` : ""}.`);
  return [leadOf(words, marks), `I marked ${marks.length === 1 ? "one thing" : `${marks.length} things`} in Sol; each mark is on the thing itself:`, ...lines].filter(Boolean).join("\n");
}

/** a still of one marked thing, as work.say carries an image */
export type Still = { name: string; mime: "image/png"; dataBase64: string };
const STILL_W = 640, PAD = 8;
/** where each still is cut from a window shot of w × h pixels: the box in the window's points, times the shot's scale;
 *  a shot taller than the window (a title bar) is cut from its bottom part */
export function cutOf(box: { x: number; y: number; w: number; h: number }, shot: { w: number; h: number }, win: { w: number; h: number }) {
  const k = shot.w / win.w, top = Math.max(0, shot.h - win.h * k);
  const x = Math.max(0, (box.x - PAD) * k), y = Math.max(0, top + (box.y - PAD) * k);
  return { x, y, w: Math.min(shot.w, (box.x + box.w + PAD) * k) - x, h: Math.min(shot.h, top + (box.y + box.h + PAD) * k) - y };
}
const fileName = (n: number, name: string) => `${n} ${name.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "thing"}.png`;
/** live only: one window shot (next.attach.shot, without Mark up drawn on it), cut into a still of each marked thing in
 *  view; none when the window cannot be shot. perm: refused for Screen Recording */
async function stillsOf(marks: readonly Mark[]): Promise<{ stills: Still[]; perm: boolean }> {
  const none = { stills: [], perm: false };
  if (typeof document === "undefined" || typeof Image === "undefined") return none;
  const boxes = marks.map((m) => { const r = elOf(selOf(m))?.getBoundingClientRect(); return r && r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; });
  if (!boxes.some(Boolean)) return none;
  mu.shooting = true; tell();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const { askShot } = await import("./attach-state.ts");
  const r = await askShot().finally(() => { mu.shooting = false; tell(); });
  if (!r?.ok || !r.url) return { stills: [], perm: !!r?.perm };
  const img = new Image();
  try { img.src = r.url; await img.decode(); } catch { return none; }
  const win = { w: window.innerWidth, h: window.innerHeight }, shot = { w: img.naturalWidth, h: img.naturalHeight };
  const stills: Still[] = [];
  boxes.forEach((b, i) => {
    if (!b) return;
    const c = cutOf(b, shot, win), k = Math.min(1, STILL_W / c.w), cv = document.createElement("canvas");
    if (c.w < 2 || c.h < 2) return;
    cv.width = Math.round(c.w * k); cv.height = Math.round(c.h * k);
    cv.getContext("2d")?.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    stills.push({ name: fileName(i + 1, marks[i].name), mime: "image/png", dataBase64: cv.toDataURL("image/png").replace(/^data:[^,]*,/, "") });
  });
  return { stills, perm: false };
}

/** the replies of the session the marks went to, heard while pins wait for their change (live) */
let listening: (() => void) | null = null, on: unknown = null;
function listen(): void {
  const e = MODE === "live" ? engine() : null;
  if (!e || (listening && on === e)) return;
  listening?.(); on = e;
  listening = e.subscribe((m: { type?: string; sessionId?: string; item?: { kind?: string; text?: unknown } }) => {
    if (m?.type === "work.item" && m.sessionId && m.item?.kind === "you" && typeof m.item.text === "string") heard(m.sessionId, m.item.text);
    if (!mu.out.length && listening) { listening(); listening = null; }
  });
}

type Read = { type?: string; rid?: string; ok?: boolean; text?: string; why?: string };
/** Send: live, the engine reads the marks into the message and it is said to the session; then Mark up closes. False
 *  when there is nothing to send or the engine is away */
export async function send(ms = 8000): Promise<boolean> {
  if ((!mu.marks.length && !mu.files.length) || mu.sending) return false;
  const marks = [...mu.marks], files = [...mu.files], words = mu.text.trim(), to = targetOf(marks);
  mu.sending = true; tell();
  let text = marks.length ? textHere(words, marks) : words, noStills = false;
  // after the marks, the attachments; a still of each marked thing when there is one; then how the pins clear
  const tail = (stills: number) => [...filesText(files, marks), ...(stills ? [`A still of each marked thing is attached, named by its number.`] : []), ...(marks.length ? [DONE_ASK] : [])];
  if (MODE === "live") {
    const e = engine();
    if (!e) { mu.sending = false; tell(); said("Sol’s engine is away, so the marks were not sent; they are still here", null); return false; }
    const rid = `mu-${Date.now().toString(36)}`;
    const shot = marks.length ? stillsOf(marks) : Promise.resolve({ stills: [] as Still[], perm: false });
    const r = !marks.length ? null : await new Promise<Read | null>((res) => {
      const t = setTimeout(() => { off(); res(null); }, ms);
      const off = e.subscribe((m: Read) => { if (m?.type === "next.markup" && m.rid === rid) { clearTimeout(t); off(); res(m); } });
      e.send({ type: "next.markup.read", rid, text: leadOf(words, marks), marks: marksOut(marks) });
    });
    if (r?.ok && typeof r.text === "string") text = r.text;   // no answer: the face's own words, without what Sol knows
    const { stills, perm } = await shot.catch(() => ({ stills: [] as Still[], perm: false }));
    noStills = perm;
    text = [text, ...tail(stills.length)].filter(Boolean).join("\n");
    if (!e.send({ type: "work.say", sessionId: to.session, text, ...(stills.length ? { files: stills } : {}), ...(to.fresh ? { fresh: true, opening: true, ...(to.cwd ? { cwd: to.cwd } : {}) } : {}) })) {
      mu.sending = false; tell(); said("Sol’s engine is away, so the marks were not sent; they are still here", null); return false;
    }
  } else {
    text = [text, ...tail(0)].filter(Boolean).join("\n");
    const p = to.piece ? D.pieces[to.piece] : undefined;
    if (p) { (p.talk = p.talk || []).push("you: " + text); render(); }
  }
  mu.sent = { text, to: to.session };
  // each mark stays a pin on its thing until the session says its number is done (heard)
  mu.out = marks.map((m, i) => ({ n: i + 1, thing: m.thing, kind: m.kind, name: m.name, done: false }));
  listen();
  const n = marks.length + files.length, what = !files.length ? (n === 1 ? "One mark" : `${n} marks`) : !marks.length ? (n === 1 ? "One attachment" : `${n} attachments`) : `${marks.length} ${marks.length === 1 ? "mark" : "marks"} and ${files.length} ${files.length === 1 ? "attachment" : "attachments"}`;
  said(`${what} sent ${to.fresh ? "to a new session" : "to this session"}${noStills ? " (no stills: Sol needs Screen Recording)" : ""}`, null);
  markUp(false);
  return true;
}
