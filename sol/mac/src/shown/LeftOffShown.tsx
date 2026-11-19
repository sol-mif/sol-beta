// Where you left off, shown (#1020, look.shown): an empty Build's last three sessions in this folder, each as a small
// picture of the stage it left (its blocks where they lie, in their kind's colour), its title under it, its time on
// hover and for a screen reader. Read from the stage's store (a session's stage is asked for once, as the tray does).
import { useCallback, useSyncExternalStore } from "react";
import { store } from "../stage/engineStore";

type Past = { id: string; title?: string; updatedAt: number };
const W = 112, H = 68;

function Map({ id }: { id: string }) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(id, f), [id]), () => store.read(id));
  const places = seen.stage.blocks.filter((p) => !p.folded);
  const kinds = new globalThis.Map(seen.blocks.map((b) => [b.id, b.kind]));
  if (!places.length) return <svg className="sh-map" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={`M${W / 2 - 8} ${H / 2}h16`} className="sh-map-none" /></svg>;
  const right = Math.max(...places.map((p) => p.x + p.w)), bottom = Math.max(...places.map((p) => p.y + p.h));
  const k = Math.min((W - 8) / right, (H - 8) / bottom);
  return (
    <svg className="sh-map" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {places.map((p) => <rect key={p.id} data-kind={kinds.get(p.id) ?? "page"} x={4 + p.x * k} y={4 + p.y * k} width={Math.max(3, p.w * k - 2)} height={Math.max(3, p.h * k - 2)} rx={2} />)}
    </svg>
  );
}

export function LeftOffShown({ where, past, when, onOpen }: { where: string; past: Past[]; when: (t: number) => string; onOpen: (id: string) => void }) {
  return (
    <div className="st-leftoff sh-leftoff" data-part="where you left off" role="group" aria-label={`where you left off in ${where}`}>
      {past.map((s) => (
        <button key={s.id} tabIndex={-1} onClick={() => onOpen(s.id)} title={`${when(s.updatedAt)} · ${s.title || "untitled"}`} aria-label={`${when(s.updatedAt)} · ${s.title || "untitled"}`}>
          <Map id={s.id} />
          <span>{s.title || "untitled"}</span>
        </button>
      ))}
    </div>
  );
}
