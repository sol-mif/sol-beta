// The live block (#485, the engine's team/live.ts): what is running and how it is doing, for Sol developers. The
// newest dev release, the morning run's line on it (the gate and the first-timer, as counts), and the errors on Sol
// testers' and Sol developers' Macs by feature, type of error and Sol version. Drawn as analytics is: quiet, counts
// only, no tester named, every number also in words.
import { liveOf, liveLine, devWord, compact, md, type Live } from "./tool.ts";
import { Fig, Section, Bars, ago } from "./Analytics.tsx";
import { openUrl } from "../util";
import { DEV_TEAM } from "../useTeam";

type PageProps = { data: unknown; refresh: () => void };

const featureLabel = (f: { id: string; name: string }) => (f.id ? `${f.id} ${f.name}` : "no feature yet");

export function LivePage({ data, refresh }: PageProps) {
  const l: Live | null = liveOf(data);
  if (!l) return <p className="tt-no">the live block could not be read</p>;
  const m = l.morning, e = l.errors;
  const onRelease = m && l.release && m.tag === l.release.tag;
  const onNewest = e ? e.features.reduce((s, f) => s + f.onNewest, 0) : 0;
  return (
    <div className="tt-an">
      <p className="tt-week"><b>{liveLine(l)}</b><span>read {ago(l.read)}</span>
        <button className="rm-th-link u" onClick={refresh}>read again</button></p>
      {l.notes.map((n, i) => <p key={i} className="rm-pg-foot">{n}</p>)}

      <div className="an-figs" role="list">
        <Fig label="running" value={l.release ? devWord(l.release.tag) : "–"} sub={l.release ? `made ${ago(l.release.at)}` : "no dev release yet"} />
        <Fig label="the gate" value={!onRelease ? "–" : m!.green === true ? "green" : m!.green === false ? "red" : "not run"} sub={onRelease ? "the morning run on it" : m ? `last on ${devWord(m.tag)}` : "no morning run yet"} />
        <Fig label="first-timer findings" value={onRelease && m!.findings !== null ? String(m!.findings) : "–"} sub={onRelease ? "what confused it, counted" : "not tried yet"} />
        <Fig label="errors on it" value={e && l.release ? compact(onNewest) : "–"} sub={e ? `${compact(e.total)} in ${e.window.days} days` : "the counts are not here"} />
      </div>

      {m && (
        <Section title="the morning run" sub="its line on the Night digest: counts and feature ids only; what the first-timer wrote stays on the machine it ran on">
          <p className="an-sub">{m.head}</p>
          <p className="rm-pg-foot">posted {ago(m.at)}{m.by ? ` by ${m.by}` : ""}{m.url ? <> · <button className="rm-th-link u" onClick={() => { if (!DEV_TEAM) openUrl(m.url!); }}>open it on GitHub</button></> : null}</p>
        </Section>
      )}

      {e && (
        <Section title="errors by feature" sub={`${md(e.window.from)} to ${md(e.window.to)} · which feature, what type of error, which Sol version · never what failed${e.mapped ? "" : " · no feature map here, so all are under no feature"}`}>
          {e.features.length ? <>
            <Bars rows={e.features.map((f) => ({ key: f.id || "none", label: featureLabel(f), value: f.events, sub: `${f.testers}+ tester${f.testers === 1 ? "" : "s"}${l.release ? ` · ${f.onNewest} on ${devWord(l.release.tag)}` : ""}` }))} unit="errors" />
            <details className="an-table">
              <summary>by type and release</summary>
              <table>
                <thead><tr><th>feature</th><th>types of error</th><th>by release</th></tr></thead>
                <tbody>{e.features.map((f) => (
                  <tr key={f.id || "none"}><td>{featureLabel(f)}</td><td>{f.types.map((t) => `${t.type} ${t.events}`).join(", ")}</td><td>{f.releases.map((r) => `${r.release ? devWord(r.release) : "a build of its own"} ${r.events}`).join(", ")}</td></tr>
                ))}</tbody>
              </table>
            </details>
          </> : <p className="an-none">no errors counted in the window</p>}
        </Section>
      )}

      <p className="rm-pg-foot rm-gp-foot">error counts from Sol's cloud · the release from the timeline · the morning run from the Night digest · kept two minutes · a team tool · turned on and off in the project settings</p>
    </div>
  );
}

// ?dev=team: a morning on the SOL project, so the page can be seen with no engine and no cloud
export function fakeLive(): Live {
  const day = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const tag = (n: number) => `dev-${day(n).replace(/-/g, "")}`;
  const at = (n: number, h = 13) => `${day(n)}T${String(h).padStart(2, "0")}:00:00.000Z`;
  return {
    release: { tag: tag(0), at: at(0), sha: "a710886c2f1e" },
    morning: { head: `Morning run, ${tag(0)}: gate green · first-timer 3 runs, 2 findings · 4 features touched`, tag: tag(0), at: at(0, 13), by: "sol-release-runner", green: true, findings: 2 },
    errors: { window: { days: 30, from: day(29), to: day(0) }, total: 41, mapped: true, features: [
      { id: "fr-07", name: "Cowork pages", events: 19, testers: 3, onNewest: 6, types: [{ type: "TypeError", events: 12 }, { type: "ENOENT", events: 7 }], releases: [{ release: tag(0), events: 6 }, { release: tag(1), events: 13 }] },
      { id: "fr-02", name: "First message", events: 11, testers: 2, onNewest: 0, types: [{ type: "AbortError", events: 11 }], releases: [{ release: tag(3), events: 11 }] },
      { id: "fr-12", name: "Update", events: 4, testers: 1, onNewest: 1, types: [{ type: "ECONNREFUSED", events: 4 }], releases: [{ release: tag(0), events: 1 }, { release: tag(1), events: 3 }] },
      { id: "", name: "no feature yet", events: 7, testers: 4, onNewest: 2, types: [{ type: "Error", events: 7 }], releases: [{ release: tag(0), events: 2 }, { release: "", events: 5 }] },
    ] },
    read: new Date(Date.now() - 40_000).toISOString(),
    notes: [],
  };
}
