// Carrying a sticky (#1493): pressed and moved past a few pixels, a copy follows the hand and a tray rises at the foot of
// the window (✓ done · drop it · Today); let go over one, that is done; let go anywhere else, nothing happens. The click
// that ends a carry is never a press of the sticky.
import { useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent } from "react";
import type { Zone } from "./finishZones";
import "./finish.css";

const WORD: Record<Zone, string> = { done: "✓ done", drop: "drop it", today: "Today" };
const zoneAt = (x: number, y: number) => ((document.elementFromPoint(x, y)?.closest("[data-carry-zone]") as HTMLElement | null)?.dataset.carryZone as Zone | undefined) ?? null;

export function useCarry(letGo: (key: string, zone: Zone) => void) {
  const [carry, setCarry] = useState<{ key: string; zones: Zone[]; over: Zone | null } | null>(null);
  const moved = useRef(false);

  /** on a sticky's pointerdown: `zones` is its tray */
  const down = (key: string, zones: Zone[]) => (ev: RPointerEvent<HTMLElement>) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("input, textarea, .ck, .ft, .fh-made")) return;
    const el = ev.currentTarget, r = el.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY;
    let ghost: HTMLElement | null = null, ox = 0, oy = 0;
    const move = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
        const host = el.closest(".fh") ?? document.body;
        // Home's pane may be transformed, so "fixed" counts from it, not the window: a probe at 0,0 says where that is
        const probe = document.createElement("i");
        probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0";
        host.appendChild(probe);
        ({ left: ox, top: oy } = probe.getBoundingClientRect());
        probe.remove();
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add("fh-carried");
        ghost.removeAttribute("data-sticky"); ghost.removeAttribute("data-today-slip");
        // inline, so a slip's own `all: unset` cannot take the copy out of the hand
        Object.assign(ghost.style, { position: "fixed", zIndex: "50", margin: "0", pointerEvents: "none", width: `${r.width}px`, height: `${r.height}px`, transform: "rotate(3deg) scale(1.04)", opacity: ".96", transition: "none" });
        host.appendChild(ghost);
        el.classList.add("fh-carrying");
        moved.current = true;
        setCarry({ key, zones, over: null });
      }
      ghost.style.left = `${e.clientX - (x0 - r.left) - ox}px`;
      ghost.style.top = `${e.clientY - (y0 - r.top) - oy}px`;
      const z = zoneAt(e.clientX, e.clientY);
      setCarry((c) => (c && c.over !== z ? { ...c, over: z } : c));
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!ghost) return;
      const z = e.type === "pointerup" ? zoneAt(e.clientX, e.clientY) : null;
      ghost.remove();
      el.classList.remove("fh-carrying");
      setCarry(null);
      window.setTimeout(() => { moved.current = false; }, 0);
      if (z) letGo(key, z);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  /** on the sticky's onClickCapture: the click a carry ends with is swallowed */
  const swallow = (ev: MouseEvent) => { if (moved.current) { ev.preventDefault(); ev.stopPropagation(); } };

  const tray = carry && (
    <div className="fh-tray" data-carry-tray={carry.key}>
      {carry.zones.map((z) => <div key={z} className={`tz ${z} ${carry.over === z ? "over" : ""}`} data-carry-zone={z}>{WORD[z]}</div>)}
    </div>
  );
  return { down, swallow, tray, carrying: carry?.key ?? null };
}
