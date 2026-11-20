// One table, sat at (#1537; a3, a5, a6 of docs/cowork-ui-2026-11-18), ported as drawn. The same table as on the home,
// larger: its name, the seats with each person's line under them, its code on a sticker, the stage (what is really on
// the table: its last hand-overs and what was said there (its talk: a cloud table's lines and things); with none, one plain line and the two ways to put something there, never a made-up
// shape: gate one q3), the "my ai here" row, and the bar: say a line, or hand the table a thing (a6). When someone waits on me the ask rises between the table and the bar (a5).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Gl, Sticker } from "./Coin";
import { Jelly } from "./Jelly";
import type { MyAi } from "./Sheets";
import { agoOf, barWords, codeShown, getsIt, nameOn, type TableView } from "./view";

/** what waits on me at this table: a hand to me, or an agent's question (Agents' room) */
export type AskNow =
  | { kind: "hand"; id: string; from: string; title: string; at?: string; take: () => void; later: () => void; doing?: { said: string; failed?: boolean } }
  | { kind: "block"; id: string; from: string; title: string; q: string; choices: string[]; at?: number; press: (choice: string) => void; busy: boolean };

export type Thing = { name: string; bytes: string; kind: "image" | "file"; size: number };
export type Send = (words: string, to: string, thing: Thing | null) => Promise<{ ok: boolean; said: string }>;

const GH = { gh: "M5 3v10M5 9c4 0 6-1 6-4M11 3v2", talk: "M3 4h10v7H7l-3 2.500V11H3z", drive: "M6 3h4l4 7-2 3H4l-2-3z" } as const;
const Mark = ({ d, on, title }: { d: keyof typeof GH; on: boolean; title: string }) => (
  <span className="gh-mark" data-on={on ? "1" : "0"} title={title}><svg viewBox="0 0 16 16"><path d={GH[d]} /></svg>{on && <i />}</span>
);

export function Page({ t, me, my, lineOf, away, code, onCode, ask, send, onChange, children, back }: {
  t: TableView; me: string; my: MyAi; lineOf: (login: string) => string[]; away: (login: string) => boolean;
  code: string; onCode: () => void; ask: AskNow | null; send: Send; onChange: () => void; children?: ReactNode; back?: boolean;
}) {
  const [mode, setMode] = useState<"say" | "hand">("say");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [thing, setThing] = useState<Thing | null>(null);
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const say = useRef<HTMLInputElement>(null);
  const others = t.seats.filter((s) => !s.me);
  useEffect(() => { if (!others.some((s) => s.login === to)) setTo(""); }, [others, to]);
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const b64 = String(r.result).split(",")[1] ?? ""; setThing({ name: f.name, bytes: b64, kind: f.type.startsWith("image/") ? "image" : "file", size: f.size }); setMode("hand"); };
    r.readAsDataURL(f);
  };
  const go = async () => {
    const words = text.trim();
    if ((!words && !thing) || busy) return;
    setBusy(true); setSaid(null);
    const r = await send(words, mode === "hand" ? to : "", mode === "hand" ? thing : null);
    setBusy(false);
    setSaid({ text: r.said, failed: !r.ok });
    if (r.ok) { setText(""); setThing(null); }
  };
  const canSend = !!text.trim() || !!thing;
  return (
    <>
      <div className={`gh-tbl${back ? " back" : ""}`} data-page={`table/${t.id}`} data-table={t.id}>
        <div className="gh-tname"><div className="gh-disp d44">{t.name}</div></div>
        <div className="gh-seats big">
          {t.seats.map((s) => {
            const up = ask?.kind !== undefined && ask.from === s.login;
            return <div key={s.login} className="gh-seatb"><Jelly login={s.login} me={me} s={88} ai={s.coin === "work" ? "work" : s.coin === "ask" ? "wait" : s.coin === "done" ? "done" : "idle"} ring="#08080a" up={up} look={up ? 2 : ask && s.me ? -3 : 0} sleep={!s.me && away(s.login)} /></div>;
          })}
        </div>
        {code ? <span className="gh-stk code" data-code={code}>{codeShown(code)}</span>
          : <button type="button" className="gh-stk code gh-stkbtn" data-act="code" onClick={onCode}>get a code</button>}
        <div className="gh-top big">
          <div className="gh-who" style={{ gap: 28 }}>
            {t.seats.map((s) => { const [a, b] = lineOf(s.login); return <span key={s.login}><b>{nameOn(s.login, me)}</b>{a && <><br />{a}</>}{b && <><br />{b}</>}</span>; })}
          </div>
          {t.stage.length ? (
            <div className="gh-well gh-stage gh-grow" data-stage="things">
              <ul className="gh-things">
                {t.stage.map((r) => <li key={r.key} data-thing-row={r.number || undefined} data-talk-row={r.number ? undefined : r.key}><b>{r.text}</b>{r.brief && <span className="gh-dim gh-cut">{r.brief}</span>}<span className="gh-grow" /><span className="gh-dim">{agoOf(r.at, Date.now())}</span></li>)}
              </ul>
            </div>
          ) : (
            <div className="gh-well gh-stage gh-grow" data-stage="empty">
              <p className="gh-read" style={{ margin: 0 }}>nothing on this table yet.</p>
              <p className="gh-dim" style={{ margin: 0 }}>say what it's for, or hand it a first thing. whoever sits here, and their ai, picks it up.</p>
              {!back && <div className="gh-row g8">
                <button type="button" className="gh-pill ctl" data-act="start-say" onClick={() => { setMode("say"); setTimeout(() => say.current?.focus(), 0); }}>say what it's for</button>
                <button type="button" className="gh-pill" data-act="start-hand" onClick={() => { setMode("hand"); file.current?.click(); }}>hand it a thing</button>
              </div>}
            </div>
          )}
          <div className="gh-r">
            <Jelly login={me} me={me} s={32} ring="#1b1b1e" /><span className="gh-dim">my ai here</span>
            <span className="gh-pill tint gh-sm">{my.machine}</span><span className="gh-pill tint gh-sm">{my.ai}</span><span className="gh-pill on gh-sm">{my.level}</span>
            <button type="button" className="gh-pill ctl gh-sm" data-act="change" onClick={onChange}>change</button>
            <span className="gh-grow" />
            <Mark d="gh" on={my.reaches.github} title={my.reaches.github ? "github: connected" : "github: not connected on this mac"} />
            <Mark d="talk" on={my.reaches.talk} title="the talk" />
            <Mark d="drive" on={my.reaches.drive} title={my.reaches.drive ? "drive: connected" : "drive: not connected on this mac"} />
            <span style={{ width: 8 }} /><span className="gh-num">{t.count.n}</span><span className="gh-dim">{t.count.word}</span>
          </div>
        </div>
      </div>
      {ask && !back && (
        <div className="gh-lifted gh-askbar" data-ask={ask.id}>
          <Sticker y xl>needs you</Sticker>
          <Jelly login={ask.from} me={me} s={40} ai="wait" ring="#222226" />
          <div className="gh-mid" style={{ gap: 2 }}>
            <div className="gh-read">{ask.kind === "block" ? ask.q || ask.title : ask.title}</div>
            <div className="gh-names">{ask.kind === "hand" ? (ask.doing?.said ?? `${nameOn(ask.from, me)} handed it to you${ask.at ? ` ${agoOf(ask.at, Date.now())}` : ""}.`) : `${ask.from}'s ai asked${ask.at ? ` ${agoOf(new Date(ask.at).toISOString(), Date.now())}` : ""}.`}</div>
          </div>
          {ask.kind === "hand"
            ? <><button type="button" className="gh-pill ctl gh-lg" data-act="take" onClick={ask.take} disabled={!!ask.doing && !ask.doing.failed}>take it</button><button type="button" className="gh-pill gh-lg" data-act="later" onClick={ask.later}>not yet</button></>
            : ask.choices.slice(0, 3).map((c, i) => <button key={c} type="button" className={`gh-pill gh-lg${i === 0 ? " ctl" : ""}`} data-act="press" onClick={() => ask.press(c)} disabled={ask.busy}>{c}</button>)}
        </div>
      )}
      {!back && (mode === "say" ? (
        <form className="gh-bar gh-card" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <button type="button" className="gh-pill on" data-act="say" onClick={() => setMode("say")}>say</button>
          <button type="button" className="gh-pill" data-act="hand" onClick={() => setMode("hand")}>hand over</button>
          <label className="gh-in"><input ref={say} value={text} onChange={(e) => { setText(e.target.value); setSaid(null); }} placeholder={ask ? `or answer ${ask.from}${ask.kind === "block" ? "'s ai" : ""} in your own words` : barWords(t.seats)} aria-label="say it" />{said && <span className="gh-said" style={said.failed ? { color: "var(--ink)" } : undefined}>{said.text}</span>}</label>
          <button type="submit" className={`gh-send${canSend ? " go" : ""}`} data-act="send" aria-label="send" disabled={!canSend || busy}><Gl d="up" /></button>
        </form>
      ) : (
        <form className="gh-card gh-hand" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <div className="gh-row g8" style={{ padding: "4px 4px 0 8px" }}>
            <span className="gh-dim">goes to</span>
            <div className="gh-seg" role="radiogroup" data-act="to">
              <button type="button" role="radio" aria-checked={to === ""} className={`gh-pill${to === "" ? " on" : ""}`} onClick={() => setTo("")}>the table</button>
              {others.map((s) => <button key={s.login} type="button" role="radio" aria-checked={to === s.login} className={`gh-pill${to === s.login ? " on" : ""}`} onClick={() => setTo(s.login)}>{s.login}</button>)}
            </div>
            <span className="gh-dim gh-cut">{getsIt(t.seats, to)}</span><span className="gh-grow" />
            {!thing && <button type="button" className="gh-pill" data-act="add-thing" onClick={() => file.current?.click()}>add a thing</button>}
          </div>
          <div className="gh-bar" style={{ padding: 0 }}>
            <button type="button" className="gh-pill" data-act="say" onClick={() => setMode("say")}>say</button>
            <button type="button" className="gh-pill on" data-act="hand" onClick={() => setMode("hand")}>hand over</button>
            <label className="gh-in" style={{ color: "var(--ink)", paddingLeft: 6, gap: 10 }}>
              {thing && <span className="gh-pill tint gh-sm gh-chip" data-thing={thing.name}>{thing.name}<i role="button" aria-label="remove" onClick={(e) => { e.preventDefault(); setThing(null); }}>×</i></span>}
              <input value={text} onChange={(e) => { setText(e.target.value); setSaid(null); }} placeholder={thing ? "one line about it" : "drop a thing here, or add one"} aria-label="one line about it" />
              {said && <span className="gh-said" style={said.failed ? { color: "var(--ink)" } : undefined}>{said.text}</span>}
            </label>
            <button type="submit" className={`gh-send${canSend ? " go" : ""}`} data-act="send" aria-label="hand it over" disabled={!canSend || busy}><Gl d="up" /></button>
          </div>
        </form>
      ))}
      <input ref={file} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
      {children}
    </>
  );
}
