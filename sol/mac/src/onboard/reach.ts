// Sol.app's part of the one reader (#1217), and the Claude account's connectors: what onboard/run.ts needs beside the
// explorer. In Sol.app (#1069) macOS judges the process that reads, and the engine (launchd > bash > node) never gets
// Sol.app's Full Disk Access, so Sol.app copies the closed stores into a private temp folder first (places_copy,
// src-tauri/src/places.rs), the reader reads those copies (--from), and the folder is dropped after (places_drop),
// whatever happened. In a plain browser none of that. Moved here from home/folders/find.ts when the tour went (#1223).
type Ask = <T>(o: object, ms: number) => Promise<T | null>;
/** an app's own store on a Mac, read by places/read.mjs */
export type Store = "notes" | "calendar" | "whatsapp" | "messages" | "wechat";

/** the face runs inside Sol.app (not a plain browser): Sol's own commands are there */
export const inSol = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
type PlacesCopy = { dir: string | null; safari: boolean; calendar: boolean; files: boolean; stores?: Record<string, boolean> };
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!inSol) return null;
  try { const { invoke } = await import("@tauri-apps/api/core"); return await invoke<T>(cmd, args); } catch { return null; }
}
export const dropCopy = (dir: string | null | undefined) => (dir ? call("places_drop", { dir }) : Promise.resolve(null));
/** Sol.app's copy of the stores macOS keeps closed to the engine (places.rs: Safari's history always, and each named store)
 *  for the one reader (onboard/run.ts, explore.mjs --from): the copy's folder, or null outside Sol.app or when it failed.
 *  The caller drops it (dropCopy) once the read is done */
export async function copyClosed(which: Store[]): Promise<string | null> {
  const c = await call<PlacesCopy>("places_copy", { which });
  return c?.dir ?? null;
}

/** one service as the engine lists it: `read` the tools a read turn may use (the rest are refused by name) */
export type Service = { name: string; server: string; status: "connected" | "failed" | "needs-auth" | "pending" | "disabled"; read: string[]; refused: string[]; error?: string };
let services: { at: number; home: string; list: Service[] | null } | null = null;
let asking: { home: string; p: Promise<Service[] | null> } | null = null;   // one question at a time: the sign-ins and the explorer ask together at open
/** the services connected in the person's Claude account, asked of the engine once a minute; null when it cannot say */
/** `fresh`: ask the account again now (Settings › home after a renew, #1229), past both minutes' keeping */
export async function connectedServices(ask: Ask, home = "", fresh = false): Promise<Service[] | null> {
  if (!fresh && services && services.home === home && Date.now() - services.at < 60_000) return services.list;
  if (!fresh && asking?.home === home) return asking.p;
  const p = (async () => {
    const r = await ask<{ list?: Service[] | { error: string } }>({ type: "connectors", ...(fresh ? { fresh: true } : {}) }, 30_000);
    const list = Array.isArray(r?.list) ? r.list : null;
    services = { at: Date.now(), home, list };
    return list;
  })().finally(() => { if (asking?.p === p) asking = null; });
  asking = { home, p };
  return p;
}
/** a service may have been connected meanwhile (the person came back from the connectors page): the next ask is fresh */
export const forgetServices = () => { services = null; };
