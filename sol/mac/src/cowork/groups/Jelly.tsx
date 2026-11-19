// The jelly of the groups design (#1537; docs/cowork-ui-2026-11-18/kit.js `jelly`, ported as it is): Marco's outline
// from body/Bodies.tsx as one dome, the six bands laid across it starting at the person's own colour, one rim, a gloss,
// pill eyes (or closed, asleep). Its AI is a coin on its lower right (Coin.tsx). Frank 2026-11-18: the design as drawn,
// one to one; where the kit had no such piece, the piece is made here.
import { Fragment, useId } from "react";
import { Coin, type CoinState } from "./Coin";

export const SIX = ["#ff2e4e", "#ff4888", "#fb7129", "#f89b2a", "#f4c82a", "#70df45"] as const;
const W = [10, 10, 50, 10, 10, 10];

/** a person's place among the six (pure): me first (0, the design's frank); anyone else by a stable hash of their login */
export function bandOf(login: string, me: string): number {
  if (login.toLowerCase() === me.toLowerCase()) return 0;
  let h = 0;
  for (const c of login.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 1 + (h % 5);
}

/** `s` the width (the design's 96 on a table, 24 in a rail); `look` shifts the eyes (3 right, -3 left); `sleep` closes
 *  them; `up` lifts it (the one who waits on me); `ring` what the coin sits on */
export function Jelly({ login, me, s = 56, look = 0, sleep, up, ai, ring }: { login: string; me: string; s?: number; look?: number; sleep?: boolean; up?: boolean; ai?: CoinState; ring?: string }) {
  const id = `gj${useId().replace(/:/g, "")}`;
  const off = bandOf(login, me);
  let acc = 0;
  const stops = SIX.map((_, i) => { const c = SIX[(i + off + 4) % 6], a = acc, b = acc + W[i]; acc = b; return <Fragment key={i}><stop offset={`${a + 1}%`} stopColor={c} /><stop offset={`${b - 1}%`} stopColor={c} /></Fragment>; });
  const shape = "M23 72C22 50 30 30 50 30C70 30 78 50 77 72C77 78 72 80 66 80L34 80C28 80 23 78 23 72Z";
  return (
    <b className={`gh-j${up ? " up" : ""}`} data-who={login} style={ring ? ({ ["--ring" as string]: ring }) : undefined}>
      <svg width={s} height={(s * 54) / 58} viewBox="21 28 58 54">
        <defs>
          <linearGradient id={id} x1="23" x2="77" y1="0" y2="0" gradientUnits="userSpaceOnUse">{stops}</linearGradient>
          <linearGradient id={`${id}v`} x1="0" x2="0" y1="30" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".30" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" />
          </linearGradient>
          <clipPath id={`${id}c`}><path d={shape} /></clipPath>
        </defs>
        <path d={shape} fill={`url(#${id})`} />
        <g clipPath={`url(#${id}c)`}>
          <rect x="20" y="28" width="60" height="54" fill={`url(#${id}v)`} />
          <ellipse cx="38" cy="39" rx="9" ry="4.2" transform="rotate(-28 38 39)" fill="#fff" opacity=".42" />
          <path d="M26 58C27 42 36 31.5 50 31.5C64 31.5 73 42 74 58" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" />
        </g>
        {sleep
          ? <path d={`M${39 + look} 55h6M${55 + look} 55h6`} stroke="#0a0a0b" strokeWidth="2.6" strokeLinecap="round" />
          : <><rect x={39.5 + look} y={48} width="5.4" height="11" rx="2.7" fill="#0a0a0b" /><rect x={55.1 + look} y={48} width="5.4" height="11" rx="2.7" fill="#0a0a0b" /></>}
      </svg>
      {ai && <Coin state={ai} size={s < 50 ? 18 : 22} />}
    </b>
  );
}
