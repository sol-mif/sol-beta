// A file mark (#674, look.md: file marks): the icon people know for a kind of file, in the jelly's light. Jelly (the
// pick): the page itself is the kind's colour in the jelly's light, its turned corner and its letter all that is left of
// the page; page: the familiar white page with the kind's lit tile; glass: a glass page with the kind as a lit drop
// (tokens.json, palette.looks.file; its `kinds` give each kind its letter and colour). `h` draws it at that height
// (52 is its own; the chat box's chips wear it at 32, #647).
import { curve } from "./curve";
import { black, label, dim, on, pearl, useUid } from "./paint";
import { CURVE, GLASS, LOOKS, SHADE, TYPE } from "./tokens";

export type FileLook = keyof typeof LOOKS.file.takes;
export type Kind = (typeof LOOKS.file.kinds)[number];
export const KINDS = LOOKS.file.kinds;
const S = CURVE.smoothing;

/** a page, its top right corner turned: the curve at the other three, the fold cut at 45° */
function page(w: number, h: number, r: number, fold: number) {
  const k = r * 0.45;
  return `M${r} 0H${w - fold}L${w} ${fold}V${h - r}C${w} ${h - k} ${w - k} ${h} ${w - r} ${h}H${r}C${k} ${h} 0 ${h - k} 0 ${h - r}V${r}C0 ${k} ${k} 0 ${r} 0Z`;
}
const foldPath = (w: number, fold: number) => `M${w - fold} 0V${fold - 3}Q${w - fold} ${fold} ${w - fold + 3} ${fold}H${w}Z`;

/** the jelly's light on a shape in a colour: the white of its rim from the upper left, its shade to the lower right, a
 *  bright rim inside the edge and a tight specular, as Body.tsx's shader lights it */
function Lit({ d, w, h, c, spec = [0.26, 0.14] }: { d: string; w: number; h: number; c: string; spec?: number[] }) {
  const id = useUid();
  return (<>
    <defs>
      <linearGradient id={`l${id}`} x1="0.1" y1="0" x2="0.75" y2="1"><stop offset="0" stopColor={on(1)} stopOpacity={GLASS.light.rim} /><stop offset="0.5" stopColor={on(1)} stopOpacity="0" /><stop offset="1" stopColor={black(1)} stopOpacity="0.16" /></linearGradient>
      <clipPath id={`c${id}`}><path d={d} /></clipPath>
      <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1" /></filter>
    </defs>
    <path d={d} fill={c} />
    <path d={d} fill={`url(#l${id})`} />
    <g clipPath={`url(#c${id})`}><path d={d} fill="none" stroke={on(1)} strokeOpacity="0.38" strokeWidth="2.2" /></g>
    <ellipse cx={w * spec[0]} cy={h * spec[1]} rx={w * 0.12} ry={h * 0.05} fill={on(1)} opacity="0.75" filter={`url(#b${id})`} />
  </>);
}
function Letter({ s, size, x, y }: { s: string; size: number; x: number; y: number }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={800} fill={on(1)} style={{ fontFamily: TYPE.family, letterSpacing: "-0.02em", filter: `drop-shadow(0 0.5px 0.8px ${black(0.35)})` }}>{s}</text>;
}
/** the kind's own sign when it has no letter (png: a picture, a sun over a hill) */
const Picture = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <g transform={`translate(${x - s / 2} ${y - s / 2})`}><circle cx={s * 0.7} cy={s * 0.3} r={s * 0.12} fill={on(1)} /><path d={`M0 ${s * 0.85}L${s * 0.35} ${s * 0.45}L${s * 0.6} ${s * 0.7}L${s * 0.75} ${s * 0.55}L${s} ${s * 0.85}Z`} fill={on(1)} /></g>
);

/** the mark of a kind of file, by its extension; a kind the kit does not know wears the last one's sign in its colour */
export function FileMark({ ext, look = LOOKS.file.pick, h }: { ext: string; look?: FileLook; h?: number }) {
  const kind = KINDS.find((k) => k[0] === ext) ?? KINDS[KINDS.length - 1], [, , letter, c] = kind;
  const W = 42, H = 52, F = 12, d = page(W, H, 7, F), id = useUid(), k = (h ?? H) / H;
  const at = { width: W * k, height: H * k, viewBox: `0 0 ${W} ${H}` };
  const sign = (cx: number, cy: number, big: boolean) => letter
    ? <Letter s={letter} size={letter.length > 1 ? (big ? 11 : 8.5) : big ? 18 : 13} x={cx} y={cy + 0.5} />
    : <Picture x={cx} y={cy} s={big ? 18 : 13} />;
  if (look === "page")
    return (
      <svg {...at} style={{ overflow: "visible" }} aria-hidden>
        <defs><linearGradient id={`p${id}`} x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stopColor={on(1)} /><stop offset="1" stopColor={pearl()} /></linearGradient></defs>
        <path d={d} fill={`url(#p${id})`} />
        <path d={foldPath(W, F)} fill={pearl()} /><path d={foldPath(W, F)} fill={black(0.07)} />
        <svg x={W / 2 - 13} y={H / 2 - 7} width={26} height={26} style={{ overflow: "visible" }}><Lit d={curve(26, 26, CURVE.radius.chip, S)} w={26} h={26} c={c} />{sign(13, 13, false)}</svg>
      </svg>
    );
  if (look === "glass")
    return (
      <svg {...at} style={{ overflow: "visible" }} aria-hidden>
        <path d={d} fill={black(SHADE.steps.raised)} />
        <path d={d} fill="none" stroke={on(GLASS.surfaces.raised.rim)} strokeOpacity="0.6" />
        <path d={foldPath(W, F)} fill={on(0.14)} />
        <svg x={W / 2 - 13} y={H / 2 - 9} width={26} height={28} style={{ overflow: "visible" }}>
          <ellipse cx={13} cy={16} rx={15} ry={13} fill={c} opacity="0.35" filter="blur(5px)" />
          <Lit d="M13 1C19 8 25 13 25 18.5C25 24 19.6 28 13 28C6.4 28 1 24 1 18.5C1 13 7 8 13 1Z" w={26} h={28} c={c} spec={[0.34, 0.46]} />{sign(13, 18.5, false)}
        </svg>
      </svg>
    );
  // the jelly: the page itself is the kind's colour in the jelly's light; its corner and its letter are all of the page
  return (
    <svg {...at} style={{ overflow: "visible" }} aria-hidden>
      <ellipse cx={W / 2} cy={H * 0.6} rx={W * 0.55} ry={H * 0.45} fill={c} opacity="0.3" filter="blur(7px)" />
      <Lit d={page(W, H, 12, F)} w={W} h={H} c={c} />
      <path d={foldPath(W, F)} fill={on(1)} opacity="0.45" />
      {sign(W / 2, H * 0.56, true)}
    </svg>
  );
}

/** a file as a chip: its mark and its name under it */
export function FileChip({ ext, name, look }: { ext: string; name: string; look?: FileLook }) {
  return (
    <div style={{ width: 66, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ height: 60, display: "grid", placeItems: "center" }}><FileMark ext={ext} look={look} /></div>
      <div style={{ ...label, color: dim, marginTop: 6 }}>{name}.{ext}</div>
    </div>
  );
}
