// Cowork v3, slice 8 (fr-30, #561): today's record, read for the import (migrate.ts) and never written. Each room of
// team.json is a group; its record (GitHub's sol-mif/sol-record for SOL, any record repo, a Drive folder, the cloud) is
// read through today's own stores and the record's `files` verb, exactly as today's Cowork reads it, and its Talk from
// this machine's files (STATE_DIR/talk/<room>/<thread>.json). What it gives:
//   items    the calendar's dates, the decision log, the polls and the goal (.sol/calendar.json, decisions.md,
//            polls.json, goal.md), each an item with its `type`
//   things   the things and their folders (.sol/things.json): loose things, kind link or folder
//   members  the people the record and Talk name, and me
//   places   the record itself, each connected repository, the Drive folder, the folder on this machine
//   pages    the pages (.sol/pages/<id>.md), each an artifact of kind page
//   talk     every Talk line kept on this machine for the room
// Memory, tables and templates stay in the old record only (they are listed as such in the report).
// A group's project id on the trail is its cloud code when it has one (the cloud's trail is a room's code), else the
// slug of its room id. Loaded only with the switch on (wire.ts imports switchwire.ts, which imports this).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "../../work/state.js";
import { getTeam, recordOf, connectedRepos, DRIVE_RECORD, type Room } from "../settings.js";
import { readThings, recordBranch, type ThingsDeps } from "../things.js";
import { calendar } from "../calendar.js";
import { decisions } from "../decisions.js";
import { polls } from "../polls.js";
import { parseGoal, GOAL_PATH } from "../goal.js";
import { pages } from "../pages.js";
import { recordFor } from "../project.js";
import { importId, msOf, type Entry, type Group, type Imported, type Source, type Today } from "./migrate.js";

export { projectOf } from "./project-id.js";
import { projectOf } from "./project-id.js";
/** whether a room is SOL's own project (pure): it carries sol-mif/sol-dev. Its record is whatever GitHub named
 *  (findrecord.ts, kept on the room as `record`, #510), so the record's name is not a sign of SOL here */
export const isSol = (r: Pick<Room, "provider" | "repos" | "code">): boolean =>
  r.repos.some((x) => x.toLowerCase() === "sol-mif/sol-dev");

/** today's rooms as groups */
export function groupsOf(rooms: Room[]): Group[] {
  const seen = new Set<string>();
  return rooms.flatMap((r) => {
    const project = projectOf(r);
    if (seen.has(project)) return [];
    seen.add(project);
    return [{ project, name: r.name || r.id, record: recordOf(r), room: r.id, ...(isSol(r) ? { sol: true } : {}) }];
  });
}

const TALK_DIR = () => join(STATE_DIR, "talk");
const roomDir = (room: string) => room.replace(/[^\w-]/g, "_").slice(0, 80) || "_";
type Line = { id: string; thread?: string; from: string; at: number; text: string; source?: string; agent?: boolean; file?: unknown };
const isLine = (l: any): l is Line => !!l && typeof l.id === "string" && typeof l.from === "string" && typeof l.at === "number" && typeof l.text === "string";
/** a room's Talk as kept on this machine, every thread (the files from before rooms had folders are the first room's) */
export function talkOf(room: string, first: boolean, dir = TALK_DIR()): { thread: string; file: string; lines: Line[] }[] {
  const out: { thread: string; file: string; lines: Line[] }[] = [];
  const read = (d: string) => {
    let names: string[] = [];
    try { names = readdirSync(d).filter((f) => f.endsWith(".json")); } catch { return; }
    for (const f of names) {
      const t = f.slice(0, -5), thread = t === "general" ? "general" : `#${t}`;
      try { const v = JSON.parse(readFileSync(join(d, f), "utf8")); if (Array.isArray(v)) out.push({ thread, file: join(d, f), lines: v.filter(isLine) }); } catch { /* not a Talk file */ }
    }
  };
  read(join(dir, roomDir(room)));
  if (first) read(dir);
  return out;
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v : "").slice(0, n);
const imp = (from: string, at: unknown): Imported => ({ from, at: msOf(at) });

/** the record's text file and its sha, or null when it is not there */
async function readText(d: ThingsDeps, repo: string, path: string): Promise<{ text: string; sha: string } | null> {
  const branch = await recordBranch(d, repo);
  let out = "";
  try { out = await d.record().files.readSha(repo, path, branch); }
  catch (e) { if (/\(HTTP 404\)\s*$|not found/i.test(String((e as { full?: string })?.full ?? (e as Error)?.message ?? e))) return null; throw e; }
  let j: Record<string, unknown> = {};
  try { const v = JSON.parse(out); if (v && typeof v === "object") j = v as Record<string, unknown>; } catch { /* nothing */ }
  return j.content ? { text: Buffer.from(String(j.content), "base64").toString("utf8"), sha: String(j.sha ?? "") } : null;
}

/** one group's record and Talk as import entries; `deps` is the record's store (null: Talk and places only) */
export async function readGroup(g: Group, room: Room, deps: ThingsDeps | null, o: { me: string; first: boolean; talkDir?: string }): Promise<Today> {
  const t: Today = { items: [], things: [], members: [], places: [], pages: [], talk: [], unread: [], left: ["memory", "tables", "templates"] };
  const people = new Set<string>(o.me ? [o.me.toLowerCase()] : []);
  const who = (v: unknown) => { const s = text(v, 39); if (/^[A-Za-z0-9-]{1,39}$/.test(s)) people.add(s.toLowerCase()); return s; };
  const R = g.record, at = (sha?: string) => (sha ? `@${sha.slice(0, 12)}` : "");
  const step = async (what: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { t.unread.push(`${what}: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 140)}`); } };

  // places: what today's room already links to
  const place = (kind: string, label: string) => t.places.push({ kind: "place", item: importId("imp-", R, "place", kind, label), value: { kind, label, imported: imp(`team.json:${room.id}`, 0) } });
  if (R) place("record", R.startsWith(DRIVE_RECORD) ? "Sol's record (Drive)" : R);
  for (const repo of connectedRepos(room)) if (repo !== R) place("github", repo);
  if (room.provider === "drive" && room.repos[0]) place("drive", room.repos[0]);
  if (room.folder) place("folder", room.folder);

  if (deps && R) {
    await step("things", async () => {
      const { file, sha } = await readThings(deps, R);
      const from = `${R}:.sol/things.json${at(sha)}`;
      for (const f of file.folders ?? []) t.things.push({ kind: "loose", item: importId("imp-", R, "folder", f.id), value: { kind: "folder", title: f.name, whose: who(f.by), place: "record", ...(f.parent ? { parent: importId("imp-", R, "folder", f.parent) } : {}), ...(f.agent ? { agent: true } : {}), imported: imp(from, f.at) } });
      for (const x of file.things) t.things.push({ kind: "loose", item: importId("imp-", R, "thing", x.id), value: { kind: "link", title: x.name, url: x.url, link: x.kind, whose: who(x.addedBy), place: "record", ...(x.parent ? { parent: importId("imp-", R, "folder", x.parent) } : {}), ...(x.agent ? { agent: true } : {}), imported: imp(from, x.at) } });
    });
    await step("calendar", async () => {
      const { file, sha } = await calendar.read(deps, R);
      const from = `${R}:.sol/calendar.json${at(sha)}`;
      for (const e of file.events) t.items.push({ kind: "item", item: importId("imp-", R, "date", e.id), value: { type: "date", title: e.title, start: e.start, ...(e.end ? { end: e.end } : {}), allDay: e.allDay, who: e.who, whose: who(e.by), place: "record", ...(e.agent ? { agent: true } : {}), imported: imp(from, e.at) } });
    });
    await step("decisions", async () => {
      const { file, sha } = await decisions.read(deps, R);
      const from = `${R}:.sol/decisions.md${at(sha)}`;
      for (const d of file.decisions) t.items.push({ kind: "item", item: importId("imp-", R, "decision", d.id), value: { type: "decision", title: d.title, lines: d.lines, whose: who(d.by), place: "record", ...(d.agent ? { agent: true } : {}), imported: imp(from, d.at) } });
    });
    await step("polls", async () => {
      const { file, sha } = await polls.read(deps, R);
      const from = `${R}:.sol/polls.json${at(sha)}`;
      for (const p of file.polls) t.items.push({ kind: "item", item: importId("imp-", R, "poll", p.id), value: { type: "poll", title: p.question, options: p.options, votes: p.votes, ...(p.closed ? { closed: p.closed } : {}), whose: who(p.by), place: "record", ...(p.agent ? { agent: true } : {}), imported: imp(from, p.at) } });
    });
    await step("goal", async () => {
      const got = await readText(deps, R, GOAL_PATH);
      if (!got) return;
      const goal = parseGoal(got.text);
      if (goal.title) t.items.push({ kind: "item", item: importId("imp-", R, "goal"), value: { type: "goal", title: goal.title, lines: goal.lines, whose: who(goal.setBy), place: "record", imported: imp(`${R}:${GOAL_PATH}${at(got.sha)}`, goal.at) } });
    });
    await step("pages", async () => {
      for (const p of await pages.list(deps, R, true)) {
        const page = await pages.read(deps, R, p.id);
        if (!page) continue;
        t.pages.push({ kind: "artifact", item: importId("a-imp-", R, "page", p.id), value: {
          kind: "page", title: page.title, whose: who(page.made || page.by), place: "record",
          content: { hero: page.title, p: page.body.slice(0, 4000), cards: [] }, body: page.body, ...(page.agent ? { agent: true } : {}),
          imported: imp(`${R}:.sol/pages/${p.id}.md${at(page.sha)}`, page.at),
        } });
      }
    });
  } else if (R) t.unread.push("the record: this Sol cannot read it yet (its store is not wired)");

  // Talk: every line this machine kept for the room
  for (const th of talkOf(room.id, o.first, o.talkDir)) for (const l of th.lines) {
    who(l.from);
    t.talk.push({ kind: "talk", item: importId("imp-", room.id, th.thread, l.id), value: { thread: th.thread, from: l.from, text: l.text, said: l.at, source: l.source ?? "relay", ...(l.agent ? { agent: true } : {}), imported: { from: `talk:${room.id}/${th.thread}`, at: l.at } } });
  }
  for (const p of [...people].sort()) t.members.push({ kind: "member", item: p, value: { login: p, role: p === o.me.toLowerCase() ? "owner" : "editor", imported: imp(`team.json:${room.id}`, 0) } });
  return t;
}

/** today's record on this Sol, as the import's source */
export function todaySource(o: { me: () => string; deps?: (record: string) => ThingsDeps | null; talkDir?: string } = { me: () => getTeam().me.login }): Source {
  const rooms = () => getTeam().rooms;
  return {
    groups: () => groupsOf(rooms()),
    async read(g: Group) {
      const all = rooms(), room = all.find((r) => r.id === g.room);
      if (!room) throw new Error("this group is not in team.json any more");
      const deps = o.deps ? o.deps(g.record) : (recordFor(g.record).things?.() ?? null);
      return readGroup(g, room, deps, { me: o.me(), first: all[0]?.id === room.id, ...(o.talkDir ? { talkDir: o.talkDir } : {}) });
    },
  };
}

export type { Entry };
