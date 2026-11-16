// Home's first screen (#791, plan Part C slice 28; home/whole.md "The list's rules", "A card"; the still
// home/shots/1.png), behind sol.home.whole. The one line in display type, then one card in front with the others as
// edges behind it; pressing an edge brings that card forward. The card: the meta row (the source's glyph, the folder's
// crumb, "when" in yellow), the title, one why, the context chips, a warm answer and a plain one, then later; to its
// right "this touches", its context as nodes joined by hairline curves. Under the stack, the receipt of what was just
// done, with its undo (⌘Z too). Drawn from the kit (Card, Button, Glass, FileMark, Row); home/whole.css lays it out.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Button, Card, FileMark, Glass, Row, jellyBands, useSize } from "../../kit";
import { black, dim, ink, mute, on, onColour, hex, textW } from "../../kit/paint";
import { CURVE, JELLY, LOOKS, SHADE, TYPE } from "../../kit/tokens";
import { answer, forget, later, undo, useToday } from "./store";
import { FRONT0, frontActed, frontPress, frontUndone, lineOf, receiptOf, stackOf, whenOf, type Chip, type FrontState, type Source, type Thing } from "./today";
import { Ribbon } from "./Ribbon";   // C30
import { Calm } from "./Calm";   // C32
import { isCalm } from "./quiet";   // C32
import { frontOf } from "./question";   // C31
import { Say } from "./Say";   // C29
import { goTo } from "./sourcesStore";   // C33
import { Record } from "./Record";   // C34
import "../whole.css";

/** a place that takes typing, where ⌘Z undoes the typing (#867 F2) */
export const inField = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? "")); };
const SUN = JELLY.warm[3];                 // "when", the waits-on-you channel (home/whole.md "A card"): the jelly's yellow
const FROM = 100;   // where the curves leave the card: its title line (the pad, the meta row, half the title)
const CARD_W = 580, CARD_MIN = 460, TOUCH_W = 280, REACH = 48, NODE_H = 44, NODE_GAP = 12, EDGE_STEP = 14, EDGE_INSET = 12, EDGE_SHOW = 3;

/** the source's glyph, 14 px, drawn in the line colour the words around it wear (the 22 glyphs, slice 4, replace these) */
export function Glyph({ source, size = 14 }: { source: Source; size?: number }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const d: Record<Source, ReactNode> = {
    canvas: <><circle cx="7" cy="7" r="5.2" {...s} /><circle cx="7" cy="7" r="1.6" {...s} /></>,
    mail: <><rect x="1.8" y="3.2" width="10.4" height="7.6" rx="1.6" {...s} /><path d="M2.4 4.2 7 7.6l4.6-3.4" {...s} /></>,
    calendar: <><rect x="2" y="2.8" width="10" height="9.2" rx="1.8" {...s} /><path d="M2 5.8h10M5 1.6v2.4M9 1.6v2.4" {...s} /></>,
    files: <path d="M1.8 4.2c0-.8.6-1.4 1.4-1.4h2.4l1.4 1.4h3.8c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H3.2c-.8 0-1.4-.6-1.4-1.4z" {...s} />,
    people: <><circle cx="7" cy="5" r="2.4" {...s} /><path d="M2.6 12c.6-2.2 2.4-3.4 4.4-3.4s3.8 1.2 4.4 3.4" {...s} /></>,
    github: <><circle cx="4" cy="3.4" r="1.4" {...s} /><circle cx="4" cy="10.6" r="1.4" {...s} /><circle cx="10" cy="5.4" r="1.4" {...s} /><path d="M4 4.8v4.4M10 6.8c0 2-2 2.4-4.6 3.2" {...s} /></>,
    sol: <><circle cx="7" cy="7" r="5.2" {...s} /><circle cx="5.4" cy="6.4" r=".6" fill="currentColor" /><circle cx="8.6" cy="6.4" r=".6" fill="currentColor" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none" }}>{d[source]}</svg>;
}
// C31: exported, the notch's card names its source too
export const SOURCE_NAME: Record<Source, string> = { canvas: "Canvas", mail: "Mail", calendar: "Calendar", files: "Files", people: "People", github: "GitHub", sol: "Sol" };

/** the warm answer (home/whole.md "A card"): the kit's raised glass with the warm four as a wash through it, at the
 *  kit's own strengths (tokens.json looks.button.takes.wash: rest .24, hover, press; #812). Drawn here until the kit's
 *  Button takes a resting wash and the warm four (slice 5, kit controls), then it is <Button look="wash" warm>. */
// C31: exported, the notch's question card wears it too
export function Warm({ h, children, onClick, at }: { h: number; children: string; onClick: () => void; at?: Ref<HTMLButtonElement> }) {
  const [s, setS] = useState<"rest" | "hover" | "press">("rest");
  const k = LOOKS.button.takes.wash, a = s === "rest" ? k.rest : s === "hover" ? k.hover : k.press;
  const w = textW(children, TYPE.body[0], 500) + h;
  const sq = s === "press" ? LOOKS.button.forms.gives : [1, 1];
  return (
    <button type="button" ref={at} className="hw-warm" data-answer="warm" onClick={onClick} onPointerEnter={() => setS("hover")} onPointerLeave={() => setS("rest")}
      onPointerDown={() => setS("press")} onPointerUp={() => setS("hover")} style={{ transform: `scale(${sq[0]}, ${sq[1]})` }}>
      <Glass w={w} h={h} r={Math.min(CURVE.radius.row, h / 2)} step="raised" surface="raised"
        over={<><div style={{ position: "absolute", inset: 0, backgroundImage: jellyBands(JELLY.warm), backgroundSize: "200% 100%", backgroundPosition: "30% 0", opacity: a }} />
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 80% at 50% 55%, ${black(JELLY.veil * a)}, transparent)` }} /></>}>
        <div style={{ height: "100%", display: "grid", placeItems: "center", fontWeight: 500, fontSize: TYPE.body[0], whiteSpace: "nowrap", ...onColour }}>{children}</div>
      </Glass>
    </button>
  );
}

function ChipView({ c }: { c: Chip }) {
  const lead = c.kind === "file" ? <FileMark ext={c.ext} look="glass" h={16} />
    : c.kind === "person" ? <span className="hw-face" style={{ background: hex(JELLY.warm[1], 0.5), color: ink }}>{c.label[0]}</span>
    : <Glyph source="calendar" size={13} />;
  return (
    <span className="hw-chip" data-chip={c.kind}>
      <Glass r={CURVE.radius.chip} step="card" />
      {lead}<span>{c.label}</span>
    </span>
  );
}

/** the card in front: the whole of one thing that waits on you */
function Front({ t, now, w, act, warm }: { t: Thing; now: number; w: number; act: (f: () => void) => void; warm?: Ref<HTMLButtonElement> }) {
  const c = t.card!;
  return (
    <Card w={w} step="pop">
      <div className="hw-card" data-thing={t.id}>
        <div className="hw-meta">
          <Glyph source={c.source} /><span>{SOURCE_NAME[c.source]}</span><span className="hw-dot">·</span><span className="hw-crumb">{t.folder}</span>
          <span className="hw-when" style={{ color: SUN }}>{whenOf(t, now)}</span>
        </div>
        <div className="hw-title" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px`, color: ink }}>{c.title}</div>
        <div className="hw-why" style={{ color: dim }}>{c.why}</div>
        {c.chips.length > 0 && <div className="hw-chips">{c.chips.map((x) => <ChipView key={x.label} c={x} />)}</div>}
        <div className="hw-acts">
          <Warm h={36} at={warm} onClick={() => act(() => answer(t.id, c.answers[0]))}>{c.answers[0]}</Warm>
          <Button h={36} onClick={() => act(() => answer(t.id, c.answers[1]))}>{c.answers[1]}</Button>
          <span className="hw-space" />
          <button type="button" className="hw-later" style={{ color: mute }} onClick={() => act(() => later(t.id))}>later</button>
        </div>
      </div>
    </Card>
  );
}

/** "this touches" (home/whole.md "A card"): up to three nodes, each joined to the card by a hairline curve */
function Touches({ t, from }: { t: Thing; from: number }) {
  const nodes = t.card!.touches.slice(0, 3), top = TYPE.label[1] + 8;
  const h = top + nodes.length * NODE_H + (nodes.length - 1) * NODE_GAP;
  const ys = nodes.map((_, i) => top + i * (NODE_H + NODE_GAP) + NODE_H / 2), sy = Math.min(Math.max(from, top), h);
  const line = on(SHADE.on.mute * 0.6);
  return (
    <div className="hw-touch" data-touches={nodes.length} style={{ width: REACH + TOUCH_W, height: Math.max(h, sy + 8) }}>
      <svg width={REACH + 4} height={Math.max(h, sy + 8)} className="hw-curves" aria-hidden>
        {ys.map((y, i) => <path key={i} d={`M0 ${sy}C${REACH * 0.55} ${sy} ${REACH * 0.45} ${y} ${REACH} ${y}`} fill="none" stroke={line} strokeWidth={1} />)}
        <circle cx={0} cy={sy} r={2} fill={line} />
        {ys.map((y, i) => <circle key={i} cx={REACH} cy={y} r={2} fill={line} />)}
      </svg>
      <div className="hw-touch-col" style={{ left: REACH + 4 }}>
        <div className="hw-touch-h" style={{ color: mute }}>this touches</div>
        {nodes.map((n) => (
          <div key={n.title} className="hw-node"><Row w={TOUCH_W - 4} h={NODE_H} title={<span style={{ color: ink }}>{n.title}</span>} note={n.note} lead={<span style={{ color: dim, display: "grid" }}><Glyph source={n.source} /></span>} /></div>
        ))}
      </div>
    </div>
  );
}

// C36 (#875 C36-1): the card in front, and the card each receipt keeps, outlive Today: the side's places leave it and
// come back, and their receipt's undo puts the front back as Today's does
let fsNow: FrontState = FRONT0;
const fsSubs = new Set<() => void>();
const setFs = (f: (s: FrontState) => FrontState) => { fsNow = f(fsNow); fsSubs.forEach((g) => g()); };
const useFront = () => useSyncExternalStore((g) => { fsSubs.add(g); return () => { fsSubs.delete(g); }; }, () => fsNow);
/** undo what the receipt says, and put back in front the card that was there (#854 R1), from any place of Home */
export const back = (ledgerId: string) => { undo(ledgerId); setFs((s) => frontUndone(s, ledgerId)); };
/** bring a card forward on Today, from a place's row (#875 C36-3: "set 6 needs you" leads to set 6) */
export const bringForward = (id: string) => setFs((s) => frontPress(s, id));

/** the receipt of what was just done, with its undo and ⌘Z (outside a field: #867 F2): Today's, and every place's of
 *  Home, so what you just did can be undone wherever you are (#875 C36-1) */
export function Receipt() {
  const v = useToday(), done = v.done;
  useEffect(() => {
    if (!done) return;
    const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && !inField(ev.target)) { ev.preventDefault(); back(done.ledgerId); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [done]);
  if (!done) return null;
  return (
    <div className="hw-receipt" data-receipt={done.did} role="status">
      <span style={{ color: dim }}>{receiptOf(done, v.things.get(done.thingId))}</span>
      <button type="button" className="hw-undo" style={{ color: ink }} onClick={() => back(done.ledgerId)}>undo</button>
      <button type="button" className="hw-undo" style={{ color: mute }} aria-label="dismiss" onClick={forget}>×</button>
    </div>
  );
}

export function Today() {
  const v = useToday();
  const fs = useFront();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(i); }, []);
  const stage = useRef<HTMLDivElement>(null), [sw] = useSize(stage);
  const needs = v.today?.needs ?? [], moving = v.today?.moving ?? [];
  const stack = stackOf(needs, frontOf(needs, v.things, fs.front));   // C31: the question stands in front
  const t = stack.front ? v.things.get(stack.front) : undefined;
  const [first, second] = lineOf(needs.length, moving.length);
  // fit or drop (the layout skill, rule 4): the touches go first when the core is narrow, then the card narrows
  const roomy = sw - REACH - TOUCH_W >= CARD_MIN;
  const cw = Math.max(320, Math.min(CARD_W, (sw || CARD_W) - (roomy ? REACH + TOUCH_W : 0)));
  // ⌘Z undoes what was just done here (the receipt's own undo), while its receipt shows
  const done = v.done;
  // an answer or a later hands the front back to the list's order (the card brought forward by hand has gone or gone
  // back) and keeps the card that was in front with its receipt; its undo puts that card back in front (#854 R1)
  const shown = useRef<string | null>(null);
  const act = (f: () => void) => { shown.current = stack.front; f(); };
  // once per receipt: Today back from a place finds its receipt already kept, and keeps the card it kept (C36)
  useEffect(() => { if (done && !(done.ledgerId in fsNow.kept)) setFs((s) => frontActed(s, done.ledgerId, shown.current)); }, [done]);
  // an edge pressed brings its card forward and the focus with it, to the card's first answer (#854 R3)
  const warm = useRef<HTMLButtonElement>(null), lead = useRef(false);
  useEffect(() => { if (lead.current) { lead.current = false; warm.current?.focus(); } }, [fs.front]);
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = `${new Date(now).getHours()}:${String(new Date(now).getMinutes()).padStart(2, "0")}`;
  return (
    <section className="hw" data-place="talk" data-home-whole>
      {/* C32 (#795): nothing needs you, Home is one breathing line; the receipt below stays, with its undo */}
      {isCalm(v.today) ? <Calm today={v.today!} things={v.things} now={now} line={first}>
        <button type="button" className="hw-undo" data-go="sources" style={{ color: dim }} onClick={() => goTo("sources")}>sources</button>{/* C33 (#869 R3) */}
        {" · "}<button type="button" className="hw-undo" data-go="done" style={{ color: dim }} onClick={() => goTo("done")}>done today</button>{/* C34 */}
      </Calm> : <>
      <div className="hw-date" style={{ color: mute, display: "flex", alignItems: "center", whiteSpace: "pre" }}>{date} · {time}{/* C33 (#796): the way to Sources, until the side's (slice 36) */} · <button type="button" className="hw-undo" data-go="sources" style={{ color: dim }} onClick={() => goTo("sources")}>sources</button>
        {/* C34 (#797): the evening fold, and record-only's quiet line */} · <button type="button" className="hw-undo" data-go="done" style={{ color: dim }} onClick={() => goTo("done")}>done today</button><Record /></div>
      {/* until Today arrives the line says nothing it does not know (#854 R2); the display step is the kit's (#812, #846) */}
      <h1 className="hw-line t-display" data-line>
        {v.today ? <><span style={{ color: ink }}>{first}</span>{second && <> <span style={{ color: dim }}>{second}</span></>}</> : <span style={{ color: mute }}>Looking at your day…</span>}
      </h1>
      {/* C30 (#793): the week on one line, the front card's point tied down to it */}
      <Ribbon week={v.today?.week ?? []} now={now} tie={stack.front} reach={cw} />
      <div className="hw-stage" ref={stage}>
        {t?.card && (
          <div className="hw-stack" data-stack={needs.length}>
            <div className="hw-front" key={t.id}><Front t={t} now={now} w={cw} act={act} warm={warm} /></div>
            {stack.edges.slice(0, EDGE_SHOW).map((id, i) => {
              const e = v.things.get(id);
              if (!e) return null;
              const ew = cw - 2 * EDGE_INSET * (i + 1);
              return (
                <button key={id} type="button" className="hw-edge" data-edge={id} title="bring it forward" aria-label={`bring forward: ${e.card?.edge ?? e.words}`}
                  onClick={() => { lead.current = true; setFs((s) => frontPress(s, id)); }} style={{ width: ew, zIndex: EDGE_SHOW - i, marginTop: -EDGE_STEP }}>
                  <Glass r={CURVE.radius.card - EDGE_INSET} step="pop" />
                  <span className="hw-edge-words" style={{ color: dim }}><b style={{ color: ink }}>{e.card ? SOURCE_NAME[e.card.source] : ""}</b> {e.card?.edge ?? e.words}</span>
                </button>
              );
            })}
            {stack.edges.length > EDGE_SHOW && <div className="hw-more" style={{ color: mute }}>and {stack.edges.length - EDGE_SHOW} more behind</div>}
          </div>
        )}
        {t?.card && roomy && t.card.touches.length > 0 && <Touches t={t} from={FROM} />}
      </div>
      </>}{/* C32 */}
      <Receipt />{/* the receipt with undo and ⌘Z, shared with the side's places (C36) */}
      <Say now={now} />{/* C29 (#792): the one box, Sol's read over it as you write */}
    </section>
  );
}
