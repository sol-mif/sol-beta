// The browser tool. One headless Chromium owned by the engine (nothing opens on Marco's screen), with a
// persistent profile in home/browser-profile/ so logins (learn.bu.edu and the like) stay. Launched on first
// use, reused after. Tabs belong to conversations (sessionId); the face watches them as CDP screencast
// frames and can click and type into them. Both seats get the same tools as an MCP server named "sol":
// Claude in-process, Codex through src/mcp-stdio.ts, which calls POST /browser on the engine.

import { chromium, type BrowserContext, type Page, type CDPSession, type Frame } from "playwright";
import { z } from "zod";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

const READ_CAP = 30_000;
const VIEW = { width: 1280, height: 900 }; // a new tab's size until the face says how big its stage is (resizeTab)
// Device pixels per CSS px, fixed at launch: the faces are Retina, so a page is rendered sharp. Both the context and
// the headless screen are told (the screencast captures the screen's surface: with the flag alone it would be 1x).
const SCALE = 2;
const QUALITY = 50; // the JPEG the face is shown
const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

// One step of a seat's work as the face shows it (sol/PROTOCOL.md, round 3). The browser reports "browse" steps, the desk "desk" steps.
export type Step = { id: string; kind: "browse" | "desk"; text: string; done: boolean; ok?: boolean; detail?: string };
// Who is calling a tool: the conversation it belongs to, and where its "what I'm doing" steps go.
export type TurnCtx = { sessionId?: string; seat?: string; sink?: (step: Step) => void;   // seat: who pings (ping.ts)
  /** a Home turn's own words, as the person said them (index.ts handleSay): set_setting changes a setting only on them (#1521) */
  said?: string;
  /** a folder's agent (agent/run.ts): its tabs open in the folder's own browser profile, never the default one */
  profile?: string;
  /** a folder's agent in watch mode: the tools that would reach past the folder are refused, with this reason (tools.ts) */
  refuse?: (tool: string) => string | null };

// view: the page's size in CSS px, what the face maps its clicks through; a frame is view × SCALE pixels.
type Tab = { id: string; sessionId?: string; profile: string; page: Page; title: string; url: string; cdp?: CDPSession; view: { width: number; height: number } };
export type Face = { send: (msg: object) => void };

// One Chromium context per profile folder: the default (home/browser-profile) for everything, and one per folder whose
// agent browses (<folder>/.agent/browser-profile, profileFor), so a folder's sign-ins are its own and sealed with it.
let profileDir = "";
const contexts = new Map<string, BrowserContext>();
const launching = new Map<string, Promise<BrowserContext>>();
// a conversation id that belongs to a folder's agent (agent:<name>) opens its tabs in that folder's profile: the face's
// browser.open with that id is how the person signs in "in the LA245 browser" (agent/index.ts sets it)
let profileOfSession: ((sessionId: string) => string | undefined) | null = null;
export const setSessionProfiles = (f: ((sessionId: string) => string | undefined) | null) => { profileOfSession = f; };
/** the browser profile of a folder's agent */
export const profileFor = (folder: string) => join(folder, ".agent", "browser-profile");
let queue: Promise<unknown> = Promise.resolve(); // one browser action at a time
let nextId = 1;
const tabs = new Map<string, Tab>();
const byPage = new Map<Page, Tab>();
const activeOf = new Map<string, string>(); // sessionId ("" = none) -> active tab id
const faces = new Set<Face>();
const watching = new Map<Face, string>(); // face -> tab id it watches
let pendingSession: string | undefined; // set while we create a page ourselves

export function setBrowserProfile(dir: string) {
  profileDir = dir;
}
export function addFace(f: Face) {
  faces.add(f);
  f.send(tabsMsg());
}
export function removeFace(f: Face) {
  faces.delete(f);
  void watch(f, null);
}

const key = (s?: string) => s ?? "";
function tabsMsg() {
  return {
    type: "tabs",
    tabs: [...tabs.values()].map((t) => ({
      id: t.id, sessionId: t.sessionId, title: t.title, url: t.url, active: activeOf.get(key(t.sessionId)) === t.id,
    })),
  };
}
function broadcast() {
  const m = tabsMsg();
  for (const f of faces) f.send(m);
}

function register(p: Page, sessionId?: string, profile = profileDir): Tab {
  const have = byPage.get(p);
  if (have) return have;
  const opener = byPage.get(p.opener() as any);
  const sid = sessionId ?? pendingSession ?? opener?.sessionId;
  const tab: Tab = { id: "t" + nextId++, sessionId: sid, profile: opener?.profile ?? profile, page: p, title: "", url: p.url() === "about:blank" ? "" : p.url(), view: { ...VIEW } };
  tabs.set(tab.id, tab);
  byPage.set(p, tab);
  activeOf.set(key(sid), tab.id);
  const refresh = async () => {
    if (p.isClosed()) return;
    const title = await p.title().catch(() => tab.title);
    const url = p.url() === "about:blank" ? "" : p.url();
    if (title !== tab.title || url !== tab.url) {
      tab.title = title;
      tab.url = url;
      broadcast();
    }
  };
  p.on("framenavigated", (f) => f === p.mainFrame() && void refresh());
  p.on("domcontentloaded", () => void refresh());
  p.on("load", () => void refresh());
  p.on("close", () => {
    void stopScreencast(tab);
    tabs.delete(tab.id);
    wanted.delete(tab.id); sizing.delete(tab.id);
    byPage.delete(p);
    for (const [f, id] of watching) if (id === tab.id) watching.delete(f);
    if (activeOf.get(key(tab.sessionId)) === tab.id) {
      const rest = [...tabs.values()].filter((t) => t.sessionId === tab.sessionId);
      if (rest.length) activeOf.set(key(tab.sessionId), rest[rest.length - 1].id);
      else activeOf.delete(key(tab.sessionId));
    }
    broadcast();
  });
  broadcast();
  return tab;
}

// The tab's name for itself (#1071). Headless Chromium says "HeadlessChrome/<version>" in its user agent, and WhatsApp
// and others refuse it ("works with Google Chrome 100+"). So the context says what a Chrome of the same version on this
// system says: the version playwright installed (playwright-core's browsers.json), reduced as Chrome reduces it
// (Chrome/156.0.0.0), "Headless" left out. Unreadable: undefined, and the tab says what it says today.
function chromeAgent(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    const core = dirname(req.resolve("playwright-core/package.json", { paths: [dirname(req.resolve("playwright"))] }));
    const list = JSON.parse(readFileSync(join(core, "browsers.json"), "utf8")).browsers as { name: string; browserVersion?: string }[];
    const major = list.find((b) => b.name === "chromium")?.browserVersion?.split(".")[0];
    if (!major || !/^\d+$/.test(major)) return undefined;
    const os = process.platform === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7"
      : process.platform === "win32" ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64";
    return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  } catch { return undefined; }
}
const AGENT = chromeAgent();

// launchPersistentContext once per profile folder, reused after; a context that closes takes only its own tabs with it
async function context(dir = profileDir): Promise<BrowserContext> {
  if (heldProfiles.has(dir)) throw new Error("this browser is open in its sign-in window; it comes back when that window closes");
  const have = contexts.get(dir);
  if (have) return have;
  let l = launching.get(dir);
  if (!l) {
    l = chromium
      .launchPersistentContext(dir, { headless: true, viewport: VIEW, deviceScaleFactor: SCALE, ...(AGENT ? { userAgent: AGENT } : {}), args: ["--no-first-run", `--force-device-scale-factor=${SCALE}`] })
      // a Sol from the public repo fetches its browser after the engine is up (sol/setup, #1637): until it lands, say so plainly
      .catch((e: unknown) => { throw /Executable doesn't exist|playwright install/i.test(String(e)) ? new Error("the browser Sol drives is not on this Mac yet: sol/setup fetches it after the engine starts (about 100 MB); try again in a minute") : e; })
      .then((c) => {
        contexts.set(dir, c);
        c.on("page", (p) => register(p, undefined, dir)); // popups join their opener's conversation
        c.on("close", () => {
          contexts.delete(dir);
          launching.delete(dir);
          for (const t of [...tabs.values()]) {
            if (t.profile !== dir) continue;
            tabs.delete(t.id);
            byPage.delete(t.page);
            for (const [f, id] of watching) if (id === t.id) watching.delete(f);
            if (activeOf.get(key(t.sessionId)) === t.id) activeOf.delete(key(t.sessionId));
          }
          broadcast();
        });
        return c;
      });
    l.catch(() => launching.delete(dir));
    launching.set(dir, l);
  }
  return l;
}

/** the profile a new tab of this conversation opens in: the one asked for, a folder agent's by its id, else the default */
const profileOf = (sessionId?: string, profile?: string) => profile ?? (sessionId ? profileOfSession?.(sessionId) : undefined) ?? profileDir;

async function newTab(sessionId?: string, profile?: string): Promise<Tab> {
  const dir = profileOf(sessionId, profile);
  const c = await context(dir);
  pendingSession = sessionId;
  try {
    const p = await c.newPage();
    return register(p, sessionId, dir);
  } finally {
    pendingSession = undefined;
  }
}

function activeTab(sessionId?: string): Tab | undefined {
  const t = tabs.get(activeOf.get(key(sessionId)) ?? "");
  return t && !t.page.isClosed() ? t : undefined;
}

// ---- frames and input, for the face ----

async function stopScreencast(tab: Tab) {
  const cdp = tab.cdp;
  tab.cdp = undefined;
  if (!cdp) return;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});
}

async function startScreencast(tab: Tab) {
  if (tab.cdp || tab.page.isClosed()) return;
  const cdp = await tab.page.context().newCDPSession(tab.page);
  tab.cdp = cdp;
  cdp.on("Page.screencastFrame", (ev: any) => {
    emitFrame(tab, ev.data);
    // Chromium holds the next frame until this ack, which is all the backpressure we need: nothing is dropped,
    // so the last state after a scroll or click always reaches the face.
    void cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", screencastArgs(tab));
  await still(tab);
}

const screencastArgs = (tab: Tab) => ({ format: "jpeg" as const, quality: QUALITY, maxWidth: tab.view.width * SCALE, maxHeight: tab.view.height * SCALE, everyNthFrame: 1 });

// A still page sends no frames; give the face one right away.
async function still(tab: Tab) {
  const shot = await tab.page.screenshot({ type: "jpeg", quality: QUALITY }).catch(() => null);
  if (shot) emitFrame(tab, shot.toString("base64"));
}

// The face says how big its stage is; the tab takes that size, so the page fills the pane edge to edge instead of
// being letterboxed. Coordinates stay in CSS px (view). The screencast restarts: a running one keeps its old bounds.
// One resize at a time per tab: a second one arriving mid-way waits, then takes the size wanted last (two in flight
// could land in either order, leaving Chromium at one size and `view` at the other).
const wanted = new Map<string, { width: number; height: number }>();
const sizing = new Map<string, Promise<void>>();
export function resizeTab(id: string, w: number, h: number) {
  wanted.set(id, { width: Math.max(200, Math.round(w)), height: Math.max(150, Math.round(h)) });
  const next = (sizing.get(id) ?? Promise.resolve()).then(() => takeSize(id)).catch(() => {});
  sizing.set(id, next);
  return next;
}
async function takeSize(id: string) {
  const tab = tabs.get(id), size = wanted.get(id);
  if (!tab || !size || tab.page.isClosed()) return;
  if (tab.view.width === size.width && tab.view.height === size.height) return;
  tab.view = size;
  await tab.page.setViewportSize(size);
  const cdp = tab.cdp;
  if (!cdp) return;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.send("Page.startScreencast", screencastArgs(tab)).catch(() => {});
  await still(tab);
}

function emitFrame(tab: Tab, data: string) {
  for (const [f, id] of watching) if (id === tab.id) f.send({ type: "frame", tab: tab.id, data, w: tab.view.width, h: tab.view.height });
}

export async function watch(face: Face, tabId: string | null) {
  const prev = watching.get(face);
  if (tabId && tabs.has(tabId)) watching.set(face, tabId);
  else watching.delete(face);
  const now = watching.get(face);
  if (prev && prev !== now && ![...watching.values()].includes(prev)) {
    const t = tabs.get(prev);
    if (t) await stopScreencast(t);
  }
  if (now) await startScreencast(tabs.get(now)!);
}

// A new conversation opens tabs under the face's draft id; once the seat names the session, they are its.
export function adoptTabs(from: string | undefined, to: string) {
  if (!from || from === to) return;
  let moved = false;
  for (const t of tabs.values()) if (t.sessionId === from) { t.sessionId = to; moved = true; }
  if (!moved) return;
  const act = activeOf.get(from);
  if (act) { activeOf.set(to, act); activeOf.delete(from); }
  broadcast();
}

export async function openTab(url: string, sessionId?: string) {
  const tab = await newTab(sessionId);
  if (url) await tab.page.goto(normUrl(url), { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
}
export async function closeTab(id: string) {
  await tabs.get(id)?.page.close().catch(() => {});
}
export function selectTab(id: string) {
  const t = tabs.get(id);
  if (!t) return;
  activeOf.set(key(t.sessionId), id);
  broadcast();
}
export async function navigateTab(id: string, action: "back" | "forward" | "reload" | { url: string }) {
  const p = tabs.get(id)?.page;
  if (!p) return;
  const o = { waitUntil: "domcontentloaded" as const, timeout: 30000 };
  if (action === "back") await p.goBack(o).catch(() => {});
  else if (action === "forward") await p.goForward(o).catch(() => {});
  else if (action === "reload") await p.reload(o).catch(() => {});
  else if (action && typeof action.url === "string") await p.goto(normUrl(action.url), o).catch(() => {});
}

// a page written in its address (data:, about:) is kept as it is too; the face's own field only ever adds https://
const normUrl = (u: string) => (/^([a-z]+:\/\/|data:|about:)/i.test(u) ? u : "https://" + u);

const VK: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, " ": 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
};
// punctuation has its own Windows key codes; its character code is another key's (a "." as 46 is Delete, #401)
const PUNCT: Record<string, number> = {
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
  BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222,
  NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111,
};
// the same keys by character, for an event without a code; a shifted character takes its key's code
const PUNCT_CHAR: Record<string, number> = {
  ";": 186, ":": 186, "=": 187, "+": 187, ",": 188, "<": 188, "-": 189, "_": 189, ".": 190, ">": 190,
  "/": 191, "?": 191, "`": 192, "~": 192, "[": 219, "{": 219, "\\": 220, "|": 220, "]": 221, "}": 221,
  "'": 222, '"': 222, ")": 48, "!": 49, "@": 50, "#": 51, "$": 52, "%": 53, "^": 54, "&": 55, "*": 56, "(": 57,
};

// The Windows key code a page reads off a key: named keys, then the key the face says was pressed (its code),
// then the character; a character with no known key gets 0.
export function keyCode(key: string, code?: string): number {
  if (VK[key] !== undefined) return VK[key];
  const c = String(code ?? "");
  if (/^Key[A-Z]$/.test(c)) return c.charCodeAt(3);
  if (/^Digit[0-9]$/.test(c)) return c.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(c)) return 96 + Number(c[6]);
  if (PUNCT[c] !== undefined) return PUNCT[c];
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  return PUNCT_CHAR[key] ?? 0;
}

export async function inputTab(id: string, ev: any) {
  const tab = tabs.get(id);
  if (!tab || !ev) return;
  const cdp = tab.cdp ?? (await tab.page.context().newCDPSession(tab.page));
  const own = !tab.cdp;
  try {
    if (ev.kind === "mouse") {
      const type = ev.type as string;
      const pressing = type === "mousePressed" || type === "mouseReleased";
      const p: any = { type, x: Number(ev.x) || 0, y: Number(ev.y) || 0, button: ev.button ?? (pressing ? "left" : "none"), modifiers: ev.modifiers ?? 0 };
      if (pressing) p.clickCount = ev.clickCount ?? 1;
      if (type === "mouseWheel") Object.assign(p, { deltaX: Number(ev.deltaX) || 0, deltaY: Number(ev.deltaY) || 0 });
      await cdp.send("Input.dispatchMouseEvent", p);
    } else if (ev.kind === "key") {
      const k = String(ev.key ?? "");
      const vk = keyCode(k, ev.code);
      const p: any = { type: ev.type, key: k, code: ev.code, modifiers: ev.modifiers ?? 0, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      const t = ev.text ?? (k === "Enter" ? "\r" : undefined);
      if (t && ev.type !== "keyUp") p.text = t;
      await cdp.send("Input.dispatchKeyEvent", p);
    }
  } finally {
    if (own) await cdp.detach().catch(() => {});
  }
}

// Give a page a moment to settle after a click or navigation.
async function settle(p: Page) {
  await p.waitForLoadState("load", { timeout: 1500 }).catch(() => {});
  await p.waitForTimeout(100);
}

// ---- pointing inside a page, for Work's page pane (#54) ----
// An artifact on claude.ai is shown through the browser, and Marco pins comments inside it as he does on a page the
// session wrote: the face asks what is under a point (browser.inspect) and, after the page scrolls or changes, where
// the pinned elements are now (browser.locate). An artifact draws inside an iframe, so both look through frames.
// Both fail soft: a closed tab or a page mid-navigation answers nothing, a selector that finds nothing answers null.

export type PinBox = { x: number; y: number; w: number; h: number };
// One element on the way up from the one pointed at: its tag, id, classes, and its place among the siblings of its
// tag (0 when it is the only one). The page sends these; the selector is made here, where it can be tested.
export type Link = { tag: string; id: string; classes: string[]; nth: number };

export const cssEsc = (s: string) => s.replace(/[^\w-]/g, "\\$&").replace(/^(-?)(\d)/, "$1\\3$2 ");
// The selector the page pane gives a pin (mac/src/work/pages.ts, describe): up to three parts, stopping at an id,
// `section.hero > h2.title`; the body itself when the point is on nothing inside it.
export function describeChain(chain: Link[]): string {
  const parts: string[] = [];
  for (const l of chain) {
    if (l.tag === "body" || l.tag === "html" || parts.length >= 3) break;
    const t = cssEsc(l.tag);   // a tag with a colon (svg's, a custom one) would read as a pseudo-class
    const c = l.classes.find((x) => /^[a-z_][\w-]*$/i.test(x));
    parts.unshift(l.id ? `${t}#${cssEsc(l.id)}` : c ? `${t}.${cssEsc(c)}` : l.nth ? `${t}:nth-of-type(${l.nth})` : t);
    if (l.id) break;
  }
  return parts.join(" > ") || chain[0]?.tag || "body";
}
// The words at the spot, on one line, cut near 80 characters.
export function trimWords(s: string, max = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// Where an iframe's page starts in its parent's view: its box, past its border and padding.
const contentOrigin = (e: Element) => {
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return { x: r.left + e.clientLeft + (parseFloat(s.paddingLeft) || 0), y: r.top + e.clientTop + (parseFloat(s.paddingTop) || 0) };
};

type Hit = { chain: Link[]; text: string; box: PinBox };
async function hitAt(frame: Frame, x: number, y: number, depth = 0): Promise<Hit | null> {
  const h = await frame.evaluateHandle(([x, y]) => document.elementFromPoint(x, y) ?? document.body, [x, y] as const);
  const el = h.asElement();
  try {
    if (!el) return null;
    const inner = depth < 3 ? await el.contentFrame() : null;
    if (inner) {   // the point is on a frame: what is under it in there, its box moved into this view
      const o = await el.evaluate(contentOrigin);
      const got = await hitAt(inner, x - o.x, y - o.y, depth + 1);
      if (got) return { ...got, box: { ...got.box, x: got.box.x + o.x, y: got.box.y + o.y } };
    }
    // the page runs this: plain loops and unnamed callbacks only (a named inner function would not survive the trip)
    return await el.evaluate((e) => {
      const chain: Link[] = [];
      for (let c: Element | null = e; c && chain.length < 8; c = c.parentElement) {
        const at = c, p = c.parentElement;
        const same = p ? Array.from(p.children).filter((x) => x.tagName === at.tagName) : [];
        chain.push({ tag: c.tagName.toLowerCase(), id: c.id, classes: Array.from(c.classList).slice(0, 8), nth: same.length > 1 ? same.indexOf(c) + 1 : 0 });
      }
      const tag = e.tagName.toLowerCase();
      const text = tag === "img" ? (e as HTMLImageElement).alt || (e.getAttribute("src") ?? "").split("/").pop() || ""
        : tag === "input" || tag === "textarea" ? (e as HTMLInputElement).value || (e as HTMLInputElement).placeholder || ""
        : (e as HTMLElement).innerText ?? e.textContent ?? "";
      const r = e.getBoundingClientRect();
      return { chain, text: text.slice(0, 400), box: { x: r.left, y: r.top, w: r.width, h: r.height } };
    });
  } finally {
    await h.dispose().catch(() => {});
  }
}

// Each selector's box in this frame's view, looking in the frames inside it first: an artifact's page is in one,
// and a short selector could also match something in claude.ai's own page around it.
async function boxesIn(frame: Frame, sels: string[], depth = 0): Promise<(PinBox | null)[]> {
  const out: (PinBox | null)[] = sels.map(() => null);
  if (depth < 3) {
    for (const h of await frame.$$("iframe, frame")) {
      try {
        const inner = await h.contentFrame();
        if (!inner) continue;
        const o = await h.evaluate(contentOrigin);
        const sub = await boxesIn(inner, sels, depth + 1);
        sub.forEach((b, i) => { if (!out[i] && b) out[i] = { ...b, x: b.x + o.x, y: b.y + o.y }; });
      } catch { /* a frame that went away */ } finally { await h.dispose().catch(() => {}); }
      if (out.every(Boolean)) return out;
    }
  }
  const own = await frame.evaluate((ss) => ss.map((s) => {
    try {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    } catch { return null; }
  }), sels);
  return out.map((b, i) => b ?? own[i]);
}

// browser.inspect { tab, x, y } (CSS px in the tab's view) -> browser.inspected { tab, x, y, sel, words, title, url, box }
export async function inspectTab(face: Face, m: any) {
  const tab = tabs.get(String(m.tab)), x = Number(m.x), y = Number(m.y);
  if (!tab || tab.page.isClosed() || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const hit = await hitAt(tab.page.mainFrame(), x, y).catch(() => null);
  if (!hit) return;
  // the page can go away or navigate between the hit and the answer: then there is no answer, as with a closed tab
  let title = tab.title, url = "";
  try { title = await tab.page.title(); url = tab.page.url(); } catch { return; }
  face.send({ type: "browser.inspected", ...(m.rid ? { rid: m.rid } : {}), tab: tab.id, x, y, sel: describeChain(hit.chain), words: trimWords(hit.text), title, url, box: hit.box });
}
// browser.locate { tab, sels } -> browser.located { tab, boxes }, null for a selector that finds nothing now
export async function locateTab(face: Face, m: any) {
  const tab = tabs.get(String(m.tab));
  const sels: string[] = Array.isArray(m.sels) ? m.sels.slice(0, 60).map(String) : [];
  if (!tab || tab.page.isClosed()) return;
  const boxes = await boxesIn(tab.page.mainFrame(), sels).catch(() => null);
  if (boxes) face.send({ type: "browser.located", ...(m.rid ? { rid: m.rid } : {}), tab: tab.id, boxes });
}

// Number the interactive things on the page. Marks each with data-sol-ref so browser_click can find it.
async function find(p: Page, query: string): Promise<string> {
  const items: { ref: number; role: string; name: string }[] = await p.evaluate((q: string) => {
    document.querySelectorAll("[data-sol-ref]").forEach((e) => e.removeAttribute("data-sol-ref"));
    const sel = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="menuitem"],[role="option"],[onclick],[contenteditable="true"]';
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: { ref: number; role: string; name: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none") continue;
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type;
      const role = el.getAttribute("role") ?? (tag === "a" ? "link" : tag === "input" ? (type || "text") + " input" : tag);
      const name = (
        el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).placeholder ||
        (el as HTMLInputElement).value || el.getAttribute("title") || el.getAttribute("alt") ||
        el.getAttribute("name") || ""
      ).replace(/\s+/g, " ").trim().slice(0, 80);
      const hay = (role + " " + name).toLowerCase();
      if (words.length && !words.every((w) => hay.includes(w))) continue;
      const ref = out.length + 1;
      el.setAttribute("data-sol-ref", String(ref));
      out.push({ ref, role, name });
      if (out.length >= 80) break;
    }
    return out;
  }, query);
  if (!items.length) return query ? `Nothing interactive matches "${query}". Try browser_read, or a shorter query.` : "No interactive elements found.";
  return items.map((i) => `${i.ref}. ${i.role}: ${i.name || "(no name)"}`).join("\n");
}

async function click(p: Page, args: { ref?: number; text?: string }): Promise<string> {
  if (args.ref != null) {
    const loc = p.locator(`[data-sol-ref="${args.ref}"]`).first();
    if (!(await loc.count())) return `Ref ${args.ref} is not on the page any more. Run browser_find again.`;
    await loc.click({ timeout: 8000 });
  } else if (args.text) {
    const byText = p.getByText(args.text, { exact: false }).first();
    if (await byText.count()) await byText.click({ timeout: 8000 });
    else await p.getByRole("button", { name: args.text }).or(p.getByRole("link", { name: args.text })).first().click({ timeout: 8000 });
  } else return "Give a ref (from browser_find) or the visible text to click.";
  await settle(p);
  return `Clicked. Now at ${p.url()}`;
}

// ---- the tools, defined once; Claude's in-process server and the stdio server both use this list ----

export type Tool = {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  line: (a: any) => string; // the dim line for the face
  run: (p: Page, a: any) => Promise<ToolResult>;
};

function host(u: string): string {
  try {
    return new URL(u.includes("://") ? u : "https://" + u).host;
  } catch {
    return u.slice(0, 40);
  }
}

export const TOOLS: Tool[] = [
  {
    name: "browser_open",
    description: "Open a web page in this conversation's browser tab (Marco sees it inside Sol; his logins are kept). Returns the title and address. " +
      "Not for a page you made for Marco to look at (a mockup, review page, board, stills): those go in the page pane: write or edit the HTML file with the Write or Edit tool.",
    shape: { url: z.string().describe("Address, e.g. https://learn.bu.edu") },
    line: (a) => `opening ${host(a.url)}`,
    run: async (p, a) => {
      const url = /^[a-z]+:\/\//i.test(a.url) ? a.url : "https://" + a.url;
      // a page made for Marco goes to the page pane, where he annotates it (2026-10-26): a local HTML file is refused here
      if (/^file:\/\/.*\.html?([?#].*)?$/i.test(url))
        return { ...text("A page made for Marco shows in the page pane, not the browser tab. Write or edit the HTML file with the Write or Edit tool (an Edit, even one word, shows it again), and he annotates it there."), isError: true };
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await settle(p);
      return text(`Opened ${p.url()}\nTitle: ${await p.title()}`);
    },
  },
  {
    name: "browser_read",
    description: "Read the visible text of the current page (capped at about 30,000 characters).",
    shape: {},
    line: () => "reading the page",
    run: async (p) => {
      const body = await p.evaluate(() => document.body?.innerText ?? "");
      const clipped = body.length > READ_CAP ? body.slice(0, READ_CAP) + "\n[cut: page is longer]" : body;
      return text(`${p.url()}\n${await p.title()}\n\n${clipped}`);
    },
  },
  {
    name: "browser_find",
    description: "List numbered interactive elements (links, buttons, fields) on the page, optionally filtered by words. Use the number with browser_click or browser_type.",
    shape: { query: z.string().optional().describe("Words that must appear in the role or name; empty lists everything") },
    line: (a) => (a.query ? `looking for ${String(a.query).slice(0, 40)}` : "looking at the page controls"),
    run: async (p, a) => text(await find(p, a.query ?? "")),
  },
  {
    name: "browser_click",
    description: "Click something: a ref number from the last browser_find, or its visible text.",
    shape: { ref: z.number().optional(), text: z.string().optional() },
    line: (a) => (a.text ? `clicking "${String(a.text).slice(0, 40)}"` : `clicking #${a.ref}`),
    run: async (p, a) => text(await click(p, a)),
  },
  {
    name: "browser_type",
    description: "Type text into the focused field (or into the element with the given ref); submit presses Enter after.",
    shape: { text: z.string(), ref: z.number().optional(), submit: z.boolean().optional() },
    line: () => "typing",
    run: async (p, a) => {
      if (a.ref != null) {
        const loc = p.locator(`[data-sol-ref="${a.ref}"]`).first();
        if (!(await loc.count())) return text(`Ref ${a.ref} is not on the page any more. Run browser_find again.`);
        await loc.fill(a.text, { timeout: 8000 });
      } else await p.keyboard.type(a.text);
      if (a.submit) {
        await p.keyboard.press("Enter");
        await settle(p);
      }
      return text(`Typed${a.submit ? " and pressed Enter" : ""}. Now at ${p.url()}`);
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page and return it as an image.",
    shape: {},
    line: () => "taking a screenshot",
    run: async (p) => {
      const jpg = await p.screenshot({ type: "jpeg", quality: 70 });
      return { content: [{ type: "image", data: jpg.toString("base64"), mimeType: "image/jpeg" }] };
    },
  },
  {
    name: "browser_back",
    description: "Go back one page.",
    shape: {},
    line: () => "going back",
    run: async (p) => {
      await p.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      await settle(p);
      return text(`Back at ${p.url()}`);
    },
  },
];

// ---- a browser block's tab (#699, work/live.ts): with the stage on, the tools drive a block ----
// The person's hand is a child web view in the app; the agent's is a tab here, one per browser block. live.ts routes a
// call: to the block it names (`block`), refused while the person holds that block's wheel; browser_open with no block
// goes to the session's own browser block, made the first time (the test browser's alias). Off, no route: today's tab.
export type Route = { block: string; url?: string } | { refuse: string } | null;
type Router = {
  route: (sessionId: string | undefined, tool: string, a: any) => Promise<Route>;
  after: (block: string, url: string, tool: string, a: any, r: ToolResult, sessionId?: string) => Promise<ToolResult>;
};
let router: Router | null = null;
export const setBlockRouter = (r: Router | null) => { router = r; };
const blockTabs = new Map<string, string>();   // block id -> its tab's id
/** the tab a browser block's agent hand drives, if it has one open */
export const tabOfBlock = (block: string) => { const t = tabs.get(blockTabs.get(block) ?? ""); return t && !t.page.isClosed() ? t.id : undefined; };
async function blockTab(block: string, sessionId: string | undefined, url?: string): Promise<Tab> {
  const have = tabs.get(blockTabs.get(block) ?? "");
  if (have && !have.page.isClosed()) { activeOf.set(key(sessionId), have.id); broadcast(); return have; }
  const tab = await newTab(sessionId);
  blockTabs.set(block, tab.id);
  tab.page.on("close", () => { if (blockTabs.get(block) === tab.id) blockTabs.delete(block); });
  if (url) await tab.page.goto(normUrl(url), { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  return tab;
}
/** a browser block's tab closed with the block */
export async function closeBlockTab(block: string) {
  const id = blockTabs.get(block);
  blockTabs.delete(block);
  if (id) await closeTab(id);
}
/** a still of a browser block's page, as a PNG: its tab's, or a tab opened on its address for the shot (the person's
 *  hand is a child web view the engine cannot reach; outside the app, and when the app cannot snapshot, this stands in) */
export function shotOfBlock(block: string, url: string | undefined, sessionId?: string): Promise<Buffer> {
  const job = queue.then(async () => {
    const own = tabs.get(blockTabs.get(block) ?? "");
    if (own && !own.page.isClosed()) return own.page.screenshot({ type: "png" });
    if (!url) throw new Error("the block has no page yet");
    const tab = await newTab(sessionId);
    try {
      // an app draws after its load (a React page, Sol itself): the shot waits for the network to go quiet, then a beat
      await tab.page.goto(normUrl(url), { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await tab.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await tab.page.waitForTimeout(800);
      return await tab.page.screenshot({ type: "png" });
    } finally { await tab.page.close().catch(() => {}); }
  });
  queue = job.catch(() => {});
  return job;
}

// every tool may name a block; only with the stage on is there one to name
for (const t of TOOLS) t.shape = { ...t.shape, block: z.string().optional().describe("A browser block's id on the stage (from read): drive that block. Without one, browser_open uses this session's browser block") };
const shot = TOOLS.find((t) => t.name === "browser_screenshot");
if (shot) shot.shape = { ...shot.shape, keep: z.boolean().optional().describe("Also lay the still in the block's stills on the stage, for the person to keep or cut") };

// Run one tool by name, for one conversation. Serialized, tells the face what is happening, never throws.
// browser_open uses the conversation's active tab, or opens one if it has none; the others need a tab.
export function runBrowserTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return Promise.resolve({ ...text(`Unknown browser tool: ${name}`), isError: true });
  const job = queue.then(async (): Promise<ToolResult> => {
    const a = (args ?? {}) as any;
    const id = randomUUID();
    const line = tool.line(a);
    turn.sink?.({ id, kind: "browse", text: line, done: false });
    let r: ToolResult;
    try {
      const to = router && !turn.profile ? await router.route(turn.sessionId, name, a) : null;   // a folder's agent drives its own tabs, never a stage block
      if (to && "refuse" in to) r = { ...text(to.refuse), isError: true };
      else if (to) {
        const tab = await blockTab(to.block, turn.sessionId, name === "browser_open" ? undefined : to.url);
        r = await tool.run(tab.page, a);
        if (router && !r.isError) r = await router.after(to.block, tab.page.url(), name, a, r, turn.sessionId);
      } else {
        let tab = activeTab(turn.sessionId);
        if (!tab && name !== "browser_open") r = { ...text("No page is open in this conversation. Use browser_open first."), isError: true };
        else {
          const page = (tab ?? (await newTab(turn.sessionId, turn.profile))).page;
          const no = turn.profile && agentGuard ? await agentGuard(page, name, a) : null;   // a folder agent's tab: agent/guard.ts
          r = no ? { ...text(no), isError: true } : await tool.run(page, a);
        }
      }
    } catch (err) {
      r = { ...text(`Browser error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`), isError: true };
    }
    const first = r.content.find((c) => c.type === "text") as { text: string } | undefined;
    turn.sink?.({ id, kind: "browse", text: line, done: true, ok: !r.isError, detail: r.isError ? first?.text : undefined });
    return r;
  });
  queue = job.catch(() => {});
  return job;
}

export async function closeBrowser() {
  for (const c of [...contexts.values()]) await c.close().catch(() => {});
}

export type PageRead = { url: string; title: string; text: string; links: { text: string; href: string }[] };
/** open a page in a conversation's tab and read it whole: its text and its links (a source's look, agent/sources/
 *  blackboard.ts). Serialized with the tools; the tab is the conversation's, in the profile asked for. An app that draws
 *  after its load (Blackboard Ultra) is given until the network is quiet, at most `settleMs` */
export function readPage(url: string, turn: TurnCtx = {}, settleMs = 8000): Promise<PageRead> {
  const job = queue.then(async (): Promise<PageRead> => {
    const tab = activeTab(turn.sessionId) ?? (await newTab(turn.sessionId, turn.profile));
    const p = tab.page;
    await p.goto(normUrl(url), { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForLoadState("networkidle", { timeout: settleMs }).catch(() => {});
    const got = await p.evaluate(() => ({
      text: document.body?.innerText ?? "",
      links: Array.from(document.querySelectorAll("a[href]")).map((a) => ({ text: ((a as HTMLElement).innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120), href: (a as HTMLAnchorElement).href })),
    }));
    return { url: p.url(), title: await p.title().catch(() => ""), text: got.text.slice(0, READ_CAP), links: got.links.slice(0, 400) };
  });
  queue = job.catch(() => {});
  return job;
}

export const browserProfileDir = (home: string) => join(home, "browser-profile");

// ---- a folder's agent, step 2 (agent/signin.ts, agent/guard.ts, agent/sources/*) ----
// held: a profile open in its visible sign-in window; nothing opens it headless until the window closes
const heldProfiles = new Set<string>();
/** hold a profile for the sign-in window; the function returned lets it go */
export function holdProfile(dir: string): () => void { heldProfiles.add(dir); return () => { heldProfiles.delete(dir); }; }
export const isHeld = (dir: string) => heldProfiles.has(dir);
/** close a profile's (headless) context, if it is open, and its tabs with it */
export async function closeProfile(dir: string) {
  const c = contexts.get(dir) ?? (await launching.get(dir)?.catch(() => null));
  await c?.close().catch(() => {});
}
/** what an agent tab may not do on a page (agent/guard.ts): a reason to refuse, or null */
let agentGuard: ((p: Page, tool: string, a: any) => Promise<string | null>) | null = null;
export const setAgentGuard = (g: typeof agentGuard) => { agentGuard = g; };
/** work on a conversation's page (its active tab, or a new one in the profile asked for), serialized with the tools */
export function withPage<T>(turn: TurnCtx, f: (p: Page) => Promise<T>): Promise<T> {
  const job = queue.then(async () => f((activeTab(turn.sessionId) ?? (await newTab(turn.sessionId, turn.profile))).page));
  queue = job.catch(() => {});
  return job;
}
