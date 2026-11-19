// The faces' socket and what it does with a frame it will not take (#1438).
// A window sends attachments as base64 inside one message; a message past the cap used to raise an unhandled
// "Max payload size exceeded" on the socket and end the whole engine, every session with it. Now that one socket
// closes (ws closes it with 1009, "message too big"), the engine writes one line and counts it, and every other
// window stays connected.
import { WebSocketServer, WebSocket } from "ws";
import { countError } from "./errcount.js";

export { WebSocket };   // index.ts takes ws's WebSocket from here, so this file costs it no line

/** the largest message a face may send, in bytes: ws's own default, written down (PROTOCOL.md, top) */
export const FACE_MAX_PAYLOAD = 100 * 1024 * 1024;

/** one socket's errors end that socket only: logged, counted, and the close ws already started follows */
export function guardFace(ws: WebSocket): void {
  ws.on("error", (err) => {
    console.log(`face socket: ${err.message}; that window's socket closes, the engine goes on`);
    countError(err, "face");
  });
}

/** the faces' server (index.ts upgrades into it): the cap set, and every socket guarded before anyone else hears it */
export function faceServer(maxPayload = FACE_MAX_PAYLOAD): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  wss.on("connection", guardFace);
  return wss;
}
