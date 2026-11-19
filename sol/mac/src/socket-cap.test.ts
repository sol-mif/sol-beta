// socket.ts: how much one message to the engine may carry (#1448, the app half of #1438): over the cap nothing is sent and the
// line says the files' own size against the limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
(globalThis as Record<string, unknown>).window ??= Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval });
(globalThis as Record<string, unknown>).document ??= Object.assign(new EventTarget(), { visibilityState: "visible" });
const { FILES_MAX, SEND_MAX, WIRE_MAX, filesSize, tooLarge } = await import("./socket.ts");

const b64 = (n: number) => ({ dataBase64: "A".repeat(n) });

test("files under the cap go; nothing attached goes", () => {
  assert.equal(tooLarge([]), null);
  assert.equal(tooLarge([b64(1024)]), null);
  assert.equal(tooLarge([b64(SEND_MAX / 2), b64(SEND_MAX / 2)]), null);
});

test("files over the cap, together, are refused with their size and the limit as a person reads them", () => {
  const line = tooLarge([b64(SEND_MAX / 2), b64(SEND_MAX / 2 + 4)]);
  assert.ok(line);
  assert.match(line!, /^Attachments too large: 72 MB, the limit is 72 MB\. Nothing was sent\.$/);
  // Isaac's 155 MB PDF (#1438), about 207 MB as base64
  assert.match(tooLarge([b64(Math.ceil((155e6 * 4) / 3))])!, /too large: 148 MB, the limit is 72 MB/);
});

test("the size is the files' own, not their base64", () => {
  assert.equal(filesSize([b64(4), b64(8)]), 9);
  assert.equal(FILES_MAX, 72 * 1024 * 1024);
});

test("the caps sit under the engine's, which closes the socket over it", () => {
  const engine = readFileSync(new URL("../../engine/src/face-socket.ts", import.meta.url), "utf8");
  const m = /FACE_MAX_PAYLOAD = (\d+) \* 1024 \* 1024/.exec(engine);
  assert.ok(m, "FACE_MAX_PAYLOAD is still written as N * 1024 * 1024");
  const face = Number(m![1]) * 1024 * 1024;
  assert.ok(SEND_MAX < WIRE_MAX && WIRE_MAX < face);
});
