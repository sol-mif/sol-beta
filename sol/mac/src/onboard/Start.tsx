// A tester's start (#1637, Frank 2026-11-19; three steps since 2026-11-22): on a Sol where Home is not on (a tester's,
// until Home's card reaches product, spine/views.ts), the one onboarding is not shown: its whole work is to make Home.
// This takes its place, and does only what has to happen before Build:
//   1. Sol sets itself up: on the zip's first run the install runs here, as the onboarding ran it (install.ts)
//   2. whose Sol this is (decision #1606, kept): asked of the engine once it is up (team.cloud.me); nobody signed in on a
//      cloud, one press, "Sign in with Google" (team.cloud.signin, Google in the system browser), and nothing else
//   3. the AI that does the work (Frank 2026-11-22): asked of the engine (team.accounts); neither Claude nor ChatGPT
//      signed in on this Mac, two presses, one each (the app runs `claude auth login` / `codex login`, welcome.rs; a
//      browser harness is told the line to type), and a quiet "later" for someone who only wants to look around
//   4. then Build: onDone. Signed in already, or a Sol with no cloud to sign in to (a developer's own run), the steps that
//      are answered pass at once.
// It is met on any open where nobody is signed in, not only the first: there is no Build before the sign-in.
// Each moment is counted as the onboarding's are (engine track.ts home.onboarding.step, #1474): its word and seconds.
import { useCallback, useEffect, useRef, useState } from "react";
import type { useEngine } from "../useEngine";
import { Button } from "../kit";
import { Body } from "../Body";
import { installWanted, startInstall, type Install } from "./install";
import "./one.css";
import "./start.css";

type E = ReturnType<typeof useEngine>;
type Me = { login: string; cloud: boolean };
type Moment = "setup" | "sign" | "ai";
type Ai = "claude" | "codex";
// which AI is signed in on this Mac (team.accounts, engine team/control.ts), read once the person is in
type Ais = { claude: boolean; codex: boolean; claudeMissing: boolean };
const NAMES: Record<Ai, string> = { claude: "Claude", codex: "ChatGPT" };
const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** one question to the engine and its answer by rid; null when none comes in `ms` (One.tsx's own, kept apart so this
 *  small page does not load the onboarding) */
function useAsk(e: E) {
  const waits = useRef(new Map<string, (m: unknown) => void>());
  const n = useRef(0);
  useEffect(() => e.subscribe((m: any) => { const f = m?.rid && waits.current.get(m.rid); if (f) { waits.current.delete(m.rid); f(m); } }), [e.subscribe]);   // eslint-disable-line @typescript-eslint/no-explicit-any
  return useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `start-${Date.now()}-${++n.current}`;
    const t = window.setTimeout(() => { waits.current.delete(rid); res(null); }, ms);
    waits.current.set(rid, (m) => { window.clearTimeout(t); res(m as T); });
    const go = (k: number) => { if (e.send({ ...o, rid }) !== false) return; if (k < 20) { window.setTimeout(() => go(k + 1), 500); return; } window.clearTimeout(t); waits.current.delete(rid); res(null); };
    go(0);
  }), [e.send]);   // eslint-disable-line react-hooks/exhaustive-deps
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// who was signed in at the last answer, kept in this window: a Sol signed in before draws nothing while the engine is
// asked again (no black stage on every open); the engine's "nobody" brings the start back and clears it
const IN = "sol.start.in";
const keptIn = (): boolean => { try { return !!localStorage.getItem(IN); } catch { return false; } };
const keepIn = (login: string) => { try { if (login) localStorage.setItem(IN, login); else localStorage.removeItem(IN); } catch { /* private */ } };
type AccountsMsg = { claude?: { in?: boolean; missing?: boolean }; codex?: { in?: boolean; missing?: boolean } };
const aisOf = (r: AccountsMsg | null): Ais | null => (r ? { claude: !!r.claude?.in, codex: !!r.codex?.in, claudeMissing: !!r.claude?.missing } : null);

export default function Start({ e, onDone }: { e: E; onDone: () => void }) {
  const ask = useAsk(e);
  const [inst, setInst] = useState<Install | null>(null), [tries, setTries] = useState(0);
  useEffect(() => (installWanted() ? startInstall("", setInst) : undefined), [tries]);
  const [me, setMe] = useState<Me | null>(null);   // null until the engine says
  const [ais, setAis] = useState<Ais | null>(null);   // null until the engine says, once the person is in
  const [busy, setBusy] = useState(false), [said, setSaid] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<Ai | null>(null), [aiSaid, setAiSaid] = useState<string | null>(null);
  const asked = useRef(false), askedAi = useRef(false), ended = useRef(false);
  const end = () => { if (ended.current) return; ended.current = true; onDone(); };
  // the zip's install runs to its end before anything is asked: the engine answers before the install's own last step
  // (Claude Code's sign-in), and two browser sign-ins at once, or Build before the install is done, is what this waits out
  const installing = installWanted() && !inst?.done;
  useEffect(() => {
    if (!e.up || asked.current || installing) return;
    asked.current = true;
    void ask<{ login?: string; cloud?: boolean }>({ type: "team.cloud.me" }, 8000).then((r) => setMe({ login: r?.login || "", cloud: r?.cloud !== false }));
  }, [e.up, ask, installing]);
  // signed in, or no cloud to sign in to: the next question, which AI is signed in here. No answer in time: Build, never a trap
  const inSol = !!me && (!!me.login || !me.cloud);
  useEffect(() => {
    if (!me) return;
    if (me.cloud) keepIn(me.login);
    if (!inSol || askedAi.current) return;
    askedAi.current = true;
    void ask<AccountsMsg>({ type: "team.accounts" }, 8000).then((r) => { const a = aisOf(r); if (a) setAis(a); else end(); });
  }, [me, inSol, ask]);   // eslint-disable-line react-hooks/exhaustive-deps
  // one of the two in: Build
  useEffect(() => { if (ais && (ais.claude || ais.codex)) end(); }, [ais]);   // eslint-disable-line react-hooks/exhaustive-deps
  const m: Moment = !me || installing ? "setup" : !inSol ? "sign" : "ai";
  // while the AI step shows, the engine is asked again every few seconds and when the app says a sign-in ended, so a
  // sign-in finished in the browser turns the page by itself
  useEffect(() => {
    if (m !== "ai" || !ais) return;
    const again = () => void ask<AccountsMsg>({ type: "team.accounts" }, 8000).then((r) => { const a = aisOf(r); if (a) setAis(a); });
    const t = window.setInterval(again, 3000);
    let off = () => {}, gone = false;
    if (inApp) void import("@tauri-apps/api/event").then((ev) => ev.listen<{ which: string; ok: boolean }>("signin-done", (x) => {
      setAiBusy((b) => (b === x.payload.which ? null : b));
      if (!x.payload.ok) setAiSaid("The sign-in page closed before it finished. Press again to open it once more.");
      again();
    })).then((u) => { if (gone) u(); else off = u; });
    return () => { window.clearInterval(t); gone = true; off(); };
  }, [m, !!ais]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [quiet] = useState(keptIn);
  const drawn = !(m === "setup" && quiet && !installing);
  useEffect(() => {
    if (!drawn) return;   // an open that drew nothing is not an onboarding moment
    const at = Date.now();
    e.send({ type: "home.onboarding.step", step: `start.${m}`, how: "reached" });
    return () => { e.send({ type: "home.onboarding.step", step: `start.${m}`, how: "left", secs: Math.round((Date.now() - at) / 1000) }); };
  }, [m, drawn]);   // eslint-disable-line react-hooks/exhaustive-deps -- the wire, not the whole engine object

  const sign = async () => {
    if (busy) return;
    setBusy(true); setSaid(null);
    const r = await ask<{ ok?: boolean; login?: string; error?: string }>({ type: "team.cloud.signin" }, 11 * 60_000);
    if (!r?.ok) { setBusy(false); setSaid(r?.error ?? "Google did not answer. Press again in a moment."); return; }
    const name = r.login || (await ask<{ login?: string }>({ type: "team.cloud.me" }, 8000))?.login || "";
    setBusy(false);
    if (!name) { setSaid("Signed in, but I could not read your name yet. Press again in a moment."); return; }
    setMe({ login: name, cloud: true });
  };
  // the AI's own sign-in: in Sol.app the app runs it (welcome.rs claude_login / codex_login: its page opens in the
  // browser, "signin-done" says when it ended); Claude Code not on this Mac yet is installed first (claude_install).
  // Outside the app (a browser harness), the line to type in a terminal is said instead (team.signin)
  const signAi = async (which: Ai) => {
    if (aiBusy) return;
    setAiBusy(which); setAiSaid(null);
    if (!inApp) {
      const r = await ask<{ command?: string; error?: string }>({ type: "team.signin", seat: which }, 8000);
      setAiBusy(null);
      setAiSaid(r?.command ? `In Terminal: ${r.command}, then come back here.` : r?.error ?? "Sol could not say how to sign in.");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (which === "claude" && ais?.claudeMissing) { setAiSaid("Getting Claude Code first, a minute."); await invoke("claude_install"); setAiSaid(null); }
      await invoke(which === "claude" ? "claude_login" : "codex_login");
    } catch (err) { setAiBusy(null); setAiSaid(String(err)); }
  };

  const line: [string, string] =
    m === "sign" ? ["Sign in with Google to start.", busy ? "Your browser opened Google. Come back here once it says you are in." : "So I know whose Sol this is. Your browser opens Google, and you come back here."]
    : m === "ai" ? (!ais ? ["One moment.", "Asking which AI is signed in on this Mac."]
      : [`Sign in to the AI that does the work.`, aiBusy ? `${NAMES[aiBusy]}'s page is open in your browser. Come back here once you are in.` : "Claude or ChatGPT, whichever plan you have. Its page opens in your browser, and you come back here."])
    : inst && !inst.done ? ["Setting myself up.", inst.failed ? `It stopped: ${inst.failed}.` : `${cap1(inst.phrase)}.`]
    : !e.up ? ["Waking up.", "My engine is starting; this goes on by itself when it answers."]
    : ["One moment.", "Asking who is signed in."];

  if (!drawn) return null;
  return (
    <div className="ob-stage ob1-stage st-stage" data-start data-moment={m}>
      <div className="ob-jelly"><Body size={40} state="settled" follow /></div>
      <div className="ob-line" key={m + line[0]}>
        <div className="t-display">{line[0]}</div>
        <div className="t-read">{line[1]}</div>
      </div>
      <div className="st-foot">
        {m === "setup" && inst?.failed && <span data-install-again><Button h={44} onClick={() => { setInst(null); setTries((t) => t + 1); }}>try again</Button></span>}
        {m === "sign" && <span data-sign><Button h={44} state={busy ? "rest" : undefined} onClick={() => void sign()}>{busy ? "waiting for Google" : "Sign in with Google"}</Button></span>}
        {m === "ai" && ais && (
          <div className="st-row">
            <span data-sign-ai="claude"><Button h={44} state={aiBusy === "claude" ? "rest" : undefined} onClick={() => void signAi("claude")}>{aiBusy === "claude" ? "waiting for Claude" : "Sign in to Claude"}</Button></span>
            <span data-sign-ai="codex"><Button h={44} state={aiBusy === "codex" ? "rest" : undefined} onClick={() => void signAi("codex")}>{aiBusy === "codex" ? "waiting for ChatGPT" : "Sign in with ChatGPT"}</Button></span>
            <button type="button" className="st-later" data-later onClick={end}>later</button>
          </div>
        )}
        {m === "sign" && said && <p className="t-read st-said" data-said-back>{said}</p>}
        {m === "ai" && aiSaid && <p className="t-read st-said" data-said-back>{aiSaid}</p>}
      </div>
      {m === "setup" && inst && !inst.done && !inst.failed && <div className="st-bar" aria-hidden><i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, inst.frac))})` }} /></div>}
    </div>
  );
}
