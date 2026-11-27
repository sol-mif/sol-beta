// The bar's tools (#1879 step 5; decisions.md 2026-11-25, the frame drawing's bar): one white row above the talk pill,
// each tool a glyph and a word: Where, the zoom well (− the band's name +), a hairline, Arrange, Add, Customize.
// Add is the solid button always; a tool whose card is open (or Customize while on) shows pressed the same solid way.
// The parts draw only; what a press does is Bar's (next/bar/Bar.tsx). Tokens only (parts.css, "the bar's tools").
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";
import { Icon, type IconName } from "./icons";
import "./parts.css";

/** the row: `label` names it for a screen reader; any other attribute (id, ref, data-*) lands on the row */
export function ToolBar({ label, children, className, ...rest }: { label: string; children: ReactNode; ref?: Ref<HTMLDivElement> } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`kp-part kp-tool${className ? ` ${className}` : ""}`} role="toolbar" aria-label={label} data-part="the bar's tools" {...rest}>{children}</div>;
}

/** one tool: a glyph and a word; `solid` is Add's black, `pressed` the same black while its card is open */
export function Tool({ icon, label, solid, pressed, ...rest }: { icon: IconName; label: string; solid?: boolean; pressed?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`kp-tool-b${solid ? " kp-tool-solid" : ""}`} aria-pressed={pressed} {...rest}>
      <Icon name={icon} className="kp-tool-ic" />{label}
    </button>
  );
}

/** the zoom well: − and + at its ends, the band's name between, as wide as the longest so the row holds still */
export function ToolZoom({ label, onOut, onIn, outOff, inOff, outTitle, inTitle }: { label: string; onOut: () => void; onIn: () => void; outOff?: boolean; inOff?: boolean; outTitle?: string; inTitle?: string }) {
  return (
    <div className="kp-tool-zm" role="group" aria-label="Zoom">
      <button type="button" className="kp-tool-b" data-bar-zoom="out" aria-label="Zoom out" title={outTitle} disabled={outOff} onClick={onOut}>−</button>
      <span className="kp-tool-zl" data-bar-zoom-label aria-live="polite">{label}</span>
      <button type="button" className="kp-tool-b" data-bar-zoom="in" aria-label="Zoom in" title={inTitle} disabled={inOff} onClick={onIn}>+</button>
    </div>
  );
}

/** the hairline between the zoom and the verbs */
export const ToolSep = () => <span className="kp-tool-sep" aria-hidden="true" />;
