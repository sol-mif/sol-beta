// The joined blocker's row on Needs you (round 7, #1615; merge/lead.js EXTRA row): "12 AIs wait on one GitHub sign-in",
// the count by folder, since when, and "Open sign-in", which lands on Seats at that row (M.see_seat). Drawn by the
// people's Needs section through the provider (lead/extra.ts). Plain createElement, so the store's import chain stays
// free of JSX and CSS (node's tests load it); its look is lead.css, loaded with the lead's views.
// Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { createElement as h } from "react";
import { byWords, type Joined } from "./rules.ts";

export function JoinRow({ t, focus }: { t: Joined; focus: boolean }) {
  const go = { "data-seatgo": t.target, "data-act": `see_seat:${t.target}` };
  return h("div", { className: `pnrow r7-join${focus ? " pfocus" : ""}`, "data-seat-ask": t.target, "data-joined": t.n },
    h("span", { className: "ld-g", role: "img", "aria-label": "Asks you" }, "!"),
    h("div", { className: "t" }, `${t.n} AIs wait on one ${t.cause} sign-in`, h("small", null, `${byWords(t)} · since ${t.since} · signing in is yours, on ${t.cause}’s own page`)),
    h("span", { className: "where", role: "button", ...go }, "Settings · Seats"),
    h("button", { className: "mini pri", ...go }, "Open sign-in"));
}
