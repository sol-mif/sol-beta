// Social v2 (slice 9, #1615): Social, a friend, "as a friend sees you" and "make a link", ported from the mockup's
// merge/views/social.js (people.html v2's renderSocial, oneCard, foldCard, frow, renderFriend, renderAsFriend,
// renderLink). The person is "me" (their name from the canvas, their face from S1's pick); links are the shell's pages;
// each card and each row in a folded card carries its id (data-pid), so one press answers it through M.answer_card.
// Live (BR1), the circle is Isaac's Social (#1072's model) shaped by cv/wire/social.ts; the presses that change it carry
// what they change (data-add, data-g, data-copy) and people/index.tsx hands them to the wire. Signed: marcocyl04-ux's
// agent, port slice 8+9 (#1615).
import { useEffect, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import { MODE, act, hooks } from "../cv/core.ts";
import { Face, Faces } from "../people/Face.tsx";
import { cardOpen, cardsAll, circle, items, live, personName, st, type Card } from "../people/queue.ts";
import { CLOSE_SH, FACES, KIND, PRES, SH, type Circle, type Friend, type Inbox } from "../people/data.ts";
import { EXAMPLE, cardSize, partLine, partName, toggle, tookLine, type Part, type Took } from "./setup.ts";

/** the person's face: S1's pick, and live before a pick this load, the jelly #1072 keeps for them */
const myFace = () => "p-" + FACES[(MODE === "live" && !st().faced ? circle().me.face ?? 0 : st().face || 0) % FACES.length];
const focus = (id: string) => (st().focus === id ? " pfocus" : "");
const Said = ({ b, cls, pri }: { b: string; cls: string; pri?: boolean }) =>
  <button className={`${cls}${pri ? " pri" : ""}${cls === "btn" && !pri ? " ghost" : ""}`} data-said={b}>{b}</button>;
/** today's busy blocks as the twelve hours from 8 am the drawing has: live from the person's calendar, else the drawing's */
const BUSY0 = [0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0];

function FavLine({ s }: { s: Circle }) {
  const f = s.fav, closeN = s.friends.filter((x) => x.close).length;
  if (f.n === 0) return <div className="favline" data-f="FX8 · S14">Favours: <span className="pickc" data-t="Pick: none · 1 · 3 · any number">none</span> · friends hear “not taking asks right now” <span className="used"><a data-t="Pick a number">Allow some</a></span></div>;
  const nobody = f.from === "close friends" && !closeN;
  return <div className="favline" data-f="FX8 · S14">Favours: up to <span className="pickc" data-t="Pick: none · 1 · 3 · 5 · any number">{f.n} a week</span> from <span className="pickc" data-t="Pick: close friends · any friend · nobody">{f.from}</span> · counted over all friends · <a data-t="Paused until Monday: asks wait, friends hear “back Monday”">Pause</a>
    {nobody ? <span className="warn">Nobody can ask yet: you have no close friends · <a data-t="Favours now from any friend">allow any friend</a></span> : null}<span className="used">{f.used} of {f.n} used this week</span></div>;
}
function shareText(s: Circle, x: Partial<Inbox>): { t: string; a: string | null } {
  if (x.src && !x.known) return { t: "You’ll share: profile only · ", a: "share more" };
  const on = Object.keys(SH).filter((k) => s.shares[k]);
  return on.length ? { t: `You’ll share your usual: ${on.map((k) => SH[k]).join(", ")} · `, a: "change" } : { t: "You’ll share nothing yet, as usual · ", a: "change" };
}
const ShareText = ({ s, x }: { s: Circle; x: Partial<Inbox> }) => { const r = shareText(s, x); return <>{r.t}{r.a ? <a data-t="Opens the four switches for this one person">{r.a}</a> : null}</>; };

function OneCard({ s, c }: { s: Circle; c: Card }) {
  const x = c.xs[0], id = c.id;
  const src = x.src || (s.friends.find((f) => f.n === x.from && f.team) ? "friend and teammate" : "");
  const head = (t: ReactNode) => <div className="from"><Face p={{ h: x.h, n: x.from }} cls="xs" />{t}{src ? <span className="srcx">{src}</span> : null}</div>;
  if (x.k === "help") return <div className={`card req tint p-${x.h}${focus(id)}`} data-f="S12 · S13 · FX10" data-pid={id}>{head(`${x.from} asks for help`)}<h3>{x.title}</h3>
    <div className="ctx">{x.need ? <span className="need">needed by {x.need}</span> : null}<span>{x.size}</span>{x.file ? <span>{x.file}</span> : null}<span>see the full prompt</span></div>
    <div className="acts"><Said b="Run it" cls="btn" pri /><button className="btn ghost" data-t="Opened to edit before you run it">Open it first</button><Said b="Not this time" cls="btn" /><span className="note">Runs on your plan, by your press{s.fav.used === s.fav.n - 1 ? " · your last favour this week" : ""}</span></div></div>;
  if (x.k === "invite") return <div className={`card req tint p-${x.h}${focus(id)}`} data-f="S10 · FX15" data-pid={id}>{head(`${x.from} invites you`)}<h3>{x.title}</h3>
    <div className="shareline">{x.free ? (s.shares.fb ? `${x.free}: free in your calendar` : x.free) : ""}{x.clashWith ? <> · <b className="clash">also then: {x.clashWith}</b></> : null}</div>
    <div className="acts"><Said b="Accept" cls="btn" pri /><button className="btn ghost" data-t="Suggest another time">Another time</button><Said b="Decline" cls="btn" /></div></div>;
  if (x.k === "beyond") return <div className={`card req${focus(id)}`} data-f="S9 · FX9" data-pid={id}>{head(`${x.from}’s AI asks for more than you share`)}<h3>{x.title}</h3>
    <div className="acts"><Said b="Allow once" cls="btn" pri /><span className="tpick">{x.what === "location" ? <><span className="on">1 h</span><span>until midnight</span></> : <><span className="on">today</span><span>this week</span></>}</span>
      <Said b={"Always for " + x.from} cls="btn" /><Said b="No" cls="btn" /><Said b="No, don’t ask again" cls="btn" /></div></div>;
  return <div className={`card req${focus(id)}`} data-f="S4 · FX2 · FX3" data-pid={id}>{head(`${x.from} wants to be friends`)}<h3>{x.from}</h3>
    <div className="shareline"><ShareText s={s} x={x} /></div>
    <div className="acts"><Said b="Accept" cls="btn" pri /><Said b="Decline" cls="btn" /></div></div>;
}

function FoldCard({ s, c }: { s: Circle; c: Card }) {
  const b = st(), xs = c.xs.filter((x) => !b.done.has(x.id)), n = xs.length, w = KIND[c.k][1];
  const needN = xs.filter((x) => x.need).length, closeN = xs.filter((x) => x.close).length;
  const beyond = (() => { if (c.k !== "beyond") return ""; const by: Record<string, number> = {}; xs.forEach((x) => (by[x.from] = (by[x.from] || 0) + 1)); const top = Object.entries(by).sort((a, z) => z[1] - a[1])[0]; return top && top[1] > 1 ? `${top[0]}’s AI asked ${top[1]} times: ${xs[0].what}` : ""; })();
  const req = (() => { if (c.k !== "request") return ""; const k = xs.filter((x) => x.known).length, u = xs.length - k; return u && k ? `${k} from your link or a group get your usual shares; ${u} others get profile only` : u ? "They get your profile only, as people you haven’t met" : shareText(s, {}).t.replace(/ · $/, ""); })();
  const sub: ReactNode[] = [needN ? <span key="n" className="need">{needN} needed soon</span> : null, closeN ? `${closeN} from close friends` : null, beyond || null, req || null].filter(Boolean);
  const bulk: [string, number?, number?][] = ({ help: [["Look one by one", 1], ["Not this time to all"]], invite: [["Look one by one", 1]], beyond: [["Look one by one", 1], ["No to all"], ["No, don’t ask again to all"]],
    request: [["Accept all" + (xs.every((x) => x.known) ? " with your usual shares" : ""), 0, 1], ["Look one by one", 1], ["Decline all"]] } as Record<string, [string, number?, number?][]>)[c.k];
  const froms = [...new Set(xs.map((x) => x.from))];
  const rowBtns = () => c.k === "help" ? <><Said b="Run it" cls="mini" pri /><Said b="Not this time" cls="mini" /></> : c.k === "beyond" ? <><Said b="Allow once" cls="mini" /><Said b="No" cls="mini" /></> : <><Said b="Accept" cls="mini" pri /><Said b="Decline" cls="mini" /></>;
  const opened = b.open.has(c.id) || xs.some((x) => b.focus === x.id) ? " open" : "";
  return <div className={`card req fold2${opened}${focus(c.id)}`} data-f="FX1 · one card per kind" data-pid={c.id}>
    <div className="from"><Faces ps={xs.map((x) => ({ n: x.from, h: x.h })).filter((v, i, a) => a.findIndex((y) => y.n === v.n) === i)} max={5} cls="xs" /><span>{c.k === "request" ? "" : "from " + froms.slice(0, 2).join(", ") + (froms.length > 2 ? " and others" : "")}</span></div>
    <h3>{n} {n === 1 ? KIND[c.k][0] : w}</h3><div className="shareline">{sub.map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div>
    <div className="acts">{bulk.map(([t, op, pri], i) => op ? <button key={t} className={`btn ${pri || (!i && c.k !== "request") ? "pri" : "ghost"}`} data-open>{t}</button> : <Said key={t} b={t} cls="btn" pri={!!pri || (!i && c.k !== "request")} />)}</div>
    <div className="rows">{xs.map((x) => <div key={x.id} className={`r1${focus(x.id)}`} data-pid={x.id}><Face p={{ h: x.h, n: x.from }} cls="xs" />
      <div className="t"><b>{x.from}</b>{x.title ? " · " + x.title : ""}<small>{x.need ? <><span className="need">needed by {x.need}</span> · </> : null}{x.src || x.size || x.free || ""}{x.clash ? <> · <b className="clash">clashes with another invite</b></> : null}</small></div>{rowBtns()}</div>)}</div></div>;
}

const PresDot = ({ f }: { f: Partial<Friend> }) => f.pres ? <span className="pres"><i style={{ background: PRES[f.pres] }} />{f.pres}</span> : <span className="pres">—</span>;
function FRow({ f }: { f: Friend }) {
  if (f.waiting) return <div className="fr wait" data-f="FX5 · invited, waiting"><Face p={{ h: f.h, n: f.n }} /><div><b>{f.n}</b><div className="w">Invited, waiting · {f.waiting}</div></div>
    <span className="acts2"><button className="mini" data-t="Sent again">Resend</button><button className="mini" data-t="Link cancelled">Cancel</button></span></div>;
  return <a className="fr" role="button" tabIndex={0} data-act={`page:friend:${f.n}`}><Face p={{ h: f.h, n: f.n }} /><div><b>{f.n}</b>{f.isnew ? <span className="newc">new</span> : null}{f.team ? <span className="tm2">· also in {f.team}</span> : null}
    <div className="w">{f.theirs.wo ? (f.line && f.line !== "—" ? "working on: " + f.line : "no line yet") : "doesn’t share this"}</div></div><span className="end"><PresDot f={f.theirs.ar ? f : {}} /></span></a>;
}

/** live, the last answer to a friend added by link or name, under the box: a link that did not read, the engine's why */
const AddLine = () => { const t = live.social?.addLine(); return t ? <p className="addline" role="status" data-f="FX12 · the add's answer">{t}</p> : null; };

/** live, a friend link opened from a browser: whose it is, asked before anything joins */
function LinkAsk() {
  const o = live.social?.asking();
  if (!o) return null;
  const say = (yes: boolean) => { const r = live.social?.answerLink(yes); if (r) hooks.flash?.(r); };
  return <div className="card linkask" role="status" data-f="FX5 · a friend's link opened"><h3>Add {o.who} as a friend?</h3>
    <p className="sub2">From the link {o.who} sent you. Friends see only what you share; you pick that next.</p>
    <div className="acts end"><button className="btn ghost" onClick={() => say(false)}>Not now</button><button className="btn pri" onClick={() => say(true)}>Yes</button></div></div>;
}

export function SocialPage() {
  const s = circle(), b = st(), name = personName();
  const fr = s.friends.filter((f) => !f.waiting), close = fr.filter((f) => f.close || b.close.has(f.n)), seen = s.shares.wo ? fr.length : 0;
  if (s.first && !fr.length) return (
    <div className="ppl" data-people="social"><div className="page">
      <h1>Social</h1><p className="say">Pick a face. Then add one friend: your AI can answer theirs, about only what you share.</p><LinkAsk />
      <div className="facepick" data-f="S1 · first open">{FACES.map((x, i) => <span key={x} className={`face p-${x} ${i === (b.face || 0) ? "on" : ""}`} role="button" tabIndex={0} data-act={`pick_face:${i}`} title={i ? "This one" : "Yours"} />)}
        <span className="alt" data-t="Pick an image">Your own image</span><span className="alt" data-t="Makes one from a sentence">Make one</span></div>
      <div className="card firstcard" data-f="FX11 · FX5 · S4"><h3>Add your first friend</h3><p className="sub2">Send a link, or type their name if they’re already here. A link works for someone without the app too.</p>
        <div className="findadd"><input placeholder="Their name, or paste their link" /><button className="btn pri" data-t="Asked" data-add="">Ask</button><button className="btn ghost" data-act="make_link">Make a link</button></div><AddLine />
        <div className="acts"><button className="btn ghost" data-act="see_as_friend">See your profile as a friend would</button></div></div>
    </div></div>);
  const ord = items().filter((x) => x.type === "card").map((x) => x.id);
  const cards = cardsAll().filter(cardOpen).sort((a, z) => ord.indexOf(a.id) - ord.indexOf(z.id));
  // five at a time; the one ⌘J brought is always among them
  let five = cards.slice(0, 5);
  const fc = cards.find((c) => c.id === b.focus || c.xs.some((x) => x.id === b.focus));
  if (fc && !five.includes(fc)) five = [...cards.slice(0, 4), fc];
  const PR: Record<string, number> = { here: 2, away: 1 }, pr = (f: Friend) => PR[f.pres ?? ""] || 0;
  const ordF = [...s.friends].filter((f) => !f.quiet).sort((a, z) => (z.waiting ? 3 : 0) - (a.waiting ? 3 : 0) || pr(z) - pr(a));
  const quiet = s.friends.filter((f) => f.quiet), newN = s.friends.filter((f) => f.isnew).length, show = fr.length > 12 ? ordF.slice(0, 10) : ordF;
  return (
    <div className="ppl" data-people="social"><div className="page">
      <div className="prof" data-f="S1 · S2 · S15"><span className={`face xl ${myFace()}`} /><div><div className="nmx">{name}</div>
        <div className="wo">Working on: {s.me.line} <span className="pen">edit · clear</span> <small>· seen by {seen ? (fr.length === 1 ? "your one friend" : `${seen === fr.length ? "all" : seen + " of"} ${fr.length} friends`) : "no one: you don’t share it"}</small></div>
        {s.me.level ? <div className="lvl">Level <b>{s.me.level}</b><span className="barx"><i /></span>{s.published ? s.published.reduce((a, x) => a + x.inst, 0) + " installs of what you made" : "from what you publish, never from use"}</div> : null}
        {s.me.badges ? <div className="badges">{s.me.badges.map((x) => <span key={x}>{x}</span>)}</div> : null}</div></div>
      <LinkAsk />
      {cards.length || s.reports ? <>
        <h2 data-f="S11 · FX1">Asks for you <small>{cards.length} in Waiting on you, one per card</small></h2><FavLine s={s} />
        {five.map((c) => (c.fold ? <FoldCard key={c.id} s={s} c={c} /> : <OneCard key={c.id} s={s} c={c} />))}
        {cards.length > 5 ? <div className="moreasks">{cards.length - 5} more, oldest first</div> : null}
        {s.reports ? <div className="reports" data-f="FX13 · not friends, folded"><svg className="ic" viewBox="0 0 24 24"><path d="M5 20V5h11l-2 4 2 4H5" /></svg>{s.reports.n} reports on “{s.reports.on}” from people who installed it · answered from the build<span className="chev">›</span></div> : null}
      </> : null}
      {s.published ? <><h2 data-f="FX13 · S2 published">Published <small>{s.published.length}</small></h2>
        <div className="pub">{s.published.map((x) => <div key={x.n} className="card item"><span className="sw2" /><b>{x.n}</b><small>{x.k}</small><span className="n2">{x.inst}<small className="n2s"> installs{x.rep ? " · " + x.rep + (x.rep > 1 ? " reports" : " report") : ""}</small></span></div>)}</div></> : null}
      {close.length ? <><h2 data-f="S6">Close friends <small>{close.length}</small></h2>
        <div className="close">{close.slice(0, 6).map((f) => <a key={f.n} className="cf" role="button" tabIndex={0} data-act={`page:friend:${f.n}`}><span className={`face l p-${f.h}`}>{f.theirs.ar && f.pres ? <i className={`st s-${f.pres}`} /> : null}</span><b>{f.n}</b><small>{f.theirs.wo && f.line ? f.line : f.pres || ""}</small></a>)}</div></> : null}
      {live.social?.setups().length ? <><h2 data-f="S21 · ways of working given to you">How friends work <small>{live.social.setups().length} given to you</small></h2>
        <div className="flist">{live.social.setups().map((c) => { const f = s.friends.find((x) => x.n.toLowerCase() === c.from.toLowerCase());
          return <a key={c.code} className="fr" role="button" tabIndex={0} data-act={`page:setup:${c.code}`}><Face p={{ h: f?.h ?? FACES[0], n: c.from }} /><div><b>{c.from}</b>
            <div className="w">how {c.from} works · {cardSize(c.parts)}</div></div><span className="end">Look ›</span></a>; })}</div></> : null}
      <h2 data-f="S5 · FX12">Friends <small>{fr.length}{s.friends.some((f) => f.waiting) ? " · 1 invited" : ""}</small></h2>
      <div className="usual" data-f="FX2 · FX4 · usual shares">What a new friend sees of you: {Object.keys(SH).map((k) => <span key={k} className={`u ${s.shares[k] ? "" : "off"}`} data-t={`${SH[k]}: ${s.shares[k] ? "off" : "on"} for new friends`}><span className={`tog ${s.shares[k] ? "on" : ""}`} />{SH[k]}</span>)}</div>
      <div className="findadd" data-f="FX12 · find and add in one box"><input placeholder={fr.length > 12 ? "Find a friend, or add one by name" : "Add a friend by name"} /><button className="btn ghost" data-act="make_link">Make a link</button></div><AddLine />
      {s.links?.map((l) => <div key={l.name} className="reports" data-f="FX5 · named link"><span className="face xs p-g2" /><b className="ink">{l.joined} joined</b> from your link “{l.name}” · {l.of - l.joined} places left · ends in {l.days} days · no cards to answer<span className="chev">see them ›</span></div>)}
      {fr.length > 12 ? <div className="fchips"><span className="on">All</span><span>Here now · {fr.filter((f) => f.pres === "here").length}</span>{newN ? <span>New this week · {newN}</span> : null}<span>Close · {close.length}</span></div> : null}
      <div className="flist">{show.map((f) => <FRow key={f.n} f={f} />)}
        {fr.length > 12 && ordF.length > 10 ? <div className="fr foldrow">{ordF.length - 10} more · type to find<span className="chev">›</span></div> : null}
        {quiet.length ? <div className="fr foldrow" data-f="FX12 · quiet fold">Quiet · {quiet.length} with no contact in 60 days<span className="chev">›</span></div> : null}</div>
    </div></div>
  );
}

export function FriendPage({ name: nm }: { name: string }) {
  const s = circle(), b = st(), f = s.friends.find((x) => x.n === nm && !x.waiting) || s.friends.find((x) => !x.waiting);
  if (!f) return <div className="ppl" data-people="friend"><div className="page"><h1>Social</h1><p className="say">No friends yet.</p><div className="acts"><button className="btn pri" data-act="see_social">Back to Social</button></div></div></div>;
  const isClose = f.close || b.close.has(f.n), team = f.team, mine: Record<string, number> = { ...s.shares, ...(f.mine || {}) }, N = f.n;
  // live, every grant is in mine, so what differs is counted against the usual; the fixture lists only the ones that differ
  const diff = MODE === "live" ? Object.keys(SH).filter((k) => (mine[k] || 0) !== (s.shares[k] || 0)).length : Object.keys(f.mine || {}).length;
  // one person, two links: the group's page in this person's own team setup when it has it, else the setup that has it
  const tg = team === "Parcel" ? { s: "T3", g: "parcel", c: "color-mix(in srgb, var(--a1) 45%, var(--a3))" } : { s: "T2", g: "bio", c: "var(--a3)" };
  // a row's switch names its share (data-g) and the friend (data-friend), so live a press turns that grant (cv/wire/social.ts)
  const G: Record<string, string> = { "Free/busy": "fb", "Profile": "pr", "Working on": "wo", "When you’re around": "ar", [CLOSE_SH.cal]: "cal", [CLOSE_SH.proj]: "proj", [CLOSE_SH.loc]: "loc" };
  const row = (lab: string, sub: ReactNode, on: unknown, extra: ReactNode = null) => <div key={lab} className="gr" data-g={G[lab]} data-friend={N}><div><b>{lab}</b>{extra}<small>{sub}</small></div><span className={`tog ${on ? "on" : ""}`} /></div>;
  const asked = f.asked;
  const unf = team ? `Unfriended ${N} · Undo. ${N} stays in ${team}; what you shared as a friend stopped.` : `Unfriended ${N} · Undo. What you shared with ${N} stopped.`;
  return (
    <div className="ppl" data-people="friend"><div className="page">
      <div className="prof"><span className={`face xl p-${f.h}`} /><div><div className="nmx">{N}</div>
        <div className="wo">{f.theirs.wo ? (f.line ? "Working on: " + f.line : "No line yet") : "Doesn’t share what they’re working on"}{f.theirs.ar && f.pres ? " · " + f.pres : ""}</div>
        <div className="badges">{isClose ? <span>Close friend</span> : null}{f.since ? <span>friends since {f.since}</span> : null}</div>
        {team ? <a className="alsoin" role="button" tabIndex={0} data-act={`page:group:${tg.g}`} data-s={tg.s} data-f="FX7 · one person, two links"><span className="dotf sm" style={{ background: tg.c }} />Also in <b>{team}</b> as a {f.teamRole}: the group’s work is the group’s, not set here ›</a> : null}</div></div>
      <div className="doors" data-f="FX6 · doors out"><button className="btn pri" data-t={`Write what you need; ${N} runs it in their own session, by their press`}>Ask for help</button><button className="btn ghost" data-t={`Your AI finds a time from ${N}’s free/busy`}>Make a plan</button><button className="btn ghost" data-act={`page:share:${N}`}>Hand over a way of working</button>
        {live.social?.setupFrom(N) ? <button className="btn ghost" data-act={`page:setup:${live.social.setupFrom(N)!.code}`}>See how {N} works</button> : null}</div>
      <div className="askai">Ask your AI about {N}… <span className="end">“find a time this week”</span></div>
      <div className="twoway">
        <div className="card grants" data-f="S7 · S8 · FX4"><h3>What {N} sees of you {diff ? <small>{diff} differs from your usual</small> : null}<a data-act={`see_as_friend:${N}`}>See it as {N} does</a></h3>
          {row("Free/busy", "Busy blocks, never names", mine.fb)}{row("Profile", "Face, level, what you published", mine.pr)}{row("Working on", "Your one line", mine.wo)}{row("When you’re around", "here · away · gone", mine.ar)}
          {isClose ? Object.keys(CLOSE_SH).map((k) => row(CLOSE_SH[k], k === "loc" ? <span className="tpick"><span className="on">1 h</span><span>4 h</span><span>until midnight</span></span> : "Close friends only, off until you turn it on", mine[k], mine[k] ? <span className="diffx">differs</span> : null))
            : <div className="gr"><div><b className="off3">Full calendar, projects, location</b><small>Only for a close friend · <a data-act={`make_close:${N}`}>make {N} close</a></small></div></div>}</div>
        <div className="card grants theirs" data-f="FX6 · N8 · what you see of them"><h3>What you see of {N}</h3>
          {Object.keys(SH).map((k) => <div key={k} className={`gr ${f.theirs[k] ? "" : "no"}`}><span className="dotx" /><div><b>{SH[k][0].toUpperCase() + SH[k].slice(1)}</b><small>{f.theirs[k] ? "shared with you" : `${N} doesn’t share this`}</small></div></div>)}
          <p className="hintx">When your AI has no answer about {N}, this is why.</p></div>
      </div>
      <h2 data-f="S9 · FX6 log">What {N}’s AI asked yours</h2>
      {asked ? <>{asked.n ? <div className="logfold">{asked.n} answered from what you share</div> : <div className="logfold">Nothing asked yet</div>}
        {asked.last ? <div className="asked">{asked.last.q} <span>{asked.last.how}</span></div> : null}</>
        : <><div className="logfold">All 38 answered from what you share · <a data-t="Opens the list">see them</a></div>
          <div className="asked">Your projects? <span>became an ask to you · you said no · Sun</span></div></>}
      <div className="favline gap">{s.fav.n ? `Favours: ${N} ${isClose || s.fav.from === "any friend" ? `can ask · ${s.fav.used} of ${s.fav.n} used this week, over all friends` : "can’t ask: favours are for close friends only"}` : "Favours: you’re not taking asks right now"}</div>
      <div className="endrow" data-f="FX14"><button className="btn ghost" data-act={`make_close:${N}`}>{isClose ? "Move to friends" : "Make close"}</button><button className="btn ghost" data-t={`Muted: ${N}’s asks stop reaching you; ${N} sees nothing different`}>Mute</button>
        <button className="btn ghost" data-t={unf} data-unfriend={N}>Unfriend</button><button className="btn ghost" data-t={`Blocked: ${N} can’t ask again and can’t tell`}>Block</button></div>
    </div></div>
  );
}

export function AsFriend({ name: nm }: { name: string }) {
  const s = circle(), f = nm ? s.friends.find((x) => x.n === nm) : null;
  const sh: Record<string, number> = f ? { ...s.shares, ...(f.mine || {}) } : s.shares, who = f ? f.n : "a friend";
  return (
    <div className="ppl" data-people="asfriend"><div className="page">
      <div className="psheet" data-f="N7 · see it as they do"><h2>What {who} sees</h2><p className="say">Exactly this, and their AI can ask yours about nothing else.</p>
        <div className="prevx"><span className={`face xl ${myFace()}`} /><div className="nmx">{personName()}</div>
          <div className={`ln2 ${sh.wo ? "" : "no"}`}>{sh.wo ? "Working on: " + (s.me.line || "nothing written") : "working on: not shared"}</div>
          <div className={`ln2 ${sh.ar ? "" : "no"}`}>{sh.ar ? "here now" : "when you’re around: not shared"}</div>
          {sh.fb ? <><div className="fbbar">{(s.me.busy ?? BUSY0).map((x, i) => <i key={i} className={x ? "b" : ""} />)}</div><div className="ln2">busy blocks today, no names</div></> : <div className="ln2 no">free/busy: not shared</div>}
          {sh.pr && s.me.level ? <div className="ln2">Level {s.me.level}</div> : null}</div>
        <div className="acts end"><button className="btn pri" data-act={f ? `page:friend:${f.n}` : "page:social"}>Done</button></div></div>
    </div></div>
  );
}

/** live, a friend link is a room of two on Sol's cloud (cv/wire/social.ts, engine social/friends.ts): one person, no end yet */
const ONE = "A friend link is for one person for now: make another for the next friend";
const NO_END = "A friend link doesn’t end yet; it stays until someone opens it";

export function LinkPage() {
  const s = circle(), f = st().f, on = Object.keys(SH).filter((k) => s.shares[k]).map((k) => SH[k]), ls = live.social;
  // live, a Sol with no name yet is "Someone" on the page a friend opens, never "You wants you"
  const N = ls && personName() === "You" ? "Someone" : personName();
  useEffect(() => { live.social?.makeLink(); }, []);
  const url = ls?.link();
  return (
    <div className="ppl" data-people="link"><div className="page">
      <div className="psheet" data-f="FX5 · named, counted, ending"><h2>Make a link</h2><p className="say">Whoever opens it becomes your friend, no card to answer. It works for someone without the app.</p>
        {ls ? <><div className="lab">The link</div>{url ? <div className="findadd"><input readOnly value={url} /></div> : <p className="say">{ls.linkWhy()}</p>}</>
          : <><div className="lab">Name</div><div className="findadd"><input defaultValue={f === "F8" ? "Bio class" : f === "F7" ? "Dad" : "Climbing"} /></div></>}
        <div className="lab">How many people</div><div className="pseg"><button className={f === "F8" && !ls ? "" : "on"}>1</button><button data-real="" data-t={ls ? ONE : undefined}>10</button><button className={f === "F8" && !ls ? "on" : ""} data-real="" data-t={ls ? ONE : undefined}>30</button><button data-real="" data-t={ls ? ONE : undefined}>No limit</button></div>
        <div className="lab">Ends in</div><div className="pseg">{ls ? <button className="on" data-real="" data-t={NO_END}>Never, for now</button> : <><button>1 day</button><button className="on">7 days</button><button>30 days</button></>}</div>
        <div className="lab">What they see of you</div><div className="shareline">{on.length ? on.join(", ") : "nothing yet"} · your usual</div>
        <div className="web"><div className="barx"><i /><i /><i /> what the link opens, for someone without the app</div>
          <div className="bdx"><span className={`face l ${myFace()}`} /><b>{N} wants you as a friend</b>{N} will see your profile until you choose more.<br />You’ll see {N}’s {on.length ? on.join(", ") : "name and face"}.<div className="get"><span className="btn pri">Get the app and say yes</span></div></div></div>
        <div className="acts end"><button className="btn ghost" data-act="page:social">Cancel</button><button className="btn pri" data-act="page:social" data-copy="" data-t="Link copied. It shows in your friends as “invited, waiting”.">Copy the link</button></div></div>
    </div></div>
  );
}

// ---------------------------------------------------------------- share a setup (BR1 meta part 5, scene 8; S21)
// The give page (share:<friend>) and the take page (setup:<room code>): a card of how a person works, as social/setup.ts
// reads it. Live, the wire asks the engine (cv/wire/social.ts); in the fixture the invented EXAMPLE card plays both.

/** one part of a card as a row: its name and what it brings; its switch while it can be picked; dashed while it is not
 *  in this Sol (a card given to me, before I take it) */
function PartRow({ p, on, pick, ghost }: { p: Part; on: boolean; pick?: (id: string) => void; ghost?: boolean }) {
  const press = pick ? (ev: RMouseEvent) => { ev.stopPropagation(); pick(p.id); } : undefined;
  return <div className={`gr setp${ghost ? " ghost" : ""}${on ? "" : " off"}`} data-part={p.id} role={pick ? "button" : undefined} onClick={press}>
    <span className={`kindx ${p.kind}`} /><div><b>{partName(p)}</b><small>{partLine(p)}</small></div>{pick ? <span className={`tog ${on ? "on" : ""}`} /> : null}</div>;
}

export function SharePage({ name: N }: { name: string }) {
  const ls = live.social;
  useEffect(() => { live.social?.askDraft(); }, []);
  const [off, setOff] = useState<string[]>([]);   // the parts turned off; every part goes until one is
  const d = ls ? ls.draft() : { parts: EXAMPLE.parts }, parts = d.parts ?? [];
  const picked = parts.filter((p) => !off.includes(p.id));
  const give = () => {
    if (!ls) { hooks.flash?.(`In a real Sol, ${N} gets ${cardSize(picked)} now`); return; }
    const r = ls.give(N, picked.map((p) => p.id));
    hooks.flash?.(r.said);
    if (r.ok) act(`page:friend:${N}`);
  };
  return (
    <div className="ppl" data-people="share"><div className="page">
      <div className="psheet" data-f="S21 · hand over a way of working"><h2>How you work, for {N}</h2>
        <p className="say">{N} gets your places with their stickies’ titles, and how you set Sol everywhere, then takes what they like. Nothing changes on your side.</p>
        <div className="lab">In the card · {cardSize(picked)}</div>
        {parts.length ? <div className="grants setparts">{parts.map((p) => <PartRow key={p.id} p={p} on={!off.includes(p.id)} pick={(id) => setOff((o) => toggle(o, id))} />)}</div>
          : <p className="say">{d.why ?? "Nothing to give yet: a place in Home with stickies is the first part"}</p>}
        <div className="never" data-f="S21 · never in the card">Not in the card: what Sol knows about you. Ever. Nor a sticky’s words or notes, nor a session.</div>
        <div className="acts end"><button className="btn ghost" data-act={`page:friend:${N}`}>Cancel</button>
          <button className="btn pri" disabled={!picked.length} onClick={give}>{picked.length === parts.length ? `Give ${N} all of it` : `Give ${N} ${cardSize(picked)}`}</button></div></div>
    </div></div>
  );
}

export function SetupPage({ code }: { code: string }) {
  const ls = live.social, c = ls ? ls.setupOf(code) : EXAMPLE;
  const [picked, setPicked] = useState<string[] | null>(null);   // null: not picking
  const [here, setHere] = useState<Took | null>(null);           // the fixture's own take, so the drawing plays to its end
  if (!c) return <div className="ppl" data-people="setup"><div className="page"><div className="psheet"><h2>That card is gone</h2>
    <p className="say">Whoever gave it took it back, or you are friends no more.</p><div className="acts end"><button className="btn pri" data-act="page:social">Back to Social</button></div></div></div></div>;
  const N = c.from, t = ls ? ls.took() : here, done = t && t.sha === c.sha ? t : null;
  const take = (ids: string[]) => {
    setPicked(null);
    if (ls) { const why = ls.take(c.code, ids); if (why) hooks.flash?.(why); return; }
    const ps = ids.length ? ids : c.parts.map((p) => p.id);
    const made = c.parts.filter((p) => ps.includes(p.id)).reduce((n, p) => n + (p.kind === "place" ? Math.max(1, p.pieces.length) : 1), 0);
    setHere({ code: c.code, sha: c.sha, fits: [], made, from: N, parts: ps });
  };
  const back = () => { if (!ls) { setHere(null); return; } const why = ls.back(); if (why) hooks.flash?.(why); };
  return (
    <div className="ppl" data-people="setup"><div className="page">
      <div className="psheet" data-f="S21 · a way of working, given"><h2>How {N} works</h2>
        <p className="say">{N} gave you {cardSize(c.parts)}. Take all of it or only some: what you take is marked “from {N}”, and Back takes it away again.</p>
        <div className="lab">{picked ? `Pick what to take · ${picked.length} of ${c.parts.length}` : done ? "Taken" : "In the card"}</div>
        <div className="grants setparts">{c.parts.map((p) => <PartRow key={p.id} p={p} ghost={!done?.parts.includes(p.id)} on={picked ? picked.includes(p.id) : true}
          pick={picked ? (id) => setPicked((x) => toggle(x ?? [], id)) : undefined} />)}</div>
        <p className="hintx">{done ? `In your Home now, each marked “from ${N}”.` : "Dashed: not in your Sol yet. A place you have already gets only the stickies it lacks."}</p>
        <div className="acts end">{done ? <><span className="tookx">{tookLine(done)}</span><button className="btn ghost" onClick={back}>Back</button><button className="btn pri" data-act="page:social">Done</button></>
          : picked ? <><button className="btn ghost" onClick={() => setPicked(null)}>Cancel</button><button className="btn pri" disabled={!picked.length} onClick={() => take(picked)}>{picked.length === 1 ? "Take this one" : `Take these ${picked.length}`}</button></>
          : <><button className="btn ghost" onClick={() => setPicked([])}>Pick pieces</button><button className="btn pri" onClick={() => take([])}>Take all</button></>}</div></div>
    </div></div>
  );
}
