// The one tool open inside a sticky (#692 suite step 1, sticky.html's third form): browser · write · list · calendar ·
// ask. Each draws from the block and its folder, nothing invented: the browser is a frame of its own (an iframe stand-in
// in Home: the folder's sites and files as a page; a real browser comes with the run that reads), write is a page the
// hand writes on, list the run's steps, calendar its day, ask its question. Whose hand is on it (its · yours) is the
// kit's Pill; what the tool found sits on the shelf's own layer (blocks.mjs FOUND). On the stage (Lifted.tsx) two sit
// side by side.
import { useMemo, useState } from "react";
import { Pill } from "../../../kit";
import type { Block2, HomeState2, Sticky, Tool } from "../pass2";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** the browser's stand-in page: the folder's sites and files, the block's words marked where they appear */
function pageOf(b: Block2, st: HomeState2): { url: string; html: string } {
  const ctx = ((b.folder ? st.context?.[b.folder] : undefined) ?? []).filter((c) => c.kind === "site" || c.kind === "file");
  const site = ctx.find((c) => c.kind === "site");
  const url = site?.url?.replace(/^https?:\/\//, "") ?? `${(st.folders?.find((f) => f.id === b.folder)?.name ?? "home").replace(/\s+/g, "")}.local`;
  const words = new Set(b.words.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const mark = (s: string) => esc(s).split(/(\s+)/).map((w) => (words.has(w.toLowerCase().replace(/\W/g, "")) ? `<u>${w}</u>` : w)).join("");
  const rows = ctx.length ? ctx.map((c) => `<li>${mark(c.name)}${c.line ? ` <i>· ${esc(c.line)}</i>` : ""}</li>`).join("") : "<li><i>nothing in this folder yet: drop a site or a file on it</i></li>";
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:8px 10px;font:12px/1.5 -apple-system,system-ui,sans-serif;color:#161616;background:#fff}h1{font-size:12px;margin:0 0 4px}ul{margin:0;padding-left:16px}i{opacity:.55;font-style:normal}u{text-decoration:none;background:#f3d36b55}</style><h1>${mark(b.words)}</h1><ul>${rows}</ul>`;
  return { url, html };
}

export function ToolPane({ b, s, st, tool, wide, onHand, onClose }: { b: Block2; s?: Sticky; st: HomeState2; tool: Tool; wide?: boolean; onHand: (hand: "its" | "yours") => void; onClose?: () => void }) {
  const page = useMemo(() => (tool === "browser" ? pageOf(b, st) : null), [tool, b.words, b.folder, st.context]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState("");
  const handed = tool === "browser" || tool === "write";
  const name = tool === "browser" ? page!.url : tool === "write" ? "notes.md" : tool === "list" ? "steps" : tool === "calendar" ? (s?.when ?? "its day") : "it asks";
  return (
    <div className={`pc-tool t-${tool}`} data-pc-tool={tool} data-part={`tool › ${tool}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="pc-bar">
        <b>{tool === "browser" ? "‹ ›" : tool}</b><span className="pc-bar-name">{name}</span>
        {handed && <span className="pc-hand" data-pc-hand={b.hand}><Pill words={["its hand", "your hand"]} picked={b.hand === "yours" ? 1 : 0} h={20} onPick={(i) => onHand(i ? "yours" : "its")} /></span>}
        {onClose && <button type="button" className="pc-x" aria-label="close the tool: back to a sticky" title="back to a sticky" onClick={onClose}>×</button>}
      </div>
      <div className="pc-pane">
        {tool === "browser" && <iframe className="pc-frame" title={page!.url} sandbox="" srcDoc={page!.html} style={{ pointerEvents: b.hand === "yours" ? "auto" : "none" }} data-wide={wide ? "" : undefined} />}
        {tool === "write" && <textarea className="pc-write" value={text} placeholder={b.hand === "yours" ? "write here" : "it writes here as it runs; take the hand to write"} readOnly={b.hand !== "yours"} onChange={(e) => setText(e.target.value)} aria-label="write" />}
        {tool === "list" && <ol className="pc-list">{(s?.steps.length ? s.steps.slice(-5).map((x) => x.line) : ["read the folder", "do the one thing", "say what it made"]).map((l, i) => <li key={i}>{l}</li>)}</ol>}
        {tool === "calendar" && <p className="pc-cal">{s?.when ? `${s.when} · ${b.words}` : "no day yet: say one in its words, or drag it onto the week"}</p>}
        {tool === "ask" && <p className="pc-ask">{s?.ask?.q ?? "nothing to ask you yet; when it needs your word, the question is here"}</p>}
      </div>
    </div>
  );
}
