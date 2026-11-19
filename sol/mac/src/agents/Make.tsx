// "+ an agent" (#1327): one line, a folder, a time → agents.make. Under four words the engine answers "a sticky is
// enough": that answer is shown as it is, with a press that makes the line a sticky in that folder instead (Home's
// stickies.md, the same parse and write Home uses), and if the sticky cannot be made from here, just the line.
import { useState } from "react";
import { STICKY, saidOf, type Change } from "./model";
import type { Ask } from "./useAgents";
import type { Said } from "./Desk";
import { FILE, HEAD, parse, serialize } from "../home/folders/stickies";

/** the line as a sticky in the folder's stickies.md: the folder's place from its agent (agent.tickets), then read, add,
 *  write over the file as it was read (its hash); a line that says what went wrong, never a throw */
export async function makeSticky(ask: Ask, folder: string, line: string): Promise<{ ok: boolean; line: string }> {
  const t = await ask<{ ok: boolean; path?: string; why?: string }>({ type: "agent.tickets", folder }, 8000);
  if (!t?.ok || !t.path) return { ok: false, line: `The sticky could not be made from here (${t?.why ?? "the engine did not answer"}). Your line: “${line}”.` };
  const r = await ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd: t.path, path: FILE }, 8000);
  if (!r || (r.error && !/ENOENT|no such file/i.test(r.error))) return { ok: false, line: `The sticky could not be made from here (${r?.error ?? "the engine did not answer"}). Your line: “${line}”.` };
  const f = r.error ? { head: HEAD(folder.split("/").pop() ?? folder), items: [] } : parse(r.text ?? "");
  const [t1, ...s] = line.split(" — ");
  const text = serialize(f.head, [...f.items, { done: false, t: t1.trim(), s: s.join(" — ").trim(), notes: [] }]);
  const w = await ask<{ ok?: boolean; error?: string }>({ type: "work.write", cwd: t.path, path: FILE, text, ...(r.hash ? { hash: r.hash } : {}) }, 8000);
  if (!w?.ok) return { ok: false, line: `The sticky was not saved (${w?.error ?? "the engine did not answer"}). Your line: “${line}”.` };
  return { ok: true, line: `A sticky in ${folder}: “${line}”. It waits there in Home for your press.` };
}

export function Make({ folders, start = "", ask, onSaid, onMade }: { folders: string[]; start?: string; ask: Ask; onSaid: (s: Said) => void; onMade: (id: string) => void }) {
  const [line, setLine] = useState(start);
  const [folder, setFolder] = useState(folders[0] ?? "");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ why: string; line: string; folder: string } | null>(null);
  const [stuck, setStuck] = useState<string | null>(null);   // a sticky that could not be made: its line, said
  const make = async () => {
    setBusy(true); setRefused(null); setStuck(null);
    const r = await ask<{ ok: boolean; why?: string; agent?: { id: string }; change?: Change }>({ type: "agents.make", line: line.trim(), folder, time }, 15_000);
    setBusy(false);
    if (r && !r.ok && r.why === STICKY) { setRefused({ why: r.why, line: line.trim(), folder }); return; }
    const s = saidOf(r, "make");
    onSaid({ ...s, ...(r?.change?.undo ? { undo: r.change.id } : {}) });
    if (r?.ok && r.agent) { setLine(""); onMade(r.agent.id); }
  };
  const sticky = async () => {
    if (!refused) return;
    setBusy(true);
    const s = await makeSticky(ask, refused.folder, refused.line);
    setBusy(false);
    if (s.ok) { setRefused(null); setLine(""); onSaid(s); } else setStuck(s.line);
  };
  if (!folders.length) return <div className="ag-make" data-place="talk"><p className="ag-none">No folder has a policy.md yet, so an agent has nowhere to live. A folder set up in Home gets one.</p></div>;
  return (
    <div className="ag-make" data-place="talk">
      <p className="ag-lead">One line for work that comes back the same, or in the same shape. It starts in watch: it runs and shows what it would have done.</p>
      <form onSubmit={(ev) => { ev.preventDefault(); if (line.trim() && !busy) void make(); }}>
        <label className="ag-field"><span>what it does</span>
          <input value={line} onChange={(ev) => { setLine(ev.target.value); setRefused(null); }} placeholder="every Sunday evening, plan the week's meals from what is in the fridge and write the list" autoFocus /></label>
        <div className="ag-row">
          <label className="ag-field"><span>in the folder</span>
            <select value={folder} onChange={(ev) => setFolder(ev.target.value)}>{folders.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
          <label className="ag-field"><span>at</span><input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} required /></label>
          <button type="submit" className="ag-btn-go" disabled={busy || !line.trim()}>{busy && !refused ? "making…" : "make it"}</button>
        </div>
      </form>
      {refused && (
        <div className="ag-refused" role="status">
          <b>A sticky is enough.</b>
          <p>“{refused.line}” is one step, once. An agent is for work with several steps that comes back.</p>
          {stuck ? <p className="ag-lbl">{stuck}</p>
            : <button type="button" className="ag-btn-go" disabled={busy} onClick={() => void sticky()}>{busy ? "making the sticky…" : `make it a sticky in ${refused.folder}`}</button>}
        </div>
      )}
    </div>
  );
}
