// The project's settings (#428, PROTOCOL round 69): one of the project's own pages, beside the calendar, decisions and
// polls (Tools.tsx). It reads `team.project` (the engine's team/project.ts, `.sol/project.json` in the project's
// record) and shows what is in force: the rhythm (the hours, the time zone, the dev and beta reviewers, the night job),
// what agents share with each other, and who leads which area. Nobody changes a setting straight: "propose a change"
// sends `team.project.propose`; the people it names agree in the project's polls, here on the card or on the polls page,
// and the change applies once all of them said agree. My own open proposal can be withdrawn.
import { Fragment, useCallback, useEffect, useState } from "react";
import type { Team } from "./useTeam";
import { DEV_TEAM } from "./useTeam";
import { Who, since } from "./bits";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { UsedBlock, useUsed } from "./Used";   // who used what (#431)

import { AGREE, NOT_YET, STATE_WORD, STEPS, STEP_WORD, hourWord, fromLine as fromLineAt, waitsOn, patchOf, formRefusal, onboardingOf, type Form, type Part, type ProjectView, type ProposalView } from "./projectView";
import { STATE_WORD as WALK_WORD, type WalkView } from "./onboardView";
import { BLOCKS } from "./blocks";   // team blocks (#429): what each is, when an engine too old to say sends none
import type { BlockLive } from "./blocks/live";

const fromLine = (part: Part, v: Pick<ProjectView, "from" | "set">) => fromLineAt(part, v, (at) => (since(at) === "now" ? "now" : `${since(at)} ago`));

export function ProjectPage({ team, flash }: { team: Team; flash: (s: string) => void }) {
  const [v, setV] = useState<ProjectView | null>(DEV_TEAM ? FAKE : null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [old, setOld] = useState(false);
  const used = useUsed(team, v?.repo ?? "");
  const take = useCallback((m: ProjectView) => { if (m.error) setErr(m.error); else if (m.rhythm) { setErr(""); setV(m); } }, []);
  useEffect(() => {
    if (DEV_TEAM) return;
    void team.ask<ProjectView>("team.project", { refresh: true }, 30_000).then(take);
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.project" && m.rhythm) setV((was) => (!was || was.repo === m.repo ? m : was)); });
  }, [team.ask, take]);

  const propose = async () => {
    if (!form) return;
    const no = formRefusal(form);   // a backup with no zone, a handover outside the night (#478): the engine refuses it too
    if (no) return setForm({ ...form, error: no });
    setForm({ ...form, busy: true, error: undefined });
    const r = await team.ask<ProjectView & { proposal?: ProposalView }>("team.project.propose", { patch: patchOf(form), why: form.why }, 60_000);
    if (r.error) return setForm({ ...form, busy: false, error: r.error });
    take(r); setForm(null);
    flash(r.proposal?.state === "applied" ? "applied: nobody else had to agree" : "proposed: the people it names agree in the project's polls");
  };
  const vote = async (p: ProposalView, option: number) => {
    const r = await team.ask<{ error?: string }>("team.polls.vote", { id: p.poll, option });
    if (r.error) return flash(r.error);
    const again = await team.ask<ProjectView>("team.project", {}, 30_000); take(again);
  };
  const withdraw = async (p: ProposalView) => {
    const r = await team.ask<ProjectView>("team.project.withdraw", { id: p.id }, 30_000);
    if (r.error) flash(r.error); else take(r);
  };

  if (err && !v) return <p className="rm-pg-foot">{err}: the project's settings show once it has one</p>;
  if (!v) return <p className="rm-pg-foot">reading the project's settings…</p>;
  const me = team.me.toLowerCase();
  const open = v.proposals.filter((p) => p.state === "open"), done = v.proposals.filter((p) => p.state !== "open");
  const busy = (part: Part) => open.some((p) => p.patch[part]);
  const ob = onboardingOf(v);
  const start = (part: Exclude<Part, "blocks">) => setForm(part === "rhythm" ? { part, r: { ...v.rhythm, night: { ...v.rhythm.night } }, dev: v.rhythm.dev.join(", "), beta: v.rhythm.beta.join(", "), ...(v.rhythm.devBackup ? { devBackup: v.rhythm.devBackup.join(", "), betaBackup: (v.rhythm.betaBackup ?? []).join(", ") } : {}), why: "" }
    : part === "agents" ? { part, a: { ...v.agents }, why: "" }
    : part === "onboarding" ? { part, o: { welcome: ob.welcome, steps: Object.fromEntries(STEPS.map((k) => [k, { ...ob.steps[k] }])) as typeof ob.steps }, why: "" }
    : { part, rows: [...Object.entries(v.owners).map(([area, l]) => ({ area, leads: l.join(", ") })), { area: "", leads: "" }], why: "" });
  const r = v.rhythm;
  const blocks: BlockLive[] = v.blocks ?? BLOCKS.map((b) => ({ ...b, live: !!b.fixed || b.start === "on", from: "code" as const, known: true }));
  const Change = ({ part }: { part: Exclude<Part, "blocks"> }) => (v.newer ? null : busy(part)
    ? <span className="pj-wait">a change is waiting for agreement below</span>
    : <button className="rm-th-link u" onClick={() => start(part)} disabled={!!form}>propose a change</button>);

  return (<div className="pj">
    {v.newer && <p className="pj-note">these settings were written by a newer Sol: you can read them; update Sol to propose a change</p>}

    <section className="pj-part" aria-label="the rhythm">
      <h3 className="rm-pg-h">the rhythm <Change part="rhythm" /></h3>
      <p className="pj-from">{fromLine("rhythm", v)}</p>
      {form?.part === "rhythm" ? <RhythmForm form={form} set={setForm} go={propose} /> : (
        <dl className="pj-grid">
          <dt>hand in by</dt><dd>{r.handIn}</dd>
          <dt>review</dt><dd>{r.review}</dd>
          <dt>release</dt><dd>{r.release}</dd>
          <dt>quick fixes until</dt><dd>{r.until}</dd>
          <dt>time zone</dt><dd>{r.zone || "each Mac's own clock"}</dd>
          <dt>dev review</dt><dd className="pj-who">{r.dev.length ? r.dev.map((l) => <span key={l}><Who login={l} size={18} title={l} />{l}</span>) : "nobody yet"}</dd>
          <dt>beta review</dt><dd className="pj-who">{r.beta.length ? r.beta.map((l) => <span key={l}><Who login={l} size={18} title={l} />{l}</span>) : "nobody yet"}</dd>
          {r.devBackup && <>
            <dt>dev backup</dt><dd className="pj-who">{r.devBackup.length ? r.devBackup.map((l) => <span key={l}><Who login={l} size={18} title={l} />{l}</span>) : "nobody yet"}</dd>
            <dt>beta backup</dt><dd className="pj-who">{r.betaBackup?.length ? r.betaBackup.map((l) => <span key={l}><Who login={l} size={18} title={l} />{l}</span>) : "nobody yet"}</dd>
            <dt>handover</dt><dd>{r.handover ?? "23:00"} · the card opens for the backup if the reviewer has not pressed</dd>
          </>}
          <dt>night job</dt><dd>{hourWord(r.night.hour)} · a still claim drops after {r.night.staleDays} days</dd>
        </dl>
      )}
    </section>

    <section className="pj-part" aria-label="what agents share">
      <h3 className="rm-pg-h">agents <Change part="agents" /></h3>
      <p className="pj-from">{fromLine("agents", v)}</p>
      {form?.part === "agents" ? (
        <form className="tl-add pj-form" onSubmit={(e) => { e.preventDefault(); void propose(); }}>
          <span className="row" role="radiogroup" aria-label="what agents share with each other">
            <button type="button" role="radio" aria-checked={form.a.share === "facts"} className={`chip ${form.a.share === "facts" ? "on" : ""}`} onClick={() => setForm({ ...form, a: { ...form.a, share: "facts" } })}>facts only</button>
            <button type="button" role="radio" aria-checked={form.a.share === "more"} className={`chip ${form.a.share === "more" ? "on" : ""}`} onClick={() => setForm({ ...form, a: { ...form.a, share: "more" } })}>more than facts</button>
          </span>
          <label className="row"><input type="checkbox" checked={form.a.pick} onChange={(e) => setForm({ ...form, a: { ...form.a, pick: e.target.checked } })} /> an agent may take a change back to draft</label>
          <Why form={form} set={setForm} />
        </form>
      ) : (
        <dl className="pj-grid">
          <dt>between agents</dt><dd>{v.agents.share === "more" ? "more than facts" : "facts only: what they are on, the files, what was decided"}</dd>
          <dt>handing in</dt><dd>{v.agents.pick ? "people pick what goes in tonight; an agent may take a change back to draft" : "people pick what goes in tonight"}</dd>
        </dl>
      )}
    </section>

    <section className="pj-part" aria-label="who leads what">
      <h3 className="rm-pg-h">owners <Change part="owners" /></h3>
      <p className="pj-from">{fromLine("owners", v)}</p>
      {form?.part === "owners" ? (
        <form className="tl-add pj-form" onSubmit={(e) => { e.preventDefault(); void propose(); }}>
          {form.rows.map((x, i) => (
            <span className="row" key={i}>
              <input value={x.area} placeholder="area, as its label" aria-label={`area ${i + 1}`} maxLength={40} onChange={(e) => setForm({ ...form, rows: form.rows.map((y, j) => (j === i ? { ...y, area: e.target.value } : y)) })} />
              <input value={x.leads} placeholder="one or two leads, logins" aria-label={`the leads of area ${i + 1}`} maxLength={90} onChange={(e) => setForm({ ...form, rows: form.rows.map((y, j) => (j === i ? { ...y, leads: e.target.value } : y)) })} />
            </span>
          ))}
          <button type="button" className="rm-th-link u" onClick={() => setForm({ ...form, rows: [...form.rows, { area: "", leads: "" }] })}>+ another area</button>
          <span className="dim">an area left without a lead is taken off</span>
          <Why form={form} set={setForm} />
        </form>
      ) : Object.keys(v.owners).length ? (
        <dl className="pj-grid">{Object.entries(v.owners).map(([area, l]) => <Fragment key={area}><dt>{area}</dt><dd className="pj-who">{l.map((x) => <span key={x}><Who login={x} size={18} title={x} />{x}</span>)}</dd></Fragment>)}</dl>
      ) : <p className="tl-none">no area has a lead yet</p>}
    </section>

    <section className="pj-part" aria-label="blocks">
      <h3 className="rm-pg-h">blocks {busy("blocks") && <span className="pj-wait">a change is waiting for agreement below</span>}</h3>
      <p className="pj-from">{fromLine("blocks", v)} · a block that is off shows nowhere in the project, and agents cannot use its tools</p>
      <dl className="pj-grid">{blocks.map((b) => (
        <Fragment key={b.id}>
          <dt>{b.name}</dt>
          <dd className="pj-block">
            <span className={b.live ? "" : "dim"}>{b.live ? "on" : b.known ? "off" : "off: a newer Sol's kind"}{b.fixed ? ", always" : ""}</span>
            <span className="dim"> · {b.kind}{b.from === "record" ? ", the team's own" : ""}{b.shows ? ` · ${b.shows}` : ""}</span>
            {!b.fixed && b.known && !v.newer && !busy("blocks") && (form?.part === "blocks" && form.id === b.id ? (
              <form className="tl-add pj-form" onSubmit={(e) => { e.preventDefault(); void propose(); }}>
                <span className="dim">turn {b.name} {form.on ? "on" : "off"} for everyone in the project</span>
                <Why form={form} set={setForm} />
              </form>
            ) : <> <button className="rm-th-link u" onClick={() => setForm({ part: "blocks", id: b.id, on: !b.live, why: "" })} disabled={!!form}>propose turning it {b.live ? "off" : "on"}</button></>)}
          </dd>
        </Fragment>
      ))}</dl>
    </section>

    <section className="pj-part" aria-label="onboarding">
      <h3 className="rm-pg-h">onboarding <Change part="onboarding" /></h3>
      <p className="pj-from">{fromLine("onboarding", v)} · what Cowork walks someone through when they join</p>
      {form?.part === "onboarding" ? (
        <form className="tl-add pj-form" onSubmit={(e) => { e.preventDefault(); void propose(); }}>
          <textarea value={form.o.welcome} rows={2} maxLength={300} placeholder="a welcome, a line or two (empty: none)" aria-label="the welcome" onChange={(e) => setForm({ ...form, o: { ...form.o, welcome: e.target.value }, error: undefined })} />
          {STEPS.map((k) => (
            <span className="pj-ob-step" key={k}>
              <label className="row"><input type="checkbox" checked={form.o.steps[k].on} onChange={(e) => setForm({ ...form, o: { ...form.o, steps: { ...form.o.steps, [k]: { ...form.o.steps[k], on: e.target.checked } } } })} /> {STEP_WORD[k]}</label>
              {form.o.steps[k].on && <textarea value={form.o.steps[k].note} rows={1} maxLength={300} placeholder="the project's own note under it (optional)" aria-label={`a note under ${STEP_WORD[k]}`}
                onChange={(e) => setForm({ ...form, o: { ...form.o, steps: { ...form.o.steps, [k]: { ...form.o.steps[k], note: e.target.value } } } })} />}
            </span>
          ))}
          <span className="dim">the steps' facts come from the settings above; this only says which are shown, and adds the project's words</span>
          <Why form={form} set={setForm} />
        </form>
      ) : (
        <dl className="pj-grid">
          <dt>welcome</dt><dd>{ob.welcome || "none"}</dd>
          {STEPS.map((k) => <Fragment key={k}><dt>{STEP_WORD[k]}</dt><dd>{ob.steps[k].on ? (ob.steps[k].note ? `shown · “${ob.steps[k].note}”` : "shown") : "left out"}</dd></Fragment>)}
        </dl>
      )}
      <Walked team={team} flash={flash} />
    </section>

    <section className="pj-part" aria-label="changes">
      <h3 className="rm-pg-h">changes</h3>
      {open.length === 0 && <p className="tl-none">nothing waiting for agreement</p>}
      <ul className="tl-polls">{open.map((p) => <ProposalCard key={p.id} p={p} me={me} vote={vote} withdraw={withdraw} />)}</ul>
      {done.length > 0 && <button className="rm-th-link tl-early" onClick={() => setOld((x) => !x)}>{old ? "hide the earlier ones" : `${done.length} earlier`}</button>}
      {old && <ul className="tl-polls">{done.map((p) => <ProposalCard key={p.id} p={p} me={me} vote={vote} withdraw={withdraw} />)}</ul>}
    </section>
    <UsedBlock v={used} />
    <p className="rm-pg-foot rm-gp-foot">kept in the project's record, .sol/project.json · a change applies once everyone it names agrees · the review, release and hand-in hours are read from here</p>
  </div>);
}

/** who has been walked through, and my own "walk me through again" (team.onboarding.redo: the walk opens again) */
function Walked({ team, flash }: { team: Team; flash: (s: string) => void }) {
  const [w, setW] = useState<WalkView | null>(null);
  useEffect(() => {
    if (DEV_TEAM) return setW({ people: [{ login: "marcocyl04-ux", state: "done", at: "" }, { login: "franktsai2008-eng", state: "skipped", at: "" }] } as WalkView);
    void team.ask<WalkView>("team.onboarding", {}, 30_000).then((m) => { if (!m.error && m.people) setW(m); });
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.onboarding" && m.people) setW(m as WalkView); });
  }, [team.ask]);
  const again = async () => {
    const r = await team.ask<WalkView>("team.onboarding.redo", {}, 30_000);
    if (r.error) flash(r.error); else { setW(r); flash("the walk opens on the project's page"); }
  };
  return (<>
    {w && w.people.length > 0 && <p className="pj-votes pj-walked">{w.people.map((p) => <span key={p.login} className={p.state === "done" ? "yes" : p.state === "skipped" ? "no" : "wait"}><Who login={p.login} size={16} title={p.login} />{p.login} · {WALK_WORD[p.state]}</span>)}</p>}
    <button className="rm-th-link u pj-again" onClick={() => void again()}>walk me through again</button>
  </>);
}

function Why({ form, set }: { form: Form; set: (f: Form | null) => void }) {
  return (<>
    <input value={form.why} placeholder="why, in one line (the people who agree read it)" aria-label="why" maxLength={200} onChange={(e) => set({ ...form, why: e.target.value, error: undefined })} />
    {form.error && <span className="err" role="alert">{form.error}</span>}
    <span className="acts"><button className="wbtn" type="submit" disabled={form.busy}>{form.busy ? "proposing…" : "propose"}</button><button className="wbtn ghost" type="button" onClick={() => set(null)}>cancel</button></span>
  </>);
}

function RhythmForm({ form, set, go }: { form: Extract<Form, { part: "rhythm" }>; set: (f: Form | null) => void; go: () => Promise<void> }) {
  const t = (k: "handIn" | "review" | "release" | "until" | "handover", word: string) => (
    <label className="pj-f"><span>{word}</span><input type="time" value={form.r[k] ?? "23:00"} onChange={(e) => set({ ...form, r: { ...form.r, [k]: e.target.value }, error: undefined })} /></label>
  );
  return (
    <form className="tl-add pj-form" onSubmit={(e) => { e.preventDefault(); void go(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); set(null); } }}>
      <span className="row">{t("handIn", "hand in by")}{t("review", "review")}{t("release", "release")}{t("until", "quick fixes until")}</span>
      <label className="pj-f wide"><span>time zone</span><input value={form.r.zone} placeholder="America/New_York (empty: each Mac's clock)" onChange={(e) => set({ ...form, r: { ...form.r, zone: e.target.value } })} /></label>
      <label className="pj-f wide"><span>dev review</span><input value={form.dev} placeholder="logins, comma between" onChange={(e) => set({ ...form, dev: e.target.value })} /></label>
      <label className="pj-f wide"><span>beta review</span><input value={form.beta} placeholder="logins, comma between" onChange={(e) => set({ ...form, beta: e.target.value })} /></label>
      {form.devBackup !== undefined && <>
        <label className="pj-f wide"><span>dev backup</span><input value={form.devBackup} placeholder="logins, comma between: the card opens for them at the handover" onChange={(e) => set({ ...form, devBackup: e.target.value })} /></label>
        <label className="pj-f wide"><span>beta backup</span><input value={form.betaBackup ?? ""} placeholder="logins, comma between: the card opens for them at the handover" onChange={(e) => set({ ...form, betaBackup: e.target.value })} /></label>
        <span className="row">{t("handover", "handover")}</span>
      </>}
      <span className="row">
        <label className="pj-f"><span>night job hour</span><input type="number" min={0} max={23} value={form.r.night.hour} onChange={(e) => set({ ...form, r: { ...form.r, night: { ...form.r.night, hour: Number(e.target.value) } } })} /></label>
        <label className="pj-f"><span>still claim drops after (days)</span><input type="number" min={1} max={90} value={form.r.night.staleDays} onChange={(e) => set({ ...form, r: { ...form.r, night: { ...form.r.night, staleDays: Number(e.target.value) } } })} /></label>
      </span>
      <Why form={form} set={set} />
    </form>
  );
}

function ProposalCard({ p, me, vote, withdraw }: { p: ProposalView; me: string; vote: (p: ProposalView, o: number) => void; withdraw: (p: ProposalView) => void }) {
  const w = waitsOn(p), mine = p.votes[me], open = p.state === "open", named = p.needs.includes(me);
  return (
    <li className={`tl-poll pj-prop ${open ? "" : "closed"}`}>
      <h3>{p.summary}</h3>
      <p className="by">proposed by {p.by || "someone"} · {since(p.at) === "now" ? "now" : `${since(p.at)} ago`} · {STATE_WORD[p.state]}{p.why ? ` · “${p.why}”` : ""}</p>
      <p className="pj-votes">
        {w.agreed.map((l) => <span key={l} className="yes" title={`${l} agreed`}><Who login={l} size={16} title={l} />{l} agreed</span>)}
        {w.notYet.map((l) => <span key={l} className="no" title={`${l}: not yet`}><Who login={l} size={16} title={l} />{l}: not yet</span>)}
        {open && w.waiting.map((l) => <span key={l} className="wait" title={`waiting for ${l}`}><Who login={l} size={16} title={l} />{l}?</span>)}
      </p>
      {open && (
        <span className="acts">
          {named && <button className={`wbtn ${mine === "agree" ? "" : "ghost"}`} aria-pressed={mine === "agree"} onClick={() => vote(p, AGREE)}>agree</button>}
          {named && <button className={`wbtn ${mine === "not yet" ? "" : "ghost"}`} aria-pressed={mine === "not yet"} onClick={() => vote(p, NOT_YET)}>not yet</button>}
          {!named && <span className="dim">this change does not need you: {p.needs.join(", ")} agree</span>}
          {p.by.toLowerCase() === me && <button className="rm-th-link u" onClick={() => withdraw(p)}>withdraw</button>}
        </span>
      )}
    </li>
  );
}

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const FAKE: ProjectView = {
  repo: "sol-mif/sol-record", code: "sol-mif/sol-dev",
  rhythm: { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "America/New_York", dev: ["marcocyl04-ux"], beta: ["franktsai2008-eng"], night: { hour: 3, staleDays: 7 } },
  agents: { share: "facts", pick: false }, owners: { cowork: ["franktsai2008-eng"], engine: ["marcocyl04-ux", "franktsai2008-eng"] },
  from: { rhythm: "file", night: "carried", agents: "default", owners: "record" },
  set: { owners: { by: "franktsai2008-eng", at: ago(60 * 26), proposal: "a1b2c3d4", agreed: ["franktsai2008-eng", "marcocyl04-ux"] } },
  proposals: [
    { id: "0f0f0f0f", by: "marcocyl04-ux", at: ago(40), why: "Isaac checks beta too", state: "open", poll: "11111111",
      patch: {}, was: {}, needs: ["franktsai2008-eng", "marcocyl04-ux", "w0ngtap"], summary: "rhythm: beta franktsai2008-eng, w0ngtap",
      votes: { "marcocyl04-ux": "agree", "franktsai2008-eng": "agree" } },
    { id: "a1b2c3d4", by: "franktsai2008-eng", at: ago(60 * 27), state: "applied", poll: "22222222", patch: {}, was: {},
      needs: ["franktsai2008-eng", "marcocyl04-ux"], summary: "owners: cowork → franktsai2008-eng", votes: { "franktsai2008-eng": "agree", "marcocyl04-ux": "agree" } },
  ],
};
