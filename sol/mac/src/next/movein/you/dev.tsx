// How Sol sees you, the dev page (sol/mac/you.html; BR1, #1615): the screens on a panel person (fixture.ts), never on an
// engine, at the design's own states so each still sits beside its you.html state:
//   #<person>/<step>[/<t>][//mac|//used|//unsaid]   person dev · denise · minji · tomas · lucy; step 1 Bring ·
//   2 Reading (t, 0–1, how far the read is; unsaid: it plays at its own times) · 3 How Sol sees you · 4 Sol opens
// Served by Vite in dev only, never in a build (vite.config.ts inputs). Signed: marcocyl04-ux's agent (builder F).
import "../../../kit/next.css";
import { PANEL, PANEL_KEYS } from "./fixture.ts";
import { panelPort } from "./port.ts";
import { openYou } from "./mount.ts";
import { fold, reading0 } from "./model.ts";
import * as Y from "./store.ts";

function go(): void {
  const [path, sub = ""] = location.hash.slice(1).split("//");
  const [who0, st0, t0] = path.split("/");
  const who = (PANEL_KEYS as readonly string[]).includes(who0) ? who0 : "dev", p = PANEL[who];
  const step = Math.max(1, Math.min(4, Number(st0) || 1)) as Y.Step, t = t0 == null ? null : Math.max(0, Math.min(1, Number(t0)));
  document.getElementById("yus")?.setAttribute("hidden", "");
  openYou(panelPort(p), { name: p.name, ko: p.lang === "ko", step: 1, look: p.look });
  // the panel answers in a few ms; then the state is set at once, so a still needs no waiting
  setTimeout(() => {
    Y.seed((s) => ({ ...s, ticked: [...p.suggest.sources] }));
    if (step === 2 && p.only) { Y.skip(); return; }
    if (step === 2 && t == null) { Y.bring(); return; }
    if (step >= 2) {
      const end = p.reading.reduce((a, e) => Math.max(a, e.at ?? 0), 0), upto = step === 2 ? (t ?? 1) * end : Infinity;
      const read = p.reading.filter((e) => (e.at ?? 0) <= upto).reduce(fold, reading0());
      const over = step > 2 || (t ?? 1) >= 1;
      Y.seed((s) => ({ ...s, step: Math.min(step, 3) as Y.Step, skip: !!p.only, running: !over, read, you: over || step > 2 ? p.you : s.you, felt: { first: 180, read: end, picture: end } }));
    }
    if (step === 4) Y.open();
    if (sub === "mac") { const g = p.perms.find((x) => x.granted !== true) ?? p.perms[0]; if (g) Y.guide(g); }
    if (sub === "off") { const g = p.perms.find((x) => x.granted !== true) ?? p.perms[0]; if (g) Y.seed((s) => ({ ...s, guide: g, guideCheck: "off" })); }
    if (sub === "stopped") Y.seed((s) => ({ ...s, stopping: true, read: { ...s.read, sources: Object.fromEntries(Object.entries(s.read.sources).map(([k, v]) => [k, v && v.state !== "done" && v.state !== "skipped" ? { ...v, state: "stopped" as const } : v])) } }));
    if (sub === "asking") { const k = p.you.questions.find((q) => q.kind === "check")?.k; if (k) Y.seed((s) => ({ ...s, asking: [k] })); }
    if (sub === "small") Y.seed((s) => (s.you ? { ...s, you: { ...s.you, parts: [...s.you.parts, ...["Old notes", "Scratch", "Taxes", "Recipes"].map((n, j) => ({ ...s.you!.parts[0], id: `small-${j}`, name: n, share: j * 0.003, new: false }))] } } : s));
    if (sub === "used") Y.used(true);
    if (sub === "unsaid") Y.seed((s) => ({ ...s, you: s.you ? { ...s.you, aims: [] } : s.you }));   // nothing said (BR1 order 5)
  }, 60);
}
addEventListener("hashchange", go);
go();
