// The review session's card (#416, engine team/tonight.ts): what was handed in today, and the reviewer's buttons, which
// say where a change goes (#477). Dev night: one row a change (its area, who made it, a risk and what to try) and per
// change Into sol-dev (the project's own name) or Send back; Send back then asks slight or severe, and slight asks what
// to fix. Beta night: yesterday's whole dev release as a list, and two buttons for all of it, Into beta or Hold; no row
// has a button of its own. Into sol-dev asks once more on the same button (one merge commit, the branch deleted), the
// rest go at once. Nothing is decided here: each press goes to the engine, which does it and sends the card back
// changed. The verdicts keep their code names ("fold", "pass", "hold").
import { useEffect, useState } from "react";
import type { Item, Work } from "./useWork";

type Change = {
  number: number; title: string; author: string; url: string; area: string[]; risk: "low" | "medium" | "high"; why: string;
  felt: string; try: string; state?: "busy" | "folded" | "slight" | "severe" | "closed"; error?: string;
  back?: true;   // sent back on an earlier night (#421)
  handIn?: "session" | "earlier";   // #420: handed in during the night's hand-in, or before it
};
// a change's page opens in the browser, never in this window (the talk's own links do the same, Message.tsx)
const openOut = (e: React.MouseEvent, href: string) => {
  e.preventDefault(); e.stopPropagation();
  if (!/^https:\/\//.test(href)) return;
  import("@tauri-apps/plugin-opener").then((o) => o.openUrl(href)).catch(() => window.open(href, "_blank"));
};
const WAS: Record<string, string> = { slight: "sent back, slight", severe: "sent back, severe", closed: "closed on GitHub", busy: "…" };

/** where the dev night's first button takes a change (pure): the project's own name, "Into sol-dev" for sol-mif/sol-dev */
export const intoName = (repo: string) => String(repo ?? "").split("/").pop()?.trim() || "main";
/** the card's words for a row's state (pure, for the test) */
export const stateWord = (c: Pick<Change, "state">, repo = "") => (c.state === "folded" ? `into ${intoName(repo)}` : c.state ? WAS[c.state] ?? "" : "");
/** "20:00" as people say it (pure): 8pm, 8:30pm */
const hourWords = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
/** a change's hand-in as the card says it (pure, #420; the engine's tonight.ts handInWord says the same) */
export const handInWord = (c: Pick<Change, "handIn">, at = "20:00") =>
  c.handIn === "session" ? `handed in at the ${hourWords(at)} hand-in` : c.handIn === "earlier" ? "handed in before the hand-in" : "";
/** who presses, as the card says it (pure; the engine's tonight.ts pressersOf says the same): the reviewer, and the
 *  night's backup from the handover (#478) */
export const pressers = (reviewers: unknown, backups: unknown) => {
  const r = Array.isArray(reviewers) ? (reviewers as string[]) : [];
  // a backup who is a reviewer too is said once, as the reviewer
  const b = (Array.isArray(backups) ? (backups as string[]) : []).filter((x) => !r.some((y) => y.toLowerCase() === String(x).toLowerCase()));
  return `${r.join(" or ") || "the reviewer"}${b.length ? ` or ${r.length === 1 ? "their" : "the"} backup ${b.join(" or ")}` : ""}`;
};
/** how many rows are decided (pure) */
export const decided = (cs: Pick<Change, "state">[]) => cs.filter((c) => c.state && c.state !== "busy").length;

export function TonightCard({ it, w }: { it: Item; w: Work }) {
  const changes: Change[] = Array.isArray(it.changes) ? it.changes : [];
  const role = it.role === "beta" ? "beta" : "dev";
  const mine = !!it.mine;
  const [armed, setArmed] = useState<number | null>(null);   // the change whose Into sol-dev asks "sure?"
  const [backing, setBacking] = useState<number | null>(null);   // the change whose Send back asks slight or severe
  const [err, setErr] = useState("");
  // a slight send back says what to fix (#421): the press opens a line for it, and the re-check before the morning
  // holds the author's fix to those words
  const [fixing, setFixing] = useState<number | null>(null);
  const [fix, setFix] = useState("");
  useEffect(() => { if (armed === null) return; const t = window.setTimeout(() => setArmed(null), 4000); return () => window.clearTimeout(t); }, [armed]);
  const press = async (verdict: string, number?: number, words?: string) => {
    setErr(""); setArmed(null);
    const r = await w.tonight(verdict, number, words);
    if (!r?.error && (verdict === "slight" || verdict === "severe")) { setFixing(null); setFix(""); setBacking(null); }
    if (r?.error) setErr(String(r.error));
  };
  const reviewers = pressers(it.reviewers, it.backups);
  const v = it.verdict as { state?: string; error?: string } | undefined;
  const repo = typeof it.into === "string" && it.into ? it.into : String(it.repo ?? ""), into = `Into ${intoName(repo)}`;
  return (
    <div className={`wcard wtonight ${role}`}>
      <div className="whead">
        <span>{role === "dev" ? "dev review" : "beta review"} · {String(it.repo ?? "")}{role === "beta" && it.release ? ` · the dev release of ${it.release}` : ""}</span>
        {role === "dev" && <i className="pn">{decided(changes)} of {changes.length}</i>}
      </div>
      {role === "dev" && Number(it.late) > 0 && <p className="tn-none">{Number(it.late)} more marked ready after the review hour: {Number(it.late) === 1 ? "it waits" : "they wait"} for the next night</p>}
      {!changes.length && <p className="tn-none">{role === "dev" ? "nothing was handed in today" : "the dev release is empty"}</p>}
      {changes.map((c) => (
        <div key={c.number} className={`tn-row ${c.state ?? "open"}`}>
          <div className="tn-top">
            <a className="tn-n" href={c.url} onClick={(e) => openOut(e, c.url)} title="open the change on GitHub">#{c.number}</a>
            <span className="tn-t">{c.title}</span>
          </div>
          <div className="tn-tags">
            <span className={`tn-risk ${c.risk}`} title={c.why}>{c.risk} risk</span>
            {c.area.map((a) => <span key={a} className="tn-area">{a}</span>)}
            <span className="tn-by">by {c.author}</span>
            {c.felt && <span className="tn-felt">{c.felt}</span>}
            {c.back && <span className="tn-back" title="it was sent back on an earlier night">back from last night</span>}
            {role === "dev" && handInWord(c, String(it.handInAt ?? "20:00")) && <span className="tn-felt">{handInWord(c, String(it.handInAt ?? "20:00"))}</span>}
          </div>
          <p className="tn-try"><b>what to try</b> {c.try || "the change does not say"}</p>
          {role === "dev" && (c.state && c.state !== "busy"
            ? <span className="tn-was">{stateWord(c, repo)}</span>
            : backing === c.number
            ? <div className="choices">
                <button disabled={!mine || c.state === "busy"} onClick={() => { setFixing(fixing === c.number ? null : c.number); setFix(""); }}
                  title={`a small fix tonight; your Sol re-checks it before the morning and takes it into ${intoName(repo)}`}>slight · fixed tonight</button>
                <button disabled={!mine || c.state === "busy"} onClick={() => void press("severe", c.number)} title="it waits for the next night">severe · next night</button>
                <button onClick={() => { setBacking(null); setFixing(null); setFix(""); }}>cancel</button>
              </div>
            : <div className="choices">
                <button className="first" disabled={!mine || c.state === "busy"} onClick={() => (armed === c.number ? void press("fold", c.number) : setArmed(c.number))}
                  title="one merge commit, and its branch deleted, so one revert undoes it; a conflict or a red check stops it">{c.state === "busy" ? "…" : armed === c.number ? `${into} #${c.number}: sure?` : into}</button>
                <button disabled={!mine || c.state === "busy"} onClick={() => { setArmed(null); setBacking(c.number); }} title="slight (fixed tonight) or severe (the next night): you pick next">Send back</button>
              </div>)}
          {role === "dev" && backing === c.number && fixing === c.number && !c.state && (
            <form className="tn-fix" onSubmit={(e) => { e.preventDefault(); if (fix.trim()) void press("slight", c.number, fix.trim()); }}>
              <input autoFocus value={fix} maxLength={600} onChange={(e) => setFix(e.target.value)} placeholder="what to fix, in a line: the re-check holds the fix to it" />
              <button className="first" type="submit" disabled={!fix.trim()}>send back</button>
              <button type="button" onClick={() => { setFixing(null); setFix(""); }}>cancel</button>
            </form>)}
          {c.error && <em className="tn-err">{c.error}</em>}
        </div>
      ))}
      {role === "beta" && (v?.state === "pass" || v?.state === "hold"
        ? <p className="tn-was">{v.state === "pass" ? "into beta, whole" : "held from beta"}</p>
        : <div className="choices">
            <button className="first" disabled={!mine || v?.state === "busy" || !changes.length} onClick={() => void press("pass")} title="the whole dev release goes to beta">Into beta</button>
            <button disabled={!mine || v?.state === "busy" || !changes.length} onClick={() => void press("hold")} title="the whole dev release stays off beta">Hold</button>
          </div>)}
      {role === "beta" && v?.error && <em className="tn-err">{v.error}</em>}
      {it.backup === true && <p className="tn-none">opened for you as the backup: {Array.isArray(it.reviewers) ? (it.reviewers as string[]).join(" or ") : "the reviewer"} had not pressed by the handover</p>}
      {!mine && <p className="tn-none">only {reviewers} presses these</p>}
      {err && <em className="tn-err">{err}</em>}
    </div>
  );
}
