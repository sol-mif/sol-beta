// How Sol sees you, what the screens draw, worked out from the engine's messages (BR1, #1615; mine/look/br1/you.html
// screens 2–4). Pure: no React, no engine, so the counts are tested on the panel people (sol/mac/src/next-you.test.ts).
//   shelf      screen 2's "On this Mac": one row per source Sol can read here, its words, whether the Mac asks first
//   fold       screen 3: the next.you.reading stream folded into the ledger (newest first), the places taking shape,
//              each source's state and line, the thrown counts, and the line on top
//   DIAL       screen 4's dial, what AIs may do in a place (the places themselves: circle.ts placesOf)
//   keyOf      a pasted key's provider, from its shape (the engine checks it with one call)
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Accounts, Bin, Connector, Ev, Level, More, Open, Perm, Setup, Source, SrcState, Suggest, Thrown, You } from "./types.ts";

/** each source in the screens' words: what it is, what Sol takes from it, and which Mac switch it needs (if any) */
export const SHELF: Record<Source, { name: string; gives: string; icon: string; perm?: string }> = {
  "claude-sessions": { name: "Claude Code", gives: "folders it worked in, session titles, skills and MCP tools; never what was said", icon: "claudecode" },
  "codex-sessions": { name: "Codex", gives: "folders and session titles; never what was said", icon: "codex" },
  apps: { name: "Apps", gives: "which apps you use, how often", icon: "apps" },
  browser: { name: "Browsers", gives: "which sites, how often; never the pages", icon: "browser", perm: "full-disk" },
  "calendar-store": { name: "Calendar", gives: "your dates, the next 30 days", icon: "calendar", perm: "full-disk" },
  notes: { name: "Notes", gives: "note titles and folders, never what is in them", icon: "notes", perm: "full-disk" },
  files: { name: "Files", gives: "names in Documents and Desktop", icon: "files" },
  projects: { name: "Your code", gives: "which folders are projects, their names", icon: "code" },
};
export const SHELF_KO: Partial<Record<Source, { name: string; gives: string }>> = {
  "claude-sessions": { name: "Claude Code", gives: "폴더, 세션 제목, 스킬, MCP 도구; 대화 내용은 안 봐요" },
  "codex-sessions": { name: "Codex", gives: "폴더와 세션 제목; 대화 내용은 안 봐요" },
  apps: { name: "앱", gives: "어떤 앱을 얼마나 자주" },
  browser: { name: "브라우저", gives: "어떤 사이트를 얼마나 자주; 페이지는 안 봐요" },
  "calendar-store": { name: "캘린더", gives: "앞으로 30일 일정" },
  notes: { name: "메모", gives: "메모 제목" },
  files: { name: "파일", gives: "문서·데스크탑의 파일 이름" },
};

export type ShelfRow = { source: Source; name: string; gives: string; icon: string; on: boolean; asks: Perm | null };
/** screen 2's "On this Mac": the sources found on this Mac (suggest.sources) first, ticked as suggested; a source that needs
 *  a Mac switch not yet on carries it (`asks`). A source not on this Mac is not drawn */
export function shelf(s: Suggest | null, ticked: ReadonlySet<Source>, perms: Perm[] | null, ko = false): ShelfRow[] {
  if (!s) return [];
  const present = [...new Set([...s.order, ...s.sources])];
  return present.map((source) => {
    const w = SHELF[source], k = ko ? SHELF_KO[source] : undefined, p = w.perm ? perms?.find((x) => x.id === w.perm) ?? null : null;
    return { source, name: k?.name ?? w.name, gives: k?.gives ?? w.gives, icon: w.icon, on: ticked.has(source), asks: p && p.granted !== true ? p : null };
  });
}

/** the Mac switches the ticked rows still need, each once (several sources can wait on one switch): Bring's one line,
 *  "Your Mac will ask you to allow 3 things · Show me" (scope 07:10, BR1 #1615) */
export const macAsks = (rows: ShelfRow[]): Perm[] => [...new Map(rows.filter((r) => r.on && r.asks).map((r) => [r.asks!.id, r.asks!])).values()];

/** where a Claude account's connector is connected: its own page in the account (the engine's connections.ts ACCOUNT_PAGE) */
export const CLAUDE_CONNECTORS = "https://claude.ai/settings/connectors";
/** Bring's connector tiles (walk note w2, #1615): only what the engine found (next.you.accounts: Claude's and Codex's MCP
 *  servers, the Claude account's connectors, GitHub through gh), never a list of names. A connected one says so; one not
 *  connected is a tile only where its Connect has a way that works from here (`at`): a Claude account's connector, on
 *  its page. Anything else not connected (gh signed out) has no way from this card, so no tile */
export type ConnTile = Connector & { at?: string };
export const connTiles = (a: Accounts | null): ConnTile[] =>
  (a?.connectors ?? []).flatMap((c): ConnTile[] => (c.connected ? [c] : c.via === "claude-account" ? [{ ...c, at: CLAUDE_CONNECTORS }] : []));
/** where a tile's connector lives, in a few words */
export const connVia = (c: Connector): string => (c.via === "codex" ? "in Codex" : c.via === "gh" ? "through gh" : "in Claude");

/** how many things "Bring these in (n)" brings: the ticked sources, the AIs signed in, the connectors connected */
export function bringCount(ticked: ReadonlySet<Source>, a: Accounts | null): number {
  return ticked.size + (a?.ais.filter((x) => x.signedIn).length ?? 0) + (a?.connectors.filter((c) => c.connected).length ?? 0);
}

/** a pasted key's provider, by its shape, the same shapes the engine checks (you-accounts.ts PROVIDERS); null: not one Sol knows */
export function keyOf(key: string): { id: string; name: string } | null {
  const k = key.trim();
  if (/^sk-ant-/.test(k)) return { id: "anthropic", name: "Anthropic" };
  if (/^sk-or-/.test(k)) return { id: "openrouter", name: "OpenRouter" };
  if (/^sk-/.test(k)) return { id: "openai", name: "OpenAI" };
  if (/^AIza/.test(k)) return { id: "google", name: "Google" };
  if (/^xai-/.test(k)) return { id: "xai", name: "xAI" };
  if (/^gsk_/.test(k)) return { id: "groq", name: "Groq" };
  if (/^[A-Za-z0-9]{32}$/.test(k)) return { id: "mistral", name: "Mistral" };
  return null;
}
/** a key as it may be shown: its start and its last four, never the whole */
export const keyShown = (key: string) => { const k = key.trim(); return k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : "…"; };

// ------------------------------------------------------------------------------------------------ screen 3, the stream

/** the place colours the engine names (you-read.ts COLOURS), as the design paints them */
export const COL: Record<string, string> = { coral: "#FFAFA0", sky: "#9FD3FF", mint: "#B6F0E0", lilac: "#C9B6FF", amber: "#FFD58A", pink: "#FFB3D1", lime: "#D3F28E", teal: "#9FE3D8" };
const ORDER = ["coral", "sky", "mint", "lilac", "amber", "pink", "lime", "teal"];
/** a colour as paint: a name the engine sent, a hex as it is, else the i-th of the set */
export const paint = (c: string | null | undefined, i = 0) => (c && COL[c]) || (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : COL[ORDER[i % ORDER.length]]);
/** a colour mixed toward ink, for a bar on paper (the design's deep()) */
export function deep(hex: string, k = 0.45): string {
  const n = parseInt(hex.slice(1), 16), ink = [29, 28, 26];
  return `rgb(${[16, 8, 0].map((b, j) => Math.round(((n >> b) & 255) * (1 - k) + ink[j] * k)).join(",")})`;
}

export type Line = { n: number; source: Source | "sieve"; item: string; notice: string; setup: string; colour: string | null; bin: boolean; place?: string; more?: More; open?: Open; from?: Source; binK?: Bin; count?: number };
/** a folder's count may still rise while an AI's sessions are yet to be read: its line says so (BR1 hold 2) */
export const rising = (r: Pick<Reading, "order" | "sources">, l: Pick<Line, "place">) =>
  !!l.place && r.order.some((s) => (s === "claude-sessions" || s === "codex-sessions") && !["done", "skipped", "stopped"].includes(r.sources[s]?.state ?? "waiting"));
export type Shape = { id: string; name: string; colour: string; share: number };
export type Reading = {
  order: Source[]; because: { aim: string; line: string } | null;
  sources: Partial<Record<Source, { state: SrcState; line: string; perm?: string }>>;
  lines: Line[];          // newest first
  places: Shape[];        // in the order they were first known; share moves as events come
  thrown: Partial<Thrown>;
  now: string;            // the line on top: what is being read now, or what is being made
  making: string | null;
  day: { hours: number[]; quiet: [number, number] | null } | null;   // from the making "day", before the picture
  firstAt: number | null; // ms from the press to the first event (the felt time)
  lastAt: number;
  you: You | null;
};
export const reading0 = (): Reading => ({ order: [], because: null, sources: {}, lines: [], places: [], thrown: {}, now: "", making: null, day: null, firstAt: null, lastAt: 0, you: null });

/** one event folded in; a new object each time, so a screen redraws */
export function fold(r: Reading, e: Ev): Reading {
  const at = typeof e.at === "number" ? e.at : r.lastAt;
  const n: Reading = { ...r, firstAt: r.firstAt ?? at, lastAt: at };
  switch (e.kind) {
    case "order": return { ...n, order: e.order, because: e.because };
    case "source": {
      const s = { ...n.sources, [e.source]: { state: e.state, line: e.line, ...(e.perm ? { perm: e.perm } : {}) } };
      return { ...n, sources: s, now: e.state === "reading" ? e.line : n.now };
    }
    case "item": {
      const place = e.setup ? n.places.find((p) => e.setup!.includes(p.name)) : undefined;
      const l: Line = { n: n.lines.length, source: e.source, item: e.item, notice: e.notice ?? "", setup: e.setup ?? "", colour: place?.colour ?? null, bin: false, ...(e.place ? { place: e.place } : {}), ...(e.more ? { more: e.more } : {}), ...(e.open ? { open: e.open } : {}) };
      // a folder said again (a second AI read it) is one line with its new count, where the first was (BR1 hold 2)
      // a row read again (next.you.read.again, its `again` the item asked from) takes that row's place and stays open
      const was = e.again ? n.lines.findIndex((x) => x.source === e.source && x.item === e.again) : e.place ? n.lines.findIndex((x) => x.place === e.place) : -1;
      if (was >= 0) return { ...n, lines: n.lines.map((x, k) => (k === was ? { ...l, n: x.n, colour: l.colour ?? x.colour } : x)), now: e.item };
      return { ...n, lines: [l, ...n.lines], now: e.item };
    }
    case "thrown": {
      const l: Line = { n: n.lines.length, source: "sieve", item: e.item, notice: "", setup: "", colour: null, bin: true, from: e.source, binK: e.bin, count: e.n };
      return { ...n, lines: [l, ...n.lines], thrown: { ...n.thrown, [e.bin]: (n.thrown[e.bin] ?? 0) + e.n } };
    }
    case "place": {
      const i = n.places.findIndex((p) => p.id === e.id), p = { id: e.id, name: e.name, colour: e.colour, share: e.share };
      const places = i < 0 ? [...n.places, p] : n.places.map((x, k) => (k === i ? p : x));
      // a line that set this place up before its colour was known takes it now
      const lines = n.lines.map((l) => (!l.colour && l.setup.includes(e.name) ? { ...l, colour: e.colour } : l));
      return { ...n, places, lines };
    }
    case "making": {
      // the rules' places, said before the words: the shares move to them, a colour kept where one was given
      const places = e.places ? e.places.map((p, k) => ({ ...p, colour: n.places.find((x) => x.id === p.id)?.colour ?? ORDER[k % ORDER.length] })) : n.places;
      const day = e.hours ? { hours: e.hours, quiet: e.quiet ?? null } : n.day;
      return { ...n, making: e.line, now: e.line, places, day };
    }
    case "done": return { ...n, you: e.you, making: null };
  }
  return n;
}

const BIN_W: Record<"en" | "ko", Record<Bin, string>> = {
  en: { keys: "passwords or keys", money: "money", health: "health", talk: "private talk", id: "ID numbers" },
  ko: { keys: "비밀번호", money: "돈", health: "건강", talk: "사적인 대화", id: "신분 번호" },
};
/** the thrown counts as the sieve line says them: "27 thrown away: 4 passwords or keys, 23 money" */
export function thrownLine(t: Partial<Thrown>, ko = false): string {
  const parts = (Object.entries(t) as [Bin, number][]).filter(([, v]) => v > 0);
  const all = parts.reduce((a, [, v]) => a + v, 0), w = BIN_W[ko ? "ko" : "en"];
  if (!all) return "";
  return ko ? `${all}개 버림: ${parts.map(([b, v]) => `${w[b]} ${v}`).join(", ")}` : `${all} thrown away: ${parts.map(([b, v]) => `${v} ${w[b]}`).join(", ")}`;
}
/** a skill's id in words: "someones-skills:grilling" → "grilling" (the engine's plainSkill, for a part's tools too) */
export const plainSkill = (id: string) => id.slice(id.lastIndexOf(":") + 1).replace(/[-_]+/g, " ").trim() || id;
/** the found card's AIs, skills and tools, each its own group and in words: the AIs signed in, then each skill and tool
 *  a sessions row named (its more's kind, or an older item "skill review · used 10 times" / "github, used 4 times") */
export function toolsOf(r: Reading, ais: string[]): { ais: string[]; skills: string[]; tools: string[] } {
  const skills: string[] = [], tools: string[] = [];
  for (const l of [...r.lines].reverse()) {
    if (l.more?.kind === "skill") { skills.push(plainSkill(l.more.name)); continue; }
    if (l.more?.kind === "tool") { tools.push(l.more.name); continue; }
    if (l.more || (l.source !== "claude-sessions" && l.source !== "codex-sessions")) continue;
    const m = /^(skill |MCP )?([^·]+?)\s*[,·]\s*used \d/.exec(l.item);
    if (!m) continue;
    const names = m[2].split(",").map((x) => x.trim()).filter(Boolean);
    (m[1] === "skill " || names.some((x) => x.includes(":")) ? skills : tools).push(...names.map(plainSkill));
  }
  return { ais: [...new Set(ais)], skills: [...new Set(skills)], tools: [...new Set(tools)] };
}
/** a list in words, the first few named: "a, b, c", "a, b, c, d and 4 more" */
export const listW = (xs: string[], and: (xs: string, n: number) => string, max = 4) =>
  xs.length <= max ? xs.join(", ") : and(xs.slice(0, max).join(", "), xs.length - max);
/** how long ago, in words ("yesterday", "3 weeks ago"); "" for no date */
export function ago(iso: string | undefined, ko = false, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (isNaN(t)) return "";
  const d = Math.floor((now - t) / 864e5);
  if (d <= 0) return ko ? "오늘" : "today";
  if (d === 1) return ko ? "어제" : "yesterday";
  if (d < 14) return ko ? `${d}일 전` : `${d} days ago`;
  if (d < 60) return ko ? `${Math.round(d / 7)}주 전` : `${Math.round(d / 7)} weeks ago`;
  return ko ? `${Math.round(d / 30)}개월 전` : `${Math.round(d / 30)} months ago`;
}
/** what a thrown row was about, in the sieve's words ("passwords or keys") */
export const binWord = (b: Bin, ko = false) => BIN_W[ko ? "ko" : "en"][b];

/** the places taking shape, biggest first */
export const shapes = (r: Reading) => [...r.places].sort((a, b) => b.share - a.share);

/** a ledger row's name (BR1 reading.html): "Claude Code · bistro-site" and its count in small, "· 18 chats"; a row named
 *  like its source ("Apps · 38") is the source alone with its count */
export function rowName(l: Pick<Line, "item" | "more">, src: string): { name: string; small: string } {
  const [head, ...tail] = l.item.split(" · ");
  const own = (l.more?.name ?? head).replace(/^(folder|폴더|프로젝트|skill|MCP) /, "").replace(/[“”"]/g, "").trim();
  const small = tail.length ? `· ${tail.join(" · ")}` : "";
  return { name: !own || own.toLowerCase() === src.toLowerCase() ? src : `${src} · ${own}`, small };
}
/** Taking shape's places in one sentence, biggest first: "<A> takes about half your time, then <B>, <C> and <D>" (parts,
 *  so the face bolds the names); a place with no share yet is named without one */
export function placesWords(ps: { name: string; share: number | null }[], ko = false): { b?: string; t?: string }[] {
  if (!ps.length) return [];
  const [a, ...rest] = ps, s = a.share ?? 0;
  const of = ko ? "" : s >= 0.42 ? " takes about half your time" : s >= 0.28 ? " takes about a third of your time" : s >= 0.18 ? " takes about a quarter of your time" : ps.length > 1 ? " takes the most time" : "";
  const out: { b?: string; t?: string }[] = [{ b: a.name }, { t: of }];
  if (!rest.length) return [...out, { t: ko ? "" : "." }];
  out.push({ t: ko ? ", " : ", then " });
  rest.forEach((p, i) => { if (i) out.push({ t: i === rest.length - 1 ? (ko ? ", " : " and ") : ", " }); out.push({ b: p.name }); });
  return [...out, { t: ko ? "" : "." }];
}
/** how long the read took, in words: "20 s", "2 min" */
export const tookWords = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`);

// ------------------------------------------------------------------------------------------------ screen 4, the rows

// the words pass (BR1): the dial says what the caption says, "looks, changes nothing · prepares, you approve · does it for you"
export const DIAL: { w: string; level: Level }[] = [{ w: "Looks, changes nothing", level: "record" }, { w: "Prepares, you approve", level: "draft" }, { w: "Does it for you", level: "do" }];
export const DIAL_KO = ["보기만", "준비까지", "해 줘요"];
/** a level's place on the dial (show is not on the dial: it reads as Looks, changes nothing) */
export const dialOf = (l: Level | null | undefined) => (l === "do" ? 2 : l === "draft" ? 1 : 0);

/** inside a run of hours [from, to), wrapping past midnight */
/** a quiet run the screen says: none longer than 16 hours, which is too little seen, not a quiet part of a day (a record
 *  read before the engine's own check, sol/engine next/you.ts quietOf, can hold "quiet 2–1pm", #1784) */
export const toldQuiet = (q: [number, number] | null): [number, number] | null => {
  const n = q ? (q[1] - q[0] + 24) % 24 : 0;
  return q && n > 0 && n <= 16 ? q : null;
};
export const within = (h: number, q: [number, number] | null) => !!q && (q[0] <= q[1] ? h >= q[0] && h < q[1] : h >= q[0] || h < q[1]);
/** a 24-hour strip: per hour, quiet (hatched) or an opacity from how busy it was; `own` is a part's own hours, drawn over
 *  the person's day */
export function strip(day: number[], q0: [number, number] | null, own?: number[]): { q: boolean; o: number }[] {
  const quiet = toldQuiet(q0), top = Math.max(1e-9, ...day), mine = own ? Math.max(1e-9, ...own) : 1;
  return Array.from({ length: 24 }, (_, h) => {
    if (within(h, quiet)) return { q: true, o: 0 };
    const v = (day[h] ?? 0) / top;
    if (!own) return { q: false, o: +(0.08 + 0.85 * v).toFixed(2) };
    const m = (own[h] ?? 0) / mine;
    return { q: false, o: +(m > 0 ? 0.3 + 0.7 * Math.max(m, 0.4) : 0.06 + 0.1 * v).toFixed(2) };
  });
}
/** the day in words: "Most awake 9pm–2am · quiet 3–10am" */
export function dayLine(day: number[], q0: [number, number] | null): string {
  if (!day.some((v) => v > 0)) return "";
  const quiet = toldQuiet(q0);
  const hr = (h: number) => { const x = ((h % 24) + 24) % 24; return x === 0 ? "12am" : x < 12 ? `${x}am` : x === 12 ? "12pm" : `${x - 12}pm`; };
  // the busiest run of four hours, wrapping
  let best = 0, at = 0;
  for (let h = 0; h < 24; h++) { const s = [0, 1, 2, 3].reduce((a, k) => a + (day[(h + k) % 24] ?? 0), 0); if (s > best) { best = s; at = h; } }
  const busy = `Most awake ${hr(at)}–${hr(at + 4)}`;
  return quiet ? `${busy} · quiet ${hr(quiet[0]).replace(/[ap]m$/, (m) => (hr(quiet[1]).endsWith(m) ? "" : m))}–${hr(quiet[1])}` : busy;
}

/** a setup item in a few words, for the line on the canvas */
export const setupWords = (s: Setup) => s.label ?? (s.kind === "place" ? s.name ?? s.id : s.kind === "level" ? `${s.place}: ${s.level}` : s.kind === "look" ? s.take : s.words);
/** the setup to apply: every item but a dropped part's, each place's level as the person left the dial */
export function setupOf(y: You, dropped: ReadonlySet<string>, levels: Record<string, Level>): Setup[] {
  const name = new Map(y.parts.map((p) => [p.id, p.name]));
  return y.setup.filter((s) => !(s.kind === "place" && dropped.has(s.id)) && !(s.kind === "level" && dropped.has(s.place)))
    .map((s) => (s.kind === "level" && levels[s.place] ? { ...s, level: levels[s.place], label: `${name.get(s.place) ?? s.place}: ${DIAL[dialOf(levels[s.place])].w}` } : s));
}
/** "Set up for you: 4 places · 8 AIs, named · 18 dates in your Diary · …", from what was applied */
export function setupSummary(items: { kind: string; label: string; ok: boolean }[]): string[] {
  const ok = items.filter((x) => x.ok), n = (k: string) => ok.filter((x) => x.kind === k).length;
  const out: string[] = [];
  if (n("place")) out.push(`${n("place")} place${n("place") === 1 ? "" : "s"}`);
  if (n("date")) out.push(`${n("date")} date${n("date") === 1 ? "" : "s"} in your Diary`);
  for (const x of ok.filter((x) => x.kind === "look")) out.push(x.label);
  return out;
}
