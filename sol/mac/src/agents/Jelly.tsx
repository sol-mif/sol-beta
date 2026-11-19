// Every agent's jelly (#1327). Agents are a functional use of the current jelly creature (Marco, 2026-11-16): every agent
// is the one jelly put to one job, "think of it as dedicated people". Home's peek, the offer, the floor, the desk and the
// side draw a jelly only through this component; nothing else draws one. Its props are BodyOne's exactly (size, doing,
// toward, className, turn); `turn` is the agent's band start, so agents are told apart; `doing` comes from its state
// (rest, work, needs: model.ts doingOf).
import type { ReactNode } from "react";
// The jelly is BodyOne (#1256 landed on main through #1391); StandIn keeps SHAPE (the outline) and the props type
import { BodyOne as Body } from "../body/Bodies";
import { SHAPE, type Props } from "./StandIn";

export type { Doing } from "./StandIn";

export function Jelly(p: Props) {
  return <Body {...p} />;
}

/** a jelly with its name for the reader of the screen: the drawing is decoration, the words say who */
export function Named({ name, children }: { name: string; children: ReactNode }) {
  return <span role="img" aria-label={name} className="ag-named">{children}</span>;
}

/** the place a jelly will stand: its outline, dashed, and a plus (the floor's "a typed job"). Not a jelly: nobody yet */
export function Outline({ size }: { size: number }) {
  return (
    <svg className="ag-outline" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d={SHAPE} fill="none" strokeWidth={1.6} strokeDasharray="4 4" />
      <path d="M50 46 v16 M42 54 h16" fill="none" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}
