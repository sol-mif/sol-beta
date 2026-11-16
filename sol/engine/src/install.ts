// The install tool (the design's loader, "when it loads", X7): an AI that wrote a block into the home asks the engine to
// take it in now, and hears how it went: done, done from a seat's next conversation, or failed and why. Four actions:
// install (check it and load it), remove (take it out: nothing runs, its folder stays), version (go to one of its
// versions) and undo (one version back). The 1.5-second look stays for a person editing by hand. It never presses a card:
// a block that goes beyond its wall waits for a person's press in Sol, and the answer says so.
import { z } from "zod";
import { kernelNow } from "./kernel.js";
import type { ToolResult } from "./browser.js";

export const INSTALL_TOOLS = [
  {
    name: "things",
    description: "Take a block in the home's things/ into Sol now, and hear how it went. install: check the record and its versions, " +
      "load it, start a big room once. remove: take it out (nothing of it runs; its folder and data stay). version: make one of its " +
      "versions current (v). undo: one version back (its own data goes back with it; what it sent out does not), or put back one taken out. factory: take every block out, back to Sol as it came (nothing deleted; each can be put back). Answers done, restart (loaded; its tools reach a seat from the seat's next " +
      "conversation) or failed with why. A block that asks for something beyond its wall waits for the person to press its card in " +
      "Sol: tell them; this tool cannot press it.",
    shape: {
      action: z.enum(["install", "remove", "version", "undo", "factory"]),
      id: z.string().optional().describe("The block's folder name under things/ (not for factory)."),
      v: z.number().optional().describe("For version: the version to make current."),
    },
  },
];

export async function runInstallTool(_name: string, args: unknown): Promise<ToolResult> {
  const a = (args ?? {}) as { action?: unknown; id?: unknown; v?: unknown };
  const k = kernelNow();
  const say = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });
  if (!k) return say("failed: the frame is off on this engine (sol.frame), so no block loads", true);
  if (a.action === "factory") { const r = await k.factory(); return say(`done: back to Sol as it came. Taken out: ${r.off.join(", ") || "none"}; each is put back with undo or install`); }
  const id = typeof a.id === "string" ? a.id : "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return say("failed: id is the block's folder name (lowercase letters, digits and -)", true);
  const r = a.action === "install" ? await k.install(id) : a.action === "remove" ? await k.remove(id) : a.action === "version" ? await k.version(id, a.v) : a.action === "undo" ? await k.back(id) : null;
  if (!r) return say("failed: action is install, remove, version, undo or factory", true);
  return say(`${r.status}: ${r.say}`, r.status === "failed");
}
