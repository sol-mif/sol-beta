// A piece does part of its job between his visits (#1092, the recipe's `tend`; S/design/design.md NOW 1 of 03:20).
// For each row that newly wants him, one agent turn reads what the row links to and the folder, and answers the
// recipe's sentence in a line or two: the row's `said`, drawn under the why. It only reads (Read, Glob, Grep, WebFetch;
// nothing that writes, runs or sends), has 20 s, and is the piece's own voice: every act stays his press. No answer,
// slow, or any error: no `said`, nothing shown.
import { execFile } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";

/** the tools a tending turn may use: reading only */
// no WebFetch: the thread is other people's words, and a turn that reads them and can also fetch an address could be
// talked into carrying the folder out (the designer's NOW of 03:53). The thread is read for it, through gh.
export const READ_ONLY: string[] = [];
export const TEND_MS = 20_000;
export const SAID_MAX = 160;
/** what a turn is given: the recipe's sentence and the row as the piece holds it */
export type TendAsk = { cwd: string; piece: string; sentence: string; row: { t: string; note?: string; href?: string } };

/** an answer that only says it could not read is no line: nothing shown (pure) */
const COULD_NOT = /^(i )?(could ?n[o']t|can ?n[o']t|was unable|am unable|unable to|i do not have access|i don't have access)\b/i;
/** a turn that declines anywhere in its line ("…, so I can't state his position") is no line either */
const DECLINES = /\b(I can(no|['’])t|I could(n['’]| no)t|I['’]m unable|I am unable|I don['’]t have|I do not have|isn['’]t in the thread|not in the thread)\b/i;
/** a GitHub issue or pull request a row links to: its repository and number (pure) */
export function threadOf(href = ""): { repo: string; kind: "issue" | "pr"; n: number } | null {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/(\d+)/.exec(href);
  return m ? { repo: m[1], kind: m[2] === "pull" ? "pr" : "issue", n: Number(m[3]) } : null;
}
/** the GitHub repository a remote's address names ("owner/name"), or null (pure) */
export function repoOfRemote(url = ""): string | null {
  const m = /github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?\/?$/.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}
/** the folder's own GitHub repository (its origin), or null */
export const folderRepo = (cwd: string) => new Promise<string | null>((ok) => {
  execFile("git", ["-C", cwd, "remote", "get-url", "origin"], { timeout: 4000 }, (err, out) => ok(err ? null : repoOfRemote(String(out))));
});
/** the thread a row links to, read through gh (signed in, read only): its body and last three comments, 3000 letters */
export const readThread = (cwd: string, t: { repo: string; kind: "issue" | "pr"; n: number }) => new Promise<string | null>((ok) => {
  // a pull request also gives the names of the files it changes and its checks' word
  execFile("gh", [t.kind, "view", String(t.n), "--repo", t.repo, "--json", t.kind === "pr" ? "title,body,comments,files,statusCheckRollup" : "title,body,comments"], { cwd, timeout: 8000, maxBuffer: 4 << 20 }, (err, out) => {
    if (err) return ok(null);
    try {
      const v = JSON.parse(out) as { title?: string; body?: string; comments?: { author?: { login?: string }; body?: string }[]; files?: { path?: string }[]; statusCheckRollup?: { conclusion?: string; state?: string }[] };
      const said = (v.comments ?? []).slice(-3).map((c) => `${c.author?.login ?? "someone"}: ${c.body ?? ""}`).join("\n\n");
      const files = (v.files ?? []).map((f) => f.path).filter(Boolean).slice(0, 30).join(", ");
      const checks = v.statusCheckRollup ? (v.statusCheckRollup.some((c) => /FAIL|ERROR/i.test(c.conclusion ?? c.state ?? "")) ? "red" : v.statusCheckRollup.every((c) => /SUCCESS|SKIPPED|NEUTRAL/i.test(c.conclusion ?? c.state ?? "")) ? "green" : "waiting") : "";
      ok(`${v.title ?? ""}${files ? `\n\nFiles changed: ${files}` : ""}${checks ? `\nChecks: ${checks}` : ""}\n\n${v.body ?? ""}${said ? `\n\nLast comments:\n${said}` : ""}`.slice(0, 3000));
    } catch { ok(null); }
  });
});

const WORDS = (s: string) => s.toLowerCase().split(/[^a-z0-9#]+/).filter((w) => w.length > 2);
/** a line that only says the title again: most of its words are the title's (pure) */
export function restates(said: string, title: string): boolean {
  const t = new Set(WORDS(title)), w = WORDS(said);
  return w.length > 0 && w.filter((x) => t.has(x)).length / w.length >= 0.6;
}
/** a turn's answer as the row's line (pure): no label, no quotes; 160 letters at most, ending at the last whole sentence
 *  that fits, never at "…"; nothing that fits, or a line that says the title again or only that it could not read:
 *  no line at all (the designer's NOW of 03:53: say what the title does not, or not be there) */
export function saidOf(text: string, title = ""): string | null {
  // the line itself: no "Draft:" or "Answer:" label, no quotes around it
  const t = text.replace(/\s+/g, " ").trim().replace(/^(draft|answer|reply|suggested answer)\s*:\s*/i, "").replace(/^["'`“]+|["'`”]+$/g, "").trim();
  if (!t || COULD_NOT.test(t) || DECLINES.test(t)) return null;
  // the line is drawn as plain words: a turn's markdown (**bold**, __bold__, `code`) is its words alone
  let line = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1");
  if (line.length > SAID_MAX) {
    const ends = [...line.slice(0, SAID_MAX).matchAll(/[.!?](?=\s|$)/g)].map((m) => (m.index ?? 0) + 1);
    if (!ends.length) return null;
    line = line.slice(0, ends[ends.length - 1]).trim();
  }
  return title && restates(line, title) ? null : line;
}

/** one read-only turn (the Claude Agent SDK, no session kept); null on no answer, slow or an error */
export async function tendTurn(a: TendAsk): Promise<string | null> {
  const ac = new AbortController();
  const stop = setTimeout(() => ac.abort(), TEND_MS);
  let text = "";
  try {
    // a GitHub thread is read for the turn (the repository may be private to a fetch); anything else it reads itself
    // only from the folder's own repository: a row cannot steer his sign-in to read another repo into a line
    const t = threadOf(a.row.href), own = t ? await folderRepo(a.cwd) : null;
    const thread = t && own && t.repo.toLowerCase() === own ? await readThread(a.cwd, t) : null;
    const q = query({
      prompt: `${a.sentence}\n\nThe row, in the piece "${a.piece}":\n${a.row.t}${a.row.note ? `\n${a.row.note}` : ""}${a.row.href ? `\n${a.row.href}` : ""}${thread ? `\n\nThe thread:\n${thread}` : ""}\n\nAnswer with the sentence or two only. If you could not read what it is about, answer with nothing.`,
      options: {
        cwd: a.cwd, persistSession: false, abortController: ac, settingSources: [], maxTurns: 4,
        // a short line in 20 s: the fast model (the pick is in done.txt)
        model: "claude-haiku-5-5",
        // no tools: what the row links to is read for it (the thread through gh); a turn that could read the disk could
        // be steered by a comment into putting a file's contents in its line (the lead's 04:27)
        tools: [], allowedTools: [],
        canUseTool: async () => ({ behavior: "deny", message: "a piece's turn has no tools" }),
        systemPrompt: { type: "preset", preset: "claude_code", append: "You are a piece in Jelly doing part of its job between the person's visits. You may only read. Never write, run, post, merge or send anything: every act is the person's press. Answer in one or two plain sentences." },
      } as never,
    });
    for await (const m of q as AsyncIterable<{ type: string; result?: string; message?: { content?: { type: string; text?: string }[] } }>) {
      if (m.type === "assistant") { const t = (m.message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(" "); if (t.trim()) text = t; }
      else if (m.type === "result") { if (typeof m.result === "string" && m.result.trim()) text = m.result; break; }
    }
    return saidOf(text);
  } catch { return null; }
  finally { clearTimeout(stop); }
}
