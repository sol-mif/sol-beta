// A clock block (#1177): everything coming in, with its ETA, checked by itself. The time, big; a line of the next hours
// with every item pinned at its ETA, coloured by its state, the now line moving every second; under it a row per item:
// its ETA, "in N min" or "N min late", what the last check said, its owner and machine. A late row stands out. A press on
// a pin (or a row) opens its PR or its CI run.
//
// It is never drawn by hand and never polls: the engine keeps the person's clock (work/clock.ts), checks it every 2
// minutes and at each ETA (parts/clock.ts), and tells every face `clock.items` when it changes. The block asks once as
// it opens (clock.get) and again when the socket comes back. An agent changes it with clock_add, clock_move, clock_done.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../kit";
import { store } from "../engineStore";
import { openUrl } from "../../cowork/util";
import type { KindProps } from "./types";
import { STATE_WORD, at, hm, hms, lateNow, linkOf, spanOf, ticksOf, untilWords, type ClockMsg, type Item } from "./clock/model";
import "./clock/clock.css";

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

export function Clock(_: KindProps<Record<string, never>>) {
  const link = store.link();
  const [items, setItems] = useState<Item[] | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);

  const take = useCallback((m: ClockMsg) => { if (Array.isArray(m?.items)) { setItems(m.items); setChecked(m.checked ?? null); } }, []);
  useEffect(() => {
    if (!link) return;
    let gone = false;
    const ask = () => void link.ask<ClockMsg>("clock.get", {}).then((r) => { if (!gone && r) take(r); });
    ask();
    const off = link.listen((m: ClockMsg) => {
      if (m?.type === "open") { ask(); return; }   // the socket came back
      if (m?.type === "clock.items" && !m.rid) take(m);
    });
    return () => { gone = true; off(); };
  }, [link, take]);
  // the now line and the big time move every second; nothing is asked of the engine for it
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const checkNow = useCallback(() => {
    if (!link || asking) return;
    setAsking(true);
    void link.ask<ClockMsg>("clock.check", {}).then((r) => { if (r) take(r); }).finally(() => setAsking(false));
  }, [link, asking, take]);

  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => a.eta - b.eta), [items]);
  const { lo, hi, pinned } = useMemo(() => spanOf(sorted, now), [sorted, now]);
  const ticks = useMemo(() => ticksOf(lo, hi), [lo, hi]);
  const lateN = sorted.filter((i) => lateNow(i, now)).length;
  const open = (i: Item) => { const u = linkOf(i); if (u) openUrl(u); };

  return (
    <div className="ck" data-part="clock">
      <div className="ck-head">
        <div className="ck-now" data-part="the time">{hms(now)}</div>
        <div className="ck-sum">
          {items === null ? (link ? "reading the clock…" : "no engine") : !sorted.length ? "nothing coming in" :
            <><b>{sorted.filter((i) => i.state !== "done").length}</b> coming in{lateN > 0 && <>, <b className="ck-late-w">{lateN} late</b></>}</>}
          {checked && <span className="ck-checked">checked {hm(checked)}</span>}
        </div>
        <span className="ck-act"><Button h={28} flat onClick={checkNow}>{asking ? "Checking…" : "Check now"}</Button></span>
      </div>

      <div className="ck-line" data-part="the next hours">
        {ticks.map((t) => <div key={t} className="ck-tick" style={{ left: pct(at(t, lo, hi)) }}><span>{hm(t)}</span></div>)}
        <div className="ck-nowl" style={{ left: pct(at(now, lo, hi)) }}><span>now</span></div>
        {pinned.map((i, n) => {
          const late = lateNow(i, now), u = linkOf(i);
          // a pin close to the one before it hangs its name a line lower, so two names never sit on each other
          const low = n > 0 && at(i.eta, lo, hi) - at(pinned[n - 1].eta, lo, hi) < 0.06 && n % 2 === 1;
          return (
            <button key={i.id} type="button" className={`ck-pin ${i.state}${late ? " late" : ""}${u ? " opens" : ""}${low ? " low" : ""}`} style={{ left: pct(at(i.eta, lo, hi)) }}
              data-part={`pin › ${i.id}`} title={`${hm(i.eta)} · ${i.title}${u ? " (opens it)" : ""}`} onClick={() => open(i)} onPointerDown={(e) => e.stopPropagation()}>
              <i>{i.id}</i>
            </button>
          );
        })}
      </div>

      <div className="ck-rows">
        {sorted.map((i) => {
          const late = lateNow(i, now), moved = i.moves[i.moves.length - 1], u = linkOf(i);
          return (
            <div key={i.id} className={`ck-row${late ? " late" : ""}${i.state === "done" ? " done" : ""}${u ? " opens" : ""}`} data-part={`row › ${i.id}`}
              onClick={() => open(i)} onPointerDown={(e) => { if (u) e.stopPropagation(); }}>
              <div className="ck-eta"><b>{hm(i.eta)}</b><span>{untilWords(i.eta, now, i.state === "done")}</span></div>
              <div className="ck-what">
                <span className="ck-title">{i.title}</span>
                <span className="ck-detail">{i.detail}{moved && <> · moved from {hm(moved.from)}: {moved.why}</>}</span>
              </div>
              <div className="ck-who">{i.owner}{i.machine && <> · {i.machine}</>}</div>
              <div className={`ck-st ${i.state}${late ? " late" : ""}`}><i aria-hidden />{late ? "late" : STATE_WORD[i.state]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
