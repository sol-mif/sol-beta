// owned by slices 8+9 (Cowork v2 and Social v2, the people), docs/port/slices.md "Night 2, outlined"
// The engine's messages the people read (live only): Cowork from today's team.v3.front (the groups, as tiles) and
// team.v3.needsme (what waits on me), both PROTOCOL.md "Slice 2"; an ask is answered with team.v3.talk.answer, the old
// face's own message. BR1 (#1615): each group's page from main's Cowork engine, read once when the group first shows and
// again when its talk moves: the room is the group's talk (team.v3.talk.thread) and its Agents' room (team.v3.way.room.read,
// what each AI did or left to a person), an AI's run folded as the drawing folds it; Shared is its artifacts
// (team.v3.artifacts.list); People is team.v3.people, which answers for the room open in the engine only, so other groups
// keep the front's faces. Social has its own wire (cv/wire/social.ts). Read again when the team's talk moves, never on a timer.
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { act, change, hooks } from "../core.ts";
import type { Engine } from "./types.ts";
import { ROLE, type Group, type Line, type Person, type Team, type Thing, type Wait } from "../../people/data.ts";
import { live } from "../../people/queue.ts";
import { ensureWalk } from "../moves/people.ts";

type Tile = { project: string; name: string; count: number; next: { label: string } | null; quiet: boolean; faces: string[] };
type Need = { kind: "ask" | "hand" | "yes"; id: string; project: string; from: string; line: string };
/** engine/src/team/v3/talk.ts Line, way-room.ts RoomEntry, artifacts.ts Artifact, people.ts Station: the fields read here */
export type Said = { id: string; from: string; agent?: string; at: number; text: string; asks?: string[] };
export type Entry = { at: number; what: string; why: string; line?: string; from?: string };
export type Art = { id: string; kind: string; title: string; whose: string; version: number; waiting?: boolean };
export type Station = { who: string; role: "owner" | "editor" | "guest"; you: boolean; here: string; agent: { busy: boolean } | null };
/** what one group's page has read, beyond its tile */
export type Room = { lines?: Said[]; decided?: Entry[]; arts?: Art[]; people?: Station[] };

const HUES = [ROLE.lilac, ROLE.peach, ROLE.mint, ROLE.sky, ROLE.blush, ROLE.teal];
const BTNS: Record<string, string[]> = { ask: ["Yes", "Not yet", "Open"], hand: ["Take it", "Not mine"], approve: ["Approve", "Ask for changes"] };
const KIND_HUE: Record<string, string> = { document: ROLE.lilac, page: ROLE.sky, table: ROLE.mint, canvas: ROLE.peach, flow: ROLE.blush };
/** one face per login, the same on every line and in People */
const hue = (who: string) => "g" + ([...who].reduce((a, c) => a + c.charCodeAt(0), 0) % 6);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** today a clock, before that the day, as the drawing writes it */
function when(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "am" : "pm"}`;
  return now - at < 6 * 86_400_000 ? DAY[d.getDay()] : `${d.getDate()}/${d.getMonth() + 1}`;
}

/** the room: the group's talk and its Agents' room in one time order; two or more lines in a row from one AI fold into
 *  "X's AI · N updates", as the drawing folds them (merge/views/cowork.js); the newest twelve (pure) */
export function linesOf(me: string, said: Said[], decided: Entry[], now: number): Line[] {
  const name = (who: string) => (who === me ? "You" : who), ai = (who: string) => (who === me ? "Your AI" : `${who}’s AI`);
  type It = { at: number; who: string; agent: boolean; l: Line };
  const its: It[] = [
    ...said.map((x): It => ({ at: x.at, who: x.from, agent: !!x.agent, l: x.agent
      ? { who: ai(x.from), h: x.from === me ? "sam" : hue(x.from), ai: 1, t: x.text, time: when(x.at, now) }
      : { who: name(x.from), h: x.from === me ? "sam" : hue(x.from), t: x.text, time: when(x.at, now), ...(me && x.asks?.includes(me) ? { you: 1 } : {}) } })),
    // the Agents' room: what an AI did here ("pressed"), or left to its person ("mine", "undecided"); a wake alone says nothing
    ...decided.filter((d) => d.what !== "woke" && d.what !== "refused" && (d.line || d.why)).map((d): It => {
      const who = d.from || me;
      return { at: d.at, who, agent: true, l: { who: ai(who), h: who === me ? "sam" : hue(who), ai: 1, time: when(d.at, now),
        ...(d.what === "pressed" ? { kind: "done", t: d.line || d.why } : { t: `Left to ${name(who) === "You" ? "you" : name(who)}: ${d.line || d.why}` }) } };
    }),
  ].sort((a, z) => a.at - z.at);
  const out: Line[] = [];
  for (let i = 0; i < its.length;) {
    let j = i; while (its[i].agent && j + 1 < its.length && its[j + 1].agent && its[j + 1].who === its[i].who) j++;
    out.push(j > i ? { fold: `${its[i].l.who} · ${j - i + 1} updates`, h: its[i].l.h } : its[i].l);
    i = j + 1;
  }
  return out.slice(-12);
}

/** People from team.v3.people: an owner or editor makes, a guest reads; an AI is said by whether it works now (pure) */
export const peopleOf = (ss: Station[]): Person[] => [...ss].sort((a, z) => Number(z.you) - Number(a.you)).map((x) => ({
  n: x.you ? "You" : x.who, h: x.you ? "sam" : hue(x.who), role: x.role === "guest" ? "reads" : "makes", reach: "app",
  ai: x.agent ? (x.agent.busy ? "working now" : "on") : null, st: x.agent?.busy ? "work" : "rest", ...(x.you ? { me: true } : {}),
}));
/** Shared from the group's artifacts, kind and version as the small word (pure) */
export const sharedOf = (as: Art[]): Thing[] => as.map((a) => ({ k: a.kind, n: a.title, s: `v${a.version} · ${a.whose}${a.waiting ? " · waits" : ""}`, c: KIND_HUE[a.kind] ?? ROLE.lilac }));

/** today's front and needs as one team setup, the shape the fixture's setups have; each group's page from what it has read (pure) */
export function teamOf(tiles: Tile[], needs: Need[], rooms: Record<string, Room> = {}, me = "", now = Date.now()): Team {
  const groups: Group[] = tiles.map((t, i) => {
    const r = rooms[t.project] ?? {};
    return {
      id: t.project, project: t.project, name: t.name, color: HUES[i % HUES.length], quiet: t.quiet ? 1 : undefined,
      people: r.people?.length ? peopleOf(r.people) : [{ n: "You", h: "sam", role: "makes", reach: "app", ai: "Claude", st: "rest", me: true },
        ...(t.faces ?? []).map((n) => ({ n, h: hue(n), role: "makes", reach: "app", ai: null, st: "rest" }))],
      waits: needs.filter((n) => n.project === t.project).map((n): Wait => {
        const kind = n.kind === "yes" ? "approve" : n.kind;
        return { id: n.id, from: n.from, h: hue(n.from), kind, text: n.line, sub: "", btns: BTNS[kind] };
      }),
      lines: linesOf(me, r.lines ?? [], r.decided ?? [], now), ...(r.arts?.length ? { shared: sharedOf(r.arts) } : {}), last: t.next?.label ?? "",
    };
  });
  return { label: "live", groups, live: true };
}

const BR1 = "br1:";   // the rid this wire's group reads carry, so a reply names its group even when it does not say
/** a project's id as the engine takes it (team/v3/join.ts PROJECT) */
const PROJECT_ID = /^[A-Za-z0-9][\w.-]{0,79}$/;
/** a pasted link without what came around it: a period, a comma, a bracket or quotes (as social.ts codeIn reads) */
const bare = (t: string) => t.trim().replace(/^[\s("'“‘[<]+|[\s.,;:!?)\]}"'’”>]+$/g, "");
/** a group's join link as the engine writes it (team/v3/join.ts urlOf): sol://join?project=…&t=…, or "" (pure) */
export function groupLink(url: unknown): string {
  if (typeof url !== "string" || url.length > 300) return "";
  const t = bare(url);
  try { const u = new URL(t); return u.protocol === "sol:" && u.hostname === "join" && !!u.searchParams.get("project") && !!u.searchParams.get("t") ? t : ""; } catch { return ""; }
}
/** the engine's why, as a line of the frame */
const said = (why: string) => why.charAt(0).toUpperCase() + why.slice(1);
const ROLE_WORDS: Record<string, string> = { editor: "someone who makes", guest: "someone who reads" };
/** what an invite copied says: who it lets ask in, that a person lets them in, and until when (pure) */
export function invited(role: unknown, until: unknown, now = Date.now()): string {
  const days = typeof until === "number" ? Math.max(1, Math.round((until - now) / 864e5)) : 0;
  return `Invite link copied. One person opens it and asks in as ${ROLE_WORDS[String(role)] ?? "someone who makes"}; you let them in.${days ? ` It works for ${days} ${days === 1 ? "day" : "days"}.` : ""}`;
}
export function attach(e: Engine): void | (() => void) {
  ensureWalk();
  let tiles: Tile[] | null = null, needs: Need[] = [], me = "";
  const rooms: Record<string, Room> = {}, seen = new Set<string>();
  const build = () => { if (tiles) change(() => { live.team = teamOf(tiles!, needs, rooms, me); }); };
  const read = () => { e.send({ type: "team.v3.front" }); e.send({ type: "team.v3.needsme" }); };
  const readGroup = (project: string) => {
    e.send({ type: "team.v3.talk.thread", project, rid: `${BR1}talk:${project}` });
    e.send({ type: "team.v3.way.room.read", project, rid: `${BR1}room:${project}` });
    e.send({ type: "team.v3.artifacts.list", project, rid: `${BR1}arts:${project}` });
  };
  const room = (p: string) => (rooms[p] ??= {});
  type M = { type?: string; rid?: string; project?: string; me?: string; tiles?: Tile[]; needs?: Need[]; lines?: Said[]; artifacts?: Art[];
    room?: { decided?: Entry[] }; groups?: { people?: Station[] }[]; error?: string; url?: string; until?: number; role?: string; already?: string; name?: string };
  const off = e.subscribe((m: M) => {
    const t = m?.type, p = m?.project;
    if (t === "team.v3.front" && Array.isArray(m.tiles)) {
      tiles = m.tiles; if (m.me) me = m.me;
      for (const x of tiles) if (!seen.has(x.project)) { seen.add(x.project); readGroup(x.project); }
      e.send({ type: "team.v3.people" });
      build();
    } else if (t === "team.v3.needsme" && Array.isArray(m.needs)) { needs = m.needs; build(); }
    else if (t === "work.v3.talk.thread" && p && Array.isArray(m.lines)) { room(p).lines = m.lines; build(); }
    else if (t === "work.v3.artifacts.list" && p && Array.isArray(m.artifacts)) { room(p).arts = m.artifacts; build(); }
    else if (t === "team.v3.way.room.read" && m.rid?.startsWith(`${BR1}room:`) && Array.isArray(m.room?.decided)) { room(m.rid.slice(BR1.length + 5)).decided = m.room!.decided; build(); }
    else if (t === "team.v3.people" && p && Array.isArray(m.groups)) {
      const all = new Map<string, Station>(); for (const g of m.groups) for (const s of g.people ?? []) all.set(s.who, s);
      room(p).people = [...all.values()]; build();
    } else if (t === "team.v3.way.room.decided" && p) e.send({ type: "team.v3.way.room.read", project: p, rid: `${BR1}room:${p}` });
    else if (t === "work.v3.talk.asked" || t === "work.v3.talk.line" || t === "work.v3.join.in") { if (p) readGroup(p); read(); }
    else if (t === "work.v3.join.link" && m.rid?.startsWith(`${BR1}invite:`)) {
      if (m.error || !m.url) { hooks.flash?.(m.error ? said(m.error) : "No invite link this time"); return; }
      if (typeof navigator !== "undefined") navigator.clipboard?.writeText(m.url).catch(() => {});
      hooks.flash?.(invited(m.role, m.until));
    } else if (t === "work.v3.join.open" && m.rid === `${BR1}join`) {
      if (m.error) { hooks.flash?.(said(m.error)); act("page:cowork"); return; }
      hooks.flash?.(m.already ? `You are in ${m.name ?? "that group"} already` : `You asked to join ${m.name ?? "the group"}. Whoever runs it lets you in; it shows here then.`);
      act(m.already && p ? `page:group:${p}` : "page:cowork");
      read();
    }
  });
  /** a group's invite: one link, for one person to ask in; whoever runs the group lets them in (team.v3.join.link) */
  live.invite = (gid) => (PROJECT_ID.test(gid) ? (e.send({ type: "team.v3.join.link", project: gid, role: "editor", rid: `${BR1}invite:${gid}` }), true) : false);
  /** a group's link opened (sol://join?project=…&t=…, from the browser or pasted): asked in, or told why not (team.v3.join.open) */
  live.join = (url) => { const g = groupLink(url); if (g) e.send({ type: "team.v3.join.open", url: g, rid: `${BR1}join` }); return !!g; };
  /** only an ask is answered from here (the old face's message); a hand or a yes opens its group */
  live.answer = (g, w) => (w.kind === "ask" && !!w.id && !!g.project ? (e.send({ type: "team.v3.talk.answer", project: g.project, ask: w.id }), read(), true) : false);
  read();
  return () => { off(); live.team = null; live.answer = null; live.invite = null; live.join = null; };
}
