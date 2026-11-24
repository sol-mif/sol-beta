// A new version, on the canvas (BR1 lane G, 07-start-list §2 item 8): the old face said it over the composer
// (cowork/StableLine.tsx); the new face drew nothing, so a person on the new face never heard a release was out. It is
// the frame's held line (frame.tsx: one line over the bottom bar, never a toast over the canvas), up while the engine's
// team.stable says this Sol is behind, it did not install itself within STAND_MS, and the person did not put it off: Update asks team.update (the engine renews
// itself after when its code changed), Later puts this release off for 12 hours on this Mac, in the old face's own
// key (sol.stable.later), so both faces agree. Asked once on attach (team.stable.get), then heard as it comes. A carry
// (own changes that clash) is the old face's: the line says so and leaves it there.
// The frame is the shell's (Next.tsx sets stableLine.hold and .say, as canvas.ts's agentLine), so this wire loads in the
// node tests with no React. The dev page: ?stable=1 holds a made-up offer (stills). Signed: franktsai2008-eng's agent, BR1 lane G (#1615).
import { MODE, hooks } from "../core.ts";
import { asker } from "../../../agents/model.ts";
import type { Engine } from "./types.ts";

type Act = { label: string; run: () => void };
export type StableLine = { text: string; act?: Act; no?: Act } | null;
/** the frame's held line and its say, set by the shell; `now` the line held last (tests) */
export const stableLine: { hold: ((l: StableLine) => void) | null; say: ((t: string) => void) | null; now: StableLine } = { hold: null, say: null, now: null };
const hold = (l: StableLine) => { stableLine.now = l; stableLine.hold?.(l); };
const say = (t: string) => stableLine.say?.(t);
/** the shell came (or went): the line as it stands is held again */
export const redraw = () => hold(stableLine.now);

export type Offer = { sha: string; tag: string; channel: "dev" | "beta"; behind: boolean; count?: number; back?: boolean };
const LATER_KEY = "sol.stable.later", LATER_MS = 12 * 3600_000;

let offer: Offer | null = null, busy = false, gen = 0;
/** a sha whose update met the person's own changes (a carry): the old face finishes it, so it is not offered again here */
let carried = "";
/** when this window first heard each offer's sha (the line waits STAND_MS from it); a timer draws again then */
const heard = new Map<string, number>();
let standTimer: ReturnType<typeof setTimeout> | null = null;
let ask: (<T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>) | null = null;

const laterOf = (): Record<string, number> => { try { const o = JSON.parse(localStorage.getItem(LATER_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
const putOff = (sha: string): boolean => (laterOf()[sha] ?? 0) > Date.now();

/** the offer as the engine said it: a 40-hex sha, else none (pure) */
export function offerOf(m: { sha?: unknown; tag?: unknown; channel?: unknown; behind?: unknown; count?: unknown; back?: unknown }): Offer | null {
  if (typeof m.sha !== "string" || !/^[0-9a-f]{40}$/.test(m.sha)) return null;
  return { sha: m.sha, tag: typeof m.tag === "string" ? m.tag : "", channel: m.channel === "dev" ? "dev" : "beta", behind: m.behind === true,
    ...(typeof m.count === "number" ? { count: m.count } : {}), ...(m.back === true ? { back: true } : {}) };
}
/** how long an offer stands before the line says it: a release installs itself, dev and beta alike since #1615
 *  (engine team/ship.ts installRelease: at a quiet moment, at most one every 30 min), so one still standing past that
 *  could not (paused, a turn always in flight, changes not kept, a clash) and the person is told */
export const STAND_MS = 40 * 60_000;
/** the line is up (pure): behind, not put off, not carried, and either a *\/mine Sol (it counts how far behind; its own
 *  commits go on top) or an offer that stood past STAND_MS without installing itself */
export const offered = (o: Offer | null, putOffNow: boolean, carriedSha = "", stoodMs = 0): boolean =>
  !!o && o.behind && !putOffNow && o.sha !== carriedSha && (typeof o.count === "number" || stoodMs >= STAND_MS);

/** the line's words (pure): a person hears "a new version", never a channel or a tag (the tag is the title, for us) */
export const offerText = (o: Offer) => (o.back ? "Sol can go back to the version before." : "A new version of Sol is ready.");

function later(): void {
  if (!offer) return;
  try { localStorage.setItem(LATER_KEY, JSON.stringify({ ...laterOf(), [offer.sha]: Date.now() + LATER_MS })); } catch { /* a private window: it comes back next time */ }
  draw();
}

async function update(): Promise<void> {
  const o = offer;
  if (!o || busy) return;
  if (MODE === "fixture" || !ask) {   // the dev page's press only says it, then is up to date
    busy = true; hold({ text: "Updating Sol…" });
    setTimeout(() => { busy = false; offer = { ...o, behind: false }; hold(null); say("Sol is up to date."); }, 1500);
    return;
  }
  busy = true;
  const mine = gen;
  hold({ text: "Updating Sol… it may take a minute." });
  const r = await ask<{ ok?: boolean; renews?: boolean; error?: string; carry?: unknown }>({ type: "team.update" }, 180_000);
  if (mine !== gen) return;   // detached meanwhile (a renew, a closed window): the answer is nobody's here
  busy = false;
  // no answer is not a failure: the engine may still be at it, or renewing; the next team.stable says how it ended
  if (r === null) { hold({ text: "Sol is still updating, or restarting. This line goes when it is done." }); return; }
  if (r.carry) { carried = o.sha; hold(null); say("This Mac has changes of its own to Sol. Settings › Go back to the previous version finishes the update there."); return; }
  if (!r.ok) { hold({ text: `Sol could not update${r?.error ? `: ${r.error}` : ""}. Nothing changed.`, act: { label: "Try again", run: () => void update() }, no: { label: "Later", run: later } }); return; }
  offer = { ...o, behind: false };
  hold(null);
  say(r.renews ? "Sol is up to date. It restarts in a moment." : "Sol is up to date.");
}

function draw(): void {
  if (busy) return;
  const o = offer;
  const stood = o ? Date.now() - (heard.get(o.sha) ?? Date.now()) : 0;
  if (standTimer) { clearTimeout(standTimer); standTimer = null; }
  if (o && o.behind && stood < STAND_MS) { standTimer = setTimeout(draw, STAND_MS - stood + 50); (standTimer as { unref?: () => void }).unref?.(); }
  hold(o && offered(o, putOff(o.sha), carried, stood) ? { text: offerText(o), act: { label: "Update", run: () => void update() }, no: { label: "Later", run: later } } : null);
}

/** hear the offer: an answer to team.stable.get or a push */
export function take(m: { sha?: unknown; tag?: unknown; channel?: unknown; behind?: unknown; count?: unknown; back?: unknown }, at = Date.now()): void {
  offer = offerOf(m);
  if (offer && !heard.has(offer.sha)) heard.set(offer.sha, at);
  draw();
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-stable" });
  ask = a.ask;
  const off = e.subscribe((m: { type?: string }) => { if (m?.type === "team.stable") take(m as Parameters<typeof take>[0]); });
  e.send({ type: "team.stable.get" });
  const store = (ev: StorageEvent) => { if (ev.key === LATER_KEY) draw(); };
  globalThis.addEventListener?.("storage", store);
  return () => { gen++; if (standTimer) clearTimeout(standTimer); standTimer = null; off(); a.close(); ask = null; offer = null; busy = false; hold(null); globalThis.removeEventListener?.("storage", store); };
}

// the dev page: ?stable=1 holds a made-up offer, so the line can be seen and pressed with no engine
let booted = false;
hooks.onLoad.push(() => {
  if (booted || typeof location === "undefined") return;
  booted = true;
  if (MODE !== "fixture" || !new URLSearchParams(location.search).get("stable")) return;
  take({ sha: "0".repeat(40), tag: "", channel: "beta", behind: true }, Date.now() - STAND_MS);   // as if it stood past the wait
});
