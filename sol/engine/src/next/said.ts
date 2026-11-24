// The person's folders, in their own words (#1816 round 2; Marco's product notes of 2026-11-23: no fixed rule decides a person's
// folders). People see their computer each their own way, so they say it, and the agent turns the sentence into folders:
//   folders_set { words, folders: [{ path, name?, inside?, open? }], yes }
//     words    what the person said about their folders, as they said it, kept with the folders it gave
//     folders  each folder they named, outermost first: its path on this computer (the agent finds it with its own file
//              tools), the name they call it, the folder it sits in when that is not where the disk has it, `open: false`
//              for a folder whose own folders are not theirs to see one by one (a project's code)
//     yes      their own words this turn asking for it (openfor.ts saidThisTurn), as place_add's: a guess changes nothing
// Kept in movein.json's `said` (movein.ts setSaid); from then the tree is those folders and nothing Sol finds is added
// (tree.ts). A new sentence replaces the last whole. Offered while ui.next is on, as suggest_setup is; every window
// hears next.state again. Nothing leaves the Mac. Signed: marcocyl04-ux's agent (#1816).
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import type { ToolResult, TurnCtx } from "../browser.js";
import { saidThisTurn } from "../openfor.js";
import { uiNext } from "../settings.js";
import { SAID_MAX, setSaid, type SaidFolder } from "./movein.js";
import { holdsAll } from "./movein-place.js";

export const SAID_TOOLS = [
  {
    name: "folders_set",
    description: "Set the person's folders, the ones Sol's canvas and sidebar show, from how they describe their computer " +
      "in their own words, when they ask for it this very turn (\"my folders are School, Jobs and Business in computer, " +
      "each class inside School\"). Find each folder on this computer with your file tools first, then pass every folder " +
      "they named, outermost first, as its full path; `name` only when they call it something other than the folder's " +
      "name; `inside` (a path in this list) only when they put it inside a folder the disk does not; `open: false` for a " +
      "folder whose own folders they would not want listed one by one (a project's code, an app). A folder's own folders " +
      "show one level down unless `open` is false. This replaces the whole list; nothing Sol finds is added to it. `words` " +
      "is what they said about their folders, `yes` their own words from this turn asking for it, two words at least, " +
      "copied exactly: refused when they are not in what they said.",
    shape: {
      words: z.string().min(1).max(4000),
      folders: z.array(z.object({ path: z.string().min(1).max(1000), name: z.string().max(200).optional(), inside: z.string().max(1000).optional(), open: z.boolean().optional() })).min(1).max(SAID_MAX),
      yes: z.string().min(2).max(400),
    },
  },
] as const;
export const SAID_NAMES = new Set<string>(SAID_TOOLS.map((t) => t.name));
/** the tool while ui.next is on, none while it is off (read at each turn's start) */
export const saidToolsNow = () => (uiNext() ? [...SAID_TOOLS] : []);

let HOME = "", onSaid: () => void = () => {};
/** Sol's home and what to do once the folders are set (parts/next.ts: every window hears next.state again) */
export function setSaidTool(home: string, then: () => void): void { HOME = home; onSaid = then; }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
const trim = (p: string) => p.replace(/[\\/]+$/, "") || "/";
const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** the folders as kept (pure but for the disk), or why not: each a folder on the disk now, none that holds everything
 *  (the person's home, an app's storage, a sync root), not Sol's own home; "~" is the person's home; once each */
export function checkSaid(folders: readonly SaidFolder[], sol: string, user: string): { folders: SaidFolder[] } | { why: string } {
  const full = (p: string) => trim(p === "~" ? user : p.startsWith("~/") ? resolve(user, p.slice(2)) : resolve(p));
  const out: SaidFolder[] = [], seen = new Set<string>(), bad: string[] = [];
  for (const f of folders.slice(0, SAID_MAX)) {
    const path = full(f.path);
    if (seen.has(path)) continue;
    if (!isDir(path)) { bad.push(`${f.path} is not a folder on this computer`); continue; }
    if (path === trim(sol)) { bad.push(`${f.path} is Sol's own home, not one of the person's folders`); continue; }
    if (holdsAll(path, [user])) { bad.push(`${f.path} holds everything (the home folder, an app's storage or a sync folder), so it is no one folder`); continue; }
    seen.add(path);
    const name = f.name?.trim(), inside = f.inside?.trim() ? full(f.inside.trim()) : undefined;
    out.push({ path, ...(name ? { name } : {}), ...(inside && inside !== path ? { inside } : {}), ...(f.open === false ? { open: false } : {}) });
  }
  if (!out.length) return { why: bad.join("; ") || "no folder given" };
  return bad.length ? { why: `${bad.join("; ")}. Find those with your file tools and set the list again` } : { folders: out };
}

/** the tool run against a home (the engine's, or a test's) */
export async function runSaidTool(name: string, args: unknown, turn: TurnCtx = {}, home = HOME, now = Date.now()): Promise<ToolResult> {
  if (!SAID_NAMES.has(name)) return text(`no tool ${name}`, true);
  if (!uiNext()) return text("not changed: the person's Sol does not show folders this way yet", true);
  if (!home) return text("not changed: Sol has not started its home yet", true);
  const a = (args ?? {}) as { words?: unknown; folders?: unknown; yes?: unknown };
  if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.", true);
  const parsed = z.object(SAID_TOOLS[0].shape).safeParse(a);
  if (!parsed.success) return text(`not changed: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, true);
  const user = process.env.HOME || homedir(), r = checkSaid(parsed.data.folders, home, user);
  if ("why" in r) return text(`not changed: ${r.why}`, true);
  setSaid(home, { at: now, words: parsed.data.words, folders: r.folders }, now);
  onSaid();
  const shown = r.folders.map((f) => f.name ?? f.path.split(/[\\/]/).pop()).join(", ");
  return text(`Set. The canvas and the sidebar now show ${r.folders.length} folder${r.folders.length === 1 ? "" : "s"} (${shown}), each with its own folders one level down unless closed. Everything else Sol found waits under "Not sorted yet" in the sidebar.`);
}
