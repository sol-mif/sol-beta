// A table on a page (#434), the pure half: the line `::table[<id>]` is a part of its own, and "/table" in the slash menu
// offers the project's tables and puts that line. onPage.tsx calls `tablesOnPages` with how a source is named and draws
// the part; src/tables.test.ts calls it under node --test.
import { definePart } from "../pages/parts.ts";
import { defineSlash } from "../pages/slash.ts";
import type { Source } from "./views.ts";

export const TABLE_PART = /^::table\[([a-z0-9][a-z0-9-]{0,31})\]\s*$/;
export function tablesOnPages(sourceName: (s: Source) => string) {
  definePart({ kind: "table", match: (l) => { const m = TABLE_PART.exec(l); return m ? { id: m[1] } : null; } });
  defineSlash({
    id: "table", word: "table", hint: "one of the project's tables, live, as a list, a board, a calendar or a timeline", mark: "▦",
    keys: ["grid", "sheet", "board", "calendar", "timeline", "database"],
    choices: (c) => (c.tables ?? []).map((t) => ({ id: t.id, word: t.title, hint: t.source === "own" ? "its own rows" : `reads ${sourceName(t.source)}` })),
    apply: (id) => ({ lines: `::table[${id ?? ""}]` }),
  }, "block");
}
