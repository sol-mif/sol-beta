// The accent sheet (#1218, redrawn from the one system #1213): every piece on the window that carries a colour role, drawn
// from tokens.json palette.system by rules.md (kit/Accent.tsx), in its states and with its one motion, on the black glass. Dev only, like
// frame.html and feel.html: sol/design/system/accent.mjs builds and shoots it on the NucBox.
//   accent.html                     the sheet: one row per piece, its states, the motion playing, the moment and the why
//   accent.html?piece=send          one piece alone, large, its motion playing by itself (the clips)
//   accent.html?set=today|test      the token set Sol's role is lit by: today's tokens or the cold test set
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACCENT_MOVES, LitSet, PIECES, TEST_SET, TODAY, pieceStyle, type Lit, type Piece } from "./Accent";
import { dim, ink, label, mute, on } from "./paint";
import { SHADE, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

const q = new URLSearchParams(location.search);
const SETS: Record<string, { name: string; lit: Lit }> = {
  today: { name: "today's tokens (palette.jelly, glass.light)", lit: TODAY },
  test: { name: "a cold test set, to prove the switch", lit: TEST_SET },
};
const only = PIECES.find((p) => p.id === q.get("piece"));

/** the piece playing its one motion by itself: each state held for its time, round and round */
function Live({ p }: { p: Piece }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setI((i + 1) % p.play.length), p.play[i][1]);
    return () => clearTimeout(t);
  }, [i, p]);
  return <>{p.draw(p.play[i][0])}</>;
}

function Row({ p }: { p: Piece }) {
  return (
    <section data-piece={p.id} style={{ padding: "28px 0 30px", borderTop: `1px solid ${on(SHADE.on.line)}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
        <span style={{ fontSize: T.title[0], color: ink, fontWeight: 500 }}>{p.name}</span>
        <span style={{ ...label, color: mute }}>{p.family} · from pin {p.pin}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
        {p.states.map((s) => (
          <figure key={s} style={{ margin: 0 }}>
            <div data-cell={`${p.id}-${s}`} style={{ padding: 26, minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>{p.draw(s)}</div>
            <figcaption style={{ ...label, color: mute, textAlign: "center" }}>{s}</figcaption>
          </figure>
        ))}
        <figure style={{ margin: 0, marginLeft: 16, paddingLeft: 16, borderLeft: `1px solid ${on(SHADE.on.line)}` }}>
          <div style={{ padding: 26, minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}><Live p={p} /></div>
          <figcaption style={{ ...label, color: dim, textAlign: "center" }}>its motion, playing</figcaption>
        </figure>
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "110px 1fr", gap: "4px 14px", fontSize: T.body[0], lineHeight: `${T.body[1]}px`, maxWidth: 980 }}>
        <span style={{ color: mute }}>fires when</span><span style={{ color: ink }}>{p.moment}</span>
        <span style={{ color: mute }}>its motion</span><span style={{ color: dim }}>{p.motion}</span>
        <span style={{ color: mute }}>earns colour</span><span style={{ color: ink }}>{p.why}</span>
        <span style={{ color: mute }}>reads</span><span style={{ color: dim }}>{p.slots}</span>
        <span style={{ color: mute }}>today</span><span style={{ color: dim }}>{p.today}</span>
      </div>
    </section>
  );
}

function Sheet({ set, onSet }: { set: string; onSet: (s: string) => void }) {
  return (
    <main style={{ position: "relative", padding: "40px 56px 80px", maxWidth: 1480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 8 }}>
        <span style={{ fontSize: T.display[0], color: ink, fontWeight: 500 }}>The accent sheet</span>
        <select data-set value={set} onChange={(e) => onSet(e.target.value)} style={{ marginLeft: "auto", font: `${T.body[0]}px ${T.family}`, color: ink, background: "rgba(0,0,0,.55)", border: `1px solid ${on(0.14)}`, borderRadius: 10, padding: "6px 10px" }}>
          {Object.entries(SETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
      </div>
      <div style={{ fontSize: T.body[0], color: dim, maxWidth: 860, marginBottom: 26 }}>
        Every piece of the window that carries the jelly's colour or light, each a copy of one pin from the board of 2026-11-14, in its states, with
        its one motion and the moment that fires it. Lit by: <span style={{ color: ink }}>{SETS[set].name}</span>. The meaning colours (done, your call, wrong) never change with the set.
      </div>
      {PIECES.map((p) => <Row key={p.id} p={p} />)}
    </main>
  );
}

function One({ p }: { p: Piece }) {
  return (
    <div data-total={p.play.reduce((a, [, ms]) => a + ms, 0)} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div data-cell={`${p.id}-live`} style={{ transform: "scale(2.2)", padding: 20 }}><Live p={p} /></div>
      <div style={{ position: "absolute", bottom: 22, fontSize: T.body[0], color: dim }}>{p.name} · {p.moment}</div>
    </div>
  );
}

function App() {
  const [set, setSet] = useState(q.get("set") && q.get("set")! in SETS ? q.get("set")! : "today");
  useEffect(() => { document.body.dataset.ready = "1"; }, []);
  const pick = (s: string) => { setSet(s); const u = new URL(location.href); u.searchParams.set("set", s); history.replaceState(null, "", u); };
  return (
    <LitSet value={SETS[set].lit}>
      <style>{ACCENT_MOVES}</style>
      {/* the window's black at its shade over a plain mid grey, the whole page long: no wallpaper, so every colour on the
          sheet is a piece's own */}
      <div data-ac style={{ ...pieceStyle, position: "relative", minHeight: "100vh", background: `linear-gradient(rgba(0,0,0,${SHADE.window}), rgba(0,0,0,${SHADE.window})), #3a3a3d` }}>
        {only ? <One p={only} /> : <Sheet set={set} onSet={pick} />}
      </div>
    </LitSet>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
