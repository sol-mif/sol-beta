// Cowork v3, slice 8 (fr-30, #561; the PRD path 9): today's groups into the trail. For each group (a room of team.json,
// its record on GitHub, Drive or the cloud, its Talk on this machine) a dry run says what would be imported, per kind,
// and the import writes it: one signed event an object, the kind the record's own (item, loose, member, place,
// artifact, talk), its value carrying a field `imported: { from, at }` (the file and sha it came from, and when it was
// first made there). Nothing of the old record is written, moved or deleted: it stays where it is and reads as today.
// Idempotent: every object's id is made from where it came from, so a second run finds it on the trail and imports
// nothing new (an object a person erased or changed since is never imported again either).
// SOL's own project (the one whose record is sol-mif/sol-record) also gets the project layer's `cowork.v3` on, once.
// Pure but for the Trail handed in and the Source, which reads today's record (today.ts; the tests hand in their own).
import { createHash } from "node:crypto";
import { canonical, VALUE_MAX, type By, type Trail } from "./trail.js";
import { fold } from "./record.js";

/** one of today's groups as the trail will know it: its project id, its name, where its record lives */
export type Group = { project: string; name: string; record: string; room: string; sol?: boolean };
/** where an object came from: the file (and its sha) or the Talk thread, and when it was made there (ms) */
export type Imported = { from: string; at: number };
/** one object to import */
export type Entry = { kind: string; item: string; value: Record<string, unknown> & { imported: Imported } };
export const WHAT = ["items", "things", "members", "places", "pages", "talk"] as const;
export type What = (typeof WHAT)[number];
export type Counts = Record<What, number>;
/** what one group holds today, read by a Source; `unread` names what could not be read (a line each) */
export type Today = Record<What, Entry[]> & { unread: string[]; left?: string[] };
export type Source = { groups(): Group[] | Promise<Group[]>; read(g: Group): Promise<Today> };
/** one group's report: what would be (or was) imported, what was there already, what could not be read */
export type GroupReport = {
  project: string; name: string; record: string; sol: boolean;
  counts: Counts; already: Counts; unread: string[]; left: string[];
  /** SOL's project: the import turns Cowork v3 on for it */
  turnsOn: boolean;
};
export type Report = { groups: GroupReport[]; total: number; run: boolean; error?: string };

const zero = (): Counts => ({ items: 0, things: 0, members: 0, places: 0, pages: 0, talk: 0 });
const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
/** an imported object's id, the same on every run and every Sol (pure): from the record, the file, and its own id there */
export const importId = (prefix: string, ...parts: string[]) => `${prefix}${short(parts.join("\n"))}`;
/** a time as ms, or 0 (pure) */
export const msOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : Date.parse(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
/** the project layer's switch key (settingOf reads it) */
export const SWITCH_KEY = "cowork.v3";

/** a value that fits one event: long words are cut to fit, and the cut is said (pure) */
export function fit(value: Entry["value"], long = "body"): Entry["value"] {
  if (Buffer.byteLength(canonical(value)) <= VALUE_MAX) return value;
  const text = String(value[long] ?? "");
  const room = VALUE_MAX - Buffer.byteLength(canonical({ ...value, [long]: "", cut: true })) - 512;
  let cut = text.slice(0, Math.max(0, room));
  while (cut && Buffer.byteLength(cut) > room) cut = cut.slice(0, Math.floor(cut.length * 0.9));
  return { ...value, [long]: cut, cut: true };
}

/** the objects already on a project's trail, as `kind\nitem` (pure but for the trail read) */
function onTrail(trail: Trail, project: string): Set<string> {
  const out = new Set<string>();
  for (let seq = 0; ;) {
    const page = trail.since(project, seq, 5000);
    for (const e of page) if (e.item) out.add(`${e.kind}\n${e.item}`);
    if (page.length < 5000) break;
    seq = page[page.length - 1].seq;
  }
  return out;
}

/** whether SOL's project still needs its switch written on its project layer */
function needsSwitch(trail: Trail, g: Group): boolean {
  if (!g.sol) return false;
  const r = fold(trail.check(g.project).ok);
  return !(SWITCH_KEY in r.settings.project);
}

/** one group, read and compared with its trail: what is new, what is there already */
function plan(trail: Trail, g: Group, t: Today): { report: GroupReport; fresh: { w: What; e: Entry }[] } {
  const have = onTrail(trail, g.project), counts = zero(), already = zero(), fresh: { w: What; e: Entry }[] = [], seen = new Set<string>();
  for (const w of WHAT) for (const e of t[w] ?? []) {
    const k = `${e.kind}\n${e.item}`;
    if (seen.has(k)) continue;   // the same object twice in one read (a page listed twice): once
    seen.add(k);
    if (have.has(k)) { already[w]++; continue; }
    counts[w]++; fresh.push({ w, e });
  }
  return { report: { project: g.project, name: g.name, record: g.record, sol: !!g.sol, counts, already, unread: t.unread, left: t.left ?? [], turnsOn: needsSwitch(trail, g) }, fresh };
}

const sum = (c: Counts) => WHAT.reduce((n, w) => n + c[w], 0);

/** the dry run: every group read, nothing written */
export async function dryRun(trail: Trail, src: Source): Promise<Report> {
  const groups: GroupReport[] = [];
  for (const g of await src.groups()) groups.push(plan(trail, g, await readSafe(src, g)).report);
  return { groups, total: groups.reduce((n, g) => n + sum(g.counts) + (g.turnsOn ? 1 : 0), 0), run: false };
}

/** the import: every group read again and what is new written as signed events, oldest first; the counts are what
 *  was written. A group that cannot be read is skipped with its line, the others go on */
export async function runImport(trail: Trail, src: Source, by: By): Promise<Report> {
  const groups: GroupReport[] = [];
  for (const g of await src.groups()) {
    const { report, fresh } = plan(trail, g, await readSafe(src, g));
    const done = zero();
    for (const { w, e } of [...fresh].sort((a, b) => a.e.value.imported.at - b.e.value.imported.at)) {
      try { trail.append({ project: g.project, by, kind: e.kind, item: e.item, value: fit(e.value) }); done[w]++; }
      catch (err) { report.unread.push(`${e.kind} ${e.item}: ${String((err as Error)?.message ?? err).split("\n")[0].slice(0, 120)}`); }
    }
    if (report.turnsOn) trail.append({ project: g.project, by, kind: "setting", item: "project", field: SWITCH_KEY, value: true });
    groups.push({ ...report, counts: done });
  }
  return { groups, total: groups.reduce((n, g) => n + sum(g.counts) + (g.turnsOn ? 1 : 0), 0), run: true };
}

async function readSafe(src: Source, g: Group): Promise<Today> {
  try { return await src.read(g); }
  catch (e) { return { ...Object.fromEntries(WHAT.map((w) => [w, []])) as unknown as Record<What, Entry[]>, unread: [`${g.name}: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}`] }; }
}

/** the dry run's card line (pure): "41 items, 12 things, 3 members, 2 places, 5 pages, 380 Talk messages" */
export function cardLine(r: Pick<Report, "groups">): string {
  const c = zero();
  for (const g of r.groups) for (const w of WHAT) c[w] += g.counts[w];
  const word: Record<What, [string, string]> = { items: ["item", "items"], things: ["thing", "things"], members: ["member", "members"], places: ["place", "places"], pages: ["page", "pages"], talk: ["Talk message", "Talk messages"] };
  const parts = WHAT.filter((w) => c[w]).map((w) => `${c[w]} ${word[w][c[w] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : "nothing new";
}

/** the report as the agent's tool says it, one group a line (pure) */
export function reportText(r: Report): string {
  if (r.error) return r.error;
  if (!r.groups.length) return "no groups on this Sol to import";
  const lines = r.groups.map((g) => {
    const said = cardLine({ groups: [g] }), had = sum(g.already);
    return `- ${g.name} (${g.project}, record ${g.record || "none"}): ${r.run ? "imported" : "would import"} ${said}`
      + (had ? `; ${had} already on the trail` : "") + (g.turnsOn ? `; ${r.run ? "turned" : "turns"} Cowork v3 on for this project` : "")
      + (g.unread.length ? `; not read: ${g.unread.join("; ")}` : "") + (g.left.length ? `; stays in the old record only: ${g.left.join(", ")}` : "");
  });
  return `${r.run ? "Imported" : "Dry run, nothing written"}: ${cardLine(r)} in ${r.groups.length} group${r.groups.length === 1 ? "" : "s"}. The old record is untouched.\n${lines.join("\n")}`;
}
