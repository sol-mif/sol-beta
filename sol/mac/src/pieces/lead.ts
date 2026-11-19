// What leads the one space (pieces/arrange.ts `rule`'s `lead`), read in the face until the engine names it (stage.set,
// #1067): an artifact that waits on you; else the one just made or changed, until Sol has written to you since; else one
// being worked on; else the chat. Pure, so the engine's half can take its place with the same answers.
import { OPEN_MAX, TALK } from "./arrange.ts";

/** what in the chat is written for the person to read or answer */
export const FOR_YOU = new Set(["you", "wrap", "perm", "checkpoint", "handin"]);
/** the artifact last made or changed, and how long the chat was then */
export type Touch = { id: string; at: number };

/** the artifacts made or changed since the last read: an id not seen before, or a different object (the store hands an
 *  unchanged block back as the same object). `prev` null is the first read of a session: nothing counts as just made */
export function touched(prev: ReadonlyMap<string, unknown> | null, blocks: readonly { id: string }[]): string[] {
  if (!prev) return [];
  return blocks.filter((b) => prev.get(b.id) !== b).map((b) => b.id);
}

export function leadOf(o: { open: readonly string[]; state: Readonly<Record<string, string>>; touch: Touch | null; items: readonly { kind: string }[] }): string {
  const waits = o.open.find((id) => o.state[id] === "waits");
  if (waits) return waits;
  const t = o.touch;
  if (t && o.open.includes(t.id) && !o.items.slice(t.at).some((i) => FOR_YOU.has(i.kind))) return t.id;
  return o.open.find((id) => o.state[id] === "working") ?? TALK;
}

/** the artifacts that stand open, OPEN_MAX at most: the one that leads first, then the ones the hand holds, then the
 *  newest; the rest are named at the bottom edge */
export function openNow(open: readonly string[], lead: string, held: readonly string[]): string[] {
  const first = [...(open.includes(lead) ? [lead] : []), ...held.filter((id) => id !== lead && open.includes(id))];
  return [...first, ...open.filter((id) => !first.includes(id))].slice(0, OPEN_MAX);
}

/** the chat as one line: what Sol is doing now, or the last thing it wrote to you */
export type Said = { text: string; state: "working" | "asks" | "said" };
type It = { kind: string; [k: string]: any };
const plain = (t: string) => t.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
/** the chat ends on a question to you that you have not answered */
export function asksOf(items: readonly It[], busy: boolean): boolean {
  if (busy) return false;
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.kind === "me") return false; if (it.kind === "wrap") return !!it.ask; }
  return false;
}
export function saidOf(items: readonly It[], busy: boolean): Said | null {
  if (busy) {
    const t = [...items].reverse().find((i) => i.kind === "tool");
    const d = t && (t.input?.description || (t.input?.file_path ? `${t.name} ${String(t.input.file_path).split("/").pop()}` : t.name));
    return { state: "working", text: d ? String(d) : "working" };
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "wrap") return asksOf(items, busy) ? { state: "asks", text: plain(String(it.ask)) } : { state: "said", text: plain(String(it.recap ?? "")) };
    if (it.kind === "you" && it.text) return { state: "said", text: plain(String(it.text)) };
  }
  return null;
}
