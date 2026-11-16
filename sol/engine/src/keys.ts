// The keys (the design's gate, "keys", Frank 2026-11-07): a key an outside service knows a person by (a GitHub token, an
// API key), kept where only the engine reads it, <Sol's folder>/keys/<name>, a plain file 0600 to begin with. A block
// names the keys it needs (needs.keys); the engine puts one into a program's environment or a request's header for it
// (bigroom.ts, sol.run and sol.fetch), and the block never holds it.
//   pasted      from the face straight to the engine (POST /keys, Sol's own page only), never through a chat: no seat
//               sees it. Beside it, <name>.json says what it is for, the hosts it is sent to, the blocks pressed to use
//               it, when it was added, and its scope once the service has said it (GitHub's x-oauth-scopes, the first
//               time it is used). Once pasted its text is never shown again; the list (GET /keys) is the notes
//   removed     both files go; a block that names it waits for a key, said in its place
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { writeWhole } from "./safewrite.js";
import { join } from "node:path";

/** a key's name; never one ending .json (its notes) or .tmp */
export const KEY_NAME = /^(?!.*\.(?:json|tmp)$)[a-z0-9][a-z0-9._-]{0,63}$/;
const HOST = /^(?=.{1,253}$)(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62})(?::\d{1,5})?$/;
export const keyFile = (app: string, name: string) => join(app, "keys", name);
/** what is kept beside a key: never its text */
export type KeyMeta = { name: string; purpose: string; hosts: string[]; users: string[]; added: number; scope?: string };

/** a key's text and the hosts it is for, or why it cannot be had: not there yet, or readable by others than this user */
export function readKey(app: string, name: string): { key: string; hosts: string[] } | { why: string } {
  if (!KEY_NAME.test(name)) return { why: `${name} is not a key's name` };
  const f = keyFile(app, name);
  try {
    if ((statSync(f).mode & 0o077) !== 0) return { why: `the key ${name} is readable by others on this Mac (its file is not 0600): it is not used` };
    const key = readFileSync(f, "utf8").trim();
    if (!key) return { why: `the key ${name} is empty` };
    return { key, hosts: keyMeta(app, name)?.hosts ?? [] };
  } catch { return { why: `there is no key ${name} yet: a person pastes it on the block's card` }; }
}
/** whether a key of that name was pasted (a file there; one others can read is refused when it is used, with that reason) */
export const haveKey = (app: string, name: string): boolean => KEY_NAME.test(name) && existsSync(keyFile(app, name));

/** the notes beside a key, or null */
export function keyMeta(app: string, name: string): KeyMeta | null {
  if (!KEY_NAME.test(name)) return null;
  try {
    const m = JSON.parse(readFileSync(`${keyFile(app, name)}.json`, "utf8")) as Partial<KeyMeta>;
    const words = (x: unknown) => (Array.isArray(x) ? x.filter((h): h is string => typeof h === "string") : []);
    return { name, purpose: typeof m.purpose === "string" ? m.purpose : "", hosts: words(m.hosts).map((h) => h.toLowerCase()), users: words(m.users), added: Number(m.added) || 0, ...(typeof m.scope === "string" ? { scope: m.scope } : {}) };
  } catch { return null; }
}
function writeMeta(app: string, m: KeyMeta) {
  writeWhole(`${keyFile(app, m.name)}.json`, JSON.stringify(m, null, 2) + "\n", { root: app });
}

/** a key pasted on the face: kept 0600 with its notes; a key already there of that name is replaced (its users kept) */
export function pasteKey(app: string, p: { name: unknown; key: unknown; purpose?: unknown; hosts?: unknown }, now = Date.now()): { ok: true; meta: KeyMeta } | { ok: false; why: string } {
  if (typeof p.name !== "string" || !KEY_NAME.test(p.name) || /\.(json|tmp)$/.test(p.name)) return { ok: false, why: "a key's name is lowercase letters, digits, . _ - (64 at most), not ending .json or .tmp" };
  if (typeof p.key !== "string" || !p.key.trim() || p.key.length > 8192 || /[\r\n\0]/.test(p.key.trim())) return { ok: false, why: "the key is one line of text" };
  if (p.purpose !== undefined && (typeof p.purpose !== "string" || p.purpose.length > 300)) return { ok: false, why: "its purpose is one plain sentence (300 characters at most)" };
  const hosts = p.hosts === undefined ? [] : p.hosts;
  if (!Array.isArray(hosts) || hosts.length > 16 || !hosts.every((h) => typeof h === "string" && HOST.test(h.toLowerCase()))) return { ok: false, why: "hosts is a list of host names (api.github.com), 16 at most" };
  const dir = join(app, "keys");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeWhole(keyFile(app, p.name), p.key.trim() + "\n", { root: app });
  const was = keyMeta(app, p.name);
  const meta: KeyMeta = { name: p.name, purpose: (p.purpose as string | undefined) ?? was?.purpose ?? "", hosts: [...new Set((hosts as string[]).map((h) => h.toLowerCase()))], users: was?.users ?? [], added: now };
  writeMeta(app, meta);
  return { ok: true, meta };
}
/** a key taken away: its text and its notes */
export function removeKey(app: string, name: string): boolean {
  if (!KEY_NAME.test(name) || !existsSync(keyFile(app, name))) return false;
  rmSync(keyFile(app, name), { force: true });
  rmSync(`${keyFile(app, name)}.json`, { force: true });
  return true;
}
/** every key's notes, by name; never a key's text */
export function listKeys(app: string): KeyMeta[] {
  let names: string[] = [];
  try { names = readdirSync(join(app, "keys")).filter((f) => KEY_NAME.test(f) && !f.endsWith(".json") && !f.endsWith(".tmp")); } catch { return []; }
  return names.sort().map((n) => keyMeta(app, n) ?? { name: n, purpose: "", hosts: [], users: [], added: 0 });
}
/** a block pressed to use a key: it is among the key's users from now on */
export function noteUser(app: string, name: string, block: string): void {
  const m = keyMeta(app, name);
  if (m && !m.users.includes(block)) writeMeta(app, { ...m, users: [...m.users, block].sort() });
}
/** the scope a service said a key has, kept the first time it is said */
export function noteScope(app: string, name: string, scope: string): void {
  const m = keyMeta(app, name);
  if (m && m.scope === undefined) writeMeta(app, { ...m, scope: scope.slice(0, 500) });
}
