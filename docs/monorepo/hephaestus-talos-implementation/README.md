# Hephaestus, Talos and Gaia: implementation plan

This folder is the implementation plan of the design in [`../hephaestus-talos.md`](../hephaestus-talos.md). The design
says what the system becomes and why. The files here say how to get there: for each stage, the work packages in order,
the files each one creates, changes and deletes, the specs it writes, and the command that shows it is done.

[`owner-answers.md`](owner-answers.md) holds the owner's answers of 2026-11-18 and the approach they set: the ground
rules, the monorepo's shape, the answers about behaviour and the run's own calls. It is the source of the design's
decisions 35 to 52 and of every stage file; where a stage file disagrees with it, it is right.

Statements about today's code were checked against `b4174bd9`, the head of the integration branch, where every
shipping file reads as at `0a648b2b`; each stage file names the commit it read.

## How to run it

An orchestrating session carries out [`orchestrator.md`](orchestrator.md): the one plan with the whole schedule, the
owner gates, and how each work package is handed out, checked and landed. A single stage can also be run by hand:
one session carries out one stage file. Give the session this instruction, with the stage's file name filled in:

> Carry out `docs/monorepo/hephaestus-talos-implementation/<stage file>`. Read `docs/monorepo/hephaestus-talos.md`,
> `docs/monorepo/hephaestus-talos-implementation/owner-answers.md` and that stage file in full first. Do the work packages in their order, each as its own commit, and stop at the
> first one whose "Done when" does not hold.

Rules that hold for every stage:

- **Order.** Stages run in the order of the table below. A stage starts only when the stage before it is finished, with
  one exception the orchestrator's schedule holds: stage 6's WP6.27 runs in stage 8, right after WP8.9. A stage file's "Needs the
  owner" holds only acts the owner alone may do (the gates of the orchestrator); every question of behaviour is
  settled by `owner-answers.md`.
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
- **Nothing stays compatible.** No older board, stored format, verb, link form or client is read or kept; every
  in-flight ticket is dropped, and boards are set up anew after stage 9.
- **Sessions do this work, no forge does.** Neither tracker's reach applies, and one commit may span both apps and the
  packages. The run may change any file of the monorepo, the rule files included, with no approval gate.
- **Code stays in its app.** No package is created. Forge and Gaia share only `forge-contracts` and `system-versions`;
  the tracker model, the readings and the wording stay in `apps/forge`; `design-system`, `flint` and `brand` become
  libraries of Gaia's page in stage 8.
- **Commits** are one plain subject line, with no attribution of any kind, and never skip the hooks.

## The stages

| Order | File | What it delivers | Work packages |
| --- | --- | --- | --- |
| 0 and 1 | [`stage-0-1-trace-and-base.md`](stage-0-1-trace-and-base.md) | The traces of recovery, the Airlock steps, the Overseer's memory-only state and what the Bridge reaches in forge; recordings A and B of a session that ends on a network outage; a design checked to hold decisions 35 to 52; the closed monorepo migration; the in-flight tickets dropped and both trackers stopped | 8 |
| 2 | [`stage-2-talos.md`](stage-2-talos.md) | One Talos per board in place of the Watcher fleet: protocol version and handshake, frames, the persisted child record, the clean quit, the lease renewed only on progress, the merged-tree gate beside the pass, every child under Talos, the 15-minute bound of every install and gate line with no sleep counted, every line's run time recorded, the ending on a network outage; then every reach past the agent port closed (transcripts, variables, install, hooks, configuration paths, protocol knowledge, confinement, wording), held by a guard | 32 |
| 3 | [`stage-3-presence-recovery.md`](stage-3-presence-recovery.md) | The heartbeat and presence record, the classification of a start, reconcile, `resume` for a job, a ticket, everything or every outage ending, the crash log and the forge that stays off after a crash or a suspected one, the landing steps a stop leaves undone, the CLI path to see a crash and resume | 15 |
| 4 | [`stage-4-packages.md`](stage-4-packages.md) | The standing contract and the served facts: board documents and command kinds in `forge-contracts` with types of their own, forge's typed mappers, the board document at `/api/v1/board` with finished facts, every refusal as code, fields and sentence, the unfinished entities draft. No package is extracted | 9 |
| 5 | [`stage-5-store-port.md`](stage-5-store-port.md) | The store port with its command face, its transaction face and its read side, the local-files adapter, the contract spec, the guard on record paths, and the end of hand-editing: record locations leave the model and the output. Then the committed ticket: `pending` takes the name, the content is fixed and kept by its hash, `ticket unready` puts it back into draft, and the lock passes only from a holder whose process is gone | 17 |
| 6 and 7 | [`stage-6-7-gaia-views.md`](stage-6-7-gaia-views.md) | The versioned reads in forge; Gaia's forge client, its own board model and the page's own board contract; the views moved one at a time into one design; the maximized forge as a route; the alerts for a crashed, down or hung forge and for outage endings, with one control that resumes them all; the Assistant's switch; conversations with hosted agents | 29 |
| 8 and 9 | [`stage-8-9-shrink-and-rename.md`](stage-8-9-shrink-and-rename.md) | The Bridge, the sessions, the embed machinery, `forge open` and Flint's brain removed; Markdown rendered by Gaia's server; the Assistant off by default; one pipeline format; `design-system`, `flint` and `brand` folded into Gaia's page as libraries; then the lifecycle verbs at the top level and the rename of the Overseer to Hephaestus in one commit | 19 |

129 work packages in all.

Every stage file has the same sections: Goal, Depends on, Decisions this stage carries out, Today's code, Work
packages, Interfaces introduced, Traps, Verification of the whole stage, Out of scope, Needs the owner, Not
established. "Interfaces introduced" is the contract the later stages build on.

## Before stage 2 starts

Stage 0 holds three acts of the owner, which no session may do (`owner-answers.md`, "What only the owner can do"):

- **Gate G1, WP0.3:** the owner records recordings A and B, real sessions that end on a network outage. No session may
  start a vendor session, and stage 2 holds its ending pattern against them.
- **Gate G2:** passed. The owner answered on 2026-11-18; the answers are in `owner-answers.md`, and WP0.5 checks that the
  design holds them.
- **Gate G3, before WP1.2:** the owner stops both trackers and removes their login items. WP1.2 then drops every
  in-flight ticket and removes the leftover branches; neither tracker starts again in this run.

One package is too large to split without leaving the repository red, and runs as a long session: WP2.13, the switch
to Talos. It ends on `bun run verify:integration`, which forge's rules allow only when a person asks for it (gate G4).

## Where the code and the design disagree

Reading the code for this plan showed the design to be wrong or silent in the places below. WP0.1 brings the design
in line; until then the stage files are right where the two differ.

| Design | What the code shows | Stage file |
| --- | --- | --- |
| A record of a completed stop or Baton pass is missing | The log already holds it; what is missing is the heartbeat and a start that reads the record | 0 and 1, 3 |
| A stop on purpose interrupts agents, which resume by themselves today | A stop interrupts no agent today: Watchers are detached and reattached at the next start | 0 and 1, 3 |
| The Airlock steps are not traced | Traced: three steps are not redone after a stop | 0 and 1 |
| The contract gains the command kinds the views need | The Bridge sends 34 board kinds the contract does not hold; WP4.5 measures them again | 4, 6 and 7 |
| The views move with forge's code beside them | The Bridge reaches forge's model, readings and wording; stage 4 serves those as finished facts instead | 4, 6 and 7 |
| The store port has two faces | It needs a third part: reads that take no lock, as `status` and the pass do today | 5 |
| The CLI writes through commands | 15 CLI verbs change the board directly with no command kind | 5 |
| Hephaestus, which has the current code, starts the right Talos | With the pinned bundles gone, Talos starts from the program on disk, which may be at another protocol version after a pull | 2 |
| Talos's children outlive a restart of the Overseer | The Overseer's own gates are awaited by promises that die with it, so the next Overseer stops those children at start | 2 |
| Conversations with hosted agents need nothing new in the forge | The job stream and the picture routes are not in the compatibility registry | 6 and 7 |
| Gaia alerts on a crashed forge by watching presence | A forge that is down serves no API, so presence reaches Gaia through a registry key that stage 3 adds | 3, 6 and 7 |
| Flint the sprite moves with the views | Gaia's rule 12 says Gaia draws no Flint; WP6.4 amends it, so Flint shows inside a forge's board | 6 and 7 |
| Stage 8 is forge's alone, and stage 9 is one rename commit | Stage 8 changes Gaia too; stage 9's renamed command kinds and document keys are a major system version | 8 and 9 |
| `forge open` and `progress.html` need a new home | No home exists that names no client; the plan retires both | 8 and 9 |

## Not covered by any stage

Every owner answer has a package. The committed ticket (decision 48, owner answer 14) is stage 5's WP5.14 to WP5.17.
The agent port's leaks (design section 5) and every other reach past the port that the owner's rule of 2026-11-18
forbids close in stage 2, WP2.21 to WP2.32, held by `src/AgentBoundary.spec.ts`; the end of hand-editing stored
records is stage 5's WP5.13.

## Not checked

- The citations in the view packages WP6.10 to WP6.20 and in WP8.10 to WP8.12 were not rechecked line by line.
- The count of command kinds the Bridge sends comes from a scan of literals; a kind sent through a computed value is
  not counted. WP4.5 measures the list from the syntax tree.
- Nothing here was run: WP0.1, WP0.2 and the refresh have landed, no later package has started, and `bun run verify`
  was not run on `b4174bd9` for this plan.
