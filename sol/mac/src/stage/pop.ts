// Pop out (#701, sitting 7; the design page §6 "two screens"): a block's head dragged out of the window opens it as its
// own window over the desktop, still the same block (the same id, its body the engine's); the stage keeps its slot as a
// chip. Dragged back over Sol's window (pop.rs hears the window move), closed, or its chip clicked, it returns.
// In Sol.app the window is the app's (pop.rs block_pop: a web view window labelled pop-<id> on index.html?block=<id>);
// in a browser (dev, the shots) it is window.open. Either way the popped page and the stage speak on one channel.
import type { Rect } from "./model";

/** the channel the popped page and the stage share (same origin in the app and in a browser) */
export const POP_CHANNEL = "sol.stage.pop";
export type PopMsg = { back: string } | { close: string };

const IN_APP = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
/** the pointer is outside the window: the head has been dragged off it (pure) */
export function outside(win: { w: number; h: number }, x: number, y: number): boolean {
  return x < 0 || y < 0 || x > win.w || y > win.h;
}
/** a block's window label: pop-<id>, the id as a name, never a path (pure; pop.rs pop_label is the same rule) */
export function popLabel(id: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? `pop-${id}` : null;
}
/** the page a popped block opens on: the face's own, told which block and which session (pure) */
export function popUrl(id: string, session: string, base = "index.html"): string {
  return `${base}?block=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`;
}
/** what the page was opened for: a popped block, or nothing (pure) */
export function poppedOf(search: string): { id: string; session: string } | null {
  const q = new URLSearchParams(search), id = q.get("block"), session = q.get("session");
  return id && session && popLabel(id) ? { id, session } : null;
}

let chan: BroadcastChannel | null = null;
const channel = () => (chan ??= typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(POP_CHANNEL));
export function tell(m: PopMsg) { channel()?.postMessage(m); }
/** the stage hears a popped block come back (its page's `back`, the app's block-back when it is dragged over Sol) */
export function onBack(f: (id: string) => void): () => void {
  const c = channel(), hear = (e: MessageEvent<PopMsg>) => { if (e.data && "back" in e.data) f(e.data.back); };
  c?.addEventListener("message", hear);
  let un: (() => void) | null = null, gone = false;
  if (IN_APP()) void import("@tauri-apps/api/event").then(({ listen }) => listen<{ id: string }>("block-back", (e) => f(e.payload.id))).then((u) => { if (gone) u(); else un = u; }).catch(() => {});
  return () => { gone = true; c?.removeEventListener("message", hear); un?.(); };
}
/** the popped page hears the stage take it back (the chip clicked): it closes */
export function onClose(id: string, f: () => void): () => void {
  const c = channel(), hear = (e: MessageEvent<PopMsg>) => { if (e.data && "close" in e.data && e.data.close === id) f(); };
  c?.addEventListener("message", hear);
  return () => c?.removeEventListener("message", hear);
}

/** open the block's window at r (screen px); false when it could not (no app, a popup refused) */
export async function popOutBlock(id: string, session: string, title: string, r: Rect): Promise<boolean> {
  if (!popLabel(id)) return false;
  if (IN_APP()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("block_pop", { id, session, title, x: r.x, y: r.y, w: r.w, h: r.h });
      return true;
    } catch (err) { console.warn(`stage: pop out: ${err}`); return false; }
  }
  const hot = typeof location !== "undefined" ? `${location.origin}${location.pathname.replace(/[^/]*$/, "")}` : "";
  return !!window.open(popUrl(id, session, `${hot}index.html`), popLabel(id)!, `left=${Math.round(r.x)},top=${Math.round(r.y)},width=${Math.round(r.w)},height=${Math.round(r.h)}`);
}
/** take it back: its window closes (the app's, or the page's own on the channel) */
export async function backBlock(id: string): Promise<void> {
  tell({ close: id });
  if (!IN_APP()) return;
  try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("block_pop_close", { id }); } catch { /* already gone */ }
}
