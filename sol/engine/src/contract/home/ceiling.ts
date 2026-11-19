// The upper limit's tables (Home 5, design §8 position two, §7.7): what a call needs, and which calls always wait for a
// person's press. No face message carries these: they are the engine's pick, kept here in one place so one edit changes
// them. The rule behind them: inside a Home Run the guard fails closed. A tool not in TOOLS needs act and a press; a
// source's `do` needs a press unless the door itself says this act does not; a name or a short label is never what
// lets a call go without one (ceiling.ts's PRESS may only add a press).
import type { Rung } from "./policy.js";

export type Door = "read" | "propose" | "draft" | "do";
/** a door's rung, on the ladder read · propose · draft · act */
export const DOOR_RUNG: Readonly<Record<Door, Rung>> = { read: "read", propose: "propose", draft: "draft", do: "act" };
/** whether a door's call waits for a press when the door says nothing of it: its `do` does (send, submit, pay and
 *  whatever else it does to the world) */
export const DOOR_PRESS: Readonly<Record<Door, boolean>> = { read: false, propose: false, draft: false, do: true };

/** the tools a Claude seat has that are known: the rung each needs and that it goes without a press within the
 *  limit. `made` is a write tool: draft inside the Thing's made/ folder, act anywhere else. WebFetch and WebSearch
 *  send what they are given out of the machine (a URL can carry anything): act, so a record-only Run never runs them.
 *  Every other tool (any MCP tool, every one of Sol's own) needs act and a press */
export const TOOLS: Readonly<Record<string, { rung: Rung; made?: true }>> = {
  Read: { rung: "read" }, Glob: { rung: "read" }, Grep: { rung: "read" }, TodoWrite: { rung: "read" },
  Write: { rung: "act", made: true }, Edit: { rung: "act", made: true }, MultiEdit: { rung: "act", made: true }, NotebookEdit: { rung: "act", made: true },
  Bash: { rung: "act" }, WebFetch: { rung: "act" }, WebSearch: { rung: "act" },
};

/** a call's fields that are free text (a message's body, a file's content): their string leaves are left off an ask's
 *  card, which names them (its `hidden`); the whole call is in the ask's value file on the log, which the card links.
 *  The card always walks into an object or a list under such a key, so a target in it is shown */
export const FREE_TEXT: readonly string[] = ["body", "text", "content", "message", "html", "description", "prompt", "new_string", "old_string", "notes"];
/** a call's fields that name where it goes or what it costs: shown first on an ask's card, and never hidden, at any depth
 *  (a field under one is a target too). `recipient` covers `recipients`, `recipient_email` and the like; a `…_path` or
 *  `…_url` (`file_path`) is a path or a url */
export const TARGET = /^(to|cc|bcc|recipient.*|amount|payee|command|url|path|.+_path|.+_url)$/;
/** how much of one key or value an ask's card shows; the rest is in the ask's value file, which the field names. Over
 *  CARD_CUT characters a field keeps its first and last CARD_CUT / 2 (what it does may be at its end), whatever its key
 *  is called, is listed in the card's `cut`, and a yes on that card must carry `opened: true` */
export const CARD_CUT = 200;
