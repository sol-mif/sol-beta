// The map as a Cowork part (#1433 on #1416's places): its path is the chain of places down to where you stand, so
// crumbs, back, forward and Esc are the shell's; a place with places under it is a layer, a place without is its Street
// View over its layer. The rest of where you stand (whose seat, which view, the Time window, the Layers, the map type)
// is kept for the window. The spec is the engine's (team.map); your seat is the person your login is on it.
import { useEffect, useState } from "react";
import { askEngine } from "../askEngine";
import { nameChildren, partOf, place, type Place } from "../whole/place";
import { CoworkMap } from "./Map";
import { pathOf, readAddress, seatOf, stateOf, type MapState } from "./scene";
import type { MapSpec } from "./spec";

type Read = { spec?: MapSpec; me?: string; error?: string };
let kept: Read | null = null;
let rest: Omit<MapState, "at" | "open"> | null = null;

export function MapPart({ at, part = "map", room }: { at: Place; part?: string; room?: string }) {
  const [r, setR] = useState<Read | null>(kept);
  const [fold, setFold] = useState(false);
  const [n, setN] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    void askEngine("team.map", { refresh: n > 0 }, 90_000).then((x: any) => {
      if (gone) return;
      const read: Read = x?.error && !x?.spec ? { error: x.error === "not connected" ? "Jelly's engine is not running" : x.error } : { spec: x.spec, me: x.me };
      if (read.spec) kept = read;
      setR(read);
    });
    return () => { gone = true; };
  }, [n]);
  const spec = r?.spec;
  useEffect(() => { if (spec) nameChildren(part, Object.fromEntries(Object.values(spec.places).map((p) => [p.id, p.name]))); }, [spec, part]);
  if (!r) return <p className="cw-dim">reading the map…</p>;
  if (!spec) return <p className="cw-dim">Could not read the map: {r.error}. <button className="cw-link" data-act="read again" onClick={() => setN((x) => x + 1)}>read again</button></p>;
  if (!rest) { const s = readAddress("", spec, seatOf(spec, r.me ?? "")); rest = { who: s.who, view: s.view, hours: s.hours, off: s.off, type: s.type }; }
  const st = stateOf(spec, at.path, rest, fold);
  const onState = (next: MapState) => {
    const { at: _a, open: _o, ...base } = next;
    rest = base; setFold(next.open === "~fold");
    const path = pathOf(spec, next);
    if (path.join("/") !== at.path.join("/")) place.path(path);
    setTick((t) => t + 1);   // the rest (seat, view, window, Layers) is kept here, so this draws again
  };
  const gh = (p: string) => (spec.repo ? `https://github.com/${spec.repo}/${p}` : "");
  return (
    <div className="cw-pad" data-part={part}>
      <CoworkMap spec={spec} st={st} onState={onState} press={{
        issue: spec.repo ? (k) => place.open(gh(`issues/${k}`), `#${k}`) : undefined,
        change: spec.repo ? (sha) => place.open(gh(`commit/${sha}`), sha.slice(0, 7)) : undefined,
        room: room && partOf(room) ? () => place.go({ project: at.project, part: room, path: [] }) : undefined,
      }} />
    </div>
  );
}
