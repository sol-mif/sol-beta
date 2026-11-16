// The feature map, read (#485, until #480 lands). TO BE REPLACED by sol/engine/src/team/features.ts from #480 (P2):
// the same three functions under the same names, so the swap is one import line in firsttimer.ts, morning.ts and
// live.ts, and this file goes. specs/features.json is the shape CONTRACTS fixed: { version: 1, features: [{ id "fr-NN",
// name, slug, type, label, where, lead, support, dependsOn, paths (globs of the code that belongs to it), off }] }.
// specs/ is a team file: it is never on the beta list, so a Sol tester's Sol never has it and never reads it here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Feature = {
  id: string; name: string; slug: string; type: string; label: string; where: string;
  lead: string; support: string[]; dependsOn: string[]; paths: string[]; off: string | null;
};

const ID = /^fr-\d{2,}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** the features in specs/features.json at `root` (the repository's root); [] when there is none or it does not parse */
export function readFeatures(root: string): Feature[] {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(root, "specs", "features.json"), "utf8")); } catch { return []; }
  const list = isObj(raw) && Array.isArray(raw.features) ? raw.features : [];
  return list.filter(isObj).filter((f) => typeof f.id === "string" && ID.test(f.id)).map((f) => ({
    id: f.id as string, name: String(f.name ?? f.id), slug: String(f.slug ?? ""), type: String(f.type ?? ""), label: String(f.label ?? ""),
    where: String(f.where ?? ""), lead: String(f.lead ?? ""), support: strs(f.support), dependsOn: strs(f.dependsOn), paths: strs(f.paths),
    off: typeof f.off === "string" ? f.off : null,
  }));
}

/** a glob as a test (pure): `**` any folders, `*` anything but a slash, `?` one character; a glob with no wildcard is
 *  that file or anything under that folder */
export function globTest(glob: string): (path: string) => boolean {
  const g = glob.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!/[*?]/.test(g)) return (p) => p === g || p.startsWith(`${g}/`);
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { re += g[i + 2] === "/" ? "(?:.*/)?" : ".*"; i += g[i + 2] === "/" ? 2 : 1; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const r = new RegExp(`^${re}$`);
  return (p) => r.test(p);
}

/** the feature a file belongs to (pure over the list): the one whose matching glob says the most (its letters before
 *  any wildcard), so `sol/engine/src/team/live.ts` beats `sol/engine/**`; null when none claims it */
export function featureIn(features: Feature[], path: string): Feature | null {
  const p = path.replace(/^\.\//, "");
  let best: Feature | null = null, weight = -1;
  for (const f of features) for (const g of f.paths) {
    if (!globTest(g)(p)) continue;
    const w = g.split(/[*?]/)[0].length;
    if (w > weight) { best = f; weight = w; }
  }
  return best;
}

/** the feature a file belongs to, read from `root`'s map */
export const featureOf = (root: string, path: string): Feature | null => featureIn(readFeatures(root), path);

/** a feature's folder, from the repository's root */
export const folderOf = (f: Pick<Feature, "id" | "slug">) => `specs/features/${f.id}${f.slug ? `-${f.slug}` : ""}`;
