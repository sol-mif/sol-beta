# Seams (#1320)

Four things Sol leans on someone else for go through one small interface each, so what is behind it can be swapped
later (another sign-in, another store, another place for chat, another carrier for a wake) by changing one file, with
nothing else in Sol changed and nobody setting anything up again.

| Seam | File | Asked as | Behind it today |
|---|---|---|---|
| Sign-in and Sol ID | `identity.ts` | `identity()` | Google sign-in on Sol's cloud (`team/cloud.ts`), GitHub through gh (`team/identity.ts`). `SOL_IDENTITY=supabase` (#1351): Supabase's sign-in (Google, GitHub linked), its user id the Sol ID; the cloud only checks its token and gives its own ticket (`team/supabase.ts`, `cloud/src/supabase.ts`) |
| Data storage | `store.ts` | `dataStore()` | the beta's usage, one POST a day to the hub's `/relay/track` or `SOL_TRACK_URL` (`track.ts`), and the same POST to Sol's Supabase project (`sol/supabase/functions/track`, #1350); `SOL_DATA=hub` or `supabase` for one alone |
| Group chat | `chat.ts` | `groupChat()` | a GitHub group: its code repository (`discussions.ts`, #1347): `general` in one Discussion, `#N` as comments on issue or PR N, read every minute. A cloud group, a repository with Discussions off, or `SOL_CHAT=relay`: the team relay's `talk` and `talk.history`, older lines from the cloud's page route (`team/talk.ts`) |
| Wake | `wake.ts` | `wakeUp()` | the team relay's `ping`, kept by the hub for whoever is away (`team/pings.ts` acts on it). `SOL_WAKE_CARRIER=signal` (#1377): a signal with no words in it, who → whom, a kind and a link, to a hub that carries them; the receiver reads the link with gh, makes the card, and a comment for its agent starts the narrow session (`team/signal.ts`, PROTOCOL round 115) |

Each file has the interface, today's implementation, the getter, and `use…()` to put another one behind it (the tests,
and later another backend). The seams only carry; what Sol keeps, counts, shows or decides stays where it was.

Not through a seam yet, on purpose: the command-line runners (`team/broke.ts`, `team/on.ts`, `team/night.ts`) open
their own relay client, and `team/integrate.ts`, `team/wake.ts` and `team/reach.ts` are handed a relay send by their
callers. They move when what is behind the wake seam changes.
