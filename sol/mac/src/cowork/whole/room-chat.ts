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

/** the members an @ may name, matching what is typed, never me: "@b" and "@b's agent" for each person */
export function atOptions(members: readonly Member[], me: string, q: string): Member[] {
  const want = q.toLowerCase().replace(/’/g, "'");
  return members.filter((m) => m.login.toLowerCase() !== me.toLowerCase() && nameOf(m).toLowerCase().startsWith(want));
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
