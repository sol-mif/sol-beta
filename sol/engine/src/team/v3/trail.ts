// Cowork v3's trail (fr-30, slice 0; the PRD "What a Sol user does and sees" 1, the design brief "The trail"). Every
// write in a project is one event: who (a person, on which machine, or whose agent), what (kind, item, field, value),
// when, where (the project), signed with the writer's Ed25519 key and hash-chained per writer.
// The shape decided here, which cannot change once a chain is anchored:
// - body = { v (2), project, by, kind, item?, field?, fields?, base?, hash, at, prev, key, cert? }, written as canonical JSON
//   (keys sorted, no spaces). id = SHA-256 of that text, so an event names itself; sig = the key's signature of it.
// - hash = SHA-256 of the value's canonical JSON: the event points at its content and the signature covers the pointer,
//   never the content. Erasing drops `value`, keeps `hash`, sets `erased`, and the chain still verifies.
// - prev = the id of the same key's previous event in the same project ("" for its first there): one chain per writer
//   per project, so a Sol that holds only one of a writer's projects (a teammate's, pulled from the cloud) verifies
//   every link it is given. A tampered event no longer matches its id or signature and is named; the next event still
//   finds it by id, so only the tampered one is refused. That is version 2. Version 1 (written from 2026-10-31, the
//   night v3 was built, until this) chained a writer across projects: a v1 event signed before CHAIN_PER_PROJECT whose
//   prev is not here starts its writer's chain in its own project; its id, signature and fork check hold as any other.
// - seq is the store's own order (this Sol's, or the cloud's), never signed.
// - base = the ids of the field's latest versions the writer had seen (record.ts uses it to tell an edit from a
//   conflict); append fills it in.
// The store is one SQLite file (node:sqlite, as the hub's spool and the cloud), `<state>/cowork-v3/trail.db`: events,
// the outbox (sent or waiting to send), the person keys pinned per project, and the cloud cursor per project.
import { createHash } from "node:crypto";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { certOk, verifySig, writerOf, LOGIN, NAME, type By, type Cert, type Keys, type Signer } from "./keys.js";
import { collectionOf, headsOf } from "./record.js";
import { canonical, hashOf } from "../../canonical.js";   // shared with the local log, not a copy
import { erasable, kindError } from "./trail-kinds.js";   // the families whose kinds have rows (way.*); every other kind is checked for its name only

export type { By, Cert } from "./keys.js";
/** what a writer asks to append */
export type Draft = { project: string; by: By; kind: string; item?: string; field?: string; value?: unknown; base?: string[]; at?: number };
/** the signed part of an event */
export type Body = {
  v: 1 | 2; project: string; by: By; kind: string; item?: string; field?: string; fields?: string[]; base?: string[];
  hash: string; at: number; prev: string; key: string; cert?: Cert;
};
/** one event of the trail. `notUnderstood`: kept, but this Sol cannot read it as its kind (a kind of a checked family
 *  with no row here, a value that does not fit its row, an erased fact: trail-kinds.ts). Worked out each time the event
 *  is read, never stored, signed or sent, and only on what a raw read or check() gives apart: a way reader reads
 *  check().ok, which never holds one */
export type TrailEvent = Body & { seq: number; id: string; sig: string; value?: unknown; erased?: true; notUnderstood?: string };
/** an event refused, and why, in one line */
export type Bad = { id: string; why: "unreadable" | "shape" | "id" | "signature" | "key" | "person key" | "content" | "kind" | "chain" | "fork"; line: string };
/** ok: the events that verify and are understood. bad: the refused, and the not understood, each named with one line.
 *  notUnderstood: those last, signed and chained as they should be, so they are kept and the chain goes on through
 *  them, each with its line as `notUnderstood` (a newer Sol's kind, the format's §7: what is not understood does not
 *  pass, and a teammate's later events are still taken) */
export type Verified = { ok: TrailEvent[]; bad: Bad[]; notUnderstood: TrailEvent[] };

export const VALUE_MAX = 64 * 1024;
/** from this moment every chain is per writer per project; an event signed in the days before it (from the night v3 was
 *  built, ACROSS_FROM) may still point across projects. Nothing was signed before that: no older event is let through */
export const CHAIN_PER_PROJECT = Date.UTC(2026, 10, 3);
export const ACROSS_FROM = Date.UTC(2026, 9, 31);
/** whether a version 1 event signed at `at` may name a previous event of another project (pure) */
export const mayPointAcross = (at: number): boolean => at >= ACROSS_FROM && at < CHAIN_PER_PROJECT;
export const PROJECT = /^[A-Za-z0-9][\w.-]{0,79}$/;
const KIND = /^[a-z][a-z0-9.-]{0,39}$/;
const ID = /^[\w.:-]{1,120}$/;
const HEX = /^[0-9a-f]{64}$/;

// canonical() (JSON with every object's keys sorted and nothing undefined: the one way an event is written) and hashOf()
// (the content pointer of a value; no value at all is ""): one function each, shared with the local log (log.ts), so
// they live outside team/v3 and are exported from here as they always were
export { canonical, hashOf };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const BODY_KEYS = ["v", "project", "by", "kind", "item", "field", "fields", "base", "hash", "at", "prev", "key", "cert"] as const;
/** the signed part of an event, as it was signed (pure) */
export function bodyOf(e: Partial<TrailEvent>): Body {
  const b: Record<string, unknown> = {};
  for (const k of BODY_KEYS) if (e[k] !== undefined) b[k] = e[k];
  return b as Body;
}
/** an event's id: the SHA-256 of its body's canonical text (pure) */
export const eventId = (b: Body): string => sha(canonical(bodyOf(b)));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const plainBy = (b: unknown): By | null => {
  if (!isObj(b) || !LOGIN.test(String(b.person))) return null;
  if (b.machine !== undefined && !NAME.test(String(b.machine))) return null;
  if (b.agent !== undefined && !NAME.test(String(b.agent))) return null;
  return { person: String(b.person), ...(b.machine !== undefined ? { machine: String(b.machine) } : {}), ...(b.agent !== undefined ? { agent: String(b.agent) } : {}) };
};

/** the reason an event is not whole, or "" (pure): its fields' types, never its signature */
function shapeError(e: Record<string, unknown>): string {
  if (e.v !== 1 && e.v !== 2) return "not a version 1 or 2 event";
  if (typeof e.project !== "string" || !PROJECT.test(e.project)) return "no project";
  if (!plainBy(e.by)) return "no writer";
  if (typeof e.kind !== "string" || !KIND.test(e.kind)) return "no kind";
  if (e.item !== undefined && (typeof e.item !== "string" || !ID.test(e.item))) return "a bad item id";
  if (e.field !== undefined && (typeof e.field !== "string" || !ID.test(e.field))) return "a bad field";
  if (e.fields !== undefined && (!Array.isArray(e.fields) || !e.fields.every((f) => typeof f === "string" && ID.test(f)))) return "bad fields";
  if (e.base !== undefined && (!Array.isArray(e.base) || !e.base.every((x) => typeof x === "string" && HEX.test(x)))) return "a bad base";
  if (typeof e.hash !== "string" || !(e.hash === "" || HEX.test(e.hash))) return "no content hash";
  if (typeof e.at !== "number" || !Number.isFinite(e.at)) return "no time";
  if (typeof e.prev !== "string" || !(e.prev === "" || HEX.test(e.prev))) return "no previous";
  if (typeof e.key !== "string" || !e.key) return "no key";
  if (typeof e.id !== "string" || !HEX.test(e.id)) return "no id";
  if (typeof e.sig !== "string") return "no signature";
  if (e.erased !== undefined && e.erased !== true) return "a bad erased mark";
  return "";
}

const at = (e: TrailEvent) => [e.at, e.key, e.id] as const;
/** the trail's own order: time, then writer, then id (pure) */
export const order = (a: TrailEvent, b: TrailEvent): number => {
  const x = at(a), y = at(b);
  return x[0] !== y[0] ? x[0] - y[0] : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0;
};

export type VerifyOpts = {
  /** an event already verified (the store's, the cloud's): its key, or null when unknown */
  known?: (id: string) => { key: string } | null;
  /** another known event with this key and this prev in this project, which makes a fork */
  taken?: (key: string, prev: string, project: string) => string | null;
  /** the person key pinned for a person in a project, or null */
  pinned?: (project: string, person: string) => string | null;
  /** links only through events that verified (a merge: nothing is kept after a refused one); without it a tampered
   *  event in the middle of a chain is named alone and the events after it still verify (a check of what is kept) */
  strict?: boolean;
  /** events whose signature and certificate were checked already, as `id \n sig` (way-reader.ts, the fold cache): its id
   *  is still worked out again, so its body is the one checked, and the rest still checks it; only those two signatures
   *  are not checked again. One that passes is added */
  signed?: { has(k: string): boolean; add(k: string): void };
};

/** each event checked, the good ones kept and the others named with one line: a body that is not its id, a signature
 *  that is not its key's, a key its person did not sign, a person key other than the one pinned, a value that is not
 *  its hash, a previous event that is not there, or a second event on the same previous (a fork). One that passes all
 *  of those but is a kind of a checked family (trail-kinds.ts) with no row here, or a value that does not fit it, is
 *  named too ("kind") and given back apart, marked, to be kept: never among the good ones. The good ones are
 *  given back in the trail's order, so the rest still fold (pure but for what opts read) */
export function verify(events: unknown[], o: VerifyOpts = {}): Verified {
  const bad: Bad[] = [], good: TrailEvent[] = [];
  const name = (id: unknown, why: Bad["why"], line: string) => bad.push({ id: typeof id === "string" ? id : "", why, line });
  const present = new Map<string, string>();   // id → key, of every readable event in the batch
  const read: TrailEvent[] = [];
  for (const raw of events) {
    if (!isObj(raw)) { name("", "unreadable", "an event that is not an object"); continue; }
    const s = shapeError(raw);
    if (s) { name(raw.id, "shape", s); continue; }
    const { notUnderstood: _mark, ...e } = raw as unknown as TrailEvent;   // the mark is this Sol's own: whatever came with it is dropped, and it is made again below
    present.set(e.id, e.key);
    read.push(e);
  }
  const pins = new Map<string, string>();
  for (const e of [...read].sort(order)) {
    const body = bodyOf(e);
    if (eventId(body) !== e.id) { name(e.id, "id", "its words are not the ones it was written with"); continue; }
    // the id is the SHA-256 of the body (checked just above), so an id and a signature seen before name the same words,
    // key and certificate: what they gave then they give now
    const mk = o.signed ? `${e.id}\n${e.sig}` : "", sure = o.signed?.has(mk) === true;
    if (!sure && !verifySig(e.key, canonical(body), e.sig)) { name(e.id, "signature", "its signature is not its writer's"); continue; }
    const by = e.by;
    const want = by.agent ? { kind: "agent", name: by.agent } : by.machine !== undefined ? { kind: "machine", name: by.machine } : null;
    if (want) {
      if (!e.cert || !(sure || certOk(e.cert)) || e.cert.pub !== e.key || e.cert.person !== by.person || e.cert.kind !== want.kind || e.cert.name !== want.name) { name(e.id, "key", `its key is not one ${by.person} signed for that ${want.kind}`); continue; }
    } else if (e.cert !== undefined) { name(e.id, "key", "a person key carries no certificate"); continue; }
    if (o.signed && !sure) o.signed.add(mk);
    const pkey = e.cert?.pkey ?? e.key, pk = `${e.project}\n${by.person.toLowerCase()}`;
    const pin = pins.get(pk) ?? o.pinned?.(e.project, by.person) ?? null;
    if (pin && pin !== pkey) { name(e.id, "person key", `signed under a person key that is not ${by.person}'s`); continue; }
    if (!pin) pins.set(pk, pkey);
    if (e.erased) { if (e.value !== undefined) { name(e.id, "content", "erased but still holding its content"); continue; } }
    else if (hashOf(e.value) !== e.hash) { name(e.id, "content", "its content is not the content it points at"); continue; }
    const k = kindError(e.kind, e.value, e.erased === true);
    good.push(k ? { ...e, notUnderstood: k } : e);
  }
  // the chains, per writer per project: each event's previous is there with the same key; one event a previous. An
  // event of version 1 from before CHAIN_PER_PROJECT whose previous is nowhere here pointed into another project: its
  // chain starts. A merge (strict) links only through events that verified
  const ok: TrailEvent[] = [], odd: TrailEvent[] = [], next = new Map<string, string>(), linked = o.strict ? new Map<string, string>() : present;
  // a writer's events in one millisecond tie on time and key, and their ids sort at random: each event is taken after
  // the one before it in its own chain (when that one is in the batch), so a chain is never judged out of its order
  const inBatch = new Map(good.map((e) => [e.id, e])), placed = new Set<string>(), chained: TrailEvent[] = [];
  for (const e of good) {
    const run: TrailEvent[] = [];
    for (let x: TrailEvent | undefined = e; x && !placed.has(x.id); x = x.prev ? inBatch.get(x.prev) : undefined) {
      if (x.key !== e.key) break;
      placed.add(x.id); run.push(x);
    }
    chained.push(...run.reverse());
  }
  for (const e of chained) {
    if (e.prev) {
      const k = linked.get(e.prev) ?? o.known?.(e.prev)?.key;
      const across = k === undefined && e.v === 1 && mayPointAcross(e.at);
      if (k !== e.key && !across) { name(e.id, "chain", "the event before it, by the same writer, is missing"); continue; }
    }
    const link = `${e.project}\n${e.key}\n${e.prev}`, other = next.get(link) ?? o.taken?.(e.key, e.prev, e.project) ?? null;
    if (other && other !== e.id) { name(e.id, "fork", "its writer already wrote another event after the same one"); continue; }
    next.set(link, e.id);
    if (o.strict) linked.set(e.id, e.key);
    if (e.notUnderstood) { name(e.id, "kind", e.notUnderstood); odd.push(e); continue; }
    ok.push(e);
  }
  ok.sort(order);
  odd.sort(order);
  return { ok, bad, notUnderstood: odd };
}

/** the kind of an erase event, whose `item` names the event whose content it erases */
export const ERASE = "erase";

type Row = { seq: number; id: string; body: string };
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS event (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL,
    key TEXT NOT NULL, prev TEXT NOT NULL, kind TEXT NOT NULL, item TEXT, at INTEGER NOT NULL, body TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0, refused TEXT);
  CREATE INDEX IF NOT EXISTS event_project ON event (project, seq);
  CREATE INDEX IF NOT EXISTS event_key ON event (key, seq);
  CREATE INDEX IF NOT EXISTS event_chain ON event (project, key, seq);
  CREATE INDEX IF NOT EXISTS event_item ON event (project, item);
  CREATE INDEX IF NOT EXISTS event_out ON event (project, sent);
  CREATE TABLE IF NOT EXISTS pin (project TEXT NOT NULL, person TEXT NOT NULL, pkey TEXT NOT NULL, PRIMARY KEY (project, person));
  CREATE TABLE IF NOT EXISTS cursor (project TEXT PRIMARY KEY, seq INTEGER NOT NULL);`;

/** an event as it is kept: the whole event but its seq */
const keep = (e: TrailEvent): string => { const { seq: _s, notUnderstood: _n, ...rest } = e; return canonical(rest); };   // never the mark: it is worked out on read

/** the trail of every project on this Sol */
export class Trail {
  private db: DatabaseSync;
  private q: Record<"add" | "byId" | "since" | "head" | "taken" | "pin" | "pinSet" | "item" | "out" | "sent" | "refuse" | "body" | "cur" | "curSet", StatementSync>;
  private now: () => number;
  private keys?: Keys;

  /** file: the database (":memory:" in tests); keys: the people's keys, to append (a reader needs none) */
  constructor(o: { file: string; keys?: Keys; now?: () => number }) {
    if (o.file !== ":memory:") mkdirSync(dirname(o.file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(o.file);
    if (o.file !== ":memory:") try { chmodSync(o.file, 0o600); } catch { /* its folder is private */ }
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
    this.db.exec(SCHEMA);
    this.now = o.now ?? Date.now;
    if (o.keys) this.keys = o.keys;
    const p = (s: string) => this.db.prepare(s);
    this.q = {
      add: p("INSERT OR IGNORE INTO event (id, project, key, prev, kind, item, at, body, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
      byId: p("SELECT seq, id, body FROM event WHERE id = ?"),
      since: p("SELECT seq, id, body FROM event WHERE project = ? AND seq > ? ORDER BY seq LIMIT ?"),
      head: p("SELECT id, at FROM event WHERE project = ? AND key = ? ORDER BY seq DESC LIMIT 1"),
      taken: p("SELECT id FROM event WHERE project = ? AND key = ? AND prev = ? LIMIT 1"),
      pin: p("SELECT pkey FROM pin WHERE project = ? AND person = ?"),
      pinSet: p("INSERT OR IGNORE INTO pin (project, person, pkey) VALUES (?, ?, ?)"),
      item: p("SELECT seq, id, body FROM event WHERE project = ? AND item = ? ORDER BY seq"),
      out: p("SELECT seq, id, body FROM event WHERE project = ? AND sent = 0 AND refused IS NULL ORDER BY seq LIMIT ?"),
      sent: p("UPDATE event SET sent = 1, refused = NULL WHERE id = ?"),
      refuse: p("UPDATE event SET refused = ? WHERE id = ?"),
      body: p("UPDATE event SET body = ? WHERE id = ?"),
      cur: p("SELECT seq FROM cursor WHERE project = ?"),
      curSet: p("INSERT INTO cursor (project, seq) VALUES (?, ?) ON CONFLICT (project) DO UPDATE SET seq = excluded.seq"),
    };
  }

  private parse(r: Row): TrailEvent | null {
    try {
      const e = JSON.parse(r.body);
      if (!isObj(e)) return null;
      const { notUnderstood: _n, ...ev } = e as TrailEvent;   // a mark an older build of this file stored is not read
      return { ...ev, seq: Number(r.seq) };
    } catch { return null; }
  }
  /** an event as it is handed out: marked when this Sol does not understand it now (trail-kinds.ts) */
  private read(e: TrailEvent): TrailEvent { const k = kindError(e.kind, e.value, e.erased === true); return k ? { ...e, notUnderstood: k } : e; }
  private rows(rs: unknown[]): TrailEvent[] { return (rs as Row[]).flatMap((r) => { const e = this.parse(r); return e ? [e] : []; }); }
  private opts(): VerifyOpts {
    return {
      known: (id) => { const r = this.q.byId.get(id) as Row | undefined; const e = r && this.parse(r); return e ? { key: e.key } : null; },
      taken: (key, prev, project) => (this.q.taken.get(project, key, prev) as { id: string } | undefined)?.id ?? null,
      pinned: (project, person) => (this.q.pin.get(project, person.toLowerCase()) as { pkey: string } | undefined)?.pkey ?? null,
    };
  }
  private put(e: TrailEvent, sent: boolean): boolean {
    const added = Number(this.q.add.run(e.id, e.project, e.key, e.prev, e.kind, e.item ?? null, e.at, keep(e), sent ? 1 : 0).changes) > 0;
    if (added) {
      this.q.pinSet.run(e.project, e.by.person.toLowerCase(), e.cert?.pkey ?? e.key);
      if (e.kind === ERASE && e.item) this.eraseNow(e.item, e.by.person);
    }
    return added;
  }

  /** one write, signed with its writer's key (the agent's, this machine's or the person's) and chained after that key's
   *  last event in the same project. A field write's base is the field's latest versions here, unless the draft names its own */
  append(d: Draft): TrailEvent {
    if (!this.keys) throw new Error("this trail was opened to read only");
    const by = plainBy(d.by);
    if (!by) throw new Error("who wrote it? a person's login, and a machine or agent name");
    const signer: Signer = this.keys.signerFor(by);
    if (d.value !== undefined && Buffer.byteLength(canonical(d.value)) > VALUE_MAX) throw new Error("an event's content is 64 KB at most");
    const k = kindError(d.kind, d.value);
    if (k) throw new Error(`the team trail takes no such event: ${k}`);
    if (d.item !== undefined && d.field === undefined && d.value !== undefined && !isObj(d.value)) throw new Error("a write to an item names its field, or gives an object of fields");
    const fields = d.field === undefined && isObj(d.value) ? Object.keys(d.value).filter((k) => (d.value as Record<string, unknown>)[k] !== undefined).sort() : undefined;
    const head = this.q.head.get(d.project, signer.pub) as { id: string; at: number } | undefined;
    const t = Math.max(Math.floor(d.at ?? this.now()), head?.at ?? 0);   // a writer's clock never runs back along its chain
    let base = d.base;
    if (!base && d.item && collectionOf(d.kind)) {
      const past = this.rows(this.q.item.all(d.project, d.item) as unknown[]);
      const names = d.field !== undefined ? [d.field] : fields ?? [];
      base = [...new Set(names.flatMap((f) => headsOf(past, collectionOf(d.kind)!, d.item!, f).map((e) => e.id)))].sort();
    }
    const body = bodyOf({
      v: 2, project: d.project, by, kind: d.kind, item: d.item, field: d.field, ...(fields?.length ? { fields } : {}),
      ...(base?.length ? { base } : {}), hash: hashOf(d.value), at: t, prev: head?.id ?? "", key: signer.pub, ...(signer.cert ? { cert: signer.cert } : {}),
    });
    const s = shapeError({ ...body, id: "0".repeat(64), sig: "" });
    if (s) throw new Error(`that is not an event: ${s}`);
    const id = eventId(body);
    const e: TrailEvent = { ...body, seq: 0, id, sig: signer.sign(canonical(body)), ...(d.value !== undefined ? { value: d.value } : {}) };
    this.put(e, false);
    return this.get(id)!;
  }

  /** events from elsewhere (the cloud, another Sol) checked against what is here and kept; the refused named. One that
   *  is signed and chained but not understood (verify's notUnderstood) is kept too, unmarked on the disk, so its writer's later
   *  events chain through it; it is named in `bad` this once and is not among `added` */
  merge(events: unknown[], o: { sent?: boolean } = {}): { added: TrailEvent[]; already: number; bad: Bad[] } {
    const fresh = events.filter((e) => !(isObj(e) && typeof e.id === "string" && this.q.byId.get(e.id)));
    const v = verify(fresh, { ...this.opts(), strict: true });
    const added: TrailEvent[] = [];
    this.db.exec("BEGIN");
    try {
      for (const e of [...v.ok, ...v.notUnderstood].sort(order)) if (this.put({ ...e, seq: 0 }, o.sent !== false) && !e.notUnderstood) added.push(this.get(e.id)!);   // in the trail's order, as before; the mark is not stored
      this.db.exec("COMMIT");
    }
    catch (err) { this.db.exec("ROLLBACK"); throw err; }
    return { added, already: events.length - fresh.length, bad: v.bad };
  }

  /** one event, or null */
  // What the trail hands out (get, since, waiting) is what this Sol understands now: a kept event of a checked family it
  // does not understand (trail-kinds.ts) is left out, unless the read asks for `raw`, and then it carries its
  // `notUnderstood` line, worked out now. A reader of way events folds check().ok, never since()
  /** one event, or null (or one this Sol does not understand, unless raw) */
  get(id: string, o: { raw?: boolean } = {}): TrailEvent | null {
    const r = this.q.byId.get(id) as Row | undefined, e = r ? this.parse(r) : null;
    if (!e) return null;
    const x = this.read(e);
    return x.notUnderstood && !o.raw ? null : x;
  }
  /** a project's events after seq (this Sol's order), at most limit */
  since(project: string, seq = 0, limit = 10_000, o: { raw?: boolean } = {}): TrailEvent[] {
    const out: TrailEvent[] = [];
    for (let from = seq; ;) {
      const rs = this.q.since.all(project, from, limit) as Row[];
      let left = 0;
      for (const r of rs) { const e = this.parse(r); if (!e) continue; const x = this.read(e); if (x.notUnderstood && !o.raw) left++; else out.push(x); }
      // a page short by the events left out is filled from after it, so a reader paging by `limit` misses nothing
      if (!left || rs.length < limit || out.length >= limit) return out.slice(0, limit);
      from = Number(rs[rs.length - 1].seq);
    }
  }
  /** a project's whole trail as kept here, checked again: what was changed on the disk is named, the rest given back.
   *  An event kept but not understood is given back apart (notUnderstood), not named again: it was named when it came */
  check(project: string): Verified {
    const rows = this.db.prepare("SELECT seq, id, body, key FROM event WHERE project = ? ORDER BY seq").all(project) as (Row & { key: string })[];
    const out: unknown[] = [], bad: Bad[] = [];
    for (const r of rows) { const e = this.parse(r); if (e) out.push(e); else bad.push({ id: r.id, why: "unreadable", line: "its row on the disk is not an event any more" }); }
    const keys = new Map(rows.map((r) => [r.id, r.key]));   // the columns, so an event after an unreadable row still finds it
    // an event from before the chains were per project may point into another project: looked up in the whole store
    const elsewhere = (id: string) => { const r = this.db.prepare("SELECT key FROM event WHERE id = ?").get(id) as { key: string } | undefined; return r ? { key: r.key } : null; };
    const v = verify(out, { pinned: this.opts().pinned, known: (id) => (keys.has(id) ? { key: keys.get(id)! } : elsewhere(id)) });
    return { ok: v.ok, bad: [...bad, ...v.bad.filter((b) => b.why !== "kind")], notUnderstood: v.notUnderstood };
  }

  /** an event's content replaced by its hash, here; with `by` (the content's own person) an erase event goes on the trail
   *  too, so every Sol and the cloud erase it. False when there is no such event or it is not theirs to erase */
  erase(id: string, by?: By): boolean {
    const e = this.get(id, { raw: true });
    if (!e || !erasable(e.kind) || (by && by.person.toLowerCase() !== e.by.person.toLowerCase())) return false;   // a way fact is never erased
    if (by) { this.append({ project: e.project, by, kind: ERASE, item: id }); return true; }
    return this.eraseNow(id, e.by.person);
  }
  private eraseNow(id: string, person: string): boolean {
    const e = this.get(id, { raw: true });
    if (!e || !erasable(e.kind) || e.by.person.toLowerCase() !== person.toLowerCase()) return false;   // an erase event from elsewhere that names a way fact erases nothing
    if (e.erased) return true;
    const { value: _v, notUnderstood: _n, ...rest } = e;
    this.q.body.run(keep({ ...rest, erased: true }), id);
    return true;
  }

  /** a project's events still waiting to send, oldest first */
  waiting(project: string, limit = 500): TrailEvent[] { return this.rows(this.q.out.all(project, limit) as unknown[]).map((e) => this.read(e)).filter((e) => !e.notUnderstood); }
  /** whether one event is still waiting to send */
  isWaiting(id: string): boolean { const r = this.db.prepare("SELECT sent, refused FROM event WHERE id = ?").get(id) as { sent: number; refused: string | null } | undefined; return !!r && !r.sent && !r.refused && !!this.get(id); }
  /** events the cloud kept */
  markSent(ids: string[]): void { for (const id of ids) this.q.sent.run(id); }
  /** an event the cloud refused, with its line (it stops being sent) */
  markRefused(id: string, why: string): void { this.q.refuse.run(why.slice(0, 200), id); }
  /** the cloud's seq this Sol has read a project up to */
  cursor(project: string): number { return Number((this.q.cur.get(project) as { seq: number } | undefined)?.seq ?? 0); }
  setCursor(project: string, seq: number): void { this.q.curSet.run(project, Math.max(0, Math.floor(seq))); }
  /** the projects with a trail here */
  projects(): string[] { return (this.db.prepare("SELECT DISTINCT project FROM event ORDER BY project").all() as { project: string }[]).map((r) => r.project); }
  close(): void { try { this.db.close(); } catch { /* closed */ } }
  /** the raw database, for tests that tamper with it */
  get raw(): DatabaseSync { return this.db; }
}

export { writerOf };
