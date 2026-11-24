// The seven panel people of the design (mine/look/br1/you.html), as the engine would answer them: next.you suggest, accounts,
// perms, the reading stream and the finished You. Built from compact tables below. The people are fiction; no real path or name.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { BINS, type Accounts, type Aim, type Bin, type Ev, type Level, type More, type Open, type Panel, type Part, type Perm, type Setup, type Source, type Suggest, type Thrown, type You } from "./types.ts";

const COL = { amber: "#FFD58A", coral: "#FFAFA0", mint: "#B6F0E0", sky: "#9FD3FF", lilac: "#C9B6FF", lime: "#D3F28E", pink: "#FFB3D1" };
const CONNS: Record<string, string> = { gdrive: "Google Drive", gcal: "Google Calendar", github: "GitHub", notion: "Notion", slack: "Slack", dropbox: "Dropbox" };
const SM: Record<string, Source> = { claudecode: "claude-sessions", codex: "codex-sessions", chrome: "browser", safari: "browser", calendar: "calendar-store", notes: "notes", files: "files", apps: "apps", code: "projects" };
const WS: Record<string, string> = { ai: "claude-sessions", code: "projects", apps: "apps", browser: "browser", cal: "calendar-store", files: "files", notes: "notes", said: "said" };
const LB: Record<Source, [string, string]> = { "claude-sessions": ["Claude Code", "Claude Code"], "codex-sessions": ["Codex", "Codex"], apps: ["Apps", "앱"], browser: ["Browser", "브라우저"], "calendar-store": ["Calendar", "캘린더"], notes: ["Notes", "메모"], files: ["Files", "파일"], projects: ["Code", "코드"] };
const LV: Record<"en" | "ko", string[]> = { en: ["Looks, changes nothing", "Prepares, you approve", "Does it for you"], ko: ["보기만", "준비까지", "해 줘요"] };
const LEVEL: Level[] = ["record", "draft", "do"];
const BIN_EN: Record<Bin, string> = { keys: "passwords or keys", money: "money", health: "health", talk: "private talk", id: "ID" };
const BIN_KO: Record<Bin, string> = { keys: "비밀번호", money: "돈", health: "건강", talk: "사적 대화", id: "신분증" };
// where a thrown bin most likely turns up, first present source wins
const BIN_AT: Record<Bin, Source[]> = { keys: ["claude-sessions", "codex-sessions", "files", "notes", "apps"], money: ["browser", "apps", "files"], health: ["notes", "calendar-store", "files"], talk: ["notes", "apps", "files", "browser"], id: ["files", "apps", "notes"] };
const AT = "2026-11-21T17:00:00.000Z";

type Raw = {
  name: string; ko?: boolean; look: string; typed: string; only?: boolean;
  aims: [string, 0 | 1, 0 | 1][]; steer: string;
  mac: [string, 0 | 1][]; ais: [string, string, string?][]; key?: string; conn: [string, string, string?][]; granted: Record<string, boolean>;
  rows: Partial<Record<Source, string>>; ev: [string, string, string, string, number][]; skip?: string;
  parts: { n: string; s: number; c: keyof typeof COL; ais: number; lv: 0 | 1 | 2; tools: string[]; faded?: boolean }[];
  when: [number | null, number | null, string[]][];
  day: number[] | null; quiet?: [number, number]; thrown: number[]; headline: string; checks: [string, number][];
  setup: string[]; diary: [string, string][]; digest: string;
  open?: Record<number, Open>;   // what an opened row shows (reading.html screen 2), by the row's place in ev
};

const RAW: Record<string, Raw> = {
  dev: { name: "Dev", look: "dark", typed: "", aims: [["Building things", 1, 1], ["My business", 1, 1]],
    steer: "Because you said <b>Building things</b> and <b>My business</b>, Sol reads your AI sessions and code first.",
    mac: [["claudecode", 1], ["codex", 1], ["chrome", 1], ["calendar", 1], ["apps", 1], ["files", 0]],
    ais: [["claude", "on", "Found on this Mac, from Claude Code"], ["chatgpt", "on", "Found on this Mac, from Codex"], ["gemini", "off"]], key: "Anthropic",
    conn: [["github", "new", "4 repositories"], ["gdrive", "off"], ["notion", "off"], ["slack", "off"]],
    granted: { calendar: true, "full-disk": false, screen: false },
    // the design's "Your code" row has no engine source of its own; it rides on Codex (nearest present)
    rows: { "claude-sessions": "312 chats in 4 projects", "codex-sessions": "4 repositories, mostly TypeScript", apps: "23 in use, 6 every day", browser: "41 sites, names only", "calendar-store": "18 dates in the next month" },
    ev: [
      ["claudecode", "folder checkout-app · 140 sessions", "Your biggest project; last session yesterday", "Place: Checkout app", 0],
      ["codex", "folder checkout-app · 41 sessions", "Two AIs work on the same project", "2 more AIs in Checkout app", 0],
      ["claudecode", "skill review · used 14 times", "You review before anything merges", "Review stays a step", -1],
      ["claudecode", "MCP github, stripe · used 60 times", "Payments run through Stripe", "Stripe in its tools", 0],
      ["claudecode", "folder pipeline · 88 sessions, Python", "A second project", "Place: Pipeline", 1],
      ["claudecode", "sessions start 21:00–02:00", "You work at night", "Quiet 3–10am", -1],
      ["codex", "folder docs · 51 sessions", "A docs site you keep up", "Place: Docs site", 2],
      ["claudecode", "folder synth · last session 7 weeks ago", "It has gone quiet", "A question: still yours?", 3],
      ["chrome", "41 sites: mostly code, payments, docs", "The browser is part of the work", "Sites in each place", -1],
      ["calendar", "“Launch” · Dec 5", "A date that matters", "Diary: Launch, Dec 5", -1],
      ["calendar", "“Deploy” · every Friday", "A weekly rhythm", "Diary: Deploy, Fridays", -1],
      ["apps", "Spotify, WhatsApp · every day", "A life outside the projects", "Place: Life", 4]],
    parts: [{ n: "Checkout app", s: .36, c: "coral", ais: 4, lv: 2, tools: ["TS", "Vc", "St", "Gh"] }, { n: "Pipeline", s: .22, c: "sky", ais: 2, lv: 2, tools: ["Py", "Gh"] }, { n: "Docs site", s: .12, c: "mint", ais: 1, lv: 1, tools: ["Md"] }, { n: "synth", s: .06, c: "lilac", ais: 1, lv: 0, tools: [], faded: true }, { n: "Life", s: .24, c: "amber", ais: 0, lv: 1, tools: ["Sp", "Wa"] }],
    when: [[20, 2, ["ai", "code"]], [21, 1, ["ai", "code"]], [14, 18, ["code"]], [22, 1, ["ai"]], [11, 20, ["cal", "apps"]]],
    day: [.35, .3, .2, 0, 0, 0, 0, 0, 0, 0, .1, .25, .3, .3, .35, .4, .35, .3, .3, .45, .7, .9, 1, .8], quiet: [3, 10], thrown: [4, 23, 0, 0, 1],
    headline: "You build four things, mostly at night. Eight AIs already work with you.",
    checks: [["Two of your AIs look like one: “ada” and “ada-2”. Join them?", 0], ["“synth” hasn’t moved in 7 weeks. Still yours?", 3]],
    setup: ["4 places", "8 AIs, named", "Quiet 3–10am", "Dark look", "Shows steps as they work"],
    diary: [["Launch", "Dec 5"], ["Deploy", "every Fri"], ["Codex sign-in ends", "in 5 days"]],
    digest: `here for: building things, my business (said)
AI chats: 312 in 4 projects (checkout-app 140, pipeline 88, docs 51, synth 33; synth last 7 weeks ago)
code: 4 repositories (TypeScript 3, Python 1); 8 agents named in session files
apps used weekly: Cursor, Ghostty, Linear, Figma, Spotify, WhatsApp
sites (names only): github.com, vercel.com, stripe.com, linear.app, x.com …
days: most active 21:00–02:00; nothing 03:00–10:00
dates next 30 days: Launch (Dec 5), Deploy (Fridays), 16 more
thrown away: 4 passwords or keys, 23 money, 1 ID` },
  denise: { name: "Denise", look: "light big", only: true, typed: "I run a small wellness studio. Help me write my price list.", aims: [["My studio’s price list", 1, 1]], steer: "",
    mac: [["safari", 0], ["calendar", 0], ["notes", 0], ["files", 0]], ais: [["claude", "off"], ["chatgpt", "off"], ["gemini", "off"]],
    conn: [["gdrive", "off"], ["gcal", "off"], ["notion", "off"], ["dropbox", "off"]], granted: {}, rows: {}, ev: [],
    parts: [{ n: "The studio", s: 1, c: "mint", ais: 0, lv: 1, tools: [] }], when: [[null, null, ["said"]]], day: null, thrown: [0, 0, 0, 0, 0],
    headline: "You run a small wellness studio. Let’s start with your price list.", checks: [],
    setup: ["1 place: The studio", "A first page: your price list", "Asks before doing anything"], diary: [["Price list", "first draft"]], digest: "" },
  minji: { name: "민지", ko: true, look: "light", typed: "", aims: [["일 · 스튜디오", 1, 1], ["창작", 1, 1]],
    steer: "<b>일</b>과 <b>창작</b>이라고 하셔서 앱, 파일, 사이트부터 읽어요.",
    mac: [["claude", 1], ["chatgpt", 1], ["chrome", 1], ["apps", 1], ["files", 1], ["calendar", 0]],
    ais: [["claude", "on", "이 Mac에서 찾았어요"], ["chatgpt", "on", "이 Mac에서 찾았어요"], ["gemini", "off"]],
    conn: [["gdrive", "new", "이미지 1,240개"], ["notion", "on", "페이지 3개"], ["slack", "off"], ["dropbox", "off"]], granted: { "full-disk": true, calendar: false },
    // the design's "AI 대화" row (chat plans) has no engine source; its one item rides on Apps, its count line is dropped
    rows: { apps: "17개 사용 중, 매일 5개", browser: "29곳, 이름만", files: "이미지 1,240개, 클라이언트 폴더 2개" },
    ev: [
      ["files", "폴더 “하나 브랜드” · 이미지 620개", "가장 큰 클라이언트 작업", "공간: 하나 브랜드", 0],
      ["files", "폴더 “오름 카페” · 이미지 410개", "두 번째 클라이언트", "공간: 오름 카페", 1],
      ["apps", "Figma, Midjourney · 매일", "이미지로 생각해요", "도구: Figma", 0],
      ["chrome", "사이트 29곳: 레퍼런스, 디자인", "레퍼런스를 많이 찾아요", "공간: 리서치", 3],
      ["claude", "프로젝트 “카피” · 대화 52개", "카피는 Claude와 함께", "Claude는 카피 담당", 0],
      ["apps", "Notion · 매일 오전", "스튜디오 운영", "공간: 스튜디오 운영", 2],
      ["apps", "카카오톡 · 저녁", "일 밖의 생활", "공간: 생활", 4]],
    parts: [{ n: "하나 브랜드", s: .32, c: "lilac", ais: 1, lv: 1, tools: ["Fg", "Mj"] }, { n: "오름 카페", s: .24, c: "pink", ais: 1, lv: 1, tools: ["Fg", "Ps"] }, { n: "스튜디오 운영", s: .18, c: "mint", ais: 0, lv: 1, tools: ["Nt"] }, { n: "리서치", s: .12, c: "sky", ais: 1, lv: 0, tools: ["Pn"] }, { n: "생활", s: .14, c: "amber", ais: 0, lv: 0, tools: ["Kk"] }],
    when: [[10, 13, ["files", "apps"]], [14, 18, ["files", "browser"]], [9, 11, ["apps"]], [16, 19, ["browser", "ai"]], [18, 22, ["apps"]]],
    day: [0, 0, 0, 0, 0, 0, 0, 0, .1, .3, .8, .9, .6, .8, .9, .9, .8, .7, .5, .2, .1, .1, 0, 0], quiet: [23, 8], thrown: [1, 9, 0, 3, 0],
    headline: "민지 님은 클라이언트 두 곳과 스튜디오를 운영해요. 낮에 일하고, 이미지로 생각해요.", checks: [["‘오름 카페’는 클라이언트인가요?", 1]],
    setup: ["클라이언트별 공간 2개", "카피·비주얼·리서치 나란히", "작업 중엔 Sol의 색이 한발 물러나요"], diary: [["하나 브랜드 마감", "12월 3일"], ["오름 카페 미팅", "화요일"]],
    digest: `목적: 일 · 스튜디오, 창작 (말해 준 것)
앱: 17개 사용 중, 매일 5개 (Figma, Midjourney, Notion, 카카오톡)
사이트(이름만): 29곳, 레퍼런스와 디자인
파일: 이미지 1,240개, 클라이언트 폴더 2개 (하나 브랜드 620, 오름 카페 410)
하루: 오전 10시–오후 7시
버린 것: 비밀번호 1, 돈 9, 사적 대화 3` },
  tomas: { name: "Tomás", look: "contrast", typed: "", aims: [["Work", 1, 1], ["Writing", 0, 0]],
    steer: "Because you said <b>Work</b>, Sol reads your calendar and files first.",
    mac: [["claude", 1], ["safari", 1], ["calendar", 1], ["files", 1], ["notes", 1], ["apps", 1]],
    ais: [["claude", "on", "Found on this Mac"], ["chatgpt", "off"], ["gemini", "off"]], conn: [["gdrive", "new", "3 reports"], ["gcal", "off"], ["notion", "off"], ["dropbox", "off"]],
    granted: { calendar: true, "full-disk": true },
    // the design shows no row for the browser; it is read, with nothing to count
    rows: { apps: "VoiceOver on, 9 apps in use", "calendar-store": "11 client calls this month", files: "3 reports in progress", notes: "40 notes, 2 about a book" },
    ev: [
      ["calendar", "11 client calls this month", "Clients fill your weekdays", "Place: Clients", 0],
      ["files", "3 reports in Pages, edited this week", "Reports are the work", "Reports in Clients", 0],
      ["notes", "2 notes titled “Book · chapter…”", "You’re writing a book", "A question: a place for it?", 1],
      ["apps", "VoiceOver on · 9 apps by keyboard", "You move by keys and headings", "Outline first, short announcements", -1],
      ["calendar", "“School run” · weekdays 16:00", "Home has its hours", "Place: Home", 2]],
    parts: [{ n: "Clients", s: .5, c: "amber", ais: 1, lv: 1, tools: ["Ml", "Pg"] }, { n: "The book", s: .2, c: "sky", ais: 0, lv: 0, tools: ["Pg"] }, { n: "Home", s: .3, c: "mint", ais: 0, lv: 1, tools: ["Ms"] }],
    when: [[8, 12, ["cal", "files"]], [13, 16, ["notes"]], [16, 18, ["cal"]]],
    day: [0, 0, 0, 0, 0, 0, 0, .1, .7, .9, .9, .8, .4, .8, .9, .8, .6, .2, 0, 0, 0, 0, 0, 0], quiet: [18, 7], thrown: [2, 6, 3, 0, 1],
    headline: "You advise clients and you’re writing a book. You move by keys and headings.", checks: [["Two of your notes are about a book. A place for it?", 1]],
    setup: ["3 places", "Short announcements", "Nothing moves without asking", "The outline first"], diary: [["Client call", "Mon 10:00"], ["Report due", "Thu"]],
    digest: `here for: work (said); writing (seen, not said)
apps: VoiceOver on, 9 apps in use
calendar: 11 client calls this month; "School run" weekdays 16:00
files: 3 reports in Pages, edited this week
notes: 40 notes, 2 titled "Book · chapter…"
days: weekdays 8am–5pm
thrown away: 2 passwords or keys, 6 money, 3 health, 1 ID` },
  lucy: { name: "Lucy", look: "light calm", typed: "branding for 3 clients, a newsletter, a million ideas, I forget things", aims: [["My business", 1, 1]],
    steer: "Because you said <b>My business</b>, Sol reads your calendar and notes first.",
    mac: [["claude", 1], ["safari", 1], ["calendar", 1], ["notes", 1], ["apps", 1], ["files", 0]],
    ais: [["claude", "on", "Found on this Mac"], ["chatgpt", "off"], ["gemini", "off"]], conn: [["gcal", "new", "14 dates"], ["gdrive", "off"], ["notion", "off"], ["slack", "off"]],
    granted: { calendar: true, "full-disk": false }, skip: "Safari needs a Mac switch you haven’t turned on, so Sol skipped it and went on. Switch it on any time from Settings › You.",
    rows: { "calendar-store": "14 dates, 3 clients", notes: "212 notes, 61 ideas", apps: "12 in use" },
    ev: [
      ["calendar", "14 dates · Fern, Halo, Moss", "Three clients", "Place: Clients", 0],
      ["calendar", "“Halo deck” · today", "Something is due today", "Diary: Halo deck, today", 0],
      ["notes", "212 notes · 61 start with “idea”", "A lot of ideas", "Place: Ideas, 61 stickies", 1],
      ["apps", "Substack · every Friday", "You write a newsletter", "Place: Newsletter", 2],
      ["apps", "Figma, Canva · mornings", "Bursts of focus in the morning", "Only what needs you today", -1],
      ["calendar", "“Gym”, “Dentist”", "Life has dates too", "Place: Life", 3]],
    parts: [{ n: "Clients", s: .5, c: "pink", ais: 1, lv: 1, tools: ["Fg", "Cv"] }, { n: "Ideas", s: .25, c: "lime", ais: 0, lv: 1, tools: ["Nt"] }, { n: "Newsletter", s: .1, c: "sky", ais: 0, lv: 1, tools: ["Sb"] }, { n: "Life", s: .15, c: "amber", ais: 0, lv: 0, tools: [] }],
    when: [[8, 10, ["cal", "apps"]], [20, 22, ["notes"]], [15, 16, ["browser"]], [12, 14, ["cal"]]],
    day: [0, 0, 0, 0, 0, 0, 0, .2, .8, .9, .3, .1, .5, .2, .1, .6, .2, .1, .2, .4, .8, .7, .2, 0], quiet: [23, 7], thrown: [1, 11, 4, 2, 0],
    headline: "Your business is three clients, a newsletter and a lot of ideas.", checks: [["Show only what needs you today?", 0]],
    setup: ["3 places", "61 ideas become stickies", "Only what needs me today"], diary: [["Halo deck", "today"], ["Fern call", "Wed"], ["Newsletter", "Fri"]],
    digest: `here for: my business (said)
calendar: 14 dates, 3 clients (Fern, Halo, Moss); "Halo deck" due today
notes: 212 notes, 61 start with "idea"
apps: 12 in use (Figma, Canva, Substack)
sites: not read, Safari's switch is off
days: bursts, mornings and late evening
thrown away: 1 password or key, 11 money, 4 health, 2 private talk` },
  // the reading drawing's two people (mine/look/br1/reading.html): a designer whose rows open (screens 1-3, 5), and a student
  // on a nearly new Mac (screen 4)
  rio: { name: "Rio", look: "light calm", typed: "restaurant websites for clients, my portfolio, a typography course", aims: [["Client sites", 1, 1], ["Portfolio", 1, 1]],
    steer: "Because you said <b>Client sites</b> and <b>Portfolio</b>, Sol reads your AI sessions and code first.",
    mac: [["claudecode", 1], ["files", 1], ["calendar", 1], ["codex", 1], ["apps", 1], ["code", 1], ["notes", 1]],
    ais: [["claude", "on", "Found on this Mac, from Claude Code"], ["chatgpt", "on", "Found on this Mac, from Codex"], ["gemini", "off"]],
    conn: [["gdrive", "off"], ["notion", "off"]], granted: { calendar: true, "full-disk": false },
    rows: { "claude-sessions": "18 chats in 1 project", files: "31 invoices", "calendar-store": "4 weeks of dates", "codex-sessions": "2 short chats", apps: "38 in use", projects: "1 repository, 212 commits", notes: "64 notes" },
    ev: [
      ["claudecode", "folder bistro-site · 18 chats", "you build sites for restaurants", "Place: Client sites", 0],
      ["files", "folder Invoices · 31 files", "you invoice monthly, in euros", "Place: Invoices", 2],
      ["calendar", "4 weeks", "a typography class every Tuesday", "Place: Courses", 3],
      ["codex", "folder scratch · 2 chats", "two short tries, months ago", "", -1],
      ["apps", "38", "Figma and Affinity most days", "Your tools", -1],
      ["code", "portfolio-2026 · 212 commits", "a portfolio you update after each project", "Place: Portfolio", 1],
      ["notes", "64", "lists of fonts and colour ideas", "joins Portfolio", 1]],
    open: {
      0: { looked: ["the folder's name and its 6 subfolders", "the 18 chats' titles and dates", "its rules file (CLAUDE.md): 41 lines", "2 skills: deploy, menu-table"],
        kept: [{ line: "You build sites for restaurants", from: "from 12 of the chat titles", k: "fact:client-sites:restaurants" },
          { line: "Client sites holds 6 sites, one per client", from: "from the subfolders", k: "fact:client-sites:six" },
          { line: "Previews go out before a client sees a page", from: "from the rules file", k: "fact:client-sites:previews" }],
        left: ["what was said in the chats: only their titles were read", "1 file that looked like a key: thrown away", "nothing changes in Claude Code"] },
      1: { looked: ["the folder's name and its 31 file names", "the files' dates"],
        kept: [{ line: "You invoice monthly, in euros", from: "from the file names and dates", k: "fact:invoices:monthly" }],
        left: ["what is inside the invoices: Sol does not open them", "nothing changes in Files"] },
      3: { looked: ["the 2 chats' titles and dates"], kept: [], left: ["what was said in the chats", "nothing changes in Codex"] } },
    parts: [{ n: "Client sites", s: .5, c: "coral", ais: 1, lv: 1, tools: ["Fg"] }, { n: "Portfolio", s: .2, c: "sky", ais: 1, lv: 1, tools: ["Af"] }, { n: "Invoices", s: .15, c: "mint", ais: 0, lv: 0, tools: [] }, { n: "Courses", s: .15, c: "lilac", ais: 0, lv: 0, tools: [] }],
    when: [[8, 12, ["ai", "apps"]], [19, 22, ["code", "notes"]], [9, 10, ["files"]], [18, 20, ["cal"]]],
    day: [0, 0, 0, 0, 0, 0, 0, .3, .8, .9, .9, .6, .3, .3, .4, .4, .3, .3, .5, .8, .9, .7, .3, 0], quiet: [23, 7], thrown: [1, 4, 0, 1, 0],
    headline: "You make restaurant websites, keep a portfolio and take a typography class.",
    checks: [["Are Portfolio and the typography course one place, or two?", 1]],
    setup: ["4 places", "Previews before a client sees a page", "Figma and Affinity in your tools"], diary: [["Typography", "every Tue"]],
    digest: `here for: client sites, portfolio (said)
AI chats: 18 in bistro-site; 2 short tries in scratch (months ago)
code: portfolio-2026, 212 commits
files: Invoices, 31 files, monthly, euros
apps used weekly: Figma, Affinity
dates next 30 days: Typography (Tuesdays)
notes: 64, lists of fonts and colour ideas
thrown away: 1 password or key, 4 money, 1 private talk` },
  sam: { name: "Sam", look: "light calm", typed: "", aims: [["School", 1, 1]], steer: "",
    mac: [["apps", 1], ["calendar", 1]], ais: [["claude", "off"], ["chatgpt", "off"], ["gemini", "off"]], conn: [], granted: { calendar: true },
    rows: { apps: "9 in use", "calendar-store": "2 weeks of dates" },
    ev: [
      ["apps", "9", "Pages and Keynote, the ones you open most", "Your tools", -1],
      ["calendar", "2 weeks", "lectures on weekday mornings", "Your day", -1]],
    parts: [], when: [], day: [0, 0, 0, 0, 0, 0, 0, 0, .6, .9, .9, .7, .2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], quiet: [23, 7], thrown: [0, 0, 0, 0, 0],
    headline: "A new Mac: Sol starts light.", checks: [], setup: ["0 places"], diary: [],
    digest: `here for: school (said)
apps: 9 in use (Pages, Keynote)
calendar: lectures on weekday mornings
thrown away: nothing` },
};

const slug = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const hoursIn = (a: number | null, b: number | null) => Array.from({ length: 24 }, (_, h) => (a == null || b == null ? 0 : (h - a + 24) % 24 < (b - a + 24) % 24 ? 1 : 0));
const stripB = (s: string) => s.replace(/<\/?b>/g, "");

/** a panel row's more (the dev page only; the engine sends its own), from the row's own words: the kind by its source,
 *  the name before " · ", the noticed line as what Sol thinks it is, the set-up line as what it adds */
function moreOf(s: Source, e: Raw["ev"][number], ko: boolean): More | undefined {
  const [head, tail = ""] = e[1].split(" · "), n = Number(/\d+/.exec(tail || e[1])?.[0] ?? 0) || undefined;
  const bare = (x: string) => x.replace(/^(folder|폴더|프로젝트|skill|MCP) /, "").replace(/[“”"]/g, "");
  const adds = e[3] || (ko ? "Sol이 보는 나의 요약에 들어가요" : "In Sol's summary of you"), is = e[2], last = "2026-11-20T21:00:00.000Z";
  if (s === "claude-sessions" || s === "codex-sessions" || (s === "apps" && /^프로젝트 /.test(head))) {
    if (/^skill /.test(head)) return { kind: "skill", name: bare(head), n, by: s === "codex-sessions" ? "Codex" : "Claude Code", is, adds };
    if (/^MCP /.test(head)) return { kind: "tool", name: bare(head), n, by: "Claude Code", is, adds };
    if (!/^(folder|프로젝트) /.test(head)) return undefined;
    return { kind: "folder", name: bare(head), is, where: "Projects", kinds: /Python/.test(e[1]) ? ["Python"] : ["TypeScript", "Markdown"], ...(n && /session|대화/.test(tail) ? { sessions: s === "codex-sessions" ? { codex: n } : { claude: n } } : {}), last, adds };
  }
  if (s === "files") return /^(folder|폴더) /.test(head) ? { kind: "folder", name: bare(head), is, where: "Documents", last, adds } : { kind: "file", name: head, is, where: "Documents", last, adds };
  if (s === "browser") {
    const kinds = (e[1].split(":")[1] ?? "").replace(/mostly/, "").split(",").map((x) => x.trim()).filter(Boolean);
    return { kind: "sites", name: e[0] === "safari" ? "Safari" : "Chrome", n, groups: kinds.map((w, i) => ({ what: w, n: 20 - i * 6, sites: [] })), adds };
  }
  if (s === "calendar-store") return { kind: "date", name: bare(head), is, adds };
  if (s === "notes") return { kind: "notes", name: bare(head), n, is, last, adds };
  return { kind: "app", name: head, is, adds };
}

function build(key: string, d: Raw): Panel {
  const lang = d.ko ? "ko" : "en", li = d.ko ? 1 : 0, has = (s: string) => d.mac.some((m) => m[0] === s);
  const evSrc = (s: string): Source => (s === "claude" ? "apps" : SM[s]);
  // suggestions: the mapped rows ticked, in the order the read first meets them
  const ticked = [...new Set(d.mac.filter((m) => m[1] && SM[m[0]]).map((m) => SM[m[0]]))];
  const seen = [...new Set(d.ev.map((e) => evSrc(e[0])))].filter((s) => ticked.includes(s));
  const order = [...seen, ...ticked.filter((s) => !seen.includes(s))];
  const firstAim = d.aims.find((a) => a[1]);
  const suggest: Suggest = { sources: ticked, order, because: d.steer && firstAim ? { aim: firstAim[0], line: stripB(d.steer) } : null };

  const claudeOn = has("claudecode") || d.ais.some((a) => a[0] === "claude" && a[1] === "on");
  const codexOn = has("codex") || d.ais.some((a) => a[0] === "chatgpt" && a[1] === "on" && /Codex/.test(a[2] ?? ""));
  const keyed = (id: string) => (d.key ?? "").toLowerCase() === id;
  const accounts: Accounts = {
    ais: [{ id: "claude-code", name: "Claude Code", via: "sign-in", present: claudeOn, signedIn: claudeOn }, { id: "codex", name: "Codex", via: "sign-in", present: codexOn, signedIn: codexOn },
      { id: "anthropic", name: "Claude (API)", via: "key", present: true, signedIn: keyed("anthropic") }, { id: "openai", name: "ChatGPT (OpenAI)", via: "key", present: true, signedIn: keyed("openai") }, { id: "google", name: "Gemini (Google)", via: "key", present: true, signedIn: keyed("google") }],
    connectors: d.conn.map((c) => ({ name: CONNS[c[0]], kind: "account", via: "claude-account", connected: c[1] === "on" || c[1] === "new" })),
  };
  const P = (id: string, name: string, why: string, pane: string): Perm => ({ id, name, why, link: `x-apple.systempreferences:com.apple.preference.security?Privacy_${pane}`, granted: id in d.granted ? d.granted[id] : null });
  const perms: Perm[] = [
    P("full-disk", "Full Disk Access", "Safari keeps the sites you visit behind this switch; Sol reads which sites, how often, on this Mac only.", "AllFiles"),
    P("accessibility", "Accessibility", "Lets Sol point at things on screen and see which app you are in, so it can work beside you.", "Accessibility"),
    P("calendar", "Calendar", "Lets Sol read your dates for the next 30 days, so it knows what is coming.", "Calendars"),
    P("automation", "Automation", "Lets Sol ask other apps, such as Notes, for their titles. Your Mac asks once for each app.", "Automation"),
    P("screen", "Screen Recording", "Only needed if you want Sol to see your screen while you work. Sol does not need it to look around.", "ScreenCapture")];

  // sources ticked but without permission are skipped, and the read goes on
  const skipped = (s: Source) => (s === "calendar-store" && d.granted.calendar === false) || (s === "browser" && has("safari") && d.granted["full-disk"] === false);
  const read = ticked.filter((s) => !skipped(s));
  const parts: Part[] = d.parts.map((p, i) => ({ id: slug(p.n), name: p.n, share: p.s, tools: p.tools, ais: p.ais, level: LEVEL[p.lv], faded: !!p.faded, new: false, at: hoursIn(d.when[i][0], d.when[i][1]), from: d.when[i][2].map((w) => WS[w]), facts: 0 }));
  const aims: Aim[] = d.aims.map((a) => ({ w: a[0], said: !!a[1], ok: a[2] ? true : null, at: AT }));
  const thrown = Object.fromEntries(BINS.map((b, i) => [b, d.thrown[i]])) as Thrown;
  const setup: Setup[] = [
    ...parts.map((p): Setup => ({ kind: "place", id: p.id, name: p.name, label: `${d.ko ? "공간" : "Place"}: ${p.name}` })),
    ...d.parts.map((p, i): Setup => ({ kind: "level", place: parts[i].id, level: LEVEL[p.lv], label: `${p.n}: ${LV[lang][p.lv]}` })),
    ...d.setup.slice(1).map((t): Setup => ({ kind: "look", knob: "look", scope: "you", take: t, reason: d.only ? "from what you said" : "from the read", count: 1, label: t })),
    ...d.diary.map((r): Setup => ({ kind: "date", words: `${r[0]} ${r[1]}`, label: `${r[0]}: ${r[1]}` }))];
  const you: You = {
    who: d.name, said: d.typed || null, headline: d.headline, aims, seenAims: aims.filter((a) => !a.said).map((a) => a.w), parts,
    day: { hours: d.day ?? Array(24).fill(0), quiet: d.quiet ?? null }, sieve: { thrown, keep: [] },
    read: { at: d.only ? null : "2026-11-21T17:00:09.000Z", sources: d.only ? [] : read, by: d.only ? "none" : "device", made: d.only ? null : "device", digest: d.digest },
    questions: d.checks.map((c) => ({ q: c[0], at: c[1], kind: "check" as const, k: c[1] == null ? `aim:${slug(c[0])}` : `done:${parts[c[1]]?.id}` })), setup, again: { weekly: !d.only, last: null, due: false } };

  // the reading stream
  const evs: Ev[] = [];
  if (!d.only) {
    const lb = (s: Source) => LB[s][li], st = (a: string, b: string) => (d.ko ? b : a);
    evs.push({ kind: "order", order, because: suggest.because });
    for (const s of order) evs.push({ kind: "source", source: s, state: "waiting", line: `${lb(s)}: ${st("waiting", "대기")}` });
    const big = d.parts.reduce((m, p, i) => (p.s > d.parts[m].s ? i : m), 0), placed = new Map<number, number>();
    const bins = BINS.filter((_, i) => d.thrown[i] > 0), home = (b: Bin): Source => BIN_AT[b].find((s) => read.includes(s)) ?? read[0];
    for (const s of order) {
      if (skipped(s)) { evs.push({ kind: "source", source: s, state: "skipped", line: d.skip ?? `${lb(s)}: skipped, no permission` }); continue; }
      evs.push({ kind: "source", source: s, state: "reading", line: `${lb(s)}: ${st("reading", "읽는 중")}` });
      for (const e of d.ev.filter((x) => evSrc(x[0]) === s)) {
        const more = moreOf(s, e, !!d.ko), open = d.open?.[d.ev.indexOf(e)];
        evs.push({ kind: "item", source: s, item: e[1], notice: e[2], ...(e[3] ? { setup: e[3] } : {}), ...(more ? { more } : {}), ...(open ? { open } : {}) });
        if (e[4] >= 0) {
          const k = placed.get(e[4]) ?? 0, p = d.parts[e[4]]; placed.set(e[4], k + 1);
          evs.push({ kind: "place", id: slug(p.n), name: p.n, colour: COL[p.c], share: e[4] === big && k === 0 ? Math.round(p.s * 60) / 100 : p.s });
        }
      }
      for (const b of bins.filter((x) => home(x) === s)) { const n = thrown[b]; evs.push({ kind: "thrown", source: s, item: d.ko ? `${n}개 버림: ${BIN_KO[b]}` : `${n} thrown away: ${BIN_EN[b]}`, bin: b, n }); }
      evs.push({ kind: "source", source: s, state: "done", line: `${lb(s)}: ${d.rows[s] ?? st("nothing found", "찾은 것 없음")}` });
    }
    evs.push({ kind: "making", line: st("Putting it together, on this Mac…", "이 Mac에서 정리하는 중…") }, { kind: "making", line: st("Naming your places…", "공간 이름 짓는 중…") }, { kind: "done", you });
    // times: the waiting rows come at once, the rest spread to about 7.5 s with an uneven beat
    const w = [.8, 1.15, .95, 1.3, .8, 1, 1.2], nw = 1 + order.length, rest = evs.length - nw, span = Math.min(7500, 700 * rest);
    const wsum = Array.from({ length: rest }, (_, i) => w[i % 7]).reduce((a, b) => a + b, 0);
    let acc = 0, prev = 9;
    evs.forEach((e, i) => {
      if (i < nw) { prev = e.at = 9 + i * 70; return; }
      acc += w[(i - nw) % 7]; prev = e.at = Math.max(prev + 1, Math.round(9 + (nw - 1) * 70 + 250 + (acc / wsum) * (span - 250)));
    });
  }
  return { key, name: d.name, lang, look: d.look, typed: d.typed, ...(d.only ? { only: true } : {}), suggest, accounts, perms, reading: evs, you };
}

export const PANEL: Record<string, Panel> = Object.fromEntries(Object.entries(RAW).map(([k, d]) => [k, build(k, d)]));
export const PANEL_KEYS = ["dev", "denise", "minji", "tomas", "lucy", "rio", "sam"] as const;
