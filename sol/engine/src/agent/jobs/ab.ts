// The A/B test of the outreach variants, pure: who gets which variant, the numbers per variant, how likely each is the
// best, and when one has won. No disk, no clock, no randomness of its own (a test hands in its own `rnd`).
//
// The reply rate of a variant is unknown; after `sent` messages and `replied` replies, what we believe about it is a
// Beta(1 + replied, 1 + sent − replied) (a flat start). "How likely is A the best" is the chance that A's rate is
// above every other variant's, worked out on a grid (deterministic, no sampling). A variant wins when that chance is
// at least 90 % and every live variant has at least 15 sent; until then the answer is "no winner yet".

export type Tally = { variant: string; assigned: number; sent: number; replied: number; met: number };
export type Verdict = {
  /** per variant: the chance its reply rate is the highest, 0..1 */
  best: Record<string, number>;
  winner: string | null;
  /** the variant to retire once there is a winner: the least likely to be best */
  loser: string | null;
  why: string;
};
export const MIN_SENT = 15;
export const WIN_LINE = 0.9;

/** the next person's variant: one of the live variants with the fewest people so far, picked at random among them */
export function assign(live: string[], assigned: Record<string, number>, rnd: () => number = Math.random): string | null {
  if (!live.length) return null;
  const least = Math.min(...live.map((v) => assigned[v] ?? 0));
  const pool = live.filter((v) => (assigned[v] ?? 0) === least).sort();
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/** the numbers per variant, from the people (their variant, whether sent, replied, met) */
export function tally(variants: string[], people: { variant: string; sent: boolean; replied: boolean; met: boolean; dropped?: boolean }[]): Tally[] {
  return variants.map((v) => {
    const mine = people.filter((p) => p.variant === v);
    return {
      variant: v,
      assigned: mine.filter((p) => !p.dropped || p.sent).length,
      sent: mine.filter((p) => p.sent).length,
      replied: mine.filter((p) => p.sent && p.replied).length,
      met: mine.filter((p) => p.sent && p.met).length,
    };
  });
}

/** the mean of a variant's Beta: what we expect its reply rate to be */
export const meanOf = (t: { sent: number; replied: number }) => (1 + t.replied) / (2 + t.sent);

// log Γ(x) by Lanczos (g = 7), enough for the Beta's shape here
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = LG[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** the chance each variant's reply rate is the highest, on a grid of n points (pure, deterministic) */
export function chanceBest(ts: { variant: string; sent: number; replied: number }[], n = 2000): Record<string, number> {
  if (!ts.length) return {};
  if (ts.length === 1) return { [ts[0].variant]: 1 };
  const xs = Array.from({ length: n }, (_, k) => (k + 0.5) / n);
  const dens = ts.map((t) => {
    const a = 1 + t.replied, b = 1 + Math.max(0, t.sent - t.replied);
    const lb = logGamma(a) + logGamma(b) - logGamma(a + b);
    const d = xs.map((x) => Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lb) / n);
    const sum = d.reduce((s, v) => s + v, 0);
    return d.map((v) => v / sum);
  });
  // the share of each variant's belief below each grid point (half of the point's own share, so ties split evenly)
  const below = dens.map((d) => { let c = 0; return d.map((v) => { const b = c + v / 2; c += v; return b; }); });
  const out: Record<string, number> = {};
  ts.forEach((t, i) => {
    let p = 0;
    for (let k = 0; k < n; k++) {
      let rest = dens[i][k];
      for (let j = 0; j < ts.length && rest > 0; j++) if (j !== i) rest *= below[j][k];
      p += rest;
    }
    out[t.variant] = p;
  });
  const total = Object.values(out).reduce((s, v) => s + v, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

/** has a variant won? Every live variant at least MIN_SENT sent, and one at least WIN_LINE likely the best */
export function verdict(ts: Tally[], o: { minSent?: number; line?: number } = {}): Verdict {
  const minSent = o.minSent ?? MIN_SENT, line = o.line ?? WIN_LINE;
  const best = chanceBest(ts);
  if (ts.length < 2) return { best, winner: null, loser: null, why: "no winner yet: there is only one variant" };
  const short = ts.filter((t) => t.sent < minSent);
  const top = [...ts].sort((a, b) => best[b.variant] - best[a.variant] || meanOf(b) - meanOf(a))[0];
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  if (short.length) return { best, winner: null, loser: null, why: `no winner yet: ${short.map((t) => `${t.variant} has ${t.sent} sent`).join(", ")}, each needs ${minSent}` };
  if (best[top.variant] < line) return { best, winner: null, loser: null, why: `no winner yet: ${top.variant} leads, ${pct(best[top.variant])} likely the best; a winner needs ${pct(line)}` };
  const loser = [...ts].sort((a, b) => best[a.variant] - best[b.variant] || meanOf(a) - meanOf(b))[0];
  return { best, winner: top.variant, loser: loser.variant === top.variant ? null : loser.variant, why: `${top.variant} wins: ${pct(best[top.variant])} likely the best, every variant at ${minSent} sent or more` };
}

/** the numbers in plain words, one line per variant, then the verdict (pure) */
export function abWords(ts: Tally[], v: Verdict): string[] {
  const lines = ts.map((t) => `${t.variant}: ${t.sent} sent, ${t.replied} replied${t.sent ? ` (${Math.round((100 * t.replied) / t.sent)} %)` : ""}, ${t.met} met; ${Math.round((v.best[t.variant] ?? 0) * 100)} % likely the best.`);
  return [...lines, v.why.charAt(0).toUpperCase() + v.why.slice(1) + "."];
}

/** where a variant's reply rate most likely is: the 5 % and 95 % points of its Beta, on a grid (pure) */
export function interval(t: { sent: number; replied: number }, lo = 0.05, hi = 0.95, n = 1000): [number, number] {
  const a = 1 + t.replied, b = 1 + Math.max(0, t.sent - t.replied);
  const d = Array.from({ length: n }, (_, k) => { const x = (k + 0.5) / n; return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x)); });
  const sum = d.reduce((s, v) => s + v, 0);
  let c = 0, from = 0, to = 1;
  for (let k = 0; k < n; k++) { const before = c; c += d[k] / sum; if (before < lo && c >= lo) from = k / n; if (before < hi && c >= hi) { to = (k + 1) / n; break; } }
  return [from, to];
}
