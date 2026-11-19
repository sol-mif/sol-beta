// A group's chat on its repository (#1347, the plan in #229 section 1): what is behind the group chat seam for a group
// whose record is GitHub. Content goes where it stays; the cloud carries no chat.
//
// - `general` is one Discussion of the group's code repository, titled GENERAL_TITLE, made by the first line said there
//   (category "General", else the first that is not an announcement one). Every top comment in it is a line, whoever
//   wrote it, in Sol or on GitHub's page.
// - `#N` is issue or PR N's own thread: a line said there is a comment on it. Only comments that carry the mark below are
//   read back as lines, so the reviews, the bots and the agents' long reports on the same issue stay out of the chat.
// - A line is posted with the person's own gh (never a token here), so GitHub's author is who said it, as the relay's
//   stamp was. The mark, an HTML comment nobody reading the page sees, carries the line's id (a line said here and read
//   back is one line), whether an agent said it, and an attachment's place (#315). An agent's line is signed in words
//   and carries the wake answer mark (team/wake.ts), so a line of one agent never wakes another.
// - New lines are read every minute while something listens: the Discussion's last comments, and the repository's
//   issue comments since the last read. The first read of a run is history (spooled), as a hello's was. While a person
//   has the Agents' room open (`quick`, #1417), every 10 s instead: temporary, until a push says a line came (Frank's
//   call on #1417: a group "chat changed" hint on the cloud).
// - Only the repository's people are heard: a comment by its owner, a member of its org or a collaborator (GitHub's
//   author association), never a passer-by's on a page anyone can comment on; agents read these lines.
// - A public repository, one whose Discussions are off, or a group that is not GitHub's keeps the relay's talk (chat.ts
//   decides): a group's chat is never written where anyone can read it.
import { runGh, runGhStdin } from "../team/record/github.js";
import { activeRoom, codeRepoOf, getTeam, type Room } from "../team/settings.js";
import { WAKE_MARK } from "../team/wake.js";
import { isQuiet } from "../quiet.js";
import type { RelayMsg } from "../team/relay.js";

export const GENERAL_TITLE = "Sol chat: general";
export const EVERY_MS = 60_000;
/** while the Agents' room is open (#1417): until a push carries "a line came" */
export const QUICK_MS = 10_000;
/** is a read due on this tick (pure): every QUICK_MS while the room is open (`quickUntil` ahead), else every EVERY_MS */
export const due = (now: number, last: number, quickUntil: number) => now - last >= (now < quickUntil ? QUICK_MS : EVERY_MS) - 500;
const LAST = 50;                         // the Discussion's last comments read each time
const PAGES = 5;                         // pages of 100 issue comments read at most each time
const SENT_MAX = 500;                    // ids said here kept, to know them when they come back
const MARK = /<!-- sol-talk (\{[^\n]*?\}) -->/g;
const REPO = /^[\w.-]+\/[\w.-]+$/;

export type Gh = (args: string[]) => Promise<string>;
export type GhIn = (args: string[], input: string) => Promise<string>;
export type Deps = { gh: Gh; ghIn: GhIn; room: () => Room; me: () => string; now: () => number };
const live: Deps = { gh: (a) => runGh(a), ghIn: (a, i) => runGhStdin(a, i), room: () => activeRoom(getTeam()), me: () => getTeam().me.login, now: () => Date.now() };

/** the repository a GitHub group chats in: its code repository; "" for a cloud or Drive group (pure) */
export const chatRepoOf = (r: Pick<Room, "provider" | "repos" | "record">): string => {
  if (r.provider !== "github") return "";
  const repo = codeRepoOf(r);
  return REPO.test(repo) ? repo : "";
};

/** a line as a comment's body (pure): the words, an agent's signature, the hidden mark */
export function bodyOf(line: Record<string, unknown>, agent: boolean, login: string): string {
  const text = typeof line.text === "string" ? line.text : "";
  const mark: Record<string, unknown> = { id: line.id };
  if (agent) mark.agent = true;
  if (line.to === "discord") mark.to = "discord";
  if (line.file && typeof line.file === "object") mark.file = line.file;
  // #1417: the artifact on the line (its link is in the words already), and who it was handed to and pinged
  if (line.artifact && typeof line.artifact === "object") mark.artifact = line.artifact;
  for (const k of ["woke", "pinged"]) if (Array.isArray(line[k]) && (line[k] as unknown[]).length) mark[k] = line[k];
  const json = JSON.stringify(mark).replace(/-->/g, "--\\u003e");
  return [text, agent ? `\n— ${login}'s agent` : "", `\n<!-- sol-talk ${json} -->`, agent ? `\n${WAKE_MARK}` : ""].join("");
}

export type Comment = { id: number | string; login: string; bot: boolean; body: string; created: string; association?: string };
/** who may speak in a group's chat on GitHub: the repository's own people (pure) */
export const OURS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
/** a comment as a talk line, the way the relay gave one (pure); null for a bot's, a passer-by's (not the repository's own
 *  people), or, `markedOnly`, one Sol did not post.
 *  The words lose the mark and the signature; talk.ts checks the rest (the thread, the id, the file) as it does the relay's */
export function lineOf(c: Comment, thread: string, markedOnly: boolean): RelayMsg | null {
  if (c.bot || !c.login || !OURS.has(String(c.association ?? "").toUpperCase())) return null;
  // the last mark is Sol's: the words come before it, so a mark typed into them is only words
  const m = [...c.body.matchAll(MARK)].pop();
  if (!m && markedOnly) return null;
  let mark: Record<string, unknown> = {};
  try { if (m) mark = JSON.parse(m[1]); } catch { if (markedOnly) return null; }
  const agent = mark.agent === true;
  const bare = m ? c.body.slice(0, m.index) + c.body.slice(m.index! + m[0].length) : c.body;
  let text = bare.split(WAKE_MARK).join("").trimEnd();
  if (agent) text = text.replace(new RegExp(`\\n?— ${c.login.replace(/[^\w-]/g, "")}'s agent$`), "").trimEnd();
  const at = Date.parse(c.created);
  return {
    kind: "talk", thread, text, id: typeof mark.id === "string" ? mark.id : `gh-${c.id}`, from: { login: c.login, agent }, at: Number.isFinite(at) ? at : Date.now(),
    ...(mark.to === "discord" ? { to: "discord" } : {}), ...(mark.file ? { file: mark.file } : {}),
    ...(mark.artifact ? { artifact: mark.artifact } : {}), ...(mark.woke ? { woke: mark.woke } : {}), ...(mark.pinged ? { pinged: mark.pinged } : {}),   // #1417, checked by talk.ts
  } as RelayMsg;
}

// ---- what GitHub is asked ----
type RepoInfo = { id: string; on: boolean; category: string; general: string; at: number };
const Q_REPO = `query($o:String!,$n:String!,$q:String!){repository(owner:$o,name:$n){id isPrivate hasDiscussionsEnabled
discussionCategories(first:25){nodes{id name isAnswerable}} discussions(first:100,orderBy:{field:CREATED_AT,direction:ASC}){nodes{id number title}}}
search(query:$q,type:DISCUSSION,first:10){nodes{... on Discussion{id number title}}}}`;
const Q_COMMENTS = `query($d:ID!){node(id:$d){... on Discussion{comments(last:${LAST}){nodes{databaseId body createdAt authorAssociation author{login __typename}}}}}}`;
const M_DISCUSSION = `mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{id}}}`;
const M_COMMENT = `mutation($d:ID!,$b:String!){addDiscussionComment(input:{discussionId:$d,body:$b}){comment{id}}}`;
const INFO_MS = 30 * 60_000;

export type DiscussionsChat = {
  /** whether this group chats on its repository now: GitHub's group, a repository not known to be public or to have its
   *  Discussions off */
  here(): boolean;
  /** a line out; false when nothing could take it (not here). The post itself is after: one GitHub did not take goes on
   *  the relay */
  say(line: Record<string, unknown>, agent: boolean): boolean;
  /** a line heard, live or (spooled) the first read's history */
  hear(fn: (m: RelayMsg) => void): () => void;
  /** read now (the timer's, and the tests') */
  read(): Promise<void>;
  /** the timer off (tests) */
  stop(): void;
  /** read every QUICK_MS for the next `ms` (the Agents' room is open, #1417); a read now when the last is older */
  quick(ms: number): void;
};

export function discussionsChat(d: Deps = live, fallback?: (line: Record<string, unknown>, agent: boolean) => boolean): DiscussionsChat {
  const info = new Map<string, RepoInfo>();
  const since = new Map<string, string>();        // repo → the issue comments read up to (ISO)
  const sent = new Set<string>();                 // ids said here this run: never heard back as a teammate's line
  const subs = new Set<(m: RelayMsg) => void>();
  let timer: ReturnType<typeof setInterval> | null = null, reading = false, last = 0, quickUntil = 0;
  // the timer ticks at the quick pace and reads only when one is due (#1417)
  const tick = () => { if (due(d.now(), last, quickUntil)) { last = d.now(); void read(); } };

  const repoNow = () => chatRepoOf(d.room());
  async function infoOf(repo: string, fresh = false): Promise<RepoInfo> {
    const had = info.get(repo);
    if (had && !fresh && d.now() - had.at < INFO_MS) return had;
    const [o, n] = repo.split("/");
    const v = JSON.parse(await d.gh(["api", "graphql", "-f", `query=${Q_REPO}`, "-f", `o=${o}`, "-f", `n=${n}`, "-f", `q=repo:${repo} in:title "${GENERAL_TITLE}"`])).data;
    const cats: { id: string; name: string; isAnswerable: boolean }[] = v?.repository?.discussionCategories?.nodes ?? [];
    const cat = cats.find((c) => c.name.toLowerCase() === "general") ?? cats.find((c) => !/announce/i.test(c.name) && !c.isAnswerable) ?? cats[0];
    // the oldest of its title, should two Sols have made one at once; the list first (search lags minutes behind)
    const found = [...(v?.repository?.discussions?.nodes ?? []), ...(v?.search?.nodes ?? [])].filter((x: any) => x?.title === GENERAL_TITLE).sort((a: any, b: any) => a.number - b.number)[0];
    const i: RepoInfo = { id: v?.repository?.id ?? "", on: v?.repository?.hasDiscussionsEnabled === true && v?.repository?.isPrivate === true, category: cat?.id ?? "", general: found?.id ?? had?.general ?? "", at: d.now() };
    info.set(repo, i);
    return i;
  }
  const graphqlIn = (query: string, variables: Record<string, string>) => d.ghIn(["api", "graphql", "--input", "-"], JSON.stringify({ query, variables }));

  async function post(repo: string, line: Record<string, unknown>, agent: boolean) {
    const thread = String(line.thread ?? ""), body = bodyOf(line, agent, d.me());
    let i = await infoOf(repo);
    if (!i.on) { fallback?.(line, agent); return; }   // public, or Discussions off: never written there
    if (thread.startsWith("#")) {
      await d.ghIn(["api", "-X", "POST", `repos/${repo}/issues/${thread.slice(1)}/comments`, "--input", "-"], JSON.stringify({ body }));
      return;
    }
    if (!i.general) i = await infoOf(repo, true);   // another Sol may have made it since
    if (!i.general) {
      if (!i.id || !i.category) throw new Error(`${repo} has no discussion category to start the chat in`);
      const made = JSON.parse(await graphqlIn(M_DISCUSSION, { r: i.id, c: i.category, t: GENERAL_TITLE, b: "The group's chat in Sol: each comment is a line. Write here or in Sol." }));
      i.general = made?.data?.createDiscussion?.discussion?.id ?? "";
      if (!i.general) throw new Error("GitHub did not make the chat's discussion");
    }
    await graphqlIn(M_COMMENT, { d: i.general, b: body });
  }

  function tell(m: RelayMsg | null, spooled: boolean) {
    if (!m || sent.has(String(m.id))) return;
    for (const f of subs) f(spooled ? { ...m, spooled: true } : m);
  }

  const issuePage = async (repo: string, q: string) => { const v = JSON.parse(await d.gh(["api", `repos/${repo}/issues/comments?${q}`]) || "[]"); return Array.isArray(v) ? v : []; };
  async function read() {
    const repo = repoNow();
    if (!repo || reading || !subs.size || offline || isQuiet()) return;
    reading = true;
    try {
      const first = !since.has(repo), heard: (RelayMsg | null)[] = [];
      const i = await infoOf(repo);
      if (!i.on) return;   // public, or Discussions off: the relay is the chat
      if (i.general) {
        const v = JSON.parse(await d.gh(["api", "graphql", "-f", `query=${Q_COMMENTS}`, "-f", `d=${i.general}`]));
        for (const c of v?.data?.node?.comments?.nodes ?? [])
          heard.push(lineOf({ id: c.databaseId, login: c.author?.login ?? "", bot: c.author?.__typename === "Bot", body: String(c.body ?? ""), created: c.createdAt, association: c.authorAssociation }, "general", false));
      }
      // the issues' comments: the first read the newest 100 of the last day; then every one since the newest seen, page by
      // page. The place read up to is GitHub's own time, never this machine's clock
      const from = since.get(repo) ?? new Date(d.now() - 86_400_000).toISOString();
      let list: any[] = [];
      if (first) list = (await issuePage(repo, `since=${encodeURIComponent(from)}&per_page=100&sort=updated&direction=desc`)).reverse();
      else for (let page = 1; page <= PAGES; page++) {
        const got = await issuePage(repo, `since=${encodeURIComponent(from)}&per_page=100&sort=updated&direction=asc&page=${page}`);
        list.push(...got);
        if (got.length < 100) break;
      }
      let upTo = from;
      for (const c of list) {
        const n = /\/issues\/(\d+)$/.exec(String(c?.issue_url ?? ""))?.[1];
        if (typeof c?.updated_at === "string" && c.updated_at > upTo) upTo = c.updated_at;
        if (n) heard.push(lineOf({ id: c.id, login: c.user?.login ?? "", bot: c.user?.type === "Bot", body: String(c.body ?? ""), created: c.created_at, association: c.author_association }, `#${n}`, true));
      }
      // the group changed while GitHub answered: these lines are another room's, read again when it is in use
      if (repoNow() !== repo) return;
      for (const m of heard) tell(m, first);
      since.set(repo, upTo);
    } catch (e) { console.error("chat on GitHub: could not read", (e as Error).message); }
    finally { reading = false; }
  }

  // a test never reaches GitHub through the real gh: the relay's talk stays its chat unless it hands in its own gh
  const offline = d === live && !!process.env.NODE_TEST_CONTEXT;
  // a quiet copy never writes as its person (quiet.ts): the relay's refusal stays its answer
  const here = () => { const repo = repoNow(); return !offline && !isQuiet() && !!repo && info.get(repo)?.on !== false; };
  return {
    here,
    say(line, agent) {
      const repo = repoNow();
      if (!repo || !here()) return false;
      if (typeof line.id === "string") { sent.add(line.id); if (sent.size > SENT_MAX) sent.delete(sent.values().next().value!); }
      // a line GitHub did not take goes on the relay, so it is not lost while the relay is up
      void post(repo, line, agent).catch((e) => { console.error("chat on GitHub: a line did not go", (e as Error).message); fallback?.(line, agent); });
      return true;
    },
    hear(fn) {
      subs.add(fn);
      // a quiet copy and a test read nothing on their own
      if (!timer && !isQuiet() && !offline) { timer = setInterval(tick, QUICK_MS); timer.unref?.(); setTimeout(() => { last = d.now(); void read(); }, 2_000).unref?.(); }
      return () => { subs.delete(fn); };
    },
    read,
    stop() { if (timer) clearInterval(timer); timer = null; },
    quick(ms) {
      const was = quickUntil;
      quickUntil = Math.max(quickUntil, d.now() + Math.max(0, Math.min(ms, 120_000)));
      if (timer && was <= d.now()) tick();   // the room just opened: a read now when the last one is older than the quick pace
    },
  };
}
