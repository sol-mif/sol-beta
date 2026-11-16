// Who leads each label (#117, reshaped by #438), in the action board's head: "leads" opens who leads each label. The
// repo's owner (GitHub's admin, the board says) picks one or two people for a label and presses "ask": the engine asks
// the change of the project's settings (a proposal the label's leads before and after agree to) and pings who it waits
// for. Once agreed, CODEOWNERS follows by a PR the morning's release folds. Anyone else sees the same rows, read-only.
import { useEffect, useRef, useState } from "react";
import { PersonDot, StateMark } from "./bits";
import { LABELS, leadsOf, type Team } from "./useTeam";
import "./leads.css";

type Said = { label: string; ok: boolean; text: string };

/** what the press says once the project took it (pure) */
export function saidOf(r: { unchanged?: boolean; proposal?: { state: string; needs: string[] }; pinged?: string[] }): string {
  if (r.unchanged) return "already so";
  const told = r.pinged?.length ? ` · asked ${r.pinged.join(", ")}` : "";
  if (r.proposal?.state === "applied") return `agreed · CODEOWNERS follows by a PR${r.pinged?.length ? ` · told ${r.pinged.join(", ")}` : ""}`;
  return `waits for ${r.proposal?.needs.join(", ") || "agreement"}${told}`;
}

export function Leads({ team }: { team: Team }) {
  const b = team.board;
  const repo = b?.repos.find((r) => b.leads?.[r]);
  const owner = !!(repo && b?.owner?.[repo]);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<string[] | null>(null);
  const [edit, setEdit] = useState<{ label: string; pick: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // the people who may lead: asked once the owner opens it (the repo's collaborators, no bots)
  useEffect(() => {
    if (!open || !owner || !repo || people) return;
    void team.ask<{ people?: string[]; error?: string }>("team.leads.who", { repo }).then((r) => setPeople(r.people ?? []));
  }, [open, owner, repo, people, team]);
  // outside the panel, or Escape: it closes (an edit in flight is kept until the answer)
  useEffect(() => {
    if (!open) return;
    const down = (ev: MouseEvent) => { if (!busy && box.current && !box.current.contains(ev.target as Node)) setOpen(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !busy) { if (edit) setEdit(null); else setOpen(false); } };
    window.addEventListener("mousedown", down); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [open, busy, edit]);
  useEffect(() => { if (!said) return; const t = window.setTimeout(() => setSaid(null), said.ok ? 9_000 : 14_000); return () => window.clearTimeout(t); }, [said]);

  if (!b || !repo) return null;
  const s = team.state;
  const dot = (p: string) => <PersonDot login={p} roster={s?.roster ?? []} up={!!s?.relay.up} me={team.me} />;
  const toggle = (p: string) => setEdit((e) => e && ({ ...e, pick: e.pick.includes(p) ? e.pick.filter((x) => x !== p) : e.pick.length < 2 ? [...e.pick, p] : [e.pick[1], p] }));
  const same = (a: string[], c: string[]) => a.length === c.length && a.every((x, i) => x.toLowerCase() === c[i]?.toLowerCase());

  const press = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await team.ask<{ ok?: boolean; leads?: string[]; proposal?: { state: string; needs: string[] }; pinged?: string[]; unchanged?: boolean; error?: string }>(
      "team.leads.set", { repo, label: edit.label, leads: edit.pick }, 60_000);
    setBusy(false);
    if (r.ok) {
      setSaid({ label: edit.label, ok: true, text: saidOf(r) });
      setEdit(null);
      void team.refresh();
    } else setSaid({ label: edit.label, ok: false, text: r.error ?? "not set" });
  };

  return (
    <div className="leads" ref={box}>
      <button className={`lbtn${open ? " on" : ""}`} onClick={() => { setOpen((o) => !o); setEdit(null); }} title="who leads each label">leads</button>
      {open && (
        <div className="lpanel" role="dialog" aria-label="who leads each label">
          <header><b>who leads what</b><span className="cdim">{repo.split("/")[1]}</span></header>
          <ul>
            {LABELS.map((l) => {
              const now = leadsOf(b, l, repo);
              const editing = edit?.label === l;
              return (
                <li key={l} className={editing ? "editing" : ""}>
                  <div className="lrow">
                    <span className="clabel">{l}</span>
                    <span className="lwho">{now.length ? now.map((p) => <span key={p} className="clead">{dot(p)}<b>{p}</b></span>) : <span className="cdim">nobody</span>}</span>
                    {owner && !editing && <button className="lchange" disabled={busy} onClick={() => setEdit({ label: l, pick: [...now] })}>change</button>}
                  </div>
                  {said?.label === l && !editing && <p className={`lsaid ${said.ok ? "ok" : "no"}`}><StateMark kind={said.ok ? "done" : "failed"} />{said.text}</p>}
                  {editing && (
                    <div className="ledit">
                      <div className="lpeople">
                        {people === null ? <span className="cdim">reading who has access…</span>
                          : people.map((p) => (
                            <button key={p} className={`lperson${edit.pick.includes(p) ? " on" : ""}`} disabled={busy} onClick={() => toggle(p)}>{dot(p)}{p}</button>
                          ))}
                      </div>
                      <p className="lq">
                        {edit.pick.length
                          ? <>{edit.pick.join(" and ")} {edit.pick.length > 1 ? "lead" : "leads"} <b>{l}</b>, once {now.length ? `${now.join(" and ")} and ` : ""}the new leads agree; CODEOWNERS follows</>
                          : <>pick one or two people</>}
                      </p>
                      {said?.label === l && !said.ok && <p className="lsaid no"><StateMark kind="failed" />{said.text}</p>}
                      <div className="lmoves">
                        <button className="wbtn" disabled={busy || !edit.pick.length || same(edit.pick, now)} onClick={() => void press()}>{busy ? "asking…" : "ask"}</button>
                        <button className="wbtn ghost" disabled={busy} onClick={() => setEdit(null)}>keep</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <footer className="cdim">
            {owner ? "kept in the project's settings; CODEOWNERS is written from them. A change to how Sol works goes through a session"
              : `the owner of ${repo.split("/")[1]} asks these; the leads agree. A change to how Sol works goes through a session`}
          </footer>
        </div>
      )}
    </div>
  );
}
