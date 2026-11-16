// "This broke" (#421, part of #413, team flow v2): anyone who finds that a change broke something says so with one
// press in Cowork (on the change's line in build updates, or on a person's page), or their agent with the tool
// `this_broke`. The change's PR gets the label `broke` and one signed comment saying what broke, and its author and the
// beta reviewers (the rhythm's `beta`, Frank) each get a card. The label is what counts: while a merged change wears it,
// `brokenIn(release)` names it for any release that holds it, and the beta pass (#419) refuses that release. Taking the
// label off on GitHub, once it is fixed, is the end of it.
// Everything that touches GitHub comes in as a function, so the tests run with fakes.
import { type TonightDeps, rhythmOf, addLabel, oneLine, REPO } from "./tonight.js";

export const BROKE = "broke";

export type BrokeDeps = Pick<TonightDeps, "me" | "gh" | "now" | "ping">;

/** what broke, said on the PR (pure): signed by the person, or as their agent */
export const brokeWords = (why: string, login: string, agent: boolean) => `**This broke**: ${why}\n\n— ${login}${agent ? "'s agent" : ""}`;

/** a change marked broken: the label, the comment, a card to its author and the beta reviewers. Who was told comes back */
export async function thisBroke(d: BrokeDeps, a: { repo: string; number: number; why: unknown; agent: boolean }): Promise<{ url: string; told: string[] }> {
  const me = d.me();
  if (!me) throw new Error("GitHub is not signed in on this Mac");
  if (!REPO.test(a.repo)) throw new Error(`not a repository: ${a.repo}`);
  if (!Number.isInteger(a.number) || a.number <= 0) throw new Error("which change? its PR number");
  const why = oneLine(a.why, 300);
  if (!why) throw new Error("say in a line what broke");
  let pr: { number?: number; url?: string; author?: { login?: string } };
  try { pr = JSON.parse(await d.gh(["pr", "view", String(a.number), "--repo", a.repo, "--json", "number,url,author"]) || "{}"); }
  catch { throw new Error(`#${a.number} is not a pull request in ${a.repo}`); }
  await addLabel(d.gh, a.repo, a.number, BROKE);
  await d.gh(["pr", "comment", String(a.number), "--repo", a.repo, "--body", brokeWords(why, me, a.agent)]);
  const rhythm = await rhythmOf(d, a.repo).catch(() => null);
  const to: string[] = [];
  for (const who of [pr.author?.login ?? "", ...(rhythm?.beta ?? [])]) {
    if (who && who.toLowerCase() !== me.toLowerCase() && !to.some((x) => x.toLowerCase() === who.toLowerCase())) to.push(who);
  }
  for (const who of to) d.ping?.({ to: who, line: `#${a.number} broke: ${why} (${me}${a.agent ? "'s agent" : ""})`, issue: a.number, repo: a.repo });
  return { url: String(pr.url ?? ""), told: to };
}

/** a compare's status says the release holds the commit (pure): the release is the commit or comes after it */
export const holds = (status: string) => status === "ahead" || status === "identical";

/** the changes marked broken that a release holds (for #419's beta pass): merged PRs that still wear `broke` and whose
 *  merge commit the release reaches. A question GitHub does not answer counts as held, so a pass is refused, never let
 *  through by a hiccup */
export async function brokenIn(d: Pick<BrokeDeps, "gh">, repo: string, release: string): Promise<{ number: number; title: string; url: string }[]> {
  if (!REPO.test(repo)) throw new Error(`not a repository: ${repo}`);
  if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(release) || release.includes("..")) throw new Error(`not a release: ${release}`);
  const prs = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "merged", "--label", BROKE, "--limit", "100", "--json", "number,title,url,mergeCommit"]) || "[]") as
    { number: number; title?: string; url?: string; mergeCommit?: { oid?: string } | null }[];
  const out: { number: number; title: string; url: string }[] = [];
  for (const p of prs) {
    const oid = String(p.mergeCommit?.oid ?? "");
    let held = true;
    if (/^[0-9a-f]{40}$/.test(oid)) {
      try { held = holds((await d.gh(["api", `repos/${repo}/compare/${oid}...${release}`, "--jq", ".status"])).trim()); } catch { held = true; }
    }
    if (held) out.push({ number: p.number, title: oneLine(p.title, 160), url: String(p.url ?? "") });
  }
  return out;
}
