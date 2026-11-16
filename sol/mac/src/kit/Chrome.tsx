// The frame's pieces (geometry.ts has the numbers). Head: the title row every mode shares, under the Mac's lights: a
// drag region (double-click maximises, as any Mac title bar), the side key first, the title, where it is, then the
// mode's own keys on the right. Frame: a whole mode laid out as head · side · core · pane on one grid, for a mode
// that has no layout of its own (the empty views); Build and Cowork keep their bodies and take the Head.
import { useLayoutEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { frameVars } from "./geometry";
import "./chrome.css";

/** the title row's drag: a press on the row (not on a control) moves the window; a double press maximises */
export const dragRow = (ev: React.MouseEvent) => {
  if (ev.button !== 0 || (ev.target as HTMLElement).closest("button, input, [data-no-drag]")) return;
  let win: ReturnType<typeof getCurrentWindow>;
  try { win = getCurrentWindow(); } catch { return; }
  if (ev.detail === 2) void win.toggleMaximize().catch(() => {}); else void win.startDragging().catch(() => {});
};

/** sets the frame's vars on the document once per change of the spine; the app calls it once */
export function useFrameVars(spine: boolean) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    for (const [k, v] of Object.entries(frameVars(spine))) el.style.setProperty(k, v);
  }, [spine]);
}

export function SideKey({ open, onFlip, title }: { open: boolean; onFlip: () => void; title?: string }) {
  const t = title ?? (open ? "fold the side (⌘\\)" : "open the side (⌘\\)");
  return <button type="button" className={`f-sidekey ${open ? "on" : ""}`} onClick={onFlip} title={t} aria-label={t} aria-pressed={open} tabIndex={-1}><i /><i /></button>;
}

export function Head({ side, title, where, children, className }: { side?: { open: boolean; onFlip: () => void }; title: ReactNode; where?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={`f-head ${className ?? ""}`} data-tauri-drag-region onMouseDown={dragRow}>
      {side && <SideKey open={side.open} onFlip={side.onFlip} />}
      <span className="f-title" data-tauri-drag-region>{title}</span>
      {where && <span className="f-where">{where}</span>}
      <div className="f-space" data-tauri-drag-region />
      {children}
    </header>
  );
}

export function Frame({ head, side, open, children, pane, className }: { head: ReactNode; side?: ReactNode; open?: boolean; children: ReactNode; pane?: ReactNode; className?: string }) {
  return (
    <div className={`frame ${className ?? ""}`} data-side={side ? (open ? "open" : "folded") : "none"}>
      {head}
      {side && <aside className="f-side" data-place="side">{side}</aside>}
      <main className="f-core">{children}</main>
      {pane && <div className="f-pane" data-place="pane">{pane}</div>}
    </div>
  );
}
