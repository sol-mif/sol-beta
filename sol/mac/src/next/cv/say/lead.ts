// owned by slice R7 (one lead per piece), docs/port/slices.md
// The lead's phrases for the talk pill, tried before the shared ones (say/index.ts): "kai leads instead" on the piece in
// front, "hand <part> to <name>", "take <part> back". Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { D, M, S, type Phrase, type Piece } from "../core.ts";

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const here = (): Piece | undefined => (S.piece ? D.pieces[S.piece] : undefined);
const partNamed = (p: Piece | undefined, w: string) => (p?.parts || []).find((x) => x.name.toLowerCase().includes(w.toLowerCase().replace(/^the /, "")));

const phrases: Phrase[] = [
  { hears: /^(\w+) leads(?: instead| now)?$/, run: (m) => { const p = here(); return p ? M.change_lead(p.id, cap(m[1])) : null; } },
  { hears: /^hand (.+) to (\w+)$/, run: (m) => { const p = here(), x = partNamed(p, m[1]); return p && x ? M.hand_part(p.id, x.id, cap(m[2])) : null; } },
  { hears: /^take (.+) back$/, run: (m) => { const p = here(), x = partNamed(p, m[1]); return p && x ? M.take_part_back(p.id, x.id) : null; } },
];
export default phrases;
