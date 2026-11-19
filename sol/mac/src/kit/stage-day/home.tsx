// 2 · Home, folders that do work (rules 1, 17, 20, 26, 35): three folders as cards; one folder's stickies get done while
// you watch, one at a time (the one moving thing, rule 20), each coin landing as it finishes; then the jelly takes what
// was made out of its seat and carries it into the folder, where it lands with its sticker.
import { FileTile, Num, Sticker, mute } from "../Accent";
import { FolderCard, Sticky, type StickyState } from "../Folder";
import { TYPE as T } from "../tokens";
import { homeRows } from "./arrival";
import { BAR_TOP, Bar, Corner, DayUse, NotchStrip, Rows, SEAT, STAGE, SW, Side, Spine, Traveller, Window, HeldPill, aim, beat, usePlay } from "./frame";
import { PERSON, folder } from "./person";

const GAP = 18, FW = (SW - GAP * 2) / 3, FY = 56, FH = BAR_TOP - FY - 28;
/** a sticky is a row on its folder, square: only a sticker leans (rule 36, the pack's read) */
const TILT = [0, 0, 0];
/** the finished thing's place in the class folder, in the window */
const DROP: readonly [number, number] = [STAGE + 32 + FW / 2, FY + FH - 74];

export default function Home({ hold }: { hold?: number | null }) {
  // 0 the first sticky running · 1, 2 the next · 3 all done, the jelly up out of its seat with the file (carry) · 4 at
  // the folder · 5 it sets the file down in it (land) · 6 going home (sit) · 7 back in its seat
  const step = usePlay([0, beat(2), beat(4), beat(6), beat(6.8), beat(7.8), beat(8.8), beat(9.6)], hold);
  const cls = folder("class");
  const sticky = (i: number): StickyState => (i < step ? "done" : i === step ? "running" : "next");
  const out = step >= 3 && step <= 6, landed = step >= 5;
  return (
    <>
      <NotchStrip words={landed ? `${cls.name} · chapter 6 is in` : `${cls.name} · ${Math.min(step, 3)} of 3`} />
      <Window>
        <Spine at="home" />
        <Side title="home" count={PERSON.folders.length} foot={<DayUse v={0.12} />}><Rows rows={homeRows("class")} /></Side>
        <Corner s="seen" />
        {PERSON.folders.map((f, i) => (
          <div key={f.id} id={`day-folder-${f.id}`} style={{ position: "absolute", left: STAGE + 32 + i * (FW + GAP), top: FY }}>
            <FolderCard w={FW} h={FH} name={f.name} line={f.line} count={f.stickies.length}>
              <div style={{ display: "grid", gap: 10, padding: "16px 14px 0" }}>
                {f.stickies.map((s, k) => (
                  <Sticky key={s} words={s} w={FW - 28} tilt={TILT[k % 3]}
                    s={f.id === "class" ? sticky(k) : f.id === "job" && k === 0 ? "done" : "next"} />
                ))}
              </div>
              {f.id === "class" && landed && (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, display: "flex", justifyContent: "center" }}><FileTile s="made" kind={3} name="chapter 6.pdf" /></div>
              )}
              {/* every folder keeps the same foot, the class one too, counting as its stickies get done (rule 37) */}
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", justifyContent: "space-between", fontSize: T.label[0], color: mute }}>
                <span>{f.id === "class" ? `${Math.min(step, 3)} done today` : f.id === "job" ? "1 done today" : "2 for tonight"}</span>
                <Num c={mute} style={{ fontSize: T.label[0] }}>{f.id === "class" ? `${Math.min(step, 3)}/3` : f.id === "job" ? "1/2" : "0/2"}</Num>
              </div>
              {/* the folder's sticker from the morning stays on it (arrival.tsx's Folders), over the card's edge (rule 36) */}
              {f.id === "class" && <span style={{ position: "absolute", right: 14, top: 10 }}><Sticker>exam fri</Sticker></span>}
            </FolderCard>
          </div>
        ))}
        {/* the jelly out of its seat: it carries the summary to the folder and comes home (one move at a time) */}
        <Traveller role={step <= 4 ? "carry" : step === 5 ? "land" : "sit"} show={out} at={step === 4 || step === 5 ? DROP : SEAT}
          toward={step <= 4 ? aim(SEAT, DROP) : "day-folder-class"} holding={<HeldPill>chapter 6.pdf</HeldPill>} />
        <Bar away={out} role="sit" pick={PERSON.lastMode} />
      </Window>
    </>
  );
}
