// The notch's green request button (fr-31, prd 6): what the notch window needs from Social, which lives in the main
// window. One small key in this Mac's storage, which both windows share: the count waiting and the jelly on top. The
// main window writes it on every change (store.ts) and clears it when Social is off (App.tsx); the notch reads it and
// hears the storage event (useNotch.ts). Nothing else crosses: no names, no requests, no grants.
import type { Picture } from "./model.ts";

export const NOTCH_KEY = "sol.social.notch";
export type NotchReq = { count: number; top?: Picture };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export function readNotch(st: Store | null | undefined): NotchReq {
  try {
    const raw = st?.getItem(NOTCH_KEY);
    if (!raw) return { count: 0 };
    const v = JSON.parse(raw) as Partial<NotchReq>;
    const count = typeof v.count === "number" && v.count > 0 ? Math.floor(v.count) : 0;
    const top = v.top && typeof v.top.preset === "number" ? { preset: v.top.preset, ...(typeof v.top.img === "string" ? { img: v.top.img } : {}) } : undefined;
    return count ? { count, top } : { count: 0 };
  } catch { return { count: 0 }; }
}
/** written only when it changed, so the storage event fires once per change; an uploaded picture is not carried (the preset's colours are) */
export function writeNotch(st: Store | null | undefined, r: NotchReq | null): void {
  try {
    if (!st) return;
    if (!r || !r.count) { if (st.getItem(NOTCH_KEY) !== null) st.removeItem(NOTCH_KEY); return; }
    const v = JSON.stringify({ count: r.count, ...(r.top ? { top: { preset: r.top.preset } } : {}) });
    if (st.getItem(NOTCH_KEY) !== v) st.setItem(NOTCH_KEY, v);
  } catch { /* private: the notch shows nothing, which is the worst that happens */ }
}
/** the ask the notch sends the main window (renovation.ts askOpen): open Social on Requests */
export const SOCIAL_SEAT = "social";
/** whether the main window answers the notch's ask: only with Social on (App.tsx reads its switch through a ref, so the
 *  one-time listener sees the switch as it is now, not as it was at the first draw) */
export const answersNotch = (seat: string, socialOn: boolean): boolean => seat === SOCIAL_SEAT && socialOn;
/** the page Social should open on, queued for a Social that is not mounted yet (its chunk loads late); read once */
const OPEN_KEY = "sol.social.open";
export function askRequests(st: Pick<Store, "setItem"> | null | undefined): void { try { st?.setItem(OPEN_KEY, "requests"); } catch { /* private */ } }
export function takeOpenAsk(st: Pick<Store, "getItem" | "removeItem"> | null | undefined): "requests" | null {
  try { const v = st?.getItem(OPEN_KEY) ?? null; if (v) st?.removeItem(OPEN_KEY); return v === "requests" ? "requests" : null; } catch { return null; }
}
/** what is queued, left queued */
export function peekOpenAsk(st: Pick<Store, "getItem"> | null | undefined): "requests" | null {
  try { return st?.getItem(OPEN_KEY) === "requests" ? "requests" : null; } catch { return null; }
}
/** where Social opens on a notch's press: Requests once the jelly step is done (prd 1: your jelly comes first); before
 *  that the ask stays queued, untouched, for the step's Done */
export function openOn(onboarded: boolean, st: Pick<Store, "getItem" | "removeItem"> | null | undefined): "requests" | null {
  return onboarded ? takeOpenAsk(st) : null;
}
/** a friend's ask taken on (Social.tsx): the prompt for a new session of the helper's own, queued for Build (WorkApp.tsx,
 *  home/Home.tsx read it on mount or when told); `run` says the helper pressed Run it, so Build sends it on their press */
const TAKE_KEY = "sol.social.take", RUN_KEY = "sol.social.run";
export function queueTake(st: Pick<Store, "setItem"> | null | undefined, text: string, run: boolean): void {
  try { st?.setItem(TAKE_KEY, text); st?.setItem(RUN_KEY, run ? "1" : ""); } catch { /* private */ }
}
export function takeQueued(st: Pick<Store, "getItem" | "removeItem"> | null | undefined): { text: string; run: boolean } | null {
  try {
    const text = st?.getItem(TAKE_KEY) ?? "", run = st?.getItem(RUN_KEY) === "1";
    if (text) { st?.removeItem(TAKE_KEY); st?.removeItem(RUN_KEY); return { text, run }; }
    return null;
  } catch { return null; }
}
