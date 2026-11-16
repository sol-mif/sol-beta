// Pages (#433, D1 of #413): the project's own pages, each a markdown file in its record (.sol/pages/<id>.md, engine
// team/pages.ts), drawn here as Sol's own page, never a web view. The pages tab lists them, newest first, each with who is
// on it; a page opens in the tab's place with the frame the tools have (Tools.tsx: back, the glyph and title, who is here
// too) and the page renderer under it: its parts (parts.ts) each drawn by DRAW, a new kind of part one `drawPart` call.
// Edit is the words as they are kept, with a slash menu: "/" at a line's start or after a space offers the entries
// slash.ts holds (headings, lists, a checklist, a divider, a mention, insert block; tables and templates add theirs). A
// save carries the version it was opened at, so two people never write over each other: the engine refuses, the page
// shows as it is now and my words stay in the editor. While a page is open my worker stands on it (`page-<id>`), as on a
// thing (here.ts); every write is signed (by, and agent with sign() when an agent wrote it).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Team } from "../useTeam";
import type { TableInfo } from "../tables/views";
import { DEV_TEAM } from "../useTeam";
import type { ToolId } from "../useRoom";
import { Glyph } from "../Room";
import { Who, since } from "../bits";
import { openUrl } from "../util";
import { focusMsg, FOCUS_AGAIN_MS } from "../thingView";
import { BLOCKS, type Block } from "../blocks";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { parseParts, inlineOf, toggleCheck, type Part } from "./parts";
import { slashAt, slashEntries, matchSlash, applySlash, type SlashEntry, type SlashCtx } from "./slash";
import { titleFor, type TemplateInfo } from "./templates";   // templates (#435): its slash entry, defined there
import "./pages.css";

export type PageInfo = { id: string; title: string; made: string; by: string; agent?: true; at: string; size?: number; newer?: true };
export type PageNow = PageInfo & { body: string; sha: string; parts?: number };
type Ans = { page?: PageNow; error?: string; changed?: boolean };

/** the tile a person on a page stands on (engine pages.ts pageTile): the hub keeps thing ids to 40 letters */
export const pageTile = (id: string) => `page-${id}`;
/** "frank's agent · 6m ago" (pure): who wrote a page last, and when */
export const lastBy = (p: Pick<PageInfo, "by" | "agent" | "at">) => {
  const s = since(p.at);
  return `${p.by || "someone"}${p.agent ? "'s agent" : ""} · ${s === "now" ? "just now" : `${s} ago`}`;
};

// ---- the page renderer: one drawing a kind of part ----
export type DrawCtx = { blocks: Block[]; live: Set<string>; onTool: (id: ToolId) => void; onTick?: (line: number, done: boolean) => void; team?: Team };   // team: a part that reads (a table, #434)
const DRAW: Record<string, (p: Part, c: DrawCtx) => ReactNode> = {};
/** a kind of part drawn on a page: tables (#434) draw theirs with this, beside parts.ts's `definePart` */
export function drawPart(kind: string, draw: (p: Part, c: DrawCtx) => ReactNode) { DRAW[kind] = draw; }

function Words({ text }: { text: string }) {
  return <>{inlineOf(text).map((x, i) =>
    x.kind === "b" ? <strong key={i}>{x.text}</strong>
      : x.kind === "i" ? <em key={i}>{x.text}</em>
      : x.kind === "code" ? <code key={i}>{x.text}</code>
      : x.kind === "mention" ? <span key={i} className="pg-at">@{x.text}</span>
      : x.kind === "link" ? <a key={i} href={x.href} onClick={(e) => { e.preventDefault(); if (!DEV_TEAM) openUrl(x.href!); }}>{x.text}</a>
      : <span key={i}>{x.text}</span>)}</>;
}
drawPart("h", (p) => { const H = (["h2", "h3", "h4"] as const)[(p.level ?? 1) - 1]; return <H className={`pg-h pg-h${p.level}`}><Words text={p.text ?? ""} /></H>; });
drawPart("p", (p) => <p className="pg-p"><Words text={p.text ?? ""} /></p>);
drawPart("li", (p) => <div className="pg-li"><span className="pg-dot" aria-hidden>•</span><span><Words text={p.text ?? ""} /></span></div>);
drawPart("ol", (p) => <div className="pg-li"><span className="pg-n" aria-hidden>{p.n}.</span><span><Words text={p.text ?? ""} /></span></div>);
drawPart("check", (p, c) => (
  <label className={`pg-check ${p.done ? "done" : ""}`}>
    <input type="checkbox" checked={!!p.done} disabled={!c.onTick} onChange={(e) => c.onTick?.(p.line, e.target.checked)} />
    <span><Words text={p.text ?? ""} /></span>
  </label>
));
drawPart("hr", () => <hr className="pg-hr" />);
drawPart("code", (p) => <pre className="pg-code">{(p.lines ?? []).join("\n")}</pre>);
drawPart("block", (p, c) => {
  const b = c.blocks.find((x) => x.id === p.id);
  if (!b) return <div className="pg-block off"><span className="pg-bk-n">{p.id}</span><span className="pg-bk-s">a block this Sol does not know</span></div>;
  const on = c.live.has(b.id), tool = on && b.kind === "tool";
  const inner = (<><Glyph kind={b.glyph ?? b.id} size={28} /><span className="pg-bk-tx"><span className="pg-bk-n">{b.name}</span>
    <span className="pg-bk-s">{on ? b.shows : "off in this project: turn it on in the project's settings"}</span></span>{tool && <span className="pg-bk-go">open ›</span>}</>);
  return tool ? <button className="pg-block" onClick={() => c.onTool(b.id as ToolId)}>{inner}</button> : <div className={`pg-block ${on ? "" : "off"}`}>{inner}</div>;
});

/** a page's words drawn, part by part (each part's kind its own drawing; one not drawn here is left out) */
export function PageBody({ body, ctx }: { body: string; ctx: DrawCtx }) {
  const parts = useMemo(() => parseParts(body), [body]);
  return <div className="pg-doc">{parts.map((p) => <div key={`${p.line}:${p.kind}`} className="pg-part">{DRAW[p.kind]?.(p, ctx) ?? null}</div>)}</div>;
}

// ---- the tab ----
const OPEN_KEY = "sol.cowork.page";
const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY) || ""; } catch { return ""; } };
const keepOpen = (id: string) => { try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* private */ } };

export function PagesTab({ team, people, live, onTool, flash }: { team: Team; people: string[]; live: Set<string>; onTool: (id: ToolId) => void; flash: (s: string) => void }) {
  const templatesOn = live.has("templates");   // templates (#435): a block of its own, on by the project's agreement
  const [list, setList] = useState<PageInfo[] | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpenS] = useState<{ id: string; edit?: boolean } | null>(() => (readOpen() ? { id: readOpen() } : null));
  const setOpen = (o: { id: string; edit?: boolean } | null) => { setOpenS(o); keepOpen(o?.id ?? ""); };
  const [making, setMaking] = useState<{ title: string; busy?: boolean; error?: string; from?: TemplateInfo } | null>(null);
  // templates (#435): the project's, while the block is on; picking one, then its title, makes the page
  const [tpls, setTpls] = useState<TemplateInfo[] | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!templatesOn) { setTpls(null); setPicking(false); return; }
    void team.ask<{ templates?: TemplateInfo[] }>("team.templates", {}, 30_000).then((m) => setTpls(m.templates ?? []), () => setTpls([]));
    if (DEV_TEAM) return;
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.templates" && Array.isArray(m.templates)) setTpls(m.templates as TemplateInfo[]); });
  }, [team.ask, templatesOn]);
  const read = (refresh = false) => team.ask<{ pages?: PageInfo[]; note?: string; error?: string }>("team.pages", refresh ? { refresh: true } : {}, 30_000)
    .then((m) => { if (m.pages) setList(m.pages); setNote(m.error ?? m.note ?? ""); }).catch((e) => setNote(String(e?.message ?? e)));
  useEffect(() => {
    void read();
    if (DEV_TEAM) return;
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.pages" && Array.isArray(m.pages)) setList(m.pages as PageInfo[]); });
  }, [team.ask]);
  const roster = team.state?.roster ?? [];
  const on = (id: string) => roster.filter((m) => m.who !== team.me && m.thing?.id === pageTile(id)).map((m) => m.who);
  const make = async () => {
    if (!making) return;
    if (!making.title.trim()) return setMaking({ ...making, error: "give the page a title, one line" });
    setMaking({ ...making, busy: true, error: undefined });
    // from a template (#435): the engine fills its blanks and signs the new page; else an empty page
    const r = making.from
      ? await team.ask<{ made?: { id: string }; error?: string }>("team.template.make", { id: making.from.id, title: making.title.trim() }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }))
      : await team.ask<Ans>("team.page.write", { title: making.title.trim(), body: "" }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }) as Ans);
    const id = "made" in r ? r.made?.id : "page" in r ? r.page?.id : undefined;
    if (!id) return setMaking({ ...making, busy: false, error: r.error ?? "couldn't make the page" });
    setMaking(null); setPicking(false);
    void read();
    setOpen({ id, edit: true });
  };

  if (open) return (
    <div className="pg-page">
      <PageView key={open.id} team={team} id={open.id} edit={!!open.edit} people={people} live={live} onTool={onTool} flash={flash} templatesOn={templatesOn}
        onBack={() => { setOpen(null); void read(); }} />
    </div>
  );
  return (
    <div className="pg-page">
      <div className="tl-head pg-head">
        <Glyph kind="file" size={56} />
        <div><h2 className="rm-gp-t">pages</h2><p className="rm-gp-s">the project's own pages: notes, plans, checklists. Everyone and their agents read and write them; each is a file in the project's record</p></div>
      </div>
      {list === null ? <p className="rm-pg-foot">{note || "reading the pages…"}</p> : (
        <div className="pg-list" role="list">
          {list.map((p) => {
            const here = on(p.id);
            return (
              <button key={p.id} role="listitem" className="pg-row" onClick={() => setOpen({ id: p.id })} title={`open ${p.title}`}>
                <span className="pg-row-t">{p.title}</span>
                <span className="pg-row-s">{lastBy(p)}{p.newer ? " · written by a newer Sol" : ""}</span>
                {here.length > 0 && <span className="pg-row-on" aria-label={`${here.join(", ")} on it`}>{here.map((w) => <Who key={w} login={w} size={18} title={`${w} is on this page`} />)}</span>}
              </button>
            );
          })}
          {list.length === 0 && <p className="rm-pg-foot">no pages yet{note ? ` · ${note}` : ""}</p>}
        </div>
      )}
      <div className="tl-add pg-add">
        {making ? (
          <form onSubmit={(e) => { e.preventDefault(); void make(); }}>
            {making.from && <span className="pg-from">from the template <b>{making.from.title}</b></span>}
            <input autoFocus placeholder="the page's title" value={making.title} maxLength={120} onChange={(e) => setMaking({ ...making, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") setMaking(null); }} />
            {making.error && <span className="err">{making.error}</span>}
            <div className="acts"><button className="rm-th-link u" type="submit" disabled={making.busy}>{making.busy ? "making…" : "make it"}</button><button className="rm-th-link" type="button" onClick={() => setMaking(null)}>never mind</button></div>
          </form>
        ) : picking && tpls ? (
          <TemplatePicker team={team} list={tpls} onPick={(t) => setMaking({ title: titleFor(t), from: t })} onClose={() => setPicking(false)} flash={flash} />
        ) : (
          <div className="pg-adds">
            <button className="tl-plus" onClick={() => setMaking({ title: "" })}><span>+</span>new page</button>
            {templatesOn && <button className="tl-plus" onClick={() => setPicking(true)} disabled={!tpls} title="a new page with a template's words, the date and your name filled in"><span>⧉</span>from a template{tpls?.length ? <small>{tpls.length}</small> : null}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- templates (#435): pick one to start a page from, or take one away ----
function TemplatePicker({ team, list, onPick, onClose, flash }: { team: Team; list: TemplateInfo[]; onPick: (t: TemplateInfo) => void; onClose: () => void; flash: (s: string) => void }) {
  const [sure, setSure] = useState("");
  const [busy, setBusy] = useState("");
  const away = async (t: TemplateInfo) => {
    if (sure !== t.id) return setSure(t.id);
    setBusy(t.id);
    const r: { removed?: string; error?: string } = await team.ask<{ removed?: string; error?: string }>("team.template.remove", { id: t.id }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }));
    setBusy(""); setSure("");
    flash(r.removed ? `${t.title} is no longer a template` : r.error ?? "couldn't take it away");
  };
  return (
    <div className="pg-tpl" role="list" aria-label="the project's templates">
      <div className="pg-tpl-k"><span>start from a template</span><button className="rm-th-link" onClick={onClose}>never mind</button></div>
      {list.map((t) => (
        <div key={t.id} role="listitem" className="pg-tpl-row">
          <button className="pg-tpl-pick" onClick={() => onPick(t)} disabled={!!t.newer} title={t.newer ? "written by a newer Sol: update Sol to use it" : `a new page from ${t.title}`}>
            <span className="pg-tpl-m" aria-hidden>⧉</span>
            <span className="pg-row-t">{t.title}</span>
            <span className="pg-row-s">{lastBy(t)}</span>
          </button>
          <button className={`rm-th-link ${sure === t.id ? "u" : ""}`} onClick={() => void away(t)} onBlur={() => setSure((x) => (x === t.id ? "" : x))} disabled={busy === t.id}
            title="the template goes from the project's record; pages made from it stay">{busy === t.id ? "taking away…" : sure === t.id ? "sure? take it away" : "take away"}</button>
        </div>
      ))}
      {list.length === 0 && <p className="rm-pg-foot">no templates yet · open a page and press "save as template"</p>}
    </div>
  );
}

// ---- one page ----
export function PageView({ team, id, edit, people, live, onTool, onBack, flash, templatesOn }: {
  team: Team; id: string; edit?: boolean; people: string[]; live: Set<string>; onTool: (id: ToolId) => void; onBack: () => void; flash: (s: string) => void; templatesOn?: boolean;
}) {
  const [page, setPage] = useState<PageNow | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ title: string; body: string; base: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // save as template (#435): the page's words as they are, a title of its own
  const [saving, setSaving] = useState<{ title: string; busy?: boolean; error?: string } | null>(null);
  const saveTemplate = async () => {
    if (!saving?.title.trim() || saving.busy) return;
    setSaving({ ...saving, busy: true, error: undefined });
    const r: { template?: { id: string; title: string }; error?: string } = await team.ask<{ template?: { id: string; title: string }; error?: string }>("team.template.save", { page: id, title: saving.title.trim() }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }));
    if (!r.template) return setSaving({ ...saving, busy: false, error: r.error ?? "couldn't save it as a template" });
    setSaving(null);
    flash(`saved as the template ${r.template.title}; the team starts pages from it`);
  };
  // the slash menu's "from a template" (#435): the templates' words, read once when the editor first opens
  const [tplWords, setTplWords] = useState<{ id: string; name: string; body: string }[]>([]);
  const tplRead = useRef(false);
  useEffect(() => {
    if (!draft || !templatesOn || tplRead.current) return;
    tplRead.current = true;
    void (async () => {
      const l = await team.ask<{ templates?: TemplateInfo[] }>("team.templates", {}, 30_000).catch(() => ({ templates: [] as TemplateInfo[] }));
      const got = await Promise.all((l.templates ?? []).slice(0, 20).map((t) => team.ask<{ template?: { body: string } }>("team.template", { id: t.id }, 30_000)
        .then((m) => (m.template ? { id: t.id, name: t.title, body: m.template.body } : null), () => null)));
      setTplWords(got.filter((x): x is { id: string; name: string; body: string } => !!x));
    })();
  }, [draft, templatesOn, team.ask]);
  const live$ = useRef({ draft, page });
  live$.current = { draft, page };

  useEffect(() => {
    let gone = false;
    void team.ask<Ans>("team.page", { id }, 30_000).then((m) => {
      if (gone) return;
      if (!m.page) return setError(m.error ?? "this page could not be read");
      setPage(m.page);
      if (edit) setDraft({ title: m.page.title, body: m.page.body, base: m.page.sha });
    }).catch((e) => !gone && setError(String(e?.message ?? e)));
    // another person's (or agent's) save: the page as it is now; while I write, a word that it moved
    const off = DEV_TEAM ? () => {} : link(ENGINE).on((m) => {
      if (m?.rid || m?.type !== "team.page.changed" || m.page?.id !== id) return;
      const p = m.page as PageNow;
      if (p.sha === live$.current.page?.sha) return;
      setPage(p);
      if (live$.current.draft && live$.current.draft.base !== p.sha) setNote(`${lastBy(p)} changed this page while you write; saving will say so and keep your words`);
    });
    return () => { gone = true; off(); };
  }, [team.ask, id]);

  // my worker stands on the page while it is open, as on a thing's (here.ts `in_thing`)
  useEffect(() => {
    const say = (on: boolean) => { void team.ask("team.thing.focus", focusMsg(pageTile(id), on)).catch(() => {}); };
    say(true);
    const t = window.setInterval(() => say(true), FOCUS_AGAIN_MS);
    return () => { window.clearInterval(t); say(false); };
  }, [team.ask, id]);

  const others = (team.state?.roster ?? []).filter((m) => m.who !== team.me && m.thing?.id === pageTile(id)).map((m) => m.who);
  const blocks = useMemo(() => BLOCKS.filter((b) => b.kind !== "page" && b.kind !== "template"), []);   // a page is not drawn inside a page, nor are templates

  const write = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    const r = await team.ask<Ans>("team.page.write", { id, ...body }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }) as Ans);
    setBusy(false);
    if (r.page) setPage(r.page);
    if (r.error) { setNote(r.error); return false; }
    setNote("");
    return true;
  };
  const save = async () => {
    if (!draft || busy) return;
    const ok = await write({ title: draft.title, body: draft.body, base: draft.base || "-" });   // a version not known is refused, never a write over
    if (ok) { setDraft(null); flash("saved on the project's page; everyone sees it"); }   // refused: my words stay, the page shows as it is now
  };
  const tick = (line: number, done: boolean) => {
    if (!page || busy) return;
    const body = toggleCheck(page.body, line, done);
    setPage({ ...page, body });   // at once; the engine's answer (or its refusal) puts the page right
    void write({ body, base: page.sha || "-" });
  };
  const stale = !!(draft && page && draft.base !== page.sha);
  // the project's tables, for "/table" (#434): read once when the words open for editing
  const [tables, setTables] = useState<TableInfo[]>([]);
  const editing = !!draft;
  useEffect(() => {
    if (!editing) return;
    void team.ask<{ tables?: TableInfo[] }>("team.tables", {}, 30_000).then((m) => { if (m.tables) setTables(m.tables); }).catch(() => {});
  }, [editing, team.ask]);

  return (<>
    <div className="rm-pg-top">
      <button className="rm-th-link" onClick={onBack}>‹ pages</button><span className="rm-th-sp" />
      {page && !draft && templatesOn && <button className="rm-th-link" onClick={() => setSaving(saving ? null : { title: page.title })} disabled={!!page.newer} title="the team can start new pages from this one's words">save as template</button>}
      {page && !draft && <button className="rm-th-link u" onClick={() => { setNote(""); setDraft({ title: page.title, body: page.body, base: page.sha }); }} disabled={!!page.newer} title={page.newer ? "written by a newer Sol: update Sol to change it" : "change the words; type / for headings, lists, a checklist, a mention or a block"}>edit</button>}
      {draft && <>
        <button className="rm-th-link" onClick={() => { setDraft(null); setNote(""); }}>cancel</button>
        {stale && <button className="rm-th-link" onClick={() => page && setDraft({ title: page.title, body: page.body, base: page.sha })} title="drop my words, take the page as it is now">take theirs</button>}
        <button className="rm-th-link u" disabled={busy} onClick={() => { if (stale && page) setDraft({ ...draft, base: page.sha }); else void save(); }}
          title={stale ? "write my words over theirs: press again to save" : "⌘S"}>{busy ? "saving…" : stale ? "keep mine" : "save"}</button>
      </>}
    </div>
    <div className="tl-head pg-head">
      <Glyph kind="file" size={56} />
      <div>
        {draft ? <input className="pg-title-in" value={draft.title} maxLength={120} aria-label="the page's title" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          : <h2 className="rm-gp-t">{page?.title ?? id}</h2>}
        <p className="rm-gp-s">{page ? `${lastBy(page)}${page.made && page.made !== page.by ? ` · made by ${page.made}` : ""}` : error || "reading…"}</p>
      </div>
      {others.length > 0 && <span className="tl-here">{others.map((w) => <Who key={w} login={w} size={24} title={`${w} is on this page too`} />)}<span>{others.join(", ")} here too</span></span>}
    </div>
    {saving && !draft && (
      <form className="pg-save-tpl" onSubmit={(e) => { e.preventDefault(); void saveTemplate(); }}>
        <span className="pg-from">save this page's words as a template</span>
        <input autoFocus value={saving.title} maxLength={120} aria-label="the template's title" placeholder="the template's title"
          onChange={(e) => setSaving({ ...saving, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setSaving(null); }} />
        {saving.error && <span className="err">{saving.error}</span>}
        <div className="acts"><button className="rm-th-link u" type="submit" disabled={saving.busy || !saving.title.trim()}>{saving.busy ? "saving…" : "save it"}</button><button className="rm-th-link" type="button" onClick={() => setSaving(null)}>never mind</button></div>
      </form>
    )}
    {note && <p className="pg-note" role="status">{note}</p>}
    {draft ? (
      <Editor value={draft.body} ctx={{ people: people.filter((p) => p !== team.me).concat(team.me ? [team.me] : []), blocks: blocks.filter((b) => live.has(b.id)).map((b) => ({ id: b.id, name: b.name, kind: b.kind })), templates: templatesOn ? tplWords : [], me: team.me, tables }}
        onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))} onSave={() => void save()} />
    ) : page ? (
      page.body.trim() ? <PageBody body={page.body} ctx={{ blocks, live, onTool, onTick: page.newer ? undefined : tick, team }} />
        : <p className="rm-pg-foot">nothing on this page yet · edit, and type / for headings, lists, a checklist, a divider, a mention or a block</p>
    ) : null}
  </>);
}

// ---- the editor: the words as they are kept, and the slash menu ----
type Menu = { start: number; query: string; sub?: SlashEntry; at: number };
const MIRROR = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "paddingBottom", "borderTopWidth", "borderLeftWidth", "borderRightWidth", "boxSizing", "tabSize"] as const;
/** where the caret is inside a textarea, in its own pixels: a hidden copy laid out the same, measured at the caret */
function caretXY(ta: HTMLTextAreaElement, pos: number) {
  const cs = getComputedStyle(ta), d = document.createElement("div");
  for (const k of MIRROR) d.style[k] = cs[k];
  Object.assign(d.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", width: `${ta.offsetWidth}px`, top: "0", left: "-9999px" });
  d.textContent = ta.value.slice(0, pos);
  const s = document.createElement("span"); s.textContent = ta.value.slice(pos, pos + 1) || "."; d.appendChild(s);
  document.body.appendChild(d);
  const r = { x: s.offsetLeft, y: s.offsetTop - ta.scrollTop, h: parseFloat(cs.lineHeight) || 22 };
  d.remove();
  return r;
}

function Editor({ value, ctx, onChange, onSave }: { value: string; ctx: SlashCtx; onChange: (v: string) => void; onSave: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, top: 0, up: false });
  const caretNext = useRef<number | null>(null);
  const items = useMemo(() => {
    if (!menu) return [];
    if (menu.sub) return matchSlash(menu.sub.choices!(ctx).map((c) => ({ ...c, keys: [] })), menu.query).map((c) => ({ id: c.id, word: c.word, hint: c.hint ?? "", mark: menu.sub!.mark }));
    return matchSlash(slashEntries(ctx), menu.query).map((e) => ({ id: e.id, word: e.word, hint: e.hint, mark: e.mark }));
  }, [menu, ctx]);

  // the textarea grows with the words; the caret goes where an entry left it
  useLayoutEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.max(320, el.scrollHeight + 4)}px`;
    if (caretNext.current !== null) { el.setSelectionRange(caretNext.current, caretNext.current); caretNext.current = null; }
  }, [value]);
  useEffect(() => { ta.current?.focus(); }, []);

  const look = (text: string, caret: number, sub?: SlashEntry) => {
    const s = slashAt(text, caret);
    if (!s) return setMenu(null);
    setMenu((m) => { const same = !!m && m.start === s.start; return { start: s.start, query: s.query, sub: sub ?? (same ? m!.sub : undefined), at: same && m!.query === s.query ? m!.at : 0 }; });
    // under the caret's line; above it when the window has no room below for the menu
    if (ta.current) { const c = caretXY(ta.current, s.start); const r = ta.current.getBoundingClientRect(); setPos({ x: c.x, y: c.y + c.h, top: c.y, up: r.top + c.y + c.h + 330 > window.innerHeight && r.top + c.y > 340 }); }
  };
  const put = (text: string, caret: number) => { caretNext.current = caret; onChange(text); };
  const pick = (i: number) => {
    if (!menu || !ta.current) return;
    const caret = ta.current.selectionStart;
    if (menu.sub) {
      const r = applySlash(value, menu.start, caret, menu.sub.apply(items[i]?.id, ctx));
      setMenu(null); return put(r.text, r.caret);
    }
    const e = slashEntries().find((x) => x.id === items[i]?.id);
    if (!e) return;
    if (e.choices) {   // a second list: the "/word" goes back to "/", and what follows filters the choices
      const text = value.slice(0, menu.start + 1) + value.slice(caret);
      // nothing typed after the "/": the words are the same, so the caret is put now (a caret kept for the next change
      // would land on the next letter typed and turn the name around)
      if (text === value) ta.current.setSelectionRange(menu.start + 1, menu.start + 1); else put(text, menu.start + 1);
      setMenu({ start: menu.start, query: "", sub: e, at: 0 });
      return;
    }
    const r = applySlash(value, menu.start, caret, e.apply(undefined, ctx));
    setMenu(null); put(r.text, r.caret);
  };
  const at = menu ? Math.min(menu.at, Math.max(0, items.length - 1)) : 0;

  return (
    <div className="pg-ed">
      <textarea ref={ta} className="pg-ta" value={value} spellCheck aria-label="the page's words"
        placeholder={"write here. Type / for a heading, a list, a checklist, a divider, a mention or a block"}
        onChange={(e) => { caretNext.current = null; onChange(e.target.value); look(e.target.value, e.target.selectionStart); }}
        onClick={(e) => look(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => setMenu(null), 120)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); return; }
          if (!menu || !items.length) { if (menu && e.key === "Escape") { e.preventDefault(); setMenu(null); } return; }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = items.length; setMenu({ ...menu, at: (at + (e.key === "ArrowDown" ? 1 : n - 1)) % n }); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(at); }
          else if (e.key === "Escape") { e.preventDefault(); setMenu(menu.sub ? { ...menu, sub: undefined, at: 0 } : null); }
        }} />
      {menu && (
        <div className={`pg-menu ${pos.up ? "up" : ""}`} role="listbox" aria-label={menu.sub ? menu.sub.word : "insert"} style={{ left: Math.max(0, Math.min(pos.x, (ta.current?.offsetWidth ?? 600) - 300)), top: pos.up ? pos.top - 6 : pos.y + 6 }}>
          {menu.sub && <div className="pg-menu-k">{menu.sub.word}</div>}
          {items.length ? items.map((x, i) => (
            <button key={x.id} role="option" aria-selected={i === at} className={`pg-menu-i ${i === at ? "on" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setMenu({ ...menu, at: i })} onClick={() => pick(i)}>
              <span className="pg-menu-m" aria-hidden>{x.mark}</span>
              <span className="pg-menu-tx"><span className="pg-menu-w">{x.word}</span>{x.hint && <span className="pg-menu-h">{x.hint}</span>}</span>
            </button>
          )) : <div className="pg-menu-none">{menu.sub ? `no ${menu.sub.id === "mention" ? "one" : menu.sub.id === "table" ? "table" : "block"} by that name` : "nothing by that name"}</div>}
        </div>
      )}
      <p className="pg-hint">markdown, kept as a file in the project's record · ⌘S saves</p>
    </div>
  );
}
