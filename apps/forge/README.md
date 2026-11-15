<p align="center">
  <img src="docs/images/icon.png" width="112" height="112" alt="forge icon: a graphite hexagon with an orange electron at its upper right corner, on a light rounded square">
</p>

# forge

> **Question:** What is this, what does it look like, what will it do to my repository, and where do I go next?
> **Time:** 5 minutes.
> **Read first:** nothing.
> **Next:** [index](docs/README.md), [overview](docs/concepts/overview.md),
> [getting started](docs/operations/getting-started.md).

## In one screen

forge runs Claude Code [agents](docs/glossary.md#agent) through a [ticket](docs/glossary.md#ticket) board in one
repository. Agents do the work and report it, and the program, not an agent, checks each report and moves each
ticket. A live page, the [Bridge](docs/glossary.md#bridge), shows the whole [board](docs/glossary.md#board) and takes
the moves of User, the person running the board.

forge grew out of `agent-progress` and is now a project of its own. It installs side by side with the released
`agent-progress`, sharing none of its files.

The promise, in three lines:

- **Agents report and code decides.** A report is a claim until [Customs](docs/glossary.md#customs) and the
  [gates](docs/glossary.md#gate) have checked it.
- **Done means merged.** A ticket is finished when the [Airlock](docs/glossary.md#airlock) has landed it, not when an
  agent says so.
- **An [Overseer](docs/glossary.md#overseer) can die or be updated while agents keep running.** Each agent session
  lives under a detached [Watcher](docs/glossary.md#watcher), not under the Overseer.
  [Two lifetimes](docs/concepts/overview.md#two-lifetimes) shows it over time.

![One Overseer drives the board. User reaches it through the Bridge, and terminal verbs, typed by User or run by an orchestrator session, record a fact in the data folder. The Overseer reads and writes that folder, lands tickets on main through the Airlock, and sends one-shot frames to detached Watchers. Each Watcher runs one agent session or gate and reports through an event log. Watchers and their children outlive the Overseer.](docs/images/architecture.png)

*Notice that nothing inside the dashed box is a child of the Overseer, and that agents touch neither the board nor
main.*

## What it looks like

The Bridge is a live React app the Overseer serves on `127.0.0.1`. Every image below is one of its views of the
Example Storefront demo board, taken with the Overseer running scripted fake agents.

<p align="center">
  <img src="docs/images/bridge-kanban.png" width="100%" alt="Kanban: the Example Storefront board under its header: the live state, the figures, the Waiting on User pill, Pause and Stop Overseer, then the activity strip of three builders and a reviewer at work, and the tabs with their counts. Below, the lanes: Ready with two draft tickets above the normal ones, three Building, three In review, one in the Merge queue and one Done, with Abandoned folded.">
  <br><strong>Kanban.</strong> Every ticket by lane, from draft ticket to Done.
</p>

<p align="center">
  <img src="docs/images/bridge-progress.png" width="100%" alt="Progress: a Gantt row per ticket grouped by epic, each with its state and a red now line, then the finished work of the last day.">
  <br><strong>Progress.</strong> Gantt rows by epic, then the finished work.
</p>

<p align="center">
  <img src="docs/images/bridge-agents.png" width="100%" alt="Agents: the worker list, three builders and a reviewer under the project row with its 4 / 5 worker meter and the agents at most field. The builder of #008 asks User, so it leads, its question under it. Each row shows its state, calls against its budget and its subagents as squares. Below, Sessions holds the product owner, also asking, and the Assistant.">
  <br><strong>Agents.</strong> Every <a href="docs/glossary.md#job">job</a> with its state, calls and subagents.
</p>

<p align="center">
  <img src="docs/images/bridge-assistant.png" width="100%" alt="Assistant: its session as a chat thread: a working turn with its running tool calls, then User's message, queued until the Assistant is idle. Below, the composer is marked busy; beside the thread, the incident rail holds no incident.">
  <br><strong>Assistant.</strong> The <a href="docs/glossary.md#assistant">session</a> that settles incidents, and a
  chat with it.
</p>

<p align="center">
  <img src="docs/images/bridge-questions.png" width="100%" alt="Questions: the open decisions, a builder's question on #008 first, how long a password reset link stays valid, with what each option touches, trades off and does to the Acceptance. Beside them the question panel shows the same question with its options as cards, and the ticket's Wanted, Brief and Acceptance in its Background tab.">
  <br><strong>Questions.</strong> What only User can answer, beside the board.
</p>

<p align="center">
  <img src="docs/images/bridge-intake.png" width="100%" alt="Intake: the session list, one session titled Wish list on product pages and waiting on User, and its chat: User's request, User's message with a sketch of product cards, the product owner's finished turn, then its working turn and its two-question decision in the thread. Below, the composer with Attach pictures; beside the chat, the pictures in this chat and Close intake.">
  <br><strong>Intake.</strong> A request, a picture, and the
  <a href="docs/glossary.md#product-owner">product owner</a> working on it.
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/bridge-merge-queue.png" width="100%" alt="Merge queue: the stated merge order, then main with its Airlock free and #002 queued clean.">
      <br><strong>Merge queue.</strong> What the Airlock holds and what waits behind it.
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/bridge-tickets.png" width="100%" alt="Tickets: #012 One-page checkout open in the detail panel on its Description tab, beside Overview, Timeline and Activity, with its Report, Wanted, Acceptance and Brief.">
      <br><strong>Tickets.</strong> One ticket's overview, timeline, activity and description.
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="docs/images/bridge-kanban-dark.png" width="50%" alt="Dark theme: the same Kanban view in the dark theme.">
      <br><strong>Dark theme.</strong> The same Kanban.
    </td>
  </tr>
</table>

## One ticket, start to merge

User describes the work and readies the [draft ticket](docs/glossary.md#draft-ticket) a product owner files. The
Overseer drives every step after that. User steps in only for what code cannot answer, which reaches the Questions
view as a [decision](docs/glossary.md#decision).

<p align="center">
  <img src="docs/images/lifecycle.png" width="680" alt="One ticket from report to merged: User describes the work, a product owner files a draft ticket, and once User readies it the Overseer starts a builder in a worktree. Customs and the gates verify its report on the final commit. A fresh reviewer follows when the pipeline sets a review, otherwise the ticket goes straight to the Airlock. A red result or a review that does not hold sends it back to the same builder. A reviewer's large rework can earn another review round. The Airlock merges from the merge queue, one ticket at a time, and done means merged. Findings outside scope become low-priority draft tickets.">
</p>

*Notice that review is optional, set by the board's [pipeline](docs/glossary.md#pipeline).*

[The ticket lifecycle](docs/concepts/ticket-lifecycle.md) walks this path, with what happens when a step fails.

## What it does to a repository

`forge init` only adds the files below. Once running, the Overseer creates ticket branches and lands
finished tickets on the [main line](docs/glossary.md#main-line).

| What | Where | In git |
| --- | --- | --- |
| The [tracker](docs/glossary.md#tracker): state, log, tickets and installed guidance, shared by every worktree | `.forge/` | ignored |
| Ignore entries for the folders in this table | `.gitignore` | commit it |
| A `SessionStart` hook that tells each session how the board works | `.claude/settings.local.json` | untracked: do not commit |
| The two skills, for this repository only | `.claude/skills/forge-po/`, `.claude/skills/forge-orchestrate/` | ignored |
| One [worktree](docs/glossary.md#worktree) per ticket, plus group and session folders, created as work starts | `.forge-worktrees/` | ignored |

> **As built.** A landed ticket's worktree stays in that folder. See
> the known gap.

`init` adds nothing to `CLAUDE.md`, and it [refuses](docs/reference/refusals.md) a repository the released program
already tracks.

Outside the repository, the setup script links the program with `bun link` and points the forge checkout's git hooks at
`.githooks/`, and each tracker registers in `~/.forge-monitor/`.
The on-disk atlas maps every path.

## Quickstart

forge lives at github.com/AlexDM0/forge. It needs Bun, git and a logged-in `claude`, and has been run on macOS;
[getting started](docs/operations/getting-started.md) says what differs elsewhere.

| Platform | x64 | arm64 | Also needs | Confinement in force |
| --- | --- | --- | --- | --- |
| macOS | never run | run | nothing more: `sandbox-exec` ships with macOS | gates under Seatbelt; sessions in Claude Code's sandbox |
| Linux | never run | never run | `bwrap` able to create user namespaces; `systemctl --user` for the login item | gates under bubblewrap; sessions in Claude Code's sandbox |
| Windows (native) | never run | never run | an absolute `SystemRoot`; PowerShell for `setup.ps1` | none: gates and sessions run unconfined by design |

Linux and Windows have adapters for every OS-dependent part, proved only over fakes on a Mac.
[Platforms](docs/cli.md#platforms) says what each OS does and what Windows loses with no confinement, and
[the platform status](docs/development/platform-status.md) lists what has never run.

```sh
git clone https://github.com/AlexDM0/forge.git && cd forge
apps/forge/setup.sh
```

The clone is a Bun workspace: forge is the app in `apps/forge/`, and the packages it uses are in `packages/`. On
Windows, in PowerShell, run `apps\forge\setup.ps1` in place of `apps/forge/setup.sh`. It needs no administrator rights
and no bash:

```powershell
powershell -ExecutionPolicy Bypass -File .\apps\forge\setup.ps1
```

Both scripts only make sure Bun is installed, offering Bun's own installer, and then hand over to `setup.ts`, which runs
the same four steps on every system. With Bun already installed, `bun run setup` in `apps/forge/` starts `setup.ts`
directly. Setup refuses a Bun older than the version the clone's `.bun-version` pins, and offers `bun upgrade`. On Windows, step 2 offers to add
Bun's `bin` folder to your User `PATH` instead of editing a shell startup file.

<p align="center">
  <img src="docs/images/terminal-setup.png" width="790" alt="Terminal output of ./setup.sh --instruct-only through its four steps: Bun found, bun install, bun link and the launcher build each reported as would run, no global skill left to retire, the pre-commit hook already set, then Tooling ready, naming forge init.">
</p>

Then, in the repository to adopt:

```sh
cd ~/code/example-storefront
forge init --project "Example Storefront"
forge oversee --detach
forge oversee resume
forge open
```

`oversee --detach` starts the Overseer in the background and prints its URL, and `open` opens the Bridge in a browser.
Commit the `.gitignore` change `init` made.

<p align="center">
  <img src="docs/images/terminal-init.png" width="720" alt="Terminal output of forge init for Example Storefront, listing the tracker, session instructions, dashboard stub, gitignore entry, CLAUDE.md, retired files, hook, skills and worktrees folder, then oversee --detach printing the Overseer's local URL and oversee resume setting it to running.">
</p>

*Notice `oversee resume`: a new board starts paused, and no ticket builds and no pipeline agent starts until it runs.*

The Questions view asks for the repository's gates. A [pipeline agent](docs/glossary.md#pipeline-agent) proposes them, and
User accepts the proposal there. Then describe the work in the Intake view and ready the draft tickets the product
owner files.

After a `git pull` of this checkout, run `forge update` in each tracked repository; see
[Install version](docs/cli.md#install-version).

## Privacy

Everything is local: plain files in the repository, and a Bridge bound to `127.0.0.1` with no telemetry. What leaves the
machine is what agent sessions send to Anthropic, the vendor of the `claude` CLI, and what reaches the `network` domains
a ticket or gate allows.

## Facts

The program is TypeScript on Bun, with three runtime dependencies: `marked`, `react` and `react-dom`.

## Where next

1. **[The documentation index](docs/README.md)** first. It has the symptom shortcuts for when something is wrong now.
2. **[The overview](docs/concepts/overview.md)** explains the system with no code, and
   **[getting started](docs/operations/getting-started.md)** runs a first board. The
   **[glossary](docs/glossary.md)** defines each term.
3. **[The CLI reference](docs/cli.md)** holds every command, flag, exit code and stored format.
4. **[Contributing](docs/development/contributing.md)** gets a change past the checks.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| The names on this build | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNames.spec.ts` |
| A new board starts paused | `src/lib/tracker-model/constants/OverseerStates.ts` | `DEFAULT_OVERSEER_STATE` | `cli/overseer/OverseerCommand.spec.ts` |
| The machine setup | `setup.ts`, `cli/setup/Setup.ts`; bootstraps `setup.sh`, `setup.ps1` | `runSetup` | `cli/setup/Setup.spec.ts`, `cli/SetupScript.integration.spec.ts`, `cli/setup/BootstrapScripts.spec.ts` |
| The images on this page | `.readme-graphics/regenerate.sh`, `.readme-graphics/render-diagrams.py` | `DIAGRAMS` | read by hand |
