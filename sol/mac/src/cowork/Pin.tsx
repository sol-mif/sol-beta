// Pin and go back (#426, B3 of #413; engine team/pin.ts, PROTOCOL.md round 79). Two places:
//   the timeline   a release's detail has "go back here" (any of the last thirty days' but the one I run)
//   Settings       the engine drawer's "pinned" row (pin here / back to latest) and "go back to" (a release picked)
// Going back always says first, in plain words, what moves and what saved data is lost, and goes only on a second
// press, which sends back the plan's `sure`: what was said is what happens. Words: pin, go back, back to latest, lost.
import { useEffect, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { teamAsk } from "./stable";
import { pinViewOf, planOf, pinLine, goable, dayOf, losesData, type PinView, type PinPlan } from "./pinWords";

/** the pin as the engine says it: asked once, told again on every change (team.pin), and the last failure */
export function usePin(up = true): { v: PinView | null; failed: string; again: () => void } {
  const [v, setV] = useState<PinView | null>(null);
  const [failed, setFailed] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!up) return;
    let live = true;
    void teamAsk("team.pin.get", {}, 60_000).then((m) => { if (live) setV(pinViewOf(m)); });
    const off = link(ENGINE)?.on((m) => {
      if (!live || m?.rid != null) return;
      if (m?.type === "team.pin") { const got = pinViewOf(m); if (got) { setV(got); if (got.going) setFailed(""); } }
      if (m?.type === "team.pin.failed") setFailed(`could not go back to ${m.tag}: ${m.error}`);
      if (m?.type === "team.pin.carry") setFailed(String(m.said ?? ""));
    });
    return () => { live = false; off?.(); };
  }, [up, n]);
  return { v, failed, again: () => setN((x) => x + 1) };
}

/** "go back here": the plan's warning first, then "yes, go back" */
export function GoBackHere({ tag, label = "go back here" }: { tag: string; label?: string }) {
  const [plan, setPlan] = useState<PinPlan | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPlan(null); setSaid(""); }, [tag]);
  const look = async () => {
    setBusy(true); setSaid("");
    const p = planOf(await teamAsk("team.pin.plan", { tag }, 60_000));
    setBusy(false);
    if ("error" in p) setSaid(p.error); else setPlan(p);
  };
  const go = async () => {
    if (!plan) return;
    setBusy(true);
    const r = await teamAsk<{ ok?: boolean; waiting?: boolean }>("team.pin.back", { tag, sure: plan.sure }, 60_000);
    setBusy(false);
    setPlan(null);
    setSaid(r.error ? r.error : r.waiting ? `going back to ${tag} as soon as nothing is at work…` : `going back to ${tag}…`);
  };
  return (
    <div className={`pin-back ${plan?.lost.length ? "loses" : ""}`}>
      {!plan
        ? <button className="gp-quiet" disabled={busy} onClick={() => void look()}>{busy ? "looking…" : label}</button>
        : <>
            <p className="pin-said">{plan.said}</p>
            <span className="pin-act">
              <button className="stop sure" disabled={busy} onClick={() => void go()}>{plan.lost.length ? "yes, go back and lose that" : "yes, go back"}</button>
              <button className="gp-quiet" disabled={busy} onClick={() => setPlan(null)}>not now</button>
            </span>
          </>}
      {said && <p className="pin-said dim">{said}</p>}
    </div>
  );
}

/** Settings › engine: the pin row and the go back row */
export function PinRows({ up }: { up: boolean }) {
  const { v, failed } = usePin(up);
  const [pick, setPick] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  if (!up || !v) return null;
  const list = goable(v);
  const chosen = list.find((r) => r.tag === pick) ?? null;
  const ask = async (type: string, body: object = {}) => {
    setBusy(true); setSaid("");
    const r = await teamAsk<{ ok?: boolean; update?: { ok?: boolean; error?: string } }>(type, body, 300_000);
    setBusy(false);
    setSaid(r.error ? r.error : r.update && !r.update.ok ? `unpinned; the update: ${r.update.error ?? "did not go"}` : "");
  };
  return (
    <>
      <dt>pinned</dt>
      <dd className="pin-row">
        <span className="pin-line">{pinLine(v)}</span>
        {!v.going && (v.pin
          ? <button className="link" disabled={busy} onClick={() => void ask("team.pin.clear", { update: true })}>{busy ? "…" : "back to latest"}</button>
          : <button className="link" disabled={busy} onClick={() => void ask("team.pin.set")} title="stay on this release and take no new one until back to latest">{busy ? "…" : "pin here"}</button>)}
        {(said || failed) && <span className="pin-said dim">{said || failed}</span>}
      </dd>
      {list.length > 0 && !v.going && <>
        <dt>go back to</dt>
        <dd className="pin-row">
          <select className="pin-pick" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="a release of the last thirty days">
            <option value="">a release of the last 30 days…</option>
            {list.map((r) => <option key={r.tag} value={r.tag}>{r.tag} · {dayOf(r.at)}{losesData(v, r) ? " · loses some saved data" : ""}{r.pins ? "" : " · no back to latest"}</option>)}
          </select>
          {chosen && <GoBackHere key={chosen.tag} tag={chosen.tag} label="what going back does" />}
        </dd>
      </>}
    </>
  );
}
