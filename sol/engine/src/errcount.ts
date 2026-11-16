// Error counts per feature (#485, dev cycle step 6, decision 20): when something in the engine fails, one more count,
// never what failed. Counts only, three things and where it was caught:
//   file   the engine's own source file the error came from: the first frame of its stack inside sol/engine (dist/ is
//          read as the src/ file it was built from), as a word with ":" for "/", e.g. "src:team:pages.ts". Never a
//          frame outside the engine's folder (node's own, a package, a path in the person's home), never a file that is not
//          in Sol's own source as the release has it (a file the person added on their own branch is "other"), never a
//          frame read from inside the message (the head of the stack is cut off first), never a line number
//   type   the kind of error: node's code when it has one (ENOENT, ECONNREFUSED), else its class when it is one of
//          JavaScript's, node's or Sol's own (TypeError, AbortError, Held), else "Error"
//   kind   where it was caught: uncaught, turn, work, team, desk, browser
//   msg    the request that failed, when it is one (team.page.write): a word of the wire's, never its fields
// The Sol version rides on every event already (track.ts `sol`). Never the error's message, its stack, a path or a word
// a person wrote: the message is where content would be, so it is never read.
// It is one more event of track.ts, `error.count`, so it is written, kept, sent and checked as every count is: the
// person's usage switch (settings.track.usage) turns it off with the rest, and a value that is not small and plain drops
// it. Which feature a file belongs to is not known on a Sol tester's Mac (the feature map, specs/features.json, is a team
// file and never reaches sol-beta): the live block in Cowork (team/live.ts) maps each file to its feature when a Sol
// developer reads the counts, with the map of that day.
// Who is counted: Sol testers (their checkout follows sol-beta) and Sol developers (sol-dev). Sol users (any other
// origin) wait for personalization's privacy part, so it is off for them, whatever the setting says. Said to Sol testers
// in one line at install (sol/install) and on the first window's card ("what broke").
import { constants as osConstants } from "node:os";
import { track, type Props } from "./track.js";

export type Audience = "developer" | "tester" | "user";
export type Kind = "uncaught" | "turn" | "work" | "team" | "desk" | "browser";

// the team's own repositories, by owner and name: a fork of either (another owner) is a Sol user's
export const DEV_REPOS = new Set(["sol-mif/sol-dev", "marcocyl04-ux/sol-dev", "marcocyl04-ux/ecosystem"]);   // ecosystem: sol-dev's old name, which old checkouts still say
export const BETA_REPOS = new Set(["marcocyl04-ux/sol-beta", "sol-mif/sol-beta"]);
/** a remote's owner/name (pure): https://github.com/o/n(.git), git@github.com:o/n(.git), ssh://git@github.com/o/n; "" for anything else */
export function repoOf(url: string): string {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : "";
}
/** who this Sol's person is to the team, from where its checkout comes from (pure): the team's sol-dev a Sol developer,
 *  its sol-beta a Sol tester, anything else (a fork, another repository, none, not read yet) a Sol user */
export function audienceOf(origin: string): Audience {
  const r = repoOf(origin);
  return DEV_REPOS.has(r) ? "developer" : BETA_REPOS.has(r) ? "tester" : "user";
}
/** are errors counted for this audience (pure)? Sol testers and Sol developers; Sol users wait (decision 20) */
export const countsErrors = (a: Audience) => a === "tester" || a === "developer";

const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const TYPE = /^[a-z]+(\.[a-z]+)*$/;
// node's error codes a count may say: the system's (ENOENT, ECONNREFUSED: os.constants.errno) and node's and undici's
// own that Sol meets; any other code (one a person's code or data made up) is dropped and the class is said instead
const CODES = new Set([...Object.keys(osConstants.errno), "ABORT_ERR", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_ARG_VALUE", "ERR_INVALID_URL",
  "ERR_INVALID_STATE", "ERR_OUT_OF_RANGE", "ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED", "ERR_STREAM_WRITE_AFTER_END",
  "ERR_SOCKET_CLOSED", "ERR_HTTP_HEADERS_SENT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", "ERR_STRING_TOO_LONG", "ERR_SYSTEM_ERROR",
  "ERR_UNHANDLED_REJECTION", "ERR_MODULE_NOT_FOUND", "ERR_SQLITE_ERROR", "ERR_USE_AFTER_CLOSE", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_ABORTED"]);

// the types an error.count may say: JavaScript's and node's own, and Sol's own error classes; any other name (a class a
// person's own code made, a name built from data) is "Error"
export const TYPES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError",
  "AbortError", "TimeoutError", "SystemError", "DOMException", "Held", "CalledOff"]);
/** the kind of error (pure): node's code (ENOENT), else its class when it is one of TYPES, else "Error"; a thing thrown
 *  that is no error is "thrown" (its value is never looked at) */
export function typeOf(e: unknown): string {
  if (!e || typeof e !== "object") return "thrown";
  if (!(e instanceof Error)) return "thrown";   // only an error's own name or code: any other object's is data
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && CODES.has(code)) return code;
  if (TYPES.has(e.name)) return e.name;
  const ctor = e.constructor?.name;
  return typeof ctor === "string" && TYPES.has(ctor) ? ctor : "Error";
}

/** the head node puts before an error's frames, `${name}: ${message}` (or the name alone): the frames start after it */
export const headOf = (e: Error) => { const m = typeof e.message === "string" ? e.message : ""; return m ? `${e.name}: ${m}` : String(e.name); };
const FRAME = /^ {4}at (?:[^\n]*?\()?((?:file:\/\/)?\/[^()\s]+?):\d+(?::\d+)?\)?$/;
/** the engine's own source file a stack came from (pure): its head (the name and message, which may run over many lines
 *  and hold anything) cut off first, then the first frame under `engine` (the engine's folder) that is not a package,
 *  dist/x.js read as src/x.ts, and only a file in `shipped` (Sol's own source as the release has it, never a file of
 *  the person's own); as a word with ":" for "/". "" when the head is not the stack's start, or no frame qualifies */
export function fileOf(stack: unknown, engine: string, head: string, shipped: ReadonlySet<string> | null): string {
  if (typeof stack !== "string" || !engine || !head || !shipped?.size) return "";
  if (!stack.startsWith(head)) return "";   // a stack someone wrote: its frames cannot be told from its message
  const root = engine.replace(/\/+$/, "") + "/";
  for (const line of stack.slice(head.length).split("\n").slice(1, 40)) {
    // "    at f (/x/sol/engine/dist/team/pages.js:12:3)", "    at /x/...:1:2", "    at file:///x/...:1:2"
    const m = FRAME.exec(line);
    if (!m) continue;
    let p = m[1];
    if (p.startsWith("file://")) { try { p = decodeURIComponent(p.slice(7)); } catch { continue; } }
    if (!p.startsWith(root)) continue;
    let rel = p.slice(root.length);
    if (rel.split("/").some((x) => x === "" || x === "." || x === "..")) continue;
    if (rel.startsWith("node_modules/") || rel.includes("/node_modules/")) continue;
    if (rel.startsWith("dist/")) rel = `src/${rel.slice(5)}`.replace(/\.js$/, ".ts");
    if (!rel.startsWith("src/") || !shipped.has(rel)) continue;
    const word = rel.replace(/\//g, ":");
    return WORD.test(word) ? word : "";
  }
  return "";
}
/** a file word as the cloud and the live block keep it (pure): a word whose parts are none of "", ".", ".." */
export const isFileWord = (w: string) => WORD.test(w) && !w.split(":").some((x) => x === "" || x === "." || x === "..");

/** the count's props (pure): file, type, kind and the request's type; a file that is not Sol's own shipped source is "other" */
export function propsOf(e: unknown, kind: Kind, engine: string, msg?: unknown, shipped: ReadonlySet<string> | null = null): Props {
  const file = e instanceof Error ? fileOf(e.stack, engine, headOf(e), shipped) : "";
  const p: Props = { file: file || "other", type: typeOf(e), kind };
  if (typeof msg === "string" && msg.length <= 32 && TYPE.test(msg)) p.msg = msg;
  return p;
}

let ENGINE = "";
let audience: () => Audience = () => "user";
let shippedNow: () => ReadonlySet<string> | null = () => null;
/** where the engine's own source is (its folder, sol/engine), who this Sol's person is, and Sol's own source files as
 *  the release has them (src/..., from git: never a file the person added); until then nothing is counted, and with no
 *  list every file is "other" */
export function setErrorCount(engine: string, who: () => Audience, shipped: () => ReadonlySet<string> | null = () => null) { ENGINE = engine; audience = who; shippedNow = shipped; }
/** the engine's source files a release holds (pure over `git ls-tree -r --name-only <ref> -- src` run in sol/engine) */
export const shippedOf = (lsTree: string): Set<string> => new Set(lsTree.split("\n").map((l) => l.trim()).filter((l) => /^src\/[A-Za-z0-9_./-]+\.(ts|js|mjs)$/.test(l)));

/** one more error count, never a word of the error; nothing for a Sol user or before setErrorCount. Never throws */
export function countError(e: unknown, kind: Kind, msg?: unknown): void {
  try {
    if (!ENGINE || !countsErrors(audience())) return;
    track("error.count", propsOf(e, kind, ENGINE, msg, shippedNow()), { mode: typeof msg === "string" ? (msg.startsWith("work.") ? "work" : msg.startsWith("team.") ? "cowork" : "home") : "home" });
  } catch { /* a count that cannot be made is a count lost, never the engine's problem */ }
}
