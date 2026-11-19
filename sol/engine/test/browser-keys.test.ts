// Keys typed into a page in Sol's browser carry the Windows key code a real keyboard gives (#401): a "." went out
// as 46, which pages read as Delete, so an email with a dot could not get past Google's sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyCode } from "../src/browser.ts";

test("keys: punctuation gets its own key code, by the key the face says was pressed", () => {
  assert.equal(keyCode(".", "Period"), 190);
  assert.equal(keyCode(",", "Comma"), 188);
  assert.equal(keyCode("-", "Minus"), 189);
  assert.equal(keyCode("/", "Slash"), 191);
  assert.equal(keyCode(";", "Semicolon"), 186);
  assert.equal(keyCode("=", "Equal"), 187);
  assert.equal(keyCode("`", "Backquote"), 192);
  assert.equal(keyCode("[", "BracketLeft"), 219);
  assert.equal(keyCode("\\", "Backslash"), 220);
  assert.equal(keyCode("]", "BracketRight"), 221);
  assert.equal(keyCode("'", "Quote"), 222);
  // shifted: the base key's code
  assert.equal(keyCode(">", "Period"), 190);
  assert.equal(keyCode("@", "Digit2"), 50);
  assert.equal(keyCode("(", "Digit9"), 57);
  assert.equal(keyCode("_", "Minus"), 189);
});

test("keys: without a code, the character decides; one with no key gets 0", () => {
  assert.equal(keyCode("."), 190);
  assert.equal(keyCode(">"), 190);
  assert.equal(keyCode("'"), 222);
  assert.equal(keyCode("%"), 53);
  assert.equal(keyCode("é"), 0);
  assert.equal(keyCode("€", ""), 0);
});

test("keys: letters, digits and named keys are as before", () => {
  assert.equal(keyCode("a", "KeyA"), 65);
  assert.equal(keyCode("A", "KeyA"), 65);
  assert.equal(keyCode("z"), 90);
  assert.equal(keyCode("7", "Digit7"), 55);
  assert.equal(keyCode("3", "Numpad3"), 99);
  assert.equal(keyCode(".", "NumpadDecimal"), 110);
  assert.equal(keyCode("Enter", "Enter"), 13);
  assert.equal(keyCode("Backspace", "Backspace"), 8);
  assert.equal(keyCode("Delete", "Delete"), 46);
  assert.equal(keyCode(" ", "Space"), 32);
  assert.equal(keyCode("ArrowLeft", "ArrowLeft"), 37);
  assert.equal(keyCode("Shift", "ShiftLeft"), 0);
});
