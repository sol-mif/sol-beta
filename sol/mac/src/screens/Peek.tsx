// The peek (#1090, design round 1): what replaces the dot and the pills. While a block is carried toward the seam on
// one window, the other window draws that block's own frame coming out of its seam at the same height, as much of it
// showing as has passed the edge over there. So the Sol user sees it arrive before the hand lets go; nothing is said.
// It is the block's frame (kit Glass at the block's corner, its title in the head's type), not its live content: one
// glass and one line, moved by transform only, so it never lags the hand.
//   nosing     follows `over` (0..1 of the block's width) as the carry messages come (screens.carry, at most every 33 ms)
//   let go     the real block starts from peekRect (the peek's last place) and slides to its place; the peek is gone
//   ghost      the session's offer (Jev 0.45 to 0.7): the same frame, dashed, 28 px showing; a press sends the block
// Pure: peekRect, flick and halfOver are tested without a window.
import { Glass, Glyph, type GlyphName } from "../kit";
import { ink } from "../kit/paint";
import { CURVE, SHADE, TYPE } from "../kit/tokens";
import type { Edge } from "./model";
import "./peek.css";

export const meta = {
  Peek: {
    job: "a block carried toward the other window is seen arriving there, at the height it left, before it is let go",
    flow: "mine",
    states: ["none", "nosing in", "let go: the real block takes over from here", "ghost: the session's offer, dashed"],
    keys: [{ press: "click a ghost", does: "the block it stands for crosses to this window" }],
    listens: ["screens.carry (relayed by the engine, kept nowhere)"],
  },
};

import { peekRect, GHOST_SHOWS, type Carry } from "./carry";
export { peekRect, overOf, flick, halfOver, GHOST_SHOWS, FLICK, type Carry } from "./carry";

// the kind's mark on the block's own head (kit Glyph, kinds: what a block is)
const MARK: Record<string, GlyphName | undefined> = { page: "page", list: "list", shots: "stills", diff: "diff", terminal: "terminal", browser: "browser", table: "list", card: "note" };

export function Peek({ carry, edge, ghost = false, onPress }: { carry: Carry | null; edge: Edge; ghost?: boolean; onPress?: () => void }) {
  if (!carry) return null;
  const win = { w: window.innerWidth, h: window.innerHeight };
  const side = edge === "left" || edge === "right";
  const over = ghost ? GHOST_SHOWS / (side ? carry.w : carry.h) : carry.over;
  if (over <= 0) return null;
  const r = peekRect(edge, win, { ...carry, over });
  const t = TYPE.head;
  return (
    <div className={`pk ${ghost ? "ghost" : ""} ${edge}`} data-part="the peek" data-block-peek={carry.block}
      style={{ transform: `translate3d(${r.x}px, ${r.y}px, 0)`, width: r.w, height: r.h }}
      onClick={ghost ? onPress : undefined} role={ghost ? "button" : undefined} aria-label={ghost ? `bring ${carry.title} to this window` : undefined}>
      <Glass w={r.w} h={r.h} r={CURVE.radius.block} step="pop" edge={ghost ? 0 : SHADE.on.edge * 2}>
        <div className="pk-head" style={{ fontSize: t[0], lineHeight: `${t[1]}px`, color: ink, justifyContent: edge === "left" ? "flex-end" : "flex-start", ...(edge === "top" ? { position: "absolute", left: 0, right: 0, bottom: 0 } : {}) }}>
          {carry.kind && MARK[carry.kind] && <Glyph name={MARK[carry.kind]!} />}<span>{carry.title}</span>
        </div>
      </Glass>
    </div>
  );
}
