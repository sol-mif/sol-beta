// A page (#696): an html body the agent wrote, in a frame of its own (an iframe: its styles and scripts never reach the
// face). `src` a url instead; `note` when it could not be read. While a block moves the frame lets the pointer through.
// Point and say (#698): the frame is sandboxed, so its parts tell the stage themselves. A few lines put in its page
// light the part the pointer rests on (an element with data-part, else the line under it and the heading of its box:
// "Thu › 14:00") and post its words to the stage (Stage.tsx hears `sol: "part"`); the stage says `unpart` to put it out.
// The page is read as reading type (v4 §4, #738): under the agent's own styles (which win, every rule at no weight) it
// is set at the type scale, 13 body, headings at 15, section labels small and spaced, in the face's ink, dim and mute.
// A Sol address (#692): `src` sol://home is Home itself, drawn inline (home/p2/HomeBlock.tsx: no frame, its parts carry
// data-part, so point and say is the stage's own); sol://home/knobs its knobs card; sol://home/block/<id> a Home block lifted to the stage (suite/Lifted.tsx). Loaded only when one is on a stage.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { floorOf, pageFit } from "./pageFit";
import type { ReactNode } from "react";
import type { KindProps, PageBody } from "./types";
import { ENGINE_HTTP } from "../../engine";
import { partsScript, withBase } from "./parts";
import { homeSrc } from "../../home/p2/address";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { stageWhole } from "../../flag";

const HomeBlock = lazy(() => import("../../home/p2/HomeBlock").then((m) => ({ default: m.HomeBlock })));
const Knobs = lazy(() => import("../../home/p2/Knobs").then((m) => ({ default: m.Knobs })));
const Lifted = lazy(() => import("../../home/p2/suite/Lifted").then((m) => ({ default: m.Lifted })));

export function Page({ b, body, moving }: KindProps<PageBody>) {
  // a page bound to an html file: its own files come from beside it, through the engine (#744)
  // #954, stage.whole: a page the agent wrote in markdown is read as a page (heading, words, its table), as whole.html
  // draws "the side, the rules", never as its raw marks
  const md = !body?.html && !body?.src && body?.text !== undefined && stageWhole();
  // the frame is laid only once its box is measured (Fitted), so it is heard from when it mounts, not at the first draw
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  useEffect(() => keepSize(frame), [frame]);
  const html = useMemo(() => (body?.html ? withParts(withBase(body.html, body.base ? ENGINE_HTTP + body.base : undefined)) : md ? withParts(mdPage(body!.text!)) : undefined), [body?.html, body?.base, body?.text, md]);
  const home = body?.html ? null : homeSrc(body?.src);
  if (home) return <Suspense fallback={<p className="st-note">opening Home…</p>}>{home.at === "knobs" ? <Knobs /> : home.at === "block" ? <Lifted id={home.id} /> : <HomeBlock src={home} />}</Suspense>;
  if (body?.note) return <p className="st-note">{body.note}</p>;
  if (!md && !body?.html && !body?.src && body?.text !== undefined) return <pre className="st-text">{body.text}</pre>;
  if (!md && !body?.html && !body?.src) return <p className="st-note">reading the page…</p>;
  return <Fitted title={b.title} floor={floorOf(body?.html)} words={md} still={(on) => <iframe ref={setFrame} className="st-page" title={b.title} sandbox="allow-scripts" srcDoc={html} src={html ? undefined : body.src} style={moving || !on ? { pointerEvents: "none" } : undefined} />} />;
}

/** a markdown page alone on a wall: its column's width in its own layout (1080 on the screen at 1.5) */
const WORDS_COL = 720;
/** the page laid out at its comfortable width and scaled to the block (pageFit): the same page at every size, smaller;
 *  too small to read, a still of it under its title, which a double-click on the head opens big */
function Fitted({ title, still, floor, words = false }: { title: string; still: (live: boolean) => ReactNode; floor?: number; words?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [wh, setWh] = useState<[number, number]>([0, 0]);
  // #1090: a page alone on a wall (screens.two) is read from further away: it may grow to 1.5. Read in the layout
  // effect (never during render), again when its size or the wall's class changes
  const [alone, setAlone] = useState(false);
  // the page's own height (its frame says it, keepSize) and the block's: a column shorter than the block stands at the
  // middle with its head on it (wall.css .short), as a list does
  const [own, setOwn] = useState<[number, number]>([0, 0]);
  // the layout box, not the drawn one: a block being born is scaled, its page must not be laid at that scale
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    const take = () => {
      setWh((o) => (o[0] === t.clientWidth && o[1] === t.clientHeight ? o : [t.clientWidth, t.clientHeight]));
      setAlone(!!t.closest(".sc-wall.one"));
    };
    take();
    const ro = new ResizeObserver(take);
    ro.observe(t);
    const wall = t.closest(".sc-wall"), mo = wall ? new MutationObserver(take) : null;
    if (wall && mo) mo.observe(wall, { attributes: true, attributeFilter: ["class"] });
    const sized = (ev: Event) => {
      try {
        // the words' own height: its frame fills the box, so h is the frame's when the words are shorter; the last row's
        // top and a line below it are where the words end
        const z = JSON.parse((ev.target as HTMLElement).dataset.size ?? "{}") as { h?: number; rows?: number[] }, blk = t.closest<HTMLElement>(".st-block");
        const rows = Array.isArray(z.rows) ? z.rows.filter(Number.isFinite) : [];
        const h = Math.min(Number(z.h), rows.length ? Math.max(...rows) + 40 : Number(z.h));
        if (Number.isFinite(h) && blk) setOwn((o) => (o[0] === h && o[1] === blk.clientHeight ? o : [h, blk.clientHeight]));
      } catch { /* a size not read: it stays laid from the top */ }
    };
    t.addEventListener("sol-size", sized);
    return () => { ro.disconnect(); mo?.disconnect(); t.removeEventListener("sol-size", sized); };
  }, []);
  const f = pageFit(wh[0], wh[1], floor, undefined, alone ? 1.5 : 1);
  // #1090 (design NOW 04:14 #1): words alone on a wall (a markdown page) are one column of WORDS_COL of their own layout,
  // at the middle of the width; an html page keeps the whole width
  const col = alone && words && f.w > WORDS_COL;
  // the head's row and a margin are what the block keeps besides the page
  const short = col && own[0] > 0 && own[1] > 0 && own[0] * f.scale < own[1] - 96;
  const lay = col ? { width: WORDS_COL, height: short ? own[0] : f.h, transform: `scale(${f.scale})`, left: Math.round((wh[0] - WORDS_COL * f.scale) / 2) } : { width: f.w, height: f.h, transform: `scale(${f.scale})` };
  return (
    <div ref={box} className={`st-pagebox ${words ? "words" : ""} ${short ? "short" : ""} ${f.still ? "still" : ""}`} style={short ? { height: Math.ceil(own[0] * f.scale) } : undefined}>
      {wh[0] > 0 && <div className="st-pagescale" style={lay}>{still(!f.still)}</div>}
      {f.still && <div className="st-pagestill"><b>{title}</b><span>too small to read here · double-click its head to open it big</span></div>}
    </div>
  );
}

/** the page with the reading type at its start and the parts' script at its end (before </body> when it has one) */
function withParts(html: string): string {
  const sun = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--sun").trim();
  const tag = `<script>${partsScript(sun)}</script>`;
  const i = html.toLowerCase().lastIndexOf("</body>");
  const page = i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i);
  // after <head>, else after <html> or the doctype (a style before the doctype would put the page in quirks)
  const m = /<head[^>]*>/i.exec(page) ?? /<html[^>]*>/i.exec(page) ?? /<!doctype[^>]*>/i.exec(page), at = m ? m.index + m[0].length : 0;
  return page.slice(0, at) + `<style>${readingType()}</style>` + page.slice(at);
}

/** the face's values as the page's frame can hold them: a frame does not see the face's variables, so each is resolved */
function face(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const el = document.createElement("span");
  el.style.cssText = "position:absolute;visibility:hidden";
  // read where the stage stands: in the new face's session view (next/session/Port.tsx, BR1 #1615) its ink is the paper's,
  // not the old face's glass set on the root, which wrote a page's words white on white
  (document.querySelector(".sport") ?? document.body).appendChild(el);
  const css = getComputedStyle(el), v = (k: string) => css.getPropertyValue(k).trim();
  const colour = (k: string) => { el.style.color = `var(${k})`; return getComputedStyle(el).color; };
  const out = { ink: colour("--ink"), dim: colour("--dim"), mute: colour("--mute"), line: colour("--line"), font: css.fontFamily, mono: v("--mono"),
    body: v("--t-body"), bodyL: v("--t-body-line"), read: v("--t-read"), readL: v("--t-read-line"), label: v("--t-label"), labelL: v("--t-label-line"), code: v("--t-code"), codeL: v("--t-code-line"), s1: v("--s1"), s2: v("--s2"), s3: v("--s3"), s4: v("--s4") };
  el.remove();
  return out;
}
/** the reading type, every rule at no weight (:where) so the agent's own styles win */
export function readingType(f = face()): string {
  if (!f.body) return "";
  return [
    `:where(body){margin:0;background:transparent;font:${f.body}/${f.bodyL} ${f.font};color:${f.dim};-webkit-font-smoothing:antialiased}`,
    `:where(h1,h2,h3){font-size:${f.read};line-height:${f.readL};font-weight:600;color:${f.ink};margin:${f.s1} 0}`,
    `:where(h4,h5,h6){font-size:${f.label};line-height:${f.labelL};font-weight:600;letter-spacing:.01em;color:${f.mute};margin:${f.s3} 0 ${f.s1}}`,
    `:where(p){margin:0 0 ${f.s2}}`, `:where(ul,ol){margin:0 0 ${f.s2};padding-left:${f.s4}}`, `:where(li){margin:${f.s1} 0}`,
    `:where(b,strong,a){color:${f.ink}}`, `:where(code,pre){font-family:${f.mono};font-size:${f.code}}`, `:where(pre){line-height:${f.codeL}}`,
    `:where(hr){border:0;border-top:1px solid ${f.line}}`, `:where(table){border-collapse:collapse;font-variant-numeric:tabular-nums}`,
  ].join("");
}

/** #954: the page's size as its frame posts it (parts.ts), kept on the frame for Edges.tsx's Cut, which hears "sol-size" */
export type PageSize = { h: number; top: number; vh: number; rows: number[] };
function keepSize(f: HTMLIFrameElement | null): (() => void) | undefined {
  if (!f) return;
  const hear = (ev: MessageEvent) => {
    const m = ev.data as ({ sol?: string } & Partial<PageSize>) | null;
    if (ev.source !== f.contentWindow || m?.sol !== "size" || !Number.isFinite(m.h)) return;
    const part = typeof (m as { part?: unknown }).part === "string" ? String((m as { part?: unknown }).part).slice(0, 60) : undefined;
    f.dataset.size = JSON.stringify({ h: m.h, top: m.top ?? 0, vh: m.vh ?? f.clientHeight, rows: Array.isArray(m.rows) ? m.rows.filter(Number.isFinite).slice(0, 400) : [], ...(part ? { part } : {}) });
    f.dispatchEvent(new Event("sol-size", { bubbles: true }));
  };
  window.addEventListener("message", hear);
  return () => window.removeEventListener("message", hear);
}

/** #954: markdown as a page: marked's html, cleaned, with a table read as rows of a label and its words (whole.html) */
export function mdPage(text: string): string {
  const inner = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  const f = face();
  const rows = f.mute ? `:where(table){width:100%}:where(thead:has(th:empty)){display:none}:where(td){padding:${f.s2} 0;border-top:1px solid ${f.line};vertical-align:top}:where(td:first-child){color:${f.mute};width:30%;padding-right:${f.s3}}:where(td+td){color:${f.ink}}` : "";
  return `<!doctype html><html><head><style>${rows}</style></head><body>${inner}</body></html>`;
}
