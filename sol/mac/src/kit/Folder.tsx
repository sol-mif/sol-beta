// A folder that does work, and its stickies (#1245, Home; brand.md, The references: "Home's folders are the same card
// holding things"). The folder is the kit's Block on its tab take (the folder's lip, rule 1); a sticky is a thing you
// asked for, put on the folder by hand: a pearl paper (yours, rule 14) at the sticker's depth and shape (rule 9), up to
// 3° off square (rule 36). Its state is its shape first (rule 17): next is its words alone, running the set's drift in a
// small well (rule 27), done a green coin that lands (rule 26).
import type { ReactNode } from "react";
import { Coin, Num, RunMark, Sign, deep, dim, mute } from "./Accent";
import { Block } from "./Block";
import { PEARL, SYSTEM, TYPE as T } from "./tokens";

export type StickyState = "next" | "running" | "done";
export function Sticky({ words, s, tilt = 0, w }: { words: string; s: StickyState; tilt?: number; w: number }) {
  const sh = SYSTEM.depth.sticker.shadow;
  return (
    <div data-sticky={s} style={{ width: w, height: 40, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 12px",
      borderRadius: SYSTEM.shape.sticker.radius, background: PEARL, boxShadow: `0 ${sh[1]}px ${sh[2]}px rgba(0,0,0,${sh[0]})`, transform: `rotate(${Math.max(-3, Math.min(3, tilt))}deg)` }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: T.body[0], color: deep(s === "next" ? 0.55 : 0.88), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{words}</span>
      {s === "running" && <RunMark s="running" w={28} />}
      {s === "done" && <Coin role="done" d={18} land><Sign d="tick" s={12} w={2} /></Coin>}
      {s === "next" && <span style={{ fontSize: T.label[0], color: deep(0.4) }}>next</span>}
    </div>
  );
}

/** a folder on Home: the block's lip with its name, the line of what it is for, how many stickies it holds; inside, its
 *  stickies and what it has made */
export function FolderCard({ w, h, name, line, count, children }: { w: number; h: number; name: string; line: string; count?: number; children?: ReactNode }) {
  return (
    <Block w={w} h={h} title={name}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "12px 16px 0" }}>
        <span style={{ flex: 1, fontSize: T.body[0], color: dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</span>
        {count != null && <Num c={mute} style={{ fontSize: T.label[0] }}>{count}</Num>}
      </div>
      {children}
    </Block>
  );
}
