// A folder card (#1879 step 0; decisions.md 2026-11-25, the sidebar with a tab in front): a folder as a sticker card
// wearing its folder's window across the top, its name and one line ("1 ask · 1 running", "08:31"). Running elsewhere and
// Recent hold these, 4 at most. On hover it peels and its window opens a little.
// Not kit/Folder.tsx's FolderCard (Home's block-tab folder, #1245), which the kit's index exports as HomeFolderCard.
import type { ReactNode } from "react";
import { Progress } from "./icons";
import { Dot, windowOf, type Paint } from "./Signs";
import { StickerCard } from "./StickerCard";
import "./parts.css";

/** the line a folder with sessions running says: its asks, then its running ones on a ring */
export function runningLine(asks: number, running: number): ReactNode {
  const a = asks ? <><Dot />{asks} ask{asks > 1 ? "s" : ""}</> : null;
  if (asks && running) return <>{a}<span className="kp-run"><Progress p={0.5} small />{running}</span></>;
  return a ?? <><Progress p={0.5} small />{running} running</>;
}

export function FolderCard({ name, paint, line, tilt, hover, onOpen }: { name: string; paint: Paint; line: ReactNode; tilt?: number; hover?: boolean; onOpen?: () => void }) {
  return (
    <StickerCard tilt={tilt} hover={hover} part={`folder ${name}`} onClick={onOpen} className="kp-part kp-folder">
      <i className="kp-window" style={{ background: windowOf(paint) }} />
      <b className="kp-name kp-folder-name">{name}</b>
      <span className="kp-state">{line}</span>
    </StickerCard>
  );
}
