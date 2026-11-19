// A Home address (#692, Home on the stage): what a page block's src says when it is Home's. Pure, so the face's tests
// reach it (stage-home.test.ts); Page.tsx reads it before loading Home at all.
import type { Folder } from "./pass2";

/** a Home address as the stage keeps it: sol://home (today, or where it was), sol://home/folder/<name>, sol://home/world,
 *  sol://home/knobs, sol://home/block/<id> (a Home block lifted to the stage, #692 suite); null when it is not Home's. A folder is named by its slug, its name or its id (found once read). */
export type HomeSrc = { at: "home"; place?: "today" | "world" | { folder: string } } | { at: "knobs" } | { at: "block"; id: string };
export function homeSrc(src: string | undefined): HomeSrc | null {
  const m = /^sol:\/\/home(?:\/(.*))?$/.exec((src ?? "").trim());
  if (!m) return null;
  const [w, ...rest] = (m[1] ?? "").split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (!w) return { at: "home" };
  if (w === "knobs") return { at: "knobs" };
  if (w === "block" && rest[0]) return { at: "block", id: rest[0] };
  if (w === "world") return { at: "home", place: "world" };
  if (w === "today") return { at: "home", place: "today" };
  if (w === "folder" && rest.length) return { at: "home", place: { folder: rest.join("/") } };
  return { at: "home" };
}
/** the folder a name in an address means: its id, slug or name, the last step of its crumb, any case */
export function folderNamed(fs: Folder[], name: string): Folder | undefined {
  const n = name.trim().toLowerCase();
  return fs.find((f) => f.id === name) ?? fs.find((f) => f.slug.toLowerCase() === n) ?? fs.find((f) => f.name.toLowerCase() === n) ?? fs.find((f) => f.crumb.join("/").toLowerCase() === n);
}
