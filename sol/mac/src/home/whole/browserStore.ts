// One shared browser (#805, plan Part C slice 42), behind sol.home.whole and browser.shared: what the face holds of
// `browser.sites`. The transport is shared.ts's stub until #833 lands; then `send` is the engine's socket and the tabs'
// pictures are the engine's screencast frames (browser.ts on main), and nothing else here changes.
import { useSyncExternalStore } from "react";
import { stub, type BrowserAsk, type BrowserMsg, type Hand } from "./shared.ts";
import type { Rung } from "./policy.ts";

let view: BrowserMsg | null = null;
const subs = new Set<() => void>();
let engine: ((a: BrowserAsk) => BrowserMsg) | null = null;
/** ask the shared browser (the stub, until #833) */
export function send(a: BrowserAsk) { engine ??= stub(); view = engine(a); subs.forEach((f) => f()); }
export const spawn = (url: string, hand: Hand, thingId?: string) => send({ type: "browser.spawn", url, hand, thingId });
export const take = (tabId: string) => send({ type: "browser.take", tabId });
export const front = (tabId: string) => send({ type: "browser.front", tabId });
export const signOut = (siteId: string) => send({ type: "browser.signout", siteId });
export const signedInStub = (tabId: string) => send({ type: "browser.stub.signedin", tabId });
// C43 (#806): a site's rung (never above its struck one)
export const setSite = (siteId: string, rung: Rung) => send({ type: "browser.site.set", siteId, rung });
export const undoBrowser = (ledgerId: string) => send({ type: "home.undo", ledgerId });
export const browserNow = () => view;
export function useBrowser(): BrowserMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "browser.sites" }); return () => { subs.delete(f); }; }, () => view);
}
