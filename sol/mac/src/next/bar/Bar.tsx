// The bottom bar (#1615; Marco's decision 2026-11-21, his reference mine/look/br1/bar-folder.html): a small bar just above
// the talk pill, in all three bands, with fixed verbs: Where, zoom, Arrange, Add, Customize. A button never goes to a page:
// each opens one small card right above the bar with the canvas still showing; Esc or a press outside closes it, and the
// pressed button shows pressed. Every press is an existing move: Where's minimap flies with M.goto, its chips are M.map,
// M.toDiary and M.next; zoom is M.out and M.dive; Add drops a new thing into the folder at the middle of the view through
// the create paths there are (M.newFolder, M.start, M.make), and a kind with no path yet puts a ready sentence in the
// talk pill instead, never a dead tile. Customize (the brush, fitmode/button.ts, P's) opens no card: it turns Customize
// on and off over the canvas, drawn by FitInPlace (BR1, #1615, mine/look/br1/customize.html).
// Arrange lays the folders out again by rule in an order (plane/layout.ts arrange), face state for the session, undone
// from its own line. A new kind of thing becomes a tile in Add, never a new button here.
// Signed: marcocyl04-ux's agent, the port's BR1 bar (#1615).
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import { D, S, M, hooks, isReady, asksInRegion, piecesIn, render, useNext, viewSize, toPlane, type Piece } from "../cv/index.ts";
import * as L from "../plane/layout.ts";
import { needsCount } from "../people/queue.ts";
import { bindLine } from "./undo.ts";
import { barHere } from "./here.ts";   // where the bar is drawn, the shell's has-bar on the same test (BR1 conform 2)
import { FitInPlace } from "../fitmode/FitMode.tsx";   // BR1 people item 1 (#1615)
import { customizeButton } from "../fitmode/button.ts";   // Customize replaces Fit Sol (BR1, #1615)
import Add from "../add/Add.tsx";   // Add's card lives in add/ (BR1 item 3, builder F)
import { Overlay } from "../Overlay.tsx";   // BR1 root part 1: the cards are pop-ups
import { frame } from "../frame.tsx";   // and what a move by hand did is the frame's line
import "./bar.css";

type Card = "where" | "arrange" | "add";
/** how long the Undo line floats above the bar after a move by hand */
const LINE_MS = 8000;
const BANDS: Record<string, string> = { far: "All folders", middle: "One folder", near: "Up close" };
const tint = (rid: string) => `bar-t${Math.max(0, L.tintOf(rid))}`;
const failed = (p: Piece) => /failed/.test(String(p.state)) || (p.parts || []).some((x) => /failed/.test(String(x.state)));
/** a folder that needs the person: an ask in it, or a run in it that failed */
export const needsMe = (rid: string) => asksInRegion(rid).length > 0 || piecesIn(rid).some(failed);
/** the folder Add drops into: the one open, else the one at the middle of the view */
const here = (): string | null => (S.page === "folder" && S.folder ? String(S.folder) : null) || (S.dist !== "far" && S.region) || L.focusAt(S.cam) || D.regions[0]?.id || null;
/** the move-in's own screen (#mvi, movein/mount.ts) is up over the whole window */
const onMoveIn = () => { const m = globalThis.document?.getElementById("mvi"); return !!m && !m.hidden; };
const nameOf = (rid: string | null) => (rid && D.regions.find((r) => r.id === rid)?.name) || "";

/** the bar: drawn by the shell where barHere says (here.ts): the three bands, and over an opened folder (BR1 conform 2) */
export default function Bar() {
  const [card, setCard] = useState<Card | null>(null);
  const [did, setDid] = useState<{ words: string; undo: (() => void) | null } | null>(null);
  // the one Undo line: a move, fold or resize by hand says itself here (undo.ts); with Arrange's card closed the line
  // floats just above the bar for a while, then goes (Arrange's card still shows the last one)
  const [float, setFloat] = useState(0);
  useEffect(() => { bindLine((l) => { setDid(l ? { words: l.words, undo: l.undo } : null); setFloat(l ? l.at : 0); }); return () => bindLine(null); }, []);
  const bar = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null), byKey = useRef(false);
  const band = S.dist === "far" || S.dist === "middle" || S.dist === "near" ? S.dist : null;
  const shown = barHere(), folder = S.page === "folder";
  // the line is the canvas's (BR1 rapid, #1615): while Settings, a page or the move-in covers the canvas it waits, its
  // time not running, and comes back with the canvas; never over another screen ("7 folders are inside others now" lay
  // on Settings' Start screen row)
  const canvas = shown && !onMoveIn();
  useEffect(() => { if (!float || !canvas) return; const t = setTimeout(() => setFloat(0), LINE_MS); return () => clearTimeout(t); }, [float, canvas]);
  // with Arrange's card closed, the move says itself on the frame's line (frame.tsx), its Undo there
  useEffect(() => { frame.hold("arrange", canvas && float && did && card !== "arrange" ? { text: did.words, act: did.undo ? { label: "Undo", run: did.undo } : undefined } : null); }, [float, did, card, canvas]);
  useEffect(() => () => frame.hold("arrange", null), []);

  // one card at a time; Esc or a press outside the bar and the card closes it (the canvas never hears that Esc)
  useEffect(() => {
    if (!card) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      setCard(null);
      bar.current?.querySelector<HTMLElement>(`[data-bar="${card}"]`)?.focus();
    };
    const down = (e: PointerEvent) => { const t = e.target as Element | null; if (!t?.closest?.("#bar,#bar-card")) setCard(null); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", down, true); };
  }, [card]);
  // a card opened from the keys takes the focus, so Tab walks its choices
  useLayoutEffect(() => {
    if (card && byKey.current) box.current?.querySelector<HTMLElement>("button")?.focus();
    byKey.current = false;
  }, [card]);
  // the card closes when the place changes under it (a flight from the map, a zoom, a page)
  const where = `${S.dist}|${S.page ?? ""}|${S.calm ? 1 : 0}`, was = useRef(where);
  useEffect(() => { if (was.current !== where) { was.current = where; setCard(null); } }, [where]);
  if (!shown) return <FitInPlace />;   // a look or size kept for a place stays drawn with the bar away

  const press = (k: Card) => (e: RMouseEvent) => { e.stopPropagation(); byKey.current = e.detail === 0; setCard((c) => (c === k ? null : k)); };
  const btn = (k: Card, label: string, icon: ReactNode) => (
    <button type="button" className="bar-b" data-bar={k} aria-pressed={card === k} aria-haspopup="dialog" aria-expanded={card === k} onClick={press(k)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>{label}
    </button>
  );
  const close = () => setCard(null);
  const cu = customizeButton();
  return (
    <>
      <div className="bar" id="bar" role="toolbar" aria-label="The canvas: where, zoom, arrange, add, customize" ref={bar} onClick={(e) => e.stopPropagation()}>
        {btn("where", "Where", <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>)}
        <div className="bar-zoom" role="group" aria-label="Zoom">
          <button type="button" className="bar-z" data-bar-zoom="out" aria-label="Zoom out" title="Zoom out (⌘−)" disabled={band === "far" && !folder} onClick={() => M.out()}>−</button>
          <span className="bar-zl" data-bar-zoom-label aria-live="polite">{BANDS[band!]}</span>
          {/* over an opened folder, − closes it (M.out); + has nothing nearer to go to that the page would not hide */}
          <button type="button" className="bar-z" data-bar-zoom="in" aria-label="Zoom in" title="Zoom in (⌘+)" disabled={band === "near" || folder} onClick={() => M.dive()}>+</button>
        </div>
        {btn("arrange", "Arrange", <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></>)}
        {btn("add", "Add", <path d="M12 5v14M5 12h14" />)}
        <button type="button" className="bar-b" data-bar={cu.id} aria-pressed={cu.pressed} onClick={(e) => { e.stopPropagation(); setCard(null); cu.onPress(); }}>
          {/* on, it says how to leave: Done (a first-timer pressed around for the way out; BR1 item 3) */}
          <svg viewBox="0 0 24 24" aria-hidden="true">{cu.pressed ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : cu.icon.map((d) => <path key={d} d={d} />)}</svg>{cu.pressed ? "Done" : cu.label}
        </button>
      </div>
      {card ? (<Overlay>
        <div className={`bar-card bar-c-${card}`} id="bar-card" data-bar-card={card} role="dialog" aria-label={{ where: "Where to go", arrange: "Arrange", add: "Add to the canvas" }[card]} ref={box} onClick={(e) => e.stopPropagation()}>
          {card === "where" ? <Where close={close} /> : card === "arrange" ? <Arrange did={did} setDid={setDid} /> : <Add close={close} here={here} />}
        </div>
      </Overlay>) : null}
      <FitInPlace />
    </>
  );
}

// ---------------------------------------------------------------- Where: the canvas, small

const MAP_W = 340, MAP_H = 170, MAP_PAD = 8;
function Where({ close }: { close: () => void }) {
  const b = L.bounds(), k = Math.min((MAP_W - 2 * MAP_PAD) / b.w, (MAP_H - 2 * MAP_PAD - 14) / b.h);
  const ox = (MAP_W - b.w * k) / 2, oy = MAP_PAD + 14 + (MAP_H - 2 * MAP_PAD - 14 - b.h * k) / 2;
  const at = (q: { x: number; y: number; w: number; h: number }, min = 4) =>
    ({ left: +(ox + (q.x - b.x) * k).toFixed(1), top: +(oy + (q.y - b.y) * k).toFixed(1), width: Math.max(min, +(q.w * k).toFixed(1)), height: Math.max(min, +(q.h * k).toFixed(1)) });
  const Z = D.zones, n = needsCount();
  // the view on the plane (Far and Middle: the camera's; Near: the folder open)
  let vp: ReturnType<typeof at> | null = null;
  if (S.dist === "far" || S.dist === "middle") {
    const { w, h } = viewSize(), a = toPlane(0, 0), c = toPlane(w, h);
    const x0 = Math.max(b.x, a.x), y0 = Math.max(b.y, a.y), x1 = Math.min(b.x + b.w, c.x), y1 = Math.min(b.y + b.h, c.y);
    if (x1 > x0 && y1 > y0) vp = at({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 8);
  }
  const go = (f: () => unknown) => () => { close(); f(); };
  return (
    <>
      <h3>Where to go</h3>
      <p>The whole canvas, small. Press a folder to fly there. A dot is what needs you.</p>
      <div className="bar-mini" data-bar-map style={{ height: MAP_H }}>
        {Z ? <button type="button" className="bar-mp" data-map-page aria-label="Diary" title="Diary" style={at(Z.page)} onClick={go(() => M.toDiary())} /> : null}
        {D.regions.map((r) => {
          const q = D.pos?.[r.id];
          if (!q) return null;
          const a = asksInRegion(r.id).length > 0, f = piecesIn(r.id).some(failed);
          return <button key={r.id} type="button" className={`bar-mf ${tint(r.id)}${f ? " bad" : a ? " ask" : ""}${S.region === r.id && S.dist !== "far" ? " on" : ""}`} data-map-folder={r.id}
            aria-label={`${r.name}${f ? ", a run failed" : a ? ", asks you" : ""}`} title={r.name} style={at(q, 6)} onClick={go(() => M.goto(r.id))} />;
        })}
        {vp ? <span className="bar-vp" data-map-view style={vp} /> : null}
      </div>
      <div className="bar-chips">
        <button type="button" className="bar-chip" data-bar-go="map" onClick={go(() => M.map())}>Fit everything <span className="nx-kbd">⌘0</span></button>
        <button type="button" className="bar-chip" data-bar-go="diary" onClick={go(() => M.toDiary())}>Diary</button>
        <button type="button" className="bar-chip" data-bar-go="next" onClick={go(() => M.next())}>What needs me ({n}) <span className="nx-kbd">⌘J</span></button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Arrange: drawn choices, each undone from its line

type How = "tidy" | "needs";   // BR1 (#1615): no zones, so no By kind
const PICS: Record<How, [number, number, string][]> = {
  tidy: [[8, 8, "a1"], [28, 8, "a3"], [48, 8, "a2"], [8, 26, "a2"], [28, 26, "a1"]],
  needs: [[8, 8, "bad"], [8, 26, "asks"], [40, 8, "ink4"], [60, 8, "ink4"], [40, 26, "ink4"]],
};
function Arrange({ did, setDid }: { did: { words: string; undo: (() => void) | null } | null; setDid: (d: { words: string; undo: (() => void) | null } | null) => void }) {
  const loose = useNext((d) => ((d.notes as { notes?: { folder?: string; text: string }[] } | undefined)?.notes ?? []).filter((n) => !n.folder && n.text.trim()).length);
  const run = (how: How) => {
    const was = L.arrangeSnap(), cam = { c: S.cam, r: S.camRule, s: S.camSet };
    const seen = L.folderOrderOnPlane(), first = seen.filter(needsMe);
    const next = how === "tidy" ? seen : [...first, ...seen.filter((id) => !needsMe(id))];
    L.arrange(next);
    S.camSet = false; hooks.settleCam?.(); render();
    const words = how === "tidy" ? "You tidied the canvas: every folder back in line"
      : first.length ? `You put ${first.length === 1 ? `“${nameOf(first[0])}”` : `the ${first.length} folders that need you`} first` : "You put what needs you first; nothing does now";
    setDid({ words, undo: () => { L.unarrange(was); S.cam = cam.c; S.camRule = cam.r; S.camSet = cam.s; render(); setDid({ words: "Put back as it was", undo: null }); } });
  };
  const opt = (how: How, b: string, small: string) => (
    <button type="button" className="bar-opt" data-arrange={how} onClick={() => run(how)}>
      <span className="bar-pic" aria-hidden="true">{PICS[how].map(([x, y, c], i) => <i key={i} style={{ left: x, top: y, background: `var(--${c})` }} />)}</span>
      <b>{b}</b><small>{small}</small>
    </button>
  );
  return (
    <>
      <h3>Arrange</h3>
      <p>How the canvas sorts itself. You see it move, and you can undo it.</p>
      <div className="bar-arr">
        {opt("tidy", "Tidy", "line things up")}
        {opt("needs", "Needs me first", "by status")}
        {/* BR1 C (frame.html part 6): the loose notes, brought together; C's own line says it and holds its Undo */}
        <button type="button" className="bar-opt" data-arrange="gather" disabled={loose < 2} onClick={() => { if (M.notes_gather().ok) setDid({ words: `You gathered your ${loose} notes`, undo: () => { M.note_undo(); setDid({ words: "Put back as it was", undo: null }); } }); }}>
          <span className="bar-pic" aria-hidden="true">{[[30, 10, "ink4"], [36, 15, "ink4"], [42, 20, "ink3"]].map(([x, y, c], i) => <i key={i} style={{ left: x as number, top: y as number, background: `var(--${c})` }} />)}</span>
          <b>Gather notes</b><small>{loose ? `${loose} loose` : "none loose"}</small>
        </button>
      </div>
      {did ? <div className="bar-undo" data-arrange-line><span>{did.words}</span>{did.undo ? <button type="button" data-arrange-undo onClick={did.undo}>Undo</button> : null}</div> : null}
      {isReady("place") ? <div className="bar-note">Drag a folder anywhere, any time; the canvas keeps where you put it.</div> : null}
    </>
  );
}

