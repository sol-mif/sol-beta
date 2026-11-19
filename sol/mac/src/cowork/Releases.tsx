// Releases (#1299, anchor 3 of 4 of #1194): Cowork › Releases. It replaces the timeline page (#424) and the anchor's
// "Version history + releases" tab: one line, newest first.
// - On top, where I stand: the release I am on and whether I am behind main, read in under five seconds; under it each
//   person against main, mine with its one press ("take main into my line", disabled with the reason: the engine has no
//   such action yet, #1253 does it by hand).
// - Each release is a row: its channel by shape (dev a ring, beta half filled, stable filled: look.md, the pearl marks
//   what has you), the tag, when, who ran it, how many joined, its knots as a count. A press opens it: what joined, by
//   person, and its knots as tilted notes in the meaning channel's red (tokens.json `fixed`: error).
// - Past the newest release, main: what joined and is not released; held by the night, it says why on the row itself.
// - A release that waits on a press carries the press card; a decision relayed on an issue is a decision card on the
//   line where it was said. Both are the kit's ActionCard: same frame, different press.
// The read is team.releases (engine/src/team/releases.ts); `fixture` (releases.html) draws without the engine.
import { useCallback, useEffect, useState } from "react";
import { ActionCard } from "../kit";
import { askEngine, type Ask } from "./askEngine";
import { outLabel, useOut } from "./whole/out";   // the comment opens in the app, a layer of Cowork's place (#1416)
import { releasesOf, lineOf, byPerson, behindWords, standing, channelWords, when, pressOf, type ReleasesRead, type ReleaseRow, type Decision, type Behind, type Channel } from "./releasesWords";
import { GoBackHere } from "./Pin";   // go back to a release of the last thirty days (#426), as the timeline had it
import { backable } from "./pinWords";
import "./releases.css";



const NONE = () => {};

/** the read: asked on open, and again on "read again" (the engine reads now) */
export function useReleases(ask: Ask = askEngine): { read: ReleasesRead | null; error: string; busy: boolean; again: () => void } {
  const [read, setRead] = useState<ReleasesRead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    void ask("team.releases", n ? { refresh: true } : {}, 90_000).then((m: any) => {
      if (!live) return;
      setBusy(false);
      const got = releasesOf(m);
      if (got) { setRead(got); setError(""); } else setError(m?.error === "not connected" ? "Sol's engine is not running" : String(m?.error ?? "this Sol's engine does not read releases yet"));
    });
    return () => { live = false; };
  }, [ask, n]);
  const again = useCallback(() => setN((x) => x + 1), []);
  return { read, error, busy, again };
}

/** Cowork › Releases, asked of the engine */
export function Releases({ ask, onBack }: { ask?: Ask; onBack?: () => void }) {
  const { read, error, busy, again } = useReleases(ask);
  return <ReleasesView read={read} error={error} busy={busy} again={again} onBack={onBack} />;
}

/** the page, from a read (the dev page draws it from a fixture); `opened` opens those tags from the start */
export function ReleasesView({ read, error = "", busy = false, again, onBack, opened = [], proofs = false }: { read: ReleasesRead | null; error?: string; busy?: boolean; again?: () => void; onBack?: () => void; opened?: string[]; /** the newest decision's proof open from the start (a still) */ proofs?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(opened));
  const flip = (tag: string) => setOpen((s) => { const n = new Set(s); if (n.has(tag)) n.delete(tag); else n.add(tag); return n; });
  if (!read) return (
    <div className="rl" data-place="releases">
      <p className="rl-quiet">{busy ? "reading the releases…" : <>Could not read the releases: {error}.{again && <> <button className="rl-link" data-act="read again" onClick={again}>read again</button></>}</>}</p>
    </div>
  );
  const st = standing(read);
  const latest = read.releases.find((r) => r.latest);
  return (
    <div className="rl" data-place="releases">
      <header className="rl-head">
        {onBack && <button className="rl-back" data-go="back" onClick={onBack} aria-label="back" title="back">‹</button>}
        <div className="rl-stand">
          <span className="rl-k">you are on</span>
          <span className="rl-on">{st.on}</span>
          {st.behind && <span className={`rl-state ${st.late ? "late" : "even"}`}><i aria-hidden="true" />{st.behind}</span>}
        </div>
        {again && <button className="rl-link" data-act="read again" disabled={busy} onClick={again} title="read the tags, the PRs and the decisions again">read again</button>}
      </header>
      {latest && latest.behind.length > 0 && <People rows={latest.behind} me={read.me ?? ""} />}
      {read.error && <p className="rl-quiet">{read.error}</p>}
      <ol className="rl-line">
        {lineOf(read).map((i) => i.k === "release"
          ? <ReleaseItem key={i.r.tag} r={i.r} me={read.me ?? ""} meOn={st.on} open={open.has(i.r.tag)} onFlip={() => flip(i.r.tag)} />
          : <DecisionItem key={`${i.d.issue}-${i.d.when}`} d={i.d} open={proofs && i.d === read.decisions[0]} />)}
        {read.releases.length === 0 && <li className="rl-quiet">No release yet.</li>}
      </ol>
    </div>
  );
}

/** each person against main; mine first, with its one press */
function People({ rows, me }: { rows: Behind[]; me: string }) {
  const sorted = [...rows].sort((a, b) => Number(b.login.toLowerCase() === me.toLowerCase()) - Number(a.login.toLowerCase() === me.toLowerCase()));
  return (
    <section className="rl-people" aria-label="who is behind main">
      {sorted.map((b) => {
        const mine = b.login.toLowerCase() === me.toLowerCase();
        const late = (b.releases ?? 0) > 0;
        return (
          <div key={b.login} className={`rl-person ${mine ? "mine" : ""}`}>
            <span className={`rl-state ${b.releases === null ? "unknown" : late ? "late" : "even"}`}><i aria-hidden="true" /></span>
            <span className="rl-who">{b.name}{mine && <span className="rl-dim"> · you</span>}</span>
            <span className="rl-what">{behindWords(b)}{b.prs.length > 0 && <span className="rl-dim"> · {b.prs.length} open {b.prs.length === 1 ? "PR" : "PRs"}</span>}</span>
            {mine && late && (
              // #1253 takes main into a line by hand each day; the engine has no such action yet, so the press says why
              <button className="rl-press" disabled title="Sol cannot do this from here yet: main is taken into your line by hand each day (#1253)">take main into my line</button>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** the channel by its shape first (a ring, half, filled), its word in the title */
function ChannelMark({ c }: { c: Channel }) {
  return <span className={`rl-coin rl-c-${c}`} title={channelWords(c)} aria-label={c} />;
}

function ReleaseItem({ r, me, meOn, open, onFlip }: { r: ReleaseRow; me: string; meOn: string; open: boolean; onFlip: () => void }) {
  const held = !!r.waits && "held" in r.waits;
  const press = pressOf(r, me);
  return (
    <li className={`rl-rel ${r.next ? "next" : ""} ${held ? "held" : ""} ${r.latest ? "latest" : ""}`}>
      <button className="rl-row" data-act="opens the release" aria-expanded={open} onClick={onFlip}>
        {r.next ? <span className="rl-coin rl-c-next" title="on main, not released yet" /> : <ChannelMark c={r.channel} />}
        <span className="rl-tag">{r.next ? "main" : r.tag}</span>
        <span className="rl-dim rl-when">{r.next ? "not released yet" : when(r.when)}</span>
        {!r.next && <span className="rl-dim rl-by">by {r.by}</span>}
        <span className="rl-gap" />
        {held ? <span className="rl-held">held: {r.knots[0]?.what ?? "a serious finding"}</span>
          : r.knots.length > 0 ? <span className="rl-count knot">{r.knots.length} {r.knots.length === 1 ? "knot" : "knots"}</span> : null}
        <span className="rl-count">{r.prs.length} joined</span>
        <span className={`rl-chev ${open ? "open" : ""}`} aria-hidden="true">›</span>
      </button>
      {press && (
        <div className="rl-card" data-act="the beta pass's ask, answered in its session">
          <ActionCard title={press.title} body={press.body} said={{ who: `beta reviewer ${press.who}`, when: when(r.when) }}
            // the beta pass's answer is the reviewer's, in their review session (tonight.ts, the card's key): here it is asked, never pressed
            asks={{ yes: NONE, no: NONE, later: NONE, why: press.why }}
            mark={<span className="rl-coin rl-c-dev" />} />
        </div>
      )}
      {open && (
        <div className="rl-open">
          {r.knots.length > 0 && (
            <div className="rl-knots">
              {r.knots.map((k, i) => (
                <div key={i} className={`rl-knot ${i % 2 ? "r" : "l"}`}>
                  <span className="rl-sev">{k.severity}</span>
                  <span className="rl-kwhat">{k.what}</span>
                  <span className="rl-where">{k.where}</span>
                </div>
              ))}
            </div>
          )}
          {byPerson(r.prs).map((g) => (
            <div key={g.by} className="rl-group">
              <div className="rl-gwho">{g.by}<span className="rl-dim"> · {g.prs.length}</span></div>
              <ul className="rl-prs">
                {g.prs.map((p) => (
                  <li key={p.n}>
                    <span className="rl-n">#{p.n}</span>
                    <span className="rl-title">{p.title}</span>
                    <span className="rl-dim rl-meta">{p.issue ? `for #${p.issue}` : ""}{p.issue && p.agentOf ? " · " : ""}{p.agentOf ? `${p.agentOf}'s agent` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {r.prs.length === 0 && <p className="rl-quiet">Nothing joined: the same main as the release before.</p>}
          {!r.next && backable({ tag: r.tag, kind: r.channel === "stable" ? "stable" : "dev", at: r.when }, meOn) && <div><GoBackHere tag={r.tag} /></div>}
        </div>
      )}
    </li>
  );
}

/** a relayed decision on the line where it was said: "said by" on its face; its press shows the comment behind it */
function DecisionItem({ d, open }: { d: Decision; open?: boolean }) {
  const page = useOut();
  return (
    <li className="rl-dec" data-act="unfolds the proof">
      <ActionCard w={520} open={open} title={`#${d.issue} ${d.title}`} body={d.words} mark={<span className="rl-coin rl-c-said" />}
        said={{ who: d.saidBy === d.signedBy ? d.saidBy : `${d.saidBy}, relayed by ${d.signedBy}${d.agent ? "'s agent" : ""}`, when: when(d.when), ...(d.session ? { session: d.session } : {}) }}
        proof={<>
          <p className="rl-pp">The comment on #{d.issue} is the record: the same words, {d.agent ? `signed by ${d.signedBy}'s agent` : `written by ${d.signedBy}`}.</p>
          {d.session && <p className="rl-pp">The session {d.session} stays on {d.saidBy}'s machine (transcripts never leave it): ask {d.saidBy} for what led there.</p>}
          {d.proof?.url && <button className="rl-link" data-layer="page" onClick={() => page(d.proof!.url, outLabel(`#${d.issue} ${d.title}`))}>open the comment ›</button>}
        </>} />
    </li>
  );
}

/** Settings › engine: only me, in one line */
export function ReleasesMini({ ask }: { ask?: Ask }) {
  const { read, error, busy } = useReleases(ask);
  if (!read) return <span className="rl-dim">{busy ? "…" : error}</span>;
  const st = standing(read);
  return <span className="rl-mini">{`you run ${st.on}${st.behind ? ` · ${st.behind}` : ""}`}</span>;
}
