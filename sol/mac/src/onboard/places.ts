// The places a person can sign in to, under the box on the first screen (#1423; Marco's pick A, 2026-11-17, drawn at
// mine/look/onboarding/sign-in.html). A place is reached the first way that works and the person never chooses the
// way: a tool signed in on this Mac (gh, gog), Claude Code's or Codex's own MCP servers, the services in their Claude
// account (the engine's list, reach.ts connectedServices), or for an AI tool its own sign-in. A place not reached is
// suggested (ringed) only with a reason said on its card: an AI tool installed but not signed in, the place's app on
// this Mac, or their sentences naming its kind. Two at most; none for a careful person; none under a stop they closed;
// never one their words put off-limits. Sol's own sign-ins for Gmail, Calendar, Drive, Notion, Slack and Microsoft are
// #1222's: until they land those places are reached through the Claude account, and their card says so.
// Pure: the explorer's `reach` (explore.mjs stop 0) and the engine's list in, the places out; One.tsx draws them.
// First of all of them, "Sol" (#1608, decision #1606): the Google sign-in on Sol's cloud that says whose Home this is;
// "go" waits for it, careful or not. Its state is the engine's word (`me`): the name signed in, or nobody. A Sol with no
// cloud to sign in to (a developer's own run) has no such place.
import type { StopId } from "./Lens";

export type Reach = { gh: boolean; gog: boolean; code: string[]; codex: string[]; ai: Partial<Record<Tool, boolean>>; apps: string[] };
type Tool = "claude" | "codex" | "gemini";
export type Service = { name: string; status: string };
/** how a press signs in: GitHub's code (team.github.connect), an AI tool's own page (claude_login, codex_login), the
 *  Claude account's connectors page, or the app itself */
export type Way = "github" | "claude" | "codex" | "account" | "app" | "google";
export type PlaceState = "on" | "late" | "hint" | "off";
export type Place = { id: string; name: string; what: string; stop: StopId; way: Way; st: PlaceState; via?: string; why?: string; shut?: boolean };

type Row = { id: string; name: string; what: string; stop: StopId; way: Way; names: RegExp; gh?: true; gog?: true; app?: RegExp; words?: RegExp };
const ROWS: readonly Row[] = [
  { id: "github", name: "GitHub", what: "your projects", stop: "projects", way: "github", names: /github/i, gh: true, app: /^GitHub Desktop$/, words: /\b(code|coding|developer|engineer(ing)?|repos?|open source)\b/i },
  { id: "gmail", name: "Gmail", what: "who writes to you, by sender and subject", stop: "tools", way: "account", names: /gmail|google ?mail/i, gog: true, words: /\b(clients?|customers?|freelanc\w*)\b/i },
  { id: "gcal", name: "Google Calendar", what: "your week", stop: "calendar", way: "account", names: /calendar/i, gog: true, words: /\b(class(es)?|lectures?|semester|meetings?|appointments?|shifts?)\b/i },
  { id: "drive", name: "Google Drive", what: "your files, by name", stop: "files", way: "account", names: /drive/i, gog: true },
  { id: "notion", name: "Notion", what: "your pages, by title", stop: "tools", way: "account", names: /notion/i, app: /^Notion$/ },
  { id: "slack", name: "Slack", what: "your channels, by name", stop: "tools", way: "account", names: /slack/i, app: /^Slack$/, words: /\b(team(mates)?|colleagues?|co-?workers?|startup|my company)\b/i },
  { id: "ms", name: "Outlook & OneDrive", what: "your mail and files, by name", stop: "tools", way: "account", names: /outlook|onedrive|microsoft|office ?365|sharepoint|teams/i, app: /^(Microsoft Outlook|OneDrive|Microsoft Teams)$/ },
];
const TOOLS: readonly [Tool, string, Way][] = [["claude", "Claude", "claude"], ["codex", "Codex", "codex"], ["gemini", "Gemini", "app"]];
const MAX_HINTS = 2;

export type PlacesIn = {
  reach: Reach | null | undefined;
  services: readonly Service[] | null | undefined;   // the Claude account's, as the engine lists them; null: it could not say
  said: string;
  off: readonly string[];                            // what their words put off-limits (sort.ts offOf)
  closed: ReadonlySet<StopId>;
  careful: boolean;                                  // "only what I tell you": nothing is suggested
  me?: string | null;                                // the Sol name signed in on the cloud (#1608); "" or null: nobody; undefined: the engine has not said
  cloud?: boolean;                                   // whether there is a cloud to sign in to (#1608); false: no Sol place, no gate. Unsaid: yes
};

/** every place, reached first, then the ones that ran out, then the suggested, then the rest */
export function placesOf(i: PlacesIn): Place[] {
  const r = i.reach;
  const svc = (re: RegExp) => (i.services ?? []).find((s) => re.test(s.name));
  const out: (Place & { rank: number })[] = [];
  // the AI tools first: only the ones installed here
  for (const [id, name, way] of TOOLS) {
    const signed = r?.ai[id];
    if (signed === undefined) continue;
    out.push({ id, name, what: `the sessions you've had in ${name}`, stop: "ai", way, st: signed ? "on" : "off", ...(signed ? { via: "signed in on this Mac" } : { why: `${name} is on this Mac, not signed in` }), rank: 0 });
  }
  for (const row of ROWS) {
    const code = r?.code.find((n) => row.names.test(n)), codex = r?.codex.find((n) => row.names.test(n)), acct = svc(row.names);
    const via = row.gh && r?.gh ? "gh" : row.gog && r?.gog ? "gog" : code ? `Claude Code's ${code}` : codex ? `Codex's ${codex}` : acct?.status === "connected" ? "your Claude account" : undefined;
    const p: Place & { rank: number } = { id: row.id, name: row.name, what: row.what, stop: row.stop, way: row.way, st: via ? "on" : "off", ...(via ? { via } : {}), rank: 9 };
    if (!via && acct && acct.status === "needs-auth") { p.st = "late"; p.why = `${row.name} in your Claude account needs signing in again`; }
    else if (!via) {
      const app = row.app && r?.apps.find((a) => row.app!.test(a));
      const word = row.words && !i.off.some((o) => row.words!.test(o)) ? row.words.exec(i.said)?.[0] : undefined;
      if (app) { p.why = `${app} is on this Mac`; p.rank = 1; }
      else if (word) { p.why = `you wrote “${word}”`; p.rank = 2; }
    }
    out.push(p);
  }
  for (const p of out) if (i.closed.has(p.stop)) p.shut = true;
  // the suggested: a reason, not shut, not careful, two at most (an AI tool first, an app next, their words last)
  if (!i.careful) out.filter((p) => p.st === "off" && p.why && !p.shut).sort((a, b) => a.rank - b.rank).slice(0, MAX_HINTS).forEach((p) => { p.st = "hint"; });
  const order: Record<PlaceState, number> = { on: 0, late: 1, hint: 2, off: 3 };
  const places: Place[] = out.sort((a, b) => order[a.st] - order[b.st]).map(({ rank: _, ...p }) => (p.st === "off" ? { ...p, why: undefined } : p));
  if (i.cloud === false) return places;
  // Sol first (#1608): never shut (the machine is never closed), never one of the two suggestions, asked of a careful person too
  const me = i.me || "";
  return [{ id: "sol", name: "Sol", what: "whose Home this is", stop: "machine", way: "google", st: me ? "on" : "hint", ...(me ? { via: me } : { why: "before I look around" }) }, ...places];
}

/** the footer's line: what "Look" reads with the places as they are now */
export function placesLine(ps: readonly Place[]): string {
  const n = ps.filter((p) => p.st === "on" && !p.shut && p.stop !== "ai" && p.way !== "google").length;
  return `${n ? `I read this Mac and ${n === 1 ? "one place" : `${n} places`}` : "I read only this Mac"}. Sign in later in Settings › your Home.`;
}
