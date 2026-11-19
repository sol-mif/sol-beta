// A session opened from Cowork (#1416): the map's faces, a part's "here now" and the lanes' work lines fire
// sol:open-work, the event Build's talk hears (runs/useSessions.ts openSession). While Cowork is the mode nobody hears
// it, so App asks this hook: the window turns to the mode that opens sessions (App.tsx,
// cowork/CoworkApp.tsx toHome: sol.home.open kept, the mode picked, the event said again once the talk is up), and a
// "↩ Cowork" chip stands in the spine (or, with no spine, at the window's top) until it is pressed or Cowork is opened
// another way. Cowork's place is kept in its history (place.ts), so the chip brings back the exact place.
import { useEffect, useRef, useState } from "react";
import { placeWords } from "./place";
import "./away.css";

/** the event said again, so the hook does not take its own word back to Build */
let relaying = false;

export function useAwayFromCowork(inCowork: boolean, toSession: () => void, toCowork: () => void) {
  const [away, setAway] = useState(false);
  const inRef = useRef(inCowork); inRef.current = inCowork;
  const go = useRef({ toSession, toCowork }); go.current = { toSession, toCowork };
  useEffect(() => {
    const heard = (ev: Event) => {
      const id = (ev as CustomEvent<unknown>).detail;
      if (!inRef.current || relaying || typeof id !== "string" || !id) return;
      try { localStorage.setItem("sol.home.open", JSON.stringify({ kind: "session", id })); } catch { /* private: the event below still asks */ }
      setAway(true);
      go.current.toSession();
      // said again once the talk has drawn (two frames: the mode's commit, then its mount); it reads sol.home.open too
      requestAnimationFrame(() => requestAnimationFrame(() => { relaying = true; try { window.dispatchEvent(new CustomEvent("sol:open-work", { detail: id })); } finally { relaying = false; } }));
    };
    window.addEventListener("sol:open-work", heard);
    return () => window.removeEventListener("sol:open-work", heard);
  }, []);
  useEffect(() => { if (inCowork) setAway(false); }, [inCowork]);
  return { away: away && !inCowork, back: () => { setAway(false); go.current.toCowork(); } };
}

/** the chip back: in the spine a mark like its views, else a chip at the top of the window */
export function BackToCowork({ onPress, inSpine }: { onPress: () => void; inSpine: boolean }) {
  const where = placeWords();
  return inSpine ? (
    <button type="button" className="sp-m cw-away-m" data-go="cowork" aria-label={`↩ Cowork: back to ${where}`} onClick={onPress}>
      <i>↩</i><span className="sp-tag">Cowork<em>{where}</em></span>
    </button>
  ) : (
    <button type="button" className="cw-away" data-go="cowork" title={`back to ${where}`} onClick={onPress}>↩ Cowork</button>
  );
}
