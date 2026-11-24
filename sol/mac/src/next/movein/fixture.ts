// The move-in's two BR1 scenarios (#1615; mine/look/br1/movein.html), for the dev page and the counts:
//   coder   Kim, who already uses Claude Code and Codex: an empty canvas, and the move-in screen made by the same code a
//           real Sol uses (live.ts fromRead) from what carry-apps.ts would read on Kim's Mac: four folders (one,
//           notes, holds no code and is a folder like the rest), Claude Code and Codex as Your AIs, names only
//   empty   someone with nothing: no folder, no session, nothing found, so the welcome card (Welcome.tsx)
//   studio  Lucy (invented), a design studio: the migration (migration.html C) from the judge's calls, as fromRead makes it;
//           with C-2: two folders her AIs made inside her restaurant sites, two quick tries gathered into Experiments
//   calm    Denise (invented), two folders and nothing to sort (migration.html D)
//   shoots  Maya (invented), a photographer: three shoots she calls "clients" hold the same shape (raw, edits, pictures),
//           gathered into a suggested group, Clients; her invoices, "clients" too but sheets, stay apart (C-2's shape)
// Signed: marcocyl04-ux's agent, BR1 (#1615).
import { addScen, type Data, type Scen } from "../cv/core.ts";
import { DATA } from "./data.ts";
import { fromRead, type Read } from "./live.ts";
import type { Judged } from "./plan.ts";

const mk = (): Data => ({ regions: [], pieces: {}, asks: {}, ais: [] });
const U = "/Users/you";
const place = (n: string, path: string, repo: boolean, kind: "build" | null, rules: string[], sessions: Record<string, number>, from: "claude" | "codex" = "claude") =>
  ({ id: U + path, name: n, path: U + path, from, kind, holds: { repo, code: repo }, label: "~" + path, rules, sessions });

/** what the engine's next.movein would answer on Kim's Mac */
export const CODER_READ: Read = {
  places: [
    place("api", "/code/api", true, "build", ["CLAUDE.md"], { claude: 36, codex: 2 }),
    place("web", "/code/web", true, "build", ["AGENTS.md"], { claude: 10, codex: 7 }),
    place("cli", "/code/cli", true, "build", [], { claude: 6 }),
    place("notes", "/notes", false, null, [], { claude: 9 }),
  ],
  ais: [
    { id: "app:claude", name: "Claude Code", app: "claude", skills: ["review", "ship", "tdd", "docs", "release", "triage"], tools: ["github", "linear", "figma"], mode: "asks before it edits" },
    { id: "app:codex", name: "Codex", app: "codex", skills: ["deploy", "lint"], tools: ["sentry"], mode: "asks when it needs to" },
  ],
  apps: [{ app: "claude", projects: 4, sessions: 61 }, { app: "codex", projects: 2, sessions: 9 }],
  kept: null,
};

DATA.coder = { ...fromRead(CODER_READ), who: "Kim", live: false };

// the migration (migration.html C, D): what next.movein would answer with the judge's calls (engine movein-place.ts)
const L = "/Users/lucy";
const lp = (n: string, path: string, o: { said?: string[]; repo?: boolean; home?: boolean } = {}) =>
  ({ id: o.home ? n : L + path, name: n, path: L + path, from: o.home ? "home" as const : "work" as const, kind: null, holds: { repo: !!o.repo }, label: "~" + path, ...(o.said ? { said: o.said } : {}) });
const jd = (p: { id: string; name: string; from: string; path: string }, o: { parent?: [string, string, "inside" | "rules" | "tries", string?]; shelf?: string; belongs?: string[]; ai?: boolean } = {}): Judged => ({
  ...(o.ai ? { made: "ai" as const } : { made: "you" as const }),
  folder: p.from === "home" ? "h:" + p.id : "w:" + p.path, name: p.name, path: p.path, shelf: !!o.shelf, reading: o.parent ? o.parent[2] : o.shelf ? "one-day" : null,
  why: o.parent ? (o.parent[2] === "inside" ? `it sits inside ${o.parent[1]} on disk` : o.parent[2] === "tries" ? "your AIs made it in a quick try, and nothing else of yours uses it" : `it reads ${o.parent[3]} in ${o.parent[1]}, as 2 other folders there do`) : o.shelf ?? null,
  parent: o.parent ? { folder: o.parent[0], name: o.parent[1], reading: o.parent[2], ...(o.parent[3] ? { file: o.parent[3] } : {}), ...(o.parent[2] === "tries" ? { fresh: true } : {}) } : null, lived: { belongs: o.belongs ?? [] } });
const STUDIO = [
  lp("bistro", "/Sites/bistro", { repo: true }), lp("noodle-bar", "/Sites/noodle-bar", { repo: true }), lp("taqueria", "/Sites/taqueria", { repo: true }),
  lp("Restaurant sites", "/Documents/Restaurant sites", { said: ["restaurants"] }), lp("menu photos", "/Documents/Restaurant sites/menu photos"), lp("bistro drafts", "/Documents/Restaurant sites/bistro drafts"),
  lp("test-2", "/Desktop/test-2"), lp("bistro copy", "/Downloads/bistro copy"),
  lp("mod-tools", "/Sol/mod-tools", { home: true }),
  lp("Typography Course", "/Documents/Typography Course", { said: ["typography"] }), lp("flat paperwork", "/Desktop/flat paperwork", { said: ["paperwork"] }), lp("Studio", "/Studio", { repo: true }),
  lp("logo-test", "/code/logo-test"), lp("palette-try", "/code/palette-try"),
];
const [bi, nb, tq, rs, mp, bd, t2, bc, mt, ty, fl, so, lt, pt] = STUDIO;
/** Lucy runs a small design studio: three sites read one CLAUDE.md, two folders sit inside another on disk, two were used
 *  on one day only, and one is tied to nothing she did or said */
export const STUDIO_READ: Read = {
  places: STUDIO, ais: [], apps: [], kept: null,
  judged: [
    ...[bi, nb, tq].map((p) => jd(p, { parent: ["w:" + L + "/Sites", "Sites", "rules", "CLAUDE.md"] })),
    jd(rs, { belongs: ["you wrote “restaurants”", "it holds menu photos"] }),
    ...[mp, bd].map((p) => jd(p, { parent: ["w:" + rs.path, "Restaurant sites", "inside"], ai: true })),
    jd(t2, { shelf: "it was changed on one day only, 2026-03-02, and three in four of your folders were used more" }),
    jd(bc, { shelf: "it was changed on one day only, 2026-01-19, and three in four of your folders were used more" }),
    jd(mt),
    jd(ty, { belongs: ["you wrote “typography”"] }), jd(fl, { belongs: ["you wrote “paperwork”"] }), jd(so, { belongs: ["it keeps a history of its changes"] }),
    ...[lt, pt].map((p) => jd(p, { parent: ["h:Experiments", "Experiments", "tries"], ai: true, belongs: ["1 session worked in it"] })),
  ],
};
DATA.studio = { ...fromRead(STUDIO_READ), who: "Lucy", live: false };
/** Denise has two folders, both hers, and nothing to sort (D) */
const CALM = [lp("thesis", "/Documents/thesis", { repo: true }), lp("garden-planner", "/code/garden-planner", { repo: true })].map((p) => ({ ...p, path: p.path.replace(L, "/Users/denise"), id: p.id.replace(L, "/Users/denise"), label: p.label }));
export const CALM_READ: Read = { places: CALM, ais: [], apps: [], kept: null, judged: CALM.map((p) => jd(p, { belongs: ["it keeps a history of its changes"] })) };
DATA.calm = { ...fromRead(CALM_READ), who: "Denise", live: false };

/** Maya photographs weddings: three shoots in three places, each one she calls "clients" and each with raw/ and edits/;
 *  her invoices she calls "clients" too, but they hold sheets, so the word alone groups nothing (movein-group.ts shape) */
const MY = "/Users/maya";
const mp2 = (n: string, path: string, said?: string[], repo?: boolean) => ({ ...lp(n, path, { said, repo }), id: MY + path, path: MY + path });
const SHOOTS = [
  mp2("okafor-wedding", "/Pictures/okafor-wedding", ["clients"]), mp2("lindqvist", "/Desktop/lindqvist", ["clients"]), mp2("reyes shoot", "/Documents/reyes shoot", ["clients"]),
  mp2("client invoices", "/Documents/client invoices", ["clients"]), mp2("portfolio", "/Sites/portfolio", undefined, true),
];
const SHAPE = ["edits", "raw", "pictures"];
const clientOf = (p: (typeof SHOOTS)[number]): Judged => ({
  ...jd(p, { belongs: ["you wrote “clients”"] }), reading: "shape", why: `you called them “clients”, and they hold the same shape: ${SHAPE.join(", ")}`,
  parent: { folder: "h:Clients", name: "Clients", reading: "shape", fresh: true, said: "clients", shape: SHAPE },
});
export const SHOOTS_READ: Read = {
  places: SHOOTS, ais: [], apps: [], kept: null,
  judged: [...SHOOTS.slice(0, 3).map(clientOf), jd(SHOOTS[3], { belongs: ["you wrote “clients”"] }), jd(SHOOTS[4], { belongs: ["it keeps a history of its changes"] })],
};
DATA.shoots = { ...fromRead(SHOOTS_READ), who: "Maya", live: false };

export const MOVEIN_SCEN: Record<string, Scen> = {
  coder: { label: "Kim · uses Claude Code and Codex, first run", data: mk, start: "far" },
  studio: { label: "Lucy · a design studio, first run: the migration", data: mk, start: "far" },
  calm: { label: "Denise · two folders, nothing to sort", data: mk, start: "far" },
  shoots: { label: "Maya · a photographer: three shoots of one shape, gathered", data: mk, start: "far" },
  empty: { label: "A first run with nothing found", data: mk, start: "far" },
};
for (const [name, s] of Object.entries(MOVEIN_SCEN)) addScen(name, s);
