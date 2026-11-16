// The type's mark on a file chip (#647 round 4, from the kit #674). Marco, 2026-11-06, on round 2's page with the
// extension written on it: "make the icons for different files look nicer, it just looks ugly"; round 3 compared three
// directions (a glyph, a tinted glyph, a miniature). Round 4 wears the kit's file mark: the icon people know for the
// kind, in the jelly's light, the page itself the kind's colour (look.md: file marks; tokens.json palette.looks.file).
// Here the extension a person attached is read as a kind, and the kind as the kit's mark for it.
import { FileMark as Mark } from "../kit";

export type Kind = "slides" | "doc" | "sheet" | "pdf" | "text" | "code" | "image" | "other";
const KIND: Record<string, Kind> = {
  pptx: "slides", ppt: "slides", key: "slides", odp: "slides",
  docx: "doc", doc: "doc", pages: "doc", rtf: "doc", odt: "doc",
  xlsx: "sheet", xls: "sheet", csv: "sheet", numbers: "sheet", ods: "sheet", tsv: "sheet",
  pdf: "pdf",
  md: "text", txt: "text", markdown: "text",
  ts: "code", tsx: "code", js: "code", mjs: "code", py: "code", css: "code", html: "code", sh: "code", swift: "code", rs: "code", json: "code", go: "code", yml: "code", yaml: "code", toml: "code",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", heic: "image", svg: "image",
};
export const kindOf = (ext: string): Kind => KIND[ext] ?? "other";
/** the word a person says for the kind */
export const KIND_WORD: Record<Kind, string> = { slides: "slides", doc: "document", sheet: "sheet", pdf: "pdf", text: "notes", code: "code", image: "image", other: "file" };
// the kit's mark for each kind (its kinds are named by their usual extension); a kind it has no mark for wears its last
const KIT: Record<Kind, string> = { slides: "pptx", doc: "docx", sheet: "xlsx", pdf: "pdf", text: "md", code: "tsx", image: "png", other: "" };

/** the type's mark, at the chip's height */
export function FileMark({ ext, h = 32 }: { ext: string; h?: number }) {
  const k = kindOf(ext);
  return <span className="fmark" data-kind={k} aria-hidden="true"><Mark ext={KIT[k]} h={h} /></span>;
}
