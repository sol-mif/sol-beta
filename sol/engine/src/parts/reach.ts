// Reach (#1166, team/reach.ts): my agent asks a teammate's agent, theirs answers on its own; hand-overs between agents;
// the Agents' room. Wired here: the relay's `agents` kind heard, an ask for me answered in a bare session held as
// #1151's woken ones (marked `woken: "others"` before it starts: work/runs.ts holds every run of it bare), and the
// thread read. GET /agents → { me, answering, off (why not, #1703), tools, room, thread, holds }: tools and room are the two switches (#1276). Read-only
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hostname } from "node:os";
import type { Parts } from "../parts.js";
import { startReach, heard, threadNow, answering, answeringWhy, asksWhy, tallyNow, heldCard, lateCard, askCard, type Ask, type Given, type Held, type Answer, type Refused, type Reply, type Entry } from "../team/reach.js";
import * as stage from "../work/blocks.js";
import { placeFor, type Seat } from "../work/asks.js";
import { reachTools, reachRoom } from "../settings.js";
import { getTeam } from "../team/settings.js";
import { holdsOf } from "../team/reach.js";
import { onRelay, sendRelay, hubLogin } from "../team/relay.js";
import { runsNow } from "../team/runs.js";
import { membersNow } from "../team/agents.js";
import { driftFor } from "../team/drift.js";
import { versionNow } from "../version.js";
import { quietGh } from "../quiet.js";
import { STATE_DIR, mark } from "../work/state.js";
import { getRun } from "../work/runs.js";
import { sessionItems, sessionInfo, workSessions } from "../work/sessions.js";
import { giveTool } from "../work/tools.js";
import { sayWork, nameWhenWritten } from "../work/wire.js";

const run = promisify(execFile);
// the repository: four up from src/parts/ under tsx, dist/parts/ when built
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const git = (args: string[]) => run("git", args, { cwd: TOP, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }).then((r) => r.stdout).catch(() => "");
const gh = (args: string[]) => Promise.resolve().then(() => quietGh(args)).then(() => run("gh", args, { cwd: TOP, timeout: 15_000 })).then((r) => r.stdout).catch(() => "");

/** this Sol's state, read-only, as words: what an answering session may say */
async function state(): Promise<string> {
  const me = hubLogin();
  const v = versionNow();
  const [branch, head, log, prs, issues] = await Promise.all([
    git(["branch", "--show-current"]), git(["rev-parse", "HEAD"]), git(["log", "--oneline", "-8"]),
    gh(["pr", "list", "--author", "@me", "--state", "open", "--json", "number,title,headRefName,isDraft", "--limit", "10"]),
    gh(["issue", "list", "--assignee", "@me", "--state", "open", "--json", "number,title", "--limit", "15"]),
  ]);
  const mine = runsNow().filter((w) => w.person.toLowerCase() === me.toLowerCase());
  const tag = v?.release ?? "";
  const drift = tag ? driftFor(me, tag) : null;
  const held = holdsOf(threadNow()).filter((h) => h.holder.toLowerCase() === me.toLowerCase() || (h.state === "open" && h.to.toLowerCase() === me.toLowerCase()));
  const list = (s: string, f: (x: any) => string) => { try { const a = JSON.parse(s); return Array.isArray(a) && a.length ? a.map(f).join("\n") : "none"; } catch { return "not readable now"; } };
  return [
    `person: ${me}`,
    `release this Sol runs: ${v ? `${v.release} (commit ${v.commit}${v.mine ? `, ${v.mine} of its own on top` : ""}${v.behind ? `, ${v.behind} behind` : ""})` : "unknown"}`,
    `branch: ${branch.trim() || "?"}, HEAD ${head.trim().slice(0, 12)}`,
    `what this person's Sols said on the relay (runs): ${mine.length ? mine.map((w) => `${w.machine}: ${w.tag || "no tag"} ${w.branch}${w.channel ? ` ${w.channel}` : ""}${w.why ? `, did not install itself: ${w.why}` : ", installed"} (${new Date(w.at).toISOString().slice(0, 16)}Z)`).join("; ") : "none heard"}`,
    `drift: ${drift ? `${drift.off} file(s) off the iteration, ${drift.iterations} iteration(s) old` : "none known"}`,
    "last commits:", log.trim() || "none",
    "open PRs by this person:", list(prs, (p) => `#${p.number} ${p.title} (${p.headRefName}${p.isDraft ? ", draft" : ""})`),
    "open issues assigned to this person:", list(issues, (i) => `#${i.number} ${i.title}`),
    "hand-overs this person holds or is asked to take:", held.length ? held.map((h) => `${h.issue ? `#${h.issue} ` : ""}${h.what.split("\n")[0].slice(0, 100)} (${h.state}, from ${h.from})`).join("\n") : "none",
  ].join("\n");
}

/** a committed file at HEAD, cut */
async function file(path: string): Promise<string> {
  const text = await git(["show", `HEAD:${path}`]);
  if (!text) return `no committed file ${path} here`;
  return text.length > 60_000 ? `${text.slice(0, 60_000)}\n[cut at 60000 characters]` : text;
}

async function lastWords(id: string): Promise<string> {
  const r = getRun(id);
  const list = r ? r.items.list : (await sessionItems(id)).list;
  const you = list.filter((i: any) => i.kind === "you" && String(i.text ?? "").trim());
  return String(you[you.length - 1]?.text ?? "");
}

// ---- where a word lands for the person (#1298) ----
/** a session counts as where the person is for this long after its last turn */
const HERE_MS = 8 * 3600_000;
/** the person's sessions as placement reads them: not woken by others, not archived, a turn within HERE_MS */
async function seats(): Promise<Seat[]> {
  const { sessions } = await workSessions();
  const now = Date.now();
  // a side session (marked parent) builds in the background: never where the person is
  return sessions.filter((s) => !s.woken && !s.archived && !s.parent && now - s.updatedAt < HERE_MS)
    .map((s) => ({ id: s.id, issue: getRun(s.id)?.issue ?? null, last: s.updatedAt, ...(s.gone ? { gone: true } : {}) }));
}
const turn = async (sessionId: string, text: string) => {
  if (!(await sessionInfo(sessionId).catch(() => undefined)) && !getRun(sessionId)) throw new Error("no such session");
  await sayWork({ sessionId, text });
};
/** E4: a hand-over or an offer for me, a card that asks in the session where the person is; one block, carried */
async function arrived(h: Held, sessionId?: string): Promise<boolean> {
  const to = sessionId ?? placeFor(h.issue, await seats().catch(() => []));
  if (!to) return false;
  const c = heldCard(h), w = await stage.whoFor(to), by = { ...w, by: `${h.from}'s agent` };
  const had = stage.getBlock(w.project, c.id);
  if (had) { if (!had.sessions.includes(to)) stage.place({ ...by, sessionId: had.sessions[0] ?? to }, { id: c.id, carry: to }); return true; }
  // person: never a ghost; the press is what it is there for
  stage.compose(by, { id: c.id, kind: "card", title: c.title, body: c.body, person: true, asks: c.asks });
  return true;
}
/** why a session ended with nothing said: its last error line (a Claude not signed in ends at once, with one) */
async function failedWhy(id: string): Promise<string> {
  const r = getRun(id);
  const list = r ? r.items.list : (await sessionItems(id)).list;
  const errs = list.filter((i: any) => i.kind === "error" && String(i.text ?? "").trim());
  return String(errs[errs.length - 1]?.text ?? "").split("\n")[0].slice(0, 160);
}
/** an ask my answering session could not take (#1703, a Sol on Codex): a card where the person is. It asks nothing and
 *  starts nothing; the person's own agent answers it there with answer_ask, when they want it to */
async function askHere(a: Ask, why: string): Promise<boolean> {
  const to = placeFor(undefined, await seats().catch(() => []));
  if (!to) return false;
  const c = askCard(a, why), w = await stage.whoFor(to);
  if (stage.getBlock(w.project, c.id)) return true;
  stage.compose({ ...w, by: `${a.from}'s agent` }, { id: c.id, kind: "card", title: c.title, body: c.body, person: true });
  return true;
}
/** E3: a late answer or reply, a card in the session that asked and a turn there; a session gone, the Room's top */
async function late(sessionId: string, e: Answer | Refused | Reply, of: Entry | undefined) {
  const c = lateCard(e, of);
  // the turn first: the agent has the words, so the card is settled, nothing to answer. Only when the session is gone
  // does the card ask (the fixed choices, Frank's agent on #1298), so it waits on top of the Room
  const told = await turn(sessionId, c.text).then(() => true, () => false);
  try {
    const w = await stage.whoFor(sessionId);
    stage.compose({ ...w, by: `${e.from}'s agent` }, { kind: "card", title: c.title, body: c.body, person: true,
      ...(told ? {} : { asks: { q: "Follow it up?", ref: { kind: "answer" as const, id: e.id }, from: { login: e.from, agent: true }, ...(c.about ? { about: c.about } : {}) } }) });
  } catch (err) { console.error("reach: a late answer's card was not made", err); }
}

export default function (p: Parts) {
  p.atStart(() => {
    const home = join(STATE_DIR, "reach", "work");
    startReach({
      me: () => hubLogin(),
      where: () => hostname().split(".")[0].slice(0, 40),
      // a teammate is a member of my group in use (#1692): its GitHub org's or cloud group's list; no group, or a list
      // Sol cannot read or that is empty, lets nobody ask (there is nobody to hold the askers to)
      team: async () => { const r = await membersNow(true); return r.source && r.list?.length ? r.list : null; },
      send: (payload) => sendRelay("agents", payload, true),
      say: async (sessionId, text, cwd) => {
        mark(sessionId, { woken: "others" });   // before its first run: bare, as #1151's woken by another person
        await sayWork({ sessionId, text, fresh: true, cwd, mode: "default" });
      },
      give: (sessionId, tools: Given[]) => { for (const t of tools) giveTool(sessionId, t); },
      name: (id, title) => { void nameWhenWritten(id, title); },
      working: (id) => !!getRun(id)?.working,
      lastWords,
      state,
      file,
      file_: join(STATE_DIR, "reach.json"),
      room: join(STATE_DIR, "reach", "room.md"),
      home,
      late: (sid, e, of) => { void late(sid, e, of); },
      arrived,
      askHere,
      failedWhy,
      // my yes to the one question (#1313): their agents may ask mine, in the group I answered for, of any kind (#1703).
      // Who counts as a member is read at each ask (team, above), never the team's own people list (#1692). Not so is
      // said as the reason (#1703), the same words the asker and Settings read
      asked: () => {
        const t = getTeam();
        return asksWhy(t.wakeAsk, t.rooms.find((r) => r.id === t.room)) ?? true;
      },
    });
    onRelay("agents", (m) => heard(m));
  });
  p.route("GET", "/agents", ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ me: hubLogin(), answering: answering(), off: answeringWhy() ?? "", tools: reachTools(), room: reachRoom(), thread: threadNow(), holds: holdsOf(threadNow()), tally: tallyNow() }));
  });
}
