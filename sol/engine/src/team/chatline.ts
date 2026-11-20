// A group chat line, beyond its words (#1417, objective 1 step 11): who it names and so who reads it (the @ rule), the
// artifact it carries, and the group's chat as one read for the Agents' room (team.chat). Pure: talk.ts says a line
// with it, wire.ts reads the chat with it. Nothing here knows a team: the members, the repositories and the blocks are
// handed in.
//
// The @ rule (Marco, 2026-11-17: "by default you have to @ who to read this so we don't just burn everyone's usage by
// accident, and for @ people it shouldn't cost any usage"):
//   no @                  nobody is told and no model runs
//   @<login>'s agent      that agent alone reads it, on <login>'s usage (a person's line in general: an ask, reach.ts)
//   @<login>              <login> gets a ping (a card), and no model runs
// A word inside a code fence never names anyone. An agent's line never asks another agent (a loop between agents
// stops before it starts, as the wake mark does on GitHub).
//
// An artifact on a line: `{ kind: "block"|"diff"|"pr"|"file", ref, title }`, carried in the line's hidden mark
// (discussions.ts bodyOf), or written in the words as a fenced `sol-artifact` JSON block (how an agent puts one on a
// line). Either way the words keep a plain link, so an old Sol and GitHub's page see where it points. The ref is room
// content from anyone in the repository, so it is checked before the face opens it: a github.com address of one of the
// group's repositories, or a block's id.

export type Mentions = { agents: string[]; people: string[] };
export type ArtifactKind = "block" | "diff" | "pr" | "file";
export type Artifact = { kind: ArtifactKind; ref: string; title: string };
export const KINDS: readonly ArtifactKind[] = ["block", "diff", "pr", "file"];

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const FENCE = /```[^\n]*\n[\s\S]*?(?:```|$)/g;
const ART = /```sol-artifact[ \t]*\n([\s\S]*?)\n?```[ \t]*\n?/;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const esc = (s: string) => s.replace(/[-]/g, "\\-");

/** who a line names, by the @ rule, among `logins` (pure): agents asked and people pinged, each once, never me */
export function mentionsIn(text: string, logins: readonly string[], me = ""): Mentions {
  const t = String(text ?? "").replace(FENCE, " ").replace(/[‘’]/g, "'");
  const agents: string[] = [], people: string[] = [];
  for (const l of new Set(logins)) {
    if (!LOGIN.test(l) || same(l, me)) continue;
    const at = new RegExp(`(?:^|[^\\w@-])@${esc(l)}(?![\\w-])('s agent\\b)?`, "gi");
    for (const m of t.matchAll(at)) {
      const list = m[1] ? agents : people;
      if (!list.includes(l)) list.push(l);
    }
  }
  return { agents, people };
}

/** whether a line names its writer's own agent ("@<me>'s agent"), outside a code fence (pure). mentionsIn never hands it
 *  over reach (an agent is not asked by its own person there); the window opens a talk with that person's own AI on the
 *  line instead, which answers in the room (gate one, #1677: alone at a table, my AI is who reads) */
export function namesOwnAgent(text: string, me: string): boolean {
  if (!LOGIN.test(me)) return false;
  const t = String(text ?? "").replace(FENCE, " ").replace(/[‘’]/g, "'");
  return new RegExp(`(?:^|[^\\w@-])@${esc(me)}'s agent\\b`, "i").test(t);
}

/** an artifact as the face may open it, or null (pure): a known kind, a ref of one line, a title cut to 120 */
export function artifactOf(v: unknown): Artifact | null {
  const a = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const kind = KINDS.find((k) => k === a.kind);
  const ref = typeof a.ref === "string" ? a.ref.trim() : "";
  const title = typeof a.title === "string" ? a.title.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!kind || !ref || ref.length > 400 || /\s/.test(ref)) return null;
  return { kind, ref, title: title || ref.slice(0, 120) };
}

/** the words with a fenced `sol-artifact` block taken out, and the artifact it held (pure). A block that does not parse
 *  stays in the words */
export function artifactInText(text: string): { text: string; artifact?: Artifact } {
  const m = ART.exec(text);
  if (!m) return { text };
  let a: Artifact | null = null;
  try { a = artifactOf(JSON.parse(m[1])); } catch { /* words, then */ }
  if (!a) return { text };
  return { text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim(), artifact: a };
}

const GH = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull\/\d{1,7}(?:\/(?:files|commits)(?:\/[0-9a-f]{7,40})?)?|commit\/[0-9a-f]{7,40}|compare\/[\w./~^-]{1,200}|blob\/[\w./%-]{1,300}|issues\/\d{1,7})(?:[?#][\w=&.%-]*)?$/;
/** may the face open it (pure): a github.com address of one of `repos` (a pr or a diff on a pull, a commit or a
 *  compare; a file as a blob), or, for a block, a block id */
export function refOk(a: Artifact, repos: readonly string[]): boolean {
  if (a.kind === "block") return /^[\w-]{1,80}$/.test(a.ref);
  const m = GH.exec(a.ref);
  if (!m || !repos.some((r) => same(r, m[1]))) return false;
  const path = m[2];
  if (a.kind === "pr") return path.startsWith("pull/");
  if (a.kind === "diff") return /^(pull|commit|compare)\//.test(path);
  return path.startsWith("blob/");
}

/** a pull request named in the words, as an artifact, when the line carries none (pure): an agent that answers "#12 is
 *  up: <link>" puts a PR on the line without knowing the fence */
export function prInText(text: string, repos: readonly string[]): Artifact | null {
  for (const m of String(text ?? "").matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d{1,7}(?:\/files)?/g)) {
    const a: Artifact = { kind: m[0].endsWith("/files") ? "diff" : "pr", ref: m[0], title: `#${/pull\/(\d+)/.exec(m[0])![1]}` };
    if (refOk(a, repos)) return a;
  }
  return null;
}

/** the words a line goes out with when it carries an artifact: a plain link (or the block's name) for an old Sol and
 *  for GitHub's page, unless the words have it already (pure) */
export function withLink(text: string, a: Artifact | undefined): string {
  if (!a || text.includes(a.ref)) return text;
  const link = a.kind === "block" ? `[a block: ${a.title}]` : `${a.title !== a.ref ? `${a.title}: ` : ""}${a.ref}`;
  return [text, link].filter(Boolean).join("\n");
}

// ---- the chat as the Agents' room reads it (team.chat) ----

/** the read rule of one line, as the engine knows it happened: which agents it was handed to (each on its person's
 *  usage), which people were pinged, which agents did not read it and why. Model runs: the agents that read it */
export type Rule = { read: string[]; pinged: string[]; refused: { login: string; why: string }[]; runs: number };
export type ChatLine = {
  id: string; at: number; from: string; agent: boolean; text: string; artifact?: Artifact & { session?: string };
  rule: Rule; re?: string; kind: "said" | "answer" | "ask" | "hand" | "settled";
};
export type Member = { login: string; agent: boolean };
/** a talk line as kept (talk.ts TalkLine), only what the chat reads */
export type Spoken = { id: string; from: string; at: number; text: string; agent?: boolean; artifact?: Artifact; woke?: string[]; pinged?: string[] };
/** an entry of the agents' thread (reach.ts Entry), only what the chat reads */
export type Reached = { type: string; id: string; from: string; at: number; to?: string; re?: string; question?: string; text?: string; why?: string; what?: string; issue?: number; accept?: boolean };
/** a settled ask (work/asks.ts roomRead's settled): one line each */
export type Settled = { id: string; title: string; issue: number | null; answer: { choice: string; by?: string; at: number } };

/** the members of a group: each person and their agent, me first, from the logins read (pure; 2n for n people) */
export function membersOf(logins: readonly string[], me: string): Member[] {
  const seen = new Set<string>(), out: Member[] = [];
  for (const l of [me, ...[...logins].sort((a, b) => a.localeCompare(b))]) {
    if (!LOGIN.test(l) || seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase());
    out.push({ login: l, agent: false }, { login: l, agent: true });
  }
  return out;
}

const loginOf = (from: string) => from.replace(/'s agent$/i, "");
/** the group's chat in time order (pure): the Discussion's lines, the agents' thread folded in (an ask a line made is
 *  that line; its answer a line after it; a refusal goes under the line it refuses), the settled asks one line each.
 *  The artifacts are checked against `repos` and the blocks' sessions; one that fails is dropped, its link stays */
export function chatOf(o: { lines: readonly Spoken[]; thread: readonly Reached[]; settled: readonly Settled[]; repos: readonly string[]; blocks?: Record<string, string>; last?: number; me?: string }): ChatLine[] {
  const out: ChatLine[] = [], byId = new Map<string, ChatLine>();
  const checked = (a: Artifact | undefined): ChatLine["artifact"] => {
    if (!a || !refOk(a, o.repos)) return undefined;
    if (a.kind !== "block") return a;
    const session = o.blocks?.[a.ref];
    return session ? { ...a, session } : undefined;   // a block nobody here has: nothing to open
  };
  const art = (text: string, carried?: Artifact) => {
    const f = artifactInText(text);
    return { text: f.text, artifact: checked(carried ?? f.artifact ?? prInText(f.text, o.repos) ?? undefined) };
  };
  for (const l of o.lines) {
    // my own line naming my own agent (#1677): my AI reads it, in a talk of mine the window opened, on my usage
    const self = !!o.me && !l.agent && same(loginOf(l.from), o.me) && namesOwnAgent(l.text, o.me);
    const read = [...(l.woke ?? []), ...(self && !(l.woke ?? []).some((x) => same(x, o.me!)) ? [o.me!] : [])];
    const c: ChatLine = { id: l.id, at: l.at, from: loginOf(l.from), agent: !!l.agent, ...art(l.text, l.artifact), rule: { read: [...read], pinged: [...(l.pinged ?? [])], refused: [], runs: read.length }, kind: "said" };
    out.push(c); byId.set(c.id, c);
  }
  for (const e of o.thread) {
    if (e.type === "ask" && byId.has(e.id)) continue;   // the line itself
    if (e.type === "refused" && e.re && byId.has(e.re)) {
      const r = byId.get(e.re)!.rule;
      if (e.from && !r.refused.some((x) => same(x.login, e.from))) { r.refused.push({ login: e.from, why: e.why ?? "" }); r.read = r.read.filter((x) => !same(x, e.from)); r.runs = r.read.length; }
      continue;
    }
    const none: Rule = { read: [], pinged: [], refused: [], runs: 0 };
    if (e.type === "ask") out.push({ id: e.id, at: e.at, from: e.from, agent: true, text: e.question ?? "", rule: { ...none, read: e.to ? [e.to] : [], runs: e.to ? 1 : 0 }, kind: "ask" });
    else if (e.type === "answer") out.push({ id: e.id, at: e.at, from: e.from, agent: true, ...art(e.text ?? ""), ...(e.re ? { re: e.re } : {}), rule: { ...none, pinged: e.to ? [e.to] : [] }, kind: "answer" });
    else if (e.type === "refused") out.push({ id: e.id, at: e.at, from: e.from, agent: true, text: `did not answer: ${e.why ?? ""}`, ...(e.re ? { re: e.re } : {}), rule: none, kind: "answer" });
    else if (e.type === "hand") out.push({ id: e.id, at: e.at, from: e.from, agent: true, text: `hands ${e.issue ? `#${e.issue}` : "work"} to ${e.to}: ${e.what ?? ""}`, rule: { ...none, pinged: e.to ? [e.to] : [] }, kind: "hand" });
    else if (e.type === "offer") out.push({ id: e.id, at: e.at, from: e.from, agent: true, text: `offers to take #${e.issue} from ${e.to}`, rule: { ...none, pinged: e.to ? [e.to] : [] }, kind: "hand" });
    else if (e.type === "reply") out.push({ id: e.id, at: e.at, from: e.from, agent: true, text: `${e.accept ? "takes" : "declines"} it${e.why ? `: ${e.why}` : ""}`, ...(e.re ? { re: e.re } : {}), rule: none, kind: "hand" });
  }
  for (const s of o.settled) {
    const by = s.answer.by ? `${s.answer.by} ` : "";
    out.push({ id: `settled-${s.id}`, at: s.answer.at, from: s.answer.by ?? "", agent: false, text: `${s.issue ? `#${s.issue} · ` : ""}${s.title}: ${by}said ${s.answer.choice}`, rule: { read: [], pinged: [], refused: [], runs: 0 }, kind: "settled" });
  }
  return out.sort((a, b) => a.at - b.at).slice(-(o.last ?? 200));
}

/** the read rule in a few words, for the line under a bubble (pure): "read by b's agent · b's usage",
 *  "notifies c · no usage", "no agent reads this" */
export function ruleWords(r: Rule): string[] {
  const out = r.read.map((l) => `read by ${l}'s agent · ${l}'s usage`);
  for (const x of r.refused) out.push(`${x.login}'s agent did not read it${x.why ? `: ${x.why}` : ""} · no usage`);
  if (r.pinged.length) out.push(`notifies ${r.pinged.join(", ")} · no usage`);
  if (!r.read.length && !r.refused.length && !r.pinged.length) out.push("no agent reads this");
  return out;
}
