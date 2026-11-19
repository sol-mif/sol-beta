// The door's dot (#906): with build.runs on and the runs view closed, the board is read every 60 s, never while the
// window is hidden, and the door shows one still dot when "Needs you" is not empty (judged by his sheet). No number,
// no motion. The hook does nothing at all when `on` is false, so with the switch off nothing is read or drawn.
import { useEffect, useState } from "react";
import { boardUrl, judged, needsYou, type Board } from "./rules";
import { readSheet } from "./sheet";

export const DOOR_POLL_MS = 60_000;
export const SHEET_KEY = "runs.sheet";

/** does the board ask for him, by his sheet (pure on its inputs) */
export function needsDot(board: Board | null, sheetText: string | null, nowSec: number): boolean {
  if (!board || typeof board.at !== "number") return false;
  return needsYou(judged(board, readSheet(sheetText).sheet, nowSec), nowSec).length > 0;
}

export function useDoorDot(on: boolean): boolean {
  const [dot, setDot] = useState(false);
  useEffect(() => {
    if (!on) { setDot(false); return; }
    const url = boardUrl(location.search);
    let alive = true, last = 0, t: number | undefined;
    const read = async () => {
      if (document.visibilityState === "hidden") return;
      last = Date.now();
      try {
        const res = await fetch(url, { cache: "no-store" });
        const b = res.ok ? ((await res.json()) as Board) : null;
        let text: string | null = null;
        try { text = localStorage.getItem(SHEET_KEY); } catch { /* private */ }
        if (alive && b) setDot(needsDot(b, text, Math.floor(Date.now() / 1000)));
      } catch { /* the board does not answer: the dot stays as it was */ }
    };
    const tick = () => { read(); t = window.setTimeout(tick, DOOR_POLL_MS); };
    const back = () => { if (document.visibilityState === "visible" && Date.now() - last >= DOOR_POLL_MS) read(); };
    tick();
    document.addEventListener("visibilitychange", back);
    return () => { alive = false; window.clearTimeout(t); document.removeEventListener("visibilitychange", back); };
  }, [on]);
  return on && dot;
}
