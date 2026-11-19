// Signing in, for real (step 2). The folder's browser is headless on the engine, so a password and Duo (or WhatsApp's QR
// code) need a window on the screen: the folder's headless context is closed, the same profile folder opens in a visible
// Chromium window on the machine the engine runs on (Marco's Mac), at the site's sign-in address. He signs in. When he
// closes the window, or the signed-in page is reached and 5 s pass, the window closes, the profile is free again
// (headless, at the next look) and the rule that asked runs. On a machine with no screen this says so and opens nothing.
import { chromium, type BrowserContext } from "playwright";
import { closeProfile, holdProfile, isHeld } from "../browser.js";
import { nameOf, signedInAt, signinUrl, type Site } from "./sites.js";

/** is there a screen to open a window on? The Mac always; Linux with a display; SOL_SIGNIN_SCREEN=off says no */
export function hasScreen(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
  if (/^(off|no|0)$/i.test(env.SOL_SIGNIN_SCREEN ?? "")) return false;
  if (platform === "darwin" || platform === "win32") return true;
  return !!(env.DISPLAY || env.WAYLAND_DISPLAY);
}

export const noScreenLine = (site: Site) =>
  `This machine has no screen to open a window on, so ${nameOf(site)} cannot be signed in from here. Sign in on the machine that runs the engine (your Mac), then press run now.`;

export type SignInOpts = {
  profile: string; site: Site;
  /** opens the window; a test hands in a headless one and drives it */
  launch?: (profile: string, url: string) => Promise<BrowserContext>;
  /** the test's hand in the window: what Marco would do */
  drive?: (ctx: BrowserContext) => Promise<void>;
  screen?: boolean;
  settleMs?: number;     // after the signed-in page, before the window closes (5 s)
  pollMs?: number;
  timeoutMs?: number;    // the window closes itself after this (15 min)
};
export type SignInEnd = { ok: true; how: "signed in" | "closed" | "timed out" } | { ok: false; why: string; noScreen?: boolean };

const open = new Map<string, Promise<SignInEnd>>();
/** a sign-in is under way for this profile */
export const signingIn = (profile: string) => open.has(profile) || isHeld(profile);

const visible = (profile: string, _url: string) =>
  chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: ["--no-first-run"] });

/** the window, start to end. Resolves when it is closed; never throws */
export function signIn(o: SignInOpts): Promise<SignInEnd> {
  if (!(o.screen ?? hasScreen())) return Promise.resolve({ ok: false, why: noScreenLine(o.site), noScreen: true });
  const have = open.get(o.profile);
  if (have) return have;
  const job = (async (): Promise<SignInEnd> => {
    const release = holdProfile(o.profile);
    let ctx: BrowserContext | null = null;
    try {
      await closeProfile(o.profile);
      const url = signinUrl(o.site);
      ctx = await (o.launch ?? visible)(o.profile, url);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      if (page.url() === "about:blank" || !page.url().startsWith(url.split("#")[0].replace(/\/$/, ""))) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      let closed = false;
      ctx.on("close", () => { closed = true; });
      if (o.drive) void o.drive(ctx).catch(() => {});
      const t0 = Date.now(), poll = o.pollMs ?? 1000, settle = o.settleMs ?? 5000, limit = o.timeoutMs ?? 15 * 60_000;
      let since = 0;
      for (;;) {
        if (closed) return { ok: true, how: "closed" };
        if (Date.now() - t0 > limit) return { ok: true, how: "timed out" };
        let done = false;
        for (const p of ctx.pages()) {
          const text = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
          if (signedInAt(o.site, p.url(), text)) { done = true; break; }
        }
        if (done) { since ||= Date.now(); if (Date.now() - since >= settle) return { ok: true, how: "signed in" }; }
        else since = 0;
        await new Promise((r) => setTimeout(r, poll));
      }
    } catch (e) {
      return { ok: false, why: `the sign-in window would not open: ${String((e as Error)?.message ?? e).split("\n")[0]}` };
    } finally {
      await ctx?.close().catch(() => {});
      release();
      open.delete(o.profile);
    }
  })();
  open.set(o.profile, job);
  return job;
}
