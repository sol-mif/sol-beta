#!/usr/bin/env node
// Your own AI setup in a throwaway home, for trying the side-by-side (#1423) on yourself without touching yours: a copy
// of what the explorer's setup reader (../explore.mjs, readSetup) opens and nothing more. Rules files are copied as they
// are; settings keep only the keys it reads (never `env`); MCP servers, skills and memory notes keep their names, never
// their contents; gh's hosts file keeps the login, never the token. Repositories are found by the explorer's own walk,
// so the try shows what the real one would. Nothing is ever written outside <dir>.
//   node mirror.mjs <dir>        (the real home is $SOL_TRY_FROM, or this user's home)
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const [dir] = process.argv.slice(2);
if (!dir) { console.error("mirror: node mirror.mjs <dir>"); process.exit(2); }
const FROM = process.env.SOL_TRY_FROM || homedir();
const read = (p) => { try { return readFileSync(join(FROM, p), "utf8"); } catch { return null; } };
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const ls = (p) => { try { return readdirSync(join(FROM, p), { withFileTypes: true }); } catch { return []; } };
const put = (p, text = "") => { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
const copy = (p) => { const t = read(p); if (t !== null) put(p, t); return t !== null; };
const said = [];
// the word a hook is shown by: the same picker as hookWord in ../explore.mjs (#1531), never an assignment, `env`, a flag or a key
const hookWord = (command) => {
  let afterFlag = false;
  for (const raw of String(command ?? "").match(/(?:[^\s"'`]+|"[^"]*"|'[^']*'|`[^`]*`)+/g) ?? []) {
    const w = raw.replace(/["'`]/g, "");
    if (/^[A-Za-z_]\w*=/.test(raw)) continue;   // an assignment, quoted value and all
    if (/\s/.test(w)) return hookWord(w);   // sh -c "…": the command inside
    if (!w || w.includes("=")) continue;    // an assignment, or a flag's --key=value
    if (/^(env|bash|sh|zsh|node|python3?|exec|sudo|command|nice|uvx?|run|npx|bunx?|tsx|deno)$/.test(w.split("/").pop())) { afterFlag = false; continue; }
    if (w.startsWith("-")) { afterFlag = true; continue; }
    const b = w.split("/").pop();
    if (afterFlag && !w.includes("/") && !/\.\w{1,5}$/.test(b)) return null;   // after a flag, a bare word may be its value
    return /^[\w.@+-]{1,64}$/.test(b) && !/^(sk|ghp|gho|ghs|ghu|glpat|xox[abps])[-_]|^AKIA[0-9A-Z]{12}|[A-Za-z0-9]{24,}/.test(b) ? b : null;
  }
  return null;
};

// rules: the person's own
for (const p of [".claude/CLAUDE.md", ".codex/AGENTS.md"]) if (copy(p)) said.push(p);

// Claude Code's settings: the keys the reader reads, nothing else (env and anything unknown stay behind)
for (const p of [".claude/settings.json", ".claude/settings.local.json"]) {
  const j = json(read(p)); if (!j || typeof j !== "object") continue;
  const keep = {};
  for (const k of ["model", "autoCompactWindow", "effortLevel", "outputStyle", "alwaysThinkingEnabled", "enabledPlugins"]) if (j[k] !== undefined) keep[k] = j[k];
  // a hook keeps its event, matcher and the script's name the reader shows; the rest of its command line stays behind
  if (j.hooks && typeof j.hooks === "object") keep.hooks = Object.fromEntries(Object.entries(j.hooks).map(([ev, list]) => [ev, (Array.isArray(list) ? list : []).map((h) => ({
    ...(h?.matcher ? { matcher: String(h.matcher) } : {}),
    hooks: (Array.isArray(h?.hooks) ? h.hooks : []).map((c) => ({ type: "command", command: hookWord(c?.command) ?? "" })),
  }))]));
  if (j.permissions && typeof j.permissions === "object") {
    keep.permissions = {};
    if (typeof j.permissions.defaultMode === "string") keep.permissions.defaultMode = j.permissions.defaultMode;
    for (const l of ["allow", "deny", "ask"]) if (Array.isArray(j.permissions[l])) keep.permissions[l] = j.permissions[l].map(() => "(kept as a count)");
  }
  put(p, JSON.stringify(keep, null, 2)); said.push(p);
}
// memory notes and skills: names only
for (const d of ls(".claude/projects")) if (d.isDirectory()) for (const e of ls(`.claude/projects/${d.name}/memory`)) if (e.name.endsWith(".md")) put(`.claude/projects/${d.name}/memory/${e.name}`);
for (const e of ls(".claude/skills")) if (e.isDirectory() || e.isSymbolicLink()) mkdirSync(join(dir, ".claude/skills", e.name), { recursive: true });
if (existsSync(join(FROM, ".claude/.credentials.json"))) put(".claude/.credentials.json", "{}");
// MCP servers: their names
const cj = json(read(".claude.json"));
put(".claude.json", JSON.stringify({ mcpServers: Object.fromEntries(Object.keys(cj?.mcpServers ?? {}).map((k) => [k, {}])) }, null, 2));
// Codex: the four settings it reads and the MCP servers' names
const toml = read(".codex/config.toml");
if (toml !== null) {
  const top = ["model", "approval_policy", "sandbox_mode", "model_reasoning_effort"].map((k) => toml.match(new RegExp(`^${k}\\s*=.*$`, "m"))?.[0]).filter(Boolean);
  const mcp = [...toml.matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map((m) => `[mcp_servers.${m[1]}]`);
  put(".codex/config.toml", [...top, "", ...mcp].join("\n") + "\n"); said.push(".codex/config.toml");
}
if (existsSync(join(FROM, ".codex/auth.json"))) put(".codex/auth.json", "{}");
// gh: who you are on GitHub (a team's repository is told from yours by it), never the token
const user = read(".config/gh/hosts.yml")?.match(/^\s*user:\s*(\S+)/m)?.[1];
if (user) put(".config/gh/hosts.yml", `github.com:\n    user: ${user}\n`);

// repositories, by the explorer's walk (repos() in explore.mjs: the home and two levels under it): their remote and rules
let repos = 0;
const look = (p, depth) => {
  for (const e of ls(p)) {
    if (!e.isDirectory() || e.name.startsWith(".") || /^(Library|node_modules|Applications|Pictures|Music|Movies)$/.test(e.name)) continue;
    const q = p ? `${p}/${e.name}` : e.name;
    if (existsSync(join(FROM, q, ".git"))) {
      const url = (read(`${q}/.git/config`) ?? "").match(/url\s*=\s*(\S+)/)?.[1] ?? "";
      put(`${q}/.git/config`, url ? `[remote "origin"]\n\turl = ${url.replace(/\/\/[^@/]+@/, "//")}\n` : "");
      for (const f of ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md", "CLAUDE.local.md"]) copy(`${q}/${f}`);
      repos++;
    } else if (depth < 2) look(q, depth + 1);
  }
};
look("", 0);
console.log(`mirror: ${said.length} setup files, ${repos} repositories, ${Object.keys(cj?.mcpServers ?? {}).length} MCP servers → ${dir}`);
