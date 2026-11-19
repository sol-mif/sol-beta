// What each jobs run is asked to do, in words (pure). The words go into the trigger's data as `task`, which run.ts
// puts in the turn's prompt; the file formats are in the folder's AGENTS.md, which Codex reads itself. Every task
// says the same three things: public pages only, signed out; nothing sent or submitted; no fact that is not in me.md
// or resume/ (a gap is marked [gap: …]).

const RULES = [
  "Web: only the sol browser tools, on public pages as a signed-out visitor sees them. browser_type is refused here: put search words in the address (?q=…). Never sign in, never make an account, never fill or submit a form, never press apply, connect or send.",
  "Facts about Marco only from me.md and resume/: a claim about him that is in neither is written as [gap: …]. Facts about the other person come from their file in people/ and the pages it names; use them plainly.",
  "The engine makes the card from the files you write: do not write a card file in made/.",
].join("\n");

export function peopleTask(a: { n: number; where: string; known: string[] }): string {
  return [
    `Find ${a.n} people ${a.where}. Read sf-trip/approach.md and me.md first.`,
    "Look on company team pages, personal sites, conference speaker pages and public profiles. For each person who truly fits, write people/<slug>.md in the format in AGENTS.md, state: found, with:",
    "- why: one true sentence tying them to Marco, from me.md (what they made or wrote and why it touches what he builds).",
    "- reach: an email ONLY when a public page shows it, written as `email x@y (shown on <that page's address>)`; never guess or build an address. Else a LinkedIn address, or a mutual if a page shows one. Else `none found`.",
    "- one touch: `<today> found on <the page's address>`.",
    a.known.length ? `Already in people/ (skip them): ${a.known.join(", ")}.` : "",
    "Fewer than asked is fine; never pad the list with people who do not fit.",
    RULES,
  ].filter(Boolean).join("\n");
}

export function draftTask(a: { person: string; variant: string; kind: "first" | "follow-up" | "thanks"; file: string; note?: string }): string {
  const what = a.kind === "first" ? "a first message" : a.kind === "follow-up" ? "one short follow-up to the first message (in outreach/sent/), five days on with no reply; no guilt, one line of new value, the same ask" : "a thank-you after the meeting, within a day; name one thing they said (from the touches), and the next step";
  return [
    `Write ${what} to the person in people/${a.person}.md, from the recipe outreach/variants/${a.variant}.md (its opener, ask, length, channel and "His voice").`,
    `Write it to ${a.file}: first line \`# To <name> · ${a.variant} · <channel>\`, then the message only (a subject line first if it is an email: \`Subject: …\`). No notes after it.`,
    a.note ?? "",
    "He sends it himself from his own mail or LinkedIn. Never send it.",
    RULES,
  ].filter(Boolean).join("\n");
}

export function planTask(): string {
  return [
    "sf-trip/plan.md has a row for each person who replied or met. Fill each cell that is `-` in \"where\" and \"what to ask\": a place near them in SF that fits a 15-minute coffee, and two or three questions from their file and me.md (what he wants to learn from them, not a pitch).",
    "Keep every row, day and filled cell as it is, and keep the table's shape. Never pick Thanksgiving, Thu Nov 26.",
    RULES,
  ].join("\n");
}

export function lessonTask(a: { file: string; numbers: string[]; edits: string[]; replies: string[] }): string {
  return [
    `Write ${a.file}: this week's lesson, one page, no pep talk. Four parts:`,
    "## The numbers: the A/B lines below, in plain words.",
    "## Your edits: the three edits Marco made most often to the drafts (from the edits below). Then change the \"His voice\" notes of the variants in outreach/variants/ so the next drafts already sound like him, and say in one line per variant what you changed.",
    "## The replies: what the replies had in common (people/ files in replied, met or follow-up, and their touches).",
    "## Practise: one thing to practise this week, one line starting `practise: `.",
    "Numbers:", ...a.numbers.map((l) => `- ${l}`),
    a.edits.length ? "Edits (agent's draft → what he sent):" : "Edits: none this week.", ...a.edits.map((l) => `- ${l}`),
    a.replies.length ? "Replied or met:" : "Replies: none yet.", ...a.replies.map((l) => `- ${l}`),
    "If the numbers are too small to say anything, say that plainly.",
  ].join("\n");
}

export function variantTask(a: { winner: string; loser: string; why: string }): string {
  return [
    `The A/B test has a winner: ${a.why}. ${a.loser} is retired.`,
    `Write one new variant to try against ${a.winner}: copy outreach/variants/${a.winner}.md to outreach/variants/<new-name>.md, change exactly ONE thing (the opener, the ask, the length or the channel), set \`- status: proposed\`, \`- changes: <the one thing> against ${a.winner}\` and \`- since: <today>\`.`,
    "Pick the one thing from what the replies and his edits show. The name: plain words, like the others.",
  ].join("\n");
}

export function postingsTask(a: { n: number; known: string[]; resume: boolean }): string {
  return [
    `Find up to ${a.n} job postings that fit me.md (its targets: roles, places, when) on public careers pages and job boards.`,
    "For each one, make applications/<company>-<role>/ (lower case, words joined by -) with two files, in the formats in AGENTS.md:",
    "- posting.md: the head lines (company, role, link, seen: today, where, cover: yes|no as the posting asks, score: 0-10 for how well it fits, state: found), then the posting's text as the page shows it, and its form's questions under `## Questions` when the page shows them.",
    "- fit.md: where he is strong for it, where he is thin, said straight, with the score's reasons.",
    a.known.length ? `Already in applications/ (skip them): ${a.known.join(", ")}.` : "",
    a.resume ? "His résumé is in resume/." : "resume/ is empty: work from me.md alone and mark what a résumé would have to show as [gap: …].",
    RULES,
  ].filter(Boolean).join("\n");
}

export function applicationTask(a: { slug: string; cover: boolean; resume: boolean }): string {
  return [
    `Finish applications/${a.slug}/ for Marco to apply himself. Read its posting.md and fit.md, me.md${a.resume ? " and resume/" : ""}.`,
    "- answers.md: each question of the form (from posting.md's Questions; when none are shown, the usual ones: why this company, why this role, a project you are proud of), each drafted in his voice, short.",
    a.cover ? "- cover.md: a cover letter, because the posting asks for one. One page at most." : "- no cover.md: the posting does not ask for one.",
    "- fit.md: keep it true to what you now know.",
    RULES,
  ].join("\n");
}

export function resumeTask(a: { file: string; open: string[] }): string {
  return [
    `A new file in resume/: ${a.file}. Read it (a PDF: unpack its text as far as you can).`,
    "Put its facts into me.md under `## From the résumé` (replace that part if it is there): school, dates, roles, projects, skills, each one line. Change nothing else in me.md.",
    a.open.length ? `Then redo fit.md for each open application: ${a.open.map((s) => `applications/${s}/`).join(", ")}.` : "There are no open applications to redo.",
    "Write no fact that is not in the file.",
  ].join("\n");
}
