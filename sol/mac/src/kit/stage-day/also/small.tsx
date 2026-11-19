// Also · Small (rules 1, 12, 14): the whole Home on the small Mac, 1024 × 640. The frame takes the size from the page
// (frame.tsx SMALL: `?size=small`, or this scene): the side card folds away and the spine's glyphs carry where you are
// (rule 14's pearl seat), the stage holds two folder cards not three, and the bar keeps its modes as the rail's glyphs
// (rule 12: the same pills, the same order, fewer words). The jelly sits in its seat and breathes.
import { Num, Sticker, mute } from "../../Accent";
import { FolderCard, Sticky } from "../../Folder";
import { TYPE as T } from "../../tokens";
import { BAR_TOP, Bar, Corner, NotchStrip, STAGE, SW, Spine, Window, usePlay } from "../frame";
import { PERSON } from "../person";

const GAP = 18, FW = (SW - GAP) / 2, FY = 56, FH = BAR_TOP - FY - 28;

export default function Small({ hold }: { hold?: number | null }) {
  usePlay([0], hold);
  // the two folders with something for today: the class and the zine (the job's is done)
  const two = PERSON.folders.filter((f) => f.id !== "job");
  return (
    <>
      <NotchStrip words={`${two[1].name} · the spreads, 3m`} />
      <Window>
        <Spine at="home" />
        <Corner s="seen" />
        {two.map((f, i) => (
          <div key={f.id} style={{ position: "absolute", left: STAGE + 32 + i * (FW + GAP), top: FY }}>
            <FolderCard w={FW} h={FH} name={f.name} line={f.line} count={f.stickies.length}>
              <div style={{ display: "grid", gap: 10, padding: "16px 14px 0" }}>
                {f.stickies.map((s, k) => <Sticky key={s} words={s} w={FW - 28} s={f.id === "class" ? (k === 0 ? "done" : k === 1 ? "running" : "next") : "next"} />)}
              </div>
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", justifyContent: "space-between", fontSize: T.label[0], color: mute }}>
                <span>{f.id === "class" ? "1 done today" : "2 for tonight"}</span>
                <Num c={mute} style={{ fontSize: T.label[0] }}>{f.id === "class" ? "1/3" : "0/2"}</Num>
              </div>
              {f.id === "class" && <span style={{ position: "absolute", right: 14, top: 10 }}><Sticker>exam fri</Sticker></span>}
            </FolderCard>
          </div>
        ))}
        <Bar pick={PERSON.lastMode} hint="ask, or drop a file" />
      </Window>
    </>
  );
}
