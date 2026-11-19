// A piece seated in a session (#1092, the design's NOW 2): the stage's list kind draws a piece's block with the same
// front the room draws (the designer's PieceFront at block size), in place of struck rows, dots and a progress bar. A
// press opens the row's link and puts it away through the block's own act: the engine's update, one state, one ledger.
import type { KindProps, ListBody } from "../stage/kinds/types";
import { click } from "../snap/click";
import { PieceFront } from "./PieceFront";
import { isPieceId, keepsOnly, type Look, type Step } from "./model";
import { piecesAct, usePieceNamed as pieceNamedHook } from "./usePieces";
import { buildPieces, homePieces } from "./flag";
import "./pieces.css";

/** a block is drawn as a piece's when its id is (pieces.ts idOf) and a pieces switch is on: off, a "piece-…" block is
 *  any list (the reviewer's 3) */
export const isPieceBlock = (id: string, on: boolean = buildPieces() || homePieces()) => isPieceId(id, on);

export function PieceBlock({ b, body, act }: Pick<KindProps<ListBody & { line?: string }>, "b" | "body" | "act">) {
  const steps = (body?.steps ?? []) as Step[];
  const set = (i: number, st: Step["st"], line: string) => act({ body: { ...body, steps: steps.map((x, j) => (j === i ? { ...x, st } : x)) } }, line);
  const press = (i: number) => {
    const s = steps[i];
    if (!s) return;
    if (s.href && !keepsOnly(s)) window.open(s.href, "_blank", "noopener");
    click(0.6);
    set(i, "done", `put away by you: ${s.t.slice(0, 80)}`);
  };
  const undo = (i: number) => { const s = steps[i]; if (s) set(i, "wait", `brought back by you: ${s.t.slice(0, 80)}`); };
  const look: Look = b.state === "working" ? "working" : b.state === "waits" ? "you" : "rest";
  const wants = steps.filter((s) => s.st === "wait").length;
  const at = pieceNamedHook(b.id.replace(/^piece-/, ""));
  return <div className="fp-block"><PieceFront title={b.title} look={look} wants={wants} steps={steps} size="block" onPress={press} onUndo={undo}
    may={at?.p.may} mayBy={at?.p.mayBy} onMay={at?.p.may ? () => { click(1); void piecesAct.letMay(at.cwd, at.p); } : undefined} /></div>;
}
