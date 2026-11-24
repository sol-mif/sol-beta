// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// Settings › Seats and sign-ins (round 6 · M2, #1615; merge/seats.js's page, redrawn from missing/seats.html): Coming up
// (each item also a Diary line), Your AI plans (Claude Code, Codex, Sol's own are seats) and Accounts I read, each with
// what it may reach. Every sign-in happens on its own page; nothing here sees a password. It replaces Connected
// services: the row under "How your AIs work" (SeatsRow) and the page (Seats), hung on slice 6's panel by ./hook.ts.
// Opened at a row, that row is ringed and scrolled into the middle of the panel. Reads the store, presses M.
// Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { useEffect, type ReactNode } from "react";
import { M, useNext } from "../../cv/index.ts";
import { ctx, me, seatRow } from "../../cv/moves/seats.ts";
import { acctSt, rowSub, seatSt, sinceOf, soon, type Acct, type Ctx, type Seat } from "./model.ts";
import "./seats.css";

const Who = ({ xs }: { xs: string[] }) => xs.length ? <span className="se-who">{xs.map((n) => <span key={n}><span className="nx-aura" />{n}</span>)}</span> : null;
const Wait = () => <span className="se-wait"><span className="nx-aura" /><span className="st-state">Waiting for you</span></span>;
const Btn = ({ pri, on, act, children }: { pri?: boolean; on: () => void; act?: string; children: string }) => <button className={`st-btn${pri ? " pri" : ""}`} data-r6acct={act} onClick={on}>{children}</button>;

function SeatRow({ c, x, hl }: { c: Ctx; x: Seat; hl: boolean }) {
  const s = seatSt(c, x), plan = [x.plan, x.acct].filter(Boolean).join(" · ");
  let state = null, btn = null, small: ReactNode = null;
  if (s === "use") { state = <span className="st-state se-work">In use</span>; small = <>{plan}<span className="se-use"><span className="se-bar"><i style={{ width: `${x.use}%` }} /></span>{x.useW}</span></>; }
  else if (s === "in") { state = <span className="st-state">{x.own ? "Ready" : "Signed in"}</span>; small = `${plan}${x.idle ? ` · ${x.idle}` : ""}`; }
  else if (s === "ends") { state = <span className="st-state se-need">Ends {x.ends!.split(" ")[0]}</span>; small = `${plan} · signed in until ${x.ends}`; btn = <Btn pri on={() => M.sign_in(x.id, "wait")}>Renew</Btn>; }
  else if (s === "renewed") { state = <span className="st-state se-work">In use</span>; small = `${plan} · renewed just now, until 19 February`; }
  else if (s === "wait") { state = <Wait />; small = `Sign in on ${x.n}’s own page; come back when it says you’re in.`; btn = <Btn on={() => M.sign_in(x.id, x.st === "ends" ? "renewed" : "in")}>It says I’m in</Btn>; }
  else { state = <span className="st-state off">Not installed</span>; small = x.quiet || (x.plan ? `Not on this Mac · you have ${x.plan}` : "Not on this Mac"); }
  return (
    <div className={`st-row se-row${hl ? " hl" : ""}`} data-seat-row={x.id}>
      <span className="st-t"><b>{x.n}</b><small>{small}</small>{x.who.length && s !== "none" ? <span className="st-may">Works here: <Who xs={x.who} /></span> : null}</span>
      {state}<span className="se-acts">{btn}</span>
    </div>
  );
}
function AcctRow({ c, a, hl, lapsedBy }: { c: Ctx; a: Acct; hl: boolean; lapsedBy?: string }) {
  const s = acctSt(c, a);
  let state = null, btn = null, small = a.sub || "";
  if (s === "on") { state = <span className="st-state">Connected</span>; btn = <Btn on={() => M.sign_in(a.id, "off")}>Disconnect</Btn>; }
  else if (s === "lapsed") { state = <span className="st-state se-need">Ended {sinceOf(c, a).split(",")[0]}</span>; small = `${a.sub}${lapsedBy || a.by ? ` · ${lapsedBy || a.by} ${lapsedBy ? "wait" : "waits"} on it` : ""}`; btn = <Btn pri act={`${a.id}|wait`} on={() => M.sign_in(a.id, "wait")}>Sign in once</Btn>; }
  else if (s === "ends") { state = <span className="st-state se-need">Ends {a.ends!.split(" ")[0]}</span>; small = `${a.sub} · ${a.why}`; btn = <Btn pri on={() => M.sign_in(a.id, "wait")}>Renew</Btn>; }
  else if (s === "wait") { state = <Wait />; small = "Sign in on its own page. I never see your password."; btn = <Btn on={() => M.sign_in(a.id, "done")}>It says I’m in</Btn>; }
  else if (s === "done") { state = <span className="st-state">Connected</span>; small = `${a.sub} · signed in just now`; }
  else if (s === "blocked") { state = <span className="st-state off">Blocked by your school</span>; small = `Your school blocks outside apps. ${a.way}`; btn = <Btn on={() => M.sign_in(a.id, "via")}>{a.wayBtn!}</Btn>; }
  else if (s === "via") { state = <span className="st-state">Read through Mail</span>; small = `${a.sub} · its copy in Mail on this Mac, names, dates and titles only`; }
  else if (s === "never") { state = <span className="st-state off">Not read</span>; small = "You said not to read this. I won’t offer it again."; }
  else { state = <span className="st-state off">Not connected</span>; btn = <Btn on={() => M.sign_in(a.id, "wait")}>Connect</Btn>; }
  return (
    <div className={`st-row se-row${hl ? " hl" : ""}`} data-seat-row={a.id}>
      <span className="st-t"><b>{a.n}</b><small>{small}</small>
        {a.may.length && s !== "never" ? <><span className="st-may">May: {a.may.map((m) => <span key={m} className="se-tag">{m}</span>)}</span><span className="st-may">May not: {a.not}{a.by ? ` · used by ${a.by}` : ""}</span></> : null}</span>
      {state}<span className="se-acts">{btn}</span>
    </div>
  );
}

/** the page: Settings › Seats and sign-ins */
export function Seats() {
  const { p, c, row } = useNext(() => ({ p: me(), c: ctx(), row: seatRow() }));
  useEffect(() => {
    if (!row) return;
    const el = document.querySelector(`#v-settings [data-seat-row="${CSS.escape(row)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  }, [row, p]);
  if (!p || (!p.seats.length && !p.accts.length)) return <div className="st-page se-page" data-r6="seats"><h1>Your AI subscriptions</h1><p className="st-say">No AI plans here yet.</p></div>;
  const S = soon(c, p), open = S.filter((x) => !x.g).length, lapsed = c.lapsed;
  return (
    <div className="st-page se-page" data-st="seats" data-r6="seats">
      <h1>Your AI subscriptions</h1>
      <p className="st-say">The AI plans you already pay for run here as seats, each on its own sign-in. Every sign-in is yours: it happens on its own page, and I never see a password.</p>
      {S.length ? <>
        <h2 className="st-gh">Coming up <small>{open || "none open"} · I check every morning and tell you a week ahead, in the Diary too</small></h2>
        <div className="st-card0 se-soon">{S.map((x) => (
          <div key={x.kind + x.id} className="st-row" data-soon={x.id}>
            <span className={x.g === "done" ? "se-g-done" : x.g === "wait" ? "se-g-saw" : "se-g-ask"}>{x.g === "done" ? "✓" : x.g === "wait" ? <span className="nx-aura" /> : "!"}</span>
            <span className="st-t">{x.t}<small>{x.w}</small></span>
            <span className="se-acts">{x.g ? null : <><Btn pri on={() => M.sign_in(x.id, "wait")}>{x.btn!}</Btn>{x.btn === "Renew now" ? <Btn on={() => M.remind_later(x.id)}>Remind me the day before</Btn> : null}</>}</span>
          </div>))}</div>
      </> : <><h2 className="st-gh">Coming up</h2><p className="se-calm"><span className="nx-aura" /> Nothing ends in the next week. Checked this morning at 06:00.</p></>}
      {p.seats.length ? <><h2 className="st-gh">Your AI plans <small>seats</small></h2><div className="st-card0">{p.seats.map((x) => <SeatRow key={x.id} c={c} x={x} hl={row === x.id} />)}</div></> : null}
      <h2 className="st-gh">Accounts I read <small>one at a time, each with what it may reach</small></h2>
      <div className="st-card0">{p.accts.map((a) => <AcctRow key={a.id} c={c} a={a} hl={row === a.id} lapsedBy={lapsed?.[a.id]?.by} />)}</div>
      <p className="se-calm">Withdrawing any of these is one press here; what was read through it is listed in the Diary.</p>
    </div>
  );
}

/** its row in "How your AIs work" on Settings' main page (replaces Connected services' row in Money and your data) */
export function SeatsRow() {
  const sub = useNext(() => rowSub(ctx(), me()));
  return <div className="st-knob st-go"><button className="st-head" data-p="seats" data-place="seats" aria-label="Your AI subscriptions" aria-description={sub || "Your AI plans, and each account they read"} onClick={() => M.see_seats()}><span className="st-ht"><b>Your AI subscriptions</b><small className="st-who">{sub || "Your AI plans, and each account they read"}</small></span><span className="st-cur">›</span></button></div>;
}
