# Getting started: from clone to first merged ticket

> **Question:** What exactly do I run, in what order, and what should I see at each step?
> **Time:** 20 minutes to read, longer to run: agents do real work.
> **Read first:** [The system in twenty minutes](../concepts/overview.md).
> **Next:** [Running a board](running-a-board.md), [Runbook](runbook.md), [CLI reference](../cli.md).

## In one screen

agent-progress-v2 turns [tickets](../glossary.md#ticket) into merged commits: [agent sessions](../glossary.md#session)
build each ticket on its own [worktree](../glossary.md#worktree), and your commands, the
[gates](../glossary.md#gate), decide whether it lands. An [Overseer](../glossary.md#overseer) per repository serves a
[board](../glossary.md#board) in your browser, the [Bridge](../glossary.md#bridge).

![The path from clone to first merged ticket: you run setup.sh, init and oversee --detach, press Resume, accept the onboarder's proposal, describe the work in Intake and ready the draft tickets, and the Overseer builds, gates and merges each ticket. The exits: gates stored before Resume skip the onboarder, and you may set gates by hand in place of accepting. The board waits on you four times, and only Resume goes unannounced.](../figures/getting-started/adoption-path.png)

*Notice the heavy box: a new board is paused (`DEFAULT_OVERSEER_STATE`), builds nothing and does not ask you to resume.*

```sh
git clone git@github.com:AlexDM0/agent-progress.git && cd agent-progress
git switch group-code-lifecycle && ./setup.sh           # once per machine
cd ~/code/example-storefront && agent-progress-v2 init --project "Example Storefront"
git add .gitignore && git commit -m "Ignore the tracker"
agent-progress-v2 oversee --detach && agent-progress-v2 open
agent-progress-v2 oversee resume                        # starts an onboarder; set gates first to skip it
```

The Questions tab then shows `checks-not-set`, a generic line with an empty text box. Typing there stores no gates: they
come from a `pipeline-proposal` [decision](../glossary.md#decision) or the `gate` commands. Answer `checks-not-set` once
gates are stored, then describe the work in Intake and ready the [draft tickets](../glossary.md#draft-ticket).

## Before you start

The program is tested on macOS with Bun, git and a logged-in `claude`. Neither `setup.sh` nor `init` checks that login;
the first sign of a missing one is a failing session.

| You need | Why | Check |
| --- | --- | --- |
| macOS, Linux or Windows | macOS is the one platform it has run on; the others are built and never run ([Platforms](../cli.md#platforms)) | `uname` prints `Darwin` on macOS |
| Bun 1.2 or later | Runs the program; `setup.sh` warns below 1.2 and offers the installer when Bun is missing | `bun --version` |
| git | Worktrees, branches and [landings](../glossary.md#landing) | `git --version` |
| `claude`, logged in | Every agent is a Claude Code session | `claude` opens a session |
| A git repository with a commit | The Overseer cuts every worktree from the [main line](../glossary.md#main-line) | `git log -1` |

Elsewhere the program differs in three ways. Where gates cannot run confined, `oversee` refuses to start and names what
is missing; `status --json` prints the answer as `confinement`. `--login-overseer` writes a systemd user unit on Linux
and a Run entry on Windows in place of a LaunchAgent ([the login item](../cli.md#the-login-item)). `open` calls
`xdg-open` in place of `open`.

## Install the program

`setup.sh` makes `agent-progress-v2` a command on this machine. This build runs beside the released `agent-progress`
under its own names ([Reading names](../glossary.md#reading-names)), and it lives on the branch `group-code-lifecycle`.
Switch to that branch before you run `setup.sh`. The `&&` keeps a failed switch from running `setup.sh` on another
branch.

```sh
git clone git@github.com:AlexDM0/agent-progress.git
cd agent-progress
git switch group-code-lifecycle && ./setup.sh
```

| Step | What it does | Touches |
| --- | --- | --- |
| 1/4 Bun | Finds Bun, or offers the official installer | `~/.bun` on your yes |
| 2/4 Dependencies | Runs `bun install` and `bun link`, and offers to add `~/.bun/bin` to your shell's `PATH` | Your agent-progress clone, the global link, one shell rc file on your yes |
| 3/4 Skills | Removes two skill links under `~/.claude/skills/`, only if they are symlinks into your agent-progress clone | `~/.claude/skills/` |
| 4/4 Hook | Points your clone's `core.hooksPath` at `.githooks/` | Your clone's git config |

`./setup.sh --instruct-only` changes nothing and reports every write as "would". It runs nothing in your repositories:
adoption is the job of `init`.

> **Careful.** `setup.sh` names the wrong program. Its last line says `agent-progress init`, and step 2 checks for
> `agent-progress`. The command it links is `agent-progress-v2`. Do not paste that line: on a machine with the
> released program it runs the released program. See
> [gap-setup-names-the-released-program](../reference/known-gaps.md#gap-setup-names-the-released-program).

Check the install yourself:

```sh
command -v agent-progress-v2
agent-progress-v2 version
```

Expect a path under `~/.bun/bin`, then `code <hash>, install version <number>`. Agent sessions call the program by name
when they start, so it must be on your `PATH`.

| You see | Cause | Do |
| --- | --- | --- |
| Empty `command -v`, and `git branch --show-current` in your agent-progress clone names another branch | On any other branch `setup.sh` links the released program | `git switch group-code-lifecycle && ./setup.sh` |
| `invalid reference` from `git switch` | Your clone lacks the branch | `git fetch origin group-code-lifecycle:group-code-lifecycle`, then switch |
| Empty `command -v` on the right branch | `~/.bun/bin` is not on your `PATH` | Add it to your `PATH` |

After a `git pull`, run `./setup.sh` in your agent-progress clone, then `agent-progress-v2 update` in each tracked
repository: `setup.sh` brings the dependencies up to date, and `update` refreshes the files `init` installed there. See
[CLI and install](../architecture/cli-and-install.md).

## Adopt a repository

`init` writes the [tracker](../glossary.md#tracker) and installs what sessions read. It creates no commit.

```sh
cd ~/code/example-storefront
agent-progress-v2 init --project "Example Storefront"
```

Expect `Initialised agent-progress-v2 for "Example Storefront"`, then one line per part. On a fresh repository
`CLAUDE.md` reads `no managed block`, `retired` reads `nothing to remove`, and `hooks` reads `(installed)`.

![A repository after init, each path marked by who writes it and what git does with it. Your code and CLAUDE.md stay yours; init and update own the installed files; init creates the stores, which runtime then writes; pipeline.json, the overseer and jobs folders and the worktrees folder appear at runtime. Only .gitignore goes into git.](../figures/getting-started/repository-after-init.png)

*Notice how little reaches git. `update` replaces each installed file; `.gitignore` and settings keep your entries, and
only the program's own retired entries are removed.*

**Commit `.gitignore`, by name.** It is the only file `init` leaves for git, and it holds the entries for the
[`<data>` and `<worktrees>` folders](../glossary.md#reading-names) and both skill folders. `init` adds no entry for
`.claude/settings.local.json`, which is per-user, so `git status` keeps listing `.claude/` as untracked after that
commit, unless your global ignore covers the file. Never run `git add .` here, and keep that file out of your commits.

**`init` never writes `CLAUDE.md`.** Your conventions stay yours. It only removes the
[managed block](../glossary.md#managed-block) an earlier install left there, and then its line says
`removed; commit CLAUDE.md`. Commit that change: no ticket launches onto a branch whose committed `CLAUDE.md` still
holds the block, and the header shows a notice saying so.

`init` is refused in a repository the released program tracks. If `.agent-progress/` exists at the root, it exits 1 and
says `nothing was written`; [Refusals](../reference/refusals.md) lists this as `older-program-present`. This build
cannot adopt that repository: run `agent-progress-v2` in one without that folder.

Every path above and its lifetime is in the [on-disk atlas](../data-model/on-disk-atlas.md).

## Start the Overseer

`oversee --detach` starts the Overseer in the background and prints its URL. Run it with your main line checked out:
the Overseer reads the branch of your repository's main checkout when it starts and lands onto that branch.

```sh
agent-progress-v2 oversee --detach
agent-progress-v2 open
```

The URL looks like `http://127.0.0.1:<port>/`. The port is derived from the tracker's id, starting at
`OVERSEER_PORT_FIRST` (4930), so a bookmark survives a restart. If that port is taken, the Overseer moves up, within
`OVERSEER_PORT_COUNT` (100) ports. `--port <n>` picks one yourself.

`open` opens the URL in your browser. With no Overseer it exits 1 and prints `No Overseer serves this board`, which
[Refusals](../reference/refusals.md) lists as `overseer-down`.

If you open `<data>/progress.html` by habit or from a link, you get a stub, not the board. It links the live URL, or
says the Overseer is down.

## Resume the board

A new board is paused, and it stays paused until you say otherwise. Until then no ticket builds and no
[onboarder](../glossary.md#onboarder) starts. Resume starts an onboarder, a session you pay for, so to set gates by
hand and skip it, run the `gate` commands in [Settle the gates](#settle-the-gates) first.

The Bridge header shows the word `paused` and a Resume button; [Running a board](running-a-board.md) tours the header.
The same thing from a terminal:

```sh
agent-progress-v2 oversee resume
```

Expect `Overseer set to running (was paused).`

Paused holds new work, not sessions you asked for. A paused board shows this:

| | While paused | After Resume |
| --- | --- | --- |
| `checks-not-set` decision | Opens | Stays until answered |
| [Assistant](../glossary.md#assistant) | Boots | Runs |
| A request sent to Intake | Starts its [product owner](../glossary.md#product-owner) | Starts its product owner |
| Onboarder | Waits | Starts |
| Ticket builds | Wait | Start once a [pipeline](../glossary.md#pipeline) is set |
| Landings | Wait | Start once a pipeline is set |

The [Next line](../glossary.md#next-line) under `status` says so too: it ends `Overseer paused: wait for the user's go`.

## Settle the gates

A board builds nothing until it has a pipeline, which names the commands that judge a commit. Any stored pipeline, even
an empty one, lets work start. The Overseer flags the gap with `checks-not-set` in the Questions tab, a generic line
with an empty text box. Typing there stores no gates; gates come from a `pipeline-proposal` or the `gate` commands. What
a gate means is in [Customs and gates](../architecture/customs-and-gates.md).

![The checks-not-set decision is open, and three routes store a pipeline: accept the onboarder's proposal, gate add with gate prepare, or gate none. All reach one state, and the decision stays open until you answer it with any text. The exit: an answer while no pipeline is stored makes the next Pass reopen it, and a fresh onboarder follows unless the board is paused or held.](../figures/getting-started/settling-gates.png)

*Notice the top loop: an answer before any pipeline exists does not skip the question. The next
[Pass](../glossary.md#pass) reopens it and, unless the board is paused or [held](../glossary.md#hold), another onboarder
follows.*

> **Careful.** Wait until a pipeline is stored, then answer `checks-not-set` in the Questions tab, or with
> `agent-progress-v2 decide <decision id> -- <text>`; `agent-progress-v2 decisions` lists the id. Any text clears it.
> Left open it holds nothing, but it stays in Questions and counts in `open questions`.

**Let the onboarder propose.** After Resume, one onboarder reads a snapshot of the main line and proposes
[prepare steps](../glossary.md#prepare-step) and gates. While it runs, the Agents tab lists it. The Overseer then runs
each proposed gate `PROPOSAL_RUN_COUNT` (2) times, and `pipeline-proposal` appears in Questions showing what happened.
Choose Accept to store the steps and gates. Choose Decline to store nothing and set them by hand.

If its job ends with no proposal, for example `failed` after [Customs](../glossary.md#customs) refuses its report, no
second onboarder starts by itself. Set gates by hand, or answer `checks-not-set`: a fresh onboarder follows once the
next Pass reopens the decision.

**Set them yourself.** A gate is any shell line: its exit code is the verdict, so the program needs no knowledge of your
stack. A gate runs confined: no network unless `--network` names a domain, and writes only to its worktree, its git
admin folder and temp, plus `--writes` folders. See [Confinement](../architecture/confinement.md). A prepare step sets a
fresh worktree up before the gates run. `--fix` names a command the [builder](../glossary.md#builder) is told to run
before fixing by hand; the Overseer never runs it. For Example Storefront, with its own scripts:

```sh
agent-progress-v2 gate prepare dependencies -- ./scripts/install-dependencies.sh
agent-progress-v2 gate add unit-tests -- ./scripts/run-unit-tests.sh
agent-progress-v2 gate add lint --fix "./scripts/lint.sh --fix" -- ./scripts/lint.sh
agent-progress-v2 gate list
```

Expect `Gate unit-tests set to ./scripts/run-unit-tests.sh` for each gate, and `gate list` printing:

```text
Prepare:
  dependencies: ./scripts/install-dependencies.sh
Gates:
  unit-tests: ./scripts/run-unit-tests.sh
  lint: ./scripts/lint.sh
```

Every flag is in the [CLI reference](../cli.md).

**Declare none.** For a repository with nothing to run, `gate none` stores an empty list on purpose, and the board
counts that as set.

> **Careful.** No route sets a [reviewer](../glossary.md#reviewer): tickets go from gates straight to the merge. No
> `gate` verb writes the pipeline's `review` key and accepting a proposal does not either. To add review, write the
> `review` key into `<data>/pipeline.json`; its format is in the [CLI reference](../cli.md) and its effect in
> [Customs and gates](../architecture/customs-and-gates.md).

## File the first work

Describe the work in the Intake tab: type the request and press New request. From a terminal:

```sh
agent-progress-v2 intake -- Double-click a role to edit it
```

Expect `Job J3 launched: product-owner`, where `J3` is its [job](../glossary.md#job) (your number differs). A product
owner session then works through your request in the Intake tab, asks its questions there, and files draft tickets.

The product owner closes the intake itself when it is done, proposing sets of draft tickets. Press Close intake, or run
`agent-progress-v2 intake close J3`, to end it sooner. Once its session ends, the Overseer opens the `ready-drafts`
decision in Questions, listing the draft tickets it filed. If it filed none, no decision opens.

Pick the set to ready, or None to leave them in the Kanban tab's Drafts lane. A draft ticket in that lane also has its
own Ready button, and `agent-progress-v2 ticket ready <id>` does the same.

Readiness demands two things of the ticket body, and each door treats a gap its own way.

![Three doors lead a draft ticket to ready: the ready-drafts decision, the Ready button and ticket ready, all behind one check for numbered Acceptance and a non-blank Brief. With no gap the ticket becomes pending. With a gap the Ready button and ticket ready refuse it by name, while ready-drafts leaves it out of its options and it stays in the Drafts lane.](../figures/getting-started/draft-ticket-to-ready.png)

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
agent-progress-v2 ticket add "Double-click a role to edit it" --type ticket --body-file role-editing.md
agent-progress-v2 ticket ready <id>
```

Expect `Ticket #<id> ready to build`, then a `Next` line naming it as ready. With no `--body-file`, the default ticket
body lacks `## Brief`, so `ticket ready` refuses it `brief-missing`. See
[gap-ticket-body-template](../reference/known-gaps.md#gap-ticket-body-template). The body format is in the
[CLI reference](../cli.md).

## Watch it run

Once a ticket is ready, nothing waits on you unless Questions or a header notice says so.

| Tab | Look here for |
| --- | --- |
| Kanban | Where each ticket is: Drafts, Ready, Building, In review, Merge queue, Done, Abandoned |
| Agents | Which sessions are running |
| Questions | Every decision waiting on you; its count is in the header as `open questions` |
| Intake | Your product-owner sessions |
| Assistant | The session that settles [incidents](../glossary.md#incident) |
| Progress | Each ticket's phases on a timeline |
| Tickets | One ticket's timeline, description and log |

Each tab is explained in [Running a board](running-a-board.md).

A builder commits on its own worktree under `<worktrees>/`, never in your repository's main checkout. The Overseer then
runs your gates on that commit, a reviewer follows if the pipeline sets one, and the
[Airlock](../glossary.md#airlock) merges one ticket at a time.

**Done means merged.** The ticket reaches the Done lane, status [`delivered`](../glossary.md#delivered),
when its commit is on the main line. Confirm it in the repository itself:

```sh
git log --oneline -3
agent-progress-v2 ticket list
```

Landing fast-forwards your repository's main checkout. If that checkout is off the main line, or a change would be
overwritten, landings wait and the header shows the `dirty-main-checkout` [notice](../glossary.md#notice). The
[Runbook](runbook.md) has the way out.

## Keep it running across logins

The Overseer does not come back after a reboot on its own. On macOS, an optional login item starts it at login:

```sh
cd <your agent-progress clone>
./setup.sh --login-overseer ~/code/example-storefront
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.agent-progress-v2.overseer.plist
```

The `setup.sh` line writes one file, `~/Library/LaunchAgents/com.agent-progress-v2.overseer.plist`, which runs
`oversee --detach` in that repository at login. The `launchctl` line loads the item, so you need not log out and back
in.

A second repository needs its own `--label <label>`, and `setup.sh` refuses the default label for it. The plist stores
your clone's path and your current `PATH`, so write it again if either changes.

The item starts the Overseer once. It does not restart one that dies. See
[gap-login-item-no-keepalive](../reference/known-gaps.md#gap-login-item-no-keepalive).

## Did it work?

Each row is one stage; stop at the first that does not match.

| Stage | Run | Expect | If not |
| --- | --- | --- | --- |
| Install | `agent-progress-v2 version` | `code <hash>, install version <number>` | Follow the check under [Install the program](#install-the-program) |
| Adopt | `git status --short` | `?? .claude/` and `?? .gitignore`; once `.gitignore` is committed, `?? .claude/` alone. A global ignore covering the settings file drops the `.claude/` line | A skill folder listed: run `init` again. `<data>` listed: add `.agent-progress-v2/` to `.gitignore` by hand; `init` adds that entry only when it creates the tracker |
| Tracker | `agent-progress-v2 status` | `Next:` line ending `Overseer paused: wait for the user's go` | Rerun `init` |
| Overseer | `agent-progress-v2 oversee status` | `overseer: serving at http://127.0.0.1:<port>/`, then `paused` | `oversee --detach`, then read `<data>/overseer.log` |
| Decision | `agent-progress-v2 status --json` | `decisions` lists `checks-not-set`, unless you stored gates before the Overseer started | Wait one Pass, then reread `<data>/overseer.log` |
| Resume | `agent-progress-v2 oversee status` | `not paused` | `oversee resume` |
| Sessions | `agent-progress-v2 status` | No repeating `ended failed (assistant-down)` in the log lines | Run `claude` by hand: it shows why a session cannot start, such as a missing login |
| Proposal | `agent-progress-v2 decisions` | A `pipeline-proposal` line once the onboarder ends, unless you set gates by hand | Read the log in `agent-progress-v2 status`: a `failed` onboarder job opens none. Set gates by hand, or answer `checks-not-set` for a fresh onboarder |
| Gates | `agent-progress-v2 gate list` | Your gates, or `none, on purpose` | Settle `checks-not-set` |
| Drafts | `agent-progress-v2 ticket list` | Your ticket as `draft` | Check the Intake tab |
| Ready | `agent-progress-v2 ticket list` | Your ticket as `pending` (the Ready lane), then `in-progress` (Building) | Read the refusal; see [File the first work](#file-the-first-work) |
| Worktree | `git worktree list` | A line for `<worktrees>/ticket-<id>` | Check the board is not paused |
| Merged | `git log --oneline -3` | The ticket's commit on your main line | Check Questions and the header's notices |

Anything else is in the [Runbook](runbook.md), which also has
[a scratch board for trying things](runbook.md#a-scratch-board-for-trying-things). Every printed refusal is in
[Refusals](../reference/refusals.md).

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Machine setup | `setup.sh` | `step`, `write_login_overseer` | `cli/SetupScript.spec.ts` |
| Adoption | `cli/adoption/init/InitCommand.ts` | `initCommand` | `cli/adoption/init/InitCommand.spec.ts` |
| What install writes | `cli/adoption/constants/ClaudeCodeInstall.ts` | `CLAUDE_CODE_INSTALL` | `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` |
| Refusal beside the released program | `cli/adoption/OlderProgramRefusal.ts` | `refuseBesideAnOlderProgram` | `cli/ProductNameIsolation.spec.ts` |
| Starting detached | `cli/overseer/OverseerCommand.ts` | `startOverseer` | `cli/overseer/OverseerCommand.integration.spec.ts` |
| The port | `src/services/overseer/OverseerPort.ts` | `OverseerPort` | `src/services/overseer/OverseerServer.spec.ts` |
| The stub | `src/adapters/progress-page/ProgressPageStubWriter.ts` | `progressPageStubTextOf` | `src/adapters/progress-page/ProgressPageStubWriter.spec.ts` |
| A new board is paused | `src/lib/tracker-model/constants/OverseerStates.ts` | `DEFAULT_OVERSEER_STATE` | `cli/overseer/OverseerCommand.spec.ts` |
| What paused holds | `src/lib/tracker-model/Playbook.ts` | `nextStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| The gate verbs | `cli/gates/GatePipelineVerbs.ts` | `addGate`, `setNoGates` | `cli/gates/GatePipelineVerbs.spec.ts` |
| Readiness | `src/lib/tracker-model/@types/Ticket.ts` | `ReadinessGap` | `src/lib/tracker-model/Board.ready.spec.ts` |
| Intake | `cli/intake/IntakeCommand.ts` | `intakeCommand` | `cli/overseer/OverseerWording.intake.spec.ts` |
| What `ready-drafts` offers | `src/lib/tracker-model/JobControls.ts` | `readyDraftsDraftOf` | `src/services/control/JobControls.spec.ts` |
| How a decision answer acts | `src/services/control/DecisionControls.ts` | `answerDecision` | `src/services/control/DecisionControls.pipelineProposal.spec.ts` |
