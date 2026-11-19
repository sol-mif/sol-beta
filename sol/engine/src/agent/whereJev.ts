// Home's world (#1093), Jev's pick 1: a sticky dropped on open ground, which folder it belongs in. The face asks
// `agent.where` with the sticky's words and each folder's name and its last few stickies; Jev answers a `choice` among
// the folders. The key and the address are jev.ts's (never logged). No key, an error, over 4 s or an answer that is not
// one of the folders: null, and the face lets the tile glide back.
import { JEV_URL, jevKey } from "./jev.js";

export type WhereFolder = { id: string; name: string; things: string[] };

/** the request (pure): the sticky, the folders, one choice question whose options are the folders' ids */
export function whereBody(sticky: string, folders: WhereFolder[]) {
  return {
    model: "jev-latest",
    state: {
      sticky: sticky.slice(0, 300),
      folders: folders.map((f) => `${f.id} (${f.name}): ${f.things.slice(-5).join("; ") || "nothing yet"}`).join("\n").slice(0, 2400),
    },
    questions: {
      where: {
        type: "choice",
        instructions: "Which folder does this sticky belong in? Pick the folder whose stickies are the same class, the same employer or the same kind of task.",
        criteria: Object.fromEntries(folders.map((f) => [f.id, `${f.name}: ${f.things.slice(-5).join("; ") || "an empty folder"}`.slice(0, 300)])),
      },
    },
  };
}
/** the answer (pure): { folder, confidence, near } when Jev chose one of the folders, else null. `near` is the two
 *  likeliest folders by Jev's probabilities, the chosen one first (Home's blank sticky shows them as chips between 0.45
 *  and 0.7, #1483); with no probabilities, the chosen one alone */
export function whereSaid(json: any, folders: WhereFolder[]): { folder: string; confidence: number; near: string[] } | null {
  const a = json?.answers?.where, c = Number(a?.confidence);
  if (!a || typeof a.choice !== "string" || !folders.some((f) => f.id === a.choice) || !Number.isFinite(c)) return null;
  const pr = a.probabilities && typeof a.probabilities === "object" ? a.probabilities : {};
  const others = folders.map((f) => f.id).filter((id) => id !== a.choice && Number.isFinite(Number(pr[id])))
    .sort((x, y) => Number(pr[y]) - Number(pr[x]));
  return { folder: a.choice, confidence: Math.min(1, Math.max(0, c)), near: [a.choice, ...others].slice(0, 2) };
}
export async function askWhere(sticky: string, folders: WhereFolder[], o: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}) {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key || folders.length < 2) return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(whereBody(sticky, folders)), signal: ac.signal });
    return r.ok ? whereSaid(await r.json(), folders) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// ---- Jev's pick 2: which of the things that want him stands first on the front edge ----
export type Waiting = { id: string; words: string; age: string; behind: string };
/** the request (pure): each waiting thing's words, how long it has waited, what waits behind it */
export function firstBody(things: Waiting[]) {
  return {
    model: "jev-latest",
    state: { waiting: things.map((t) => `${t.id}: ${t.words}${t.age ? ` (waiting ${t.age})` : ""}${t.behind ? `; ${t.behind}` : ""}`).join("\n").slice(0, 2400) },
    questions: {
      first: {
        type: "choice",
        instructions: "Which of these should the person answer first?",
        criteria: Object.fromEntries(things.map((t) => [t.id, `${t.words}: first when it blocks the most other work`.slice(0, 300)])),
      },
    },
  };
}
export function firstSaid(json: any, things: Waiting[]): { first: string; confidence: number } | null {
  const a = json?.answers?.first, c = Number(a?.confidence);
  if (!a || typeof a.choice !== "string" || !things.some((t) => t.id === a.choice) || !Number.isFinite(c)) return null;
  return { first: a.choice, confidence: Math.min(1, Math.max(0, c)) };
}
export async function askFirst(things: Waiting[], o: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}) {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key || things.length < 2) return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(firstBody(things)), signal: ac.signal });
    return r.ok ? firstSaid(await r.json(), things) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// ---- Jev's pick 6: what a folder stands as when its name does not say (Home's world draws it as that figure) ----
export const FORMS = { books: "things studied: a class, a course, reading", tray: "things sent to people: jobs, clients, applications, outreach", jar: "money in and out", bell: "the body: training, sleep, health", plant: "things kept alive: home, family, a hobby that grows", box: "none of these" } as const;
export type FormName = keyof typeof FORMS;
/** the request (pure): the folder's name, its part of life and its last stickies' titles */
export function formBody(f: { name: string; part: string; things: string[] }) {
  return {
    model: "jev-latest",
    state: { folder: `${f.name} (in ${f.part})`.slice(0, 200), stickies: f.things.slice(-5).join("; ").slice(0, 600) || "none yet" },
    questions: { form: { type: "choice", instructions: "What does this folder of a person's life hold?", criteria: { ...FORMS } } },
  };
}
export function formSaid(json: any): { form: FormName; confidence: number } | null {
  const a = json?.answers?.form, c = Number(a?.confidence);
  if (!a || typeof a.choice !== "string" || !(a.choice in FORMS) || !Number.isFinite(c)) return null;
  return { form: a.choice as FormName, confidence: Math.min(1, Math.max(0, c)) };
}
export async function askForm(f: { name: string; part: string; things: string[] }, o: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}) {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key || !f.name) return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(formBody(f)), signal: ac.signal });
    return r.ok ? formSaid(await r.json()) : null;
  } catch { return null; } finally { clearTimeout(t); }
}
