// Every change belongs to an issue (#438, F1 of #413): a PR names the issue it is part of, the way the board ties them
// (board.ts): "#N" in its title or body ("Part of #N", "Fixes #N"), or in its branch, either as "#N" or as a last
// segment that starts or ends with the number (`marco/31-see`, `marco/product-f1-codeowners-written-438`, as Take
// makes them). The one PR that names none is the settings PR (codeowners.ts): it belongs to the proposal it says.
// ci.yml runs this on every PR: node sol/engine/src/team/belongs.ts, with PR_TITLE, PR_BODY and PR_BRANCH in its env.
// Pure but for the run at the end; no imports, so plain node runs it without the engine's packages.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS_BRANCH = "sol-settings/codeowners", SETTING_TRAILER = /^Sol-Setting: owners\s*$/m;   // codeowners.ts

/** the issues a PR names (pure), or "setting" for the settings PR */
export function issuesOf(pr: { title?: string; body?: string; branch?: string }): number[] | "setting" {
  const title = String(pr.title ?? ""), body = String(pr.body ?? ""), branch = String(pr.branch ?? "");
  if (branch === SETTINGS_BRANCH && SETTING_TRAILER.test(body)) return "setting";
  const out = new Set<number>();
  for (const t of [title, body, branch]) for (const m of t.matchAll(/#(\d{1,6})\b/g)) out.add(Number(m[1]));
  const last = branch.split("/").pop() ?? "";
  const lead = /^(\d{1,6})(?:-|$)/.exec(last), tail = /-(\d{1,6})$/.exec(last);
  if (lead) out.add(Number(lead[1]));
  if (tail) out.add(Number(tail[1]));
  return [...out].filter((n) => n > 0);
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const r = issuesOf({ title: process.env.PR_TITLE, body: process.env.PR_BODY, branch: process.env.PR_BRANCH });
  if (r === "setting") { console.log("belongs: the settings PR, written from the project's owners"); process.exit(0); }
  if (!r.length) {
    console.error('belongs: this PR names no issue. Every change belongs to one: say "Part of #n" or "Fixes #n" in its body (bash sol/take <n> makes the branch)');
    process.exit(1);
  }
  console.log(`belongs: part of ${r.map((n) => `#${n}`).join(", ")}`);
}
