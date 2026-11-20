// Home's rules by talking (#1686, gate one q2 and q4 of home.whole): one tool on the "sol" server, both seats, offered
// only while Home runs (wire.ts homeOn). On the person's own words this very turn (openfor.ts saidThisTurn, unchanged:
// two words at least, copied from what they said), never on a guess:
//   home_rule { words, folder, yes }           a part that holds one of these words is filed to this folder (rules.ts)
//   home_rule { words, remove: true, yes }     these words file nowhere of the person's own any more
//   home_rule { read: [folders], yes }         the folders Home reads (sources/files.json `reads`; `never` kept)
// Each write is whole (safewrite.ts); every window is told home.places and home.sources again. Nothing leaves the Mac.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ToolResult, TurnCtx } from "../browser.js";
import { saidThisTurn } from "../openfor.js";
import { plainIn, writeWhole } from "../safewrite.js";
import { placesMsg } from "./places.js";
import { addRule, dropRule, readOwn, writeOwn } from "./rules.js";
import { sourcesMsg } from "./sources.js";
import type { Ctx } from "./unit.js";
import { homeNow, homeOn } from "./wire.js";

export const HOME_RULE_TOOLS = [
  {
    name: "home_rule",
    description: "Change how the person's Home files what they write, or which folders it reads, when they asked for it " +
      "in this very turn (\"put anything about swim in Clubs › Swim\", \"stop filing gala there\", \"read my Notes folder\"). " +
      "`words` (with `folder`) files a part holding any of those words into that folder, `folder` as Home names it " +
      "(\"clubs › swim\"); with `remove: true` those words stop filing anywhere; `read` is the whole list of folders Home " +
      "reads (\"~/Notes\" or a full path). `yes` is the person's own words from this turn that ask for it, two words at " +
      "least (in Chinese or Japanese, four characters), copied exactly: refused when they are not in what they said.",
    shape: {
      words: z.array(z.string().min(1).max(80)).max(40).optional(),
      folder: z.string().min(1).max(400).optional(),
      remove: z.boolean().optional(),
      read: z.array(z.string().min(1).max(500)).max(40).optional(),
      yes: z.string().min(2).max(400),
    },
  },
] as const;
export const HOME_RULE_NAMES = new Set<string>(HOME_RULE_TOOLS.map((t) => t.name));
/** the tool while Home runs, none while it does not (read at each turn's start) */
export const homeRuleToolsNow = () => (homeOn() ? [...HOME_RULE_TOOLS] : []);

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

/** the folders Home reads, written: `never` as it was (the default's when there was no file) */
function writeReads(home: string, reads: string[], never: string[]): void {
  const f = join(home, "sources", "files.json");
  let keep = never;
  const p = plainIn(f, home);
  if (p) { try { const j = JSON.parse(readFileSync(p, "utf8")); if (Array.isArray(j?.never) && j.never.every((x: unknown) => typeof x === "string")) keep = j.never; } catch { /* the default's */ } }
  writeWhole(f, JSON.stringify({ reads, never: keep }, null, 2) + "\n", { root: home });
}

/** the tool run against a Home (the live one, or a test's) */
export async function runHomeRuleTool(name: string, args: unknown, turn: TurnCtx = {}, ctx: Ctx | null = homeNow()): Promise<ToolResult> {
  if (name !== "home_rule") return text(`unknown tool ${name}`, true);
  if (!ctx) return text("home_rule: Home is not on in this Sol", true);
  const a = (args ?? {}) as { words?: unknown; folder?: unknown; remove?: unknown; read?: unknown; yes?: unknown };
  if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.", true);
  const ws = Array.isArray(a.words) ? a.words.filter((w): w is string => typeof w === "string" && !!w.trim()).map((w) => w.trim()) : [];
  const tellAll = () => { try { ctx.all(placesMsg(ctx)); ctx.all(sourcesMsg(ctx, null)); } catch { /* the next ask reads it */ } };
  if (Array.isArray(a.read)) {
    const reads = [...new Set(a.read.filter((r): r is string => typeof r === "string" && !!r.trim()).map((r) => r.trim()))];
    const was = sourcesMsg(ctx, null).sources.find((s) => s.id === "files")?.scope;
    writeReads(ctx.home, reads, was?.never ?? ["~/Desktop", "~/Downloads"]);
    tellAll();
    return text(reads.length ? `Home reads ${reads.join(", ")} now (was ${was?.reads.join(", ") || "none"}).` : "Home reads no folder now.");
  }
  if (!ws.length) return text("not changed: say which words (words) and, to file them, the folder (folder)", true);
  const own = readOwn(ctx.home);
  if (a.remove === true) {
    const next = dropRule(own, ws);
    if (JSON.stringify(next) === JSON.stringify(own)) return text(`nothing changed: no rule of theirs holds ${ws.join(", ")}`);
    writeOwn(ctx.home, next);
    tellAll();
    return text(`${ws.join(", ")} no longer file anywhere of their own; Home files them by its other rules.`);
  }
  const folder = typeof a.folder === "string" ? a.folder.replace(/\s*›\s*/g, " › ").replace(/\s+/g, " ").trim().toLowerCase() : "";
  if (!folder) return text("not changed: name the folder (folder), as Home shows it", true);
  writeOwn(ctx.home, addRule(own, ws, folder));
  tellAll();
  return text(`From now on a part with ${ws.join(", ")} is filed to ${folder}.`);
}
