// A code session drawn by Near's sides (#1615; beside another piece, a split job's open part, kept beside the canvas):
// since BR1's port (Marco 21:20, "the session view is a PORT, not a rebuild") it is the old face's session view itself,
// session/Port.tsx, compact here (its talk and its box); the session's own page, as a tab, is the whole of it
// (near/index.tsx). Near's own session layout (Change across the width, Talk and Terminal under it, Files, Its table) is
// gone: the old view's rail and panes hold Change, Terminal and Files, and the port keeps Its table and an ask opened
// inside. Loaded lazily, so the canvas never loads the old face's session code until a session is open.
// Signed: marcocyl04-ux's agent, slice 3 (#1615); the port, builder P.
import { lazy, Suspense } from "react";
import { D, MODE, S, lineAsk, type Ask, type Piece } from "../cv/index.ts";

// The dev page dials no engine: the old view's stores (renovation.ts as it loads, cowork/stable.ts under the box) link
// to the window's engine (engine.ts ENGINE), the one socket live; on the fixture that address is refused, so their link
// waits on its backoff and nothing reaches a real engine. Every other socket (Vite's) goes through.
const Port = lazy(async () => {
  if (MODE !== "live") {
    const { ENGINE } = await import("../../engine");
    const g = globalThis as { WebSocket: typeof WebSocket }, W = g.WebSocket, bare = (u: string | URL) => String(u).replace(/\/+$/, "");
    if (!(W as { refusesEngine?: boolean }).refusesEngine) g.WebSocket = Object.assign(class extends W {
      constructor(u: string | URL, p?: string | string[]) { if (bare(u) === bare(ENGINE)) throw new Error("the dev page dials no engine"); super(u, p); }
    }, { refusesEngine: true });
  }
  return import("../session/Port.tsx");
});

/** which ask sits inside this piece now: the one ⌘J opened here (an ask on the line stays on the line: one place for an ask) */
export function asksInside(pid: string): Ask[] {
  const a = S.askHere ? D.asks[S.askHere] : undefined;
  return a && !a.answered && a.piece === pid && a.id !== lineAsk() ? [a] : [];
}

/** a session at one of Near's sides: the ported view, compact unless it is the page itself */
export function Session({ p, page = false }: { p: Piece; keysHere?: boolean; beside?: boolean; width?: number; page?: boolean }) {
  return <Suspense fallback={null}><Port p={p} compact={!page} /></Suspense>;
}
