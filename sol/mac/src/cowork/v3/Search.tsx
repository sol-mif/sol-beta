// Cowork v3, slice 7 (fr-30, #560): one search. One field in the bar, over every project of mine (or the one I am in):
// items, loose things, artifacts, Talk, the trail and place titles, folded by the engine (team/v3/search.ts). Results
// come back grouped by kind, each in the shape it has everywhere (whose face, its title, where it lives); one press
// opens it, Enter opens the first, Esc closes. Two letters at least.
import { useEffect, useRef, useState } from "react";
import { Glyph } from "../Room";
import { Marks } from "./SevenMarks";
import { ask, kindGlyph, when, type Groups, type Hit, type HitKind } from "./seven";
import "./seven.css";

const GROUP_WORD: Record<HitKind, string> = { item: "Items", artifact: "Artifacts", loose: "In the space", talk: "Talk", place: "Places", trail: "The trail" };

export function Search({ project, projectName, names, me, onOpen }: {
  /** the project in use, to search only it; none = all of mine */
  project?: string; projectName?: string;
  /** a project's name by its id, for the mark on a result from another project */
  names: Record<string, string>;
  me: string; onOpen: (h: Hit) => void;
}) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(!!project);
  const [res, setRes] = useState<Groups | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const turn = useRef(0);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes(null); return; }
    const n = ++turn.current;
    const h = window.setTimeout(async () => {
      const r = await ask<Groups>("team.v3.search.query", { q: t, ...(only && project ? { project } : {}) });
      if (n === turn.current && !r.error) setRes(r);
    }, 90);
    return () => window.clearTimeout(h);
  }, [q, only, project]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (q && box.current && !box.current.contains(e.target as Node)) setQ(""); };
    const key = (e: KeyboardEvent) => { if (e.metaKey && e.key.toLowerCase() === "f" && !e.shiftKey) { e.preventDefault(); input.current?.focus(); input.current?.select(); } };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("keydown", key); };
  }, [q]);
  const open = (h: Hit) => { setQ(""); input.current?.blur(); onOpen(h); };
  const first = res?.groups[0]?.hits[0];
  const on = q.trim().length > 1;
  return (
    <div ref={box} className={`s7 s7-search ${on ? "on" : ""}`}>
      <svg className="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
      <input ref={input} type="search" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
        placeholder={only && project ? `Find in ${projectName ?? "this project"}` : "Find anything"}
        onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } if (e.key === "Enter" && first) open(first); }} />
      {project && <button className={`s7-scope ${only ? "on" : ""}`} onClick={() => setOnly((o) => !o)} title={only ? "only this project: press for all of mine" : "all of mine: press for only this project"}>{only ? "here" : "all"}</button>}
      {on && res && (
        <div className="s7-res" role="listbox" aria-label="results">
          {res.groups.length === 0 && <div className="s7-sr-none">Nothing with “{q.trim()}”.</div>}
          {res.groups.map((g) => (
            <div key={g.kind} className="s7-grp">
              <div className="s7-grp-k"><Glyph kind={kindGlyph(g.kind)} size={12} />{GROUP_WORD[g.kind]}</div>
              {g.hits.map((h) => (
                <button key={`${h.kind}:${h.id}`} role="option" aria-selected={h === first} className={`s7-sr ${h === first ? "first" : ""}`} onClick={() => open(h)}>
                  <span className="t">{h.kind === "talk" ? `“${h.title}”` : h.title}</span>
                  <span className="d">{when(h.at)}</span>
                  {(!only || !project) && <span className="pm" title={names[h.project] ?? h.project}>{(names[h.project] ?? h.project).slice(0, 14)}</span>}
                  <Marks whose={h.whose} place={h.place} me={me} agent={h.agent} size={16} />
                </button>
              ))}
            </div>
          ))}
          <div className="s7-sr-foot">{res.total} found · {res.ms} ms</div>
        </div>
      )}
    </div>
  );
}
