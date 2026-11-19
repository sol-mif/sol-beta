// Three small checks on the repository's own Markdown (step 0e of the v2 backend plan):
//   links     every relative link points at a file that is in the repository, and a "#heading" on it at a heading of
//             that file. A web link (https:, mailto:, anything with a scheme) is skipped and never fetched: nothing
//             here can reach a network;
//   sections  a file of a known type has its required sections. One type for now, the decision record: the question,
//             the options, what was considered and not chosen, what was decided;
//   length    a file of a known type stays within its word limit. One limit for now: an upgrade guide for a breaking
//             change, 500 words.
// Which file is which type is said by its path, in one table (DOC_TYPES). What is in a code block, an HTML comment or
// the front matter is not the page: no link, no section and no word is read there; a link inside inline code is none.
//
//   node sol/engine/src/team/docs-check.ts                        every Markdown file of the checkout
//   node sol/engine/src/team/docs-check.ts <file> ...             these files
//   node sol/engine/src/team/docs-check.ts --type decision <file> a file as a type its path does not say
//   --root <dir>   read paths from this folder, not from the checkout's top
// Exit 1 when something is to fix, each on its own line as "docs: <file>:<line>: <what>"; 2 when it cannot read what it
// was asked to. In GitHub Actions each line is also an annotation. No workflow runs it yet.
// Pure but for the disk reader and the run at the end; no imports but node's own, so plain node runs it without the
// engine's packages (as belongs.ts).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROSE = /\.(md|markdown)$/i;

/** a type of document the checks know: the paths that are one, the sections it must have, its word limit */
export type DocType = { name: string; paths: RegExp[]; sections?: string[]; words?: number };
/** the one table of types. A decision record is the issue template and, once the team keeps records in the repository,
 *  a page of docs/decisions (the folder is not made yet; its README is not a record). An upgrade guide is a page whose
 *  name starts with "upgrade" or "upgrading", in any folder */
export const DOC_TYPES: DocType[] = [
  {
    name: "decision",
    paths: [/^\.github\/ISSUE_TEMPLATE\/decision\.md$/, /^docs\/decisions\/(?!README\.md$)[^/]+\.md$/],
    sections: ["The question", "The options", "Considered and not chosen", "Decided"],
  },
  { name: "upgrade-guide", paths: [/(^|\/)upgrad(e|ing)[^/]*\.md$/i], words: 500 },
];
/** the type a path says (pure), or null: an ordinary page, checked for its links only */
export const typeOf = (file: string): DocType | null => DOC_TYPES.find((t) => t.paths.some((re) => re.test(file))) ?? null;

export type Miss = { check: "links" | "sections" | "length"; file: string; line?: number; what: string };
/** what the checks may ask of the repository: is this path in it, and what does this file say. Paths are from the root,
 *  with "/"; the root itself is "". There is no way to ask for anything outside it */
export type Tree = { has(path: string): boolean; read(path: string): string | null };

/** a Markdown text line by line with what is not the page blanked (pure): the front matter, code blocks and HTML
 *  comments. Line numbers hold, and a "\r\n" line end is read as "\n". Inline code stays (a heading may hold some), and
 *  a "<!--" inside it opens nothing */
export function lines(text: string): string[] {
  const all = text.split(/\r?\n/);
  const head = all[0]?.trimEnd() === "---" ? all.findIndex((l, i) => i > 0 && l.trimEnd() === "---") : -1;
  let fence: string | null = null, comment = false;
  return all.map((line, i) => {
    if (i <= head) return "";
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return ""; }
    if (comment) { const e = line.indexOf("-->"); if (e < 0) return ""; comment = false; line = " ".repeat(e + 3) + line.slice(e + 3); }
    if (f) { fence = f[1]; return ""; }
    for (;;) {
      const code = masked(line), at = code.indexOf("<!--"), end = at < 0 ? -1 : code.indexOf("-->", at + 4);
      if (at < 0) return line;
      if (end < 0) { comment = true; return line.slice(0, at); }
      line = line.slice(0, at) + " ".repeat(end + 3 - at) + line.slice(end + 3);
    }
  });
}
/** a line with its inline code blanked, every other letter where it was */
const masked = (line: string) => line.replace(/(`+)[^`]*?\1/g, (m) => " ".repeat(m.length));
/** the "]" at this place closes a "[" earlier on the line (pure): "](x)" with no text opened before it is not a link
 *  (its "[" was inside code) */
function opened(line: string, close: number): boolean {
  for (let i = close - 1, depth = 1; i >= 0; i--) {
    if (line[i] === "]") depth++;
    else if (line[i] === "[" && --depth === 0) return true;
  }
  return false;
}

/** every link of a Markdown text and the line it is on (pure): [text](to), ![image](to), <angles> and "titles" taken
 *  off, and a reference's "[name]: to". Not a footnote, not what is in code */
export function linksOf(text: string): { to: string; line: number }[] {
  const out: { to: string; line: number }[] = [];
  lines(text).forEach((raw, i) => {
    const line = masked(raw);
    const ref = /^\s{0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(line);
    if (ref) { out.push({ to: ref[1].replace(/^<|>$/g, ""), line: i + 1 }); return; }
    // the address after "](": in angles, or up to a space or the closing bracket, one pair of brackets inside allowed
    for (const m of line.matchAll(/\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
      if (opened(line, m.index)) out.push({ to: m[1].replace(/^<|>$/g, ""), line: i + 1 });
    }
  });
  return out;
}

/** a heading as plain words (pure): a link is its text, code and emphasis lose their marks, tags go. Spaces fold into
 *  one unless `spaces` keeps them (an anchor has a "-" for each) */
function plain(heading: string, spaces = false): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(`+)([^`]*?)\1/g, "$2")
    .replace(/(\*\*|\*|~~)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}])(__|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu, "$2")
    .replace(spaces ? /[\t\n]/g : /\s+/g, " ").trim();
}
/** the headings of a Markdown text (pure), "# one" and the underlined ones, each with its line and as written */
export function headingsOf(text: string): { text: string; line: number; raw: string }[] {
  const out: { text: string; line: number; raw: string }[] = [], ls = lines(text);
  ls.forEach((line, i) => {
    const atx = /^\s{0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (atx) { if (atx[1]) out.push({ text: plain(atx[1]), line: i + 1, raw: atx[1] }); return; }
    const above = i > 0 ? ls[i - 1] : "";
    if (/^\s{0,3}(=+|-{2,})\s*$/.test(line) && above.trim() && !/^\s{0,3}(#{1,6}\s|[-*+>|]|\d+[.)]\s|=+\s*$|-+\s*$)/.test(above)) out.push({ text: plain(above), line: i, raw: above });
  });
  return out;
}
/** the anchor GitHub gives a heading (pure): lower case, letters, digits, "-" and "_" kept, each space a "-" */
export const slug = (heading: string): string => plain(heading, true).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "").replace(/ /g, "-");
/** every anchor a link may point at in a Markdown text (pure): its headings' (the second of a name is "name-1"), and
 *  the ids written by hand in a tag */
export function anchorsOf(text: string): Set<string> {
  const out = new Set<string>(), seen = new Map<string, number>();
  for (const h of headingsOf(text)) {
    const s = slug(h.raw), n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    out.add(n ? `${s}-${n}` : s);
  }
  for (const m of lines(text).join("\n").matchAll(/<[a-z][^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)) out.add(m[1].toLowerCase());
  return out;
}

const decoded = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** a link's path as a path from the root (pure): from the linking file's folder, or from the root when it starts with
 *  "/". null when it climbs out of the repository */
function fromRoot(dir: string, path: string): string | null {
  const parts = path.startsWith("/") ? [] : dir.split("/").filter(Boolean);
  for (const p of path.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(p);
  }
  return parts.join("/");
}

/** links (pure): each relative link of this file that points at nothing. A web link is not looked at; a "#heading" is
 *  checked only on a Markdown file ("#L12" on code is a line) */
export function checkLinks(file: string, text: string, tree: Tree): Miss[] {
  const out: Miss[] = [], dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const anchors = new Map<string, Set<string> | null>();
  const anchorsIn = (path: string) => {
    if (!anchors.has(path)) { const body = path === file ? text : tree.read(path); anchors.set(path, body === null ? null : anchorsOf(body)); }
    return anchors.get(path)!;
  };
  for (const l of linksOf(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.to) || l.to.startsWith("//")) continue;   // the web, a mail address: never fetched
    const hash = l.to.indexOf("#");
    const path = decoded((hash < 0 ? l.to : l.to.slice(0, hash)).replace(/\?.*$/, "")), anchor = hash < 0 ? "" : decoded(l.to.slice(hash + 1));
    let target = file;
    if (path) {
      const at = fromRoot(dir, path);
      if (at === null) { out.push({ check: "links", file, line: l.line, what: `the link "${l.to}" points outside the repository` }); continue; }
      if (!tree.has(at)) { out.push({ check: "links", file, line: l.line, what: `the link "${l.to}" points at ${at}, which is not in the repository` }); continue; }
      target = at;
    }
    if (!anchor || !PROSE.test(target)) continue;
    const there = anchorsIn(target);
    if (there && !there.has(anchor.toLowerCase())) out.push({ check: "links", file, line: l.line, what: `the link "${l.to}" points at #${anchor}, and ${target === file ? "this page" : target} has no such heading` });
  }
  return out;
}

/** the sections a page opens (pure), in lower case: its headings, and the lines that start in bold, the way an issue
 *  template writes them ("**The question** (one sentence)") */
export function sectionsOf(text: string): string[] {
  const out = headingsOf(text).map((h) => h.text.toLowerCase());
  for (const line of lines(text)) {
    const bold = /^\s{0,3}\*\*(.+?)\*\*/.exec(line);
    if (bold) out.push(plain(bold[1]).toLowerCase());
  }
  return out;
}
/** sections (pure): each required section of the type that the page does not open. A section may say more after its
 *  name ("The options (three)", "Decided: 2026-11-10") */
export function checkSections(file: string, text: string, type: DocType): Miss[] {
  const have = sectionsOf(text);
  const opens = (name: string) => have.some((s) => s.startsWith(name) && !/[\p{L}\p{N}]/u.test(s.charAt(name.length)));
  return (type.sections ?? []).filter((s) => !opens(s.toLowerCase()))
    .map((s) => ({ check: "sections" as const, file, what: `no section "${s}": a ${type.name} has ${type.sections!.map((x) => `"${x}"`).join(", ")}` }));
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
/** the words of a page (pure): what holds a letter or a digit, between spaces. The front matter, code blocks, comments
 *  and a link's address are not the page; a character of Chinese, Japanese or Korean is a word each */
export function wordCount(text: string): number {
  const body = lines(text).join("\n").replace(/\]\([^)]*\)/g, "] ");
  const wide = body.match(CJK)?.length ?? 0;
  return wide + body.replace(CJK, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
/** length (pure): the page is over its type's word limit */
export function checkLength(file: string, text: string, type: DocType): Miss[] {
  if (type.words === undefined) return [];
  const n = wordCount(text);
  return n > type.words ? [{ check: "length", file, what: `${n} words: a ${type.name} is ${type.words} at most` }] : [];
}

/** the three checks on one page (pure): its links, and the sections and limit of its type (the path's, or one given) */
export function checkDoc(file: string, text: string, tree: Tree, type: DocType | null = typeOf(file)): Miss[] {
  return [...checkLinks(file, text, tree), ...(type ? [...checkSections(file, text, type), ...checkLength(file, text, type)] : [])];
}
/** one miss as a line a person reads */
export const say = (m: Miss) => `${m.file}${m.line ? `:${m.line}` : ""}: ${m.what}`;

/** the files of a folder as a Tree (impure: reads the disk), each name in its own letter case: a Mac's disk cannot
 *  tell B.md from b.md, GitHub can. With `files` (git's list), only those are in the repository */
export function treeOf(root: string, files?: string[]): Tree {
  const dirs = new Map<string, Set<string> | null>();
  const names = (dir: string) => {
    if (!dirs.has(dir)) { try { dirs.set(dir, new Set(readdirSync(resolve(root, dir)))); } catch { dirs.set(dir, null); } }
    return dirs.get(dir)!;
  };
  const known = files && new Set(files.flatMap((f) => f.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"))));
  return {
    has(path) {
      if (known) return path === "" || known.has(path);
      let dir = "";
      for (const part of path.split("/").filter(Boolean)) { if (!names(dir)?.has(part)) return false; dir = dir ? `${dir}/${part}` : part; }
      return true;
    },
    read(path) { try { return readFileSync(resolve(root, path), "utf8"); } catch { return null; } },
  };
}
/** every file under a folder that is ours (impure): git's list when it is a checkout (tracked and still on the disk,
 *  and new ones not ignored), else the disk without node_modules and dot folders */
function filesOf(root: string): { files: string[]; git: boolean } {
  try {
    const ls = (...flags: string[]) => execFileSync("git", ["-C", root, "ls-files", ...flags, "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
    const gone = new Set(ls("-d"));
    return { files: ls("-co", "--exclude-standard").filter((f) => !gone.has(f)), git: true };
  } catch { /* not a checkout: the disk */ }
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const path = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path); else files.push(path);
    }
  };
  walk("");
  return { files: files.sort(), git: false };
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2), given: string[] = [];
  let rootArg: string | undefined, typeArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") { console.log("node sol/engine/src/team/docs-check.ts [--root <dir>] [--type <name>] [file ...]"); process.exit(0); }
    else if (args[i] === "--root") rootArg = args[++i];
    else if (args[i] === "--type") typeArg = args[++i];
    else given.push(args[i]);
  }
  const stop = (why: string): never => { console.error(`docs: ${why}`); process.exit(2); };
  const type = typeArg === undefined ? undefined : DOC_TYPES.find((t) => t.name === typeArg) ?? stop(`no type "${typeArg}": ${DOC_TYPES.map((t) => t.name).join(", ")}`);
  let root = "";
  try { root = real(rootArg ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()); }
  catch { stop("not in a checkout: say the folder with --root <dir>"); }
  let all: { files: string[]; git: boolean } = { files: [], git: false };
  try { all = filesOf(root); } catch (e) { stop(`couldn't read ${root}: ${String((e as Error).message).split("\n")[0]}`); }
  const tree = treeOf(root, all.git ? all.files : undefined);
  // a file named by hand is read from where the command runs (from the root when --root is given), and must be inside
  const files = given.length ? given.map((g) => relative(root, resolve(rootArg ? root : process.cwd(), g)).split("\\").join("/")) : all.files.filter((f) => PROSE.test(f));
  const misses: Miss[] = [];
  for (const file of files) {
    if (file === ".." || file.startsWith("../")) stop(`${file} is outside ${root}`);
    const text = tree.read(file);
    if (text === null) stop(`couldn't read ${file}`);
    else misses.push(...checkDoc(file, text, tree, type ?? typeOf(file)));
  }
  const gha = process.env.GITHUB_ACTIONS === "true";
  for (const m of misses) {
    console.log(`docs: ${say(m)}`);
    if (gha) console.log(`::error file=${m.file.replace(/[,:%\r\n]/g, (c) => encodeURIComponent(c))}${m.line ? `,line=${m.line}` : ""}::${m.what.replace(/[\r\n%]/g, " ")}`);
  }
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  if (misses.length) { console.error(`docs: ${n(misses.length, "thing")} to fix in ${n(files.length, "file")}`); process.exit(1); }
  console.log(`docs: ${n(files.length, "file")} read${files.length === 1 ? "s" : ""} well`);
}
