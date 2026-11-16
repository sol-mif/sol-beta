// Ship (#33, #418): the face's side of a new release. One store per page, on the page's one socket (socket.ts link,
// shared with everything else; nothing here is fenced). It holds:
//   the offer   team.stable { sha, tag, by, mine, behind, channel } from the engine (a release on this Sol's channel,
//               this checkout behind it); asked once on every link up (team.stable.get), so a window opened later still
//               learns it. A dev release installs itself at a quiet moment (engine/src/team/ship.ts), so a dev offer
//               stands here only when it could not (a */mine Sol, a dirty tree)
//   Later       a sha put off on this Mac: localStorage, so the notch and the window (same app, same storage) agree,
//               the `storage` event carrying a Later from one to the other; it lasts 12 hours, then the offer is back
//   the asks    teamAsk (team.update, and other modules' team.* asks) with a rid, answered by the same type and rid
import { useEffect, useSyncExternalStore } from "react";
import { link, type Link } from "../socket";
import { ENGINE } from "../useEngine";

// count (#425, a */mine Sol): how many of the release's changes this Sol does not have yet, "N behind"
export type Offer = { sha: string; tag: string; by: string; mine: string; behind: boolean; channel: "dev" | "beta"; count?: number };
// Carrying one's own changes over (#425, engine team/carry.ts, PROTOCOL.md round 70): when they do not go onto the
// release by themselves. session: a side copy and a session carry them; ready: Use it; failed: set aside or stay;
// moving: the Sol moves over at a quiet moment. `said` is the words, plain, as the engine says them.
export type CarryStage = "session" | "ready" | "failed" | "moving";
export type Carry = { stage: CarryStage; kind: "update" | "back"; said: string; tag?: string; aside?: string; session?: string };
export type Aside = { name: string; at: string; left: number; pushed: boolean };
// what Update is doing, shown in place of the offer's line: the words, and whether it went wrong (then only Later)
export type Doing = { said: string; failed?: boolean; updating?: boolean; carrying?: boolean } | null;

const LATER_KEY = "sol.stable.later", LATER_MS = 12 * 3600_000;

type State = { offer: Offer | null; doing: Doing; later: Record<string, number>; carry: Carry | null };
let S: State = { offer: null, doing: null, later: readLater(), carry: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { S = { ...S, ...p }; for (const f of [...subs]) f(); };

function readLater(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(LATER_KEY) || "{}");
    const now = Date.now(), out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === "number" && v > now) out[k] = v;
    return out;
  } catch { return {}; }
}

// ---- the link: one subscription per page, made the first time anything here is used ----
let L: Link | null = null;
const waits = new Map<string, (m: any) => void>();
function wire(): Link | null {
  if (typeof WebSocket === "undefined") return null;
  if (L) return L;
  const l = link(ENGINE);
  L = l;
  l.on((m) => {
    if (!m || typeof m.type !== "string" || !m.type.startsWith("team.")) return;
    const w = m.rid != null ? waits.get(String(m.rid)) : undefined;
    if (w) { waits.delete(String(m.rid)); w(m); }
    if (m.type === "team.stable") take(m);
    if (m.type === "team.carry") takeCarry(m);
  });
  l.onLink((up) => { if (up) { l.send({ type: "team.stable.get" }); l.send({ type: "team.carry.get" }); } });
  window.addEventListener("storage", (e) => { if (e.key === LATER_KEY) set({ later: readLater() }); });
  return l;
}

function take(m: any) {
  if (typeof m.sha !== "string" || !/^[0-9a-f]{40}$/.test(m.sha)) { if (!S.doing?.updating) set({ offer: null, doing: null }); return; }
  const offer: Offer = { sha: m.sha, tag: String(m.tag ?? ""), by: String(m.by ?? ""), mine: String(m.mine ?? ""), behind: !!m.behind, channel: m.channel === "dev" ? "dev" : "beta", ...(typeof m.count === "number" && m.count > 0 ? { count: m.count } : {}) };
  // a new release clears the words of the last update; the same one (answered) keeps them for a moment
  set({ offer, doing: S.offer?.sha === offer.sha ? S.doing : null });
}

const STAGES: CarryStage[] = ["session", "ready", "failed", "moving"];
/** team.carry from the engine: the carry under way, or `stage: null` when there is none (exported for the tests) */
export function takeCarry(m: any) {
  if (!STAGES.includes(m?.stage)) { if (S.carry) set({ carry: null, doing: S.doing?.carrying ? null : S.doing }); return; }
  const carry: Carry = { stage: m.stage, kind: m.kind === "back" ? "back" : "update", said: String(m.said ?? ""), ...(m.tag ? { tag: String(m.tag) } : {}), ...(m.aside ? { aside: String(m.aside) } : {}), ...(m.session ? { session: String(m.session) } : {}) };
  set({ carry, doing: { said: carry.said, carrying: true, failed: carry.stage === "failed" } });
}

let n = 0;
type Answer<T> = T & { error?: string };
/** one ask of the engine, answered by its type and rid; a timeout or a closed socket answers { error } */
export function teamAsk<T = Record<string, unknown>>(type: string, body: object = {}, ms = 30_000): Promise<Answer<T>> {
  const l = wire();
  const no = (error: string) => ({ error }) as Answer<T>;
  if (!l) return Promise.resolve(no("Sol is not connected"));
  const rid = `ship-${Date.now().toString(36)}-${++n}`;
  return new Promise((res) => {
    const t = window.setTimeout(() => { waits.delete(rid); res(no("no answer from Sol")); }, ms);
    waits.set(rid, (m) => { window.clearTimeout(t); res(m); });
    if (!l.send({ type, rid, ...body })) { window.clearTimeout(t); waits.delete(rid); res(no("Sol is not connected")); }
  });
}

// ---- the asks ----
/** the words for a release (pure): "dev release" or "stable" */
export const releaseWord = (o: Pick<Offer, "channel">) => (o.channel === "dev" ? "dev release" : "stable");

/** Update: fast-forward this checkout to the offered release; the engine renews itself after when its code changed */
export async function update(): Promise<void> {
  const o = S.offer;
  if (!o || S.doing?.updating) return;
  set({ doing: { said: `updating to the new ${releaseWord(o)}…`, updating: true } });
  const r = await teamAsk<{ ok?: boolean; renews?: boolean }>("team.update", {}, 180_000);
  // #425: own changes that clash go to a carry (team.carry follows with the same words); its words are the line
  const c = (r as { carry?: unknown }).carry;
  if (c && typeof c === "object") { takeCarry(c); return; }
  if (r.error || !r.ok) { set({ doing: { said: `could not update: ${r.error || "no reason given"}`, failed: true } }); return; }
  set({ doing: { said: r.renews ? "updated; Sol renews in a moment" : `updated to the new ${releaseWord(o)}` } });
  window.setTimeout(() => { if (S.offer?.sha === o.sha && !S.doing?.updating) set({ offer: { ...o, behind: false }, doing: null }); }, 6000);
}

// ---- carrying own changes over (#425): the person's three answers, and the asides ----
const carryAsk = async (type: string, body: object = {}) => {
  const r = await teamAsk<{ ok?: boolean }>(type, body, 300_000);
  if (r.error) set({ doing: { said: r.error, failed: true, carrying: !!S.carry } });
  return r;
};
/** Use it: the Sol moves to what the session carried over, once nothing is at work in it */
export const useCarried = () => carryAsk("team.carry.use");
/** Set aside and update: the Sol as it stands is kept under a name of its own, then it updates */
export const setAside = () => carryAsk("team.carry.aside");
/** Stay as I am: nothing moves; the next release is offered, with how far behind */
export async function stay() { const r = await carryAsk("team.carry.stay"); if (r.ok) set({ carry: null, doing: null }); return r; }
/** what was set aside (Settings), each with how many of its changes are not in this Sol */
export async function asides(): Promise<Aside[]> {
  const r = await teamAsk<{ asides?: Aside[] }>("team.asides");
  return Array.isArray(r.asides) ? r.asides : [];
}
/** bring back: an aside's changes carried onto the Sol as it is now, by the same steps */
export const bringBack = (name: string) => carryAsk("team.aside.back", { name });

/** Later: this release is put off on this Mac for 12 hours (both the notch and the window) */
export function later(sha = S.offer?.sha) {
  if (!sha) return;
  const l = { ...readLater(), [sha]: Date.now() + LATER_MS };
  try { localStorage.setItem(LATER_KEY, JSON.stringify(l)); } catch { /* private mode */ }
  set({ later: l, doing: null });
}

export type Shown = Offer & { doing: Doing; carry: Carry | null };
/** the offer to show now: behind it, and not put off; with what Update is doing, if anything. A carry under way is
 * shown even with no offer (bring back has none), and Later never hides it */
export function shown(s: State = S): Shown | null {
  const o = s.offer;
  if (s.carry) return { ...(o ?? { sha: "", tag: "", by: "", mine: "", behind: false, channel: "beta" as const }), doing: s.doing?.carrying ? s.doing : { said: s.carry.said, carrying: true, failed: s.carry.stage === "failed" }, carry: s.carry };
  if (!o) return null;
  if (s.doing) return { ...o, doing: s.doing, carry: null };
  if (!o.behind || (s.later[o.sha] ?? 0) > Date.now()) return null;
  return { ...o, doing: null, carry: null };
}

export function useStable(): Shown | null {
  useEffect(() => { wire(); }, []);
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => S);
  return shown(s);
}
