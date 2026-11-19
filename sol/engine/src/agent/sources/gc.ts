// The group chat as a source (step 2): WhatsApp Web in the folder's own browser, read only. The look opens WhatsApp,
// clicks the named group in the chat list (the one click guard.ts allows there), scrolls up until it meets the last
// message it read (at most 6 times), and hands back what came since. The QR page is the sign-in (signin.ts). What was
// read is kept in <folder>/.agent/gc-last.json; the first look reads back what is loaded (the group's recent past, at
// most 60 messages), so owed.md starts with what is already asked of him.
//
// The page's shape the reader looks for (WhatsApp Web, late 2026; the fake copies it):
//   the chat list  #pane-side, a chat by span[title="<group>"]
//   messages       #main [data-pre-plain-text="[10:42, 11/9/2026] Leslie Garcia: "], the text in .selectable-text;
//                  his own inside .message-out
import type { Page } from "playwright";
import { createHash } from "node:crypto";
import { withPage, type TurnCtx } from "../../browser.js";
import { clickSafe } from "../guard.js";
import { baseOf, signInPage } from "../sites.js";
import type { Message } from "./messages.js";

export type RawLine = { pre: string; text: string; out: boolean };

/** "[10:42, 11/9/2026] Leslie Garcia: " → its time and who (pure); "[10:42 PM, 11/9/2026]" too */
export function preOf(pre: string): { at: string; who: string } | null {
  const m = /^\[(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]\s*(.*?):\s*$/i.exec(pre.trim() + (pre.trim().endsWith(":") ? "" : ":"));
  if (!m) return null;
  const h = m[3] ? Number(m[1]) % 12 + (/p/i.test(m[3]) ? 12 : 0) : Number(m[1]);
  const y = m[6].length === 2 ? `20${m[6]}` : m[6];
  return { at: `${y}-${m[4].padStart(2, "0")}-${m[5].padStart(2, "0")} ${String(h).padStart(2, "0")}:${m[2]}`, who: m[7].trim() };
}

/** the group's lines as messages, each with a key that stays the same from look to look (pure) */
export function gcMessages(raw: RawLine[], me = "Marco"): Message[] {
  const out: Message[] = [];
  const seen = new Map<string, number>();
  for (const r of raw) {
    const p = preOf(r.pre);
    if (!p || !r.text.trim()) continue;
    const base = createHash("sha256").update(`${p.at}|${p.who}|${r.text.trim()}`).digest("hex").slice(0, 12);
    const n = (seen.get(base) ?? 0) + 1;   // the same words twice in the same minute: two messages
    seen.set(base, n);
    out.push({ id: n > 1 ? `${base}-${n}` : base, site: "whatsapp", from: r.out ? me : p.who, text: r.text.trim().slice(0, 2000), at: p.at, kind: "chat", ...(r.out ? { mine: true } : {}) });
  }
  return out;
}

/** what came after the last message read (pure). No last: the last `firstLook` messages. A last that is not loaded any
 *  more: everything loaded that was not seen (by key) */
export function sinceLast(all: Message[], last: { last: string | null; keys: string[] } | null, firstLook = 60): Message[] {
  if (!last || !last.last) return all.slice(-firstLook);
  const i = all.findIndex((m) => m.id === last.last);
  if (i >= 0) return all.slice(i + 1);
  const known = new Set(last.keys);
  return all.filter((m) => !known.has(m.id));
}

/** a chat-log.md line: time · who · text (pure) */
export const chatLine = (m: Message) => `- ${m.at} · ${m.from} · ${m.text.replace(/\s+/g, " ")}`;

async function lines(p: Page): Promise<RawLine[]> {
  return p.evaluate(() => Array.from(document.querySelectorAll("#main [data-pre-plain-text]")).map((el) => ({
    pre: el.getAttribute("data-pre-plain-text") ?? "",
    text: ((el.querySelector(".selectable-text") as HTMLElement | null)?.innerText ?? (el as HTMLElement).innerText ?? "").trim(),
    out: !!el.closest(".message-out"),
  }))).catch(() => []);
}

export async function readGroup(turn: TurnCtx, group: string, last: { last: string | null; keys: string[] } | null): Promise<{ signedOut: true } | { signedOut: false; found: boolean; messages: Message[] }> {
  return withPage(turn, async (p) => {
    await p.goto(baseOf("whatsapp") + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForSelector("#pane-side, canvas, [data-ref]", { timeout: 20000 }).catch(() => {});
    const text = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (signInPage("whatsapp", p.url(), text) || !(await p.locator("#pane-side").count())) return { signedOut: true as const };
    const chat = p.locator(`#pane-side span[title="${group.replace(/"/g, '\\"')}"]`).first();
    if (!(await chat.count())) return { signedOut: false as const, found: false, messages: [] };
    await clickSafe(p, chat);
    await p.waitForSelector("#main [data-pre-plain-text]", { timeout: 10000 }).catch(() => {});
    let raw = await lines(p);
    for (let i = 0; i < 6 && last?.last && !gcMessages(raw).some((m) => m.id === last.last); i++) {
      // scroll up: reading only (WhatsApp loads the earlier messages as the panel nears its top)
      await p.evaluate(() => { const box = document.querySelector("#main [data-tab='8'], #main .copyable-area > div, #main [role='application']") ?? document.querySelector("#main"); if (box) (box as HTMLElement).scrollTop = 0; }).catch(() => {});
      await p.waitForTimeout(800);
      const more = await lines(p);
      if (more.length <= raw.length) break;
      raw = more;
    }
    return { signedOut: false as const, found: true, messages: gcMessages(raw) };
  });
}
