// node --test src/*.test.ts: every ⋯ menu ends with the way back (BR1 conform #4, sessions.html part 2; its words the
// morning's, morning.html "Chat with AI about this"): the menu's last item opens a new chat's card in the piece's folder
// with the piece given to it, and nothing starts until the person starts it, so it works when the piece is broken.
// Signed: marcocyl04-ux's agent (builder F), BR1 conform #4 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";

const src = readFileSync(new URL("./next/plane/Pieces.tsx", import.meta.url), "utf8");

test("the piece menu's last item is Chat with AI about this, after a line", () => {
  const menu = src.slice(src.indexOf('aria-label={`${name}: what you can do`}'));
  const end = menu.indexOf("</Pop>");
  const items = [...menu.slice(0, end).matchAll(/data-menu-act="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(items.at(-1), "chat", items.join(" "));
  assert.ok(menu.slice(0, end).indexOf('className="pc-sep"') < menu.slice(0, end).indexOf('data-menu-act="chat"'));
  assert.match(menu.slice(0, end), />Chat with AI about this</);
});

test("pressed on a piece: a new chat's card in its folder, the piece given, nothing started", () => {
  CV.load("dev-morning");
  const p = Object.values(CV.D.pieces).find((x) => x.region && x.kind !== "starter" && x.kind !== "session")!;
  const before = Object.keys(CV.D.pieces).length;
  const out = CV.M.start({ region: String(p.region), given: [p.id], now: false }) as { id?: string };
  const c = CV.D.pieces[out.id!];
  assert.equal(Object.keys(CV.D.pieces).length, before + 1);
  assert.equal(c.kind, "starter", "a card, not a session");
  assert.equal(c.region, p.region);
  assert.deepEqual(c.given, [p.id]);
  assert.equal(c.sessionId, undefined, "nothing started");
});

test("pressed on a folder: the card in that folder, nothing given", () => {
  CV.load("dev-morning");
  const r = CV.D.regions[CV.D.regions.length - 1];
  const c = CV.D.pieces[(CV.M.start({ region: r.id, now: false }) as { id: string }).id];
  assert.equal(c.region, r.id);
  assert.deepEqual(c.given, []);
  assert.equal(c.kind, "starter");
});
