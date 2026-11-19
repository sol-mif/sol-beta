// What the person allowed (#1216): one record, `consent` in the person's record (~/.sol/record/me.json, record.ts),
// written by whichever surface asks and read by every one of them, so nothing asks twice. The default since #1223, with
// the rest of the one onboarding. The engine reads `levels` at each turn's start (sol/engine/src/consent.ts) and refuses
// past a folder's level by name. Its parts:
//   agreed    the ask's answer: "go" or "only what I tell you", when, and which surface asked
//   left      the stops left out (the explorer read none of them)
//   sources   a source by name, "yes" or "no" (#1217): claude-sessions, codex-sessions (the AI tools' session files), ai-setup (#1423),
//             notes, gdrive, github, calendar-store. The explorer reads this before it opens anything: a "no" is never
//             opened, and after "only what I tell you" a source is opened only on its "yes" (explore.mjs `allowed`)
//   off       what the person put off-limits, in their words
//   levels    how hands-on, per folder (an area's id): record · show · draft · do
//   machine   the first run's permissions as last seen: { state, at } per switch (microphone, screen, accessibility,
//             notifications). A permission seen before there is a record waits in this window's storage (PENDING_KEY)
//             and is joined into the record when the onboarding writes it
//   beta      the Beta brief's one tap (#1214, Isaac's branch, not merged): `tellBeta` below is the one place its tap
//             writes into the record; until it lands the tap is kept in settings.track.told only
//   at        when the consent last changed
// Pure but for `machineSeen` (this window's storage and the engine's wire).
import type { Hands, Record as Rec } from "./record";
import type { Permission, PermissionState } from "./permissions";

export type Agreed = { said: "go" | "only what I tell you"; at: string; by: string };
export type Seen = { state: PermissionState; at: string };
export type Said = "yes" | "no";
/** the sources the explorer asks consent for by name */
export const SOURCES = ["claude-sessions", "codex-sessions", "ai-setup", "notes", "gdrive", "github", "calendar-store"] as const;
export type SourceId = (typeof SOURCES)[number];
export type Consent = {
  v: 1; agreed: Agreed | null; left: string[]; off: string[];
  sources: { [id: string]: Said };
  levels: { [area: string]: Hands };
  machine: Partial<{ [k in Permission]: Seen }>;
  beta: { told: string; by: string } | null;
  at: string;
};
export const PENDING_KEY = "sol.consent.machine";
const HANDS: readonly Hands[] = ["record", "show", "draft", "do"];
const isHands = (x: unknown): x is Hands => typeof x === "string" && (HANDS as readonly string[]).includes(x);

export const emptyConsent = (at = new Date().toISOString()): Consent => ({ v: 1, agreed: null, left: [], off: [], sources: {}, levels: {}, machine: {}, beta: null, at });

/** the consent as the record holds it, or one made from the record's older parts (a record from before #1216) */
export function consentIn(rec: Pick<Rec, "off" | "hands" | "areas" | "skipped"> & { consent?: Consent | null }): Consent {
  const c = rec.consent;
  if (c && typeof c === "object") return { ...emptyConsent(c.at), ...c, sources: { ...(c.sources ?? {}) }, levels: { ...(c.levels ?? {}) }, machine: { ...(c.machine ?? {}) } };
  return { ...emptyConsent(), off: [...(rec.off ?? [])], left: [...(rec.skipped ?? [])], levels: Object.fromEntries((rec.areas ?? []).map((a) => [a.id, rec.hands])) };
}

/** a folder's level: the consent's, else the record's one level */
export const levelOf = (rec: Rec, area: string): Hands => { const l = rec.consent?.levels?.[area]; return isHands(l) ? l : rec.hands; };

/** the consent the one onboarding writes at its end: what this run said (off, left, the answer), the levels for every
 *  folder (the level moved in this run sets them all; else a folder keeps its own and a new one takes the run's),
 *  and what was seen before (the machine, the Beta tap) joined, never dropped */
export function consentOf(rec: Rec, prev: Consent | null | undefined, o: { agreed?: Agreed | null; levelMoved: boolean; machine?: Consent["machine"]; sources?: Consent["sources"]; at?: string }): Consent {
  const at = o.at ?? new Date().toISOString();
  const levels: Consent["levels"] = {};
  for (const a of rec.areas) levels[a.id] = !o.levelMoved && prev && isHands(prev.levels[a.id]) ? prev.levels[a.id] : rec.hands;
  return { v: 1, agreed: o.agreed ?? prev?.agreed ?? null, left: [...(rec.skipped ?? [])], off: [...rec.off], sources: { ...(prev?.sources ?? {}), ...(o.sources ?? {}) }, levels,
    machine: joinMachine(prev?.machine ?? {}, o.machine ?? {}), beta: prev?.beta ?? null, at };
}

/** two sightings of the machine: the later one of each switch */
export function joinMachine(a: Consent["machine"], b: Consent["machine"]): Consent["machine"] {
  const out: Consent["machine"] = { ...a };
  for (const [k, v] of Object.entries(b) as [Permission, Seen][]) if (v && (!out[k] || out[k]!.at <= v.at)) out[k] = v;
  return out;
}

/** the level pressed: for one folder (Home inside a folder), or for every folder and the record's own (Home's, the
 *  onboarding's) */
export function withLevel(rec: Rec, h: Hands, area?: string, at = new Date().toISOString()): Rec {
  const c = consentIn(rec);
  if (area) return { ...rec, consent: { ...c, levels: { ...c.levels, [area]: h }, at } };
  return { ...rec, hands: h, consent: { ...c, levels: Object.fromEntries(rec.areas.map((a) => [a.id, h])), at } };
}

/** a source said yes or no to by name (a session list's "not here", Settings): the explorer obeys it from its next read */
export function withSource(rec: Rec, id: string, said: Said, at = new Date().toISOString()): Rec {
  const c = consentIn(rec);
  return { ...rec, consent: { ...c, sources: { ...c.sources, [id]: said }, at } };
}
/** may the explorer open this source, by the consent alone (the same rule as explore.mjs `allowed`) */
export function mayRead(c: Consent | null | undefined, id: string): boolean {
  const said = c?.sources?.[id];
  return said !== "no" && (c?.agreed?.said !== "only what I tell you" || said === "yes");
}

/** a permission seen (the first run's card, Settings): joined into the consent */
export function withMachine(rec: Rec, k: Permission, state: PermissionState, at = new Date().toISOString()): Rec {
  const c = consentIn(rec);
  return { ...rec, consent: { ...c, machine: joinMachine(c.machine, { [k]: { state, at } }), at } };
}

/** the Beta brief's tap (#1214): the one place it writes into the record. Its branch calls
 *  `changeRecord(ask, (r) => tellBeta(r))` beside its settings.track.told; nothing here calls it until that lands */
export function tellBeta(rec: Rec, at = new Date().toISOString(), by = "the Beta brief"): Rec {
  const c = consentIn(rec);
  return c.beta ? rec : { ...rec, consent: { ...c, beta: { told: at, by }, at } };
}

/** what the first run need not ask (pure): its name, and each switch the record holds as on */
export function heldByRecord(rec: Rec | null): { name: string | null; on: Set<Permission> } {
  if (!rec) return { name: null, on: new Set() };
  const on = new Set<Permission>();
  for (const [k, v] of Object.entries(rec.consent?.machine ?? {}) as [Permission, Seen][]) if (v?.state === "granted" || v?.state === "unsupported") on.add(k);
  return { name: rec.name?.trim() || null, on };
}

/** the permissions seen before there was a record, from this window's storage */
export function pendingMachine(store: Pick<Storage, "getItem">): Consent["machine"] {
  try { const j = JSON.parse(store.getItem(PENDING_KEY) ?? "{}"); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
/** a permission seen: kept in this window's storage until the record holds it */
export function keepPending(store: Pick<Storage, "getItem" | "setItem">, k: Permission, state: PermissionState, at = new Date().toISOString()) {
  try { store.setItem(PENDING_KEY, JSON.stringify(joinMachine(pendingMachine(store), { [k]: { state, at } }))); } catch { /* private */ }
}
