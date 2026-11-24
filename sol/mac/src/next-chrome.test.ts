// node --test src/next-chrome.test.ts: the sidebar keeps clear of the Mac app's window buttons (#1615; next/chrome.ts).
// Only the Tauri app on macOS is marked; the band and its drag region are keyed on the mark and use the scale's tokens.
// Signed: marcocyl04-ux's agent (helper lights), #1615.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeOf } from "./next/chrome.ts";

const NEXT = join(dirname(fileURLToPath(import.meta.url)), "next");

test("only the Tauri app on a Mac is marked", () => {
  assert.equal(chromeOf(true, "MacIntel"), "mac");
  assert.equal(chromeOf(true, "macOS"), "mac");
  assert.equal(chromeOf(false, "MacIntel"), "", "a browser on a Mac has no overlay title bar");
  assert.equal(chromeOf(true, "Win32"), "");
  assert.equal(chromeOf(true, "Linux x86_64"), "");
});

test("the fixture can force the mark on or off", () => {
  assert.equal(chromeOf(false, "Win32", "mac"), "mac");
  assert.equal(chromeOf(true, "MacIntel", "none"), "");
});

test("the band is keyed on the mark, is a drag region, and counts in the scale's tokens", () => {
  const css = readFileSync(join(NEXT, "next.css"), "utf8");
  assert.match(css, /:root\[data-chrome="mac"\] \.nx-side \{ padding-top: var\(--s12\); \}/);
  assert.match(css, /:root\[data-chrome="mac"\] \.nx-drag \{[^}]*height: var\(--s12\)/);
  assert.match(css, /^\.nx-drag \{ display: none; \}/m, "off the Mac the drag strip draws nothing");
  const tsx = readFileSync(join(NEXT, "Next.tsx"), "utf8");
  assert.match(tsx, /className="nx-drag" data-tauri-drag-region/);
});
