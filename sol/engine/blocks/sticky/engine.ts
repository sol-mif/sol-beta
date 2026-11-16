// The sticky note, Sol's own block (Stable, step 8 of the design): the small room's example. Its note is its own data
// (`stores: ["note"]`, home/data/sticky/note.json, wound back with its version), read and written through `sol`, and
// nothing else: no file, no network, no program. One tool, `note`. The engine's own sticky note (sticky.ts, its tool,
// its messages, the face's corner) went on 2026-11-08 (#729, #718): nothing in the engine or the face shows this note
// or sends to it now, and `engine/sticky.json` is not read. It loads with the frame on, as any block of Sol's own.
// A paper note's rules: one short line a thing (MAX_CHARS, a Chinese character counts once), MAX_LINES lines; a line is
// crossed out and back; "turn" is the next page (the crossed-out lines go, the rest carry over).
// Only the language and `sol`: the small room has no process, no fetch and no import but its own folder.

export const MAX_CHARS = 40;
export const MAX_LINES = 12;
export type Line = { id: string; text: string; done: boolean; at: number };
export type Note = { lines: Line[]; page: number };
type Sol = {
  tool(def: { name: string; description?: string; args?: Record<string, string>; run: (a: Record<string, unknown>) => unknown }): void;
  read(what: string): unknown;
  write(what: string, value: unknown): void;
};

/** one line: no breaks, no markdown bullets, counted by characters (pure) */
export function clean(raw: string): string | Error {
  const t = raw.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s+/i, "").replace(/\s+/g, " ").trim();
  if (!t) return new Error("an empty line");
  if (/\n/.test(raw.trim())) return new Error("one line only");
  if ([...t].length > MAX_CHARS) return new Error(`too long (${[...t].length}); keep a line under ${MAX_CHARS} characters, a word or a short sentence`);
  return t;
}

/** a note as read back, whatever was written (a seat can write the home): only lines that hold the note's own rules,
 *  each id once (pure) */
export function noteOf(v: unknown, now: number): Note {
  const o = v && typeof v === "object" ? (v as { lines?: unknown; page?: unknown }) : {};
  const seen = new Set<string>();
  const lines: Line[] = [];
  for (const l of Array.isArray(o.lines) ? o.lines : []) {
    if (!l || typeof l !== "object" || typeof (l as Line).text !== "string" || typeof (l as Line).id !== "string") continue;
    const id = (l as Line).id.slice(0, 16), t = clean((l as Line).text);
    if (t instanceof Error || seen.has(id) || !/^[A-Za-z0-9-]+$/.test(id)) continue;
    seen.add(id);
    lines.push({ id, text: t, done: (l as Line).done === true, at: Number((l as Line).at) || now });
    if (lines.length >= MAX_LINES) break;
  }
  return { lines, page: Number(o.page) || now };
}
export const listed = (n: Note) => (n.lines.length ? n.lines.map((l) => `${l.done ? "[x]" : "[ ]"} ${l.id} ${l.text}`).join("\n") : "(the note is empty)");

/** one move on the note (pure): the note after it and what to say, or why not */
export function act(n: Note, a: Record<string, unknown>, now: number, newId: () => string): { note: Note; said: string; changed: boolean } | { why: string } {
  const id = typeof a.id === "string" ? a.id : "";
  const lines = n.lines.map((l) => ({ ...l }));
  switch (a.action) {
    case "list": return { note: n, said: listed(n), changed: false };
    case "add": {
      const t = clean(typeof a.text === "string" ? a.text : "");
      if (t instanceof Error) return { why: `Not added: ${t.message}.` };
      if (lines.length >= MAX_LINES) return { why: `Not added: the note is full (${MAX_LINES} lines); finish or tear off some first.` };
      const l = { id: newId(), text: t, done: false, at: now };
      const note = { ...n, lines: [...lines, l] };
      return { note, said: `Added (${l.id}).\n${listed(note)}`, changed: true };
    }
    case "done": case "undo": {
      const l = lines.find((x) => x.id === id);
      if (!l) return { why: `No line ${id || "(no id)"}; call list for the ids.` };
      l.done = a.action === "done";
      const note = { ...n, lines };
      return { note, said: listed(note), changed: true };
    }
    case "remove": {
      if (!lines.some((x) => x.id === id)) return { why: `No line ${id || "(no id)"}; call list for the ids.` };
      const note = { ...n, lines: lines.filter((x) => x.id !== id) };
      return { note, said: listed(note), changed: true };
    }
    case "turn": {
      const gone = lines.filter((x) => x.done).length;
      const note = { lines: lines.filter((x) => !x.done), page: now };
      return { note, said: `Next page: ${gone} crossed-out line(s) torn off.\n${listed(note)}`, changed: true };
    }
    default: return { why: "action is one of list, add, done, undo, remove, turn." };
  }
}

export default function load(sol: Sol) {
  sol.tool({
    name: "note",
    description: `A short note this block keeps: a to-do list for the day. No screen shows it (Home's sticky note went, #729), so only touch it when the person asks for it by name. Every line is tiny: one word or one short sentence, at most ${MAX_CHARS} characters. action: list, add (text), done or undo (id), remove (id), turn (the next page: crossed-out lines go).`,
    args: { action: "string", text: "string", id: "string" },
    run: (a) => {
      const now = Date.now();
      const n = noteOf(sol.read("note"), now);
      const r = act(n, a, now, () => crypto.randomUUID().slice(0, 8));
      if ("why" in r) return { ok: false, why: r.why, ...n };
      if (r.changed) sol.write("note", r.note);   // a list writes nothing
      return { ok: true, said: r.said, ...r.note };
    },
  });
}
