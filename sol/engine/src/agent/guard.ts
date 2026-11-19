// What a folder's agent may do on the sites where people talk: read and scroll, never write, never send. This holds in
// every mode (watch or do) and for every hand an agent has: the Codex run's browser tools (browser.ts calls the guard
// for any tab in a folder's profile) and the sources' own code (sources/gc.ts clicks through clickSafe).
//   BU mail, Gmail, Teams   no click at all, no typing; a compose address is not opened (a message is read by its address)
//   WhatsApp Web            no typing; a click only on a chat in the chat list, never the message box, send, the
//                           microphone, attach, emoji, a reaction or a message's menu
// The person's own hand in the face (browser.input) is his, not the agent's, and is not guarded here.
import type { Page, Locator } from "playwright";
import { siteAt, type Site } from "./sites.js";

/** what is under a click: is it in WhatsApp's chat list, in the message box's bar, editable, and its words */
export type Target = { inList: boolean; inFooter: boolean; editable: boolean; label: string };

const QUIET: Site[] = ["outlook", "gmail", "teams"];
const SEND_WORDS = /\b(send|reply|compose|new (message|mail|chat)|forward|mic|microphone|voice|attach|emoji|sticker|gif|react|reaction|menu|delete|archive|mute|leave|exit group|star|pin|post)\b/i;
const COMPOSE_URL = /compose|deeplink\/(compose|mail\/new)|[?&]view=cm\b|\/new(\?|$)|#.*\bcompose\b/i;
const TYPING = new Set(["browser_type"]);
const CLICKS = new Set(["browser_click"]);

/** the reason a tool is refused on a site, or null (pure) */
export function refusal(site: Site | null, tool: string, o: { url?: string; target?: Target | null } = {}): string | null {
  if (!site) return null;
  const where = site === "whatsapp" ? "WhatsApp Web" : site === "teams" ? "Teams" : site === "gmail" ? "Gmail" : site === "outlook" ? "BU mail" : null;
  if (!where) return null;   // Blackboard: the walk may click (its in-place panels), within blackboard.ts's own list
  if (TYPING.has(tool)) return `${tool} is refused on ${where}: the folder's agent only reads here. Write the reply in the folder (a draft); Marco sends it himself.`;
  if (tool === "browser_open" && o.url && COMPOSE_URL.test(o.url)) return `opening a compose page on ${where} is refused: the folder's agent never writes there.`;
  if (!CLICKS.has(tool)) return null;
  if (QUIET.includes(site)) return `${tool} is refused on ${where}: read a message by its address (browser_open), and scroll; never click here.`;
  const t = o.target;
  if (!t) return `${tool} is refused on WhatsApp Web: what is under it could not be seen, so it is not clicked.`;
  if (t.editable || t.inFooter || SEND_WORDS.test(t.label)) return `${tool} on "${t.label.slice(0, 40)}" is refused on WhatsApp Web: never the message box, send, the microphone, attach, emoji or a reaction.`;
  if (!t.inList) return `${tool} is refused on WhatsApp Web outside the chat list: only a chat in the list is clicked, to read it.`;
  return null;
}

/** what a locator points at, read in the page */
export async function targetOf(loc: Locator): Promise<Target | null> {
  if (!(await loc.count().catch(() => 0))) return null;
  // the page runs this: no named inner functions (they would not survive the trip, browser.ts says why)
  return loc.first().evaluate((e) => {
    const el = e as HTMLElement;
    const label = [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-icon"), el.querySelector("[data-icon]")?.getAttribute("data-icon"), el.innerText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
    return {
      inList: !!el.closest('#pane-side, [aria-label="Chat list"]'),
      inFooter: !!el.closest('footer, [data-tab="10"], [aria-label*="message" i][contenteditable]'),
      editable: el.isContentEditable || !!el.closest('[contenteditable="true"]') || /^(input|textarea|select)$/i.test(el.tagName),
      label,
    };
  }).catch(() => null);
}

/** the locator a browser_click would press (the same choice browser.ts's click makes) */
function clickLocator(p: Page, a: { ref?: number; text?: string }): Locator | null {
  if (a.ref != null) return p.locator(`[data-sol-ref="${a.ref}"]`).first();
  if (a.text) return p.getByText(a.text, { exact: false }).first();
  return null;
}

/** browser.ts's hook for a folder agent's tab: refuse what the site allows no agent to do */
export async function guardTool(p: Page, tool: string, a: any): Promise<string | null> {
  const here = siteAt(p.url());
  if (tool === "browser_open") return refusal(siteAt(String(a?.url ?? "")), tool, { url: String(a?.url ?? "") });
  if (!here) return null;
  const loc = CLICKS.has(tool) && here === "whatsapp" ? clickLocator(p, a ?? {}) : null;
  return refusal(here, tool, { url: p.url(), target: loc ? await targetOf(loc) : null });
}

/** a source's own click (sources/gc.ts): the same guard, then the click; throws with the reason when refused */
export async function clickSafe(p: Page, loc: Locator) {
  const no = refusal(siteAt(p.url()), "browser_click", { url: p.url(), target: await targetOf(loc) });
  if (no) throw new Error(no);
  await loc.first().click({ timeout: 8000 });
}
