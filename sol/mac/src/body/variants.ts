// The body (#1215, then #1213): two bodies, A today's lit jelly (the control, what every window draws) and "one", the body
// drawn from the one system (sol/design/system/rules.md, rules 31 to 34): a piece like the others, the card's light and
// drop, the jelly's six as its fill, deep pill eyes. The four pin bodies of the sitting (B to E) are gone: copying a pin
// per body gave five unrelated bodies (Marco 2026-11-15). Both bodies carry the system's own token set, so a window never
// re-lights from its body; the body adapts to the pieces (function first, 11-15).
// The switch is page-wide and dev-only: a page sets it once before it draws (mac/body.html, ?variant=one). Nothing in the
// app sets it, so every window draws A as before.
import { GLASS, JELLY } from "../kit/tokens";

export type BodyVariant = "a" | "one";
export const VARIANTS: readonly BodyVariant[] = ["a", "one"];
/** what the body is doing, by the ladder (rule 33): rest breathes, work drifts its bands, needs lifts toward the ask.
 *  Each maps onto one of the jelly's acts (body/role.ts ACT_OF): rest sits, work works, needs points */
export type BodyDoing = "rest" | "work" | "needs";

/** a body's token set: palette.jelly's shape and palette.glass.light's */
export type BodyTokens = {
  jelly: { six: readonly string[]; warm: readonly string[]; angle: number; soft: number; veil: number };
  light: { from: readonly [number, number] | readonly number[]; rim: number; sheen: number };
};
export type BodyInfo = { id: BodyVariant; name: string; source: string; tokens: BodyTokens };

const SYSTEM_SET: BodyTokens = { jelly: JELLY, light: GLASS.light };
export const BODIES: Record<BodyVariant, BodyInfo> = {
  a: { id: "a", name: "today's lit jelly", source: "Body.tsx rendering A (body/one.html, 2026-11-04)", tokens: SYSTEM_SET },
  one: { id: "one", name: "the body from the system", source: "body/Bodies.tsx, rules.md 31 to 34 (#1213)", tokens: SYSTEM_SET },
};

let current: BodyVariant = "a", doing: BodyDoing = "rest";
/** the body this page draws (A unless a page set another) */
export const bodyVariant = () => current;
/** set the page's body before it draws */
export function setBodyVariant(v: BodyVariant) { current = v; }
/** what the page's body is doing (a dev page sets it per take; the app never does yet) */
export const bodyDoing = () => doing;
export function setBodyDoing(d: BodyDoing) { doing = d; }
