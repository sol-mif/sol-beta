// The two presses of a feature's life (#482, dev cycle step 4, docs/how-we-work/dev-cycle.md §3.1): **Scoped** and
// **Approve**. Only a Sol developer's press writes them, never an agent:
//   Scoped    `Status: Scoped by <login> on YYYY-MM-DD` into specs/features/fr-NN-slug/prd.md, refused while the PRD
//             misses a required section, still says `<...>`, or its "Open questions" holds a question
//   Approve   `Status: Approved by <login> on YYYY-MM-DD` into the same folder's eval.md, refused until the PRD is
//             scoped and every eval line has its check (the shape of specs/templates/eval.md)
// The session's agent shows the card (the tool `checkpoint`, work/tools.ts); the card is kept beside the transcript
// (STATE_DIR/checkpoint/<session>.json) with `after`, the thread item it followed, and its press carries a key the
// engine gives Sol's own window only (team.checkpoint.key), as the review card's does (tonight.ts), so the agent,
// which reads the transcript and the disk, cannot press. The guard (sol/harness/guard) refuses a session that sends the
// press itself (rule checkpoint) or writes either line into the files (rule eval-sealed, #484's id).
// The files are read again at the press: what the card said when it was shown is never trusted.
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { STATE_DIR } from "../work/state.js";
import type { Item } from "../work/items.js";

export type Press = "scoped" | "approve";
export const PRESSES: Press[] = ["scoped", "approve"];
/** the sections every PRD has, whatever way it was made (specs/templates/prd.md) */
export const PRD_SECTIONS = ["What it is", "Who it is for", "What a Sol user does and sees", "Decisions", "What it must not break", "Off-switch", "Open questions"];
/** the sections of every eval.md (specs/templates/eval.md, CONTRACTS) */
export const EVAL_SECTIONS = ["Ways to use it", "Ways it can fail", "Must not break", "Releases"];
const FEATURE = /^fr-\d{2}$/;
const FOLDER = /^specs\/features\/fr-\d{2}-[^/\\]+$/;   // the only folder a press writes in

// ---- reading a PRD and an eval (pure) ----

const uncomment = (s: string) => s.replace(/<!--[\s\S]*?(-->|$)/g, "");
/** a `## heading` section's text up to the next `## `, or null when the file has none (pure) */
export function sectionOf(md: string, heading: string): string | null {
  const lines = String(md ?? "").split("\n");
  const at = lines.findIndex((l) => l.replace(/^##\s+/, "").trim().toLowerCase() === heading.toLowerCase() && /^##\s/.test(l));
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
}
/** the questions still open in a PRD (pure): every line of its "Open questions" outside comments, its list mark taken
 *  off; a line that is only "None." (or "Nothing.") is not a question, but one that goes on ("None, but ...", "Nothing
 *  left?") is. No section: none here (missing sections are said apart) */
export function openQuestions(prd: string): string[] {
  const s = sectionOf(prd, "Open questions");
  if (s === null) return [];
  return uncomment(s).split("\n").map((l) => l.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter((l) => l && !/^(none|nothing)\.?$/i.test(l));
}
const HTML = /^\/?(a|b|i|u|s|em|strong|br|hr|kbd|code|sub|sup|small|mark|details|summary|img|p|div|span|pre|ul|ol|li|table|tr|td|th)\b/i;
/** the `<...>` and `fr-NN` a template leaves, still in the file outside comments (pure), each once */
export function placeholders(md: string): string[] {
  const out: string[] = [];
  for (const m of uncomment(String(md ?? "")).matchAll(/<([A-Za-z][^<>\n]*)>|\bfr-NN\b/g)) {
    if (m[1] !== undefined && HTML.test(m[1])) continue;
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
/** a file's `Status:` value, "" when it has none (pure) */
export function statusOf(md: string): string {
  const m = /^Status:[ \t]*(.*)$/m.exec(String(md ?? ""));
  return m ? m[1].trim() : "";
}
/** the file with its first `Status:` line set to `Status: <value>`; one is put under the title when there is none (pure) */
export function withStatus(md: string, value: string): string {
  const line = `Status: ${value}`;
  if (/^Status:.*$/m.test(md)) return md.replace(/^Status:.*$/m, line);
  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 < 0) return `${line}\n\n${md}`;
  lines.splice(h1 + 1, 0, "", line);
  return lines.join("\n");
}
export const scopedLine = (login: string, day: string) => `Scoped by ${login} on ${day}`;
export const approvedLine = (login: string, day: string) => `Approved by ${login} on ${day}`;
export const isScoped = (prd: string) => /^Scoped by \S+ on \d{4}-\d{2}-\d{2}$/.test(statusOf(prd));

const cut = (xs: string[], n = 3) => xs.slice(0, n).join("; ") + (xs.length > n ? ` and ${xs.length - n} more` : "");

/** why Scoped cannot be pressed on this PRD now, or null (pure) */
export function scopedRefusal(prd: string): string | null {
  const missing = PRD_SECTIONS.filter((h) => sectionOf(prd, h) === null);
  if (missing.length) return `the PRD has no section ${missing.map((h) => `"${h}"`).join(", ")}`;
  const open = openQuestions(prd);
  if (open.length) return `${open.length} open question${open.length > 1 ? "s" : ""}: ${cut(open)}`;
  const ph = placeholders(prd);
  if (ph.length) return `the PRD still says ${cut(ph)}`;
  return null;
}
/** the eval lines (`- [E1] ...`) of a section (pure) */
const evalLines = (md: string, h: string) => uncomment(sectionOf(md, h) ?? "").split("\n").map((l) => l.trim()).filter((l) => /^[-*]\s+\[[EFN]\d+\]/.test(l));
/** why Approve cannot be pressed on this eval now, or null (pure) */
export function approveRefusal(prd: string, ev: string): string | null {
  if (!isScoped(prd)) return "the PRD is not scoped yet: press Scoped first";
  const missing = EVAL_SECTIONS.filter((h) => sectionOf(ev, h) === null);
  if (missing.length) return `eval.md has no section ${missing.map((h) => `"${h}"`).join(", ")}`;
  if (!evalLines(ev, "Ways to use it").length) return "eval.md lists no way to use it ([E1] ...)";
  const bare = EVAL_SECTIONS.slice(0, 3).flatMap((h) => evalLines(ev, h)).filter((l) => !/·\s*check:\s*(`[^`]+`|manual\b.*\S)\s*$/.test(l));
  if (bare.length) return `${bare.length} eval line${bare.length > 1 ? "s have" : " has"} no check: ${cut(bare.map((l) => /\[[EFN]\d+\]/.exec(l)![0]))}`;
  const ph = placeholders(ev);
  if (ph.length) return `eval.md still says ${cut(ph)}`;
  return null;
}

// ---- the feature's folder ----

/** the team's repository under every name it has had (the same list as #479's sol/harness/sol-dev.mjs) */
const SOL_DEV_REPOS = ["sol-mif/sol-dev", "marcocyl04-ux/sol-dev", "marcocyl04-ux/ecosystem"];
/** is the checkout whose top is `top` sol-dev? It holds docs/how-we-work (which the beta export never ships), or a
 *  remote names the team's repository. A stand-in for #479's solDevIn until that lands; any other project that happens
 *  to have specs/features never gets the presses */
export function solDevTop(top: string): boolean {
  try { if (statSync(join(top, "docs", "how-we-work")).isDirectory()) return true; } catch { /* not there */ }
  let out = "";
  try { out = execFileSync("git", ["remote", "-v"], { cwd: top, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }); } catch { return false; }
  return out.split("\n").some((l) => { const m = /([^/:\s]+)\/([^/:\s]+?)(?:\.git)?\/*\s+\((?:fetch|push)\)$/.exec(l.trim()); return !!m && SOL_DEV_REPOS.includes(`${m[1]}/${m[2]}`.toLowerCase()); });
}
/** the folder at or above `cwd` that holds specs/features (the repository's top, for a session in a subfolder), up
 *  to its git top, in a checkout of sol-dev (solDevTop); null otherwise, as in a Sol tester's copy (specs/ never
 *  reaches sol-beta) or any other project. The tool `checkpoint` is offered only in a session that has one */
export function featuresRoot(cwd: string): string | null {
  let at = resolve(cwd || "/");
  for (let i = 0; i < 12; i++) {
    try { if (statSync(join(at, "specs", "features")).isDirectory()) return solDevTop(at) ? at : null; } catch { /* not here */ }
    try { statSync(join(at, ".git")); return null; } catch { /* keep going up */ }
    const up = resolve(at, "..");
    if (up === at) return null;
    at = up;
  }
  return null;
}

/** specs/features/<fr-NN>-<slug> in a folder, relative to it, or why not */
export function featureFolder(cwd: string, feature: string): { folder: string } | { error: string } {
  const id = String(feature ?? "").trim().toLowerCase();
  if (!FEATURE.test(id)) return { error: "a feature is named by its id, fr-NN (two digits)" };
  const base = join(cwd, "specs", "features");
  let names: string[] = [];
  try { names = readdirSync(base).filter((n) => n.startsWith(`${id}-`) && statSync(join(base, n)).isDirectory()); } catch { /* none */ }
  if (!names.length) return { error: `no folder specs/features/${id}-<slug> in ${cwd}` };
  if (names.length > 1) return { error: `two folders for ${id}: ${names.join(", ")}` };
  return { folder: `specs/features/${names[0]}` };
}
const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return null; } };
/** the file a press writes, and why the press is refused now (or null) */
function check(cwd: string, folder: string, press: Press): { file: string; text: string; why: string | null } | { error: string } {
  const dir = resolve(cwd, folder);
  // the card is kept on disk, where a session can reach it: what it names is checked again, never trusted
  if (!FOLDER.test(folder) || relative(resolve(cwd), dir).startsWith("..")) return { error: "that is not a feature's folder (specs/features/fr-NN-slug)" };
  const prd = read(join(dir, "prd.md"));
  if (prd === null) return { error: `${folder} has no prd.md (start from specs/templates/prd.md)` };
  if (press === "scoped") return { file: join(dir, "prd.md"), text: prd, why: scopedRefusal(prd) };
  const ev = read(join(dir, "eval.md"));
  if (ev === null) return { error: `${folder} has no eval.md (the write-evals skill writes it)` };
  return { file: join(dir, "eval.md"), text: ev, why: approveRefusal(prd, ev) };
}

// ---- the card ----

export type CheckpointCard = Item & {
  kind: "checkpoint"; press: Press; feature: string; folder: string; cwd: string; title: string;
  why: string | null;                  // what Sol refuses the press for, as the files said when the card was shown
  state?: "busy" | "done"; by?: string; on?: string; error?: string;
  after?: string;                      // the thread item it followed
};
export type CheckpointDeps = {
  me: () => string | Promise<string>;  // the person pressing: this Sol's GitHub login
  today: () => string;                 // YYYY-MM-DD where they are
  bus: (m: object) => void;            // work.item to every face
};

const DIR = () => join(STATE_DIR, "checkpoint");
const kept = new Map<string, CheckpointCard[]>();
const keys = new Map<string, string>();
function cardsIn(id: string): CheckpointCard[] {
  let c = kept.get(id);
  if (c) return c;
  try { c = JSON.parse(readFileSync(join(DIR(), `${id}.json`), "utf8")) as CheckpointCard[]; if (!Array.isArray(c)) c = []; } catch { c = []; }
  for (const x of c) if (x.state === "busy") delete x.state;   // a press the engine stopped in the middle of is open again
  kept.set(id, c);
  return c;
}
function save(id: string) {
  // written whole or not at all (#11)
  try { mkdirSync(DIR(), { recursive: true }); const f = join(DIR(), `${id}.json`); writeFileSync(f + ".tmp", JSON.stringify(cardsIn(id))); renameSync(f + ".tmp", f); } catch { /* it stays live */ }
}
function put(id: string, card: CheckpointCard, bus: (m: object) => void) {
  const c = cardsIn(id);
  const i = c.findIndex((x) => x.id === card.id);
  if (i >= 0) c[i] = card; else c.push(card);
  save(id);
  bus({ type: "work.item", sessionId: id, item: card });
}
/** a session's checkpoint cards (for the tests and the thread) */
export const checkpointsOf = (id: string): CheckpointCard[] => cardsIn(id);

/** the key a press must carry, made once per engine run for a session with a card; "" when it has none. Given to Sol's
 *  own window only (team.checkpoint.key): never written down, never in the transcript */
export function checkpointKey(id: string): string {
  if (!cardsIn(id).length) return "";
  let k = keys.get(id);
  if (!k) { k = randomBytes(16).toString("hex"); keys.set(id, k); }
  return k;
}

/** a thread's items with its checkpoint cards in their places (after the item each one followed) */
export function withCheckpoints(id: string, items: Item[]): Item[] {
  const r = cardsIn(id);
  if (!r.length) return items;
  const out = items.filter((i) => i.kind !== "checkpoint");
  const at = new Map(out.map((x, i) => [x.id, i]));
  const tail: Item[] = [], by = new Map<number, Item[]>();
  for (const it of r) {
    const i = at.get(String(it.after ?? ""));
    if (i === undefined) tail.push(it); else by.set(i, [...(by.get(i) ?? []), it]);
  }
  return [...out.flatMap((x, i) => [x, ...(by.get(i) ?? [])]), ...tail];
}

const WORD: Record<Press, string> = { scoped: "Scoped", approve: "Approve" };

/** the tool `checkpoint`: the session's agent asks its Sol developer for a press. The card goes into the session, with
 *  what Sol refuses it for now; the answer is the agent's, and it never presses */
export async function askPress(d: Pick<CheckpointDeps, "bus">, a: { sessionId: string; cwd: string; feature: string; press: string; after?: string }): Promise<string> {
  const press = a.press as Press;
  if (!PRESSES.includes(press)) return `the presses are ${PRESSES.join(" and ")}`;
  if (!a.cwd) return "this session has no folder";
  const f = featureFolder(a.cwd, a.feature);
  if ("error" in f) return f.error;
  const c = check(a.cwd, f.folder, press);
  if ("error" in c) return c.error;
  const feature = a.feature.trim().toLowerCase();
  const title = (/^#\s+(.*)$/m.exec(c.text)?.[1] ?? feature).replace(/:\s*(PRD|evals)\s*$/i, "").trim();
  // one open card per feature and press: an older one that was never pressed goes
  const list = cardsIn(a.sessionId);
  for (let i = list.length - 1; i >= 0; i--) if (list[i].feature === feature && list[i].press === press && list[i].state !== "done") list.splice(i, 1);
  const card: CheckpointCard = {
    id: `checkpoint:${feature}:${press}:${Date.now().toString(36)}`, kind: "checkpoint", press, feature, folder: f.folder, cwd: a.cwd, title,
    why: c.why, ...(a.after ? { after: a.after } : {}),
  };
  put(a.sessionId, card, d.bus);
  return c.why
    ? `shown: the ${WORD[press]} card for ${feature} is in the session, and Sol refuses the press until this is settled: ${c.why}. Settle it with your human; then show the card again.`
    : `shown: the ${WORD[press]} card for ${feature} waits for your human's press. Only their press writes the Status line; never write it yourself. End your turn.`;
}

/** a press on the card: from Sol's own window with the card's key, not pressed before; the files read again and the
 *  press refused while they are not ready; then the one Status line written, and the card says who and when */
export async function pressCheckpoint(d: CheckpointDeps, a: { sessionId: string; id: string; key?: string; window?: boolean }): Promise<{ ok?: true; line?: string; error?: string }> {
  if (!a.window) return { error: "Scoped and Approve are pressed in Sol's own window" };
  const card = cardsIn(a.sessionId).find((c) => c.id === a.id);
  if (!card) return { error: "that card is not in this session" };
  if (!a.key || a.key !== keys.get(a.sessionId)) return { error: "this card was opened again since; press once more" };
  if (card.state === "done") return { error: `${WORD[card.press]} was pressed already, by ${card.by} on ${card.on}` };
  if (card.state === "busy") return { error: "it is being written" };
  const me = String(await d.me() ?? "").trim();
  if (!me) return { error: "who is pressing? sign in to GitHub first (Cowork, settings)" };
  const c = check(card.cwd, card.folder, card.press);
  if ("error" in c) { card.error = c.error; put(a.sessionId, card, d.bus); return { error: c.error }; }
  card.why = c.why;
  if (c.why) { card.error = `Sol refuses ${WORD[card.press]}: ${c.why}`; put(a.sessionId, card, d.bus); return { error: card.error }; }
  const day = d.today();
  const value = card.press === "scoped" ? scopedLine(me, day) : approvedLine(me, day);
  card.state = "busy"; delete card.error; put(a.sessionId, card, d.bus);
  try {
    writeFileSync(c.file + ".tmp", withStatus(c.text, value)); renameSync(c.file + ".tmp", c.file);   // whole or not at all
  } catch (e) {
    try { rmSync(c.file + ".tmp", { force: true }); } catch { /* nothing to take back */ }
    delete card.state; card.error = `not written: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}`; put(a.sessionId, card, d.bus);
    return { error: card.error };
  }
  card.state = "done"; card.by = me; card.on = day; put(a.sessionId, card, d.bus);
  record({ file: `${card.folder}/${card.press === "scoped" ? "prd" : "eval"}.md`, line: `Status: ${value}`, hash: sealedHash(withStatus(c.text, value)), by: me, at: new Date().toISOString() });
  return { ok: true, line: `Status: ${value}` };
}

/** what the presses wrote, one line each, beside the cards (STATE_DIR/checkpoint/pressed.jsonl): the guard's commit
 *  check (sol/harness/guard, rule eval-sealed) lets a new mark into a commit only when it is here, so a mark written
 *  some other way (a script, a staged write the guard never saw) stops at the commit. The guard refuses a session's
 *  write to this file */
export const PRESSED = () => join(DIR(), "pressed.jsonl");
/** what a press seals, as a hash (pure): the file up to its "## Releases" heading (the verifier's lines below it are
 *  added each release and need no new press), trailing space off. The guard's commit check computes the same; an
 *  eval.md whose sealed part changed under its Approved line (a check weakened, a case added) needs a new press */
export const sealedHash = (text: string) => createHash("sha256").update(String(text).split(/^## Releases[ \t]*$/m)[0].replace(/\s+$/, "")).digest("hex");
function record(r: { file: string; line: string; hash: string; by: string; at: string }) {
  try { mkdirSync(DIR(), { recursive: true }); appendFileSync(PRESSED(), JSON.stringify(r) + "\n"); } catch { /* the commit check says so then */ }
}
/** the day where this Mac is, YYYY-MM-DD */
export const localDay = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
/** for tests: everything kept, gone */
export function forgetCheckpoints() { kept.clear(); keys.clear(); rmSync(DIR(), { recursive: true, force: true }); }
