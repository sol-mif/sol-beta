// Applications for the jobs folder: one folder a posting, applications/<company>-<role>/, and the board.
//
//   posting.md   the posting saved (its text), with a head the agent writes and the engine reads:
//                  # <role> at <company>
//                  - company: … - role: … - link: … - seen: YYYY-MM-DD - where: … - cover: yes|no
//                  - score: 0..10 (the run's, with reasons in fit.md) - jev: 0..1 (Jev's "worth his time")
//                  - state: found | passed | drafted | applied | skipped - next: the next step, in words
//   fit.md       where he is strong, where thin, said straight
//   answers.md   each question of the form, drafted in his voice
//   cover.md     only when the posting asks for one
//   board.md     (in applications/) the table: role, company, state, date, next step
//
// The agent never submits a form and never makes an account: "open the form" opens the posting's page for him.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jevKey, JEV_URL } from "../jev.js";

export const APP_STATES = ["found", "passed", "drafted", "applied", "skipped"] as const;
export type AppState = (typeof APP_STATES)[number];
const HEAD = ["company", "role", "link", "seen", "where", "cover", "score", "jev", "state", "next"] as const;
export type App = { slug: string; company: string; role: string; link: string; seen: string; where: string; cover: string; score: string; jev: string; state: AppState; next: string; files: string[] };

export const appsDir = (folder: string) => join(folder, "applications");

/** a head line, `- key: value`, also as Markdown writes it in bold (`- **Company:** X`, `- **company**: X`) */
const HEAD_LINE = /^\s*[-*]\s+(?:\*\*|__)?([a-z]+)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*?)\s*$/i;
/** a posting.md's head, read (pure) */
export function parsePosting(slug: string, text: string): Omit<App, "files"> {
  const a: Omit<App, "files"> = { slug, company: "", role: "", link: "", seen: "", where: "", cover: "no", score: "", jev: "", state: "found", next: "" };
  for (const line of text.split("\n").slice(0, 40)) {
    const f = HEAD_LINE.exec(line);
    const k = f?.[1].toLowerCase();
    if (!f || !(HEAD as readonly string[]).includes(k!)) continue;
    if (k === "state") a.state = (APP_STATES as readonly string[]).includes(f[2].toLowerCase()) ? (f[2].toLowerCase() as AppState) : "found";
    else (a as any)[k!] = f[2];
  }
  if (!a.company || !a.role) {
    const h = /^#\s+(.+?)\s+at\s+(.+?)\s*$/m.exec(text);
    if (h) { a.role ||= h[1]; a.company ||= h[2]; }
  }
  return a;
}
/** the posting's own title: its first `# ` heading, "" when it has none (pure) */
export const postingTitle = (text: string) => /^#[ \t]+(\S.*?)[ \t]*$/m.exec(text)?.[1] ?? "";
/** the Apply card's title from what is known, never an empty "at" (pure): role and company; else the posting's own
 *  title; else the role, or the company; else "Apply" alone */
export function applyTitle(a: Pick<App, "role" | "company">, title = ""): string {
  const role = a.role.trim(), company = a.company.trim(), own = title.trim();
  if (role && company) return `Apply: ${role} at ${company}`;
  if (own) return `Apply: ${own}`;
  if (role) return `Apply: ${role}`;
  if (company) return `Apply to ${company}`;
  return "Apply";
}
/** posting.md with some head lines set, the rest as written (pure); a missing line is added under the heading */
export function setHead(text: string, set: Partial<Record<(typeof HEAD)[number], string>>): string {
  const lines = text.split("\n"), done = new Set<string>();
  const out = lines.map((line) => {
    const f = /^(\s*[-*]\s+)([a-z]+)(\s*:\s*)(.*)$/i.exec(line);
    const k = f?.[2].toLowerCase();
    if (!f || !(k! in set) || done.has(k!)) return line;
    done.add(k!);
    return `${f[1]}${f[2]}${f[3]}${set[k as keyof typeof set]}`;
  });
  const missing = Object.entries(set).filter(([k]) => !done.has(k)).map(([k, v]) => `- ${k}: ${v}`);
  if (!missing.length) return out.join("\n");
  const at = out.findIndex((l) => /^#\s/.test(l));
  out.splice(at >= 0 ? at + 1 : 0, 0, ...missing);
  return out.join("\n");
}

/** the score the run gave, as a number 0..10, or null (pure) */
export const scoreOf = (a: { score: string }) => { const m = /(\d+(?:\.\d+)?)/.exec(a.score); return m ? Math.min(10, Number(m[1])) : null; };

/** the next step a state means (pure) */
export function nextOf(a: Pick<App, "state" | "next">): string {
  if (a.next) return a.next;
  return { found: "being weighed", passed: "none: not worth your time", drafted: "open the form, apply yourself, press applied", applied: "wait; a follow-up in two weeks", skipped: "none" }[a.state];
}

const cell = (s: string) => (s || "-").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
/** the board, a table (pure): newest first, the ones that need him on top */
export function boardMd(apps: App[]): string {
  const order: Record<AppState, number> = { drafted: 0, found: 1, applied: 2, passed: 3, skipped: 4 };
  const rows = [...apps].sort((a, b) => order[a.state] - order[b.state] || b.seen.localeCompare(a.seen));
  return [
    "# Applications",
    "",
    "The agent keeps this table; each row is a folder here. It never submits a form: you apply, then press applied.",
    "",
    "| role | company | state | date | next step |",
    "|------|---------|-------|------|-----------|",
    ...rows.map((a) => `| ${cell(a.role)} | ${cell(a.company)} | ${a.state} | ${cell(a.seen)} | ${cell(nextOf(a))} |`),
    "",
  ].join("\n");
}

// ---- on disk ----
export function readApp(folder: string, slug: string): App | null {
  const dir = join(appsDir(folder), slug);
  let text: string;
  try { text = readFileSync(join(dir, "posting.md"), "utf8"); } catch { return null; }
  let files: string[] = [];
  try { files = readdirSync(dir).filter((n) => n.endsWith(".md")).sort(); } catch { /* gone */ }
  return { ...parsePosting(slug, text), files };
}
export function readApps(folder: string): App[] {
  let names: string[] = [];
  try { names = readdirSync(appsDir(folder)).filter((n) => !n.startsWith(".") && statSync(join(appsDir(folder), n)).isDirectory()); } catch { return []; }
  return names.map((n) => readApp(folder, n)).filter((a): a is App => !!a);
}
export function setApp(folder: string, slug: string, set: Partial<Record<(typeof HEAD)[number], string>>) {
  const file = join(appsDir(folder), slug, "posting.md");
  const text = readFileSync(file, "utf8"), tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, setHead(text, set));
  renameSync(tmp, file);
}
export function writeBoard(folder: string) {
  mkdirSync(appsDir(folder), { recursive: true });
  const file = join(appsDir(folder), "board.md"), tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, boardMd(readApps(folder)));
  renameSync(tmp, file);
}

/** is there a résumé in resume/? (any file but hidden ones) */
export function hasResume(folder: string): boolean {
  try { return readdirSync(join(folder, "resume")).some((n) => !n.startsWith(".")); } catch { return false; }
}
export const ensureResumeDir = (folder: string) => { if (!existsSync(join(folder, "resume"))) mkdirSync(join(folder, "resume"), { recursive: true }); };

// ---- Jev: is this posting worth his time? One yes/no, as agent/jev.ts asks its own ----
export const WORTH_LINE = 0.5;
export function worthBody(me: string, posting: string) {
  return {
    model: "jev-latest",
    state: { person: me.slice(0, 1500), posting: posting.slice(0, 3000) },
    questions: {
      worth: {
        type: "noul",
        instructions: "Is this posting worth this person's time to apply to?",
        criteria: { true: "the role, level and place fit what the person is looking for, and the person could do it", false: "a different field or level, a place they do not want, a role they could not get, or a posting that is closed" },
      },
    },
  };
}
export type Worth = (me: string, posting: string) => Promise<number | null>;
export function makeWorth(o: { fetch?: typeof fetch; key?: string | null; budget?: number } = {}): Worth | null {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key) return null;
  const f = o.fetch ?? fetch;
  return async (me, posting) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.budget ?? 4000);
    try {
      const r = await f(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(worthBody(me, posting)), signal: ac.signal });
      if (!r.ok) return null;
      const p = (await r.json() as any)?.answers?.worth?.noul;
      return typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
}

/** which of the new postings get their folder finished: Jev's yes (or, with no Jev, the run's score ≥ 6), best first, at most `top` (pure) */
export function pick(apps: { slug: string; score: number | null; jev: number | null }[], top = 3): { take: string[]; pass: { slug: string; why: string }[] } {
  const judged = apps.map((a) => {
    const yes = a.jev !== null ? a.jev >= WORTH_LINE : (a.score ?? 0) >= 6;
    const why = a.jev !== null ? `Jev ${a.jev.toFixed(2)}${yes ? " ≥ " : " < "}${WORTH_LINE}` : `score ${a.score ?? "?"}/10${yes ? " ≥ 6" : " < 6"} (no Jev)`;
    return { ...a, yes, why, rank: (a.jev ?? (a.score ?? 0) / 10) };
  }).sort((x, y) => y.rank - x.rank || (y.score ?? 0) - (x.score ?? 0));
  const take = judged.filter((a) => a.yes).slice(0, top).map((a) => a.slug);
  return { take, pass: judged.filter((a) => !take.includes(a.slug)).map((a) => ({ slug: a.slug, why: a.yes ? `${a.why}, but past today's top ${top}` : a.why })) };
}
