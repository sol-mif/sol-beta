// The Agents' room as the group's chat (#1417): what the face works out on its own, pure, so `node --test` reads it.
// The read rule under each line is never worked out here: it is the engine's (team.chat `said`, team/chatline.ts).
// Nothing here knows a team: the members come in the read.

export type Member = { login: string; agent: boolean };
export type ArtifactKind = "block" | "diff" | "pr" | "file";
export type Artifact = { kind: ArtifactKind; ref: string; title: string; session?: string };
export type Rule = { read: string[]; pinged: string[]; refused: { login: string; why: string }[]; runs: number };
export type ChatLine = {
  id: string; at: number; from: string; agent: boolean; text: string; artifact?: Artifact; re?: string;
  kind: "said" | "answer" | "ask" | "hand" | "settled"; rule: Rule; said: string[];
  /** a line of mine to my own AI while the room has no table (#1740): the talk it opened, where my AI answers */
  session?: string;
};

/** a member's name as the chat says it: "b", "b's agent" */
export const nameOf = (m: Member) => (m.agent ? `${m.login}'s agent` : m.login);

/** the people of the members, in the read's order (me first) */
export const peopleOf = (members: readonly Member[]) => members.filter((m) => !m.agent).map((m) => m.login);

/** a person's place in the set's six: their place among the people, so a person and their agent share it */
export function colourIndex(members: readonly Member[], login: string): number {
  const i = peopleOf(members).findIndex((l) => l.toLowerCase() === login.toLowerCase());
  return i < 0 ? 0 : i;
}

/** the @ being typed just before the caret, or null: "@", "@b", "@b's ag" */
export function atQuery(before: string): string | null {
  const m = /(?:^|\s)@([A-Za-z0-9-]*(?:['’]s?(?: a?g?e?n?t?)?)?)$/.exec(before);
  return m ? m[1] : null;
}

/** the members an @ may name, matching what is typed: "@b" and "@b's agent" for each person, and my own agent (gate
 *  one, #1677: alone at a table, my AI is the one who can read a line), never me as a person */
export function atOptions(members: readonly Member[], me: string, q: string): Member[] {
  const want = q.toLowerCase().replace(/’/g, "'");
  return members.filter((m) => (m.agent || m.login.toLowerCase() !== me.toLowerCase()) && nameOf(m).toLowerCase().startsWith(want));
}

/** nobody else is here: no person in the members but me (an empty read too) */
export const alone = (members: readonly Member[], me: string) => !members.some((m) => !m.agent && m.login.toLowerCase() !== me.toLowerCase());

/** whether a line names my own agent ("@me's agent"), outside a code fence, as the engine's @ rule reads a name
 *  (team/chatline.ts mentionsIn). The engine hands it to nobody (my agent is not asked over reach): the window opens a
 *  talk with my own AI on it, and my AI answers in the room */
export function namesMyAgent(text: string, me: string): boolean {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(me)) return false;
  const t = text.replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, " ").replace(/[‘’]/g, "'");
  return new RegExp(`(?:^|[^\\w@-])@${me.replace(/-/g, "\\-")}'s agent\\b`, "i").test(t);
}

/** a group's name as a label only (#1721): any member can rename the group on GitHub, so it is one line, quoted, at
 *  most 60 characters, never read as part of the ask */
export function groupLabel(group: string): string {
  const one = group.replace(/[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/["“”]/g, "'").trim();
  return one ? `"${one.length > 60 ? `${one.slice(0, 59)}…` : one}"` : "";
}

/** what my own AI is handed when a line names it: the line as I wrote it (my words, as they are), and where to answer
 *  (the room's chat, with its talk tool, short). The group's name is only a quoted label (#1721) */
export function askMine(text: string, group?: string): string {
  const label = group ? groupLabel(group) : "";
  return `I wrote this in my group's room in Cowork${label ? ` (the group named ${label})` : ""} and named you:\n\n${text.trim()}\n\n` +
    "Answer me there, in the room, with your talk tool (thread general), short; a PR link instead of a paragraph.";
}

/** the words with the @ before the caret replaced by the picked member, and where the caret goes */
export function pickAt(text: string, caret: number, m: Member): { text: string; caret: number } {
  const before = text.slice(0, caret), q = atQuery(before);
  if (q === null) return { text, caret };
  const start = caret - q.length - 1, put = `@${nameOf(m)} `;
  return { text: text.slice(0, start) + put + text.slice(caret), caret: start + put.length };
}

/** an address pasted to put on a line, as an artifact (the engine checks it is the group's): a pull, its diff, a
 *  commit or a compare, a file; null when it is none */
export function artifactOfUrl(raw: string): Artifact | null {
  const url = raw.trim();
  const m = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull\/(\d+)(\/files)?|commit\/([0-9a-f]{7,40})|compare\/(\S+)|blob\/[^/\s]+\/(\S+))\/?$/.exec(url);
  if (!m) return null;
  if (m[2]) return m[3] ? { kind: "diff", ref: url, title: `#${m[2]} diff` } : { kind: "pr", ref: url, title: `#${m[2]}` };
  if (m[4]) return { kind: "diff", ref: url, title: m[4].slice(0, 7) };
  if (m[5]) return { kind: "diff", ref: url, title: m[5] };
  return { kind: "file", ref: url, title: m[6].split("/").pop() ?? m[6] };
}

/** where "review" goes for an artifact: a PR's diff (GitHub's review), else the artifact itself */
export const reviewOf = (a: Artifact) => (a.kind === "pr" ? `${a.ref.replace(/\/$/, "")}/files` : a.ref);

/** the line a line answers, as words: "answers a's line" */
export function answers(lines: readonly ChatLine[], re?: string): string {
  const l = re ? lines.find((x) => x.id === re) : undefined;
  return l ? `answers ${l.agent ? `${l.from}'s agent` : l.from}` : "";
}

// ---- the room before any table or identity (gate one q2 q3, #1740) ----

/** who I am in the room when this Sol has no identity yet (no GitHub, not signed in to Sol's cloud): a local "me", only
 *  in this window, so my own AI can still be @'d. Nothing is sent under it */
export const LOCAL_ME = "me";
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
/** me and the members as the room draws them (pure): my login, else the local "me"; me and my own AI always among the
 *  members, first, so the @ list has my AI even on an empty read */
export function withMe(me: string | undefined, members: readonly Member[]): { me: string; local: boolean; members: Member[] } {
  const local = !LOGIN.test(me ?? "");
  const who = local ? LOCAL_ME : me!;
  const rest = members.filter((m) => m.login.toLowerCase() !== who.toLowerCase());
  return { me: who, local, members: [{ login: who, agent: false }, { login: who, agent: true }, ...rest] };
}

/** what the room says when nobody has said anything yet (pure): plain words on how to start, never a blank name.
 *  solo: no table yet (or no identity), so a line reaches only my own AI */
export function emptyWords(o: { me: string; local: boolean; solo: boolean; alone: boolean }): string {
  const mine = `@${o.me}'s agent`;
  if (o.local) return `Nobody else is here yet, and this Sol has no account to bring them in with. Your own AI is here already: write ${mine} and a line, and it answers in a talk of yours, on your usage. To bring people in, sign in to Sol (Settings › me › Sol) and start a table.`;
  if (o.solo) return `No table yet, so it is just you and your AI. Write ${mine} and a line, and it answers in a talk of yours, on your usage; or set up a table just for you, and the room keeps what is said.`;
  if (o.alone) return `Just you here so far. Write ${mine} and your own AI reads the line and answers here, on your usage. Without an @, nobody's agent reads it.`;
  return "Nobody has said anything yet. Write a line below: it is read by nobody's agent unless you @ it.";
}

/** what my own AI is handed for a line that names it while the room has no table (pure): the line as I wrote it, and
 *  that it answers in this talk, since there is no room's talk to answer in yet */
export function askMineSolo(text: string): string {
  return `I wrote this in Cowork's Agents' room, where there is no table yet, and named you:\n\n${text.trim()}\n\nAnswer me here, short.`;
}

/** the words the press "set up a table just for me" hands my own AI as my line (pure): my own words, so its open_table
 *  takes them (engine team/table-tools.ts: refused without the person's words this turn) */
export const JUST_ME = "start a Cowork table just for me, called just me";
