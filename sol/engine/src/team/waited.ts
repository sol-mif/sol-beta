// The night pass's line (#1128 step 8): "waited all day: <login> 2, <login> 1", from People's read (team/people.ts
// peopleRead) of GitHub: each person's waits older than a day (team/waits.ts waitedLine). The night pass
// (sol/review/night.mjs) runs it on its own machine and puts the line in its post on #1128. Hand-overs and asks live on
// each person's Sol (reach's thread), so the line counts reviews and decisions only. Reads only; writes nothing.
//   tsx src/team/waited.ts [--repo owner/name]
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runGh } from "./record.js";
import { openIssues, peopleRead, whoOf, type GhIssue, type GhPr } from "./people.js";
import { waitedLine } from "./waits.js";

const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const file = (p: string) => { try { return readFileSync(join(TOP, p), "utf8"); } catch { return ""; } };

export async function waitedNow(repo?: string, now = Date.now()): Promise<string> {
  const R = repo ? ["--repo", repo] : [];
  const json = async <T,>(args: string[]): Promise<T> => JSON.parse(await runGh([...args, ...R], TOP)) as T;
  let rhythm: { dev?: string[]; beta?: string[] } | null = null;
  try { rhythm = JSON.parse(file(".sol/rhythm.json")); } catch { /* none: CODEOWNERS' leads only */ }
  const codeowners = file(".github/CODEOWNERS");
  const [open, prs] = await Promise.all([
    json<GhIssue[]>(openIssues("number,title,url,assignees,labels,createdAt,updatedAt")),
    json<GhPr[]>(["pr", "list", "--state", "open", "--json", "number,title,url,body,author,isDraft,createdAt,reviewRequests,headRefName", "--limit", "200"]),
  ]);
  const r = peopleRead({ logins: whoOf(rhythm, codeowners), me: "", tools: false, codeowners, open, prs, merged: [], closed: [], thread: [], holds: [], today: now, now });
  return waitedLine(r, now);
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2), i = a.indexOf("--repo");
  waitedNow(i >= 0 ? a[i + 1] : undefined).then((l) => { console.log(l); process.exit(0); },
    (e) => { console.error(`waited: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); process.exit(1); });
}
