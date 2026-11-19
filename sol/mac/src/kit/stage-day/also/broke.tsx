// Also · Broke (rules 5, 17, 26, 28, 33, 37): a run in Build failed, the printer's quote came back empty. The block keeps
// its shape and its place; the state is a shape first (rule 17): the run mark notched, the step's row stamped STOPPED in
// the functional soft red (never the strong one, never a glow, rule 5), one line of what happened in plain words, and
// the one thing to press: try again, or undo (the undo ring, rule 28). The jelly comes out and points at it (rule 33);
// the red stays on the block, the jelly keeps its six.
import type { ReactNode } from "react";
import { HoldStill, MEANING, PillControl, RunMark, Sticker, UndoRing, ink } from "../../Accent";
import { TYPE as T } from "../../tokens";
import { Bar, Card, Corner, Done, NotchStrip, Para, Perch, SEAT, Step, Traveller, Window, Spine, beat, usePlay } from "../frame";
import { COL, ListBlock, PageBlock, ROW, X0, X1, Y0, Y1, ZineSide } from "../build";
import { PERSON, folder } from "../person";

export const BROKE_ID = "day-broke";
/** on the bare ground under the to-do, its seat under its foot, pointing up at the broken block: beside it, never on a
 *  block (rule 27; build.tsx's place under the run it works beside) */
const BESIDE: readonly [number, number] = [X1 + 64, Y1 + 64];

/** the run mark, notched (rule 17: stopped is a shape before it is a colour): the kit's failed mark with a bite out of
 *  its top, so it reads stopped in grey too */
const Notched = ({ w = 24 }: { w?: number }) => (
  <span style={{ display: "inline-flex", clipPath: `polygon(0 0, ${w / 2 - 4}px 0, ${w / 2}px 5px, ${w / 2 + 4}px 0, 100% 0, 100% 100%, 0 100%)` }}>
    <RunMark s="failed" w={w} />
  </span>
);
const Stopped = ({ children }: { children: ReactNode }) => <Sticker fill={MEANING.wrong} land>{children}</Sticker>;

export default function Broke({ hold }: { hold?: number | null }) {
  // 0 the quote run running · 1 it stopped: notched, stamped, the line and the press; the jelly out, pointing
  const step = usePlay([0, beat(1.6)], hold), broke = step >= 1;
  const zine = folder("side").name;
  return (
    <>
      {/* the notch says it in six words */}
      <NotchStrip words={broke ? "the printer's quote came back empty" : `${zine} · the quote, 1m`} />
      <Window>
        <Spine at="build" />
        <ZineSide />
        <Corner s={broke ? "one" : "seen"} />
        <Card id={BROKE_ID} x={X0} y={Y0} w={COL} h={ROW} title="a quote from the printer">
          <HoldStill value={broke}>
            <Step lead={<Done />} words="three printers asked" note="done" />
            <Step lead={broke ? <Notched /> : <RunMark s="running" w={24} />} words="the quote, read into the budget"
              note={broke ? <Stopped>stopped <span style={{ fontVariantNumeric: "tabular-nums" }}>9:12</span></Stopped> : "now"} />
          </HoldStill>
          {broke && <>
            <Para style={{ paddingTop: 12, color: ink }}>The printer sent the quote back empty, so there is no price yet.</Para>
            {/* the one thing to press: again, or take the run back (rule 28) */}
            <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
              <PillControl s="hover" w={96} h={52}>{/* the undo ring's height, so the press row is one row (rule 35) */}<span style={{ fontSize: T.body[0] }}>try again</span></PillControl>
              <UndoRing s="closed" w={COL - 36 - 96 - 10} words="started the quote" />
            </div>
          </>}
        </Card>
        {/* the covers were drawn at 9:04 in Build; the quote stops at 9:12, so they stay ticked (the day holds) */}
        <ListBlock covers />
        <PageBlock />
        <Perch at={BESIDE} show={broke} />
        <Traveller role={broke ? "point" : "sit"} show={broke} at={broke ? BESIDE : SEAT} toward={broke ? BROKE_ID : undefined} />
        <Bar away={broke} pick={PERSON.lastMode} />
      </Window>
    </>
  );
}
