// A folder's parts, drawn (model.ts; BR1 override 4, mine/look/br1/folder.html): one row across the opened folder, each
// part a small card with its name, its fact's grey words in the corner (the because, in flow: a press unfolds the fact
// under the part, That's right · That's wrong · It's out of date), and what it lists. Files is always there, its corner
// empty, and with nothing listed it says why in one line. A part said wrong or out of date is previewed (shown here → hidden here), then Keep hides it, asks
// once "Same for the N other places Sol used this?" (Only here · These N · Everywhere), and when that folds its place is
// one line: No "Coming up" here, and the person's own fix in grey words; a press brings it back. With no fact: the files
// and the plain line. Live, the looks, presses, hides and backs are P's engine's (cv/wire/look.ts, next.folder.look); until
// it answers a real Sol draws nothing here; on the fixture every part carries data-fixture. Files opens the folder itself in
// Finder (the app's opener, as the file pane does), or says why it can't (first-timer line 1). Calm per screen (design-br1.md
// 03:10): each part is itself the press (Files opens Finder, Working now opens At work, any other unfolds its why), and a
// part's because and its own buttons show only while the pointer or the keys are on that part. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { D, MODE } from "../../cv/index.ts";
import { frame } from "../../frame.tsx";
import Because from "../../because/Because.tsx";
import type { Fixer, SameOf } from "../../because/fix.ts";
import { LOOKS } from "./fixture.ts";
import { lookAsk, lookBack, lookHide, lookPress, looksLive } from "../../cv/wire/look.ts";
import { openAt } from "../../atwork/act.ts";
import { pathOf } from "../head.ts";
import { PART_W, backIn, goneW, hidIn, hidesOf, inOrder, knownOf, sameAs, shownOf, type Hide, type Item, type Look, type PartId, type Reach, type Seen } from "./model.ts";
import "./parts.css";

/** the looks the parts read: the engine's once it sends them; on the fixture, fixture.ts's */
const looks = (): Readonly<Record<string, Look>> => (MODE === "fixture" ? LOOKS : looksLive());

// the hides kept on the fixture, here; in a real Sol each look's hid is the engine's
let hides: Hide[] | null = null;
const subs = new Set<() => void>();
const hidesNow = () => (hides ??= hidesOf(looks()));
const setHides = (h: Hide[]) => { hides = h; subs.forEach((f) => f()); };
const useHides = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, hidesNow);

/** the parts of the folder rid, or nothing when no look is known for it */
export default function Parts({ rid }: { rid: string }) {
  const all = useHides();
  const [leaving, setLeaving] = useState<PartId | null>(null);   // hidden, still asking "same for these?"
  const same = useRef<Partial<Record<PartId, SameOf | null>>>({});   // live: the engine's same, from the hide that was kept
  const live = MODE !== "fixture";
  useEffect(() => { if (live) lookAsk(rid); }, [live, rid]);
  const look = looks()[rid];
  if (!look) return null;
  const fx = live ? {} : { "data-fixture": "" };
  const hid = live ? look.hid ?? [] : hidIn(rid, all), s = shownOf(look, hid.filter((h) => h.part !== leaving));
  const facts = look.seen.map((x) => knownOf(rid, x));
  const hide = (part: PartId, reach: Reach) => {
    if (live) { const o = same.current[part]; if (reach !== "here") void lookHide(rid, part, reach, reach === "these" && o ? o.these.map((t) => t.place).filter((p): p is string => !!p) : undefined); return; }
    const to = reach === "these" ? sameAs(looks(), rid, part) : [];
    setHides([...hidesNow().filter((h) => !(h.rid === rid && h.part === part)), { rid, part, reach, to }]);
  };
  const part = (id: PartId) => {
    // Files has no because and no hide: its corner says nothing (its "can't be hidden" read as a broken card; BR1 conform 2)
    if (id === "files") return <Part key="files" id="files" corner={null} items={look.files} fx={fx} rid={rid} onUse={() => openFiles(rid)} />;
    const seen = look.seen.find((x) => x.part === id)!;
    const others = sameAs(looks(), rid, id).length;   // live, the hide's own answer says them (same, read once it is kept)
    const fixer: Fixer = {
      async fix({ how }) {
        if (how === "right") return { changes: [], token: "right" };
        return { changes: [{ what: PART_W[id], from: "shown here", to: "hidden here", when: "now" }], token: id };
      },
      async settle(token, keep) {
        if (!keep || token !== id) return;
        if (live) { const r = await lookHide(rid, id, "here"); if (r === false) return; same.current[id] = r; } else hide(id, "here");
        setLeaving(id);
      },
    };
    const corner = <Because ks={[seen.k]} all={facts} fixer={fixer} words={seen.words} here={rid}
      same={() => ((live ? same.current[id]?.n ?? 0 : others) ? { n: live ? same.current[id]!.n : others, keep: (sc) => hide(id, sc === "these" ? "these" : sc === "everywhere" ? "everywhere" : "here") } : null)}
      onFold={() => setLeaving((l) => (l === id ? null : l))} />;
    const use = (el: HTMLElement) => {
      if (live) lookPress(rid, id);
      if (id === "working") openAt(rid);
      else el.querySelector<HTMLElement>(".fp-c button.bc")?.click();   // unfold its why, as the corner's press does
    };
    return <Part key={id} id={id} corner={corner} items={seen.items} seen={seen} off={leaving === id} fx={fx} rid={rid} onUse={use} />;
  };
  return (
    <section className="fp" aria-label="What this folder holds" {...fx}>
      {inOrder(look, s).map(part)}
      {s.plain ? <p className="fp-plain">Nothing else yet. This folder takes its shape from how you use it.</p> : null}
      {s.gone.length ? (
        <p className="fp-gone">{s.gone.map((h) => (
          <span key={h.part} data-gone={h.part}>No “{PART_W[h.part]}” here. {goneW(h)} <button type="button" className="fp-back" aria-label={`Show “${PART_W[h.part]}” again`}
            onClick={() => { if (live) void lookBack(rid, h.part); else setHides(backIn(rid, h.part, hidesNow())); }}>Show it again</button></span>))}</p>
      ) : null}
    </section>
  );
}

/** the folder's files, opened in Finder; outside the app (a browser) or with no place on the Mac, the frame's line says so */
function openFiles(rid: string): void {
  const r = D.regions.find((x) => x.id === rid), at = pathOf(rid, r), name = r?.name ?? "This folder";
  if (!at) { frame.say(`${name} lives in Sol only, so it has no folder in Finder to open.`); return; }
  void import("@tauri-apps/plugin-opener").then((o) => o.openPath(at)).then(() => frame.say(`${name} opened in Finder.`)).catch(() => frame.say(`Sol could not open ${name} in Finder.`));
}

/** an empty Files' one line: why nothing is listed, and what the press does */
function filesNone(rid?: string): string {
  const r = rid ? D.regions.find((x) => x.id === rid) : undefined;
  if (!rid || !pathOf(rid, r)) return `${r?.name ?? "This folder"} lives in Sol only, so it has no files on your Mac.`;
  return "No files at its top level. Press to open it in Finder.";
}

/** one part: its name, its corner, and what it lists in its own form (dates as tiles, people as names, pictures as tiles) */
const SAYS: Record<PartId, string> = { files: "open this folder in Finder", working: "see what's running here", coming: "show the reason for this list", changed: "show the reason for this list", with: "show the reason for this list", read: "show the reason for this list", photos: "show the reason for this list" };
function Part({ id, corner, items, seen, off, fx, rid, onUse }: { id: PartId; corner: React.ReactNode; items: Item[]; seen?: Seen; off?: boolean; fx: object; rid?: string; onUse?: (el: HTMLElement) => void }) {
  // the part is the press (role button): a press anywhere but on its own buttons and its unfolded why
  const press = onUse && !off ? {
    role: "button", tabIndex: 0, "aria-label": `${PART_W[id]}: ${SAYS[id]}`, ...(id === "files" ? { "data-fp-files": rid } : {}),
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onUse(e.currentTarget); } },
    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (!(e.target as Element).closest("button, .bc-open")) onUse(e.currentTarget); },
  } : {};
  return (
    <div className={`fp-part${off ? " off" : ""}`} data-part={id} {...fx} {...press}>
      <div className="fp-h"><h3 className="fp-n">{PART_W[id]}{off ? <small> · hidden</small> : null}</h3><span className="fp-c">{corner}</span></div>
      {off ? null : <Body id={id} items={items} title={seen?.fact} rid={rid} />}
    </div>
  );
}

function Body({ id, items, title, rid }: { id: PartId; items: Item[]; title?: string; rid?: string }) {
  // nothing dated: said plainly, with the reason (BR1 hold, #1615)
  if (id === "coming" && !items.length) return <p className="fp-none"><b>Nothing coming up.</b> {title}</p>;
  // Files with none listed says why, never an empty card (BR1 conform 2): a folder made in Sol has no place on the Mac;
  // one with a place has no files at its top (the engine's look lists those, newest first, and not the folders kept apart)
  if (id === "files" && !items.length) return <p className="fp-none" data-fp-empty>{filesNone(rid)}</p>;
  // a history with no change Sol can list: its fact, never an empty card (BR1 conform #3)
  if (!items.length && title) return <p className="fp-none">{title}</p>;
  if (id === "coming") return <div className="fp-due">{items.map((x) => <span key={x.what}><b>{x.at}</b>{x.what}</span>)}</div>;
  if (id === "with") return <div className="fp-ppl">{items.map((x) => <span key={x.what}>{x.what}</span>)}</div>;
  if (id === "photos") return <div className="fp-thumbs" title={title}>{items.slice(0, 4).map((x) => <i key={x.what} title={x.what} />)}</div>;
  // BR1 item 7: Working now opens See what's at work on this folder (atwork/): its sessions, Pause and Stop, in time order
  if (id === "working") return <div className="fp-list">{items.map((x) => <div key={x.what} className="fp-li fp-run"><b aria-hidden="true" />{x.what}{x.at ? <i>{x.at}</i> : null}</div>)}
    {rid ? <button className="fp-aw" data-fp-aw={rid} onClick={(e) => { e.stopPropagation(); openAt(rid); }}>See what's running in this folder</button> : null}</div>;
  return <div className="fp-list">{items.map((x) => <div key={x.what} className="fp-li"><span>{x.what}</span>{x.at ? <i>{x.at}</i> : null}</div>)}</div>;
}
