// The lens (#1088, the designer's): what the explorer is reading right now, drawn, so the person watches the source and
// not a list. One drawing per stop, made only from that stop's own facts (sort.ts `Found`), each fact marked
// `data-lens-fact="<id>"` so the parent can lift it out and carry it to its folder (Folder.tsx `data-piece`).
//   machine   the screens to scale, the apps as tiles under them
//   ai        one disc per AI tool: whole when signed in, a yellow ring when not
//   tools     the connections clicking onto one line
//   calendar  a week, each repeating thing where it sits; the dates to come on a strip under it
//   files     the folders opening by name, their files as marks
//   projects  one card per project
//   browser   the places visited, most used first is the longest bar: the history as she would recognise it
// `shown` are the facts that have appeared so far; `gone` the ones that have left for their folder (they stay as a
// faint trace, so the source never empties). The rail above it is Rail: the seven stops as glyphs.
// A real computer has more than fits (12 sites, 8 projects, 30 files): the lens then follows the reading, moving down
// to keep the newest fact in view, as an eye does; nothing is cut and nothing shrinks. In the week, things at the same
// hour sit under each other, never on top.
import { useEffect, useRef } from "react";
import { FileMark, Glyph, type GlyphName } from "../kit";
import { Screens, daysOf, hourOf, type Scr } from "./Folder";
import type { Found } from "./sort";
import "./lens.css";

export type StopId = "machine" | "ai" | "tools" | "calendar" | "files" | "projects" | "browser";
export const STOPS: readonly [StopId, GlyphName, string][] = [
  ["machine", "terminal", "this computer"], ["ai", "run", "your AI tools"], ["tools", "pin", "what they're connected to"], ["calendar", "calendar", "your calendar"],
  ["files", "files", "your files, by name"], ["projects", "github", "your projects"], ["browser", "web", "the pages you visit"],
];
/** each stop's short name, worn beside its glyph on the ask (Marco's try 2026-11-17: the glyphs alone did not say what they were) */
const SHORT: Record<StopId, string> = { machine: "computer", ai: "AI tools", tools: "connections", calendar: "calendar", files: "files", projects: "projects", browser: "browser" };
export type StopState = "ready" | "wait" | "now" | "done" | "none" | "refused" | "closed";

/** the seven stops as one row of glyphs: under the box they are pressed to close one; while watching they are the route */
export function Rail({ at, states, counts, onPress, named }: { at: StopId | null; states: Partial<Record<StopId, StopState>>; counts: Partial<Record<StopId, number>>; onPress?: (id: StopId) => void; named?: boolean }) {
  return (
    <div className={`obl-rail ${named ? "named" : ""}`} role="list">
      {STOPS.map(([id, glyph, word]) => {
        const st = states[id] ?? "wait";
        return (
          <button key={id} type="button" role="listitem" className={`obl-stop ${st} ${at === id ? "at" : ""}`} data-stop={id} title={st === "closed" ? `${word}: closed to me` : st === "refused" ? `${word}: the computer said no` : word} aria-label={word} onClick={() => onPress?.(id)}>
            <Glyph name={glyph} hover={at === id || st === "done" || st === "ready"} />
            <span>{named ? SHORT[id] : st === "done" ? counts[id] ?? "" : st === "none" ? "–" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

const cls = (f: Found, gone: ReadonlySet<string>) => (gone.has(f.id) ? "gone" : "");
const letter = (s: string) => s.replace(/^(www|mail|docs|drive|calendar)\./, "").trim()[0]?.toUpperCase() ?? "·";
const two = (s: string) => { const w = s.replace(/^Google /, "").replace(/[^\p{L}\p{N} -]/gu, "").trim(), cut = /[a-z][-\s]?([A-Z])|[-\s]([a-z])/.exec(w); return (w[0]?.toUpperCase() ?? "·") + (cut?.[1] ?? cut?.[2] ?? w[1] ?? "").toLowerCase(); };
const visits = (f: Found) => +(/(\d+) visits/.exec(f.src)?.[1] ?? 10);

/** where each repeating thing sits in a day's column, 0 (8am) to 1 (6pm), no two closer than one block */
function slots(fs: readonly Found[]) {
  let last = -1;
  return [...fs].sort((a, b) => (hourOf(a.when) ?? 9) - (hourOf(b.when) ?? 9)).map((f) => { const y = Math.max(last + 0.17, Math.max(0, Math.min(1, ((hourOf(f.when) ?? 9) - 8) / 10))); last = y; return { f, y }; });
}

export function Lens({ stop, shown, gone, screens, paused }: { stop: StopId; shown: readonly Found[]; gone: ReadonlySet<string>; screens: readonly Scr[]; paused?: boolean }) {
  const box = useRef<HTMLDivElement>(null), n = shown.length;
  // follow the reading: the newest fact stays in view when the source is longer than the lens
  useEffect(() => {
    const b = box.current, el = b?.querySelector<HTMLElement>(`[data-lens-fact="${shown[n - 1]?.id}"]`);
    if (!b || !el || b.scrollHeight <= b.clientHeight) return;
    const r = el.getBoundingClientRect(), R = b.getBoundingClientRect(), z = R.height / b.offsetHeight || 1;
    if (r.bottom > R.bottom - 24 || r.top < R.top + 24) b.scrollTo({ top: b.scrollTop + (r.top - R.top) / z - b.clientHeight / 2, behavior: "smooth" });
  }, [n, stop]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className={`obl ${paused ? "paused" : ""}`} data-lens={stop}>
      {/* never empty: a source just opened, nothing read from it yet, is its own glyph in a ring that breathes (no words) */}
      {n === 0 && stop !== "machine" && stop !== "calendar" && <div className="obl-open" data-lens-open><Glyph name={STOPS.find((x) => x[0] === stop)![1]} hover /></div>}
      {stop === "machine" && (
        <div className="obl-machine">
          <div data-lens-fact="screens"><Screens screens={screens} h={120} /></div>
          <div className="obl-tiles">{shown.filter((f) => f.k !== "screens" && f.k !== "name").map((f) => <i key={f.id} data-lens-fact={f.id} className={cls(f, gone)} title={f.v}>{two(f.v)}<span>{f.v}</span></i>)}</div>
        </div>
      )}
      {stop === "ai" && <div className="obl-discs">{shown.map((f) => <div key={f.id} data-lens-fact={f.id} className={`${cls(f, gone)} ${f.signed === false ? "obl-ask" : ""}`}><b>{f.v}</b><span>{f.kind === "session" ? `${f.tool} · ${f.n} session${f.n === 1 ? "" : "s"} · ${f.when}` : f.reach === "export" ? "comes in with its export" : f.signed === false ? "not signed in" : "signed in"}</span></div>)}</div>}
      {stop === "tools" && <div className="obl-plugs"><div className="obl-wire" />{shown.map((f) => <i key={f.id} data-lens-fact={f.id} className={cls(f, gone)}>{two(f.v)}<span>{f.v}</span></i>)}</div>}
      {stop === "calendar" && (
        <div className="obl-cal">
          <div className="obl-week">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="col">
                <span>{d}</span>
                {slots(shown.filter((f) => f.repeats && daysOf(f.when).includes(i))).map(({ f, y }) => <i key={f.id} data-lens-fact={daysOf(f.when)[0] === i ? f.id : undefined} className={cls(f, gone)} style={{ top: `calc(20px + ${y} * (100% - 64px))` }}>{f.v}</i>)}
              </div>
            ))}
          </div>
          <div className="obl-dates">{shown.filter((f) => !f.repeats).map((f) => <i key={f.id} data-lens-fact={f.id} className={cls(f, gone)}><b>{f.when?.replace(/^\w+, /, "").replace(/ \d+(:\d+)?(am|pm)$/i, "")}</b>{f.v}</i>)}</div>
        </div>
      )}
      {stop === "files" && (() => {
        const dirOf = (f: Found) => f.src.split("/").slice(0, 2).join("/"), dirs = [...new Set(shown.map(dirOf))], names = new Set(dirs.map((d) => d.split("/").pop()));
        // a folder that only repeats a folder already drawn (Documents › Training, then Training) is noise: left out
        const inDir = (d: string) => shown.filter((f) => dirOf(f) === d && !(f.k === "folder" && names.has(f.v)));
        return (
          <div className="obl-tree">
            {dirs.filter((d) => inDir(d).length).map((dir) => (
              <div key={dir} className="dir">
                <span><Glyph name="files" hover />{dir.split("/").pop()}</span>
                <div>{inDir(dir).map((f) => <i key={f.id} data-lens-fact={f.id} className={cls(f, gone)}>{f.k === "folder" ? <Glyph name="files" /> : <FileMark ext={/brief|notes/i.test(f.v) ? "md" : "pdf"} h={24} />}<em>{f.v}</em></i>)}</div>
              </div>
            ))}
          </div>
        );
      })()}
      {stop === "projects" && <div className="obl-repos">{shown.map((f) => <div key={f.id} data-lens-fact={f.id} className={cls(f, gone)}><Glyph name="github" hover /><b>{f.v}</b><span>{f.owner ?? f.src}</span></div>)}</div>}
      {stop === "browser" && (() => { const top = Math.max(1, ...shown.map(visits)); return (
        <div className="obl-sites">
          {shown.map((f) => <div key={f.id} data-lens-fact={f.id} className={cls(f, gone)}><i>{letter(f.v)}</i><b>{f.v.replace(/^www\./, "")}</b><span className="obl-bar"><em style={{ width: `${Math.max(6, (visits(f) / top) * 100)}%` }} /></span></div>)}
        </div>
      ); })()}
    </div>
  );
}
