// The chat bar's attach menu (BR1, #1615; HANDOFF-P2 3c): a screenshot of the app, a photo or a file rides in the
// message as a path the session can open. Each is kept under SOL_HOME/next/attach, its name made safe and never trusted
// as a path; the face sends a photo or a file's bytes (next.attach.put), and the screenshot is the Sol window's own
// pixels (team/file.ts takeShot, `screencapture -l`), copied out of its 10-minute slot. Nothing is sent anywhere: the
// face says the paths in its message (work.say). Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { heldShot, takeShot } from "../team/file.js";

export type Kind = "shot" | "photo" | "file";
export type Kept = { ok: true; kind: Kind; name: string; path: string; size: number } | { ok: false; why: string };

export const MAX_BYTES = 25 * 1024 * 1024;
export const dirOf = (sol: string) => join(sol, "next", "attach");

/** a file's name kept as letters, digits and . _ - only, never a path, at most 80 */
export function safeName(v: unknown, fallback = "file"): string {
  const s = (typeof v === "string" ? v : "").split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.-]+/, "");
  return (s || fallback).slice(-80);
}

/** keep bytes under SOL_HOME/next/attach as <date>-<random>-<name> */
export function keep(sol: string, kind: Kind, name: string, bytes: Buffer, now = new Date()): Kept {
  if (!bytes.length) return { ok: false, why: "the file is empty" };
  if (bytes.length > MAX_BYTES) return { ok: false, why: `files up to ${MAX_BYTES / 1024 / 1024} MB` };
  const dir = dirOf(sol);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${now.toISOString().slice(0, 10)}-${randomBytes(4).toString("hex")}-${name}`);
  writeFileSync(path, bytes, { mode: 0o600 });
  return { ok: true, kind, name, path, size: bytes.length };
}

/** next.attach.put { kind: "photo"|"file", name, data (base64) } → the kept file's path */
export function putOf(sol: string, m: { kind?: unknown; name?: unknown; data?: unknown }): Kept {
  if (typeof m.data !== "string") return { ok: false, why: "a file is { name, data } with data in base64" };
  const kind: Kind = m.kind === "photo" ? "photo" : "file";
  return keep(sol, kind, safeName(m.name, kind === "photo" ? "photo" : "file"), Buffer.from(m.data, "base64"));
}

/** what macOS says when Screen Recording is off for Sol: screencapture makes no image of the window, or is not allowed */
const NO_PERM = /could not create image|not (authori[sz]ed|permitted|allowed)|screen ?recording|TCC|-3801/i;
/** next.attach.shot → the Sol window's shot, kept, with a picture the face shows (a jpeg, at most 2000 px wide); refused
 *  for Screen Recording it says perm, so the face says how to turn it on */
export async function shotOf(sol: string, take = takeShot, held = heldShot): Promise<Kept & { url?: string; perm?: true }> {
  let id: string;
  try { id = await take(); } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return NO_PERM.test(msg) ? { ok: false, why: "no screenshot: Sol needs Screen Recording", perm: true } : { ok: false, why: `no screenshot: ${msg.slice(0, 160)}` };
  }
  const bytes = held(id);
  if (!bytes) return { ok: false, why: "no screenshot: the shot was not kept" };
  const k = keep(sol, "shot", "screenshot-of-sol.jpg", bytes);
  return k.ok ? { ...k, name: "Screenshot of the app", url: `data:image/jpeg;base64,${bytes.toString("base64")}` } : k;
}
