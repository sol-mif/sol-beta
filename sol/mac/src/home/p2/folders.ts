// Slice C's calls (#692, pieces/folder.mjs, context.mjs, moves.mjs mo-drop): what a folder and the side both need, the
// tree read from home.state's flat list, and Drop: a file, a link or selected words dragged onto a folder become
// home.folder.drop, one message per thing dropped.
import type { Agent, Folder, Home2Api, HomeState2 } from "./pass2";

export const agentName = (a: Agent) => (a === "codex" ? "Codex" : "Claude");

/** the folder's own agent, else the nearest parent's; `from` names the folder it came from when inherited */
export function agentOf(fs: Folder[], id: string): { agent: Agent; from: Folder | null } {
  const by = new Map(fs.map((f) => [f.id, f]));
  for (let f = by.get(id), first = true; f; f = f.parent ? by.get(f.parent) : undefined, first = false) if (f.agent) return { agent: f.agent, from: first ? null : f };
  return { agent: "claude", from: null };
}

/** the folder and every folder under it (any depth), from the flat list */
export function subtree(fs: Folder[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const f of fs) if (f.parent === out[i]) out.push(f.id);
  return out;
}

export const kids = (fs: Folder[], id: string | null) => fs.filter((f) => (f.parent ?? null) === id);

/** a drop's result as the face says it: "added to bio 201's context · 3 dates → the week, prof. Okafor → people" */
export type Dropped = { type: string; said?: string; error?: string; things?: { kind: string; text: string; to: string }[]; row?: { name: string } };
export function saidOf(rs: Dropped[]): { text: string; bad: boolean } {
  const bad = rs.find((r) => r.type === "home.error" || r.error);
  if (bad) return { text: bad.error ?? "could not add it", bad: true };
  const said = rs[0]?.said ?? "";
  const things = rs.flatMap((r) => r.things ?? []);
  const dates = things.filter((t) => t.kind === "date"), people = things.filter((t) => t.kind === "person");
  const more = [dates.length ? `${dates.length} date${dates.length === 1 ? "" : "s"} → ${dates[0].to}` : "", people.length ? `${people.length === 1 ? people[0].text : `${people.length} people`} → people` : ""].filter(Boolean);
  return { text: [rs.length > 1 ? `${rs.length} things ${said}` : said, ...more].filter(Boolean).join(" · "), bad: false };
}

/** true when what is dragged is something a folder can take (files, a link, words, a sticky) */
export const canTake = (dt: DataTransfer | null) => !!dt && [...dt.types].some((t) => t === "Files" || t === "text/uri-list" || t === "text/plain" || t === STICKY);
export const STICKY = "application/x-sol-sticky";

const b64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

/** Drop: whatever was let go over a folder, sent to it; a sticky dragged onto a folder is refiled there instead */
export async function dropInto(h: Home2Api, id: string, dt: DataTransfer): Promise<Dropped[]> {
  const sticky = dt.getData(STICKY);
  if (sticky) return [await h.ask<Dropped>({ type: "home.sticky.move", sticky, folder: id })];
  const files = [...dt.files];
  if (files.length) return Promise.all(files.map(async (f) => h.ask<Dropped>({ type: "home.folder.drop", id, name: f.name, kind: "file", data: await b64(f) })));
  const uri = dt.getData("text/uri-list").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
  const text = dt.getData("text/plain");
  if (uri || /^https?:\/\/\S+$/.test(text.trim())) return [await h.ask<Dropped>({ type: "home.folder.drop", id, kind: "link", url: uri ?? text.trim() })];
  if (text.trim()) return [await h.ask<Dropped>({ type: "home.folder.drop", id, kind: "text", text })];
  return [];
}

/** the folders the side and a folder show: not archived */
export const live = (st: HomeState2 | null) => (st?.folders ?? []).filter((f) => !f.archived);
