// Cowork v3, slice 7 (fr-30, #560): the socket's door to artifacts, search and the floor. team/wire.ts imports this file
// only when the switch is on, on the first team.v3.artifacts.* / team.v3.search.* / team.v3.floor.* message; with it off
// nothing here loads (F7). Each request is answered once, by its rid, as work.v3.<same rest> (the Home and Work face
// hears work.* messages, useEngine.ts), with what was asked or { error } in one line.
import * as A from "./artifacts.js";
import * as F from "./floor.js";
import { search } from "./search.js";
import { openPort, type By, type Collection, type Port } from "./trailport.js";
import type { Pairing } from "./pair.js";

const PROJECT = /^[A-Za-z0-9][\w.-]{0,79}$/;
const COLLS: Collection[] = ["items", "loose", "members", "places"];
export const SEVEN = /^team\.v3\.(artifacts|search|floor)\.[a-z]+$/;
const s = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : "");

/** the people of a project: its members and anyone who wrote on its trail */
function people(p: Port, project: string): string[] {
  const rec = p.record(project);
  const all = new Map<string, string>();
  for (const id of Object.keys(rec.members)) all.set(id.toLowerCase(), id);
  for (const e of p.events(project)) if (!all.has(e.by.person.toLowerCase())) all.set(e.by.person.toLowerCase(), e.by.person);
  return [...all.values()].sort((a, b) => a.localeCompare(b));
}

/** the floor of a project as the face draws it in one read */
export function floorOf(p: Port, project: string, me: string, who?: string) {
  const rec = p.record(project), events = p.events(project);
  return {
    me, project, machine: p.machine, trail: p.kind,
    interrupt: F.interruptOf(rec, me), quietNow: F.isQuiet(F.interruptOf(rec, me), new Date()),
    whats: F.WHAT, quiets: F.QUIETS,
    devices: F.devices(p, project, me),
    waiting: F.waitingCard(p, project),
    conflicts: F.conflictCards(rec),
    people: people(p, project),
    ...(who ? { leave: F.leaves(rec, events, who, me) } : {}),
  };
}

// a second machine of mine (pair.ts): one pairing a run, through the first cloud group's hub (the cloud trail)
let pairing: Pairing | null = null;
async function pairingNow(me: string): Promise<Pairing> {
  if (pairing) return pairing;
  const [P, { v3 }, { getTeam }, { hubHttp, hubTicket }] = await Promise.all([import("./pair.js"), import("./index.js"), import("../settings.js"), import("../relay.js")]);
  const room = getTeam().rooms.find((r) => r.code && r.hub && hubHttp(r.hub));
  let base = "";
  try { base = room ? new URL(hubHttp(room.hub!)).origin : ""; } catch { /* no cloud */ }
  if (!base) throw new Error("pairing goes through Sol's cloud: join a cloud group on this machine first");
  const http = hubHttp(room!.hub!);
  return (pairing = new P.Pairing({ keys: v3().keys, login: me, mailbox: P.httpMailbox({ base, ticket: () => hubTicket(http).catch(() => "") }) }));
}
/** tests: a pairing of their own */
export const _setPairing = (x: Pairing | null) => { pairing = x; };

export async function answerSeven(m: Record<string, unknown>, ctx: { me: string; projects?: string[]; port?: Port }): Promise<Record<string, unknown>> {
  const type = String(m.type);
  const out: Record<string, unknown> = { type: `work.${type.slice("team.".length)}`, ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  try {
    const p = ctx.port ?? await openPort();
    if (type === "team.v3.search.query") {
      const project = s(m.project, 80);
      if (project && !PROJECT.test(project)) return { ...out, error: "which project?" };
      const projects = [...new Set([...(ctx.projects ?? []), ...p.projects()])];
      return { ...out, ...search(p, s(m.q, 200), project ? { project } : { projects }) };
    }
    const project = s(m.project, 80);
    if (!PROJECT.test(project)) return { ...out, error: "which project?" };
    if (!ctx.me) return { ...out, error: "sign in to GitHub first: what you write is signed as you" };
    const by: By = { person: ctx.me, machine: p.machine };
    const id = s(m.id, 80);
    switch (type) {
      case "team.v3.artifacts.list": return { ...out, project, artifacts: A.list(p, project) };
      case "team.v3.artifacts.get": { const a = A.get(p, project, id); return a ? { ...out, ...a } : { ...out, error: "no such artifact in this project" }; }
      case "team.v3.artifacts.make": { const r = A.make(p, { project, by, kind: m.kind, title: m.title, content: m.content, place: m.place }); return { ...out, art: r.art, versions: r.versions }; }
      case "team.v3.artifacts.edit": { const r = A.edit(p, { project, id, by, content: m.content, title: m.title }); return { ...out, art: r.art, versions: r.versions, wrote: !!r.event }; }
      case "team.v3.artifacts.back": { const r = A.back(p, { project, id, by, ...(typeof m.to === "number" ? { to: m.to } : {}) }); return { ...out, art: r.art, versions: r.versions }; }
      case "team.v3.artifacts.export": {
        const a = A.get(p, project, id);
        if (!a) return { ...out, error: "no such artifact in this project" };
        const v = typeof m.v === "number" ? a.versions[m.v - 1] : a.versions[a.versions.length - 1];
        if (!v) return { ...out, error: "no such version" };
        return { ...out, ...A.exportOf(a.art, v.content) };
      }
      case "team.v3.floor.get": return { ...out, ...floorOf(p, project, ctx.me, s(m.who, 40) || undefined) };
      case "team.v3.floor.interrupt": F.setInterrupt(p, project, by, m.value); return { ...out, ...floorOf(p, project, ctx.me) };
      case "team.v3.floor.leave": {
        const who = s(m.who, 40);
        if (!who) return { ...out, error: "who leaves?" };
        F.pressLeave(p, project, by, who, { act: m.act as F.LeaveLine["act"], kind: m.kind as F.LeaveLine["kind"], id });
        return { ...out, ...floorOf(p, project, ctx.me, who) };
      }
      case "team.v3.floor.keep": {
        const collection = m.collection as Collection;
        if (!COLLS.includes(collection)) return { ...out, error: "which kind of thing?" };
        F.keepVersion(p, project, by, { collection, id, field: s(m.field, 120), event: s(m.event, 80) });
        return { ...out, ...floorOf(p, project, ctx.me) };
      }
      case "team.v3.floor.certify": F.certify(p, project, by, s(m.name, 40), s(m.pub, 60), s(m.note, 80)); return { ...out, ...floorOf(p, project, ctx.me) };
      case "team.v3.floor.answers": F.setAnswers(p, project, by, s(m.name, 40)); return { ...out, ...floorOf(p, project, ctx.me) };
      // pairing: offer (here: show a code), pair (the other machine: the code typed), paired (either: look once)
      case "team.v3.floor.offer": { const o = (await pairingNow(ctx.me)).offer(); return { ...out, code: o.code, until: o.until }; }
      case "team.v3.floor.pair": { const r = await (await pairingNow(ctx.me)).ask(s(m.code, 20)); return { ...out, ...r }; }
      case "team.v3.floor.paired": {
        const pr = await pairingNow(ctx.me);
        const mine = await pr.take();   // the machine with the person key: an ask to sign
        if ("error" in mine) return { ...out, error: mine.error };
        if (mine.state === "paired") {   // vouched on the floor of every project of mine here, so "my devices" lists it
          for (const pj of new Set([project, ...(ctx.projects ?? [])])) { try { F.certify(p, pj, by, mine.name, mine.pub, "paired by code"); } catch { /* a project that will not take it */ } }
          return { ...out, state: "paired", name: mine.name, ...floorOf(p, project, ctx.me) };
        }
        if (mine.state !== "none") return { ...out, state: mine.state };
        const theirs = await pr.done();   // the new machine: the answer to keep
        if ("error" in theirs) return { ...out, error: theirs.error };
        return { ...out, state: theirs.state, ...(theirs.state === "paired" ? { by: theirs.by, ...floorOf(p, project, ctx.me) } : {}) };
      }
      case "team.v3.floor.key": { const k = p.machine0(ctx.me); return { ...out, name: p.machine, pub: k.pub, key: p.writer(k.pub).slice(0, 4) }; }
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}
