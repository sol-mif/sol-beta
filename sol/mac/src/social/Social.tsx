// Social, the spine's fourth view (fr-31, specs/features/fr-31-social/prd.md), shown only with the `social` switch on
// (spine/Modes.tsx). Tabs: Profile, Friends, Requests, Market, Leaderboard, Challenges, and Suggested upgrades and
// Social's settings. Everything changes the model (model.ts) through the store (store.ts); nothing here runs a prompt,
// counts use or reaches the cloud. Friends are pretend under ?dev=social until the hub carries them (backend.md).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { useEngine } from "../useEngine";
import { EmptyView } from "../spine/Modes";
import {
  AGENT_LEVELS, GRANTS, JELLIES, LOCATION_FOR, accept, addFriend, answerAsk, noteTold, badgesOf, buy, decline, favourWords, inviteLink, install,
  levelOf, makeInvite, midnightAfter, notchButton, openRequests, pickJelly, proposeTime, receive, receiveHelp, sendBack, setCircle,
  setGrant, shareOnAccept, shareWord, styleOf, suggest, uninstall, uploadJelly, xpOf, clock, type Build, type Friend, type GrantKey, type Person,
  type Picture, type Request, type State,
} from "./model.ts";
import { BUILDS, CHALLENGES, CREDITS, HAPPENINGS, PERKS, nextDay } from "./pretend.ts";
import { setSocial, useSocial, resetSocial, takeSaveTrouble } from "./store.ts";
import { useEverythingOn } from "./flag.ts";
import { askRequests, openOn, peekOpenAsk, takeOpenAsk } from "./notch.ts";
import "./social.css";

type E = ReturnType<typeof useEngine>;
type Tab = "jelly" | "profile" | "friends" | "friend" | "requests" | "market" | "leaderboard" | "challenges" | "community" | "upgrades" | "settings";
const TABS: [Tab, string][] = [["jelly", "your jelly"], ["profile", "profile"], ["friends", "friends"], ["requests", "requests"], ["market", "market"], ["leaderboard", "leaderboard"], ["challenges", "challenges"], ["community", "community"], ["upgrades", "suggested upgrades"], ["settings", "social settings"]];
const H = 3_600_000;

/** a person's jelly: their picture, their colours and pace; the dot is their presence */
export function Jelly({ p, size = 40, dot }: { p: { jelly: Picture; presence?: string }; size?: number; dot?: boolean }) {
  const s = styleOf(p);
  return (
    <span className="so-jelly" style={{ "--a": s.a, "--b": s.b, "--pace": `${s.pace}s`, width: size, height: size } as CSSProperties}>
      {p.jelly.img && <img src={p.jelly.img} alt="" />}
      {dot && p.presence && <i className={`so-dot ${p.presence}`} />}
    </span>
  );
}
/** the box where a person's agent is shown working: it takes their jelly's style (prd 2); Cowork's cards can use the same */
export function AgentBox({ p, children }: { p: { jelly: Picture }; children: ReactNode }) {
  const s = styleOf(p);
  return <div className="so-agent" style={{ "--a": s.a, "--b": s.b, "--pace": `${s.pace}s` } as CSSProperties}>{children}</div>;
}
/** the notch's green request button (prd 6): the count and the jelly on top; pressing it opens Requests */
export function RequestButton({ s, onOpen }: { s: Pick<State, "requests">; onOpen: () => void }) {
  const b = notchButton(s);
  if (!b.count) return <span className="so-req none">no requests</span>;
  return <button className="so-req" onClick={onOpen}>{b.top && <Jelly p={{ jelly: b.top }} size={20} />}{b.count} request{b.count === 1 ? "" : "s"}</button>;
}

export function Social({ e, pretend }: { e: E; pretend: boolean }) {
  const s = useSocial();
  const [tab, setTab] = useState<Tab>(s.onboarded ? "profile" : "jelly");
  const [who, setWho] = useState<string>("");
  const [said, setSaid] = useState("");
  useEffect(() => { const tr = takeSaveTrouble(); if (tr) say(tr); });
  const say = (t: string | undefined) => { if (!t) return; setSaid(t); window.setTimeout(() => setSaid((x) => (x === t ? "" : x)), 2800); };
  // the notch's ask, queued while the jelly step shows (notch.ts): Done's label says where it goes
  const [queued, setQueued] = useState<"requests" | null>(() => peekOpenAsk(sessionStorage));
  // leaving the jelly step any way is the step done (the jelly has a default), so Social never starts on it again;
  // Requests reached by hand takes a queued ask with it, so a later mount does not open on it long after
  const go = (t: Tab) => {
    if (!s.onboarded && t !== "jelly") setSocial((x) => ({ ...x, onboarded: true }));
    if (t === "requests") { takeOpenAsk(sessionStorage); setQueued(null); }
    setTab(t);
  };
  // the notch's green button (pretend: drawn above the view, prd 6) and a real one's ask land on Requests
  // the notch's press: Requests, once the jelly step is done (prd 1: the first open starts with your jelly); before, it waits
  const onboarded = useRef(s.onboarded); onboarded.current = s.onboarded;
  useEffect(() => {
    const f = () => { if (openOn(onboarded.current, sessionStorage)) { setTab("requests"); setQueued(null); } else setQueued(peekOpenAsk(sessionStorage)); };
    f();   // queued before this mounted (App.tsx)
    window.addEventListener("sol:social-requests", f);
    return () => window.removeEventListener("sol:social-requests", f);
  }, []);
  const waiting = notchButton(s).count;
  const side = (
    <div className="so-side">
      <div className="so-me"><Jelly p={s.me} size={36} dot /><div><b>{s.me.name}</b><small>@{s.me.sol} · level {levelOf(xpOf(s.me.published)).level}</small></div></div>
      {TABS.map(([k, n]) => <button key={k} className={`so-tab ${tab === k || (k === "friends" && tab === "friend") ? "on" : ""}`} onClick={() => go(k)}>{n}{k === "requests" && waiting > 0 && <span className="so-n">{waiting}</span>}</button>)}
      {(["close", "friend"] as const).map((c) => (
        <div key={c}><div className="so-h">{c === "close" ? "close friends" : "friends"}</div>
          {s.friends.filter((f) => f.circle === c).map((f) => <button key={f.sol} className="so-fr" onClick={() => { setWho(f.sol); go("friend"); }}><Jelly p={f} size={18} dot /> {f.name}</button>)}
          {!s.friends.some((f) => f.circle === c) && <div className="so-none">none yet</div>}
        </div>
      ))}
      {pretend && <button className="so-fr so-dim" onClick={() => { resetSocial(true); setTab("jelly"); }}>start the pretend friends over</button>}
    </div>
  );
  const view = tab === "jelly" ? <JellyStep s={s} say={say} done={() => { setSocial((x) => ({ ...x, onboarded: true })); go(queued ?? "profile"); }} next={queued ?? "profile"} />
    : tab === "profile" ? <Profile s={s} say={say} toJelly={() => go("jelly")} />
    : tab === "friends" ? <Friends s={s} say={say} open={(sol) => { setWho(sol); go("friend"); }} pretend={pretend} />
    : tab === "friend" ? <FriendGrants s={s} sol={who} say={say} back={() => go("friends")} />
    : tab === "requests" ? <Requests s={s} say={say} />
    : tab === "market" ? <Market s={s} e={e} say={say} />
    : tab === "leaderboard" ? <Leaderboard s={s} />
    : tab === "challenges" ? <Challenges s={s} say={say} />
    : tab === "community" ? <Community s={s} />
    : tab === "upgrades" ? <Upgrades s={s} e={e} say={say} />
    : <SocialSettings s={s} e={e} say={say} />;
  return (
    <EmptyView name="social" where={tab === "friend" ? "what a friend sees" : TABS.find(([k]) => k === tab)?.[1] ?? "your jelly"} side={[]} cards={[]} sideNode={side}
      core={<section className="so-core" data-place="talk">
        {pretend && <div className="so-notch" aria-label="the notch, as it will look"><span>the notch, as it shows it</span><RequestButton s={s} onOpen={() => { askRequests(sessionStorage); window.dispatchEvent(new Event("sol:social-requests")); }} /><span>pretend friends</span></div>}
        {tab !== "jelly" && <Happenings s={s} go={go} />}
        {view}
        {said && <div className="so-said" role="status">{said}</div>}
      </section>} />
  );
}

type P = { s: State; say: (t: string | undefined) => void };

function JellyStep({ s, say, done, next }: P & { done: () => void; next: "requests" | "profile" }) {
  const set = (j: Picture) => setSocial((x) => ({ ...x, me: { ...x.me, jelly: j } }));
  const up = (f: File | undefined) => { if (!f) return; const r = new FileReader(); r.onload = () => { set(uploadJelly(s.me.jelly, String(r.result))); say("your picture is your jelly now"); }; r.readAsDataURL(f); };
  const [dock, setDock] = useState(false);
  return (
    <div className="so-page">
      <h1>Your jelly <small>Social starts here</small></h1>
      <p className="so-lead">Your jelly is your face to friends, and it colours your agent wherever it's seen working. Pick one, bring your own picture, or have one made.</p>
      <div className="so-row so-big"><Jelly p={s.me} size={120} />
        <div className="so-grow"><div className="so-row so-wrap">{JELLIES.map((j, i) => (
          <button key={j.name} className={`so-pick ${s.me.jelly.preset === i && !s.me.jelly.img ? "on" : ""}`} title={j.name} onClick={() => set(pickJelly(s.me.jelly, i))}><Jelly p={{ jelly: { preset: i } }} size={64} /></button>))}</div>
          <div className="so-row so-gap">
            <label className="so-btn">upload a picture<input type="file" accept="image/*" hidden onChange={(ev) => up(ev.target.files?.[0])} /></label>
            <button className="so-btn" onClick={() => say("making a jelly from words needs an image service and a key; a placeholder for now")}>generate one</button>
            <button className="so-btn" onClick={() => setDock(true)}>use as app icon</button>
          </div></div></div>
      <AgentBox p={s.me}>{s.me.name}'s agent · as friends see it working · {AGENT_LEVELS[s.me.agent]}</AgentBox>
      {dock && <div className="so-card"><div className="so-dock"><span /><span /><Jelly p={s.me} size={44} /><span /></div>
        <p className="so-dim">Your jelly on the Dock comes with the next app build: it needs a small native change (Tauri has no call for it yet). The picture is ready.</p><button className="so-btn" onClick={() => setDock(false)}>ok</button></div>}
      <div className="so-row so-end"><button className="so-btn first" onClick={done}>{next === "requests" ? "Done, show my requests" : "Done, show my profile"}</button></div>
    </div>
  );
}

function Profile({ s, say, toJelly }: P & { toJelly: () => void }) {
  const L = levelOf(xpOf(s.me.published));
  const [w, setW] = useState(s.me.working ?? "");
  const pub = s.me.published;
  return (
    <div className="so-page">
      <div className={`so-banner ${s.me.premium ? "premium" : ""}`} />
      <div className="so-prof"><button className="so-pick so-prof-jelly" title="change your jelly" aria-label="change your jelly" onClick={toJelly}><Jelly p={s.me} size={112} /></button><div><h1>{s.me.name} <small>@{s.me.sol}{s.me.premium ? " · premium" : ""}</small></h1>
        <div className="so-row"><span className="so-dim">working on</span><input className="so-in so-wide" value={w} placeholder="nothing right now" onChange={(ev) => setW(ev.target.value)} />
          <button className="so-btn" onClick={() => { setSocial((x) => ({ ...x, me: { ...x.me, working: w.trim() || undefined } })); say(w.trim() ? "friends you share it with see it now" : "cleared"); }}>set</button></div></div></div>
      <h2>Level</h2>
      <div className="so-row"><span className="so-lvl">{L.level}</span><div className="so-grow"><div className="so-xp"><i style={{ width: `${Math.round((L.into / L.need) * 100)}%` }} /></div>
        <small className="so-dim">{L.into} of {L.need} XP to level {L.level + 1} · from what you publish: {pub.builds} builds posted, {pub.downloads} downloads, {pub.wins} challenge{pub.wins === 1 ? "" : "s"} won, {pub.helped} friend{pub.helped === 1 ? "" : "s"} helped. Nothing counts how much you use Sol.</small></div></div>
      <div className="so-quest"><b>quest</b><span className="so-grow">Publish a build: +100 XP{L.into + 100 >= L.need ? `, and you reach level ${L.level + 1}` : ""}.</span>
        <button className="so-btn" onClick={() => { setSocial((x) => ({ ...x, me: { ...x.me, published: { ...x.me.published, builds: x.me.published.builds + 1 } } })); say("+100 XP"); }}>publish (pretend)</button></div>
      <h2>Badges</h2>
      <div className="so-row so-wrap">{badgesOf(pub, s.me.premium).map((b) => <span key={b.t} className="so-badge"><b>{b.g}</b>{b.t}</span>)}{!badgesOf(pub, s.me.premium).length && <span className="so-dim">Your first build earns your first badge.</span>}</div>
      <h2>Published</h2>
      <div className="so-grid">{BUILDS.filter((b) => b.by === s.me.sol).map((b) => <BuildCard key={b.id} b={b} s={s} />)}</div>
      <h2>Premium</h2>
      <div className="so-card so-row"><span className="so-grow">{s.me.premium ? "Your banner moves and shines, and the champions league is open." : "Premium gives your profile a moving banner and opens the champions league."} <span className="so-dim">Pretend; no payment.</span></span>
        <button className="so-btn" onClick={() => setSocial((x) => ({ ...x, me: { ...x.me, premium: !x.me.premium } }))}>{s.me.premium ? "turn premium off" : "try premium"}</button></div>
    </div>
  );
}

function FriendCard({ f, open, s }: { f: Friend; open: () => void; s: State }) {
  return (
    <div className="so-card">
      <div className="so-friend"><Jelly p={f} size={44} dot />
        <div className="so-grow"><b>{f.name}</b> <small className="so-dim">@{f.sol} · {f.presence}</small><div className="so-dim">{f.working ? `working on ${f.working}` : "nothing shared"}</div></div>
        <button className="so-btn" onClick={() => setSocial((x) => setCircle(x, f.sol, f.circle === "close" ? "friend" : "close"))}>{f.circle === "close" ? "close friend ✓" : "make close friend"}</button>
        <button className="so-btn" onClick={open}>what they see</button></div>
      <AgentBox p={f}>{f.name}'s agent · {f.presence === "offline" ? "resting" : f.working ? `on ${f.working}` : "idle"} · <span className="so-dim">{AGENT_LEVELS[f.agent]}</span>{s.sent.filter((x) => x.to === f.sol).slice(0, 1).map((x) => <span key={x.at} className="so-dim"> · your ask: {x.said}</span>)}</AgentBox>
    </div>
  );
}

function Friends({ s, say, open, pretend }: P & { open: (sol: string) => void; pretend: boolean }) {
  const [name, setName] = useState("");
  const add = () => { const r = addFriend(s, name); if (r.error) return say(r.error); setSocial(() => r.s); setName(""); say("request sent; it reaches them when the hub carries friends"); };
  return (
    <div className="so-page">
      <h1>Friends <small>{s.friends.filter((f) => f.presence === "online").length} online · {s.friends.length} friends</small></h1>
      <p className="so-lead">A friend is a person with their own agent, the same as in Cowork. Each card takes its person's jelly colours: that's their agent's style wherever it works.</p>
      <div className="so-card so-row"><span className="so-dim">add by Sol name or invite link</span><input className="so-in" value={name} placeholder="their Sol name" onChange={(ev) => setName(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && add()} />
        <button className="so-btn first" onClick={add}>send request</button><span className="so-grow" />
        <button className="so-btn" onClick={() => { void navigator.clipboard?.writeText(inviteLink(s.me.sol, Math.random().toString(36).slice(2, 8))); say("invite link copied · one use, 7 days"); }}>copy my invite link</button></div>
      {s.outgoing.map((o) => <div key={o} className="so-dim so-small">request sent to @{o} · waiting</div>)}
      <h2>Close friends <small>can be given more</small></h2>
      {s.friends.filter((f) => f.circle === "close").map((f) => <FriendCard key={f.sol} f={f} s={s} open={() => open(f.sol)} />)}
      <h2>Friends</h2>
      {s.friends.filter((f) => f.circle === "friend").map((f) => <FriendCard key={f.sol} f={f} s={s} open={() => open(f.sol)} />)}
      {!s.friends.length && <div className="so-card so-dim">No friends yet. Add someone by their Sol name, or send your invite link.</div>}
      {pretend && s.friends.some((f) => f.sol === "marco") && <MarcoSide s={s} say={say} />}
      <AskHelp s={s} say={say} />
    </div>
  );
}

// pretend (?dev=social): Marco's agent, on Marco's Sol, plays the dinner flow against this Social (prd 5)
function MarcoSide({ s, say }: P) {
  const [log, setLog] = useState<string[]>([]);
  const [place, setPlace] = useState("The Grotto");
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);
  const [sent, setSent] = useState(false);
  const marco = s.friends.find((f) => f.sol === "marco")!;
  const thu = nextDay(Date.now(), 4);
  const ask = () => {
    const now = Date.now();
    const a = answerAsk(s, "marco", { what: "freebusy", from: thu, to: thu + 24 * H, why: "dinner Thursday?" }, now);
    setSocial((x) => noteTold(x, a, now));
    if ("answer" in a && "freebusy" in a.answer) {
      const busy = a.answer.freebusy; const t = proposeTime(busy, thu, 1.5 * H);
      setSlot(t);
      setLog([`${s.me.name}'s agent answered on its own (free/busy is shared with Marco): Thursday busy ${busy.map((b) => `${clock(b.start)}–${clock(b.end)}`).join(", ") || "never"}.${t ? ` Free at ${clock(t.start)}.` : " No evening free."}`]);
    } else if ("request" in a) { setSocial((x) => receive(x, a.request)); setLog([`${s.me.name}'s agent couldn't answer: free/busy isn't shared with Marco. It asked ${s.me.name}.`]); }
  };
  const invite = () => {
    if (!slot) return;
    const r = makeInvite(marco, { title: "Dinner", place: place.trim() || "The Grotto", start: slot.start, end: slot.end }, "you're free then, my agent checked. my treat", Date.now());
    setSocial((x) => receive(x, r)); setSent(true); setLog((l) => [...l, "Invite sent. It's on the notch."]); say("a green request just landed on the notch");
  };
  return (
    <>
      <h2>Marco's side <small>pretend · Marco's agent, on Marco's Sol</small></h2>
      <div className="so-card"><button className="so-btn" onClick={ask}>Marco's agent asks: when is {s.me.name} free Thursday?</button>
        {log.map((l) => <AgentBox key={l} p={marco}>{l}</AgentBox>)}
        {slot && <div className="so-row so-gap"><span className="so-dim">place</span><input className="so-in" value={place} onChange={(ev) => setPlace(ev.target.value)} /><span className="so-dim">at {clock(slot.start)}</span><button className="so-btn first" disabled={sent} onClick={invite}>{sent ? "invited" : `invite ${s.me.name} to dinner`}</button></div>}
      </div>
    </>
  );
}

// asking a friend for help: a message they read; Sol never runs it (prd 7). Pretend: the friend's own limit answers here.
function AskHelp({ s, say }: P) {
  const [to, setTo] = useState(s.friends[0]?.sol ?? "");
  const [sum, setSum] = useState(""); const [full, setFull] = useState(""); const [ctx, setCtx] = useState(""); const [size, setSize] = useState("about a 20-minute job");
  if (!s.friends.length) return null;
  const send = () => {
    if (!sum.trim()) return say("one line of what you need first");
    const f = s.friends.find((x) => x.sol === to)!;
    // the friend's own Social decides (receiveHelp on their Mac, backend.md §6); pretend: Jev takes close friends only,
    // and each friend's count is kept (theirFavours), so the week's limit can be reached in play
    const theirs: State = { ...s, me: { ...s.me, name: f.name }, favour: f.sol === "jev" ? { perWeek: 3, from: "close" } : { perWeek: 3, from: "friends" }, favours: s.theirFavours?.[f.sol] ?? { week: "", n: 0 },
      friends: [{ ...s.me, circle: f.sol === "marco" ? "close" : "friend", grants: {} } as Friend] };
    const r = receiveHelp(theirs, s.me.sol, { summary: sum.trim(), prompt: full.trim() || sum.trim(), context: ctx.trim() || undefined, size }, Date.now());
    const said = r.refused ? `didn't reach ${f.name}: ${r.refused}` : `${size}; waiting, ${f.name} decides`;
    const theirFavours = { ...s.theirFavours, [f.sol]: r.s.favours };
    setSocial((x) => ({ ...x, theirFavours, sent: [{ to, summary: sum.trim(), at: Date.now(), said }, ...x.sent] })); say(said); setSum(""); setFull(""); setCtx("");
  };
  return (
    <>
      <h2>Ask a friend for help</h2>
      <div className="so-card">
        <div className="so-row"><select className="so-in" value={to} onChange={(ev) => setTo(ev.target.value)}>{s.friends.map((f) => <option key={f.sol} value={f.sol}>{f.name}</option>)}</select>
          <input className="so-in so-grow" value={sum} placeholder="one line: what you need" onChange={(ev) => setSum(ev.target.value)} /></div>
        <textarea className="so-in so-area" value={full} placeholder="the full task, as you'd write it to them" onChange={(ev) => setFull(ev.target.value)} />
        <textarea className="so-in so-area" value={ctx} placeholder="the context it needs: links, files, the folder, what you tried" onChange={(ev) => setCtx(ev.target.value)} />
        <div className="so-row"><select className="so-in" value={size} onChange={(ev) => setSize(ev.target.value)}>{["about a 5-minute job", "about a 20-minute job", "about an hour"].map((x) => <option key={x}>{x}</option>)}</select>
          <span className="so-grow so-dim so-small">They read it and decide: Run it in their own Sol, or not this time.</span><button className="so-btn first" onClick={send}>send the ask</button></div>
        {s.sent.slice(0, 4).map((x) => <div key={x.at} className="so-dim so-small">to {s.friends.find((f) => f.sol === x.to)?.name ?? x.to}: “{x.summary}” · {x.said}</div>)}
      </div>
    </>
  );
}

function FriendGrants({ s, sol, say, back }: P & { sol: string; back: () => void }) {
  const f = s.friends.find((x) => x.sol === sol);
  const now = Date.now();
  if (!f) return <div className="so-page"><button className="so-btn" onClick={back}>← friends</button></div>;
  const close = f.circle === "close";
  const flip = (k: GrantKey, on: boolean, until?: number) => { const r = setGrant(s, f.sol, k, on, until); if (r.error) return say(r.error); setSocial(() => r.s); say(on ? "shared" : `${f.name}'s agent can't see it from now`); };
  return (
    <div className="so-page">
      <button className="so-btn ghost" onClick={back}>← friends</button>
      <div className="so-row so-gap"><Jelly p={f} size={72} dot /><div><h1>What {f.name} sees <small>{close ? "close friend" : "friend"}</small></h1>
        <p className="so-lead">Each line is your yes, and you can take it back here any time. {f.name}'s agent can ask yours only for what's on.</p></div></div>
      <div className="so-card">{GRANTS.map((g) => {
        const can = !g.close || close, on = !!f.grants[g.k] && (g.k !== "location" || (f.locUntil ?? 0) > now);
        return (
          <div key={g.k} className="so-grant"><div className="so-grow">{g.name} {g.common && <span className="so-chip common">commonly shared</span>} {g.close && <span className="so-chip">close friends</span>}
            <small>{g.why}{g.k === "location" && on ? ` · on until ${clock(f.locUntil!)}` : ""}{!can ? " · make them a close friend first" : ""}</small></div>
            {g.k === "location" && can && !on
              ? <span className="so-seg">{([["1 hour", now + LOCATION_FOR["1 hour"]], ["4 hours", now + LOCATION_FOR["4 hours"]], ["until midnight", midnightAfter(now)]] as const).map(([t, u]) => <button key={t} onClick={() => flip("location", true, u)}>{t}</button>)}</span>
              : <button className={`so-switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={g.name} disabled={!can} onClick={() => flip(g.k, !on, g.k === "location" ? f.locUntil : undefined)}><i /></button>}
          </div>);
      })}</div>
      <h2>{f.name}'s agent may, for {f.name}</h2>
      <div className="so-card"><div className="so-row so-wrap">{AGENT_LEVELS.map((l, i) => <span key={l} className={`so-chip ${i === f.agent ? "on" : ""}`}>{l}</span>)}</div>
        <small className="so-dim">{f.name} sets this, Cowork's same setting. It never reaches past what you share.</small></div>
    </div>
  );
}

const WORDS: Record<Request["kind"], [string, string]> = { friend: ["Accept", "Decline"], data: ["Share", "Decline"], invite: ["Accept", "Decline"], help: ["Run it", "Not this time"] };
function Requests({ s, say }: P) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Record<string, string>>({});
  // settled inside the store's updater, so a request that lands meanwhile is kept and a second press finds it settled
  const settle = <T extends { s: State }>(f: (x: State) => T): T => { let out!: T; setSocial((x) => { out = f(x); return out.s; }); return out; };
  const yes = (r: Request, run = true) => {
    const x = settle((st) => accept(st, r.id, Date.now()));
    say(x.told);
    if (x.calendar) import("@tauri-apps/plugin-opener").then((o) => o.openUrl(x.calendar!)).catch(() => window.open(x.calendar, "_blank"));
    // Run it: a new session of the helper's own, sent on their press; Open it first: prefilled, sent only when they do
    if (x.prompt) window.dispatchEvent(new CustomEvent("sol:social-take", { detail: { text: x.prompt, run } }));
  };
  const list = s.requests.filter((r) => r.state !== "declined" || open.has(r.id));
  return (
    <div className="so-page">
      <h1>Requests <small>{openRequests(s).length} waiting</small></h1>
      {(s.told ?? []).length > 0 && <div className="so-card so-told"><small className="so-dim">answered on its own, with your agent on "does, then tells" at the time</small>{(s.told ?? []).slice(0, 5).map((l) => <div key={l.at} className="so-small">{l.line} · <span className="so-dim">{clock(l.at)}</span></div>)}</div>}
      <p className="so-lead">What a friend or their agent asks of you, one kind of card. The green button on the notch opens this page. Your agent already answered what you had shared; these are what it couldn't answer for you.</p>
      {list.map((r) => {
        const done = r.state === "accepted" || r.state === "declined" || r.state === "sent";
        return (
          <div key={r.id} className={`so-card so-reqcard ${done ? "done" : ""}`}><Jelly p={{ jelly: r.jelly }} size={44} />
            <div className="so-grow">
              <div className="so-row"><b className="so-grow">{r.summary}</b><span className="so-chip">{r.kind}</span></div>
              {r.note && <div className="so-dim">“{r.note}”</div>}
              {r.help && <div className="so-dim so-small">{r.help.size} · Sol runs nothing on its own: Run it opens a session of your own and sends it, on your press</div>}
              {r.kind === "friend" && r.state === "open" && <div className="so-card so-inset"><small className="so-dim">accepting shares these with {r.fromName}; turn any off first</small>
                {GRANTS.filter((g) => g.common).map((g) => { const on = r.share?.[g.k] !== false; return (
                  <div key={g.k} className="so-grant"><div className="so-grow">{g.name}<small>{g.why}</small></div><button className={`so-switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={g.name} onClick={() => setSocial((x) => shareOnAccept(x, r.id, g.k, !on))}><i /></button></div>); })}</div>}
              {open.has(r.id) && <pre className="so-full">{r.full}</pre>}
              {r.state === "taken" && <div className="so-card so-inset"><small className="so-dim">it's a session of your own in Build; when you're done, write what you send back</small>
                <textarea className="so-in so-area" value={result[r.id] ?? ""} placeholder={`what you send back to ${r.fromName}`} onChange={(ev) => setResult((m) => ({ ...m, [r.id]: ev.target.value }))} /></div>}
              <div className="so-row so-gap">
                {r.state === "open" && <>{r.kind === "data" && !shareWord(s, r) ? <span className="so-dim so-small">only close friends can be given this</span>
                  : <button className="so-btn go" onClick={() => yes(r)}>{r.kind === "data" ? shareWord(s, r) : WORDS[r.kind][0]}</button>}
                  {r.kind === "help" && <button className="so-btn" onClick={() => yes(r, false)}>Open it first</button>}<button className="so-btn" onClick={() => say(settle((st) => decline(st, r.id)).told)}>{WORDS[r.kind][1]}</button></>}
                {r.state === "taken" && <><button className="so-btn first" onClick={() => { const x = settle((st) => sendBack(st, r.id, result[r.id] ?? "")); say(x.error ?? (x.to ? `sent back to ${r.fromName} · +1 friend helped` : undefined)); }}>Send back</button>
                  <button className="so-btn" onClick={() => window.dispatchEvent(new CustomEvent("sol:social-take", { detail: { text: r.full, run: false } }))}>open the session again</button></>}
                {done && <span className="so-dim">{r.state === "sent" ? `sent back to ${r.fromName}` : r.state}</span>}
                <button className="so-btn ghost" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>{open.has(r.id) ? "less" : "the full request"}</button>
              </div>
            </div>
          </div>);
      })}
      {!list.length && <div className="so-card so-dim">Nothing waiting.</div>}
    </div>
  );
}

function BuildCard({ b, s, e, say }: { b: Build; s: State; e?: E; say?: (t: string | undefined) => void }) {
  const own = s.owned.includes(b.id) || b.price === 0, inst = s.installed.includes(b.id);
  const left = b.stock === undefined ? undefined : (s.stock[b.id] ?? b.stock);
  const doBuy = () => { const r = buy(s, b); if (r.error) return say?.(r.error); setSocial(() => r.s); say?.(`bought for ${b.price} sol-credits (pretend)`); };
  const doInstall = () => {
    if (!e) return;
    const r = install(s, b, e.settings?.look);
    if (r.error) return say?.(r.error);
    setSocial(() => r.s);
    if (r.patch && Object.keys(r.patch).length) e.setSettings({ look: r.patch });   // real: a look is only settings
    say?.(`${b.name} is your look now · undo on its card`);
  };
  const doUndo = () => { if (!e) return; const r = uninstall(s, b, BUILDS); if (r.error) return say?.(r.error); setSocial(() => r.s); if (r.patch) e.setSettings({ look: r.patch }); say?.("put back"); };
  return (
    <div className="so-build"><div className={`so-shot k-${b.kind}`} style={b.look?.color ? { background: `linear-gradient(120deg, ${b.look.color}, transparent)` } : undefined} />
      <div className="so-bb"><small className="so-dim">{b.kind}{left !== undefined ? ` · ${left} left` : ""}</small><b>{b.name}</b>
        <small className="so-dim">by @{b.by} · {b.downloads.toLocaleString()} downloads</small>
        {b.what && <small className="so-dim">{b.what}</small>}
        {b.kind === "button" && <small className="so-warn">code: install is pretend until builds are reviewed</small>}
        {b.kind === "rail" && <small className="so-warn">a rail arrangement: pretend until the rails take presets</small>}
        {e && <div className="so-row so-foot"><span className="so-price">{b.price ? (s.owned.includes(b.id) ? "owned" : `${b.price} credits`) : "free"}</span><span className="so-grow" />
          {inst ? <button className="so-btn" onClick={doUndo}>installed · undo</button> : !own ? <button className="so-btn first" disabled={left === 0} onClick={doBuy}>buy</button>
            : b.kind === "look" || b.kind === "preset" ? <button className="so-btn first" onClick={doInstall}>install</button> : <span className="so-dim so-small">owned · install later</span>}</div>}
      </div></div>
  );
}

function Market({ s, e, say }: P & { e: E }) {
  return (
    <div className="so-page">
      <h1>Market <small>{s.credits.toLocaleString()} sol-credits (pretend)</small></h1>
      <p className="so-lead">Builds people made: looks, presets, rail arrangements and buttons. Looks and presets install for real, they're only settings, and Undo puts yours back. Buttons are code: browse them; installing waits for a review step.</p>
      <div className="so-grid">{BUILDS.map((b) => <BuildCard key={b.id} b={b} s={s} e={e} say={say} />)}</div>
    </div>
  );
}

function Leaderboard({ s }: { s: State }) {
  const rows = [...BUILDS].sort((a, b) => b.downloads - a.downloads);
  const who = (sol: string): Person | undefined => (sol === s.me.sol ? s.me : s.friends.find((f) => f.sol === sol));
  return (
    <div className="so-page">
      <h1>Leaderboard <small>this week · sample numbers</small></h1>
      <p className="so-lead">The best builds and setups, by installs. Installs count one per person, never use.</p>
      <table className="so-board"><thead><tr><th>#</th><th>build</th><th>by</th><th>kind</th><th>installs</th></tr></thead>
        <tbody>{rows.map((b, i) => { const p = who(b.by); return <tr key={b.id} className={b.by === s.me.sol ? "me" : ""}><td>{i + 1}</td><td>{b.name}</td><td><span className="so-row">{p && <Jelly p={p} size={18} />}{p?.name ?? `@${b.by}`}</span></td><td className="so-dim">{b.kind}</td><td>{b.downloads.toLocaleString()}</td></tr>; })}</tbody></table>
      <h2>Setups</h2>
      <div className="so-grid">{s.friends.filter((f) => f.level).sort((a, b) => (b.level ?? 0) - (a.level ?? 0)).slice(0, 3).map((f) => (
        <div key={f.sol} className="so-card"><div className="so-row"><Jelly p={f} size={36} /><b>{f.name}'s setup</b></div><AgentBox p={f}>level {f.level}</AgentBox></div>))}</div>
    </div>
  );
}

function Challenges({ s, say }: P) {
  const [entered, setEntered] = useState<Set<string>>(new Set());
  return (
    <div className="so-page">
      <h1>Challenges <small>and bounties</small></h1>
      <p className="so-lead">Someone hosts a build challenge, anyone enters with a build, the host picks. Prizes are money, sol-credits or usage credits, all pretend for now. A sponsor's unused credits, left on the table, become someone's prize.</p>
      {CHALLENGES.map((c) => (
        <div key={c.id} className={`so-card ${c.champ ? "so-champ" : ""}`}><div className="so-row"><div className="so-grow"><b>{c.title}</b> {c.champ && <span className="so-chip gold">champions league</span>}
          <div className="so-dim so-small">hosted by {c.host} · {c.entries + (entered.has(c.id) ? 1 : 0)} entries · ends in {c.ends}</div></div><span className="so-price">{c.prize}</span></div>
          <div className="so-row so-gap">{c.champ && !s.me.premium ? <span className="so-dim">premium opens the champions league</span> : entered.has(c.id) ? <span className="so-ok">entered</span>
            : <button className="so-btn first" onClick={() => { setEntered((x) => new Set(x).add(c.id)); say("entered (pretend)"); }}>enter with a build</button>}</div></div>))}
    </div>
  );
}

/** Community (#1214): a Research Partner's perks, the credits (asks that changed Sol, and who asked), sol-credits */
function Community({ s }: { s: State }) {
  return (
    <div className="so-page">
      <h1>Community <small>Research Partners and credits</small></h1>
      <div className="so-card">
        <div className="so-row"><b className="so-grow">Research Partner perks</b>{s.me.partner ? <span className="so-chip">you're a Research Partner</span> : <span className="so-dim so-small">by invitation, in your Beta inbox</span>}</div>
        {PERKS.map((p) => <div key={p.id} className="so-row so-gap"><span aria-hidden>{p.icon}</span><div className="so-grow"><b>{p.name}</b><div className="so-dim so-small">{p.line}</div></div></div>)}
      </div>
      <h2>Credits</h2>
      <p className="so-lead">Asks that changed Sol, and who asked. A name shows only if they said yes to it.</p>
      {CREDITS.map((c) => (
        <div key={c.id} className="so-card so-row"><div className="so-grow"><b>{c.ask}</b><div className="so-dim so-small">asked by {c.by}{c.partner ? " 🌱" : ""}{c.when ? ` · ${c.when}` : ""}</div></div><span className="so-chip">{c.state}</span></div>))}
      <p className="so-dim so-small">{s.credits.toLocaleString()} sol-credits (pretend) · spend them in Market</p>
    </div>
  );
}

/** what Sol saw on this Mac, only when "use everything" is on: session names and calendar titles, never sent anywhere */
function signals(e: E, s: State): string[] | null {
  if (!useEverythingOn(e.settings)) return null;
  const titles = [...(e.threads ?? []).map((t) => t.title ?? ""), ...s.calendar.map((c) => c.title)];
  return titles.join(" ").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
}
function Upgrades({ s, e, say }: P & { e: E }) {
  const sig = useMemo(() => signals(e, s), [e.settings, e.threads, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = suggest(BUILDS, s, sig);
  return (
    <div className="so-page">
      <h1>Suggested upgrades <small>Get this? Click, done.</small></h1>
      <p className="so-lead">Ranked from what's popular and what you already installed{sig ? ", and from what Sol sees on this Mac (you turned that on; it stays here)" : ". Turn on “use everything” in Social settings for picks made from your own Mac"}.</p>
      {list.map((b, i) => (
        <div key={b.id} className="so-card so-row"><span className="so-lvl small">{i + 1}</span><div className="so-grow"><b>{b.name}</b> <small className="so-dim">{b.kind} · {b.downloads.toLocaleString()} installs</small></div>
          <BuyOrGet b={b} s={s} e={e} say={say} /><button className="so-btn ghost" onClick={() => setSocial((x) => ({ ...x, skipped: [...x.skipped, b.id] }))}>skip</button></div>))}
      {!list.length && <div className="so-card so-dim">You have everything worth suggesting.</div>}
    </div>
  );
}
function BuyOrGet({ b, s, e, say }: { b: Build; s: State; e: E; say: (t: string | undefined) => void }) {
  const get = () => {
    let st = s;
    if (b.price && !s.owned.includes(b.id)) { const r = buy(st, b); if (r.error) return say(r.error); st = r.s; }
    const r = install(st, b, e.settings?.look); if (r.error) return say(r.error);
    setSocial(() => r.s); if (r.patch && Object.keys(r.patch).length) e.setSettings({ look: r.patch }); say(`${b.name}: done`);
  };
  return <button className="so-btn first" onClick={get}>{b.price && !s.owned.includes(b.id) ? `get it · ${b.price}` : "get it"}</button>;
}

function SocialSettings({ s, e, say }: P & { e: E }) {
  const every = useEverythingOn(e.settings);
  return (
    <div className="so-page">
      <h1>Social settings</h1>
      <p className="so-lead">A few things that are yours to set. Everything here stays on this Mac.</p>
      <div className="so-card"><div className="so-grant"><div className="so-grow">Let Sol use everything on this Mac to personalise itself
        <small>Session names, chats, your calendar and what you install shape your suggestions, upgrades and the notification bar. It stays on this Mac and feeds only your own Sol: never the team, the cloud or friends. Off unless you turn it on.</small></div>
        <button className={`so-switch ${every ? "on" : ""}`} role="switch" aria-checked={every} aria-label="use everything" onClick={() => { e.setSettings({ social: { useEverything: !every } }); say(!every ? "on · it stays on this Mac" : "off"); }}><i /></button></div></div>
      <h2>Favours</h2>
      <div className="so-card"><div className="so-row so-wrap">up to
        <select className="so-in" value={s.favour.perWeek} onChange={(ev) => setSocial((x) => ({ ...x, favour: { ...x.favour, perWeek: Number(ev.target.value) } }))}>{[0, 1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        asks a week, from
        <select className="so-in" value={s.favour.from} onChange={(ev) => setSocial((x) => ({ ...x, favour: { ...x.favour, from: ev.target.value === "friends" ? "friends" : "close" } }))}><option value="close">close friends only</option><option value="friends">all friends</option></select></div>
        <small className="so-dim">{favourWords(s.favour)}. Counted in asks, never anything else. Over the limit, an ask doesn't reach you, and the asker's agent hears your favours are used up.</small></div>
      <h2>Your agent, for friends</h2>
      <div className="so-card"><span className="so-seg">{AGENT_LEVELS.map((l, i) => <button key={l} className={s.me.agent === i ? "on" : ""} onClick={() => setSocial((x) => ({ ...x, me: { ...x.me, agent: i as 0 | 1 | 2 } }))}>{l}</button>)}</span>
        <small className="so-dim">Cowork's same setting. It answers friends' agents only from what you share; anything else always comes to you.</small></div>
      <h2>Your name</h2>
      <NameRow s={s} say={say} />
    </div>
  );
}
function NameRow({ s, say }: P) {
  const [n, setN] = useState(s.me.name);
  return <div className="so-card so-row"><input className="so-in" value={n} onChange={(ev) => setN(ev.target.value)} /><span className="so-dim">@{s.me.sol} · your Sol name comes from your Sol account</span><span className="so-grow" />
    <button className="so-btn" onClick={() => { setSocial((x) => ({ ...x, me: { ...x.me, name: n.trim() || x.me.name } })); say("saved"); }}>save</button></div>;
}

// the personalised bar: friends' happenings and recommendations, seen ones fade (prd 10)
function Happenings({ s, go }: { s: State; go: (t: Tab) => void }) {
  const items = [...HAPPENINGS, ...(openRequests(s).length ? [{ id: "h-req", line: `${openRequests(s).length} waiting on you in Requests`, tab: "requests" as const }] : [])];
  return (
    <div className="so-bar">{items.map((h) => (
      <button key={h.id} className={`so-it ${s.seen.includes(h.id) ? "seen" : ""}`} onClick={() => { setSocial((x) => ({ ...x, seen: x.seen.includes(h.id) ? x.seen : [...x.seen, h.id] })); go(h.tab as Tab); }}>{h.line}</button>))}</div>
  );
}
