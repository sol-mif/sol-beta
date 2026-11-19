// Teams as a source (step 2), the same shape as mail: chats and mentions since the last look, kept to the folder's
// people, a draft and a card, never sent. Read only, never a click (guard.ts): the chat list, then each chat whose row
// changed, opened by its own address; the mentions from the activity feed. What was seen is kept in
// <folder>/.agent/teams-last.json; the first look is a baseline.
//
// The pages' shapes the reader looks for (late 2026, untried on the real site; the fake copies them):
//   the chat list   <base>/v2/  rows [data-tid="chat-list-item"][data-chat-id], their lines: name, time, preview
//   a chat          <base>/l/chat/<id>/conversations  [data-tid="chat-pane-message"][data-mid], the author in
//                   [data-tid="message-author-name"], the time in time[datetime], the text in [data-tid="chat-pane-message-body"]
//   mentions        <base>/v2/activity  [data-tid="activity-feed-item"][data-chat-id][data-mid], author, text
import type { Page } from "playwright";
import { withPage, type TurnCtx } from "../../browser.js";
import { baseOf, signInPage } from "../sites.js";
import type { Message } from "./messages.js";

export type Row = { chat: string; lines: string[] };
export type RawMsg = { chat: string; mid: string; author: string; time: string; text: string; mention?: boolean; mine?: boolean };
export type TeamsLast = { rows: Record<string, string>; ids: string[]; opened: string[] };

/** a chat row's signature: what changes when a message comes (pure) */
export const rowSig = (r: Row) => r.lines.map((l) => l.trim()).filter(Boolean).join(" | ").slice(0, 300);
/** the chats to open this look (pure): every one at the first look (to learn what is old), else those whose row changed */
export function chatsToOpen(rows: Row[], last: TeamsLast | null, cap = 15): string[] {
  return rows.filter((r) => !last || last.rows[r.chat] !== rowSig(r)).map((r) => r.chat).slice(0, cap);
}
/** messages from what the pages showed (pure) */
export function teamsMessages(raw: RawMsg[]): Message[] {
  return raw.filter((r) => r.mid && r.text.trim()).map((r) => ({ id: `${r.chat}:${r.mid}`, site: "teams", from: r.author.trim(), text: r.text.trim().slice(0, 2000), at: r.time, kind: r.mention ? "mention" as const : "chat" as const, subject: r.mention ? "mentioned you" : undefined, ...(r.mine ? { mine: true } : {}) }));
}
/** what is new (pure): not seen before; in a chat opened for the first time since the baseline, only its last 3 */
export function newTeams(last: TeamsLast | null, now: Message[]): Message[] {
  if (!last) return [];
  const known = new Set(last.ids), opened = new Set(last.opened);
  const fresh = now.filter((m) => !known.has(m.id));
  const byChat = new Map<string, Message[]>();
  for (const m of fresh) { const c = m.id.split(":").slice(0, -1).join(":"); byChat.set(c, [...(byChat.get(c) ?? []), m]); }
  return [...byChat].flatMap(([c, ms]) => (opened.has(c) || ms.some((m) => m.kind === "mention") ? ms : ms.slice(-3)));
}

async function go(p: Page, url: string) {
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

export async function readTeams(turn: TurnCtx, last: TeamsLast | null): Promise<{ signedOut: true } | { signedOut: false; rows: Row[]; messages: Message[]; opened: string[] }> {
  const base = baseOf("teams");
  return withPage(turn, async (p) => {
    await go(p, `${base}/v2/`);
    const text = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (signInPage("teams", p.url(), text)) return { signedOut: true as const };
    const rows: Row[] = await p.evaluate(() => Array.from(document.querySelectorAll('[data-tid="chat-list-item"][data-chat-id]')).slice(0, 60).map((el) => ({ chat: el.getAttribute("data-chat-id") ?? "", lines: (el as HTMLElement).innerText.split("\n") }))).catch(() => []);
    const readMsgs = (mention: boolean) => p.evaluate((m) => Array.from(document.querySelectorAll(m ? '[data-tid="activity-feed-item"][data-mid]' : '[data-tid="chat-pane-message"][data-mid]')).slice(-40).map((el) => ({
      chat: el.getAttribute("data-chat-id") ?? "", mid: el.getAttribute("data-mid") ?? "",
      author: (el.querySelector('[data-tid="message-author-name"]') as HTMLElement | null)?.innerText ?? "",
      time: el.querySelector("time")?.getAttribute("datetime") ?? (el.querySelector("time") as HTMLElement | null)?.innerText ?? "",
      text: (el.querySelector('[data-tid="chat-pane-message-body"]') as HTMLElement | null)?.innerText ?? "",
      mention: m, mine: el.getAttribute("data-mine") === "true",
    })), mention).catch(() => [] as RawMsg[]);
    const raw: RawMsg[] = [];
    const open = chatsToOpen(rows, last);
    for (const chat of open) {
      await go(p, `${base}/l/chat/${encodeURIComponent(chat)}/conversations`).catch(() => {});
      raw.push(...(await readMsgs(false)).map((r) => ({ ...r, chat })));
    }
    await go(p, `${base}/v2/activity`).catch(() => {});
    raw.push(...(await readMsgs(true)).map((r) => ({ ...r, chat: r.chat || "activity" })));
    return { signedOut: false as const, rows, messages: teamsMessages(raw), opened: open };
  });
}
