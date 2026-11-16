// #954: a terminal's copy in the tray (WholeTray.tsx): its last lines as words, live, without being a pane. It asks the
// engine what the shell said so far (work.term.attach only reads) and adds each chunk as it is said; it never sizes the
// shell nor sends keys, so the block's own pane keeps the pty as it was.
import { useEffect, useState } from "react";
import { store } from "./engineStore";
import type { TerminalBody } from "./kinds/Terminal";
import { lastLines } from "./trayFold";

export function MiniTerm({ body }: { body: unknown }) {
  const tid = (body as TerminalBody | null)?.tid, link = store.link();
  const [buf, setBuf] = useState("");
  useEffect(() => {
    if (!tid || !link) return;
    let on = true, seq = 0;
    const off = link.listen((m: { type?: string; tid?: string; data?: string; seq?: number }) => {
      if (m.tid === tid && m.type === "work.term.out" && (Number(m.seq) || 0) > seq) setBuf((b) => (b + String(m.data ?? "")).slice(-8000));
    });
    void link.ask<{ buf?: string; seq?: number }>("work.term.attach", { tid }).then((r) => { if (on) { seq = r.seq ?? 0; setBuf(r.buf ?? ""); } });
    return () => { on = false; off(); };
  }, [tid, link]);
  return <pre className="st-tterm">{lastLines(buf)}</pre>;
}
