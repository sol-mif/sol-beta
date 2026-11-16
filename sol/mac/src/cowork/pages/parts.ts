// A page's parts (#433, D1 of #413): the markdown a page is kept as (.sol/pages/<id>.md), read into the parts the page
// renderer draws: headings, paragraphs, lists, a checklist, a divider, code, and a block of the project drawn in place
// (`::block[<id>]`). A new part (a table, #434: `::table[<id>]`) is one `definePart` call in a file of its own and one
// drawing in Page.tsx's DRAW; nothing here changes (sol/README.md, "Pages"). Each part keeps the line it came from, so a
// tick on a checklist changes that line alone. Pure: no React here (src/slash.test.ts).

export type Part = { kind: string; line: number; text?: string; level?: number; n?: number; done?: boolean; id?: string; lines?: string[] };
/** a kind of part: what a line must look like to be one; its fields, or null */
export type PartRule = { kind: string; match: (line: string) => Omit<Part, "kind" | "line"> | null };

const RULES: PartRule[] = [];
/** one more kind of part: matched before Sol's own, so a new mark is never read as a paragraph */
export function definePart(r: PartRule) {
  const at = RULES.findIndex((x) => x.kind === r.kind);
  if (at >= 0) RULES[at] = r; else RULES.unshift(r);
}
export const partKinds = () => RULES.map((r) => r.kind);

// Sol's own, in the order they are tried (definePart puts a new one in front of them)
RULES.push(
  { kind: "block", match: (l) => { const m = /^::block\[([a-z0-9][a-z0-9-]{0,39})\]\s*$/.exec(l); return m ? { id: m[1] } : null; } },
  { kind: "hr", match: (l) => (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l) ? {} : null) },
  { kind: "h", match: (l) => { const m = /^(#{1,3}) +(.*\S)\s*$/.exec(l); return m ? { level: m[1].length, text: m[2] } : null; } },
  { kind: "check", match: (l) => { const m = /^\s*[-*] \[([ xX])\] ?(.*)$/.exec(l); return m ? { done: m[1] !== " ", text: m[2] } : null; } },
  { kind: "li", match: (l) => { const m = /^\s*[-*] +(.*)$/.exec(l); return m ? { text: m[1] } : null; } },
  { kind: "ol", match: (l) => { const m = /^\s*(\d{1,4})[.)] +(.*)$/.exec(l); return m ? { n: Number(m[1]), text: m[2] } : null; } },
);

/** the page's words as parts (pure): a blank line ends a paragraph; lines that follow each other are one; a ``` fence
 *  holds its lines as they are */
export function parseParts(body: string): Part[] {
  const out: Part[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let para: Part | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      para = null;
      const code: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) code.push(lines[j++]);
      out.push({ kind: "code", line: i, lines: code });
      i = j;
      continue;
    }
    if (!l.trim()) { para = null; continue; }
    let hit: Part | null = null;
    for (const r of RULES) { const m = r.match(l); if (m) { hit = { kind: r.kind, line: i, ...m }; break; } }
    if (hit) { out.push(hit); para = null; continue; }
    if (para) para.text += ` ${l.trim()}`;
    else { para = { kind: "p", line: i, text: l.trim() }; out.push(para); }
  }
  return out;
}

/** a checklist's line ticked or not (pure): that line's box alone; any other line, the words as they were */
export function toggleCheck(body: string, line: number, done: boolean): string {
  const lines = body.split("\n");
  const l = lines[line];
  if (l === undefined || !/^\s*[-*] \[[ xX]\]/.test(l)) return body;
  lines[line] = l.replace(/\[[ xX]\]/, done ? "[x]" : "[ ]");
  return lines.join("\n");
}

export type Inline = { kind: "text" | "b" | "i" | "code" | "mention" | "link"; text: string; href?: string };
/** the marks inside a line (pure): **bold**, *italic*, `code`, @login, [words](https://…), https only; anything else is text */
export function inlineOf(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|(^|[^\w@])@([A-Za-z0-9][A-Za-z0-9-]{0,38})\b|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    let at = m.index!;
    if (m[5] !== undefined) at += m[4].length;   // the character before an @ stays text
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "b", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "i", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "code", text: m[3] });
    else if (m[5] !== undefined) out.push({ kind: "mention", text: m[5] });
    else out.push({ kind: "link", text: m[6], href: m[7] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

