// The parts of a page the agent wrote (#698): what the pointer rests on, as words. Run inside the page's own frame
// (Page.tsx puts partsScript in it); `partWords` is the same rule, pure, for the face's tests.
//   an element with data-part           its data-part ("Thu › 14:00")
//   else the line under the pointer     its first word when it holds a digit (14:00), else its first three words,
//                                        after the heading of the box it is in (the box's first b, strong, h1-h6 or th)

/** a part's words from its heading and its own text (pure: the script below does the same in the page) */
export function partWords(own: string, heading?: string): string {
  const t = own.replace(/\s+/g, " ").trim();
  const first = t.split(" ")[0] ?? "";
  const mine = (/\d/.test(first) ? first : t.split(" ").slice(0, 3).join(" ")).slice(0, 24);
  const h = (heading ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  return h && mine && h !== mine ? `${h} › ${mine}` : h || mine;
}

/** the script, as text: hover a beat (HOVER), light the part with the face's sun, post its words; `unpart` puts it out */
export const partsScript = (sun: string) => `(() => {
  const HOVER = 320, SUN = ${JSON.stringify(sun || "currentColor")};
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim() || (e.children.length ? "" : e.textContent || "");
  const HEAD = "b,strong,h1,h2,h3,h4,h5,h6,th";
  const words = ${partWords.toString()};
  const find = (e) => {
    const p = e.closest("[data-part]");
    if (p) return [p, p.dataset.part];
    if (e === document.body || e === document.documentElement) return null;
    let box = e.parentElement, head = "";
    while (box && box !== document.body) { const h = box.firstElementChild; if (h && h !== e && h.matches(HEAD)) { head = h.textContent; break; } box = box.parentElement; }
    const w = words(own(e), head);
    return w ? [e.matches(HEAD) && e.parentElement !== document.body ? e.parentElement : e, w] : null;
  };
  let on = null, t = 0;
  const out = () => { if (on) { on.style.outline = on.dataset.solWas || ""; on = null; } };
  addEventListener("pointerover", (ev) => {
    clearTimeout(t);
    const f = find(ev.target);
    if (!f || f[0] === on) return;
    t = setTimeout(() => { out(); on = f[0]; on.dataset.solWas = on.style.outline; on.style.outline = "1px solid " + SUN; on.style.outlineOffset = "-1px"; parent.postMessage({ sol: "part", part: f[1] }, "*"); }, HOVER);
  });
  addEventListener("pointerleave", () => clearTimeout(t));
  addEventListener("message", (ev) => { if (ev.data && ev.data.sol === "unpart") out(); });
  // #1437: the agent's lens: a part brought to the top of what shows, ringed in the sun, its one line over it, for 3 s
  const goTo = (part, say) => {
    const want = String(part).trim().toLowerCase(); if (!want) return;
    let t = [...document.querySelectorAll("[data-part]")].find((e) => (e.dataset.part || "").toLowerCase() === want) || null, n = 0;
    if (!t) for (const e of document.querySelectorAll("li,tr,h1,h2,h3,h4,p,summary,dt,section,div")) { if (++n > 1500) break; if ((e.textContent || "").toLowerCase().includes(want) && (!t || t.contains(e))) t = e; }
    if (!t) return;
    // near the top of what shows, with room over it for the ring and the line
    scrollTo({ top: Math.max(0, t.getBoundingClientRect().top + scrollY - (say ? 48 : 14)), behavior: "smooth" });
    const was = [t.style.outline, t.style.outlineOffset]; t.style.outline = "2px solid " + SUN; t.style.outlineOffset = "3px";
    let tag = null;
    if (say) {
      const b = t.getBoundingClientRect(); tag = document.createElement("div"); tag.textContent = String(say).slice(0, 120);
      tag.style.cssText = "position:absolute;z-index:2147483647;padding:4px 9px;border-radius:7px;font:600 12px/1.3 -apple-system,system-ui;color:#111;pointer-events:none;background:" + SUN;
      tag.style.left = (b.left + scrollX) + "px"; tag.style.top = Math.max(0, b.top + scrollY - 30) + "px"; document.body.appendChild(tag);
    }
    setTimeout(() => { t.style.outline = was[0]; t.style.outlineOffset = was[1]; if (tag) tag.remove(); }, 3000);
  };
  addEventListener("message", (ev) => { if (ev.data && ev.data.sol === "go") goTo(ev.data.part || "", ev.data.say || ""); });
  // #954: the page's height and its rows' bottoms, so the stage can say "+N lines" where the frame cuts it (Edges.tsx Cut)
  const LEAF = "p,li,tr,h1,h2,h3,h4,h5,h6,pre,blockquote,img,dt,dd";
  // #1435: the data-part at the top of what shows, so the agent's eyes can say where the person scrolled
  const atTop = () => { for (const e of document.querySelectorAll("[data-part]")) if (e.getBoundingClientRect().bottom > 4) return e.dataset.part; return undefined; };
  const size = () => { const d = document.documentElement; parent.postMessage({ sol: "size", h: d.scrollHeight, top: scrollY, vh: innerHeight, part: atTop(),
    rows: [...document.querySelectorAll(LEAF)].filter((e) => !e.querySelector(LEAF)).map((e) => Math.round(e.getBoundingClientRect().bottom + scrollY)) }, "*"); };
  addEventListener("load", size); addEventListener("resize", size); addEventListener("scroll", size, { passive: true });
  if (typeof ResizeObserver === "function") new ResizeObserver(size).observe(document.documentElement);
})();`;

/** the page with a <base> at its head, so its own relative images, styles and scripts load from beside its file (#744):
 *  first in <head> when it has one (a base after a relative link would come too late), else before everything. A page
 *  that names its own base keeps it (pure) */
export function withBase(html: string, href?: string): string {
  if (!href || /<base\s/i.test(html)) return html;
  const tag = `<base href="${href.replace(/"/g, "&quot;")}">`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  return head ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length) : tag + html;
}
