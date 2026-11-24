# Sol

One window for all your AI. Sol is a face on your own machine that talks to a local engine: your chats, your
work with coding agents, your browser, a desk for notes and cards, voice, and the tools you make, in one place
that is yours. The engine runs on your computer, your data stays in your folder, and Sol changes itself from the
inside when you ask it to.

The idea: today each AI lives in its own tab and knows nothing of the others. Sol is the one surface you sit
at, and the AIs are its hands. Over time it becomes the system you need, built by being talked to.

This is the version beta testers run: dev-20261124-1446. It is made from the development repository when a whole day's
release passes to beta, and holds only what runs. Nothing here is edited by hand; the next version replaces it.

## Install

**Mac**, one line in Terminal. It asks what to call you, puts Sol in `~/Sol`, and opens Sol.app:

```
curl -fsSL https://sol.matterfold.tech/install | sh
```

Or download `Sol-mac.zip` from the [latest release](https://github.com/sol-mif/sol-beta/releases/latest),
unzip it and open Sol. It is not signed with Apple yet: the first time, macOS says it cannot check it, and
System Settings → Privacy & Security has an **Open Anyway** button; click it once. Sol then asks the same
question and sets itself up.

**Linux**, and **Windows** inside Ubuntu under WSL (`wsl --install` once in PowerShell): the same line; there is
no app, the face opens in your browser at http://localhost:1420.

Both offer a sign-in to Claude (a Claude Pro or Max plan). ChatGPT (Plus or Pro, through Codex) works too: a
chat starts on Codex, which signs you in the first time you talk to it, and a coding session in Work runs on
Claude unless you pick GPT. Rooms you share with others (Cowork) meet on Sol's cloud, signed in with your Google
account; what only the people who build Sol use is not in a beta Sol.

## Make it yours

Sol changes itself when you ask it to. To keep those changes yours across new versions, give them a branch once:

```
git switch -c <you>/mine && bash sol/mine/setup
```

Every commit there gets `mine: ` in front. The harness comes along (`sol/harness/guard`, wired by
`.claude/settings.json`): it refuses, before it runs, what a session in your Sol should never do.

## Keep it current

A new version installs itself. Sol looks for one every ten minutes, builds it beside the one running, and moves
to it at a quiet moment, never in the middle of a reply; your own changes go on top. If the new engine does not
start, Sol goes back to the version before. To hold new versions for a while, set **updates** to paused in Settings
(the engine drawer). When Sol cannot move by itself (paused, a reply under way, changes not kept yet, or your own
changes clash with the new version), its window says so with an **Update** button. On your own branch you can also
run `bash sol/mine/rebase` by hand: it puts your changes on top of the new version, and if one does not fit it names
the place and changes nothing. On a Mac, Sol's window comes with
the app: a new look arrives when you download the newest `Sol-mac.zip` from the
[latest release](https://github.com/sol-mif/sol-beta/releases/latest); the release notes say when it changed. When
something breaks, `sol/HELP.md`.
Something wrong, or a thought: say it in the beta testers' Discord, https://discord.gg/f2CHmYDDZV (in Sol, **Tell us…**
in the menu bar menu opens it), or open an issue on this repository.
