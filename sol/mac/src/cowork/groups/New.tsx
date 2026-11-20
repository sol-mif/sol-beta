// Finding each other (#1537; a7 and a9 of docs/cowork-ui-2026-11-18), ported as drawn. A new table: name it, it gets
// its own code on Sol's cloud, copy the code or throw the table away (team.room.make where cloud, team.settings without it). I have a
// code: type it, sit down (team.room.peek, then team.room.join); before my AI does anything there, the consent card.
import { useEffect, useRef, useState } from "react";
import { codeTyped } from "../rooms";
import type { Team } from "../useTeam";
import { Jelly } from "./Jelly";
import { codeShown } from "./view";

const Hole = () => <i className="gh-hole" />;

export function NewTable({ me, team, onMade, onGone, onCopied }: { me: string; team: Team; onMade: (id: string) => void; onGone: () => void; onCopied: (ok: boolean) => void }) {
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ id: string; code: string; warn?: string } | null>(null);
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const make = async () => {
    const n = name.trim();
    if (!n || busy || made) return;
    setBusy("making the table…"); setErr("");
    const r = await team.ask<{ room?: { id: string; name: string; code?: string }; warn?: string; error?: string }>("team.room.make", { name: n, where: "cloud" }, 60_000);   // Sol's cloud, never the person's GitHub unasked (gate one q2)
    setBusy("");
    if (r?.error || !r?.room) { setErr(r?.error || "the table was not made"); return; }
    setMade({ id: r.room.id, code: r.room.code ?? "", ...(r.warn ? { warn: r.warn } : {}) });
    onMade(r.room.id);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(made?.code ?? ""); onCopied(true); } catch { onCopied(false); } };
  const throwAway = async () => {
    if (!made) { onGone(); return; }
    setBusy("throwing it away…");
    const rooms = (team.state?.settings.rooms ?? []).filter((r) => r.id !== made.id).map(({ id, name, provider, org, repos, hub, quiet }) => ({ id, name, provider, org, repos, hub, ...(quiet ? { quiet } : {}) }));
    await team.ask("team.settings", { patch: { rooms } }, 30_000);
    setBusy(""); onGone();
  };
  return (
    <div className="gh-tbl" data-page="new">
      <div className="gh-tname"><div className="gh-disp d44">{made ? name.trim() : "new table"}</div></div>
      <div className="gh-seats big"><div className="gh-seatb"><Jelly login={me} me={me} s={88} ai="idle" ring="#08080a" /></div><div className="gh-seatb"><Hole /></div><div className="gh-seatb"><Hole /></div></div>
      <div className="gh-top big">
        <div className="gh-who" style={{ gap: 28 }}><span><b>you</b></span><span>empty seat</span><span>empty seat</span></div>
        <form className="gh-mid" style={{ alignItems: "center", justifyContent: "center", gap: 28, width: "100%" }} onSubmit={(e) => { e.preventDefault(); void make(); }}>
          <div className="gh-col g8" style={{ alignItems: "center" }}><span className="gh-dim">name this table</span>
            <input ref={input} className="gh-well gh-namein" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void make()} placeholder="sf trip" aria-label="name this table" maxLength={60} readOnly={!!made} data-act="name" /></div>
          <div className="gh-col g8" style={{ alignItems: "center" }}><span className="gh-dim">its code</span>
            <div className="gh-well gh-codebox" data-code={made?.code ?? ""}>{made?.code ? <><span className="gh-stk r3">send this</span>{codeShown(made.code)}</> : <span className="gh-mute" style={{ fontSize: 13, fontWeight: 400, letterSpacing: 0 }}>{busy || (made ? made.warn ?? "no code came back" : "comes with the name")}</span>}</div></div>
          <div className="gh-dim" style={{ textAlign: "center", maxWidth: 360 }}>{err ? err : "whoever types this code sits down here with their own ai. nobody is added without it."}</div>
          <div className="gh-row g8">
            {made?.code ? <button type="button" className="gh-pill ctl gh-lg" data-act="copy" onClick={() => void copy()}>copy the code</button>
              : <button type="submit" className="gh-pill ctl gh-lg" data-act="make" disabled={!name.trim() || !!busy || !!made}>{made ? "made" : "make the table"}</button>}
            <button type="button" className="gh-pill gh-lg" data-act="throw" onClick={() => void throwAway()} disabled={!!busy}>{made ? "throw the table away" : "not now"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SitDown({ me, team, onSat, onNotNow }: { me: string; team: Team; onSat: (id: string) => void; onNotNow: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const sit = async () => {
    if (code.length < 6 || busy) return;
    setBusy("looking for the table…"); setErr("");
    const p = await team.ask<{ code?: string; name?: string; hub?: string; signedIn?: boolean; already?: true; error?: string }>("team.room.peek", { code }, 20_000);
    if (p?.error) { setBusy(""); setErr(p.error); return; }
    if (p?.signedIn === false) { setBusy(""); setErr("sign in to Sol first: Settings › me › Sol. the cloud knows you by your Sol account."); return; }
    setBusy(`sitting down at ${p?.name ?? "the table"}…`);
    const r = await team.ask<{ room?: { id: string }; already?: true; error?: string }>("team.room.join", { code, ...(p?.hub ? { hub: p.hub, name: p.name } : {}) }, 60_000);
    setBusy("");
    if (r?.error || !r?.room) { setErr(r?.error || "could not sit down"); return; }
    onSat(r.room.id);
  };
  return (
    <div className="gh-tbl" data-page="code">
      <div className="gh-tname"><div className="gh-disp d44">sit down</div></div>
      <div className="gh-seats big"><div className="gh-seatb"><Hole /></div><div className="gh-seatb"><Hole /></div><div className="gh-seatb"><Jelly login={me} me={me} s={88} ai="idle" ring="#08080a" /></div></div>
      <div className="gh-top big">
        <div className="gh-who" style={{ gap: 28 }}><span /><span /><span><b>you</b></span></div>
        <form className="gh-mid" style={{ alignItems: "center", justifyContent: "center", gap: 28, width: "100%" }} onSubmit={(e) => { e.preventDefault(); void sit(); }}>
          <div className="gh-col g8" style={{ alignItems: "center" }}><span className="gh-dim">the code someone sent you</span>
            <label className="gh-well gh-codebox" data-act="code"><span aria-hidden>{codeShown(code)}</span>{code.length < 6 && <u />}<input ref={input} value={code} onChange={(e) => { setCode(codeTyped(e.target.value)); setErr(""); }} aria-label="the code someone sent you" autoCapitalize="characters" spellCheck={false} /></label></div>
          <div className="gh-dim" style={{ textAlign: "center", maxWidth: 360 }}>{err || busy || "you sit down at their table with your own ai. before it does anything there, you get one card to agree to."}</div>
          <div className="gh-row g8"><button type="submit" className="gh-pill ctl gh-lg" data-act="sit" disabled={code.length < 6 || !!busy}>sit down</button><button type="button" className="gh-pill gh-lg" data-act="not-now" onClick={onNotNow}>not now</button></div>
        </form>
      </div>
    </div>
  );
}
