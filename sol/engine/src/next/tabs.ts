// Tabs on the canvas (#1615 BR1; next/protocol/TABS.md): what the person has taken out of the canvas to a tab. A tab is
// another view of a piece that keeps its place on the canvas, so closing one puts nothing anywhere: the piece was never
// moved. The Canvas tab is always first and is not kept (front: null is the Canvas). One file, SOL_HOME/next/tabs.json
// { v: 1, tabs, front, taken, quiet }, written whole each time and a broken one set aside (file.ts, as pos.ts keeps its
// places). `taken` counts the tabs the person took out today per kind of piece, and `quiet` is the day they said "Keep
// in place", so Sol offers "open them as tabs" once and never twice in a day.
//   next.tab.open { id, front?, by, kind? }   next.tab.close { id }   next.tab.front { id }   next.tab.quiet { kind }
// A folder can be kept as a tab (#1879 step 2): its id is `folder:<the folder's id>` and its kind "folder"; the window
// opens the folder's page form for it. It is a tab like any other (kept, fronted, closed), but no piece, and it is not
// counted toward the offer to "open them as tabs" (that offer is for sessions and pages).
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type By = "person" | "ai";
/** a tab: the piece's id as the window knows it, who took it out, its kind when said, and `fresh` while an AI's tab
 *  has not been in front yet (the window marks it ✦) */
export type Tab = { id: string; by: By; kind?: string; fresh?: true; at: number };
export type Tabs = { tabs: Tab[]; front: string | null; taken: Record<string, { day: string; n: number }>; quiet: Record<string, string> };
export type Answer = ({ ok: true } & Tabs & { aside?: string }) | { ok: false; why: string };

/** the Canvas tab's id: never kept, never closed */
export const CANVAS = "canvas";
/** a folder kept as a tab: its id starts with this, and its kind is "folder" */
export const FOLDER = "folder:";
const FOLDER_KIND = "folder";
const isFolderId = (id: string) => id.startsWith(FOLDER) && id.length > FOLDER.length;
/** the kind a tab keeps: a folder's id is always "folder", and "folder" is only for a folder's id */
const kindFor = (id: string, kind: string | undefined): string | undefined => (isFolderId(id) ? FOLDER_KIND : kind === FOLDER_KIND ? undefined : kind);
/** at most this many tabs; the oldest the person did not front last goes first */
export const MOST = 40;
const BY: By[] = ["person", "ai"];
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 300 && !/[\u0000-\u001f]/.test(v);
const okKind = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(v);
const okDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const tabsFile = (home: string) => join(nextDir(home), "tabs.json");
/** the day on this Mac, as the counts are kept */
export const dayOf = (now: number) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function cleanTab(v: unknown): Tab | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (!okId(t.id) || t.id === CANVAS || !BY.includes(t.by as By)) return null;
  const kind = kindFor(t.id, okKind(t.kind) ? t.kind : undefined);
  return { id: t.id, by: t.by as By, ...(kind ? { kind } : {}), ...(t.fresh === true ? { fresh: true as const } : {}), at: typeof t.at === "number" && Number.isFinite(t.at) ? t.at : 0 };
}

/** every tab kept, in order; aside: the broken file's new name, when this read set one aside */
export function readTabs(home: string): Tabs & { aside?: string } {
  const { data, aside } = readJson(tabsFile(home));
  const tabs: Tab[] = [], seen = new Set<string>();
  for (const v of Array.isArray(data.tabs) ? data.tabs : []) { const t = cleanTab(v); if (t && !seen.has(t.id)) { seen.add(t.id); tabs.push(t); } }
  const front = okId(data.front) && seen.has(data.front) ? data.front : null;
  const taken: Tabs["taken"] = {}, quiet: Tabs["quiet"] = {};
  if (data.taken && typeof data.taken === "object") for (const [k, v] of Object.entries(data.taken as Record<string, unknown>)) {
    const c = v as { day?: unknown; n?: unknown } | null;
    if (okKind(k) && c && okDay(c.day) && typeof c.n === "number" && c.n >= 0) taken[k] = { day: c.day, n: Math.floor(c.n) };
  }
  if (data.quiet && typeof data.quiet === "object") for (const [k, v] of Object.entries(data.quiet as Record<string, unknown>)) if (okKind(k) && okDay(v)) quiet[k] = v;
  return { tabs, front, taken, quiet, ...(aside ? { aside } : {}) };
}

const write = (home: string, t: Tabs) => writeJson(tabsFile(home), { v: 1, tabs: t.tabs, front: t.front, taken: t.taken, quiet: t.quiet });
const msgOf = (m: unknown) => (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
const answer = (t: Tabs, aside?: string): Answer => ({ ok: true, tabs: t.tabs, front: t.front, taken: t.taken, quiet: t.quiet, ...(aside ? { aside } : {}) });

/** next.tab.open: the piece taken out to a tab (one tab per piece; opening one already there only fronts it when
 *  asked). A tab an AI opens is never put in front here: it arrives in the background, fresh, and the window fronts it
 *  only when the person is not typing. Each tab the person takes out counts once toward today's offer for its kind. */
export function openTab(home: string, m: unknown, now = Date.now()): Answer {
  const x = msgOf(m);
  if (!okId(x.id)) return { ok: false, why: "a tab needs the id of the piece it shows" };
  if (x.id === CANVAS) return { ok: false, why: "the Canvas is always the first tab" };
  if (!BY.includes(x.by as By)) return { ok: false, why: "a tab is opened by the person or an AI" };
  const by = x.by as By, kind = kindFor(x.id, okKind(x.kind) ? x.kind : undefined);
  const was = readTabs(home), t: Tabs = { ...was, tabs: [...was.tabs], taken: { ...was.taken } };
  const at = t.tabs.findIndex((y) => y.id === x.id);
  // `swapped`: the piece stood under another id until now (a new session's starter, once started): its tab gives up its
  // place in the row, the front, and its count, so a ⌘N counts once, as a session, not once as a page and once more
  const si = okId(x.swapped) && x.swapped !== x.id ? t.tabs.findIndex((y) => y.id === x.swapped) : -1;
  const old = si >= 0 ? t.tabs.splice(si, 1)[0] : undefined;
  if (old) {
    if (t.front === old.id) t.front = x.id;
    const c = old.by === "person" && old.kind ? t.taken[old.kind] : undefined;
    if (c && c.day === dayOf(old.at) && c.n > 0) t.taken[old.kind!] = { day: c.day, n: c.n - 1 };
  }
  if (at < 0) {
    const tab: Tab = { id: x.id, by, ...(kind ? { kind } : {}), ...(by === "ai" ? { fresh: true as const } : {}), at: now };
    if (old) t.tabs.splice(si, 0, tab); else t.tabs.push(tab);
    if (by === "person" && kind && kind !== FOLDER_KIND) {
      const day = dayOf(now), c = t.taken[kind];
      t.taken[kind] = { day, n: c && c.day === day ? c.n + 1 : 1 };
    }
    while (t.tabs.length > MOST) { const i = t.tabs.findIndex((y) => y.id !== t.front && y.id !== x.id); if (i < 0) break; t.tabs.splice(i, 1); }
  }
  if (x.front === true && by === "person") { t.front = x.id; t.tabs = t.tabs.map((y) => (y.id === x.id && y.fresh ? { id: y.id, by: y.by, ...(y.kind ? { kind: y.kind } : {}), at: y.at } : y)); }
  write(home, t);
  return answer(t, was.aside);
}

/** next.tab.close: the tab closed; the piece is where it always was on the canvas. The tab in front closing brings the
 *  Canvas to the front. `closed` is the tab as it was, so an Undo can open it again just so. */
export function closeTab(home: string, m: unknown): Answer & { closed?: Tab } {
  const x = msgOf(m);
  if (x.id === CANVAS) return { ok: false, why: "the Canvas tab can't be closed" };
  if (!okId(x.id)) return { ok: false, why: "say which tab to close" };
  const was = readTabs(home), closed = was.tabs.find((y) => y.id === x.id);
  if (!closed) return { ...answer(was, was.aside) };
  const t: Tabs = { ...was, tabs: was.tabs.filter((y) => y.id !== x.id), front: was.front === x.id ? null : was.front };
  write(home, t);
  return { ...answer(t, was.aside), closed } as Answer & { closed?: Tab };
}

/** next.tab.front: a tab brought to the front; the Canvas is { id: "canvas" } (or null). A fresh AI tab, once in front,
 *  is no longer fresh. */
export function frontTab(home: string, m: unknown): Answer {
  const x = msgOf(m);
  const was = readTabs(home);
  if (x.id === CANVAS || x.id === null || x.id === undefined) { const t = { ...was, front: null }; write(home, t); return answer(t, was.aside); }
  if (!okId(x.id) || !was.tabs.some((y) => y.id === x.id)) return { ok: false, why: "that tab isn't open" };
  const t: Tabs = { ...was, front: x.id, tabs: was.tabs.map((y) => (y.id === x.id && y.fresh ? { id: y.id, by: y.by, ...(y.kind ? { kind: y.kind } : {}), at: y.at } : y)) };
  write(home, t);
  return answer(t, was.aside);
}

/** next.tab.quiet: "Keep in place" on the offer for a kind; Sol does not ask again today */
export function quietTabs(home: string, m: unknown, now = Date.now()): Answer {
  const x = msgOf(m);
  if (!okKind(x.kind)) return { ok: false, why: "say which kind of piece" };
  const was = readTabs(home), t: Tabs = { ...was, quiet: { ...was.quiet, [x.kind]: dayOf(now) } };
  write(home, t);
  return answer(t, was.aside);
}

/** after this many tabs of one kind taken out in a day, Sol offers to open that kind as tabs */
export const OFFER_AT = 4;
/** the kinds Sol may offer for today: taken out OFFER_AT times or more today, and not quieted today (pure) */
export function offerable(t: Tabs, now = Date.now()): string[] {
  const day = dayOf(now);
  return Object.entries(t.taken).filter(([k, c]) => c.day === day && c.n >= OFFER_AT && t.quiet[k] !== day).map(([k]) => k);
}
