// The page the session wrote, as a document leaving Home (fr-30, slice 1): the page pane's own foot strip, the same
// crossing as the stage's: "→ <project> · Artifacts  Send  Keep in Home", then a chip with 8 s of Undo. Only in a
// session with a project chip; the page itself is untouched.
import { useEffect, useState } from "react";
import type { Work } from "../../work/useWork";
import { ask, type Proposal } from "./store";
import { CrossingFoot, SentChip } from "./CrossingFoot";
import { fly, landingOf, pulse } from "./fly";
import "./v3.css";

type St = { p: Proposal; state: "ready" | "sending" | "sent" | "kept"; token?: string; until?: number } | null;

export default function PageFoot({ w, title, path }: { w: Work; title: string; path?: string }) {
  const s = w.live ? w.sessions.find((x) => x.id === w.live) : undefined;
  const room = s?.roomId;
  const [st, setSt] = useState<St>(null);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setSt(null);
    if (!room || !s) return;
    let live = true;
    void ask<{ proposal?: Proposal | null }>("team.v3.cross.propose", { sessionId: s.id, room, roomName: w.roomNames[room] ?? "", topic: s.title, kind: "document", title, text: path ?? title })
      .then((r) => { if (live && r.proposal) setSt({ p: r.proposal, state: "ready" }); });
    return () => { live = false; };
  }, [room, title, path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st || st.state === "kept") return null;
  const t = { ...st.p, state: st.state, token: st.token, until: st.until, at: 0, by: "you" as const };
  const send = async () => {
    setSt({ ...st, state: "sending" });
    const flight = fly(el?.closest(".wpagep")?.querySelector<HTMLElement>(".wfbar") ?? null, landingOf(st.p.project));
    const r = await ask<{ token?: string }>("team.v3.cross.send", { proposal: st.p });
    await flight;
    if (r.token) { pulse(landingOf(st.p.project)); setSt({ ...st, state: "sent", token: r.token, until: Date.now() + 8000 }); } else setSt({ ...st, state: "ready" });
  };
  const undo = async () => { const r = await ask<{ ok?: boolean }>("team.v3.cross.undo", { token: st.token }); if (r.ok) setSt({ ...st, state: "ready", token: undefined, until: undefined }); };
  return (
    <div ref={setEl} className="v3-pagefoot">
      {st.state === "sent" ? <SentChip t={t} onUndo={() => void undo()} onSettle={() => setSt({ ...st, state: "kept" })} />
        : <CrossingFoot t={t} onSend={() => void send()} onKeep={() => setSt({ ...st, state: "kept" })} />}
    </div>
  );
}
