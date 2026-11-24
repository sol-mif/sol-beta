// How Sol sees you, what only Sol.app does for the screens (BR1, #1615), given to the store as its hooks (store.ts Hooks):
//   prep    places_copy: Safari, Calendar and Notes copied with Sol.app's own Full Disk Access (the engine never has it,
//           places.rs), the copy's folder handed to next.you.read as `from`; places_drop when the read is over
//   pane    System Settings at the permission's pane: permit_open for the ones Sol.app knows, else the perm's own link
//   known   Sol.app's own answer per permission (permit_state; Full Disk Access as places_copy finds it)
//   signIn  claude_login / codex_login: the sign-in page in the browser; the accounts are asked again on return
//   connect a connector's page in the browser (the opener plugin), never in Sol's own window
// Outside Sol.app (the dev page, a browser) there are no hooks and the screens say so where a press needs one.
// Signed: marcocyl04-ux's agent (builder F).
import type { Hooks } from "./store.ts";
import type { Perm, Source } from "./types.ts";

export const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
/** a page outside Sol opens in the person's browser through the opener plugin, as Sol's other outside links do
 *  (Message.tsx, cowork/util.ts); window.open in Sol.app would load it in Sol's own window (sweep 2) */
const openOut = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank", "noopener")); };
const PERMIT: Record<string, string> = { "full-disk": "files", accessibility: "accessibility", screen: "screen" };
const STORE: Partial<Record<Source, string>> = { notes: "notes", "calendar-store": "calendar" };

export function macHooks(): Hooks {
  if (!inApp()) return {};
  let dir: string | null = null, fullDisk: boolean | null = null;
  return {
    async prep(sources) {
      if (!sources.some((s) => s === "browser" || s === "notes" || s === "calendar-store")) return null;
      const which = sources.map((s) => STORE[s]).filter((w): w is string => !!w);
      const c = await call<{ dir: string | null; files: boolean }>("places_copy", { which });
      fullDisk = !!c.files; dir = c.dir ?? null;
      return dir;
    },
    done() { if (dir) { const d = dir; dir = null; call("places_drop", { dir: d }).catch(() => {}); } },
    pane(p: Perm) {
      const which = PERMIT[p.id];
      (which ? call("permit_open", { which }) : Promise.reject()).catch(() => { if (p.link) openOut(p.link); });
    },
    connect: openOut,
    async known(fresh) {   // fresh (after "I did it"): Full Disk Access asked again, never the answer kept from before
      const st = await call<{ accessibility: boolean }>("permit_state").catch(() => null);
      if (fresh || fullDisk == null) fullDisk = await call<{ files: boolean; dir: string | null }>("places_copy", { which: [] })
        .then((c) => { if (c.dir) call("places_drop", { dir: c.dir }).catch(() => {}); return !!c.files; }, () => null);
      const out: Record<string, boolean> = {};
      if (st) out.accessibility = st.accessibility;
      if (fullDisk != null) out["full-disk"] = fullDisk;
      return Object.keys(out).length ? out : null;
    },
    signIn: (id) => call(id === "codex" ? "codex_login" : "claude_login"),
  };
}
