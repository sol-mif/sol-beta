// What goes with the words (#647, Marco 2026-11-06: "show the logo of what the file type is, a pptx should show the
// pptx icon and the contents in it, same with docx, sheets and many other document types"). A chip per file: the
// type's mark (FileMark.tsx: the kit's file mark, round 4), its name, and a peek inside, read in the face without any
// library: an Office file is a zip, and docProps/app.xml inside it says slides, pages, words, sheets; a text file
// gives its first line; an image its thumb. The peek is read once per chip and cached on the attachment.
import { useEffect, useState } from "react";
import type { Att } from "./Composer";
import { FileMark, KIND_WORD, kindOf } from "./FileMark";

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const TEXT = new Set(["md", "txt", "json", "ts", "tsx", "js", "mjs", "py", "css", "html", "sh", "swift", "rs", "csv", "yml", "yaml", "toml"]);

// ---- the peek inside: read in the face, once ----
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** the entries of a zip from its central directory: name → { offset, method, size } */
function zipEntries(u: Uint8Array) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const n = dv.getUint16(eocd + 10, true), start = dv.getUint32(eocd + 16, true);
  const out = new Map<string, { offset: number; method: number; size: number; csize: number }>();
  for (let p = start, k = 0; k < n && p + 46 <= u.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), offset = dv.getUint32(p + 42, true);
    out.set(new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)), { offset, method, size, csize });
    p += 46 + nl + el + cl;
  }
  return out;
}
async function zipRead(u: Uint8Array, e: { offset: number; method: number; csize: number }) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const nl = dv.getUint16(e.offset + 26, true), el = dv.getUint16(e.offset + 28, true);
  const data = u.slice(e.offset + 30 + nl + el, e.offset + 30 + nl + el + e.csize);   // a copy: its own ArrayBuffer, as the stream wants
  if (e.method === 0) return new TextDecoder().decode(data);
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); void w.write(data); void w.close();
  return new Response(ds.readable).text();
}
const tag = (xml: string, t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml)?.[1];

/** one line about what is inside */
export async function peek(a: Att): Promise<string> {
  const ext = extOf(a.name), u = bytes(a.dataBase64);
  const size = kb(u.length);
  try {
    if (a.thumb) return size;
    if (["pptx", "docx", "xlsx"].includes(ext)) {
      const z = zipEntries(u);
      if (!z) return size;
      const app = z.get("docProps/app.xml");
      const xml = app ? await zipRead(u, app) : "";
      const n = (t: string) => Number(tag(xml, t) ?? NaN);
      if (ext === "pptx") {
        const s = n("Slides") || [...z.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
        // the first slide's words: its title, as a person would name the deck
        const one = z.get("ppt/slides/slide1.xml");
        const first = one && one.csize < 400_000 ? [...(await zipRead(u, one)).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
        return `${s} slide${s === 1 ? "" : "s"}${first ? ` · “${first}${first.length >= 60 ? "…" : ""}”` : ""} · ${size}`;
      }
      if (ext === "xlsx") { const sheets = [...z.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).length; const names = /<vt:lpstr>([^<]*)<\/vt:lpstr>/g; const parts: string[] = []; for (let m; (m = names.exec(xml)) && parts.length < 3;) parts.push(m[1]); return `${sheets} sheet${sheets === 1 ? "" : "s"}${parts.length ? ` · ${parts.join(", ")}` : ""} · ${size}`; }
      const pages = n("Pages"), words = n("Words");
      let first = "";
      const doc = z.get("word/document.xml");
      if (doc && doc.csize < 400_000) { const x = await zipRead(u, doc); first = x.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 60); }
      return `${pages ? `${pages} page${pages === 1 ? "" : "s"}` : ""}${words ? ` · ${words} words` : ""}${first ? ` · “${first}${first.length >= 60 ? "…" : ""}”` : ""} · ${size}`.replace(/^ · /, "");
    }
    if (TEXT.has(ext) || a.mime.startsWith("text/")) {
      const t = new TextDecoder().decode(u.subarray(0, 4000));
      const lines = t.split("\n").length + (u.length > 4000 ? Math.round((u.length - 4000) / Math.max(1, 4000 / t.split("\n").length)) : 0);
      const first = t.split("\n").find((l) => l.trim())?.trim().slice(0, 60) ?? "";
      return `${lines} lines${first ? ` · “${first}${first.length >= 60 ? "…" : ""}”` : ""} · ${size}`;
    }
    if (ext === "pdf") { const t = new TextDecoder("latin1").decode(u); const pages = (t.match(/\/Type\s*\/Page[^s]/g) ?? []).length; return `${pages ? `${pages} page${pages === 1 ? "" : "s"} · ` : ""}${size}`; }
  } catch { /* unreadable: the size alone */ }
  return size;
}

export function Chips({ atts, onRemove }: { atts: Att[]; onRemove: (i: number) => void }) {
  const [peeks, setPeeks] = useState<Record<string, string>>({});
  useEffect(() => {
    for (const a of atts) {
      const k = a.name + a.dataBase64.length;
      if (peeks[k] !== undefined) continue;
      setPeeks((p) => ({ ...p, [k]: "" }));
      void peek(a).then((s) => setPeeks((p) => ({ ...p, [k]: s })));
    }
  }, [atts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chips">
      {atts.map((a, i) => {
        const ext = extOf(a.name), line = peeks[a.name + a.dataBase64.length] || "";
        return (
          <div className={`chip${a.thumb ? " image" : ""}`} key={i} title={a.name}>
            {a.thumb ? <img src={a.thumb} alt="" /> : <FileMark ext={ext} />}
            <span className="chip-t"><b>{a.name}</b><i>{line || KIND_WORD[kindOf(ext)]}</i></span>
            <button onClick={() => onRemove(i)} title="remove" aria-label={`remove ${a.name}`}>×</button>
          </div>
        );
      })}
    </div>
  );
}
