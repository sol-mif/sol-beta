// The named slots (#1604, docs/port/slices.md): each slice's view mounts in one, lazily, from its one entry file, so the
// shell never imports a slice's insides and no two builders touch one file. A slot's props say where it is drawn.
//   plane     slice 1  #view at Far and Middle: the zones, folders, faces, the camera; it mounts life and diary inside
//   needs     slice 2  #view at dist "needs" (part "view"), the ask line in #line (part "line"), "too much" (part "toomuch")
//   near      slice 3  #view at Near: a code session's panes, a life piece, beside, the starter, split parts
//   life      slice 4  inside a life folder at Middle (the plane mounts it with { region, band })
//   diary     slice 4  over the plane at Far, on today's page (D.zones.page) (the shell mounts it with { band })
//   ais       slice 5  #view on the page "ais"
//   agent     slice 5  over the plane at Far and Middle: told, rings, proof (the shell mounts it with { band })
//   settings  slice 6  the panel over the page on the page "settings"
//   people    slices 8+9  #view on the pages cowork, group:<id>, first:<id>, social, friend:<name>, asfriend:<name>, link; under Needs (part "needs")
//   peopleside slices 8+9  the sidebar's people section: the Cowork and Social rows and their nested rows
//   work      BR1 C    #view on the page "work": work plans and automations ("Sol works for you", #1615)
//   notes     BR1 C    over the plane at Far and Middle: the notes, Arrange, the Undo line (frame.html part 6)
//   folder    BR1 C    #view on the page "folder": an opened folder, what its sessions know, its shelves (part 5)
//   automation BR1 2   an automation's piece, where the plane draws it (the plane mounts it with { id, band }; auto/)
//   atwork   BR1 7    #view on the page "atwork": See what's at work, everything's or one folder's (atwork/)
// warm() loads them all while the window is idle, so no page is blank on its first open (builder F, BR1).
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { createElement, lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from "react";

export type SlotName = "plane" | "needs" | "near" | "life" | "diary" | "ais" | "agent" | "settings" | "people" | "peopleside" | "work" | "notes" | "folder" | "automation" | "atwork";
export type SlotProps = { part?: string; region?: string; band?: "far" | "middle"; [more: string]: unknown };

/** each view's code, loaded once: lazy() on its first draw, or warm() before it */
const LOAD: Record<SlotName, () => Promise<{ default: ComponentType<SlotProps> }>> = {
  plane: () => import("./plane/index.tsx"),
  needs: () => import("./needs/index.tsx"),
  near: () => import("./near/index.tsx"),
  life: () => import("./life/index.tsx"),
  diary: () => import("./diary/index.tsx"),
  ais: () => import("./ais/index.tsx"),
  agent: () => import("./agent/index.tsx"),
  settings: () => import("./settings/index.tsx"),
  people: () => import("./people/index.tsx"),
  peopleside: () => import("./people/SideRows.tsx"),
  work: () => import("./work/index.tsx"),
  notes: () => import("./notes/Layer.tsx"),
  folder: () => import("./folder/index.tsx"),
  automation: () => import("./auto/index.tsx"),
  atwork: () => import("./atwork/index.tsx"),
};
/** the views already loaded: drawn at once, never through Suspense (lazy() suspends once even on code already here) */
const GOT: Partial<Record<SlotName, ComponentType<SlotProps>>> = {};
// a view's code that never comes (its request hangs: a dev server mid-restart, a try moved under an open window) left
// its slot blank for good, and one that failed took the whole window white (orchestrator 18:11, builder G): it is waited
// for WAIT_MS, then the window reloads once (not again within AGAIN_MS: a loop never starts); after that the slot says
// so with a Reload, and the rest of the window stays
const WAIT_MS = 10_000, AGAIN_MS = 60_000, RELOADED = "sol.slot.reloaded";
const reloadOnce = (): boolean => {
  try {
    const at = Number(sessionStorage.getItem(RELOADED)) || 0;
    if (Date.now() - at < AGAIN_MS) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
};
function Missing() {
  return createElement("div", { className: "nx-missing", role: "alert", "data-slot-missing": "" }, "This part did not load. ",
    createElement("button", { type: "button", onClick: () => location.reload() }, "Reload"));
}
const load = (n: SlotName) => new Promise<{ default: ComponentType<SlotProps> }>((ok) => {
  let done = false;
  const give = (v: ComponentType<SlotProps>) => { if (!done) { done = true; ok({ default: v }); } };
  const lost = () => { if (!done && !reloadOnce()) give(Missing); };
  const t = typeof window === "undefined" ? null : setTimeout(lost, WAIT_MS);
  LOAD[n]().then((m) => { if (t) clearTimeout(t); GOT[n] = m.default; give(m.default); }, () => { if (t) clearTimeout(t); lost(); });
});
const VIEWS = Object.fromEntries((Object.keys(LOAD) as SlotName[]).map((k) => [k, lazy(() => load(k))])) as Record<SlotName, LazyExoticComponent<ComponentType<SlotProps>>>;
export const SLOTS = Object.keys(VIEWS) as SlotName[];

/** a slice's view in its slot: <Slot name="plane" band="far" /> */
export function Slot({ name, ...props }: { name: SlotName } & SlotProps) {
  // chosen once per slot: a view already loaded is drawn at once; one drawn through lazy stays so, never mounted twice
  const view = useMemo<ComponentType<SlotProps>>(() => GOT[name] ?? VIEWS[name], [name]);
  return createElement(Suspense, { fallback: null }, createElement(view, props));
}

/** load the views a press opens while the window is idle after its first draw, so a page draws whole on its first open,
 *  never blank while its code comes (BR1 first-timer, #1615: Work for you and Settings were blank on the first press;
 *  builder F) */
export function warm(names: SlotName[] = SLOTS): void {
  const go = () => { for (const n of names) if (!GOT[n]) void load(n).catch(() => {}); };
  const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 600);
}
