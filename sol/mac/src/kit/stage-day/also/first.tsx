// Also · First (rules 2, 26, 31, 38): the very first minute, no folders at all. The notch greets without a name (it
// does not know one yet); the jelly arrives; the window opens on the desk and the stage holds three suggested folders
// as ghosts, dashed with no fill (not yet a thing, so not yet solid, rule 1), each one the person can take; the bar
// says what to type.
import { PillControl } from "../../Accent";
import { TYPE as T } from "../../tokens";
import { Display } from "../../Yours";
import { Bar, Corner, DayUse, Desk, Jelly, NotchStrip, R, STAGE, SW, Side, Spine, Window, beat, useOnGround, usePlay } from "../frame";

/** what most people's weeks hold: a class, work, a thing of their own (brand.md, The person) */
const GHOSTS = [
  { name: "a class", line: "notes, papers, the exam" },
  { name: "work", line: "the rota, the orders, the team" },
  { name: "a thing of your own", line: "the side project, the zine" },
];

function Ghost({ x, y, w, h, name, line }: { x: number; y: number; w: number; h: number; name: string; line: string }) {
  const g = useOnGround();
  return (
    <div data-ghost style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: R, boxSizing: "border-box", border: `1.5px dashed ${g.mute}` }}>
      <div style={{ padding: "16px 18px 0", fontSize: T.head[0], fontWeight: 500, color: g.dim }}>{name}</div>
      <div style={{ padding: "6px 18px 0", fontSize: T.body[0], color: g.mute }}>{line}</div>
      <div style={{ position: "absolute", left: 16, bottom: 16 }}><PillControl s="rest" w={84} h={32}>take it</PillControl></div>
    </div>
  );
}

export default function First({ hold }: { hold?: number | null }) {
  // 0 the jelly arrives in the notch, the greeting · 1 the window opens: the ghosts, the bar's words
  const step = usePlay([0, beat(2.4)], hold), open = step >= 1;
  const g = useOnGround(), gap = 18, w = (SW - gap * 2) / 3, gy = 404, gh = 150; // the folders' place and height in Arrival, so the ghosts stand where the folders will
  return (
    <>
      <Desk />
      <NotchStrip role="arrive" arriving={!open} words={open ? "home · your first folder" : "hello, I'm Sol"} />
      <Window open={open}>
        <Spine at="home" />
        <Side title="home" count={0} foot={<DayUse v={0} />}>
          <div style={{ padding: "4px 18px", fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: g.mute }}>Your folders will be here.</div>
        </Side>
        <Corner s="seen" />
        <div style={{ position: "absolute", left: STAGE, right: 0, top: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {open && <Jelly role="arrive" size={84} />}{/* the stage jelly's one size, as in the seven (rule 31) */}
          <Display size={40} color={g.ink}>Hello. What's your week?</Display>
          <p style={{ margin: 0, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: g.dim }}>Take a folder below, or name your own.</p>
        </div>
        {GHOSTS.map((x, i) => <Ghost key={x.name} x={STAGE + 32 + i * (w + gap)} y={gy} w={w} h={gh} name={x.name} line={x.line} />)}
        {/* the jelly is on the stage, so its seat is empty: one jelly in the window (rule 31) */}
        <Bar away={open} pick={2} hint="name a folder, like “linear algebra” or “the café”" />
      </Window>
    </>
  );
}
