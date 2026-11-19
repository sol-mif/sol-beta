// 7 · Evening (rules 21, 23, 34, 35): what landed today, in big numbers in the person's cut, straight on the window (a
// zine's order comes from type, not from boxes); what was made, as files. The jelly is never a picture here (#1245,
// acts): it brings the day's count out of its seat and sets it down as the big number (carry, land), then rests at the
// notch as the window closes back to it, where it is the mark (mark).
import { FileTile, Num } from "../Accent";
import { dur, ease } from "../../motion";
import { TYPE as T } from "../tokens";
import { BigNum, Display } from "../Yours";
import { homeRows } from "./arrival";
import { Bar, Corner, DayUse, Desk, HeldPill, NOTCH, NotchStrip, Rows, SEAT, STAGE, Side, Spine, Traveller, Window, aim, beat, label, useOnGround, usePlay } from "./frame";
import { PERSON } from "./person";

const X0 = STAGE + 32;
const NUMW = 240, NY = 236, NUM = 132;
/** the jelly's working size (frame.tsx Traveller); where it lands the count: beside the first number, inside its column */
const SIZE = 84;
const BY_COUNT: readonly [number, number] = [X0 + NUMW - 24 - SIZE / 2, NY + NUM / 2];
const DAY: readonly [string, string][] = [["7", "runs landed"], ["3", "your calls, answered"], ["4.5", "hours of focus"]];

function Today({ counted }: { counted: boolean }) {
  const g = useOnGround();
  return (
    <>
      <div style={{ position: "absolute", left: X0, top: 64, display: "grid", gap: 10 }}>
        <Display size={40} color={g.ink}>Good evening, {PERSON.name}.</Display>
        <p style={{ margin: 0, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: g.dim }}>Nothing waits on you. The zine is two spreads closer.</p>
      </div>
      {/* equal columns, so the three marks sit on one rhythm whatever their words' widths (rule 21) */}
      <div style={{ position: "absolute", left: X0, top: NY, display: "grid", gridTemplateColumns: `repeat(${DAY.length}, ${NUMW}px)` }}>
        {DAY.map(([n, w], i) => (
          <div key={w} style={{ display: "grid", gap: 12 }}>
            {/* the first number is the one the jelly brings: its place holds still until it lands (rule 26) */}
            <span style={{ opacity: i > 0 || counted ? 1 : 0, transition: `opacity ${dur("land")}ms ${ease("pour")}` }}><BigNum size={NUM} color={g.ink}>{n}</BigNum></span>
            <span style={{ fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: g.dim }}>{w}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: X0, top: 478, display: "grid", gap: 14 }}>
        <span style={{ ...label, color: g.mute }}>made today</span>
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
          <FileTile s="rest" kind={3} name="chapter 6.pdf" /><FileTile s="rest" kind={6} name="three covers" />
          <FileTile s="rest" kind={2} name="the rota.xlsx" /><FileTile s="rest" kind={4} name="letter.md" />
        </div>
      </div>
    </>
  );
}

export default function Evening({ hold }: { hold?: number | null }) {
  // 0 the day, the jelly in its seat · 1 it carries the count out (carry) · 2 it sets the 7 down (land) · 3 it sits by
  // it · 4 the window closes; it rests at the notch, where it is the mark
  const step = usePlay([0, beat(1), beat(2.2), beat(3.2), beat(4.6)], hold), closed = step >= 4;
  const rows = homeRows(null), out = step >= 1 && step <= 3;
  return (
    <>
      <Desk />
      <NotchStrip mark={closed} words={closed ? "7 landed today · see you tomorrow" : "the day · 7 landed"} />
      <Window open={!closed}>
        <Spine at="home" />
        <Side title="home" count={rows.length} foot={<DayUse v={0.71} />}><Rows rows={rows} /></Side>
        <Corner s="seen" />
        <Today counted={step >= 2} />
        <Traveller role={step === 1 ? "carry" : step === 2 ? "land" : closed ? "mark" : "sit"} size={SIZE}
          show={out} at={closed ? NOTCH : step >= 1 ? BY_COUNT : SEAT} toward={step === 1 ? aim(SEAT, BY_COUNT) : undefined}
          holding={<HeldPill><Num c="inherit" style={{ fontSize: T.body[0] }}>7</Num> runs landed</HeldPill>} />
        <Bar away={out} pick={PERSON.lastMode} />
      </Window>
    </>
  );
}
