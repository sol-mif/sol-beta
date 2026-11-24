// Mark up, drawn (BR1, #1615; mine/look/br1/markup.html): while marking, the canvas stays live. A thin dark strip at its
// top says so, with the keys; the thing under the hand is outlined and named ("Menu prices · a page in Client sites")
// before the press; a press drops a numbered pin on the thing with a one-line note ready for typing, following the thing
// as the canvas moves. The marks ride in the chat bar as chips (MarkBar.tsx), where × takes one back. Esc ends marking and
// keeps the marks in the bar; after Send each pin stays on its thing until the session says its number is done, then
// fades. By keys (BR1 item 5, builder F): with the keys outside a field, Tab and the arrows ring the things in view one by
// one, Enter pins the ringed one and puts the cursor in its note. A press on anything that is not a thing goes on as
// usual, so the canvas can be moved to reach one. model.ts holds the marks and sends them.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615); the drawing's look: marcocyl04-ux's agent (builder M).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { room, type Rect } from "../layers.ts";
import { Pop } from "../Overlay.tsx";
import { TIP_WORDS, elOf, endMarking, kb, mu, nameLine, noteAt, press, hover, ringAt, selOf, shown, stepTo, subscribe, thingAt, thingsOnScreen, tipDue, versionNow, words, type Mark, type Out, type Thing, type Way } from "./model.ts";
import "./markup.css";

/** where a thing is drawn: on the canvas first (a folder also has its sidebar row), else wherever it is */
const boxOf = (sel: string): Rect | null => {
  const el = elOf(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};

export default function MarkUp() {
  useSyncExternalStore(subscribe, versionNow, versionNow);
  const [, tick] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // presses: a thing under the pointer is pinned before the canvas hears the press; anything else goes on as usual
  useEffect(() => {
    if (!mu.on) return;
    const move = (e: PointerEvent) => { if (e.movementX || e.movementY) ringAt(null); hover(thingAt(document.elementFromPoint(e.clientX, e.clientY))); };
    const down = (e: PointerEvent) => {
      const t = thingAt(e.target as Element);
      if (!t) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const i = press(t);
      if (i >= 0) setFocus(i);
    };
    const click = (e: MouseEvent) => { if (thingAt(e.target as Element)) { e.preventDefault(); e.stopImmediatePropagation(); } };
    const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { stop(e); endMarking(); return; }
      // the keys are the canvas's only outside the bar and the notes, and outside any field
      const a = document.activeElement as HTMLElement | null;
      if (a?.closest(".mu-ui, .mu-bar") || a?.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const way: Way | null = e.key === "Tab" ? (e.shiftKey ? "prev" : "next") : WAYS[e.key] ?? null;
      if (way) { stop(e); ringAt(stepTo(thingsOnScreen(), kb.at, way)?.t.thing ?? null); return; }
      if (e.key === "Enter" && kb.at) {
        const t = thingsOnScreen().find((x) => x.t.thing === kb.at)?.t;
        if (!t) return;
        stop(e);
        const i = press(t);
        if (i >= 0) setFocus(i);
      }
    };
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerdown", down, true);
    window.addEventListener("click", click, true); window.addEventListener("keydown", key, true);
    document.documentElement.toggleAttribute("data-marking", true);
    return () => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("click", click, true); window.removeEventListener("keydown", key, true);
      document.documentElement.removeAttribute("data-marking");
      ringAt(null);
    };
  }, [mu.on]);
  // the pins follow their things: measured again each frame while any is drawn
  const live = shown();
  useEffect(() => {
    if (!live) return;
    let f = 0;
    const loop = () => { tick((n) => (n + 1) % 1e6); f = requestAnimationFrame(loop); };
    f = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(f);
  }, [live]);
  useLayoutEffect(() => { if (focus !== null) { inputs.current[focus]?.focus(); setFocus(null); } }, [focus]);
  if (!live || mu.shooting) return null;

  const h = mu.hover, hov = mu.on && h && h.thing !== kb.at && !mu.marks.some((m) => m.thing === h.thing) ? boxOf(selOf(h)) : null;
  const at = mu.on && kb.at ? thingsOnScreen().find((x) => x.t.thing === kb.at) ?? null : null, atN = at ? mu.marks.findIndex((m) => m.thing === at.t.thing) : -1;
  const c = room();
  // a Tab out of a note goes on to the next thing, as on the canvas
  const tab = (back: boolean) => { (document.activeElement as HTMLElement | null)?.blur(); ringAt(stepTo(thingsOnScreen(), kb.at, back ? "prev" : "next")?.t.thing ?? null); };
  // each note hangs where it covers no other thing and no note before it, under the strip
  const notes: ({ x: number; y: number } | null)[] = [];
  if (mu.on) {
    const seen: Rect[] = thingsOnScreen(), inRoom = { x: c.x + 4, y: c.y + STRIP_H + 4, w: c.w - 8, h: c.h - STRIP_H - 8 };
    for (const m of mu.marks) {
      const b = boxOf(selOf(m)), p = b ? noteAt(b, NOTE, inRoom, seen, busy) : null;
      if (p) seen.push({ ...p, ...NOTE });
      notes.push(p);
    }
  }
  return <div className="mu-ui" data-face="next">
    {mu.on ? <>
      <div className="mu-edge" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} />
      <div className="mu-strip" role="status" style={{ left: c.x, top: c.y, width: c.w }}>
        <b>Marking</b><span className="mu-sw">· {mu.pinOn ? "press what the screenshot shows to pin it" : "point at a thing, press to pin it, type a few words"}</span>
        <span className="mu-keys"><kbd>Tab</kbd> next thing · <kbd>↵</kbd> pin · <kbd>Esc</kbd> done</span>
      </div>
      {/* the first time only: what Mark up is, a pop-up under the strip until a thing is pinned */}
      {tipDue() && !mu.marks.length ? <Pop className="mu-tip" role="note" anchor={() => ({ x: c.x + STRIP_IN, y: c.y, w: c.w - STRIP_IN, h: STRIP_H })} prefer="below" align="start">
        <i className="mu-n">◎</i>{TIP_WORDS}
      </Pop> : null}
    </> : null}
    {hov && h ? <Ring b={hov} t={h} /> : null}
    {at ? <Ring b={at} t={at.t} kb /> : null}
    <span className="nx-sr" aria-live="polite">{at ? (atN >= 0 ? `${nameLine(at.t)}, mark ${atN + 1}. Enter goes to its note.` : `${nameLine(at.t)}. Enter pins it.`) : ""}</span>
    {mu.out.map((o) => <Sent key={`o${o.n}${o.thing}`} o={o} />)}
    {mu.marks.map((m, i) => <Pin key={m.thing} m={m} i={i} note={notes[i] ?? null} tab={tab} reg={(el) => { inputs.current[i] = el; }} />)}
  </div>;
}

const WAYS: Record<string, Way> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** the outline the hand (or the keys) puts on a thing before the press, with the thing's name and kind */
function Ring({ b, t, kb: byKeys = false }: { b: Rect; t: Thing; kb?: boolean }) {
  return <div className={`mu-ring mu-hov${byKeys ? " mu-kb" : ""}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
    <span className="mu-nm">{nameLine(t)}</span>
  </div>;
}

/** a note's size (markup.css .mu-note: its width; a row of words, a row of its name) and the strip's height (--h-head) */
const NOTE = { w: 210, h: 48 }, STRIP_H = 34, STRIP_IN = 16;   // STRIP_IN: the strip's own inset (--s4), where its words start
/** the canvas's bare ground: a note may lie on it freely; anything else drawn there (a card that is no thing) is cover */
const GROUND = "#view,.pl-wrap,#pl,.pl-cam,.pl-joins,.pl-joins *,.pl-area,.mu-ui *";
/** how much of a spot is drawn on by what is no thing (a thing's own box is counted already): nine points looked at,
 *  each a ninth of its area */
const busy = (r: Rect) => {
  let n = 0;
  for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) { const el = document.elementFromPoint(r.x + r.w * fx, r.y + r.h * fy); if (el && !el.matches(GROUND) && !el.closest("[data-piece],[data-region]")) n++; }
  return (n / 9) * r.w * r.h;
};

/** where a pin sits on its thing: at its top right corner, kept inside the window */
const pinAt = (b: Rect) => ({ x: Math.min(window.innerWidth - 28, Math.max(4, b.x + b.w - 14)), y: Math.max(4, b.y - 10) });

/** one mark: its outline, its numbered pin, and while marking its note (the words, and what the thing is) */
function Pin({ m, i, note, tab, reg }: { m: Mark; i: number; note: { x: number; y: number } | null; tab: (back: boolean) => void; reg: (el: HTMLInputElement | null) => void }) {
  const b = boxOf(selOf(m));
  if (!b) return null;
  const p = pinAt(b);
  return <>
    <div className="mu-ring on" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
    {note ? <div className="mu-note" style={{ left: note.x, top: note.y }}>
      <input ref={reg} aria-label={`A few words on ${m.name} (mark ${i + 1})`} placeholder="a few words" value={m.words}
        onChange={(e) => words(i, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) (e.target as HTMLInputElement).blur(); else if (e.key === "Tab") { e.preventDefault(); tab(e.shiftKey); } }} />
      <small>{nameLine(m)}</small>
    </div> : null}
    {/* the pin after its note, so a note hung above the thing never hides the number */}
    <div className="mu-pin" style={{ left: p.x, top: p.y }} aria-hidden="true">{i + 1}</div>
  </>;
}

/** a mark sent: its pin stays on the thing until the session says its number is done, then fades */
function Sent({ o }: { o: Out }) {
  const b = boxOf(selOf(o));
  if (!b) return null;
  const p = pinAt(b);
  return <div className={`mu-pin mu-sent${o.done ? " done" : ""}`} style={{ left: p.x, top: p.y }} title={o.done ? `${o.name}: done` : `${o.name}: sent, waiting for its change`}>{o.done ? "✓" : o.n}</div>;
}
