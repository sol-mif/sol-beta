// Social's state in this window (fr-31): the model's State, kept in this Mac's storage. Under ?dev=social it starts
// from the pretend friends and is kept apart (sol.social.pretend), so a dev run never mixes with a real one. When the
// hub carries friends (backend.md), the engine holds this and the face asks, as Cowork v3 does.
import { useSyncExternalStore } from "react";
import { emptyState, notchButton, type State } from "./model.ts";
import { writeNotch } from "./notch.ts";
import { pretendState } from "./pretend.ts";

const subs = new Set<() => void>();
let key = "sol.social";
let cur: State | null = null;
const YOU = { sol: "you", name: "You", jelly: { preset: 0 }, presence: "online" as const, agent: 0 as const, published: { builds: 0, downloads: 0, wins: 0, helped: 0 }, premium: false };

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const store = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
/** Social on (App.tsx, on every draw while it is on): the state loaded once, and the notch told each time, so off then
 *  on brings the green button back (the off cleared it) */
export function startSocial(pretend: boolean, st: Store | null = store()) {
  const k = pretend ? "sol.social.pretend" : "sol.social";
  if (!cur || k !== key) {
    key = k;
    try { const raw = st?.getItem(key); cur = raw ? (JSON.parse(raw) as State) : null; } catch { cur = null; }
    if (!cur) cur = pretend ? pretendState(Date.now()) : emptyState(YOU);
  }
  tellNotch(st);
}
/** the notch window hears the count waiting (notch.ts); a pretend run tells it too, so a dev notch page shows the same */
const tellNotch = (st: Store | null = store()) => { try { writeNotch(st, cur ? notchButton(cur) : null); } catch { /* private */ } };
/** Social off: the notch shows nothing */
export function stopSocial(st: Store | null = store()) { try { writeNotch(st, null); } catch { /* private */ } }
/** for tests: forget the loaded state */
export function forgetSocial() { cur = null; key = "sol.social"; }
let saveTrouble = "";
/** a save that failed, said once */
export function takeSaveTrouble(): string { const t = saveTrouble; saveTrouble = ""; return t; }
export const socialNow = (): State => cur ?? emptyState(YOU);
export function setSocial(f: (s: State) => State) {
  cur = f(socialNow());
  // a full storage must never keep an old grant alive: an uploaded picture is dropped first, then it is said
  try { localStorage.setItem(key, JSON.stringify(cur)); } catch {
    try { cur = { ...cur, me: { ...cur.me, jelly: { preset: cur.me.jelly.preset } } }; localStorage.setItem(key, JSON.stringify(cur)); saveTrouble = "your picture was too big to keep; your jelly is back"; }
    catch { saveTrouble = "Social couldn't save on this Mac; your last change may not last a restart"; }
  }
  tellNotch();
  subs.forEach((g) => g());
}
/** start over: the pretend friends as they were (dev), or an empty Social */
export function resetSocial(pretend: boolean) { try { localStorage.removeItem(key); } catch { /* private */ } cur = null; startSocial(pretend); subs.forEach((g) => g()); }
export const useSocial = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, socialNow);
