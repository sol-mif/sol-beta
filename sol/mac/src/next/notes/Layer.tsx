// The notes on the canvas (BR1, frame.html part 6: a note is a session you haven't sent). Its own layer over the plane,
// in plane units through the camera (cv toScreen), so the plane's files stay the bar helper's. A note is cream, with a
// dashed folder mark while loose; it is saved as typed, takes move (its top line), resize (its corner) and ⋯ (Send ·
// Into a folder · Delete, with Undo), and folds to one line when the camera is far. Dragged, it arms a session or a folder
// after a pause (drop.ts) and, let go there, is held 5 s with Undo before it is sent. New note is the bar's Add › Note, Gather notes its Arrange (the join). A new-session card left with words becomes
// a note; left empty, it is gone. The moves are cv/moves/notes.ts; the store's part D.notes (cv/wire/notes.ts).
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { D, M, S, render, rectOn, regionOf, useNext } from "../cv/index.ts";
import { focusId } from "../near/runs.ts";
import { closeStarter } from "../cv/moves/near.ts";
import { tintOf } from "../plane/layout.ts";
import { firstLine, sayHeld, type Note, type Notes } from "./read.ts";
import { land, snapshot, subscribe, track } from "./drop.ts";
import { N } from "../cv/moves/notes.ts";
import { Overlay, Pop } from "../Overlay.tsx";
import { boxOf } from "../layers.ts";
import { frame } from "../frame.tsx";
import "./notes.css";

const SAVE_MS = 400, SAID_MS = 6000;
const tint = (rid: string | null) => (rid ? `pl-t${Math.max(0, tintOf(rid))}` : "");

function NoteCard({ n }: { n: Note }) {
  const cam = useNext((_d, s) => s.cam);
  const [menu, setMenu] = useState<"" | "main" | "folders">("");
  const [drag, setDrag] = useState<{ dx: number; dy: number; dw: number; dh: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const more = useRef<HTMLButtonElement | null>(null);
  const moreAt = () => (more.current ? boxOf(more.current) : null);
  useEffect(() => { if (S.noteFocus === n.id) { area.current?.focus(); S.noteFocus = null; } }, [n.id]);
  if (n.x == null || n.y == null) return null;
  const r = rectOn({ x: n.x + (drag?.dx ?? 0), y: n.y + (drag?.dy ?? 0), w: n.w + (drag?.dw ?? 0), h: n.h + (drag?.dh ?? 0) }, cam);
  const z = cam.z, folded = n.w * z < 150;
  const typed = (v: string) => {
    n.text = v; render();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => M.note_write(n.id, v), SAVE_MS);
  };
  // move by the top line, resize by the corner: the screen's pixels back into plane units
  const grab = (e: React.PointerEvent, how: "move" | "size") => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
      setDrag(how === "move" ? { dx, dy, dw: 0, dh: 0 } : { dx: 0, dy: 0, dw: Math.max(160 - n.w, dx), dh: Math.max(100 - n.h, dy) });
      if (how === "move" && n.text.trim()) track(ev.clientX, ev.clientY, { kind: "note", id: n.id });
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
      const t = land();
      setDrag(null);
      if (t === "esc" || Math.abs(dx) + Math.abs(dy) < 3 / z) return;
      if (how === "size") { M.note_move(n.id, n.x!, n.y!, Math.max(160, n.w + dx), Math.max(100, n.h + dy)); return; }
      if (t) { M.note_give(n.id, t.to, t.kind, t.name); return; }
      M.note_move(n.id, n.x! + dx, n.y! + dy);
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const folders = D.regions;
  if (folded) {
    return (
      <div className={`nt-line ${tint(n.folder)}`} data-note={n.id} style={{ left: r.x, top: r.y }} onPointerDown={(e) => grab(e, "move")} title={n.text}>
        <span className={`nt-fc${n.folder ? "" : " loose"}`} />{firstLine(n.text) || "note"}
      </div>
    );
  }
  return (
    <div className={`nt-card ${tint(n.folder)}`} data-note={n.id} style={{ left: r.x, top: r.y, width: n.w, height: n.h, transform: `scale(${z})` }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="nt-k" onPointerDown={(e) => grab(e, "move")}><span className={`nt-fc${n.folder ? "" : " loose"}`} />note · not sent{n.folder ? ` · ${regionOf(n.folder)?.name ?? ""}` : ""}</div>
      <textarea ref={area} className="nt-words" value={n.text} placeholder="Write it down. Send it when it is ready." aria-label="The note's words"
        onChange={(e) => typed(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && n.text.trim()) { e.preventDefault(); M.note_write(n.id, n.text); M.note_send(n.id, "new"); } }}
        onBlur={() => { if (!n.text.trim()) { N().notes = N().notes.filter((x) => x.id !== n.id); if (timer.current) clearTimeout(timer.current); M.note_write(n.id, ""); } }} />
      <div className="nt-acts">
        <button className="y" disabled={!n.text.trim()} onClick={() => { M.note_write(n.id, n.text); M.note_send(n.id, "new"); }}>Chat with AI about this ↵</button>
        <button ref={more} className="nt-more" aria-haspopup="menu" aria-expanded={!!menu} title="More" onClick={() => setMenu(menu ? "" : "main")}>⋯</button>
      </div>
      {menu === "main" ? (
        <Pop className="nt-menu" role="menu" anchor={moreAt} prefer="above">
          <button role="menuitem" disabled={!n.text.trim()} onClick={() => { setMenu(""); M.note_send(n.id, "new"); }}>Send</button>
          <button role="menuitem" disabled={!n.text.trim() || !folders.length} onClick={() => setMenu("folders")}>Into a folder ›</button>
          <button role="menuitem" onClick={() => { setMenu(""); M.note_delete(n.id); }}>Delete</button>
        </Pop>
      ) : menu === "folders" ? (
        <Pop className="nt-menu" role="menu" anchor={moreAt} prefer="above">
          {folders.map((f) => <button key={f.id} role="menuitem" onClick={() => { setMenu(""); M.note_send(n.id, f.id); }}><span className={`nt-fc ${tint(f.id)}`} />{f.name}</button>)}
          <button role="menuitem" onClick={() => setMenu("main")}>‹ Back</button>
        </Pop>
      ) : null}
      <span className="nt-size" aria-hidden onPointerDown={(e) => grab(e, "size")} />
    </div>
  );
}

/** the frame's line for the notes: an Undo, what a send became, or a refusal */
function Said() {
  const w = useNext((d) => d.notes as Notes | undefined);
  const [gone, setGone] = useState<string>("");
  const said = w?.said ?? null, undo = w?.undo ?? null, note = w?.note ?? null;
  const key = `${said}|${undo ? JSON.stringify(undo).length : 0}|${note}`;
  useEffect(() => { if (!said) return; const t = setTimeout(() => { setGone(key); }, SAID_MS); return () => clearTimeout(t); }, [key, said]);
  // a session's move keeps its Undo as long as its line shows
  useEffect(() => { if (gone === key && undo?.kind === "moved") { N().undo = null; render(); } }, [gone, key, undo]);
  const what = !undo ? "" : undo.kind === "note" ? "Note deleted" : undo.kind === "gather" ? "Notes gathered" : undo.kind === "held" ? sayHeld({ kind: undo.target, name: undo.name }) : "";
  const shown = !w || (!said && !undo && !note) || (gone === key && !undo) ? null
    : { text: [note || (said && gone !== key ? said : ""), what].filter(Boolean).join(" · "), act: undo ? { label: "Undo", run: () => { M.note_undo(); } } : undefined };
  // on the frame's line (frame.tsx), never a toast over the canvas
  useEffect(() => { frame.hold("notes", shown); }, [shown?.text, !!shown?.act, !!shown]);
  useEffect(() => () => frame.hold("notes", null), []);
  return null;
}

/** while something is dragged: the armed target's ring (a session) or dashed outline (a folder), and what letting go
 *  there will do, under the pointer */
function Armed() {
  const a = useSyncExternalStore(subscribe, snapshot);
  if (!a.armed) return null;
  const r = a.armed.rect;
  // in the pop-ups' layer (Overlay.tsx), on screen coordinates: over the pieces, under the frame
  return (
    <Overlay>
      <div className={`nt-arm ${a.armed.kind}`} aria-hidden style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      {a.at ? <div className="nt-tip" role="status" style={{ left: a.at.x, top: a.at.y }}>{a.armed.label}</div> : null}
    </Overlay>
  );
}

/** a new-session card the person leaves: with words it becomes a note in its place, empty it is gone */
function leaveStarter(id: string): void {
  const p = D.pieces[id];
  if (!p || p.kind !== "starter") return;
  const words = String(p.words ?? "").trim(), q = D.pos?.[id];
  closeStarter(id);
  if (!words) return;
  const made = M.note_new(q ? q.x + 150 : undefined, q ? q.y + 90 : undefined);
  if (made.ok && made.id) M.note_write(made.id, words);
}

export default function NotesLayer() {
  const v = useNext((d, s) => ({ on: !s.page && (s.dist === "far" || s.dist === "middle"), notes: ((d.notes as Notes | undefined)?.notes ?? []).filter((n) => !n.folder && n.x != null).map((n) => n.id).join(" ") }));
  // a click away from the open new-session card leaves it
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const id = focusId();
      if (!id || (e.target as HTMLElement | null)?.closest?.("[data-starter]")) return;
      leaveStarter(id);
    };
    addEventListener("pointerdown", down, true);
    return () => removeEventListener("pointerdown", down, true);
  }, []);
  if (!v.on) return <Said />;
  const notes = ((D.notes as Notes | undefined)?.notes ?? []).filter((n) => !n.folder && n.x != null);
  return (
    <div className="nt-layer" aria-label="Your notes">
      {notes.map((n) => <NoteCard key={n.id} n={n} />)}
      <Armed />
      <Said />
    </div>
  );
}
