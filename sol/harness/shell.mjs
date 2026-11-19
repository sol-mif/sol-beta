// How the guard reads a shell line (#484): as actions, not words. A line is cut into the commands it runs (outside
// quotes and heredoc bodies, which are words and never actions), each command into its words, and each command
// knows the folder it runs in (a cd before it, git's own -C, env -C). A command the line runs inside another is a
// command too, judged the same way: $( ) and `…` (in double quotes as well), <( ) and >( ), bash/sh/zsh -c '…',
// eval, xargs, find -exec, env -S. The guard's rules judge these, so a commit message that says "git merge" or a grep
// for a rule's words is never taken for the thing itself, and a merge wrapped in bash -c is still a merge.
// What it cannot read it says, so the guard never lets it through silently: a line whose quotes or $( ) do not close
// (`broken`), and a command whose program is itself a variable or a substitution (`opaque`, "$GIT" merge main).
// Pure; tested in sol/engine/test/harness-shell.test.ts. Read by sol/harness/guard; never a rule of its own.
import { homedir } from "node:os";
import { resolve } from "node:path";

const HEREDOC = /^<<(-?)[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2/;

/** the commands of a line: [{ text, docs }], `docs` the heredoc bodies the command reads (its words, not actions).
 *  `open` on the array: the line ended inside a quote, a $( ) or a `…` (the shell would refuse it or read on) */
export function commands(line, queue = null) {
  line = String(line ?? "");
  const out = [];
  const st = ["top"];
  let cur = "", docs = [], pend = [], i = 0;
  const top = () => st[st.length - 1];
  let pipe = 0;   // which pipeline a command is in: | joins, ; && || and a newline start the next
  const push = (next = true) => { const t = cur.trim(); if (t || docs.length) out.push({ text: t, docs, pipe }); cur = ""; docs = []; if (next) pipe++; };
  const bodies = () => {   // at a newline with heredocs waiting: their bodies, up to each one's end line
    for (const p of pend) {
      const lines = [];
      while (i < line.length) {
        let j = line.indexOf("\n", i); if (j < 0) j = line.length;
        const l = line.slice(i, j); i = j + 1;
        if ((p.dash ? l.replace(/^\t+/, "") : l).trim() === p.tag) break;
        lines.push(l);
      }
      // an unclosed one runs to the end of the line, as the shell reads it: still words. One with nothing after it, inside
      // a $( ), had its body read by the outer line: handed in (`queue`)
      docs.push(!lines.length && i >= line.length && queue?.length ? queue.shift() : lines.join("\n"));
    }
    pend = [];
  };
  let open = false;
  while (i < line.length) {
    const c = line[i], m = top();
    if (m === "sq") { cur += c; if (c === "'") st.pop(); i++; continue; }
    if (c === "\\") { cur += c + (line[i + 1] ?? ""); i += 2; continue; }
    if (m === "bq") { cur += c; if (c === "`") st.pop(); i++; continue; }
    if (m === "dq") {
      if (c === "$" && line[i + 1] === "(") { st.push("sub"); cur += "$("; i += 2; continue; }
      if (c === "`") { st.push("bq"); cur += c; i++; continue; }
      if (c === '"') st.pop();
      cur += c; i++; continue;
    }
    if (c === "'") { st.push("sq"); cur += c; i++; continue; }
    if (c === '"') { st.push("dq"); cur += c; i++; continue; }
    if (c === "`") { st.push("bq"); cur += c; i++; continue; }
    if ((c === "$" || c === "<" || c === ">") && line[i + 1] === "(") { st.push("sub"); cur += c + "("; i += 2; continue; }
    if (m === "sub" && c === "(") { st.push("sub"); cur += c; i++; continue; }
    if (m === "sub" && c === ")") { st.pop(); cur += c; i++; continue; }
    if (c === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      const h = HEREDOC.exec(line.slice(i));
      if (h) { pend.push({ tag: h[3], dash: !!h[1] }); cur += h[0]; i += h[0].length; continue; }
    }
    if (c === "\n") {
      i++;
      if (pend.length) bodies();
      if (m === "top") push(); else cur += "\n";
      continue;
    }
    if (m === "top") {
      if (c === ";") { push(); i++; continue; }
      if (c === "|" && cur.endsWith(">") && !cur.endsWith("\\>")) { cur += c; i++; continue; }   // >|: a redirect that clobbers
      if (c === "|") { const or = line[i + 1] === "|"; push(or); i += or || line[i + 1] === "&" ? 2 : 1; continue; }
      if (c === "&") {
        if (line[i + 1] === "&") { push(); i += 2; continue; }
        if (cur.endsWith(">") || line[i + 1] === ">") { cur += c; i++; continue; }   // 2>&1, &>file: a redirect
        push(); i++; continue;
      }
    }
    cur += c; i++;
  }
  // a heredoc opened inside a $( ) whose body the outer line read: it is handed in (`queue`), so the command that reads it has it
  if (pend.length) { for (const _ of pend) docs.push(queue?.length ? queue.shift() : ""); pend = []; }
  if (st.length > 1) open = true;
  push();
  // a subshell's or a group's brackets are not part of the command: (cd x && git merge y) is two commands
  const list = out.map((x) => ({ ...x, text: unwrap(x.text) })).filter((x) => x.text || x.docs.length);
  list.open = open;
  return list;
}
function unwrap(t) {
  let s = t.replace(/^(?:[({]\s*)+/, "");
  const count = (ch) => s.split(ch).length - 1;
  while (count(")") > count("(") && /\)\s*$/.test(s)) s = s.replace(/\s*\)\s*$/, "");
  if (!s.includes("{")) s = s.replace(/(?:\s*\}\s*)+$/, "");
  return s.trim();
}

/** the commands a command runs inside its own text: $( ), `…`, <( ), >( ), outside single quotes. Each one's script */
export function subs(text) {
  const out = [];
  const s = String(text ?? "");
  let i = 0, q = "";   // q: "'" or '"' while inside one
  const close = (from) => {   // the end of a $( … ) whose body starts at `from`: its matching ), quotes inside kept
    let depth = 1, j = from, qq = "";
    while (j < s.length) {
      const c = s[j];
      if (qq === "'") { if (c === "'") qq = ""; j++; continue; }
      if (c === "\\") { j += 2; continue; }
      if (qq === '"') { if (c === '"') qq = ""; else if (c === "$" && s[j + 1] === "(") { depth++; j++; } j++; continue; }
      if (c === "'" || c === '"') { qq = c; j++; continue; }
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return j;
      j++;
    }
    return -1;
  };
  while (i < s.length) {
    const c = s[i];
    if (q === "'") { if (c === "'") q = ""; i++; continue; }
    if (c === "\\") { i += 2; continue; }
    if (c === "'" && !q) { q = "'"; i++; continue; }
    if (c === '"') { q = q ? "" : '"'; i++; continue; }
    if ((c === "$" || (!q && (c === "<" || c === ">"))) && s[i + 1] === "(") {
      if (c === "$" && s[i + 2] === "(") { i += 3; continue; }   // $(( )): arithmetic, not a command
      const end = close(i + 2);
      out.push(s.slice(i + 2, end < 0 ? s.length : end));
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1, body = "";
      while (j < s.length && s[j] !== "`") { if (s[j] === "\\" && j + 1 < s.length) { body += s[j + 1]; j += 2; continue; } body += s[j]; j++; }
      out.push(body);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/** a command's words, quotes taken off; `q` says a word was quoted (so a quoted ">" is never a redirect) */
export function words(text) {
  const out = [];
  let w = "", q = false, has = false, i = 0;
  const st = ["top"];
  const top = () => st[st.length - 1];
  const end = () => { if (has) out.push({ t: w, q }); w = ""; q = false; has = false; };
  while (i < text.length) {
    const c = text[i], m = top();
    if (m === "sq") { if (c === "'") st.pop(); else w += c; i++; continue; }
    if (m === "sub") { w += c; if (c === "(") st.push("sub"); else if (c === ")") st.pop(); i++; continue; }
    if (m === "bq") { w += c; if (c === "`") st.pop(); i++; continue; }
    if (c === "\\") { w += text[i + 1] ?? ""; has = true; i += 2; continue; }
    if (m === "dq") {
      if (c === '"') st.pop();
      else if (c === "$" && text[i + 1] === "(") { st.push("sub"); w += "$("; i += 2; continue; }
      else if (c === "`") { st.push("bq"); w += c; }
      else w += c;
      i++; continue;
    }
    if (c === "'" || c === '"') { st.push(c === "'" ? "sq" : "dq"); q = true; has = true; i++; continue; }
    if ((c === "$" || c === "<" || c === ">") && text[i + 1] === "(") { st.push("sub"); w += c + "("; has = true; i += 2; continue; }
    if (c === "`") { st.push("bq"); w += c; has = true; i++; continue; }
    // a redirect is a word of its own even glued to others (echo x>f, 2>&1, &>f, >|f, >& f): its operator, with the
    // number or & before it, then its target as the next word
    if (c === ">" || c === "<" || (c === "&" && text[i + 1] === ">")) {
      let pre = "";
      if (c === "&") { end(); pre = "&"; i++; }
      else if (has && !q && /^\d+$/.test(w)) { pre = w; w = ""; has = false; }
      else end();
      const ch = text[i];
      const op = ch === ">" ? (/^>(>|\||&)/.exec(text.slice(i))?.[0] ?? ">") : (/^<(<<|<-|<|&|>)/.exec(text.slice(i))?.[0] ?? "<");
      out.push({ t: pre + op, q: false, op: true });
      i += op.length;
      continue;
    }
    if (/\s/.test(c)) { end(); i++; continue; }
    w += c; has = true; i++;
  }
  end();
  return out;
}
/** words with the redirects taken out (an operator and, when it has none glued on, its target) */
export function noRedirects(ws) {
  const out = [];
  for (let k = 0; k < ws.length; k++) {
    if (ws[k].op) { k++; continue; }
    out.push(ws[k]);
  }
  return out;
}

// a program that runs the rest of its words as a command, and the flags of its own that take a value
const WRAPPERS = {
  sudo: ["-u", "-g", "-C", "-h", "-p", "-U", "-r", "-t", "-D", "--user", "--group", "--chdir", "--host", "--prompt"],
  doas: ["-u", "-C"],
  command: [], builtin: [], exec: ["-a"], nohup: [], time: ["-f", "-o", "--format", "--output"], env: ["-u", "--unset", "-C", "--chdir"],
  nice: ["-n", "--adjustment"], ionice: ["-c", "-n", "-p", "--class", "--classdata"], caffeinate: ["-t", "-w"], stdbuf: ["-i", "-o", "-e"],
  chronic: [], unbuffer: [], timeout: ["-s", "-k", "--signal", "--kill-after"], gtimeout: ["-s", "-k", "--signal", "--kill-after"],
  watch: ["-n", "-d", "--interval"], flock: ["-w", "-E", "--timeout"],
};
/** the words that name the program: wrappers (sudo, env, time, timeout …) and VAR=value before it taken off. `dir` a
 *  folder a wrapper moves to (env -C, sudo -D), `script` the string env -S runs */
export function program(ws) {
  let k = 0, dir = null, script = null;
  const env = {};
  while (k < ws.length) {
    const t = ws[k].t;
    if (!ws[k].q && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { env[t.slice(0, t.indexOf("="))] = t.slice(t.indexOf("=") + 1); k++; continue; }
    const name = t.replace(/^.*\//, "");
    if (!ws[k].q && Object.hasOwn(WRAPPERS, name)) {
      const valued = WRAPPERS[name];
      k++;
      while (k < ws.length && /^-/.test(ws[k].t) && ws[k].t !== "--") {
        const f = ws[k].t;
        if ((name === "env") && (f === "-S" || f.startsWith("--split-string"))) { script = f.includes("=") ? f.slice(f.indexOf("=") + 1) : ws[k + 1]?.t ?? ""; k += f.includes("=") ? 1 : 2; continue; }
        if ((name === "env" && (f === "-C" || f === "--chdir")) || (name === "sudo" && (f === "-D" || f === "--chdir"))) { dir = ws[k + 1]?.t ?? null; k += 2; continue; }
        if (f.startsWith("--chdir=")) { dir = f.slice(8); k++; continue; }
        if (valued.includes(f)) { k += 2; continue; }
        k++;
      }
      if (ws[k]?.t === "--") k++;
      if ((name === "timeout" || name === "gtimeout") && k < ws.length && /^\d/.test(ws[k].t)) k++;   // the duration
      if (name === "env") while (k < ws.length && !ws[k].q && /^[A-Za-z_][A-Za-z0-9_]*=/.test(ws[k].t)) { const a = ws[k].t; env[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1); k++; }
      if (script !== null) break;
      continue;
    }
    break;
  }
  const p = noRedirects(ws.slice(k));
  p.env = env;
  if (dir !== null) p.dir = dir;
  if (script !== null) p.script = script;
  return p;
}

const tilde = (p) => (p === "~" ? homedir() : p.startsWith("~/") ? homedir() + p.slice(1) : p);
/** a path as the shell would take it, from `dir` */
export const pathFrom = (dir, p) => resolve(dir, tilde(p));

const SHELLS = /^(bash|sh|zsh|dash|ksh|fish)$/;
const XARGS_VALUED = new Set(["-I", "-i", "-n", "-L", "-l", "-P", "-d", "-E", "-e", "-s", "-a", "--max-args", "--max-procs", "--delimiter", "--arg-file", "--replace"]);
/** the scripts a command runs as commands of its own: bash -c '…', eval …, xargs cmd …, find -exec cmd … ;, env -S '…' */
function inner(p, docs = []) {
  const out = [];
  if (p.script !== undefined) out.push(p.script);
  if (!p.length) return out;
  const name = p[0].t.replace(/^.*\//, "");
  const rest = p.slice(1).map((x) => x.t);
  if (SHELLS.test(name)) {
    // bash -c 'script' (also -lc, -ec, -xc …): the first word after the flags is the script
    let k = 0, c = false;
    while (k < rest.length && rest[k].startsWith("-") && rest[k] !== "--") { if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(rest[k])) c = true; if (rest[k] === "-o" || rest[k] === "+o") k++; k++; }
    if (c && rest[k] !== undefined) out.push(rest[k]);
    else if (!c && docs.length && !rest.slice(k).some((a) => !a.startsWith("-"))) out.push(...docs);   // bash <<EOF: its body is the script
  } else if (name === "eval") {
    out.push(rest.join(" "));
  } else if (name === "xargs") {
    let k = 0;
    while (k < rest.length && rest[k].startsWith("-")) { if (XARGS_VALUED.has(rest[k])) k++; k++; }
    if (k < rest.length) out.push(p.slice(k + 1).map((x) => (x.q ? `'${x.t.replace(/'/g, "'\\''")}'` : x.t)).join(" "));
  } else if (name === "find" || name === "fd" || name === "parallel") {
    for (let k = 0; k < rest.length; k++) {
      if (!/^-(exec|execdir|ok|okdir|x|X|-exec|-exec-batch)$/.test(rest[k])) continue;
      const cmd = [];
      for (k++; k < rest.length && rest[k] !== ";" && rest[k] !== "+" && rest[k] !== "\\;"; k++) cmd.push(rest[k]);
      if (cmd.length) out.push(cmd.map((w) => (/\s/.test(w) ? `'${w}'` : w)).join(" "));
    }
  }
  return out;
}

/** every command of a line with the folder it runs in: a cd or pushd moves the ones after it, git -C only its own.
 *  The commands it runs inside another come after it, `depth` above it. The array's `broken` says the line did not
 *  close (an open quote, $( ) or heredoc), and a command's `opaque` that its program is not a plain word */
let pipes = 0;
export function plan(line, cwd, depth = 0, queue = null) {
  let dir = cwd;
  const base = ++pipes * 1000;
  const list = commands(line, queue);
  const out = [];
  let broken = !!list.open;
  for (const c of list) {
    const ws = words(c.text);
    const p = program(ws);
    const at = p.dir ? pathFrom(dir, p.dir) : dir;
    const name = p[0]?.t ?? "";
    const opaque = /[$`]|^[<>]\(/.test(name);   // "$GIT" merge, $(which git) merge: the program is not known here
    out.push({ text: c.text, docs: c.docs, words: ws, prog: p, dir: at, depth, opaque, pipe: base + c.pipe });
    if (depth < 6) {
      const bodies = [...c.docs];   // the heredoc bodies its inner commands opened, in order
      for (const s of [...subs(c.text), ...inner(p, c.docs)]) {
        const more = plan(s, at, depth + 1, bodies);
        if (more.broken) broken = true;
        out.push(...more);
      }
    }
    if ((name === "cd" || name === "pushd") && !p[0].q) {
      const arg = p.slice(1).find((x) => !/^-[LPe@]$/.test(x.t));
      if (!arg) dir = name === "cd" ? homedir() : dir;
      else if (arg.t !== "-" && !arg.t.includes("$")) dir = pathFrom(dir, arg.t);
    }
  }
  out.broken = broken;
  return out;
}

const GIT_OPT_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"]);
/** a git command: its subcommand, its arguments and where it runs (-C taken in), or null for anything else. `aliases`
 *  the ones its own -c alias.x=… names */
export function gitOf(cmd) {
  const p = cmd.prog;
  if (!p.length || !/(^|\/)git$/.test(p[0].t)) return null;
  // where it acts: -C, and the work tree or git folder it is pointed at (--work-tree, --git-dir, GIT_WORK_TREE, GIT_DIR)
  const gitDir = (d) => pathFrom(cmd.dir, d).replace(/\/\.git\/?$/, "");
  let dir = p.env?.GIT_WORK_TREE ? pathFrom(cmd.dir, p.env.GIT_WORK_TREE) : p.env?.GIT_DIR ? gitDir(p.env.GIT_DIR) : cmd.dir, k = 1;
  const aliases = {};
  while (k < p.length && p[k].t.startsWith("-")) {
    const t = p[k].t;
    if (t === "-C") { if (p[k + 1]) dir = pathFrom(dir, p[k + 1].t); k += 2; continue; }
    if (t === "-c") { const m = /^alias\.([^=]+)=(.*)$/s.exec(p[k + 1]?.t ?? ""); if (m) aliases[m[1]] = m[2]; k += 2; continue; }
    if (t === "--work-tree" || t === "--git-dir") { if (p[k + 1]) dir = t === "--git-dir" ? gitDir(p[k + 1].t) : pathFrom(cmd.dir, p[k + 1].t); k += 2; continue; }
    if (t.startsWith("--work-tree=")) { dir = pathFrom(cmd.dir, t.slice(12)); k++; continue; }
    if (t.startsWith("--git-dir=")) { dir = gitDir(t.slice(10)); k++; continue; }
    if (GIT_OPT_ARG.has(t)) { k += 2; continue; }
    k++;
  }
  if (k >= p.length) return null;
  return { sub: p[k].t, args: p.slice(k + 1).map((x) => x.t), dir, aliases };
}

/** gh's subcommand path and its arguments: gh pr create … → { path: ["pr", "create"], args } */
export function ghOf(cmd) {
  const p = cmd.prog;
  if (!p.length || !/(^|\/)gh$/.test(p[0].t)) return null;
  const rest = p.slice(1).map((x) => x.t);
  // gh's own flags before the command (-R owner/repo, --repo x) are not its path
  const head = [];
  // in any order and spelling gh takes: -R x, -Rx, -R=x, --repo x, --repo=x (#1126)
  for (;;) {
    if (rest.length && /^(-R|--repo)$/.test(rest[0])) head.push(rest.shift(), rest.shift() ?? "");
    else if (rest.length && /^--repo=/.test(rest[0])) head.push(rest.shift());
    else if (rest.length && /^-R./.test(rest[0])) { const w = rest.shift(); head.push("-R", w.slice(2).replace(/^=/, "")); }
    else break;
  }
  const path = [];
  while (rest.length && !rest[0].startsWith("-") && path.length < 2) path.push(rest.shift());
  return { path, args: [...rest, ...head], dir: cmd.dir };
}

/** the value of a flag in a word list: --body x, --body=x, -b x */
export function flag(args, ...names) {
  for (let k = 0; k < args.length; k++) {
    for (const n of names) {
      if (args[k] === n) return args[k + 1] ?? "";
      if (n.startsWith("--") && args[k].startsWith(n + "=")) return args[k].slice(n.length + 1);
    }
  }
  return undefined;
}

/** the files a command writes, deletes or appends to (absolute): redirects, tee, sed -i, perl -i, cp, mv, rm, touch,
 *  truncate, ln, dd of=, git rm/mv/checkout -- /restore. `copies` the files a cp, mv, ln or install reads its bytes
 *  from. Not a wall: a program can write a file another way */
export function writesOf(cmd) {
  const writes = [], deletes = [], appends = [], copies = [];
  const at = (p) => pathFrom(cmd.dir, p);
  const ws = cmd.words;
  for (let k = 0; k < ws.length; k++) {
    if (!ws[k].op) continue;
    const r = /^(\d*|&)(>>|>\||>&|>|<>)$/.exec(ws[k].t);
    if (!r) continue;
    const target = ws[k + 1]?.t ?? "";
    if (!target) continue;
    if (r[2] === ">&" && /^(\d+|-)$/.test(target)) continue;   // 2>&1, >&-: a copy of a stream, not a file
    if (/^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/.test(target)) continue;
    (r[2] === ">>" ? appends : writes).push(at(target));
  }
  const p = cmd.prog.map((x) => x.t);
  const name = (p[0] ?? "").replace(/^.*\//, "");
  const plain = (a) => a.filter((x) => !x.startsWith("-"));
  // the words after the program, cut at the first redirect
  const cut = (a) => { const i = a.findIndex((x) => /^(\d*|&)(>>|>\||>)/.test(x)); return i < 0 ? a : a.slice(0, i); };
  const args = cut(p.slice(1));
  if (name === "tee") (args.some((x) => /^-\w*a/.test(x) || x === "--append") ? appends : writes).push(...plain(args).map(at));
  else if ((name === "sed" || name === "gsed") && args.some((x) => /^-\w*i/.test(x) || x.startsWith("--in-place"))) {
    const scripted = args.some((x) => x === "-e" || x === "-f" || x.startsWith("--expression") || x.startsWith("--file"));
    const skip = new Set(); args.forEach((x, k) => { if (x === "-e" || x === "-f") skip.add(k + 1); });
    const files = args.filter((x, k) => x !== "" && !x.startsWith("-") && !skip.has(k));   // BSD's -i '' is a suffix
    writes.push(...(scripted ? files : files.slice(1)).map(at));
  } else if (name === "perl" && args.some((x) => /^-\w*i/.test(x))) {
    const skip = new Set(); args.forEach((x, k) => { if (/^-\w*e$/.test(x)) skip.add(k + 1); });
    writes.push(...args.filter((x, k) => !x.startsWith("-") && !skip.has(k)).map(at));
  } else if (name === "cp" || name === "ln" || name === "install" || name === "rsync" || name === "ditto") {
    const f = plain(args); if (f.length >= 2) { writes.push(at(f[f.length - 1])); copies.push(...f.slice(0, -1).map(at)); }
  } else if (name === "mv") {
    const f = plain(args); if (f.length >= 2) { writes.push(at(f[f.length - 1])); deletes.push(...f.slice(0, -1).map(at)); copies.push(...f.slice(0, -1).map(at)); }
  } else if (name === "rm" || name === "unlink" || name === "shred") deletes.push(...plain(args).map(at));
  else if (name === "touch" || name === "truncate") writes.push(...plain(args).filter((x) => !/^\d+[kKmMgG]?$/.test(x)).map(at));
  else if (name === "dd") for (const a of args) if (a.startsWith("of=")) writes.push(at(a.slice(3)));
  const g = gitOf(cmd);
  if (g) {
    const gat = (x) => pathFrom(g.dir, x);
    const a = cut(g.args);
    const dash = a.indexOf("--");
    if (g.sub === "rm") deletes.push(...plain(a).map(gat));
    else if (g.sub === "mv") { const f = plain(a); if (f.length >= 2) { writes.push(gat(f[f.length - 1])); deletes.push(...f.slice(0, -1).map(gat)); } }
    else if (g.sub === "restore") writes.push(...plain(dash >= 0 ? a.slice(dash + 1) : a).map(gat));
    else if (g.sub === "checkout" && dash >= 0) writes.push(...a.slice(dash + 1).map(gat));
  }
  return { writes, deletes, appends, copies };
}
