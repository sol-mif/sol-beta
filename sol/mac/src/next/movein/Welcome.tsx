// The welcome card (BR1, #1615; mine/look/br1/movein.html "Has nothing yet"): when the move-in found nothing on this Mac
// and the canvas has no folder and no session, one card at the top of the canvas instead of an empty plane. It does not
// ask what the person sees first (that is Settings › Start screen only; Marco, 2026-11-22, BR1 rapid); three starts:
//   A project on this Mac   the macOS folder picker (next.folder.pick, the engine's), then work.folder add: a folder here
//   Talk to an AI           a few words, then a loose session (work.say { fresh }, no folder)
//   Something in my life    a Life folder, its name in edit first
// and "Your AI:" with Claude Code and Codex, each "signed in" or "sign in" (Sol.app's own sign-in page; only in Sol.app);
// Claude Code not on this Mac yet is got first (claude_install, #1854). The card goes
// once a folder or a session exists, and it ends above the talk pill. Signed: marcocyl04-ux's agent, BR1 (#1615).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { D, M, MODE, change, hooks, useNext } from "../cv/core.ts";
import { wanted } from "./welcomeWhen.ts";
import { link } from "./live.ts";
import { live } from "./state.ts";
import "./movein.css";

const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `w-${Date.now()}-${Math.random().toString(16).slice(2)}`);


type Ai = { id: "claude" | "codex"; n: string; st: "in" | "out" | "missing" | "?" };
/** Claude Code and Codex, signed in or not (Sol.app's claude_status, codex_status). Outside Sol.app nobody here can tell
 *  or open the sign-in, so neither is drawn: never a sign in that tells a person to run a command (sweep 4, #1615) */
function useAis(): [Ai[], (id: Ai["id"]) => void] {
  const [ais, setAis] = useState<Ai[]>([{ id: "claude", n: "Claude", st: "?" }, { id: "codex", n: "Codex", st: "?" }]);
  const ask = async () => {
    if (!inApp()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [c, x] = await Promise.all([invoke<string>("claude_status"), invoke<string>("codex_status")]);
      setAis([{ id: "claude", n: "Claude", st: c as Ai["st"] }, { id: "codex", n: "Codex", st: x as Ai["st"] }]);
    } catch { setAis((a) => a.map((x) => ({ ...x, st: "out" }))); }
  };
  useEffect(() => { void ask(); const back = () => void ask(); window.addEventListener("focus", back); return () => window.removeEventListener("focus", back); }, []);
  const sign = async (id: Ai["id"]) => {
    if (!inApp()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // Claude Code not on this Mac (the first run's install could not bring it): Anthropic's installer first (#1854)
      if (id === "claude" && ais.find((a) => a.id === "claude")?.st === "missing") {
        hooks.flash?.("Getting Claude Code first, a minute.");
        await invoke("claude_install");
      }
      await invoke(id === "claude" ? "claude_login" : "codex_login");
      hooks.flash?.(`${id === "claude" ? "Claude" : "ChatGPT"}’s page is open in your browser; sign in there and come back.`);
    } catch (err) { hooks.flash?.(String(err)); }
  };
  return [ais, (id) => void sign(id)];
}

const FOLD = (k: string) => <span className={`wl-fold ${k}`} aria-hidden="true" />;

export default function Welcome() {
  const show = useNext((d) => wanted(d));
  const [step, setStep] = useState<"" | "talk" | "life">("");
  const [said, setSaid] = useState(""), [busy, setBusy] = useState("");
  const [ais, sign] = useAis();
  const inp = useRef<HTMLInputElement>(null), wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (step) requestAnimationFrame(() => { inp.current?.focus(); inp.current?.select(); }); }, [step]);
  // --k: the drawing's sizes to this window, the start-up's scale (Day.tsx), so the card is as large as the screens before it
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--k", String(Math.max(1, Math.min(2.2, innerWidth / 1184, innerHeight / 600))));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [show]);
  // the folder picker's answer: the folder made one of Sol's (the engine's work.folder add), drawn by work.sessions
  useEffect(() => link.e?.subscribe((m: { type?: string; for?: string; path?: string; cancelled?: boolean; error?: string }) => {
    if (m?.type !== "next.folder.picked" || m.for !== "welcome") return;
    setBusy("");
    if (m.path) { live.added.push(m.path); link.e?.send({ type: "work.folder", op: "add", path: m.path }); link.e?.send({ type: "work.list" }); }
    else if (m.error) hooks.flash?.(`The folder picker didn’t open: ${m.error}`);
  }), [show]);
  if (!show) return null;

  const project = () => {
    if (MODE === "fixture") { M.newFolder("my project", "build"); return; }
    if (!link.e) return;
    setBusy("pick");
    link.e.send({ type: "next.folder.pick", prompt: "Choose a project folder", for: "welcome" });
  };
  const talk = (w: string) => {
    const text = w.trim();
    if (!text) return;
    if (MODE === "fixture") {
      change((d) => { d.regions.push({ id: "talks", name: "Talks", kind: "code", made: true }); d.pieces["t-1"] = { id: "t-1", region: "talks", kind: "session", name: text, ai: "Claude", copy: "talk", state: "working", term: { lines: [], waiting: null, stateWord: "working" }, talk: [text] }; hooks.layout?.(); });
    } else link.e?.send({ type: "work.say", sessionId: uuid(), fresh: true, opening: true, text });
    setSaid(""); setStep("");
  };
  const life = (n: string) => { const r = M.newFolder(n.trim() || "Life", "life"); if (r?.ok) { setSaid(""); setStep(""); } };
  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") { setStep(""); setSaid(""); }
    if (e.key === "Enter") { if (step === "talk") talk(said); else life(said); }
  };

  return (
    <div ref={wrap} className="wl-wrap" data-welcome="start">
      <section className="wl" aria-labelledby="wl-h" onClick={(e) => e.stopPropagation()}>
        <h2 className="wl-h" id="wl-h">What would you like to work on?</h2>
        <p className="wl-say">Pick one to start. You can add the rest any time from Add in the bar.</p>
        <button type="button" className="wl-start" data-start="project" onClick={project} disabled={busy === "pick"}>
          <span className="wl-ic">{FOLD("a1")}</span><span className="wl-t"><b>A project on this Mac</b><small>{busy === "pick" ? "Choose it in the window that opened…" : "Choose a folder. It becomes a folder here, sorted by what it holds"}</small></span>
        </button>
        {step === "talk" ? <label className="wl-start on" data-start="talk"><span className="wl-ic"><span className="wl-orb" aria-hidden="true" /></span>
          <span className="wl-t"><b>Talk to an AI</b><input ref={inp} className="wl-in" placeholder="What’s on your mind?" value={said} onChange={(e) => setSaid(e.target.value)} onKeyDown={enter} aria-label="What you want to talk about" /></span></label>
          : <button type="button" className="wl-start" data-start="talk" onClick={() => { setStep("talk"); setSaid(""); }}>
            <span className="wl-ic"><span className="wl-orb" aria-hidden="true" /></span><span className="wl-t"><b>Talk to an AI</b><small>A session about anything, filed when you’re done</small></span></button>}
        {step === "life" ? <label className="wl-start on" data-start="life"><span className="wl-ic">{FOLD("a2")}</span>
          <span className="wl-t"><b>Something in my life</b><input ref={inp} className="wl-in" value={said} onChange={(e) => setSaid(e.target.value)} onKeyDown={enter} aria-label="Name of the Life folder" /></span></label>
          : <button type="button" className="wl-start" data-start="life" onClick={() => { setStep("life"); setSaid("Life"); }}>
            <span className="wl-ic">{FOLD("a2")}</span><span className="wl-t"><b>Something in my life</b><small>A Life folder for errands, money, health…</small></span></button>}
        {ais.every((a) => a.st === "?") ? null : <div className="wl-ai">Your AI:{ais.map((a) => a.st === "in"
          ? <span key={a.id} className="wl-chip in" data-ai={a.id}>{a.n} · signed in</span>
          : a.st === "?" ? null
          : a.st === "missing" && a.id !== "claude" ? <span key={a.id} className="wl-chip" data-ai={a.id}>{a.n} · not on this Mac</span>
          : a.st === "missing" ? <button key={a.id} type="button" className="wl-chip" data-ai={a.id} onClick={() => sign(a.id)}>{a.n} · get it and sign in</button>
          : <button key={a.id} type="button" className="wl-chip" data-ai={a.id} onClick={() => sign(a.id)}>{a.n} · sign in</button>)}</div>}
      </section>
    </div>
  );
}

/** the card's seam for the counts (window.CV.hooks.welcome on the dev page) */
(hooks as unknown as { welcome: unknown }).welcome = { wanted: () => wanted(D) };
