// What the face's Vite serves (#1823): one Sol.app starts (SOL_FACE_BY_SOL=1, src-tauri/src/hot.rs) serves only what
// the face reads and answers cross-origin asks only from Sol's own pages and the stage's closed frames; any web page in a
// browser on the Mac could otherwise read all of sol/ through /@fs/, the person's sol/home included. A Vite started by
// hand keeps the wide settings a developer's tools use.
import { test } from "node:test";
import assert from "node:assert/strict";

type Server = { fs: { allow: string[] }; cors: { origin: unknown } };
const load = async (bySol: boolean, n: number): Promise<Server> => {
  if (bySol) process.env.SOL_FACE_BY_SOL = "1"; else delete process.env.SOL_FACE_BY_SOL;
  const make = (await import(`../vite.config.ts?case=${n}`)).default as () => { server: Server };
  return make().server;
};

test("a Vite Sol.app starts serves only what the face reads, and never answers any web page", async () => {
  const s = await load(true, 1);
  assert.deepEqual([...s.fs.allow].sort(), [".", "../design", "../home/buttons", "../mine/look"].sort());
  assert.ok(!s.fs.allow.includes(".."), "never all of sol/: sol/home holds the person's memory and life");
  const origins = s.cors.origin as string[];
  assert.ok(Array.isArray(origins), "a list, never \"*\"");
  assert.ok(!origins.includes("*"));
  for (const o of ["tauri://localhost", "null"]) assert.ok(origins.includes(o), o);
  assert.ok(!origins.some((o) => /^https?:\/\/(?!127\.0\.0\.1|localhost|tauri\.localhost)/.test(o)), "no web site's origin");
});

test("a Vite started by hand keeps a developer's wide settings", async () => {
  const s = await load(false, 2);
  assert.deepEqual(s.fs.allow, [".."]);
  assert.equal(s.cors.origin, "*");
});

// From the refute (#1823): a closed frame's origin is "null", which any page can make, and Vite follows symlinks; the
// fence below the config is what holds, so it is tried on real folders and real links
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the fence: never a file outside the face's folders, links followed; never the person's own folders to a page that is not Sol's", async () => {
  process.env.SOL_FACE_BY_SOL = "1";
  const { faceFence } = await import("../vite.config.ts?case=3") as unknown as { faceFence: (root: string, allow: string[]) => (url: string, origin?: string, site?: string) => boolean };
  const top = realpathSync(mkdtempSync(join(tmpdir(), "sol-fence-")));
  const sol = join(top, "sol"), mac = join(sol, "mac");
  for (const d of ["mac/src", "mac/public", "design", "home/buttons", "home/memory", "mine/look"]) mkdirSync(join(sol, d), { recursive: true });
  writeFileSync(join(mac, "src", "App.tsx"), "x"); writeFileSync(join(sol, "design", "tempo.json"), "{}");
  writeFileSync(join(sol, "home", "buttons", "my.tsx"), "mine"); writeFileSync(join(sol, "home", "memory", "secret.md"), "SECRET");
  symlinkSync(join(sol, "home", "memory", "secret.md"), join(sol, "home", "buttons", "link.md"));
  symlinkSync(join(sol, "home", "memory"), join(sol, "home", "buttons", "memdir"));
  symlinkSync(join(sol, "home", "memory", "secret.md"), join(mac, "public", "leak.md"));
  const ok = faceFence(mac, [mac, join(sol, "design"), join(sol, "home", "buttons"), join(sol, "mine", "look")]);
  const fs = (p: string) => `/@fs${p}?raw`;

  // the face's own reads, from its own page
  assert.equal(ok("/src/App.tsx"), true);
  assert.equal(ok(fs(join(sol, "design", "tempo.json"))), true);
  assert.equal(ok(fs(join(sol, "home", "buttons", "my.tsx")), "tauri://localhost"), true, "the person's buttons, to Sol's own window");
  assert.equal(ok(fs(join(sol, "home", "buttons", "my.tsx"))), true, "same-origin (no Origin header)");
  // a link out of an allowed folder: refused, whoever asks
  assert.equal(ok(fs(join(sol, "home", "buttons", "link.md"))), false);
  assert.equal(ok(fs(join(sol, "home", "buttons", "memdir", "secret.md"))), false);
  assert.equal(ok("/leak.md"), false, "a link in public/");
  // the person's own folders to a closed frame or another site: refused; the face's code to a closed frame: served
  assert.equal(ok(fs(join(sol, "home", "buttons", "my.tsx")), "null"), false);
  assert.equal(ok(fs(join(sol, "home", "buttons", "my.tsx")), undefined, "cross-site"), false);
  assert.equal(ok(fs(join(sol, "design", "tempo.json")), "null"), true);
  assert.equal(ok("/src/App.tsx", "null"), true);
  // a URL Vite resolves itself (no extension, /@id/, a query or a fragment) is judged by its words for a page not Sol's
  assert.equal(ok(fs(join(sol, "home", "buttons", "my")), "null"), false, "no extension");
  assert.equal(ok(`/@id/${join(sol, "home", "buttons", "my.tsx")}`, "null"), false);
  assert.equal(ok(`/@id/react`, "null"), false, "no /@id/ at all for a closed frame");
  assert.equal(ok(fs(join(sol, "home", "memory", "gone.md")), "null"), false, "a missing file under the person's folders");
  // what is not a file is Vite's to answer (its own routes, index.html)
  assert.equal(ok("/@vite/client"), true);
  assert.equal(ok("/"), true);
});
