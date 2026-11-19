// "This broke" (#421, part of #413, team flow v2): anyone who finds that a change broke something says so with one
// press in Cowork (on the change's line in build updates, or on a person's page), or their agent with the tool
// `this_broke`. The change's PR gets the label `broke` and one signed comment saying what broke, and its author and the
// beta reviewers (the rhythm's `beta`, Frank) each get a card. A merged change then gets a revert PR (#1562, part of
// #1559), opened through GitHub's `revertPullRequest`, assigned to its author and never merged by a machine: its author or
// a person merges it, and the day's release holds nothing (release.ts). A second press opens no second revert while one
// titled `(#<n> broke)` is open; when GitHub will not open one, one comment on the PR says why and the mark stands. The
// label still counts for the beta pass: while a merged change wears it, `brokenIn(release)` names it for any release that
// holds it, and the beta pass (#419) refuses that release. Taking the label off on GitHub, once it is fixed, ends it.
// Everything that touches GitHub comes in as a function, so the tests run with fakes. Run as a program by the night pass
// (sol/review/night, #1128) for a serious finding: `node dist/team/broke.js <pr> --why "<text>" [--repo o/n] [--dry-run]`.
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type TonightDeps, rhythmOf, addLabel, oneLine, REPO } from "./tonight.js";
import { makeGithubRecord, runGh } from "./record.js";
import { ownGhOnPath } from "./gh.js";
import { activeRoom } from "./settings.js";
import { readTeam, relayLink } from "./night.js";

export const BROKE = "broke";

export type BrokeDeps = Pick<TonightDeps, "me" | "gh" | "now" | "ping"> & {
  /** GitHub's GraphQL API, its answer's text (none: through `gh api graphql`) */
  graphql?: (query: string, vars: Record<string, string>) => Promise<string>;
};

/** the issue a revert belongs to when its PR names none */
export const REVERT_ISSUE = 1562;

/** a revert's title (pure); the `(#<n> broke)` in it is how a second press finds it */
export const revertTitle = (title: string, n: number) => `Revert "${oneLine(title, 160)}" (#${n} broke)`;

/** a revert's body (pure): the finding, its issue, what to try, signed as the agent */
export const revertWords = (n: number, why: string, issue: number, author: string, login: string) =>
  `**What changed**: this takes #${n} back out of main, because it broke: ${why}\n\n` +
  `**Issue**: Part of #${issue}\n\n` +
  `**What to try**: on a Sol running this, what broke in #${n} no longer happens; #${n}'s change comes back as a new PR with its fix.\n\n` +
  `Opened by the night pass (#1562), never merged by it: ${author ? `@${author}` : "its author"} or a person merges it.\n\n— ${login}'s agent`;

/** the issue a PR names (pure): the first it closes, else the first "Fixes / Closes / Resolves / Part of #n" in its body */
export function issueOf(pr: { body?: string; closingIssuesReferences?: { number?: number }[] }): number {
  const c = pr.closingIssuesReferences?.find((x) => Number.isInteger(x?.number))?.number;
  if (c) return c;
  const m = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|part of)\s+#(\d+)/i.exec(String(pr.body ?? ""));
  return m ? Number(m[1]) : REVERT_ISSUE;
}

const REVERT = "mutation($id: ID!, $title: String!, $body: String!) { revertPullRequest(input: { pullRequestId: $id, title: $title, body: $body }) { revertPullRequest { number url } } }";

/** what broke, said on the PR (pure): signed by the person, or as their agent */
export const brokeWords = (why: string, login: string, agent: boolean) => `**This broke**: ${why}\n\n— ${login}${agent ? "'s agent" : ""}`;

/** a change marked broken: the label, the comment, a card to its author and the beta reviewers. Who was told comes back */
export async function thisBroke(d: BrokeDeps, a: { repo: string; number: number; why: unknown; agent: boolean }): Promise<{ url: string; told: string[]; revert?: { number: number; url: string; already?: true } | { error: string } }> {
  const me = d.me();
  if (!me) throw new Error("GitHub is not signed in on this Mac");
  if (!REPO.test(a.repo)) throw new Error(`not a repository: ${a.repo}`);
  if (!Number.isInteger(a.number) || a.number <= 0) throw new Error("which change? its PR number");
  const why = oneLine(a.why, 300);
  if (!why) throw new Error("say in a line what broke");
  let pr: { number?: number; url?: string; author?: { login?: string }; id?: string; title?: string; state?: string; body?: string; closingIssuesReferences?: { number?: number }[] };
  try { pr = JSON.parse(await d.gh(["pr", "view", String(a.number), "--repo", a.repo, "--json", "number,url,author,id,title,state,body,closingIssuesReferences"]) || "{}"); }
  catch { throw new Error(`#${a.number} is not a pull request in ${a.repo}`); }
  await addLabel(d.gh, a.repo, a.number, BROKE);
  await d.gh(["pr", "comment", String(a.number), "--repo", a.repo, "--body", brokeWords(why, me, a.agent)]);
  const rhythm = await rhythmOf(d, a.repo).catch(() => null);
  const to: string[] = [];
  for (const who of [pr.author?.login ?? "", ...(rhythm?.beta ?? [])]) {
    if (who && who.toLowerCase() !== me.toLowerCase() && !to.some((x) => x.toLowerCase() === who.toLowerCase())) to.push(who);
  }
  for (const who of to) d.ping?.({ to: who, line: `#${a.number} broke: ${why} (${me}${a.agent ? "'s agent" : ""})`, issue: a.number, repo: a.repo });
  const revert = pr.state === "MERGED" ? await openRevert(d, a.repo, a.number, why, me, pr) : undefined;
  return { url: String(pr.url ?? ""), told: to, ...(revert ? { revert } : {}) };
}

/** the revert PR of a merged change marked broke (#1562): one open already is kept; GitHub refusing leaves one comment */
async function openRevert(d: BrokeDeps, repo: string, n: number, why: string, me: string,
  pr: { id?: string; title?: string; author?: { login?: string }; body?: string; closingIssuesReferences?: { number?: number }[] }): Promise<{ number: number; url: string; already?: true } | { error: string }> {
  const graphql = d.graphql ?? ((query, vars) => d.gh(["api", "graphql", "-f", `query=${query}`, ...Object.entries(vars).flatMap(([k, v]) => ["-f", `${k}=${v}`])]));
  const author = String(pr.author?.login ?? "");
  try {
    const open = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "open", "--search", `"(#${n} broke)" in:title`, "--json", "number,title,url,headRefName,isCrossRepository"]) || "[]") as { number: number; title?: string; url?: string; headRefName?: string; isCrossRepository?: boolean }[];
    // ours only: the title and GitHub's own revert branch in this repository, so a PR merely titled so, or one from a
    // fork, does not stand in for it
    const had = open.find((p) => String(p.title ?? "").includes(`(#${n} broke)`) && String(p.headRefName ?? "").startsWith(`revert-${n}-`) && p.isCrossRepository === false);
    if (had) return { number: had.number, url: String(had.url ?? ""), already: true };
    if (!pr.id) throw new Error("GitHub gave no id for the PR");
    const got = JSON.parse(await graphql(REVERT, { id: pr.id, title: revertTitle(String(pr.title ?? ""), n), body: revertWords(n, why, issueOf(pr), author, me) }) || "{}");
    const made = got?.data?.revertPullRequest?.revertPullRequest;
    if (!made?.number) throw new Error(firstError(got) || "GitHub opened no revert");
    if (author) await d.gh(["pr", "edit", String(made.number), "--repo", repo, "--add-assignee", author]).catch(() => {});
    return { number: Number(made.number), url: String(made.url ?? "") };
  } catch (e) {
    const no = oneLine(e instanceof Error ? e.message.split("\n")[0] : String(e), 200);
    await d.gh(["pr", "comment", String(n), "--repo", repo, "--body", `**No revert opened**: GitHub would not open one (${no}); the broke mark stands. Revert #${n} by hand, or fix it.\n\n— ${me}'s agent`]).catch(() => {});
    return { error: no };
  }
}

const firstError = (got: { errors?: { message?: string }[] }) => String(got?.errors?.[0]?.message ?? "");

/** a compare's status says the release holds the commit (pure): the release is the commit or comes after it */
export const holds = (status: string) => status === "ahead" || status === "identical";

/** the changes marked broken that a release holds (for #419's beta pass): merged PRs that still wear `broke` and whose
 *  merge commit the release reaches. A question GitHub does not answer counts as held, so a pass is refused, never let
 *  through by a hiccup. With `since` (the 9am release, #1128), only those the release `since` does not hold yet: a
 *  change already out in an older release is not this release's news */
export async function brokenIn(d: Pick<BrokeDeps, "gh">, repo: string, release: string, since?: string): Promise<{ number: number; title: string; url: string }[]> {
  if (!REPO.test(repo)) throw new Error(`not a repository: ${repo}`);
  const ref = (x: string) => /^[A-Za-z0-9._\/-]{1,120}$/.test(x) && !x.includes("..");
  if (!ref(release)) throw new Error(`not a release: ${release}`);
  if (since !== undefined && !ref(since)) throw new Error(`not a release: ${since}`);
  const prs = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "merged", "--label", BROKE, "--limit", "100", "--json", "number,title,url,mergeCommit"]) || "[]") as
    { number: number; title?: string; url?: string; mergeCommit?: { oid?: string } | null }[];
  const out: { number: number; title: string; url: string }[] = [];
  for (const p of prs) {
    const oid = String(p.mergeCommit?.oid ?? "");
    let held = true;
    if (/^[0-9a-f]{40}$/.test(oid)) {
      try { held = holds((await d.gh(["api", `repos/${repo}/compare/${oid}...${release}`, "--jq", ".status"])).trim()); } catch { held = true; }
      // out already in `since`: an unanswered question counts as not out, so the newer release is held
      if (held && since) { try { if (holds((await d.gh(["api", `repos/${repo}/compare/${oid}...${since}`, "--jq", ".status"])).trim())) held = false; } catch { /* held */ } }
    }
    if (held) out.push({ number: p.number, title: oneLine(p.title, 160), url: String(p.url ?? "") });
  }
  return out;
}

// ---- run as a program: node dist/team/broke.js <pr> --why "<text>" [--repo owner/name] [--dry-run] ----

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

async function main(argv: string[]): Promise<number> {
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };
  const number = Number(argv.find((a, i) => /^#?\d+$/.test(a) && !["--why", "--repo"].includes(argv[i - 1]))?.replace("#", ""));
  const why = val("--why");
  if (!Number.isInteger(number) || number <= 0 || !why) { console.error('broke: node dist/team/broke.js <pr> --why "<what broke>" [--repo owner/name] [--dry-run]'); return 2; }
  ownGhOnPath();
  const gh = (args: string[]) => runGh(args, ROOT);
  const team = readTeam();
  const repo = (val("--repo") || await makeGithubRecord(gh).members.room().catch(() => "")).trim();
  const login = (team.me.login || await makeGithubRecord(gh).who.login().catch(() => "")).trim();
  if (argv.includes("--dry-run")) { console.log(`broke: would mark #${number} of ${repo} broke as ${login}'s agent: ${oneLine(why, 300)}`); return 0; }
  if (!team.speak.github) { console.error(`broke: #${number} not marked: my agent may not speak on GitHub (Settings, my agent)`); return 3; }
  const link = await relayLink(login, activeRoom(team).code);
  try {
    const r = await thisBroke({ me: () => login, gh, now: () => new Date(), ping: (p) => { link?.send("ping", { to: p.to, pingKind: "decision", line: p.line, issue: p.issue, repo: p.repo }); } },
      { repo, number, why, agent: true });
    const rev = !r.revert ? "" : "error" in r.revert ? `; no revert opened (${r.revert.error})` : `; revert #${r.revert.number} ${r.revert.already ? "open already" : "opened"}`;
    console.log(`broke: #${number} marked; ${r.told.length ? `${link ? "told" : "not told (the relay is not in sight)"} ${r.told.join(", ")}` : "nobody else to tell"}${rev}`);
    return 0;
  } finally { if (link) { await new Promise((ok) => setTimeout(ok, 500)); link.stop(); } }   // the cards leave before the socket closes
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`broke: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
