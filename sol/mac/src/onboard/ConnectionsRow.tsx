// What Sol reads, in Home's own settings section (#1229): every way in with its state, read live each time the section
// opens, the one onboarding's sources step's list (onboard/connections.ts) and no second one. A row shows where it is
// read (the proof), its state in the person's words, and the one press that moves it: renew a lapsed one, connect one
// never connected, turn one back on, or say "not here" (with undo). A renew is watched, not reported: the row says what
// it waits for and asks again the moment the person is back, so a folder that reads it reads it from its next turn.
// Reached the same way from any Home: Settings › home (spine/settings.ts HOME_DRAWER), over Home or in Build.
import { useCallback, useEffect, useRef, useState } from "react";
import READ from "./places/read.mjs?raw";
import { useShell } from "../settingsShell";
import { openUrl } from "../cowork/util";
import { changeRecord, readRecord, type Record as Rec } from "./record";
import { consentIn } from "./consent";
import { connectedServices } from "./reach";
import { GROUPS, checkWays, needs, rowsOf, runSignIn, type Check, type Row, type State } from "./connections";
import type { Service } from "./reach";
import type { Metas } from "../home/meta";

export const meta = {
  ConnectionsRow: {
    job: "what Sol reads, one row per way in, in Home's settings: its state, where it is read, and one press to renew, connect, turn back on or say not here",
    flow: "mine",
    states: ["asking", "every way read", "one needs you", "renewing, waiting for the browser", "said not here, with undo", "the engine did not answer"],
    keys: [{ press: "a row's renew", does: "opens that way's own sign-in; Sol asks again when you are back" }, { press: "not here", does: "Sol stops reading it from the next turn; undo puts it back" }, { press: "ask again", does: "reads every way's state now" }],
    listens: ["the engine's connectors (fresh)", "the reader's check (places/read.mjs --check)", "the record's consent", "window focus after a renew", "team.github.connected"],
  },
} satisfies Metas;

type Wire = { send: (o: object) => unknown; subscribe: (fn: (m: any) => void) => () => void };
const WORD: { [s in State]: string } = { connected: "connected", lapsed: "lapsed", never: "not connected", blocked: "blocked by your organisation", off: "not here", export: "no connector" };
const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** the consent's word for one way, put back as it was (undo): a word, or none */
const setSaid = (r: Rec, id: string, said: "yes" | "no" | undefined): Rec => {
  const c = consentIn(r), sources = { ...c.sources };
  if (said) sources[id] = said; else delete sources[id];
  return { ...r, consent: { ...c, sources, at: new Date().toISOString() } };
};

export function ConnectionsRow({ wire }: { wire?: Wire }) {
  const sh = useShell();
  const shown = !!sh && sh.sel === "home";
  const n = useRef(0);
  const ask = useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    if (!wire) { res(null); return; }
    const rid = `conn-${++n.current}`;
    const t = window.setTimeout(() => { off(); res(null); }, ms);
    const off = wire.subscribe((m: any) => { if (m?.rid === rid) { window.clearTimeout(t); off(); res(m as T); } });
    wire.send({ ...o, rid });
  }), [wire]);
  const [services, setServices] = useState<Service[] | null | undefined>(undefined);
  const [checks, setChecks] = useState<Record<string, Check> | null | undefined>(undefined);
  const [rec, setRec] = useState<Rec | null>(null);
  const [now, setNow] = useState<string | null>(null);   // what is being asked now
  const [at, setAt] = useState<Date | null>(null);
  const [wait, setWait] = useState<{ id: string; words: string; code?: string } | null>(null);   // a renew out in the browser
  const [did, setDid] = useState<{ text: string; undo?: () => void } | null>(null);   // what the person just did

  const look = useCallback(async (fresh: boolean, only?: "apps") => {
    if (!wire) return;
    setNow("asking which apps are connected");
    const [s, r] = await Promise.all([connectedServices(ask, "", fresh), readRecord(ask)]);
    setServices(s); setRec(r);
    if (only !== "apps") {
      setNow("checking GitHub, Google, your AI tools and this Mac");
      setChecks(await checkWays(ask, wire, READ));
    }
    setNow(null); setAt(new Date());
  }, [ask, wire]);
  useEffect(() => { if (shown) void look(false); }, [shown, look]);

  // a renew out in the browser: asked again the moment the person is back in Sol
  useEffect(() => {
    if (!wait || wait.code) return;
    const back = () => { const w = wait; setWait(null); void look(true).then(() => setDid({ text: `asked again after ${w.words}` })); };
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, [wait, look]);

  const say = async (row: Row, said: "yes" | "no") => {
    const before = rec?.consent?.sources?.[row.id];
    const r = await changeRecord(ask, (x) => setSaid(x, row.id, said));
    if (!r) { setDid({ text: `could not write your record; ${row.name} is as it was` }); return; }
    setRec(r);
    const undo = async () => { const u = await changeRecord(ask, (x) => setSaid(x, row.id, before)); if (u) { setRec(u); setDid({ text: `${row.name} put back` }); } };
    setDid({ text: said === "no" ? `${row.name}: not here. Sol stops reading it from the next turn` : `${row.name}: read again from the next turn`, undo });
  };

  const press = async (row: Row) => {
    const f = row.fix;
    if (!f) return;
    if (f.kind === "yes") return say(row, "yes");
    if (f.kind === "page") { setWait({ id: row.id, words: f.words }); openUrl(f.url); return; }
    if (f.kind === "github" && wire) {
      const r = await ask<{ code?: string; url?: string; error?: string }>({ type: "team.github.connect" }, 30_000);
      if (!r?.code || !r.url) { setDid({ text: `GitHub did not start: ${r?.error ?? "no answer"}` }); return; }
      setWait({ id: row.id, words: f.words, code: r.code });
      openUrl(r.url);
      const off = wire.subscribe((m: any) => {
        if (m?.type === "team.github.connected") { off(); setWait(null); void look(true).then(() => setDid({ text: `GitHub signed in as ${m.login}` })); }
        else if (m?.type === "team.github.connect.failed") { off(); setWait(null); setDid({ text: `GitHub said no: ${m.error ?? "no reason given"}` }); }
      });
      return;
    }
    if (f.kind === "run" && wire) {
      setWait({ id: row.id, words: f.words, code: "" });
      const ok = await runSignIn(ask, wire, f.run);
      setWait(null);
      await look(true);
      setDid({ text: ok ? `${row.name}: signed in again` : `${row.name}: the sign-in did not finish; press again to retry` });
    }
  };

  if (!shown) return null;
  if (!wire) return <div className="v3-switch"><div className="field-r"><div className="lab"><span>what Sol reads</span><small>This window has no engine to ask; open it from Home.</small></div></div></div>;
  const { rows, unread } = rowsOf({ services: services ?? null, checks: checks ?? null, consent: rec?.consent ?? null, rec });
  const asked = services !== undefined;
  const need = needs(rows);
  return (
    <div className="v3-switch" data-connections>
      <div className="field-r">
        <div className="lab"><span>what Sol reads</span>
          <small data-connections-now>{now ? `${now[0].toUpperCase()}${now.slice(1)}…` : asked ? `${rows.length} ways in${need ? ` · ${need} need${need === 1 ? "s" : ""} you` : " · nothing needs you"}${at ? ` · checked ${clock(at)}` : ""}` : "Not asked yet"}</small>
        </div>
        <button className="bpill" disabled={!!now} onClick={() => void look(true)}>ask again</button>
      </div>
      {did && <p className="hint-line" data-connections-did>{did.text}{did.undo && <> · <button className="bpill" onClick={() => { const u = did.undo!; setDid(null); void u(); }}>undo</button></>}</p>}
      {GROUPS.map(([g, title]) => {
        const rs = rows.filter((r) => r.group === g);
        if (!rs.length) return null;
        return (
          <div key={g} data-connections-group={g}>
            <div className="lab"><small>{title}</small></div>
            {rs.map((r) => (
              <div className="field-r" key={r.id} data-connection={r.id} data-state={r.state}>
                <div className="lab">
                  <span>{r.name} · {WORD[r.state]}</span>
                  <small>{r.line} · {r.where}{r.round ? ` · the way round: ${r.round}` : ""}{wait?.id === r.id ? ` · ${wait.code ? `type ${wait.code} in the page that opened` : wait.code === "" ? "finish in the browser that opened" : "finish in the browser; Sol asks again when you are back"}` : ""}</small>
                </div>
                {r.fix && wait?.id !== r.id && <button className="bpill" onClick={() => void press(r)}>{r.fix.words}</button>}
                {r.drop && r.state !== "off" && <button className="bpill" onClick={() => void say(r, "no")}>not here</button>}
              </div>
            ))}
          </div>
        );
      })}
      {unread.map((u) => <p className="hint-line" key={u} data-connections-unread>{u}</p>)}
      {asked && checks === null && !now && <p className="hint-line" data-connections-unread>GitHub, Google, your AI tools and this Mac: the check did not answer; ask again</p>}
    </div>
  );
}
