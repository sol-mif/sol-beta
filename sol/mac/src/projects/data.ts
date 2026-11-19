// Projects (mine, 2026-11-12): Sol's own work on that day, written down for the design page (projects.html). A snapshot
// by hand, not read from the engine: the strands are his asks, never the tracker's labels. Each thing sits at a depth of
// the same chain: 0 at hand (what needs him) · 1 the kept session (what it holds of each ask) · 2 the workers (sessions,
// machines, people) · 3 the ground (where the work lands).
export type Time = "earlier" | "now" | "next";
export type Lack = "eye" | "call" | "words";
export type St = "going" | "done" | "waits" | "failing";
export type Thing = {
  id: string; s: string; d: 0 | 1 | 2 | 3; row?: number; name: string; kind: string; line: string;
  ring?: number; st?: St; lack?: Lack; acts?: readonly (readonly [string, string])[]; when?: Time;
  alt?: Partial<Record<Time, { line?: string; ring?: number; st?: St }>>;
};
export type Strand = { id: string; name: string; lane: number; keys: readonly string[]; asked: string; told: Record<Time, string>; made: readonly (readonly [string, string])[] };

export const LACK: Record<Lack, string> = { eye: "needs your eye", call: "your call", words: "needs your words" };

export const STRANDS: Strand[] = [
  { id: "home", name: "Home's first run", lane: -0.8, keys: ["home", "tour", "onboarding", "first run"],
    asked: "a first run that tells back what I said and shows one thing once",
    told: { earlier: "Pass four of the tour was read by you and sent back: too much at once.", now: "Pass five is built on two machines and is in your Sol. It waits for you to walk it once.", next: "If it feels right, it goes in tonight's hand-in at 8; if not, your words start pass six." },
    made: [["tsx", "FolderHome"], ["html", "tour"], ["md", "1071"]] },
  { id: "stage", name: "the stage sets itself", lane: -0.4, keys: ["stage", "artifact", "block", "chat"],
    asked: "the stage is constantly being set for me",
    told: { earlier: "The engine half was built on the Legion overnight, behind a switch.", now: "It is a draft, number 1070. The checks run on the NucBox. Nothing merges before you try one ask.", next: "After your try: the 9pm review reads it, the 9am release carries it." },
    made: [["ts", "stage.set"], ["md", "1070"]] },
  { id: "proj", name: "projects, this tab", lane: 0, keys: ["project", "world", "one session", "space", "observe"],
    asked: "a space where I both watch the work and touch it",
    told: { earlier: "The kept session was renewed once at 03:42 and remembered everything asked of it.", now: "This page is the design: the same chain at four depths, every thing in it a real control.", next: "Your read of it decides what is built into the tab first." },
    made: [["html", "projects"], ["tsx", "page"]] },
  { id: "cowork", name: "Cowork from nothing", lane: 0.4, keys: ["cowork", "team", "frank", "isaac"],
    asked: "people with their agent, one setting, give",
    told: { earlier: "One playable page with three concepts went up as a draft.", now: "It waits on Frank's read. Nothing here needs you.", next: "When Frank answers, his words come to you as one piece." },
    made: [["html", "cowork"], ["md", "725"]] },
  { id: "loops", name: "what runs on its own", lane: 0.8, keys: ["loop", "night", "timer", "watch", "background"],
    asked: "more work that runs without me starting it",
    told: { earlier: "Fourteen loops were counted; all of them check quality or keep the machines.", now: "Two of them fail and nobody hears: the night job and the merge of your Sol.", next: "With a watchman, a failing loop comes to you as one line the same morning." },
    made: [["md", "systems"]] },
];

export const THINGS: Thing[] = [
  // at hand
  { id: "home.try", s: "home", d: 0, when: "now", lack: "eye", name: "Walk the tour once", kind: "your Sol, Home", line: "It tells back what you said, then shows one thing, once.", acts: [["it feels right", "the tour feels right"], ["not it", "the tour is not it"]] },
  { id: "stage.try", s: "stage", d: 0, when: "now", lack: "eye", name: "Type one ask, watch the stage", kind: "behind a switch", line: "The stage should set itself while you read the answer.", acts: [["it sets itself", "the stage sets itself"], ["not it", "the stage is not it"]] },
  { id: "loops.call", s: "loops", d: 0, when: "now", lack: "call", name: "Two loops fail in silence", kind: "the night job, the merge", line: "A watchman on the NucBox would tell you the same morning.", acts: [["stand it up", "stand up the watchman"], ["leave it", "leave the loops as they are"]] },
  { id: "e.renew", s: "proj", d: 0, when: "earlier", name: "Renew the kept session", kind: "you said yes, 03:42", line: "It started fresh from its own handover: ten things carried, three dropped.", acts: [["undo", "undo the renewal"]] },
  { id: "e.read", s: "proj", d: 0, when: "earlier", name: "Read my transcripts here", kind: "you said yes", line: "Counts and titles only, kept on this machine.", acts: [["undo", "stop reading my transcripts"]] },
  { id: "n.hand", s: "stage", d: 0, when: "next", name: "Tonight at 8: the hand-in", kind: "set to come", line: "It takes the stage and the tour, if you tried them.", acts: [["hold it", "hold tonight's hand-in"]] },
  { id: "n.rel", s: "home", d: 0, when: "next", name: "Tomorrow at 9: the release", kind: "set to come", line: "What passed the 9pm review reaches both engines.", acts: [["hold it", "hold tomorrow's release"]] },
  // the kept session: what it holds of each ask
  { id: "home.r", s: "home", d: 1, name: "Home's first run", kind: "I hold", line: "Pass five is built. Your walk decides: done, or pass six.", alt: { earlier: { line: "Pass four came back: too much at once." }, next: { line: "Next: the hand-in, or pass six from your words." } } },
  { id: "stage.r", s: "stage", d: 1, name: "the stage sets itself", kind: "I hold", line: "A draft behind a switch. I will not merge before your try.", alt: { next: { line: "Next: review at 9pm, release at 9am." } } },
  { id: "proj.r", s: "proj", d: 1, name: "projects, this tab", kind: "I hold", line: "The design is in front of you. I wait for your read.", alt: { earlier: { line: "Renewed once at 03:42; nothing asked was lost." } } },
  { id: "cowork.r", s: "cowork", d: 1, name: "Cowork from nothing", kind: "I hold", line: "With Frank. I bring you his answer when it comes.", st: "waits" },
  { id: "loops.r", s: "loops", d: 1, name: "what runs on its own", kind: "I hold", line: "Fourteen loops, two failing. I can stand up a watchman.", st: "failing" },
  // the workers
  { id: "w.t5l", s: "home", d: 2, row: 0, name: "tour, pass five", kind: "a builder on the Legion", line: "Built the tell-back and the tiles. Finished.", ring: 1, st: "done", alt: { earlier: { ring: 0.4, st: "going", line: "Building the tell-back." } } },
  { id: "w.t5n", s: "home", d: 2, row: 1, name: "show me once", kind: "a builder on the NucBox", line: "Built the one showing. Finished.", ring: 1, st: "done", alt: { earlier: { ring: 0.6, st: "going", line: "Building the one showing." } } },
  { id: "w.app", s: "home", d: 2, row: 2, name: "your Sol, rebuilt", kind: "on this Mac", line: "Rebuilt with pass five in it.", ring: 1, st: "done", alt: { earlier: { ring: 0, st: "waits", line: "Waits for the two builders." } } },
  { id: "w.stg", s: "stage", d: 2, row: 0, name: "the engine half", kind: "a builder on the Legion", line: "Built last night. Finished.", ring: 1, st: "done" },
  { id: "w.chk", s: "stage", d: 2, row: 1, name: "the checks", kind: "on the NucBox", line: "Running now.", ring: 0.7, st: "going", alt: { next: { ring: 1, st: "done", line: "Passed." } } },
  { id: "w.this", s: "proj", d: 2, row: 0, name: "this talk", kind: "a session on this Mac", line: "Drawing the page you are looking at.", ring: 0.5, st: "going" },
  { id: "w.frank", s: "cowork", d: 2, row: 0, name: "Frank's read", kind: "a person", line: "Has the page since Sunday. Not answered.", ring: 0, st: "waits" },
  { id: "w.loops", s: "loops", d: 2, row: 0, name: "twelve loops", kind: "on the NucBox", line: "Running as set.", ring: 1, st: "done" },
  { id: "w.fail", s: "loops", d: 2, row: 1, name: "two loops", kind: "on the NucBox", line: "The night job and the merge of your Sol stop with an error each run.", ring: 0.15, st: "failing" },
  // the ground: where it lands
  { id: "g.home", s: "home", d: 3, name: "draft 1071", kind: "lands here", line: "The tour's change, waiting for your press to merge." },
  { id: "g.stage", s: "stage", d: 3, name: "draft 1070", kind: "lands here", line: "The stage's change, waiting for your try." },
  { id: "g.proj", s: "proj", d: 3, name: "your Sol", kind: "lands here", line: "Kept in your own Sol; not pushed to the team." },
  { id: "g.cowork", s: "cowork", d: 3, name: "draft 725", kind: "lands here", line: "The Cowork page, with Frank." },
  { id: "g.loops", s: "loops", d: 3, name: "the NucBox's timers", kind: "lands here", line: "Hand-in at 8, review at 9, release at 9." },
];

// The whole: every way he observes, paired with how he touches it and which of his inputs it carries.
export const PAIRS: readonly { how: "words" | "picture"; see: string; tells: string; touch: string; feeds: string }[] = [
  { how: "words", see: "one line under the pointer", tells: "what this thing is doing, in a sentence the session wrote", touch: "press: travel to it", feeds: "navigation" },
  { how: "words", see: "your ask, told back", tells: "how the session read what you said, before anything is built", touch: "go · not that, with your words", feeds: "tacit information" },
  { how: "words", see: "the read of the whole", tells: "every strand as one short paragraph, no step, no command", touch: "press a paragraph: it opens in the space", feeds: "navigation" },
  { how: "words", see: "your own note on a thing", tells: "what you told it, and that it arrived", touch: "tell again · take it back", feeds: "tacit information" },
  { how: "words", see: "earlier", tells: "what you decided and what happened on it", touch: "undo", feeds: "meta" },
  { how: "picture", see: "distance", tells: "how close a thing is to needing you: at hand, the session, the workers, the ground", touch: "wheel or press: move through it", feeds: "navigation" },
  { how: "picture", see: "a strand", tells: "one ask's path: through the session, out to the workers, back to you", touch: "how free it runs · pause · go on", feeds: "meta" },
  { how: "picture", see: "the jelly", tells: "the kept session: resting, working, asking", touch: "say anything; it finds the strand or starts one", feeds: "free navigation" },
  { how: "picture", see: "a ring", tells: "how far a worker has come; red only when it fails", touch: "tell it · stop it", feeds: "tacit, meta" },
  { how: "picture", see: "a pearl moving", tells: "your word going down a strand, a result coming back up", touch: "watch; it ends on the thing it changed", feeds: "proof it was heard" },
  { how: "picture", see: "the thing itself", tells: "the page, the still, the two states: never its file or its log", touch: "it feels right · not it", feeds: "taste" },
  { how: "picture", see: "time", tells: "the space as it was this morning, and what is set to come", touch: "undo earlier · hold what comes", feeds: "meta" },
];
