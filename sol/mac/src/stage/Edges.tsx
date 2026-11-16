// The whole stage's resize hold (#775, #751 B12): a band 10 wide astride every edge and an 18 px square at every corner
// (build/feel.md "hit.min"), in place of today's one corner grip, and the "+N lines" a cut body says (whole.md
// "resize"). Shown only with `stage.whole` on (Frame asks); the drag itself is resizeHand.ts's.
import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { EDGES, cutLines, cutWords, type Edge } from "./resize";
import "./resize.css";

/** an element's bottom in its body's own coordinates, from layout offsets: a transform on the block (its birth, the
 *  hand's lift) never changes what is measured */
function bottomIn(body: HTMLElement, el: HTMLElement): number {
  let y = el.offsetHeight, n: HTMLElement | null = el;
  while (n && n !== body) {
    y += n.offsetTop;
    const up = n.offsetParent as HTMLElement | null;
    if (up && up !== body && !body.contains(up)) { y -= body.offsetTop; break; }   // body is not positioned: its parent's frame
    n = up;
  }
  return y;
}
/** the content's height under the head and the bottoms of its rows, in the body's own coordinates */
export function measure(body: HTMLElement): { content: number; shown: number; rows: number[] } {
  const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
  let bottom = 0;
  for (const c of Array.from(body.children)) bottom = Math.max(bottom, bottomIn(body, c as HTMLElement));
  // rows are the leaf parts: a part that wraps others (RunRows' "the background", a Diff's tabs, a Card's big) is not a line
  const rows = Array.from(body.querySelectorAll<HTMLElement>("[data-part]:not(:has([data-part]))")).map((r) => bottomIn(body, r));
  // #954: a page is its own frame: its height and rows come from inside it (Page.tsx keepSize), scrolled in the frame
  const page = body.querySelector<HTMLIFrameElement>("iframe.st-page[data-size]");
  if (page) {
    const s = JSON.parse(page.dataset.size!) as { h: number; top: number; vh: number; rows: number[] }, y = bottomIn(body, page) - page.offsetHeight;
    return { content: Math.max(bottom, y + s.h) + pad, shown: y + s.top + Math.min(s.vh, page.clientHeight), rows: [...rows, ...s.rows.map((r) => y + r)] };
  }
  return { content: bottom + pad, shown: body.clientHeight + body.scrollTop, rows };
}
/** "all of it": the block's height that shows its whole content (head and body), or null when it cannot be read */
export function fitOf(block: HTMLElement | null): number | null {
  const head = block?.querySelector<HTMLElement>(".st-head"), body = block?.querySelector<HTMLElement>(".st-body");
  if (!head || !body) return null;
  return Math.ceil(head.offsetHeight + measure(body).content);
}

export function Edges({ onEdge }: { onEdge: (e: RPointerEvent<HTMLDivElement>, edge: Edge) => void }) {
  return <>{EDGES.map((e) => <div key={e} className={`st-edge ${e}`} data-edge={e} onPointerDown={(ev) => { if (ev.button === 0) onEdge(ev, e); }} />)}</>;
}

/** where `.st-cut`'s fade turns solid (resize.css: 97% --c-deep from 58% of its height): a row ending under that strip
 *  cannot be read, so it is not counted as shown */
const FADE_SOLID = 0.58;

/** "+N lines" at the foot of a cut body; nothing when all of it shows */
export function Cut({ w, h }: { w: number; h: number }) {
  const at = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useLayoutEffect(() => {
    const body = at.current?.closest(".st-block")?.querySelector<HTMLElement>(".st-body");
    if (!body) return;
    const read = () => {
      const m = measure(body);
      // cut or not is the body's own edge; once cut, the fade's solid strip hides the rows ending in it (#853 B2)
      const hid = cutLines(m.shown, m.content) > 0 ? (at.current?.offsetHeight ?? 0) * (1 - FADE_SOLID) : 0;
      setN(hid ? cutLines(m.shown - hid, m.content, m.rows) : 0);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(body);
    for (const c of Array.from(body.children)) ro.observe(c);
    body.addEventListener("scroll", read, { passive: true });
    body.addEventListener("sol-size", read);   // #954: a page's frame told its size
    return () => { ro.disconnect(); body.removeEventListener("scroll", read); body.removeEventListener("sol-size", read); };
  }, [w, h]);
  return <span ref={at} className={`st-cut ${n ? "on" : ""}`} aria-live="polite">{cutWords(n)}</span>;
}
