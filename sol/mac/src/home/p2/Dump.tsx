// The dump (#692, pieces/dump.mjs, moves.mjs mo-finish), slice B of the pass 2 build: the notes pane where Marco writes
// everything he has to do, like a notes app: several lines, paragraphs, paste. Each line or paragraph is read when he
// leaves it (Enter at its end, or a second and a half's pause) with home.dump.line, and becomes a sticky; within a
// second its mark sits at the line's end, in set ink: where it went (folder · when) and what is happening ("starting",
// "needs you"). Editing a read line sends it again (the engine refiles or restarts); emptying it stops its sticky.
// Finish: after the pause, ghost ink from home.ink (slice F's engine) completes the line behind the caret; Tab keeps it,
// typing over it or Esc drops it. The composer's bar writes to the same dump (Home.tsx sends home.dump.line); its lines
// land here like his own.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Ink } from "../../kit";
import { composing } from "../../ime";
import type { Metas } from "../meta";
import type { DumpLine as Line0, Home2Api, Sticky } from "./pass2";
import { inked, markOf, type Mark } from "./Stickies";
import "./dump.css";

export const meta = {
  Dump: {
    job: "the notes pane, the front door: write everything; each line is read, filed, scheduled or started, and says where it went",
    flow: "say",
    states: ["empty", "typing", "a line read: folder · when · starting", "a line needs me: yellow, its question on a click", "a line running", "a line done", "a line that cannot start", "ghost ink after a pause"],
    keys: [
      { press: "type, Enter at a line's end", does: "the line is read into a sticky (home.dump.line); a new line opens under it", goal: "say" },
      { press: "stop typing a second and a half", does: "the line is read where it is; ghost ink may finish it", goal: "say" },
      { press: "Shift+Enter", does: "a new line inside the same paragraph" },
      { press: "Tab on ghost ink", does: "keeps it (home.move keep); the line is read again", faster: true, goal: "say" },
      { press: "Esc, or type over ghost ink", does: "drops it" },
      { press: "empty a read line, or Backspace on an empty one", does: "its sticky stops (home.dump.remove); what it made stays" },
      { press: "hover a line's mark", does: "why it went that way, in one sentence" },
      { press: "click a yellow mark", does: "the question on the line; one tap answers (home.sticky.answer)", goal: "answer" },
      { press: "drag a line onto a folder in the side", does: "refiles its sticky (home.sticky.move)" },
      { press: "⌘N", does: "the caret in the composer's bar (Home.tsx's key), which writes to this dump", faster: true, goal: "say" },
      { press: "↑ at a line's start, ↓ at its end", does: "the line before, the line after" },
    ],
    listens: ["home.state › dump, stickies, folders", "home.step", "home.ink (ghost, for this pane's lines)"],
  },
  LineMark: {
    job: "a read line's mark at its end: the ring, folder · when · what is happening; why on hover; a yellow one opens its question",
    flow: "answer",
    states: ["starting", "running", "made", "needs you", "the question open", "cannot start", "done", "scheduled, paused or later"],
    keys: [{ press: "click a yellow mark, then a chip", does: "answers it (home.sticky.answer)", goal: "answer" }],
    listens: ["home.state › stickies"],
  },
} satisfies Metas;

/** a block of the pane: one line or paragraph; `id` once the engine read it, `sent` the words it read */
/** a dump line as the reader sends it: engine.md's DumpLine, with the folder and the day it went to */
type DumpLine = Line0 & { folder?: string; when?: string | null };
type Block = { key: string; id?: string; text: string; sent?: string };
type ReadReply = { type: string; line?: DumpLine; lines?: { line: DumpLine }[] };

const PAUSE = 1500;
let seq = 0;
const fresh = (): Block => ({ key: `n${++seq}`, text: "" });
const oldestFirst = (d: DumpLine[]): DumpLine[] => d.slice().reverse();

export function Dump({ h, folder }: { h: Home2Api; /** a folder's notes: the dump filtered to it, new lines filed there */ folder?: string }) {
  const st = h.st;
  const [blocks, setBlocks] = useState<Block[]>(() => [...(oldestFirst((st?.dump ?? []) as DumpLine[]).filter((l) => !folder || l.folder === folder).slice(-40).map((l) => ({ key: l.id, id: l.id, text: l.text, sent: l.text }))), fresh()]);
  const [focus, setFocus] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ key: string; text: string; doubts?: { span: string; why: string; alts: string[] }[] } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const areas = useRef(new Map<string, HTMLTextAreaElement>());
  const timers = useRef(new Map<string, number>());
  const pending = useRef(new Set<string>());
  /** the dump line ids a block of this pane already holds (set as the reply lands, before the block shows it) */
  const claimed = useRef(new Set<string>());
  const live = useRef(blocks); live.current = blocks;

  // the engine's dump into the pane: a line read elsewhere (the composer's bar, another window) lands above the caret
  useEffect(() => {
    const lines = oldestFirst((st?.dump ?? []) as DumpLine[]).filter((l) => !folder || l.folder === folder);
    setBlocks((bs) => {
      const have = new Set([...bs.map((b) => b.id).filter(Boolean), ...claimed.current]);
      const ids = new Set(lines.map((l) => l.id));
      const busy = [...pending.current];
      let out = bs.filter((b) => !b.id || ids.has(b.id) || b.key === focus);
      // a read line's words, changed by the engine (an edit from elsewhere), when he is not in it
      out = out.map((b) => { const l = b.id ? lines.find((x) => x.id === b.id) : null; return l && b.key !== focus && b.text === b.sent && l.text !== b.sent ? { ...b, text: l.text, sent: l.text } : b; });
      const add = lines.filter((l) => !have.has(l.id) && !busy.some((p) => p.includes(l.text))).map((l) => ({ key: l.id, id: l.id, text: l.text, sent: l.text }));
      if (add.length) {
        let tail = out.length; while (tail > 0 && !out[tail - 1].id) tail--;
        out = [...out.slice(0, tail), ...add, ...out.slice(tail)];
      }
      if (!out.length || out[out.length - 1].id || out[out.length - 1].text.trim()) out = [...out, fresh()];
      return out.length === bs.length && out.every((b, i) => b === bs[i]) ? bs : out;
    });
  }, [st?.dump, folder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ghost ink for the line he is in (slice F's engine streams it; absent, nothing shows)
  useEffect(() => h.on("home.ink", (m: { target?: string; ink?: string; text?: string; doubts?: { span: string; why: string; alts: string[] }[] }) => {
    if (m.ink !== "ghost" || !m.target || !m.text) return;
    const target = m.target, t = m.text;
    setGhost((g) => {
      if (!live.current.some((b) => b.key === target)) return g;
      const prev = g && g.key === target ? g.text : "";
      return { key: target, text: t.startsWith(prev) ? t : prev + t, doubts: m.doubts };
    });
  }), [h.on]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...p } : b)));
  const focusAt = (key: string, at: "start" | "end" | number) => requestAnimationFrame(() => {
    const el = areas.current.get(key); if (!el) return;
    el.focus(); const n = at === "start" ? 0 : at === "end" ? el.value.length : at; el.setSelectionRange(n, n);
  });

  /** read a block: new, edited, or emptied */
  const read = useCallback(async (key: string) => {
    clearTimeout(timers.current.get(key));
    const b = live.current.find((x) => x.key === key); if (!b) return;
    const text = b.text.trim();
    if (!text) {
      if (b.id) { h.send({ type: "home.dump.remove", line: b.id }); patch(key, { id: undefined, sent: undefined }); }
      return;
    }
    if (text === b.sent || pending.current.has(text)) return;
    pending.current.add(text);
    const r = await h.ask<ReadReply>({ type: "home.dump.line", text, at: new Date().toISOString(), ...(b.id ? { line: b.id } : {}), ...(folder ? { folder } : {}) });
    const more = (r?.lines ?? []).slice(1).map((x) => x.line);
    if (r?.line) for (const l of [r.line, ...more]) claimed.current.add(l.id);
    pending.current.delete(text);
    if (!r?.line) return;
    setBlocks((bs) => {
      const at = bs.findIndex((x) => x.key === key); if (at < 0) return bs;
      const cur = bs[at];
      // he typed on while it was read: keep his words, the engine reads them again on the next pause
      const one: Block = { ...cur, id: r.line!.id, sent: r.line!.text, text: more.length ? r.line!.text : cur.text };
      const known = new Set(bs.map((x) => x.id));
      const extra = more.filter((l) => !known.has(l.id)).map((l) => ({ key: l.id, id: l.id, text: l.text, sent: l.text }));
      const out = bs.filter((x, i) => i === at || !x.id || (x.id !== r.line!.id && !more.some((l) => l.id === x.id)));
      const i2 = out.findIndex((x) => x.key === key);
      out.splice(i2, 1, one, ...extra);
      return out;
    });
  }, [h.ask, h.send, folder]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusRef = useRef<string | null>(null); focusRef.current = focus;
  const ghostRef = useRef(ghost); ghostRef.current = ghost;
  const dumpRef = useRef(st?.dump); dumpRef.current = st?.dump;

  /** finish: after a pause in the line he is in, ask for ghost ink (three words or more), from the folder it went to */
  const finish = (key: string) => {
    const b = live.current.find((x) => x.key === key);
    if (!b || key !== focusRef.current || ghostRef.current?.key === key) return;
    const text = b.text.trim();
    if (text.split(/\s+/).length < 3) return;
    const went = b.id ? ((dumpRef.current ?? []) as DumpLine[]).find((l) => l.id === b.id)?.folder : undefined;
    h.send({ type: "home.move", move: "finish", folder: went ?? folder, target: key, input: { text } });
  };

  const onChange = (key: string, text: string) => {
    patch(key, { text });
    if (ghost?.key === key) setGhost(null);
    clearTimeout(timers.current.get(key));
    timers.current.set(key, window.setTimeout(() => void read(key).then(() => finish(key)), PAUSE));
  };

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>, b: Block, i: number) => {
    const el = ev.currentTarget, at = el.selectionStart, end = el.selectionEnd, n = el.value.length;
    if (composing(ev)) return;
    if (ev.key === "Tab" && ghost?.key === b.key) {
      ev.preventDefault();
      const kept = b.text + ghost.text;
      h.send({ type: "home.move", move: "keep", folder, target: b.key, input: { text: ghost.text } });
      setGhost(null); patch(b.key, { text: kept }); focusAt(b.key, kept.length);
      live.current = live.current.map((x) => (x.key === b.key ? { ...x, text: kept } : x));
      void read(b.key);
      return;
    }
    if (ev.key === "Escape" && ghost?.key === b.key) { ev.preventDefault(); ev.stopPropagation(); setGhost(null); return; }
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      if (!b.text.trim()) return;
      setGhost(null);
      const left = b.text.slice(0, at), right = b.text.slice(end);
      const nb = fresh(); nb.text = right.replace(/^\s+/, "");
      if (right.trim()) { patch(b.key, { text: left.replace(/\s+$/, "") }); live.current = live.current.map((x) => (x.key === b.key ? { ...x, text: left.replace(/\s+$/, "") } : x)); }
      void read(b.key);
      const next = blocks[i + 1];
      if (!right.trim() && next && !next.id && !next.text.trim()) { focusAt(next.key, "start"); return; }
      setBlocks((bs) => { const j = bs.findIndex((x) => x.key === b.key); const out = bs.slice(); out.splice(j + 1, 0, nb); return out; });
      focusAt(nb.key, "start");
      if (nb.text.trim()) timers.current.set(nb.key, window.setTimeout(() => void read(nb.key), PAUSE));
      return;
    }
    if (ev.key === "Backspace" && at === 0 && end === 0 && !b.text && i > 0) {
      ev.preventDefault();
      if (b.id) h.send({ type: "home.dump.remove", line: b.id });
      const prev = blocks[i - 1];
      setBlocks((bs) => bs.filter((x) => x.key !== b.key));
      focusAt(prev.key, "end");
      return;
    }
    if (ev.key === "ArrowUp" && at === 0 && end === 0 && i > 0) { ev.preventDefault(); focusAt(blocks[i - 1].key, "end"); return; }
    if (ev.key === "ArrowDown" && at === n && end === n && i < blocks.length - 1) { ev.preventDefault(); focusAt(blocks[i + 1].key, "start"); return; }
  };

  const byLine = useMemo(() => new Map(((st?.dump ?? []) as DumpLine[]).map((l) => [l.id, l])), [st?.dump]);
  const byId = useMemo(() => new Map((st?.stickies ?? []).map((s) => [s.id, s])), [st?.stickies]);
  if (!st) return null;
  const k = folder ? `notes · ${st.folders?.find((f) => f.id === folder)?.name ?? "this folder"}` : "notes · write everything here";
  const empty = blocks.length === 1 && !blocks[0].text;

  return (
    <section className="p2-tile p2-dump" data-p2="dump" aria-label="notes">
      <div className="du-k"><span>{k}</span>{empty && <span className="du-hint">what's on your mind, in your words; each line goes somewhere</span>}</div>
      <div className="du-page" data-du-page>
        {blocks.map((b, i) => {
          const l = b.id ? byLine.get(b.id) : undefined, s = l?.sticky ? byId.get(l.sticky) : undefined;
          const g = ghost?.key === b.key ? ghost : null;
          const mark = s ? markOf(s, st) : l ? { tone: "fresh", where: "", step: "read" } as Mark : null;
          return (
            <div key={b.key} className={`du-line${s ? ` t-${mark!.tone}` : ""}${focus === b.key ? " here" : ""}`} data-du-line={b.id ?? ""} data-state={s?.state ?? ""} data-part={b.id ? `notes › ${b.text.slice(0, 40)}` : undefined}
              draggable={!!s && focus !== b.key} onDragStart={(ev) => { if (!s) return; ev.dataTransfer.setData("text/sol-sticky", s.id); ev.dataTransfer.effectAllowed = "move"; }}>
              <div className="du-text">
                <div className="du-mirror" aria-hidden><span className="du-hide">{b.text}</span>{g && <Ink k="ghost">{g.doubts?.length ? inked(g.text, g.doubts) : g.text}</Ink>}{"​"}</div>
                <textarea ref={(el) => { if (el) areas.current.set(b.key, el); else areas.current.delete(b.key); }}
                  value={b.text} rows={1} spellCheck={false} aria-label={b.id ? `a line: ${b.text}` : "a new line"} data-du-input={b.key}
                  placeholder={i === blocks.length - 1 && !b.text ? (blocks.length > 1 ? "and…" : "bio exam thursday, make notes from the slides") : ""}
                  onChange={(ev) => onChange(b.key, ev.target.value)} onKeyDown={(ev) => onKey(ev, b, i)}
                  onFocus={() => setFocus(b.key)} onBlur={() => { setFocus((f) => (f === b.key ? null : f)); if (ghost?.key === b.key) setGhost(null); void read(b.key); }}
                  onPaste={() => { clearTimeout(timers.current.get(b.key)); timers.current.set(b.key, window.setTimeout(() => void read(b.key), 60)); }} />
              </div>
              {s && mark && <LineMark s={s} m={mark} why={l?.why ?? s.filing.why} open={asking === s.id} onOpen={() => setAsking(asking === s.id ? null : s.id)}
                onAnswer={(o) => { h.send({ type: "home.sticky.answer", sticky: s.id, option: o }); setAsking(null); }} />}
              {!s && l && <small className="du-mark t-fresh" data-du-mark><span className="du-ring look" />read</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** a line's mark at its end: the ring, folder · when · what is happening; hover says why; a yellow one opens its question */
function LineMark({ s, m, why, open, onOpen, onAnswer }: { s: Sticky; m: Mark; why: string; open: boolean; onOpen: () => void; onAnswer: (o: string) => void }) {
  const asks = s.state === "asks" && !!s.ask;
  return (
    <div className="du-markbox">
      <small className={`du-mark t-${m.tone}`} data-du-mark title={why} role={asks ? "button" : undefined} tabIndex={asks ? 0 : -1}
        onClick={asks ? onOpen : undefined} onKeyDown={(ev) => { if (asks && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onOpen(); } }}>
        {/* the line's ring is drawn in css, filled as far as the sticky's: the kit's Ring (one drawing surface each) stays on the sticky itself */}
        <span className={`du-ring ${m.tone}`} style={{ ["--fill" as string]: `${Math.round((m.fill ?? 0) * 100)}%` }} />
        <Ink k="set"><b>{m.where}</b>{m.step ? ` · ${m.step}` : ""}</Ink>
      </small>
      <small className="du-why" data-du-why>{why}</small>
      {asks && open && (
        <div className="du-ask" data-du-ask>
          <span>{s.ask!.q}</span>
          {s.ask!.options.map((o, i) => <button key={o} className={`du-chip${i === 0 ? " first" : ""}`} onClick={() => onAnswer(o)}>{o}</button>)}
        </div>
      )}
    </div>
  );
}
