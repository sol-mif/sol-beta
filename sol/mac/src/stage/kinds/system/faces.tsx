// The system block's faces (#1091): what each system is, shown on its tile. Every tile has the generic face (what it is
// for, its kind, how many paths change it); a few wear a live face of their own, drawn from the real thing: the tokens'
// values read from tokens.json by the engine, the kit's own pieces, the jelly's own Body, the modes named by their
// records, the look's default and every file that types it, the icon's still, the website's own colours. Read-only.
// The real pieces (#1220): the surfaces the redesign touches draw the kit's own components as they are today, small and
// live, and with the lens's show "after" the sitting's candidate (the pieces and the body drawn from the one system, #1186);
// components, never images.
import type { ReactNode } from "react";
import { Block, Button, Field, Glass, Halo, Pill, Row } from "../../../kit";
import { CURVE } from "../../../kit/tokens";
import { ACCENT_MOVES, ActiveRow, DoneTick, EffortChips, LitPill, Send } from "../../../kit/Accent";
import { Body } from "../../../Body";
import { VARIANTS } from "../../../body/variants";
import type { Show } from "./lens";
import icon from "../../../../src-tauri/icons/128x128@2x.png";   // under sol/mac, so the sol-beta export carries it
import type { Facts, Gap, Tile } from "./model";

type FaceProps = { t: Tile; facts: Facts; gaps: Gap[]; show?: Show };
const gapTo = (gaps: Gap[], from: string, to: string) => gaps.find((g) => g.from === from && g.to === to);

/** a desk behind a pane of the window: the jelly's colours under the one black at its shade, blur and corner */
function Desk({ f, h, children }: { f: Facts; h: number; children?: ReactNode }) {
  const tk = f.tokens, six = tk?.six.map((s) => s.hex) ?? [];
  return (
    <div className="sy-desk" style={{ height: h, background: six.length ? `linear-gradient(rgb(20 20 22 / .55), rgb(20 20 22 / .55)), linear-gradient(120deg, ${six.join(", ")})` : undefined }}>
      {tk && <div className="sy-win" style={{ background: hexA(tk.black, tk.window), backdropFilter: `blur(${tk.blur / 4}px)`, borderRadius: tk.corner }}>{children ?? <><i /><i /><i /></>}</div>}
    </div>
  );
}
const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgb(${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)} / ${a})` : hex;
};

function Tokens({ facts }: FaceProps) {
  const tk = facts.tokens;
  if (!tk) return <span className="sy-dim">tokens.json was not read</span>;
  return (
    <>
      <Desk f={facts} h={84} />
      <div className="sy-sw">{tk.six.map((s) => <i key={s.name} title={`${s.name} ${s.hex}`} style={{ background: s.hex }} />)}</div>
      <div className="sy-nums"><span>the black <b>{tk.black} at {tk.window}</b></span><span>blur <b>{tk.blur}</b></span><span>corner <b>{tk.corner}</b></span></div>
    </>
  );
}

function Kit({ facts }: FaceProps) {
  return (
    <Desk f={facts} h={96}>
      <div className="sy-kit">
        <Button h={26} flat>Button</Button>
        <Pill words={["Home", "Build"]} picked={0} h={26} />
        <Field w={64} h={26} />
      </div>
    </Desk>
  );
}

function Jelly() {
  return <div className="sy-stage"><Body size={72} state="settled" /></div>;
}

function Modes({ t, facts }: FaceProps) {
  const parts = t.parts ?? [];
  return (
    <Desk f={facts} h={86}>
      <div className="sy-kit">{parts.length ? <Pill words={parts.slice(0, 4)} picked={0} h={24} /> : <span className="sy-dim">no modes named yet</span>}</div>
    </Desk>
  );
}

function YourLook({ facts, gaps }: FaceProps) {
  const g = gapTo(gaps, "design/tokens", "product/settings/look"), typed = facts.typed ?? [];
  if (!g) return <span className="sy-badge ok">the default is read from the tokens</span>;
  return (
    <>
      <span className="sy-badge">the default is typed in {typed.length} place{typed.length === 1 ? "" : "s"}</span>
      <div className="sy-rows">{typed.map((f) => <div key={f}>{f}</div>)}</div>
    </>
  );
}

function Icon() {
  return <div className="sy-stage"><img className="sy-icon" src={icon} alt="the app icon's still" /></div>;
}

function Site({ facts, gaps }: FaceProps) {
  const own = !!gapTo(gaps, "design/tokens", "marketing/site"), s = facts.site, tk = facts.tokens;
  const bg = own ? s?.page ?? "#111" : tk ? hexA(tk.black, tk.window) : "#000", fg = own ? s?.ink ?? "#eee" : "rgb(255 255 255 / .92)";
  return (
    <>
      <div className="sy-site" style={{ background: bg, color: fg }}>
        <b>sol.matterfold.tech</b><i style={{ background: fg }} /><i style={{ background: fg, width: "60%" }} />
        <span style={{ background: fg, color: bg, borderRadius: own ? 4 : 999 }}>Try it</span>
      </div>
      {own ? <span className="sy-badge">its own colours, {s?.page ?? "?"}, not the tokens</span> : <span className="sy-badge ok">reads the tokens</span>}
    </>
  );
}

// ---- the real pieces (#1220) ----
/** a piece drawn at its own size, shrunk by `k` into the tile (zoom, so it takes the room it shows) */
const Mini = ({ k, children }: { k: number; children: ReactNode }) => <div className="sy-mini" style={{ zoom: k }}>{children}</div>;
/** today, the candidate, or both side by side, each named; the accent pieces' moves come with the candidate */
function Then({ show = "today", today, after, note }: { show?: Show; today: ReactNode; after: ReactNode; note?: string }) {
  const one = (w: "today" | "after", n: ReactNode) => <div className={`sy-then ${w}`}><span>{w}</span><div>{n}</div></div>;
  return (
    <>
      {show !== "today" && <style>{ACCENT_MOVES}</style>}
      <div className={`sy-pair${show === "both" ? " both" : ""}`}>{show !== "after" && one("today", today)}{show !== "today" && one("after", after)}</div>
      {note && <div className="sy-dim">{note}</div>}
    </>
  );
}
const Buttons = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-kit"><Button h={26} flat>Keep</Button><Pill words={["sonnet", "opus"]} picked={0} h={26} /></div>}
    after={<div className="sy-kit"><Mini k={0.42}><Send s="ready" /></Mini><Mini k={0.5}><LitPill s="lit" /></Mini></div>} />
);
const Composer = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-kit"><Field w={show === "both" ? 70 : 150} h={30} /><Pill words={["opus"]} picked={0} h={24} /><Button h={26} flat>↑</Button></div>}
    after={<div className="sy-kit"><Mini k={show === "both" ? 0.42 : 0.6}><Send s="ready" /></Mini><Mini k={0.4}><EffortChips s="medium" /></Mini></div>} />
);
const Sidebar = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-rows-k"><Row w={show === "both" ? 110 : 230} h={26} title="the release notes" picked /><Row w={show === "both" ? 110 : 230} h={26} title="post in #builds" /></div>}
    after={<Mini k={show === "both" ? 0.4 : 0.62}><ActiveRow s="active-running" /></Mini>} />
);
const BlockFrame = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-oldframe"><Glass r={CURVE.radius.box} /><b>a block</b><i /><i /></div>}
    after={<Mini k={show === "both" ? 0.5 : 0.7}><Block w={show === "both" ? 220 : 320} h={130} title="a block" state="resting" /></Mini>}
    note={show === "today" ? undefined : "after: the kit's Block, the folder-tab card (#766)"} />
);
const AccentSheet = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-kit"><Button h={24} flat>↑</Button><Pill words={["sonnet"]} picked={0} h={24} /><Halo size={26} doing="rest" /></div>}
    after={<div className="sy-kit"><Mini k={0.34}><Send s="ready" /></Mini><Mini k={0.4}><LitPill s="lit" /></Mini><Mini k={0.4}><DoneTick s="done" /></Mini></div>} />
);
const BodySitting = ({ show }: FaceProps) => (
  <Then show={show}
    today={<div className="sy-kit"><Body size={show === "both" ? 44 : 64} state="settled" variant="a" /></div>}
    after={<div className="sy-kit sy-bodies">{VARIANTS.filter((v) => v !== "a").map((v) => <span key={v}><Body size={show === "both" ? 44 : 64} state="settled" variant={v} /><b>{v}</b></span>)}</div>}
    note={show === "today" ? undefined : `after: the body ${VARIANTS.filter((v) => v !== "a").map((v) => `"${v}"`).join(", ")}, drawn from the one system`} />
);

/** what every system shows: what it is for, its kind and how many paths change it */
export function Generic({ t }: FaceProps) {
  const n = t.paths?.length ?? 0;
  return (
    <>
      {t.inArea && <div className="sy-about">{t.about}</div>}
      <div className="sy-meta">
        <span>{t.kind}</span>
        <span>{n ? `${n} path${n === 1 ? "" : "s"}` : "no path"}</span>
        {t.state !== "live" && <span className={`sy-state ${t.state}`}>{t.state}</span>}
        {t.guessed && <span className="sy-guess" title="its record names no layer: the lane is guessed from its kind">layer guessed</span>}
      </div>
    </>
  );
}

/** the systems with a face of their own, by id */
export const FACES: Record<string, (p: FaceProps) => ReactNode> = {
  "design/tokens": Tokens, "face/kit": Kit, "face/jelly-body": Jelly, product: Modes, "product/settings/look": YourLook,
  "design/icon": Icon, "marketing/site": Site,
  "product/buttons": Buttons, "product/build/composer": Composer, "product/build/sidebar": Sidebar,
  "product/build/frame": BlockFrame, "design/redesign/accent": AccentSheet, "design/redesign/body": BodySitting,
};
export function FaceOf(p: FaceProps) {
  const F = FACES[p.t.id];
  return F ? <><F {...p} />{p.t.guessed && <div className="sy-meta"><span className="sy-guess">layer guessed</span></div>}</> : <Generic {...p} />;
}
