// owned by slice 1 (Plane), docs/port/slices.md
// The plane (#1615; the mockup's merge/shell.js "the plane", round 2 · A, round 3 · A3, round 4): Far and Middle are two
// bands of one pannable, zoomable plane. Geometry is the store's (D.pos, S.cam) and layout.ts's; this draws it. One plane
// edge to edge, no column: three zones, Diary · Build · Life, each a label over its space. Today's page sits in the Diary
// at its place (#pl-dy; the diary slot draws it, slice 4). Far: each folder as its card. Middle: folders as areas, their
// pieces as faces scaled by the camera, at most eight full faces, the rest one line each; a life folder's things are the
// life slot's board (slice 4), given back to the plane as pieces while that board draws nothing. When today's page is off
// screen a chip on the edge points to it; a zone not whole on screen at Far is named by a chip at its edge. Only what is
// in the view at its band carries data-front. Pan: a drag on bare plane or two fingers; zoom: a pinch, the wheel with ⌘
// or ctrl, ⌘+ / ⌘−; a piece or a folder dragged is placed (M.place). The view reads and presses; it never changes D.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from "react";
import { D, S, M, MODE, SCEN, SCN, above, type Ask, asksInRegion, open, piecesIn, piecesShown, regionOf, sessions, useNext, render, dataVer, hooks, camOnlyNow, parentOf, ancestors, type Piece, type Region } from "../cv/index.ts";
import { K, awayWords } from "../keeps.ts";   // #1879 step 3: how long the person was away
import * as L from "./layout.ts";
import { Face, FoldLine, AskRow } from "./Face.tsx";
import { cullFar } from "./cull.ts";
import { groupFar } from "./groupFar.ts";   // the infinite canvas (BR1, #1615, F): cards held at their size, the ones that collide one group
import { hold } from "./size.ts";
import { changedWords } from "../lead/rules.ts";
import { toFit } from "./fit.ts";   // which cards fitCards fits: never a folded tab (#1615)
import { Slot, type SlotProps } from "../slots.ts";
import { StarterCard } from "../near/Starter.tsx";
import { agent } from "../agent/calls.ts";
import { firstWords } from "../people/extra.ts";
import { opensAs } from "../cv/moves/tabs.ts";   // BR1 tabs (#1615): how a kind opens, in place or as a tab
import Yours from "../pieces/Yours.tsx";   // slice 12: a piece of your own, "yours" (docs/port/requests/pieces.md)
import { FolderCard, OpenTab, costOf, money, titleOf } from "./Folder.tsx";   // BR1: the folder drawn as a folder (#1615)
import { DayMore, DiaryHandles, FolderTab, More, PieceMenu, SessionChip, Spine, menuOn } from "./Pieces.tsx";   // BR1: pieces by hand (#1615)
import { needsCount, needsCountKept } from "../people/queue.ts";
import { Gather } from "./Gather.tsx";   // BR1 item 3, the calm screen: the gather line (#1615)
import Parts from "../folder/parts/Parts.tsx";   // first-timer line 3: an empty folder shows its parts (F's)
import { gatherOf, gathers, gatherWords } from "./calm.ts";
import { canvasOpening, placeOf } from "../place.ts";
import { needWords } from "../cv/core.ts";
import { foldBox } from "../fits/fit.ts";
import { planeDrop, planeFolderDrop, planeFolderOver, planeOver } from "../notes/drop.ts";   // BR1: the safe drops, a session or a folder into a folder (#1615)
import { HolderClose, holderItems } from "../holders/Holders.tsx";   // holders.html (#1615): Sessions, Made and the asked ones
import { Lit, Star } from "./Landed.tsx";   // ✦ landing (inside.html moment 3, BR1 #1615): what a session made, tied to it (builder P9)
import { lightOff, lightOn, madeBy, tintAt } from "./landed-state.ts";
import { barOver, chipOn, overBar } from "../cv/wire/canvas.ts";   // BR1 item 7 (#1615): dropped on the bar, a chip for the canvas session
import "./plane.css";
import "./group.css";

const tint = (rid: string) => `pl-t${Math.max(0, L.tintOf(rid))}`;
const px = (n: number) => +n.toFixed(1);
/** what in the Diary takes a press itself (an answer, the write box, a line's because): a press there is never "open it up close" */
const DY_LIVE = "button,a,input,textarea,select,label,summary,[contenteditable],[role=button],[role=link],[tabindex],[data-act]";
/** today's page at Middle: its content's width on screen (px), against its right edge */
const PAGE_MID_W = 720;
type Rect = { x: number; y: number; w: number; h: number };
/** one camera (#1633): everything on the plane is placed in the plane's own units inside .pl-cam, which the camera moves and
 *  scales with one transform, so a pan writes that transform and nothing else. A box drawn at screen size (a card, an area,
 *  a one-line piece) is counter-scaled where it stands: its spot is the plane's, its size and look the screen's, as before */
const flat = (x: number, y: number, w: number, h: number | undefined, z: number) =>
  ({ left: x, top: y, width: px(w * z), height: h === undefined ? undefined : px(h * z), transform: `scale(${1 / z})` });
const near = (q: Rect, w: number, h: number, m = 40) => q.x < w + m && q.x + q.w > -m && q.y < h + m && q.y + q.h > -m;
const rankOf = (p: Piece) => { const a = open().filter((x) => x.piece === p.id); return a.length ? Math.min(...a.map((x) => x.rank)) : 999; };

/** a folder's name is on screen at Middle (shell.js labelShown) */
/** the line's height may have changed: fit the rule's camera and the page to it now (the join, #1615: count 23 "+line") */
// drawnLine is -1 while no page is drawn: the plane not there (a page over the canvas), or there with nothing to lay out
// yet (live, before the engine's folders fill D). Then there is no page to fit, and a draw would not set it, so asking
// again would ask forever: each draw's layout effect would find the line "moved" and draw again (#1615: a live Sol's
// first answers never drew the shell)
let drawnLine = -1, lineTick = 0, planesOn = 0;
function lineMoved(): void {
  if (camOnlyNow()) return;   // a pan or a zoom: the line is as it was
  const paged = planesOn > 0 && drawnLine >= 0;
  if (L.lineFit() || (paged && S.dist === "far" && L.safe("far").b !== drawnLine)) { lineTick++; render(); }
}
(hooks as { lineMoved?: () => void }).lineMoved = lineMoved;
function labelShown(rid: string): boolean {
  const q = D.pos?.[rid];
  if (!q) return false;
  const { w, h } = L.viewSize(), a = L.toScreen(q.x, q.y);
  return a.x + 18 >= 0 && a.x + 18 < w - 120 && a.y + 14 >= 0 && a.y + 40 < h;
}

/** Far: a folder as its card (shell.js regionCard), drawn as a folder (BR1, Folder.tsx); under the camera, so a pan
 *  leaves it as it was (#1633). What it says is drawn again when the data changes (v), not when the camera moves it */
const RegionCard = memo(function RegionCard({ r, q, z, front, sel }: { r: Region; q: Rect; z: number; front: boolean; sel: boolean; v: number }) {
  const cls = `pl-card ${tint(r.id)}${sel ? " pl-sel" : ""}`;
  if (L.folded(r.id)) return <FolderTab r={r} cls={cls} front={front} style={flat(q.x, q.y, q.w, undefined, z)} w={q.w * z} />;
  return <FolderCard r={r} cls={cls} front={front} style={flat(q.x, q.y, q.w, q.h, z)} w={q.w * z} h={q.h * z} quiet={menuOn(r.id)} extra={<More id={r.id} label={r.name} />} />;
});

/** a face, its one line and a folder's board as they read: drawn again when the data changes, not when the camera moves
 *  them (#1615 S32) */
const Faced = memo(function Faced({ p }: { p: Piece; v: number }) { return <Face p={p} />; });
const Folded = memo(function Folded({ p, w }: { p: Piece; v: number; w: number }) { return <FoldLine p={p} w={w} />; });
const Board = memo(function Board({ rid }: { rid: string; v: number }) { return <div className="pl-board"><Slot name="life" region={rid} band="middle" /></div>; });
/** a piece on the plane: a full face at plane size (the camera scales it), or its one line at screen size (shell.js
 *  pieceHTML); under the camera, so a pan leaves it as it was (#1633) */
function PieceOn({ p, full, sel, far }: { p: Piece; full: boolean; sel: boolean; far?: boolean }) {
  if (L.isOff(p.id) || L.isOff(p.region) || L.folded(p.region)) return null;   // BR1: off the canvas, or inside a folded folder
  if (L.folded(p.id)) { const q = D.pos![p.id], z = S.cam.z; return <SessionChip p={p} style={{ left: q.x, top: q.y, transform: `scale(${1 / z})` }} />; }
  return <Placed p={p} q={D.pos![p.id]} z={S.cam.z} full={full} sel={sel} far={far} nb={S.dist === "middle" && !!S.region && p.region !== S.region} here={p.region === S.region} v={dataVer()} />;
}
const Placed = memo(function Placed({ p, q, z, full, sel, far, nb, here, v }: { p: Piece; q: Rect; z: number; full: boolean; sel: boolean; far?: boolean; nb: boolean; here: boolean; v: number }) {
  const nw = L.isNew(p.id), s = D.pos?.[p.region]?.s ?? 1;   // in a folder inside a folder (BR1): its face at its folder's scale
  // ✦ landing (plane/landed.ts): a piece a session made wears its ✦ and dashed edge; the hand on it lights that session
  const mb = madeBy(p), made = mb ? " ld-made" : "", ld = (mb ? { "--ld": tintAt(L.tintOf(mb.region)) } : {}) as CSSProperties;
  const tie = mb ? { "data-made": mb.id, onPointerEnter: () => lightOn(mb.id), onPointerLeave: () => lightOff(mb.id), onFocus: () => lightOn(mb.id), onBlur: () => lightOff(mb.id) } : {};
  // the infinite canvas (size.ts): past its largest size a face holds it, centred where it was, and only the gaps grow
  const k = Math.min(1, hold(q.w, z, "face")), sk = s * k, kx = q.x + (q.w * (1 - k)) / 2, ky = q.y + (q.h * (1 - k)) / 2;
  if (full) return (
    <section className={`pl-piece pl-k-${p.kind}${sel ? " pl-sel" : ""}${nw ? " pl-isnew" : ""}${nb ? " pl-nb" : ""}${p.parts?.length ? " pl-split" : ""}${made}`} data-front data-piece={p.id} data-in={p.region} {...tie}
      data-part={p.kind === "session" ? p.ai : p.name} style={{ ...(sk === 1 ? { left: q.x, top: q.y, width: q.w, maxHeight: q.h } : { left: kx, top: ky, width: q.w / s, maxHeight: q.h / s, transform: `scale(${sk})`, transformOrigin: "0 0" }), ...L.textFloor(z * sk), ...ld }}>
      {mb ? <Star s={mb} /> : null}{nw ? <span className="pl-new">new</span> : null}{p.kind === "starter" ? <StarterCard id={p.id} /> : <Faced p={p} v={v} />}
      {p.kind !== "starter" ? <More id={p.id} label={titleOf(p)} /> : null}   {/* the calm screen (BR1 item 3): one ⋯ on every piece */}
    </section>
  );
  const rect = L.rectOn(q), fb = foldBox(q, rect, far, z);   // round 8 fixes · F4 (slice R8): at the Diary's foot, from the page's left, wherever it grew to
  return (
    <div className={`pl-fold${sel ? " pl-sel" : ""}${here && !far ? "" : " pl-away"}${nb ? " pl-nb" : ""}${made}`} data-piece={p.id} data-in={p.region} data-folded {...tie}
      style={{ ...flat(+(q.x + (fb.x - rect.x) / z).toFixed(2), q.y, fb.w, undefined, z), ...ld }}>
      {p.kind === "starter" ? <StarterCard id={p.id} band="line" /> : <Folded p={p} v={v} w={fb.w * z} />}{mb ? <Star s={mb} /> : null}{nw ? <span className="pl-new">new</span> : null}
    </div>
  );
});
/** Middle: a folder as an area, its name at the top at screen size; under the camera (#1633) */
const Area = memo(function Area({ r, q, z, here, named }: { r: Region; q: Rect; z: number; asks: number; here: boolean; named: boolean; v: number }) {   // asks: drawn again when they change
  const bare = here && empty(r.id);   // scope (a): an empty folder says so once, in its own line, not also in its tab's chip
  return (
    <div className={`pl-area ${tint(r.id)}${here ? " pl-here" : " pl-nb"}`} data-area={r.id} data-in={r.id} tabIndex={-1} role="group" aria-roledescription="folder" aria-label={r.name} style={flat(q.x, q.y, q.w, q.h, z)}>
      <div className="pl-lab" data-front={here && named ? "" : undefined} data-m1={here && named ? "what" : undefined} style={{ fontSize: px(Math.max(12, Math.min(26, 22 * z))) }}>
        <OpenTab r={r} line={!bare} /><More id={r.id} label={r.name} /></div>
      {bare ? <Empty r={r} /> : null}
    </div>
  );
});
/** a folder opened with nothing on it (first-timer line 3, BR1 #1615): its parts, what Sol saw of it (F's Parts.tsx, the
 *  folder page's), and the one way in, a session that starts knowing the folder (the folder page's ＋ New session) */
/** nothing drawn in it and nothing inside it either: no folder, no quiet session, none the move-in read counted there */
const empty = (rid: string) => !L.onPlane(rid).length && !D.regions.some((x) => parentOf(x.id) === rid) && placeOf(rid).empty;
function Empty({ r }: { r: Region }) {
  return (
    <div className="pl-empty" data-empty={r.id}>
      <Parts rid={r.id} />
      <p className="pl-et">{placeOf(r.id).line}. Start a session and the AI already knows what's in {r.name}.</p>
      <button type="button" className="pl-eb" onClick={() => M.folder_open(r.id)}>＋ New session in {r.name}</button>
    </div>
  );
}

/** Middle's head: the folder's name when its own label is off screen, what needs you here, the keys (shell.js midHead).
 *  The calm screen (BR1 item 3): when the asks on screen gather (`g`, Gather.tsx), "here" is the screen and its count is
 *  the gather line, a press that lists them; the rest are "outside" as before, so the sum stays the one count */
function MidHead({ g }: { g: Ask[] | null }) {
  const r = regionOf(S.region);
  if (!r && !g) return null;
  // scope (b): nothing floats over text. It sits in the clear band above the opened folder (SAFE.middle's top), its foot
  // over the folder's tab and growing upward, at the folder's left; never pinned to the window's corner, where a neighbour
  // (the Diary, another folder) may be drawn. A folder panned up takes it along on its tab: its foot stays at the folder's
  // own top, so it never covers the folder's first row, and it leaves with the tab, whole, never a cut sliver
  const q = r && D.pos?.[r.id] ? L.rectOn(D.pos[r.id]) : null, TAB = 20;   // TAB: the label rides 12 over the area, and a gap of 8
  const at: CSSProperties | undefined = q ? { left: px(Math.max(16, q.x)), right: "auto", top: px(q.y - TAB), transform: "translateY(-100%)", maxWidth: px(Math.max(360, q.w)) } : undefined;
  const here = g ? g.length : asksInRegion(r!.id).length, out = above() - here, named = !!r && !labelShown(r.id), ppl = Math.max(0, needsCountKept() - above());
  return (
    <div className="pl-over pl-middle" style={at}>
      <div className="pl-mhead" data-front data-m1={named ? "what" : undefined} data-part={r?.name}>
        {named ? <div className="pl-mt"><span className={`pl-dot ${tint(r!.id)}`} /><h1 className="pl-h1">{r!.name}</h1></div> : null}
        <p className={`pl-msay${named ? "" : " pl-lead"}`} data-m1="needs">
          {g ? <Gather asks={g} /> : here ? gatherWords(here) : "Nothing here needs you"}
          {out || ppl ? <>; <a role="link" data-act="needs">{[out ? `${out} more ask${out === 1 ? "" : "s"} outside` : "", ppl ? `${ppl} from people` : ""].filter(Boolean).join(", and ")}</a>.</> : "."}
        </p>
        {r ? <Yours rid={r.id} band="middle" /> : null}
        <div className="pl-khint" data-m1="next"><span className="nx-kbd">⌘J</span> next ask · <span className="nx-kbd">⌘↑</span> the whole canvas · <span className="nx-kbd">←</span> <span className="nx-kbd">→</span> <span className="nx-kbd">↩</span> open a piece · <span className="nx-kbd">⌘+</span> <span className="nx-kbd">⌘−</span> zoom</div>
      </div>
    </div>
  );
}

/** the person and the hour, from the scenario's own label ("Dev · morning, 10 asks"); a real Sol has none */
function hour(): string {
  const w = (SCEN[SCN]?.label ?? "").split(" · ")[1] || "";
  return /11pm/.test(w) ? "11pm" : /2am/.test(w) ? "2am" : /morning/.test(w) ? "morning" : "";
}
/** the headline: the AI's own when it has a real one (slice 5, read first as shell.js did), else the most a session did */
function headline(): string {
  const a = agent.headline();
  if (a?.text) return a.text;
  const ss = sessions().slice().sort((a, b) => (b.files || 0) - (a.files || 0)), h = hour();
  const when = h === "morning" ? "overnight" : h === "2am" ? "tonight" : "since you last looked";
  if (ss.length) return `${titleOf(ss[0])} ${changedWords(ss[0].files)} in ${String(regionOf(ss[0].region)?.name || ss[0].region).replace(/ \(.*\)$/, "")} ${when}.`;
  const ai = D.ais[0];
  return ai ? `${ai.name} kept your ${D.regions.length} places in order.` : "Quiet. Nothing moved.";
}
/** today's page until the diary draws it (shell.js summary): the coming-back summary. At Middle it steps aside by itself
 *  once the diary slot draws (plane.css); at Far the shell mounts the diary over it (docs/port/requests/plane.md) */
/** today's page in the plane's frame: it hears the store itself, so a pan (the frame moves) does not draw it (#1615 S32) */
const Frame = memo(function Frame({ band }: { band: "far" | "middle" }) {
  // no At work folder beside the Diary: the canvas holds only the person's folders; what runs is the sidebar's Working
  // now, whose heading opens At work (BR1 conform #32, Q5)
  return <><div className="pl-dy-slot"><Slot name="diary" band={band} part="frame" /></div><Summary /></>;
});
function Summary() {
  useNext(() => 0);   // every change of the data, not the camera's (#1615 S32)
  const o = open(), h = hour(), first = o[0], n = above(), fx = firstWords();   // round 6 · F1: the one count
  const movedN = D.regions.filter((r) => piecesIn(r.id).some((p) => p.kind === "session") || asksInRegion(r.id).length).length;
  const tot = D.regions.reduce((s, r) => s + costOf(r.id), 0);
  // the length of the away is the engine's last-present time (#1879 step 3); the fixture says 8 hours as it always did
  const gone = MODE === "live" ? awayWords(K().away) : h === "morning" ? "8 hours" : "";
  const span = gone ? `While you were away · ${gone} · ${movedN} place${movedN === 1 ? "" : "s"} moved` : `Since you last looked${h ? " · " + h : ""} · ${movedN} place${movedN === 1 ? "" : "s"} moved`;
  const firstAt = first ? regionOf(D.pieces[first.piece]?.region)?.name ?? "" : "";
  return (
    <div className="pl-sum">
      <div className="pl-shead" data-front>
        <div className="pl-swho"><span className="nx-aura" />{span}</div>
        <h1 className="pl-headline" data-m1="what">{headline()}</h1>
        <Slot name="agent" part="proof" />
        {n ? <div className="pl-askline" role="link" tabIndex={0} data-m1="needs" data-act="needs"><span className="pl-n">{needsCount()}</span><span><b>{needWords(n)}.</b> The first {fx ?? `is in ${firstAt}`}. {tot ? `· about ${money(tot)} tonight` : ""}</span></div>
          : <div className="pl-askline pl-none" data-m1="needs"><span className="pl-n">0</span><span><b>Nothing needs you now.</b> {tot ? `· about ${money(tot)} tonight` : ""}</span></div>}
        <div className="pl-khint"><span className="nx-kbd">←</span> <span className="nx-kbd">→</span> choose · <span className="nx-kbd">↩</span> open · <span className="nx-kbd">⌘+</span> <span className="nx-kbd">⌘−</span> or pinch to zoom · drag to pan</div>
      </div>
      <Slot name="agent" part="told" />
      <section className="pl-first" data-front data-m1="next" data-part="Needs you first">
        <div className="pl-ph"><span className="nx-aura" /><h2 className="pl-pn">{o.length ? "Needs you first" : "Nothing needs you"}</h2>{o.length ? <span className="nx-kbd">⌘J</span> : null}</div>
        {o.slice(0, 3).map((a) => <AskRow key={a.id} a={a} />)}
        {o.length > 3 ? <button className="pl-btn" data-act="needs">{o.length - 3} more waiting on you</button> : o.length ? null : <p className="pl-quiet">Your AIs keep working; anything new lands here first.</p>}
      </section>
    </div>
  );
}

/** a life folder's board at Middle (shell.js boardsOf): the life slot on the folder's life rows, at plane size */
function boardsOf(w: number, h: number) {
  const out: { r: Region; bare: boolean; ids: Set<string>; q: Rect }[] = [];
  if (S.dist !== "middle" || !D.zones || !D.pos) return out;
  for (const r of D.regions) {
    const k = L.kindOf(r.id), R = D.pos[r.id];
    // a folder inside a folder is drawn at a scale the board does not follow: its stickies draw as its pieces (BR1)
    if ((k !== "life" && k !== "both") || !R || (R.s ?? 1) !== 1 || !near(L.rectOn(R), w, h)) continue;
    const st = L.onPlane(r.id).filter((p) => L.lifeThing(p) && D.pos![p.id]);
    if (!st.length && k === "both") continue;
    const y = L.boardTop(r.id), rc = L.rectOn(R);
    const seen = Math.min(Math.max(0, Math.min(rc.x + rc.w, w) - Math.max(rc.x, 0)) / Math.min(rc.w, w), Math.max(0, Math.min(rc.y + rc.h, h) - Math.max(rc.y, 0)) / Math.min(rc.h, h));
    out.push({ r, bare: seen < 0.6, ids: new Set(st.map((p) => p.id)), q: { x: R.x + L.PAD, y, w: R.w - 2 * L.PAD, h: Math.max(L.PIECE_H, R.y + R.h - L.PAD - y) } });   // a folder mostly off screen shows its area only
  }
  return out;
}

/** the canvas while it opens (#1761, BR1 lane G): one quiet line where the folders will be, never an empty plane that reads
 *  as broken; it goes by itself when the engine's sessions are heard (place.ts canvasOpening) */
function Opening() {
  return <div className="pl-opening" role="status" aria-live="polite"><span className="pl-opening-dot" aria-hidden="true" />Opening your canvas…</div>;
}

export default function Plane(_p: SlotProps) {
  useNext((_, s) => [s.cam, lineTick]);   // every change, a pan or a zoom (#1615 S32), and the line's height (lineMoved): the page's height reads it even when the camera stays (slice R8; the join)
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; rid?: string; id?: string; moved: boolean } | null>(null);
  const swallow = useRef(false);

  // what was made without a place lands (#6), marked new: pressed, never done by the view itself
  useLayoutEffect(() => { if (L.unplaced()) M.land(); });
  // after each draw: the line came or went (the camera refits), the cards give up rows, the chips find room
  useLayoutEffect(() => {
    const pl = ref.current;
    if (!pl) return;
    if (L.lineFit()) { render(); return; }
    if (S.dist === "far") fitCards(pl);
    frameFoot(pl);
    const edges = placeEdgeChips(pl);   // the side chips read before the Diary's chip is placed, placed after: one layout (#1615 S32)
    placeChip(pl);
    edges();
  });
  // the ask line draws late (its slot loads lazily): when its height changes, the camera the rule put there fits again
  // (the join, #1615: count 23 "+line")
  useEffect(() => {
    const l = document.getElementById("line");
    if (!l || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { lineTick++; L.lineFit(); render(); });   // the page's height reads the line too, even when the camera stays (slice R8: the kept width)
    ro.observe(l);
    return () => ro.disconnect();
  }, []);
  // the join (#1615): the line drawn in this same commit is fitted before the paint, not a frame later by the observer, so
  // today's page never shows under it for a frame (count 23 "+line"; S32's draw on change and R8's kept width together)
  useLayoutEffect(() => { planesOn++; return () => { planesOn--; }; }, []);   // lineMoved fits only a plane that is there
  useLayoutEffect(() => { lineMoved(); });
  // the window's size: the camera the rule put there follows it
  useEffect(() => {
    const f = () => { if (L.follow()) render(); };
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  // the wheel: ⌘ or ctrl zooms about the pointer, else it pans (today's page scrolls on its own when it overflows)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const inOver = (e.target as Element).closest?.(".pl-over,.pl-diary") as HTMLElement | null;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); const b = el.getBoundingClientRect(); M.zoom(Math.exp(-e.deltaY * 0.01), e.clientX - b.left, e.clientY - b.top); return; }
      if (inOver && inOver.scrollHeight > inOver.clientHeight + 2) return;
      e.preventDefault(); M.pan(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const band = S.dist === "middle" ? "middle" : "far";
  if (!D.zones || !D.pos || !(S.dist === "far" || S.dist === "middle")) { drawnLine = -1; return <div className="pl-wrap"><div className="pl-plane" id="pl" ref={ref} />{canvasOpening() ? <Opening /> : null}</div>; }
  const { w, h } = L.viewSize(), z = S.cam.z, Z = D.zones;
  const vis = (q: Rect) => { const r = L.rectOn(q); return near(r, w, h) ? r : null; };

  // the plane's grain: a dot every 80 units (doubled until it is at least 18px apart), moving with the camera
  let g = 80 * z;
  while (g < 18) g *= 2;
  const o = L.toScreen(0, 0);
  const grain = { backgroundSize: `${px(g)}px ${px(g)}px`, backgroundPosition: `${px(o.x % g)}px ${px(o.y % g)}px` };

  const items: ReactElement[] = [];
  let gath: Ask[] | null = null;   // the calm screen (BR1 item 3): the asks on screen, gathered past the cap (Gather.tsx)
  const boards = boardsOf(w, h), onBoard = new Set(boards.flatMap((b) => [...b.ids]));
  if (band === "far") {
    const whole = cullFar(items, vis);   // S32: at most 12 places whole at Far, the rest in count lines (plane/cull.ts)
    const g = groupFar(items, whole, vis);   // the infinite canvas: each card held at its size, the ones that would overlap one group
    D.regions.forEach((r, i) => { const q = g.at(r.id); if (q && !parentOf(r.id) && !L.isOff(r.id) && whole(r.id) && g.alone(r.id) && vis(q)) items.push(<RegionCard key={r.id} r={r} q={q} z={z} front={L.inView(r.id)} sel={i === S.sel % D.regions.length} v={dataVer()} />); });
    // what the AI made unasked sits under today's page: its one line, at its place
    if (!D.pos[L.DIARY]?.folded && !L.isOff(L.DIARY)) for (const p of L.diaryPieces()) if (vis(D.pos[p.id])) items.push(<PieceOn key={p.id} p={p} full={false} sel={false} far />);
    items.push(...holderItems(z, true, vis));   // the holders, held like a folder's card
    const dm = L.dayMore();   // My day's "+N" at the end of the tabs' row (narrow.html, BR1 row 29)
    if (dm && vis(dm)) items.push(<DayMore key="day-more" m={dm} style={flat(dm.x, dm.y, dm.w, undefined, z)} />);
  } else {
    // a folder inside a folder draws after the folders holding it, so its card is over their ground (BR1 item 5: pressed and dragged)
    for (const r of D.regions.map((r, i) => ({ r, i, d: ancestors(r.id).length })).sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.r)) {
      const q = D.pos[r.id], rect = q && !L.isOff(r.id) && vis(q);
      if (!rect) continue;
      const here = r.id === S.region, up = parentOf(r.id);
      // a folder inside a folder (BR1): drawn while its folder draws whole and nothing above it is folded; a card in its
      // cell until its own pieces are wide enough to draw whole, then an area like any folder
      if (up && (L.tucked(r.id) || !L.openAt(up))) continue;
      // its raise in the room its cell leaves above the next folder or piece in its folder (raise.ts roomUnder)
      if (up && !L.openAt(r.id)) {
        items.push(<RegionCard key={"a:" + r.id} r={r} q={q} z={z} front={L.inView(r.id)} sel={false} v={dataVer()} />);
        continue;
      }
      if (L.folded(r.id)) { items.push(<FolderTab key={"a:" + r.id} r={r} cls={`pl-card ${tint(r.id)}`} front={here} style={flat(q.x, q.y, q.w, undefined, z)} w={q.w * z} />); continue; }
      items.push(<Area key={"a:" + r.id} r={r} q={q} z={z} asks={asksInRegion(r.id).length} here={here} named={here && labelShown(r.id)} v={dataVer()} />);
    }
    items.push(...holderItems(z, false, vis));
    const ps = L.placedPieces(), mine = ps.filter((p) => !onBoard.has(p.id) && L.drawsWhole(p.region));
    const full = new Set(L.faceOrder(mine, rankOf)), shown = piecesShown().map((s) => s.id), sel = shown[S.sel % Math.max(shown.length, 1)];
    for (const p of mine) if (vis(D.pos[p.id])) items.push(<PieceOn key={p.id} p={p} full={full.has(p.id)} sel={p.id === sel} />);
    gath = gathers(gatherOf(mine.filter((p) => full.has(p.id) && vis(D.pos![p.id]))));
    // the boards: the life slot draws; while it draws nothing its things are the plane's own pieces, one line each
    for (const b of boards) {
      if (b.bare || L.folded(b.r.id) || L.isOff(b.r.id)) continue;
      items.push(<div key={"l:" + b.r.id} className={`pl-life${b.r.id === S.region ? "" : " pl-nb"}`} data-life={b.r.id} data-in={b.r.id} style={{ left: b.q.x, top: b.q.y, width: b.q.w, height: b.q.h, ...L.textFloor(z) }}>
        <Board rid={b.r.id} v={dataVer()} /></div>);
      items.push(<div key={"lb:" + b.r.id} className="pl-back">{[...b.ids].filter((id) => vis(D.pos![id])).map((id) => <PieceOn key={id} p={D.pieces[id]} full={false} sel={id === sel} />)}</div>);
    }
  }

  // a block put beside its session: a thin line from it to the session
  const joins: ReactElement[] = [];
  if (band === "middle") for (const p of L.joinedPieces()) {
    const j = p.joined as string | undefined;
    if (!j || !D.pos[j] || !D.pos[p.id]) continue;
    const a = L.rectOn(D.pos[p.id]), b = L.rectOn(D.pos[j]);
    joins.push(<line key={p.id} x1={px(a.x + a.w / 2)} y1={px(a.y + a.h / 2)} x2={px(b.x + b.w / 2)} y2={px(b.y + b.h / 2)} />);
  }

  // today's page: at its place; at Far it ends above the line and the pill, and scrolls
  const lineB = band === "far" ? L.safe("far").b : drawnLine;
  drawnLine = lineB;   // the line's height this draw read (lineMoved compares the line now with it)
  const dq = D.pos?.[L.DIARY], dOff = L.isOff(L.DIARY), dFold = !!dq?.folded && !dOff;   // BR1: the Diary is a piece (Pieces.tsx)
  const pr = L.rectOn(Z.page), shown = !dOff && L.pageShown(pr, w, h), hh = band === "far" ? Math.min(pr.h, Math.max(L.PAGE_MIN, h - lineB - pr.y)) : pr.h;
  // in a folder (Middle) the page is a neighbour: drawn at its content's width against its right edge, the side next to the
  // folders; the whole plane's width would leave its words off screen to the left and show a blank sheet beside the folder
  const fr = band === "middle" && pr.w > PAGE_MID_W ? { ...pr, x: pr.x + pr.w - PAGE_MID_W, w: PAGE_MID_W } : pr;
  const n = above();
  // the edge chips: today's page off screen; at Far, what lies past a side, by name (BR1: folders, no zones)
  const ang = Math.atan2(pr.y + pr.h / 2 - h / 2, pr.x + pr.w / 2 - w / 2);
  const edgeWords = (s: L.Side) => {
    const p = L.past(s), n = p.folders.length, ws = [p.diary && shown ? "Diary" : "", n === 1 ? String(regionOf(p.folders[0])?.name ?? "1 folder") : n ? `${n} folders` : ""].filter(Boolean);
    return s === "left" ? ws.reverse().join(" · ") : ws.join(" · ");   // nearest first
  };

  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest(".pl-over,.pl-diary,.pl-life,button,a,input,[data-act],.pl-rows,.pl-chip")) return;
    const fo = t.closest(".pl-lab,.pl-card") as HTMLElement | null, rid = fo ? (fo.dataset.region || (fo.closest(".pl-area") as HTMLElement | null)?.dataset.area) : undefined;
    const pc = !rid ? (t.closest(".pl-piece,.pl-fold") as HTMLElement | null) : null;
    drag.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, rid, id: pc?.dataset.piece, moved: false };
    const mv = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.moved = true;
      if (d.rid || (d.id && S.dist === "middle")) { preview(d.rid ?? d.id!, !!d.rid, ev.clientX - d.sx, ev.clientY - d.sy); talkOver(overTalk(ev)); if (d.rid) planeFolderOver(d.rid, ev.clientX, ev.clientY); else planeOver(d.id!, ev.clientX, ev.clientY); return; }
      d.x = ev.clientX; d.y = ev.clientY;
      M.pan(dx, dy);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      talkOver(false);
      const d = drag.current;
      drag.current = null;
      if (!d || !d.moved) return;
      swallow.current = true; setTimeout(() => { swallow.current = false; });
      const id = d.rid ?? (S.dist === "middle" ? d.id : undefined);
      if (!id || !D.pos?.[id]) return;
      preview(id, !!d.rid, 0, 0);
      // BR1 tabs (#1615): a piece dropped on the tab row is taken out to a tab, in front; its place stays as it was
      if (!d.rid && document.elementFromPoint(ev.clientX, ev.clientY)?.closest("#tabs")) { M.tabOpen(id, true); return; }
      // BR1 item 7 (#1615): a piece or a folder dropped on the bar rides with the next words as a chip; its place stays
      if (overTalk(ev)) { talkOver(false); chipOn(id); return; }
      if (!d.rid && planeDrop(id)) return;   // BR1 the safe drops (notes/drop.ts): Esc sends it back; an armed folder takes it
      // BR1 item 5: a folder let go on a folder it can go in (armed) goes in it; let go outside the folder it is in, it comes
      // out to the canvas and takes its place there; Esc sends it back
      if (d.rid) {
        const into = planeFolderDrop();
        if (into === "esc") return;
        if (into) { M.nest(id, into); return; }
        const p = parentOf(id), pe = p ? document.querySelector(`#pl .pl-card[data-region="${CSS.escape(p)}"], #pl .pl-area[data-area="${CSS.escape(p)}"]`) : null, b = pe?.getBoundingClientRect();
        if (b && b.width && (ev.clientX < b.left || ev.clientX > b.right || ev.clientY < b.top || ev.clientY > b.bottom)) { M.nest(id, null); return; }
      }
      const q = D.pos[id];
      M.place(id, q.x + (ev.clientX - d.sx) / S.cam.z, q.y + (ev.clientY - d.sy) / S.cam.z);
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const click = (e: RMouseEvent) => {
    if (swallow.current) { e.stopPropagation(); e.preventDefault(); return; }
    const t = e.target as Element;
    if (t.closest("button,a,details,summary,[data-act],input")) return;
    // BR1: a folded piece's press unfolds it where it is (the same press for a folder's tab and a session's chip)
    const fd = t.closest("[data-folded].pl-card, [data-folded].pl-schip") as HTMLElement | null;
    if (fd) { const id = fd.dataset.region || fd.dataset.piece; if (id) { M.fold(id, false); return; } }
    const pc = t.closest(".pl-piece,.pl-fold") as HTMLElement | null;
    if (pc?.dataset.piece) {
      const id = pc.dataset.piece;
      M.touch(id);
      // BR1 tabs (#1615): ⌘-click takes it out to a tab behind, as a browser does; a kind kept "As a tab" opens as one
      if (e.metaKey) { M.tabOpen(id, false); return; }
      if (opensAs(D.pieces[id]) === "tab") { M.tabOpen(id, true); return; }
      M.dive(id, false); return;
    }
    const rc = t.closest(".pl-card") as HTMLElement | null;
    // BR1 C (#1615, frame.html part 5): a folder's press opens it, what its sessions know and its shelves; a folded one's
    // tab still unfolds first (above)
    if (rc?.dataset.region) { if (!M.folder_open(rc.dataset.region).ok) M.dive(rc.dataset.region, false); return; }
    const ar = t.closest(".pl-area") as HTMLElement | null;
    // H3 (BR1 #1615): at Middle a folder's press opens it, as a card's does at Far: its name, or any folder but the one the
    // camera is in (a folder inside it, a neighbour). Before, it started a session there and the camera went to it, so the
    // path lost the folder it sits in and the one around slid under the sidebar. The ground of the folder you are in still
    // starts a session there
    if (ar?.dataset.area && (ar.dataset.area !== S.region || t.closest(".pl-lab")) && M.folder_open(ar.dataset.area).ok) return;
    if (ar?.dataset.area && S.dist === "middle" && M.start) M.start({ region: ar.dataset.area });
  };

  return (
    <div className="pl-wrap">
      {canvasOpening() ? <Opening /> : null}
      <Lit />
      <div className={`pl-plane pl-${band}${gath ? " pl-gathered" : ""}`} id="pl" ref={ref} style={grain} onPointerDown={down} onClickCapture={click}>
        {joins.length ? <svg className="pl-joins" width={w} height={h}>{joins}</svg> : null}
        <div className="pl-cam" style={{ transform: `translate(${w / 2 - S.cam.x * z}px, ${h / 2 - S.cam.y * z}px) scale(${z})` }}>{items}</div>
        {!shown && band === "far" ? (   /* scope (b): at Middle the head says the asks; no loose chip says them again */
          <button className="pl-chip" data-chip="diary" data-act="toDiary" title={n ? `${needWords(n, "chip")} · the Diary` : "The Diary"}>
            <svg viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${ang.toFixed(3)}rad)` }}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            <span data-long={n ? needWords(n, "chip") : "Diary"} data-short={n ? String(needsCountKept()) : "Diary"}>{n ? needWords(n, "chip") : "Diary"}</span>
          </button>
        ) : null}
        {band === "far" ? (["left", "right"] as const).map((s) => {
          const ws = edgeWords(s);
          if (!ws) return null;
          return <button key={s} className="pl-chip pl-edge" data-side={s} data-act={`toEdge:${s}`} title={"Pan to " + ws}>
            {s === "left" ? "← " + ws : ws + " →"}</button>;
        }) : null}
      </div>
      {/* a press on the page, not on a thing in it nor a selection, opens it up close (Marco's Q4, 14:18: a piece on the
          canvas that opens up close when pressed; near/index.tsx CanvasDiary) */}
      <section className="pl-diary" id="pl-dy" data-diary aria-label="Diary" hidden={!shown || dFold}
        style={shown && !dFold ? { left: px(fr.x), top: px(fr.y), width: px(fr.w), height: px(hh) } : undefined}
        onClick={(e) => { if (!(e.target as Element).closest?.(DY_LIVE) && !String(getSelection?.() ?? "")) M.page("diary"); }}>
        {shown && !dFold ? <Frame band={band} /> : null}
      </section>
      {shown && !dFold ? <DiaryHandles fr={fr} hh={hh} /> : null}
      {dFold && near(pr, w, h) ? <Spine r={pr} max={Math.min(Math.max(280, w - pr.x - 16), L.spineRoom(pr))} /> : null}
      <PieceMenu />
      <HolderClose />
      {band === "middle" ? <MidHead g={gath} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- after the draw: measured, on the DOM only (never D)

/** a drag shown before it lands: the folder (its area and its pieces) or the piece follows the pointer */
function preview(id: string, folder: boolean, dx: number, dy: number) {
  const els = folder ? document.querySelectorAll<HTMLElement>(`#pl [data-in="${CSS.escape(id)}"], #pl .pl-card[data-region="${CSS.escape(id)}"]`) : document.querySelectorAll<HTMLElement>(`#pl [data-piece="${CSS.escape(id)}"]`);
  const z = S.cam.z;   // under the camera: in the plane's units (#1633)
  els.forEach((el) => { el.style.translate = dx || dy ? `${dx / z}px ${dy / z}px` : ""; });
  document.body.classList.toggle("pl-dragging", !!(dx || dy));
}
/** the pointer over the bar while dragging (BR1 item 7): it takes the piece as a chip, and says so (cv/wire/canvas.ts) */
const overTalk = (ev: PointerEvent) => overBar(ev.clientX, ev.clientY);
const talkOver = barOver;
/** a card is as tall as its folder at Far: its front gives up status lines from the foot up; a line is never shown half,
 *  and the name and a lead's line (count 30) stay (BR1, the folder: Folder.tsx) */
function fitCards(pl: HTMLElement) {
  // #1615 S32: the same steps for every card, each step for all cards at once (one layout a step, not one a card; the cards
  // stand apart, so none moves another); a card whose look and data are as at its last fit is not fitted again while its
  // size is the same (a pan), or (#1633) while it only grew and nothing in it was cut; a folded tab has no front and is
  // never stamped (plane/fit.ts)
  const cs = toFit<HTMLElement, HTMLElement>([...pl.querySelectorAll<HTMLElement>(".pl-card")], dataVer());
  if (!cs.length) return;
  for (const { f } of cs) for (const k of [...f.children] as HTMLElement[]) { k.hidden = false; k.style.display = ""; }
  const ends = cs.map(({ f }) => f.clientHeight - parseFloat(getComputedStyle(f).paddingBottom || "0") + 1);
  const left = cs.map(({ c, f }, i) => ({ c, end: ends[i], ks: ([...f.children] as HTMLElement[]).filter((k) => k.matches(".fo-sig")) }))
    .filter(({ ks, end }) => ks.some((k) => k.offsetTop + k.offsetHeight > end));
  for (let i = 1; left.some(({ ks }) => ks.length >= i); i++) {
    const hide = left.map(({ ks, end }) => { const k = ks[ks.length - i]; return k && (k.hidden || k.offsetTop + k.offsetHeight > end) ? k : null; });
    hide.forEach((k, j) => { if (k) { k.hidden = true; k.style.display = "none"; left[j].c.dataset.cut = "1"; } });
  }
}
/** the plane's foot: how far up from the view's bottom the talk pill reaches, with 8px of air. The plane fades out above it
 *  (plane.css), and a chip stays above the fade. Written only when it changes */
const FOOT_FADE = 20;
function frameFoot(pl: HTMLElement): number {
  // the bar (BR1, #1615) floats above the pill: when it is drawn, the frame's foot is its top
  const bar = document.getElementById("bar"), t = bar && getComputedStyle(bar).display !== "none" ? bar : document.getElementById("talk"), v = document.getElementById("view");
  const tb = t && getComputedStyle(t).display !== "none" ? t.getBoundingClientRect() : null, vb = v?.getBoundingClientRect();
  const foot = vb ? cutNone(pl, vb, tb && tb.height ? Math.max(0, Math.round(vb.bottom - tb.top + 8)) : 0) : 0, val = foot ? foot + "px" : "";
  if (pl.style.getPropertyValue("--pl-foot") !== val) { if (val) pl.style.setProperty("--pl-foot", val); else pl.style.removeProperty("--pl-foot"); }
  underFoot(pl, vb && foot ? vb.bottom - foot : Infinity);
  return foot;
}
/** 2b (BR1, #1615): away from Far, the fade never runs through a card. A folder's card or a piece that the fade would cut
 *  (its line half gone under the bar: "Quiet · two sessions" on sol's cards) is drawn whole: when it ends above the bar
 *  the fade drops to just below it; when it runs under the bar the fade lifts to just above it, wholly under then and
 *  reached by a pan. One taller than the room above the foot keeps the foot where it was; Far keeps rule (d), its columns
 *  running on under the bar */
function cutNone(pl: HTMLElement, vb: DOMRect, foot: number): number {
  if (!foot || S.dist === "far") return foot;
  const line = vb.bottom - foot - FOOT_FADE, bar = vb.bottom - foot + 8;
  let top = Infinity, low = 0;
  for (const c of pl.querySelectorAll<HTMLElement>(".pl-card[data-region], .pl-piece[data-piece], .pl-fold[data-piece]")) {
    const r = c.getBoundingClientRect();
    if (!(r.top < line && r.bottom > line && r.top > vb.top)) continue;
    if (r.bottom <= bar) low = Math.max(low, r.bottom);
    else if (r.height < line - vb.top) top = Math.min(top, r.top);
  }
  if (top !== Infinity) return Math.max(foot, Math.round(vb.bottom - top + 4));
  return low ? Math.min(foot, Math.round(vb.bottom - low - FOOT_FADE)) : foot;
}
/** at Far a folder whose card stands wholly below the foot is under the fade and the bar, where it can be neither seen nor
 *  pressed: it is not shown and takes no Tab (plane.css [data-under]) until a pan lifts it into view. Read off the cards as
 *  drawn (a card is not always where its place says once the row above it has grown), every draw and every new foot (the
 *  calm screen, BR1 item 3) */
function underFoot(pl: HTMLElement, line: number) {
  const cs = [...pl.querySelectorAll<HTMLElement>(".pl-card[data-region]")];
  cs.forEach((c) => c.removeAttribute("data-under"));
  if (S.dist !== "far") return;
  cs.filter((c) => c.getBoundingClientRect().top >= line).forEach((c) => c.setAttribute("data-under", ""));
}
/** the edge chip (P14): at the edge towards today's page, clear of the head, the ask line and the talk; on bare plane */
function placeChip(pl: HTMLElement) {
  const el = pl.querySelector<HTMLElement>("[data-chip]");
  if (!el || !D.zones) return;
  const sp = el.querySelector("span")!;
  const words = (t: string) => { if (sp.textContent !== t) sp.textContent = t; };   // the same words are not written again (#1615 S32)
  words(sp.dataset.long ?? sp.textContent ?? "");
  const { w, h } = L.viewSize(), r = L.rectOn(D.zones.page), cx = w / 2, cy = h / 2, ang = Math.atan2(r.y + r.h / 2 - cy, r.x + r.w / 2 - cx);
  let cw = el.offsetWidth;
  const foot = frameFoot(pl), ch = el.offsetHeight, m = 14, box = { l: m, t: 56, r: w - m - cw, b: h - (foot ? foot + FOOT_FADE : m) - ch };   // above the pill and its fade
  const dx = Math.cos(ang), dy = Math.sin(ang), k = Math.min(dx ? ((dx > 0 ? box.r : box.l) - (cx - cw / 2)) / dx : 1e9, dy ? ((dy > 0 ? box.b : box.t) - (cy - ch / 2)) / dy : 1e9);
  let x = Math.max(box.l, Math.min(box.r, cx - cw / 2 + dx * k)), y = Math.max(box.t, Math.min(box.b, cy - ch / 2 + dy * k));
  const vb = document.getElementById("view")!.getBoundingClientRect(), hit: { l: number; t: number; r: number; b: number; low: boolean }[] = [];
  for (const s of [".pl-mhead", "#line", "#talk"]) {
    const e = document.querySelector<HTMLElement>(s);
    if (!e || getComputedStyle(e).display === "none") continue;
    const b = e.getBoundingClientRect();
    if (b.width && b.height) hit.push({ l: b.left - vb.left - 8, t: b.top - vb.top - 8, r: b.right - vb.left + 8, b: b.bottom - vb.top + 8, low: b.top - vb.top > h / 2 });
  }
  for (let i = 0; i < 3; i++) for (const o of hit) if (x < o.r && x + cw > o.l && y < o.b && y + ch > o.t) y = o.low ? Math.max(box.t, o.t - ch) : Math.min(box.b, o.b);
  const rel = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left - vb.left - 6, t: b.top - vb.top - 6, r: b.right - vb.left + 6, b: b.bottom - vb.top + 6 }; };
  const cards = [...pl.querySelectorAll(".pl-life,.pl-piece,.pl-fold,.pl-card,.pl-lab")].map(rel).concat(hit), ground = [...pl.querySelectorAll(".pl-area")].map(rel);
  const edgeSide = x <= box.l + 1 || x >= box.r - 1, y0 = y;
  let x0 = x;
  // a chip never lies on a card: along its edge, bare plane first, then a folder's ground; none, and it is not drawn (the
  // sidebar's Diary row is the way there)
  const find = (busy: typeof cards): [number, number] | null => {
    const clear = (a: number, b: number) => !busy.some((o) => a < o.r && a + cw > o.l && b < o.b && b + ch > o.t);
    if (clear(x0, y0)) return [x0, y0];
    for (let d = 12; d < 2000; d += 12) {
      const c = ([[x0, y0 - d], [x0, y0 + d]] as [number, number][]).map(([a, b]) => (edgeSide ? [a, b] : [a + (b - y0), y0]) as [number, number]).filter(([a, b]) => a >= box.l && a <= box.r && b >= box.t && b <= box.b);
      const f = c.find(([a, b]) => clear(a, b));
      if (f) return f;
      if (!c.length) break;
    }
    return null;
  };
  let spot = find(cards.concat(ground)) || find(cards);
  if (!spot && open().length) { const w0 = cw; words(sp.dataset.short ?? ""); cw = el.offsetWidth; if (x >= box.r - 1) x0 = x + w0 - cw; spot = find(cards.concat(ground)) || find(cards); }   // no bare plane on its edge: the arrow and the count only
  const vis = spot ? "" : "hidden";
  if (el.style.visibility !== vis) el.style.visibility = vis;
  if (spot) at(el, spot[0], spot[1]);
}
/** a chip goes to its spot; the same spot is not written again, so a pan that leaves it there costs no layout (#1615 S32) */
function at(el: HTMLElement, x: number, y: number) {
  const l = px(x) + "px", t = px(y) + "px";
  if (el.style.left !== l) el.style.left = l;
  if (el.style.top !== t) el.style.top = t;
}
/** the side chips at Far (BR1: what lies past a side, no zones): at the left and right edges, in the band above the
 *  canvas's first line (where the zones' labels stood). A count line ("34 quiet places") it meets sends it above that,
 *  and so does a card at the band's edge */
function placeEdgeChips(pl: HTMLElement): () => void {
  const { w } = L.viewSize();
  const y = Math.max(56, Math.round(L.toScreen(0, L.LABEL_H).y) - 28);
  const els = [...pl.querySelectorAll<HTMLElement>(".pl-edge")], ws = els.map((el) => el.offsetWidth), hs = els.map((el) => el.offsetHeight);   // all read, then all placed (#1615 S32)
  const pb = pl.getBoundingClientRect(), rel = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left - pb.left, t: b.top - pb.top, r: b.right - pb.left, b: b.bottom - pb.top }; };
  const counts = [...pl.querySelectorAll("[data-count]")].map(rel), cards = els.length ? [...pl.querySelectorAll(".pl-card,.pl-life,.pl-piece,.pl-fold")].map(rel) : [];
  return () => els.forEach((el, i) => {
    const x = el.dataset.side === "left" ? 14 : w - 14 - ws[i];
    let top = y;
    const meets = (o: { l: number; t: number; r: number; b: number }) => o.l < x + ws[i] + 4 && o.r > x - 4 && o.t < top + hs[i] && o.b > top;
    const c = counts.find(meets);
    if (c && c.t - hs[i] - 6 >= 8) top = c.t - hs[i] - 6;
    const k = cards.filter(meets);
    if (k.length && Math.min(...k.map((o) => o.t)) - hs[i] - 6 >= 8) top = Math.min(...k.map((o) => o.t)) - hs[i] - 6;
    at(el, x, top);
  });
}
