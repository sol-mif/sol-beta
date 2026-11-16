// A terminal block (#699): a real shell the engine owns (sol/engine/src/work/live.ts, a pty), drawn here with xterm. The
// block's body holds the pty's id; what the shell said so far comes on attach, then each chunk as it is said (numbered,
// so nothing is drawn twice). Your keys go to it; so do the agent's words (terminal_run), and you see them run. Drawn as
// v4 §4 draws it (#738): mono at 11 on the deepest black, the face's ink, a live cursor while the shell runs.
import { useEffect, useRef, useState } from "react";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { store } from "../engineStore";
import type { KindProps } from "./types";

export type TerminalBody = { tid?: string; cwd?: string; run?: string };

const css = (k: string, d: string) => (typeof document === "undefined" ? d : getComputedStyle(document.documentElement).getPropertyValue(k).trim() || d);
const px = (k: string, d: number) => parseFloat(css(k, "")) || d;

export function Terminal({ body }: KindProps<TerminalBody>) {
  const host = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState<number | null>(null);
  const link = store.link();
  const tid = body?.tid;
  useEffect(() => {
    if (!tid || !link || !host.current) return;
    const el = host.current;
    const t = new Xterm({
      fontFamily: css("--mono", "ui-monospace, Menlo, monospace"), fontSize: px("--t-label", 11), lineHeight: px("--t-label-line", 16) / px("--t-label", 11),
      cursorBlink: true, allowTransparency: true, scrollback: 5000,
      theme: { background: "#00000000", foreground: css("--dim", "rgba(255,255,255,.55)"), cursor: css("--ink", "#ebebe8"), selectionBackground: css("--line", "rgba(255,255,255,.06)") },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(el);
    let ready = false;
    const early: { data: string; seq: number }[] = [];
    const off = link.listen((m: { type?: string; tid?: string; data?: string; seq?: number; code?: number }) => {
      if (m.tid !== tid) return;
      if (m.type === "work.term.out") { if (ready) t.write(String(m.data ?? "")); else early.push({ data: String(m.data ?? ""), seq: Number(m.seq) || 0 }); }
      else if (m.type === "work.term.exit") { t.write("\x1b[?25l"); setGone(m.code ?? 0); }   // the cursor lives only while it runs
    });
    void link.ask<{ buf?: string; seq?: number; gone?: boolean; alive?: boolean; code?: number }>("work.term.attach", { tid }).then((r) => {
      if (r.buf) t.write(r.buf);
      for (const d of early) if (d.seq > (r.seq ?? 0)) t.write(d.data);
      early.length = 0; ready = true;
      if (r.gone || r.alive === false) { t.write("\x1b[?25l"); setGone(r.code ?? 0); }
    });
    const size = () => { try { fit.fit(); link.send({ type: "work.term.size", tid, cols: t.cols, rows: t.rows }); } catch { /* not shown */ } };
    const ro = new ResizeObserver(() => requestAnimationFrame(size));
    ro.observe(el);
    size();
    const input = t.onData((d) => link.send({ type: "work.term.in", tid, data: d }));
    return () => { off(); ro.disconnect(); input.dispose(); t.dispose(); };
  }, [tid, link]);
  if (!tid) return <p className="st-note">opening a shell…</p>;
  if (!link) return <p className="st-note">a terminal runs on the engine</p>;
  return (
    <div className="st-term" data-part="shell">
      <div ref={host} className="st-termhost" />
      {gone !== null && <p className="st-termgone">the shell ended{gone ? ` (${gone})` : ""}</p>}
    </div>
  );
}
