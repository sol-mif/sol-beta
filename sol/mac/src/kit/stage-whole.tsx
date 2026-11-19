// The whole Build window from the one system (#1213): the frame of stage-body.tsx (the notch strip, the window on the
// desk, the spine, the side, the stage, the bar), every piece in it drawn from kit/Accent.tsx's parts and the body from
// body/Bodies.tsx, so what is judged is one window, never a sheet of parts. Every colour has a role (rules.md 13 to 20):
// rest grey, picked pearl, Sol the jelly's bands, meaning flat on a sticker, a coin or a dot. One thing moves in the
// jelly's colours at a time (rule 19): the body; every other band holds still. Dev only; sol/design/system/whole.mjs
// builds and shoots it on the Legion.
//   whole.html?take=rest        nothing running: the body in the middle of the empty stage, what was made lately below it
//   whole.html?take=work        Sol at work on the release: its card running, the body drifting in its seat, send stops it
//   whole.html?take=needs       the release waits on you: its card lifted with the yellow sticker, the body lifted, its
//                               eyes on the card
//   &play                       the take's arrival plays (the clips): rest holds; work starts from your words and send;
//                               needs starts from work
//   &act=point&toward=card      the body performs one of its acts (body/role.ts, #1245) toward the element with that id;
//                               the card is the first card on the stage (the release notes)
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { BodyMark, BodyOne } from "../body/Bodies";
import { setBodyVariant, type BodyDoing } from "../body/variants";
import { isAct, type Act } from "../body/role";
import {
  ACCENT_MOVES, Coin, MEANING, FileTile, HaloDial, HoldStill, MeterBar, Num, PillControl, Ping, RunMark, SessionRow, Sign, Sticker, UndoRing,
  blk, deep, dim, heatOf, ink, inner, mute, on, sol, surface, useLit, well, pieceStyle, type PingState,
} from "./Accent";
import { Glyph } from "./index";
import { curve } from "./curve";
import { FRAME, MAC } from "./geometry";
import { CURVE, NACRE, SHADE, SYSTEM, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

const q = new URLSearchParams(location.search);
const take = (["rest", "work", "needs"].includes(q.get("take") ?? "") ? q.get("take") : "rest") as Take;
const play = q.has("play");
/** the act the stage's body performs, when the link names one (the hero at rest, the bar's body otherwise) */
const act: Act | undefined = isAct(q.get("act")) ? (q.get("act") as Act) : undefined;
const toward = q.get("toward") ?? undefined;
setBodyVariant("one");

type Take = "rest" | "work" | "needs";
/** where the window is: a take, or the moment before it (your words in the box, send ready) */
type Phase = Take | "typed";
const ARRIVAL: Record<Take, readonly (readonly [Phase, number])[]> = {
  rest: [["rest", 0]],
  work: [["typed", 0], ["work", 1100]],
  needs: [["work", 0], ["needs", 1300]],
};
function usePhase(): Phase {
  const steps = play ? ARRIVAL[take] : [[take, 0] as const];
  const [p, setP] = useState<Phase>(steps[0][0]);
  useEffect(() => {
    const ts = steps.slice(1).map(([ph, at]) => window.setTimeout(() => setP(ph), at));
    return () => ts.forEach(clearTimeout);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

const W = 1280, H = 800, MENU = 34, SPINE = FRAME.spine, SIDE = FRAME.side, STAGE = SPINE + SIDE;
const R = CURVE.radius.block, DP = SYSTEM.depth;
const label = { fontSize: T.label[0], lineHeight: `${T.label[1]}px` };

// ---- the frame ------------------------------------------------------------------------------------------------------
/** the menu bar's strip of the desk, the black slab hanging from it, the body in its 24 px place, the window's words */
function NotchStrip({ words, ask, doing }: { words?: string; ask?: boolean; doing: BodyDoing }) {
  const NW = 273, NH = 32, NR = 14, nx = (W - NW) / 2;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: MENU, overflow: "hidden", background: `url(${desk}) 50% 0 / ${W}px auto` }}>
      <div style={{ position: "absolute", inset: 0, background: blk(0.18) }} />
      <svg width={NW} height={NH} style={{ position: "absolute", left: nx, top: 0 }} aria-hidden><path d={curve(NW, NH + NR, NR, CURVE.smoothing, 0, -NR)} fill="#000" /></svg>
      <div style={{ position: "absolute", left: nx + 6, top: -4 }}><BodyOne size={40} doing={doing === "work" ? "rest" : doing} /></div>
      {words && <div style={{ position: "absolute", left: nx + 52, width: NW - 66, top: 0, height: NH, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, ...label, color: dim }}>
        {ask && <Coin role="ask" d={7} />}{words}</div>}
    </div>
  );
}
const Lights = () => (
  <div style={{ position: "absolute", left: MAC.lights.x, top: MAC.lights.y, display: "flex", gap: MAC.lights.gap }}>
    {[0, 1, 2].map((i) => <span key={i} style={{ width: MAC.lights.d, height: MAC.lights.d, borderRadius: 6, background: on(0.16) }} />)}
  </div>
);
/** the window: the one see-through thing (rule 2), its top corners on the continuous curve */
function Window({ children }: { children: ReactNode }) {
  const wh = H - MENU;
  return (
    <div style={{ position: "absolute", left: 0, top: MENU, width: W, height: wh, clipPath: `path('${curve(W, wh + 40, 18, CURVE.smoothing)}')` }}>
      <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% -${MENU}px / ${W}px auto` }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      <Lights />
      {children}
    </div>
  );
}
/** the spine: the modes as glyphs at mute, build picked as a pearl seat */
const Spine = () => (
  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SPINE }}>
    <div style={{ position: "absolute", left: (SPINE - 36) / 2, top: FRAME.row + 8, display: "grid", gap: 10 }}>
      {(["canvas", "list", "files"] as const).map((g, i) => (
        <span key={g} style={{ width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", color: i === 0 ? deep(0.85) : mute,
          ...(i === 0 ? { background: NACRE, boxShadow: `inset 0 1px 0 ${on(0.5)}, 0 2px 6px ${blk(0.45)}` } : {}) }}><Glyph name={g} /></span>
      ))}
    </div>
  </div>
);

const SESSIONS = ["today", "the release", "the board", "school, exam friday"];
/** the side: a card holding the mode's sessions; where you are is pearl; what Sol runs carries its small mark; at its
 *  foot how full the day is */
function Side({ phase }: { phase: Phase }) {
  const at = phase === "rest" ? 0 : 1;
  const state = (i: number) => (i !== at ? "rest" : phase === "work" ? "active-running" : "active") as "rest" | "active" | "active-running";
  return (
    <div style={{ position: "absolute", left: SPINE, top: FRAME.row - 4, bottom: 16, width: SIDE - 8, borderRadius: R, ...surface("card") }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 10px" }}>
        <BodyMark size={16} color={ink} /><span style={{ fontSize: T.body[0], fontWeight: 500, color: ink }}>build</span>
        <span style={{ flex: 1 }} /><Num c={mute} style={{ fontSize: T.label[0] }}>4</Num>
      </div>
      <HoldStill value>
        <div style={{ padding: "0 8px", display: "grid", gap: 2 }}>
          {SESSIONS.map((s, i) => (
            <SessionRow key={s} title={s} w={SIDE - 24} s={state(i)}
              aside={i === 1 && phase === "needs" ? <Coin role="ask" d={8} /> : i === 1 && phase === "work" ? "2m" : i === 2 ? <Coin role="done" d={8} /> : undefined} />
          ))}
        </div>
      </HoldStill>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", ...label }}><span style={{ color: mute }}>today's use</span><Num c={dim} style={{ fontSize: T.label[0] }}>34%</Num></div>
        <MeterBar v={0.34} w={SIDE - 44} h={10} />
      </div>
    </div>
  );
}

// ---- the stage's things: cards (rule 1), their words, their marks --------------------------------------------------
function Card({ id, x, y, w, h, title, lifted, mark, children }: { id?: string; x: number; y: number; w: number; h: number; title: string; lifted?: boolean; mark?: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: R, ...surface(lifted ? "lifted" : "card"),
      transform: lifted ? `translateY(-4px) scale(${DP.lifted.scale})` : "none", transition: `transform 420ms, box-shadow 420ms, background 420ms` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 6px" }}>
        <span style={{ fontSize: T.head[0], fontWeight: 500, color: ink, whiteSpace: "nowrap" }}>{title}</span><span style={{ flex: 1 }} />{mark}
      </div>
      {children}
    </div>
  );
}
const Step = ({ lead, words, note, quiet }: { lead: ReactNode; words: string; note?: ReactNode; quiet?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 34, padding: "0 18px" }}>
    <span style={{ width: 28, display: "inline-flex", justifyContent: "center" }}>{lead}</span>
    <span style={{ flex: 1, fontSize: T.body[0], color: quiet ? mute : ink }}>{words}</span>
    {note != null && <span style={{ fontSize: T.label[0], color: mute }}>{note}</span>}
  </div>
);
const Para = ({ children }: { children: ReactNode }) => <div style={{ padding: "4px 18px 0", fontSize: T.body[0], lineHeight: `${T.body[1] + 2}px`, color: dim }}>{children}</div>;

/** the release: Sol at work on it, or asking you before it posts */
function Release({ phase }: { phase: Phase }) {
  const needs = phase === "needs", work = phase === "work";
  return (
    <Card id="card" x={STAGE + 32} y={64} w={468} h={needs ? 268 : 236} title="the release notes" lifted={needs}
      mark={needs ? undefined : <Num c={dim} style={{ fontSize: T.body[0] }}>{work ? "2m" : ""}</Num>}>
      {needs && <span style={{ position: "absolute", left: 16, top: -11 }}><Sticker fill={MEANING.ask} land={play}>needs you</Sticker></span>}
      <div style={{ paddingTop: 6 }}>
        <Step lead={<Coin role="done" d={16}><Sign d="tick" s={11} w={2} /></Coin>} words="read the eleven merged PRs" note="done" />
        <Step lead={<Coin role="done" d={16}><Sign d="tick" s={11} w={2} /></Coin>} words="write the three lines" note="done" />
        <Step lead={needs ? <Coin role="ask" d={16}><Sign d="ask" s={11} w={2} /></Coin> : <RunMark s={work ? "running" : "queued"} w={24} />} words="post them in #builds" note={needs ? "waits on you" : work ? "now" : ""} quiet={!work && !needs} />
      </div>
      {needs ? (
        <div style={{ margin: "12px 10px 0", padding: "14px 18px", borderRadius: inner(R, 10), ...well() }}>
          <div style={{ fontSize: T.body[0], color: ink, marginBottom: 12 }}>May I post the three lines in #builds now?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <PillControl s="hover" w={92} h={32}>post them</PillControl><PillControl s="rest" w={84} h={32}>not yet</PillControl>
          </div>
        </div>
      ) : (
        <Para>One system lands: every piece drawn from its tokens, the body with them, the five pin bodies gone.</Para>
      )}
    </Card>
  );
}

/** the one picked pill group: words on the card, the pick pearl (rules 12, 14) */
function Modes({ pick }: { pick: number }) {
  const words = ["ask", "edits", "auto", "bypass"], ws = [52, 60, 58, 72];
  return <div style={{ display: "flex", gap: 2 }}>{words.map((w, i) => <PillControl key={w} s={i === pick ? "picked" : "rest"} w={ws[i]} h={32}>{w}</PillControl>)}</div>;
}
/** how hard Sol thinks: the pick in Sol's heat, still once set (piece 13) */
function Effort() {
  const l = useLit();
  return (
    <span style={{ position: "relative", height: 32, width: 62, borderRadius: 16, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none",
      boxShadow: `inset 0 1px 0 ${on(0.24)}, 0 2px 6px ${blk(0.45)}`, backgroundImage: sol(l, heatOf(l, 2)) }}>
      <span style={{ fontSize: T.body[0], fontWeight: 500, color: deep(0.88) }}>high</span>
    </span>
  );
}

/** the bar: one card. The seat with the body, the words in their well, the modes, the effort, send */
function Bar({ phase, doing }: { phase: Phase; doing: BodyDoing }) {
  const left = STAGE + 32, h = 72, words = phase !== "rest";
  const send = phase === "rest" ? "rest" : phase === "typed" ? "sol" : "sol";
  return (
    <div style={{ position: "absolute", left, right: 32, bottom: 20, height: h, borderRadius: R, display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 10px", ...surface("card") }}>
      <HaloDial s="rest" d={52} body={<BodyOne size={48} doing={doing} act={phase === "rest" ? undefined : act} toward={act ? toward : doing === "needs" ? [-3, -3] : undefined} />} />
      <div style={{ flex: 1, height: 44, borderRadius: 22, display: "flex", alignItems: "center", padding: "0 16px", ...well() }}>
        <span style={{ fontSize: T.body[0], color: words ? ink : mute }}>{words ? "post the three lines in #builds" : "ask, or drop a file"}</span>
      </div>
      <Modes pick={phase === "rest" ? 2 : 3} />
      <Effort />
      <HoldStill value>
        <PillControl s={send} w={48} h={44} pour={phase === "typed"}>
          {phase === "work" || phase === "needs" ? <span style={{ width: 11, height: 11, borderRadius: 3, background: deep(0.85) }} /> : <Sign d="up" c={words ? deep(0.85) : mute} s={18} w={2} />}
        </PillControl>
      </HoldStill>
    </div>
  );
}

/** the stage's top right: what came while you were away (the coins), how full the context is */
function Corner({ phase }: { phase: Phase }) {
  const ping: PingState = phase === "rest" ? "seen" : phase === "needs" ? "three" : "one";
  return (
    <div style={{ position: "absolute", right: 32, top: 8, display: "flex", gap: 10, alignItems: "center" }}>
      <HoldStill value><Ping s={ping} /></HoldStill>
    </div>
  );
}

// ---- the takes --------------------------------------------------------------------------------------------------------
function Rest() {
  const cards: [string, string, ReactNode][] = [
    ["the release notes", "three lines, posted", <Sticker key="s">made <span style={{ fontVariantNumeric: "tabular-nums" }}>21:04</span></Sticker>],
    ["the board", "eleven families, 215 pins", <Coin key="c" role="done" d={22}><Sign d="tick" s={13} w={2} /></Coin>],
    ["school, exam friday", "two chapters left", <Num key="n" c={dim}>2</Num>],
  ];
  const cw = 244, gap = 18, x0 = STAGE + (W - STAGE - (cw * 3 + gap * 2)) / 2;
  return (
    <>
      <div style={{ position: "absolute", left: STAGE, right: 0, top: 96, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <BodyOne size={150} doing="rest" act={act} toward={toward} />
        <p style={{ margin: 0, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: dim }}>what are we doing in <b style={{ color: ink, fontWeight: 500 }}>sol</b>?</p>
      </div>
      {cards.map(([t, line, mark], i) => (
        <Card key={t} id={i === 0 ? "card" : undefined} x={x0 + i * (cw + gap)} y={380} w={cw} h={128} title={t}>
          <Para>{line}</Para>
          <span style={{ position: "absolute", right: 16, bottom: 16 }}>{mark}</span>
        </Card>
      ))}
      <div style={{ position: "absolute", left: x0, top: 528, display: "flex", gap: 18 }}>
        <FileTile s="rest" kind={4} name="notes.md" /><FileTile s="rest" kind={6} name="the board.png" /><FileTile s="rest" kind={3} name="exam.pdf" />
      </div>
    </>
  );
}
function Busy({ phase }: { phase: Phase }) {
  return (
    <>
      <Release phase={phase} />
      <Card x={STAGE + 520} y={64} w={W - STAGE - 520 - 32} h={236} title="what changed" mark={<Num c={mute} style={{ fontSize: T.label[0] }}>11</Num>}>
        <Para>Every block is a card on the window; what you picked is pearl; what Sol is doing wears its bands.</Para>
        <div style={{ position: "absolute", left: 18, bottom: 14, display: "flex", gap: 14 }}>
          <FileTile s="rest" kind={4} name="notes.md" /><FileTile s={phase === "work" ? "made" : "rest"} kind={5} name="the bar.tsx" />
        </div>
      </Card>
      <Card x={STAGE + 32} y={phase === "needs" ? 352 : 320} w={468} h={128} title="the board" mark={<Coin role="done" d={22}><Sign d="tick" s={13} w={2} /></Coin>}>
        <Para>eleven families, 215 pins, one system</Para>
        <span style={{ position: "absolute", right: 16, bottom: 16 }}><Sticker>made 11-14</Sticker></span>
      </Card>
      <div style={{ position: "absolute", left: STAGE + 520, top: 320 }}><UndoRing s="draining" w={W - STAGE - 520 - 32} /></div>
    </>
  );
}

function Stage() {
  const phase = usePhase();
  const doing: BodyDoing = phase === "work" ? "work" : phase === "needs" ? "needs" : "rest";
  return (
    <div data-ac data-take={take} data-phase={phase} style={{ ...pieceStyle, position: "fixed", inset: 0, overflow: "hidden", background: "#000" }}>
      <style>{ACCENT_MOVES}</style>
      <NotchStrip doing={doing} words={phase === "work" ? "the release · 2m" : phase === "needs" ? "the release needs you" : undefined} ask={phase === "needs"} />
      <Window>
        <Spine /><Side phase={phase} /><Corner phase={phase} />
        {phase === "rest" ? <Rest /> : <Busy phase={phase} />}
        <Bar phase={phase} doing={doing} />
      </Window>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Stage /></StrictMode>);
