// Fit mode's rules (BR1 people item 1, #1615; mine/look/br1/three.html "Fit mode: point, say or pick, see it in place,
// then Keep or Back"). Pure: what a thing in the window is when it is pointed at (a folder, a piece, a session, a part of
// the window, or all of Sol), the places a take there can be kept for (nearest first), the settings that change it, and
// what a look or a size take does to it in place. The settings and their takes are Settings' own (settings/model.ts K);
// a take is kept through the engine's next.fit.try (engine next/you-known.ts), never here.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { K, fitKnob, pointAt, scopeOfRegion, takeOf, type Knob, type Take, type World } from "../settings/model.ts";
import type { Piece, Region } from "../cv/types.ts";

export type Kind = "all" | "folder" | "piece" | "session" | "part";
/** a place a take can be kept for: All of Sol ("~"), a folder by its scope, one session ("session:<id>") */
export type Reach = { scope: string; name: string };
/** what is pointed at: its words, the element that draws it (a selector), where a take on it can be kept, and the
 *  settings that change it, most telling first */
export type Target = { kind: Kind; id: string | null; name: string; sel: string | null; reach: Reach[]; knobs: string[] };

export const ALL: Reach = { scope: "~", name: "All of Sol" };
/** the settings that change each kind of thing; a part of the window takes Settings' own list for it (POINTS) */
const BY: Record<Exclude<Kind, "part">, string[]> = {
  all: ["look", "size", "attention", "working", "marking", "writing"],
  folder: ["look", "size", "attention", "working", "writing", "marking"],
  session: ["working", "attention", "writing", "v-length", "v-register"],
  piece: ["size", "look", "marking"],
};
const fits = (ks: string[]) => ks.filter((k) => fitKnob(K[k]));

/** a CSS attribute selector for one value */
const at = (name: string, v: string) => `[${name}="${v.replace(/["\\]/g, "\\$&")}"]`;

/** a folder's scope: a project's path (w:) or a place under home (h:) as Settings scopes them; a bare id (the
 *  fixture's folders, never a live one) is its own scope */
export const scopeOf = (id: string): string | null => scopeOfRegion(id) ?? (/^[\w.-]+$/.test(id) ? id : null);

/** the folders around a folder, nearest first: a region whose scope holds this one's (folders in folders) */
function above(scope: string, regions: Region[]): Reach[] {
  const out: Reach[] = [];
  for (const r of regions) {
    const s = scopeOf(r.id);
    if (s && s !== scope && scope.startsWith(s + "/")) out.push({ scope: s, name: r.name });
  }
  return out.sort((a, b) => b.scope.length - a.scope.length);
}
function folderReach(r: Region, regions: Region[]): Reach[] {
  const s = scopeOf(r.id);
  return s ? [{ scope: s, name: r.name }, ...above(s, regions), ALL] : [ALL];
}

/** All of Sol, or the folder open now */
export function startTarget(regionId: string | null, regions: Region[]): Target {
  const r = regionId ? regions.find((x) => x.id === regionId) : undefined;
  return r ? folderTarget(r, regions) : allTarget();
}
export const allTarget = (): Target => ({ kind: "all", id: null, name: "All of Sol", sel: null, reach: [ALL], knobs: fits(BY.all) });
export function folderTarget(r: Region, regions: Region[]): Target {
  // its card at Far, its body opened nearer (plane/index.tsx .pl-area): whichever the canvas draws
  return { kind: "folder", id: r.id, name: r.name, sel: `${at("data-region", r.id)},.pl-area${at("data-area", r.id)}`, reach: folderReach(r, regions), knobs: fits(BY.folder) };
}

/** what an element in the window is, for fit mode: the piece or the folder that holds it, else the part of the window
 *  Settings knows it as; null for fit mode's own card and the bar */
export function targetOf(el: Element | null, w: World, regions: Region[], pieces: Record<string, Piece>, title: (p: Piece) => string): Target | null {
  if (!el?.closest || el.closest("#bar,#bar-card,[data-frame-line]")) return null;
  const pe = el.closest("[data-piece]") as HTMLElement | null, p = pe ? pieces[pe.dataset.piece ?? ""] : undefined;
  if (pe && p) {
    const r = regions.find((x) => x.id === p.region), up = r ? folderReach(r, regions) : [ALL], sel = at("data-piece", p.id);
    if (p.kind === "session") return { kind: "session", id: p.id, name: title(p), sel, reach: [{ scope: `session:${String(p.sessionId ?? p.id)}`, name: `This session` }, ...up], knobs: fits(BY.session) };
    return { kind: "piece", id: p.id, name: title(p), sel, reach: up, knobs: fits(BY.piece) };
  }
  const re = el.closest("[data-region]") as HTMLElement | null, body = re ? null : el.closest(".pl-area[data-area]") as HTMLElement | null;
  const rid = re?.dataset.region ?? body?.dataset.area, r = rid ? regions.find((x) => x.id === rid) : undefined;
  if (r) return folderTarget(r, regions);
  const hit = pointAt(w, el);
  if (!hit || hit.ai) return null;
  const knobs = fits(hit.k);
  if (!knobs.length) return null;
  const id = (hit.el as HTMLElement).id;
  return { kind: "part", id: id || null, name: hit.l.replace(/^the /, "The "), sel: id ? `#${CSS.escape(id)}` : null, reach: [ALL], knobs };
}

/** a knob's takes as fit mode offers them: Settings' own, an offered one only once kept */
export const takesOf = (knob: string): Take[] => (knobOf(knob)?.takes ?? []).filter((t) => !t.offered);
/** a knob and a take in words */
export const knobName = (knob: string) => knobOf(knob)?.short ?? knob;
export const takeName = (w: World, knob: string, take: string | null) => { const k = knobOf(knob); return take && k ? takeOf(w, k, take).n : "as it is"; };

/** what a look or a size take does to the thing it is tried on: the look's name (fitmode.css draws it; paper too, so a
 *  paper folder inside a night one is paper again), the size's factor (the text scale inside it); other settings change
 *  how Sol works, not how the thing looks */
export function inPlace(w: World, knob: string, take: string): { look?: string; z?: number } {
  if (knob === "look") return { look: takeOf(w, K.look, take).look || "paper" };
  if (knob === "size") return { z: takeOf(w, K.size, take).z || 1 };
  return {};
}
/** the text sizes of the scale (palette.css --t-*): fit mode scales each inside the thing a size is tried on */
export const TEXT = ["label", "pill", "body", "read", "title", "head", "big", "display", "code"];

// ---------------------------------------------------------------- Customize (mine/look/br1/customize.html, #1615)

/** a folder's colour: one of the canvas's four tints (kit/next.css --a1..--a3, --ink4), kept as a fit on the folder like
 *  a look or a size (next.fit.try takes any knob id). Customize's own, not one of Settings' settings: it is changed on
 *  the folder, never on the Settings page */
export const TINT: Record<string, string> = { lilac: "var(--a1)", coral: "var(--a2)", mint: "var(--a3)", grey: "var(--ink4)" };
export const COLOUR: Knob = { id: "colour", n: "The colour of a folder", s: "Its tint on the canvas.", short: "its colour", def: "as it comes",
  takes: [{ id: "lilac", n: "Purple", s: "" }, { id: "coral", n: "Orange", s: "" }, { id: "mint", n: "Green", s: "" }, { id: "grey", n: "Grey", s: "" }] };
/** a knob by its id: Settings' own, or a folder's colour */
export const knobOf = (id: string): Knob | undefined => (id === COLOUR.id ? COLOUR : K[id]);
/** a knob a take can be tried and kept on in place */
export const canFit = (id: string): boolean => id === COLOUR.id || fitKnob(K[id]);
/** the words that name each colour, so "make it green" finds mint */
const COLOUR_W: Record<string, string[]> = { lilac: ["lilac", "purple", "violet", "lavender"], coral: ["coral", "orange", "peach", "pink", "red", "salmon"],
  mint: ["mint", "green", "teal"], grey: ["grey", "gray", "plain", "neutral"] };
export function colourIn(words: string): string | null {
  const w = ` ${words.toLowerCase().replace(/[^a-z]+/g, " ")} `;
  for (const [id, ns] of Object.entries(COLOUR_W)) if (ns.some((n) => w.includes(` ${n} `))) return id;
  return null;
}

/** the folder the words name ("make money green"): by its whole name, else by its head (the name before a bracket, a
 *  comma or a colon: "web" for "web (repo)"), the longest first so "home lab" wins over "home"; "everything" or "the
 *  window" name the whole window (all); null when they name neither */
export function namedIn(words: string, regions: Region[]): Region | "all" | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(), w = ` ${norm(words)} `;
  const names = regions.flatMap((r) => [norm(r.name), norm(r.name.split(/[(,:]/)[0])].map((n) => ({ r, n }))).filter((x) => x.n);
  for (const { r, n } of names.sort((a, b) => b.n.length - a.n.length)) if (w.includes(` ${n} `)) return r;
  return / (everything|the window|the whole window|all of it) /.test(w) ? "all" : null;
}

/** how a choice is drawn in Customize's bar: a swatch, S/M/L, a light or night thumbnail, an "Aa" at its size */
export type Draw = "swatch" | "size" | "thumb" | "aa";
export type Row = { knob: string; label: string; draw: Draw; takes: string[] };
/** only what that thing can change, as pictures: a folder its colour and size, a piece or a session its size, the
 *  whole window light or night and the size of its text; a part of the window is the whole window */
export function choicesOf(t: Target): Row[] {
  if (t.kind === "folder") return [{ knob: "colour", label: "colour", draw: "swatch", takes: ["lilac", "coral", "mint", "grey"] }, { knob: "size", label: "size", draw: "size", takes: ["s", "m", "l"] }];
  if (t.kind === "piece" || t.kind === "session") return [{ knob: "size", label: "size", draw: "size", takes: ["s", "m", "l"] }];
  return [{ knob: "look", label: "light or night", draw: "thumb", takes: ["paper", "night"] }, { knob: "size", label: "text", draw: "aa", takes: ["s", "m", "l"] }];
}
/** the thing a press in Customize changes: a folder, a piece or a session as itself, anything else the whole window */
export const customizable = (t: Target | null): Target => (t && (t.kind === "folder" || t.kind === "piece" || t.kind === "session") ? t : allTarget());

/** Sol's tries for a thing (✦): what Sol offered for its place (an offer on next.fits, nearest place first), else the
 *  takes Settings has Sol offer (Larger after 8 pm) and a quieter look for a folder or the window; never what stands
 *  there now, two at most */
export type SolTry = { knob: string; take: string; n: string; reason: string | null };
/** a try's words where the take's own name reads as a setting, not as an idea */
const TRY_N: Record<string, string> = { "look:back": "calmer", "look:night": "night", "look:paper": "light" };
export function triesOf(w: World, t: Target, now: (knob: string) => string): SolTry[] {
  const scopes = t.reach.map((r) => r.scope), out: SolTry[] = [];
  const knobs = choicesOf(t).map((r) => r.knob);
  const add = (knob: string, take: string, reason: string | null) => {
    const x = knobOf(knob)?.takes.find((y) => y.id === take);
    if (out.length < 2 && x && canFit(knob) && take !== now(knob) && !out.some((y) => y.knob === knob && y.take === take)) out.push({ knob, take, n: TRY_N[`${knob}:${take}`] ?? x.n.toLowerCase(), reason });
  };
  for (const s of scopes) for (const f of w.fits ?? []) {
    const last = f.history[f.history.length - 1];
    if (f.scope === s && last?.act === "offer" && last.take && !f.held && knobs.includes(f.knob)) add(f.knob, last.take, last.reason ?? null);
  }
  if (knobs.includes("size")) for (const x of K.size.takes) if (x.offered) add("size", x.id, null);
  if (t.kind === "folder" || t.kind === "all") add("look", "back", null);
  return out;
}
