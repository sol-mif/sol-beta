// 1 · Arrival, the first minute (rules 2, 26, 31, 38): the notch on the menu bar, the jelly arrives in it; then the
// window opens on the desk in the person's own terms: their name, their three folders, the one they last had open, and
// their last mode as the default in the bar. The jelly is never a picture here (#1245, acts): it drops from the notch
// (arrive) to its working size beside the folder's name in the greeting, then points at that folder below (point).
import { Sticker } from "../Accent";
import { FolderCard } from "../Folder";
import { TYPE as T } from "../tokens";
import { Display } from "../Yours";
import { Bar, Corner, DayUse, Desk, NOTCH, NotchStrip, Rows, STAGE, SW, Side, Spine, Traveller, Window, beat, useOnGround, usePlay, useSpot } from "./frame";
import { PERSON, folder } from "./person";

export function Folders({ y, h, at }: { y: number; h: number; at?: "class" | "job" | "side" }) {
  const gap = 18, w = (SW - gap * 2) / 3;
  return (
    <>
      {PERSON.folders.map((f, i) => (
        <div key={f.id} id={`day-arrival-${f.id}`} style={{ position: "absolute", left: STAGE + 32 + i * (w + gap), top: y }}>
          <FolderCard w={w} h={h} name={f.name} line={f.line} count={f.stickies.length}>
            {/* a folder's sticker sits in its head, over the count, where Home keeps it (rule 37) */}
            <div style={{ position: "absolute", right: 14, top: 10 }}>
              {f.id === "class" ? <Sticker>exam fri</Sticker> : f.id === at ? <Sticker>open last</Sticker> : null}
            </div>
          </FolderCard>
        </div>
      ))}
    </>
  );
}
export const homeRows = (at: "class" | "job" | "side" | null) => PERSON.folders.map((f) => ({
  title: f.name, s: (f.id === at ? "active" : "rest") as "active" | "rest", aside: f.stickies.length,
}));

/** the jelly's working size on the stage: the one Home and Build carry and work at (frame.tsx Traveller) */
const SIZE = 84;
/** the greeting's measures (tokens: space s8 = 32, the one step the greeting keeps, above the subtitle and under it):
 *  its top, the heading's line (Display at 40, line 1.05), the step between heading and subtitle, so the jelly (84) fits
 *  beside the subtitle with its top clear of the heading's baseline (pack-review-3 item 15) */
const TOP = 64, HEAD = 42, STEP = 32; // tokens.json palette.scale.space.s8 (tokens.ts does not carry the space scale)
/** the subtitle's baseline under its line's middle (SF Pro at 15/24), and the jelly's foot above its box's bottom */
const BASE = 5, FOOT = 23; // FOOT measured on the still: the body stands 23 above its box's bottom
/** the folder row: one step under the greeting, as the greeting keeps one step inside it (the layout skill: spacing from tokens) */
const FOLDERS_Y = TOP + HEAD + STEP + T.read[1] + STEP;

export default function Arrival({ hold }: { hold?: number | null }) {
  // 0 the notch, the jelly arrives in it · 1 the window opens, the jelly drops from the notch to its place beside the
  // folder's name (arrive) · 2 it points at that folder (point), until you pick up where you left off
  const step = usePlay([0, beat(2.4), beat(3.6)], hold), open = step >= 1;
  const g = useOnGround(), last = folder(PERSON.last);
  // its place: left of the subtitle's first word (the folder's name), its foot level with the subtitle's baseline; the
  // greeting stays centred
  const sub = useSpot("[data-arrival-sub]", 0, 0, [STAGE + SW / 2 - 150, TOP + HEAD + STEP + T.read[1] / 2], "left");
  const at: readonly [number, number] = [sub[0] - SIZE / 2 - 4, sub[1] + BASE - SIZE / 2 + FOOT];
  return (
    <>
      <Desk />
      <NotchStrip role="arrive" arriving={!open} mark={open} words={open ? `${last.name} · where you left it` : `good morning, ${PERSON.name}`} />
      <Window open={open}>
        <Spine at="home" />
        <Side title="home" count={PERSON.folders.length} foot={<DayUse v={0.04} />}><Rows rows={homeRows(PERSON.last)} /></Side>
        <Corner s="seen" />
        {/* the heading drops from the notch, so it sits centred under it (jelly-role.html, the heading's place) */}
        <div style={{ position: "absolute", left: STAGE, right: 0, top: TOP, display: "flex", flexDirection: "column", alignItems: "center", gap: STEP }}>
          <Display size={40} color={g.ink}>Morning, {PERSON.name}.</Display>
          <p data-arrival-sub style={{ margin: 0, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: g.dim }}>
            <b style={{ color: g.ink, fontWeight: 500 }}>{last.name}</b> is where you left it, on auto.
          </p>
        </div>
        <Traveller role={step >= 2 ? "point" : "arrive"} size={SIZE} show={open} at={open ? at : NOTCH}
          toward={step >= 2 ? `day-arrival-${PERSON.last}` : undefined} />
        <Folders y={FOLDERS_Y} h={150} at={PERSON.last} />
        <Bar away={open} pick={PERSON.lastMode} hint={`ask, or drop a file into ${last.name}`} />
      </Window>
    </>
  );
}
