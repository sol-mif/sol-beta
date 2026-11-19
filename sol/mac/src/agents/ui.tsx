// Agents mode's few pieces (#1327, pass 2), each the kit's (kit/index.ts) with no look of its own: the one lit action of
// a screen is the kit's Button; a quiet one beside it the kit's flat Button; a surface is the kit's Glass behind a box
// that sizes itself. Where play.html's sketch and the kit differ, the kit wins.
import type { ReactNode } from "react";
import { Button, Glass, Pill } from "../kit";
import { CURVE, LOOKS, type Step } from "../kit/tokens";
import type { Said } from "./Desk";
import type { Ask } from "./useAgents";
import { saidOf, type Change } from "./model";

/** the scale's control heights (tokens.json palette.scale: --h-row, --h-chip); the kit's buttons take theirs as numbers */
export const ROW = 32, CHIP = 24;

/** the screen's one action: the kit's lit pill (Pill.tsx: the effort pill's heat, the same on every pill with
 *  consequence), at the strength a button's press washes in */
export function Go({ children, onClick, busy, label }: { children: string; onClick: () => void; busy?: boolean; label?: string }) {
  const go = () => { if (!busy) onClick(); };
  return (
    <span className="ag-go" role="button" tabIndex={0} aria-label={label ?? children} data-busy={busy || undefined} aria-busy={busy || undefined}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } }}>
      <Pill words={[busy ? "…" : children]} picked={-1} h={ROW} wash={LOOKS.button.takes.wash.press} onPick={go} />
    </span>
  );
}
/** a quiet action beside it: the kit's flat button */
export function Quiet({ children, onClick, small, label }: { children: string; onClick: () => void; small?: boolean; label?: string }) {
  return <span className="ag-quiet"><Button h={small ? CHIP : ROW} flat label={label} onClick={onClick}>{children}</Button></span>;
}
/** a box on the kit's glass at a shade step (card by default; raised for what stands in front; box for a well) */
export function Surface({ step = "card", r = CURVE.radius.card, className, children, ...rest }: { step?: Step; r?: number; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`ag-surface ${className ?? ""}`} {...rest}><Glass r={r} step={step} surface={step === "raised" ? "raised" : step === "box" ? "box" : "glass"} />{children}</div>;
}

/** the lock on a blocked agent's jelly: a small pearl disc with a padlock, beside the greyed body */
export function Lock() {
  return (
    <span className="ag-lock" aria-label="blocked" role="img">
      <svg viewBox="0 0 10 10" aria-hidden><path d="M3 4.5V3.4a2 2 0 0 1 4 0v1.1M2.6 4.5h4.8v3.6H2.6z" /></svg>
    </span>
  );
}

/** a press that writes: its answer as the one line under the screen, with undo when the engine gave one */
export async function pressed(ask: Ask, o: { type: string } & Record<string, unknown>, what: string, onSaid: (s: Said) => void, ms = 15_000) {
  const r = await ask<{ ok: boolean; why?: string; line?: string; change?: Change } & Record<string, any>>(o, ms);
  const s = saidOf(r, what);
  onSaid({ ...s, ...(r?.change?.undo && !r.change.undone ? { undo: r.change.id } : {}) });
  return r;
}
