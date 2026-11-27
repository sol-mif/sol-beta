// A folder's case (#1879 step 4; decisions.md 2026-11-25, "the folders and the Diary on the canvas", the frame drawing's
// .fd): a white sticker case, its lid the folder's own paint (the one its sidebar card and tab wear) with a white slip
// peeking out of the pocket; the name in the display weight, one line under it, and at its foot the folder's one count
// big with the next deadline at the right. Working: a chip on the lid. Nothing waiting: quiet, dimmed, its number grey.
// Hover peels it (the lid's paint lifts, the slip rises); a press is the canvas's to answer (`onOpen` makes it a button
// when it stands alone, as in the stills). Tokens only (kit/parts.css).
import type { CSSProperties, ReactNode } from "react";
import { Icon, Pocket } from "./icons";
import { windowOf, type Paint } from "./Signs";
import "./parts.css";

const pad2 = (n: number) => (n < 10 ? "0" : "") + n;

export function FolderCase({ name, paint, sub, count, unit = "asks", next, working, quiet, hover, tilt = 0, more, lid, onOpen, style }: {
  name: string; paint: Paint; sub: ReactNode; count: number; unit?: string; next?: string | null; working?: string | false; quiet?: boolean; hover?: boolean; tilt?: number;
  /** what sits in the corner (the canvas's ⋯ menu button); the plain ⋯ sign by default */
  more?: ReactNode; /** small marks on the lid's left, beside the working chip (what is yours in it) */ lid?: ReactNode; onOpen?: () => void; style?: CSSProperties;
}) {
  const hush = quiet ?? count === 0;
  return (
    <div className={`kp-part kp-case${hush ? " kp-case-quiet" : ""}${hover ? " kp-is-hover" : ""}`} data-part={`folder ${name}`} data-count={count} data-case={hush ? "quiet" : working ? "working" : "rest"}
      style={{ ["--tilt" as string]: `${tilt}deg`, ...style }} {...(onOpen ? { role: "button", tabIndex: 0, onClick: onOpen, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } } : {})}>
      <div className="kp-case-in">
        <div className="kp-case-mesh" style={{ background: windowOf(paint) }} />
        <div className="kp-case-slip" />
        <Pocket />
        {working || lid ? <div className="kp-case-lid">{working ? <span className="kp-case-run"><i />{working}</span> : null}{lid}</div> : null}
        <div className="kp-case-txt">
          <b className="kp-name kp-case-name">{name}</b>
          <span className="kp-case-sub">{sub}</span>
          <div className="kp-case-ft">
            <span className={`kp-name kp-case-big${hush ? " kp-case-q" : ""}`} data-big>{pad2(count)}<small>{unit}</small></span>
            {next ? <span className="kp-case-nx">{next}</span> : null}
          </div>
        </div>
      </div>
      <span className="kp-case-mo">{more ?? <Icon name="more" small />}</span>
    </div>
  );
}
