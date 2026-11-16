// Cowork v3, slice 7 (fr-30, #560): the floor, the things under every room that keep a team standing.
// - What may interrupt me, and my quiet hours: one me-layer setting of the project (`interrupt`), so a project can set
//   the default and I override it for myself; mayInterrupt() is the one rule the notch and pings read.
// - Someone leaving: what breaks, one line each (their places' sign-ins, their open items, files only on their machine,
//   their agent's key, the automations they own in the studio), one press a line (an automation has two: hand it over
//   or switch it off), nothing changing until it is pressed; the rest of the project keeps working.
// - Waiting to send: what this Sol wrote that the cloud has not kept yet (slice 0's outbox), on one card.
// - Conflicts: a field two Sols changed without seeing each other (slice 0's record conflicts), both versions on one
//   card; one press keeps one, written with every version as its base, so the other stays on the trail and nothing is lost.
// - My devices: a key per machine under my one person key; this machine's, and another machine's key vouched for here.
// Every write is one trail event through trailport.ts.
import { undoneIn } from "./record.js";
import { collectionOf, KIND_OF, NAME, type By, type Collection, type Conflict, type Ev, type Obj, type Port, type Rec } from "./trailport.js";

// ---------- what may interrupt me ----------
export const WHAT = ["reds and direct asks", "reds only", "anything new", "nothing, I look myself"] as const;
export type What = (typeof WHAT)[number];
/** quiet hours, local "HH:MM" to "HH:MM" (it may run past midnight); null = never quiet */
export type Quiet = { from: string; to: string } | null;
export type Interrupt = { what: What; quiet: Quiet; zone: string };
export const QUIETS: Quiet[] = [{ from: "21:30", to: "08:00" }, { from: "22:00", to: "07:00" }, { from: "19:00", to: "09:00" }, null];
export const DEFAULT_INTERRUPT: Interrupt = { what: "reds and direct asks", quiet: { from: "21:30", to: "08:00" }, zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const zoneOk = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };

/** an interrupt setting made whole, the default for anything missing (pure) */
export function cleanInterrupt(v: unknown): Interrupt {
  const o = isObj(v) ? v : {};
  const what = (WHAT as readonly string[]).includes(String(o.what)) ? o.what as What : DEFAULT_INTERRUPT.what;
  const q = o.quiet === null ? null : isObj(o.quiet) && HM.test(String(o.quiet.from)) && HM.test(String(o.quiet.to)) ? { from: String(o.quiet.from), to: String(o.quiet.to) } : DEFAULT_INTERRUPT.quiet;
  const zone = typeof o.zone === "string" && zoneOk(o.zone) ? o.zone : DEFAULT_INTERRUPT.zone;
  return { what, quiet: q, zone };
}
/** the interrupt setting as a person gets it in a project: their own, else the project's, else the team's (pure) */
export function interruptOf(rec: Rec, login: string): Interrupt & { layer: "me" | "project" | "team" | "default" } {
  const me = rec.settings.me[login.toLowerCase()];
  if (me && "interrupt" in me) return { ...cleanInterrupt(me.interrupt), layer: "me" };
  if ("interrupt" in rec.settings.project) return { ...cleanInterrupt(rec.settings.project.interrupt), layer: "project" };
  if ("interrupt" in rec.settings.team) return { ...cleanInterrupt(rec.settings.team.interrupt), layer: "team" };
  return { ...DEFAULT_INTERRUPT, layer: "default" };
}
const minutes = (hm: string) => { const m = HM.exec(hm)!; return Number(m[1]) * 60 + Number(m[2]); };
/** the minute of the day it is in a zone (pure on its input) */
export function minuteIn(at: Date, zone: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}
/** whether it is quiet now for this setting (pure on its input) */
export function isQuiet(i: Interrupt, at: Date): boolean {
  if (!i.quiet) return false;
  const m = minuteIn(at, i.zone), a = minutes(i.quiet.from), b = minutes(i.quiet.to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}
/** the one rule: may this interrupt me now? A red, an ask to me by name, or anything new, as I picked; quiet hours hold
 *  everything until they end (it waits on the front, never lost) (pure) */
export function mayInterrupt(i: Interrupt, what: "red" | "ask" | "new", at: Date): boolean {
  const allowed = i.what === "anything new" ? true : i.what === "reds and direct asks" ? what !== "new" : i.what === "reds only" ? what === "red" : false;
  if (!allowed) return false;
  return !isQuiet(i, at);
}
/** my interrupt setting in a project, one me-layer event */
export function setInterrupt(p: Port, project: string, by: By, v: unknown): Ev {
  return p.append({ project, by, kind: KIND_OF.settings, item: `me:${by.person.toLowerCase()}`, field: "interrupt", value: cleanInterrupt(v) });
}

// ---------- someone leaving ----------
export type LeaveLine = {
  /** what press it takes, and what it writes */
  act: "reconnect" | "hand" | "revoke" | "off";
  kind: "place" | "item" | "loose" | "agent" | "automation";
  id: string; title: string; line: string; place: string;
  press: string; done?: string;
  /** the line's other press (an automation: switch it off instead of handing it over) */
  alt?: { act: "off"; press: string };
};
export type LeaveCard = { who: string; heir: string; lines: LeaveLine[]; calm: string };
const f = (o: Obj, k: string) => (typeof o.fields[k] === "string" ? o.fields[k] as string : "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** who takes over: me when someone else leaves; another owner (or member) when I leave (pure) */
export function heirOf(rec: Rec, who: string, me: string): string {
  if (!same(who, me)) return me;
  const ms = Object.values(rec.members).filter((m) => !same(m.id, who) && f(m, "role") !== "guest" && !m.fields.out && m.fields.in !== false);   // out: slice 3 and 5 write in: false
  return (ms.find((m) => f(m, "role") === "owner") ?? ms[0])?.id ?? "";
}
/** the agents that wrote for a person in this project, by name, and whether their key is revoked here (pure) */
export function agentsOf(rec: Rec, events: Ev[], who: string): { name: string; revoked: boolean }[] {
  const names = [...new Set(events.filter((e) => same(e.by.person, who) && e.by.agent).map((e) => e.by.agent!))].sort();
  const m = Object.values(rec.members).find((x) => same(x.id, who));
  return names.map((name) => ({ name, revoked: m?.fields[`agent.${name}`] === "revoked" }));
}

/** the studio's automations of a project as the trail says (studio.ts list's rule: the latest write of each field wins;
 *  an undone write as if it never happened), with only what the leaving card needs (pure) */
export function automationsOf(events: Ev[]): { id: string; name: string; owner: string; on: boolean; payer: string; limit: number }[] {
  const undone = undoneIn(events as never);
  const by = new Map<string, { id: string; name: string; owner: string; on: boolean; payer: string; limit: number }>();
  for (const e of events) {
    if (e.kind !== "automation" || !e.item || !isObj(e.value) || undone.has(e.id)) continue;
    const v = e.value as { name?: unknown; owner?: unknown; on?: unknown; spend?: { who?: unknown; limit?: unknown } };
    const had = by.get(e.item);
    by.set(e.item, { id: e.item, name: typeof v.name === "string" ? v.name : had?.name ?? "an automation", owner: typeof v.owner === "string" ? v.owner : had?.owner ?? e.by.person,
      on: typeof v.on === "boolean" ? v.on : had?.on ?? true, payer: typeof v.spend?.who === "string" ? v.spend.who : had?.payer ?? e.by.person,
      limit: typeof v.spend?.limit === "number" ? v.spend.limit : had?.limit ?? 2 });
  }
  return [...by.values()];
}

/** if this person left: what breaks, one line each, one press each (pure) */
export function leaves(rec: Rec, events: Ev[], who: string, me: string): LeaveCard {
  const heir = heirOf(rec, who, me), yours = same(who, me) ? "your" : `${who}'s`;
  const to = heir ? (same(heir, me) ? "you" : heir) : "";
  const lines: LeaveLine[] = [];
  for (const pl of Object.values(rec.places)) {
    if (pl.fields.revoked) continue;
    const by = f(pl, "by") || pl.by.person;
    if (!same(by, who)) continue;
    const title = f(pl, "title") || f(pl, "label") || pl.id;
    lines.push({ act: "reconnect", kind: "place", id: pl.id, title, place: f(pl, "kind") || pl.id, line: `runs on ${yours} sign-in; it stops`,
      press: heir ? (same(heir, me) ? "Reconnect as me" : `Reconnect as ${heir}`) : "" });
  }
  for (const it of Object.values(rec.items)) {
    if (!same(f(it, "whose") || it.by.person, who) || f(it, "state") === "done") continue;
    const place = f(it, "place") || "record";
    lines.push({ act: "hand", kind: "item", id: it.id, title: f(it, "title") || it.id, place, line: place === "machine" ? `only on ${yours} machine` : `${yours}, open`, press: heir ? `Hand to ${to}` : "" });
  }
  for (const l of Object.values(rec.loose)) {
    if (!same(f(l, "whose") || l.by.person, who) || f(l, "place") !== "machine") continue;
    lines.push({ act: "hand", kind: "loose", id: l.id, title: f(l, "title") || l.id, place: "machine", line: `a file only on ${yours} machine`, press: heir ? `Ask for it, to ${to}` : "" });
  }
  for (const au of automationsOf(events)) {
    if (!same(au.owner, who) || !au.on) continue;
    lines.push({ act: "hand", kind: "automation", id: au.id, title: au.name, place: "automations",
      line: `${same(who, me) ? "yours" : `${who}'s`}${same(au.payer, who) ? `, on ${yours} subscription` : ""}; only its owner runs it`,
      press: heir ? `Hand to ${to}` : "", alt: { act: "off", press: "Switch off" } });
  }
  for (const a of agentsOf(rec, events, who)) {
    if (a.revoked) continue;
    lines.push({ act: "revoke", kind: "agent", id: a.name, title: `${yours} agent (${a.name})`, place: "key", line: `its key is signed under ${yours} key and still writes here`, press: "Revoke its key" });
  }
  return { who, heir, lines, calm: lines.length ? "" : same(who, me) ? "Nothing breaks. Nothing runs on you here." : `Nothing breaks. Nothing here runs on ${who}.` };
}

/** one line of the leaving card pressed: one event (pure but for the append) */
export function pressLeave(p: Port, project: string, by: By, who: string, line: { act: LeaveLine["act"]; kind: LeaveLine["kind"]; id: string }): Ev {
  const rec = p.record(project), heir = heirOf(rec, who, by.person);
  if (line.act !== "revoke" && line.act !== "off" && !heir) throw new Error("nobody here can take it over");
  if (line.act === "reconnect" && line.kind === "place") {
    if (!rec.places[line.id]) throw new Error("no such place");
    return p.append({ project, by, kind: KIND_OF.places, item: line.id, field: "by", value: heir });
  }
  if (line.act === "hand" && (line.kind === "item" || line.kind === "loose")) {
    const c: Collection = line.kind === "item" ? "items" : "loose";
    if (!rec[c][line.id]) throw new Error(`no such ${line.kind === "item" ? "item" : "loose thing"}`);
    return p.append({ project, by, kind: KIND_OF[c], item: line.id, field: "whose", value: heir });
  }
  if (line.kind === "automation" && (line.act === "hand" || line.act === "off")) {
    const au = automationsOf(p.events(project)).find((a) => a.id === line.id);
    if (!au) throw new Error("no such automation");
    if (!same(au.owner, who)) throw new Error(`${au.owner} owns that one now`);
    // the studio's own event (studio.ts write): whose it is and who pays move together, or it stops
    return p.append({ project, by, kind: "automation", item: au.id, value: line.act === "hand"
      ? { what: `handed it to ${heir} as ${who} left`, owner: heir, spend: { who: heir, limit: au.limit } }
      : { what: `switched it off as ${who} left`, on: false } });
  }
  if (line.act === "revoke" && line.kind === "agent") {
    if (!NAME.test(line.id)) throw new Error("which agent?");
    return p.append({ project, by, kind: KIND_OF.members, item: who, field: `agent.${line.id}`, value: "revoked" });
  }
  throw new Error("that line has no such press");
}

// ---------- waiting to send, and conflicts ----------
export type WaitingCard = { count: number; things: { id: string; title: string; kind: string }[]; away: string };
const titleIn = (rec: Rec, e: Ev, events: Ev[]): string => {
  const c = collectionOf(e.kind);
  if (c && e.item && c !== "routing" && c !== "settings") { const o = rec[c][e.item]; if (o) return f(o, "title") || f(o, "label") || e.item; }
  if (e.kind === "artifact" && e.item) { const v = [...events].reverse().find((x) => x.item === e.item && x.kind === "artifact")?.value as { title?: string } | undefined; return v?.title ?? e.item; }
  if (c === "settings") return "a setting";
  return e.item ?? e.kind;
};
/** the waiting-to-send card: how many, on which things, and why when the cloud is away (pure but for the port's reads) */
export function waitingCard(p: Port, project: string, away = ""): WaitingCard {
  const w = p.waiting(project), rec = p.record(project), events = p.events(project);
  const seen = new Map<string, { id: string; title: string; kind: string }>();
  for (const e of w) { const k = e.item ?? e.id; if (!seen.has(k)) seen.set(k, { id: k, title: titleIn(rec, e, events), kind: e.kind }); }
  return { count: w.length, things: [...seen.values()].slice(0, 12), away };
}

export type ConflictCard = Conflict & { title: string; kind: string };
/** every conflict of a project with its thing's title, newest first (pure) */
export function conflictCards(rec: Rec): ConflictCard[] {
  return rec.conflicts.filter((c) => c.collection !== "settings" && c.collection !== "routing").map((c) => {
    const o = (rec[c.collection] as Record<string, Obj>)[c.id];
    return { ...c, title: (o && (f(o, "title") || f(o, "label"))) || c.id, kind: KIND_OF[c.collection] };
  }).sort((a, b) => Math.max(...b.versions.map((v) => v.at)) - Math.max(...a.versions.map((v) => v.at)));
}
/** one press on a conflict card: the version kept, written with every version as its base, so the conflict closes and
 *  every version stays on the trail */
export function keepVersion(p: Port, project: string, by: By, o: { collection: Collection; id: string; field: string; event: string }): Ev {
  const c = p.record(project).conflicts.find((x) => x.collection === o.collection && x.id === o.id && x.field === o.field);
  if (!c) throw new Error("that conflict is settled already");
  const v = c.versions.find((x) => x.event === o.event);
  if (!v) throw new Error("no such version");
  return p.append({ project, by, kind: KIND_OF[o.collection], item: o.id, field: o.field, value: v.value, base: c.versions.map((x) => x.event).sort() });
}

// ---------- my devices: a key per machine, under my one key ----------
export const MACHINE = "machine";
export type Device = { name: string; key: string; here: boolean; vouched: boolean; answers: boolean; seen: number; note?: string };
/** a machine of mine vouched for here: its key signed under my person key, one event on the trail */
export function certify(p: Port, project: string, by: By, name: string, pub: string, note = ""): Ev {
  if (!NAME.test(name)) throw new Error("a machine's name is short and lower case, as its host's first label");
  if (!/^[A-Za-z0-9_-]{43}$/.test(pub)) throw new Error("that is not a machine key (43 characters, as `sol key` prints it)");
  if (name === p.machine) throw new Error("that is this machine; its key is vouched for already");
  const cert = p.certify(by.person, name, pub);
  return p.append({ project, by, kind: MACHINE, item: `${by.person.toLowerCase()}:${name}`, value: { name, pub, cert, ...(note ? { note: note.slice(0, 80) } : {}) } });
}
/** my machines: this one, the ones vouched for on the trail, and any that signed an event as me (pure but for the port's keys) */
export function devices(p: Port, project: string, login: string): Device[] {
  const rec = p.record(project), events = p.events(project);
  const answers = String(rec.settings.me[login.toLowerCase()]?.answers ?? p.machine);
  const out = new Map<string, Device>();
  const here = p.machine0(login);
  out.set(p.machine, { name: p.machine, key: p.writer(here.pub).slice(0, 4), here: true, vouched: p.certOk(here.cert), answers: answers === p.machine, seen: 0 });
  for (const e of events) {
    if (!same(e.by.person, login)) continue;
    if (e.kind === MACHINE && isObj(e.value)) {
      const v = e.value as { name?: string; pub?: string; cert?: unknown; note?: string };
      if (!v.name || !v.pub || v.name === p.machine) continue;
      const ok = p.certOk(v.cert) && (v.cert as { pub: string }).pub === v.pub && same((v.cert as { person: string }).person, login);
      out.set(v.name, { ...(out.get(v.name) ?? { seen: 0 }), name: v.name, key: p.writer(v.pub).slice(0, 4), here: false, vouched: ok, answers: answers === v.name, ...(v.note ? { note: v.note } : {}) });
    } else if (e.by.machine && !e.by.agent) {
      const d = out.get(e.by.machine);
      if (d) d.seen = Math.max(d.seen, e.at);
      else out.set(e.by.machine, { name: e.by.machine, key: e.key ? p.writer(e.key).slice(0, 4) : "", here: false, vouched: !!e.cert && p.certOk(e.cert), answers: answers === e.by.machine, seen: e.at });
    }
  }
  return [...out.values()].sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name));
}
/** which of my machines answers for me (the one the notch and asks go to), one me-layer event */
export function setAnswers(p: Port, project: string, by: By, name: string): Ev {
  if (!NAME.test(name)) throw new Error("which machine?");
  return p.append({ project, by, kind: KIND_OF.settings, item: `me:${by.person.toLowerCase()}`, field: "answers", value: name });
}
