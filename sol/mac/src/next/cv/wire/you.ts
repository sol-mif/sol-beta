// How Sol sees you, live (BR1, #1615): the first time a Sol has never read its person (next.you's read.at is null), the
// screens come up over the window (movein/you/mount.ts) on the engine, with Sol.app's hooks; once read (or skipped) they
// never come up by themselves again (Settings › You looks again). One move-in screen at a time: they wait for the
// move-in's read to answer (it opens #mvi on a first run, movein/live.ts heard) and come up once #mvi is down; mount.ts
// holds them while it is up. Open Sol brings the move-in's own screen down too, so the person lands on the canvas with
// the line on top.
// Settings › You (picked 2026-11-21 17:45): the places as cards on the person's canvas, each on its own folder
// (movein/you/Lens.tsx), opened from the sidebar's You row ([data-you]) and from the row in Settings; the whole canvas
// is shown first (M.map), the folders read from the page and never moved. Signed: marcocyl04-ux's agent (builder F).
import { createElement } from "react";
import { D, M, hooks, render } from "../core.ts";
import type { Engine } from "./types.ts";
import type { Port } from "../../movein/you/port.ts";
import type { You } from "../../movein/you/types.ts";
import { live as moveIn, rowOfFolder } from "../../movein/state.ts";
import type { Folder } from "../../notes/read.ts";
import type { Found } from "../../known.ts";

let port: Port | null = null;
// the latest next.you, for what the canvas says of it (a folder's badge: movein/you/Badge.tsx); a place taken out leaves it
let latest: You | null = null;
export const youNow = (): You | null => latest;
const frames = (n: number, f: () => void) => (n <= 0 ? f() : requestAnimationFrame(() => frames(n - 1, f)));
/** how long the screens wait on an engine that never answers the move-in's read: a wait on the engine, not a motion */
const NO_MOVEIN_MS = 10_000;
/** f once the move-in's read has answered (its screen up by then, when it opens), or after a while with no answer */
function afterMoveIn(e: Engine, f: () => void): () => void {
  let off: (() => void) | null = null, t: ReturnType<typeof setTimeout> | null = null;
  const go = () => { off?.(); off = null; if (t) clearTimeout(t); t = null; setTimeout(f, 0); };   // after the move-in's own wire heard it
  if (moveIn.answered) { go(); return () => undefined; }
  off = e.subscribe(() => { if (moveIn.answered) go(); });
  t = setTimeout(go, NO_MOVEIN_MS);
  return () => { off?.(); off = null; if (t) clearTimeout(t); t = null; };
}

/** Settings › You over the canvas: the canvas shown whole, then the cards on its folders */
/** at: a place to open on (a folder's badge was pressed) */
export function openLens(at?: string): void {
  if (!port || typeof document === "undefined") return;
  const p = port;
  M.page(null); M.map();
  void import("../../movein/you/mount.ts").then((v) => frames(2, () => v.openLens(p, {
    at,
    plane: {
      regions: () => D.regions.map((r) => ({ id: r.id, name: r.name, ...(typeof r.path === "string" ? { path: r.path } : {}) })),
      // what each folder's badge reads besides next.you (Badge.tsx): its own facts and what the move-in read found there
      sources: () => ({
        folders: (D.notes as { folders?: Record<string, Folder> } | undefined)?.folders ?? {},
        found: D.regions.map((r) => rowOfFolder(r.id)?.found).filter((f): f is Found => !!f),
      }),
      box: (rid) => {
        const el = document.querySelector<HTMLElement>(`#pl .pl-card[data-region="${CSS.escape(rid)}"]`) ?? document.querySelector<HTMLElement>(`.pl-card[data-region="${CSS.escape(rid)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect(), c = getComputedStyle(el).getPropertyValue("--tint").trim();
        return { x: r.left, y: r.top, w: r.width, h: r.height, ...(c ? { c } : {}) };
      },
    },
    // the face draws its look from the Mac and keeps the knobs in Settings: a press opens Settings at that knob
    look: {
      dark: () => v.lookNow().includes("dark"),
      big: () => { const k = (D as unknown as { prefs?: { prefs?: { kept?: Record<string, string> } } }).prefs?.prefs?.kept?.size; return k === "l" || k === "xl"; },
      set: (k) => { v.closeLens(); M.stOpen(k === "big" ? "size" : "look"); },
    },
  })));
}

/** the row in Settings (the first group's), as Settings draws its other rows that open a page */
function row() {
  return createElement("div", { className: "st-knob st-go", key: "you-lens" },
    createElement("button", { className: "st-head", "data-p": "you", onClick: () => openLens() },
      createElement("span", { className: "st-ht" }, createElement("b", null, "You"), createElement("small", { className: "st-who" }, "What Sol knows and may do, on each place")),
      createElement("span", { className: "st-cur" }, "›")));
}

export function attach(e: Engine): () => void {
  let seen = false, held: () => void = () => undefined;
  port = { live: true, send: (m) => { e.send(m); }, subscribe: (f) => e.subscribe(f) };
  const p = port;
  const offNow = e.subscribe((m: { type?: string; ok?: boolean; you?: unknown; id?: unknown; dropped?: boolean }) => {
    if (m?.type === "next.you" && m.ok !== false && m.you && Array.isArray((m.you as You).parts)) { latest = m.you as You; render(); }
    else if (m?.type === "next.you.part" && m.ok !== false && latest) {
      if (m.dropped) { latest = { ...latest, parts: latest.parts.filter((p) => p.id !== m.id) }; render(); } else e.send({ type: "next.you" });
    }
  });
  const off = e.subscribe((m: { type?: string; ok?: boolean; you?: { who?: string | null; read?: { at?: string | null } } }) => {
    if (seen || m?.type !== "next.you" || m.ok === false || !m.you) return;
    seen = true;
    if (m.you.read?.at) return;
    const who = m.you.who ?? null;
    held = afterMoveIn(e, () => void Promise.all([import("../../movein/you/mount.ts"), import("../../movein/you/mac.ts")]).then(([v, mac]) => {
      const h = mac.macHooks();
      v.openYou(p, { name: who, hooks: { ...h, opened: () => { const mv = (hooks as unknown as { movein?: { open?: unknown; clear?: () => void } }).movein; if (mv?.open) mv.clear?.(); } } });
    }));
  });
  const st = hooks as unknown as { stRows?: ((g: string) => unknown)[] };
  const rows = (st.stRows ??= []), mine = (g: string) => (g === "How your AIs work" ? row() : null);
  rows.unshift(mine);
  const press = (ev: MouseEvent) => { if ((ev.target as Element | null)?.closest?.("[data-you]")) { ev.preventDefault(); openLens(); } };
  document.addEventListener("click", press);
  e.send({ type: "next.you" });
  return () => {
    off(); offNow(); held(); document.removeEventListener("click", press);
    const i = rows.indexOf(mine); if (i >= 0) rows.splice(i, 1);
    if (port === p) port = null;
  };
}
