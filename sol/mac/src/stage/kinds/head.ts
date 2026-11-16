// A block's head in words (v4 §4, #738): what it says on hover and the stamp a frozen one wears. Pure, apart from
// Frame.tsx, so the face's tests reach it.
import type { Block } from "../model";
import { chipWords, isRunBody } from "./runs.ts";

export const hhmm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** the head's words on hover: "page · made 21:06 · calendar.ts"; a run's list says its sessions; waits says so */
export function metaWords(b: Block, made?: number): string {
  if (b.state === "waits") return "waits on you";
  if (isRunBody(b.body)) return chipWords(b.body);
  const src = b.bind?.source?.split("/").pop();
  return [b.kind, made ? `made ${hhmm(made)}` : "", src ?? ""].filter(Boolean).join(" · ");
}
/** the stamp a frozen block wears: "frozen · v2 · 21:14" */
export function stampWords(b: Block, at: number): string {
  const v = b.versions[at - 1];
  return v ? `frozen · v${v.n} · ${hhmm(v.at)}` : "frozen";
}

