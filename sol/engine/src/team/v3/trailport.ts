// Cowork v3, slice 7 (fr-30, #560): the one door from artifacts, search and the floor to slice 0's trail. Everything
// slice 7 writes goes through `append`, everything it reads through `events` and `record`, so when slice 0 (#553,
// team/v3/index.ts, trail.ts, record.ts, keys.ts) is on the branch this is the one file that changes.
// openPort() is slice 0's trail and keys (through door.ts). The stand-in below is the tests': the same event shape
// (id, seq, by, kind, item, field, value, at, base) and the same fold rule (heads by base, latest wins, two heads with
// different values are a conflict, every version kept), signing nothing.
import { createHash, generateKeyPairSync, randomUUID, sign as edSign, verify as edVerify, createPublicKey, createPrivateKey, type KeyObject } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

export type By = { person: string; machine?: string; agent?: string };
export type Draft = { project: string; by: By; kind: string; item?: string; field?: string; value?: unknown; base?: string[]; at?: number };
export type Ev = {
  id: string; seq: number; project: string; by: By; kind: string; item?: string; field?: string; fields?: string[];
  base?: string[]; value?: unknown; at: number; erased?: true; key?: string; cert?: Cert;
};
export type Collection = "items" | "loose" | "members" | "places" | "routing" | "settings";
export type Obj = { id: string; by: By; at: number; updated: number; fields: Record<string, unknown>; conflicts?: string[]; waiting?: true };
export type Version = { event: string; by: By; at: number; value: unknown };
export type Conflict = { collection: Collection; id: string; field: string; versions: Version[]; shown: string };
export type Rec = {
  items: Record<string, Obj>; loose: Record<string, Obj>; members: Record<string, Obj>; places: Record<string, Obj>;
  routing: Record<string, string>; settings: { team: Record<string, unknown>; project: Record<string, unknown>; me: Record<string, Record<string, unknown>> };
  conflicts: Conflict[];
};
/** a machine's key vouched for by its person's key (slice 0's keys.ts Cert) */
export type Cert = { person: string; pkey: string; kind: "machine" | "agent"; name: string; pub: string; sig: string };

/** what slice 7 needs of the trail and the keys */
export type Port = {
  /** "slice0" when slice 0's signed trail is here, "stand-in" before it is merged */
  kind: "slice0" | "stand-in";
  append(d: Draft): Ev;
  /** a project's whole trail, checked, in the trail's order */
  events(project: string): Ev[];
  record(project: string): Rec;
  projects(): string[];
  /** a project's events still waiting to send */
  waiting(project: string): Ev[];
  /** this Sol's machine name */
  machine: string;
  /** the person's key and this machine's key under it */
  personPub(login: string): string;
  machine0(login: string): { pub: string; cert: Cert };
  /** a key of another machine signed under the person's key here */
  certify(login: string, name: string, pub: string): Cert;
  certOk(c: unknown): c is Cert;
  writer(pub: string): string;
};

export const KIND_OF: Record<Collection, string> = { items: "item", loose: "loose", members: "member", places: "place", routing: "route", settings: "setting" };
const COLL: Record<string, Collection> = Object.fromEntries(Object.entries(KIND_OF).map(([c, k]) => [k, c as Collection]));
export const collectionOf = (kind: string): Collection | null => COLL[kind] ?? null;
export const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const LOGIN = /^[A-Za-z0-9-]{1,39}$/;

/** this machine's name as a key's name (the same rule as slice 0's keys.ts machineName) */
export function machineName(h = hostname()): string {
  const n = h.split(".")[0].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return NAME.test(n) ? n : "this-machine";
}

/** JSON with sorted keys (slice 0's canonical) */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
/** the trail's order: time, then writer, then id */
export const order = (a: Ev, b: Ev): number => a.at - b.at || cmp(a.key ?? a.by.person, b.key ?? b.by.person) || cmp(a.id, b.id);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- the stand-in's fold: slice 0's rule (record.ts), kept small ----------
type Write = { e: Ev; field: string; value: unknown };
const writesOf = (e: Ev): Write[] => {
  if (!e.item || !collectionOf(e.kind)) return [];
  if (e.field !== undefined) return [{ e, field: e.field, value: e.erased ? null : e.value ?? null }];
  const v = isObj(e.value) ? e.value : {};
  return (e.fields ?? Object.keys(v)).map((f) => ({ e, field: f, value: e.erased ? null : v[f] ?? null }));
};
const headWrites = (ws: Write[]) => { const seen = new Set(ws.flatMap((w) => w.e.base ?? [])); return ws.filter((w) => !seen.has(w.e.id)).sort((a, b) => order(a.e, b.e)); };
export function standInFold(events: Ev[], waiting: (id: string) => boolean = () => false): Rec {
  const r: Rec = { items: {}, loose: {}, members: {}, places: {}, routing: {}, settings: { team: {}, project: {}, me: {} }, conflicts: [] };
  const objs = new Map<string, { c: Collection; obj: Obj; fields: Map<string, Write[]> }>();
  for (const e of [...events].sort(order)) {
    const c = collectionOf(e.kind);
    if (!c || !e.item) continue;
    const k = `${c}\n${e.item}`;
    let o = objs.get(k);
    if (!o) { o = { c, obj: { id: e.item, by: e.by, at: e.at, updated: e.at, fields: {} }, fields: new Map() }; objs.set(k, o); }
    o.obj.updated = Math.max(o.obj.updated, e.at);
    if (waiting(e.id)) o.obj.waiting = true;
    for (const w of writesOf(e)) { const l = o.fields.get(w.field) ?? []; l.push(w); o.fields.set(w.field, l); }
  }
  for (const { c, obj, fields } of objs.values()) {
    for (const [field, ws] of fields) {
      const heads = headWrites(ws), win = heads[heads.length - 1];
      obj.fields[field] = win.value;
      if (new Set(heads.map((w) => canonical(w.value))).size > 1) {
        (obj.conflicts ??= []).push(field);
        r.conflicts.push({ collection: c, id: obj.id, field, shown: win.e.id, versions: heads.map((w) => ({ event: w.e.id, by: w.e.by, at: w.e.at, value: w.value })) });
      }
    }
    if (c === "routing") { if (typeof obj.fields.place === "string") r.routing[obj.id] = obj.fields.place; continue; }
    if (c === "settings") {
      if (obj.id === "team" || obj.id === "project") r.settings[obj.id] = { ...obj.fields };
      else if (obj.id.startsWith("me:")) r.settings.me[obj.id.slice(3).toLowerCase()] = { ...obj.fields };
      continue;
    }
    r[c][obj.id] = obj;
  }
  return r;
}

// ---------- the stand-in's keys: Ed25519 as slice 0's, the same certificate bytes ----------
const pubOf = (k: KeyObject): string => String((k.export({ format: "jwk" }) as { x?: string }).x ?? "");
const keyOf = (pub: string): KeyObject => createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pub }, format: "jwk" });
export const writerOf = (pub: string): string => createHash("sha256").update(pub).digest("hex").slice(0, 16);
export const certBytes = (c: Omit<Cert, "sig">): string => JSON.stringify([1, "sol-cowork-cert", c.person, c.pkey, c.kind, c.name, c.pub]);
const verifySig = (pub: string, data: string, sig: string) => { try { return edVerify(null, Buffer.from(data), keyOf(pub), Buffer.from(sig, "base64url")); } catch { return false; } };
export function standInCertOk(c: unknown): c is Cert {
  if (!isObj(c)) return false;
  const x = c as Cert;
  return LOGIN.test(String(x.person)) && (x.kind === "machine" || x.kind === "agent") && NAME.test(String(x.name))
    && typeof x.pkey === "string" && typeof x.pub === "string" && x.pkey !== x.pub && verifySig(x.pkey, certBytes(x), x.sig);
}

/** the stand-in: events in memory, kept in one JSONL file when `file` is given (":memory:" or none keeps nothing) */
export function standIn(o: { file?: string; machine?: string; now?: () => number } = {}): Port {
  const file = o.file && o.file !== ":memory:" ? o.file : "";
  const now = o.now ?? Date.now;
  const all: (Ev & { sent?: boolean })[] = [];
  if (file && existsSync(file)) for (const l of readFileSync(file, "utf8").split("\n")) { try { if (l) all.push(JSON.parse(l)); } catch { /* a torn last line */ } }
  let seq = all.reduce((m, e) => Math.max(m, e.seq), 0);
  const keys = new Map<string, KeyObject>();
  const keyFile = (name: string) => (file ? join(dirname(file), "stand-in-keys", `${name}.pem`) : "");
  const key = (name: string): KeyObject => {
    const had = keys.get(name); if (had) return had;
    const f = keyFile(name);
    let k: KeyObject;
    if (f && existsSync(f)) k = createPrivateKey(readFileSync(f, "utf8"));
    else { k = generateKeyPairSync("ed25519").privateKey; if (f) { mkdirSync(dirname(f), { recursive: true, mode: 0o700 }); writeFileSync(f, k.export({ format: "pem", type: "pkcs8" }) as string, { mode: 0o600 }); } }
    keys.set(name, k); return k;
  };
  const machine = o.machine ?? machineName();
  const personPub = (login: string) => pubOf(createPublicKey(key(`person.${login.toLowerCase()}`)));
  const certify = (login: string, name: string, pub: string): Cert => {
    if (!LOGIN.test(login) || !NAME.test(name)) throw new Error("a machine key needs a login and a short lower-case name");
    const body = { person: login, pkey: personPub(login), kind: "machine" as const, name, pub };
    return { ...body, sig: edSign(null, Buffer.from(certBytes(body)), key(`person.${login.toLowerCase()}`)).toString("base64url") };
  };
  const of = (project: string) => all.filter((e) => e.project === project).sort(order);
  return {
    kind: "stand-in",
    machine,
    append(d) {
      if (!d.project || !d.by?.person) throw new Error("an event needs a project and a person");
      if (d.value !== undefined && Buffer.byteLength(canonical(d.value)) > 64 * 1024) throw new Error("an event's content is 64 KB at most");
      let base = d.base;
      const c = collectionOf(d.kind);
      if (!base && d.item && c) {
        const past = of(d.project).filter((e) => e.item === d.item && collectionOf(e.kind) === c).flatMap(writesOf);
        const names = d.field !== undefined ? [d.field] : isObj(d.value) ? Object.keys(d.value) : [];
        base = [...new Set(names.flatMap((f) => headWrites(past.filter((w) => w.field === f)).map((w) => w.e.id)))].sort();
      }
      const e: Ev & { sent?: boolean } = {
        id: createHash("sha256").update(randomUUID()).digest("hex"), seq: ++seq, project: d.project, by: { ...d.by }, kind: d.kind,
        ...(d.item !== undefined ? { item: d.item } : {}), ...(d.field !== undefined ? { field: d.field } : {}),
        ...(d.field === undefined && isObj(d.value) ? { fields: Object.keys(d.value).sort() } : {}),
        ...(base?.length ? { base } : {}), ...(d.value !== undefined ? { value: d.value } : {}), at: Math.floor(d.at ?? now()),
      };
      all.push(e);
      if (file) { mkdirSync(dirname(file), { recursive: true, mode: 0o700 }); appendFileSync(file, JSON.stringify(e) + "\n", { mode: 0o600 }); }
      return e;
    },
    events: of,
    record: (project) => standInFold(of(project), (id) => all.some((e) => e.id === id && !e.sent)),
    projects: () => [...new Set(all.map((e) => e.project))].sort(),
    waiting: (project) => of(project).filter((e) => !(e as { sent?: boolean }).sent),
    personPub,
    machine0: (login) => { const pub = pubOf(createPublicKey(key(`machine.${login.toLowerCase()}.${machine}`))); return { pub, cert: certify(login, machine, pub) }; },
    certify,
    certOk: standInCertOk,
    writer: writerOf,
  };
}

// ---------- slice 0's trail, when it is here ----------
type Slice0 = {
  v3: () => { trail: any; keys: any };   // eslint-disable-line @typescript-eslint/no-explicit-any
  fold: (events: unknown[], o?: { waiting?: (id: string) => boolean }) => Rec;
};
type Keys0 = { certBytes: (c: Omit<Cert, "sig">) => string; certOk: (c: unknown) => c is Cert; writerOf: (pub: string) => string };
/** a Port over slice 0's Trail and Keys (record.ts fold, keys.ts certificates) */
export function slice0Port(s: Slice0, k: Keys0): Port {
  const { trail, keys } = s.v3();
  // a project's checked trail, read again only when something new is on it (a check verifies every signature)
  const seen = new Map<string, { seq: number; ok: Ev[] }>();
  const checked = (project: string): Ev[] => {
    const had = seen.get(project);
    const fresh = trail.since(project, had?.seq ?? 0, 1) as Ev[];
    if (had && !fresh.length) return had.ok;
    const ok = trail.check(project).ok as Ev[];
    const top = ok.reduce((m, e) => Math.max(m, e.seq), had?.seq ?? 0), after = trail.since(project, top, 100_000) as Ev[];   // refused rows too
    seen.set(project, { seq: after.length ? after[after.length - 1].seq : top, ok });
    return ok;
  };
  return {
    kind: "slice0",
    machine: keys.machineName,
    append: (d) => trail.append(d),
    events: checked,
    record: (project) => s.fold(checked(project), { waiting: (id: string) => trail.isWaiting(id) }),
    projects: () => trail.projects(),
    waiting: (project) => trail.waiting(project, 100_000),
    personPub: (login) => keys.personKeyOf(login),   // a paired machine: the person key its keys are signed under
    machine0: (login) => { const m = keys.machineKey(login); return { pub: m.pub, cert: m.cert }; },
    certify(login, name, pub) {
      if (!LOGIN.test(login) || !NAME.test(name)) throw new Error("a machine key needs a login and a short lower-case name");
      const p = keys.person(login);
      if (keys.personKeyOf(login) !== p.pub) throw new Error("this machine was paired: vouch from the machine that holds your person key");
      const body = { person: p.person, pkey: p.pub, kind: "machine" as const, name, pub };
      return { ...body, sig: p.sign(k.certBytes(body)) };
    },
    certOk: k.certOk,
    writer: k.writerOf,
  };
}

let opened: Promise<Port> | null = null;
/** this Sol's port, opened once: slice 0's trail and keys, through door.ts (the room id made the project id there) */
export function openPort(): Promise<Port> {
  return opened ??= (async () => {
    const [s, k, d] = await Promise.all([import("./index.js"), import("./keys.js"), import("./door.js")]);
    const { keys } = s.v3();
    return slice0Port({ v3: () => ({ trail: d.door(), keys }), fold: s.fold as unknown as Slice0["fold"] }, k as unknown as Keys0);
  })();
}
/** tests: a port of their own */
export function usePort(p: Port | null): void { opened = p ? Promise.resolve(p) : null; }
