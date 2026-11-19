// The wake signal (#1377, the plan on #229 step 5). A wake carries no words: who → whom, a kind (1 GitHub, 2 group chat,
// 3 other) and a link. The hub carries it to that person at once or keeps it the 7 days a ping is (hub-types.ts
// signalOf, relay-hub.ts), and counts it against the sender's day (200, and 30 to any one person).
// On the receiving side a small program, never AI, reads what the link points at: the GitHub thread and its comment, or
// the Discussion. That makes the usual ping card (pings.ts and my dials decide as for any ping). A comment in it that
// starts "@<my login>'s agent" goes to the wake (wake.ts wakeSignalled), under the rules I set there: the narrow
// session, the thread already in its first message. Anything else starts nothing and costs nothing.
// A wake with no link to give, and a chat line (its words are in the chat, not on GitHub), still go as the relay's
// ping: nothing is lost. A Sol hears signals whatever its own switch says (seams/wake.ts); the switch is for sending.
// Behind the wake seam (seams/wake.ts); SOL_WAKE_CARRIER=signal turns it on.
import type { RelayMsg } from "./relay.js";
import { commentOf, type Comment } from "./wake.js";

export type Signal = { to: string; sk: 1 | 2 | 3; link: string; pk?: string };
export type Place = { repo: string; thread: number; comment?: number; discussion?: false } | { repo: string; discussion: true; thread: number; comment?: number };

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const PK = ["clash", "contract", "claim", "decision", "chat"];

/** whether wakes go as signals: SOL_WAKE_CARRIER=signal (read at each ask) */
export const signalOn = (env: NodeJS.ProcessEnv = process.env) => (env.SOL_WAKE_CARRIER ?? "").trim().toLowerCase() === "signal";

/** the GitHub thread, comment or Discussion a link points at (pure), or null */
export function placeOf(link: string): Place | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "github.com") return null;
  const m = /^\/([^/]+\/[^/]+)\/(issues|pull|discussions)\/(\d+)\/?$/.exec(u.pathname);
  if (!m || !REPO.test(m[1])) return null;
  const thread = Number(m[3]);
  if (!Number.isSafeInteger(thread) || thread < 1) return null;
  const c = /^#(issuecomment|discussioncomment)-(\d+)$/.exec(u.hash);
  const comment = c ? Number(c[2]) : undefined;
  return m[2] === "discussions" ? { repo: m[1], discussion: true, thread, ...(comment ? { comment } : {}) } : { repo: m[1], thread, ...(comment ? { comment } : {}) };
}

/** the signal a wake says (pure): who, its kind and its link, or null when there is no link to give (it goes as a ping).
 *  `link` when the caller has one; else the issue or PR of `repo` and `issue` */
export function signalFor(p: Record<string, unknown>): Signal | null {
  const to = typeof p.to === "string" ? p.to : "";
  if (!/^[A-Za-z0-9-]{1,39}$/.test(to)) return null;
  let link = typeof p.link === "string" ? p.link : "";
  const issue = Number(p.issue);
  // a chat line's words are said in the chat, not on the issue it names: it goes as the ping, words and all
  if (!link && (p.pingKind === "chat" || p.pingKind === undefined)) return null;
  if (!link && typeof p.repo === "string" && REPO.test(p.repo) && Number.isSafeInteger(issue) && issue > 0) link = `https://github.com/${p.repo}/issues/${issue}`;
  if (!link) return null;
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== "https:" || link.length > 500) return null;
  const place = u.hostname === "github.com" ? placeOf(link) : null;
  const sk = place ? (place.discussion ? 2 : 1) : u.hostname === "github.com" ? null : 3;
  if (!sk) return null;
  const pk = PK.includes(String(p.pingKind)) ? String(p.pingKind) : undefined;
  return { to, sk, link: u.href, ...(pk ? { pk } : {}) };
}

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
const firstLine = (s: unknown) => clean(String(s ?? "").split("\n").find((l) => l.trim()) ?? "", 200);

export type Fetched = { ping: RelayMsg; comments: Comment[] };

/** what a signal points at, read by a small program (gh, my own sign-in; free): the ping card it makes, with a line
 *  read from the link, and the GitHub comments it points at (the one in its link, or the thread's said since a few
 *  minutes before the signal) for the wake to judge. A read that fails still makes the card, with the link */
export async function fetchSignal(m: RelayMsg, gh: (args: string[]) => Promise<string>): Promise<Fetched> {
  const link = typeof m.link === "string" ? m.link : "";
  const at = typeof m.at === "number" ? m.at : Date.now();
  const base = { kind: "ping" as const, from: m.from, at, to: m.to, ...(typeof m.id === "string" ? { id: m.id } : {}), pingKind: PK.includes(String(m.pk)) ? String(m.pk) : "chat" };
  const place = placeOf(link);
  let line = "", comments: Comment[] = [];
  try {
    if (place && !place.discussion) {
      const issue = JSON.parse(await gh(["api", `repos/${place.repo}/issues/${place.thread}`]));
      let list: unknown[] = [];
      if (place.comment) list = [JSON.parse(await gh(["api", `repos/${place.repo}/issues/comments/${place.comment}`]))];
      else {
        const since = new Date(at - 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
        const got = JSON.parse(await gh(["api", `repos/${place.repo}/issues/${place.thread}/comments?since=${encodeURIComponent(since)}&per_page=100`]));
        list = Array.isArray(got) ? got : [];
      }
      comments = list.map((x) => commentOf(place.repo, x)).filter((c): c is Comment => !!c && c.thread === place.thread);
      const last = comments[comments.length - 1];
      line = `#${place.thread} ${clean(issue?.title, 120)}${last ? `: ${last.from}: ${firstLine(last.body)}` : ""}`;
    } else if (place?.discussion) {
      const d = JSON.parse(await gh(["api", `repos/${place.repo}/discussions/${place.thread}`]));
      line = `discussion ${place.thread} ${clean(d?.title, 120)}`;
    }
  } catch { /* offline, no access: the card says where to look */ }
  if (!line) line = `look at ${link}`.slice(0, 300);
  const ping = { ...base, line: line.slice(0, 300), ...(place && !place.discussion ? { issue: place.thread, repo: place.repo } : {}) } as RelayMsg;
  return { ping, comments };
}
