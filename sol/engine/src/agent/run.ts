// A ticket's run: one Codex turn on the folder's one thread (started once, resumed by the id in .agent/thread.json),
// working in the folder (workspace-write: it writes only there), the network off as for every Codex turn, the sol MCP
// tools (the browser in the folder's own profile, the desk). Codex reads the folder's AGENTS.md and me.md itself. The
// prompt carries the rule, the trigger and the ticket so far; the answer must end with one JSON line,
// {"report":"ready|waiting|blocked","card":{…}?}, which harness.parseReport reads.
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Codex } from "@openai/codex-sdk";
import { profileFor, type TurnCtx } from "../browser.js";
import { parseReport, type Card, type Report, type Rule, type Ticket, type Trigger } from "./harness.js";
import { readThread, saveThread } from "./store.js";
import { AGENT_OPENING } from "../threads.js";
import { agentsOn } from "./switch.js";   // how its thread opens: never listed as a talk (#1430)
import { refusalFor } from "./jobs/refuse.js";
import { both, levelFor, refusalIn, rungOfLevel } from "../consent.js";   // what the person allowed (#1216): the record's level for this folder
import { logging, turnStarted, turnEnded, codexTokens } from "../seatlog.js";   // the turn on the log as seat codex, session agent:<folder> (#1628)

/** the tools a watch-mode run may not use: each would reach past the folder (a card on the desk, a ping, the chat) */
const REACHES_OUT = /^(desk_|ping$|talk$|arrange$|suggest_group$|thing_)/;
export const watchRefusal = (tool: string): string | null =>
  REACHES_OUT.test(tool) ? `${tool} is refused: this rule is in watch mode, so nothing leaves the folder. Write what you would have shown into the folder and say it in your card.` : null;

/** the conversation id a folder's agent uses for its tabs (agent:la245) */
export const sessionOf = (folder: string) => `agent:${basename(folder).toLowerCase()}`;

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

/** the turn's prompt (pure) */
export function promptOf(a: { folder: string; rule: Rule; trigger: Trigger; ticket: Ticket }): string {
  const { rule, trigger, ticket } = a;
  const name = basename(a.folder);
  const history = ticket.runs.length
    ? ticket.runs.slice(-6).map((r) => `- ${when(r.at)} ${r.report}: ${r.said.split("\n").find((l) => l.trim() && !l.trim().startsWith("{"))?.slice(0, 200) ?? ""}`).join("\n")
    : "- (this is the ticket's first run)";
  const earlier = ticket.triggers.slice(0, -1).slice(-4).map((t) => `- ${when(t.at)} ${t.source} ${t.kind}: ${JSON.stringify(t.data).slice(0, 300)}`).join("\n");
  const watch = ticket.mandate.mode === "watch";
  return [
    `${AGENT_OPENING}${name} (${a.folder}). You live here: this folder is your whole world. Read AGENTS.md and me.md here if they exist, and brain.md, before you work.`,
    ``,
    `Ticket ${ticket.id}, rule ${rule.id} (mode ${ticket.mandate.mode}, rung ${ticket.mandate.rung}):`,
    `  ${rule.source}: ${rule.sentence}`,
    ``,
    `What happened now (${trigger.source}, ${trigger.kind}, ${when(trigger.at)}):`,
    JSON.stringify(trigger.data, null, 1).slice(0, 6000),
    earlier ? `\nEarlier on this ticket:\n${earlier}` : ``,
    `\nThe ticket's runs so far:\n${history}`,
    ``,
    `The rung: ${ticket.mandate.rung === "read" ? "read: read and record what you found, and make the study things the rule names inside this folder (notes, questions, plans). Never submit, send or post anything anywhere." : ticket.mandate.rung === "propose" ? "propose: write what you would do, and do nothing outside this folder." : "draft: make the thing in this folder for Marco to send himself; never send it."}`,
    watch
      ? `Watch mode: everything runs, but nothing leaves this folder. Do not use desk_show, ping or talk (they are refused). Write what you would have shown into the folder (made/ for new files). Your card is kept as "would have shown" and is not shown to Marco.`
      : `Do mode: your card is shown to Marco.`,
    `The web: only the browser tools (browser_open, browser_read, browser_find, browser_click); they open in this folder's own browser, where Marco signs in. If a site asks you to sign in, stop and report blocked.`,
    ``,
    `Say in a few plain lines what you read and what you made (file names). Then end your answer with exactly one line of JSON, alone on the last line:`,
    `{"report":"ready|waiting|blocked","card":{"title":"…","line":"…","choices":["…","…"]}}`,
    `ready: done (a card when there is something for Marco to look at). waiting: you need his answer (the card asks it, the choices are the answers). blocked: you cannot go on (the card says what he must do). No card: leave "card" out.`,
  ].filter((l) => l !== undefined).join("\n");
}

export type RunDeps = {
  /** the engine's Codex with the sol MCP server, keyed by the turn's token (index.ts codexFor); `internal`: a turn of
   *  Sol's own the person did not start, its rollout marked so no list of chats shows it (threads.ts SOL_INTERNAL) */
  codexFor: (token: string, o?: { internal?: boolean }) => Codex;
  /** the engine's open turns: the token's tool calls find this ticket's TurnCtx (POST /tool) */
  turns: Map<string, TurnCtx>;
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  networkAccessEnabled: boolean;
  model?: string;
  now?: () => number;
  /** the person's home, where their record is (~/.sol/record/me.json); the default is this process's home */
  personHome?: string;
  /** each tool the turn uses (the browser on a page, the desk), as it starts and ends: the folder draws it (#1228) */
  sink?: TurnCtx["sink"];
};
export type RunOut = { report: Report; card?: Omit<Card, "ticketId">; said: string; thread: string | null; ms: number };

const RUNG_AT = ["read", "propose", "draft"] as const;
/** the ticket as the person's record allows it now (#1216): its rung held at the folder's level, never raised (pure) */
export function heldAt(ticket: Ticket, level: Parameters<typeof rungOfLevel>[0] | null): Ticket {
  if (!level) return ticket;
  const cap = rungOfLevel(level);
  return RUNG_AT.indexOf(cap) < RUNG_AT.indexOf(ticket.mandate.rung) ? { ...ticket, mandate: { ...ticket.mandate, rung: cap } } : ticket;
}
/** what a ticket's turn may not call: the person's record first (its level for this folder, named), then the folder's own
 *  (watch mode, the jobs folder) */
export const turnRefusal = (folder: string, mode: string, personHome?: string) => both(refusalIn(folder, personHome), refusalFor(folder, mode, watchRefusal));

/** run one turn for a ticket; never throws: a turn that fails is report "failed" with why */
export async function runTicket(folder: string, rule: Rule, trigger: Trigger, ticket0: Ticket, deps: RunDeps): Promise<RunOut> {
  const now = deps.now ?? Date.now, t0 = now();
  const token = randomUUID();
  // the record is read at the turn's start: a level lowered in Home holds from the next turn on
  const ticket = heldAt(ticket0, levelFor(folder, deps.personHome)?.level ?? null);
  const session = sessionOf(folder);
  const turn: TurnCtx = { sessionId: session, seat: "codex", profile: profileFor(folder), refuse: turnRefusal(folder, ticket.mandate.mode, deps.personHome), ...(deps.sink ? { sink: deps.sink } : {}) };
  deps.turns.set(token, turn);
  const opts = { workingDirectory: folder, skipGitRepoCheck: true, sandboxMode: deps.sandboxMode, approvalPolicy: "never" as const, networkAccessEnabled: deps.networkAccessEnabled, ...(deps.model ? { model: deps.model } : {}) };
  // the agent's own work: its desk shows it, never a list of chats (calm, 2026-11-17); with agents.mode off (switch.ts)
  // a chat again, as before Agents
  const codex = deps.codexFor(token, { internal: agentsOn() });
  const had = readThread(folder);
  let thread = had ? codex.resumeThread(had, opts) : codex.startThread(opts);
  // on the log, with the frame on: the turn and what it spent, so a night's and an agent's work show where the week went (#1628)
  let began = logging(); if (began) turnStarted("codex", session, deps.model);
  try {
    let r;
    try { r = await thread.run(promptOf({ folder, rule, trigger, ticket })); }
    catch (e) {
      if (!had) throw e;
      // a thread Codex no longer has (another machine's, a cleared history): one new thread for the folder
      thread = codex.startThread(opts);
      r = await thread.run(promptOf({ folder, rule, trigger, ticket }));
    }
    if (thread.id && thread.id !== had) saveThread(folder, thread.id);
    // the thread's running total; a new thread (the saved one gone) starts again from 0: a reader takes a drop as a fresh start
    if (began) turnEnded("codex", session, { ok: true, tokensTotal: codexTokens(r.usage) }); began = false;
    const said = r.finalResponse ?? "";
    const got = parseReport(said);
    return got ? { ...got, said, thread: thread.id, ms: now() - t0 } : { report: "failed", said: said + "\n(the answer did not end with the report line)", thread: thread.id, ms: now() - t0 };
  } catch (e) {
    if (began) turnEnded("codex", session, { ok: false });   // no tokens: the turn never came back, which is not 0
    return { report: "failed", said: `the turn failed: ${String((e as Error)?.message ?? e).split("\n")[0]}`, thread: thread.id, ms: now() - t0 };
  } finally {
    deps.turns.delete(token);
  }
}
