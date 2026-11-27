# Getting started: from clone to first merged ticket

> **Question:** What exactly do I run, in what order, and what should I see at each step?
> **Time:** 20 minutes to read, longer to run: agents do real work.
> **Read first:** [The system in twenty minutes](../concepts/overview.md).
> **Next:** [Running a board](running-a-board.md), [Runbook](runbook.md), [CLI reference](../cli.md).

## In one screen

forge turns [tickets](../glossary.md#ticket) into merged commits: [agent sessions](../glossary.md#session) build each
ticket on its own [worktree](../glossary.md#worktree), and your commands, the [gates](../glossary.md#gate), decide
whether it lands. A [Hephaestus](../glossary.md#hephaestus) per repository serves the [board](../glossary.md#board)
through an API on `127.0.0.1`, and a client of that API shows it to you.

The path from clone to first merged ticket: you run `setup.sh`, `init` and `start`, and Hephaestus serves the board
paused with `checks-not-set` open. You start the pipeline setup; the pipeline agent researches the repository, drafts
the constitution and proposes the pipeline, and you continue each step. Apply commits `CONSTITUTION.md` to the main
line, stores the pipeline and resumes the board. You describe the work in Intake, a product owner files draft tickets,
you ready them, and Hephaestus builds, gates and merges each ticket onto the main line. Nothing builds before an
Apply, and the Apply is what resumes a new, paused board. The gate commands, which store a pipeline by hand, are under
Set up the pipeline.

```sh
git clone git@github.com:AlexDM0/foundry.git && cd foundry
apps/forge/setup.sh                         # once per machine; apps/forge/setup.ps1 on Windows
cd ~/code/example-storefront && forge init --project "Example Storefront"
git add .gitignore && git commit -m "Ignore the tracker"
forge start                                 # starts Hephaestus in the background
forge pipeline setup                        # the pipeline agent designs the pipeline with you
```

The pipeline agent then works through billing, research, constitution and design with you, and an Apply commits
`CONSTITUTION.md`, stores the pipeline and, with `--resume`, resumes the board. Then describe the work in Intake and
ready the [draft tickets](../glossary.md#draft-ticket).

## Before you start

The program is tested on macOS with Bun, git and a logged-in `claude`. Neither the setup nor `init` checks that login;
the first sign of a missing one is a failing session.

| You need | Why | Check |
| --- | --- | --- |
| macOS, Linux or Windows | macOS is the one platform it has run on; the others are built and never run ([Platforms](../cli.md#platforms)) | `uname` prints `Darwin` on macOS |
| Bun at the clone's `.bun-version` or later | Runs the program; the bootstrap offers Bun's installer when Bun is missing, and the setup offers `bun upgrade` below `.bun-version` | `bun --version` |
| git | Worktrees, branches and [landings](../glossary.md#landing) | `git --version` |
| `claude`, logged in | Every agent is a Claude Code session | `claude` opens a session |
| A git repository with a commit | Hephaestus cuts every worktree from the [main line](../glossary.md#main-line) | `git log -1` |

Elsewhere the program differs in one way. Where gates cannot run confined, `start` refuses to start and names what
is missing; `status --json` prints the answer as `confinement`.

## Install the program

The setup makes `forge` a command on this machine. forge runs beside the released `agent-progress` under its own
names ([Reading names](../glossary.md#reading-names)).

```sh
git clone git@github.com:AlexDM0/foundry.git
cd foundry
apps/forge/setup.sh
```

The clone is a Bun workspace: the program is the app in `apps/forge/`, beside the packages it uses in `packages/`.
The setup is `apps/forge/setup.ts`, with its steps in `apps/forge/cli/setup/`. Two bootstraps start it:
`apps/forge/setup.sh` on macOS and Linux, and `apps/forge/setup.ps1` on Windows
(`powershell -ExecutionPolicy Bypass -File .\apps\forge\setup.ps1`). Each only finds Bun, offering Bun's
official installer when it is missing, and then starts `setup.ts`. With Bun installed, `bun run setup` starts it
directly in `apps/forge/`.

| Step | What it does | Touches |
| --- | --- | --- |
| 1/3 Bun | Checks Bun against the clone's `.bun-version`, and offers `bun upgrade` below it | `~/.bun` on your yes |
| 2/3 Dependencies | Runs `bun install` for the whole workspace and `bun link`, and offers to add Bun's bin folder to your `PATH` | Your forge clone, the global link, one shell rc file (on Windows the User `PATH`) on your yes |
| 3/3 Hook | Points your clone's `core.hooksPath` at `.githooks/` | Your clone's git config |

`apps/forge/setup.sh --instruct-only` changes nothing and reports every write as "would". It runs nothing in your
repositories: adoption is the job of `init`.

Check the install yourself:

```sh
command -v forge
forge version
```

Expect a path under `~/.bun/bin`, then `code <hash>, install version <number>`. Agent sessions call the program by name
when they start, so it must be on your `PATH`.

| You see | Cause | Do |
| --- | --- | --- |
| Empty `command -v` | `~/.bun/bin` is not on your `PATH` | Add it to your `PATH` |

After a `git pull`, run `apps/forge/setup.sh` in your forge clone, then `forge update` in each tracked
repository: the setup brings the dependencies up to date, and `update` refreshes the files `init` installed there.

## Adopt a repository

`init` writes the [tracker](../glossary.md#tracker) and installs what sessions read. It creates no commit.

```sh
cd ~/code/example-storefront
forge init --project "Example Storefront"
```

Expect `Initialised forge for "Example Storefront"`, then one line per part. On a fresh repository `hooks` reads
`(installed)`.

After `init`, your code and `CLAUDE.md` stay yours. `init` and `update` own the installed files. `init` creates the
stores, which runtime then writes, and `pipeline.json`, the `hephaestus` and `jobs` folders and the worktrees folder
appear at runtime. Little reaches git: only `.gitignore`. `update` replaces each installed file; `.gitignore` and
settings keep your entries, and only the program's own retired entries are removed.

**Commit `.gitignore`, by name.** It is the only file `init` leaves for git, and it holds the entries for the
[`<data>` and `<worktrees>` folders](../glossary.md#reading-names) and both skill folders. `init` adds no entry for
`.claude/settings.local.json`, which is per-user, so `git status` keeps listing `.claude/` as untracked after that
commit, unless your global ignore covers the file. Never run `git add .` here, and keep that file out of your commits.

**`init` never writes `CLAUDE.md`.** Your conventions stay yours. What an earlier install left there, `init` leaves;
remove it by hand.

A repository the released program tracks can be adopted too: `forge` keeps its own `.forge/` beside
`.agent-progress/` and never reads or writes the latter.

## Start Hephaestus

`start` starts Hephaestus in the background, as `start` does, and prints its URL. No forge command opens
the board; a client of Hephaestus's API shows it. Run either with your main line checked out: Hephaestus reads the branch
of your repository's main checkout when it starts and lands onto that branch.

```sh
forge start
```

The URL looks like `http://127.0.0.1:<port>/`. The port is derived from the tracker's id, starting at
`HEPHAESTUS_PORT_FIRST` (4930), so the URL survives a restart. If that port is taken, Hephaestus moves up, within
`HEPHAESTUS_PORT_COUNT` (100) ports. `--port <n>` picks one yourself.

Hephaestus keeps running after `start` ends and after its terminal closes. Stop it with `forge stop`; running
agents carry on under Talos until its lease ends a minute later, then stop at the end of their turn and wait for your
resume.

## Set up the pipeline

A board builds nothing until it has a [pipeline](../glossary.md#pipeline), `<data>/pipeline.json`, which names the
commands that judge a commit and the steps a ticket takes. Until one is stored, Hephaestus shows the
`checks-not-set` [decision](../glossary.md#decision) in Questions and holds every launch. A new board is also paused
(`DEFAULT_HEPHAESTUS_STATE`), but the pause does not hold the setup: you can set the pipeline up first and resume the
board when you apply it.

![The checks-not-set decision is open on a new board. Two routes store a pipeline. pipeline setup, then Apply, designs it with the pipeline agent; gate add or gate none stores it by hand, at once. Both reach a stored pipeline. After an Apply, checks-not-set is withdrawn by the Apply itself; after a gate command it stays open until you answer it with any text. The exit: an answer while no pipeline is stored makes the next Pass open it again.](../figures/getting-started/settling-gates.png)

*Notice the left route closes the question itself: only an Apply withdraws `checks-not-set`.*

**Let the pipeline agent design it.** One command opens the [setup record](../glossary.md#setup-record) and starts the
[pipeline agent](../glossary.md#pipeline-agent), a session you pay for, which reads a snapshot of your main line and
never runs a script:

```sh
forge pipeline setup                          # or --billing api --max-budget-usd 2
```

Expect one line per record it wrote, naming the setup `S1`. The Agents tab then lists the agent, and the
Pipeline tab walks the same steps ([Running a board](running-a-board.md)). Each step after billing waits for your
Continue; the agent's moves never move a step.

| Step | What happens | You move it on with |
| --- | --- | --- |
| Billing | You choose who pays: your subscription, or an API key with an optional cap per launch | `forge pipeline setup` itself: the setup opens at the research, billing done; `forge pipeline billing S1 …` changes it later |
| Research | The agent records findings (stack, scripts, conventions, continuous integration) and asks questions with two to four options, one recommended | `forge pipeline answer S1 Q1 a`, then `forge pipeline continue S1 research` |
| Constitution | The agent drafts the repository's rules as one markdown text, `CONSTITUTION.md` to be; you may change it | `forge pipeline constitution S1 --revision <n> --file <your text>`, then `forge pipeline continue S1 constitution` |
| Design | The agent proposes the whole pipeline: prepare steps, gates and their [phases](../glossary.md#gate-phase), the review and its conditional re-review, each role's model and effort | `forge pipeline edit`, `undo`, `check`, `profile`, then `forge pipeline continue S1 design` |
| Apply | You apply the draft | `forge pipeline apply S1 --revision <n> --resume` |

The questions, findings, draft and revisions are in `<data>/pipeline-setup.json`, and `--json` on any `pipeline` verb
prints the record as the move left it. Every verb and its refusals are in [Pipeline setup](../cli.md#pipeline-setup).

Nothing runs a proposed gate until you press for it: `forge pipeline check S1` runs the gates the draft changes or adds
two times in a fresh worktree and sends the result to the agent, and `forge pipeline profile <gate> build S1` times one
gate in one phase. Neither is needed to apply.

**Apply.** Apply refuses while a question is open or a step needs a recheck. It commits the constitution to your main
line first: the [Airlock](../glossary.md#airlock) commits `CONSTITUTION.md` with the subject `Add the repository
constitution`, ungated, while Hephaestus runs. Then it stores `pipeline.json`, withdraws `checks-not-set` and, with
`--resume`, resumes the board. The command prints the log lines it wrote. Until the commit lands, the record's
`applyRequest` reads `committing`; once it landed, `<data>/pipeline-setup.json` is gone, `forge gate list` prints the
pipeline and `git log --oneline -1` on your main line shows the commit.

> **Careful.** The commit fast-forwards your repository's main checkout, as a landing does. If that checkout is off the
> main line, or holds its own change to `CONSTITUTION.md`, Apply waits and says so; clean it and the next Pass commits.
> In a repository that signs its commits, Hephaestus signs through your gpg-agent; if it cannot, commit the text as
> `CONSTITUTION.md` yourself, signed, and apply again.

**Set gates yourself.** The `gate` commands store a pipeline at once, with no agent and no constitution. A gate is any
shell line: its exit code is the verdict, so the program needs no knowledge of your stack. A gate runs confined: no
network beyond loopback unless `--network` names a domain, and writes only to its worktree, its git admin folder and
temp, plus `--writes` folders. A prepare step sets a fresh worktree up before
the gates run. `--fix` names a command the [builder](../glossary.md#builder) is told to run before fixing by hand;
Hephaestus never runs it. A gate runs in every phase unless `--phases` names some. For Example Storefront, with its own
scripts:

```sh
forge gate prepare dependencies -- ./scripts/install-dependencies.sh
forge gate add unit-tests -- ./scripts/run-unit-tests.sh
forge gate add lint --fix "./scripts/lint.sh --fix" -- ./scripts/lint.sh
forge gate list
```

Expect `Gate unit-tests set to ./scripts/run-unit-tests.sh` for each gate, and `gate list` printing:

```text
Prepare:
  dependencies: ./scripts/install-dependencies.sh
Gates:
  unit-tests: ./scripts/run-unit-tests.sh
  lint: ./scripts/lint.sh
Ticket review: on
Merge approval: off
```

`gate list --json` adds each phase's run order. For a repository with nothing to run, `gate none` stores an empty list
on purpose, and the board counts that as set. Every flag is in the [CLI reference](../cli.md).

> **Careful.** The `gate` commands leave `checks-not-set` open
> (as built). Once a pipeline is stored, answer it in the
> Questions tab, or with `forge decide <decision id> -- <text>`; `forge decisions` lists the id, and any text clears
> it. An answer before a pipeline exists only makes the next [Pass](../glossary.md#pass) open it again. The `gate`
> commands set no reviewer either, so tickets go from gates straight to the merge; a later `forge pipeline update`
> adds one.

## Resume the board

A new board is paused, and it stays paused until you say otherwise. `pipeline apply --resume` resumes it once the
pipeline is stored. If you applied without it, or set gates by hand, press Resume in the board's header; [Running a
board](running-a-board.md) tours the header. The same thing from a terminal:

```sh
forge unpause
```

Expect `Hephaestus set to running (was paused).`

Paused holds new work, not sessions you asked for. A paused board shows this:

| | While paused | After Resume |
| --- | --- | --- |
| `checks-not-set` decision | Opens while no pipeline is stored | Withdrawn by an Apply; otherwise stays until answered |
| [Assistant](../glossary.md#assistant) | Boots | Runs |
| A request sent to Intake | Starts its [product owner](../glossary.md#product-owner) | Starts its product owner |
| Pipeline agent | Starts from `pipeline setup` | Starts from `pipeline setup` |
| The constitution commit of an Apply | Lands | Lands |
| Ticket builds | Wait | Start once a pipeline is set |
| Landings | Wait | Start once a pipeline is set |

The [Next line](../glossary.md#next-line) under `status` says so too: it ends
`Hephaestus paused: wait for the user's go`.

## File the first work

Describe the work in the Intake tab: press New chat, type the request and press Start session. From a terminal:

```sh
forge intake -- Double-click a role to edit it
```

Expect `Job J3 launched: product-owner`, where `J3` is its [job](../glossary.md#job) (your number differs). A product
owner session then works through your request in the Intake tab, asks its questions there, and files draft tickets.

The product owner closes the intake itself when it is done. Press Close intake, or run `forge intake close J3`, to end
it sooner. Closing submits the complete draft tickets it filed: with ticket review on, the default, they wait in the
Ready for review group at the top of the Kanban tab's Ready lane. Open each and press Ready on its form, or run
`forge ticket ready <id>`; a draft ticket left in the Drafts group has the same Ready button.

Readiness demands two things of the ticket body, and each door treats a gap its own way.

![Three doors lead a draft ticket on: the filer's submit, intake close or ticket submit, the Ready button on the ticket form, and ticket ready. All three apply one readiness check: numbered Acceptance and a non-blank Brief. With no gap the Ready button and ticket ready make the ticket pending, and a submit puts it in ready-for-review while ticket review is on. With a gap the Ready button and ticket ready refuse it by name, while a submit leaves it a draft ticket in the Drafts group.](../figures/getting-started/draft-ticket-to-ready.png)

*Notice the left exit: no refusal appears, and the draft ticket stays in Drafts until its body is fixed.*

| Refusal | Means | Fix |
| --- | --- | --- |
| `acceptance-unnumbered` | No numbered item under `## Acceptance` | Number each item `A1.`, `A2.` at the start of its line |
| `brief-missing` | No `## Brief` with a non-blank line | Add one: it is the builder's whole brief |

You can skip the product owner and file by hand. `ticket add` requires `--type`. A fresh board starts at `#001`, so use
the id `ticket add` prints. Write the body to a file, here `role-editing.md`:

```markdown
## Acceptance

A1. Double-clicking a role opens its editor.

## Brief

Open the role editor from a double-click on the role list.
```

```sh
forge ticket add "Double-click a role to edit it" --type ticket --body-file role-editing.md
forge ticket ready <id>
```

Expect `Ticket #<id> committed`, then a `Next` line naming it as ready. With no `--body-file`, the default ticket
body lacks `## Brief`, so `ticket ready` refuses it `brief-missing`. The body format is in the
[CLI reference](../cli.md).

## Watch it run

Once a ticket is ready, nothing waits on you unless Questions or a header notice says so.

| Tab | Look here for |
| --- | --- |
| Kanban | Where each ticket is: Drafts, Ready, Building, In review, Merge queue, Done, Abandoned |
| Agents | Which sessions are running |
| Questions | Every decision waiting on you; its count is on its tab and in the header's Waiting on User, and the question panel shows one of them beside every tab |
| Intake | Your product-owner sessions |
| Pipeline | The pipeline as a flow, with each ticket on its step |
| Assistant | The session that settles [incidents](../glossary.md#incident) |
| Progress | Each ticket's phases on a timeline |
| Tickets | One ticket's timeline, description and log |

Each tab is explained in [Running a board](running-a-board.md).

A builder commits on its own worktree under `<worktrees>/`, never in your repository's main checkout. Hephaestus then
runs the build phase's gates on that commit. A reviewer follows if the pipeline sets one: its job first merges your
main line into the branch and runs the build gates again, a conflict going back to the builder; then the reviewer works
and the review phase's gates run, with a fresh re-reviewer when its fixes were large and the pipeline asks for one.
The [Airlock](../glossary.md#airlock) merges one ticket at a time and runs the merge phase's gates; a conflict or a red
gate there goes to the ticket's last worker. Every agent reads your `CONSTITUTION.md` from the main line.

**Done means merged.** The ticket reaches the Done lane, status [`delivered`](../glossary.md#delivered),
when its commit is on the main line. Confirm it in the repository itself:

```sh
git log --oneline -3
forge ticket list
```

Landing fast-forwards your repository's main checkout. If that checkout is off the main line, or a change would be
overwritten, landings wait and the header shows the `dirty-main-checkout` [notice](../glossary.md#notice). The
[Runbook](runbook.md) has the way out.

## After a login

A forge never starts at login. After a login or a reboot the board stays stopped until you start it with `forge start`
or from a client.

## Did it work?

Each row is one stage; stop at the first that does not match.

| Stage | Run | Expect | If not |
| --- | --- | --- | --- |
| Install | `forge version` | `code <hash>, install version <number>` | Follow the check under [Install the program](#install-the-program) |
| Adopt | `git status --short` | `?? .claude/` and `?? .gitignore`; once `.gitignore` is committed, `?? .claude/` alone. A global ignore covering the settings file drops the `.claude/` line | A skill folder listed: run `init` again. `<data>` listed: add `.forge/` to `.gitignore` by hand; `init` adds that entry only when it creates the tracker |
| Tracker | `forge status` | `Next:` line ending `Hephaestus paused: wait for the user's go` | Rerun `init` |
| Hephaestus | `forge status` | `hephaestus: serving at http://127.0.0.1:<port>/`, then `paused` | `start`, then run `forge hephaestus-log` |
| Decision | `forge status --json` | `decisions` lists `checks-not-set`, unless you stored gates before Hephaestus started | Wait one Pass, then run `forge hephaestus-log` again |
| Sessions | `forge status` | No repeating `ended failed (assistant-down)` in the log lines | Run `claude` by hand: it shows why a session cannot start, such as a missing login |
| Setup | `forge jobs` | A `pipeline-agent` job while the setup runs | `forge pipeline resume S1`: it opens the agent again, or starts a new one from the record |
| Apply | `git log --oneline -1` on the main line | `Add the repository constitution` | Read the reason in `applyRequest` in `<data>/pipeline-setup.json`; clean the main checkout, or commit the text yourself |
| Gates | `forge gate list` | Your gates, or `none, on purpose` | Set the pipeline up; see [Set up the pipeline](#set-up-the-pipeline) |
| Resume | `forge status` | `not paused` | `unpause` |
| Drafts | `forge ticket list` | Your ticket as `draft` | Check the Intake tab |
| Ready | `forge ticket list` | Your ticket as `committed` (the Ready lane), then `in-progress` (Building) | Read the refusal; see [File the first work](#file-the-first-work) |
| Worktree | `git worktree list` | A line for `<worktrees>/ticket-<id>` | Check the board is not paused |
| Merged | `git log --oneline -3` | The ticket's commit on your main line | Check Questions and the header's notices |

Anything else is in the [Runbook](runbook.md), which also has
[a scratch board for trying things](runbook.md#a-scratch-board-for-trying-things). Every printed refusal is in
[Refusals](../reference/refusals.md).

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Machine setup | `setup.ts`, `cli/setup/Setup.ts`; bootstraps `setup.sh`, `setup.ps1` | `runSetup` | `cli/setup/Setup.spec.ts`, `cli/SetupScript.integration.spec.ts`, `cli/setup/BootstrapScripts.spec.ts` |
| Adoption | `cli/adoption/init/InitCommand.ts` | `initCommand` | `cli/adoption/init/InitCommand.spec.ts` |
| What install writes | `cli/adoption/constants/AgentInstall.ts` | `AGENT_INSTALL` | `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` |
| Starting detached | `cli/hephaestus/StartCommand.ts` | `startDetached` | `cli/hephaestus/StartCommand.integration.spec.ts` |
| The port | `src/services/hephaestus/HephaestusPort.ts` | `HephaestusPort` | `src/services/hephaestus/HephaestusServer.integration.spec.ts` |
| A new board is paused | `src/lib/tracker-model/constants/HephaestusStates.ts` | `DEFAULT_HEPHAESTUS_STATE` | `cli/hephaestus/UnpauseCommand.spec.ts` |
| What paused holds | `src/lib/tracker-model/Playbook.ts` | `nextStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| The pipeline setup | `cli/pipeline/PipelineCommand.ts`, `src/services/control/PipelineSetupControls.ts` | `startSetup`, `applySetup` | `cli/pipeline/PipelineCommand.spec.ts`, `src/services/control/PipelineSetupControls.spec.ts` |
| The constitution commit | `src/services/hephaestus/Airlocks.ts` | `allocateConstitutionCommit` | `src/services/hephaestus/Airlocks.constitutionCommit.spec.ts` |
| The gate verbs | `cli/gates/GatePipelineVerbs.ts` | `addGate`, `setNoGates` | `cli/gates/GatePipelineVerbs.spec.ts` |
| Readiness | `src/lib/tracker-model/@types/Ticket.ts` | `ReadinessGap` | `src/lib/tracker-model/Board.ready.spec.ts` |
| Intake | `cli/intake/IntakeCommand.ts` | `intakeCommand` | `cli/hephaestus/HephaestusWording.intake.spec.ts` |
| What `intake close` submits | `src/lib/tracker-model/Board.ts`, `src/lib/tracker-model/TicketMoves.ts` | `closeIntake`, `submitDraftTickets` | `src/services/control/JobControls.spec.ts` |
| How a decision answer acts | `src/services/control/DecisionControls.ts` | `answerDecision` | `cli/decisions/DecisionCommands.spec.ts` |
