// The slash menu of a page's editor (#433, D1 of #413): typing "/" at a line's start or after a space offers what can go
// there, filtered by what follows it. Sol's own entries are headings, lists, a checklist, a divider, a mention and "insert
// block"; tables (#434) and templates (#435) add theirs with one `defineSlash` call in a file of their own, nothing here
// changed (sol/README.md, "Pages"). An entry says what it puts in place of the "/word": a mark at the line's start
// (`prefix`, "# "), words where the caret is (`inline`, "@frank "), or lines of their own (`lines`, "---"). An entry with
// `choices` (the people for a mention, the project's blocks for "insert block") opens a second list first, and its
// `apply` gets the one chosen. Pure: no React here, so src/slash.test.ts runs it under node --test.

export type SlashInsert = { prefix: string } | { inline: string } | { lines: string };
export type SlashCtx = { people: string[]; blocks: { id: string; name: string; kind: string }[];
  /** the project's templates with their words (#435), while its templates block is on; me, who fills {{me}} */
  templates?: { id: string; name: string; body: string }[]; me?: string;
  tables?: { id: string; title: string; source: "own" | "board" | "feed" | "sessions" }[];   // the project's tables (#434), for "/table"
};
export type SlashChoice = { id: string; word: string; hint?: string };
export type SlashEntry = {
  id: string;
  word: string;                 // what the menu says
  hint: string;                 // one dim line under it
  mark: string;                 // the small mark on the left ("H1", "•", "☐", "—", "@", "▣")
  keys?: string[];              // more words the filter knows it by
  choices?: (ctx: SlashCtx) => SlashChoice[];
  /** offered only when this says so (#435: "from a template" while the project has templates) */
  when?: (ctx: SlashCtx) => boolean;
  apply: (choice?: string, ctx?: SlashCtx) => SlashInsert;
};

const ENTRIES: SlashEntry[] = [];
/** one more entry, at the end or before the entry `before` names. An id already there is replaced where it stands */
export function defineSlash(e: SlashEntry, before?: string) {
  const at = ENTRIES.findIndex((x) => x.id === e.id);
  if (at >= 0) { ENTRIES[at] = e; return; }
  const i = before ? ENTRIES.findIndex((x) => x.id === before) : -1;
  if (i >= 0) ENTRIES.splice(i, 0, e); else ENTRIES.push(e);
}
export const slashEntries = (ctx?: SlashCtx): readonly SlashEntry[] => (ctx ? ENTRIES.filter((e) => !e.when || e.when(ctx)) : ENTRIES);

defineSlash({ id: "h1", word: "heading", hint: "a big title for a part of the page", mark: "H1", keys: ["h1", "title"], apply: () => ({ prefix: "# " }) });
defineSlash({ id: "h2", word: "subheading", hint: "a smaller one", mark: "H2", keys: ["h2", "heading 2"], apply: () => ({ prefix: "## " }) });
defineSlash({ id: "h3", word: "small heading", hint: "the smallest", mark: "H3", keys: ["h3", "heading 3"], apply: () => ({ prefix: "### " }) });
defineSlash({ id: "list", word: "list", hint: "a dot a line", mark: "•", keys: ["bullet", "bulleted list", "ul"], apply: () => ({ prefix: "- " }) });
defineSlash({ id: "numbered", word: "numbered list", hint: "1, 2, 3", mark: "1.", keys: ["ol", "ordered"], apply: () => ({ prefix: "1. " }) });
defineSlash({ id: "check", word: "checklist", hint: "a box to tick, for anyone on the page", mark: "☐", keys: ["todo", "to-do", "task", "checkbox"], apply: () => ({ prefix: "- [ ] " }) });
defineSlash({ id: "divider", word: "divider", hint: "a thin line across", mark: "—", keys: ["hr", "line", "rule", "separator"], apply: () => ({ lines: "---" }) });
defineSlash({
  id: "mention", word: "mention", hint: "someone on the project; they see their name", mark: "@", keys: ["person", "people", "@"],
  choices: (c) => c.people.map((p) => ({ id: p, word: p })),
  apply: (who) => ({ inline: who ? `@${who} ` : "@" }),
});
defineSlash({
  id: "block", word: "insert block", hint: "one of the project's blocks, drawn on the page", mark: "▣", keys: ["embed", "tool", "calendar", "polls", "decisions"],
  choices: (c) => c.blocks.map((b) => ({ id: b.id, word: b.name, hint: b.kind })),
  apply: (id) => ({ lines: `::block[${id ?? ""}]` }),
});

/** the "/word" the caret is in (pure): where its "/" is and what follows it, or null. The "/" opens only at a line's
 *  start or after a space, so a link or a date (a/b, 10/30) never does; the word is at most 24 letters, one space apart */
export function slashAt(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const i = text.lastIndexOf("/", caret - 1);
  if (i < lineStart) return null;
  if (i > lineStart && !/\s/.test(text[i - 1])) return null;
  const query = text.slice(i + 1, caret);
  if (query.length > 24 || !/^(?:[\p{L}\p{N}@.-]+ ?)*$/u.test(query)) return null;
  return { start: i, query };
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
/** the entries a query finds (pure): every one when it is empty; else those whose word, id or a key starts with it
 *  first, then those that hold it, each in the menu's order */
export function matchSlash<T extends { id: string; word: string; keys?: string[] }>(list: readonly T[], query: string): T[] {
  const q = fold(query.trim());
  if (!q) return [...list];
  const words = (e: T) => [e.word, e.id, ...(e.keys ?? [])].map(fold);
  const starts = list.filter((e) => words(e).some((w) => w.startsWith(q)));
  const holds = list.filter((e) => !starts.includes(e) && words(e).some((w) => w.includes(q)));
  return [...starts, ...holds];
}

// a line's own mark: a heading's #s, a list's dot or number, a checklist's box; a new prefix takes its place
const LINE_MARK = /^(?:#{1,3} |[-*] \[[ xX]\] |[-*] |\d+[.)] )/;

/** the "/word" from `start` to `caret` replaced by what an entry puts (pure): the text after, and where the caret goes */
export function applySlash(text: string, start: number, caret: number, ins: SlashInsert): { text: string; caret: number } {
  const before = text.slice(0, start), after = text.slice(caret);
  const ls = before.lastIndexOf("\n") + 1;
  const lead = before.slice(ls);
  if ("inline" in ins) return { text: before + ins.inline + after, caret: start + ins.inline.length };
  if ("prefix" in ins) {
    const rest = lead.replace(LINE_MARK, "");
    const head = text.slice(0, ls) + ins.prefix + rest;
    return { text: head + after, caret: head.length };
  }
  // lines of their own: in place of an empty line, else under the line the "/" was on
  const eol = after.indexOf("\n");
  const tail = eol < 0 ? after : after.slice(0, eol);
  const blank = !lead.trim() && !tail.trim();
  const top = blank ? text.slice(0, ls) : before.replace(/[ \t]+$/, "") + (tail.trim() ? tail : "") + "\n";
  const rest = blank ? (eol < 0 ? "" : after.slice(eol + 1)) : eol < 0 ? "" : after.slice(eol + 1);
  const put = `${ins.lines}\n`;
  return { text: top + put + rest, caret: top.length + put.length };
}
