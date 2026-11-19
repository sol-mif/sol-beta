// The words of "show me once" (showOnce.tsx; path.md step 7), apart from React so they can be tried on a real engine:
// the say-back (what it saw, in one line, and the folder) and "do it" (the same steps, now, in the tab). No React.
/** a folder show-once can keep a routine in: its id, its place under the home, its name (the record's areas, #1228) */
export type Folder = { id: string; rel: string; name: string; part?: string; who?: string };
import type { Made } from "./stickies";

export type Step = { url: string; pressed: string[] };
const LINE = /^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/;

/** the steps as the brief and the sticky keep them: a page, and what was pressed on it */
export const stepLines = (steps: Step[]) => steps.map((s) => `${s.url}${s.pressed.length ? ` · pressed ${s.pressed.map((p) => `"${p}"`).join(", ")}` : ""}`);

/** the say-back: what it saw, in one line, and the folder it belongs in; nothing is opened, nothing is written */
export function sayBackBrief(steps: string[], folders: Folder[], from: Folder | null, fix?: { line: string; said: string }) {
  return `You are Sol, in Home. The person just showed you, once, something they do in their browser, so that you can do it for them later. You watched; these are the pages their tab landed on, in order, with what they pressed:
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Their folders:
${folders.map((f) => `- ${f.id}: ${f.name} (${f.part ?? "a folder"}${f.who ? `; ${f.who}` : ""})`).join("\n")}
${from ? `They started this from the folder ${from.id} (${from.name}); keep it there unless the pages clearly belong to another.` : "Pick the folder the pages belong to."}
${fix ? `\nYou said: "${fix.line}". They said that is not quite it: "${fix.said}". Say it back again with their correction.\n` : ""}
Do not open anything and do not use any tool. Answer with one JSON object and nothing else:
{"line": "one plain sentence to the person, starting with You, of what they did, step by step in their order (e.g. You open the team calendar, pick next month, and print it.)", "name": "the thing in two to five words, for a sticky (e.g. Next month's calendar)", "folder": "one folder id from the list"}`;
}

/** do it: the same steps, now, in the tab already open, with the person watching */
export function doItBrief(m: Made, o: { again?: boolean; shown?: string[] } = {}) {
  const steps = m.shown?.steps ?? [];
  return `You are Sol, in Home. The person showed you once how they do this, and now pressed "do it": ${m.s || m.t}
What they showed you, in order (each page, and what they pressed on it):
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${o.again ? "You were doing it a moment ago and stopped; carry on from where the tab is now, do not repeat what is done.\n" : ""}${o.shown?.length ? `The person took the wheel and showed you these pages, in order; use them:\n${o.shown.map((u) => `- ${u}`).join("\n")}\n` : ""}
Do it now in your browser with your browser tools: the tab is already open on the first page, it keeps the person's sign-ins, and they watch it. Follow the same steps; a page that moved (this week's instead of last week's) is followed the way they did it. Use only the steps' own site.
- Never type into a password field, never press "sign in" for them. If a sign-in page stands in the way, stop there and end your turn with the single word SIGNIN.
- Never send, post, pay, delete, submit or accept anything they did not do themselves in the steps.
- Stay in the browser: never run commands or look through this computer's files. A download is done when you have pressed it; do not go looking for the file.
- When it is done, end with one short sentence of what you did, then the single word DONE.
- If you cannot do it, one short sentence why, then the single word STUCK.`;
}

/** the reply of the say-back: its line, name and folder, or null */
export function readBack(text: string, folders: Folder[]): { line: string; name: string; folder: Folder } | null {
  const m = LINE.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]) as { line?: string; name?: string; folder?: string };
    const f = folders.find((x) => x.id === o.folder) ?? folders.find((x) => x.name === o.folder);
    if (!o.line || !f) return null;
    return { line: o.line.trim(), name: (o.name || o.line).trim().replace(/[.]$/, "").slice(0, 60), folder: f };
  } catch { return null; }
}

