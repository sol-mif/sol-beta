// Customize (BR1 people, #1615; mine/look/br1/customize.html): "Fit Sol" becomes Customize, the brush in the bottom bar.
//   customizeButton()  the brush's props (button.ts): the bar (bar/Bar.tsx, builder E's) draws the button from them
//   Customize          on: everything changeable gets a faint dashed outline (fitmode.css html[data-cu]), the Diary too, and
//                      one line at the canvas's top says "Press anything to change it · or say it"; no card, no list
//   CuBar              a press opens a small bar beside the thing with only its choices, as pictures: a folder's colour
//                      swatches and S M L, a piece's or a session's size, the whole window's light or night and three
//                      "Aa"; Sol's tries for it (✦, dashed); Back or Keep. Every choice is tried live (FitInPlace draws
//                      it on the thing), nothing is kept until Keep
// Said words go the same way (cv/say/customize.ts → cuSay): the bar opens with the change already tried. Every press is
// a move (cv/moves/fitmode.ts cu*); a kept change is the person's fit there, through next.fit.try as fit mode's is.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { useEffect } from "react";
import { M, useNext } from "../cv/index.ts";
import { FMs, nowAt, tries, type FM } from "../cv/moves/fitmode.ts";
import { W } from "../cv/moves/settings.ts";
import { Overlay, Pop } from "../Overlay.tsx";
import { frame } from "../frame.tsx";
import { boxOf, room, type Rect } from "../layers.ts";
import { tintOf } from "../plane/layout.ts";
import { TINT, choicesOf, inPlace, takeName, type Row } from "./model.ts";

export const HINT = "Press anything to change it · or say it";
export { customizeButton } from "./button.ts";

/** drawn with FitInPlace, in every band: the outline, the line and the bar while Customize is on */
export function Customize() {
  useNext(() => 0);
  const f = FMs();
  usePress(f.cu);
  useEffect(() => { document.documentElement.toggleAttribute("data-cu", f.cu); }, [f.cu]);
  // its one line at the canvas's top, as customize.html draws it (BR1 conform 33, builder G; it sat on the frame's line
  // above the bar): a dark pill, "· or say it" quieter
  // a change kept: said on the frame with its Undo (the move's own flash says it without)
  const kept = f.kept?.token ?? null;
  useEffect(() => {
    const k = FMs().kept;
    if (k && FMs().cu) frame.say(`Kept: ${takeName(W(), k.knob, k.take)}, for ${k.where}`, { act: { label: "Undo", run: () => { M.fmUndo(); } } });
  }, [kept]);
  useEffect(() => () => { document.documentElement.removeAttribute("data-cu"); }, []);
  if (!f.cu) return null;
  if (f.bar) return <CuBar f={f} />;
  const v = room(), [press, say] = HINT.split(" · ");
  return <Overlay><div className="cu-hint" id="cu-hint" role="status" style={{ left: Math.round(v.x + v.w / 2), top: Math.round(v.y) }}>{press}<em> · {say}</em></div></Overlay>;
}

/** while Customize is on, a press anywhere but the bar, the frame's line and the talk pill is for Customize: it picks
 *  what was pressed, before the canvas or the bar hears it. Esc closes the bar, then Customize */
function usePress(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const own = (el: Element | null) => !!el?.closest?.("#bar,#bar-card,#cu-bar,[data-frame-line],.nx-talk");
    const down = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (e.button !== 0 || own(el)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      M.cuPress(el, { x: e.clientX, y: e.clientY });
      const swallow = (c: Event) => { c.preventDefault(); c.stopImmediatePropagation(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 400);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (FMs().bar) M.cuShut(); else M.cuOff();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  }, [on]);
}

const q = (sel: string | null) => (sel ? document.querySelector<HTMLElement>(sel.split(",").map((s) => `#view ${s}`).join(",")) ?? document.querySelector<HTMLElement>(sel) : null);
const SIZE: Record<string, string> = { s: "S", m: "M", l: "L" };
/** each picture's words, for a screen reader and a first glance: what pressing it does */
const SIZE_N: Record<string, string> = { s: "Smaller", m: "Normal size", l: "Larger" };
const LOOK: Record<string, string> = { paper: "Light", night: "Night" };

/** the small bar beside the thing: its choices as pictures, Sol's tries, Back or Keep */
function CuBar({ f }: { f: FM }) {
  const w = W(), t = f.trying, scope = f.target.reach[0].scope, ideas = tries(f), all = f.target.kind === "all";
  // the choice standing now; a folder no colour was kept for has the tint of its place in the list (plane/index.tsx)
  const on = (knob: string) => {
    const n = t && t.knob === knob ? t.take : nowAt(f, knob, scope);
    return knob === "colour" && !TINT[n] && f.target.id ? Object.keys(TINT)[Math.max(0, tintOf(f.target.id))] : n;
  };
  // the thing's own box; the whole window's bar sits where the press landed, or high in the middle when it was said
  const anchor = (): Rect | null => {
    const el = all ? null : q(f.target.sel);
    if (el) return boxOf(el);
    if (f.at) return { x: f.at.x, y: f.at.y, w: 1, h: 1 };
    const r = room(); return { x: r.x + r.w / 2, y: r.y + r.h / 4, w: 1, h: 1 };
  };
  const pick = (r: Row, take: string) => M.fmTry(r.knob, take);
  const choice = (r: Row, take: string) => {
    const pressed = on(r.knob) === take, key = `${r.knob}:${take}`, name = takeName(w, r.knob, take);
    if (r.draw === "swatch") return <button type="button" key={key} className="cu-sw" data-cu-take={key} aria-label={`Make this folder ${name.toLowerCase()}`} aria-pressed={pressed} style={{ background: TINT[take] }} onClick={() => pick(r, take)} />;
    if (r.draw === "thumb") return <button type="button" key={key} className="cu-th" data-cu-take={key} data-look={take} aria-label={LOOK[take] ?? name} aria-pressed={pressed} onClick={() => pick(r, take)}><i /></button>;
    if (r.draw === "aa") return <button type="button" key={key} className="cu-aa" data-cu-take={key} aria-label={`${SIZE_N[take] ?? name} text`} aria-pressed={pressed} style={{ fontSize: `calc(var(--t-head) * ${inPlace(w, "size", take).z ?? 1})` }} onClick={() => pick(r, take)}>Aa</button>;
    return <button type="button" key={key} className="cu-sz" data-cu-take={key} aria-label={SIZE_N[take] ?? name} aria-pressed={pressed} onClick={() => pick(r, take)}>{SIZE[take] ?? name}</button>;
  };
  const rows = choicesOf(f.target);
  return (
    <Pop id="cu-bar" className="cu-bar" role="dialog" aria-label={all ? "Change the whole window" : `Change ${f.target.name}`} data-cu-bar={f.target.kind} prefer={all ? "below" : "right"} anchor={anchor}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {all ? (<>
        <p className="cu-l">the whole window</p>
        <div className="cu-row">{rows.map((r) => r.takes.map((x) => choice(r, x)))}</div>
      </>) : rows.map((r) => (
        <div key={r.knob} role="group" aria-label={r.label}>
          <p className="cu-l">{f.target.kind === "folder" ? r.label : `${f.target.name} · ${r.label}`}</p>
          <div className="cu-row">{r.takes.map((x) => choice(r, x))}</div>
        </div>
      ))}
      {ideas.length ? (<>
        <p className="cu-l">sol’s tries</p>
        <div className="cu-row">
          {ideas.map((x, i) => (
            <button type="button" key={`${x.knob}:${x.take}`} className="cu-try" data-cu-try={`${x.knob}:${x.take}`} aria-pressed={t?.by === "try" && t.knob === x.knob && t.take === x.take}
              aria-label={x.knob === "look" && x.take === "back" ? "Try softer, dimmer colours" : x.knob === "look" ? `Try a ${x.n} look` : x.knob === "size" ? `Try ${x.n.replace(/^(\w+)/, "$1 text")}` : `Try ${x.n}`} title={x.reason ?? undefined} onClick={() => M.cuTry(i)}>✦ {x.n}</button>
          ))}
        </div>
      </>) : null}
      {f.miss || t?.why ? <p className="cu-miss" data-cu-miss>{f.miss ?? t?.why}</p> : null}
      <div className="cu-kb">
        <button type="button" className="cu-back" data-cu="back" disabled={!t} onClick={() => M.fmBack()}>Back</button>
        <button type="button" className="cu-keep" data-cu="keep" disabled={!t?.token || t.keeping} onClick={() => M.fmKeep()}>{t?.keeping ? "Keeping…" : "Keep"}</button>
      </div>
    </Pop>
  );
}
