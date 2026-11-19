// Cowork v2 (slice 8, #1615): Cowork, a group, and a group's first time, ported from the mockup's merge/views/cowork.js
// (itself people.html v2's renderCoworkHome, renderGroup, renderFirst). A link is the shell's page (data-act="page:…");
// a wait that counts carries its id (data-pid), so one press answers it through M.answer_wait: the count falls by one
// everywhere and one diary line is written (people/index.tsx hears the presses). The first-time sheet is a page under the
// top bar, never a scrim. Live, a group is today's team.v3 project (cv/wire/people.ts). Signed: marcocyl04-ux's agent,
// port slice 8+9 (#1615).
import { Face, Faces } from "../people/Face.tsx";
import { isMaker, items, me, sortedGroups, st, team, waitsAll, type WaitItem } from "../people/queue.ts";
import type { Group, Wait } from "../people/data.ts";

/** the open waits a group has, in its own order (answered ones leave; "later" ones stay) */
const openIn = (g: Group) => { const b = st(); return waitsAll().filter((x) => x.g === g && !b.done.has(x.id)); };
const idOf = (g: Group, w: Wait) => waitsAll().find((x) => x.g === g && x.w === w)?.id ?? null;
const focus = (id: string | null) => (id && st().focus === id ? " pfocus" : "");
const NUM = ["", "", "Two", "Three", "Four", "Five"];

/** a wait's buttons: the ones that count answer it (data-said); Open goes to the group; the rest say what they would do */
function Btns({ g, w, id, cls }: { g: Group; w: Wait; id: string | null; cls: string }) {
  return <>{(w.btns ?? []).map((b, i) => {
    const c = `${cls}${i ? "" : " pri"}`;
    if (id && /^open$/i.test(b)) return <button key={b} className={c} data-act={`page:group:${g.id}`}>{b}</button>;
    return id ? <button key={b} className={c} data-said={b}>{b}</button> : <button key={b} className={c} data-t={b}>{b}</button>;
  })}</>;
}

export function Home() {
  const s = team(), ws = items().filter((x): x is WaitItem => x.type === "wait"), active = s.groups.filter((g) => !g.quiet), quiet = s.groups.filter((g) => g.quiet);
  const sorted = sortedGroups(s), top = ws[0], t = top?.w;
  const say = ws.length ? `${ws.length === 1 ? "One thing waits" : (NUM[ws.length] ?? ws.length) + " things wait"} on you${t?.sub && /Due|By/.test(t.sub) ? "; the first is " + t.sub.toLowerCase() : ""}.` : "Nothing waits on you. Here’s what moved.";
  const present = new Set(s.groups.flatMap((g) => g.people.map((p) => (p.reach === "link" ? "link" : p.ai ? p.st : "none"))));
  const L: Record<string, string> = { work: "working", wait: "waiting on you", done: "done", rest: "resting", unk: "not checked in", link: "by link, no app", none: "no AI" };
  return (
    <div className="ppl" data-people="cowork"><div className="page">
      <h1>Cowork</h1>
      <p className="say">{s.viewer?.role === "approves" ? (ws.length ? "One thing needs your yes." : "Nothing needs your yes.") : say}</p>
      {top && t ? <div className="hero" data-f="C4 · one ranking"><div className="glow" />
        <div className={`card${focus(top.id)}`} data-pid={top.id}>
          <div className="from"><Face p={{ h: t.h, n: t.from }} cls="xs" />{top.g.name} · {t.kind === "back" ? "came back to you" : t.from + (t.kind === "hand" ? " handed you" : t.kind === "join" ? "" : " asks you")}{ws.length > 1 ? <span className="nxw">1 of {ws.length} waiting</span> : null}</div>
          <h3>{me(t.text)}</h3><p className="sub2">{t.sub}</p>
          <div className="acts">{(t.btns ?? []).map((b, i) => /^open$/i.test(b) ? <button key={b} className="btn ghost" data-act={`page:group:${top.g.id}`}>{b}</button>
            : <button key={b} className={`btn ${i ? "ghost" : "pri"}`} data-said={b}>{b}</button>)}
            {(t.btns ?? []).length < 3 ? <button className="btn ghost" data-act={`page:group:${top.g.id}`}>Open the group</button> : null}</div>
        </div></div> : null}
      <h2>{s.groups.length > 1 ? "Your groups" : "Your group"}</h2>
      <div className={`groups${active.length === 1 ? " one" : ""}`}>
        {sorted.map((g) => {
          const n = openIn(g).length, d = g.lines.filter((l) => l.kind === "done").length;
          return <a key={g.id} className="card grp" role="button" tabIndex={0} data-act={`page:group:${g.id}`} data-f="C3">
            <div className="top2"><span className="dotf" style={{ background: g.color }} /><b>{g.name}</b>
              <span className="gnum">{n ? <>{n}<small>wait{n > 1 ? "" : "s"} on you</small></> : d ? <>{d}<small>finished today</small></> : null}</span></div>
            <Faces ps={g.people} /><div className="one">{g.last}</div></a>;
        })}
      </div>
      {quiet.length ? <details className="quiet" data-f="quiet groups fold"><summary>{quiet.length} quiet <small>nothing for 14 days · {quiet.map((g) => g.name).join(", ")}</small></summary>
        <div className="groups more">{quiet.map((g) => <div key={g.id} className="card grp still"><div className="top2"><span className="dotf" style={{ background: g.color }} /><b>{g.name}</b></div><div className="one">{g.last}</div>
          <div><button className="mini" data-t="Paused: hidden and silent, still yours">Pause</button> <button className="mini" data-t={`You left ${g.name}`}>Leave</button></div></div>)}</div></details> : null}
      {isMaker(s) ? <div className="joinrow" data-f="C1 · C2 · roles">
        <button className="btn ghost" data-t="Invite: a name, number or email, and a role (makes · approves · reads). They get a link; the app is offered, never needed.">Invite someone</button>
        <button className="btn ghost" data-t="Joined. You read until someone who makes lets you in.">Join with a code</button>
        <button className="btn ghost" data-t="Named it. Invite people next.">New group</button></div> : null}
      <div className="legend">{Object.keys(L).filter((k) => present.has(k)).map((k) => <span key={k}><i className={`st s-${k}`} />{L[k]}</span>)}</div>
    </div></div>
  );
}

export function GroupPage({ gid }: { gid: string }) {
  const s = team(), g = s.groups.find((x) => x.id === gid) || sortedGroups(s)[0] || s.groups[0];
  if (!g) return <div className="ppl" data-people="group"><div className="gpage"><h1>Cowork</h1><p className="say">No groups yet.</p></div></div>;
  const mk = isMaker(s), many = g.people.length > 8, mine = openIn(g), b = st();
  const shown = g.waits.map((w) => ({ w, id: idOf(g, w) })).filter(({ w, id }) => !w.more && (mk || w.kind === "approve") && !(id && b.done.has(id))).slice(0, 3), more = g.waits.find((w) => w.more);
  const vis = g.lines.filter((l) => mk || !l.makers);
  const withAI = g.people.filter((x) => x.ai && !x.me && x.role === "makes").slice(0, 2), anyAI = g.people.some((x) => x.ai && !x.me);
  const sh = (g.shared || []).filter((x) => mk || !x.makers);
  return (
    <div className="ppl" data-people="group"><div className="gpage">
      <div className="ghead"><h1>{g.name}</h1><Faces ps={g.people} cls="l" />{mk ? <button className="btn ghost" data-t="Invite: a name or email, and a role. The code is in the small print.">Invite</button> : null}</div>
      <p className="say">{!mk && mine.length ? "One thing needs your yes." : mine.length ? (mine.length === 1 ? "One thing waits on you" : `${mine.length} things wait on you`) + (g.due ? `. Due ${g.due}.` : ".") : g.last}</p>
      {g.main ? <div className="card mainthing" data-f="the work itself, on top"><span className="ico bigx" style={{ background: g.main.c }} /><div><b>{g.main.n}</b><small>{g.main.k} · {g.main.s}</small></div><button className="btn ghost end" data-t="Opens beside your work">Open</button></div> : null}
      {shown.length ? <div className="waits" data-f="C14 · C20 · one ranking">
        {shown.map(({ w, id }, i) => <div key={i} className={`wrow ${w.kind}${focus(id)}`} data-pid={id ?? undefined}><Face p={{ h: w.h, n: w.from }} cls="xs" />
          <div className="t">{me(w.text)}<small>{w.sub}{id && b.later.has(id) ? " · you said later" : ""}</small></div><Btns g={g} w={w} id={id} cls="mini" /></div>)}
        {more && mk ? <div className="morew">+{more.more} more · raised by AIs or older</div> : null}</div> : null}
      <div className="cols">
        <div className="room" data-f="C6 · C14 · folds by kind"><div className="rh"><b>The room</b>{mk ? "people’s lines open · AI and build updates fold" : "what the team shares with you"}</div>
          {many ? <div className="facefilter" data-f="many people: filter by face"><span>Today</span>{g.people.slice(0, 9).map((x, i) => <Face key={i} p={x} />)}<span className="more">+{g.people.length - 9}</span></div> : null}
          <div className="lines">{vis.map((l, i) => l.fold
            ? <div key={i} className="lnx fold" data-t="Opens in place">{l.build ? <svg className="ic" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8M8 6c6 0 8 2 8 4" /></svg> : l.people ? <span className="dots3" /> : <Face p={{ h: l.h, n: "" }} cls="xs" />}<span>{l.fold}</span><span className="chev">›</span></div>
            : l.kind === "decided" ? <div key={i} className="lnx decidedln"><span className="aura s" /><div><div className="whox"><b>Decided</b>{l.who || l.time}</div><div className="tx">{me(l.t)}</div></div></div>
            : <div key={i} className={`lnx ${l.ai ? "ai" : ""} ${l.you ? "you" : ""}`}><Face p={{ h: l.h, n: l.who, me: l.h === "sam" }} /><div><div className="whox"><b>{l.who}</b>{l.time}{l.link ? " · by link" : ""}{l.you ? " · names you" : ""}</div>
              {l.kind === "done" ? <div className="landed"><span className="docx" /><div>{l.t}<small>Finished work · open it</small></div></div> : <div className="tx">{l.t}</div>}</div></div>)}</div>
          <div className="rin" data-f="C15">{!mk ? "Reply to the team…" : anyAI ? "Write to the group, or ask someone’s AI…" : "Write to the group…"}
            <span className="tox">{mk && anyAI ? <>{withAI.map((x) => <span key={x.n}>@{x.n}’s AI</span>)}<span>Hand over…</span></> : null}</span></div>
        </div>
        <div className="side2">
          <h3 data-f="C16 · roles · reach">People <span className="hn">{g.people.length}</span></h3>
          {g.people.slice(0, 6).map((x, i) => <div key={i} className="pp"><Face p={x} cls="l" /><div><b>{x.n}</b>{x.role !== "makes" ? <> <span className="role">{x.role}</span></> : null}
            <div className="r">{x.reach === "link" ? "by link, no app" : x.ai ? `AI: ${x.ai}${x.st === "unk" ? " · not checked in" : ""}` : "no AI"}</div></div></div>)}
          {g.people.length > 6 ? <div className="allp" data-t={`Searchable list of all ${g.people.length}`}>All {g.people.length} · search</div> : null}
          {sh.length ? <><h3 data-f="C8 · C9 · only once something is connected">Shared</h3>{sh.map((x) => <div key={x.n} className="thing"><span className="ico" style={{ background: x.c }} />{x.n}<span className="k">{x.k}</span></div>)}</>
            : mk && !g.main ? <><h3>Shared</h3><div className="hintx">Add what you work in: a document, a sheet, a design file, a calendar, a repository.</div></> : null}
          {g.notes && mk ? <><h3 data-f="C12 · anyone can write">What the group knows <a className="wn" data-t="Write a note">write one</a></h3><div className="knows" dangerouslySetInnerHTML={{ __html: g.notes }} /></> : null}
          {g.decided?.length ? <><h3 data-f="decided: any line, by a person">Decided</h3>{g.decided.map((d, i) => <div key={i} className="decx"><span className="aura s" />{d.t}<span className="whox">{d.who}</span></div>)}</> : null}
          <div className="leave"><button className="mini" data-t="Paused: hidden from the side and silent; you keep your place">Pause</button>
            <button className="mini" data-act={`leave_group:${g.id}`} data-f="C26">Leave</button>
            {mk ? <button className="mini" data-act={`page:first:${g.id}`}>First time here (try)</button> : null}</div>
        </div>
      </div>
    </div></div>
  );
}

export function First({ gid }: { gid: string }) {
  const s = team(), g = s.groups.find((x) => x.id === gid) || s.groups[0];
  if (!g) return <div className="ppl" data-people="first"><div className="page" /></div>;
  const opts = s.first?.opts || [["This Mac", "Claude · on now"], ["No AI for now", "You take part yourself"]];
  return (
    <div className="ppl" data-people="first"><div className="page">
      {s.remembered ? <div className="psheet small"><h2>You joined {g.name}</h2><p className="say">With your last answer: <b>this Mac, Claude, asks first</b>. 39 people here can ask your AI; it answers read-only.</p>
        <div className="acts end"><button className="btn ghost" data-t="Change">Change</button><button className="btn pri" data-act={`page:group:${g.id}`}>Fine</button></div></div>
      : <div className="psheet" data-f="C5 · honest answers"><h2>Who sits for you at {g.name}?</h2>
        <p className="say">Your AI joins with you. {g.people.length - 1} {g.people.length - 1 === 1 ? "person" : "people"} here can ask it; it answers read-only unless you say more.</p>
        <div className="lab">Where</div>{opts.map((o, i) => <div key={o[0]} className={`pick ${i ? "" : "on"}`}><div><b>{o[0]}</b><small>{o[1]}</small></div><span className="rd" /></div>)}
        <div className="lab">How far it goes</div>
        <div className="pseg"><button className="on">Asks first<small>the safe start</small></button><button>Does, then tells<small>you see each thing</small></button><button>Just does<small>inside this group</small></button></div>
        <div className="acts end"><button className="btn ghost" data-act={`page:group:${g.id}`}>Not yet</button><button className="btn pri" data-act={`page:group:${g.id}`}>Agree and join</button></div></div>}
    </div></div>
  );
}
