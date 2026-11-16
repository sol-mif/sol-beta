// Who used what (#431, round 76): the hook that asks the engine for the project's used marks (`team.used`) and hears it
// again after a mark of mine; the project page's block; and the small mark under a reply that read the project.
// The words are cowork/usedWords.ts's.
import { useEffect, useState } from "react";
import type { Team } from "./useTeam";
import { DEV_TEAM } from "./useTeam";
import { Who, since } from "./bits";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { markLine, markTitle, usedOf, usedRows, type UsedView } from "./usedWords";
import "./used.css";

const ago = (at: string) => (since(at) === "now" ? "now" : `${since(at)} ago`);
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString().slice(0, 16) + "Z";
const FAKE: UsedView = { repo: "cloud:DEMO", people: {   // the dev team's page (DEV_TEAM), as the other pages fake theirs
  frank: [{ who: "frank", part: "memory", at: minsAgo(40), version: "dev-20261030-0900" }, { who: "frank", part: "goal", at: minsAgo(300), version: "dev-20261030-0900" }],
  isaac: [{ who: "isaac", part: "feed", at: minsAgo(60 * 26), version: "dev-20261029-0900" }],
} };

/** the project's used marks, asked once a project and every five minutes while shown; pushed after my own mark */
export function useUsed(team: Pick<Team, "ask">, roomId: string): UsedView | null {
  const [v, setV] = useState<UsedView | null>(DEV_TEAM ? FAKE : null);
  useEffect(() => {
    if (DEV_TEAM) return;
    let live = true;
    const ask = () => void team.ask<UsedView>("team.used", {}, 30_000).then((m) => { if (live && !m.error) setV(m); }, () => {});
    ask();
    const t = setInterval(ask, 5 * 60_000);
    const off = link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.used" && !m.error) setV(m as UsedView); });
    return () => { live = false; clearInterval(t); off(); };
  }, [team.ask, roomId]);
  return v;
}

/** the project page's block: each person who used something lately, the parts and when */
export function UsedBlock({ v }: { v: UsedView | null }) {
  const rows = v ? usedRows(v) : [];
  return (
    <section className="pj-part" aria-label="who used what">
      <h3 className="rm-pg-h">who used what</h3>
      {!rows.length ? <p className="tl-none">{v?.note ?? "nobody's agent has read the project in the last 30 days"}</p> : (
        <dl className="pj-grid us-grid">{rows.map((r) => (
          <div key={r.who} className="us-row"><dt className="pj-who"><span><Who login={r.who} size={18} title={r.who} />{r.who}</span></dt>
            <dd>{r.parts.map((p) => <span key={p.part} className="us-part" title={`${r.who}'s agent read the ${p.word} ${ago(p.at)}${p.version ? `, on ${p.version}` : ""}`}>{p.word} <small>{ago(p.at)}</small></span>)}</dd></div>
        ))}</dl>
      )}
      <p className="pj-from">a part, when and which version; never what was read · kept in the project's record, .sol/used/</p>
    </section>
  );
}

/** the small mark under a reply that read the project (the item's usedCowork) */
export function UsedMark({ used }: { used: unknown }) {
  const parts = usedOf(used);
  if (!parts.length) return null;
  return <p className="us-mark" title={markTitle(parts)}><span className="us-dot" aria-hidden />{markLine(parts)}</p>;
}
