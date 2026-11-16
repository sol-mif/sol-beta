// ?dev=team: the project's pages, kept in this tab's memory only (#433), so the pages tab draws and writes with no engine.
// The engine's answers in their shapes (team.pages, team.page, team.page.write); a base older than the page is refused as
// the engine refuses it, so the "changed since you opened it" note can be seen.
type DevPage = { id: string; title: string; made: string; by: string; agent?: true; at: string; parts: number; body: string; sha: string };

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
let n = 0;
const sha = () => `dev${(++n).toString(16).padStart(6, "0")}`;
const PAGES: DevPage[] = [
  { id: "launch-plan", title: "launch plan", made: "marco", by: "frank", agent: true, at: ago(6), parts: 1, sha: sha(), body: [
    "What has to be true before the first ten people outside the team get Sol.",
    "",
    "## before the invite",
    "",
    "- [x] the install line works on a clean Mac",
    "- [x] onboarding plays through on Windows",
    "- [ ] @isaac tries the cloud join from a phone link",
    "- [ ] the first-run card says what Sol is in **one** line",
    "",
    "## the week of",
    "",
    "1. send the ten invites, one by one",
    "2. a short call with each, by the end of the week",
    "",
    "::block[calendar]",
    "",
    "---",
    "",
    "Questions go in `#general`; decisions in the log.",
  ].join("\n") },
  { id: "meeting-notes", title: "meeting notes", made: "isaac", by: "isaac", at: ago(60 * 26), parts: 1, sha: sha(), body: "# thursday\n\n- @frank shows the rooms stack\n- pages land this week\n" },
];

const head = ({ body: _b, sha: _s, parts: _p, ...h }: DevPage) => ({ ...h, size: _b.length });
const list = () => [...PAGES].sort((a, b) => b.at.localeCompare(a.at)).map(head);
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "page";

// templates (#435): two of the team's, one saved by an agent, so the picker shows both signatures
const TEMPLATES: DevPage[] = [
  { id: "weekly-sync", title: "weekly sync", made: "frank", by: "frank", agent: true, at: ago(60 * 30), parts: 1, sha: sha(), body: [
    "# {{title}}", "", "{{date}} · notes by {{me}}", "", "## since last week", "", "- ", "", "## what's next", "", "- [ ] ", "", "## decided", "", "- ",
  ].join("\n") },
  { id: "release-check", title: "release check", made: "isaac", by: "isaac", at: ago(60 * 50), parts: 1, sha: sha(), body: [
    "# {{title}}", "", "- [ ] the install line works on a clean Mac", "- [ ] onboarding plays through", "- [ ] the timeline shows the release", "", "checked by {{me}} on {{date}}",
  ].join("\n") },
];
const fill = (b: string, a: { day: string; me: string; title: string }) => b.replace(/\{\{\s*(date|today|me|title)\s*\}\}/gi, (_m, k: string) => (k.toLowerCase() === "me" ? a.me : k.toLowerCase() === "title" ? a.title : a.day));
const day = () => new Date().toISOString().slice(0, 10);

function fakeTemplates(type: string, body: any): any {
  const tl = () => [...TEMPLATES].sort((a, b) => b.at.localeCompare(a.at)).map(head);
  const t = TEMPLATES.find((x) => x.id === body?.id);
  if (type === "team.templates") return { repo: "sol-mif/sol-dev", templates: tl() };
  if (type === "team.template") return t ? { template: { ...t } } : { error: "no such template here" };
  if (type === "team.template.remove") { if (!t) return { error: "it is not there any more" }; TEMPLATES.splice(TEMPLATES.indexOf(t), 1); return { removed: t.id }; }
  if (type === "team.template.save") {
    const p = PAGES.find((x) => x.id === body?.page);
    if (!p) return { error: "no such page here" };
    const title = String(body.title ?? "").trim() || p.title;
    const made: DevPage = { id: slug(title), title, made: "marco", by: "marco", at: new Date().toISOString(), parts: 1, body: p.body, sha: sha() };
    TEMPLATES.push(made);
    return { template: { ...made } };
  }
  if (type === "team.template.make") {
    if (!t) return { error: "no such template here" };
    const title = String(body.title ?? "").trim() || `${t.title} ${day()}`;
    return { made: { kind: "page", id: fakePages("team.page.write", { title, body: fill(t.body, { day: day(), me: "marco", title }) }).page.id, title } };
  }
  return {};
}

export function fakePages(type: string, body: any): any {
  if (type.startsWith("team.template")) return fakeTemplates(type, body);
  if (type === "team.pages") return { repo: "sol-mif/sol-dev", pages: list() };
  const p = PAGES.find((x) => x.id === body?.id);
  if (type === "team.page") return p ? { page: { ...p } } : { error: "no such page here" };
  if (type !== "team.page.write") return {};
  const at = new Date().toISOString();
  if (!p) {
    const title = String(body.title ?? "").trim();
    if (!title) return { error: "give the page a title, one line" };
    let id = slug(title), i = 2;
    while (PAGES.some((x) => x.id === id)) id = `${slug(title).slice(0, 29)}-${i++}`;
    const made: DevPage = { id, title, made: "marco", by: "marco", at, parts: 1, body: String(body.body ?? ""), sha: sha() };
    PAGES.push(made);
    return { page: { ...made }, changed: true };
  }
  if (body.base && body.base !== p.sha) return { error: `${p.by}${p.agent ? "'s agent" : ""} changed this page since you opened it; it is shown as it is now, your words are kept`, page: { ...p } };
  if (typeof body.append === "string") p.body = `${p.body.replace(/\n*$/, "\n")}${body.append}\n`;
  else { p.body = String(body.body ?? ""); if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim(); }
  Object.assign(p, { by: "marco", agent: undefined, at, sha: sha() });
  return { page: { ...p }, changed: true };
}
