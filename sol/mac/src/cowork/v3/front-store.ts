// Cowork v3, slice 2 (fr-30, #555): the face's one read of the front, a project's Space and Plan, and the one count.
// The engine answers team.v3.front / team.v3.plan / team.v3.needsme by rid (team/v3/planwire.ts); every answer carries
// the same count, so the front, the stage chip and the notch never disagree. One store per window, polled while
// something shows it, and read again at once after any write.
import { useEffect, useSyncExternalStore } from "react";

export type State = "open" | "doing" | "review" | "blocked" | "done";
export type Item = { id: string; project: string; title: string; state: State; date?: string; place: string; whose: string; madeBy: string;
  from: string[]; dateWhy?: string; at: string; handedBy?: string };
export type Loose = { id: string; project: string; kind: string; title: string; whose: string; place: string; meta?: string; at: string };
export type Need = { kind: "ask" | "hand" | "yes"; id: string; project: string; from: string; line: string; item?: string };
export type Next = { label: string; kind: Need["kind"] | "due"; whose: string; place: string; item?: string };
export type Tile = { project: string; name: string; count: number; next: Next | null; more: number; quiet: boolean; faces: string[] };
export type Views = {
  list: string[];
  board: Record<"open" | "doing" | "review" | "done", string[]>;
  calendar: { days: { day: string; ids: string[] }[]; undated: string[] };
  timeline: { rows: { id: string; start: string; end: string }[]; undated: string[] };
};
export type Front = { me: string; today: string; count: number; tiles: Tile[]; held: Record<string, string[]> };
export type Plan = { me: string; today: string; count: number; project: string; name: string; items: Item[]; loose: Loose[]; views: Views;
  rooms: string[]; needs: Need[] };
type Ask = <T = any>(type: string, body?: object, wait?: number) => Promise<T>;

let ask: Ask | null = null;
let front: Front | null = null;
const plans = new Map<string, Plan>();
const subs = new Set<() => void>();
let ver = 0;
const changed = () => { ver++; subs.forEach((f) => f()); };

async function readFront() {
  if (!ask) return;
  const r = await ask<Front & { error?: string }>("team.v3.front");
  if (r && !r.error && Array.isArray(r.tiles)) { front = r; changed(); }
}
async function readPlan(project: string) {
  if (!ask || !project) return;
  const r = await ask<Plan & { error?: string }>("team.v3.plan", { project });
  if (r && !r.error && Array.isArray(r.items)) { plans.set(project, r); if (front) front = { ...front, count: r.count }; changed(); }
}
const again = (project?: string) => Promise.all([readFront(), project ? readPlan(project) : Promise.resolve()]);

/** one write to a project's plan: its answer is the plan after it, and the front and the count are read again */
export async function write<T = Record<string, unknown>>(project: string, op: "drop" | "toItem" | "undo" | "move", body: object): Promise<{ error?: string; result?: T }> {
  if (!ask) return { error: "not connected" };
  const r = await ask<Plan & { error?: string; result?: T }>("team.v3.plan", { project, op, ...body });
  if (!r || r.error) return { error: r?.error ?? "no answer" };
  plans.set(project, r); changed();
  void readFront();
  return { result: r.result };
}

/** the front and the count; a project's plan when one is named. Read now, then every 20 s while shown */
export function useV3(a: Ask, project?: string) {
  ask = a;
  const v = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => ver);
  useEffect(() => {
    void again(project);
    const t = window.setInterval(() => void again(project), 20_000);
    return () => window.clearInterval(t);
  }, [project]);
  return { v, front, plan: project ? plans.get(project) ?? null : null, count: front?.count ?? 0, again: () => again(project) };
}

// the words and marks every v3 page shares
export const STATE_WORD: Record<State, string> = { open: "open", doing: "in progress", review: "waiting on a read", blocked: "blocked", done: "done" };
/** where a thing lives, as the creature's glyph (cowork/pixels.ts) */
export const placeGlyph = (place: string) => (({ record: "file", github: "github", drive: "doc", chat: "decisions", talk: "decisions", figma: "figma", web: "web", calendar: "calendar" } as Record<string, string>)[place] ?? "file");
export const PLACE_WORD: Record<string, string> = { record: "the project's record", github: "GitHub", drive: "Drive", chat: "Talk", talk: "Talk", figma: "Figma", web: "the web" };
/** what a loose thing is, as a glyph */
export const kindGlyph = (kind: string) => (({ note: "file", link: "web", pdf: "doc", photo: "slides", voice: "file", poll: "poll", file: "file", sheet: "sheet", slides: "slides" } as Record<string, string>)[kind] ?? "file");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toD = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const fmtDate = (iso?: string) => { if (!iso) return "no date"; const d = toD(iso); return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
export const addDays = (iso: string, n: number) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayDiff = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86_400_000);
export const dow = (iso: string) => toD(iso).getUTCDay();
export const dayNum = (iso: string) => toD(iso).getUTCDate();
export const firstName = (login: string, me: string) => (login && me && login.toLowerCase() === me.toLowerCase() ? "you" : login);

// the drag's own types: a loose thing, an item, or a thing picked up on the front
export const T_LOOSE = "application/x-sol-loose", T_ITEM = "application/x-sol-item", T_THING = "application/x-sol-thing";
