// The pure half of an orchestration session's renewal in the side (2026-11-14; the hook is sideKept.ts): which renewals
// are new, which rows are handing over. Pure, so src/side-kept.test.ts walks it.
export type OrchKept = { sessionId: string; renewing?: { at: number } | null; renewals?: { from: string; to: string; at: number }[] };

/** the renewals in `list` not yet in `seen` (each `from>to` once), oldest first; `seen` grows (pure but for `seen`) */
export function freshRenewals(list: OrchKept[], seen: Set<string>): { from: string; to: string }[] {
  const out: { from: string; to: string; at: number }[] = [];
  for (const o of list) for (const r of o.renewals ?? []) { const k = `${r.from}>${r.to}`; if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out.sort((a, b) => a.at - b.at).map(({ from, to }) => ({ from, to }));
}

/** the ids of the orchestration sessions writing their handover now (pure) */
export const handingOver = (list: OrchKept[]): Set<string> => new Set(list.filter((o) => o.renewing).map((o) => o.sessionId));
