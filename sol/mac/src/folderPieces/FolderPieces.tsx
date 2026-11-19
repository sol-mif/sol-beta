// A project folder's pieces in Build's side (#1092, behind build.pieces): above the folder's sessions, one row per piece,
// the session's row grammar with a square for its mark (a tool) where a session has its dot (a talk). At rest the square
// is quiet; working, it breathes; wanting you, its figure and its rim are the sun, the person's colour. A press does what
// a press on a session row does: the piece takes the room (PieceRoom) and its row wears the pearl. Taken by the hand it
// lifts off the side and follows the pointer; past the side's edge it grows into the block it will be, and seats in
// the session under it with the snap's click: the same block, one ledger.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Glass } from "../kit";
import { CURVE } from "../kit/tokens";
import { setCarryOver } from "../stage/carry";
import { click, play } from "../snap/click";
import type { Metas } from "../home/meta";
import { useBuildPieces } from "./flag";
import { usePieces, piecesAct, link } from "./usePieces";
import { EMPTY_LINE, startersOf, type BenchSource } from "./bench";
import { NEW_PIECE, setOpenPiece, useOpenPiece } from "./open";
import { useBorn } from "./born";
import { useGhost } from "./ghost";
import { dropTarget, figureOf, lookOf, orderOf, shownOf, stepsIn, type PieceInfo, type Step } from "./model";
import "./pieces.css";

export const meta = {
  FolderPieces: {
    job: "a project folder's pieces in Build's side, above its sessions: tools that do part of their job between visits",
    flow: "pickup",
    states: ["off", "no pieces (what a piece is, and the starters)", "reading", "at rest", "working", "wants you", "broken recipe", "open in the room", "lifted", "grown over the room", "over a session row", "seated"],
    keys: [
      { press: "click a piece", does: "opens it in the room, as a session row opens its session", goal: "pickup" },
      { press: "click a starter (no pieces yet)", does: "opens a new piece with that source read: keep makes it", goal: "pickup" },
      { press: "drag a piece onto a session row or into the room", does: "seats it in that session as a block: the same piece, one ledger", goal: "pickup", faster: true },
    ],
    listens: ["build.pieces (folderPieces/flag.ts)", "the open piece (folderPieces/open.ts)", "work.pieces.sources { ghost } (Jev: \"make: <name>\")", "work.pieces.changed", "work.stage.changed (a piece-… block)"],
  },
} satisfies Metas;

const LIFT_PX = 5;   // a press that moves less than this is a click
const BLOCK_W = 340;   // the block it will be, as the stage's list kind is laid

/** the square that marks a tool, where a session row has its dot */
function Square({ look }: { look: string }) { return <i className={`fp-sq fp-${look}`} aria-hidden />; }

/** `side`: the hold-it side's rows (home/Side.tsx); `work`: Build's WorkSidebar rows (its .row grammar) */
type Grammar = "side" | "work";
const CLS: Record<Grammar, { row: string; mk: string; tt: string; fig: string }> = {
  side: { row: "hc-row", mk: "hc-mk", tt: "hc-tt", fig: "hc-when" },
  work: { row: "row wrow", mk: "fp-mk", tt: "t", fig: "age" },
};

export function FolderPieces({ cwd, live, lift, grammar = "side" }: { cwd: string; live: string | null; lift?: (pearl: boolean) => ReactNode; grammar?: Grammar }) {
  const on = useBuildPieces();
  if (!on) return null;
  return <Rows cwd={cwd} live={live} lift={lift} g={CLS[grammar]} grammar={grammar} />;
}

type Carry = { p: PieceInfo; x: number; y: number; to: { session: string; on: "row" | "stage" } | null; over: boolean };

function Rows({ cwd, live, lift, g, grammar }: { cwd: string; live: string | null; lift?: (pearl: boolean) => ReactNode; g: (typeof CLS)[Grammar]; grammar: Grammar }) {
  const { pieces, errors, project } = usePieces(cwd);
  // a folder with no pieces (its list answered): what a piece is, and the starters it can keep at once (morning round of
  // 11-13: a fresh folder showed only "new piece", and its first pill could need the NucBox)
  const empty = project !== undefined && !pieces.length && !errors.length;
  const [starters, setStarters] = useState<BenchSource[]>([]);
  useEffect(() => {
    if (!empty) return;
    let gone = false;
    void Promise.resolve(link()?.ask<{ sources?: BenchSource[] }>("work.pieces.sources", { cwd }, 8000)).then((r) => { if (!gone) setStarters(startersOf(r?.sources ?? [])); }, () => {});
    return () => { gone = true; };
  }, [cwd, empty]);
  const ghost = useGhost(cwd);
  const [hovered, setHovered] = useState(false);   // the ghost row's pearl tick goes at the first hover
  const [unfolded, setUnfolded] = useState(false);   // the "+2 · clash, releases" row pressed: every piece shown (folds when he leaves)
  const born = useBorn(cwd, pieces.map((p) => p.name));   // a row this folder shows for the first time drops in
  const open = useOpenPiece();
  const view = shownOf(orderOf(pieces), unfolded, open?.cwd === cwd ? open.name : null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [seated, setSeated] = useState<string | null>(null);
  // a drop the engine refused (a session of another project): its reason in words, for a few seconds
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => { if (!refused) return; const t = setTimeout(() => setRefused(null), 5000); return () => clearTimeout(t); }, [refused]);
  const [rows, setRows] = useState<Step[]>([]);
  const from = useRef<{ p: PieceInfo; x: number; y: number; id: number } | null>(null);
  const held = useRef(false);   // lifted: read by the handlers at once, never from a render's state
  const sideEdge = useRef(0);

  // a folder with no pieces yet still offers "new piece" (its one row), so the first tool can be made by hand

  const under = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const side = el?.closest("aside, [data-place=side]");
    return dropTarget({ sid: (el?.closest("[data-sid]") as HTMLElement | null)?.dataset.sid ?? null, stage: (el?.closest("[data-stage]") as HTMLElement | null)?.dataset.stage ?? null,
      main: !!el && !side, live });
  };
  const down = (ev: React.PointerEvent, p: PieceInfo) => {
    if (ev.button !== 0) return;
    from.current = { p, x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    const side = (ev.currentTarget as HTMLElement).closest("aside, [data-place=side]");
    sideEdge.current = side?.getBoundingClientRect().right ?? 0;
  };
  const crossed = useRef(false);   // the carried chip is past the side's edge (its tick plays once per crossing)
  const move = (ev: React.PointerEvent) => {
    const f = from.current;
    if (!f) return;
    if (!held.current && Math.hypot(ev.clientX - f.x, ev.clientY - f.y) < LIFT_PX) return;
    if (!held.current) {
      held.current = true;
      (ev.currentTarget as HTMLElement).setPointerCapture?.(f.id);
      play("part", { level: 0.6 });
      crossed.current = false;
      // the block it will be: its real rows, asked once as it lifts
      void piecesAct.open(cwd, f.p.name).then((r) => setRows(stepsIn(r.seen?.body?.text).steps));
    }
    const to = under(ev.clientX, ev.clientY);
    setCarryOver(to?.on === "row" ? to.session : null);
    // the snap's tick as the chip crosses the side's edge, either way (the designer's DETAILS: drag)
    const out = ev.clientX > sideEdge.current;
    if (out !== crossed.current) { crossed.current = out; play("tick", { level: 0.5 }); }
    setCarry({ p: f.p, x: ev.clientX, y: ev.clientY, to, over: out && to?.on !== "row" });
  };
  const up = (ev: React.PointerEvent) => {
    const f = from.current;
    from.current = null;
    setCarryOver(null);
    const lifted = held.current;
    held.current = false;
    if (!lifted || !carry) { if (f && !lifted) setOpenPiece({ cwd, name: f.p.name, from: live }); setCarry(null); return; }
    const c = carry;
    setCarry(null);
    if (!c.to) { play("push"); return; }
    const stage = c.to.on === "stage" ? (document.querySelector(`[data-stage="${CSS.escape(c.to.session)}"]`) as HTMLElement | null)?.getBoundingClientRect() : null;
    // where the hand is, kept inside the stage (the stage lays it again on its own rule when the room is narrow)
    const at = stage ? { x: Math.max(0, Math.min(stage.width - BLOCK_W, Math.round(ev.clientX - stage.left - BLOCK_W / 2))), y: Math.max(0, Math.min(stage.height - 260, Math.round(ev.clientY - stage.top - 20))), w: BLOCK_W, h: 260 } : undefined;
    click(1);
    setSeated(c.p.name);
    setTimeout(() => setSeated(null), 400);
    void piecesAct.drop(cwd, c.p.name, c.to.session, at).then((r) => { const why = r && (r as { error?: string }).error; if (why) { setSeated(null); play("push"); setRefused(why); } });
  };

  return (
    <div className={`fp-rows fp-g-${grammar}`} data-pieces={cwd}>
      {/* the one press that wakes the folder's tools comes first, in ink, while it is there (the designer's NOW 1 of 06:31) */}
      {pieces.some((p) => p.asks) && (
        <button type="button" className={`${g.row} fp-row fp-ask fp-first`} data-piece-ask title="the pieces here run a script from this folder's .sol/pieces; they wait until you let them"
          onClick={() => { const code = pieces.find((p) => p.asks)?.asks; if (!code) { setRefused("only Sol's own window lets a folder's scripts run"); return; } click(0.6); void Promise.resolve(piecesAct.trust(cwd, code)).then((r) => { if (r?.error) setRefused(r.error); }); }}>
          <span className={g.mk}><Square look="doubt" /></span><span className={g.tt}>let {pieces.find((p) => p.asks)?.scope === "this folder" || !pieces.find((p) => p.asks)?.scope ? "this folder's" : `${pieces.find((p) => p.asks)!.scope!.replace(/ and its worktrees$/, "")}'s`} tools run</span><span className={`${g.fig} fp-fig`}>{pieces.filter((p) => p.asks).length}</span>
        </button>
      )}
      {view.shown.map((p) => {
        const look = lookOf(p), fig = figureOf(p), isOpen = open?.cwd === cwd && open.name === p.name;
        return (
          <div key={p.name} role="button" tabIndex={-1} data-thing data-kind="piece" data-piece={p.name}
            className={`${g.row} fp-row fp-${look}${isOpen ? " on fp-open" : ""}${carry?.p.name === p.name ? " fp-lifted" : ""}${seated === p.name ? " fp-seated" : ""}${born.has(p.name) ? " fp-born" : ""}`}
            style={born.has(p.name) ? ({ "--born": born.get(p.name) } as React.CSSProperties) : undefined}
            title={p.error ? `${p.title}: ${p.error}` : p.about ?? p.title}
            onPointerDown={(ev) => down(ev, p)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { from.current = null; held.current = false; setCarry(null); setCarryOver(null); }}>
            <Fragment key={isOpen ? "pearl" : "lift"}>{lift?.(isOpen)}</Fragment>
            <span className={g.mk}><Square look={look === "rest" && (p.asks || (p.doubt ?? 0) > 0) ? "doubt" : look} /></span>
            <span className={g.tt}>{p.title}</span>
            <span className={`${g.fig} fp-fig`}>{fig}</span>
          </div>
        );
      })}
      {view.folded.length > 0 && (
        <button type="button" className={`${g.row} fp-row fp-fold`} data-piece-fold onClick={() => { click(0.5); setUnfolded(true); }}>
          <span className={g.mk} /><span className={g.tt}>+{view.folded.length} · {view.folded.map((p) => p.title).join(", ")}</span><span className={`${g.fig} fp-fig`} />
        </button>
      )}
      {empty && <div className="fp-said fp-empty" data-pieces-empty>{EMPTY_LINE}</div>}
      {empty && starters.map((s) => {
        const on = open?.cwd === cwd && open.name === NEW_PIECE && open.reads === s.id;
        return (
          <button key={s.id} type="button" className={`${g.row} fp-row fp-ask fp-new fp-starter${on ? " on fp-open" : ""}`} data-piece-starter={s.id}
            title={`a starter: a piece that reads this folder's ${s.word}`} onClick={() => { click(0.6); setOpenPiece({ cwd, name: NEW_PIECE, from: live, reads: s.id }); }}>
            <span className={g.mk}><Square look="doubt" /></span><span className={g.tt}>{s.word}</span><span className={`${g.fig} fp-fig`} />
          </button>
        );
      })}
      {/* a new piece, made by hand: the room gives it the bench (its back first, its real front beside) */}
      <button type="button" className={`${g.row} fp-row fp-ask fp-new${ghost?.tier === "acts" && !hovered ? " fp-offer" : ""}${open?.cwd === cwd && open.name === NEW_PIECE && !open.reads ? " on fp-open" : ""}`} data-piece-new
        onPointerEnter={() => setHovered(true)}
        title={ghost?.tier === "acts" ? `you asked "${ghost.asked}" today: a piece could keep it answered` : undefined}
        onClick={() => { click(0.6); setOpenPiece({ cwd, name: NEW_PIECE, from: live }); }}>
        <span className={g.mk}><Square look="doubt" /></span><span className={g.tt}>{ghost?.tier === "acts" ? `make: ${ghost.name}` : "new piece"}</span><span className={`${g.fig} fp-fig`} />
      </button>
      {refused && <div className="fp-said" role="status">{refused}</div>}
      {errors.map((e) => (
        <div key={e.file} className={`${g.row} fp-row fp-broken`} title={e.error}>
          <span className={g.mk}><Square look="broken" /></span><span className={g.tt}>{e.file}</span><span className={`${g.fig} fp-fig`}>!</span>
        </div>
      ))}
      <i className="fp-seam" aria-hidden />
      {carry && createPortal(
        <div className={`fp-carry fp-${lookOf(carry.p)}${carry.over ? " fp-grown" : ""}`} style={{ left: carry.x, top: carry.y }} aria-hidden>
          <Glass r={CURVE.radius.block} step="pop" surface="raised" />
          <div className="fp-chead"><Square look={lookOf(carry.p)} /><span>{carry.p.title}</span><b>{figureOf(carry.p)}</b></div>
          <div className="fp-crows">{rows.filter((s) => s.st !== "done").slice(0, 3).map((s, i) => <div key={i} className={`fp-crow ${s.st}`}><i /><span>{s.t}</span></div>)}</div>
        </div>, document.body)}
    </div>
  );
}
