// The files source (#828; design §7.7 "the first one is files"): the one real source tonight. It reads folders on this
// Mac and nothing else; it has no write door (propose, draft, do) and nothing to sign in to.
//   scope    <HOME>/sources/files.json { reads, never } (folders as "~/Notes" or absolute), read at each call; written
//            only by the seat's home_rule tool on the person's words (tool.ts, #1686). Absent: reads = the folder Home
//            made for the person (their record's solHome), if it is there, else nothing; never = ~/Desktop, ~/Downloads
//   health   ok while every folder it reads is there; ok with "nothing to read yet" when it reads none (a fresh Sol:
//            Home starts by talking, start.ts); stale when some are gone; broken when every folder it was given is gone
//   read     the names in each folder it reads (not in a folder it never reads), at most 500 a folder
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { plainIn } from "../safewrite.js";
import { readRecordOf, solHomeOf } from "./rules.js";
import type { Health, Scope } from "../contract/home/policy.js";
import type { SourceDoor } from "./sources.js";

/** what a fresh Sol's files source says: no folder is wrong, there is none yet */
export const NOTHING_YET = "nothing to read yet";
const DEFAULT_NEVER = ["~/Desktop", "~/Downloads"];
const MAX = 500;

const isDir = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };
const strings = (x: unknown): string[] | null => (Array.isArray(x) && x.every((s) => typeof s === "string" && s.length > 0 && s.length <= 500) ? x : null);

/** the files source of a home folder; `user` is the person's own folder (os.homedir(); a test's own) */
export function filesSource(home: string, user: string = homedir()): SourceDoor {
  const own = (): string[] => { const h = solHomeOf(readRecordOf(user)); return h ? [h] : []; };
  const real = (p: string): string => resolve(p === "~" ? user : p.startsWith("~/") ? join(user, p.slice(2)) : isAbsolute(p) ? p : join(user, p));
  const scope = (): Scope => {
    const f = plainIn(join(home, "sources", "files.json"), home);
    if (f) {
      try {
        const j = JSON.parse(readFileSync(f, "utf8")) as { reads?: unknown; never?: unknown };
        const reads = strings(j.reads), never = strings(j.never);
        if (reads && never) return { reads, never };
      } catch { /* a file that does not read: the default */ }
    }
    return { reads: own().filter((p) => isDir(real(p))), never: DEFAULT_NEVER };
  };
  const under = (p: string, dir: string): boolean => { const r = relative(dir, p); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
  const allowed = (s: Scope): string[] => s.reads.filter((p) => !s.never.some((n) => under(real(p), real(n))));
  return {
    id: "files", name: "Files", kind: "Files",
    scope,
    health(now): Health {
      const reads = allowed(scope()), there = reads.filter((p) => isDir(real(p)));
      if (!reads.length) return { state: "ok", lastRead: now, why: NOTHING_YET };
      if (!there.length) return { state: "broken", lastRead: now, why: "no folder to read" };
      if (there.length < reads.length) return { state: "stale", lastRead: now, why: `${reads.filter((p) => !there.includes(p)).join(", ")} not there` };
      return { state: "ok", lastRead: now };
    },
    read() {
      return allowed(scope()).filter((p) => existsSync(real(p))).map((p) => {
        let names: string[] = [];
        try { names = readdirSync(real(p)).filter((n) => !n.startsWith(".")).sort().slice(0, MAX); } catch { /* unreadable: none */ }
        return { folder: p, names };
      });
    },
  };
}
