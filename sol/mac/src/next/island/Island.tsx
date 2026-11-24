// owned by slice 10 (the island), docs/port/slices.md "Night 2"
// The island (islands.html's island, as desk.js drew it, counts 21 and 22): black at the top of the screen, where the notch
// was. At rest the notch's size; its ears say "N working" (the one count, I4) or what was just done; an ask that may wait
// opens it ("At a pause · holds Ada up", Yes ⌘↩ · Later esc · "N more in the glance"); talking, it listens; the reward
// shows the end of what was given from here, then goes to the diary. It draws an IslandState only, so the desk view and
// the native island's own page (main.tsx) draw the same thing. DOM hooks: #dk-isl, data-ask, data-front, data-count,
// data-reward, data-dk, #dk-say. Signed: marcocyl04-ux's agent, port slice 10 (#1615).
import { useLayoutEffect, useRef, type KeyboardEvent as RKey } from "react";
import type { IslandState } from "./store.ts";
import { size } from "./rules.ts";

export type IslandProps = {
  st: IslandState; C: number; glow?: boolean;
  /** a press: its data-dk ("yes:a5", "later:a5", "look:a5", "see:rw1", "done:rw1", "listen") */
  onPress: (dk: string) => void;
  /** the person's words, said to the island */
  onSay: (words: string) => void;
  onStopListening: () => void;
  /** the reward is on screen: only now may its diary line be written */
  onShown?: (id: string) => void;
  /** the ears' words have been read (their animation ended) */
  onAfterEnd?: () => void;
  /** "Heard: …" has been read */
  onHeardEnd?: (said: string) => void;
  /** the reward has stood its time */
  onRewardEnd?: () => void;
};

export function Island({ st, C, onPress, onSay, onStopListening, onShown, onAfterEnd, onHeardEnd, onRewardEnd }: IslandProps) {
  const { w, h } = size(st.k, C, st.k === "ask" ? st.text : "");
  const say = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { if (st.k === "peak") onShown?.(st.id); }, [st.k === "peak" ? st.id : null]);   // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (st.k === "talk") say.current?.focus({ preventScroll: true }); }, [st.k]);
  const key = (e: RKey<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") onSay(e.currentTarget.value);
    else if (e.key === "Escape") onStopListening();
  };
  let body = null;
  if (st.k === "talk") body = (
    <div className="dk-x"><div className="dk-talk"><span className="dk-aura busy" /><div className="dk-grow">
      <div className="dk-hd">Listening · release fn to send</div>
      <div className="dk-said"><input ref={say} id="dk-say" aria-label="Say a move or ask anything" placeholder="Say a move or ask" autoComplete="off" defaultValue={st.said} onKeyDown={key} /></div>
      {st.heard ? <div className="dk-heard" onAnimationEnd={() => onHeardEnd?.(st.said)}>Heard: {st.heard}</div> : null}
    </div></div></div>);
  else if (st.k === "peak") body = (
    <div className="dk-x" data-reward={st.id} onAnimationEnd={(e) => { if (e.target === e.currentTarget) onRewardEnd?.(); }}>
      <div className="dk-hd"><span className="dk-aura" /><b>Done</b> · {st.name}, which you gave {st.ai} at {st.at}</div>
      <div className="dk-big">{st.ai} finished {st.name}.</div><div className="dk-sub">Its change waits in its session for your look</div>
      <div className="dk-btns"><button className="dk-ib dk-w" data-dk={`see:${st.id}`}>See it</button><button className="dk-ib" data-dk={`done:${st.id}`}>Later <kbd>esc</kbd></button><span className="dk-lk">then to today’s diary</span></div>
    </div>);
  else if (st.k === "ask") body = (
    <div className="dk-x" data-ask={st.id} data-front="">
      <div className="dk-hd"><span className="dk-aura" />At a pause · <b>{st.rung}</b></div>
      <div className="dk-q">{st.text}</div><div className="dk-sub">{st.sub}</div>
      <div className="dk-btns">
        {st.look ? <button className="dk-ib dk-w" data-dk={`look:${st.id}`}>Open to look <kbd>⌘↩</kbd></button> : <button className="dk-ib dk-w" data-dk={`yes:${st.id}`}>{st.yes} <kbd>⌘↩</kbd></button>}
        <button className="dk-ib" data-dk={`later:${st.id}`}>Later <kbd>esc</kbd></button>
        {st.more ? <span className="dk-lk">{st.more} more in the glance</span> : null}
      </div>
    </div>);
  else if (st.k === "ears") body = (
    <div className="dk-ears"><div><span className={`dk-aura${st.busy ? " busy" : ""}`} /></div>
      <div className={`r${st.busy ? "" : " dk-after"}`} data-count={st.count} onAnimationEnd={st.busy ? undefined : () => onAfterEnd?.()}>{st.words}</div></div>);
  const bodyKey = st.k + (st.k === "ask" ? st.id : st.k === "peak" ? st.id : st.k === "ears" ? st.words : "");
  return (
    <div id="dk-isl" className={`dk-isl${h > 32 ? " dk-big-isl" : ""}${st.k === "peak" ? " glow" : ""}`} role="status" aria-live="polite" data-state={st.k}
      style={{ width: `${w.toFixed(1)}px`, height: `${h}px` }}
      onClick={(e) => {
        const t = e.target as HTMLElement, b = t.closest?.("[data-dk]") as HTMLElement | null;
        if (b?.dataset.dk) { e.preventDefault(); onPress(b.dataset.dk); return; }
        if (!t.closest?.("input")) onPress("listen");
      }}>
      {body ? <div className="dk-in" key={bodyKey}>{body}</div> : null}
    </div>
  );
}
