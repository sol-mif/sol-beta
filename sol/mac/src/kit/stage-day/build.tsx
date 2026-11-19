// 3 · Build, the stage with blocks (rules 7, 16, 20, 25, 27): a list block, a page block and a run running (its meter
// and the set's drift, the window's one moving thing); your words in the bar; send, and the block arrives empty while the jelly carries the
// spec it wrote to it (carry), works beside it as the generator's pieces land one by one (work), and sets the done sticker
// down (land). The run holds its drift while the jelly is out (rule 20: one thing moves at a time).
import { HoldStill, MEANING, MeterBar, Num, PillControl, RunMark, Sticker, inner, well, dim, ink, mute } from "../Accent";
import { Block } from "../Block";
import { TYPE as T } from "../tokens";
import { Display } from "../Yours";
import { Ask, BAR_TOP, Bar, Card, Corner, DayUse, Done, NotchStrip, Para, Perch, R, Rows, SEAT, STAGE, Side, Spine, Stamped, Step, Traveller, Window, HeldPill, aim, beat, usePlay } from "./frame";
import { GenBlock } from "./gen";
import { RUN_CARD, RUN_SAID, composing, piecesOf } from "./specs";
import { PERSON, folder } from "./person";

// the stage's grid: two columns from the side card's edge to the window's margin
export const X0 = STAGE + 32, COL = 440, GAP = 20, X1 = X0 + COL + GAP, Y0 = 56, ROW = 236, Y1 = Y0 + ROW + 24, LOW = BAR_TOP - 24 - Y1;
const WORDS = "two cover ideas from the photo essay";

/** the side in Build: the zine's sessions, the one you are in pearl */
export function ZineSide({ done, ask, covers }: { done?: boolean; ask?: boolean; covers?: boolean }) {
  const rows = [
    { title: "issue three, the spreads", s: "active" as const, aside: ask ? <Ask d={8} /> : done ? <Done d={8} /> : "6/10" },
    { title: "the editor's letter", s: "rest" as const },
    ...(covers ? [{ title: "cover ideas", s: "rest" as const, aside: "new" }] : []),
    { title: "printing quotes", s: "rest" as const, aside: <Done d={8} /> },
  ];
  return <Side title={folder("side").name} count={rows.length} foot={<DayUse v={done ? 0.31 : 0.22} />}><Rows rows={rows} /></Side>;
}

export type RunAt = "running" | "held" | "asks" | "pressed" | "resumed" | "done";
/** the run: laying out the spreads. Running it drifts (rule 27); asking, it lifts with the yellow sticker over its edge
 *  (rules 8, 36) and a well holds the question and its two pills; done, the stamp lands (rule 17) */
export const RUN_ID = "day-run";
// done is said once, by the stamp; the corner coin that also said it is gone (rule 17, the pack's read)
export function Run({ at }: { at: RunAt }) {
  const asks = at === "asks" || at === "pressed", done = at === "done", moving = at === "running" || at === "resumed";
  const n = done ? 10 : 6;
  return (
    <Card id={RUN_ID} x={X0} y={Y0} w={COL} h={asks ? ROW + 34 : ROW} lifted={asks} title="laying out the spreads"
      mark={done || asks ? undefined : <Num c={dim} style={{ fontSize: T.body[0] }}>{at === "resumed" ? "4m" : "3m"}</Num>}>
      {asks && <span style={{ position: "absolute", left: 16, top: -11 }}><StickerAsk /></span>}
      <HoldStill value={!moving}>
        <Step lead={<Done />} words="the interview, two pages" note="done" />
        <Step lead={done || at === "resumed" ? <Done /> : asks ? <Ask /> : <RunMark s={moving ? "running" : "queued"} w={24} />}
          words="the photo essay" note={asks ? "waits on you" : done || at === "resumed" ? "done" : "now"} />
        <Step lead={done ? <Done /> : at === "resumed" ? <RunMark s="running" w={24} /> : <RunMark s="queued" w={24} />} words="the back pages" note={done ? "done" : at === "resumed" ? "now" : ""} quiet={!done && at !== "resumed"} />
        {asks ? (
          <div style={{ margin: "10px 10px 0", padding: "14px 16px", borderRadius: inner(R, 10), ...well() }}>
            <div style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: ink, marginBottom: 12 }}>The photo essay runs a page over. Cut it to four pages?</div>
            <div style={{ display: "flex", gap: 6 }}>
              <PillControl s={at === "pressed" ? "press" : "hover"} w={96} h={32}>cut to four</PillControl>
              <PillControl s="rest" w={92} h={32}>keep six</PillControl>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 0" }}>
            <span style={{ fontSize: T.label[0], color: mute, width: 52 }}>spreads</span>
            <MeterBar v={n / 10} w={COL - 18 * 2 - 52 - 12 - 54 - 12} h={10} />
            <Num c={dim} style={{ fontSize: T.label[0], width: 54, textAlign: "right" }}>{n} of 10</Num>
          </div>
        )}
      </HoldStill>
      {done && <span style={{ position: "absolute", right: 16, bottom: 16 }}><Stamped land words={<>laid out <span style={{ fontVariantNumeric: "tabular-nums" }}>10:42</span></>} /></span>}
    </Card>
  );
}
const StickerAsk = () => <Sticker fill={MEANING.ask} land>your call</Sticker>;

/** the list block: what issue three still needs, each line its state's shape */
export function ListBlock({ covers, essay }: { covers?: boolean; essay?: boolean }) {
  // the photo essay is ticked only once the run has laid it out (rule 17: one state, one shape, in both blocks at once)
  const items: [string, boolean][] = [["the photo essay", !!essay], ["the editor's letter", true], ["two cover ideas", !!covers], ["a quote from the printer", false]];
  return (
    <div style={{ position: "absolute", left: X1, top: Y0 }}>
      <Block w={COL} h={ROW} title="issue three, to do">
        <div style={{ padding: "10px 0 0" }}>
          {items.map(([w, d]) => (
            <Step key={w} lead={d ? <Done /> : <RunMark s="queued" w={24} />} words={w} quiet={d} />
          ))}
        </div>
      </Block>
    </div>
  );
}
/** the page block: the editor's letter, a page you can read */
export function PageBlock() {
  return (
    <div style={{ position: "absolute", left: X0, top: Y1 }}>
      <Block w={COL} h={LOW} title="the editor's letter">
        <div style={{ padding: "18px 18px 0" }}><Display size={24} color={ink}>Dear reader,</Display></div>
        <Para style={{ paddingTop: 10 }}>Issue three is about the corner shops that stayed. Six of them, six owners, one photo essay walking the street at dawn.</Para>
        <Para style={{ paddingTop: 10 }}>We printed two hundred of the last one and they were gone by the weekend. This time it is three hundred, and the covers are yours to pick.</Para>
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: T.label[0], color: mute }}>212 words · a page</span><Num c={dim} style={{ fontSize: T.label[0] }}>p. 2</Num>
        </div>
      </Block>
    </div>
  );
}
/** the block composed on the fly: the run card the agent writes for the covers (specs.ts RUN_CARD), drawn by the
 *  generator from its spec. `n`: how many of its pieces have landed (all when left out) */
export const COVERS_ID = "day-covers";
export const CoversBlock = ({ n, land }: { n?: number; land?: boolean }) =>
  <GenBlock spec={RUN_CARD} x={X1} y={Y1} w={COL} n={n} id={COVERS_ID} land={land} />;
/** the generated block's height once every piece is in (the meter, two rows with their notes, the sticker): where the
 *  jelly works, below it and beside it (rule 27: beside the block that runs, never on it) */
const COVERS_H = 250;
const BESIDE: readonly [number, number] = [X1 + 64, Math.min(Y1 + COVERS_H + 46, BAR_TOP - 46)];

export default function Build({ hold }: { hold?: number | null }) {
  // 0 your words, send ready · 1 sent: the agent's sentence in the notch for a beat (specs.ts RUN_SAID, made the spec
  // by gen/say.ts), the empty block arrives, the jelly up out of its seat with the spec (carry) ·
  // 2 beside the block · 3, 4, 5 it works, a piece lands each step · 6 the last piece, the done sticker, set down (land)
  // · 7 back in its seat (sit), the run drifting again (rule 20: one thing moves at a time)
  const step = usePlay([0, beat(1.6), beat(2.6), beat(3.2), beat(3.8), beat(4.4), beat(5.0), beat(6.0)], hold);
  const out = step >= 1 && step <= 6, n = Math.max(0, Math.min(piecesOf(RUN_CARD), step - 2));
  const role = step <= 2 ? "carry" : step <= 5 ? "work" : step === 6 ? "land" : "sit";
  return (
    <>
      <NotchStrip words={step === 1 ? composing(RUN_SAID) : step >= 2 && step <= 6 ? `${folder("side").name} · composing` : `${folder("side").name} · the spreads, 3m`} />
      <Window>
        <Spine at="build" />
        <ZineSide covers={step >= 7} />
        <Corner s="one" />
        <Run at={out ? "held" : "running"} />
        <ListBlock covers={step >= 7} />
        <PageBlock />
        {step >= 1 && <CoversBlock n={n} land />}
        {/* the lower third is bare ground: where the jelly stops on it, its seat is under it (the pack's first read) */}
        <Perch at={BESIDE} show={step >= 2 && step <= 6} />
        <Traveller role={role} show={out} at={step >= 2 ? BESIDE : SEAT}
          toward={role === "carry" ? aim(SEAT, BESIDE) : COVERS_ID} holding={<HeldPill>a run card</HeldPill>} />
        <Bar state={step === 0 ? "typed" : "empty"} words={WORDS} away={out} pick={PERSON.lastMode} />
      </Window>
    </>
  );
}
