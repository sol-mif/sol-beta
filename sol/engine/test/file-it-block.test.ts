// File it as Sol's own block (the design's step 7): the Stable layer (Sol's blocks in its code, the home's found first),
// "~/" in a record's folders, Sol's helper sol-windows built here, the screen block only for the programs that take
// pictures, and the block itself (blocks/file-it): its pure parts with a fake `sol`, then the whole of it in its big room
// with a gh that is a small program writing down what it was asked. Nothing reaches GitHub; each test makes its own
// home, Sol folder and "home of the person" under the system's temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync, symlinkSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { STABLE_DIR, useSolTools } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { columnsOf, type Columns } from "../src/record.ts";
import { pasteKey } from "../src/keys.ts";
import { helperFor } from "../src/helpers.ts";
import { SCREEN_TAKERS } from "../src/bigroom.ts";
import * as block from "../blocks/file-it/engine.ts";

const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
const clang = mac && existsSync("/usr/bin/clang");
const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (name: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `sol-fileit-${name}-`))); dirs.push(d); return d; };
function home() {
  const h = tmp("home");
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string, more: Record<string, unknown> = {}) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app"), big: { idleMs: 60_000 }, ...more });
const cols = (r: Record<string, unknown>, me?: string) => (columnsOf(r, me) as { columns: Columns }).columns;
const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
/** a small block in a folder of things (the home's things/ or a Stable folder): one tool that says which it is */
function small(root: string, id: string, says: string, rec: Record<string, unknown> = {}) {
  const d = join(root, id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-08", contract: 1 }], ...rec }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), `export default (sol) => { sol.tool({ name: "who", run: () => ${JSON.stringify(says)} }); };`);
}

test("~/ in a record's folders is the person's home, made the path it is; ~ alone, ~user and .. are not folders", () => {
  const c = cols({ room: "big", needs: { why: "x", folders: ["~/Library/Caches/Sol/file-it", "/tmp/a", "~/Library/Caches/Sol/file-it"] } }, "/Users/someone");
  assert.deepEqual(c.needs!.folders, ["/Users/someone/Library/Caches/Sol/file-it", "/tmp/a"], "expanded, once each");
  for (const bad of ["~", "~/", "~frank/x", "~/../x", "~/a/./b", "Library/x"]) {
    const r = columnsOf({ room: "big", needs: { why: "x", folders: [bad] } }, "/Users/someone");
    assert.equal(r.ok, false, `${bad} is refused`);
  }
  assert.equal(cols({ room: "big", needs: { why: "x", folders: ["~/x"] } }).needs!.folders[0].startsWith("/"), true, "by default the person's own home");
});

test("Stable: Sol's own block loads from Sol's code; one of the same id in the home is found first; taken out, Sol's is back", async () => {
  const h = home(), st = tmp("stable");
  small(st, "hello", "stable");
  small(st, "only-sol", "stable too");
  writeFileSync(join(st, "README.md"), "what these are");   // a file beside Sol's blocks is not one of them
  const k = new Kernel(h, opts(h, { stable: st }));
  await k.sync();
  assert.equal(k.state("hello")?.state, "loaded");
  assert.equal(k.isStable("hello"), true);
  assert.equal(text(await k.runTool("thing_hello_who", {})), "stable");
  assert.deepEqual(k.stableBlocks().map((b) => b.id), ["hello", "only-sol"]);
  assert.equal(k.state("README.md"), undefined, "the README is not a broken block");
  small(join(h, "things"), "hello", "mine");
  await k.sync();
  assert.equal(k.isStable("hello"), false, "My Sol first");
  assert.equal(text(await k.runTool("thing_hello_who", {})), "mine");
  assert.deepEqual(k.stableBlocks().map((b) => b.id), ["only-sol"]);
  const out = await k.remove("hello");
  assert.equal(out.status, "done");
  assert.match(out.say, /Sol's own hello is in its place/);
  assert.equal(k.isStable("hello"), true, "the home's taken out: Sol's own is back in its place");
  assert.equal(text(await k.runTool("thing_hello_who", {})), "stable");
  const twice = await k.remove("hello");
  assert.equal(twice.status, "done", "remove again takes Sol's own out too");
  assert.equal(k.state("hello")?.off, true);
  assert.equal(k.isStable("hello"), true);
  assert.equal((await k.install("hello")).status, "restart", "install puts the home's back");
  assert.equal(text(await k.runTool("thing_hello_who", {})), "mine");
  await k.stop();
});

test("Stable: taken out and put back without writing Sol's code; its versions come with Sol; factory leaves Sol's own on", async () => {
  const h = home(), st = tmp("stable");
  small(st, "hello", "stable");
  const before = readFileSync(join(st, "hello", "record.json"), "utf8");
  const k = new Kernel(h, opts(h, { stable: st }));
  await k.sync();
  assert.equal((await k.remove("hello")).status, "done");
  assert.equal(k.state("hello")?.off, true);
  assert.equal(readFileSync(join(st, "hello", "record.json"), "utf8"), before, "Sol's code is never written");
  assert.ok(existsSync(join(h, "app", "stable")), "that it is out is kept in Sol's folder");
  assert.equal((await k.remove("hello")).status, "failed", "out already");
  const u = await k.undo("hello");
  assert.equal(u.ok, true, "undo puts it back");
  assert.equal(k.state("hello")?.state, "loaded");
  const v = await k.version("hello", 1);
  assert.equal(v.status, "failed");
  assert.match(v.say, /one of Sol's own blocks: its versions come with Sol/);
  const back = await k.undo("hello");
  assert.equal(back.ok, false);
  assert.match((back as { why: string }).why, /none to go back to here/);
  await k.remove("hello");
  small(join(h, "things"), "mine", "mine");
  await k.sync();
  const f = await k.factory();
  assert.deepEqual(f.off, ["mine"], "factory takes out the home's");
  assert.equal(k.state("hello")?.state, "loaded", "and Sol's own taken out comes back: as it came");
  await k.stop();
});

test("Stable: a press for Sol's own is never a press for one of the same id the AI writes in the home", async () => {
  const h = home(), st = tmp("stable");
  const asks = { hears: ["seat.turn"] };   // a small room that hears a seat waits for a press, as a big room does
  small(st, "watcher", "stable", asks);
  const k = new Kernel(h, opts(h, { stable: st }));
  await k.sync();
  assert.ok(k.waiting("watcher"), "Sol's own waits for its press too");
  const p = await k.approve("watcher", k.waiting("watcher")!.print);
  assert.equal(p.ok, true);
  assert.equal(k.state("watcher")?.state, "loaded");
  small(join(h, "things"), "watcher", "mine", asks);   // the same asks, written in the home
  await k.sync();
  assert.equal(k.isStable("watcher"), false);
  assert.equal(k.state("watcher")?.state, "broken");
  assert.match(k.state("watcher")!.why!, /waiting for a person to press its card/, "the home's asks for its own press");
  await k.approve("watcher", k.waiting("watcher")!.print);
  assert.equal(k.state("watcher")?.state, "loaded");
  rmSync(join(h, "things", "watcher"), { recursive: true });
  await k.sync();
  assert.equal(k.isStable("watcher"), true);
  assert.equal(k.state("watcher")?.state, "loaded", "Sol's own keeps its press");
  small(join(h, "things"), "watcher", "mine again", asks);
  await k.sync();
  assert.equal(k.state("watcher")?.state, "broken", "the home's press went when it gave way: one written there later is asked again");
  await k.stop();
});

test("a block named file-it in the home is never handed the person's press: only Sol's own is ready for it", async () => {
  const h = home(), st = tmp("stable");
  small(st, "file-it", "Sol's own");
  const d = join(st, "file-it");
  writeFileSync(join(d, "engine.js"), `export default (sol) => { sol.tool({ name: "file", run: () => "filed by Sol's own" }); };`);
  const k = new Kernel(h, opts(h, { stable: st }));
  await k.sync();
  assert.equal(k.solOwnReady("file-it", "file"), true);
  small(join(h, "things"), "file-it", "the AI's");   // a small room asking for nothing: it loads with no press
  writeFileSync(join(h, "things", "file-it", "engine.js"), `export default (sol) => { sol.tool({ name: "file", run: () => "filed #999" }); };`);
  await k.sync();
  assert.equal(k.state("file-it")?.state, "loaded");
  assert.equal(k.solOwnReady("file-it", "file"), false, "the home's is loaded, and it is not Sol's own: the button keeps the old path");
  assert.equal(k.solOwnReady("file-it", "nope"), false);
  await k.stop();
});

test("the real Stable folder: file it is there, a big room asking for what the design says", () => {
  const r = JSON.parse(readFileSync(join(STABLE_DIR, "file-it", "record.json"), "utf8"));
  const c = cols(r, "/Users/someone");
  assert.equal(c.room, "big");
  assert.deepEqual(c.needs!.programs, ["gh", "screencapture", "sips", "sol-windows"], "no osascript: an interpreter with the screen block drives the Mac");
  assert.deepEqual(c.needs!.folders, ["/Users/someone/Library/Caches/Sol/file-it"]);
  assert.deepEqual(c.needs!.keys, ["github"]);
  assert.deepEqual(c.needs!.domains, ["api.github.com"]);
  assert.deepEqual(c.needs!.sol, ["tracker"]);
  assert.equal(c.needs!.screen, true);
  assert.deepEqual(c.needs!.tools.map((t) => t.name), ["shot", "file"]);
  assert.deepEqual(c.needs!.tools[0].args, {}, "the shot takes no app's name: Sol's window only");
  assert.ok(!SCREEN_TAKERS.has("osascript") && SCREEN_TAKERS.has("screencapture") && SCREEN_TAKERS.has("sol-windows"));
});

test("sol-windows: built once from its source into Sol's folder, a number or nothing; a link in its place is not run; a source changed is never built", { skip: !clang }, async () => {
  const app = tmp("app");
  const a = await helperFor("sol-windows", app);
  assert.ok("exe" in a, JSON.stringify(a));
  const exe = (a as { exe: string }).exe;
  assert.ok(exe.startsWith(app + "/helpers/"));
  const at = statSync(exe).mtimeMs;
  assert.equal(((await helperFor("sol-windows", app)) as { exe: string }).exe, exe, "built once");
  assert.equal(statSync(exe).mtimeMs, at);
  let code = 0;
  try { execFileSync(exe, ["no such app anywhere"], { stdio: "pipe" }); } catch (e) { code = (e as { status: number }).status; }
  assert.equal(code, 1, "no window: nothing, exit 1");
  rmSync(exe);
  symlinkSync("/bin/echo", exe);
  const again = (await helperFor("sol-windows", app)) as { exe: string };
  assert.equal(again.exe, exe, "built again in its place");
  assert.ok(!statSync(exe).isSymbolicLink?.() && realpathSync(exe) === exe, "a file, not the link");
  assert.match(((await helperFor("no-such", app)) as { why: string }).why, /not one of Sol's helpers/);
  const src = tmp("src");
  writeFileSync(join(src, "sol-windows.c"), readFileSync(join(STABLE_DIR, "..", "helpers", "sol-windows.c"), "utf8") + "\n// and CGEventPost, say\n");
  assert.match(((await helperFor("sol-windows", tmp("app2"), src)) as { why: string }).why, /not as Sol ships it: its source sol-windows.c was changed/);
});

// ---- the block's own parts, with a fake sol ----

type Ran = { code: number | null; signal: string | null; stdout: string; stderr: string };
function fakeSol(o: { may?: boolean; hidden?: string | null; branch?: boolean; folder?: string; window?: string; putFails?: boolean; owner?: string; moved?: string } = {}) {
  const runs: { program: string; args: string[]; opts?: { key?: string; input?: string } }[] = [];
  const folder = o.folder ?? tmp("held");
  const ok = (stdout = ""): Ran => ({ code: 0, signal: null, stdout, stderr: "" });
  const sol = {
    folders: [folder],
    tool() {},
    async call(tool: string) {
      assert.equal(tool, "tracker");
      return { content: [{ text: JSON.stringify({ may: o.may ?? true, repo: "acme/sol", health: "kept · build: watching, 0 errors · face hot · nothing put back", build: "main 7d9b3a3", hidden: o.hidden ?? null, ...(o.owner ? { window: { owner: o.owner, title: "" } } : {}) }) }] };
    },
    async run(program: string, args: string[], opts?: { key?: string; input?: string }): Promise<Ran> {
      runs.push({ program, args, opts });
      if (program === "sol-windows") return o.window === undefined ? ok("4242\n") : { code: 1, signal: null, stdout: "", stderr: "" };
      if (program === "screencapture") { writeFileSync(args[args.length - 1], Buffer.from("a jpeg, so to speak")); return ok(); }
      if (program === "sips") {   // a stand-in sips: "draws" the picture again as a copy, without what follows its end
        const i = args.indexOf("--out");
        if (i > 0) { const raw = readFileSync(args[i - 1]); if (raw.includes(Buffer.from("not a picture"))) return { code: 1, signal: null, stdout: "", stderr: "sips: cannot read" }; writeFileSync(args[i + 1], raw); }
        return ok();
      }
      const a = args.join(" ");
      if (a === "api user --jq .login") return ok("marcocyl04-ux\n");
      if (a.includes("/branches/")) return o.branch === false ? { code: 1, signal: null, stdout: "", stderr: "HTTP 404: Not Found" } : ok("marcocyl04-ux/shots\n");
      if (a.includes("git/ref/heads/main")) return ok("abc123\n");
      if (args[0] === "issue") return ok("https://github.com/acme/sol/issues/120\n");
      if (o.moved && a === "api repos/acme/sol --jq .full_name") return ok(`${o.moved}\n`);
      if (o.moved && a.includes("-X PUT repos/acme/sol/")) return { code: 1, signal: null, stdout: "", stderr: "gh: Temporary Redirect (HTTP 307)" };
      if (a.includes("-X PUT")) return o.putFails ? { code: 1, signal: null, stdout: "", stderr: "HTTP 422: too big" } : ok("{}");
      return ok();
    },
  };
  return { sol, runs, folder };
}
const flag = (c: string[], f: string) => c[c.indexOf(f) + 1];

test("the block: a shot found by sol-windows, taken by screencapture into its folder, made smaller, held by its id", async () => {
  const { sol, runs, folder } = fakeSol();
  const id = await block.takeShot(sol as never);
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.deepEqual(runs.map((r) => r.program), ["sol-windows", "screencapture", "sips"]);
  assert.deepEqual(runs[0].args, ["Sol", "Sol"]);
  const other = fakeSol({ owner: "Finder" });
  await block.takeShot(other.sol as never, { owner: "Mail" } as never);
  assert.deepEqual(other.runs[0].args, ["Finder", ""], "the window is the one the engine names, whatever the caller passes");
  assert.deepEqual(runs[1].args, ["-x", "-o", "-t", "jpg", "-l", "4242", join(folder, `${id}.jpg`)]);
  assert.ok(existsSync(join(folder, `${id}.jpg`)));
  const next = await block.takeShot(sol as never);
  assert.ok(!existsSync(join(folder, `${id}.jpg`)) && existsSync(join(folder, `${next}.jpg`)), "one slot: the older shot goes");
  await assert.rejects(block.takeShot(fakeSol({ hidden: "Sol is hidden: open the eye to grab it" }).sol as never), /^Error: Sol is hidden: open the eye to grab it$/, "the eye's words as they are");
  await assert.rejects(block.takeShot(fakeSol({ window: "none" }).sol as never), /the Sol window was not found/);
});

test("the block: one issue with the mode's label, the screen, the words and the shot, signed; every gh with the key github", async () => {
  const { sol, runs, folder } = fakeSol();
  const id = await block.takeShot(sol as never);
  runs.length = 0;
  const r = await block.fileIt(sol as never, { mode: "life", words: "the orb jumps twice\nwhen I scroll", page: "Life · chat", conversation: "codex:019a-77", shot: id }, new Date("2026-10-22T10:04:05.123Z"));
  assert.deepEqual(r, { number: 120, url: "https://github.com/acme/sol/issues/120", shot: true });
  assert.ok(runs.every((x) => x.program === "gh" && x.opts?.key === "github"), "gh only, the key by name");
  const put = runs.find((x) => x.args.includes("PUT"))!;
  assert.deepEqual(put.args, ["api", "-X", "PUT", "repos/acme/sol/contents/shots/20261022-100405-life.jpg", "--input", "-"]);
  const body = JSON.parse(put.opts!.input!);
  assert.equal(body.branch, "marcocyl04-ux/shots");
  assert.equal(Buffer.from(body.content, "base64").toString(), "a jpeg, so to speak");
  const c = runs.find((x) => x.args[0] === "issue")!.args;
  assert.equal(flag(c, "-R"), "acme/sol");
  assert.equal(flag(c, "--label"), "life");
  assert.equal(flag(c, "--title"), "Life: the orb jumps twice when I scroll");
  const b = flag(c, "--body");
  assert.match(b, /- page: Life · chat\n/);
  assert.match(b, /- conversation: `codex:019a-77`\n/);
  assert.match(b, /- Sol: main 7d9b3a3\n/);
  assert.match(b, /!\[the window\]\(https:\/\/github\.com\/acme\/sol\/blob\/marcocyl04-ux\/shots\/shots\/20261022-100405-life\.jpg\?raw=true\)/);
  assert.ok(b.endsWith("\n\n— marcocyl04-ux's agent"));
  assert.ok(!existsSync(join(folder, `${id}.jpg`)), "filed: the slot is empty");
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("rest")]);
test("the block: Settings say no, nothing is filed; no branch yet, it is made from main; a picture handed in; a shot gone", async () => {
  const no = fakeSol({ may: false });
  await assert.rejects(block.fileIt(no.sol as never, { mode: "work", words: "x" }), /my agent may not speak on GitHub/);
  assert.equal(no.runs.length, 0, "not one gh");
  await assert.rejects(block.fileIt(fakeSol().sol as never, { mode: "nap", words: "x" }), /which mode\?/);
  await assert.rejects(block.fileIt(fakeSol().sol as never, { mode: "work", words: "  " }), /a line of your words first/);
  const nb = fakeSol({ branch: false });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest")]);
  const r = await block.fileIt(nb.sol as never, { mode: "cowork", words: "a grab", image: png.toString("base64") }, new Date("2026-10-22T10:04:05Z"));
  assert.equal(r.shot, true);
  const made = nb.runs.find((x) => x.args.includes("POST"))!.args;
  assert.deepEqual(made.slice(-4), ["-f", "ref=refs/heads/marcocyl04-ux/shots", "-f", "sha=abc123"]);
  assert.ok(nb.runs.find((x) => x.args.includes("PUT"))!.args[3].endsWith(".png"), "a grab is a png");
  const mv = fakeSol({ moved: "acme/sol-dev" });
  const m = await block.fileIt(mv.sol as never, { mode: "work", words: "moved", image: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]).toString("base64") }, new Date("2026-10-22T10:04:05Z"));
  assert.equal(m.shot, true, "a tracker that moved (#543): the shot goes once more at its new name");
  assert.ok(mv.runs.some((x) => x.args.includes("repos/acme/sol-dev/contents/shots/20261022-100405-work.jpg")));
  assert.match(flag(mv.runs.find((x) => x.args[0] === "issue")!.args, "--body"), /blob\/marcocyl04-ux\/shots\/shots\/20261022-100405-work\.jpg/);
  const gone = fakeSol();
  const g = await block.fileIt(gone.sol as never, { mode: "work", words: "no picture", shot: "abcdefabcdef" });
  assert.equal(g.shot, false);
  assert.equal(g.note, "the screenshot was too old or gone; none attached");
  const notImg = fakeSol();
  const odd = await block.fileIt(notImg.sol as never, { mode: "work", words: "x", image: Buffer.from("home data, say").toString("base64") });
  const hidden = fakeSol();
  const h2 = await block.fileIt(hidden.sol as never, { mode: "work", words: "x", image: Buffer.concat([JPEG, Buffer.from("not a picture: home data behind a header")]).toString("base64") });
  assert.equal(h2.shot, false, "a header in front of other bytes: sips cannot draw it, nothing goes up");
  assert.ok(!hidden.runs.some((x) => x.args.includes("PUT")));
  assert.ok(hidden.runs.some((x) => x.program === "sips" && x.args.includes("--out")), "every picture handed in is drawn again by sips");
  assert.deepEqual(readdirSync(hidden.folder), [], "and nothing is left in its folder");
  assert.equal(odd.shot, false);
  assert.match(odd.note!, /not a png or a jpeg/, "a seat's bytes are not put on GitHub as a shot");
  assert.ok(!notImg.runs.some((x) => x.args.includes("PUT")));
  const bad = await block.fileIt(fakeSol({ putFails: true }).sol as never, { mode: "work", words: "x", image: JPEG.toString("base64") });
  assert.equal(bad.shot, false);
  assert.match(bad.note!, /the screenshot did not upload \(HTTP 422: too big\)/, "the picture is lost, never the issue");
  await assert.rejects(block.fileIt(fakeSol().sol as never, { mode: "work", words: "x", shot: "../../etc/passwd" }).then((x) => { if (x.shot) throw new Error("read a path"); throw new Error("no"); }), /no/, "a shot is an id, never a path");
});

// ---- the whole of it: Sol's own file it in its big room, a gh that writes down what it was asked ----

test("file it in its big room: waits for its card and the key; then the shot through sol-windows and the issue through gh", { skip: !clang }, async (t) => {
  const h = home(), me = tmp("me"), bin = tmp("bin"), note = join(me, "Library", "Caches", "Sol", "file-it", "gh.log");   // inside its wall: the one folder gh may write
  // a gh that is a small program: it writes its words, whether stdin came and the key it was given, then answers
  writeFileSync(join(bin, "gh.c"), `#include <stdio.h>
#include <string.h>
#include <stdlib.h>
int main(int c, char **v) { FILE *f = fopen(${JSON.stringify(note)}, "a"); int in = 0;
  for (int i = 1; i < c; i++) { fputs(v[i], f); fputs(i + 1 < c ? "\\x1f" : "\\n", f); if (!strcmp(v[i], "--input")) in = 1; }
  if (in) { char b[65536]; size_t n; long t = 0; while ((n = fread(b, 1, sizeof b, stdin)) > 0) t += n; fprintf(f, "stdin %ld\\n", t); }
  const char *k = getenv("GH_TOKEN"); fprintf(f, "token %s\\n", k ? k : "none"); fclose(f);
  if (c > 2 && !strcmp(v[1], "api") && !strcmp(v[2], "user")) { puts("marcocyl04-ux"); return 0; }
  if (c > 1 && !strcmp(v[1], "issue")) { puts("https://github.com/acme/sol/issues/120"); return 0; }
  if (c > 2 && strstr(v[2], "/branches/")) { puts("marcocyl04-ux/shots"); return 0; }
  puts("{}"); return 0; }`);
  execFileSync("/usr/bin/clang", ["-O0", "-o", join(bin, "gh"), join(bin, "gh.c")]);
  const PATH = process.env.PATH;
  process.env.PATH = `${bin}:${PATH}`;
  t.after(() => { process.env.PATH = PATH; });
  useSolTools(async (name) => ({ content: [{ type: "text", text: JSON.stringify({ may: true, repo: "acme/sol", health: "kept", build: "main 7d9b3a3", hidden: null, window: { owner: "no app is called this", title: "" } }) }] }), ["tracker"]);
  const k = new Kernel(h, opts(h, { stable: STABLE_DIR, me }));
  t.after(() => k.stop());
  await k.sync();
  const w = k.waiting("file-it");
  assert.ok(w, "Sol's own file it waits for its card, as any block that goes beyond its wall");
  assert.ok(w!.plain.some((l) => /anything your GitHub account can/.test(l)) && w!.plain.some((l) => /your whole screen/.test(l)));
  assert.deepEqual(w!.asks.folders, [join(me, "Library", "Caches", "Sol", "file-it")], "the card shows the folder as it is on this Mac");
  assert.deepEqual(k.stableBlocks().map((b) => b.id).includes("file-it"), true);
  await k.approve("file-it", w!.print);
  assert.match(k.state("file-it")!.why!, /waiting for the key github/);
  assert.equal(pasteKey(join(h, "app"), { name: "github", key: "ghp_test_0123456789abcdef", hosts: ["api.github.com"] }).ok, true);
  await k.sync();
  assert.equal(k.state("file-it")?.state, "loaded", k.state("file-it")?.why);
  assert.ok(!existsSync(join(me, "Library", "Caches", "Sol", "file-it")), "its folder is made only when its room is up");

  const shot = await k.runTool("thing_file-it_shot", { owner: "Finder" }, "face");   // an owner from the caller is not heard
  assert.equal(shot.isError, true);
  assert.equal(text(shot), "the Sol window was not found", "sol-windows ran in its wall, and found nothing by that name");
  assert.ok(existsSync(join(me, "Library", "Caches", "Sol", "file-it")), "the room is up: its folder is there");

  const img = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");   // a real 1x1 png: the real sips draws it again
  const r = await k.runTool("thing_file-it_file", { mode: "work", words: "the board is empty", page: "Work", image: img.toString("base64") }, "face");
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)), { number: 120, url: "https://github.com/acme/sol/issues/120", shot: true });
  const said = readFileSync(note, "utf8").split("\n").filter(Boolean);
  assert.ok(said.filter((l) => l.startsWith("token ")).every((l) => l === "token ghp_test_0123456789abcdef"), "every gh had the pasted key, put in by the engine");
  assert.ok(said.some((l) => l.startsWith("issue\x1fcreate\x1f-R\x1facme/sol\x1f--title\x1fWork: the board is empty\x1f--label\x1fwork")));
  assert.ok(said.some((l) => /^stdin \d+$/.test(l) && Number(l.split(" ")[1]) > 100), "the shot went up on stdin, drawn again by sips");
  const runs = k.since().filter((e) => e.kind === "plugin.ran" && e.item === "file-it");
  assert.ok(runs.length >= 4 && runs.every((e) => (e.value as { out?: boolean }).out === true), "each run on the log, as out");
  assert.ok(!JSON.stringify(k.since()).includes("ghp_test_0123456789abcdef"), "never the key on the log");
  await k.stop();
});

test("the screen block goes only to the programs that take pictures: osascript declared with it, or named screencapture on the PATH, sees no window", { skip: !mac }, async (t) => {
  const h = home(), me = tmp("me");
  const d = join(h, "things", "osa");
  mkdirSync(d, { recursive: true });
  const rec = { id: "osa", title: "osa", place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html" }], room: "big", needs: { why: "a test", programs: ["osascript"], screen: true, tools: [{ name: "go" }] } };
  writeFileSync(join(d, "record.json"), JSON.stringify(rec));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  const JXA = "ObjC.import('CoreGraphics'); 'started:' + (function () { try { return ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, 0)).count; } catch (e) { return 0; } })()";
  writeFileSync(join(d, "engine.js"), `export default (sol) => { sol.tool({ name: "go", args: { as: "string" }, run: async (a) => (await sol.run(a.as, ["-l", "JavaScript", "-e", ${JSON.stringify(JXA)}])).stdout.trim() }); };`);
  // and a "screencapture" first on the PATH that is osascript: the screen block goes by the file that runs, not its name
  const bin = tmp("bin");
  symlinkSync("/usr/bin/osascript", join(bin, "screencapture"));
  const PATH = process.env.PATH;
  process.env.PATH = `${bin}:${PATH}`;
  t.after(() => { process.env.PATH = PATH; });
  rec.needs.programs = ["osascript", "screencapture"];
  writeFileSync(join(d, "record.json"), JSON.stringify(rec));
  const k = new Kernel(h, opts(h, { me }));
  t.after(() => k.stop());
  await k.sync();
  await k.approve("osa", k.waiting("osa")!.print);
  for (const as of ["osascript", "screencapture"]) {
    const r = await k.runTool("thing_osa_go", { as });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /^started:(0|undefined|null)?$/, `${as}: it ran, and saw no window list without the screen block (got ${text(r)})`);
  }
});
