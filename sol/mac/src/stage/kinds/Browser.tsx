// A browser block (#699; play.html's browser kind: the address and the wheel over the page). The wheel says whose hand
// is on the page, never both: "you drive", the page is yours (in the app a child web view laid over this body, thing.rs
// block_view_*, with your logins; outside the app an iframe stands in), or "sol drives", the agent's tab in the engine
// (browser.ts), whose frames you watch and cannot press. "shot" lays a still of the page in the block's stills.
import { useEffect, useRef, useState } from "react";
import { Pill } from "../../kit";
import { Screencast } from "../../Screencast";
import { store } from "../engineStore";
import type { KindProps } from "./types";
import { addressOf, moved, samples, shownUrl, viewOf, type Box, type ViewState } from "./view";

export type BrowserBody = { url?: string; hand?: "you" | "sol"; tab?: string };

const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const invoke = (cmd: string, a: object) => import("@tauri-apps/api/core").then((c) => c.invoke(cmd, a as Record<string, unknown>));
const HANDS = ["sol drives", "you drive"] as const;

export function Browser({ b, body, session, moving }: KindProps<BrowserBody>) {
  const link = store.link();
  const url = body?.url ?? "", hand = body?.hand === "you" ? "you" : "sol";
  const [typed, setTyped] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const wheel = (h: "you" | "sol", to?: string) => { if (session) void link?.ask("work.stage.wheel", { sessionId: session, id: b.id, hand: h, ...(to ? { url: to } : {}) }); };
  const go = () => {
    const to = addressOf(typed ?? "");
    setTyped(null);
    if (!to || to === url) return;
    wheel(hand, to);
    if (inApp && hand === "you") void invoke("block_view_nav", { id: b.id, url: to }).catch((e) => setSaid(String(e)));
  };
  const shoot = () => {
    if (!session || !link) return;
    setSaid("taking a shot…");
    void link.ask<{ error?: string; block?: { title?: string } }>("work.stage.shot", { sessionId: session, id: b.id }, 60_000)
      .then((r) => setSaid(r.error ? r.error : `laid in ${r.block?.title ?? "the stills"}`));
  };
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(""), 2400); return () => clearTimeout(t); }, [said]);
  return (
    <div className="st-browser">
      <div className="st-url">
        {hand === "you"
          ? <input className="st-addr" value={typed ?? shownUrl(url)} placeholder="an address" spellCheck={false} aria-label="the address"
              onFocus={(e) => { setTyped(shownUrl(url)); e.currentTarget.select(); }} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") go(); if (e.key === "Escape") { setTyped(null); e.currentTarget.blur(); } }} onBlur={() => setTyped(null)} />
          : <span className="st-addr" title={url}>{shownUrl(url) || "sol opens a page when it acts"}</span>}
        {said && <span className="st-said">{said}</span>}
        <button className="st-shot" onClick={shoot} disabled={!url || !link} title="a still of the page, to the block's stills">shot</button>
        <span className="st-wheel"><Pill words={HANDS} picked={hand === "you" ? 1 : 0} h={24} onPick={(i) => { const h = i === 1 ? "you" : "sol"; if (h !== hand) wheel(h); }} /></span>
      </div>
      <div className="st-view" data-part="page">
        {!url ? <p className="st-note">no page yet</p>
          : hand === "sol" ? <SolHand tab={body?.tab} />
          : inApp ? <ChildView id={b.id} url={url} session={session} moving={!!moving} />
          : <iframe className="st-page" title={b.title} src={url} sandbox="allow-scripts allow-same-origin allow-forms" style={moving ? { pointerEvents: "none" } : undefined} />}
      </div>
    </div>
  );
}

/** the agent's hand: its tab's frames, watched; your presses are held (the wheel is how you take it) */
function SolHand({ tab }: { tab?: string }) {
  const link = store.link();
  if (!tab || !link?.frames) return <p className="st-note">sol drives; the page shows once it acts on it</p>;
  return <Screencast tab={tab} send={link.send} subscribe={link.frames} live={false} counted="block" blank={<p className="st-note">sol drives…</p>} />;
}

/** your hand, in the app: the child web view kept on this box every frame, hidden when the face must show over it */
export function ChildView({ id, url, session, moving }: { id: string; url: string; session?: string; moving: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const opened = useRef(false);
  const mov = useRef(moving);
  mov.current = moving;
  useEffect(() => {
    let raf = 0, last: ViewState | null = null, gone = false;
    const tick = () => {
      if (gone) return;
      const box = el.current, st = box?.closest("[data-stage]");
      if (box && st) {
        const r = box.getBoundingClientRect(), s = st.getBoundingClientRect();
        const body: Box = { x: r.left, y: r.top, w: r.width, h: r.height };
        // something of the face on the body: the topmost thing at a sample point is not this box
        const covered = samples(body).some(([x, y]) => { const top = document.elementFromPoint(x, y); return !!top && top !== box && !box.contains(top); });
        const v = viewOf(body, { x: s.left, y: s.top, w: s.width, h: s.height }, { moving: mov.current || !!box.closest(".moving,.dying,.coming"), covered, hidden: !box.offsetParent });
        if (moved(last, v)) {
          last = v;
          const a = { id, x: v.at.x, y: v.at.y, w: v.at.w, h: v.at.h, cx: v.clip.x, cy: v.clip.y, cw: v.clip.w, ch: v.clip.h, innerH: window.innerHeight };
          const first = !opened.current;
          opened.current = true;
          void (first ? invoke("block_view_open", { ...a, url, show: v.show }) : invoke("block_view_bounds", { ...a, show: v.show }))
            .then(() => setErr("")).catch((e) => { setErr(String(e)); if (first) opened.current = false; });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { gone = true; cancelAnimationFrame(raf); opened.current = false; void invoke("block_view_close", { id }).catch(() => {}); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // the page moving on its own (a link pressed): the block's address follows
  useEffect(() => {
    let off: (() => void) | null = null, done = false;
    void import("@tauri-apps/api/event").then((ev) => ev.listen<{ id?: string; url?: string; load?: string; refused?: string }>("block-view", (e) => {
      const p = e.payload;
      if (p.id !== id) return;
      if (p.load === "finished" && p.url && session) void store.link()?.ask("work.stage.at", { sessionId: session, id, url: p.url });
      if (p.refused) setErr(`${shownUrl(p.refused)} opens outside Sol`);
    })).then((f) => { if (done) f(); else off = f; });
    return () => { done = true; off?.(); };
  }, [id, session]);
  return <div ref={el} className="st-child">{err && <p className="st-note">{err}</p>}</div>;
}
