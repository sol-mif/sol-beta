// GET /agent/<folder>: the folder agent's page, rendered here, no script. The look is flows.html's tokens (black glass,
// pearl ink; yellow only for what needs him). Top: the cards that need him, their choices as buttons (agent.answer).
// Then the rules, each with off · watch · do (agent.rule) and "run now" (agent.run). Then the ledger, newest first.
// Every button is a form POST to the same address; the engine does it and sends the page back (303).
import type { Card, LedgerLine, Rule, Ticket } from "./harness.js";
import { cardMore, jobsBoard } from "./jobs/board.js";   // the jobs folder (step 3): a draft shown whole, a choice per person, the board

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (at: number) => { const d = new Date(at); return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export type View = { folder: string; rules: Rule[]; tickets: Ticket[]; cards: Card[]; ended: number; ledger: LedgerLine[]; signins?: { site: string; label: string }[] };

const CSS = `
:root{--on:235,235,232;--ink:rgba(var(--on),.92);--dim:rgba(var(--on),.55);--mute:rgba(var(--on),.32);--line:rgba(var(--on),.06);--edge:rgba(var(--on),.10);
--s-card:rgba(0,0,0,.25);--s-raised:rgba(0,0,0,.40);--pearl:#e6e1d8;--deep:#0a0a0b;--yours:#f6ec8c;--yours-s:#f4c82a;
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"Helvetica Neue",sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(120% 80% at 20% 0%,#1a1a1d,var(--deep) 60%);color:var(--ink);font:14px/1.45 var(--font);min-height:100vh}
main{max-width:760px;margin:0 auto;padding:32px 24px 64px}
h1{font-size:22px;font-weight:600;margin:0 0 4px;color:var(--pearl)}h2{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:32px 0 10px}
.sub{color:var(--dim);margin:0}
.glass{background:var(--s-card);border:1px solid var(--edge);border-radius:14px;padding:14px 16px;margin:0 0 10px;backdrop-filter:blur(20px)}
.card{border-color:rgba(244,200,42,.45);box-shadow:0 0 0 1px rgba(244,200,42,.12) inset}
.card.would{border-style:dashed;border-color:rgba(244,200,42,.30)}
.card b{color:var(--pearl);font-weight:600}.card p{margin:4px 0 10px;color:var(--dim)}
.tag{display:inline-block;font-size:11px;color:var(--mute);border:1px solid var(--edge);border-radius:999px;padding:1px 8px;margin-left:6px}
.tag.y{color:var(--yours);border-color:rgba(244,200,42,.35)}
form{display:inline}button{font:inherit;color:var(--ink);background:var(--s-raised);border:1px solid var(--edge);border-radius:999px;padding:5px 12px;cursor:pointer;margin:0 6px 0 0}
button:hover{border-color:rgba(var(--on),.25)}button.yes{background:var(--yours);color:#1a1606;border-color:var(--yours-s)}
.rule{display:flex;gap:12px;align-items:flex-start}.rule .s{flex:1;color:var(--ink)}.rule .id{color:var(--mute);font-size:12px}
.modes{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden;flex:none}.modes button{border:0;border-radius:0;margin:0;background:transparent;color:var(--dim)}
.modes button.on{background:rgba(var(--on),.12);color:var(--pearl)}
.led{list-style:none;padding:0;margin:0}.led li{padding:8px 0;border-bottom:1px solid var(--line);color:var(--dim);font-size:13px}.led li b{color:var(--ink);font-weight:500}
.led .t{color:var(--mute);font-variant-numeric:tabular-nums;margin-right:8px}.quiet{color:var(--mute)}
`;

export function pageHtml(v: View, base = ""): string {
  const act = `${base}/agent/${encodeURIComponent(v.folder)}`;
  const form = (fields: Record<string, string>, label: string, cls = "") =>
    `<form method="post" action="${esc(act)}">${Object.entries(fields).map(([k, x]) => `<input type="hidden" name="${esc(k)}" value="${esc(x)}">`).join("")}<button class="${cls}">${esc(label)}</button></form>`;
  const cards = v.cards.length
    ? v.cards.map((c) => `<div class="glass card${c.wouldHave ? " would" : ""}"><b>${esc(c.title)}</b>${c.wouldHave ? `<span class="tag y">would have shown (watch)</span>` : ""}<p>${esc(c.line)}</p>${cardMore(c, act)}${c.choices.map((ch, i) => form({ type: "agent.answer", ticketId: c.ticketId, choice: ch }, ch, i === 0 ? "yes" : "")).join("")}</div>`).join("")
    : `<p class="quiet">Nothing needs you.</p>`;
  const rules = v.rules.map((r) => `<div class="glass rule"><div class="s">${esc(r.sentence)}<div class="id">${esc(r.id)} · ${esc(r.source)} · rung ${esc(r.rung)}</div></div>` +
    `<div class="modes">${(["off", "watch", "do"] as const).map((m) => form({ type: "agent.rule", ruleId: r.id, mode: m }, m, r.mode === m ? "on" : "")).join("")}</div>` +
    (r.mode !== "off" ? form({ type: "agent.run", ruleId: r.id }, "run now") : "") + `</div>`).join("") || `<p class="quiet">policy.md has no rules.</p>`;
  const open = v.tickets.filter((t) => !t.needs).map((t) => `<li><span class="t">${esc(when(t.opened))}</span><b>${esc(t.id)}</b> ${esc(t.rule)} · ${esc(t.state)} · ${t.runs.length} run${t.runs.length === 1 ? "" : "s"}</li>`).join("");
  const ledger = v.ledger.map((l) => `<li><span class="t">${esc(when(l.at))}</span><b>read</b> ${esc(l.read)} · <b>made</b> ${esc(l.made)} · <b>held</b> ${esc(l.held)}${l.rule ? ` <span class="quiet">(${esc(l.rule)})</span>` : ""}</li>`).join("") || `<li class="quiet">Nothing yet.</li>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.folder.toUpperCase())} · the folder's agent</title><style>${CSS}</style></head>
<body><main><h1>${esc(v.folder.toUpperCase())}</h1><p class="sub">The agent that lives in this folder. ${v.tickets.length} open · ${v.ended} ended.</p>
<h2>Needs you</h2>${cards}
<h2>Rules</h2>${rules}
${v.signins?.length ? `<h2>Sign in</h2><div class="glass">${v.signins.map((x) => form({ type: "agent.signin", site: x.site }, x.label)).join("")}<p class="quiet">A window opens on the screen of the machine that runs the engine. Close it when you are signed in; the rule that reads that site runs then.</p></div>` : ""}
${open ? `<h2>Working</h2><ul class="led">${open}</ul>` : ""}
${jobsBoard(v, base)}<h2>Ledger</h2><ul class="led">${ledger}</ul></main></body></html>`;
}
