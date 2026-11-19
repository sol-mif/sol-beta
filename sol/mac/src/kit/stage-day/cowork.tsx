// 5 · Cowork (rules 14, 17, 21, 26, 37): a team's thread as a session list with one active row (pearl, rule 14); a
// handover arrives: the other agent's spec, carried in by the jelly, composed by the generator piece by piece beside it,
// signed by that person's agent; a decision lands as a coin. Who said
// what is a steady row (rule 37): the same shape for every message, nothing tilts.
import type { ReactNode } from "react";
import { Coin, Num, Sign, surface, well, dim, ink, mute } from "../Accent";
import { TYPE as T } from "../tokens";
import { BAR_TOP, Bar, Card, Perch, Corner, DayUse, Done, NotchStrip, Rows, SEAT, STAGE, Side, Signed, Spine, Traveller, W, Window, HeldPill, aim, beat, label, usePlay } from "./frame";
import { GenBlock } from "./gen";
import { HANDOVER, HANDOVER_SAID, SAM, composing, piecesOf } from "./specs";
import { PERSON, folder } from "./person";

const X0 = STAGE + 32, TW = 560, X1 = X0 + TW + 20, HW = W - 32 - X1, Y0 = 56, TH = BAR_TOP - 24 - Y0;
/** who else is on the team: the people stay first names; their agents sign as theirs */
const JO = "Jo";

function Message({ who, when, agent, children }: { who: string; when: string; agent?: boolean; children: ReactNode }) {
  return (
    <div style={{ padding: "10px 18px", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {agent ? <Signed who={who} /> : <span style={{ fontSize: T.body[0], fontWeight: 500, color: ink }}>{who}</span>}
        <span style={{ ...label, color: mute, fontVariantNumeric: "tabular-nums" }}>{when}</span>
      </div>
      <div style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: dim }}>{children}</div>
    </div>
  );
}

/** the handover the other agent composed (specs.ts HANDOVER), drawn by the generator; the jelly works beside it, below */
const HANDOVER_ID = "day-handover", HANDOVER_H = 210;

export default function Cowork({ hold }: { hold?: number | null }) {
  // 0 the thread · 1 the other agent's sentence in the notch for a beat (specs.ts HANDOVER_SAID, made the spec by
  // gen/say.ts), the empty handover block arrives; the jelly comes in at the corner with its spec (carry) · 2 it
  // carries it beside the block · 3, 4, 5 it works, a piece lands each step · 6 the last piece (land) · 7 going home
  // (sit), and the decision lands as a coin on the thread
  const step = usePlay([0, beat(1.4), beat(2.2), beat(2.8), beat(3.4), beat(4.0), beat(4.6), beat(5.6)], hold);
  const out = step >= 1 && step <= 7, landed = step >= 6, decided = step >= 7;
  const n = Math.max(0, Math.min(piecesOf(HANDOVER), step - 2));
  const job = folder("job").name, inAt: readonly [number, number] = [W - 32 - 70, 150];
  const beside: readonly [number, number] = [X1 + 64, Math.min(Y0 + HANDOVER_H + 46, BAR_TOP - 46)];
  const role = step <= 2 ? "carry" : step <= 5 ? "work" : step === 6 ? "land" : "sit";
  const rows = [
    { title: "the rota, next week", s: "active" as const, aside: decided ? <Done d={8} /> : undefined },
    { title: "the oat milk order", s: "rest" as const, aside: landed ? "handed over" : undefined },
    { title: "saturday hours", s: "rest" as const, aside: 2 },
  ];
  return (
    <>
      <NotchStrip words={step === 0 ? `${job} · 3 here` : step === 1 ? composing(HANDOVER_SAID) : landed ? `${SAM}'s agent handed over` : "a handover is coming"} />
      <Window>
        <Spine at="cowork" />
        <Side title={job} count={rows.length} foot={<DayUse v={0.38} />}><Rows rows={rows} /></Side>
        <Corner s={step === 0 ? "one" : "seen"} />
        <Card x={X0} y={Y0} w={TW} h={TH} title="the rota, next week" mark={<span style={{ display: "inline-flex", gap: 4, alignItems: "center", ...label, color: mute }}><Num c={dim} style={{ fontSize: T.label[0] }}>3</Num>here</span>}>
          <Message who={JO} when="8:12">Can someone take sunday morning? I'm away from saturday night.</Message>
          <Message who={SAM} when="8:20" agent>{SAM} can take sunday, 8 to 12. I moved {JO}'s shift to monday close and put both on the rota.</Message>
          <Message who="you" when="8:31">Then I'll do saturday close. And let's open at 7 on saturdays, the market crowd is there by then.</Message>
          <Message who={JO} when="8:40">Yes to 7.</Message>
          {/* the decision: its own steady row, the coin lands on it (rule 26) */}
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, height: 56, borderRadius: 14, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", ...well() }}>
            {decided ? <Coin role="done" d={26} land><Sign d="tick" s={16} w={2} /></Coin> : <span style={{ width: 26, height: 26, borderRadius: 13, ...surface("control") }} />}
            <span style={{ flex: 1, fontSize: T.body[0], color: decided ? ink : mute }}>{decided ? "Decided: we open at 7 on saturdays." : "open at 7 on saturdays?"}</span>
            {/* the decision lands as the coin (SCENES); a stamp beside it said done a second time (rule 17, the pack's read) */}
            {decided && <Num c={mute} style={{ fontSize: T.label[0] }}>8:41</Num>}
          </div>
        </Card>
        {step >= 1 && <GenBlock spec={HANDOVER} x={X1} y={Y0} w={HW} n={n} id={HANDOVER_ID} land />}
        {/* where it stops below the handover is bare ground: its seat is under it (the pack's first read, the middle step) */}
        <Perch at={beside} show={step >= 2 && step <= 6} />
        <Traveller role={role} show={out && step < 7} at={step === 1 ? inAt : step >= 2 && step <= 6 ? beside : SEAT}
          toward={role === "carry" ? aim(inAt, beside) : role === "sit" ? undefined : HANDOVER_ID} holding={<HeldPill>the oat milk order</HeldPill>} />
        <Bar away={out && step < 7} pick={PERSON.lastMode} hint={`write to ${job}, or ask`} />
      </Window>
    </>
  );
}
