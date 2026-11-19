// Cowork's map from a spec file, for stills and a look without an engine (#1433). Dev only.
//   cowork-map.html?spec=<url of a cowork-spec.json, or a team.map read>&me=<login>#who=&view=&at=&open=&off=&type=&t=
// The address after # is where the person stands (scene.ts readAddress); a press writes it back, so a still is a link.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CoworkMap } from "./Map";
import { readAddress, seatOf, writeAddress, type MapState } from "./scene";
import type { MapSpec } from "./spec";
import { DEEP } from "./vars";
import "../../palette.css";

const q = new URLSearchParams(location.search);
document.body.style.margin = "0";
document.body.style.background = DEEP;

function Page() {
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [st, setSt] = useState<MapState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(q.get("spec") ?? "/cowork-spec.json").then((r) => r.json()).then((x) => {
      const s: MapSpec = x.spec ?? x;
      setSpec(s); setSt(readAddress(location.hash, s, seatOf(s, q.get("me") ?? x.me ?? "")));
    }).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { if (spec && st) history.replaceState(null, "", location.search + writeAddress(st, spec)); }, [spec, st]);
  if (error) return <p style={{ color: "var(--ink)" }}>{error}</p>;
  if (!spec || !st) return null;
  return <div style={{ padding: "var(--s4) var(--s6) var(--s6)" }}><CoworkMap spec={spec} st={st} onState={setSt} crumbs /></div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
