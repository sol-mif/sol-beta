// File it (#119), Sol's own block (Stable, step 7 of the design): the big room's first tenant. What team/file.ts does in
// the engine, done here behind the wall, through the door and nothing else:
//   the shot   sol-windows (Sol's helper: the window's number, never a title) finds Sol's window, screencapture takes
//              its pixels into the one folder the record declares (~/Library/Caches/Sol/file-it), sips makes it at most
//              2000 px wide. One shot is held at a time, for ten minutes, as a file named by its id: the room may be put
//              away between the press and the words, and the file is still there
//   the issue  gh with the key `github` (the engine puts it in gh's environment; it never enters this room): the shot
//              onto the person's <login>/shots branch (made from main the first time), then one issue with the mode's
//              label, the words, the screen and the shot, signed "<login>'s agent". Its number comes back
//   Settings   asked of Sol's `tracker` tool (needs.sol): whether my agent may speak on GitHub, the team's tracker, the
//              health line, the commit, whether Sol is hidden, and which window is Sol's (the shot takes Sol's window
//              only: no caller names another app). A seat calling this block's tool is held to the same
// Only node's builtins and erasable TypeScript: the room runs this file as written.
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export const MODES = ["life", "work", "cowork"];
export const WORDS_MAX = 280;
export const SHOT_MS = 10 * 60_000;
const TITLE_MAX = 90;
const MODE_NAME: Record<string, string> = { life: "Life", work: "Work", cowork: "Cowork" };
const SHOT_ID = /^[0-9a-f]{12}$/;

type Ran = { code: number | null; signal: string | null; stdout: string; stderr: string };
type Sol = {
  folders: readonly string[];
  tool(def: { name: string; description?: string; args?: Record<string, string>; run: (a: Record<string, unknown>) => unknown }): void;
  run(program: string, args: string[], opts?: { key?: string; input?: string }): Promise<Ran>;
  call(tool: string, args?: unknown): Promise<{ content?: { text?: string }[]; isError?: boolean }>;
};
/** window: the app and title whose window the shot takes, Sol's own (said by the engine, never by whoever calls the tool:
 *  a seat that named the app would have any window it likes filed) */
export type Tracker = { may: boolean; repo: string; health: string; build: string; hidden: string | null; window?: { owner: string; title: string } };

/** the person's words as one line: whitespace folded, at most WORDS_MAX characters (pure) */
export const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, WORDS_MAX);
const cut = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…");
const safe = (s: unknown, max = 120) => String(s ?? "").replace(/[\r\n`]+/g, " ").trim().slice(0, max);
export const sign = (login: string) => `— ${login || "<login>"}'s agent`;
const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const IMAGE_MAX = 8 * 1024 * 1024;

/** the issue's title and body (pure), as team/file.ts issueOf */
export function issueOf(a: { mode: string; words: string; page: string; conversation: string; health: string; build: string; login: string; shotUrl?: string; shotNote?: string }) {
  const title = cut(`${MODE_NAME[a.mode]}: ${a.words}`, TITLE_MAX);
  const screen = [
    `- page: ${a.page || MODE_NAME[a.mode]}`,
    `- conversation: ${a.conversation ? `\`${a.conversation}\`` : "none open"}`,
    `- engine: ${a.health}`,
    ...(a.build ? [`- Sol: ${a.build}`] : []),
  ];
  const shot = a.shotUrl ? `![the window](${a.shotUrl})` : `_${a.shotNote || "no screenshot"}_`;
  return { title, body: `${a.words}\n\n**The screen**\n${screen.join("\n")}\n\n${shot}\n\n${sign(a.login)}` };
}

/** a picture handed in, decoded and written again by sips in its own folder: what goes up is only what sips drew, so
 *  bytes behind a picture's header (anything a caller hid there) never reach GitHub. Null when it is not one */
async function remade(sol: Sol, dir: string, raw: Buffer): Promise<Buffer | null> {
  if (raw.length > IMAGE_MAX || !(isPng(raw) || isJpeg(raw))) return null;
  const tag = randomBytes(6).toString("hex"), ext = isPng(raw) ? "png" : "jpg";
  const src = join(dir, `in-${tag}.${ext}`), out = join(dir, `out-${tag}.${ext}`);
  try {
    writeFileSync(src, raw, { mode: 0o600, flag: "wx" });
    const r = await sol.run("sips", ["-s", "format", ext === "png" ? "png" : "jpeg", "-Z", "2000", src, "--out", out]);
    if (r.code !== 0 || !existsSync(out)) return null;
    const img = readFileSync(out);
    return img.length && (isPng(img) || isJpeg(img)) ? img : null;
  } catch { return null; }
  finally { rmSync(src, { force: true }); rmSync(out, { force: true }); }
}

/** gh with the key, its words back; a failure is its first line */
async function gh(sol: Sol, args: string[], input?: string): Promise<string> {
  const r = await sol.run("gh", args, { key: "github", ...(input !== undefined ? { input } : {}) });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `gh ended ${r.signal ?? r.code}`).trim().split("\n")[0].slice(0, 200));
  return r.stdout;
}
async function tracker(sol: Sol): Promise<Tracker> {
  const r = await sol.call("tracker", {});
  const t = JSON.parse(r?.content?.[0]?.text ?? "null");
  if (!t || typeof t !== "object" || r.isError) throw new Error("Sol did not say its settings (tracker)");
  return t as Tracker;
}

/** the held shot's file, if this id's is there and fresh; older ones are deleted on the way */
function heldShot(dir: string, id: string, now = Date.now()): Buffer | null {
  if (!SHOT_ID.test(id)) return null;
  for (const ext of ["jpg", "png"]) {
    const p = join(dir, `${id}.${ext}`);
    try { if (now - statSync(p).mtimeMs <= SHOT_MS) return readFileSync(p); rmSync(p, { force: true }); } catch { /* not this one */ }
  }
  return null;
}
/** one slot: every shot held before goes */
function dropAll(dir: string) {
  for (const f of existsSync(dir) ? readdirSync(dir) : []) if (/^[0-9a-f]{12}\.(jpg|png)$/.test(f)) rmSync(join(dir, f), { force: true });
}

export async function takeShot(sol: Sol): Promise<string> {
  const dir = sol.folders[0];
  if (!dir) throw new Error("no folder to hold the shot in (its record declares one)");
  const t = await tracker(sol);
  if (t.hidden) throw new Error(t.hidden);   // the eye is closed: the window is blank to screencapture
  const owner = typeof t.window?.owner === "string" && t.window.owner ? t.window.owner : "Sol", title = typeof t.window?.title === "string" ? t.window.title : "Sol";
  const found = await sol.run("sol-windows", [owner.slice(0, 200), title.slice(0, 200)]);
  const win = found.stdout.trim();
  if (found.code !== 0 || !/^\d+$/.test(win)) throw new Error("the Sol window was not found");
  dropAll(dir);
  const id = randomBytes(6).toString("hex"), path = join(dir, `${id}.jpg`);
  const shot = await sol.run("screencapture", ["-x", "-o", "-t", "jpg", "-l", win, path]);
  if (shot.code !== 0 || !existsSync(path)) throw new Error(`screencapture did not take it${shot.stderr.trim() ? `: ${shot.stderr.trim().split("\n")[0].slice(0, 160)}` : ""}`);
  await sol.run("sips", ["-Z", "2000", path]).catch(() => null);   // a retina window is 3400 px wide; half is plenty
  return id;
}

export async function fileIt(sol: Sol, a: Record<string, unknown>, now = new Date()): Promise<{ number: number; url: string; shot: boolean; note?: string }> {
  const mode = String(a.mode ?? "");
  if (!MODES.includes(mode)) throw new Error(`which mode? one of ${MODES.join(", ")}`);
  const words = oneLine(a.words);
  if (!words) throw new Error("a line of your words first: what is wrong");
  const t = await tracker(sol);
  if (!t.may) throw new Error("my agent may not speak on GitHub (Settings, my agent); nothing was filed");
  const repo = t.repo;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("no team tracker is set (Settings, team repos)");
  const login = (await gh(sol, ["api", "user", "--jq", ".login"])).trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error("who am I on GitHub? the key github did not say");

  // the shot first: a failure there costs the picture, never the issue
  const dir = sol.folders[0] ?? "";
  const id = typeof a.shot === "string" ? a.shot : "";
  let img: Buffer | null = null, shotUrl: string | undefined, shotNote: string | undefined;
  if (typeof a.image === "string" && a.image) {   // a picture the engine held (a grab): made again by sips, never other bytes
    img = dir ? await remade(sol, dir, Buffer.from(a.image, "base64")) : null;
    if (!img) shotNote = "the picture was not a png or a jpeg under 8 MB; none attached";
  }
  else if (id) { img = dir ? heldShot(dir, id) : null; if (!img) shotNote = "the screenshot was too old or gone; none attached"; }
  if (img?.length) {
    try { shotUrl = await putShot(sol, repo, login, img, now, mode); }
    catch (e) { shotNote = `the screenshot did not upload (${safe((e as Error)?.message ?? e, 160)})`; }
  }
  const { title, body } = issueOf({ mode, words, page: safe(a.page), conversation: safe(a.conversation, 200), health: t.health, build: t.build, login, shotUrl, shotNote });
  const out = await gh(sol, ["issue", "create", "-R", repo, "--title", title, "--label", mode, "--body", body]);
  const m = /\/issues\/(\d+)/.exec(out);
  if (!m) throw new Error(`GitHub did not say the number (${safe(out, 120) || "no answer"})`);
  if (dir && id) for (const ext of ["jpg", "png"]) if (SHOT_ID.test(id)) rmSync(join(dir, `${id}.${ext}`), { force: true });   // filed: the slot is empty
  return { number: Number(m[1]), url: out.trim().split(/\s+/).pop() ?? "", shot: !!shotUrl, ...(shotNote ? { note: shotNote } : {}) };
}

/** the shot as a file on <login>/shots (the branch made from main the first time); its URL as an issue shows it */
async function putShot(sol: Sol, repo: string, login: string, img: Buffer, now: Date, mode: string): Promise<string> {
  const ref = `${login}/shots`;
  const exists = await gh(sol, ["api", `repos/${repo}/branches/${encodeURIComponent(ref)}`, "--jq", ".name"]).catch(() => "");
  if (!exists.trim()) {
    const main = (await gh(sol, ["api", `repos/${repo}/git/ref/heads/main`, "--jq", ".object.sha"])).trim();
    await gh(sol, ["api", "-X", "POST", `repos/${repo}/git/refs`, "-f", `ref=refs/heads/${ref}`, "-f", `sha=${main}`]);
  }
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
  const path = `shots/${stamp}-${mode}.${isPng(img) ? "png" : "jpg"}`;
  const body = JSON.stringify({ message: `shot: ${mode}, ${stamp} (${sign(login)})`, branch: ref, content: img.toString("base64") });
  let at = repo;
  try { await gh(sol, ["api", "-X", "PUT", `repos/${at}/contents/${path}`, "--input", "-"], body); }
  catch (e) {   // a tracker renamed or moved (#543): GitHub answers a write with a redirect; once more at its new name
    if (!/HTTP 30[178]\)?\s*$/.test(String((e as Error).message))) throw e;
    const to = (await gh(sol, ["api", `repos/${repo}`, "--jq", ".full_name"]).catch(() => "")).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(to) || to.toLowerCase() === repo.toLowerCase()) throw e;
    at = to;
    await gh(sol, ["api", "-X", "PUT", `repos/${at}/contents/${path}`, "--input", "-"], body);
  }
  return `https://github.com/${at}/blob/${ref.split("/").map(encodeURIComponent).join("/")}/${path}?raw=true`;
}

export default function load(sol: Sol) {
  sol.tool({ name: "shot", description: "Take a picture of Sol's window now and hold it for ten minutes; its id, for file.", run: () => takeShot(sol) });
  sol.tool({ name: "file", description: "File one issue on the team's tracker; its number comes back.", args: { mode: "string", words: "string", page: "string", conversation: "string", shot: "string", image: "string" },
    run: (a) => fileIt(sol, a) });
}
