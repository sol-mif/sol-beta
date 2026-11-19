// 6 · Customize (rules 14, 15, 16, 23; brand.md, Colour, The type, Customization): the window with a side panel of the
// person's picks: the palette sets (palette.sets), the type cut (Display Black, Rounded, New York), the ground (black
// glass, cream). A pick re-lights the whole window at once, live; the jelly is unchanged, it keeps its pure six. The
// scene plays three picks by itself; a click on any takes over. The jelly is never a picture here (#1245, acts): it sits
// on the card the picks re-light (sit), and when the set changes it fetches the new set's band from its swatch and
// carries it to the window (carry); the window re-lights as it lands, and it sits again.
import { useState, type ReactNode } from "react";
import { HoldStill, LitSet, MeterBar, Num, PillControl, RunMark, deep, dim, ink, mute, picked, sol, useLit } from "../Accent";
import { TYPE as T } from "../tokens";
import { BigNum, CUTS, CutSet, DEFAULT_SET, Display, GROUNDS, SETS, cutStyle, litOf, type CutId, type GroundId } from "../Yours";
import { Bar, Card, Done, GroundSet, HeldPill, NotchStrip, Perch, SIDE, STAGE, Side, Spine, Stamped, Step, Traveller, Window, aim, beat, label, useOnGround, usePlay, useSpot } from "./frame";
import { PERSON } from "./person";

const X0 = STAGE + 32, COL = 440, X1 = X0 + COL + 20, Y = 252, CH = 236;
/** the picks the scene plays by itself; `lit` is the set the window wears (it changes when the jelly lands the band) */
const AUTO: readonly { set: string; lit: string; cut: CutId; ground: GroundId }[] = [
  { set: DEFAULT_SET, lit: DEFAULT_SET, cut: "display", ground: "glass" },
  { set: "pastel", lit: DEFAULT_SET, cut: "display", ground: "glass" },   // picked: the jelly goes to the swatch
  { set: "pastel", lit: DEFAULT_SET, cut: "display", ground: "glass" },   // it carries the band to the card
  { set: "pastel", lit: "pastel", cut: "display", ground: "glass" },      // landed: the window re-lights, it sits
  { set: "pastel", lit: "pastel", cut: "rounded", ground: "glass" },
  { set: "pastel", lit: "pastel", cut: "rounded", ground: "cream" },
];
/** the jelly's working size (frame.tsx Traveller), and its seat: on the top edge of the card the picks re-light, centred
 *  on the card's right third, its perch on the card's edge as Build's seat is drawn (frame.tsx Perch: the perch's middle
 *  is 12 above the jelly's box bottom, so the jelly's middle stands SIZE / 2 − 12 over the edge; the card is what it
 *  sits on, never bare ground) */
const SIZE = 84;
const ON_CARD: readonly [number, number] = [X1 + Math.round(COL * 5 / 6), Y - SIZE / 2 + 12];

/** a set's tile: the panel's width in three, so a set's whole name reads under its bands (the pack's read: "Pastel widg…") */
const TILE = Math.floor((SIDE - 8 - 28 - 12) / 3);
const Head = ({ children }: { children: ReactNode }) => <div style={{ ...label, color: mute, padding: "14px 18px 8px" }}>{children}</div>;

/** a set as a tile: its six as bands, still (rule 20), its name; the one you picked sits on the pearl (rule 14) */
function Swatch({ id, name, on, pick }: { id: string; name: string; on: boolean; pick: () => void }) {
  const l = useLit();
  return (
    <button onClick={pick} title={name} data-set={id} style={{ all: "unset", cursor: "pointer", width: TILE, minHeight: 56, padding: "6px 0", boxSizing: "border-box", borderRadius: 10, display: "grid", justifyItems: "center", alignContent: "center", gap: 7,
      ...(on ? { backgroundImage: picked(l), boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(0,0,0,0.45)` } : {}) }}>
      <span style={{ width: 48, height: 14, borderRadius: 7, backgroundImage: sol(litOf(id)), boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
      <span style={{ maxWidth: TILE - 6, fontSize: 10, lineHeight: "12px", color: on ? deep(0.88) : dim, fontWeight: on ? 500 : 400, textAlign: "center", textWrap: "balance" }}>{name}</span>
    </button>
  );
}

function Panel({ set, cut, ground, pick }: { set: string; cut: CutId; ground: GroundId; pick: (k: "set" | "cut" | "ground", v: string) => void }) {
  return (
    <Side title="yours">
      <Head>colour</Head>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${TILE}px)`, gap: 6, padding: "0 14px", justifyContent: "space-between" }}>
        {SETS.map((s) => <Swatch key={s.id} id={s.id} name={s.id === DEFAULT_SET ? "Jelly six" : s.name} on={s.id === set} pick={() => pick("set", s.id)} />)}
      </div>
      <Head>type</Head>
      <div style={{ display: "flex", gap: 2, padding: "0 14px" }}>
        {CUTS.map((c) => (
          <span key={c.id} onClick={() => pick("cut", c.id)} style={{ cursor: "pointer" }} data-cut={c.id}>
            <PillControl s={c.id === cut ? "picked" : "rest"} w={(SIDE - 8 - 28 - 4) / 3} h={32}><span style={{ ...cutStyle(c), fontSize: T.body[0] }}>{c.name === "Display Black" ? "Display" : c.name}</span></PillControl>
          </span>
        ))}
      </div>
      <Head>ground</Head>
      <div style={{ display: "flex", gap: 2, padding: "0 14px" }}>
        {GROUNDS.map((g) => (
          <span key={g.id} onClick={() => pick("ground", g.id)} style={{ cursor: "pointer" }} data-ground-pick={g.id}>
            <PillControl s={g.id === ground ? "picked" : "rest"} w={(SIDE - 8 - 28 - 2) / 2} h={32}>{g.name}</PillControl>
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, ...label, color: mute }}>the jelly keeps its own six</div>
    </Side>
  );
}

function Stage() {
  const g = useOnGround();
  return (
    <>
      {/* the heading is the window's, so it sits at the stage's left edge, X0 (jelly-role.html, the heading's place) */}
      <div style={{ position: "absolute", left: X0, top: 64, display: "grid", gap: 10 }}>
        <Display size={40} color={g.ink}>Yours, {PERSON.name}.</Display>
        <p style={{ margin: 0, maxWidth: 520, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: g.dim }}>Every pick lands on the whole window at once.</p>
      </div>
      <Card x={X0} y={Y} w={COL} h={CH} title="laying out the spreads" mark={<Num c={dim} style={{ fontSize: T.body[0] }}>3m</Num>}>
        <Step lead={<Done />} words="the interview, two pages" note="done" />
        <Step lead={<RunMark s="running" w={24} />} words="the photo essay" note="now" />
        <Step lead={<RunMark s="queued" w={24} />} words="the back pages" quiet />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 0" }}>
          <span style={{ fontSize: T.label[0], color: mute, width: 52 }}>spreads</span>
          <HoldStill value><MeterBar v={0.6} w={COL - 36 - 52 - 12 - 54 - 12} h={10} /></HoldStill>
          <Num c={dim} style={{ fontSize: T.label[0], width: 54, textAlign: "right" }}>6 of 10</Num>
        </div>
      </Card>
      <Card x={X1} y={Y} w={COL} h={CH} title="today so far">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "18px 18px 0" }}>
          <BigNum size={96} color={ink}>4</BigNum>
          <span style={{ fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: dim, paddingBottom: 6 }}>things landed<br />since 8</span>
        </div>
        <span style={{ position: "absolute", right: 16, bottom: 16 }}><Stamped words="made 10:42" /></span>
      </Card>
    </>
  );
}

/** the band the jelly carries: the new set's six, as the swatch shows them, at its front */
const Band = ({ set }: { set: string }) => (
  <HeldPill><span style={{ width: 40, height: 12, borderRadius: 6, backgroundImage: sol(litOf(set)) }} /></HeldPill>
);

export default function Customize({ hold }: { hold?: number | null }) {
  const step = usePlay([0, beat(2), beat(3), beat(4), beat(5.5), beat(7)], hold);
  const [mine, setMine] = useState<Partial<{ set: string; cut: CutId; ground: GroundId }>>({});
  // a click takes over: the window wears the picked set at once
  const p = { ...AUTO[step], ...mine, ...(mine.set ? { lit: mine.set } : {}) };
  const cut = CUTS.find((c) => c.id === p.cut)!;
  const name = SETS.find((s) => s.id === p.lit)?.name ?? "";
  const swatch = useSpot(`[data-set="${AUTO[1].set}"]`, 0, -SIZE / 2 + 10, [STAGE - SIDE / 2, 140]);
  const fetching = !mine.set && step === 1, carrying = !mine.set && step === 2;
  const at = fetching ? swatch : ON_CARD;
  const role = fetching || carrying ? "carry" : "sit";
  return (
    <LitSet value={litOf(p.lit)}>
      <CutSet value={cut}>
        <GroundSet value={p.ground}>
          <NotchStrip words={`${name} · ${cut.name} · ${GROUNDS.find((x) => x.id === p.ground)!.name}`} />
          <Window>
            <Spine />
            <Panel set={p.set} cut={p.cut} ground={p.ground} pick={(k, v) => setMine((m) => ({ ...m, [k]: v }))} />
            <Stage />
            <Perch at={ON_CARD} size={SIZE} />
            <Traveller role={role} size={SIZE} at={at} toward={fetching ? aim(ON_CARD, swatch) : carrying ? aim(swatch, ON_CARD) : undefined}
              holding={carrying ? <Band set={p.set} /> : undefined} />
            <Bar away pick={PERSON.lastMode} />
          </Window>
        </GroundSet>
      </CutSet>
    </LitSet>
  );
}
