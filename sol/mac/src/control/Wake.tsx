// Who may wake my agent (#1151, the engine's team/wake.ts): per repository, nobody until I say so. Its rows carry no
// second line (.lab small): Settings shows that over the row below on hover and focus (#1020), and here the row below is
// the terms card or the hint, so what a second line would say is in the hint line instead. "me": a comment by my
// own login wakes it, a session in an empty folder that asks before anything past its thread. "me and people I name": their comments too,
// turned on only after the terms line below was shown (the day is kept with the rule); their session can only read the
// thread and the repository and answer there. "my group's members" (#1313): the one question Sol asks in Cowork, changed here, its two lines (their comments
// wake mine; their agents ask mine) each on its own.
import { Fragment, useState } from "react";
import { Seg, Field } from "../work/WorkSettings";
import type { Team } from "./useControl";

type Who = "off" | "mine" | "people";
const GROUP = "@group:";   // the terms card of a group's row, beside a repository's
type Line = "wake" | "asks";
const LINES: Line[] = ["wake", "asks"];
const today = () => new Date().toISOString().slice(0, 10);
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const logins = (v: string) => [...new Set(v.split(/[\s,]+/).map((x) => x.replace(/^@/, "")).filter((x) => LOGIN.test(x)))].slice(0, 10);

/** the terms line (fr-31, "Help, not lending"): shown before other people may wake my agent */
export const TERMS = "Their words run on your own Claude or Codex plan. Anthropic's usage policy and Claude Code's terms do not allow " +
  "routing other people's requests through a Pro or Max plan, and may act on an account without notice; OpenAI's terms say " +
  "your account is yours alone. The account at risk is yours. Turn it on only if you have weighed that.";

export function WakeRows({ t, off, set }: { t: Team | null; off: boolean; set: (patch: object) => Promise<unknown> }) {
  const [asking, setAsking] = useState("");   // the repository whose "people too" waits on the terms line
  const [names, setNames] = useState("");
  if (!t) return null;
  const me = t.me.login;
  // yes counts for the group it was given for, a GitHub group with an org (the engine's wake.ts groupYes); its two
  // lines, waking and asking, each turned off on its own (team/settings.ts wakeLineOn)
  const inUse = t.rooms.find((r) => r.id === t.room);
  const canGroup = inUse?.provider === "github" && !!inUse.org;
  const ans = t.wakeAsk;
  const yesHere = canGroup && ans?.answer === "yes" && ans.room === t.room;
  const lineOn = (l: Line) => yesHere && !(ans!.off ?? []).includes(l);
  const putLine = (l: Line, on: boolean) => {
    const off = new Set<Line>(yesHere ? ans!.off ?? [] : LINES);
    if (on) off.delete(l); else off.add(l);
    void set({ wakeAsk: off.size === LINES.length ? { answer: "no", at: today(), room: t.room, off: [] }
      : { answer: "yes", at: yesHere ? ans!.at : today(), room: t.room, off: [...off] } });
  };
  const group = lineOn("wake");
  // the repositories with a rule first, so one that is on never falls off the list
  const repos = [...new Set([...Object.keys(t.wake ?? {}), ...t.rooms.flatMap((r) => r.repos)])].slice(0, 20);
  const put = (repo: string, p: object) => void set({ wake: { [repo]: p } });
  return (
    <>
      <div className="ctl-sub">who may wake my agent</div>
      <p className="hint-line top">a comment on GitHub with a line that starts <span className="ctl-sig">@{me || "me"}'s agent</span> starts a session here, with nobody passing it on. Nobody can, until you choose who</p>
      {/* my group's members (#1313): the one question Sol asks, here to change, each line on its own; on only after the terms line */}
      {canGroup && LINES.map((l) => (
        <Fragment key={l}>
          <div className="field-r">
            <div className="lab"><span>{l === "wake" ? `${inUse!.name}'s members` : `${inUse!.name}'s agents may ask mine`}</span></div>
            <Seg value={lineOn(l) ? "yes" : "no"} disabled={off} options={[["no", "no"], ["yes", "yes"]]}
              onChange={(v) => {
                if (v === "yes" && !yesHere) { setAsking(GROUP + l); return; }
                setAsking("");
                putLine(l, v === "yes");
              }} />
          </div>
          {asking === GROUP + l && (
            <div className="ctl-card">
              <div className="ctl-card-h"><span>{l === "wake" ? "before your group's members can wake your agent" : "before their agents can ask yours"}</span></div>
              <p className="ctl-terms">{TERMS}</p>
              <div className="ctl-card-row ctl-card-end">
                <button className="wbtn" onClick={() => setAsking("")}>keep it off</button>
                <button className="wbtn" disabled={off} onClick={() => { putLine(l, true); setAsking(""); }}>I weighed it, turn it on</button>
              </div>
            </div>
          )}
        </Fragment>
      ))}
      {group && <p className="hint-line">a member of {inUse!.name} who starts a line with @{me || "me"}'s agent, on any of its repositories, starts a session in an empty folder that can only read the thread and the repository and answer there. At most 3 times a thread a day (terms read {t.wakeAsk!.at})</p>}
      {lineOn("asks") && <p className="hint-line">a member's agent can ask yours a question; yours answers from what this Sol can read, changes nothing, at most 12 asks a person a day (terms read {t.wakeAsk!.at})</p>}
      {!repos.length && <p className="hint-line">no repositories yet: a group's repositories show here</p>}
      {repos.map((repo) => {
        const r = t.wake?.[repo];
        const who: Who = r?.others ? "people" : r?.mine ? "mine" : "off";
        return (
          <Fragment key={repo}>
            <div className="field-r">
              <div className="lab"><span>{repo}</span></div>
              <Seg value={who} disabled={off} options={[["off", "nobody"], ["mine", "me"], ["people", "me and people I name"]]}
                onChange={(v) => {
                  if (v === "people" && (!r?.read || !r.from.length)) { setNames(""); setAsking(repo); return; }   // nobody named yet: the card, terms and all
                  setAsking("");
                  put(repo, { mine: v !== "off", others: v === "people" });
                }} />
            </div>
            {asking === repo && (
              <div className="ctl-card">
                <div className="ctl-card-h"><span>before other people can wake your agent on {repo}</span></div>
                <p className="ctl-terms">{TERMS}</p>
                <div className="ctl-card-row">
                  <input className="wfield" value={names} placeholder="their GitHub logins: marco, isaac" spellCheck={false} onChange={(e) => setNames(e.target.value)} />
                </div>
                <div className="ctl-card-row ctl-card-end">
                  <button className="wbtn" onClick={() => setAsking("")}>keep it off</button>
                  <button className="wbtn" disabled={off || !logins(names).length}
                    onClick={() => { put(repo, { mine: true, others: true, from: logins(names), read: new Date().toISOString().slice(0, 10) }); setAsking(""); }}>
                    I weighed it, turn it on
                  </button>
                </div>
              </div>
            )}
            {who === "people" && (
              <div className="field-r">
                <div className="lab"><span>who</span></div>
                <Field value={r!.from.join(", ")} placeholder="marco, isaac" onSave={(v) => { const f = logins(v); put(repo, f.length ? { from: f } : { from: [], others: false }); }} />
              </div>
            )}
            {who !== "off" && (
              <p className="hint-line">{who === "mine" ? "my comments" : `my comments and ${r!.from.join(", ")}'s (GitHub logins; terms read ${r!.read})`} start a session in an empty folder that reads the thread and answers there; anything else asks me first. At most {r?.perDay ?? 3} times a thread a day</p>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
