// A page (#696): an html body the agent wrote, in a frame of its own (an iframe: its styles and scripts never reach the
// face). `src` a url instead; `note` when it could not be read. While a block moves the frame lets the pointer through.
// Point and say (#698): the frame is sandboxed, so its parts tell the stage themselves. A few lines put in its page
// light the part the pointer rests on (an element with data-part, else the line under it and the heading of its box:
// "Thu › 14:00") and post its words to the stage (Stage.tsx hears `sol: "part"`); the stage says `unpart` to put it out.
// The page is read as reading type (v4 §4, #738): under the agent's own styles (which win, every rule at no weight) it
// is set at the type scale, 13 body, headings at 15, section labels small and spaced, in the face's ink, dim and mute.
import { useEffect, useMemo, useRef } from "react";
import type { KindProps, PageBody } from "./types";
import { ENGINE_HTTP } from "../../engine";
import { partsScript, withBase } from "./parts";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { stageWhole } from "../../flag";

export function Page({ b, body, moving }: KindProps<PageBody>) {
  // a page bound to an html file: its own files come from beside it, through the engine (#744)
  // #954, stage.whole: a page the agent wrote in markdown is read as a page (heading, words, its table), as whole.html
  // draws "the side, the rules", never as its raw marks
  const md = !body?.html && !body?.src && body?.text !== undefined && stageWhole();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => keepSize(frame.current), []);
  const html = useMemo(() => (body?.html ? withParts(withBase(body.html, body.base ? ENGINE_HTTP + body.base : undefined)) : md ? withParts(mdPage(body!.text!)) : undefined), [body?.html, body?.base, body?.text, md]);
  if (body?.note) return <p className="st-note">{body.note}</p>;
  if (!md && !body?.html && !body?.src && body?.text !== undefined) return <pre className="st-text">{body.text}</pre>;
  if (!md && !body?.html && !body?.src) return <p className="st-note">reading the page…</p>;
  return <iframe ref={frame} className="st-page" title={b.title} sandbox="allow-scripts" srcDoc={html} src={html ? undefined : body.src} style={moving ? { pointerEvents: "none" } : undefined} />;
}

/** #954: the page's size as its frame posts it (parts.ts), kept on the frame for Edges.tsx's Cut, which hears "sol-size" */
export type PageSize = { h: number; top: number; vh: number; rows: number[] };
function keepSize(f: HTMLIFrameElement | null): (() => void) | undefined {
  if (!f) return;
  const hear = (ev: MessageEvent) => {
    const m = ev.data as ({ sol?: string } & Partial<PageSize>) | null;
    if (ev.source !== f.contentWindow || m?.sol !== "size" || !Number.isFinite(m.h)) return;
    f.dataset.size = JSON.stringify({ h: m.h, top: m.top ?? 0, vh: m.vh ?? f.clientHeight, rows: Array.isArray(m.rows) ? m.rows.filter(Number.isFinite).slice(0, 400) : [] });
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
  document.body.appendChild(el);
  const css = getComputedStyle(document.documentElement), v = (k: string) => css.getPropertyValue(k).trim();
  const colour = (k: string) => { el.style.color = `var(${k})`; return getComputedStyle(el).color; };
  const out = { ink: colour("--ink"), dim: colour("--dim"), mute: colour("--mute"), line: colour("--line"), font: getComputedStyle(document.body).fontFamily, mono: v("--mono"),
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
