// A diff's lines (#696; v4 §4, #738): `lines` as the engine binds them, or `text`, a unified diff, read here. A diff of
// several files is cut into its files (their `diff --git` heads), each with what it adds and takes away, for the file
// row; each line carries its gutter number, the new file's for a kept or added line, the old file's for a removed one
// (from the hunk marks; from 1 when there are none). Apart from Diff.tsx so the face's tests read it with no JSX.
import type { DiffBody, DiffLine } from "./types";

export type NumberedLine = DiffLine & { n: number };
export type DiffFile = { name: string; add: number; del: number; lines: NumberedLine[] };

const HEAD = /^(?:diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/;

/** the lines of a diff, its heads and hunk marks left out */
export function linesOf(body?: DiffBody): DiffLine[] {
  return filesOf(body).flatMap((f) => f.lines.map(({ k, t }) => ({ k, t })));
}

/** a diff as its files; `name` names a diff that does not say its own file */
export function filesOf(body?: DiffBody, name = ""): DiffFile[] {
  const own = body?.file ?? name;
  if (body?.lines) return [file(own, number(body.lines.map((l) => ({ ...l, n: 0 }))))];
  const out: DiffFile[] = [];
  let cur: NumberedLine[] = [], at = own, o = 1, nw = 1, any = false;
  const close = () => { if (cur.length || any) out.push(file(at, cur)); cur = []; };
  for (const l of (body?.text ?? "").split("\n")) {
    const g = /^diff --git a\/(\S+) b\/(\S+)/.exec(l);
    if (g) { if (any) close(); at = g[2]; o = 1; nw = 1; any = true; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(l);
    if (h) { o = +h[1]; nw = +h[2]; any = true; continue; }
    const p = /^\+\+\+ b\/(\S+)/.exec(l);
    if (p) { at = p[1]; continue; }
    if (HEAD.test(l) || /^@@/.test(l)) continue;
    if (l === "") continue;
    const k = l[0] === "+" || l[0] === "-" ? l[0] : " ";
    cur.push({ k, t: l.slice(1), n: k === "-" ? o++ : (k === " " ? (o++, nw++) : nw++) });
    any = true;
  }
  close();
  return out.length ? out : [file(own, [])];
}

/** numbers from 1 for lines that came with none */
function number(ls: NumberedLine[]): NumberedLine[] {
  let o = 1, n = 1;
  return ls.map((l) => ({ ...l, n: l.k === "-" ? o++ : l.k === " " ? (o++, n++) : n++ }));
}
const file = (name: string, lines: NumberedLine[]): DiffFile => ({ name: name.split("/").pop() || name, add: lines.filter((l) => l.k === "+").length, del: lines.filter((l) => l.k === "-").length, lines });
