// make_automation: a session makes an automation and keeps it on its own table (#1615 BR1, birth.html row 5). Add's
// Automation tile opens a session, not a form (the face's work.say carries purpose "automation"); the session is told
// what it is for before the person's words (AUTOMATION_PURPOSE, work/runs.ts), asks what should happen and when, and
// makes it here: paused, as next.autos.make makes one, with `in` its session, so the window draws it on that session's
// table and never loose on the canvas. Nothing runs until the person presses Turn on. Offered only while ui.next is on
// (settings.ts uiNext(), read at each turn's start); a call while it is off is refused. Listed and routed through
// next/workspace-tool.ts, as the tabs' verbs are, so tools.ts is not touched.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { z } from "zod";
import type { ToolResult } from "../browser.js";
import { uiNext } from "../settings.js";
import { autosMsg, make, WHEN_HELP } from "./automations.js";

/** read before the person's first words in a session Add's Automation opened */
export const AUTOMATION_PURPOSE = "The person pressed Add → Automation: this session is for one thing that should happen on " +
  "its own. If their words do not say both what should happen and when, ask for what is missing, in one short question. " +
  "When you have both, make it with make_automation. It is made paused, on this session's table; say in one line what " +
  "you made and that it runs only once they press Turn on.";

export const AUTO_TOOLS = [
  {
    name: "make_automation",
    description: "Make an automation: something Sol does on its own, at a time or when a file comes into a folder. It is " +
      "made paused and kept on this session's table, where the person turns it on; nothing runs before that. `does`: what " +
      "it should do each time, as an instruction to the AI that runs it. `when`: " + WHEN_HELP + " `name`: a short title, " +
      "else its first words. An event works in this session's folder. Use it when the person asks for something to happen " +
      "by itself, again and again.",
    shape: { does: z.string().min(1).max(8000), when: z.string().min(1).max(200), name: z.string().max(120).optional() },
  },
] as const;
export const AUTO_NAMES = new Set<string>(AUTO_TOOLS.map((t) => t.name));
/** the tool while ui.next is on, none while it is off (read at each turn's start) */
export const autoToolsNow = () => (uiNext() ? [...AUTO_TOOLS] : []);

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

/** the tool against a home: made in `session` (its table) and its folder `cwd`; every window told (`tell`) */
export function runAutoTool(name: string, args: unknown, home: string, session: string | undefined, cwd: string | undefined, tell: (m: object) => void): ToolResult {
  if (!AUTO_NAMES.has(name)) return text(`unknown tool ${name}`, true);
  if (!uiNext()) return text(`${name} is not part of this Sol yet.`, true);
  if (!home) return text("not made: Sol has not started its home yet", true);
  if (!session) return text("not made: only a session can make one, on its own table", true);
  const a = (args && typeof args === "object" ? args : {}) as { does?: unknown; when?: unknown; name?: unknown };
  const r = make(home, { does: a.does, when: a.when, name: a.name, cwd, in: session });
  if (!r.ok) return text(`not made: ${r.why}`, true);
  try { tell(autosMsg(home)); } catch { /* the windows ask again when they open */ }
  return text(`made “${r.auto.name}”, paused: it runs ${r.auto.when}. It is on this session's table; nothing runs until the person presses Turn on.`);
}
