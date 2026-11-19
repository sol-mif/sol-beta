// The coin, the sticker and the small glyphs of the groups design (#1537; docs/cowork-ui-2026-11-18/kit.css `.coin`,
// `.stk`, kit.js `G`), ported as drawn. A coin is an AI's state: `sol` the bands drifting (at work), `wait` yellow with
// a ?, `done` green with a tick, `idle` grey. A sticker is a word Sol puts on a thing: mono capitals, a little askew.
import type { ReactNode } from "react";

export type CoinState = "work" | "wait" | "done" | "idle";
const G = { tick: "M4.5 8.4l2.4 2.4 4.6-5.2", ask: "M6.2 6.2a2 2 0 1 1 2.6 1.9c-.6.2-.8.6-.8 1.1M8 11.6v.1", up: "M8 13V3M4 7l4-4 4 4" } as const;

export const Gl = ({ d }: { d: keyof typeof G }) => <svg viewBox="0 0 16 16"><path d={G[d]} /></svg>;

/** `size` 26 (the design's default), 22 on a big jelly, 18 on a small one or in a line */
export function Coin({ state, size = 26 }: { state: CoinState; size?: 18 | 22 | 26 }) {
  const word = state === "work" ? "at work" : state === "wait" ? "waits on you" : state === "done" ? "done" : "at rest";
  return (
    <span className={`gh-coin ${state === "work" ? "sol" : state === "wait" ? "y" : state === "done" ? "g" : "idle"}${size === 18 ? " s18" : size === 22 ? " s22" : ""}`} data-coin={state} title={`their ai: ${word}`}>
      {state === "wait" ? <em>?</em> : state === "done" ? <Gl d="tick" /> : null}
    </span>
  );
}

/** `y` yellow (needs you), `g` green; `xl` the bigger one on a table's edge */
export function Sticker({ y, g, xl, children }: { y?: boolean; g?: boolean; xl?: boolean; children: ReactNode }) {
  return <span className={`gh-stk${y ? " y" : ""}${g ? " g" : ""}${xl ? " xl" : ""}`}>{children}</span>;
}
