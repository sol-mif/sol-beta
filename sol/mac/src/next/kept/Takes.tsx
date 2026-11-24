// While anything is dragged, every place that takes it lights up and says its verb (BR1, mine/look/br1/inside.html, the
// second of the six moments; the rules are notes/drop.ts targetAt): "give it to Menu page", "put in Client sites". The
// one under the pointer is armed and drawn by notes/Layer.tsx; these are the rest, faint, read once when the drag starts.
// data-moment="drop-places" is where a first-time tip hooks on. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { useMemo, useSyncExternalStore } from "react";
import { snapshot, subscribe, takers } from "../notes/drop.ts";
import { Overlay } from "../Overlay.tsx";

const verb = (t: { kind: "session" | "folder"; name: string }) => (t.kind === "session" ? `give it to ${t.name}` : `put in ${t.name}`);

export default function Takes() {
  const s = useSyncExternalStore(subscribe, snapshot), what = s.at ? s.what : null, key = what ? `${what.kind}:${what.id}` : "";
  const all = useMemo(() => (what ? takers(what) : []), [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const armed = s.armed ? `${s.armed.kind}:${s.armed.to}` : "";
  const rest = all.filter((t) => `${t.kind}:${t.to}` !== armed);
  if (!rest.length) return null;
  return (
    <Overlay>
      <div data-moment="drop-places" aria-hidden>
        {rest.map((t) => (
          <div key={`${t.kind}:${t.to}`} className={`kp-takes ${t.kind}`} data-takes-to={t.to} style={{ left: t.rect.x, top: t.rect.y, width: t.rect.w, height: t.rect.h }}>
            <span>{verb(t)}</span>
          </div>
        ))}
      </div>
    </Overlay>
  );
}
