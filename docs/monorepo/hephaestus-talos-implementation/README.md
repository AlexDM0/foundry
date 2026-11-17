# Hephaestus, Talos and Gaia: implementation plan

This folder is the implementation plan of the design in [`../hephaestus-talos.md`](../hephaestus-talos.md). The design
says what the system becomes and why. The files here say how to get there: for each stage, the work packages in order,
the files each one creates, changes and deletes, the specs it writes, and the command that shows it is done.

Statements about today's code were taken from the repository at `3e6cb660`.

## How to run it

An orchestrating session carries out [`orchestrator.md`](orchestrator.md): the one plan with the whole schedule, the
owner gates, and how each work package is handed out, checked and landed. A single stage can also be run by hand:
one session carries out one stage file. Give the session this instruction, with the stage's file name filled in:

> Carry out `docs/monorepo/hephaestus-talos-implementation/<stage file>`. Read `docs/monorepo/hephaestus-talos.md`
> and that stage file in full first. Do the work packages in their order, each as its own commit, and stop at the
> first one whose "Done when" does not hold.

Rules that hold for every stage:

- **Order.** Stages run in the order of the table below. A stage starts only when the stage before it is finished and
  its "Needs the owner" items are answered or their recommended defaults accepted.
- **A work package is one commit** that leaves the repository green. Packages that a stage file marks as parallel
  touch no file in common and may run in separate worktrees under `.claude/worktrees/`; every other package runs
  alone.
- **Done means the command passed.** Each package ends on the command its "Done when" names, run in the folder it
  names. Specs run inside a workspace folder; the root runs `bun install --frozen-lockfile` and then `bun run verify`,
  and never `bun test`.
- **Never the real home.** No package reads or writes `~/.forge-monitor` or `~/.gaia`, runs a forge verb in this
  checkout, talks to a running forge or starts a vendor session. End-to-end checks use a scratch forge and the fake
  agent, where the app's rules name one.
- **Names.** The Overseer keeps its name in code until stage 9. Talos is called Talos from its first line.
  `apps/forge/src/ComponentNames.spec.ts` refuses a retired name.
- **Nothing that exists has to be kept.** No compatibility with existing boards, stored names or installed surfaces;
  boards are set up anew after stage 9.
- **Sessions do this work, no forge does.** Neither tracker's reach applies, and one commit may span both apps and the
  packages. A new package is created only where a stage file names it.
- **Commits** are one plain subject line, with no attribution of any kind, and never skip the hooks.

## The stages

| Order | File | What it delivers | Work packages |
| --- | --- | --- | --- |
| 0 and 1 | [`stage-0-1-trace-and-base.md`](stage-0-1-trace-and-base.md) | The traces of recovery, the Airlock steps, the Overseer's memory-only state and the import graph; the recorded session that ends on a network outage; the owner's decisions; the closed monorepo migration | 8 |
| 2 | [`stage-2-talos.md`](stage-2-talos.md) | One Talos per board in place of the Watcher fleet: protocol version and handshake, frames, the persisted child record, the clean quit, the supervision lease, every child under Talos, the gate's time bound, the ending on a network outage | 18 |
| 3 | [`stage-3-presence-recovery.md`](stage-3-presence-recovery.md) | The heartbeat and presence record, the classification of a start, reconcile, resume on instruction, the crash log and the forge that stays off, the CLI path to see a crash and resume | 14 |
| 4 | [`stage-4-packages.md`](stage-4-packages.md) | `packages/tracker-model` and `packages/board-readings`, and the board documents and command kinds that join the contract | 9 |
| 5 | [`stage-5-store-port.md`](stage-5-store-port.md) | The store port with its command face, its transaction face and its read side, the local-files adapter, the contract spec and the guard on record paths | 12 |
| 6 and 7 | [`stage-6-7-gaia-views.md`](stage-6-7-gaia-views.md) | The versioned reads in forge, Gaia's forge client and relay, the views moved one at a time into one design, the maximized forge as a route, and conversations with hosted agents | 25 |
| 8 and 9 | [`stage-8-9-shrink-and-rename.md`](stage-8-9-shrink-and-rename.md) | The Bridge, the sessions, the embed machinery and Flint's brain removed; the Assistant off by default; then the rename of the Overseer to Hephaestus in one commit | 17 |

Every stage file has the same sections: Goal, Depends on, Decisions this stage carries out, Today's code, Work
packages, Interfaces introduced, Traps, Verification of the whole stage, Out of scope, Needs the owner, Not
established. "Interfaces introduced" is the contract the later stages build on.

## Before stage 2 starts

Stage 0 is mostly the owner's. Three of its packages cannot be done by a session:

- **WP0.3:** the owner records a real session that ends on a network outage. No session may start a vendor session,
  and stage 2 holds its ending pattern against this recording.
- **WP0.5:** the owner answers the open items. Each stage file lists its own under "Needs the owner" with a
  recommended default; 77 in total, most of them small. [`owner-decisions.html`](owner-decisions.html) gathers them on
  one page, 71 after the six that only repeat the design's two open items, and gives the answers as JSON.
- **WP1.2:** the owner settles the base: the open branches, the uncommitted edits, and the live trackers, which stop
  before stage 2.

Two packages are too large to split without leaving the repository red, and run as long sessions: WP2.13, the switch
to Talos, and WP4.2, the move of the tracker model with its 438 importers in one commit. WP2.13 ends on
`bun run verify:integration`, which forge's rules allow only when a person asks for it.

## Where the code and the design disagree

Reading the code for this plan showed the design to be wrong or silent in the places below. WP0.1 brings the design
in line; until then the stage files are right where the two differ.

| Design | What the code shows | Stage file |
| --- | --- | --- |
| A record of a completed stop or Baton pass is missing | The log already holds it; what is missing is the heartbeat and a start that reads the record | 0 and 1, 3 |
| A stop on purpose interrupts agents, which resume by themselves today | A stop interrupts no agent today: Watchers are detached and reattached at the next start | 0 and 1, 3 |
| The Airlock steps are not traced | Traced: three steps are not redone after a stop | 0 and 1 |
| The tracker model is about 110 files imported by about 280 | 108 shipping files, 192 with specs, imported by 438 files | 4 |
| The move can go through re-export shims in batches | A re-export counts as a barrel, which a guard refuses; each move is one scripted commit | 4 |
| The contract gains the command kinds the views need | The Bridge sends 40 of the 76 kinds; 35 of them are new to the contract | 4, 6 and 7 |
| The store port has two faces | It needs a third part: reads that take no lock, as `status` and the pass do today | 5 |
| The CLI writes through commands | 15 CLI verbs change the board directly with no command kind | 5 |
| Hephaestus, which has the current code, starts the right Talos | With the pinned bundles gone, Talos starts from the program on disk, which may be at another protocol version after a pull | 2 |
| Talos's children outlive a restart of the Overseer | The Overseer's own gates are awaited by promises that die with it, so the next Overseer stops those children at start | 2 |
| Conversations with hosted agents need nothing new in the forge | The job stream and the picture routes are not in the compatibility registry | 6 and 7 |
| Gaia alerts on a crashed forge by watching presence | A forge that is down serves no API, so presence reaches Gaia through a registry key that stage 3 adds | 3, 6 and 7 |
| Flint the sprite moves with the views | Gaia's rule 12 says Gaia draws no Flint | 6 and 7 |
| Stage 8 is forge's alone, and stage 9 is one rename commit | Stage 8 changes Gaia too; stage 9's renamed command kinds and document keys are a major system version | 8 and 9 |
| `forge open` and `progress.html` need a new home | No home exists that names no client; the plan retires both | 8 and 9 |

## Not covered by any stage

Two pieces of the design have no stage, and no stage file plans them. Each needs the owner to place it:

- **The agent port's leaks** (design section 5): `ClaudeTranscripts.ts` inside the Overseer's services, the
  install-time hook entry, the `bash-domains` hook, and session confinement that rests on the vendor's own sandbox.
- **The end of hand-editing stored records** (design section 4): removing `Ticket.filePath` and `Epic.filePath`,
  rewording the installed text, and replacing the local rule that tickets are hand-edited between runs.

## Not checked

- The citations in the view packages WP6.10 to WP6.20 and in WP8.10 to WP8.12 were not rechecked line by line.
- The count of command kinds the Bridge sends comes from a scan of literals; a kind sent through a computed value is
  not counted. WP4.5 measures the list from the syntax tree.
- Nothing here was run: no stage has been started, and `bun run verify` was not run on `3e6cb660` for this plan.
