// What the sidebar needs kept, live (#1879 step 3; engine next/keeps.ts, protocol next/protocol/KEEPS.md): asks next.keeps
// once on attach, tells the engine when the person is present (focus, a key or a press: next.present, at most once a
// minute), what they see (next.seen: the session or page in front, as a tab or opened on the canvas) and which folder is
// in use (next.use: the folder opened, or the folder of the session in front). Presence starts once the first answer is
// in, so the window knows when the person was last here before this ping moves it. The fixture never runs this.
// Signed: marcocyl04-ux's agent, #1879 step 3.
import { D, S, regionOf, render, subscribe } from "../core.ts";
import { TB } from "../moves/tabs.ts";
import { notePin, noteSeen, noteUse, pinged, reset, take } from "../../keeps.ts";
import type { Engine } from "./types.ts";

const EVERY = 60_000;

/** the piece in view: the tab in front, else the one opened on the canvas; null on the canvas, a folder or a page */
export function seenNow(): string | null {
  if (S.page) return null;
  const f = TB().front ?? (S.dist === "near" ? S.piece : null);
  return f && D.pieces[f] ? f : null;
}
/** the folder in use: the one the front tab's piece is in (or the front tab, a folder), else the folder being looked at */
export function folderNow(): string | null {
  if (S.page) return null;
  const f = TB().front;
  if (f) return D.pieces[f]?.region ?? (regionOf(f) ? f : null);
  const r = S.dist === "middle" || S.dist === "near" ? S.region : null;
  return r && regionOf(r) ? r : null;
}

/** pin or unpin a piece (no face for it yet: a press and an AI's verb come later); the engine tells every window */
export const link: { e: Engine | null } = { e: null };
export function pinPiece(id: string, on = true): void {
  notePin(id, on); link.e?.send({ type: "next.pin", id, pinned: on }); render();
}

export function attach(e: Engine): () => void {
  link.e = e;
  let started = false, sentAt = 0, lastSeen: string | null = null, lastFolder: string | null = null;
  const ping = () => {
    const now = Date.now();
    if (!started || now - sentAt < EVERY) return;
    sentAt = now; e.send({ type: "next.present" });
  };
  const on = ["focus", "keydown", "pointerdown"] as const;
  const visible = () => { if (typeof document === "undefined" || !document.hidden) ping(); };
  const follow = () => {
    if (!started) return;
    const id = seenNow(), folder = folderNow();
    if (id && id !== lastSeen) { noteSeen(id); e.send({ type: "next.seen", id }); }
    if (folder && folder !== lastFolder) { noteUse(folder); e.send({ type: "next.use", folder }); }
    lastSeen = id; lastFolder = folder;
  };
  const off = e.subscribe((m: { type?: string; ok?: boolean; at?: number; was?: number | null }) => {
    if (m?.ok === false) return;
    if (m?.type === "next.keeps") {
      take(m as never);
      if (!started) { started = true; ping(); follow(); }
      render();
    } else if (m?.type === "next.present" && typeof m.at === "number") { pinged(typeof m.was === "number" ? m.was : null, m.at); render(); }
  });
  const unsub = subscribe(follow);
  if (typeof window !== "undefined") { for (const t of on) window.addEventListener(t, ping, true); document.addEventListener("visibilitychange", visible); }
  e.send({ type: "next.keeps" });
  return () => {
    off(); unsub(); reset(); if (link.e === e) link.e = null;
    if (typeof window !== "undefined") { for (const t of on) window.removeEventListener(t, ping, true); document.removeEventListener("visibilitychange", visible); }
  };
}
