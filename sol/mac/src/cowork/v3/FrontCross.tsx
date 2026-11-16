// Cowork v3 (fr-30): slice 1's crossing card for the front's drops. The front (slice 2, Front.tsx) fires the shared DOM
// event 'sol:cross' when a thing is dropped on a project; this catches it (preventDefault, so the front draws nothing of
// its own) and shows slice 1's card: the thing, its lower edge "→ <project> · Plan  Send  Keep in Home", then the sent
// chip with Undo for 8 s. Send is the front's own write (team.v3.plan drop: the thing lands in the project's Space),
// so the front's tiles and the one count read it back at once. Drawn outside the front's `.v3` box (v3.css is slice 1's).
import { useEffect, useState } from "react";
import { CrossingFoot, SentChip } from "./CrossingFoot";
import { write } from "./front-store";
import type { CrossDetail } from "./Front";
import type { Thing } from "./store";
import "./v3.css";

const KIND: Record<string, Thing["kind"]> = { item: "item", document: "document", page: "document", automation: "automation" };
export function FrontCross({ names }: { names: Record<string, string> }) {
  const [t, setT] = useState<(Thing & { d: CrossDetail }) | null>(null);
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<CrossDetail>).detail;
      if (!d?.thing || !d.to?.project) return;
      ev.preventDefault();
      setT({ id: `front-${Date.now()}`, kind: KIND[d.thing.kind] ?? "note", title: d.thing.title, project: d.to.project, projectName: names[d.to.project] ?? d.to.project,
        spot: d.to.spot, whose: d.thing.whose, from: "front", words: d.thing.title, state: "ready", at: Date.now(), by: "you", d });
    };
    window.addEventListener("sol:cross", on);
    return () => window.removeEventListener("sol:cross", on);
  }, [names]);
  if (!t) return null;
  const send = async () => {
    setT({ ...t, state: "sending" });
    const r = await write<{ loose: string; undo: string }>(t.project, "drop", { title: t.d.thing.title, kind: t.d.thing.kind, place: t.d.thing.place });
    if (r.error || !r.result) { setT({ ...t, state: "ready" }); return; }
    setT({ ...t, state: "sent", token: r.result.undo, until: Date.now() + 8000 });
  };
  const undo = async () => { const s = t; setT(null); if (s.token) await write(s.project, "undo", { token: s.token }); };
  return (
    <div className="v3-frontcross" role="dialog" aria-label="crossing">
      <div className="v3-piece">
        {t.state === "sent" ? <SentChip t={t} onUndo={() => void undo()} onSettle={() => setT(null)} />
          : <div className="v3-piece-body">
            <div className="v3-card"><div className="v3-kind">{t.kind}<span className="v3-tabline" /></div><div className="v3-title">{t.title}</div></div>
            <CrossingFoot t={t} onSend={() => void send()} onKeep={() => setT(null)} />
          </div>}
      </div>
    </div>
  );
}
