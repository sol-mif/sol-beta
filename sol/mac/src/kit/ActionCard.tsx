// An action card (#1299; the card family, the call on #1299, 2026-11-16: "same frame, different press"): a face and
// either one press or one question. The face: a title line, a body of up to three lines, and a "said by" line (who · when · session), read
// without opening anything. The press is the card's one action; left out, a card with a proof gets "show the proof",
// which opens the proof in a fold under the card (the computation or the comment behind it). A press that is not this
// person's is drawn and disabled, with the reason under it: a state is its shape first, then its words.
// The question (`asks`, the lead on #1299): yes, no, later as three pills and nothing to type; later means "it comes
// back at the night". A card has one or the other, never both: a decision card keeps its one press, a press card that
// waits on a person's word asks.
// Two uses today: the press card (a release waiting on a press) and the decision card (a relayed decision); the Room
// (#1298) reuses it. So it knows no feature's words: the caller says them all.
// Built on the kit's Card (glass at the card's step, look.md: corners) and Button (flat, look.md: colour from the
// jelly); the fold moves by motion.ts's reveal.
import { useState, type ReactNode } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import { Pill } from "./Pill";
import { dim, ink, mute, on } from "./paint";
import { SHADE, TYPE } from "./tokens";
import { dur, ease } from "../motion";

export type Said = { who: string; when: string; session?: string };
export type Press = { label: string; on?: () => void; /** set: the press is drawn, disabled, and this says why */ why?: string };
/** the one question: three pills, nothing to type; `later` brings it back at the night. `why` set: drawn, disabled, said why */
export type Asks = { yes: () => void; no: () => void; later: () => void; why?: string };
const ASK_WORDS = ["yes", "no", "later"] as const;

const LINE = TYPE.body[1], PAD = 16, GAP = 8, PRESS_H = 28;

export function ActionCard({ w = 420, title, body, said, press, asks, proof, open: opened, mark }: {
  w?: number; title: ReactNode; body?: ReactNode; said: Said; proof?: ReactNode;
  /** one press, or one question: never both (`asks` wins) */ press?: Press; asks?: Asks;
  /** the fold open from the start (a picture of it) */ open?: boolean;
  /** a small mark before the title (the card's kind, by its shape) */ mark?: ReactNode;
}) {
  const [open, setOpen] = useState(!!opened);
  const p: Press | undefined = asks ? undefined : press ?? (proof != null ? { label: open ? "hide the proof" : "show the proof", on: () => setOpen((o) => !o) } : undefined);
  const saidLine = [said.who, said.when, said.session ? `session ${said.session}` : ""].filter(Boolean).join(" · ");
  return (
    <div style={{ width: w, maxWidth: "100%" }}>
      <Card w={w} style={{ maxWidth: "100%" }}>
        <div style={{ position: "relative", padding: PAD, display: "flex", flexDirection: "column", gap: GAP, fontFamily: TYPE.family }}>
          <div style={{ display: "flex", alignItems: "center", gap: GAP, minWidth: 0 }}>
            {mark != null && <span style={{ flex: "none", width: 16, display: "grid", placeItems: "center" }}>{mark}</span>}
            <span style={{ flex: 1, minWidth: 0, color: ink, fontSize: TYPE.body[0], lineHeight: `${LINE}px`, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          </div>
          {body != null && (
            // up to three lines, then an ellipsis: the face is read without opening
            <div style={{ color: dim, fontSize: TYPE.body[0], lineHeight: `${LINE}px`, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{body}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: GAP, minWidth: 0, minHeight: PRESS_H }}>
            <span style={{ flex: 1, minWidth: 0, color: mute, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={saidLine}>
              said by {saidLine}
            </span>
            {p && (p.why
              ? <span aria-disabled="true" title={p.why} style={{ flex: "none", opacity: SHADE.on.dim, cursor: "not-allowed", pointerEvents: "none" }}><Button h={PRESS_H} flat label={p.label}>{p.label}</Button></span>
              : <span style={{ flex: "none" }}><Button h={PRESS_H} flat acts label={p.label} onClick={p.on}>{p.label}</Button></span>)}
          </div>
          {asks && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: GAP, ...(asks.why ? { opacity: SHADE.on.dim, pointerEvents: "none" as const } : {}) }} aria-disabled={asks.why ? true : undefined} title={asks.why}>
              {ASK_WORDS.map((k) => <Pill key={k} words={[k]} picked={-1} h={PRESS_H} onPick={() => asks[k]()} />)}
            </div>
          )}
          {(p?.why ?? asks?.why) && <div style={{ color: mute, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px`, textAlign: "right" }}>{p?.why ?? asks?.why}</div>}
        </div>
      </Card>
      {proof != null && (
        <div aria-hidden={!open} style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: `grid-template-rows ${dur("reveal")}ms ${ease("reveal")}` }}>
          <div style={{ overflow: "hidden", minWidth: 0 }}>
            <div style={{ margin: `${GAP}px ${PAD}px 0`, padding: `${GAP}px ${PAD - GAP}px`, borderLeft: `1px solid ${on(SHADE.on.edge)}`, color: dim, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px`, fontFamily: TYPE.family }}>
              {proof}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
