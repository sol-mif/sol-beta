// The live window and the jelly's line, for "show me once" (showOnce.tsx, #1054 pass 4): it was shared with the tour's places,
// which went with #1223. The window is the engine's tab in its default
// profile (so sign-ins stay), drawn live with Screencast: the person's pointer and keys go in. A press in it is told to
// the owner first (`onGrab`, with the point in the window), so the owner can take the wheel from a running turn, or note
// what was pressed. The line on top says what is happening and holds the one touch.
import { useEffect, useRef, type ReactNode } from "react";
import type { useEngine } from "../../useEngine";
import { useSize } from "../../kit";
import { dim, ink, label, on } from "../../kit/paint";
import { CURVE } from "../../kit/tokens";
import { Body, haloDoing } from "../../Body";
import { Screencast } from "../../Screencast";
import { dur } from "../../motion";

type E = ReturnType<typeof useEngine>;
export type Tab = E["tabs"][number];
export type Words = { one: string; two?: string; doing: "rest" | "working" };

/** a page that asks for a sign-in: the wall is the person's */
export const SIGNIN = /login|log-in|signin|sign-in|shibboleth|\/idp\/|weblogin|kerberos|duosecurity|microsoftonline|\/sso\b|\/cas\/|auth-saml|saml2|\/authenticate|accounts\.google\.com/i;
export const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? "" : x.pathname; } catch { return ""; } };
/** a turn's last word, letters only: SIGNIN, NOTHING, DONE or anything else */
export const lastWord = (text: string) => (text.trim().split(/\s+/).pop() ?? "").replace(/[^A-Z]/g, "");

/** the tab a turn drives: opened under a draft id, moved to the session once the seat names it */
export function useTab(e: E, ids: (string | undefined)[]): Tab | undefined {
  const mine = e.tabs.filter((t) => !!t.sessionId && ids.includes(t.sessionId));
  return mine.find((t) => t.active) ?? mine[mine.length - 1];
}

/** a window's tab, opened once for its draft and closed with every tab of the draft (or the session it moved to) when
 *  the screen goes for good. React may mount a screen twice in a row (dev); a second open would leave two tabs under
 *  one draft and the window could show the one the jelly is not driving. `onOpen` runs once, after the open. */
export function useOwnTab(e: E, draft: string, url: string, sid: () => string | undefined, onOpen?: () => void, onGone?: () => void) {
  const opened = useRef(false), alive = useRef(false), tabs = useRef(e.tabs);
  tabs.current = e.tabs;
  useEffect(() => {
    alive.current = true;
    if (!opened.current) { opened.current = true; e.send({ type: "browser.open", url, sessionId: draft }); onOpen?.(); }
    return () => {
      alive.current = false;
      window.setTimeout(() => {
        if (alive.current) return;   // mounted again at once: the same screen, the same tab
        onGone?.();
        const s = sid();
        for (const t of tabs.current) if (t.sessionId && (t.sessionId === draft || t.sessionId === s)) e.send({ type: "browser.close", tab: t.id });
      }, 0);
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return alive;
}

/** the window: the tab live, or the jelly opening it; what lies over it (a card, a wall) comes as children */
export function LiveWindow({ e, tab, opening, onGrab, onInput, children, winRef, data }: {
  e: E; tab?: Tab; opening: string; onGrab?: (at: { x: number; y: number }) => void; onInput?: () => void; children?: ReactNode;
  winRef?: React.Ref<HTMLDivElement>; data?: string;
}) {
  return (
    <div ref={winRef} data-window={data}
      onPointerDownCapture={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); onGrab?.({ x: ev.clientX - r.left, y: ev.clientY - r.top }); }}
      style={{ flex: 1, minHeight: 0, display: "flex", borderRadius: CURVE.radius.box, overflow: "hidden", background: on(0.04), position: "relative" }}>
      {tab ? <Screencast tab={tab.id} send={e.send} subscribe={e.subscribeFrames} live hold={() => false} onInput={onInput} blank={<span style={label}>{opening}</span>} />
        : <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}><Body size={36} state="settled" follow halo={haloDoing("working")} /><span style={label}>{opening}</span></div>}
      {children}
    </div>
  );
}

/** a screen of its own over Home: the jelly's line on top (what is happening, and the one touch), the body under it */
export function Stage({ words, act, children, data }: { words: Words; act?: ReactNode; children: (W: number, H: number) => ReactNode; data?: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null), [W, H] = useSize(box);
  return (
    <div style={{ position: "absolute", inset: 0, padding: "18px 32px 24px", display: "flex", flexDirection: "column", color: ink }} {...data}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 68, flex: "none" }} data-say>
        <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", flex: "none" }}><Body size={30} state="settled" follow halo={haloDoing(words.doing)} /></div>
        <div key={words.one} style={{ flex: 1, minWidth: 0, animation: `fh-in ${dur("glass")}ms both` }}>
          {/* a narrow window: the line wraps to a second line rather than losing its end */}
          <div className="t-display" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{words.one}</div>
          <div className="t-read" style={{ color: dim, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{words.two ?? " "}</div>
        </div>
        {act && <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>{act}</div>}
      </div>
      <div ref={box} style={{ flex: 1, minHeight: 0, marginTop: 14, display: "flex", flexDirection: "column" }}>{W > 0 ? children(W, H) : null}</div>
    </div>
  );
}
