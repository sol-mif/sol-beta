// Blackboard Ultra opens some things in place: a control without a link (a button, a row with role="button", a
// folder that expands) draws a panel over the page or under the row. The walk's reader (step 2) reads the page, then
// clicks each such control once, reads what opened (a dialog, a side panel, or the text that was not there before),
// closes it (Escape, or back to the page when the click went somewhere), and hands the panels to blackboard.ts's walk.
// Capped: at most 40 clicks a walk (Budget), and never a control whose words say it would do something (start an
// attempt, submit, post, delete, mark, upload, sign out…).
import type { Page } from "playwright";
import { withPage, type PageRead, type TurnCtx } from "../browser.js";
import type { Panel, Read } from "./sources/blackboard.js";

export type Budget = { clicks: number };
/** words on a control that is never clicked by a walk (pure test) */
export const RISKY = /^\s*(start|begin|submit|turn in|post|reply|send|delete|remove|upload|save|mark|edit|grade|settings|sign out|log out|logout|drop|unenroll|join|leave|record|download|print|share|copy|move|hide|close|cancel|create|add|continue|resume|take|retake)\b|\b(start|begin|resume|continue) (the )?(attempt|test|quiz|exam)\b|\bsubmit\b|\bmark (as )?(read|complete|reviewed)\b/i;
export const clickable = (label: string) => !!label.trim() && label.length <= 120 && !RISKY.test(label);

const CONTROLS = 'button,[role="button"],[aria-expanded],summary,[data-panel],[onclick]';

async function readHere(p: Page): Promise<PageRead> {
  const got = await p.evaluate(() => ({
    text: document.body?.innerText ?? "",
    links: Array.from(document.querySelectorAll("a[href]")).map((a) => ({ text: ((a as HTMLElement).innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120), href: (a as HTMLAnchorElement).href })),
  }));
  return { url: p.url(), title: await p.title().catch(() => ""), text: got.text.slice(0, 30_000), links: got.links.slice(0, 400) };
}

/** click each control without a link once, read what opened, close it */
export async function openPanels(p: Page, budget: Budget, url: string): Promise<Panel[]> {
  if (budget.clicks <= 0) return [];
  const list: { i: number; label: string }[] = await p.evaluate((sel) => {
    document.querySelectorAll("[data-sol-panel]").forEach((e) => e.removeAttribute("data-sol-panel"));
    const out: { i: number; label: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("a[href]") || el.querySelector("a[href]")) continue;
      if (el.closest("header,nav,[role=navigation],[role=banner],footer")) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none") continue;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
      const label = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      el.setAttribute("data-sol-panel", String(out.length));
      out.push({ i: out.length, label });
      if (out.length >= 40) break;
    }
    return out;
  }, CONTROLS).catch(() => []);
  const panels: Panel[] = [];
  for (const c of list) {
    if (budget.clicks <= 0) break;
    if (!clickable(c.label)) continue;
    const before = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const loc = p.locator(`[data-sol-panel="${c.i}"]`).first();
    if (!(await loc.count().catch(() => 0))) continue;
    budget.clicks--;
    try { await loc.click({ timeout: 4000 }); } catch { continue; }
    await p.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(250);
    const moved = p.url().split("#")[0] !== url.split("#")[0];
    const got = await p.evaluate((was) => {
      const box = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"],aside,.panel,[data-panel-open]')).filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed").pop();
      const seen = new Set(was.split("\n").map((l) => l.trim()));
      const text = box ? box.innerText : (document.body?.innerText ?? "").split("\n").filter((l) => l.trim() && !seen.has(l.trim())).join("\n");
      const scope: ParentNode = box ?? document;
      return { text, links: Array.from(scope.querySelectorAll("a[href]")).map((a) => ({ text: ((a as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().slice(0, 120), href: (a as HTMLAnchorElement).href })).slice(0, 100) };
    }, before).catch(() => ({ text: "", links: [] as { text: string; href: string }[] }));
    const text = moved ? (await readHere(p).catch(() => ({ text: "" } as PageRead))).text : got.text;
    if (text.trim()) panels.push({ label: c.label.slice(0, 80), text: text.slice(0, 4000), links: got.links, ...(moved ? { url: p.url() } : {}) });
    if (moved) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    else await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(150);
    if (moved) await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  }
  return panels;
}

/** the walk's reader in a folder's browser: each page read, then its in-place panels opened, within the budget */
export function panelReader(turn: TurnCtx, budget: Budget = { clicks: 40 }, settleMs = 8000): Read {
  return (url: string) => withPage(turn, async (p) => {
    await p.goto(/^[a-z]+:\/\//i.test(url) ? url : "https://" + url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForLoadState("networkidle", { timeout: settleMs }).catch(() => {});
    const page = await readHere(p);
    const panels = await openPanels(p, budget, page.url).catch(() => []);
    return { ...page, panels };
  });
}
