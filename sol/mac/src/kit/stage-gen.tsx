// The generator's dev page (#1245, item 1): a spec on the left, what it draws on the right at its real size on the
// window's glass (stage-whole.tsx's frame: the desk under the blur and the base), the lint's notes under the spec. Five
// examples as pills above the field, and a wrong one to see the lint at work; above the spec, "say it": a sentence
// through gen/say.ts fills the spec (editable) and draws it, the six sentences listed under it. Dev only.
//   gen.html                 the first example
//   gen.html?say=<words>     a sentence, said
//   gen.html?ex=wrong        an example by its key (run, ask, files, sessions, count, wrong)
//   gen.html?spec=<base64>   a spec of your own (the day page deep-links one); the field writes it back as you type
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { setBodyVariant } from "../body/variants";
import { ACCENT_MOVES, Coin, LitSet, PillControl, Sign, dim, ink, mute, pieceStyle, surface, well } from "./Accent";
import { DEFAULT_SET, litOf } from "./Yours";
import { Draw } from "./gen/render";
import { lint } from "./gen/lint";
import { sayOut } from "./gen/say";
import { textW } from "./paint";
import { CURVE, SHADE, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

setBodyVariant("one");

// the five are the person's own day (rule 38: never sample content), the same person as the day page's (stage-day/person.ts)
const EXAMPLES: Record<string, { name: string; spec: unknown }> = {
  run: { name: "run", spec: {
    piece: "Block", props: { title: "chapter 6, summed up", w: 400 }, children: [
      { piece: "Text", props: { words: "Read the chapter, worked the four proofs, wrote one page of notes." } },
      { piece: "Meter", props: { value: 1, label: "proofs worked" } },
      { piece: "Sticker", props: { words: "done 07:40", role: "done", at: "corner" } },
    ] } },
  ask: { name: "your call", spec: {
    piece: "Block", props: { title: "the rota, saturday hours", w: 420 }, state: "waiting", children: [
      { piece: "Sticker", props: { words: "your call", role: "ask", at: "edge" } },
      { piece: "Text", props: { words: "May I send next week's rota to the café's group now?" } },
      { piece: "Stack", props: { direction: "row", gap: 4 }, children: [
        { piece: "Pill", props: { words: ["send it"], h: "32" }, state: "hover" },
        { piece: "Pill", props: { words: ["not yet"], h: "32" } },
      ] },
    ] } },
  files: { name: "files", spec: {
    piece: "Block", props: { title: "made for the zine", mark: "3", w: 360 }, children: [
      { piece: "Stack", props: { direction: "row", gap: 16, align: "start" }, children: [
        { piece: "FileTile", props: { kind: "md", name: "letter.md" } },
        { piece: "FileTile", props: { kind: "png", name: "the street.png" }, state: "made" },
        { piece: "FileTile", props: { kind: "png", name: "the owner.png" } },
      ] },
    ] } },
  sessions: { name: "sessions", spec: {
    piece: "List", props: { title: "the zine", count: "4", w: 280 }, children: [
      { piece: "SessionRow", props: { title: "today" } },
      { piece: "SessionRow", props: { title: "issue three, the spreads", aside: "2m" }, state: "active-running" },
      { piece: "SessionRow", props: { title: "cover ideas" }, children: [{ piece: "Coin", props: { role: "done", d: 8 } }] },
      { piece: "SessionRow", props: { title: "printing quotes" } },
    ] } },
  count: { name: "counter", spec: {
    piece: "Card", props: { w: 220, gap: 4 }, children: [
      { piece: "Text", props: { role: "number", words: "7" } },
      { piece: "Text", props: { role: "caption", words: "runs landed today" } },
    ] } },
  wrong: { name: "wrong", spec: {
    piece: "Stack", props: { direction: "row", gap: 18 }, children: [
      { piece: "Card", props: { background: "#ff3b30", rotate: 4, boxShadow: "0 0 40px rgba(255,0,200,.8)", fontFamily: "Papyrus" }, children: [
        { piece: "Heading", text: "Deploy", color: "#bf5af2" }, { piece: "Badge", text: "live", color: "#30d158", tilt: 10 }] },
      { piece: "Crad", props: { background: "#0a84ff", rotate: -6, glow: "0 0 24px cyan", elevation: "floating" }, children: [
        { piece: "Heading", text: "Tests", style: { fontSize: 32, fontWeight: 800 } }, { piece: "ProgressBar", progress: 64, color: "#0a84ff" },
        { piece: "Spinner", state: "loading" }] },
      { piece: "Card", props: { background: "linear-gradient(#f0f,#0ff)", style: { transform: "rotate(8deg)" }, depth: 9 }, children: [
        { piece: "Heading", text: "Review", fontFamily: "Comic Sans MS" }, { piece: "Button", label: "approve", color: "#30d158", shadow: "0 4px 20px #30d158" },
        { piece: "RunMark", state: "running" }] },
    ] } },
};

/** what an agent says (gen/say.ts): each sentence fills the spec below it, editable */
const SAYINGS = [
  "a run laying out the spreads, three steps, the second one now, 6 of 10",
  "two files from the dawn walk, png, with a done stamp at 9:04",
  "a question: pay on delivery friday, yours now",
  "the count of things landed since 8, big",
  "a handover from the café: two sessions, one active, a decision to open at 7",
  "the rota thread, four lines, decided at 8:41",
];

const q = new URLSearchParams(location.search);
const pretty = (x: unknown) => JSON.stringify(x, null, 2);
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const first = (() => {
  const s = q.get("spec");
  if (s) { try { return { key: "", text: pretty(JSON.parse(fromB64(s))) }; } catch { try { return { key: "", text: fromB64(s) }; } catch { /* not base64 */ } } }
  const k = q.get("ex") && q.get("ex")! in EXAMPLES ? q.get("ex")! : "run";
  return { key: k, text: pretty(EXAMPLES[k].spec) };
})();

const SIDE = 440, PAD = 24;
const label = { fontSize: T.label[0], lineHeight: `${T.label[1]}px` };

function Page() {
  const [key, setKey] = useState(first.key), [text, setText] = useState(first.text);
  // what parses is drawn; while the JSON is half typed the last spec that parsed stays
  const [good, setGood] = useState<unknown>(() => JSON.parse(first.text));
  const typing = useMemo(() => { try { JSON.parse(text); return false; } catch { return true; } }, [text]);
  useEffect(() => {
    try { setGood(JSON.parse(text)); } catch { /* half typed */ }
    const u = new URL(location.href);
    u.search = key ? `?ex=${key}` : `?spec=${toB64(JSON.stringify(JSON.parse(text)))}`;
    try { history.replaceState(null, "", u); } catch { /* half typed */ }
  }, [text, key]);
  const r = useMemo(() => lint(good), [good]);
  const [said, setSaid] = useState(q.get("say") ?? ""), [saidNotes, setSaidNotes] = useState<string[]>([]);
  const pick = (k: string) => { setKey(k); setSaid(""); setSaidNotes([]); setText(pretty(EXAMPLES[k].spec)); };
  // a sentence fills the spec (editable after) and draws it; what say could not place joins the lint's notes
  const saying = (v: string) => {
    setSaid(v); setKey("");
    if (!v.trim()) { setSaidNotes([]); return; }
    const o = sayOut(v); setSaidNotes(o.notes); setText(pretty({ ...o.spec, props: { w: 400, ...o.spec.props } }));
  };
  useEffect(() => { if (said) saying(said); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = [...saidNotes, ...r.notes.filter((n) => !saidNotes.includes(n))];

  return (
    <div data-ac style={{ ...pieceStyle, position: "fixed", inset: 0, overflow: "hidden", background: "#000", color: ink }}>
      <style>{ACCENT_MOVES}</style>
      {/* the window's glass, as stage-whole.tsx's: the desk under the blur and the base (rule 2: the one see-through thing) */}
      <div style={{ position: "absolute", inset: 0, background: `url(${desk}) 50% 0 / cover` }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />

      {/* the spec: the examples, the field, the notes */}
      <div style={{ position: "absolute", left: PAD, top: PAD, bottom: PAD, width: SIDE, borderRadius: CURVE.radius.block, ...surface("card"), display: "flex", flexDirection: "column", padding: 16, gap: 12, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
          <span style={{ fontSize: T.body[0], fontWeight: 500 }}>the generator</span>
          <span style={{ ...label, color: mute }}>a spec, linted into the one system</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {Object.entries(EXAMPLES).map(([k, e]) => (
            <button key={k} data-ex={k} onClick={() => pick(k)} style={{ all: "unset", cursor: "pointer", borderRadius: 16 }}>
              <PillControl s={k === key ? "picked" : "rest"} w={Math.ceil((textW(e.name, T.body[0], 500) + 28) / 2) * 2} h={32}>{e.name}</PillControl>
            </button>
          ))}
        </div>
        {/* say it: a sentence in the kit's own words (gen/say.ts), above the spec it becomes */}
        <div style={{ display: "grid", gap: 4, flex: "none" }}>
          <input data-say value={said} placeholder="say it: a run laying out the spreads, three steps…" spellCheck={false} onChange={(e) => saying(e.target.value)}
            style={{ all: "unset", height: 36, borderRadius: 18, padding: "0 14px", ...well(), color: ink, fontSize: T.body[0] }} />
          <div style={{ display: "grid", gridAutoRows: 20 }}>
            {SAYINGS.map((x) => (
              <button key={x} data-saying onClick={() => saying(x)}
                style={{ all: "unset", cursor: "pointer", fontSize: T.label[0], lineHeight: "20px", height: 20, color: x === said ? ink : dim, padding: "0 14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x}</button>
            ))}
          </div>
        </div>
        <textarea data-field value={text} spellCheck={false} onChange={(e) => { setKey(""); setSaidNotes([]); setText(e.target.value); }}
          style={{ flex: "1 1 0", minHeight: 160, resize: "none", border: "none", outline: "none", borderRadius: CURVE.radius.block - 6, padding: "12px 14px", ...well(),
            color: ink, fontFamily: `ui-monospace, "SF Mono", Menlo, monospace`, fontSize: T.code[0], lineHeight: `${T.code[1]}px`, tabSize: 2 }} />
        <div data-notes style={{ flex: "0 1 auto", maxHeight: "38%", overflow: "auto", display: "grid", gap: 6, padding: "0 2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...label, color: dim }}>
            {notes.length ? <span style={{ fontWeight: 500, color: ink }}>{notes.length} {notes.length === 1 ? "change" : "changes"}</span>
              : <><Coin role="done" d={14}><Sign d="tick" s={9} w={2} /></Coin><span>in the system as written</span></>}
            {typing && <span style={{ color: mute }}>· not JSON yet: drawing the last spec that parsed</span>}
          </div>
          {notes.map((n, i) => <div key={i} data-note style={{ ...label, color: dim, paddingLeft: 10, borderLeft: `2px solid ${"rgba(255,255,255,0.08)"}` }}>{n}</div>)}
        </div>
      </div>

      {/* what it draws, at its real size */}
      <div data-stage style={{ position: "absolute", left: SIDE + PAD * 2, right: 0, top: 0, bottom: 0, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "96px 32px" }}>
        <Draw spec={r.spec} />
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

// the pieces wear the default set, as the day's do (stage-day.tsx); without it they fell back to the jelly's pure six (rule 16)
const DEFAULT_LIT = litOf(DEFAULT_SET);
createRoot(document.getElementById("root")!).render(<StrictMode><LitSet value={DEFAULT_LIT}><Page /></LitSet></StrictMode>);
