// Cowork v3 slice 3 (fr-30 E10, #556): Running. One now-line: what is red at the left with its one press (ember: it
// needs you), what runs now, and the next moment of the project's rhythm. In SOL's own project, and only there, the dev
// face as one module under it: the open drafts, the reads waiting for the night, the versions and the night itself.
// Every press calls what today's Cowork already does: Try it the try pane's own, Urgent today's urgent-OK comment, Into
// and Send back the review card's verdicts, Start the review the night's opener. Nothing new is pressed here.
import { useEffect, useState, type ReactNode } from "react";
import type { Team, Card } from "../useTeam";
import type { Work } from "../../work/useWork";
import { Body, StateMark, since } from "../bits";
import { tryItems } from "../TryPane";
import type { DevCard, Press, RunningAnswer } from "./peopleTypes";
import { SignInAgain } from "./Places";

const mins = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60}` : ""}`);

export function Running({ team, w, onPlaces }: { team: Team; w: Work; onPlaces: () => void }) {
  const [a, setA] = useState<RunningAnswer | null>(null);
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState("");
  const [signIn, setSignIn] = useState("");   // a red place's own sign-in, open over Running
  const read = () => void team.ask<RunningAnswer>("team.v3.running", {}).then((r) => { if (r.error) setErr(r.error); else { setErr(""); setA(r); } });
  useEffect(() => { read(); const t = window.setInterval(read, 60_000); return () => window.clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (p: Press, key: string) => {
    const b = (p.body ?? {}) as Record<string, any>;
    setBusy(key); setErr("");
    try {
      if (p.via === "team.try") {
        const it = tryItems({ repo: String(b.repo), pr: Number(b.pr) } as unknown as Card, team)[0];
        if (it?.disabled) { setErr(it.note ?? "it cannot be tried"); return; }
        if (it?.confirm && !window.confirm(it.confirm)) return;
        it?.run?.();
      } else if (p.via === "team.pr.comment") {
        const r = await team.ask<{ ok?: true; error?: string }>("team.pr.comment", b, 60_000);
        if (r.error) setErr(r.error); else setSaid(`#${b.pr}: urgent OK said`);
      } else if (p.via === "review-card") {
        const r = await w.tonight(String(b.verdict), Number(b.number), undefined, String(b.sessionId ?? w.live));
        if (r.error) setErr(r.error); else { setSaid(`#${b.number}: ${p.label.toLowerCase()}`); read(); }
      } else if (p.via === "review-open") {
        const r = await team.ask<{ session?: string; error?: string }>("team.v3.running", { op: "review" }, 90_000);
        if (r.error) setErr(r.error); else { setSaid("the review is open"); read(); }
      } else if (p.via === "place.signin") { if (typeof b.place === "string" && b.place && a?.project) setSignIn(b.place); else onPlaces(); }
    } finally { setBusy(""); }
  };
  const btn = (p: Press, key: string, needs = false) => (
    <button key={key} className={`v3-press ${needs ? "needs" : p.label === "Try it" ? "" : "ghost"}`} disabled={!!busy} onClick={() => void run(p, key)}>{busy === key ? "…" : p.label}</button>
  );

  if (!a) return <div className="v3-room v3-running"><p className="v3-hint">{err || "reading what runs…"}</p></div>;
  const l = a.line, d = a.dev;
  return (
    <div className="v3-room v3-running">
      <section className="v3-nowline" aria-label="now">
        <div className={`v3-seg red ${l.red.length ? "" : "calm"}`}>
          <div className="v3-k">Red</div>
          {l.red.length ? l.red.map((r, i) => (
            <div key={i} className="v3-item needs">
              <StateMark kind="needs" seed={r.title} />
              <span className="t"><b>{r.title}</b><small><Body login={r.whose} size={12} /> {r.whose} · <span className="v3-where">{r.place}</span> · {r.line}</small></span>
              {r.press && btn(r.press, `red${i}`, true)}
            </div>
          )) : <span className="dim">nothing is red</span>}
        </div>
        <div className="v3-seg">
          <div className="v3-k">Running</div>
          {l.running.length ? l.running.map((r, i) => (
            <div key={i} className="v3-item">
              <StateMark kind="running" seed={r.title} />
              <span className="t"><b>{r.title}</b><small><Body login={r.whose} size={12} agent={r.agent} /> {r.agent ? `${r.whose}’s agent` : r.whose}{r.place ? <> · <span className="v3-where">{r.place}</span></> : null}{r.line ? ` · ${r.line}` : ""}</small></span>
            </div>
          )) : <span className="dim">nothing runs now</span>}
        </div>
        <div className="v3-seg next">
          <div className="v3-k">Next</div>
          {l.next ? (
            <div className="v3-item">
              <span className="v3-at">{l.next.at}</span>
              <span className="t"><b>{l.next.label}</b><small>in {mins(l.next.inMinutes)}{l.next.whose ? <> · <Body login={l.next.whose} size={12} /> {l.next.whose}</> : null}{l.next.place ? <> · <span className="v3-where">{l.next.place}</span></> : null}</small></span>
            </div>
          ) : <span className="dim">no rhythm set</span>}
        </div>
      </section>

      {d && (
        <section className="v3-dev" aria-label="the dev face">
          <div className="v3-devhead"><span className="v3-tabline" /><b>{d.repo}</b><span className="dim"> · the dev face{d.reviewer ? " · you review tonight" : ""}</span></div>
          <div className="v3-devcols">
            <DevCol title="Drafts" cards={d.drafts} empty="no open drafts" btn={btn} k="d" />
            <DevCol title="Waiting for the night" cards={d.reads} empty="nothing handed in" btn={btn} k="r" />
            <div className="v3-devcol">
              <div className="v3-k">Versions</div>
              {d.versions.releases.slice(0, 4).map((r) => (
                <div key={r.tag} className="v3-item"><span className="t"><b>{r.tag}</b><small>{r.kind}{r.beta ? " · beta" : ""} · {r.changes} change{r.changes === 1 ? "" : "s"} · {since(r.at)}</small></span></div>
              ))}
              {d.versions.people.map((p) => (
                <div key={p.login} className="v3-item"><Body login={p.login} size={14} /><span className="t"><small>{p.login} on {p.on ?? "nothing yet"}{p.behind ? ` · ${p.behind} behind` : ""}</small></span></div>
              ))}
              {!d.versions.releases.length && !d.versions.people.length && <span className="dim">no versions read</span>}
            </div>
            <div className="v3-devcol night">
              <div className="v3-k">The night</div>
              <div className="v3-rhythm">
                {([["Hand-in", d.night.handIn], ["Reviews", d.night.review], ["Release", d.night.release]] as const).map(([n, t]) => t ? <span key={n}><b>{t}</b> {n}</span> : null)}
              </div>
              <small className="dim">{d.night.handedIn} handed in{d.night.reviewers.length ? <> · reviews: {d.night.reviewers.map((r) => <Body key={r} login={r} size={12} />)}</> : null}{d.night.backups.length ? ` · backup ${d.night.backups.join(", ")}` : ""}</small>
              <div className="v3-presses">{d.night.presses.map((p, i) => btn(p, `n${i}`))}</div>
            </div>
          </div>
        </section>
      )}
      {said && <p className="v3-hint" role="status">{said}</p>}
      {err && <p className="v3-err">{err}</p>}
      {signIn && <SignInAgain team={team} project={a.project} kind={signIn} onClose={() => { setSignIn(""); read(); }} />}
    </div>
  );
}

function DevCol({ title, cards, empty, btn, k }: { title: string; cards: DevCard[]; empty: string; btn: (p: Press, key: string) => ReactNode; k: string }) {
  return (
    <div className="v3-devcol">
      <div className="v3-k">{title}<span className="dim"> · {cards.length}</span></div>
      {cards.length ? cards.map((c) => (
        <div key={c.number} className="v3-item v3-item-card">
          <Body login={c.author || "?"} size={16} />
          <span className="t"><b>#{c.number} {c.title}</b><small>{c.author}{c.mark ? ` · ${c.mark}` : ""}</small></span>
          <span className="v3-presses">{c.presses.map((p, i) => btn(p, `${k}${c.number}.${i}`))}</span>
        </div>
      )) : <span className="dim">{empty}</span>}
    </div>
  );
}
