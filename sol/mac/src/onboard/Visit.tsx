// A later mode's first visit continues the one record (#1088): Build and Cowork each get one moment and one press, read
// from ~/.sol/record/me.json (record.ts), never a new flow. The drawing is the designer's (VisitCard.tsx): the jelly's
// line, then each project (Build) or team (Cowork) as a tile; pressing a tile is the one press. Under them, quiet, what
// comes from Home: the screens, the AI tools, the level (dragged there, it writes the record's `hands` and every folder's level in its consent).
//   build   it stands on the chat box (same left edge and width, 12 px above); a tile keeps that project as the first
//           (`visits.build.kept`) and gives the chat box "work on <project>: "
//   cowork  it takes the place of "make your first project" (that star, heading and button are hidden while it is up);
//           a tile writes `visits.cowork.team` and asks Cowork for a new project with the team's name (sol:cowork-new)
// Shown once per mode, once a Home is made by the one onboarding (the default since #1223).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { useEngine } from "../useEngine";
import type { Scr } from "./Folder";
import { changeRecord, oneLevelAtATime, readRecord, setRung, type Hands, type Record } from "./record";
import { withLevel } from "./consent";   // the level for every folder, in the record's consent too (#1216)
import { VisitCard, type VisitThing } from "./VisitCard";

type E = ReturnType<typeof useEngine>;
const ago = (iso?: string) => { if (!iso) return undefined; const d = Math.round((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

/** where the card stands: on Build's chat box, or where Cowork's empty state is */
function usePlace(where: "build" | "cowork" | null, up: boolean) {
  const [box, setBox] = useState<{ left: number; width: number; bottom?: number; top?: number } | null>(null);
  useLayoutEffect(() => {
    if (!up || !where) return;
    const find = () => {
      if (where === "build") {
        const ta = document.querySelector('textarea[placeholder^="say something"], textarea[placeholder="engine is starting"]');
        let el = ta as HTMLElement | null;
        while (el && el.getBoundingClientRect().height < 70) el = el.parentElement;
        const r = el?.getBoundingClientRect();
        setBox(r ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 12 } : { left: window.innerWidth / 2 - 310, width: 620, bottom: 140 });
      } else {
        const r = document.querySelector(".gp-first")?.getBoundingClientRect();
        setBox(r ? { left: r.left + r.width / 2 - 310, width: 620, top: Math.max(48, r.top + r.height / 2 - 160) } : { left: window.innerWidth / 2 - 310, width: 620, top: 160 });
      }
    };
    find();
    const t = window.setTimeout(find, 400);
    // #1124: Settings shown over Build hides the card (visit.css) and takes the chat box away; once it is left, the
    // card finds the chat box again rather than standing where the box was missing
    let u: number | undefined;
    const left = () => { window.clearTimeout(u); u = window.setTimeout(find, 60); };
    window.addEventListener("resize", find);
    window.addEventListener("sol:settings-left", left);
    return () => { window.clearTimeout(t); window.clearTimeout(u); window.removeEventListener("resize", find); window.removeEventListener("sol:settings-left", left); };
  }, [where, up]);
  // Cowork's own empty state is not drawn while the card is up (it would ask twice)
  useEffect(() => {
    if (!up || where !== "cowork") return;
    document.documentElement.dataset.obVisit = "cowork";
    return () => { delete document.documentElement.dataset.obVisit; };
  }, [where, up]);
  return box;
}

export function Visit({ e, where }: { e: E; where: "build" | "cowork" | null }) {
  const [rec, setRec] = useState<Record | null>(null);
  const [gone, setGone] = useState(false);
  const n = useRef(0);
  const ask = useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `ob1v-${++n.current}`;
    const t = window.setTimeout(() => { off(); res(null); }, ms);
    const off = e.subscribe((m: any) => { if (m?.rid === rid) { window.clearTimeout(t); off(); res(m as T); } });
    e.send({ ...o, rid });
  }), [e.send, e.subscribe]);   // eslint-disable-line react-hooks/exhaustive-deps -- the wire, not the whole engine object
  useEffect(() => { if (where && e.up) void readRecord(ask).then(setRec); }, [where, e.up, ask]);
  // the level: one write at a time, the last pressed only (record.ts lastOnly); every rung follows it in order
  const handsQ = useMemo(() => (h: Hands) => oneLevelAtATime(async () => { const next = await changeRecord(ask, (r) => withLevel(r, h)); if (next) setRec(next); if (next?.solHome) for (const a of next.areas) await setRung(ask, `${next.solHome}/${a.id}`, h); }), [ask]);   // one queue with Home (record.ts)
  const up = !!(where && rec?.built && !rec.visits[where] && !gone);
  const box = usePlace(where, up);
  if (!up || !rec || !where || !box) return null;

  // made on the record as it is on disk now, written with the hash read (record.ts changeRecord)
  const write = async (change: (r: Record) => Record) => { const next = await changeRecord(ask, change); if (next) setRec(next); return next; };
  const done = async (kept: string | null) => {
    setGone(true);
    const at = new Date().toISOString();
    // not written (the engine did not answer): the card comes back, so the press can be made again; nothing is lost
    if (!(await write((r) => ({ ...r, visits: { ...r.visits, [where]: where === "build" ? { at, kept } : { at, ...(kept ? { team: kept } : {}) } } })))) { setGone(false); return; }
    if (!kept) return;
    // the press starts there: Build's chat box is given the project; Cowork is asked for a new project with the team
    if (where === "build") {
      const ta = document.querySelector('textarea[placeholder^="say something"]') as HTMLTextAreaElement | null;
      if (ta) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set; set?.call(ta, `work on ${kept}: `); ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus(); }
    } else {
      // Cowork may answer sol:cowork-new itself one day; until it does, its own "new project" row is pressed for her,
      // so the sheet opens as the card folds away (a press on what is there; Cowork's code is not changed)
      let heard = false;
      const hear = () => { heard = true; };
      window.addEventListener("sol:cowork-new-heard", hear, { once: true });
      window.dispatchEvent(new CustomEvent("sol:cowork-new", { detail: { name: kept } }));
      window.setTimeout(() => {
        window.removeEventListener("sol:cowork-new-heard", hear);
        if (heard) return;
        const row = [...document.querySelectorAll("button.newc")].find((b) => /new project/i.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
        row?.click();
        window.setTimeout(() => { const f = document.querySelector("input:focus, textarea:focus") as HTMLInputElement | null; if (f && !f.value) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; set?.call(f, kept); f.dispatchEvent(new Event("input", { bubbles: true })); } }, 200);
      }, 300);
    }
  };
  const projects = rec.facts.filter((f) => f.kind === "project");
  const me = rec.connectors.find((c) => /^GitHub$/.test(c.name))?.via.match(/as (\S+)/)?.[1];
  const teams = [...new Set(projects.map((p) => p.owner).filter((o): o is string => !!o && o !== me))];
  const things: VisitThing[] = where === "build"
    ? projects.map((p) => ({ id: p.v, name: p.v, under: p.owner && p.owner !== me ? `with ${p.owner}` : ago((p as { at?: string }).at) }))
    : teams.map((t) => ({ id: t, name: t, under: projects.filter((p) => p.owner === t).map((p) => p.v).join(", ") }));
  const screens: Scr[] = rec.machine.screens.map((s) => ({ id: s.id, w: s.w, h: s.h, x: s.x, y: s.y, main: s.main }));
  const setHands = (h: Hands) => void handsQ(h);
  return (
    <div className="obv-at" style={{ position: "fixed", zIndex: 55, left: box.left, width: box.width, ...(box.bottom !== undefined ? { bottom: box.bottom } : { top: box.top }) }}>
      <VisitCard where={where} name={rec.name} things={things} likely={things[0]?.id ?? null} sure={false} screens={screens} ai={rec.ai} hands={rec.hands}
        onHands={setHands} onStart={(id) => void done(id)} onLater={() => void done(null)} w={box.width} jelly={where !== "build"} />
    </div>
  );
}
