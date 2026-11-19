// What a day also holds renders (#1245, the second run): every ALSO scene opens on day.html, from vite's dev server in a
// real browser, draws its window and logs no console error and no page error, at its end state (reduced motion, rule
// 30) and at its first step. Plays no clip; sol/design/system/day.mjs shoots them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALSO } from "./scenes.ts";

const MAC = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const macReq = createRequire(join(MAC, "package.json"));
const engineReq = createRequire(join(MAC, "../engine/package.json"));

/** the browser is the engine's playwright (day.mjs's); a checkout without it skips, and says so */
const hasBrowser = (() => { try { engineReq.resolve("playwright"); return true; } catch { return false; } })();

test("every ALSO scene renders with no console error", { timeout: 180_000, skip: hasBrowser ? false : "no playwright in sol/engine: npm ci there" }, async () => {
  const { createServer } = await import(macReq.resolve("vite"));
  const react = (await import(macReq.resolve("@vitejs/plugin-react"))).default;
  const server = await createServer({ root: MAC, configFile: false, logLevel: "error", plugins: [react()], server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const { chromium } = engineReq("playwright");
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const url = server.resolvedUrls!.local[0].replace(/\/$/, "");
  try {
    for (const s of ALSO) for (const q of [`scene=${s.name}`, `scene=${s.name}&step=0`]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
      const page = await ctx.newPage(), errors: string[] = [];
      // the dev page reaches for the engine's socket, which a test has no engine for: that line is the harness's, not a scene's
      page.on("console", (m: { type(): string; text(): string }) => { if (m.type() === "error" && !/WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/' failed/.test(m.text())) errors.push(m.text()); });
      page.on("pageerror", (e: Error) => errors.push(String(e?.message ?? e)));
      await page.goto(`${url}/day.html?${q}`);
      await page.waitForSelector(`[data-scene="${s.name}"]`, { state: "attached", timeout: 30_000 });
      await page.waitForTimeout(400);
      // a scene's own nodes drew: the window at least
      const drawn = await page.evaluate(() => ({ window: !!document.querySelector("[data-window]"), nodes: document.querySelectorAll("[data-scene] *").length }));
      await ctx.close();
      assert.deepEqual(errors, [], `${q}: ${errors[0]}`);
      assert.ok(drawn.nodes > 20, `${q}: drew ${drawn.nodes} nodes`);
      assert.ok(drawn.window, `${q}: no window`);
    }
  } finally { await browser.close(); await server.close(); }
});
