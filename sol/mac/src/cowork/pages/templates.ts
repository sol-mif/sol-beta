// Templates (#435, D3 of #413): pages a team starts from, kept as `.sol/templates/<id>.md` in the project's record (engine
// team/templates.ts). Here: the slash menu's "from a template" (one `defineSlash` call, slash.ts unchanged but for the
// context it hands in), which puts a template's words where the caret is, its {{date}} and {{me}} filled; and the small
// pure parts the pages tab uses. Offered only while the project's templates block is on (the editor's context carries
// the templates then, none otherwise). Pure: no React here, so src/slash.test.ts runs it under node --test.
import { defineSlash } from "./slash.ts";

export type TemplateInfo = { id: string; title: string; made: string; by: string; agent?: true; at: string; size?: number; newer?: true };

/** today as YYYY-MM-DD on this Mac (pure for a given time) */
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** a template's blanks filled (pure), as the engine fills them: {{date}} (or {{today}}) the day, {{me}} who, {{title}}
 *  the page's title when one is given (else left as written); any other {{word}} stays */
export function fillBlanks(body: string, a: { day: string; me: string; title?: string }): string {
  return body.replace(/\{\{\s*(date|today|me|title)\s*\}\}/gi, (m, k: string) => {
    const w = k.toLowerCase();
    return w === "me" ? a.me : w === "title" ? (a.title ?? m) : a.day;
  });
}
/** the title a new page from a template starts with (pure): the template's, and the day */
export const titleFor = (t: Pick<TemplateInfo, "title">, day = today()) => `${t.title} ${day}`.slice(0, 120);

defineSlash({
  id: "template", word: "from a template", hint: "a template's words, here; the date and your name filled in", mark: "⧉",
  keys: ["template", "templates", "copy"],
  when: (c) => !!c.templates?.length,
  choices: (c) => (c.templates ?? []).map((t) => ({ id: t.id, word: t.name })),
  apply: (id, c) => {
    const t = c?.templates?.find((x) => x.id === id);
    return { lines: t ? fillBlanks(t.body.replace(/\s+$/, ""), { day: today(), me: c?.me ?? "" }) : "" };
  },
}, "block");
