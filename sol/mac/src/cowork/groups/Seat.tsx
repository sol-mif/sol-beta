// A seat at a table (#1537): the person as the design's jelly (Jelly.tsx) with their AI as a coin on its lower right.
// Shared by the home, the group page, consent and join (#1537's three followers): they add, they do not change it.
import { Jelly } from "./Jelly";
import type { Coin } from "./view";
import type { CoinState } from "./Coin";

const STATE: Record<Coin, CoinState> = { work: "work", ask: "wait", done: "done", rest: "idle" };

/** `up`: lifted, the one who waits on me; `look`: where the eyes go; `sleep`: away; `ring` what the coin sits on */
export function Seat({ login, me, coin, size = 96, ring, up, look, sleep }: { login: string; me: string; coin: Coin; size?: number; ring: string; up?: boolean; look?: number; sleep?: boolean }) {
  return <span className="gh-seat" data-who={login}><Jelly login={login} me={me} s={size} ai={STATE[coin]} ring={ring} up={up} look={look} sleep={sleep} /></span>;
}
