// People (#1297, team/people.ts): the definitive state by person, one read. GET /team/people → { at, me, tools, people }
// (`repo`: its page, every row its `url` where GitHub has one) for a script or a test; the face asks the same as `team.people` over the socket. `team.people.reply { id, accept }` is a
// press on a hand-over or an offer that waits on me: reach's hand_reply (team/reach.ts reply), only while reach's tools
// are on (#1276). Read-only otherwise.
// The read is kept KEEP_MS (keeper: a drop while a read is in flight is not lost; a failed read gives the last good one
// with `failed` set) and dropped at a pause (a turn ending), when the relay brings an `agents` word (reach's
// thread moved) and when the wake's read of GitHub heard a comment (#1151, team/wake.ts onHeard).
// `holds` on my own card prefers the `now` issue a live Work run here names (allRuns, the one at work first). My card's
// `minutes` are counted here at each turn's end (team/people.ts addSpan) into MINUTES_FILE in the engine's home folder,
// and read at every serve, so they never wait on GitHub's two minutes; everyone else's stay null.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { runGh } from "../team/record.js";
import { peopleOf } from "../team/runs.js";
import { holdsOf, reply, threadNow } from "../team/reach.js";
import { onRelay, hubLogin } from "../team/relay.js";
import { onHeard } from "../team/wake.js";
import { allRuns, getRun, onTurnEnd } from "../work/runs.js";
import { reachTools } from "../settings.js";
import { addSpan, dayStart, keeper, minutesOf, openIssues, othersIssue, peopleRead, whoOf, type GhIssue, type GhPr, type MinutesKept, type PeopleRead } from "../team/people.js";

// the repository: four up from src/parts/ under tsx, dist/parts/ when built
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** how long a read stands before GitHub is asked again */
export const KEEP_MS = 2 * 60_000;

const file = (p: string) => { try { return readFileSync(join(TOP, p), "utf8"); } catch { return ""; } };
const json = async <T,>(args: string[]): Promise<T> => JSON.parse(await runGh(args, TOP)) as T;
const rhythmNow = () => { try { return JSON.parse(file(".sol/rhythm.json")); } catch { return null; } };
const zoneOf = (rhythm: { zone?: unknown } | null) => (typeof rhythm?.zone === "string" ? rhythm.zone : "UTC");
/** the issues this Sol's live Work runs name, the ones at work first (pure but for the runs) */
const running = () => allRuns().filter((r) => r.issue).sort((a, b) => (b.busy ? 1 : 0) - (a.busy ? 1 : 0) || b.since - a.since).map((r) => r.issue as number);
/** who each open issue is given to, as the last read saw them: a turn's end asks here before GitHub */
let givenTo = new Map<number, string[]>();

async function fresh(): Promise<PeopleRead> {
  const rhythm = rhythmNow();
  const codeowners = file(".github/CODEOWNERS");
  const now = Date.now(), today = dayStart(now, zoneOf(rhythm));
  const day = new Date(today - 86_400_000).toISOString().slice(0, 10);   // GitHub's search is by UTC date: a day early, cut here
  const [open, prs, merged, closed] = await Promise.all([
    json<GhIssue[]>(openIssues("number,title,url,assignees,labels,createdAt,updatedAt")),
    json<GhPr[]>(["pr", "list", "--state", "open", "--json", "number,title,url,body,author,isDraft,createdAt,reviewRequests,headRefName", "--limit", "200"]),
    json<GhPr[]>(["pr", "list", "--state", "merged", "--search", `merged:>=${day}`, "--json", "number,title,url,author,mergedAt", "--limit", "100"]),
    json<GhIssue[]>(["issue", "list", "--state", "closed", "--search", `closed:>=${day}`, "--json", "number,title,url,assignees,closedAt", "--limit", "100"]),
  ]);
  givenTo = new Map(open.map((i) => [i.number, (i.assignees ?? []).map((a) => a.login)]));
  const names = Object.fromEntries(peopleOf(TOP).map((p) => [p.login.toLowerCase(), p.name]));
  const thread = threadNow();
  return peopleRead({ logins: whoOf(rhythm, codeowners), names, me: hubLogin(), tools: reachTools(), codeowners,
    open, prs, merged, closed, thread, holds: holdsOf(thread), running: running(), today, now });
}

// ---- my coordination minutes (team/people.ts addSpan): a file of their own beside the engine's other state
let MINUTES_FILE = "";
const readMinutes = (): MinutesKept | null => { try { return JSON.parse(readFileSync(MINUTES_FILE, "utf8")) as MinutesKept; } catch { return null; } };
function writeMinutes(k: MinutesKept) {
  mkdirSync(dirname(MINUTES_FILE), { recursive: true });
  writeFileSync(MINUTES_FILE + ".tmp", JSON.stringify(k));
  renameSync(MINUTES_FILE + ".tmp", MINUTES_FILE);
}
/** a turn ended on a run that names `issue`: its span counts when the issue is given to others and not to me */
async function counted(issue: number, from: number, to: number) {
  const me = hubLogin();
  const who = givenTo.get(issue) ?? await json<{ assignees?: { login: string }[] }>(["issue", "view", String(issue), "--json", "assignees"])
    .then((i) => (i.assignees ?? []).map((a) => a.login)).catch(() => null);
  if (!MINUTES_FILE || !who || !othersIssue(who, me)) return;
  writeMinutes(addSpan(readMinutes() ?? { days: {} }, from, to, zoneOf(rhythmNow())));
}

const kept = keeper(fresh, { keep: KEEP_MS });
const drop = kept.drop;
/** the read, kept KEEP_MS (team/people.ts keeper: a drop in flight is not lost, a failure gives the last good read) */
export async function readPeople(): Promise<PeopleRead> {
  const r = await kept.read();
  const mine = MINUTES_FILE ? minutesOf(readMinutes(), Date.now(), zoneOf(rhythmNow())) : null;
  return { ...r, tools: reachTools(), people: r.people.map((p) => (mine && p.login.toLowerCase() === r.me.toLowerCase() ? { ...p, minutes: mine } : p)) };
}
const said = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));

export default function (p: Parts) {
  p.atStart((e) => {
    MINUTES_FILE = join(e.HOME, "people-minutes.json");
    onTurnEnd(drop);
    onTurnEnd((id) => {
      const r = getRun(id);
      if (r?.issue && r.turnFrom) void counted(r.issue, r.turnFrom, Date.now()).catch(() => { /* a minute not counted is a minute lost, never the run's */ });
    });
    onRelay("agents", drop);
    onHeard(drop);
  });
  p.on("team.people", async (m, h) => {
    try { h.send(h.ws, { type: "team.people", rid: m.rid, ...(await readPeople()) }); }
    catch (err) { h.send(h.ws, { type: "team.people", rid: m.rid, error: said(err) }); }
  });
  p.on("team.people.reply", (m, h) => {
    const r = reachTools() ? reply(String(m.id ?? ""), m.accept === true) : "refused: reach's tools are off (Settings › reach.tools)";
    if (!r.startsWith("refused")) drop();
    h.send(h.ws, { type: "team.people.reply", rid: m.rid, ok: !r.startsWith("refused") && !r.startsWith("reach is not"), said: r });
  });
  p.route("GET", "/team/people", async ({ res }) => {
    try {
      const r = await readPeople();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(r));
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: said(err) }));
    }
  });
}
