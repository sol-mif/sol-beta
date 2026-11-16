// #954 (whole.html scene 12, the IDE lens behind stage.whole): the project's tree in the file column, 196 wide, never
// over the blocks. A folder opens in place (▸ ▾, its entries read once); a file opens in the file pane (FilePane.tsx,
// read and edit in place) with "‹ the tree" to come back. The engine reads the folders (work.read on a folder lists it).
import { useCallback, useEffect, useState } from "react";
import type { Work } from "./useWork";
import { FilePane, type FileAt } from "./FilePane";

type Read = { dir?: boolean; entries?: string[]; error?: string };

export function FileTree({ w, cwd, onAttach, flash }: { w: Work; cwd?: string; onAttach: (path: string) => void; flash: (s: string) => void }) {
  const [kids, setKids] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [at, setAt] = useState<FileAt | null>(null);
  const read = useCallback(async (dir: string) => {
    if (!cwd) return;
    const r = await w.ask<Read>("work.read", { cwd, path: dir }).catch(() => null);
    if (r?.dir) setKids((k) => ({ ...k, [dir]: r.entries ?? [] }));
  }, [w, cwd]);
  useEffect(() => { setKids({}); setOpen(new Set()); setAt(null); if (cwd) void read(cwd); }, [cwd, read]);
  if (at) return (
    <div className="wtree-file">
      <button className="wtree-back" onClick={() => setAt(null)}>‹ the tree</button>
      <FilePane w={w} cwd={cwd} at={at} onAttach={onAttach} flash={flash} />
    </div>
  );
  const root = (cwd ?? "").replace(/\/$/, "");
  const rows = (dir: string, depth: number): React.ReactNode[] => (kids[dir] ?? []).flatMap((e) => {
    const p = `${dir}/${e.replace(/\/$/, "")}`, isDir = e.endsWith("/"), on = open.has(p);
    const row = (
      <button key={p} className="wtree-row" style={{ paddingLeft: `calc(var(--s2) + ${depth} * var(--s3))` }} title={p.slice(root.length + 1)}
        onClick={() => {
          if (!isDir) { setAt({ path: p, n: Date.now() }); return; }
          setOpen((o) => { const n = new Set(o); if (on) n.delete(p); else n.add(p); return n; });
          if (!on && !kids[p]) void read(p);
        }}>
        <span className="wtree-tw" aria-hidden>{isDir ? (on ? "▾" : "▸") : ""}</span>{e.replace(/\/$/, "")}
      </button>
    );
    return isDir && on ? [row, ...rows(p, depth + 1)] : [row];
  });
  return (
    <div className="wtree" role="tree" aria-label="the project's files">
      {cwd ? <div className="wtree-top">{root.split("/").pop()}</div> : null}
      {rows(root, 0)}
    </div>
  );
}
