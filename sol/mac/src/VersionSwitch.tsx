// The version switch (#1295): three segments at the top of the window, always there, in the team's own Sol only (an
// engine whose checkout is sol-dev says `team`; a tester's or a copy's draws nothing). concept and complete write the
// setting `version` (engine versions.ts modeOf reads it, every switch turns with it). product (#1427, Frank 2026-11-17
// "A") only looks like what beta's people run: it writes complete and keeps following dev, updating every day; the
// button names the release beta's people run. The pick is kept in this window (`sol.version.pick`). A Sol already on
// beta lights product, and leaving it for concept or complete follows dev again. What is lit is the engine's answer to
// team.channel.get, asked when the link comes up and after every press; until it answers, a press shows at once. Each
// answer is also kept for the window's own night switches (flag.ts noteVersion, #1427): they turn with the version at
// once, no restart.
import { useCallback, useEffect, useState } from "react";
import { ENGINE } from "./useEngine";
import { link } from "./socket";
import { litOf, pressOf, type Pick, type State } from "./versionPick";
import { noteVersion } from "./flag";
import "./version-switch.css";

export const meta = {
  VersionSwitch: {
    job: "Which version this Sol runs as: concept, complete, or product (the release beta's people run)",
    flow: "mine",
    states: ["concept", "complete", "product", "product, staying on a newer release until beta reaches it (a Sol already on beta)", "hidden (not the team's checkout)"],
    keys: [
      { press: "click concept or complete", does: "this Sol runs as that version from now on, following dev, with no restart" },
      { press: "click product", does: "this Sol looks like what the people who use Sol run (switches as in complete), and still updates every day" },
    ],
    listens: ["team.channel (the engine's answer to team.channel.get)"],
  },
};

const PICKS: [Pick, string][] = [["concept", "concept"], ["complete", "complete"], ["product", "product"]];

const PICK_KEY = "sol.version.pick";
const pickedNow = (): Pick | null => { try { return localStorage.getItem(PICK_KEY) === "product" ? "product" : null; } catch { return null; } };
const keepPick = (p: Pick) => { try { if (p === "product") localStorage.setItem(PICK_KEY, p); else localStorage.removeItem(PICK_KEY); } catch { /* private */ } };

export function VersionSwitch({ setSettings }: { setSettings: (patch: object) => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [picked, setPicked] = useState<Pick | null>(pickedNow);
  const L = ENGINE ? link(ENGINE) : null;
  const ask = useCallback((type: string, body: object = {}) => new Promise<any>((ok) => {
    if (!L) return ok({});
    const rid = crypto.randomUUID();
    const off = L.on((m) => { if (m?.rid === rid) { off(); ok(m); } });
    if (!L.send({ type, rid, ...body })) { off(); ok({}); }
    window.setTimeout(() => { off(); ok({}); }, 25_000);
  }), [L]);
  const look = useCallback(() => void ask("team.channel.get").then((m) => { if (m?.type === "team.channel" && !m.error) { setSt(m); noteVersion(m); } }), [ask]);
  useEffect(() => L?.onLink((up) => { if (up) look(); }), [L, look]);
  if (!st?.team) return null;
  const lit = litOf(st, picked);
  const press = async (p: Pick) => {
    if (p === lit) return;
    const o = pressOf(p, st);
    keepPick(p); setPicked(p === "product" ? p : null);
    setSt((s) => ({ ...s, ...(o.channel ? { channel: o.channel, stays: false } : {}), mode: o.version }));
    noteVersion({ team: st.team, mode: o.version });   // the answer below confirms
    setSettings({ version: o.version });
    if (o.channel) await ask("team.settings", { patch: { channel: o.channel } });
    look();
  };
  const tag = st.stable || "";
  const said = (p: Pick) => p === "concept" ? "everything on main, ideas on their way included"
    : p === "complete" ? "only what works for every person"
    : st.channel === "beta" ? `what the people who use Sol run: ${tag || "no release has gone to them yet"}${st.stays ? `; you stay on ${st.release || "your release"} until it reaches it` : ""}`
    : `looks like what the people who use Sol run (${tag || "no release has gone to them yet"}); this Sol still updates every day`;
  return (
    <div className="vswitch" role="group" aria-label="version" data-no-drag>
      {PICKS.map(([p, l]) => (
        <button key={p} type="button" className={p === lit ? "on" : ""} aria-pressed={p === lit} title={said(p)} onClick={() => void press(p)}>
          {l}{p === "product" && tag && <small>{tag}</small>}
        </button>
      ))}
    </div>
  );
}
