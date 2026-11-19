// The spec builder (#1433): a team's setup and its live records → cowork-spec.json (spec.ts). A port of the answer key's
// counting (mine/look/cowork/o1/build.mjs): every count has one home, so each layer sums to one total; a call, a clash
// line and a PR pair live where most of their parts are. Pure: read.ts gathers the records, the part answers the face.
import type { MapCall, MapChange, MapInput, MapPair, MapPin, MapPr, MapSpec, Place, PinRule, RoomLine, Setup } from "./spec.js";

const DAY = 86_400_000;
const stat = () => ({ broken: 0, prs: [] as number[], calls: [] as number[], clash: 0, pairs: {} as Record<string, number>, prClash: 0, prPairs: {} as Record<string, number>, alone: 0 });
const refsOf = (s: string) => [...s.matchAll(/#(\d+)\b/g)].map((m) => +m[1]);
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (all, k) => (k in v ? String(v[k]) : all));

export function buildSpec(setup: Setup, input: MapInput, window = 72): MapSpec {
  const now = input.now, nowS = Math.round(now / 1000);
  // who: a login or a git name, to one of the setup's people; anyone else is "other"
  const alias = new Map<string, string>();
  for (const p of setup.people) for (const k of [p.id, p.name, ...p.logins, ...(p.names ?? [])]) alias.set(k.toLowerCase(), p.id);
  const who = (s: string) => alias.get(s.replace(/\[bot\]$/i, "").replace(/'s agent.*$/i, "").trim().toLowerCase()) ?? "other";

  const skip = new Set(setup.skip ?? []), moves = setup.moves ?? {};
  const parts = input.parts.filter((p) => !skip.has(p.id));
  const rec = new Map(parts.map((p) => [p.id, p]));
  const first = setup.outcomes[0]?.id ?? "all";
  const outcomeOf = (id: string) => moves[id] ?? setup.outcomes.find((o) => o.areas.includes(id.split("/")[0]))?.id ?? first;
  const chain = (id: string): string[] => {
    const o = "o:" + outcomeOf(id);
    if (moves[id]) return [o, id];
    const s = id.split("/");
    return [o, ...s.map((_, i) => s.slice(0, i + 1).join("/"))];
  };

  // the tree: outcome › area › group › part, as deep as each area goes
  const P: Record<string, Place> = {};
  const node = (id: string, parent: string | null): Place => (P[id] ||= {
    id, parent, name: id.startsWith("o:") ? "" : rec.get(id)?.name ?? id.split("/").pop()!, kids: [], parts: 0,
    ...(rec.get(id)?.state ? { state: rec.get(id)!.state } : {}), owner: rec.get(id)?.owner ? who(rec.get(id)!.owner!) : null,
    ...(rec.get(id)?.about ? { about: rec.get(id)!.about } : {}), ...stat(),
  });
  node("root", null).name = "root";
  for (const o of setup.outcomes) { const n = node("o:" + o.id, "root"); P.root.kids.push(n.id); }
  for (const p of parts) {
    let par = "root";
    for (const id of chain(p.id)) {
      const n = node(id, par);
      if (!P[par].kids.includes(id)) P[par].kids.push(id);
      n.parts++; if (p.state === "broken") n.broken++;
      par = id;
    }
  }
  const up = (ids: string[]) => new Set(ids.filter((id) => rec.has(id)).flatMap(chain));

  // the changes in the window
  const since = now - window * 3_600_000;
  const changes: MapChange[] = input.changes.filter((c) => c.at >= since).map((c) => ({
    h: c.sha, ago: Math.round((now - c.at) / 60_000), by: who(c.author), how: (c.agent ? "agent" : "hand") as MapChange["how"], s: c.subject, parts: c.systems.filter((x) => rec.has(x)),
  })).filter((c) => c.parts.length);

  // the open PRs, the issues each names, and the parts each holds
  const prs: (MapPr & { refs: number[]; files: string[] })[] = input.prs.map((p) => ({
    n: p.number, t: p.title, by: who(p.author), draft: p.draft, idle: Math.max(0, Math.round((now - Date.parse(p.updated ?? p.created ?? "")) / DAY) || 0),
    parts: (p.parts ?? []).filter((x) => rec.has(x)), refs: refsOf(`${p.title}\n${p.body ?? ""}`).filter((n) => n !== p.number), files: p.files ?? [],
  }));
  for (const p of prs) for (const id of up(p.parts)) P[id].prs.push(p.n);
  const issueParts = new Map<number, Set<string>>();
  for (const p of prs) for (const r of [...p.refs, p.n]) { const s = issueParts.get(r) ?? new Set<string>(); p.parts.forEach((x) => s.add(x)); issueParts.set(r, s); }
  const partsOfIssue = (n: number) => [...(issueParts.get(n) ?? [])];
  // one home per thing: the outcome holding most of its parts, then its first part there
  const homeOf = (ps: string[], fallback?: string): string[] => {
    const ok = ps.filter((x) => rec.has(x));
    if (!ok.length) return fallback ? ["o:" + fallback] : [];
    const by = new Map<string, number>();
    ok.forEach((x) => by.set(outcomeOf(x), (by.get(outcomeOf(x)) ?? 0) + 1));
    const o = [...by].sort((a, b) => b[1] - a[1])[0][0];
    return chain(ok.find((x) => outcomeOf(x) === o)!);
  };

  // the notes: the night's clash lines, and an agent acting alone
  const clash: { who: string[]; nums: number[] }[] = [], alone: { i: number; who: string; what: string }[] = [];
  for (const l of input.notes) {
    if (/\*\*Clash predicted\*\*/.test(l.body)) {
      const ws = [...l.body.matchAll(/#(\d+) \(([\w-]+),/g)].map((m) => who(m[2]));
      const nums = [...l.body.matchAll(/#(\d+) \(/g)].map((m) => +m[1]).concat(l.number);
      clash.push({ who: /and main on/.test(l.body) ? [ws[0], "main"] : ws, nums });
    } else if (/^\*\*absorbed\*\* by/.test(l.body)) alone.push({ i: l.number, who: who(l.author), what: "absorbed" });
    else if (/^Taking this/.test(l.body) && /agent/.test(l.body)) alone.push({ i: l.number, who: who(l.author), what: "took" });
    else if (/\(night job\)/.test(l.body)) alone.push({ i: l.number, who: who(l.author), what: "night" });
  }
  for (const k of clash) {
    if (k.who.length < 2 || k.who[0] === k.who[1] || k.who.includes("main")) continue;   // two people only
    const pair = k.who.slice(0, 2).sort().join("+");
    for (const id of homeOf(k.nums.flatMap(partsOfIssue))) { P[id].clash++; P[id].pairs[pair] = (P[id].pairs[pair] ?? 0) + 1; }
  }
  // two people's open PRs on the same files: computed now, not predicted
  const pairs: MapPair[] = [];
  for (let i = 0; i < prs.length; i++) for (let j = i + 1; j < prs.length; j++) {
    const a = prs[i], b = prs[j];
    if (a.by === "other" || b.by === "other" || a.by === b.by) continue;
    const bf = new Set(b.files), files = a.files.filter((x) => bf.has(x));
    if (!files.length) continue;
    const both = a.parts.filter((x) => b.parts.includes(x)), ps = both.length ? both : [...a.parts, ...b.parts];
    const pair = [a.by, b.by].sort().join("+");
    pairs.push({ a: a.n, b: b.n, pair, files: files.length, first: files[0], parts: ps });
    for (const id of homeOf(ps)) { P[id].prClash++; P[id].prPairs[pair] = (P[id].prPairs[pair] ?? 0) + 1; }
  }
  for (const a of alone) for (const id of up(partsOfIssue(a.i))) P[id].alone++;

  // the open calls: whose each is, how long it sat, where it lives
  const calls: MapCall[] = input.issues.filter((i) => (i.state ?? "open") === "open" && i.labels.includes("decision")).map((i) => {
    const upd = Date.parse(i.updated ?? i.created), made = Date.parse(i.created);
    const rule = (setup.calls_by ?? []).find((r) => r.issues?.includes(i.number) || (r.title && i.title.toLowerCase().includes(r.title.toLowerCase())));
    const w = rule?.who ?? (i.assignees[0] ? who(i.assignees[0]) : "nobody");
    const o = setup.outcomes.find((x) => x.labels.some((l) => i.labels.includes(l)))?.id ?? first;
    const h = homeOf(partsOfIssue(i.number), o);
    for (const id of h) P[id].calls.push(i.number);
    return { n: i.number, t: i.title.slice(0, 96), who: w, idle: Math.max(0, Math.round((now - upd) / DAY)), untouched: upd - made < 5 * 60_000, home: h[h.length - 1] };
  });

  for (const o of setup.outcomes) { const n = P["o:" + o.id]; n.name = o.name; n.holder = o.holder; if (o.means) n.about = o.means; }
  for (const n of Object.values(P)) {
    if (setup.names?.[n.id]) { n.reg = n.name; n.name = setup.names[n.id]; }
    if (setup.short?.[n.id]) n.short = setup.short[n.id];
    n.prs = [...new Set(n.prs)];
  }

  // what reaches each person's top: the setup's rules, counted on the same numbers the map draws
  const mine = (w: string) => calls.filter((c) => c.who === w);
  const inOut = (c: MapChange, o: string) => c.parts.some((x) => outcomeOf(x) === o);
  const pairN = (a: string, b?: string) => pairs.filter((c) => (b ? c.pair === [a, b].sort().join("+") : c.pair.split("+").includes(a))).length;
  // the words' counts: each a template's {var} over the same records, so no answer is typed into the setup
  const recent = (t?: string) => !!t && now - Date.parse(t) < DAY;
  const byPart = new Map<string, Set<string>>();
  for (const c of changes) if (c.by !== "other") for (const x of c.parts) byPart.set(x, (byPart.get(x) ?? new Set()).add(c.by));
  const vars: Record<string, string | number> = {
    calls_all: calls.length, window, changes: changes.length, pairs: pairs.length, prs: prs.length,
    shared: [...byPart.values()].filter((s) => s.size > 1).length,
    prs_day: input.prs.filter((p) => recent(p.updated ?? p.created)).length,
    calls_day: input.issues.filter((i) => calls.some((c) => c.n === i.number) && recent(i.updated ?? i.created)).length,
  };
  for (const p of setup.people) {
    vars[`changes_${p.id}`] = changes.filter((c) => c.by === p.id).length;
    vars[`prs_${p.id}`] = prs.filter((x) => x.by === p.id).length;
    vars[`lines_${p.id}`] = input.notes.filter((l) => who(l.author) === p.id && now - Date.parse(l.at) < window * 3_600_000).length;
    vars[`calls_${p.id}`] = mine(p.id).length;
    vars[`week_${p.id}`] = mine(p.id).filter((c) => c.idle >= 7).length;
    for (const q of setup.people) if (p.id < q.id) vars[`pairs_${p.id}_${q.id}`] = vars[`pairs_${q.id}_${p.id}`] = pairN(p.id, q.id);
  }
  const pinOf = (r: PinRule): MapPin => {
    const v: Record<string, string | number> = { ...vars };
    let count: MapPin["count"] | undefined;
    if (r.kind === "calls") {
      const m = mine(r.who!); v.n = m.length; v.untouched = m.filter((c) => c.untouched).length; v.week = m.filter((c) => c.idle >= 7).length;
      v.oldest = m.slice().sort((a, b) => b.idle - a.idle)[0]?.n ?? "";
    } else if (r.kind === "cross") { v.n = changes.filter((c) => c.by === r.by && inOut(c, r.into!)).length; count = { by: r.by!, under: "o:" + r.into }; }
    else if (r.kind === "broken") v.n = parts.filter((p) => p.state === "broken" && outcomeOf(p.id) === r.under).length;
    else if (r.kind === "pairs") v.n = pairN(r.who!, r.with);
    else if (r.kind === "stale") { const m = prs.filter((p) => p.by === r.who); v.total = m.length; v.n = m.filter((p) => p.idle >= (r.days ?? 7)).length; }
    // the press acts field by field; a field that fills to nothing is left out, and an issue that is not there
    // (no open call) leaves the press opening its view, said as such (#1464)
    const act: NonNullable<MapPin["act"]> = {};
    for (const [k, raw] of Object.entries(r.act ?? {}) as [keyof NonNullable<MapPin["act"]>, unknown][]) {
      const val = fill(String(raw ?? ""), v).trim();
      if (!val) continue;
      if (k === "issue") { const n = Number(val); if (Number.isInteger(n) && n > 0) act.issue = n; } else act[k] = val;
    }
    const lost = r.act?.issue !== undefined && act.issue === undefined;
    const press = lost ? `See ${setup.views.find((x) => x.id === (act.view ?? r.view))?.name ?? r.view}` : fill(r.press, v);
    return { says: fill(r.says, v), at: r.at, view: r.view, press, short: fill(r.short, v), why: fill(r.why, v),
      ...(Object.keys(act).length ? { act } : {}), ...(count ? { count } : {}) };
  };
  const surface: MapSpec["surface"] = {};
  for (const p of setup.people) {
    const order = setup.view_order[p.id] ?? setup.views.map((x) => x.id);
    surface[p.id] = { default_view: setup.views.find((x) => x.default && order.includes(x.id))?.id ?? order[0], top: (setup.pins[p.id] ?? []).slice(0, 3).map(pinOf) };
  }

  // the room: the newest line from each of us in the issue threads, the bots' housekeeping (the setup's room_skip) left out
  const seen = new Set<string>(), house = (setup.room_skip ?? []).map((x) => new RegExp(x));
  const clean = (b: string) => b.replace(/[*`_>#]/g, "").replace(/\s+/g, " ").replace(/ ?—? ?\w[\w-]*'s agent\.?$/, "").trim();
  const lines: RoomLine[] = input.notes.slice().sort((a, b) => (a.at < b.at ? 1 : -1))
    .filter((l) => who(l.author) !== "other" && !house.some((x) => x.test(l.body)) && l.body.length < 400)
    .filter((l) => !seen.has(who(l.author)) && !!seen.add(who(l.author))).slice(0, 3)
    .map((l) => ({ who: who(l.author), how: /'s agent/.test(l.body) ? "agent" : "hand", i: l.number, t: l.at, b: clean(l.body).slice(0, 140) }));

  // Folders: the registry's own first path segments, in outcome order, so a part the setup moves to another outcome
  // never stands as a folder of its own (#1464)
  const areas = [...new Set(setup.outcomes.flatMap((o) => P["o:" + o.id].kids).map((id) => id.split("/")[0]))].filter((id) => P[id]);
  const types = (setup.types ?? [{ id: "outcomes", name: "Outcomes", hint: "", roots: [] }, { id: "folders", name: "Folders", hint: "", roots: [] }])
    .map((t) => ({ ...t, roots: t.roots.length ? t.roots : t.id === "folders" ? areas : P.root.kids }));
  const layout = Object.fromEntries(setup.outcomes.filter((o) => o.xy).map((o) => ["o:" + o.id, o.xy!]));
  // the day's clock: each hour from the project's rhythm, each state from the registry record that runs it; a row that
  // runs on another (the release on the night) is unread while that one is broken or unread
  const stateOf = (from?: string) => {
    const n = from ? P[from] : undefined;
    if (!n) return "not read";
    return n.state === "broken" || (!n.state && n.broken) ? "broken" : n.state ?? "no fault on record";
  };
  const views: MapSpec["views"] = setup.views.map(({ clock, ...v }) => ({ ...v, ...(v.why ? { why: fill(v.why, vars) } : {}),
    ...(clock ? { clock: clock.map(({ from, after, hour, at, what }) => { const h = hour ? input.rhythm?.[hour] : undefined, before = after ? stateOf(after) : "";
      return { at: at ?? (typeof h === "string" ? h : "?"), what, state: before === "broken" || before === "not read" ? "unread" : stateOf(from) }; }) } : {}) }));
  return {
    what: "Cowork's map: the places, what moved on them, and how each person reads them", made_by: "the engine's spec builder (team/map/build.ts)",
    now: nowS, window,
    people: [
      ...setup.people.map((p) => ({ id: p.id, kind: "person" as const, name: p.name, set: p.set, logins: p.logins, ...(p.holds ? { holds: p.holds } : {}), ...(p.decides ? { decides: p.decides } : {}) })),
      ...setup.people.map((p) => ({ id: `${p.id}:agent`, kind: "agent" as const, acts_for: p.id })),
    ],
    places: P, types, ...(Object.keys(layout).length ? { layout } : {}),
    changes, prs: prs.map(({ refs, files, ...p }) => p), calls, pairs,
    views, view_order: setup.view_order, toggles: setup.toggles, surface, room: { lines },
    ...(setup.about ? { about: setup.about } : {}),
  };
}
