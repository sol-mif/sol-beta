// Marks (Marco 2026-11-07): a way to point at the interface itself. Hold option and click anywhere: a numbered pin lands
// there with a field; enter keeps the note, esc drops the pin. The pins stay over the window (⌥⌘M hides and shows them;
// × on a pin removes it) and the day's list is written as markdown to the sol repo, mine/marks/<day>.md, through the
// engine's work.write, so the agent reads what Marco pointed at: where (x,y of the window), what (the place, the kind,
// the words under the pointer), and the note. Nothing of this leaves the machine.
import { useEffect, useRef, useState } from "react";
import "./marks.css";

type Mark = { n: number; x: number; y: number; where: string; what: string; note: string; at: string };
const REPO = "~/computer/personal/projects/sol";   // the engine reads ~ as the home folder
const day = () => new Date().toISOString().slice(0, 10);
const KEY = () => `sol.marks.${day()}`;
const read = (): Mark[] => { try { return JSON.parse(localStorage.getItem(KEY()) ?? "[]"); } catch { return []; } };

function describe(el: Element | null): { where: string; what: string } {
  const place = el?.closest<HTMLElement>("[data-place]")?.dataset.place ?? "window";
  const thing = el?.closest<HTMLElement>("[data-thing]");
  const kind = thing?.dataset.kind ?? (el as HTMLElement | null)?.tagName.toLowerCase() ?? "";
  const cls = (el as HTMLElement | null)?.className?.toString().split(/\s+/).filter(Boolean).slice(0, 2).join(".") ?? "";
  const words = (thing ?? el)?.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
  return { where: place, what: `${kind}${cls ? "." + cls : ""}${words ? ` "${words}"` : ""}` };
}
const md = (ms: Mark[]) => `# Marks · ${day()}\n\nHold option and click in Sol; one line a pin. x,y are of the window.\n\n${ms.map((m) => `- [ ] ${m.n} · ${m.at.slice(11, 16)} · at ${m.x}%,${m.y}% · ${m.where} · ${m.what} · **${m.note}**`).join("\n")}\n`;

export function Marks({ send }: { send: (o: object) => boolean }) {
  const [marks, setMarks] = useState<Mark[]>(read);
  const [shown, setShown] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const write = (ms: Mark[]) => {
    try { localStorage.setItem(KEY(), JSON.stringify(ms)); } catch { /* private */ }
    send({ type: "work.write", rid: `marks-${Date.now()}`, cwd: REPO, path: `mine/marks/${day()}.md`, text: md(ms) });
  };
  useEffect(() => {
    const click = (ev: MouseEvent) => {
      if (!ev.altKey || ev.metaKey || ev.ctrlKey) return;
      if ((ev.target as Element | null)?.closest(".mk-pin")) return;
      ev.preventDefault(); ev.stopPropagation();
      const x = Math.round((ev.clientX / innerWidth) * 1000) / 10, y = Math.round((ev.clientY / innerHeight) * 1000) / 10;
      const n = (marks[marks.length - 1]?.n ?? 0) + 1;
      const m: Mark = { n, x, y, note: "", at: new Date().toISOString(), ...describe(ev.target as Element) };
      setMarks((ms) => [...ms, m]); setShown(true); setEditing(n);
      requestAnimationFrame(() => field.current?.focus());
    };
    const key = (ev: KeyboardEvent) => { if (ev.altKey && ev.metaKey && ev.key.toLowerCase() === "m") { ev.preventDefault(); setShown((s) => !s); } };
    window.addEventListener("click", click, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("click", click, true); window.removeEventListener("keydown", key); };
  }, [marks]);
  const keep = (n: number, note: string) => { const ms = marks.map((m) => (m.n === n ? { ...m, note } : m)); setMarks(ms); setEditing(null); write(ms); };
  const drop = (n: number) => { const ms = marks.filter((m) => m.n !== n); setMarks(ms); setEditing(null); write(ms); };
  if (!shown || !marks.length) return null;
  return (
    <div className="mk" aria-label="marks">
      {marks.map((m) => (
        <div key={m.n} className={`mk-pin ${editing === m.n ? "edit" : ""}`} style={{ left: `${m.x}%`, top: `${m.y}%` }} title={`${m.where} · ${m.what}`}>
          <b onClick={() => setEditing(editing === m.n ? null : m.n)}>{m.n}</b>
          {editing === m.n
            ? <input ref={field} defaultValue={m.note} placeholder="what is wrong here, or what you want" onKeyDown={(ev) => { if (ev.key === "Enter") keep(m.n, ev.currentTarget.value.trim()); if (ev.key === "Escape") { if (m.note) setEditing(null); else drop(m.n); } }} />
            : <span onClick={() => setEditing(m.n)}>{m.note || "…"}</span>}
          <i onClick={() => drop(m.n)} title="drop it">×</i>
        </div>
      ))}
    </div>
  );
}
