// One way to move between layers (#1416, objective 1 step 10): every place in Cowork is an address on one history.
// A place is { project, part, path }: the project is one the engine reads (team.state's rooms), never a constant; the
// part is one a team's Cowork registers (registerPart), built in or its own; the path is the part's own children (a
// cluster, a record, a detail), named by the part. A page opened from a place (an issue, a change) is a layer of it,
// `out`, drawn in the app with the crumbs back. Crumbs, back and forward (⌘[ ⌘]) and Esc-up are this file's, so a part
// nobody here wrote gets them by registering. Nothing in here knows a project, a login or a tab.
//
// The pure parts (the history, the crumbs, going up, the address in the URL and in storage) are tested in
// src/cowork-place.test.ts; the store at the foot is what the shell reads.
import { useSyncExternalStore } from "react";
import { openUrl } from "../util.ts";

export type Out = { url: string; label: string };
/** an address. project "" with a project's part: the project in use, not read yet (settle fills it) */
export type Place = { project: string; part: string; path: string[]; out?: Out };
/** a part: its words, how it names a child (the path up to that child), and whether it stands above any project
 *  (an anchor: what is yours across projects) */
export type PartSpec = { label: string; childLabel?: (path: string[]) => string; anchor?: boolean };
export type Crumb = { label: string; to: Place };

export const ROOT: Place = { project: "", part: "", path: [] };
/** how many places the history keeps */
export const KEEP = 60;

// ---- the parts and their children's names ----

const parts = new Map<string, PartSpec>();
const named = new Map<string, Map<string, string>>();
const projectNames = new Map<string, string>();
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

/** a part joins Cowork: its crumbs, its rail row, its children's names. Registered again, it is replaced */
export function registerPart(part: string, spec: PartSpec) { parts.set(part, spec); tell(); }
/** the parts in the order they were registered */
export const partsOf = (): [string, PartSpec][] => [...parts];
export const partOf = (part: string): PartSpec | undefined => parts.get(part);
/** a part says what its children are called as it reads them (a cluster's id → its name); the crumbs use them */
export function nameChildren(part: string, names: Record<string, string>) {
  const m = named.get(part) ?? new Map<string, string>();
  let changed = false;
  for (const [k, v] of Object.entries(names)) if (m.get(k) !== v) { m.set(k, v); changed = true; }
  named.set(part, m);
  if (changed) tell();
}
/** the projects as the engine read them, id → name */
export function nameProjects(names: Record<string, string>) {
  let changed = false;
  for (const [k, v] of Object.entries(names)) if (projectNames.get(k) !== v) { projectNames.set(k, v); changed = true; }
  if (changed) tell();
}
const childWords = (part: string, path: string[]) => {
  const own = parts.get(part)?.childLabel?.(path);
  if (own) return own;
  const id = path[path.length - 1] ?? "";
  return named.get(part)?.get(id) ?? id;
};

// ---- the pure parts ----

export const samePlace = (a: Place | undefined, b: Place | undefined) =>
  !!a && !!b && a.project === b.project && a.part === b.part && a.path.length === b.path.length && a.path.every((x, i) => x === b.path[i]) && a.out?.url === b.out?.url;

const anchored = (part: string) => !!parts.get(part)?.anchor;

/** the crumbs of a place, root first: Cowork › project › part › each child › the page opened over it (pure but for
 *  the names the parts and the engine gave) */
export function crumbsOf(p: Place, project = (id: string) => projectNames.get(id) ?? id): Crumb[] {
  const out: Crumb[] = [{ label: "Cowork", to: ROOT }];
  const anchor = anchored(p.part);
  if (!anchor && (p.project || p.part)) out.push({ label: p.project ? project(p.project) : "…", to: { project: p.project, part: "", path: [] } });
  if (p.part) out.push({ label: parts.get(p.part)?.label ?? p.part, to: { project: anchor ? "" : p.project, part: p.part, path: [] } });
  p.path.forEach((_, i) => { const path = p.path.slice(0, i + 1); out.push({ label: childWords(p.part, path), to: { ...p, out: undefined, path } }); });
  if (p.out) out.push({ label: p.out.label, to: p });
  return out.map((c) => (c.to.out === undefined ? { ...c, to: { project: c.to.project, part: c.to.part, path: c.to.path } } : c));
}

/** one layer up: the page over the place, then the path's last child, then the part, the project, Cowork; null at the root */
export function upOf(p: Place): Place | null {
  if (p.out) return { project: p.project, part: p.part, path: p.path };
  if (p.path.length) return { project: p.project, part: p.part, path: p.path.slice(0, -1) };
  if (p.part) return anchored(p.part) ? ROOT : { project: p.project, part: "", path: [] };
  if (p.project) return ROOT;
  return null;
}

export type History = { stack: Place[]; i: number };
export const fresh = (p: Place = ROOT): History => ({ stack: [p], i: 0 });
export const here = (h: History): Place => h.stack[h.i] ?? ROOT;
/** a new place: what was ahead of here is dropped, the same place again is no move */
export function go(h: History, p: Place): History {
  if (samePlace(here(h), p)) return h;
  const stack = [...h.stack.slice(0, h.i + 1), p].slice(-KEEP);
  return { stack, i: stack.length - 1 };
}
export const back = (h: History): History => (h.i > 0 ? { ...h, i: h.i - 1 } : h);
export const forward = (h: History): History => (h.i < h.stack.length - 1 ? { ...h, i: h.i + 1 } : h);
export const up = (h: History): History => { const u = upOf(here(h)); return u ? go(h, u) : h; };
/** the project in use, once the engine said it: every place that waited for it ("" with a project's part) takes it */
export function settle(h: History, project: string): History {
  if (!project) return h;
  let changed = false;
  const stack = h.stack.map((p) => { if (p.project || !p.part || anchored(p.part)) return p; changed = true; return { ...p, project }; });
  return changed ? { ...h, stack } : h;
}

const isPlace = (x: unknown): x is Place => {
  const p = x as Place;
  return !!p && typeof p.project === "string" && typeof p.part === "string" && Array.isArray(p.path) && p.path.every((s) => typeof s === "string")
    && (p.out === undefined || (typeof p.out?.url === "string" && typeof p.out?.label === "string"));
};
/** a kept history, read back; anything else is a fresh one */
export function readHistory(raw: string | null): History {
  try {
    const h = JSON.parse(raw ?? "") as History;
    if (Array.isArray(h?.stack) && h.stack.length && h.stack.every(isPlace) && Number.isInteger(h.i) && h.i >= 0 && h.i < h.stack.length) return h;
  } catch { /* not kept, or not ours */ }
  return fresh();
}
/** ?cowork=<part>[/<child>…] opens that place (a still of each part, a link from a session); a part not registered is no place */
export function askedPlace(search: string): Place | null {
  const v = new URLSearchParams(search).get("cowork");
  if (!v) return null;
  const [part, ...path] = v.split("/").filter(Boolean);
  if (!part || !parts.has(part)) return null;
  return { project: "", part, path };
}

/** the path words of a sign-in, a sign-out or a grant: such a page opens in the person's browser, never under Sol's logins */
const SIGN_IN = new Set(["login", "logout", "signin", "sign-in", "signout", "sign-out", "signup", "sign-up", "session", "sessions", "oauth", "authorize", "auth", "sso"]);
/** the sites a page of Cowork's may open on inside Sol, each with its subdomains: where the rows link today (issues,
 *  changes, comments). Another site opens in the person's browser until it is named here */
export const IN_APP_SITES = ["github.com"];
/** whether a page may open inside Sol as a layer (#1464 review): https, the default port, no user or password, a named
 *  host (not an address, not this machine) on one of IN_APP_SITES, and no sign-in path; anything else opens in the
 *  person's browser (pure) */
export function opensInApp(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (!IN_APP_SITES.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  const word = (s: string) => { try { return decodeURIComponent(s).toLowerCase(); } catch { return s.toLowerCase(); } };
  return !u.pathname.split("/").some((s) => SIGN_IN.has(word(s)));
}

// ---- the store: one history for the window, kept in sessionStorage ----

/** where a window's first Cowork opens: the first anchor part registered (what is yours across projects), else Cowork */
export const startOf = (): Place => { const a = [...parts].find(([, s]) => s.anchor)?.[0]; return a ? { project: "", part: a, path: [] } : ROOT; };

const KEPT = "sol.cowork.place";
let h: History | null = null;
const load = (): History => {
  if (h) return h;
  let kept: string | null = null;
  try { kept = sessionStorage.getItem(KEPT); } catch { /* private, or no window */ }
  h = readHistory(kept);
  if (!kept) h = fresh(startOf());
  const asked = typeof location === "undefined" ? null : askedPlace(location.search);
  if (asked) h = go(h, asked);
  return h;
};
const set = (next: History) => {
  if (next === h) return;
  h = next;
  try { sessionStorage.setItem(KEPT, JSON.stringify(next)); } catch { /* private */ }
  tell();
};
export const place = {
  now: (): Place => here(load()),
  history: (): History => load(),
  go: (p: Place) => set(go(load(), p)),
  /** the same part, another path: a child chosen inside a part */
  path: (path: string[]) => { const p = here(load()); set(go(load(), { project: p.project, part: p.part, path })); },
  /** a page over the place, drawn in the app (an issue, a change), with the crumbs back; a page opensInApp refuses goes
   *  to `elsewhere` (the person's browser) and the place stays */
  open: (url: string, label: string, elsewhere: (url: string) => void = openUrl) => {
    if (!opensInApp(url)) { elsewhere(url); return; }
    const p = here(load()); set(go(load(), { project: p.project, part: p.part, path: p.path, out: { url, label } }));
  },
  back: () => set(back(load())),
  forward: () => set(forward(load())),
  up: () => set(up(load())),
  settle: (project: string) => set(settle(load(), project)),
  /** for a test: forget the window's history */
  reset: (to?: History) => { h = to ?? fresh(); tell(); },
};
let version = 0;
subs.add(() => { version++; });
const watch = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** the place now, and a draw again when it, a part or a name changes */
export function usePlace(): { at: Place; canBack: boolean; canForward: boolean; crumbs: Crumb[] } {
  useSyncExternalStore(watch, () => version);
  const hh = load(), at = here(hh);
  return { at, canBack: hh.i > 0, canForward: hh.i < hh.stack.length - 1, crumbs: crumbsOf(at) };
}
/** the place in words, its last crumb (the "↩ Cowork" chip says where it goes back to) */
export const placeWords = () => { const c = crumbsOf(place.now()); return c.map((x) => x.label).slice(1).join(" › ") || "Cowork"; };

/** the keys: ⌘[ back, ⌘] forward, Esc one layer up; never while a person types or an open block holds the focus (pure) */
export function keyMove(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented?: boolean }, focus: { typing: boolean; inBlock: boolean }): "back" | "forward" | "up" | null {
  if (e.defaultPrevented || e.altKey || e.ctrlKey) return null;
  if (e.metaKey && !e.shiftKey && e.key === "[") return "back";
  if (e.metaKey && !e.shiftKey && e.key === "]") return "forward";
  if (!e.metaKey && !e.shiftKey && e.key === "Escape" && !focus.typing && !focus.inBlock) return "up";
  return null;
}
/** whether a move goes anywhere from here (pure): a key that cannot is left to whoever else listens */
export const canMove = (h: History, m: "back" | "forward" | "up") => (m === "back" ? h.i > 0 : m === "forward" ? h.i < h.stack.length - 1 : upOf(here(h)) !== null);
/** what has the focus, for keyMove: a field, or an open stage block (its own keys) */
export function focusOf(el: Element | null): { typing: boolean; inBlock: boolean } {
  if (!el) return { typing: false, inBlock: false };
  const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable === true;
  return { typing, inBlock: !!el.closest?.("[data-stage] [data-block], [data-block-open]") };
}
