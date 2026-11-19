// Also · Empty (rules 1, 31, 38): a folder with nothing in it yet, a new class. Never a grey picture: the card's body is
// one sentence from the jelly in the person's words, and the one way to start, a well to drop a file in, or the bar.
// The folder arrives and lands (rule 26); the jelly arrives in it to say its line, then sits.
import { FileTile, Num, dim, ink, mute, well } from "../../Accent";
import { FolderCard } from "../../Folder";
import { TYPE as T } from "../../tokens";
import { inner } from "../../Accent";
import { dur, ease } from "../../../motion";
import { BAR_TOP, Bar, Corner, DayUse, Jelly, NotchStrip, R, Rows, STAGE, SW, Side, Spine, Window, beat, usePlay } from "../frame";
import { PERSON } from "../person";

const NEW = { name: "organic chemistry", line: "a new class, starts monday" };
const FY = 56, FH = BAR_TOP - FY - 28;

export default function Empty({ hold }: { hold?: number | null }) {
  // 0 the new folder lands, empty · 1 the jelly arrives in it and says its line; the way to start under it
  const step = usePlay([0, beat(1.2)], hold), said = step >= 1;
  const rows = [{ title: NEW.name, s: "active" as const, aside: "new" }, ...PERSON.folders.map((f) => ({ title: f.name, s: "rest" as const, aside: f.stickies.length }))];
  return (
    <>
      <NotchStrip words={`${NEW.name} · new`} />
      <Window>
        <Spine at="home" />
        <Side title="home" count={rows.length} foot={<DayUse v={0.12} />}><Rows rows={rows} /></Side>
        <Corner s="seen" />
        <div style={{ position: "absolute", left: STAGE + 32, top: FY, animation: `ac-land ${dur("land")}ms ${ease("pour")} both` }}>
          <FolderCard w={SW} h={FH} name={NEW.name} line={NEW.line} count={0}>
            {said && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                <Jelly role={step === 1 ? "arrive" : "sit"} size={84} />{/* the stage jelly's one size, as in the seven (frame.tsx Traveller, rule 31) */}
                {/* one sentence, in their words (rule 38): what this folder is for and what the jelly will do with it */}
                <p style={{ margin: 0, maxWidth: 460, textAlign: "center", fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: ink }}>
                  Nothing in {NEW.name} yet. Drop the syllabus here and I'll turn it into this week's stickies.
                </p>
                {/* the one way to start: a well to drop into (rule 1: a well, never a new material); or the bar, below */}
                <div style={{ width: 360, height: 132, borderRadius: inner(R, 8), display: "flex", alignItems: "center", gap: 18, padding: "0 22px", boxSizing: "border-box", ...well() }}>
                  <FileTile s="rest" kind={3} name="syllabus.pdf" />
                  <span style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: T.body[0], color: ink }}>drop a file here</span>
                    <span style={{ fontSize: T.label[0], color: dim }}>or ask below</span>
                  </span>
                </div>
              </div>
            )}
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", justifyContent: "space-between", fontSize: T.label[0], color: mute }}>
              <span>nothing yet</span><Num c={mute} style={{ fontSize: T.label[0] }}>0</Num>
            </div>
          </FolderCard>
        </div>
        {/* the jelly is in the folder, so its seat is empty: one jelly in the window (rule 31) */}
        <Bar away={said} pick={PERSON.lastMode} hint={`ask about ${NEW.name}, or drop a file`} />
      </Window>
    </>
  );
}
