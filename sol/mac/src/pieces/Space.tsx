// Build mode as one space of pieces (mine, 2026-11-12): the space itself, one implementation for Build (BuildSpace.tsx,
// behind build.space) and the dev page (piecesPage.tsx). The chat, the box and each artifact are pieces laid by one rule
// (arrange.ts); the session names what leads; the hand moves any piece, and what it moved is held (the pearl grip)
// until that grip is pressed. Its caller owns what is open and what is put away (Build: the stage store's folds); the
// space owns how the hand holds them (`Hand`), handed in and out so Build keeps it per session.
//   drag a piece by its grip (an artifact by its head)   carried: the others make room as it goes; held where it lands
//   press a held piece's grip                           let go: Sol places it again
//   drag a seam                                         the columns' widths; a double press gives them back
//   a name at the bottom edge                           an artifact brought back
//   an artifact's focus, the chat's ⤢                   taken large: it, the box and the chat's last line; Esc brings the others back
//   the chat's –, its one line pressed                  less of the chat (its last line on the box), more of it again
//   ⌥⌘Z                                                 the arrangement before the last move, the agent's or the hand's
// The session's agent moves pieces with the same edits (#1437, hands.ts), once the hand has been still a moment; a piece
// the hand placed is never moved by it.
// The chat is never off the space: where the rest needs its column it stands condensed on the box (arrange.ts `Tail`).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { Block, Line, State } from "../stage/model";
import type { Act } from "../stage/kinds";
import { Frame } from "../stage/kinds/Frame";
import { Mark } from "../stage/kinds/Mark";
import { Orb } from "../Orb";
import { follow, type Follow } from "../motion";
import { BOX, OPEN_MAX, TALK, add, condense, drop, dropAt, keep, move, once, place, rule, shown, widen, type Layout, type Rect } from "./arrange";
import { openNow, type Said } from "./lead";
import { useSeen, type Did, type SeenOff, type SeenReport } from "./seen";
import { LENS_MS, STILL_MS, moved, partIn, scrolled, stageHands, useStageHands, type HandMove } from "./hands";
import { feltWatch, type Felt } from "./felt";
import { STEP_STAYS, mayReplace, sameTurn, stepLine, type Step } from "./step";
import { byAgent } from "../stage/said";
import { stageSaid, useStageSaid } from "../flag";
import "../stage/stage.css";
import "../stage/space.css";
import "./pieces.css";

/** what the hand holds: an arrangement of its own (null: the rule's), the pieces it moved, the chat made small (`talk`
 *  false: its last line on the box), the one line opened to a few (`more`), the piece taken large, the piece carried now.
 *  `placed`: those of `held` the session's agent put there (#1437), not the person; the hand moving one makes it theirs */
export type Hand = { hand: Layout | null; held: string[]; talk: boolean; more?: boolean; large: string | null; lifted: string | null; placed?: string[] };
export const HAND0: Hand = { hand: null, held: [], talk: true, more: false, large: null, lifted: null };

const MOVE = 300, EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** a piece at its box: laid once where it will stand, then carried there from where it stood and the size it had, by a
 *  transform alone: a move asks for no layout and no paint, so it keeps every frame whatever the piece holds */
function Piece({ id, r, lifted, hand, quick, form = "", children }: { id: string; r: Rect; lifted: boolean; hand: MutableRefObject<[number, number] | null>; quick: boolean; form?: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null), was = useRef<Rect | null>(null), up = useRef(false), formWas = useRef(form);
  // the box is never scaled: its buttons and its frame would be stretched all the way there. It takes its new size at
  // once and is carried to its place
  const firm = id === BOX;
  // where the hand has it: written to the piece itself on every frame of a carry (Space's `carry`), never through a draw
  const at = lifted ? hand.current : null;
  useLayoutEffect(() => {
    const p = was.current, e = el.current!, turned = formWas.current !== form; was.current = r; formWas.current = form;
    if (!p) { e.animate([{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE }); return; }
    // under the hand it stands where the hand is; let go, it settles from there into its box
    if (lifted) {
      const first = !up.current, h = hand.current; up.current = true; e.getAnimations().forEach((a) => a.cancel());
      if (!firm && (p.w !== r.w || p.h !== r.h)) {
        // another size under the hand (pulled out of large, or the place it would land is another size): it comes to its box, it
        // does not jump. Out of large the still point is where it covered its old box, so the hand's point on it never moves
        const sx = p.w / r.w, sy = p.h / r.h, o = first && h && sx >= 1 && sy >= 1 ? `${sx > 1 ? (h[0] - p.x) / (sx - 1) : 0}px ${sy > 1 ? (h[1] - p.y) / (sy - 1) : 0}px` : "0 0";
        e.animate([{ scale: `${sx} ${sy}`, transformOrigin: o }, { scale: "1 1", transformOrigin: o }], { duration: MOVE, easing: EASE });
      }
      return;
    }
    const u = up.current ? hand.current : null; up.current = false;
    if (u) {
      // it stays above the others until it has landed, and lands in the same time they take to make room
      e.getAnimations().forEach((a) => a.cancel()); e.classList.add("landing");
      const a = e.animate([{ transform: `translate(${u[0] - r.x}px, ${u[1] - r.y}px) scale(${firm ? 1 : p.w / r.w}, ${firm ? 1 : p.h / r.h})`, transformOrigin: "0 0" }, { transform: "translate(0, 0) scale(1, 1)", transformOrigin: "0 0" }], { duration: MOVE, easing: EASE });
      a.onfinish = a.oncancel = () => e.classList.remove("landing");
      return;
    }
    // the chat in another form (its column, its last lines, its one line) is another drawing: it arrives where it stands,
    // it is not stretched there from the size the other form had
    if (turned) { e.getAnimations().forEach((a) => a.cancel()); e.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: MOVE, easing: EASE }); return; }
    if (quick || (p.x === r.x && p.y === r.y && p.w === r.w && p.h === r.h)) return;
    // from where it is and the size it shows right now, so a move begun before the last one ended turns without a jump
    const t = new DOMMatrix(getComputedStyle(e).transform); e.getAnimations().forEach((a) => a.cancel());
    e.animate([{ transform: `translate(${p.x + t.m41 - r.x}px, ${p.y + t.m42 - r.y}px) scale(${firm ? 1 : (p.w * t.a) / r.w}, ${firm ? 1 : (p.h * t.d) / r.h})`, transformOrigin: "0 0" }, { transform: "translate(0, 0) scale(1, 1)", transformOrigin: "0 0" }], { duration: MOVE, easing: EASE });
  }, [r.x, r.y, r.w, r.h, lifted, form]);
  return <div ref={el} className={`pc-piece ${lifted ? "lifted" : ""}`} data-piece={id} data-form={form || undefined} style={{ left: r.x, top: r.y, width: r.w, height: r.h, transform: at ? `translate(${at[0] - r.x}px, ${at[1] - r.y}px)` : undefined }}>{children}</div>;
}

/** the chat as a piece: it follows its end (motion.ts follow), and is drawn again only when what is said changes */
const TalkIn = memo(function TalkIn({ form, children }: { form: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [f, setF] = useState<Follow | null>(null), fol = useRef<Follow | null>(null);
  useLayoutEffect(() => { const fl = follow(scroller.current!, inner.current!); fol.current = fl; setF(fl); fl.jump(); return () => { fl.destroy(); fol.current = null; setF(null); }; }, []);
  // in another form (its column, its last lines, back from its one line) the chat stands at its end again
  useLayoutEffect(() => { fol.current?.jump(); }, [form]);
  return (
    <section className="st-talk" data-part="the talk" aria-label="the chat">
      <div className="st-talkwrap"><div className="talk" ref={scroller}><div className="talk-inner" ref={inner}>{children}</div></div><Orb f={f} /></div>
    </section>
  );
});

/** what an artifact's frame asks of the space and of its caller, read when pressed */
type Acts = {
  carry: (id: string, grip: boolean) => (e: RPointerEvent<HTMLElement>) => void; large: (id: string) => void; away: (id: string, keep?: boolean) => void;
  act: (id: string) => Act; freeze: (id: string) => void; ledger: (id: string) => void; version: (id: string, v: number) => void;
};
// An artifact's inside is drawn again only when the artifact or its box's size changes, never because another piece moved.
const Art = memo(function Art({ session, block, state, w, h, n, made, dragged, ledger, acts }: { session: string; block: Block; state: State; w: number; h: number; n: number; made?: number; dragged: boolean; ledger: Line[] | null; acts: MutableRefObject<Acts> }) {
  const b = useMemo(() => ({ ...block, state }), [block, state]), r = useMemo(() => ({ id: block.id, x: 0, y: 0, w, h, z: 1 }), [block.id, w, h]), id = block.id;
  const act = useMemo(() => acts.current.act(id), [acts, id]);
  return <Frame session={session} b={b} r={r} n={n} made={made} picked={false} moving={false} born={false} dying={false} dragged={dragged} ledger={ledger} sessions={block.sessions.length ? block.sessions : [session]} act={act}
    onHead={(e) => acts.current.carry(id, false)(e)} onGrip={() => {}} onFocus={() => acts.current.large(id)} onFold={() => acts.current.away(id)} onFreeze={() => acts.current.freeze(id)} onClose={() => acts.current.away(id, false)} onLedger={() => acts.current.ledger(id)} onVersion={(v) => acts.current.version(id, v)} />;
});

export type SpaceProps = {
  session: string;
  /** the artifacts by id */
  blocks: Readonly<Record<string, Block>>;
  /** the artifacts standing open, newest first: OPEN_MAX of them are laid (lead.ts openNow), the rest named at the bottom edge */
  open: string[];
  /** the artifacts put away, named at the bottom edge */
  away: string[];
  /** what leads: TALK or an artifact (lead.ts) */
  lead: string;
  /** nothing said yet: the box alone, with `greet` over it */
  empty: boolean; greet?: ReactNode;
  /** the chat's inside (WorkTalk), the same node until what is said changes */
  talk: ReactNode;
  /** the chat as one line (lead.ts saidOf), and whether it ends on a question to you (asksOf) */
  said?: Said | null; asks?: boolean;
  /** the box (Composer) */
  box: ReactNode;
  hand: Hand; setHand: (f: (h: Hand) => Hand) => void;
  /** an artifact put away by name; one closed */
  onAway: (id: string) => void; onClose: (id: string) => void;
  /** an artifact brought back; `out` is put away so OPEN_MAX stay open */
  onBring: (id: string, out?: string) => void;
  /** an artifact's state as drawn, when it is not the block's own (the dev page's moments) */
  stateOf?: (id: string) => State | undefined;
  /** what the frame's inside, its freeze and its versions do (Build: the store) */
  act?: (id: string) => Act; onFreeze?: (id: string) => void; onVersion?: (id: string, v: number) => void;
  /** a block's ledger and when it was made, for its card */
  ledgerOf?: (id: string) => Line[] | undefined; madeOf?: (id: string) => number | undefined;
  /** the hand began to carry a piece or drag a seam */
  onHold?: () => void;
  /** the hand's arrangement drawn before the hand ever moved (the dev page's moments): from the rule's */
  seed?: (ruled: Layout) => Layout;
  /** the space's measured box is ready (the shots wait on it) */
  attrs?: Record<string, string | number>;
  /** what the space drew, for the agent's eyes (#1435, seen.ts): sent only while stage.eyes is on */
  onSeen?: (r: SeenReport | SeenOff) => void;
  /** the agent's moves for this session (#1437, hands.ts): subscribe, and the unsubscribe */
  onHands?: (f: (m: HandMove) => void) => () => void;
  /** how each of the agent's moves went and what the hand did to it, for the tracker (#1437, felt.ts) */
  onFelt?: (f: Felt) => void;
};

export function Space(p: SpaceProps) {
  const { hand: s, setHand: set } = p;
  const space = useRef<HTMLDivElement>(null), boxIn = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [boxH, setBoxH] = useState(112), [seaming, setSeaming] = useState(false);
  const [card, setCard] = useState<string | null>(null), handAt = useRef<[number, number] | null>(null), slid = useRef(false);
  useLayoutEffect(() => {
    const el = space.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const up = size.w > 0;
  useLayoutEffect(() => {
    const el = boxIn.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(Math.ceil(el.offsetHeight))); ro.observe(el);
    return () => ro.disconnect();
  }, [up]);
  // what the hand did since the last report, for the agent's eyes (#1435, seen.ts)
  const did = useRef<Did[]>([]);
  // the arrangement before the last move, for ⌥⌘Z; when the person's hand last pressed or turned the wheel here (#1437)
  const undo = useRef<Hand | null>(null), undoBy = useRef<"agent" | "hand">("hand"), handT = useRef(0), sNow = useRef(s); sNow.current = s;
  // what was just done, said on the strip at the bottom edge (#903's line, step.ts), behind stage.said: the step the undo
  // takes back, the arrangement an undo left (for redo), the agent's turn (its moves close together: one line, one undo)
  const saidOn = useStageSaid();
  const [told, setTold] = useState<Step | null>(null), [listed, setListed] = useState(false), toldT = useRef(0);
  const undoStep = useRef<Step | null>(null), redo = useRef<{ hand: Hand; by: "agent" | "hand"; step: Step | null } | null>(null), turn = useRef<{ at: number; moves: HandMove[] } | null>(null);
  const titleOf = (id: string) => p.blocks[id]?.title;
  const line = told ? stepLine(told, titleOf) : null, lineNow = useRef(line); lineNow.current = line;
  const stay = (ms = STEP_STAYS) => { window.clearTimeout(toldT.current); toldT.current = window.setTimeout(() => { setTold(null); setListed(false); }, ms); };
  const tell = (st: Step) => { if (!stageSaid() || !stepLine(st, titleOf) || !mayReplace(lineNow.current, st)) return; setTold(st); setListed(false); stay(); };
  useEffect(() => () => window.clearTimeout(toldT.current), []);
  // ⌥⌘Z and the line's undo: the arrangement before the last step; redo (⌥⇧⌘Z, the line's redo) the one it left
  const undoNow = (): boolean => {
    const u = undo.current; if (!u) return false;
    undo.current = null; felt.current.undo(undoBy.current);
    redo.current = { hand: { ...sNow.current, lifted: null }, by: undoBy.current, step: undoStep.current };
    if (undoStep.current) tell({ who: "back", how: "undid", step: undoStep.current });
    undoStep.current = null; turn.current = null;
    set(() => ({ ...u, lifted: null }));
    return true;
  };
  const redoNow = (): boolean => {
    const r = redo.current; if (!r) return false;
    redo.current = null; undo.current = { ...sNow.current, lifted: null }; undoBy.current = r.by; undoStep.current = r.step;
    if (r.step) tell({ who: "back", how: "redid", step: r.step });
    set(() => ({ ...r.hand, lifted: null }));
    return true;
  };
  const backs = useRef({ undoNow, redoNow }); backs.current = { undoNow, redoNow };
  // how the agent's moves went (felt.ts): only while the switch is on
  const onFelt = useRef(p.onFelt); onFelt.current = p.onFelt;
  const felt = useRef<ReturnType<typeof feltWatch>>(null!);
  if (!felt.current) felt.current = feltWatch((f) => { if (stageHands()) onFelt.current?.(f); });
  useEffect(() => () => felt.current.dispose(), []);
  // Esc puts a piece taken large back, before anything else hears it
  const large0 = useRef(s.large); large0.current = s.large;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // ⌥⌘Z: the arrangement before the last move (#1437), the agent's or the hand's
      if (e.code === "KeyZ" && e.altKey && e.metaKey && (e.shiftKey ? redo.current : undo.current)) { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) backs.current.redoNow(); else backs.current.undoNow(); return; }
      if (e.key !== "Escape" || !large0.current) return; did.current.push({ ev: "back", id: large0.current }); felt.current.hand({ ev: "back", id: large0.current }); e.preventDefault(); e.stopImmediatePropagation(); set((v) => ({ ...v, large: null, more: false }));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [set]);

  const kinds = useMemo(() => Object.fromEntries(Object.values(p.blocks).map((b) => [b.id, b.kind])), [p.blocks]);
  // the arrangement: the session's rule, unless the hand holds one; what the hand holds takes what opened since
  const lit = openNow(p.open, p.lead, s.held);
  const lay = (big: string | null) => {
    const ruled = rule(size, lit, p.lead, { talk: s.talk, more: s.more, large: big, empty: p.empty, asks: p.asks });
    const held = big ? null : s.hand ?? (p.seed && s.held.length && up ? p.seed(ruled) : null);
    let layout = held ? once(keep(held, lit)) : ruled;
    // what the hand holds never loses the chat: where it stands in no column it is on the box, and a question to you shows whole
    if (held && !p.empty && !shown(layout).includes(TALK)) layout = condense(layout, "line");
    if (held && layout.tail && p.asks) layout = { ...layout, tail: "asks" };
    if (held && !layout.cols.length) layout = ruled;
    const on = shown(layout);
    const names = [...p.open.filter((id) => !on.includes(id)), ...p.away.filter((id) => !on.includes(id))];
    // with the line on, the strip under the artifacts stands while any is laid, so a step said never moves a piece
    const strip = names.length > 0 || (saidOn && on.some((id) => id !== TALK && id !== BOX));
    return { held, layout, on, names, laid: place(layout, size, { boxH, lead: p.lead, names: strip, kinds }) };
  };
  const { held, layout, on, names, laid } = lay(s.large);
  // the agent's eyes (#1435): one report once what is drawn settles (seen.ts)
  const mark = (ev: Did["ev"], id?: string) => { const d: Did = id ? { ev, id } : { ev }; if (did.current.length < 20) did.current.push(d); felt.current.hand(d); };
  const hands = useStageHands(), mine = s.held.filter((x) => !(s.placed ?? []).includes(x));
  const drawn = `${Object.entries(laid.rects).map(([k, r]) => `${k}:${r.x},${r.y},${r.w},${r.h}`).join("|")}#${s.large}#${mine.join()}#${names.join()}#${layout.tail ?? ""}#${hands}`;
  useSeen(space, drawn, () => ({ large: s.large, held: mine, names, hands, ...(on.includes(TALK) ? { chat: layout.tail ?? "col" } : {}) }), did, p.onSeen);
  // `plain`: the arrangement without the piece taken large, where a carry out of large begins
  const now = useRef({ layout, rects: laid.rects, size, plain: lay }); now.current = { layout, rects: laid.rects, size, plain: lay };
  const stateOf = (id: string): State => p.stateOf?.(id) ?? p.blocks[id]?.state ?? "live";
  // what the agent opened or changed by itself (#903's agent steps): an artifact new on the space that the hand did not
  // bring, or one whose ledger grew by an agent's line; never said while an artifact waits on the person (one thing asks)
  const seenOpen = useRef<{ session: string; open: string[] } | null>(null), seenLedger = useRef(new Map<string, number>()), brought = useRef(new Set<string>());
  useEffect(() => {
    const was = seenOpen.current, fresh = !was || was.session !== p.session; seenOpen.current = { session: p.session, open: p.open };
    if (fresh) seenLedger.current.clear();
    const opened = fresh ? [] : p.open.filter((id) => !was!.open.includes(id) && !brought.current.has(id) && !!p.blocks[id]);
    brought.current.clear();
    let changed: { id: string; what: string } | null = null;
    for (const id of p.open) {
      const l = p.ledgerOf?.(id) ?? [], n0 = seenLedger.current.get(id), last = l[l.length - 1]; seenLedger.current.set(id, l.length);
      if (n0 !== undefined && l.length > n0 && last && byAgent(last.by) && !opened.includes(id)) changed = { id, what: last.what };
    }
    if (fresh || p.open.some((id) => stateOf(id) === "waits")) return;
    if (opened.length) tell({ who: "agent", how: "opened", ids: opened });
    else if (changed) tell({ who: "agent", how: "changed", ...changed });
  });
  // the line's "see": the artifact ringed where it stands, or brought back when it is put away
  const seeIt = (id: string) => {
    const el = space.current?.querySelector<HTMLElement>(`[data-piece="${CSS.escape(id)}"]`);
    if (!el) { bring(id); return; }
    el.classList.add("pc-seen"); window.setTimeout(() => el.classList.remove("pc-seen"), LENS_MS);
  };
  const backOf = () => {
    const l = lineNow.current; if (!told || !l) return;
    if (l.back === "undo") { if (!undoNow()) tell({ who: "back", how: "nothing" }); }
    else if (l.back === "redo") redoNow();
    else if (l.back === "put away" && told.who === "agent" && told.how === "opened") { for (const id of told.ids) if (p.open.includes(id)) away(id); setTold(null); }
    else if (l.back === "see" && told.who === "agent" && told.how === "changed") seeIt(told.id);
  };
  // the box grows as it is typed in: it and the chat over it take their new boxes at once, with the words. Carried there by a
  // scale they would be squashed for as long as the box grows, on every new line
  const boxWas = useRef(boxH), typed = boxWas.current !== boxH;
  useLayoutEffect(() => { boxWas.current = boxH; }, [boxH]);

  const away = (id: string, keepName = true) => {
    set((v) => {
      const hand = v.hand ?? (held || null), next = hand ? drop(hand, id) : null, left = v.held.filter((x) => x !== id);
      const base = { ...v, hand: left.length ? next : null, held: left, large: v.large === id ? null : v.large };
      return base;
    });
    mark(keepName ? "away" : "closed", id);
    (keepName ? p.onAway : p.onClose)(id);
  };
  // less of the chat: the few lines the hand opened go back to one; else the chat gives its column and stands on the box as its last line
  const less = () => { mark("chat-less"); lessOf(); };
  const lessOf = () => set((v) => {
    if (v.more && layout.tail === "lines") return { ...v, more: false };
    const hand = v.hand ?? (held || null), left = v.held.filter((x) => x !== TALK);
    return { ...v, talk: false, more: false, large: v.large === TALK ? null : v.large, held: left, hand: left.length && hand ? condense(hand, "line") : null };
  });
  // more of it: the chat the hand made small is given back; the line Sol made of it (a piece is large) opens to a few lines
  const more = () => { mark("chat-more"); if (!s.talk && !s.large) bring(TALK); else set((v) => ({ ...v, talk: true, more: true })); };
  const bring = (id: string) => { if (id !== TALK) mark("opened", id); bringOf(id); };
  const bringOf = (id: string) => {
    brought.current.add(id);
    if (id === TALK) { set((v) => { const hand = v.hand ?? (held || null); return { ...v, talk: true, more: false, large: null, hand: hand && v.held.length ? back(drop(hand, TALK)) : null }; }); return; }
    const open = [id, ...p.open.filter((x) => x !== id)], out = open.length > OPEN_MAX ? [...open].reverse().find((x) => x !== id && !s.held.includes(x)) : undefined;
    set((v) => { const hand = v.hand ?? (held || null); return { ...v, large: null, hand: hand && v.held.length ? add(out ? drop(hand, out) : hand, id) : null }; });
    p.onBring(id, out);
  };
  // the chat brought back into what the hand holds: the first column, the box under it again when it stood across the bottom edge
  const back = (h: Layout): Layout => (h.foot === BOX ? { cols: [{ ids: [TALK, BOX] }, ...h.cols] } : once({ ...h, cols: [{ ids: [TALK] }, ...h.cols] }));
  const large = (id: string) => { mark(s.large === id ? "back" : "large", id); largeOf(id); };
  const largeOf = (id: string) => set((v) => ({ ...v, more: false, large: v.large === id ? null : id }));
  const local = (e: PointerEvent): [number, number] => { const b = space.current!.getBoundingClientRect(), k = b.width / space.current!.clientWidth || 1; return [(e.clientX - b.left) / k, (e.clientY - b.top) / k]; };
  // a piece carried: where it would land is read against the boxes as they stood, and the others make room as it goes
  const carry = (id: string, grip: boolean) => (e: RPointerEvent<HTMLElement>) => {
    slid.current = false;
    if (e.button !== 0 || (s.large && s.large !== id) || (e.target as HTMLElement).closest("button, a, textarea, input")) return;
    // a piece taken large is carried like any other: the first move gives the others back, and it is carried from where it would stand among them
    const big = s.large === id ? now.current.rects[id] : null, back0 = big ? now.current.plain(null) : null;
    const el = e.currentTarget, sp = now.current.size, base = back0?.layout ?? now.current.layout, rects = back0?.laid.rects ?? now.current.rects, x0 = e.clientX, y0 = e.clientY; let moved = false, last: PointerEvent | null = null, tick = 0, aimKey = "", aimed: Layout | null = null, up1 = false, rest = 0, seen: [number, number, number] | null = null; const hand0 = s.hand, before = s;
    // the press is the hand's alone: no words are picked out under it, here or on the way
    e.preventDefault(); getSelection()?.removeAllRanges(); document.documentElement.classList.add("pc-holding");
    el.setPointerCapture(e.pointerId);
    const [px, py] = local(e.nativeEvent), r0 = rects[id];
    // out of large the piece is smaller: the hand keeps the same share of its width, as a window pulled off full screen does
    const gx = !r0 ? 0 : big ? ((px - big.x) / big.w) * r0.w : px - r0.x, gy = !r0 ? 0 : big ? Math.min(py - big.y, r0.h - 24) : py - r0.y;
    const pe = el.closest<HTMLElement>(".pc-piece");
    const step = () => {
      tick = 0; const ev = last; if (!ev) return;
      const [x, y] = local(ev), to = dropAt(base, rects, sp, id, x, y), key = to ? JSON.stringify(to) : "";
      const to0: [number, number] = [Math.min(Math.max(x - gx, 0), Math.max(0, sp.w - (r0?.w ?? 0))), Math.min(Math.max(y - gy, 0), sp.h - 48)];   // never cut by the space's edge
      // the piece follows the hand on the piece itself: no draw of the space stands between the hand and what it holds
      handAt.current = to0; const rn = now.current.rects[id];
      if (pe && rn) pe.style.transform = `translate(${to0[0] - rn.x}px, ${to0[1] - rn.y}px)`;
      // the others make room as it goes: once the hand has rested a moment over a new place, so a sweep across does not shake them
      // a slow hand is answered at once; a fast one (a sweep across) after it has stayed 60 ms, so the others do not shake
      const t1 = performance.now(), fast = seen ? Math.hypot(x - seen[0], y - seen[1]) / Math.max(1, t1 - seen[2]) > 0.6 : false; seen = [x, y, t1];
      if (key !== aimKey) { aimKey = key; clearTimeout(rest); rest = window.setTimeout(() => { aimed = to ? move(base, id, to) : null; set((v) => ({ ...v, hand: aimed ?? base })); }, fast ? 60 : 0); }
      if (!up1) { up1 = true; set((v) => ({ ...v, lifted: id, large: null, more: false })); }
    };
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) p.onHold?.();
      moved = true; slid.current = true; last = ev;
      if (!tick) tick = requestAnimationFrame(step);   // one move a frame, however often the hand reports
    };
    const end = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", end); el.removeEventListener("pointercancel", end);
      if (tick) { cancelAnimationFrame(tick); step(); }
      const last0 = moved; last = null; document.documentElement.classList.remove("pc-holding"); clearTimeout(rest);
      const landed = aimKey && last0 ? move(base, id, JSON.parse(aimKey)) : null;
      if (landed) { mark("moved", id); undo.current = { ...before, lifted: null }; undoBy.current = "hand"; undoStep.current = { who: "you", how: "moved", id }; turn.current = null; redo.current = null; tell(undoStep.current); }
      set((v) => {
        if (landed) return { ...v, lifted: null, hand: landed, held: v.held.includes(id) ? v.held : [...v.held, id], placed: (v.placed ?? []).filter((x) => x !== id), ...(id === TALK ? { talk: true, more: false } : {}) };
        v = { ...v, hand: hand0 }; const left = !moved && grip ? v.held.filter((x) => x !== id) : v.held;   // a press on a held piece's grip lets it go
        return { ...v, lifted: null, held: left, placed: (v.placed ?? []).filter((x) => left.includes(x)), hand: left.length || v.hand?.cols.some((c) => c.w) ? (v.hand ?? (held || null)) : null };
      });
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  };
  const seam = (i: number) => (e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget, { layout: base, rects } = now.current, left = rects[base.cols[i].ids[0]].x;
    e.preventDefault(); getSelection()?.removeAllRanges(); document.documentElement.classList.add("pc-holding");
    el.setPointerCapture(e.pointerId); setSeaming(true); p.onHold?.(); undo.current = { ...s, lifted: null }; undoBy.current = "hand"; undoStep.current = { who: "you", how: "widths" }; turn.current = null; redo.current = null;
    const mv = (ev: PointerEvent) => set((v) => ({ ...v, hand: widen(base, i, local(ev)[0] - left) }));
    const end = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", end); el.removeEventListener("pointercancel", end); document.documentElement.classList.remove("pc-holding"); setSeaming(false); mark("widths"); tell({ who: "you", how: "widths" }); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  };
  const unseam = () => set((v) => { const hand = v.hand && { ...v.hand, cols: v.hand.cols.map((c) => ({ ids: c.ids })) }; return { ...v, hand: v.held.length ? hand : null }; });

  // the agent's moves (#1437): once the person's hand has been still STILL_MS; a piece their hand placed is left alone
  // (the engine already said so); one put away is brought back first; ⌥⌘Z gives the arrangement before it
  const ownUntil = useRef(new Map<string, number>());   // the lens's own scroll, per piece: not the person's hand (#1547)
  const lens = (id: string, part: string, say?: string) => {
    const el = space.current?.querySelector<HTMLElement>(`[data-piece="${CSS.escape(id)}"]`); if (!el) return;
    ownUntil.current.set(id, performance.now() + LENS_MS);
    const frame = el.querySelector<HTMLIFrameElement>("iframe.st-page");
    if (frame) { frame.contentWindow?.postMessage({ sol: "go", part, say: say ?? "" }, "*"); felt.current.lens({ page: true }); return; }
    const t = partIn(el.querySelector(".pc-in") ?? el, part); felt.current.lens({ page: false, found: !!t }); if (!t) return;
    t.scrollIntoView({ block: "center", behavior: "smooth" });   // the line over it stays inside the piece
    t.classList.add("pc-lens"); if (say) t.dataset.say = say;
    window.setTimeout(() => { t.classList.remove("pc-lens"); delete t.dataset.say; }, LENS_MS);
  };
  const firstAt = useRef(new Map<number, { at: number; brought?: boolean }>());
  const agent = (m: HandMove): void => {
    const f0 = firstAt.current.get(m.n) ?? { at: performance.now() }; firstAt.current.set(m.n, f0);
    if (firstAt.current.size > 40) firstAt.current.delete(firstAt.current.keys().next().value!);
    const kind = p.blocks[m.id]?.kind;
    if (!stageHands()) return felt.current.made(m, { made: false, why: "off", kind });
    const wait = handT.current + STILL_MS - performance.now();
    if (wait > 0) { window.setTimeout(() => agentRef.current(m), wait); return; }
    const v0 = sNow.current, cur = now.current;
    if (v0.held.includes(m.id) && !(v0.placed ?? []).includes(m.id)) return felt.current.made(m, { made: false, why: "held", kind });
    // put away: brought back first, then the move once it is drawn among the others
    if (m.id !== TALK && !shown(cur.layout).includes(m.id) && p.blocks[m.id]) { f0.brought = true; bringOf(m.id); window.setTimeout(() => agentRef.current(m), MOVE + 50); return; }
    const base = v0.large ? cur.plain(null).layout : cur.layout, next = moved(base, m, cur.size);
    if (!next && m.large === undefined && !m.chat && !m.go) return felt.current.made(m, { made: false, why: "nothing", kind });
    // one turn's moves are one step: the undo keeps the arrangement before the first of them, the line counts them
    const t = performance.now(), on1 = sameTurn(turn.current?.at ?? null, t, undoBy.current, !!undo.current && undoStep.current?.who === "agent");
    if (!on1) undo.current = { ...v0, lifted: null };
    turn.current = { at: t, moves: on1 ? [...turn.current!.moves, m] : [m] };
    undoBy.current = "agent"; redo.current = null; undoStep.current = { who: "agent", how: "moved", moves: turn.current.moves }; tell(undoStep.current);
    felt.current.made(m, { made: true, waited: performance.now() - f0.at, brought: f0.brought, kind });
    if (next) set((v) => ({ ...v, large: null, hand: next, held: v.held.includes(m.id) ? v.held : [...v.held, m.id], placed: [...new Set([...(v.placed ?? []), m.id])] }));
    if (m.large !== undefined) set((v) => ({ ...v, more: false, large: m.large ? m.id : v.large === m.id ? null : v.large }));
    if (m.chat === "col") set((v) => { const hand = v.hand ?? (held || null); return { ...v, talk: true, more: false, large: v.large === TALK ? v.large : null, hand: hand && v.held.length ? back(drop(hand, TALK)) : null }; });
    else if (m.chat) set((v) => { const hand = v.hand ?? (held || null), left = v.held.filter((x) => x !== TALK); return { ...v, talk: false, more: m.chat === "lines", large: v.large === TALK ? null : v.large, held: left, placed: (v.placed ?? []).filter((x) => x !== TALK), hand: left.length && hand ? condense(hand, "line") : null }; });
    if (m.go) window.setTimeout(() => lens(m.id, m.go!, m.say), next || m.large !== undefined ? MOVE + 50 : 0);
  };
  const agentRef = useRef(agent); agentRef.current = agent;
  useEffect(() => p.onHands?.((m) => agentRef.current(m)), [p.onHands]);
  useEffect(() => {
    const el = space.current; if (!el) return;
    const busy = () => { handT.current = performance.now(); };
    // a scroll the space never sees as a wheel (#1547): a trackpad or the keys inside a page's frame, told by its sol-size
    // when its top moved; or the keys in a piece of the window. The lens's own scroll is not the hand's
    const own = (t: EventTarget | null) => { const id = (t as Element | null)?.closest?.<HTMLElement>("[data-piece]")?.dataset.piece; return id ? ownUntil.current.get(id) ?? 0 : 0; };
    const tops = new WeakMap<EventTarget, number>();
    const sized = (e: Event) => {
      const f = e.target as HTMLElement | null; let top: number;
      try { top = Number(JSON.parse(f?.dataset.size ?? "{}").top); } catch { return; }
      if (!f || !Number.isFinite(top)) return;
      const was = tops.get(f); tops.set(f, top);
      if (scrolled(was, top, own(f), performance.now())) busy();
    };
    const scroll = (e: Event) => { if (performance.now() >= own(e.target)) busy(); };
    el.addEventListener("pointerdown", busy, true); el.addEventListener("wheel", busy, { capture: true, passive: true });
    el.addEventListener("sol-size", sized, true); el.addEventListener("scroll", scroll, { capture: true, passive: true });
    return () => {
      el.removeEventListener("pointerdown", busy, true); el.removeEventListener("wheel", busy, true);
      el.removeEventListener("sol-size", sized, true); el.removeEventListener("scroll", scroll, true);
    };
  }, [up]);

  const acts = useRef<Acts>(null!);
  acts.current = {
    carry, large, away,
    act: (id) => p.act?.(id) ?? (() => {}),
    freeze: (id) => p.onFreeze?.(id), version: (id, v) => p.onVersion?.(id, v),
    ledger: (id) => setCard((c) => (c === id ? null : id)),
  };
  // while a piece is carried the chat and the box are not drawn again: what Sol writes meanwhile shows at the drop, and the hand keeps every frame
  const inside = useRef({ talk: p.talk, box: p.box }); if (!s.lifted) inside.current = { talk: p.talk, box: p.box };
  const boxEl = useMemo(() => <div className="st-talkbox" ref={boxIn}>{inside.current.box}</div>, [inside.current.box]);
  const grip = (id: string) => <div className={`pc-grip ${s.held.includes(id) ? "held" : ""}`} onPointerDown={carry(id, true)} title={!s.held.includes(id) ? "drag to move it" : (s.placed ?? []).includes(id) ? "placed by the agent · press to let Sol place it again · ⌥⌘Z undoes its last move" : "held where you put it · press to let Sol place it again"} />;
  const piece = (id: string) => {
    const r = laid.rects[id]; if (!r) return null;
    const inner = id === TALK ? <TalkIn key={p.session} form={layout.tail ?? "col"}>{inside.current.talk}</TalkIn> : id === BOX ? boxEl : p.blocks[id] ? (
      <Art session={p.session} block={p.blocks[id]} state={stateOf(id)} w={r.w} h={r.h} n={p.open.indexOf(id) + 1} made={p.madeOf?.(id)} dragged={s.lifted === id} ledger={card === id ? p.ledgerOf?.(id) ?? [] : null} acts={acts} />
    ) : null;
    // the chat's form: its column, or condensed on the box. As one line the chat itself stays as it is underneath, so it is
    // there at once, at its end, when it is given room again
    const form = id === TALK ? layout.tail ?? "col" : "", line = form === "line", said = p.said;
    return (
      <Piece key={id} id={id} r={r} lifted={s.lifted === id} hand={handAt} quick={seaming || typed} form={form}>
        <div className="pc-in" style={line ? { display: "none" } : undefined}>{inner}</div>
        {line ? (
          <div className="pc-line" data-said={said?.state ?? "said"} role="button" tabIndex={0} aria-label="the chat: more of it" title="more of the chat · drag it up to give it a column"
            onPointerDown={carry(TALK, false)} onClick={() => { if (!slid.current) more(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); more(); } }}>
            <i /><span>{said?.text ?? ""}</span>
          </div>
        ) : grip(id)}
        {id === TALK && !line && (lit.length > 0 || s.large === TALK) && <span className="pc-acts">{form !== "asks" && <button onClick={less} aria-label="less of the chat" title="less of the chat: its last line stays on the box">–</button>}<button onClick={() => large(TALK)} aria-label="larger" title="larger: the chat over the whole space · Esc brings the others back">⤢</button></span>}
      </Piece>
    );
  };
  // a seam is as tall as the columns it parts: it never lies over the box or the chat across the foot
  const colsEnd = Math.max(0, ...layout.cols.flatMap((c) => c.ids).map((id) => (laid.rects[id] ? laid.rects[id].y + laid.rects[id].h : 0)));
  return (
    <div ref={space} className={`pc st-room st-stage whole laid ${s.lifted ? "carrying" : ""} ${seaming ? "seaming" : ""}`} data-dock="left" {...p.attrs}>
      {/* one fixed order in the document whatever the arrangement: a node that is moved loses the hand that holds it, and a page inside it loads again */}
      {up && [...on].sort().map(piece)}
      {up && p.empty && p.greet && laid.rects[BOX] && <div className="pc-greet" style={{ left: laid.rects[BOX].x, width: laid.rects[BOX].w, bottom: size.h - laid.rects[BOX].y }}>{p.greet}</div>}
      {!s.large && laid.seams.map(({ i, x }) => <div key={i} className="pc-seam" style={{ left: x, bottom: size.h - colsEnd }} onPointerDown={seam(i)} onDoubleClick={unseam} role="separator" aria-orientation="vertical" title="drag to set the widths · double press to give them back" />)}
      {laid.names && (
        <div className="pc-names" style={{ left: laid.names.x, top: laid.names.y, width: laid.names.w, height: laid.names.h }} aria-label="put away">
          {names.slice(0, 6).map((id) => p.blocks[id] && <button key={id} className={`pc-name ${stateOf(id)}`} onClick={() => bring(id)} title="open it"><Mark kind={p.blocks[id].kind} />{p.blocks[id].title}</button>)}
          {names.length > 6 && <span className="pc-more">{names.length - 6} more</span>}
          {line && (
            <div className={`pc-step ${line.agent ? "agent" : ""}`} role="status" onPointerEnter={() => window.clearTimeout(toldT.current)} onPointerLeave={() => stay()}>
              {line.agent && <i />}
              {line.each && line.each.length > 1
                ? <button className="pc-step-w" onClick={() => setListed((v) => !v)} title="what it did">{line.words}</button>
                : <span className="pc-step-w">{line.words}</span>}
              {line.back && <button className="pc-step-back" onClick={backOf}>{line.back}</button>}
              {line.back === "undo" && <kbd>⌥⌘Z</kbd>}
            </div>
          )}
        </div>
      )}
      {listed && line?.each && laid.names && (
        <div className="pc-steps" style={{ right: size.w - (laid.names.x + laid.names.w), bottom: size.h - laid.names.y + 4 }} onPointerEnter={() => window.clearTimeout(toldT.current)} onPointerLeave={() => stay()}>
          {line.each.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      {up && <span data-space-ready hidden />}
    </div>
  );
}
