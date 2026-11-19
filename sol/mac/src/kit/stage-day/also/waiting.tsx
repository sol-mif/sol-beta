// Also · Waiting (rules 5, 20, 37): Cowork, and the other person is away. The thread's last row is yours; the handover
// is a steady row that says who has it and since when; the jelly sits lower and waits (act `wait`). Nothing pulses,
// nothing glows (rule 5): every piece is held still, the steady parts say why (rule 37).
import type { ReactNode } from "react";
import { HoldStill, Num, dim, ink, mute, on, well } from "../../Accent";
import { TYPE as T } from "../../tokens";
import { BAR_TOP, Bar, Card, Corner, DayUse, NotchStrip, Para, Rows, STAGE, Side, Spine, W, Window, beat, label, usePlay } from "../frame";
import { PERSON, folder } from "../person";

const X0 = STAGE + 32, TW = 560, X1 = X0 + TW + 20, HW = W - 32 - X1, Y0 = 56, TH = BAR_TOP - 24 - Y0;
/** who has it: a first name, as in Cowork */
const SAM = "Sam";

function Message({ who, when, children }: { who: string; when: string; children: ReactNode }) {
  return (
    <div style={{ padding: "10px 18px", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: T.body[0], fontWeight: 500, color: ink }}>{who}</span>
        <span style={{ ...label, color: mute, fontVariantNumeric: "tabular-nums" }}>{when}</span>
      </div>
      <div style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: dim }}>{children}</div>
    </div>
  );
}
/** whose hands it is in: their initial on a flat grey coin (cowork.tsx's Signed), the thing, since when; steady (rule 37) */
const Holder = ({ what, who, since }: { what: string; who: string; since: string }) => (
  <div style={{ margin: "6px 10px 0", height: 52, borderRadius: 14, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", ...well() }}>
    <span style={{ width: 22, height: 22, borderRadius: 11, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on(0.1), color: dim, fontSize: T.label[0], fontWeight: 500 }}>{who.slice(0, 1)}</span>
    <span style={{ flex: 1, minWidth: 0, fontSize: T.body[0], color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{what}</span>
    <span style={{ ...label, color: mute, whiteSpace: "nowrap" }}>with {who}, since <Num c={dim} style={{ fontSize: T.label[0] }}>{since}</Num></span>
  </div>
);

export default function Waiting({ hold }: { hold?: number | null }) {
  // 0 your words go in · 1 sent: the thread's last row is yours; the jelly waits
  const step = usePlay([0, beat(1.4)], hold), sent = step >= 1;
  const job = folder("job").name;
  const rows = [
    { title: "the oat milk order", s: "active" as const, aside: sent ? `with ${SAM}` : undefined },
    { title: "the rota, next week", s: "rest" as const },
    { title: "saturday hours", s: "rest" as const, aside: 2 },
  ];
  return (
    <HoldStill value>
      <NotchStrip role={sent ? "wait" : "sit"} words={sent ? `${job} · with ${SAM}` : `${job} · 2 here`} />
      <Window>
        <Spine at="cowork" />
        <Side title={job} count={rows.length} foot={<DayUse v={0.4} />}><Rows rows={rows} /></Side>
        <Corner s="seen" />
        <Card x={X0} y={Y0} w={TW} h={TH} title="the oat milk order">
          <Message who={SAM} when="8:38">I'll call the dairy about the price and come back to this. Away till two.</Message>
          <Message who="you" when="8:52">Fine. If they won't go lower, order twelve, not twenty.</Message>
          {sent && <Message who="you" when="9:05">And ask if they deliver on sundays now.</Message>}
        </Card>
        <Card x={X1} y={Y0} w={HW} h={184} title="handed over">
          <Holder what="the oat milk order" who={SAM} since="8:40" />
          <Para style={{ paddingTop: 14 }}>{SAM} is away until two. It picks up when they are back; nothing needs you.</Para>
        </Card>
        <Bar state={sent ? "empty" : "typed"} words="And ask if they deliver on sundays now." role={sent ? "wait" : "sit"} pick={PERSON.lastMode} hint={`write to ${job}, or ask`} />
      </Window>
    </HoldStill>
  );
}
