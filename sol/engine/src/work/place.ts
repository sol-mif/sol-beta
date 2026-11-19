// Where a folder belongs (#1016): Build's sidebar holds code, Home holds the person's own folders. The rule, in one
// sentence: a folder inside your Home is Home's, every other folder is Build's, and a code project (a folder with its
// own git) inside a Home folder is both: Build lists it as a project, wearing its Home area's name, and Home lists it too.
// The engine only says where each folder is; the face decides what to draw, behind its switch (`side.sorted`). Nothing
// is moved or written: a folder's place is read from the disk each time the list goes out.
import { existsSync, realpathSync } from "node:fs";
import { join, relative, sep, isAbsolute, dirname } from "node:path";
import { homedir } from "node:os";
import { homeRoot } from "./blocks.js";
import { twinIn } from "../home.js";

/** home: inside Home and no code of its own; both: a code project inside Home. A Build folder carries neither */
export type Place = { place?: "home" | "both"; area?: string };

/** where one folder sits against Home's root (pure but for `hasGit`, which the tests pass): its area is its first
 *  folder under the root ("school" for school/ds480), "home" for the root itself */
export function placeOf(path: string, root: string, hasGit: (dir: string) => boolean): Place {
  const rel = relative(root, path);
  if (rel.startsWith("..") || isAbsolute(rel)) return {};
  if (!rel) return { place: "home", area: "home" };
  const area = rel.split(sep)[0];
  // a git of its own between the folder and the root (the root's own repo, sol-dev's, does not count)
  for (let d = path; d !== root && d.length > root.length; d = dirname(d)) if (hasGit(d)) return { place: "both", area };
  return { place: "home", area };
}

const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };

/** every folder of the list with its place, against this machine's Home (a path from the other machine read as here) */
export function withPlace<P extends { path: string }>(projects: P[], root = real(homeRoot())): (P & Place)[] {
  const git = (d: string) => existsSync(join(d, ".git"));
  return projects.map((p) => {
    const here = twinIn(p.path, homedir());
    const at = placeOf(real(here), root, git);
    return at.place ? { ...p, ...at } : p;
  });
}
