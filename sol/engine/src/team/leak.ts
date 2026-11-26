// The leak check (#479): nothing team-only reaches Sol testers through sol-beta. The beta export (ship.ts exportTree)
// is an allowlist (BETA_KEEP); this is the second wall behind it, run on the whole export tree before anything is
// written, so a careless change to the allowlist, a team note dropped in a kept folder or a team rule left switched on
// is refused with its place named, and the beta repo gets nothing until it is out. It refuses:
//   a team file    at any depth: a specs/, docs/, .claude/ (but the root's settings.json), .sol/ or .sol-gate/ (the
//                  project's state), .github/ (but the two public workflows), locks/ or reviews/ folder; a GLOSSARY.md,
//                  CONTRIBUTING.md, REVIEW.md, now.md, MINE.md, PROTOCOL.md, CODEOWNERS, CLAUDE.md or AGENTS.md (but
//                  the neutral home's), team.json, a local override; a skill under sol/skills other than sol's; the
//                  dev's door (take, brief, night, release, promote, kit, the stage, live, MY SOL's mine/);
//   a home that is not the neutral one (NEUTRAL_HOME): a Sol tester's sol/home holds only what a fresh Sol needs;
//   a team rule    a harness without sol/harness/sol-dev.mjs, a team rule named safe there, .claude/settings.json that
//                  does more than wire the guard; and, run for real (guardProbe), a guard that outside sol-dev still
//                  refuses a team rule, stops refusing what protects a Sol user, or names the team's tools in its words;
//   a team word    in what speaks to a tester's agent (sol/home, any CLAUDE.md or AGENTS.md, the sol skill, sol/HELP.md,
//                  the README, .claude/settings.json, the guard's refusals): a team member's name or login (read from
//                  docs/people of the release itself), sol-dev, MY SOL, the team's tools and pages, the nights' buttons;
//   a word kept back  in any file that ships, code included: a word marketing has not made public yet (read from
//                  NOT_YET_PUBLIC of the release itself, a team file that is never exported; #1323).
// It runs before every export (mirror → exportTree) and on every sol-dev PR (ci.yml, job `leak`:
// `npx tsx src/team/leak.ts --check <sha>` in sol/engine builds the export of the PR's merge commit and checks it,
// writing nothing). The full answer (what of a Sol is a person's, a team's or everyone's) waits on personalization.
import { execFile, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ExportFile = { path: string; body: Buffer };

/** the home a Sol tester gets, whatever sol-dev's sol/home holds: the instructions every seat reads at start (the
 * same text as CLAUDE.md and AGENTS.md, no name, no team), and the memory folder. No life folder (#1776). Nothing else. */
export const HOME_TEXT = `# Sol, Home side

You are Sol, this person's own surface, running on their own computer. Your name is Sol.
This folder is your back room. They never have to open it; you keep it for them.

This is the Home side: everyday life, school, workouts, meals, time. Not a codebase.
Be warm and plain. Short sentences. No headers, no bullet walls, no code unless asked.
When they say hi, say hi back like a person would.

What lives here:
- \`school/\`  their classes, when they have some: syllabi, notes, what is due. One folder per class.
- \`life/\`    workouts, meals, time.
- \`memory/\`  what you learn about them, one fact per file, so you remember next time.

When they tell you something worth keeping, write it down here without being asked.

School: when \`school/CLAUDE.md\` is there, read it, then the class folder's \`brain.md\`, before any class work.

The web: only Sol's own browser tools (browser_open, browser_read, browser_find, browser_click,
browser_type, browser_screenshot). It is the one window they can see, and their logins stay in it.
Never a browser or computer-use plugin or skill, never curl to a local daemon: those are not Sol's and
open things on their screen. If browser_open fails, say so; do not go around it.

The desk: a study space they open beside the chat. desk_show puts a card on it: a note, a set of flashcards,
a question, an exam (questions on a clock), a page of a file (a PDF under school/), a board, a timer. Make the
cards yourself, on the fly, from what they are studying: a fresh set, a different style of question, a cheat-sheet
note. Teach example first, then one question at a time; grade what they answer in the chat. What they do on the
desk comes with their next message. Keep a set they will want again with \`keep\`, bring it back with \`load\`.

Changing Sol itself: when they ask you to change how Sol looks or behaves in its window, you do it, here, without handing it off: this side is allowed to edit Sol's face, and only that:
\`../mac/src\` (React and CSS; the creature is \`creature/\`) and \`../design\`. Never the engine, never \`src-tauri\`. When they have the face hot
(Settings, engine, face), each save shows in their running app within a second, so read the file first and keep
every edit small and whole. The face is cut into sites, and they watch you work on them: the part you are editing
is taped off while you work (stripes in your seat's colour, your last sentence in its corner), and a part that breaks shows "broke it, Sol is fixing it" while the rest of the window
keeps working. The sites: sidebar (Sidebar, sideFloat, ModeSwitch, work/WorkSidebar), composer (work/Composer,
Picker), talk (Message, History, Trail, work/ThreadPane, WorkTalk, WorkSteps), desk (Desk, work/Cards), browser
(Browser), settings (Settings, work/WorkSettings), panes (work/Panes, the *Pane files, Show, Overview, Diff, Split),
creature (creature/, Mark, ../design); any other file is the whole face (it may blink: say so).
Before an edit, say in one line which site you are changing and what for: that line is the tape's. One edit per
site at a time: finish it, see it land, then the next. After each change that landed, run
\`../mutate "<one line: what changed>"\` (no ; | & > < or $ in the line): it makes it one commit and takes the tape
off. A turn that ends without one leaves the part "changed, not kept". When they say undo, run \`../undo\`; once
more goes one further back. \`../back\` is theirs, not yours: it takes one step back for the face and the engine and
ends the engine; when they ask how to get Sol working again, point them to Settings → engine or \`sol/HELP.md\`.
Never edit the fence: \`Site.tsx\`, \`renovation.ts\`, \`sites.ts\`, \`hot.ts\`, the two \`main.tsx\` that mount them,
and what they import, \`creature/ring.ts\` and \`creature/loop.ts\`; they are what keeps the window alive while you
work. Keep the house style: motion slides, never fades. (On Codex the sandbox keeps you inside home: say this needs
the Claude seat.)

Pinging them: when you finish something they asked to be told about, call \`ping\` with one line (what is done, in
their words). It shows in Sol's window, or as one banner when Sol is not on their screen; never for anything else.

Groups: when the person is doing something with others (teammates, classmates, friends, a group project), offer a
group once with suggest_group; never twice in a conversation.
`;
export const NEUTRAL_HOME: Record<string, string> = {
  "sol/home/CLAUDE.md": HOME_TEXT,
  "sol/home/AGENTS.md": HOME_TEXT,
  "sol/home/memory/.keep": "",
};

// a team file: never in the export, whatever BETA_KEEP says, at the root or inside a kept folder. Compared in lower
// case: a Mac's disk does not tell Claude.md from CLAUDE.md, and Claude Code reads either
const TEAM_DIRS = ["specs", "docs", ".claude", ".sol", ".sol-gate", ".github", "locks", "reviews"];   // a folder of these names, at any depth
const TEAM_BASENAMES = new Set(["glossary.md", "contributing.md", "review.md", "now.md", "mine.md", "protocol.md", "inbox.md",
  "codeowners", "claude.md", "agents.md", "team.json", "team.cloud.json", "harness.local.json", "settings.local.json"]);
const TEAM_FILES = new Set(["sol/take", "sol/brief", "sol/night", "sol/release", "sol/promote", "sol/kit", "sol/rulesets",
  "sol/catchup", "sol/live-setup", "sol/readme.md", "sol/worktype", "sol/features", "sol/gate", "sol/words",
  "sol/first-timer", "sol/morning", "sol/runner",
  // the team's always-on machine's night job and release runner: only the team's promote and release install them
  "sol/engine/systemd/user/sol-night.service", "sol/engine/systemd/user/sol-night.timer",
  "sol/engine/systemd/user/sol-release.service", "sol/engine/systemd/user/sol-release.timer",
  "sol/engine/systemd/user/sol-morning.service", "sol/engine/systemd/user/sol-morning.timer",
  // the drift runner and the nightly integration (#1153): the team's own, on the NucBox only
  "sol/drift", "sol/engine/systemd/user/sol-drift.service", "sol/engine/systemd/user/sol-drift.timer",
  "sol/integrate", "sol/engine/systemd/user/sol-integrate.service", "sol/engine/systemd/user/sol-integrate.timer",
  // our machines as CI runners (#638): only the team's sol/runner writes it
  "sol/engine/systemd/user/sol-runner.service"]);
/** the only files under a team folder, or sol/skills or sol/mine, that a Sol tester gets (BETA_KEEP names them) */
const NOT_TEAM = (path: string) => path === ".claude/settings.json" || path === ".github/workflows/release.yml"
  || path === ".github/workflows/pages.yml" || path in NEUTRAL_HOME;
/** a known team file (pure, any letter case): the export leaves it out of a kept folder, and leakIn refuses it if it is
 * still there */
export const isTeamFile = (path: string) => {
  if (NOT_TEAM(path)) return false;
  const low = path.toLowerCase(), parts = low.split("/"), base = parts[parts.length - 1];
  return TEAM_FILES.has(low) || TEAM_BASENAMES.has(base) || base.endsWith(".local.md") || parts.slice(0, -1).some((d) => TEAM_DIRS.includes(d))
    || low.startsWith("mine/")   // MY SOL's own pages, on a <you>/mine branch
    || (low.startsWith("sol/skills/") && !path.startsWith("sol/skills/sol/"))   // the team's skills (#482): only sol's ships
    || (low.startsWith("sol/mine/") && !/^sol\/mine\/(setup|rebase|hooks\/)/.test(path));   // the stage, live, notes: the dev's
};

/** the guard's rules that may stay switched on outside sol-dev: they protect any Sol user. A rule added to SAFE_RULES in
 * sol/harness/sol-dev.mjs must be added here too, read by a person: a team rule named safe would reach every Sol tester */
export const BETA_RULES = ["home-data", "key", "fence", "window"];

// a team word: what only makes sense in sol-dev. Case and the space between words do not matter ("Into\nbeta",
// "SOL-DEV", "Docs/How-we-work"), but for the four that are everyday English in lower case ("my Sol", "send back",
// "bring it in", "not tonight"), which are matched only as the team writes them, capitalised.
const W = (s: string) => s.replace(/ /g, "\\s+");
export const TEAM_WORDS = new RegExp([
  "\\bsol-dev\\b", "glossary\\.md", "contributing\\.md", "review\\.md", "\\bnow\\.md\\b", "\\bmine\\.md\\b",
  "sol\\/readme\\.md", "sol\\/protocol\\.md", "docs\\/people", "docs\\/how-we-work", "\\bspecs\\/", "\\.sol\\/(?:project|rhythm|onboarded)",
  "\\bsol\\/(?:take|brief|night|release|promote|kit|worktype|features|gate|words|first-timer|morning)\\b", "\\bsol\\/mine\\/(?:stage|live|unlive)\\b",
  W("\\binto sol-dev\\b"), W("\\binto beta\\b"), W("\\bnight digest\\b"), W("\\b(?:dev|beta) night\\b"),
].join("|"), "i");
const TEAM_PHRASES = new RegExp(["\\bMY SOL\\b", "\\bSend back\\b", "\\bBring it in\\b", "\\bNot tonight\\b"].map(W).join("|"));
// Where team words are looked for: every text file of the export, in full, but these. The narrower guarantee, plainly:
//   code       a code file (CODE_EXT) in the engine's or the face's code and tests, the native app or the listener:
//              they carry the team's features (the nights, Cowork's team pages) switched off for a tester, and their
//              words are code. Their other files (.md, .json, .txt) are read in full. Keys, addresses, tailnet hosts and
//              a person's home folder are looked for in code too;
//   EXEMPT     the files below are code that also serves the team; only their comment lines are read;
//   ALLOWED    exact mentions that installed Sols or the public site need, taken out before a file is read.
// And what it does not try to catch (the leak it guards against is an accident, not a team member hiding words on
// purpose): words written in base64 or another encoding, look-alike letters, a team rule written without a listed
// word, phone numbers and other personal details not listed here, and words inside an image's or a font's bytes.
const CODE = /^sol\/(engine\/(src|test)|mac\/(src|src-tauri|listen))\//;
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|swift|css|scss)$/i;
export const EXEMPT: Record<string, string> = {
  "sol/harness/guard": "the team's rules are its code, switched off outside sol-dev and run for real by guardProbe",
  "sol/harness/sol-dev.mjs": "it names the team's repository to tell it apart",
  "sol/setup": "it also sets up a Sol developer's checkout (--dev); those lines run only there",
};
/** what an EXEMPT file says to a person, the rest blanked line by line (so line numbers hold and no word joins across
 * code): its comment lines, and what it prints, the quoted strings of an echo, printf or setup's own printers (say, ok,
 * miss, skip, opt, ask), a heredoc's body, and node's console and stderr writes. The guard's refusals are guardProbe's */
function exemptWords(path: string, text: string): string {
  const comment = COMMENT(path), node = /^sol\/harness\/guard$|\.m?js$/.test(path);
  const prints: RegExp = node ? /\b(?:console\.\w+|process\.std(?:out|err)\.write)\s*\(/ : /(?:^|[;&|({]\s*|\b(?:then|else|do)\s+)(?:echo|printf|say|ok|miss|skip|opt|ask)\b/;
  const quoted = (l: string) => [...l.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join(" ; ");
  let doc: string | null = null;
  return text.split("\n").map((l) => {
    if (doc !== null) { if (l.trim() === doc) { doc = null; return ""; } return l; }   // a heredoc's body is read whole
    const open = node ? null : /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(l);
    if (open) doc = open[1];
    if (comment.test(l)) return l;
    const at = l.search(prints);
    return at >= 0 ? quoted(l.slice(at)) : "";   // only what follows the printer: a path tested before it is code
  }).join("\n");
}
const COMMENT = (path: string) => /^sol\/harness\/guard$|\.m?js$/.test(path) ? /^\s*(\/\/|\/\*|\*)/ : /^\s*#/;   // node's comments, or a shell's
/** exact mentions that must stay, each where it is needed: everywhere (ALLOWED["*"]) or in one file */
export const ALLOWED: Record<string, RegExp[]> = {
  "*": [/\bcom\.marco\.sol-engine(?:-build)?\b/g, /\bgithub\.com\/marcocyl04-ux\/sol-beta\b/g],   // the engine's launchd label; the beta repo's address
  "site/index.html": [/Made by Marco, Frank and Isaac\b/g],   // the public site's credit, already public: the team's to choose
  "sol/mac/src/cowork/blocks/blocks.json": [/"owner":\s*"[^"]*"/g],   // who owns each team tool (off for a tester), as data the face reads
  // the native app's metadata: changing it rebuilds the Mac app's shell, a human's call (said in the PR)
  "sol/mac/src-tauri/Cargo.toml": [/description = "Sol: Marco's one surface"/g, /authors = \["Marco"\]/g],
  // the plists as they ship are one Mac's; setup rewrites these paths to the person's own (sol/setup, "the plists")
  "sol/engine/launchd/com.marco.sol-engine.plist": [/\/Users\/marcol04\//g],
  "sol/engine/launchd/com.marco.sol-engine-build.plist": [/\/Users\/marcol04\//g],
  "sol/setup": [/\/Users\/marcol04\//g],
};
const allowedOut = (path: string, text: string) => [...ALLOWED["*"], ...(ALLOWED[path] ?? [])].reduce((t, re) => t.replace(re, (m) => " ".repeat(m.length)), text);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameWord = (names: string[]) => names.length ? new RegExp(`\\b(?:${names.map((n) => escape(n).replace(/\s+/g, "\\s+")).join("|")})\\b`, "i") : null;
/** the first team word in a text (pure): the word and where it starts, or null */
function firstWord(text: string, names: string[]): { word: string; at: number } | null {
  const hits = [TEAM_WORDS.exec(text), TEAM_PHRASES.exec(text), nameWord(names)?.exec(text)].filter((m): m is RegExpExecArray => !!m);
  if (!hits.length) return null;
  const m = hits.sort((a, b) => a.index - b.index)[0];
  return { word: m[0], at: m.index };
}
/** the first team word in a text (pure), or null */
export function teamWord(text: string, names: string[] = []): string | null {
  return firstWord(allowedOut("", text), names)?.word ?? null;
}
// a person's own home folder: /Users/<name>/ or /home/<name>/, but a placeholder or a runner's (an address's own path, sol://home/block/<id>, is not one)
const HOME_PATH = /(?<![\w.$-])(?<![a-z]:\/)\/(?:Users|home)\/(?!(?:you|me|user|someone(?:-else)?|runner|name|example|test|ci|shared|Shared|Library|computer|[A-Za-z]{1,2})\/)[A-Za-z0-9][A-Za-z0-9._-]*\//;

// ---- reading a file: text in any of its encodings, a known image or font, or refused ----
const ASSETS: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  jpg: (b) => b.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  jpeg: (b) => b.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  gif: (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1")),
  ico: (b) => b.subarray(0, 4).equals(Buffer.from("00000100", "hex")),
  icns: (b) => b.subarray(0, 4).toString("latin1") === "icns",
  webp: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  woff: (b) => b.subarray(0, 4).toString("latin1") === "wOFF",
  woff2: (b) => b.subarray(0, 4).toString("latin1") === "wOF2",
  ttf: (b) => b.subarray(0, 4).equals(Buffer.from("00010000", "hex")) || b.subarray(0, 4).toString("latin1") === "true",
  otf: (b) => b.subarray(0, 4).toString("latin1") === "OTTO",
};
const ARCHIVES: [string, (b: Buffer) => boolean][] = [
  ["gzip", (b) => b[0] === 0x1f && b[1] === 0x8b], ["zip", (b) => b.subarray(0, 2).toString("latin1") === "PK" && [3, 5, 7].includes(b[2]) && b[3] === b[2] + 1],
  ["bzip2", (b) => b.subarray(0, 3).toString("latin1") === "BZh"], ["xz", (b) => b.subarray(0, 6).equals(Buffer.from("fd377a585a00", "hex"))],
  ["7z", (b) => b.subarray(0, 6).equals(Buffer.from("377abcaf271c", "hex"))], ["zstd", (b) => b.subarray(0, 4).equals(Buffer.from("28b52ffd", "hex"))],
  ["tar", (b) => b.subarray(257, 262).toString("latin1") === "ustar"],
];
/** a file's words (pure): its text, decoded from UTF-8 or UTF-16 (with or without a byte order mark); `asset` for a known
 * image or font whose bytes are what its name says; else why the leak check cannot read it, and so refuses it */
export function readText(path: string, body: Buffer): { text: string } | { asset: string } | { why: string } {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? "";
  if (ext in ASSETS) return ASSETS[ext](body) ? { asset: ext } : { why: `a .${ext} whose bytes are not one, which the leak check cannot read` };
  const archive = ARCHIVES.find(([, is]) => is(body));
  if (archive) return { why: `a ${archive[0]} archive, which the leak check cannot read` };
  const utf16 = (be: boolean, from: number) => { const b = Buffer.from(body.subarray(from, from + ((body.length - from) & ~1))); if (be) b.swap16(); return { text: b.toString("utf16le") }; };
  if (body[0] === 0xff && body[1] === 0xfe) return utf16(false, 2);
  if (body[0] === 0xfe && body[1] === 0xff) return utf16(true, 2);
  if (!body.includes(0)) return { text: body.toString("utf8") };
  // UTF-16 with no byte order mark: one byte of each pair mostly zero, the other mostly not
  const pairs = Math.floor(body.length / 2);
  let evenZero = 0, oddZero = 0;
  for (let i = 0; i < pairs * 2; i += 2) { if (body[i] === 0) evenZero++; if (body[i + 1] === 0) oddZero++; }
  if (pairs >= 2 && oddZero / pairs > 0.3 && evenZero / pairs < 0.05) return utf16(false, 0);
  if (pairs >= 2 && evenZero / pairs > 0.3 && oddZero / pairs < 0.05) return utf16(true, 0);
  return { why: `a binary file, which the leak check cannot read (only known images and fonts ship: ${Object.keys(ASSETS).join(", ")})` };
}

/** the team's names (pure), from docs/people/<name>.md of the release: the file's name, its heading and its login */
export function teamNames(people: ExportFile[]): string[] {
  const out = new Set<string>();
  for (const f of people) {
    const m = /^docs\/people\/([^/]+)\.md$/.exec(f.path);
    if (!m) continue;
    out.add(m[1]);
    const text = f.body.toString("utf8");
    const login = /^login:\s*(\S+)/m.exec(text)?.[1], heading = /^#\s+(.+?)\s*$/m.exec(text)?.[1];
    if (login) out.add(login);
    if (heading) out.add(heading);
  }
  return [...out].filter((n) => n.length >= 3);
}

/** where marketing keeps the words it has not made public yet; a team file (docs/), so never exported itself (#1323) */
export const NOT_YET_PUBLIC = "docs/marketing/not-yet-public.txt";
/** the words kept back (pure), from NOT_YET_PUBLIC of the release: one word or phrase a line, a line starting with # a
 * note, three letters or more (a shorter one would stop the export on everyday code); none when the release has none */
export function notYetPublic(list?: ExportFile): string[] {
  if (!list) return [];
  return list.body.toString("utf8").split("\n").map((l) => l.trim()).filter((l) => l.length >= 3 && !l.startsWith("#"));
}

/** the fence's list, read the way the guard reads it: `const FENCE = [...]`, with or without a type */
export const FENCE_LIST = /const FENCE\b[^=\n]*=\s*\[([\s\S]*?)\]/;
export const fenceOf = (text: string) => [...(FENCE_LIST.exec(text)?.[1] ?? "").matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

/** the guard takes its sol-dev check from ./sol-dev.mjs (pure, read as text): a static import, or (#484) a dynamic one,
 * `await import("./sol-dev.mjs")`, inside a try whose catch refuses the call (a "deny"), so a broken import blocks
 * rather than lets through. What the guard then does is guardProbe's */
export function importsSolDev(text: string): boolean {
  if (/^\s*import\s+[^;]*?\bfrom\s+["']\.\/sol-dev\.mjs["']/m.test(text)) return true;
  const at = text.search(/\bawait\s+import\(\s*["'`]\.\/sol-dev\.mjs["'`]\s*\)/);
  if (at < 0) return false;
  const tryAt = text.lastIndexOf("try", at), after = text.slice(at);
  const catchAt = after.search(/\bcatch\b/);
  if (tryAt < 0 || catchAt < 0) return false;
  const handler = after.slice(catchAt, catchAt + 600);   // the catch's own block, near enough to read
  return /["']deny["']|\bdeny\s*\(|\brefuse\s*\(|\bfailClosed\s*\(|process\.exit\(\s*2\s*\)/.test(handler);   // failClosed: #484's
}

/** the harness's sol-dev check (pure, read as text): sol/harness/sol-dev.mjs with solDevIn and only BETA_RULES named
 * safe, imported by the guard; settings that wire it; a fence it can read. The guard's behaviour itself is guardProbe's */
function harnessLeak(files: ExportFile[]): string | null {
  const guard = files.find((f) => f.path === "sol/harness/guard"), check = files.find((f) => f.path === "sol/harness/sol-dev.mjs");
  if (!guard) return null;
  if (!check) return "sol/harness/sol-dev.mjs: missing, so the guard cannot tell sol-dev from a Sol tester's checkout (isSolDev, #479)";
  if (!files.some((f) => f.path === ".claude/settings.json")) return ".claude/settings.json: missing, so a Sol tester's sessions run without the guard";
  const text = check.body.toString("utf8");
  if (!/export function isSolDev\b/.test(text) || !/export function solDevIn\b/.test(text))
    return "sol/harness/sol-dev.mjs: no isSolDev or solDevIn, so the team's rules cannot be switched off outside sol-dev";
  const safe = /export const SAFE_RULES = new Set\(\[([^\]]*)\]\)/.exec(text);
  if (!safe) return "sol/harness/sol-dev.mjs: names no SAFE_RULES, so the sol-dev check cannot tell the team's rules from the safe ones";
  const team = [...safe[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((r) => !BETA_RULES.includes(r));
  if (team.length) return `sol/harness/sol-dev.mjs: a rule named safe that is not one a Sol tester gets (BETA_RULES in leak.ts): ${team.join(", ")}`;
  if (!importsSolDev(guard.body.toString("utf8")))
    return "sol/harness/guard: does not take its sol-dev check from ./sol-dev.mjs, so a Sol tester would be refused by the team's rules";
  const inventory = files.find((f) => f.path === "sol/engine/src/inventory.ts");
  if (inventory && !fenceOf(inventory.body.toString("utf8")).length)
    return "sol/engine/src/inventory.ts: no FENCE list the guard can read (const FENCE = [...]), so the fence is open for a Sol tester";
  return null;
}

/** the tools the guard must see before they run */
export const GUARDED_TOOLS = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"];
// the guard, with flags (#484's --stage), and an optional ` || exit 2` so a guard that crashes blocks the call (fail
// closed); nothing else, so `|| true`, `; curl …` or a comment never pass
const GUARD_COMMAND = /^node\s+"\$CLAUDE_PROJECT_DIR\/sol\/harness\/guard"(?:\s+--[a-z][a-z-]*)*(?:\s*\|\|\s*exit\s+2)?$/;
const GUARD_BEFORE_TOOLS = /^node\s+"\$CLAUDE_PROJECT_DIR\/sol\/harness\/guard"(?:\s*\|\|\s*exit\s+2)?$/;
type Hook = { matcher?: unknown; hooks?: unknown };
/** the hook commands the settings run before `tool` (pure) */
export function guardCommands(settings: unknown, tool: string): string[] {
  const entries = (settings as { hooks?: { PreToolUse?: unknown } })?.hooks?.PreToolUse;
  if (!Array.isArray(entries)) return [];
  return entries.filter((e: Hook) => {
    const m = typeof e?.matcher === "string" ? e.matcher : "";
    if (!m || m === "*") return true;
    try { return new RegExp(`^(?:${m})$`).test(tool); } catch { return false; }
  }).flatMap((e: Hook) => Array.isArray(e?.hooks) ? e.hooks : [])
    .filter((h: { type?: unknown; command?: unknown }) => h?.type === "command" && typeof h.command === "string").map((h: { command: string }) => h.command);
}
/** .claude/settings.json in the export (pure): it runs the guard before every tool that changes something, and nothing
 * else (no permissions, env, plugins, no hook that is not the guard) */
function settingsLeak(body: Buffer): string | null {
  let s: unknown;
  try { s = JSON.parse(body.toString("utf8")); } catch { return "not JSON"; }
  if (!s || typeof s !== "object" || Array.isArray(s)) return "not a settings object";
  const keys = Object.keys(s).filter((k) => k !== "hooks");
  if (keys.length) return `project settings a Sol tester would run under: ${keys.join(", ")}`;
  const all = JSON.stringify((s as { hooks?: unknown }).hooks ?? {}).match(/"command":"((?:[^"\\]|\\.)*)"/g) ?? [];
  const other = all.map((c) => JSON.parse(c.slice(10))).find((c: string) => !GUARD_COMMAND.test(c.trim()));
  if (other !== undefined) return `a hook that is not the guard: ${other}`;
  for (const tool of GUARDED_TOOLS)
    if (!guardCommands(s, tool).some((c) => GUARD_BEFORE_TOOLS.test(c.trim())))
      return `the guard is not run before ${tool} (hooks.PreToolUse, a matcher for ${tool}, node "$CLAUDE_PROJECT_DIR/sol/harness/guard"), so a Sol tester's ${tool} goes unguarded`;
  return null;
}

/** every team file, team rule, team word or word kept back in an export tree (pure), each as "path[:line]: what".
 * `names` are the team's (teamNames of the release's docs/people), `kept` the words marketing has not made public yet
 * (notYetPublic of the release's NOT_YET_PUBLIC). The guard's behaviour is checked apart, by guardProbe */
export function leaksIn(files: ExportFile[], names: string[] = [], kept: string[] = []): string[] {
  const out: string[] = [];
  const keptWord = nameWord(kept);   // a whole word or phrase, any case, any space between its words
  for (const { path, body } of files) {
    if (isTeamFile(path)) { out.push(`${path}: a team file`); continue; }
    if (path.startsWith("sol/home/")) {
      if (!(path in NEUTRAL_HOME)) { out.push(`${path}: not the neutral home (a Sol tester's sol/home holds only ${Object.keys(NEUTRAL_HOME).join(", ")})`); continue; }
      if (body.toString("utf8") !== NEUTRAL_HOME[path]) { out.push(`${path}: not the neutral home's text`); continue; }
    }
    if (path === ".claude/settings.json") { const why = settingsLeak(body); if (why) out.push(`${path}: ${why}`); }
    const read = readText(path, body);
    if ("why" in read) { out.push(`${path}: ${read.why}`); continue; }
    if ("asset" in read) continue;
    const text = allowedOut(path, read.text);
    const lineOf = (at: number) => text.slice(0, at).split("\n").length;
    const home = HOME_PATH.exec(text);
    if (home) out.push(`${path}:${lineOf(home.index)}: a person's home folder, ${home[0]}`);
    // the whole text, before any allowance: in code, an EXEMPT file and an ALLOWED line alike (a comment ships too)
    const held = keptWord?.exec(read.text);
    if (held) out.push(`${path}:${read.text.slice(0, held.index).split("\n").length}: a word marketing has not made public, "${held[0].replace(/\s+/g, " ")}"`);
    if (CODE.test(path) && CODE_EXT.test(path)) continue;   // code: its words are code (above)
    // an EXEMPT file: only its comment lines (the rest blanked, so a word never joins across code)
    const words = path in EXEMPT ? exemptWords(path, text) : text;
    const hit = firstWord(words, names);
    if (hit) out.push(`${path}:${words.slice(0, hit.at).split("\n").length}: a team word, "${hit.word.replace(/\s+/g, " ")}"`);
  }
  const harness = harnessLeak(files);
  return harness ? [...out, harness] : out;
}
/** the first of leaksIn (pure), or null */
export const leakIn = (files: ExportFile[], names: string[] = [], kept: string[] = []): string | null => leaksIn(files, names, kept)[0] ?? null;

/** the neutral name every export commit carries, and the only message it may have */
export const EXPORT_IDENT = { name: "Sol release runner", email: "release@sol.invalid" };
/** an export commit as git stores it (pure, `git cat-file commit`): its author and committer are EXPORT_IDENT, its
 * message is `Sol <tag>` alone, nothing else is in it (no signature, no other header); null when it holds */
export function commitLeak(raw: string): string | null {
  const [head, ...rest] = raw.split("\n\n"), message = rest.join("\n\n");
  const who = `${EXPORT_IDENT.name} <${EXPORT_IDENT.email}>`;
  for (const line of head.split("\n")) {
    const [key] = line.split(" ");
    if (key === "tree" || key === "parent") continue;
    if (key === "author" || key === "committer") {
      if (!line.startsWith(`${key} ${who} `) || !/ \d+ \+0000$/.test(line)) return `the export commit's ${key} is not the neutral one (${line.slice(key.length + 1).replace(/ \d+ [+-]\d{4}$/, "")})`;
      continue;
    }
    return `the export commit carries ${key || "an unknown header"}, which a Sol tester would read`;
  }
  if (!/^Sol (?:stable|dev)-[0-9A-Za-z.-]+\n?$/.test(message)) return `the export commit's message is not "Sol <tag>": ${JSON.stringify(message.slice(0, 60))}`;
  return null;
}

// ---- the guard, run for real outside sol-dev (guardProbe) ----
type Probe = { command?: string; write?: string; files?: Record<string, string>; insideSol?: boolean };
// What a tester's agent might do that only the team's rules refuse: each must go through outside sol-dev.
const TEAM_PROBES: [string, string][] = [
  ["git merge feature", "merge"], ["git switch -c my-idea", "a branch without Take"], ["git commit -m x", "a commit on main"],
  ["gh pr create --title x --body y", "a PR without a test note"], ["gh pr ready 3", "a hand-in"],
  ["git push origin HEAD:stable", "moving stable"], ["gh api -X PUT repos/o/r/contents/x -f message=m", "a write to main by API"],
  ["gh pr edit 3 --add-label sent-back:slight", "a send back"], ["curl -s localhost:7777/tonight", "a night's press"],
];
// a key's shape, in pieces: this file goes out in the export, and the guard reads commits for whole ones
const KEY = ["sk", "ant", "a1B2c3D4e5F6g7H8i9J0k1L2"].join("-");
// What protects any Sol user: each must still be refused outside sol-dev, by a rule in BETA_RULES, in neutral words.
const SAFE_PROBES: [string, Probe][] = [
  ["open -a Sol", { command: "open -a Sol" }], ["killall Sol", { command: "killall Sol" }],
  ["installing Sol.app", { command: "ditto /tmp/Sol.app /Applications/Sol.app" }], ["the face-hot flag", { command: "touch ~/sol-face-hot" }],
  ["restarting the engine", { command: "launchctl kickstart -k gui/501/sol-engine" }], ["moving where Sol lives", { command: "bash sol/mine/live" }],
  ["committing home data", { command: "git add -A && git commit -m x", files: { "sol/home/memory/me.md": "a fact\n" } }],
  ["committing a key file", { command: "git add -A && git commit -m x", files: { "sol/engine/.env": "K=1\n" } }],
  ["committing a key", { command: "git add -A && git commit -m x", files: { "notes.txt": `token ${KEY}\n` } }],
  ["editing the fence from inside Sol", { write: "fence", insideSol: true }],
];
const probed = new Map<string, Promise<string | null>>();

/** one hook command of the exported settings on one call, the way Claude Code runs it (sh, CLAUDE_PROJECT_DIR), in a
 * child process (the engine's loop never waits on it): the refusal's rule and words, or what went wrong */
function hookOn(command: string, repo: string, env: NodeJS.ProcessEnv, input: object): Promise<{ rule: string; why: string } | string> {
  return new Promise((ok) => {
    const p = spawn("/bin/sh", ["-c", command], { cwd: repo, env: { ...env, CLAUDE_PROJECT_DIR: repo }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 15_000);
    p.stdout.on("data", (b) => { out += b; });
    p.stderr.on("data", (b) => { err += b; });
    p.on("error", (e) => { clearTimeout(timer); ok(`the guard does not start: ${e.message}`); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return ok(`the guard fails on ${JSON.stringify((input as { tool_input?: unknown }).tool_input)}: ${(err.trim() || `exit ${code}`).split("\n")[0]}`);
      if (!out.includes('"deny"')) return ok({ rule: "", why: "" });
      let why = "";
      try { why = String(JSON.parse(out)?.hookSpecificOutput?.permissionDecisionReason ?? ""); } catch { return ok(`the guard says what is not JSON: ${out.slice(0, 80)}`); }
      ok({ rule: /^harness \(([a-z-]+)\)/.exec(why)?.[1] ?? "?", why });
    });
    p.stdin.end(JSON.stringify(input));
  });
}
const git = (cwd: string, env: NodeJS.ProcessEnv, ...a: string[]) => new Promise<void>((ok, no) => execFile("git", a, { cwd, env }, (e) => e ? no(e) : ok()));

/** the harness of an export (its sol/harness files) run for real in scratch checkouts whose remote is the beta repo,
 * and with no remote: the team's rules must let everything through, the safe ones must still refuse (the window, home
 * data, keys, the fence), and what they say must hold no team word; then once as sol-dev, where a merge must be
 * refused (so the switch is the remotes, not a guard that refuses nothing). Null when it holds, else what is wrong.
 * Writes only to a temp folder; no network (gh is a stub that fails); each guard call is its own process, so the
 * engine is never blocked; the same harness is run once per process */
export function guardProbe(files: ExportFile[], names: string[] = []): Promise<string | null> {
  const harness = files.filter((f) => f.path.startsWith("sol/harness/") || f.path === ".claude/settings.json" || f.path === "sol/engine/src/inventory.ts");
  if (!harness.some((f) => f.path === "sol/harness/guard")) return Promise.resolve(null);
  const key = createHash("sha1").update(JSON.stringify(names)).update(Buffer.concat(harness.flatMap((f) => [Buffer.from(f.path + "\0"), f.body]))).digest("hex");
  if (!probed.has(key)) probed.set(key, probe(harness, names));
  return probed.get(key)!;
}

async function probe(harness: ExportFile[], names: string[]): Promise<string | null> {
  const settingsFile = harness.find((f) => f.path === ".claude/settings.json"), inventory = harness.find((f) => f.path === "sol/engine/src/inventory.ts");
  if (!settingsFile) return ".claude/settings.json: missing, so a Sol tester's sessions run without the guard";
  let settings: unknown;
  try { settings = JSON.parse(settingsFile.body.toString("utf8")); } catch { return ".claude/settings.json: not JSON"; }
  const fenced = inventory ? fenceOf(inventory.body.toString("utf8"))[0] : undefined;
  if (inventory && !fenced) return "sol/engine/src/inventory.ts: no FENCE list the guard can read, so the fence is open for a Sol tester";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-")));
  try {
    // a checkout where a person's would be (~/Sol), a session id like any other: nothing says this is a probe
    const home = join(dir, "home", `u${randomBytes(3).toString("hex")}`), session = randomUUID();
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(join(home, ".local", "bin", "gh"), "#!/bin/sh\nexit 1\n"); chmodSync(join(home, ".local", "bin", "gh"), 0o755);
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: `${join(home, ".local", "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`, GH_TOKEN: "", GITHUB_TOKEN: "",
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", CLAUDE_CODE_ENTRYPOINT: "", CLAUDE_CODE_EXECPATH: "" };
    let n = 0;
    const checkout = async (origin: string | null, extra: Record<string, string> = {}) => {
      const repo = join(home, n++ ? `Sol-${n}` : "Sol");
      const put = (path: string, body: Buffer | string) => { mkdirSync(join(repo, dirname(path)), { recursive: true }); writeFileSync(join(repo, path), body); };
      for (const f of harness) put(f.path, f.body);
      await git(repo, env, "init", "-q", "-b", "main"); await git(repo, env, "config", "sol.login", "a-sol-tester");
      if (origin) await git(repo, env, "remote", "add", "origin", origin);
      for (const [path, body] of Object.entries(extra)) put(path, body);
      return (p: Probe) => {
        const e = p.insideSol ? { ...env, CLAUDE_CODE_ENTRYPOINT: "sdk-ts", CLAUDE_CODE_EXECPATH: join(repo, "sol/engine/node_modules/@anthropic-ai/claude-agent-sdk/cli.js") } : env;
        const tool = p.write ? "Write" : "Bash";
        const input = { session_id: session, transcript_path: join(home, ".claude", "projects", "-Sol", `${session}.jsonl`), cwd: repo,
          hook_event_name: "PreToolUse", tool_name: tool, tool_input: p.write ? { file_path: join(repo, "sol/mac/src", fenced ?? "App.tsx"), content: "x" } : { command: p.command } };
        // every hook the exported settings run before this tool, in turn, as Claude Code would: the first refusal counts
        const commands = guardCommands(settings, tool);
        if (!commands.length) return Promise.resolve(`.claude/settings.json runs no guard before ${tool}, so a Sol tester's ${tool} goes unguarded`);
        return commands.reduce<Promise<{ rule: string; why: string } | string>>((was, c) => was.then((r) => typeof r === "string" || r.rule ? r : hookOn(c, repo, e, input)), Promise.resolve({ rule: "", why: "" }));
      };
    };
    for (const origin of ["https://github.com/sol-mif/sol-beta.git", null]) {
      const where = origin ? "a Sol tester's checkout" : "a checkout with no remote";
      const run = await checkout(origin);
      // every team probe in one call (the guard reads each line), and one by one only to name the one refused
      const all = await run({ command: TEAM_PROBES.map(([c]) => c).join("\n") });
      if (typeof all === "string") return all;
      if (all.rule) {
        for (const [command, what] of TEAM_PROBES) {
          const r = await run({ command });
          if (typeof r === "string") return r;
          if (r.rule) return `in ${where} the guard refuses ${what} (${command}), a team rule (${r.rule})`;
        }
        return `in ${where} the guard refuses the team's probes together (${all.rule}), a team rule`;
      }
      for (const [what, p] of SAFE_PROBES) {
        if (p.write === "fence" && !inventory) continue;   // no face in this export, so no fence to edit
        const r = await (p.files ? await checkout(origin, p.files) : run)(p);
        if (typeof r === "string") return r;
        if (!r.rule) return `in ${where} the guard no longer refuses ${what} (${p.command ?? "a Write"}), which protects any Sol user`;
        if (!BETA_RULES.includes(r.rule)) return `in ${where} ${what} is refused by ${r.rule}, a rule not in BETA_RULES`;
        const hit = teamWord(r.why, names);
        if (hit) return `in ${where} the guard's refusal of ${what} says a team word, "${hit}"`;
      }
    }
    const dev = await (await checkout("https://github.com/sol-mif/sol-dev.git"))({ command: "git merge feature" });
    if (typeof dev === "string") return dev;
    if (!dev.rule) return "in a sol-dev checkout the guard refuses no merge: its rules are not switched by the remotes (solDevIn)";
    return null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// `npx tsx src/team/leak.ts --check [sha]` (ci.yml, job leak): the export of sha (default HEAD) built and checked, nothing
// written; exit 1 with the first offence named
const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url)) && process.argv[2] === "--check") {
  const sha = process.argv[3] || "HEAD";
  // not awaited at the top: ship.ts imports this module, which must finish loading first
  import("./ship.js").then(({ exportCheck }) => exportCheck(process.cwd(), sha)).then(
    ({ files, left }) => console.log(`leak check: the export of ${sha} (${files} files) holds no team file, team rule or team word, nor a word marketing keeps back`
      + (left.length ? `; left out as the team's: ${left.join(", ")}` : "")),
    (e) => { console.error(`leak check: ${(e as Error).message}`); process.exit(1); });
}
