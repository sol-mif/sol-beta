// A folder's setup in its header (setup.html §2, Marco 16:02; the engine's setup-read.ts, P9): one quiet line under the
// folder's name, "SETUP ✦ …", the three lines Sol read from what the folder holds, ✦ until the person keeps it. A press
// opens it in place to For, Organized and Looks, each with its because…; × takes a line out and a press on a line shows
// the engine's takes for it, tried and kept through its preview, so either goes to known() as one fix line (the
// engine's). While it is open the one bar talks to it ("To: <folder> · setup", cv/moves/talkto.ts setupTo), and Esc
// closes it. A folder too early to read shows no line. Every word on a line is the engine's.
// Signed: marcocyl04-ux's agent (builder F10), BR1 (#1615).
import { useEffect, useState } from "react";
import { M, hooks, useNext } from "../../cv/index.ts";
import { FSs, setupOf, type ReadLine } from "../../cv/moves/setup.ts";
import { setupTo } from "../../cv/moves/talkto.ts";
import "./setup.css";

export default function Setup({ rid, name }: { rid: string; name: string }) {
  // drawn again when the engine's setup, the open line or a try changes
  useNext(() => { const s = setupOf(rid), f = FSs(); return `${JSON.stringify(s?.read ?? null)}|${s?.fields.map((x) => x.take).join(",")}|${f.open}|${f.trying?.take}:${f.trying?.token}:${f.trying?.why}|${f.kept?.token}`; });
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { M.fsLoad(rid); }, [rid]);   // live: the engine reads it now; the fixture says its own
  useEffect(() => {
    // Esc closes the open setup first, before the folder steps back (Next.tsx's keys run hooks.keys first)
    const esc = (e: KeyboardEvent) => (e.key === "Escape" && setupTo() === rid ? M.fsClose().ok : false);
    hooks.keys.push(esc);
    return () => { hooks.keys.splice(hooks.keys.indexOf(esc), 1); };
  }, [rid]);
  useEffect(() => () => { if (FSs().open === rid) M.fsClose(); }, [rid]);   // the folder closed: so is its setup
  const s = setupOf(rid), r = s?.read, f = FSs(), open = f.open === rid;
  if (!s || !r || r.empty) return null;   // too early to say: no line, no guess (setup.html §5)
  const line = (
    <button type="button" className={`su-line${open ? " su-on" : ""}`} data-setup={rid} aria-expanded={open} onClick={() => (open ? M.fsClose() : M.fsOpen(rid))}
      title={open ? "Close the setup (Esc)" : `What ${name} is for, how it's organized and how it looks: press to see why, or change it`}>
      <span className="su-lab">SETUP</span>{r.sol ? <span className="su-try" aria-label="Sol's reading">✦</span> : null}<span className="su-w">{r.line}</span>
    </button>
  );
  if (!open) return <div className="su">{line}</div>;
  const t = f.trying?.folder === rid ? f.trying : null;
  const row = (l: ReadLine) => {
    const fld = s.fields.find((x) => x.field === l.field), picking = pick === l.key;
    return (
      <div key={l.key} className={`su-row${picking ? " su-pick" : ""}`} data-setup-line={l.key}>
        <span className="su-k">{l.n}</span>
        <div className="su-say">
          <button type="button" className="su-l" onClick={() => setPick(picking ? null : l.key)} aria-expanded={picking} title="Press to change it">{l.line}</button>
          <span className="su-why">because {l.because}</span>
          {picking && fld ? (
            <div className="su-takes" role="group" aria-label={`${l.n}: other ways`}>
              {fld.takes.filter((x) => x.id !== fld.take).map((x) => (
                <button key={x.id} type="button" className={`su-take${t?.field === l.field && t.take === x.id ? " su-trying" : ""}`} data-take={x.id}
                  onClick={() => { if (!M.fsTry(rid, l.field, x.id).ok) hooks.flash?.("Changing a line needs Sol running: tell Sol below instead"); }}>{x.n}</button>
              ))}
            </div>
          ) : null}
          {t && t.field === l.field ? (
            <div className="su-tr" data-setup-try>
              <span>{t.why ?? (t.token ? `Try: ${t.toN}` : "Sol is trying it…")}</span>
              <button type="button" className="su-keep" disabled={!t.token || t.keeping} onClick={() => { if (M.fsKeep().ok) setPick(null); }}>Keep</button>
              <button type="button" onClick={() => M.fsBack()}>Back</button>
            </div>
          ) : null}
        </div>
        <button type="button" className="su-x" data-setup-drop={l.key} onClick={() => M.fsDrop(rid, l.key)} aria-label={`Take out “${l.short}”`} title="Take it out; Sol remembers">×</button>
      </div>
    );
  };
  return (
    <div className="su">
      {line}
      <section className="su-open" aria-label={`${name}'s setup`} data-setup-open={rid}>
        {r.lines.map(row)}
        {!r.lines.length ? <p className="su-none">Every line is taken out. Tell Sol below what {name} is for.</p> : null}
        <div className="su-ft">
          {r.sol ? <><span className="su-try">✦ Sol's reading</span><button type="button" className="su-keep" data-setup-keep onClick={() => M.fsUse(rid)}>Keep</button></> : <span>Kept</span>}
          <span>Press a line to change it, or tell Sol below</span>
          <button type="button" className="su-esc" onClick={() => M.fsClose()}>Esc</button>
        </div>
        {f.says ? <p className="su-says">{f.says}</p> : null}
      </section>
    </div>
  );
}
