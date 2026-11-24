// The people's pages (slices 8+9, #1615; merge/shell.js P2 and merge/people.js): the slot the shell mounts in #view on
// a people page (cowork, group:<id>, first:<id>, social, friend:<name>, asfriend:<name>, link, share:<friend>,
// setup:<room code>) and under Needs you
// (part "needs": the people's waits and cards below the canvas's asks, answerable there, P3). It hears the presses the
// shell does not: an answer (data-said) goes through M.answer_wait or M.answer_card; a friend's "Also in" link switches
// the setup first (data-s); the rest are the page's own toggles, as the mockup drew them. Links are data-act, the shell's.
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import type { KeyboardEvent, MouseEvent as RMouseEvent } from "react";
import { M, MODE, S, act, hooks, useNext } from "../cv/index.ts";
import type { SlotProps } from "../slots.ts";
import { Face, Faces } from "./Face.tsx";
import { KIND } from "./data.ts";
import { NAV, items, live, me, notHere, parg, pk, st, team, toggleOpen, use, type Card, type Item } from "./queue.ts";
import { First, GroupPage, Home } from "../cowork/Cowork.tsx";
import { AsFriend, FriendPage, LinkPage, SetupPage, SharePage, SocialPage } from "../social/Social.tsx";
import type { ExtOpen } from "./extra.ts";
import "./people.css";
import "../cowork/cowork.css";
import "../social/social.css";

function press(ev: RMouseEvent) {
  const t = ev.target as HTMLElement;
  const s = t.closest<HTMLElement>("[data-said]");
  if (s) {
    const it = s.closest<HTMLElement>("[data-pid]"), id = it?.dataset.pid, w = s.dataset.said ?? "Yes";
    if (id) {
      const r = (id.startsWith("w:") ? M.answer_wait : M.answer_card)(id, w);
      if (r.ok) hooks.flash?.(/^later$/i.test(w) ? "Later: it stays in Waiting on you, last." : `You said “${w}”. Written in the Diary.`);
    }
    return;
  }
  const u = t.closest<HTMLElement>("[data-s][data-act]");
  if (u && !team().groups.some((g) => `page:group:${g.id}` === u.dataset.act)) use({ s: u.dataset.s });
  const o = t.closest<HTMLElement>("[data-open]");
  if (o) { const c = o.closest<HTMLElement>(".fold2"); if (c?.dataset.pid) toggleOpen(c.dataset.pid); return; }
  // live Social (BR1, cv/wire/social.ts): an ask by name, a grant's switch and the link change Isaac's Social itself
  const ls = live.social;
  if (ls) {
    const add = t.closest<HTMLElement>("[data-add]");
    if (add) {
      const i = add.parentElement?.querySelector("input"), r = ls.add(i?.value ?? "") ?? "Asked";
      hooks.flash?.(r); if (i && r.startsWith("Asked")) i.value = "";
      return;
    }
    const g = t.closest<HTMLElement>(".gr[data-g]");
    if (g && t.closest(".tog")) { const r = ls.grant(g.dataset.friend ?? "", g.dataset.g ?? ""); if (r) hooks.flash?.(r); return; }
    const uf = t.closest<HTMLElement>("[data-unfriend]"), us = uf ? ls.unfriend(uf.dataset.unfriend ?? "") : null;
    if (us) { hooks.flash?.(us); act("page:social"); ev.stopPropagation(); return; }
    if (t.closest("[data-copy]")) {
      const l = ls.link();
      if (!l) { hooks.flash?.(ls.linkWhy()); ev.stopPropagation(); return; }
      navigator.clipboard?.writeText(l).catch(() => {}); hooks.flash?.(`Link copied: ${l}. It works once, for one friend.`); return;
    }
  }
  const uu = t.closest<HTMLElement>(".usual .u");
  if (uu) { uu.classList.toggle("off"); uu.querySelector(".tog")?.classList.toggle("on"); }
  else t.closest(".tog")?.classList.toggle("on");
  const pick = t.closest(".pick");
  if (pick) { pick.parentElement?.querySelectorAll(".pick").forEach((x) => x.classList.remove("on")); pick.classList.add("on"); }
  const sg = t.closest(".pseg button,.tpick span,.fchips span");
  if (sg) { sg.parentElement?.querySelectorAll(sg.tagName).forEach((x) => x.classList.remove("on")); sg.classList.add("on"); }
  // live (BR1): a group's Invite is a real link (team.v3.join.link); any other line a press plays is the dev page's
  // pretend unless the button says it is true here (data-real), so it says the press is not here yet instead
  const inv = t.closest<HTMLElement>("[data-invite]");
  if (MODE === "live" && inv) { if (!live.invite?.(inv.dataset.invite ?? "")) hooks.flash?.(notHere(inv.textContent ?? "")); return; }
  const d = t.closest<HTMLElement>("[data-t]");
  if (d?.dataset.t) hooks.flash?.(MODE === "live" && !("real" in d.dataset) ? notHere(d.textContent ?? "") : d.dataset.t);
}

/** live, Enter in a find-and-add box asks that name (the box with no Ask button, FX12) */
function key(ev: KeyboardEvent<HTMLDivElement>) {
  const i = ev.target as HTMLInputElement;
  if (ev.key !== "Enter" || !live.social || !i.closest?.(".findadd") || i.tagName !== "INPUT" || !i.value.trim()) return;
  const r = live.social.add(i.value) ?? "Asked"; hooks.flash?.(r); if (r.startsWith("Asked")) i.value = "";
}

/** the page, by S.page */
function Page() {
  const page = useNext((_d, s) => s.page);
  const k = pk(page), a = parg(page);
  if (k === "cowork") return <Home />;
  if (k === "group") return <GroupPage gid={a} />;
  if (k === "first") return <First gid={a} />;
  if (k === "social") return <SocialPage />;
  if (k === "friend") return <FriendPage name={a} />;
  if (k === "asfriend") return <AsFriend name={a} />;
  if (k === "link") return <LinkPage />;
  if (k === "share") return <SharePage key={a} name={a} />;
  if (k === "setup") return <SetupPage key={a} code={a} />;
  return null;
}

const kindLine = (c: Card) => c.fold ? `${c.xs.filter((x) => !st().done.has(x.id)).length} ${KIND[c.k][1]}` : c.xs[0].k === "request" ? `${c.xs[0].from} wants to be friends`
  : c.xs[0].k === "invite" ? `${c.xs[0].from} invites you: ${c.xs[0].title}` : c.xs[0].k === "beyond" ? `${c.xs[0].from}’s AI: ${c.xs[0].title}` : `${c.xs[0].from}: ${c.xs[0].title}`;
const yesOf = (c: Card) => c.fold ? (c.k === "request" ? "Accept all" : c.k === "beyond" ? "No to all" : c.k === "help" ? "Not this time to all" : "Look one by one")
  : ({ help: "Run it", invite: "Accept", beyond: "Allow once", request: "Accept" } as Record<string, string>)[c.xs[0].k];
const noOf = (c: Card) => c.fold ? null : ({ help: "Not this time", invite: "Decline", beyond: "No", request: "Decline" } as Record<string, string>)[c.xs[0].k];
const ring = (id: string) => (st().focus === id ? " pfocus" : "");

/** Needs you: the people's waits and cards under the canvas's asks, answerable there (P3) */
function Needs({ top }: { top?: boolean }) {   // top: the extra askers alone, drawn above the canvas's asks (slice 6b, docs/port/requests/seats.md)
  useNext(() => 0);
  const all: Item[] = items(), ex = all.filter((x): x is ExtOpen => x.type === "ext"), o = all.filter((x): x is Exclude<Item, ExtOpen> => x.type !== "ext");
  if (!all.length) return null;
  return (<>
    {/* round 6: the extra askers (a blocked AI, a move-in item left by Skip) stand at the top, each drawn by its own row */}
    {top && ex.length ? <section className="pplneeds ppl r6needs" data-people-needs="">{ex.map((x) => <div key={x.id} data-pid={x.id}>{x.ext.row?.(x, st().focus === x.id) ?? null}</div>)}</section> : null}
    {!top && o.length ? <section className="pplneeds ppl" data-people-needs="">
      <h2>From people <small>{o.length} · Cowork and Social</small></h2>
      {o.map((x) => {
        if (x.type === "wait") {
          const w = x.w;
          return <div key={x.id} className={`pnrow${ring(x.id)}`} data-pid={x.id}><Face p={{ h: w.h, n: w.from }} cls="xs" /><div className="t">{me(w.text)}<small>{w.sub}</small></div>
            <span className="where" role="button" data-act={`page:group:${x.g.id}`}>Cowork · {x.g.name}</span>
            {(w.btns ?? []).filter((t) => !NAV.test(t)).slice(0, 2).map((t, i) => <button key={t} className={`mini${i ? "" : " pri"}`} data-said={t}>{t}</button>)}</div>;
        }
        const y = yesOf(x), n = noOf(x), look = x.fold && y === "Look one by one";
        return <div key={x.id} className={`pnrow${ring(x.id)}`} data-pid={x.id}><Faces ps={x.xs.map((z) => ({ n: z.from, h: z.h })).filter((v, i, a) => a.findIndex((q) => q.n === v.n) === i)} max={3} cls="xs" />
          <div className="t">{kindLine(x)}<small>{x.xs.some((z) => z.need) ? "needed soon · " : ""}{x.fold ? "one card for the kind" : x.xs[0].src || x.xs[0].size || x.xs[0].free || ""}</small></div>
          <span className="where" role="button" data-act="page:social">Social</span>
          {look ? <button className="mini pri" data-act="page:social">Look one by one</button> : <button className="mini pri" data-said={y}>{y}</button>}
          {n ? <button className="mini" data-said={n}>{n}</button> : null}</div>;
      })}
    </section> : null}
  </>);
}

export default function People({ part }: SlotProps) {
  useNext(() => 0);
  return <div className="ppl-host" onClick={press} onKeyDown={key}>{part === "needs" || part === "extra" ? (!S.page && S.dist === "needs" ? <Needs top={part === "extra"} /> : null) : <Page />}</div>;
}
