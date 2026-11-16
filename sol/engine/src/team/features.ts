// The feature map (#480, dev cycle step 2): `specs/features.json` in the sol-dev checkout, the lasting parts of Sol a
// Sol user or Sol developer would name, each with its area label, lead and support, what it depends on, the code that
// belongs to it (`paths`, globs from the repo root) and its off-switch. The shape is fixed in the round 5 contracts;
// the gate (#481), the team files (#482), the locks (#484) and the morning run (#485) read it through this file.
// A team file: `specs/` is never on the beta list (ship.ts BETA_KEEP), so a Sol tester's copy has no map and every
// read here is empty. Pure but for the reads of the repo's files; never throws.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FEATURES_PATH = "specs/features.json";
/** the three types of work (the dev cycle's decision 18, PRD §3.10): a feature's `type` in the map, and a PR's title's
 *  first word ("internal: ...") */
export const TYPES = ["internal", "product", "marketing"] as const;
export type WorkType = (typeof TYPES)[number];
/** a type of work as a label on GitHub: `type:internal`, `type:product`, `type:marketing`. Never the bare word, which
 *  would clash with the area label `product` (#488's review, B1); that old label, "what is not code", goes away */
export const TYPE_PREFIX = "type:";
export const typeLabel = (t: WorkType) => `${TYPE_PREFIX}${t}`;
export const TYPE_LABELS = TYPES.map(typeLabel);
/** the type a label says, or "" when it is no type label (pure) */
export const typeOfLabel = (label: string): WorkType | "" => {
  const t = label.startsWith(TYPE_PREFIX) ? label.slice(TYPE_PREFIX.length) : "";
  return (TYPES as readonly string[]).includes(t) ? (t as WorkType) : "";
};
/** the area labels a feature may name (CODEOWNERS' sections). Not `product`: the old label for "what is not code" goes
 *  away (decision 18), so a feature the map gave it reads with no area label, for the leads to place */
export const LABELS = ["base", "life", "work", "cowork", "social"] as const;
export type Feature = {
  id: string; name: string; slug: string; type: WorkType; label: string; where: string;
  lead: string; support: string[]; dependsOn: string[]; paths: string[]; off: string | null;
};

const ID = /^fr-\d{2,3}$/, SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/, LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(ok) : []);

/** one entry made valid, or null (pure): an id, a slug, a type of work and at least one path, or it is no feature */
export function cleanFeature(v: unknown): Feature | null {
  if (!isObj(v)) return null;
  const id = str(v.id), slug = str(v.slug), type = str(v.type) as WorkType, paths = strs(v.paths, (p) => !!p && !p.startsWith("/") && !p.split("/").includes(".."));
  if (!ID.test(id) || !SLUG.test(slug) || !TYPES.includes(type) || !paths.length) return null;
  return {
    id, name: str(v.name, 80) || slug, slug, type, label: (LABELS as readonly string[]).includes(str(v.label)) ? str(v.label) : "", where: str(v.where),
    lead: LOGIN.test(str(v.lead)) ? str(v.lead) : "", support: strs(v.support, (l) => LOGIN.test(l)),
    dependsOn: strs(v.dependsOn, (d) => ID.test(d)), paths, off: str(v.off, 80) || null,
  };
}

/** the map of a parsed file (pure): its valid features, each id once (the first wins) */
export function featuresIn(v: unknown): Feature[] {
  const out: Feature[] = [];
  for (const x of isObj(v) && Array.isArray(v.features) ? v.features : []) {
    const f = cleanFeature(x);
    if (f && !out.some((y) => y.id === f.id)) out.push(f);
  }
  return out;
}

/** the map in a checkout: [] when it has none (a Sol tester's copy) or the file cannot be read */
export function readFeatures(root: string): Feature[] {
  try { return featuresIn(JSON.parse(readFileSync(join(root, FEATURES_PATH), "utf8"))); } catch { return []; }
}

/** a glob as a RegExp (pure): `**` any depth, `*` and `?` within one part; a path ending in `/` is everything under it */
export function globRe(glob: string): RegExp {
  const g = glob.endsWith("/") ? `${glob}**` : glob;
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { i++; if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*"; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
/** how specific a glob is: the length of its part before the first wildcard (the longest wins a file two features claim) */
const weight = (glob: string) => glob.split(/[*?]/)[0].length + (/[*?]/.test(glob) || glob.endsWith("/") ? 0 : 1000);

/** the feature a file belongs to in a map (pure): the one whose matching glob is the most specific; null when none */
export function featureIn(features: Feature[], path: string): Feature | null {
  const p = path.replace(/^\.\//, "").replace(/^\//, "");
  let best: Feature | null = null, w = -1;
  for (const f of features) for (const g of f.paths) if (weight(g) > w && globRe(g).test(p)) { best = f; w = weight(g); }
  return best;
}
/** the feature a file of a checkout belongs to */
export const featureOf = (root: string, path: string): Feature | null => featureIn(readFeatures(root), path);

/** the feature most of a change's files belong to (pure): the files a PR or a branch changes, the map; the first in
 *  the map wins a tie; null with no map or no file in it. The hand-in card (#476) and the gate (#481) name a change's
 *  feature with it */
export function featureOfChange(features: Feature[], files: string[]): Feature | null {
  const n = new Map<string, number>();
  for (const p of files) { const f = featureIn(features, p); if (f) n.set(f.id, (n.get(f.id) ?? 0) + 1); }
  let best: Feature | null = null, most = 0;
  for (const f of features) if ((n.get(f.id) ?? 0) > most) { best = f; most = n.get(f.id)!; }
  return best;
}

/** the project's Sol developers (pure): every lead its ownership table names, and its dev and beta reviewers */
export function devsIn(owners: Record<string, string[]>, rhythm: { dev?: string[]; beta?: string[] }): string[] {
  const out: string[] = [];
  for (const l of [...Object.values(owners).flat(), ...(rhythm.dev ?? []), ...(rhythm.beta ?? [])]) if (typeof l === "string" && LOGIN.test(l) && !out.some((x) => x.toLowerCase() === l.toLowerCase())) out.push(l);
  return out;
}

/** a feature's folder from the repo root: specs/features/<id>-<slug> */
export const folderOf = (f: Pick<Feature, "id" | "slug">) => `specs/features/${f.id}-${f.slug}`;

/** eval.md's Status line (pure): the FIRST line of the file that starts "Status:", whole; "" when none. The gate
 *  (#481, gate.ts) reads the same line, so the two never disagree */
export const statusLineOf = (evalMd: string) => /^Status:.*$/m.exec(evalMd)?.[0] ?? "";
/** whether a feature's evals are approved (pure): the first Status line, and only it, says "Approved by <login> on
 *  YYYY-MM-DD". A press's line written anywhere below it (in a comment, under "Status: draft") counts for nothing */
export const approvedIn = (evalMd: string) => /^Status:\s*Approved by [A-Za-z0-9-]{1,39} on \d{4}-\d{2}-\d{2}\s*$/.test(statusLineOf(evalMd));
/** a feature's evals in a checkout: "approved", "draft" (an eval.md not yet approved) or "none" */
export function evalsOf(root: string, f: Pick<Feature, "id" | "slug">): "approved" | "draft" | "none" {
  try { return approvedIn(readFileSync(join(root, folderOf(f), "eval.md"), "utf8")) ? "approved" : "draft"; } catch { return "none"; }
}
