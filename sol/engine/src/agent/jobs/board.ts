// The jobs folder's board on its page (/agent/jobs), above the ledger: the people by state as counts, the ones waiting
// on a reply with his presses (replied · no reply after 5 days · met), the variants with sent / replied and what we
// believe about each reply rate as one bar, and the applications board. Server-rendered, no script, the page's own
// tokens; yellow only for what needs him (nothing here does: the cards above are where he is needed).
// Also the two things a jobs card carries beyond a step 1 card: the draft shown whole (body) and a choice per person
// (items), as cardMore. page.ts calls both, one line each.
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Card } from "../harness.js";
import { readTickets } from "../store.js";
import { STATES, abRow, byState, readPeople } from "./people.js";
import { readVariants } from "./outreach.js";
import { chanceBest, interval, meanOf, tally, verdict } from "./ab.js";
import { nextOf, readApps } from "./applications.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const button = (act: string, fields: Record<string, string>, label: string) =>
  `<form method="post" action="${esc(act)}">${Object.entries(fields).map(([k, x]) => `<input type="hidden" name="${esc(k)}" value="${esc(x)}">`).join("")}<button>${esc(label)}</button></form>`;

const CSS = `<style>
.jb-counts{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 6px}.jb-counts span{color:var(--dim)}.jb-counts b{color:var(--pearl);font-weight:600;font-variant-numeric:tabular-nums;margin-right:4px}
.jb-row{display:flex;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}.jb-row:last-child{border:0}.jb-row .n{flex:1}.jb-row .q{color:var(--mute);font-size:12px}
.jb-v{padding:8px 0;border-bottom:1px solid var(--line)}.jb-v:last-child{border:0}.jb-v .h{display:flex;gap:10px;align-items:baseline}.jb-v .h b{color:var(--pearl);font-weight:500;flex:1}.jb-v .h span{color:var(--dim);font-size:12px;font-variant-numeric:tabular-nums}
.jb-bar{position:relative;height:8px;border-radius:999px;background:rgba(var(--on),.06);margin-top:6px}.jb-bar i{position:absolute;top:0;bottom:0;border-radius:999px;background:rgba(var(--on),.16)}.jb-bar u{position:absolute;top:-2px;bottom:-2px;width:2px;border-radius:1px;background:var(--pearl)}
.jb-v.off{opacity:.5}.jb-t{width:100%;border-collapse:collapse;font-size:13px}.jb-t th{text-align:left;color:var(--mute);font-weight:500;padding:4px 8px 6px 0}.jb-t td{padding:6px 8px 6px 0;border-top:1px solid var(--line);color:var(--dim)}.jb-t td:first-child{color:var(--ink)}
.jb-body{white-space:pre-wrap;background:var(--s-raised);border:1px solid var(--edge);border-radius:10px;padding:10px 12px;margin:0 0 10px;color:var(--ink);font-size:13px}
.jb-item{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}.jb-item .l{flex:1;color:var(--dim)}.jb-items{margin:0 0 10px}
</style>`;

/** the board for a folder that has people, variants or applications; "" for any other folder */
export function jobsBoard(v: { folder: string; path?: string }, base = ""): string {
  const folder = v.path;
  if (!folder || !["people", "outreach", "applications"].some((d) => existsSync(join(folder, d)))) return "";
  const act = `${base}/agent/${encodeURIComponent(v.folder)}`;
  const people = readPeople(folder);
  const counts = byState(people);
  const tickets = readTickets(folder).filter((t) => t.state === "open" && !t.needs);
  const waiting = people.filter((p) => ["sent", "replied", "met"].includes(p.state)).map((p) => ({ p, t: tickets.find((t) => t.subscriptions.includes(`person:${p.slug}`)) }));
  const peopleHtml = `<div class="glass"><div class="jb-counts">${[...STATES, "dropped" as const].map((s) => `<span><b>${counts[s]}</b>${esc(s)}</span>`).join("")}</div>` +
    (waiting.length ? waiting.map(({ p, t }) => `<div class="jb-row"><div class="n">${esc(p.name)} <span class="q">${esc(p.state)} · ${esc(p.variant || "no variant")} · ${esc(p.touches.at(-1) ?? "")}</span></div>` +
      (t ? (p.state === "sent" ? ["replied", "no reply after 5 days", "met"] : p.state === "replied" ? ["met"] : []).map((ch) => button(act, { type: "agent.answer", ticketId: t.id, choice: ch }, ch)).join("") : "") + `</div>`).join("")
      : `<p class="quiet">Nobody is waiting on a reply.</p>`) + `</div>`;

  const variants = readVariants(folder).filter((x) => x.status !== "dropped");
  const live = variants.filter((x) => x.status === "active");
  const ts = tally(variants.map((x) => x.name), people.map(abRow));
  const liveTs = ts.filter((t) => live.some((x) => x.name === t.variant));
  const best = chanceBest(liveTs), verdictLine = verdict(liveTs).why;
  const variantsHtml = variants.length ? `<div class="glass">${ts.map((t) => {
    const vv = variants.find((x) => x.name === t.variant)!;
    const [lo, hi] = interval(t), m = meanOf(t);
    return `<div class="jb-v${vv.status === "active" ? "" : " off"}"><div class="h"><b>${esc(t.variant)}</b><span>${t.sent} sent · ${t.replied} replied · ${t.met} met · ${vv.status === "active" ? `${pct(best[t.variant] ?? 0)} likely the best` : esc(vv.status)}</span></div>` +
      `<div class="jb-bar" title="reply rate: likely between ${pct(lo)} and ${pct(hi)}, about ${pct(m)}"><i style="left:${(lo * 100).toFixed(1)}%;width:${((hi - lo) * 100).toFixed(1)}%"></i><u style="left:${(m * 100).toFixed(1)}%"></u></div></div>`;
  }).join("")}<p class="quiet" style="margin:8px 0 0">The bar: where each reply rate likely is (0 to 100 %), the line at its middle. ${esc(verdictLine.charAt(0).toUpperCase() + verdictLine.slice(1))}.</p></div>` : `<p class="quiet">No variants yet: the first people run writes the four.</p>`;

  const apps = readApps(folder);
  const appsHtml = apps.length ? `<div class="glass"><table class="jb-t"><tr><th>role</th><th>company</th><th>state</th><th>date</th><th>next step</th></tr>${apps.sort((a, b) => b.seen.localeCompare(a.seen)).map((a) => `<tr><td>${esc(a.role)}</td><td>${esc(a.company)}</td><td>${esc(a.state)}</td><td>${esc(a.seen)}</td><td>${esc(nextOf(a))}</td></tr>`).join("")}</table></div>` : `<p class="quiet">No applications yet.</p>`;

  return `${CSS}<h2>People</h2>${peopleHtml}<h2>Variants</h2>${variantsHtml}<h2>Applications</h2>${appsHtml}`;
}

/** a card's draft shown whole and its choice per item (a person on "N new people: keep / drop"); "" for a plain card */
export function cardMore(c: Card, act: string): string {
  const body = c.body ? `<div class="jb-body">${esc(c.body)}</div>` : "";
  const items = c.items?.length ? `<div class="jb-items">${c.items.map((it) => `<div class="jb-item"><div class="l">${esc(it.line)}</div>${it.choices.map((ch) => button(act, { type: "agent.answer", ticketId: c.ticketId, choice: `${ch} · ${it.key}` }, ch)).join("")}</div>`).join("")}</div>` : "";
  return body || items ? `${CSS}${body}${items}` : "";
}
