// A message past the faces' cap closes that window's socket only (#1438): engine/src/face-socket.ts.
// Before, ws raised "Max payload size exceeded" on the socket with nobody listening, and the engine ended.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { FACE_MAX_PAYLOAD, faceServer } from "../src/face-socket.ts";

test("the cap is written down: 100 MiB, ws's own default", () => {
  assert.equal(FACE_MAX_PAYLOAD, 100 * 1024 * 1024);
});

test("an oversized message closes its socket with 1009; the server and another window go on", async () => {
  const CAP = 1024;   // the same path as the real cap, without sending 100 MiB in a test
  const wss = faceServer(CAP), http = createServer();   // upgraded into as index.ts does
  http.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)));
  const uncaught: Error[] = [];
  const keep = (e: Error) => uncaught.push(e);
  process.on("uncaughtException", keep);
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => ws.send(`echo ${raw.toString()}`));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  try {
    const big = new WebSocket(url), other = new WebSocket(url);
    await Promise.all([once(big, "open"), once(other, "open")]);
    big.on("error", () => {});
    const closed = once(big, "close");
    big.send("x".repeat(CAP + 1));
    const [code] = await closed;
    assert.equal(code, 1009);
    other.send("still here");
    const [reply] = await once(other, "message");
    assert.equal(reply.toString(), "echo still here");
    assert.deepEqual(uncaught, []);
    other.close();
  } finally {
    process.off("uncaughtException", keep);
    wss.close();
    http.close();
  }
});
