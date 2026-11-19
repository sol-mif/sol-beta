// Mail as a source (step 2): BU mail (Outlook on the web) and Gmail, read through the folder's own browser, read and
// draft, never send. The look opens the inbox, reads its list, and opens each new message by its own address (never by
// a click: guard.ts refuses any click or typing on these two sites from an agent tab). What was seen is kept in
// <folder>/.agent/mail-last.json; the first look is a baseline. The rule names the inbox ("BU mail" or "Gmail").
//
// The pages' shapes (what the readers look for), as the real sites draw them in late 2026, and as the fakes copy them:
//   Outlook  rows [role="option"][data-convid]; their lines: sender, subject, time, preview; the sender's address in a
//            [title*="@"]; a message at <base>/mail/inbox/id/<convid>, its body in [aria-label="Message body"]
//   Gmail    rows tr.zA; sender span[email] (name, email), subject .bog, preview .y2, time td.xW span[title];
//            the thread id in [data-legacy-thread-id]; a message at <base>/mail/u/0/#inbox/<id>, its body in .a3s
// Not tried on the real sites (the rule: fakes only). Where a real page differs, the reader finds no rows, and the
// ledger says "0 messages" rather than anything wrong.
import type { Page } from "playwright";
import { withPage, type TurnCtx } from "../../browser.js";
import { baseOf, signInPage, type Site } from "../sites.js";
import type { Message } from "./messages.js";

export type Raw = { id: string; lines: string[]; address?: string; name?: string; subject?: string; preview?: string; time?: string };

/** which inbox a mail rule reads (pure): Gmail when it says so, else BU mail */
export const inboxOf = (sentence: string): Site => (/\bgmail\b/i.test(sentence) ? "gmail" : "outlook");

/** Outlook's rows as messages (pure) */
export function outlookRows(raw: Raw[], site = "outlook"): Message[] {
  return raw.filter((r) => r.id).map((r) => {
    const [from = "", subject = "", time = "", ...rest] = r.lines.map((l) => l.trim()).filter(Boolean);
    return { id: r.id, site, from: r.name || from, ...(r.address ? { address: r.address.toLowerCase() } : {}), subject, text: rest.join(" ").slice(0, 600), at: time, kind: "mail" as const };
  });
}
/** Gmail's rows as messages (pure) */
export function gmailRows(raw: Raw[], site = "gmail"): Message[] {
  return raw.filter((r) => r.id).map((r) => ({ id: r.id, site, from: r.name || r.lines[0] || "", ...(r.address ? { address: r.address.toLowerCase() } : {}), subject: r.subject ?? "", text: (r.preview ?? "").replace(/^\s*-\s*/, "").slice(0, 600), at: r.time ?? "", kind: "mail" as const }));
}
/** a message's own address (pure) */
export const messageUrl = (site: Site, id: string) => site === "gmail" ? `${baseOf("gmail")}/mail/u/0/#inbox/${encodeURIComponent(id)}` : `${baseOf("outlook")}/mail/inbox/id/${encodeURIComponent(id)}`;

async function go(p: Page, url: string) {
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

async function rowsOf(p: Page, site: Site): Promise<Raw[]> {
  return site === "gmail"
    ? p.evaluate(() => Array.from(document.querySelectorAll("tr.zA")).slice(0, 60).map((tr) => {
      const who = tr.querySelector("span[email]");
      const idEl = tr.querySelector("[data-legacy-thread-id]") ?? tr.querySelector("[data-thread-id]");
      return {
        id: (idEl?.getAttribute("data-legacy-thread-id") ?? idEl?.getAttribute("data-thread-id")?.replace(/^#?thread-f:/, "") ?? "").trim(),
        lines: (tr as HTMLElement).innerText.split("\n"), name: who?.getAttribute("name") ?? (who as HTMLElement | null)?.innerText ?? "", address: who?.getAttribute("email") ?? "",
        subject: (tr.querySelector(".bog") as HTMLElement | null)?.innerText ?? "", preview: (tr.querySelector(".y2") as HTMLElement | null)?.innerText ?? "",
        time: tr.querySelector("td.xW span[title]")?.getAttribute("title") ?? (tr.querySelector("td.xW") as HTMLElement | null)?.innerText ?? "",
      };
    }))
    : p.evaluate(() => Array.from(document.querySelectorAll('[role="option"][data-convid]')).slice(0, 60).map((el) => {
      const t = el.querySelector('[title*="@"]');
      return { id: el.getAttribute("data-convid") ?? "", lines: (el as HTMLElement).innerText.split("\n"), address: t?.getAttribute("title") ?? "", name: (t as HTMLElement | null)?.innerText ?? "" };
    }));
}

async function bodyOf(p: Page, site: Site): Promise<string> {
  return p.evaluate((g) => {
    const el = g ? document.querySelector(".a3s") : document.querySelector('[aria-label="Message body"]') ?? document.querySelector('[role="main"] [role="document"]');
    return ((el as HTMLElement | null)?.innerText ?? "").trim();
  }, site === "gmail").catch(() => "");
}

/** the look: the inbox list, and each message not in `known` opened by its address for its whole text (at most 15) */
export async function readMail(turn: TurnCtx, site: Site, known: Set<string> | null): Promise<{ signedOut: true } | { signedOut: false; messages: Message[] }> {
  return withPage(turn, async (p) => {
    const inbox = site === "gmail" ? `${baseOf("gmail")}/mail/u/0/#inbox` : `${baseOf("outlook")}/mail/inbox`;
    await go(p, inbox);
    const text = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (signInPage(site, p.url(), text)) return { signedOut: true as const };
    const messages = (site === "gmail" ? gmailRows : outlookRows)(await rowsOf(p, site), site);
    if (known) {
      let opened = 0;
      for (const m of messages) {
        if (known.has(m.id) || opened >= 15) continue;
        opened++;
        await go(p, messageUrl(site, m.id)).catch(() => {});
        const body = await bodyOf(p, site);
        if (body) m.text = body.slice(0, 3000);
      }
      await go(p, inbox).catch(() => {});
    }
    return { signedOut: false as const, messages };
  });
}
