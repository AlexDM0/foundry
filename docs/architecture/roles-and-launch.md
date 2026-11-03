# Roles and launching an agent

> **Question:** What does each role get, and how does a Playbook step become a running session?
> **Time:** 25 minutes.
> **Read first:** [The Pass and the Playbook](the-pass.md), [Watchers](watchers.md).
> **Next:** [Confinement](confinement.md), [Build and review](build-and-review.md), [Customs](customs-and-gates.md).

## In one screen

A [job](../glossary.md#job) on the [board](../glossary.md#board) becomes a [session](../glossary.md#session) in two
halves. A [Playbook](../glossary.md#playbook) step, an [Airlock](../glossary.md#airlock) or a command records the job.
The [Overseer](../glossary.md#overseer) then writes everything a session needs to disk, and a detached
[Watcher](../glossary.md#watcher) runs it. The task arrives afterwards, over the Watcher's socket.

![Seven lanes with time running down. In a lock hold a Playbook step, an Airlock or a command records the job. After the hold DrivePass reads the instruction files, from the data folder or the main line, gets two texts from the wording, stores start.json and the first message, gets a plan from the adapter, writes the plan and launch files, and spawns a Watcher. The Watcher claims the instance, opens its socket and spawns claude. A later Pass sends the first message and writes a .sent marker. An Overseer crash before the claim repeats the steps while start.json keeps its first write, and an unsent message is retried.](../figures/roles-and-launch/launch-sequence.png)

*Notice that `claude` starts with no task: the message arrives last, and a crash in any zone loses nothing.*

- Eight [roles](../glossary.md#role) run an [agent](../glossary.md#agent), listed in [What each role
  gets](#what-each-role-gets). [Job kinds](../glossary.md#job-kind) `merge` and `refresh` have role `null` and run none.
- A role differs by data: a `WorkerProfile`, a model, a [call budget](../glossary.md#call-budget), a
  [report](../glossary.md#report) schema, two texts.
- Launch text is assembled under `cli/` from `resources/` and instruction files, which come from
  [`<data>`](../glossary.md#reading-names) or the [main line](../glossary.md#main-line), never from a
  [ticket](../glossary.md#ticket)'s branch. Vendor flags live in `src/lib/claude-code/ClaudeCodeAdapter.ts`.
- A session id derives from the [tracker](../glossary.md#tracker) id and the job id, so a resume stores nothing.
- When a job on tickets ends, its tokens are read from its [event logs](../glossary.md#event-log) and credited once to
  its ticket's row or review bar, so a second credit adds nothing.

## What each role gets

**A role is a row of settings, and three tables hold them.** `launchProfileOf` in `src/services/overseer/DrivePass.ts`
picks the profile; the first match wins: product owner, onboarder, any [`merge-agent`](../glossary.md#merge-agent), any
other job without a [worktree](../glossary.md#worktree), then builder or reviewer. A
[`<worktrees>`](../glossary.md#reading-names) path below is a folder under the repository.

![Eight roles on the left enter five tests in first-match order. Product owner stops at the first test and onboarder at the second, each taking the short profileOf plus its wrapper. Resolver, merge-fix and resolution-review all stop at the merge-agent test and share WorkerProfiles.profileOf resolver. The Assistant stops at the no-worktree test and takes the short profileOf. Builder and reviewer reach the last test and take WorkerProfiles.profileOf for their own role.](../figures/roles-and-launch/profile-choice.png)

*Notice the middle row: three roles collapse into one profile, so all of them get the resolver's sandbox and tools.
Hatch rights go by role, not by profile. Short `profileOf` is the one in `DrivePass.ts`.*

### Where it runs

| Role | Job kind | Working directory | Model, effort | Profile source |
| --- | --- | --- | --- | --- |
| [`builder`](../glossary.md#builder) | `build` | `<worktrees>/ticket-<id>` | `WORKER_MODEL`, `WORKER_EFFORT` | `WorkerProfiles.profileOf` |
| [`reviewer`](../glossary.md#reviewer) | `review` | `<worktrees>/ticket-<id>` | Same, or [pipeline](../glossary.md#pipeline) `review.model` and `review.effort` | `WorkerProfiles.profileOf` |
| [`resolver`](../glossary.md#resolver) | `merge-agent` | `<worktrees>/ticket-<id>`, or the [refresh](../glossary.md#refresh) worktree | `WORKER_MODEL`, `WORKER_EFFORT` | `WorkerProfiles.profileOf('resolver', ...)` |
| [`merge-fix`](../glossary.md#merge-fix) | `merge-agent` | `<worktrees>/ticket-<id>`, or the refresh worktree | `WORKER_MODEL`, `WORKER_EFFORT` | `WorkerProfiles.profileOf('resolver', ...)` |
| `resolution-review` | `merge-agent` | `<worktrees>/ticket-<id>`, or the refresh worktree | `WORKER_MODEL`, `WORKER_EFFORT` | `WorkerProfiles.profileOf('resolver', ...)` |
| [`product-owner`](../glossary.md#product-owner) | `product-owner` | `<worktrees>/sessions/J<n>` | `WORKER_MODEL`, `WORKER_EFFORT` | `profileOf` in `DrivePass.ts`, then `productOwnerProfileOf` |
| [`assistant`](../glossary.md#assistant) | `assistant` | `<worktrees>/sessions/J<n>` | `ASSISTANT_MODEL`, `ASSISTANT_EFFORT` | `profileOf` in `DrivePass.ts` |
| [`onboarder`](../glossary.md#onboarder) | `onboarder` | `<worktrees>/onboard/J<n>`, detached at the main line's tip | `WORKER_MODEL`, `WORKER_EFFORT` | `profileOf` in `DrivePass.ts`, then `onboarderProfileOf` |

A pipeline `review.effort` outside the vocabulary keeps `WORKER_EFFORT` (`JobLaunch.reviewerLaunchSettingsOf`). A
ticket's `model` and `effort` reach no launch: see
[gap-ticket-model-not-launched](../reference/known-gaps.md#gap-ticket-model-not-launched).

> **As built.** The product owner, Assistant and onboarder take the short profile in `DrivePass.ts`, not the
> `WorkerProfiles` branches written for two of them. See
> [gap-session-profiles-weaker](../reference/known-gaps.md#gap-session-profiles-weaker).

### What bounds it

| Role | Call budget | At budget | Report schema | [Customs](../glossary.md#customs) column |
| --- | --- | --- | --- | --- |
| `builder` | `BUILDER_API_CALL_BUDGET` (150); `RED_HANDOFF_RESUME_CALL_BUDGET` (30) after a [red handoff](../glossary.md#red-handoff) | [Wind-down](../glossary.md#wind-down) message, `WIND_DOWN_GRACE_CALLS` (10) more calls, stop; after a red handoff the session goes red again instead | `BUILDER_REPORT_SCHEMA` | `builder` |
| `reviewer` | `REVIEWER_API_CALL_BUDGET` (75); `RED_HANDOFF_RESUME_CALL_BUDGET` (30) after a red handoff | Same | `REVIEWER_REPORT_SCHEMA` | `reviewer` |
| `resolver` | `RESOLVER_API_CALL_BUDGET` (75) | Stopped, merge refused | `RESOLVER_REPORT_SCHEMA` | `resolver` |
| `merge-fix` | `MERGE_FIXER_API_CALL_BUDGET` (75); `RED_HANDOFF_RESUME_CALL_BUDGET` (30) after a red gate | Stopped, merge refused | `RESOLVER_REPORT_SCHEMA` | `merge-fix` |
| `resolution-review` | `RESOLUTION_REVIEWER_API_CALL_BUDGET` (37) | Stopped, merge refused | `RESOLVER_REPORT_SCHEMA` | `resolution-review` |
| `product-owner` | None | | None | None |
| `assistant` | `ASSISTANT_TURN_CALL_BUDGET` (40) per turn | Interrupted, the turn's open [incidents](../glossary.md#incident) take their default | None | None |
| `onboarder` | None | | `ONBOARDER_REPORT_SCHEMA` | `onboarder` |

A Customs column is the ordered list of checks a role owes. A red handoff follows a failed [gate](../glossary.md#gate)
or Customs check. How a session runs out of calls, and what a stop then causes, is in [Build and
review](build-and-review.md). The columns' checks, the schemas' fields and what happens to a report are in [Customs and
gates](customs-and-gates.md).

> **As built.** The three Airlock columns exist, but `clearCustoms` runs for build, review and onboarder jobs alone. See
> [gap-merge-agents-skip-customs](../reference/known-gaps.md#gap-merge-agents-skip-customs). The fixer's prompt says it
> gets one attempt, while a red gate resumes it. See
> [gap-merge-fix-one-attempt-wording](../reference/known-gaps.md#gap-merge-fix-one-attempt-wording).

### What it can reach

| Role | May ask | Skills | Bash network | Web | Commit signing | Hatch rights |
| --- | --- | --- | --- | --- | --- | --- |
| `builder` | Yes | Off | Ticket `network` plus the gates' | The Bash list; `none` when it is empty | gpg-agent socket if present | Files low-priority tickets only |
| `reviewer` | Yes | Off | Ticket `network` plus the gates' | The Bash list; `none` when it is empty | gpg-agent socket if present | Files low-priority tickets only |
| `resolver` | No | Off | None | `none` | gpg-agent socket if present | Nothing |
| `merge-fix` | No | Off | None | `none` | gpg-agent socket if present | Files low-priority tickets only |
| `resolution-review` | No | Off | None | `none` | gpg-agent socket if present | Nothing |
| `product-owner` | Yes | On | None | `any` | Unsigned | [Filing drafts](../glossary.md#filing-draft) and filing, `intake close` |
| `assistant` | No | Off | None | `none` | Unsigned | Moves on incidents delivered to it |
| `onboarder` | No | Off | None | `none` | Unsigned | Nothing |

Web: `none` turns WebFetch off, a list allows those domains, `any` allows every domain and WebSearch.

"May ask" is the `AskUserQuestion` tool, off through `--disallowedTools`. The [Hatch](../glossary.md#hatch) column
summarises [Control](control-and-hatch.md), which holds the rules. What each profile denies is in
[Confinement](confinement.md#what-each-role-really-gets).

Every `merge-agent` gets the resolver profile, whichever role it holds. A resolution reviewer's profile therefore allows
a commit; its prompt forbids one.

> **As built.** Three commands a prompt tells a session to run fail. A worker's prompt omits `--type`, which
> `ticket add` requires: [gap-worker-filing-omits-type](../reference/known-gaps.md#gap-worker-filing-omits-type). The
> Assistant's job-targeting moves stop at the Hatch:
> [gap-assistant-job-moves-refused-at-hatch](../reference/known-gaps.md#gap-assistant-job-moves-refused-at-hatch). The
> onboarder's `advise` filing is always refused:
> [gap-onboarder-advise-filing](../reference/known-gaps.md#gap-onboarder-advise-filing).

## The launch pipeline

**Six layers separate deciding from running: each layer knows one thing, and only the adapter knows a vendor.**

| Layer | Holds | File |
| --- | --- | --- |
| Policy | Decides that a job exists | `src/lib/tracker-model/Playbook.ts` for builds, reviews, the Assistant and setup onboarding; `src/services/overseer/Airlocks.ts` for merge agents; `src/lib/tracker-model/JobControls.ts` for intake and on-demand onboarding |
| Launch | Reads, picks the folder, assembles the request | `src/services/overseer/DrivePass.ts`, `launchWatcher` |
| Wording | Assembles what a session is told | `cli/overseer/OverseerWording.ts`, `launchTextOf` |
| Port | Vendor-neutral types | `src/lib/agent-launch/` |
| Adapter | Pure rendering of argv, settings, environment and stream lines | `src/lib/claude-code/ClaudeCodeAdapter.ts` |
| Process | Files on disk, then one detached process | `src/services/overseer/WatcherFleet.ts`, `src/lib/watcher/Watcher.ts` |

After the [lock hold](../glossary.md#lock-hold) of a [Pass](../glossary.md#pass) releases, `jobsNeedingAWatcher` selects
what to launch; the rule is in [The Pass](the-pass.md).

## `launchWatcher` in order

**Everything is written before anything runs, so repeating the function is harmless.** The opening figure shows the
order; the twelve steps below are each visible on disk or as a return value.

<details>
<summary>The twelve steps of <code>launchWatcher</code></summary>

1. `InstructionFiles.readingFor` reads the role's files. One missing file returns `instructions-missing`: nothing
   spawns, a [notice](../glossary.md#notice) names the path, and each Pass that is not skipped because the board's
   [fingerprint](../glossary.md#fingerprint) is unchanged tries again. Restoring the file alone launches nothing until
   something else changes or a forced Pass runs. An agent program that does not resolve stops the launch the same way,
   with the notice `agent-program-refused`, and an endpoint this platform cannot bind with
   `watcher-endpoint-does-not-fit`.
2. Create `<worktrees>/hatch/J<n>/requests`.
3. Pick the working directory. `Onboarding.prepareSnapshot` for an onboarder, `workingDirectoryOf` for the rest.
4. `launchFactsOf`, then `request.launchTextOf`, give `firstMessage` and `roleBrief`.
5. `JobResumption.resumeLineOf` and `launchPartsOf`: a resumed instance is told it was interrupted, never handed its
   task again.
6. A fresh session taking over a red handoff adopts its facts (`RedHandoff.adoptRedHandoff`).
7. `JobLaunch.recordJobStart` writes `start.json` once, for a worktree job: the baseline Customs compares against.
8. `JobResumption.storeFirstMessage` writes `first-message-<n>.txt`, for a fresh instance.
9. `sessionOwnerJobIdOf` names the session, and an `AgentLaunchRequest` is assembled.
10. `agentAdapter.planOf` renders the plan, and `WatcherFleet.writeLaunchFiles` writes its files and `launch-<n>.json`.
11. `JobLaunch.recordInstructionsRead` writes `instructions-<n>.json`: the path and content hash of every file read.
12. `WatcherFleet.spawnWatcher` starts the Watcher, detached.

</details>

Spawning twice is safe: the second Watcher finds the claim taken and exits. What a Watcher does from there is in
[Watchers](watchers.md), and every file's lifetime is in the [on-disk atlas](../data-model/on-disk-atlas.md).

> **As built.** Within one Overseer an instance is spawned once, so a Watcher that never claims waits for the next
> Overseer. See [gap-spawn-never-retried](../reference/known-gaps.md#gap-spawn-never-retried).

**The first message is not in argv.** `planOf` never reads `AgentLaunchRequest.firstMessage`. The session reads stdin,
and `JobResumption.deliverFirstMessages` sends the stored text once a Pass finds the Watcher `live`. A Pass sends first
messages before it launches Watchers, so delivery always falls on a later Pass.

> **Why.** The task then survives an Overseer restart between the spawn and the send, and a Watcher not yet listening
> costs one more try. The `.sent` [marker](../glossary.md#marker) is written only after the Watcher took the line. A
> crash between the send and the marker can send the line twice; see the at-least-once window in
> [Watchers](watchers.md).

![Three columns for Passes N, N+1 and N+2, each with three effects in order: send first messages, launch Watchers, Airlock sweep. A build job's Watcher is spawned in Pass N and its task sent in N+1. A merge agent's job is recorded by the sweep at the end of N, its Watcher is spawned in N+1, which that new job forces, and its task is sent in N+2.](../figures/roles-and-launch/launch-across-passes.png)

*Notice that the [sweep](../glossary.md#words-that-mean-several-things) runs last: a merge agent misses the launch
effect of its own Pass. These are the earliest Passes, since a message waits for a `live` Watcher. The full order is in
[The Pass](the-pass.md).*

A resumed instance's first line travels the same way, through `deliverResumeMessages` and
`resume-message-<n>.sent`. Which line that is, is under [Beyond the fresh launch](#beyond-the-fresh-launch).

## Session identity

**A session id is a function of the board and the job, so a resume needs only the job id.** `claudeSessionIdOf` hashes
`sha256(trackerId + "\n" + jobId)` and formats it as a UUID. Every [Watcher instance](../glossary.md#watcher-instance)
of a job gets the same id: instance 1 runs `--session-id`, later ones `--resume`.

`JobResumption.sessionOwnerJobIdOf` adds one exception, read from the log. A build launched after a build of the same
[attempt](../glossary.md#attempt) that ended `built` carries on that builder's session.

![Four jobs on ticket 003. J7, a build, starts session S with session-id and ends built. J8, a review, has its own session and sends the ticket back. J9, a build of the same attempt at instance 1, runs resume on session S and ends failed. J10, a build of attempt 2, has its own session.](../figures/roles-and-launch/session-owner.png)

*Notice J9: a fresh job folder and full call budget, on a session that remembers everything J7 did.*

`AgentLaunchRequest.resume`, which selects `--resume`, is true for a later instance and for a job whose session owner is
another job. J9's first message is `reviewFindingsMessageOf`, carrying the newest `## Review <round>` section. How job,
instance, session and attempt relate is in [Watchers](watchers.md).

## The child environment

**A session inherits five variables and nothing else.** `launchEnvironmentOf` copies `INHERITED_VARIABLE_NAMES` (`HOME`,
`PATH`, `USER`, `LANG`, `TMPDIR`) where set, then adds the job's own. The adapter then filters and extends the result.

| Step | Effect | Symbol |
| --- | --- | --- |
| Inherited | The five names above | `INHERITED_VARIABLE_NAMES` |
| Job's own | `AGENT_PROGRESS_V2_JOB_ID`, `AGENT_PROGRESS_V2_HATCH_DIRECTORY` | `launchWatcher` |
| Stripped | Variables that would make `claude` act as a nested session | `CLAUDE_NESTING_VARIABLES` |
| Git by environment | `GIT_CONFIG_COUNT` and its keys: `core.hooksPath` always, `commit.gpgsign=false` when unsigned | `gitConfigurationOf` |

Both product variables set means a verb relays through the Hatch (`jobContextOfThisProcess`); one alone counts as no
job. The adapter removes the nesting variables again from whatever request it is given, so a request built elsewhere
cannot make `claude` think a parent session runs it. How a verb uses the two job variables is in [Under a job: the
Hatch](../cli.md#under-a-job-the-hatch).

## A rendered launch

**This is what `planOf` produces for job J7, builder of #003 'Double-click a role to edit it'.** The output comes from
running the real adapter on a synthetic request, shortened where marked. Its one network domain is an example.

```text
claude -p
  --input-format stream-json --output-format stream-json --verbose   the Watcher's two pipes
  --session-id 8024ac0a-e0e9-89cb-98e2-c41e9ca6b250                  --resume <same id> on a later instance
  --model opus --effort medium
  --setting-sources project                                          User's own Claude Code settings stay out
  --strict-mcp-config --mcp-config <data>/jobs/J7/mcp.json           {"mcpServers":{}}: no MCP server
  --settings <data>/jobs/J7/settings.json
  --agents <data>/jobs/J7/agents.json                                {} in every profile, see below
  --append-system-prompt-file <data>/jobs/J7/role.md                 the roleBrief
  --json-schema '{ ...BUILDER_REPORT_SCHEMA... }'                    inline, only for a role with a report
  --permission-mode auto --permission-prompt-tool stdio
  --disable-slash-commands                                           absent only for the product owner
  --disallowedTools WebSearch                                        plus WebFetch at web none, AskUserQuestion at no ask
```

<details>
<summary><code>settings.json</code>, annotated</summary>

```jsonc
// <data>/jobs/J7/settings.json, role lists shortened
{
  "includeCoAuthoredBy": false,
  "attribution": { "commit": "", "pr": "" },        // no attribution from the vendor
  "autoMemoryEnabled": false,
  "claudeMdExcludes": [ "<parent of the repository>/CLAUDE.md", "...", "<home>/.claude/CLAUDE.md" ],
                                                    // three names in every folder above the root, and the home file
  "sandbox": {
    "enabled": true, "failIfUnavailable": true,     // no sandbox, no session
    "allowUnsandboxedCommands": false, "autoAllowBashIfSandboxed": true,
    "network": { "allowedDomains": ["registry.npmjs.org"], "strictAllowlist": true },
    "filesystem": {
      "allowWrite": ["//<worktrees>/hatch/J7"],     // plus a gate's `writes`
      // <git>: the repository's .git folder
      "denyWrite": ["//<data>", "//<monitor>", "//<worktrees>/ticket-003/.claude", "//<git>/packed-refs", "..."],
      "denyRead": ["//<data>/jobs/*/launch-*.json", "//<monitor>/watchers", "//<home>/.ssh", "..."]
    }
  },
  "permissions": {
    "allow": ["Read", "Agent", "Edit(//<worktrees>/ticket-003/**)", "Write(//<worktrees>/ticket-003/**)",
              "Bash(bun *)", "Bash(git status *)", "...", "WebFetch(domain:registry.npmjs.org)"],
    "deny": ["Edit(//<data>/**)", "Write(//<data>/**)", "...", "Bash(git push *)", "Bash(git -C *)", "..."]
  },
  "hooks": { "PreToolUse": ["Bash and WebFetch run: agent-progress-v2 hook bash-domains --allow registry.npmjs.org"] }
}
```

- A leading `//` anchors at the filesystem root; one slash would anchor at the settings file's folder (`rootAnchored`).
- `Edit` and `Write` are allowed in the working directory alone, so a session reaches its Hatch by running the CLI.
- Each `claudeMdExcludes` path is absolute. The walk starts one folder above the repository root, so the root's own
  `CLAUDE.md` still loads.

</details>

`--permission-prompt-tool stdio` routes permission requests to the Watcher, and the plan carries one [standing
reply](../glossary.md#standing-reply): the Watcher denies every request but a question, so no session waits on a prompt
nobody sees (`DENY_EVERY_PERMISSION_BUT_A_QUESTION`). `STANDING_DENIAL_MESSAGE` is the one sentence the adapter words.

What each line defends is in [Confinement](confinement.md).

> **As built.** `report.schema.json` is written, but the argv passes the schema inline. See
> [gap-dead-code-and-unused-states](../reference/known-gaps.md#gap-dead-code-and-unused-states). `READ_ONLY_SUBAGENT`
> and `EDITING_SUBAGENT` never render, because every profile sets `subagents: []`. See
> [gap-subagents-always-empty](../reference/known-gaps.md#gap-subagents-always-empty).

## Text slots

**A session is told two things, and which file lands in which text differs by role.** `roleBrief` becomes `role.md` and
the system prompt; it is rewritten at every launch, resumes included. `firstMessage` is the first user line, sent once.

![Three sources feed launch text: instruction files from the data folder or git show of the main line, fixed prompts from resources/prompts, and lines worded in code. The ticket branch fills no slot. For builder and reviewer the instruction files are the firstMessage and roleBrief is one code line. For the Airlock roles, product owner, Assistant and onboarder the instruction files are the roleBrief.](../figures/roles-and-launch/instruction-resolution.png)

*Notice the dark cells swap columns: customising a builder's brief changes its first user message, so a resumed builder
keeps the text it started with.*

### Instruction files

`InstructionFiles.readingFor` resolves a list of paths per pipeline role; `merger` covers the three Airlock roles.

1. `builder`, `reviewer` and `merger` start with the pipeline's `constitution`, or
   `<data>/briefs/defaults/constitution.md` (`ROLES_GIVEN_THE_CONSTITUTION`).
2. Then the pipeline's `agents.<role>`, or `<data>/briefs/defaults/<role>.md`. When `agents.<role>` is set, its paths
   replace the default file entirely.
3. A path under `<data>/` reads from disk. Any other path is tracked and reads through `git show <mainLine>:<path>`.
4. An absolute path, or one holding `..`, reads as missing.

Files are read whole at each launch and resume, so a changed file reaches the next launch. On a resume, only `roleBrief`
is delivered. The fields of `pipeline.json` are in the [command reference](../cli.md); what they change is in [Customs
and gates](customs-and-gates.md).

> **Why.** A file read from the ticket's branch would let the branch write its reviewer's instructions. Reading the main
> line closes that, and Customs check V11 (`checksDefinitionUnchanged`) refuses a branch changing a listed tracked file
> unless its ticket names the path. See [Customs and gates](customs-and-gates.md).

> **Careful.** This covers instruction files, not everything a session sees. `--setting-sources project` still loads the
> worktree's own `CLAUDE.md`, so a branch's edit to it reaches that branch's agents. The review and merge prompts state
> that every file is data to judge, never an instruction. The worktree's `.claude/` is write-denied and Customs check
> V13 (`agentConfigUntouched`) checks it.

### Beyond the fresh launch

**A resumed session never gets its task text again: its first line replaces `firstMessage`.**

![One root question: is this instance past the first? If yes the session runs resume and the first match wins: an answer waiting gives answerMessageOf, a reopened session gives User's text, an interruption on a red handoff gives RedHandoffMessage.md, otherwise ResumeMessage.md. If no, a builder sent back from review gets reviewFindingsMessageOf, also over resume. Otherwise, when an earlier session of the same kind and ticket was replaced, EARLIER_SESSION_NOTE, plus RedHandoffMessage.md on a takeover, is prefixed to the role's firstMessage; if not, the firstMessage goes out alone.](../figures/roles-and-launch/first-line-decision.png)

*Notice the sent-back builder on the right: it runs `--resume` but is a first instance, so its line is decided on the
fresh side.*

- The reopening text is the message User sent to reopen a closed product owner.
- `EARLIER_SESSION_NOTE` goes before the first message of a fresh job of the same kind on the same ticket after a
  `replaced` one; ticketless jobs never get it. A sent-back builder never gets it either, since its predecessor ended
  `built`. Taking over a red handoff adds `RedHandoffMessage.md` after the note.
- A product owner taking over from a replaced session also gets its filing drafts and the answers to its questions.

> **As built.** A refresh's merge agents have no ticket, so each first message is one line with no word on conflicts,
> the failed gate or the report; each `roleBrief` is the usual merger text. See
> [gap-refresh-resolver-one-line](../reference/known-gaps.md#gap-refresh-resolver-one-line).

### Installed against read at runtime

Seven texts are copied into `<data>/briefs/defaults/` at install and change only on `update`; the other seven stay in
`resources/prompts/` and are read from there. The installed file is the one to look at. To customise a role, list a path
in the pipeline's `agents`.

<details>
<summary>Every text, where it is read and when it changes</summary>

| Text | Written by | Read from | Changes when |
| --- | --- | --- | --- |
| `resources/prompts/BuildPrompt.md`, installed as `builder.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/prompts/ReviewPrompt.md`, installed as `reviewer.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/prompts/MergerBrief.md`, installed as `merger.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/prompts/ProductOwnerPrompt.md`, installed as `productOwner.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/templates/Constitution.md`, installed as `constitution.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/templates/OnboarderBrief.md`, installed as `onboarder.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `resources/templates/AssistantBrief.md`, installed as `assistant.md` | `init`, `update` | `<data>/briefs/defaults/` at each launch | `update` runs |
| `ResolvePrompt.md`, `MergeFixPrompt.md`, `ResolutionReviewPrompt.md`, `OnboarderPrompt.md`, `RedHandoffMessage.md` | Nobody | `resources/prompts/` at each use | The checkout changes |
| `WindDownMessage.md`, `ResumeMessage.md` | Nobody | `resources/prompts/` once, at Overseer start | The next Overseer start |

</details>

Install fills only product names, leaving job placeholders such as `{{ticketId}}` and `{{jobId}}` for launch.
`filledTemplateOf` fills `{{...}}` placeholders at launch in one substitution, so a ticket body holding `{{x}}` is not
filled in turn, and an unknown placeholder stays as written. Install itself is in [The CLI and
install](cli-and-install.md).

## The vendor seam

**The launch path reaches a vendor's flags and wire format only through one port.** `AgentAdapter` in
`src/lib/agent-launch/AgentAdapter.ts` has six operations, a `vendor` name and a `capabilities` record.
`agentAdapterOfThisProcess` in `cli/CommandContext.ts` chooses `CLAUDE_CODE_ADAPTER` once per process.

![Layers top to bottom. Launch and session code calls the AgentAdapter port, whose six operations are planOf, sessionIdOf, eventsOf, chatLineOf, answerLineOf and interruptLineOf. agentAdapterOfThisProcess in cli/CommandContext.ts chooses the implementation: CLAUDE_CODE_ADAPTER or a dashed second adapter. A band holds what a second vendor replaces, the adapter and its session. The Watcher sits outside it, reading the plan from launch-<n>.json, which the launch code wrote, and exchanging stdin and stdout lines with claude.](../figures/roles-and-launch/vendor-seam.png)

*Notice the Watcher is not below the seam: it executes a plan and logs lines, and knows no vendor.*

`fakeAgentAdapter` in `src/testing/FakeAgentAdapter.ts` is a second implementation, chosen when
`AGENT_PROGRESS_V2_FAKE_AGENT` is on (`FAKE_AGENT_VARIABLE`), so the Overseer's specs run through the same port.

**Calls are counted as distinct top-level message ids.** `JobLaunch.sessionReadingOf` counts `assistant-turn` events
with `parentToolUseId` null, so a subagent's turns cost no budget and one call's repeated lines count once.

A second vendor also touches install, transcript reading and the Customs agent-configuration patterns, which sit outside
the port; [Porting](../development/porting.md) lists each file. The stream contract and its evidence are in the [Claude
probe](../development/overseer-claude-probe.md).

## Token crediting

**A job's tokens are read back from its event logs when it ends, so nothing has to report them and a job is credited
once.**

![A vertical flow with a worked example. Event logs of every instance sum to 1000. Deduplicating by message id gives 900. The largest logged agent-stopped total is subtracted: 0 on the first credit, 900 if the function is called again for the same job. The tokens still to credit are 900, then 0. They are split over the tickets or go to the newest review bar, and one agent-stopped record is logged, which a dashed loop reads back on the next credit.](../figures/roles-and-launch/token-crediting.png)

*Notice the right column: called again for a logged job, the function subtracts the stored 900 and credits nothing.*

- `creditedTurnsOf` in `src/services/overseer/EndedJobTokens.ts` reads `assistant-turn` events from every instance's
  log; a malformed log is skipped.
- `TokenCrediting.sessionTokensOf` keys turns by message id. A call's input counts from its first line, its output is
  the largest any line reports, and subagent turns count.
- The credited figure is `totalInputTokens`: fresh input plus both cache figures. Output is logged, not credited.
- `tokensStillToCreditOf` subtracts the largest total already logged under that job id.
- `creditsOf` splits evenly over the job's tickets, the remainder going to the first.
- A review job's share goes to its ticket's newest [review bar](../glossary.md#review-bar), whatever that bar's status.
  Others go to the ticket's [row](../glossary.md#row), merge agents included. Credits land in that row's or bar's token
  column.
- A credit with no row or review bar to land on is dropped with a verdict such as `ticket-without-row`, never a
  [refusal](../glossary.md#refusal): the agent has already finished.

Two routes run inside a lock hold. An Airlock hold runs `creditJobsEndedInTheHold` for the jobs that hold removed. The
Pass hold runs `creditJobsTheLogEndedUncredited`, which scans the log and so catches jobs this hold ended and jobs a
verb's own hold ended. The scan skips any job id that already has an `agent-stopped` record, and the Airlock route sees
only jobs its own hold removed, so neither route credits a job a second time. `tokensStillToCreditOf` is the backstop:
called again for a job id already logged, it credits only growth. Ticketless jobs (the Assistant, the product owner, the
onboarder, a refresh's agent) credit nothing, and a job with no turns logs nothing.

The token column of a ticket or row and the `--tokens` flag are in the [command
reference](../cli.md#the-handoff-and-the-token-column). What the figures measure, and why they
need not agree with `usage`, is in [Measurement](measurement.md).

## The two skills

**Skills serve User's own sessions; an Overseer job loads one only for intake.** `init` and `update` install both into
the tracked repository's `.claude/skills/`.

| Skill | Audience | Loads | Ends with |
| --- | --- | --- | --- |
| [`agent-po-v2`](../../skills/agent-po/SKILL.md) | Any session asked to file a ticket | By its trigger, by `/agent-po-v2`, and as the product owner's first line | In User's session, the question "Ready these to build?". Under the Overseer, `intake close`; it never readies. |
| [`agent-progress-orchestrate-v2`](../../skills/agent-progress-orchestrate/SKILL.md) | The optional wrapper session around a running Overseer | Only when asked to run the board | Never ends: it stays with User, and never drives a job or answers an incident. |

The source folders are `skills/agent-po/` and `skills/agent-progress-orchestrate/`; the installed names add `-v2`. See
[Reading names](../glossary.md#reading-names).

Every role but the product owner runs with `--disable-slash-commands`, so no skill reaches those roles; each is told
only the `roleBrief` and `firstMessage` of [Text slots](#text-slots). The product owner's profile sets `skills: true`,
and its first message is `/agent-po-v2 <request>`. Neither skill lists commands: both name `agent-progress-v2 help` and
`<data>/reference.md`. The session-start hook prints nothing under a job, so a job's session gets no session
instructions.

The intake session is in [The Assistant and intake](assistant-and-intake.md).

## Invariants

1. Every file a launch needs is on disk before a Watcher is spawned.
2. Repeating `launchWatcher` for an unclaimed instance is harmless and starts at most one child.
3. The first message never travels in argv, and a resumed instance never receives its task again.
4. A session id is derived, never stored or random.
5. A child environment holds the allowlisted variables, the job's two, and git configuration; nothing else is inherited.
6. Instruction files come from `<data>` or the main line, never from the ticket's branch.
7. Launch text is assembled under `cli/` from `resources/` and instruction files, and vendor flags live under
   `src/lib/claude-code/`.
8. A job id is credited only the growth past its largest logged `agent-stopped` total, and the log scan skips a job id
   that already has such a record (`creditedJobIds`).

## In the code

<details>
<summary>Concept, path, symbol and the spec that holds it</summary>

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| Launch order | `src/services/overseer/DrivePass.ts` | `launchWatcher`, `jobsNeedingAWatcher` | `cli/overseer/OverseerDrivePass.spec.ts`, `src/services/overseer/CrashMatrix.spec.ts` |
| Profile choice | `src/services/overseer/DrivePass.ts` | `launchProfileOf` | No spec of its own; the profile specs hold its results |
| Worker profiles | `src/services/overseer/WorkerProfiles.ts` | `profileOf`, private `resolverProfileOf` | `src/services/overseer/WorkerProfiles.spec.ts`, `src/services/overseer/WorkerProfiles.resolver.integration.spec.ts` |
| Launch text | `cli/overseer/OverseerWording.ts` | `launchTextOf` | `cli/overseer/OverseerWording.build.spec.ts`, `cli/overseer/OverseerWording.airlock.spec.ts`, `cli/overseer/OverseerWording.intake.spec.ts` |
| Instruction files | `src/services/overseer/InstructionFiles.ts` | `readingFor` | `cli/overseer/OverseerWording.instructions.spec.ts` |
| Resume and first message | `src/services/overseer/JobResumption.ts` | `sessionOwnerJobIdOf`, `deliverFirstMessages` | `src/services/overseer/JobResumption.integration.spec.ts` |
| Rendered plan | `src/lib/claude-code/ClaudeCodeAdapter.ts` | `planOf`, `claudeSessionIdOf` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Child environment | `src/lib/agent-launch/LaunchEnvironment.ts` | `launchEnvironmentOf` | `src/lib/agent-launch/LaunchEnvironment.spec.ts` |
| Adapter choice | `cli/CommandContext.ts` | `agentAdapterOfThisProcess` | No spec of its own |
| Stream mapping | `src/lib/claude-code/ClaudeStreamMapper.ts` | `claudeStreamEventsOf` | `src/lib/claude-code/ClaudeStreamMapper.spec.ts`, `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` |
| Token sums | `src/services/lifecycle/TokenCrediting.ts` | `sessionTokensOf`, `tokensStillToCreditOf` | `src/services/lifecycle/TokenCrediting.spec.ts` |
| Ended jobs | `src/services/overseer/EndedJobTokens.ts` | `creditJobsTheLogEndedUncredited` | `src/services/overseer/EndedJobTokens.spec.ts` |
| Landing a credit | `src/lib/tracker-model/TokenCredits.ts` | `recordAgentStop` | `src/lib/tracker-model/Board.tokens.spec.ts` |
| Installed briefs | `cli/adoption/constants/ClaudeCodeInstall.ts` | `CLAUDE_CODE_INSTALL` | `cli/adoption/InstalledFileGeneration.spec.ts` |

</details>
