// The folder as a source: a new file is a trigger. The rule says where to look ("a new file in material/ → …"); with
// no folder named, the folder's top level. What was there is kept in folder-last.json, so a file that came while the
// engine was off is still new at the next look. Hidden files, the agent's own room and what it writes are never news.
import { readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

/** the sub-folder a rule's sentence names ("in material/"), or "" for the folder itself (pure) */
export function subOf(sentence: string): string {
  const m = /\bin\s+([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*)\/?/i.exec(sentence);
  return m && !m[1].startsWith(".") ? m[1] : "";
}

const MINE = new Set(["ledger.md", "policy.md", "brain.md"]);
/** the plain files in a folder's sub-folder, one level down too, as paths relative to the folder */
export function listFiles(folder: string, sub: string): string[] {
  const out: string[] = [];
  const look = (rel: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(join(folder, rel)); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".") || n.endsWith(".tmp") || (!rel && MINE.has(n))) continue;
      const p = rel ? `${rel}/${n}` : n;
      let st;
      try { st = statSync(join(folder, p)); } catch { continue; }
      if (st.isFile()) out.push(p);
      else if (st.isDirectory() && depth < 1) look(p, depth + 1);
    }
  };
  look(sub, 0);
  return out.sort();
}

/** what is new since the last look (pure) */
export const newFiles = (before: string[], now: string[]): string[] => { const was = new Set(before); return now.filter((f) => !was.has(f)); };

/** watch a sub-folder; `changed` is called once things settle (a copy writes many events) */
export function watchFolder(folder: string, sub: string, changed: () => void, settleMs = 1500): () => void {
  let timer: NodeJS.Timeout | null = null;
  let w: FSWatcher | null = null;
  try {
    w = watch(join(folder, sub), { recursive: true }, (_e, name) => {
      if (name && String(name).split("/").some((p) => p.startsWith("."))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(changed, settleMs);
    });
    w.on("error", () => {});
  } catch { /* no such folder yet: the clock's look still catches it */ }
  return () => { if (timer) clearTimeout(timer); w?.close(); };
}
