// A team tool's page (#436, PROTOCOL round 81), drawn in the project's centre under the tool's own head (Tools.tsx):
// first what it reads and from where, who owns it, and that it is for the project's members only; then the tool's own
// page, given the data the engine sent. The engine is the gate (team/teamtool.ts): a person who is not one of the
// project's members, or a tool that is off, gets the refusal in words and no data. A new team tool is one page here
// (PAGES), one reader in the engine, one block in blocks.json (sol/README.md, "How to add a team tool").
import { useEffect, useState } from "react";
import type { Team } from "../useTeam";
import { DEV_TEAM } from "../useTeam";
import { Who } from "../bits";
import { openUrl } from "../util";
import { teamToolOf, foldsOf, weekLine, dayHead, KIND_WORD, type TeamTool, type ToolAnswer, type FoldsWeek } from "./tool.ts";
import type { Block } from "../blocks/live.ts";
import { AnalyticsPage } from "./Analytics.tsx";
import { FeaturesPage } from "./Features.tsx";
import { LivePage, fakeLive } from "./Live.tsx";
import "./teamtools.css";

type PageProps = { data: unknown; refresh: () => void };

/** each team tool's page, by the `page` its block names */
export const PAGES: Record<string, (p: PageProps) => React.ReactElement> = {
  folds: FoldsPage,
  analytics: AnalyticsPage,
  features: FeaturesPage,
  live: LivePage,
};

/** what it reads, who owns it, who may open it: always shown, before and whatever the engine answers */
function Says({ tool }: { tool: TeamTool }) {
  return (
    <section className="tt-says" aria-label="what this tool reads">
      <p className="tt-gate"><span className="tt-lock" aria-hidden="true">●</span> {tool.gate === "devs" ? "for this project's Sol developers only (the leads and reviewers its settings name)" : "for this project's members only"} · Sol checks before anything is read</p>
      <ul className="tt-reads">
        {tool.reads.map((r, i) => <li key={i}><span className="tt-what">{r.what}</span><span className="tt-from">from {r.from}</span></li>)}
      </ul>
      <p className="tt-owner">kept by <Who login={tool.owner} size={16} title={tool.owner} /> {tool.owner} · reads only, writes nothing</p>
    </section>
  );
}

export function TeamToolBody({ team, block }: { team: Team; block: Block }) {
  const tool = teamToolOf(block)!;
  const [a, setA] = useState<ToolAnswer | null>(DEV_TEAM ? { id: block.id, tool, data: FAKE[block.id] } : null);
  const ask = (refresh = false) => {
    if (DEV_TEAM) return;
    void team.ask<ToolAnswer & { error?: string }>("team.tool", { id: block.id, ...(refresh ? { refresh: true } : {}) }, 30_000)
      .then(setA, () => setA({ id: block.id, error: "the engine did not answer: try again in a minute" }));
  };
  useEffect(() => { ask(); }, [team.ask, block.id]);
  const Page = PAGES[tool.page];
  return (<>
    <Says tool={tool} />
    {!a ? <p className="rm-pg-foot">checking you are one of the project's members…</p>
      : a.error ? <p className={`tt-no ${a.gate ?? ""}`} role="status">{a.error}</p>
      : Page ? <Page data={a.data} refresh={() => ask(true)} />
      : <p className="tt-no">this Sol cannot draw {block.name} yet: update Sol</p>}
  </>);
}

// ---- this week's folds ----

const KIND_CLASS: Record<string, string> = { folded: "ok", rechecked: "ok", passed: "ok", "sent-back": "back", broke: "back", held: "back", landed: "plain" };
function FoldsPage({ data, refresh }: PageProps) {
  const w: FoldsWeek | null = foldsOf(data);
  if (!w) return <p className="tt-no">the week could not be read</p>;
  const today = todayOf(w.zone);
  return (<>
    <p className="tt-week"><b>{weekLine(w)}</b><span>since monday {w.since.slice(5).replace("-", "/")}{w.zone ? ` · ${w.zone.split("/").pop()?.replace(/_/g, " ")} time` : ""}</span>
      <button className="rm-th-link u" onClick={refresh}>read again</button></p>
    {w.note && <p className="rm-pg-foot">{w.note}</p>}
    {w.days.length === 0 && <p className="tl-none">nothing went in or was sent back yet this week: the dev night at nine reads what was handed in</p>}
    {w.days.map((d) => (
      <section key={d.day} className="tt-day" aria-label={dayHead(d.day, today)}>
        <h4 className="rm-pg-h">{dayHead(d.day, today)}</h4>
        <ul className="tt-folds">
          {d.folds.map((f, i) => (
            <li key={`${f.kind}:${f.number ?? ""}:${f.at}:${i}`}>
              <span className={`tt-k ${KIND_CLASS[f.kind] ?? "plain"}`}>{f.kind === "sent-back" && f.how ? `back · ${f.how}` : KIND_WORD[f.kind]}</span>
              {f.url ? <button className="tt-t" onClick={() => { if (!DEV_TEAM) openUrl(f.url!); }} title="open it on GitHub">{f.text}</button> : <span className="tt-t">{f.text}</span>}
              <span className="tt-by">{f.who ? <><Who login={f.who} size={16} title={f.who} />{f.who}{f.agent ? "'s agent" : ""}</> : ""}</span>
              <span className="tt-at">{new Date(f.at).toTimeString().slice(0, 5)}</span>
            </li>
          ))}
        </ul>
      </section>
    ))}
    <p className="rm-pg-foot rm-gp-foot">read from the project's feed once a minute at most · a team tool · turned on and off in the project settings</p>
  </>);
}
const todayOf = (zone: string) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone || undefined }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };

// ?dev=team: a week of the SOL project, so the page can be seen with no engine
const FAKE: Record<string, unknown> = (() => {
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const iso = (n: number, h: number, m = 0) => { const d = day(n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const key = (n: number) => new Intl.DateTimeFormat("en-CA").format(day(n));
  const u = (n: number) => `https://github.com/sol-mif/sol-dev/pull/${n}`;
  const days = [
    { day: key(0), folds: [
      { at: iso(0, 21, 14), day: key(0), who: "marcocyl04-ux", agent: false, kind: "folded", number: 450, text: "#450 into sol-dev", url: u(450) },
      { at: iso(0, 21, 9), day: key(0), who: "marcocyl04-ux", agent: false, kind: "sent-back", how: "slight", number: 447, text: "sent back #447 (slight)", url: u(447) },
      { at: iso(0, 21, 3), day: key(0), who: "marcocyl04-ux", agent: false, kind: "folded", number: 469, text: "#469 into sol-dev", url: u(469) },
    ] },
    { day: key(1), folds: [
      { at: iso(1, 9, 12), day: key(1), who: "franktsai2008-eng", agent: false, kind: "passed", text: "the dev release of 2026-10-28 into beta" },
      { at: iso(1, 6, 2), day: key(1), who: "marcocyl04-ux", agent: true, kind: "rechecked", number: 447, text: "re-checked #447, into sol-dev", url: u(447) },
      { at: iso(1, 0, 40), day: key(1), who: "supertsai", agent: false, kind: "landed", number: 444, text: "#444 tester email landed on main", url: u(444) },
    ] },
    { day: key(2), folds: [
      { at: iso(2, 21, 30), day: key(2), who: "marcocyl04-ux", agent: false, kind: "sent-back", how: "severe", number: 438, text: "sent back #438 (severe)", url: u(438) },
      { at: iso(2, 21, 22), day: key(2), who: "marcocyl04-ux", agent: false, kind: "folded", number: 431, text: "#431 into sol-dev", url: u(431) },
    ] },
  ];
  const all = days.flatMap((d) => d.folds);
  const count = (k: string) => all.filter((f) => f.kind === k).length;
  return { analytics: fakeAnalytics(), features: fakeFeatures(), live: fakeLive(), folds: { since: key((day(0).getDay() + 6) % 7), zone: "America/New_York", days,
    counts: { folded: count("folded"), rechecked: count("rechecked"), "sent-back": count("sent-back"), broke: 0, passed: count("passed"), held: 0, landed: count("landed") } } };
})();

// ?dev=team: thirty days of a small beta, three dev releases, so analytics can be seen with no engine and no cloud
function fakeAnalytics() {
  const day = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const wave = [0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 2, 0, 5, 6, 4, 7, 3, 0, 1, 6, 8, 7, 9, 6, 2, 3, 8, 10, 9, 11];
  const people = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 2, 2, 2, 1, 0, 1, 3, 3, 3, 4, 3, 2, 2, 4, 5, 5, 5];
  const fresh: Record<number, number> = { 8: 1, 12: 1, 19: 1, 22: 1, 27: 1 };
  const days = wave.map((w, i) => ({ day: day(29 - i), events: w * 23 + (w ? (i * 7) % 19 : 0), testers: people[i], new: fresh[i] ?? 0 }));
  const events = days.reduce((s, d) => s + d.events, 0);
  const at = (n: number) => `${day(n)}T13:00:00.000Z`;
  return {
    window: { days: 30, from: day(29), to: day(0) }, total: { events, testers: 5 }, days,
    names: [["turn.done", 1210, 5], ["turn.start", 1188, 5], ["engine.up", 214, 5], ["notch.open", 166, 4], ["cowork.used", 92, 3], ["mode.switch", 88, 5], ["grab.shot", 41, 2], ["update.run", 30, 5], ["other", 57, 4]]
      .map(([name, ev, t]) => ({ name, events: ev, testers: t })),
    modes: [{ mode: "home", events: 1650, testers: 5 }, { mode: "work", events: 1110, testers: 4 }, { mode: "cowork", events: 326, testers: 3 }],
    parts: [{ part: "memory", events: 38, testers: 3 }, { part: "things", events: 21, testers: 2 }, { part: "goal", events: 17, testers: 3 }, { part: "decisions", events: 9, testers: 1 }, { part: "calendar", events: 7, testers: 1 }],
    active: [{ span: "1", testers: 1 }, { span: "2-3", testers: 1 }, { span: "4-7", testers: 1 }, { span: "8+", testers: 2 }],
    versions: [
      { release: "main", sols: ["c81fa20"], testers: 1, events: 140 },
      { release: `dev-${day(1)}`, at: at(1), kind: "dev", sols: ["a710886", "95041b7"], testers: 3, events: 610 },
      { release: `dev-${day(6)}`, at: at(6), kind: "dev", sols: ["fc007c9"], testers: 1, events: 1430 },
      { release: `dev-${day(13)}`, at: at(13), kind: "dev", sols: ["ed03d7a"], testers: 0, events: 880 },
      { release: "", sols: ["3b9e0d1"], testers: 0, events: 26 },
    ],
    releases: [{ tag: `dev-${day(13)}`, at: at(13), kind: "dev" }, { tag: `dev-${day(6)}`, at: at(6), kind: "dev" }, { tag: `dev-${day(1)}`, at: at(1), kind: "dev" }],
    read: new Date(Date.now() - 40_000).toISOString(),
  };
}

// ?dev=team: a few features of the map, so the Features page can be seen with no engine
function fakeFeatures() {
  const f = (id: string, name: string, type: string, label: string, where: string, evals: string, support: string[] = [], dependsOn: string[] = []) =>
    ({ id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), type, label, where, lead: "marcocyl04-ux", support, dependsOn, paths: [], off: null, evals });
  return {
    features: [
      f("fr-01", "Open Sol", "product", "base", "the window: launch, the first paint", "approved"),
      f("fr-03", "The first message", "product", "life", "Home: the box, the answer", "draft", [], ["fr-01"]),
      f("fr-07", "A session", "product", "work", "Work: a Claude Code session", "none", [], ["fr-01"]),
      f("fr-10", "The notch", "product", "base", "the notch: answers, the moon, pings", "none", [], ["fr-01"]),
      f("fr-20", "Cowork projects", "product", "cowork", "Cowork: a project, its people, its record", "none", ["franktsai2008-eng"], ["fr-01"]),
      f("fr-26", "The website", "marketing", "", "the website: sol.matterfold.tech", "none", ["w0ngtap"]),
      f("fr-27", "The nights", "internal", "cowork", "Cowork (Sol developers): hand-in, review, release", "none", [], ["fr-20"]),
    ],
    owners: { base: ["marcocyl04-ux"], cowork: ["marcocyl04-ux", "franktsai2008-eng"] },
    resort: { line: "6 PRs moved · 2 files no feature claims (1 with a proposal) · undo: SOL_RECORD=sol-mif/sol-dev bash sol/features --undo 20261031-0300", at: new Date(Date.now() - 6 * 3_600_000).toISOString(), undo: "SOL_RECORD=sol-mif/sol-dev bash sol/features --undo 20261031-0300" },
    read: new Date().toISOString(),
  };
}
