// node --test src/*.test.ts: the folder agent's sort is Sol's Diary line, never the person's, and its Undo takes the
// moves back (engine next/setup.ts sortRun writes it with embed { sort: run id }; cv/moves/setup.ts fsSortBack), its
// because the reason its moves give, "taken back" once they all are.
// Signed: marcocyl04-ux's agent (builder G), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as B from "./next/diary/book.ts";
import { attach } from "./next/cv/wire/diary.ts";
import { fsLink, heard, sortRunOf, type SortRun } from "./next/cv/moves/setup.ts";

const day = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test("a sort's line is Sol's, names its run, and its Undo sends the run back; its because is its moves' reason", () => {
  CV.setMode("fixture"); CV.load("dev-morning");
  let hear: (m: unknown) => void = () => {};
  const sent: { type?: string; run?: string }[] = [];
  const off = attach({ send: () => true, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    hear({ type: "next.diary", day: day(), lines: [
      { id: "dl-aaaaaaaaaaaa", at: Date.now(), words: "Sol sorted one thing in api: “login notes” into docs.", region: "api", embed: { sort: "sort-1a2b3c4d5e" }, via: "sort" },
      { id: "dl-bbbbbbbbbbbb", at: Date.now(), words: "buy milk", region: null },
    ] });
    const s = B.byKey("eng:dl-aaaaaaaaaaaa")!, mine = B.byKey("eng:dl-bbbbbbbbbbbb")!;
    assert.equal(s.sort, "sort-1a2b3c4d5e", "the line names its run");
    assert.equal(s.mine, false, "a sort is never the person's line");
    assert.equal(s.who, B.VOICE);
    assert.match(s.what, /^sorted one thing in api/i, "said as the AI's own doing, without “Sol”");
    assert.equal(mine.mine, true, "the person's own line stays theirs");
    assert.equal(mine.sort, undefined);

    const run: SortRun = { id: "sort-1a2b3c4d5e", at: Date.now(), folder: "api", by: "sol", moves: [{ thing: { kind: "note", id: "n1", label: "login notes" }, from: "api", to: "api/docs", toN: "docs", why: "it speaks of “login”, as docs does", made: false }] };
    heard({ type: "next.folder.sorted", ok: true, run } as never);
    assert.equal(sortRunOf(run.id)?.moves[0].why, "it speaks of “login”, as docs does", "the run heard, by its id");

    CV.setMode("live");
    fsLink.e = { send: (m: { type?: string; run?: string }) => { sent.push(m); return true; }, subscribe: () => () => {} } as never;
    assert.ok(CV.M.fsSortBack(run.id).ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.sort.back", run: run.id });
  } finally { off(); fsLink.e = null; CV.setMode("fixture"); CV.load("dev-morning"); }
});

test("the Diary's sort line: its because from the moves, Undo to fsSortBack, gone once taken back", () => {
  const src = readFileSync(new URL("./next/diary/index.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(l\.sort\) return sortSaid\(l\.sort\)\.why;/, "the line's why is the sort's");
  assert.match(src, /`because \$\{ws\[0\]\}/, "its because is the first move's reason");
  assert.match(src, /if \(ms\.length && ms\.every\(\(m\) => m\.back\)\) return \{ why: "taken back", back: true \};/, "taken back once every move is");
  assert.match(src, /l\.sort && !sortSaid\(l\.sort\)\.back \? <button[^>]*data-sort-back=\{l\.sort\}\s*onClick=\{\(\) => \{ const x = M\.fsSortBack\(l\.sort!\)/, "Undo while it stands");
});
