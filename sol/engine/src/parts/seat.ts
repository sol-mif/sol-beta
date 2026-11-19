// A person's answer to a seat's ask (seatturn.ts turnOn; moved from index.ts, #934): { type: "seat.answer", id, answer }.
// Sol's own windows only, as a card's press is; any other is told so. Only with the seat's switch on (record.ts
// acpSeatOn): off, the message is not taken, as any type no part takes
import type { Parts } from "../parts.js";
import { SEAT_WIRE } from "../seats.js";
import { seatAsks } from "../seatturn.js";
import { leftover } from "../leftover.js";
import { acpSeatOn } from "../record.js";

export default function (p: Parts) {
  if (leftover(import.meta.url)) return;   // built by a later release than the one running
  p.on(SEAT_WIRE.answer, (msg, { ws, send, fromSol }) => {
    if (!acpSeatOn()) return;
    const m = msg as { id?: unknown; answer?: unknown };
    if (!fromSol) send(ws, { type: "error", message: "only Sol's own windows answer a seat's ask" });
    else if (typeof m.id === "string" && typeof m.answer === "string") seatAsks.get(m.id)?.(m.answer);
  });
}
