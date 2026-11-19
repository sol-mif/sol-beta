// 4 · Your call (rules 8, 11, 17, 26, 33, 36): the run stops on a question. Its block lifts with the yellow sticker over
// its edge, and the jelly comes out of its seat and points at it (it lifts and turns its eyes; the yellow stays on the
// block, rule 33). One pill press answers; the sticker goes, the run resumes, and the done stamp lands.
import { Bar, Corner, NotchStrip, SEAT, Traveller, Window, Spine, beat, usePlay } from "./frame";
import { COL, CoversBlock, ListBlock, PageBlock, RUN_ID, Run, X0, Y0, ZineSide, type RunAt } from "./build";
import { PERSON, folder } from "./person";

/** beside the lifted block's right edge, a little below its middle: where the jelly points from */
const BESIDE: readonly [number, number] = [X0 + COL + 14, Y0 + 150];

export default function Call({ hold }: { hold?: number | null }) {
  // 0 running · 1 it asks: lifted, the sticker, the jelly out to point · 2 your press · 3 answered: the sticker gone,
  // the run resumes, the jelly going home to sit · 4 done: the stamp lands, the jelly sits
  const step = usePlay([0, beat(1.6), beat(4.4), beat(4.9), beat(7)], hold);
  const at: RunAt = (["running", "asks", "pressed", "resumed", "done"] as const)[step];
  const out = step === 1 || step === 2 || step === 3;
  const zine = folder("side").name;
  return (
    <>
      <NotchStrip ask={step === 1 || step === 2} words={step <= 2 && step >= 1 ? "the spreads need you" : step === 4 ? `${zine} · laid out` : `${zine} · the spreads, 3m`} />
      <Window>
        <Spine at="build" />
        <ZineSide ask={step === 1 || step === 2} done={step === 4} covers />
        <Corner s={step === 1 || step === 2 ? "three" : "one"} />
        <ListBlock covers essay={at === "resumed" || at === "done"} />
        <PageBlock />
        <CoversBlock />
        <Run at={at} />
        <Traveller role={step >= 3 ? "sit" : "point"} show={out} at={step === 1 || step === 2 ? BESIDE : SEAT} toward={step >= 3 ? undefined : RUN_ID} size={96} />
        <Bar away={out} pick={PERSON.lastMode} />
      </Window>
    </>
  );
}
