// Home's blank sticky (#1485), "which place?" when there is no Jev: the cheapest Claude in the person's own list
// (models.ts cheapest) is asked once, on their own Claude sign-in, so the sticky's words go to their own AI and nowhere
// else. One turn with nothing in its hands: no tool, no server, none of their settings, hooks or CLAUDE.md, kept as no
// conversation. A quiet Sol asks nothing (#1293); past the day's cap, with no model, an error, a slow answer or an
// answer that is not one of the places offered: null, and the face keeps the sticky loose ("in no place yet").
// The log line is counts only, never a word of the sticky or of an error.
import { tmpdir } from "node:os";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { cheapest } from "../models.js";
import { isQuiet } from "../quiet.js";
import type { WhereFolder } from "./whereJev.js";

/** how many times a day the model may be asked; the face waits 6 s, so the turn gets a little less */
export const CAP = 100, BUDGET = 5500;

const SYSTEM = "You sort a person's sticky notes into their places. Answer with one line of JSON and nothing else: " +
  '{"place": "<one id from the list>", "confidence": <0 to 1>, "next": "<another id, or empty>"}. ' +
  "Pick the place whose stickies are the same class, the same employer or the same kind of task. If none fits, say confidence 0.";

/** the turn's text (pure): the sticky, and each place with its id, its name and its last few stickies */
export function wherePrompt(sticky: string, folders: WhereFolder[]): string {
  const list = folders.map((f) => `${f.id} (${f.name}): ${f.things.slice(-5).join("; ") || "nothing yet"}`).join("\n").slice(0, 2400);
  return `Places:\n${list}\n\nSticky: ${sticky.slice(0, 300)}`;
}

/** the answer (pure): the first JSON object in the text, its place one of those offered; else null. `near` is the
 *  place and the model's next one, as whereJev.ts gives them */
export function whereModelSaid(text: string, folders: WhereFolder[]): { folder: string; confidence: number; near: string[] } | null {
  const m = /\{[\s\S]*?\}/.exec(text ?? "");
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const ids = new Set(folders.map((f) => f.id)), c = Number(j?.confidence);
  if (typeof j?.place !== "string" || !ids.has(j.place) || !Number.isFinite(c)) return null;
  const next = typeof j.next === "string" && j.next !== j.place && ids.has(j.next) ? [j.next] : [];
  return { folder: j.place, confidence: Math.min(1, Math.max(0, c)), near: [j.place, ...next] };
}

/** the seat: the cheapest model, nothing else (as parts/onboard.ts's SEAT) */
export const seat = (model: string): Options => ({
  model, systemPrompt: SYSTEM, thinking: { type: "disabled" },
  tools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], permissionMode: "dontAsk",
  canUseTool: async () => ({ behavior: "deny", message: "this seat uses nothing" }),
  persistSession: false, cwd: tmpdir(),
});

/** one turn on the person's own Claude: its text, or a throw */
async function turn(text: string, model: string, ms: number): Promise<string> {
  const q = query({ prompt: text, options: seat(model) });
  let stop: ReturnType<typeof setTimeout> | undefined;
  const read = (async () => {
    for await (const m of q as AsyncIterable<SDKMessage>) {
      if (m.type !== "result") continue;
      if (m.subtype === "success" && !m.is_error) return m.result ?? "";
      throw new Error("the turn failed");
    }
    throw new Error("no answer");
  })();
  try { return await Promise.race([read, new Promise<never>((_, no) => { stop = setTimeout(() => no(new Error("slow")), ms); })]); }
  finally { clearTimeout(stop); try { q.close(); } catch { /* gone already */ } }
}

// the day's count, by the Mac's own date; it starts again at midnight and when the engine does
let day = "", asked = 0;
const today = (now: Date) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

export async function askWhereByModel(sticky: string, folders: WhereFolder[], o: {
  model?: string | null; run?: (text: string, model: string, ms: number) => Promise<string>; budget?: number; now?: Date; cap?: number; quiet?: boolean;
} = {}) {
  if ((o.quiet ?? isQuiet()) || !sticky.trim() || folders.length < 2) return null;
  const model = o.model !== undefined ? o.model : cheapest();
  if (!model) return null;
  const d = today(o.now ?? new Date());
  if (d !== day) { day = d; asked = 0; }
  if (asked >= (o.cap ?? CAP)) return null;
  asked++;
  try { return whereModelSaid(await (o.run ?? turn)(wherePrompt(sticky, folders), model, o.budget ?? BUDGET), folders); }
  catch { console.log(`agent.where: no answer from ${model} (${asked} of ${o.cap ?? CAP} today)`); return null; }
}
