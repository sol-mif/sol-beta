// The kit stills (#1879 step 0): the frame's kit parts drawn on their dev page (sol/mac/kit-stills.html,
// src/kit/stage-stills.tsx) in the sidebar's named states, each shot and held against the approved picture beside this
// test (test/kit-stills/<state>.png). A change that moves a pixel of a part fails here until its pictures are approved
// again, on purpose, in the same PR:
//   SOL_STILLS_UPDATE=1 npx tsx --test test/kit-stills.test.ts     writes the pictures (look at them, then commit them)
// A failed run leaves what it drew in $TMPDIR/sol-kit-stills-*/ (the path is in the failure), to compare by eye.
// The page is built alone into a temp folder (never into the face's build), served from memory to a real chromium at
// 1×, reduced motion. A picture is held to a tolerance: a pixel differs when a channel moves by more than DIFF, and the
// still fails past SHARE of its pixels. The face's type is drawn by the machine's own fonts: approved.json keeps the
// width the approving machine drew a sample line at, and on a machine that draws it otherwise the comparison says so and
// is left out (the stills are approved on the team's Linux runners, where CI runs them).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium, type Browser } from "playwright";

const SOL = join(import.meta.dirname, "../..");
const MAC = join(SOL, "mac");
const HERE = join(import.meta.dirname, "kit-stills");
const APPROVED = join(HERE, "approved.json");
const UPDATE = process.env.SOL_STILLS_UPDATE === "1";
/** the sidebar's named states (stage-stills.tsx STATES), in the order the plan names them (#1879) */
export const STATES = ["rest", "box-open", "more-live", "tab-front", "cmd-held", "empty", "heavy"] as const;
const DIFF = 6, SHARE = 0.0002;
const ORIGIN = "http://stills.sol.test";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

let dist = "", out = "", browser: Browser | null = null;

before(async () => {
  dist = mkdtempSync(join(tmpdir(), "sol-kit-stills-build-"));
  const macReq = createRequire(join(MAC, "package.json"));
  const { build } = await import(macReq.resolve("vite"));
  const react = (await import(macReq.resolve("@vitejs/plugin-react"))).default;
  await build({
    root: MAC, configFile: false, logLevel: "warn", cacheDir: join(dist, ".vite"), plugins: [react()], resolve: { dedupe: ["react", "react-dom"] },
    build: { outDir: join(dist, "out"), emptyOutDir: true, rollupOptions: { input: { stills: join(MAC, "kit-stills.html") } } },
  });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close().catch(() => {});
  if (dist) rmSync(dist, { recursive: true, force: true });
});

/** a page of the built stills, served from the build folder; nothing else is reachable */
async function open(query: string) {
  const ctx = await browser!.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== ORIGIN) return r.abort();
    const f = join(dist, "out", decodeURIComponent(u.pathname));
    if (!f.startsWith(join(dist, "out")) || !existsSync(f)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ status: 200, contentType: TYPES[extname(f)] ?? "application/octet-stream", body: readFileSync(f) });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));
  await page.goto(`${ORIGIN}/kit-stills.html${query}`);
  await page.waitForSelector("[data-ready]", { state: "attached", timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

/** how wide this machine draws a sample line in the face's family: the stills hold only where it matches */
async function fontPrint(): Promise<number> {
  const { ctx, page } = await open("?state=empty");
  try {
    return await page.evaluate(() => {
      const el = document.querySelector("[data-still]")!, s = document.createElement("span");
      s.textContent = "Check in · Running elsewhere 0123456789";
      s.style.cssText = "font-family: var(--family); font-size: 100px; position: absolute; white-space: nowrap";
      el.appendChild(s);
      const w = Math.round(s.getBoundingClientRect().width);
      s.remove();
      return w;
    });
  } finally { await ctx.close(); }
}

/** the share of pixels that differ between two pictures, compared in the browser (no image package needed) */
async function differ(a: Buffer, b: Buffer): Promise<{ size: boolean; share: number }> {
  const ctx = await browser!.newContext();
  try {
    const page = await ctx.newPage();
    // written as text: tsx names the functions it compiles (__name), which the page does not have
    return await page.evaluate(`(async ([x, y, d]) => {
      const load = async (s) => { const im = new Image(); im.src = "data:image/png;base64," + s; await im.decode(); return im; };
      const [p, q] = await Promise.all([load(x), load(y)]);
      if (p.width !== q.width || p.height !== q.height) return { size: false, share: 1 };
      const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const A = px(p), B = px(q);
      let n = 0;
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > d || Math.abs(A[i + 1] - B[i + 1]) > d || Math.abs(A[i + 2] - B[i + 2]) > d || Math.abs(A[i + 3] - B[i + 3]) > d) n++;
      return { size: true, share: n / (A.length / 4) };
    })(${JSON.stringify([a.toString("base64"), b.toString("base64"), DIFF])})`) as { size: boolean; share: number };
  } finally { await ctx.close(); }
}

test("kit stills: each of the sidebar's named states draws as approved", async (t) => {
  const print = await fontPrint();
  const kept = existsSync(APPROVED) ? JSON.parse(readFileSync(APPROVED, "utf8")) as { fontPrint: number; states: string[] } : null;
  if (UPDATE) {
    mkdirSync(HERE, { recursive: true });
    for (const s of STATES) {
      const { ctx, page, errors } = await open(`?state=${s}`);
      try {
        assert.deepEqual(errors, [], `${s}: the page threw`);
        writeFileSync(join(HERE, `${s}.png`), await page.locator(`[data-state="${s}"]`).screenshot());
      } finally { await ctx.close(); }
    }
    writeFileSync(APPROVED, JSON.stringify({ fontPrint: print, states: [...STATES], note: "written by SOL_STILLS_UPDATE=1 (kit-stills.test.ts): the pictures beside this file are the approved ones" }, null, 2) + "\n");
    t.diagnostic(`kit stills: ${STATES.length} pictures approved in ${HERE}`);
    return;
  }
  assert.ok(kept, `no approved stills: run SOL_STILLS_UPDATE=1 npx tsx --test test/kit-stills.test.ts in sol/engine, look at test/kit-stills/, commit them`);
  assert.deepEqual(kept.states, [...STATES], "the approved stills are another set of states than the test's: approve them again");
  const sameFonts = Math.abs(kept.fontPrint - print) <= 1;
  out = mkdtempSync(join(tmpdir(), "sol-kit-stills-"));
  const bad: string[] = [];
  for (const s of STATES) {
    const { ctx, page, errors } = await open(`?state=${s}`);
    try {
      assert.deepEqual(errors, [], `${s}: the page threw`);
      const now = await page.locator(`[data-state="${s}"]`).screenshot();
      writeFileSync(join(out, `${s}.png`), now);
      const want = join(HERE, `${s}.png`);
      assert.ok(existsSync(want), `${s}: no approved picture at ${want}`);
      if (!sameFonts) continue;
      const d = await differ(readFileSync(want), now);
      t.diagnostic(`${s}: ${d.size ? `${(d.share * 100).toFixed(3)}% of its pixels moved` : "another size"}`);
      if (!d.size) bad.push(`${s}: drawn at another size than approved`);
      else if (d.share > SHARE) bad.push(`${s}: ${(d.share * 100).toFixed(2)}% of its pixels moved`);
    } finally { await ctx.close(); }
  }
  if (!sameFonts) { t.diagnostic(`kit stills: this machine draws the face's type at ${print}px, the approved at ${kept.fontPrint}px; the pictures were drawn (${out}) and not compared`); return; }
  assert.deepEqual(bad, [], `the kit's stills changed (what was drawn: ${out}); if the change is meant, approve them again with SOL_STILLS_UPDATE=1 and commit the pictures:\n  ${bad.join("\n  ")}`);
  rmSync(out, { recursive: true, force: true });
});
