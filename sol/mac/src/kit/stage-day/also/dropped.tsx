// Also · Dropped (rules 8, 18, 26, 36): Home, a file dragged into a folder. It rides lifted over the stage; over the
// folder, the folder rises one step (rule 8: lifted is height, never a new material); let go, the file lands in the
// folder's foot (rule 26), and the jelly carries in the sticky it made from it ("read by tonight") and sets it down.
import { FileTile, Num, Sticker, mute } from "../../Accent";
import { FolderCard, Sticky, type StickyState } from "../../Folder";
import { SYSTEM, TYPE as T } from "../../tokens";
import { dur, ease } from "../../../motion";
import { homeRows } from "../arrival";
import { BAR_TOP, Bar, Corner, DayUse, NotchStrip, Rows, SEAT, STAGE, SW, Side, Spine, Traveller, Window, beat, aim, usePlay } from "../frame";
import { PERSON, folder } from "../person";

const GAP = 18, FW = (SW - GAP * 2) / 3, FY = 56, FH = BAR_TOP - FY - 28;
const NEW = "lecture 7, read by tonight", FILE = "lecture 7.pdf";
/** the file under the pointer: on the stage between the folders, then over the class folder's middle (window px) */
const FROM: readonly [number, number] = [STAGE + 32 + FW + GAP + FW * 0.6, FY + FH * 0.62];
const OVER: readonly [number, number] = [STAGE + 32 + FW * 0.55, FY + FH * 0.5];
/** where the new sticky goes on the class folder: the row under its three */
const PUT: readonly [number, number] = [STAGE + 32 + FW / 2, FY + 92 + 4 * 50 + 20];

export default function Dropped({ hold }: { hold?: number | null }) {
  // 0 the file dragged onto the stage · 1 over the class folder, the folder up one step · 2 let go: the file in its foot,
  // the jelly out with the sticky it made (carry) · 3 at the folder, setting it down (land) · 4 home, sitting
  const step = usePlay([0, beat(1.2), beat(2.4), beat(3.4), beat(4.4)], hold);
  const cls = folder("class"), over = step === 1, dropped = step >= 2, out = step >= 2 && step <= 3, put = step >= 3;
  const fileAt = step === 0 ? FROM : OVER;
  return (
    <>
      <NotchStrip words={put ? `${cls.name} · a sticky for tonight` : dropped ? `${cls.name} · reading ${FILE}` : `${cls.name} · drop it in`} />
      <Window>
        <Spine at="home" />
        <Side title="home" count={PERSON.folders.length} foot={<DayUse v={0.14} />}><Rows rows={homeRows(dropped ? "class" : null)} /></Side>
        <Corner s="seen" />
        {PERSON.folders.map((f, i) => {
          const stickies = f.id === "class" && put ? [...f.stickies, NEW] : f.stickies;
          return (
            <div key={f.id} id={`day-drop-${f.id}`} style={{ position: "absolute", left: STAGE + 32 + i * (FW + GAP), top: FY, zIndex: f.id === "class" && over ? 5 : undefined,
              // the folder under the file rises one step: the lifted depth's rise and scale (rule 8)
              transform: f.id === "class" && over ? `translateY(-4px) scale(${SYSTEM.depth.lifted.scale})` : "none",
              transition: `transform ${dur("glass")}ms ${ease("reveal")}` }}>
              <FolderCard w={FW} h={FH} name={f.name} line={f.line} count={stickies.length}>
                <div style={{ display: "grid", gap: 10, padding: "16px 14px 0" }}>
                  {stickies.map((s, k) => {
                    const st: StickyState = f.id === "class" ? (k < 3 ? "done" : "next") : f.id === "job" && k === 0 ? "done" : "next";
                    return <div key={s} style={{ animation: s === NEW ? `ac-land ${dur("land")}ms ${ease("pour")} both` : undefined }}><Sticky words={s} w={FW - 28} s={st} /></div>;
                  })}
                </div>
                {f.id === "class" && dropped && (
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, display: "flex", justifyContent: "center" }}><FileTile s="made" kind={3} name={FILE} /></div>
                )}
                <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", justifyContent: "space-between", fontSize: T.label[0], color: mute }}>
                  <span>{f.id === "class" ? (put ? "1 for tonight" : "3 done today") : f.id === "job" ? "1 done today" : "2 for tonight"}</span>
                  <Num c={mute} style={{ fontSize: T.label[0] }}>{f.id === "class" ? `3/${stickies.length}` : f.id === "job" ? "1/2" : "0/2"}</Num>
                </div>
                {f.id === "class" && <span style={{ position: "absolute", right: 14, top: 10 }}><Sticker>exam fri</Sticker></span>}
              </FolderCard>
            </div>
          );
        })}
        {/* the file in the hand: lifted (rule 8), riding over the folders until it is let go */}
        {!dropped && (
          <div style={{ position: "absolute", left: 0, top: 0, zIndex: 10, transform: `translate(${fileAt[0] - 32}px, ${fileAt[1] - 40}px)`, transition: `transform ${dur("pour")}ms ${ease("move")}` }}>
            <FileTile s="dragged" kind={3} name={FILE} />
          </div>
        )}
        <Traveller role={step === 2 ? "carry" : step === 3 ? "land" : "sit"} show={out} at={step === 3 ? PUT : SEAT}
          toward={step === 2 ? aim(SEAT, PUT) : step === 3 ? "day-drop-class" : undefined}
          holding={<Sticky words="read by tonight" s="next" w={150} />} />
        <Bar away={out} pick={PERSON.lastMode} hint={`ask, or drop a file into ${cls.name}`} />
      </Window>
    </>
  );
}
