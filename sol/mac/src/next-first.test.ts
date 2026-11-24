// node --test src/next-first.test.ts: the first frame (BR1, #1615; next/flag.ts, index.html). The switch as the engine
// answers it is kept for the next start, so index.html paints (unless last read off) the new face's paper before anything loads; the engine not
// heard yet (settings null) keeps nothing; an answer of off clears the mark, so the old face looks as it always did.
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kept = new Map<string, string>();
const dataset: Record<string, string> = {};
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } },
  document: { documentElement: { dataset } },
});
const { nextOn, waitsFirst, FIRST_KEY } = await import("./next/flag.ts");

test("before the engine's settings the window waits on the first frame, never the old face, unless last read off", () => {
  kept.clear();
  assert.equal(waitsFirst(null), true, "never read: the first frame");
  kept.set(FIRST_KEY, "1");
  assert.equal(waitsFirst(null), true, "last on: the first frame");
  assert.equal(waitsFirst(undefined), true);
  kept.set(FIRST_KEY, "0");
  assert.equal(waitsFirst(null), false, "last off: the old face starts as it always did");
  kept.set(FIRST_KEY, "1");
  assert.equal(waitsFirst({ ui: { next: false } }), false, "the engine answered: its answer draws");
  assert.equal(waitsFirst({}), false);
  kept.clear();
});

test("the engine's answer is kept; not heard yet keeps nothing; off clears the first frame's mark", () => {
  dataset.nextFirst = "";   // index.html set it: on when last read
  assert.equal(nextOn(null), false);
  assert.equal(kept.has(FIRST_KEY), false, "null is the engine not heard yet");
  assert.equal("nextFirst" in dataset, true, "and the paper stays until it answers");
  assert.equal(nextOn({ ui: { next: true } }), true);
  assert.equal(kept.get(FIRST_KEY), "1");
  assert.equal("nextFirst" in dataset, true);
  assert.equal(nextOn({ ui: {} }), false);
  assert.equal(kept.get(FIRST_KEY), "0");
  assert.equal("nextFirst" in dataset, false, "off: the old face's own first frame");
});

test("index.html reads the same key before anything loads, and paints only under its mark", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.includes(`localStorage.getItem("${FIRST_KEY}") !== "0"`), "the inline script reads flag.ts's key: paper unless last read off");
  assert.ok(head.indexOf("nextFirst") < head.indexOf("<script type=\"module\"") || !head.includes("<script type=\"module\""), "before the face's own script");
  assert.match(head, /:root\[data-next-first\]\[data-face\] body \{ background: #fbfaf7; \}/);
  const tokens = JSON.parse(readFileSync(new URL("../../design/system/tokens.json", import.meta.url), "utf8"));
  assert.equal(tokens.next.colour.paper, "#fbfaf7", "the colour is the new face's paper");
});

test("the first frame waits quiet for 1 s, says \"Sol is starting…\", and at 12 s that the first start can take a minute, never the old face", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(app, /if \(waitsFirst\(e\.settings\)\) return <div [^>]*data-first-frame/, "App.tsx draws the frame these rules dress");
  // BR1 lane G: 4 s of blank read as broken to a first-timer; the line comes at 1 s, and a second at 12 s says why it waits
  assert.match(head, /\[data-first-frame\]::before \{ content: "Sol is starting…"; opacity: 0; animation: first-line 240ms 1s ease-out forwards; \}/, "hidden, then shown from 1 s on");
  assert.match(head, /\[data-first-frame\]::after \{ content: "The first start can take a minute\. If it never comes, quit Sol and open it again\."; [^}]*animation: first-line 240ms 12s ease-out forwards; \}/, "the second line from 12 s on");
  assert.match(head, /@keyframes first-line \{ to \{ opacity: 1; \} \}/);
  assert.match(head, /prefers-reduced-motion: reduce/, "no fade when motion is reduced");
  const tokens = JSON.parse(readFileSync(new URL("../../design/system/tokens.json", import.meta.url), "utf8"));
  assert.ok(head.includes(`color: ${tokens.next.colour.ink2};`), "ink2");
  assert.ok(head.includes(`font: 13px/1.4 ${tokens.next.font.sans};`), "the new face's sans");
});
