// Home's world (#1093), Jev's pick 3: a session that stopped, is it finished? The face asks `agent.finished` with the
// session's id only. The engine looks its title up itself and reads the talk's SHAPE: how many turns, how many tool
// calls, what kind the last item is, whether the last reply ends in a question (a yes or no worked out here), how long
// it has been quiet. No text of a prompt or of an agent's message ever leaves the machine (tonight's rule for Jev:
// shapes, kinds, ids, counts, titles). Jev answers a `noul`. 0.7 and over: the world lays it on today's shelf by
// itself (undo); 0.45 and over: "done?" on the shelf he can press; under: it stays. No key, an error or over 4 s: null.
import { JEV_URL, jevKey } from "./jev.js";

export type Shape = { turns: number; tools: number; errors: number; last: "reply" | "tool" | "error" | "person" | "none"; asks: boolean; quiet_s: number };

/** the talk's shape (pure over the items): counts and kinds, never a word of it */
export function shapeOf(items: { kind: string; text?: unknown; parent?: unknown; ask?: unknown }[], updatedAt: number | undefined, now: number): Shape {
  const top = items.filter((x) => !x.parent);
  const kinds: Record<string, Shape["last"]> = { you: "reply", tool: "tool", error: "error", me: "person" };
  const lastOne = [...top].reverse().find((x) => x.kind in kinds);
  const lastReply = [...top].reverse().find((x) => x.kind === "you" && String(x.text ?? "").trim());
  const wrapAsks = top.some((x) => x.kind === "wrap" && x.ask != null && String(x.ask).trim() !== "");
  return {
    turns: top.filter((x) => x.kind === "me").length,
    tools: top.filter((x) => x.kind === "tool").length,
    errors: top.filter((x) => x.kind === "error").length,
    last: lastOne ? kinds[lastOne.kind] : "none",
    asks: wrapAsks || (lastReply ? /\?\s*$/.test(String(lastReply.text)) : false),
    quiet_s: updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0,
  };
}
/** the request (pure): the title the engine holds and the shape, one noul question */
export function doneBody(title: string, s: Shape) {
  return {
    model: "jev-latest",
    state: {
      session: title.slice(0, 120),
      turns: String(s.turns), tool_calls: String(s.tools), errors: String(s.errors),
      last_item: s.last, last_reply_asks_a_question: String(s.asks), quiet_seconds: String(s.quiet_s),
    },
    questions: {
      finished: {
        type: "noul",
        instructions: "This work session stopped. From its title and the shape of the talk only, is its work finished, with nothing left open for the person?",
        criteria: { true: "the last item is a reply, it asks no question, and the talk has no error", false: "the last reply asks a question, or the last item is an error, a tool call or the person's own message still unanswered" },
      },
    },
  };
}
/** the answer (pure): how sure Jev is that it is finished, 0..1; null when it did not say */
export function doneSaid(json: any): number | null {
  const v = Number(json?.answers?.finished?.noul);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}
export async function askDone(title: string, s: Shape, o: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}): Promise<number | null> {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key || !title || s.last === "none") return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(doneBody(title, s)), signal: ac.signal });
    return r.ok ? doneSaid(await r.json()) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** agent.finished's whole answer, over its three calls (stubbed in the tests): the session must be one the engine
 *  lists; Jev is told "a work session" (a title can be the person's first prompt) and the talk's shape. */
export async function finishedFor(id: string, d: {
  sessions: () => Promise<{ id: string; updatedAt?: number }[]>;
  items: (id: string) => Promise<{ kind: string; text?: unknown; parent?: unknown; ask?: unknown }[]>;
  ask?: typeof askDone; now?: number;
}): Promise<number | null> {
  try {
    const row = (await d.sessions()).find((x) => x.id === id); if (!id || !row) return null;
    return await (d.ask ?? askDone)("a work session", shapeOf(await d.items(id), row.updatedAt, d.now ?? Date.now()));
  } catch { return null; }
}
