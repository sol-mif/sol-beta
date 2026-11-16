// Who leads a label, from Cowork (#117, reshaped by #438). A setting (who leads each label; the night job's hour; the
// reviewers) is the project's, kept in its settings (`.sol/project.json` in its record, project.ts, #428), and changes
// by a proposal the people it names agree to: here, the leads the label has now and the ones it would have. A change to
// how Sol works (code, the labels and their paths, the harness, the workflows) goes through Work: a take, a PR.
//
// Nothing here writes to main any more. `.github/CODEOWNERS` keeps the leads because GitHub reads them there to ask a
// lead for a review; it is written from the agreed table by a PR the release runner folds (codeowners.ts). The press
// asks the change of the project (a proposal and its poll), pings who must agree, and says where it stands. Each label
// has one or two leads, people with access to the repo (no bots, no teams).
import { owners, LABELS } from "./claims.js";
import { makeGithubRecord } from "./record.js";
import type { Owners as Table, Proposal } from "./project.js";

export type PressDeps = {
  gh: (args: string[]) => Promise<string>;                 // the GitHub CLI (gh's own sign-in, never a token in Sol)
  login: () => Promise<string>;                            // the person pressing
  team: () => string[];                                    // the team's logins (members.ts), pinged after a press
  ping: (to: string, line: string, repo: string) => boolean;   // a relay ping, kind decision; false when not in sight
  /** the project's owners table in force for this code repository (the record's, else its CODEOWNERS) */
  table: (repo: string) => Promise<Table>;
  /** the change asked of the project: a proposal, settled at once when it names nobody but the asker */
  propose: (repo: string, owners: Table, by: string) => Promise<{ proposal: Proposal } | { error: string }>;
};
export type LeadsDone =
  | { ok: true; repo: string; label: string; leads: string[]; was: string[]; proposal?: { id: string; state: Proposal["state"]; needs: string[] }; unchanged?: boolean; pinged: string[] }
  | { error: string };

export const CODEOWNERS = ".github/CODEOWNERS";
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const HEAD = /^#\s*label\s+([a-z]+)\s*:/i;
const LEADS_LINE = /^(\s*#\s*leads\s*:\s*).*$/i;
const at = (l: string[]) => l.map((x) => `@${x}`).join(" ");

/** each label's leads as CODEOWNERS says them: the owners on its path lines and its `# leads:` line, in order, once
 * each, without the @. A label with no line is an empty list (pure) */
export function leadsOf(codeowners: string): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(LABELS.map((l) => [l, [] as string[]]));
  let label = "";
  for (const raw of String(codeowners ?? "").split("\n")) {
    const line = raw.trim();
    const head = HEAD.exec(line);
    if (head) { label = LABELS.includes(head[1].toLowerCase()) ? head[1].toLowerCase() : ""; continue; }
    if (!label || !line) continue;
    const toks = LEADS_LINE.test(line) ? line.replace(/^#\s*leads\s*:/i, "").trim().split(/\s+/) : line.startsWith("#") ? [] : line.split(/\s+/);
    for (const t of toks) if (t.startsWith("@") && !out[label].includes(t.slice(1))) out[label].push(t.slice(1));
  }
  return out;
}

/** a label's new leads made valid: one or two GitHub logins, no bot, each once. Returns the list or the reason (pure) */
export function cleanLeads(v: unknown): string[] | string {
  if (!Array.isArray(v)) return "the leads are a list of one or two people";
  const out: string[] = [];
  for (const x of v) {
    const l = String(x ?? "").trim().replace(/^@/, "");
    if (!l) continue;
    if (/\[bot\]$/i.test(l) || !LOGIN.test(l)) return `${l} is not a person's GitHub login`;
    if (!out.some((o) => o.toLowerCase() === l.toLowerCase())) out.push(l);
  }
  if (!out.length) return "a label needs one lead: somebody triages its issues";
  if (out.length > 2) return "a label has at most two leads";
  return out;
}

/** CODEOWNERS with one label's owners replaced on every line of its section, its paths and the rest untouched. Throws
 * when the label has no line to carry them (pure) */
export function setLeads(codeowners: string, label: string, leads: string[]): string {
  let cur = "", hit = false;
  const next = String(codeowners).split("\n").map((raw) => {
    const line = raw.trim();
    const head = HEAD.exec(line);
    if (head) { cur = head[1].toLowerCase(); return raw; }
    if (cur !== label || !line) return raw;
    if (LEADS_LINE.test(raw)) { hit = true; return raw.replace(LEADS_LINE, `$1${at(leads)}`); }
    if (line.startsWith("#")) return raw;
    const m = /^(.*?\S)(\s+)@\S+(?:\s+@\S+)*\s*$/.exec(raw);   // the paths, the gap, then only owners to the end
    if (!m) return raw;
    hit = true;
    return `${m[1]}${m[2]}${at(leads)}`;
  }).join("\n");
  if (!hit) throw new Error(`CODEOWNERS has no line for ${label}; adding one is a change to how Sol works, a PR`);
  // a setting moves people, never paths: what each label holds must read exactly as before
  if (JSON.stringify(owners(next)) !== JSON.stringify(owners(codeowners))) throw new Error("the paths moved; a press only changes who leads");
  return next;
}

/** the line the team is pinged with (pure) */
export const leadsLine = (label: string, leads: string[], was: string[], by: string) =>
  `${label} is now led by ${leads.join(" and ")} (was ${was.length ? was.join(" and ") : "nobody"}), set by ${by}`;

const why = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);

/** is this login the repo's owner? GitHub's own word: admin on the repo, for the person gh is signed in as */
export async function isOwner(d: Pick<PressDeps, "gh">, repo: string): Promise<boolean> {
  return (await makeGithubRecord(d.gh).members.admin(repo).catch(() => "")).trim() === "true";
}

/** the people who may lead: the repo's collaborators who are users (no bots), sorted */
export async function candidates(d: Pick<PressDeps, "gh">, repo: string): Promise<string[]> {
  const out = await makeGithubRecord(d.gh).members.people(repo);
  return [...new Set(out.split(/\s+/).filter((l) => LOGIN.test(l)))].sort((a, b) => a.localeCompare(b));
}

/** the line a person who must agree is pinged with (pure) */
export const askLine = (label: string, leads: string[], was: string[], by: string) =>
  `${by} proposes ${label} led by ${leads.join(" and ")} (now ${was.length ? was.join(" and ") : "nobody"}): agree or not yet in the project's settings`;

/** the press: who leads a label, asked of the project (a proposal its leads before and after agree to), the people it
 *  waits for pinged; once applied, CODEOWNERS follows by a PR (codeowners.ts) */
export async function pressLeads(d: PressDeps, req: { repo: string; label: string; leads: unknown }): Promise<LeadsDone> {
  const { repo, label } = req;
  if (!LABELS.includes(label)) return { error: `the labels are ${LABELS.join(", ")}` };
  const leads = cleanLeads(req.leads);
  if (typeof leads === "string") return { error: leads };
  try {
    const me = await d.login();
    if (!me) return { error: "who is pressing? sign in to GitHub first" };
    const people = await candidates(d, repo);
    const out = leads.filter((l) => !people.some((p) => p.toLowerCase() === l.toLowerCase()));
    if (out.length) return { error: `${out.join(" and ")} ${out.length > 1 ? "have" : "has"} no access to ${repo}; invite them on GitHub first` };
    const now = leads.map((l) => people.find((p) => p.toLowerCase() === l.toLowerCase()) ?? l);   // GitHub's spelling
    const table = await d.table(repo);
    const was = table[label] ?? [];
    if (was.length === now.length && was.every((x, i) => x.toLowerCase() === now[i].toLowerCase())) return { ok: true, repo, label, leads: now, was, unchanged: true, pinged: [] };
    const r = await d.propose(repo, { ...table, [label]: now }, me);
    if ("error" in r) return { error: r.error };
    const p = r.proposal;
    // applied (it named nobody but me): the team hears it; waiting: the people it waits for are asked
    const line = p.state === "applied" ? leadsLine(label, now, was, me) : askLine(label, now, was, me);
    const all = p.state === "applied" ? [...now, ...was, ...d.team()] : p.needs;
    const to = [...new Set(all.map((l) => l.toLowerCase()))].filter((l) => l !== me.toLowerCase()).map((l) => all.find((x) => x.toLowerCase() === l)!);
    const pinged = to.filter((t) => d.ping(t, line, repo));
    return { ok: true, repo, label, leads: now, was, proposal: { id: p.id, state: p.state, needs: p.needs }, pinged };
  } catch (e) {
    return { error: why(e) };
  }
}
