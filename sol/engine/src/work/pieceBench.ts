// Making a piece by hand (#1092, S/design/design.md NOW 2 of 03:20): what a folder can be read from (found, never
// typed), one read of a draft recipe that keeps nothing, and the back's notches rewriting a recipe's file. The face's
// PieceBench presses these; "keep" is work.pieces.make. Pure where it can be, so the tests reach it.
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nucbox } from "./pieceSources.js";
import { CEILINGS, DIR, MIN_EVERY, inside, jsonFilesIn, readRecipe, readSource, stepsOf, writeInPieces, type Ceiling } from "./pieces.js";

/** one thing a folder can be read from, the face's BenchSource */
export type Source = { id: string; word: string; parts?: { label: string; options: string[] }[]; asks?: "address" | "program" | "sentence" };

/** the areas and kinds of a labels file (.github/labels.json: { labels: [{ group, name, description }] }), the retired
 *  ones left out (pure) */
export function labelParts(raw: unknown): { label: string; options: string[] }[] {
  const ls = raw && typeof raw === "object" && Array.isArray((raw as { labels?: unknown }).labels) ? (raw as { labels: { group?: unknown; name?: unknown; description?: unknown }[] }).labels : [];
  const of = (g: string) => ls.filter((l) => l.group === g && typeof l.name === "string" && !/^retired/i.test(String(l.description ?? ""))).map((l) => String(l.name));
  return [{ label: "area", options: of("area") }, { label: "kind", options: of("kind") }].filter((p) => p.options.length);
}

/** what this folder can be read from (pure over what is there): first the starters that need only the folder (its
 *  recent files; in a repository, its git state), then in a repository its issues (by the labels file's area and kind),
 *  its pull requests, and the runs only where the NucBox's address is known (morning round of 11-13: never offered to
 *  break); a Home folder, what it knows and its stickies; each json file under .sol/ (not the pieces' own); an address;
 *  a program */
export function sourcesOf(f: { repo: boolean; labels?: unknown; jsonUnderSol: string[]; ground: boolean; stickies: boolean; nucbox?: boolean }): Source[] {
  const out: Source[] = [{ id: "recent", word: "recent files" }];
  if (f.repo) {
    const parts = labelParts(f.labels);
    out.push({ id: "git", word: "git state" }, { id: "issues", word: "issues", ...(parts.length ? { parts } : {}) }, { id: "prs", word: "pull requests" });
    if (f.nucbox) out.push({ id: "runs", word: "runs" });
  }
  if (f.ground || f.stickies) out.push({ id: "due", word: "what it knows" });
  for (const p of f.jsonUnderSol) if (!p.startsWith(`${DIR}/`)) out.push({ id: `file:${p}`, word: p.split("/").pop()! });
  // the last pill: what no pill fits, in his words; his session is asked to make it (the designer's NOW 3 of 03:53)
  out.push({ id: "url", word: "an address", asks: "address" }, { id: "else", word: "something else", asks: "sentence" });
  return out;
}

/** the folder's sources, read from the disk */
export function sources(cwd: string): Source[] {
  let labels: unknown;
  try { labels = JSON.parse(readFileSync(join(cwd, ".github", "labels.json"), "utf8")); } catch { /* none */ }
  return sourcesOf({ repo: existsSync(join(cwd, ".git")), labels, jsonUnderSol: jsonFilesIn(cwd, ".sol").slice(0, 20), ground: existsSync(join(cwd, "ground.json")), stickies: existsSync(join(cwd, "stickies.md")), nucbox: !!nucbox() });
}

/** one read of a draft recipe: its rows as the front draws them, nothing kept, no block, no file */
export async function tryRecipe(cwd: string, raw: unknown): Promise<{ steps?: ReturnType<typeof stepsOf>; line?: string; from?: string; error?: string }> {
  const r = readRecipe(raw);
  if ("error" in r) return { error: r.error };
  try {
    const got = await readSource(cwd, r);
    return { steps: stepsOf(got.rows), ...(got.line ? { line: got.line } : {}), ...(got.from ? { from: got.from } : {}) };
  } catch (e) { return { error: e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e) }; }
}

/** the recipe's file with a notch moved (pure over the file's json): how often, how far; anything else refused */
export function withNotch(raw: Record<string, unknown>, change: { every?: unknown; ceiling?: unknown; tend?: unknown }): Record<string, unknown> | { error: string } {
  if (change.tend !== undefined) {
    // his sentence for what it does between his visits: 200 letters at most; empty lets it go
    if (typeof change.tend !== "string") return { error: "tend is a sentence" };
    const t = change.tend.replace(/\s+/g, " ").trim().slice(0, 200);
    const { tend: _old, ...rest } = raw;
    return t ? { ...rest, tend: t } : rest;
  }
  if (change.every !== undefined) {
    const n = Number(change.every);
    if (!Number.isFinite(n) || n < MIN_EVERY || n > 7 * 86400) return { error: `every is between ${MIN_EVERY} s and a week` };
    return { ...raw, pulse: { ...(raw.pulse && typeof raw.pulse === "object" ? raw.pulse as object : {}), every: Math.round(n) } };
  }
  if (change.ceiling !== undefined) {
    if (!CEILINGS.includes(change.ceiling as Ceiling)) return { error: `ceiling is one of ${CEILINGS.join(", ")}` };
    const c = change.ceiling as Ceiling, verbs = CEILINGS.slice(0, CEILINGS.indexOf(c) + 1);
    return { ...raw, ceiling: c, verbs };
  }
  return { error: "a notch is every, ceiling or tend" };
}

/** a notch pressed on a piece's back: its recipe file rewritten (checked first; the watch reads it again) */
export function setNotch(cwd: string, name: string, change: { every?: unknown; ceiling?: unknown; tend?: unknown }): { ok?: true; error?: string } {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) return { error: "no such piece" };
  const f = join(cwd, DIR, `${name}.json`);
  let raw: Record<string, unknown>;
  // a recipe that is a link, or a .sol/pieces that leads out, is not read (it could be any file)
  try { if (!inside(cwd, join(DIR, `${name}.json`)) || lstatSync(f).isSymbolicLink()) return { error: `no recipe for ${name}` }; } catch { return { error: `no recipe for ${name}` }; }
  try { raw = JSON.parse(readFileSync(f, "utf8")); } catch { return { error: `no recipe for ${name}` }; }
  const next = withNotch(raw, change);
  if ("error" in next) return { error: next.error as string };
  const ok = readRecipe(next, `${name}.json`);
  if ("error" in ok) return { error: ok.error };
  try { writeInPieces(cwd, `${name}.json`, JSON.stringify(next, null, 2) + "\n"); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  return { ok: true };
}
