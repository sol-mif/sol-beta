import { defineConfig, transformWithOxc, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { lstatSync, realpathSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join, resolve, sep } from "node:path";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// A person's own button (sol/home/buttons, src/buttons/own.tsx) that does not parse is served and built as a module
// that throws, so it is one line on the shelf, never a red face or a failed build.
const ownButtons = (): Plugin => ({
  name: "sol-own-buttons",
  enforce: "pre",
  async transform(code, id) {
    if (!/\/home\/buttons\/[^/]+\.tsx$/.test(id)) return null;
    try { await transformWithOxc(code, id, { lang: "tsx" }); return null; }
    catch (e) {
      const m = String((e as Error)?.message ?? e).replace(/\u001b\[[0-9;]*m/g, "");   // eslint-disable-line no-control-regex
      const why = /\[[A-Z_]+\]\s*(.+)/.exec(m)?.[1] ?? m.split("\n")[0], at = /\.tsx:(\d+):\d+/.exec(m)?.[1];
      return `throw new Error(${JSON.stringify(`it does not parse${at ? ` at line ${at}` : ""}: ${why}`)});`;
    }
  },
});

// A Vite Sol.app starts (SOL_FACE_BY_SOL=1, src-tauri/src/hot.rs) serves only what the face reads, never the rest of
// sol/ (sol/home holds the person's own memory and life), and answers cross-origin asks only from Sol's own pages and
// the stage's closed frames ("null"), never any web page (#1823). `npm run dev` by hand keeps the wide settings for a
// developer's own tools.
const bySol = process.env.SOL_FACE_BY_SOL === "1";
const FACE_READS = [".", "../design", "../home/buttons", "../mine/look"];
const SOL_ORIGINS = ["null", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420", "http://127.0.0.1:1420"];

const real = (p: string) => { try { return realpathSync(p) as string; } catch { return resolve(p) as string; } };
const within = (p: string, dirs: string[]) => dirs.some((d) => p === d || p.startsWith(d + sep));
/** The fence under the config (#1823, from its refute): Vite checks fs.allow on the path as written and follows links,
 *  and a closed frame's origin, "null", can be made by any page. So a file a request names, links followed, must lie
 *  in an allowed folder, and the person's own folders (sol/home, sol/mine) go only to Sol's own pages. A request that
 *  names no file (Vite's own routes, index.html) is Vite's to answer. Pure over the disk; tried in viteServes.test.ts */
export function faceFence(root: string, allow: string[]) {
  const dirs = allow.map(real), mine = dirs.filter((d) => /[\\/](home|mine)[\\/]/.test(d + sep));
  const own = new Set(SOL_ORIGINS.filter((o) => o !== "null"));
  // the person's own folders as written in a URL, real or as given (a link to them, or the path the config names)
  const shared = [...new Set([...dirs, ...allow.map((a) => resolve(a))])].filter((d) => !/[\\/](home|mine)[\\/]/.test(d + sep));
  const mineWords = [...new Set([...mine, ...allow.map((a) => resolve(a)).filter((d) => /[\\/](home|mine)[\\/]/.test(d + sep))])];
  return (url: string, origin?: string, site?: string): boolean => {
    let path: string;
    try { path = decodeURIComponent(url.split(/[?#]/)[0]); } catch { return false; }
    // a page not Sol's own (a closed frame, another site): fail closed on what Vite resolves by itself. No /@id/ at all,
    // and nothing whose words name the person's own folders, whether a file is there or not (no extension, a missing
    // file, a path Vite completes)
    const foreign = origin === "null" || (origin !== undefined && !own.has(origin)) || site === "cross-site";
    if (foreign && (path.startsWith("/@id/") || mineWords.some((d) => path.includes(d + sep) || path.endsWith(d)))) return false;
    if (foreign && path.startsWith("/@fs/") && !within(resolve(path.slice("/@fs".length)), shared)) return false;   // only the face's own folders, as written
    const files = path.startsWith("/@fs/") ? [path.slice("/@fs".length)] : [join(root, path), join(root, "public", path)];
    for (const f of files) {
      try { lstatSync(f); } catch { continue; }
      const r = real(f);
      if (!within(r, dirs)) return false;
      if (within(r, mine) && foreign) return false;
    }
    return true;
  };
}
const solFence = (): Plugin => ({
  name: "sol-face-fence",
  configureServer(server) {
    if (!bySol) return;
    const here = fileURLToPath(new URL(".", import.meta.url));
    const ok = faceFence(here, FACE_READS.map((d) => resolve(here, d)));
    // (typed by hand: this config has no node types)
    const fence = (req: unknown, res: unknown, next: () => void) => {
      const q = req as { url?: string; headers: Record<string, string | undefined> }, r = res as { statusCode: number; end: () => void };
      if (ok(q.url ?? "/", q.headers.origin, q.headers["sec-fetch-site"])) return next();
      r.statusCode = 403; r.end();
    };
    server.middlewares.use(fence as never);
  },
});

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [solFence(), ownButtons(), react()],
  // a person's own buttons live outside the face (sol/home/buttons): their react is the face's, from here
  resolve: { dedupe: ["react", "react-dom"] },

  // the pages: the desktop face, the phone doorway (served by the engine at /away); the first run is the face itself (#134)
  build: {
    rollupOptions: {
      input: { index: "index.html", away: "away.html", another: "another.html" },   // another: the one line beside another Sol (#1852)
      // the new face's dev page (next.html, #1604) is built alone, and only when asked (SOL_NEXT_DEV=1, sol/test/e2e/next/run.mjs):
      // it carries the fixture, which must never reach a real Sol's build. `vite` serves it at /next.html like any dev page
      ...(process.env.SOL_NEXT_DEV === "1" ? { input: { next: "next.html" } } : {}),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // no red page over the window on a compile error: the face draws it in the part under work (src/hot.ts, issue #15)
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
          overlay: false,
        }
      : { overlay: false },
    // a dev page framed on the stage runs in a closed frame (no origin of its own), so it asks for its code from "null"
    cors: { origin: bySol ? SOL_ORIGINS : "*" },
    // the face reads design data from sol/design (tempo.json)
    fs: { allow: bySol ? FACE_READS : [".."] },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
