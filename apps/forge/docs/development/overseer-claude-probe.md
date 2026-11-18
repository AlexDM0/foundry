# The Claude Code contract and its evidence

> **Question:** What does this system depend on from Claude Code, and what was observed to justify each choice?
> **Time:** 10 minutes for the contract, 30 with the probe record.
> **Next:** [Guards and testing](guards-and-testing.md), [Platform status](platform-status.md).

## In one screen

Claude Code is reached through one port and a line protocol. A [Watcher](../glossary.md#watcher) spawns `claude -p` and
pipes JSON lines, in the format Claude Code calls stream-json. `CLAUDE_CODE_ADAPTER` builds the launch and translates
those lines, so code above the `AgentAdapter` port reads events and never the vendor's shapes.

![Six stdout line types on the left map to eight AgentSessionEvent kinds on the right: system init gives started, assistant gives assistant-turn and tool-call, user gives tool-result, control_request for AskUserQuestion gives question, rate_limit_event gives usage-window, result gives permission-denied and result, and any other line gives no event. Below, four stdin lines, all written by the Watcher: chatLineOf renders a user line, answerLineOf a control_response allow, interruptLineOf a control_request interrupt, and the standing reply in planOf a control_response deny.](../figures/claude-probe/stream-mapping.png)

*Notice how little is read: every line type outside these six, and every `system` subtype but `init`, maps to nothing.*

- The contract was observed on Claude Code 2.1.311, and no code checks the version.
- A [session](../glossary.md#session) starts with no task. Its first message arrives as a stdin line.
- A [job](../glossary.md#job)'s session id is computed, and the board never stores it: a hash of the
  [tracker](../glossary.md#tracker) id and the owning job's id, which the board's [log](../glossary.md#log) identifies.
- Every permission request except a question is denied at once by the Watcher's
  [standing reply](../glossary.md#standing-reply).
- Only a rate limit event whose overall status is `rejected` stops work, not one rejected window under overage.
- At run time this system reads one kind of Claude Code file: subagent transcripts under `$CLAUDE_CONFIG_DIR/projects/`
  (else `~/.claude/projects/`). Install also merges a hook into the repository's Claude settings.
- Most choices rest on a probe, a scripted run of the real `claude` CLI on 2026-10-27, recorded below as P1 to P17 (no
  P12). The contract tables mark the flags and keys no probe covers. Two selected outcomes do not hold in the code and
  three hold in part, as [the ledger](#what-was-selected-against-what-runs) shows. One later [scratch
  run](#a-scratch-run-outside-the-probe-record) sits outside that record.

## The contract in one page

This section is the home of the vendor contract.

### Version

**The contract holds for version 2.1.311.** Every fixture records `claude_code_version` 2.1.311. The `started` event
carries `vendorVersion`, and nothing reads it, so a different version runs without a check.

### Command line

**`argvOf` in `src/lib/claude-code/ClaudeCodeAdapter.ts` builds one command with no shell.** The Probe column names the
records that use or discuss the flag; "none" means no probe names it.

| Flag | Value | Why | Probe |
| --- | --- | --- | --- |
| `-p` | | Headless session | all |
| `--input-format`, `--output-format` | `stream-json` | The line protocol | all |
| `--verbose` | | Part of every probe's command | all |
| `--session-id` | The derived id | First instance of a session | P1, P2, P7, P8 use a fixed id |
| `--resume` | The same id, in place of `--session-id` | A later [instance](../glossary.md#watcher-instance), or the first instance of a job carrying on an earlier [builder](../glossary.md#builder)'s session | P6 |
| `--model`, `--effort` | From the job | The job's model and effort | all for `--model`, none for `--effort` |
| `--setting-sources` | `project` | The [worktree](../glossary.md#worktree)'s `CLAUDE.md` and project hooks load; user-layer settings do not (user instruction files need `claudeMdExcludes`, P2) | P2, P13, P16 |
| `--strict-mcp-config` | | Connector tools appear unpredictably without it | P4 |
| `--mcp-config` | `mcp.json`, holding `{ mcpServers: {} }` | No MCP server | none |
| `--settings` | `settings.json` | See the next table | P2, P4, P5 |
| `--agents` | `agents.json` | Subagent definitions | P9 gave the definitions inline. A one-off check on 2.1.311 with `-p` gave a file path: `{}` was accepted, and a named agent appeared in the session's `init` line |
| `--append-system-prompt-file` | `role.md` | The role brief | none |
| `--json-schema` | The schema as inline text, only for a [job kind](../glossary.md#job-kind) with a [report](../glossary.md#report) schema | Forces a `structured_output` on `result` | P1, P6 |
| `--permission-mode` | `auto` | Questions still arrive under it | P1 |
| `--permission-prompt-tool` | `stdio` | Permission requests arrive on stdout | P1 |
| `--disable-slash-commands` | Unless the role's worker profile (`WorkerProfile`) has `skills` | Removes skills, keeps subagents | P3, P11 |
| `--disallowedTools` | `WebSearch`, `WebFetch`, `AskUserQuestion` as the profile says | Removes a tool outright | none |

All files sit in the job's folder. `CLAUDE_JOB_FILE_NAMES` names them: `settings.json`, `agents.json`, `mcp.json`,
`role.md` and, only for a job kind with a report schema, `report.schema.json`.

> **As built.** `report.schema.json` is written and never read, since the flag carries the schema inline. See
> gap-dead-code-and-unused-states.

### Settings keys

**`settingsOf` writes these keys and no others.** In a settings path, a leading `//` anchors at the filesystem root and
one `/` at the file's own folder, so `rootAnchored` prefixes every absolute path with a slash.

| Key | Value | Probe |
| --- | --- | --- |
| `includeCoAuthoredBy`, `attribution` | `false`, empty `commit` and `pr` | none |
| `autoMemoryEnabled` | `false` | P9 |
| `claudeMdExcludes` | Instruction files in every folder above the repository, and the home folder's `.claude/CLAUDE.md` | P2 |
| `sandbox.enabled`, `allowUnsandboxedCommands` | `true`, `false` | P4 |
| `sandbox.failIfUnavailable`, `autoAllowBashIfSandboxed` | `true`, `true` | P4, P5 (set in their settings files, not tested on their own) |
| `sandbox.network.allowedDomains`, `strictAllowlist` | The profile's list, `true` | P4 |
| `sandbox.network.allowUnixSockets` | Only with signing sockets | P14 |
| `sandbox.filesystem.allowWrite` | The [Hatch](../glossary.md#hatch) folder and the writable roots | P11 |
| `sandbox.filesystem.denyWrite`, `denyRead` | The profile's roots | P5, P14 |
| `permissions.allow` | `Read`, `Agent`, `Edit` and `Write` of the worktree, `Bash(<prefix> *)`, `WebFetch(domain:…)` | P5, P9 |
| `permissions.deny` | `Edit`, `Write` and `Read` per root, each bare and with `/**`, then `Bash(<prefix> *)`, then `WebFetch(domain:localhost)` and `WebFetch(domain:127.0.0.1)` when the profile's web domains are `any` | P5, P9 |
| `hooks.PreToolUse` | The network guard, on matchers `Bash` and `WebFetch`, when the profile has one | P4 |

![Nested folders: the job worktree inside the repository root, inside the home folder. The upward walk loads the worktree's CLAUDE.md and the repository root's CLAUDE.md, which claudeMdExcludes does not name. From there up, every instruction file is excluded, the home folder's .claude/CLAUDE.md included.](../figures/claude-probe/claude-md-walk.png)

*Notice the repository root's own file stays loaded: `instructionFileExclusionsOf` starts at the root's parent.*

The guard is `forge hook bash-domains --allow <domains>`. It reads `tool_name`, `tool_input.allowed_domains`
and `tool_input.url` from stdin. It denies by printing a `hookSpecificOutput` document with `permissionDecision` `deny`,
and prints nothing to let a call go on (`cli/hooks/BashDomainsHook.ts`). The install adds one more hook, `SessionStart`,
to the tracked repository's Claude settings.

### Lines on stdin

**A Watcher writes one JSON object per line, and four shapes exist.** A session is turns on one pipe pair, and the same
id continues it.

![Time runs down across Overseer, Watcher and claude -p: the Overseer sends write frames, the Watcher turns each into one user line, and a line written mid-turn folds into the open turn, so one result answers both. A close-input frame closes stdin and the session exits 0. A later Watcher instance starts claude with --resume and the same id, and its first user line carries the resume message.](../figures/claude-probe/session-on-the-wire.png)

*Notice the first `user` line goes in before `system` init comes out, and the second instance shares only the id.*

`chatLineOf`, `answerLineOf` and `interruptLineOf` are in `src/lib/claude-code/ClaudeStreamLines.ts`; the standing reply
is data in the launch plan that `planOf` returns.

```json
{"type":"user","message":{"role":"user","content":"<text>"}}
{"type":"control_response","response":{"subtype":"success","request_id":"<id>","response":{"behavior":"allow","updatedInput":{"questions":[],"answers":{"<question text>":"<label>"}}}}}
{"type":"control_request","request_id":"interrupt","request":{"subtype":"interrupt"}}
{"type":"control_response","response":{"subtype":"success","request_id":"<id>","response":{"behavior":"deny","message":"<standing denial>"}}}
```

- A chat line sent during a turn folds into that turn (P8), so one `result` can answer two lines.
- `updatedInput.questions` is rebuilt from the `question` event: `question`, `header`, `multiSelect`, and each option's
  `label` and `description`. Any other field of the request's input is dropped.
- Only the [Assistant](../glossary.md#assistant) session writes the interrupt, in
  `src/services/overseer/AssistantSession.ts`, when the open turn reaches `ASSISTANT_TURN_CALL_BUDGET` top-level API
  calls (`callsSinceLastResult`). No probe or fixture records one.
- Closing stdin ends a session once its turn ends, with exit 0 (P7). A `close-input`
  frame does this.

### Lines on stdout

**`claudeStreamEventsOf` switches on `type`, and an unrecognised line is no event, never an error.** The Watcher logs
every line regardless, so a line the mapper ignores stays in the event log.

| Stream field | Event field | Rule |
| --- | --- | --- |
| `system`: `session_id`, `claude_code_version`, `model`, `tools` | `started` | Only `subtype` `init` |
| `assistant`: `message.id`, `model`, `usage` | `assistant-turn` | Text blocks joined; `parent_tool_use_id` kept, so a subagent's turn is told apart |
| `assistant`: `tool_use` block | `tool-call` | `inputSummary` is the input's JSON cut to `INPUT_SUMMARY_CHARACTERS` (200) |
| `user`: `tool_result` block | `tool-result` | `is_error` kept; plain text in a `user` line gives nothing |
| `control_request` | `question` | Only `can_use_tool` for `AskUserQuestion`; `request_id` kept |
| `rate_limit_event`: `rate_limit_info` | `usage-window` | See [Rate limit events](#rate-limit-events) |
| `result`: `permission_denials[]` | `permission-denied` | Emitted before the `result` event |
| `result` | `result` | `isError` when `is_error` or `subtype` is not `success`; `structured_output` is the report |
| `result`: `modelUsage` | `result.usageTotals` | Per model, subagents included |
| `result`: `usage.iterations[-1]` | `result.contextTokens` | Input plus both cache figures of the last call |

What each event does to a job is `applyWatcherEvents` in `src/services/overseer/DrivePass.ts`.

> **As built.** Nothing reads `result.isError`, `result.usageTotals`, `started.vendorVersion` or `started.tools`. See
> gap-dead-code-and-unused-states.

> **As built.** The mapper never reads `api_error_status`, so a `result` that is an error moves a running job like a
> clean one. See gap-429-result-not-read.

### Permission requests

**Only a question waits, and most calls never get that far.** Claude Code settles most tool calls itself.
`DENY_EVERY_PERMISSION_BUT_A_QUESTION` is the launch plan's one standing reply for the rest, and the Watcher applies it
without the [Overseer](../glossary.md#overseer), so no session waits on a Watcher nobody watches.

![A tool call enters Claude Code, where the deny rules and the auto mode classifier settle it: allowed calls run, and refused ones appear in the result's permission_denials and map to permission-denied. Only what they leave open comes out as a can_use_tool control_request. The Watcher denies it at once unless the tool is AskUserQuestion, which waits as a question for the Overseer.](../figures/claude-probe/permission-fork.png)

*Notice the Watcher's fork is a backstop: a call Claude Code settles never reaches it.*

The Watcher parses a line only to match the rule data the launch plan hands it, so the vendor knowledge stays in the
adapter.

### Session id and resume

**`claudeSessionIdOf` hashes the tracker id and the session owner's job id into a UUID.** It takes the first 32 hex
digits of `sha256(scope + "\n" + jobId)` and sets the version digit to `8` and the variant bits.

The session owner is the job itself, or, for a build job sent back by its review in the same
[attempt](../glossary.md#attempt), the builder it carries on. `sessionOwnerJobIdOf` in
`src/services/overseer/JobResumption.ts` finds it from the board's log, and Build and
review has the flow. Such a job's first instance launches with `--resume`.

P6 resumed a fixed version 4 id in the original working directory, with the settings file re-rendered at another path.
No probe tried a version 8 id: the only evidence Claude Code accepts one is live sessions running with it.

### Process groups

**The child leads its own process group, and a Bash tool call does not stay in it.**

![A Watcher or Regrouping signals the recorded process group, which holds claude, so claude is killed. Claude Code started the Bash tool as the leader of a second group holding zsh, the command and its children. The signal never reaches that group, so the command survives, reparented to launchd.](../figures/claude-probe/bash-group-survives.png)

*Notice the signal stops at the first group. The [ledger](#what-was-selected-against-what-runs) lists this as P7's
selection that holds only in part.*

The Watcher spawns `claude` with `detached: true`, and P7 recorded the second group. A session whose Watcher died keeps
working until its turn ends, then exits 0 on the closed stdin (P7).

> **As built.** Every stop of a session goes through the `ProcessSupervision` port in
> `src/lib/process-identity/ProcessSupervision.ts`: `treeMembersOf` lists the groups of the leader's descendants through
> their parent ids, and `stopTree` signals each of them with the recorded group. The walk needs a live parent, so a
> tree whose leader died with its Watcher is not reached, and its Bash command outlives the kill. See
> gap-bash-group-survives-kill.

### Rate limit events

**Only a top-level `rejected` stops requests.**

![Three rate limit cases from P10. With top-level status rejected, requestsRefused is true and the turn fails with a 429 result; with status allowed_warning over a rejected five_hour window, requestsRefused is false and the turn answers normally. An API key login gets no event at all, one retry and an error result.](../figures/claude-probe/rate-limit-top-level.png)

*Notice `requestsRefused` follows the top row alone: the window below it never changes the outcome.*

A `rate_limit_event` carries `rate_limit_info`, and the mapper reads:

| Field | Becomes | Note |
| --- | --- | --- |
| `status` | `status`, and `requestsRefused` when it equals `rejected` | Values seen: `allowed`, `allowed_warning`, `rejected` |
| `rateLimitType` | `window` | Values seen: `five_hour`, `seven_day` |
| `resetsAt` | `resetsAt` as an ISO stamp | Epoch seconds on the wire |
| `utilization` | `utilization` | Falls back to `unifiedWindows.<window>.utilization`, then 0 |

Overage is paid use past the plan's limit. A rejected turn's `result` has `is_error: true` and `api_error_status` 429,
yet `subtype` `success`. The events come only with a subscription login (P10).

### Transcript layout

**Claude Code keeps transcripts per working directory, and at run time this system reads only subagent files.**

![Under <config>/projects/, <config> being $CLAUDE_CONFIG_DIR or else ~/.claude, sits one folder per slug: the usage command walks the slug of the repository root, where no job session lives, and subagentFactsOf finds one session by its id in every folder, which is the slug of the job worktree. A session folder holds subagent transcripts, a .meta.json beside each and workflow runs, while the main transcript and each run's journal go unread. So usage never reaches a job session's transcripts.](../figures/claude-probe/transcript-layout.png)

*Notice that only `usage` builds a slug, from the repository root, so only the reader that finds a session by its id
reaches a job's session.*

The transcript root is `$CLAUDE_CONFIG_DIR/projects/`, else `~/.claude/projects/` (`claudeConfigFolderOf` in
`src/lib/claude-code/ClaudeConfigFolder.ts`).

| Path under `<config folder>/projects/<slug>/` | Holds | Read by |
| --- | --- | --- |
| `<session>.jsonl` | The main transcript | Nothing |
| `<session>/subagents/agent-<id>.jsonl` | One subagent | `listSubagentTranscripts` for `usage`, `findSessionSubagentTranscripts` for `subagentFactsOf` |
| `<session>/subagents/agent-<id>.meta.json` | `toolUseId`, `description` and more | `parentToolUseIdBeside`, for `toolUseId` only |
| `<session>/subagents/workflows/<run>/agent-<id>.jsonl` | One workflow agent | Both listers |
| `<session>/subagents/workflows/<run>/journal.jsonl` | The run's journal | Nothing: it fails the `agent-` prefix |

- `transcriptFolderFor`, which `usage` reads, makes the slug by replacing every character outside `[a-zA-Z0-9]` in the
  resolved path with `-`.
- `src/lib/claude-code/ClaudeTranscripts.ts` lists and reads. `src/services/overseer/ClaudeTranscripts.ts` tallies one
  job session's subagents: `findSessionSubagentTranscripts` finds the session by its id in every folder under
  `<config folder>/projects/`, so a second spelling of the working directory still finds it. It reads the transcripts
  directly because a crash or reboot can lose subagents from a session's [event log](../glossary.md#event-log); the
  transcripts still list them.
- `subagentFactsOf` keys a subagent by the `toolUseId` beside it, or its agent id when that is missing. On 2.1.311 a
  workflow agent's `.meta.json` holds no `toolUseId`, so a workflow agent is keyed by its agent id.
- One API call spans several lines that repeat its usage. `usageTotalsOf` sums per `message.id`: input once, output the
  largest seen.
- A transcript's last line may be half-written and is skipped. A missing folder reads as empty.

> **As built.** The `usage` command builds the slug from the repository root, and a job session lives under its
> worktree's slug. See gap-usage-misses-job-sessions.

> **As built.** `cli/overseer/routes/BoardStateReader.ts` derives the session id from `job.id`, so a carried-on build
> job's transcript fallback reads an absent folder. See
> gap-board-state-session-id.

> **As built.** `agentDescriptionBeside` and `workflowRunIdentifierOf` in `src/lib/claude-code/ClaudeTranscripts.ts`
> have no production caller. See
> gap-dead-code-and-unused-states.

## What a second vendor must supply

**A name and six operations on `AgentAdapter`, and behaviour the callers assume.**
`src/lib/agent-launch/AgentAdapter.ts` is the port.

| Member | Must supply | Claude Code's answer |
| --- | --- | --- |
| `vendor` | The name written to the [usage marker](../glossary.md#usage-marker) and the Overseer's start log | `CLAUDE_CODE_VENDOR` |
| `planOf` | Argv, environment, files, standing replies, from a neutral `AgentLaunchRequest` | The sections above |
| `sessionIdOf` | A stable id for a scope and the job owning the session, accepted on launch and resume | `claudeSessionIdOf` |
| `eventsOf` | Events from one stdout line; nothing for an unknown line, never a throw | `claudeStreamEventsOf` |
| `chatLineOf` | One stdin line that adds a user message | A `user` line |
| `answerLineOf` | One stdin line answering a question by its `requestId` | A `control_response` allow |
| `interruptLineOf` | One stdin line that stops the current turn | A `control_request` interrupt |

The event semantics matter more than the shapes:

- The session speaks whole lines on stdin and stdout, and reads its first message from stdin. `firstMessage` on the
  request is unused by `planOf`.
- The session ends on a closed stdin, and exits non-zero or by signal only on failure.
- `started` comes once per instance and moves a job from `launching` or `preparing` to `running`, so a vendor that never
  emits it leaves the job there. `JobResumption.instanceSessionStarted` in `src/services/overseer/JobResumption.ts`
  reads it to tell a started session from one that never ran.
- `assistant-turn.messageId` identifies one API call across repeated lines. `parentToolUseId` is null for the top level,
  and budgets and token credit rest on both.
- `result` ends a turn, and closes a job, moving it to `in-customs`, only outside `SESSION_JOB_KINDS`.
  `structuredReport` carries the report. A vendor with no schema flag must still deliver a parsed object here.
- `usage-window.requestsRefused` is true only when requests really stop.
- `answerLineOf` must work on a live session while `CONTROL_RESPONSE_DELIVERS_ANSWERS` in
  `src/services/overseer/DrivePass.ts` is true. A vendor without live answers needs it false:
  `AnswerDelivery.deliverOne` then stops the Watcher and resumes with the answer.

The `capabilities` record declares `chatTurns`, `questions`, `resume`, `reportChannel` and `usage`, and no caller reads
it, so a vendor lacking one gets no fallback from it. `FakeAgentAdapter` in `src/testing/FakeAgentAdapter.ts` is a
second implementation, but it borrows Claude's stream lines, so it proves the port's calls and not a second wire format.

## What was selected against what runs

**Eleven of 19 selections hold, two do not, three hold in part, and three were never adopted.** Dropped means selected
and never read; Not used means an option the code never took.

Most probe records end in a "Selects" line, written at the time; P1 and P6 confirm a mechanism and select by confirming
it. This ledger is what the code does at commit 70ce56de. The record below keeps the selections as evidence of why, not
as behaviour.

| Probe | Selected | In the code | Holds |
| --- | --- | --- | --- |
| P1 | Live answer by `control_response` | `answerLineOf`; a chat line when the instance never held the request (`src/services/overseer/AnswerDelivery.ts`) | Yes |
| P2 | `claudeMdExcludes` per ancestor file | `instructionFileExclusionsOf` | Yes |
| P3 | `--disable-slash-commands` | `argvOf`, unless `profile.skills` | Yes |
| P4 | Hook and `strictAllowlist` | `preToolUseHooksOf`; the guard exists for a builder or reviewer with domains | Yes |
| P5 | One deny rule per path | `fileRulesOf`, `denyRulesOf` | Yes, see gap-launch-file-deny-one-level |
| P6 | The resume argv | `argvOf` | Yes |
| P7 | Kill every group among the descendants | `treeMembersOf` lists the descendants' groups and `stopTree` signals each; a tree whose leader died with its Watcher is not reached (gap-bash-group-survives-kill) | Partly |
| P8 | Never expect one `result` per line | `DrivePass` keys on the `result`, not on lines; the Assistant counts one `result` per chat and keeps that true by writing a chat only when idle | Yes |
| P9 | Memory off | `autoMemoryEnabled: false` | Yes |
| P9 | Definitions name models; `role.md` forbids the `model` parameter | `agentsOf` names them, every profile's `subagents` is empty (gap-subagents-always-empty), and no text under `resources/` says it | **No** |
| P9 | `modelUsage` as a session total | `usageTotals` has no reader; tokens come from `assistant-turn` events | Dropped |
| P10 | `status === 'rejected'` interrupts | `usageWindowEventsOf`, `UsageLimits.refusalOf` in `src/services/overseer/UsageLimits.ts` | Yes |
| P10 | A 429 `result` also counts as the limit | The mapper does not read `api_error_status` (gap-429-result-not-read) | **No** |
| P11 | Hatch denies per other job, `allowWrite` for its own | No [`<worktrees>`](../glossary.md#reading-names)`/hatch/**` deny and `allowWrite` hold; `deniedWritableRootsOf` names no other job's Hatch | Partly |
| P13 | `settings.local.json` usable with `local` | Every session runs `project` alone | Not used |
| P14 | Agent socket plus keyboxd socket | `commitSigningOf` allows the agent socket and the keyboxd socket that `gpgconf --list-dirs` names (`src/services/overseer/GpgDirectories.ts`) | Yes |
| P15 | [Gates](../glossary.md#gate) sandboxed, and `commit.gpgsign=false` for a gate | Sandboxed yes; no code sets `commit.gpgsign` for a gate | Partly |
| P16 | `--setting-sources project`, `.claude/` denied, V13 | `argvOf`, `deniedWritableRootsOf`, Customs | Yes |
| P17 | Add the setting only with a read grant | `blockReadsOutsideWorkingDirectories` appears nowhere; `denyRead` confines reads | Not used |

## Invariants

1. Only `src/lib/claude-code/` knows the shape of stream-json; production code above it reads `AgentSessionEvent`. The
   Watcher parses a line only to match the rule data the launch plan hands it.
2. An unrecognised stdout line maps to no event and never throws.
3. The Watcher logs every line, mapped or not.
4. Every `can_use_tool` request but `AskUserQuestion` is denied by the standing reply without the Overseer.
5. A job's session id is a pure function of the tracker id and the session owner's job id.
6. `usage-window.requestsRefused` is true only for a top-level `rejected`.
7. Every session runs under `--setting-sources project` with `--strict-mcp-config`.
8. A launched session's environment never holds a parent Claude Code session's variables (`CLAUDE_NESTING_VARIABLES`).
9. A fixture that stops showing what it was recorded to show fails
   `src/lib/claude-code/ClaudeStreamFixtures.spec.ts`.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| The port | `src/lib/agent-launch/AgentAdapter.ts` | `AgentAdapter`, `AgentCapabilities` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Events | `src/lib/agent-launch/AgentSessionEvent.ts` | `AgentSessionEvent` | `src/lib/claude-code/ClaudeStreamMapper.spec.ts` |
| Argv, settings, files | `src/lib/claude-code/ClaudeCodeAdapter.ts` | `argvOf`, `settingsOf`, `planOf` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Session id | `src/lib/claude-code/ClaudeCodeAdapter.ts` | `claudeSessionIdOf` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Session owner | `src/services/overseer/JobResumption.ts` | `JobResumption.sessionOwnerJobIdOf` | `src/services/overseer/JobResumption.integration.spec.ts` |
| Stream mapping | `src/lib/claude-code/ClaudeStreamMapper.ts` | `claudeStreamEventsOf` | `src/lib/claude-code/ClaudeStreamMapper.spec.ts` |
| Lines written | `src/lib/claude-code/ClaudeStreamLines.ts` | `CLAUDE_STREAM_LINES` | `src/lib/claude-code/ClaudeStreamMapper.spec.ts` |
| Fixtures | `src/lib/claude-code/testing/fixtures/` | | `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` |
| Standing reply | `src/lib/watcher/StandingReplies.ts` | `standingReplyFor` | `src/lib/watcher/StandingReplies.spec.ts` |
| Network guard | `cli/hooks/BashDomainsHook.ts` | `guardTheNetworkDomains` | `cli/hooks/BashDomainsHook.spec.ts` |
| Transcript folders | `src/lib/claude-code/ClaudeTranscripts.ts` | `transcriptFolderFor`, `listSessionSubagentTranscripts` | `src/lib/claude-code/ClaudeTranscripts.spec.ts` |
| A job's subagents | `src/services/overseer/ClaudeTranscripts.ts` | `ClaudeTranscripts.subagentFactsOf` | `src/services/overseer/ClaudeTranscripts.spec.ts` |
| Usage per call | `src/lib/claude-code/utils/TranscriptUsageUtil.ts` | `TranscriptUsageUtil.usageTotalsOf` | `src/lib/claude-code/utils/TranscriptUsageUtil.spec.ts` |
| Choosing the adapter | `cli/CommandContext.ts` | `agentAdapterOfThisProcess` | |
| Fake adapter | `src/testing/FakeAgentAdapter.ts` | `FakeAgentAdapter` | |

## The probe record

**P1 to P17 are what Claude Code 2.1.311 did on 2026-10-27; P18 to P21 what Claude Code 2.1.323 and Turborepo 2.11.10
did on 2026-11-15; P23 what Claude Code 2.1.327 did on 2026-11-18.** Past tense is deliberate: each entry reports a run.

### Reading the record

A "Selects" line records the intent at the time; [the ledger](#what-was-selected-against-what-runs) says what runs.

Ids in those lines are planning references: `T` a ticket of the design's plan, `Q` an owner answer and `V` a Customs
check. `T` and `Q` ids cannot be looked up individually. Source comments write probe Pn as `T1-Pn`. Selection notes
may also name fallbacks from the design file, which holds rationale only.

**The evidence is not portable.** Logs, drivers and settings are in `.claude/.evidence/runner-claude-probe/` in the
owner's main checkout, which git ignores. Paths below are relative to that folder. The folder also holds `drive.py`,
which drives one stream-json session, `summarise.py`, which prints a log as one line per event, and `export-fixture.py`,
which turns a log into a fixture. A clone has only the fixtures.

Every session ran `claude -p --input-format stream-json --output-format stream-json --verbose --model haiku` in a linked
worktree nested in its main checkout, plus the flags each probe names. The logs of P1, P2, P7 and P8 show `--session-id`
with a fixed version 4 id, and P6 resumes one.

The probe repository uses the released folder names: `repo/.agent-progress/` stands for
[`<data>`](../glossary.md#reading-names) and `repo/.agent-progress-worktrees/` for `<worktrees>`, here and in the
fixtures. `ticket-1` is the worktree; `J1`, `J2` and `J3` are jobs. `<worktree>` is the job's linked worktree and
`<common>` the git common directory.

P12 is absent: the numbering skips it, and no evidence folder exists for it.

### The environments

**The environment changed no finding.** P2, P4, P14 and P15 ran twice: with the probe driver's inherited environment,
which carries a parent Claude Code session's variables (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`,
`CLAUDE_CODE_MESSAGING_SOCKET`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_SIMPLE` and the rest of its `CLAUDE_*` variables),
and under `env -i HOME PATH USER` (`--clean-environment`).

Subscription authentication worked with those three variables alone (`apiKeySource` `none`). P15's gates ran under
`sandbox-exec` directly. P9, P11, P13, P16 and P17 ran in the inherited environment only, and P10 under `env -i` plus
its stand-in variables.

### The committed fixtures

**Eight recorded sessions are portable, each a `.stdout.jsonl` and `.stdin.jsonl` pair** in
`src/lib/claude-code/testing/fixtures/`. `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` holds what each was recorded
to show, and `src/lib/claude-code/ClaudeStreamMapper.spec.ts` replays all but
`flint-brain-turn` and `network-outage-retries-spent`. Their paths and the init record's skill, command and plugin
lists are synthetic.

| Fixture | Probe | Shows |
| --- | --- | --- |
| `ask-user-question-live-answer` | P1 | A question, its live answer and a schema-valid result; `button-colour.schema.json` is its schema |
| `permission-denials-under-deny-rules` | P5 | Refused calls listed in `permission_denials` |
| `resume-structured-output` | P6 | The id kept across resume, with structured output |
| `mid-turn-line-folded` | P8 | Two lines in, one `result` out, no stdout record of the fold |
| `rate-limit-rejected` | P10 | A top-level `rejected` and a 429 `result` with `subtype` `success` |
| `rate-limit-window-rejected-under-allowed` | P10 | A rejected window under allowed overage |
| `flint-brain-turn` | P22 | One digest line answered by a session that knows only `StructuredOutput`, with an intent and an emote |
| `network-outage-retries-spent` | P23 | Ten `api_retry` lines and an error `result` with `api_error` `connection_failed` |

### P1: a live answer by `control_response`

<details>
<summary>What the run showed</summary>

Confirmed. Under `--permission-mode auto --permission-prompt-tool stdio --json-schema <schema text>` the question
arrived as a `control_request` `can_use_tool` for `AskUserQuestion` with `requires_user_interaction: true`. The reply
carried `behavior` `allow` and `updatedInput` with the request's input plus `answers`. The tool's result was "Your
questions have been answered: …", the agent called `StructuredOutput`, and the one `result` was `success` with
`structured_output` `{"colour":"Blue"}`, valid against the schema (`p1/run1-live-answer.log`). The resume fallback was
not needed for a live Watcher; it stayed for the no-live-Watcher case.

</details>

### P2: the CLAUDE.md upward walk

<details>
<summary>What the run showed</summary>

Under `--setting-sources project`, `~/.claude/CLAUDE.md` and the ancestor checkout's `CLAUDE.md` loaded as "project
instructions" beside the worktree's own, under both environments (`p2/baseline-inherited`, `p2/baseline-clean`, each a
`.log` and a `-transcript.jsonl`). A `--settings` file holding `claudeMdExcludes` with those two absolute paths stopped
both while the worktree's file still loaded (`p2/excludes-inherited`, `p2/excludes-clean`).

The CLI matches entries with picomatch against absolute paths of User, Project and Local memory files, and reads the
setting from the flag settings even though `--setting-sources project` drops the user layer. Only absolute paths were
tried, not globs.

</details>

Selects: T10 renders `claudeMdExcludes` into every job's `settings.json`, listing each memory file above the main
checkout (`CLAUDE.md`, `CLAUDE.local.md` and `.claude/CLAUDE.md` of every ancestor folder, the home folder's included).
Owner answer Q33's "stop the walk" branch applies; workers need not accept the user file.

### P3: `--disable-slash-commands`

<details>
<summary>What the run showed</summary>

Confirmed. With the flag the init record's `skills` and `slash_commands` were empty and the `Skill` tool was gone. The
`Task` tool and the `agents` list were unchanged, and a `general-purpose` subagent ran and replied
(`p3/disable-slash-commands.log`, three sidechain records). Without the flag the worktree's tracked skill and the user's
skills were listed (`p3/with-skills.log`). An untracked skill in the main checkout's `.claude/skills/` was not listed in
the nested worktree session even without the flag.

</details>

Selects: the flag; the fallback of keeping skills and forbidding them in the role prompt is not needed.

### P4: the network guard in auto mode

<details>
<summary>What the run showed</summary>

Every run had `sandbox.enabled`, `allowUnsandboxedCommands: false` and `network.allowedDomains: []` in its `--settings`
file. The agent ran `curl https://example.com`, then the same command with `allowed_domains: ["example.com"]`, then a
WebFetch of `https://example.org` (`p4/<configuration>-<environment>.log`).

| Configuration | Bash, no list | Bash with `allowed_domains` | WebFetch of an unlisted domain |
| --- | --- | --- | --- |
| auto mode alone (`classifier`) | sandbox proxy refuses | granted, `200` | fetched |
| `strictAllowlist: true` (`strict`) | sandbox proxy refuses | refused before running (1) | fetched |
| `bash-domains` hook on `Bash\|WebFetch` (`hook`) | sandbox proxy refuses | denied by the hook | denied by the hook |

(1) "allowed_domains cannot widen network access in this session". The hook is a `PreToolUse` hook.

Identical under both environments. No `control_request` arrived for any of these calls: the classifier decided alone.
The hook was a stand-in script (`p4/bash-domains-hook.py`); the calls it saw are in `p4/hook-calls-<environment>.jsonl`.
Unrelated to the guards, claude.ai connector tools (17 `mcp__` tools) appeared in some sessions under either environment
and not in others.

</details>

Selects: both guards deny the Bash request and only the hook denies the WebFetch, so T13a renders the hook for every
role with a `network` line, and `strictAllowlist`, which makes the Bash refusal deterministic without the hook. Owner
answer Q37's fallback branch does not apply: auto mode stays with the guards. `--strict-mcp-config` stays necessary.

### P5: Edit, Write and Read under `//`-anchored rules, and the `denyRead` glob

<details>
<summary>What the run showed</summary>

`p5/settings.json` denied `Edit` and `Write` of `//<data>/**`, `//<worktrees>/hatch/**`, the main checkout's tracked
files and `//<worktree>/.claude/**`, and `Read` of `//<data>/jobs/*/launch-*.json`. In auto mode (`p5/run1.log`) every
one was refused with "File is in a directory that is denied by your permission settings": an Edit of
`<data>/gates/gate.txt`, a Write and an Edit in another job's Hatch folder, an Edit of the main checkout's `file.txt`, a
Write under the worktree's `.claude/`, and a Read of a launch file. An Edit of the worktree's own file succeeded.

A Write to a folder outside the repository that no rule names **succeeded** in auto mode without a prompt
(`outside/written.txt`). Auto mode does not confine Edit and Write to the working directory, so every path a worker must
not write needs its own deny rule.

The sandbox glob was honoured. Under the auto mode settings a Bash `cat` of a launch file and a Bash write into
`<data>/gates/` were refused by the classifier ("Auto-Mode Bypass") before the sandbox was reached, even with `Bash(cat
*)` allowed (`p5/run2-sandbox-deny-read.log`). With the `Read` rule removed and `--permission-mode dontAsk`, so that
only the sandbox decided (`p5/run3-sandbox-only-dontask.log`), `cat` of `<data>/jobs/J2/status.json` printed it while
`cat` of `jobs/J2/launch-1.json` and `jobs/J1/launch-7.json` both failed "Operation not permitted", and the write into
`<data>/gates/` failed the same way.

</details>

Selects: per-path deny rules and the glob; the launch-folder fallback is not needed.

### P6: the resume argv

<details>
<summary>What the run showed</summary>

Confirmed: in the original working directory, the argv below kept the session id in `init` and `result`, recalled the
earlier turn's answer from its transcript, and returned a schema-valid `structured_output` (`p6/resume.log`). The
settings file was a fresh file of the same content at another path.

```text
claude -p --model <role model> --input-format stream-json --output-format stream-json --verbose
  --resume <session id> --json-schema <schema text> --setting-sources project --settings <re-rendered settings file>
  --permission-mode auto --permission-prompt-tool stdio
```

</details>

### P7: Watcher death and the Bash child's process group

<details>
<summary>What the run showed</summary>

The Bash tool's command ran in a process group of its own: the CLI started `/bin/zsh -c source <snapshot> … eval
<command>` as a group leader, and the command and its children inherited that group, not the CLI's
(`p7/kill-group.log`: CLI group 58080, `sleep` in group 59315). `kill(-<CLI pgid>, SIGKILL)` left the command running,
reparented to launchd. Killing the whole tree, every group found among the CLI's descendants, left no orphan
(`p7/kill-tree.log`).

Descendants were listed from `ps -A -o pid=,ppid=,pgid=` before the kill; a child forked between
the listing and the kill would escape, so the kill repeats until the listing is empty.

When the Watcher died mid-turn, closing the CLI's stdin and stdout, the agent did not stop. With a long tool call
running the CLI stayed alive for the 30 seconds observed (`p7/close-pipes.log`). With a short one it finished the turn
without a reader: the tool returned, the agent wrote `after-watcher-death.txt` in the worktree, ended the turn, and
exited 0 on the closed stdin (`p7/close-pipes-tool-finishes.log` and its transcript).

</details>

Selects: the Watcher kills the whole process tree, and the Overseer kills a job's process tree before it resumes or
replaces the job.
(Not built; see [the ledger](#what-was-selected-against-what-runs).)

### P8: a chat line written mid-turn

<details>
<summary>What the run showed</summary>

Folded. A user line written while the first turn's Bash call ran was taken into that turn: the transcript records
`queue-operation` `enqueue`, then `remove` with reason `absorbed_mid_turn`, and the model received it as "The user sent
a new message while you were working". One `result` came for the two lines, its text answering both, and no second turn
followed within 90 seconds (`p8/mid-turn.log`, `p8/mid-turn-transcript.jsonl`). Stdout carries no record of the fold.

</details>

Selects: a line written before a turn's `result` counts as delivered in that turn; never expect one `result` per line.

### P9: auto-memory, subagent models, `modelUsage`, the explorer and the `Agent` rule

<details>
<summary>What the run showed</summary>

Every run gave the agents through `--agents` and ran in `--permission-mode dontAsk`, so only allow rules let a tool
run (`p9/run-*.log`, settings and agents beside them).

- **Auto-memory.** `"autoMemoryEnabled": false` in the `--settings` file was the switch: the init record's
  `memory_paths` key was absent with it (`run-a`) and named the project's `memory/` folder without it (`run-b`).
- **Model precedence.** An explorer defined with `"model": "sonnet"`, started without a `model` parameter, ran on Sonnet
  (`run-c1`), and still did with `CLAUDE_CODE_SUBAGENT_MODEL=opus` set (`run-c2`, the variable inherited by the driver,
  which its log does not record). A `model` parameter in the `Agent` call did override: a coder defined as Sonnet,
  started with `"model": "haiku"`, ran on Haiku (`run-a`, no Sonnet in `modelUsage`).
- **`modelUsage` includes subagents.** With a Sonnet explorer under a Haiku session, the `result`'s `modelUsage` had a
  `claude-sonnet-5-5` entry beside Haiku's, while `usage` counted the top level only (`run-c1`: 303 top-level output
  tokens, `modelUsage` 303 Haiku plus 199 Sonnet). A subagent started in the background was still running at the
  `result` (`run-c2`), whose `modelUsage` held only the Sonnet tokens spent so far.
- **The explorer searches.** Read plus `Bash(rg *)`, `Bash(grep *)` and `Bash(find *)` in its `tools` let it run `rg -l`
  under dontAsk (`run-a`, `run-c1`). The patterns are no confinement: it also ran `cat file.txt`
  (`run-explorer-limits.log`, its transcript `explorer-limits-subagent-transcript.jsonl`).
- **The `Agent` rule.** With `Agent(coder)` in `permissions.deny`, the call was refused "Agent type 'coder' has been
  denied by permission rule 'Agent(coder)' from flagSettings" while the explorer ran (`run-b`). The init record lists
  the tool as `Task`.

</details>

Selects: T10 renders `autoMemoryEnabled: false`; each agent definition names its model, and `role.md` tells the agent
never to set `model` on the `Agent` tool, since the call's parameter wins. T13a may take `modelUsage` as the session
total at a `result` with no background subagent running, and otherwise adds the subagent transcripts.
(Memory is built, the model rule is not built and `modelUsage` was dropped; see [the
ledger](#what-was-selected-against-what-runs).)

### P10: `rate_limit_event` at a rejected limit

<details>
<summary>What the run showed</summary>

Rate-limit events are emitted only for a subscription login, so the probe pointed `ANTHROPIC_BASE_URL` at a local
stand-in for the Messages API (`p10/stub-server.ts`) that answers with the unified rate-limit headers, and logged in
with a dummy `CLAUDE_CODE_OAUTH_TOKEN` under `env -i HOME PATH USER`. With an API key instead, no `rate_limit_event`
came: a 429 gave one `api_retry` and an error result (`p10/rejected.log`).

- **Top-level rejected** (`p10/rejected-oauth.log`): the event's `status` was `rejected`, `rateLimitType` `five_hour`,
  `resetsAt` the window's reset in epoch seconds, `unifiedWindows.five_hour.status` `rejected`. No retry followed. The
  `result` had `is_error: true`, `api_error_status: 429`, `terminal_reason` `api_error`, the text "You've hit your
  session limit · resets …", and `subtype` `success`.
- **A window rejected under overage** (`p10/window-rejected-oauth.log`): with the five-hour window `rejected`, overage
  `allowed` and in use, and the seven-day window at `allowed_warning`, the top-level `status` was `allowed_warning`, not
  `allowed`, and the turn answered normally.

</details>

Selects: only a top-level `rejected` interrupts; T13a reads `status === 'rejected'`, not `status !== 'allowed'`, and
treats an `is_error` result with `api_error_status` 429 as the limit whatever its `subtype`. (The 429 reading is not
built; see [the ledger](#what-was-selected-against-what-runs).)

### P11: a product-owner session under `<worktrees>/sessions/<J>/`

<details>
<summary>What the run showed</summary>

The [product owner](../glossary.md#product-owner) session ran in a plain folder `<worktrees>/sessions/J3/` of the main
checkout, without `--disable-slash-commands`, under the sandbox with `allowWrite` of its Hatch folder `hatch/J3` and the
permission denies (`p11/settings.json`, `p11/po-session.log`). The init record listed `agent-po`, installed untracked in
the main checkout's `.claude/skills/`, and the main checkout's `CLAUDE.md` loaded: the agent quoted its marker line.
Writing its own session folder worked; `<data>/gates/` and another job's Hatch folder `hatch/J2/` failed "Operation not
permitted".

**Its own Hatch folder failed too.** The `Edit` and `Write` deny of `<worktrees>/hatch/**` also applied to the sandbox
as a write deny, which beat `allowWrite`. With that rule replaced by `Edit` and `Write` denies of the other job's folder
alone, the Bash write into `hatch/J3/` succeeded and both other writes still failed
(`p11/po-session-other-relays-only.log`).

</details>

Selects: T13 renders the Hatch `Edit`/`Write` denies per other job's Hatch folder, never over `<worktrees>/hatch/**`,
and leaves the job's own folder to the sandbox's `allowWrite`. (Partly built; see [the
ledger](#what-was-selected-against-what-runs).)

### P13: `.claude/settings.local.json` in a worktree

<details>
<summary>What the run showed</summary>

Read under `--setting-sources project,local`: a `SessionStart` hook in the worktree's `.claude/settings.local.json` ran
(`p13/project-local.log`, `p13/hook-markers.txt`). Under `--setting-sources project` it did not
(`p16/project-only.log`).

</details>

Selects: workers exclude `local`, so the file stays irrelevant to them; T19 may rely on it being read from the session's
own worktree when `local` is included. (Not used; see [the ledger](#what-was-selected-against-what-runs).)

### P14: signing, and the ref denies, under the rendered per-job sandbox

<details>
<summary>What the run showed</summary>

`p14/render.py` rendered settings for job J1 on `ticket-1`: write denies of `<data>`, `<monitor>`,
`<worktree>/.claude/`, `<common>/packed-refs`, `refs/heads/main`, `refs/heads/group-alpha`, `refs/heads/ticket-2` and
`<common>/worktrees/ticket-2/`; read denies of the launch files, `~/.ssh` and `~/.aws`; and one signing allowance.
`p14/probe.sh` then ran every attempt in one sandboxed Bash call.

The owner's git signs with gpg
(`commit.gpgsign=true`), whose `common.conf` has `use-keyboxd`, so gpg needs two sockets: the agent's for the key and
keyboxd's for the public keyring.

| Allowance | Signed commit, inherited | Signed commit, `env -i` |
| --- | --- | --- |
| none: `~/.gnupg` read-denied | fails: keyring unreadable | fails |
| the gpg-agent socket alone (1) | fails: "can't connect to the keyboxd" | fails |
| the agent and keyboxd sockets (1) | **signs** (`gpgsig` header present) | **signs** |
| writes to `~/.gnupg` with the agent socket | fails, and gpg started a second keyboxd | fails |

(1) Through `network.allowUnixSockets`, with `~/.gnupg` readable and its `private-keys-v1.d/` read-denied.

Logs: `p14/<allowance>-<environment>.log`, with `rerun-` and `final-` reruns of the socket rows; the `final-` pair holds
every attempt. Under the socket allowance gpg still warned that it could not create its lock file in `~/.gnupg`, without
failing. Two hazards: the writes allowance let the sandboxed gpg start its own keyboxd, which took over the socket and
left the owner's gpg waiting on the old daemon's lock until both daemons were stopped; and verifying a signature in the
sandbox (`git log --format=%G?`) hung and outlived its session.

In every run the unsigned commit (`-c commit.gpgsign=false`) and creating a branch succeeded, and every write the denies
name failed: `git update-ref` of `main`, `group-alpha` and `ticket-2` ("couldn't set"), an append to `packed-refs`, and
a write or file in `<common>/worktrees/ticket-2/`, while the job's own `<common>/worktrees/ticket-1/` stayed writable.
`private-keys-v1.d/` stayed unreadable and `~/.gnupg` unwritable. `git branch -f` of a checked-out branch was refused by
git itself before the sandbox was reached. The refs were unchanged after every run (`### refs after`).

</details>

Selects: the signing allowance is the agent socket plus the keyboxd socket (`gpgconf --list-dirs agent-socket` and
`keyboxd-socket`) through `network.allowUnixSockets`, `~/.gnupg` readable but not writable, `private-keys-v1.d/`
read-denied; writes to `~/.gnupg` are never granted, and `commit.gpgsign=false` is not needed (owner answer Q32). The
ref denies hold, so owner answer Q38's `target-moved` fallback does not apply: the silent requeue stays, with V14 for
refs created after launch. (The signing allowance is not built; see [the
ledger](#what-was-selected-against-what-runs).)

### P15: this repository's gates and install lines under the gate's Seatbelt (macOS sandbox) profile

<details>
<summary>What the run showed</summary>

`p15/render-profile.py` wrote a profile for a linked worktree of this repository: everything allowed but writes, which
go only to the worktree, its own admin folder, temp (`/private/tmp`, `/private/var/folders`) and `~/.bun/install/cache`;
writes denied to `<data>`, `<monitor>`, `<common>/refs` and `packed-refs`; reads denied of `~/.ssh`, `~/.aws`,
`~/.gnupg/private-keys-v1.d`, the Overseer token and the launch files; `(deny network*)` for the gate (`gate-off.sb`),
network on for the install line, the command that installs a worktree's dependencies (`gate-on.sb`).

The install line `bun install` succeeded in both environments (`install-inherited.out`, `install-clean.out`). The gate
`bun run verify` failed one test of 4064 in both: `src/lib/git/BranchIntegration.integration.spec.ts` committed in a scratch
repository without `commit.gpgsign=false`, so gpg, denied its keyring, could not sign (`checks-inherited.out`,
`checks-clean.out`). With that spec fixed the gate succeeded under the profile in both environments
(`checks-fixed-inherited.out`, `checks-fixed-clean.out`); no test needed the network or loopback.

</details>

Selects: gates and install lines run sandboxed and the shared gate cache stays; the memory-only fallback is not needed.
A gate gets no signing allowance, so its process Watcher sets `commit.gpgsign=false` through the `GIT_CONFIG_*` triple.
(Partly built; see [the ledger](#what-was-selected-against-what-runs).)

### P16: setting sources and the worktree's CLAUDE.md and hooks

<details>
<summary>What the run showed</summary>

The worktree's `CLAUDE.md` loaded only when `project` was among the sources: under `--setting-sources project` and
`project,local` the agent quoted the worktree's marker line; under `--setting-sources user` it found none, and under
`--setting-sources ""` it found it only by reading the file with the Read tool (`p16/<run>.log` and transcripts). A
`SessionStart` hook in the worktree's `.claude/settings.json` ran under `--setting-sources project` and `project,local`,
and not without `project` (`p16/hook-markers.txt`).

</details>

Selects: workers keep `--setting-sources project`, so the worktree's `.claude/` stays write-denied and V13 checks every
branch before a launch on it.

### P17: `permissions.blockReadsOutsideWorkingDirectories`

<details>
<summary>What the run showed</summary>

With it on (`p17/settings.json`, `p17/block-reads-git.log`), git in the worktree read the shared `.git` (`rev-parse
--git-common-dir`, `status`, `log`, `cat` of `<common>/config`) and committed, while both a Bash `cat` and a Read of the
main checkout's `CLAUDE.md`, or of any file outside the repository, were refused. For Bash it also refused running a
script outside the worktree (`p17/block-reads.log`). Without it the same reads succeeded
(`p17/control-no-block-git.log`).

</details>

Selects: the setting confines sandboxed Bash as well as Read and leaves git working, but it also blocks every read of
`<data>`, which the read-only verbs need under a job. T13 adds it only together with a read grant of `<data>` (untested
here); otherwise the `denyRead` list stays the read confinement. (Not used; see [the
ledger](#what-was-selected-against-what-runs).)

### P18 to P21: a session started in a subfolder of a workspace

**These four ran for the monorepo move, in a scratch repository, and select nothing in the code yet.** The repository
held a root `CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/rules/` (one rule with no
`paths`, one scoped to `apps/x/**`) and `.claude/skills/root-skill/`; `apps/x/` held its own `CLAUDE.md`,
`.claude/settings.json` and `.claude/skills/marker-skill/`; `apps/y/` held no `.claude/`. Each settings file had a
`SessionStart` hook `"$CLAUDE_PROJECT_DIR"/.claude/hooks/mark.sh <which file>`, a script that records
`$CLAUDE_PROJECT_DIR` and its own path; both `.claude/hooks/` folders held a copy.

Every session ran `claude -p --model haiku --output-format stream-json --verbose --debug-file <file>` under
`env -i HOME=<scratch home> PATH USER`. **No session reached the model:** under a scratch home Claude Code found no login and
every `result` was "Not logged in · Please run /login". Hooks, skills and instruction files are settled before the first
request, so the hooks ran, and the transcript's `instructions` and `skill_listing` attachments name the files read.
Evidence: `.claude/.evidence/monorepo-migration/l8-claude-probe/` in the owner's main checkout, one folder per run under
`runs/`, with `run.sh`, the repository as `repo/` and the `claudeMdExcludes` files.

### P18: settings, hooks and `$CLAUDE_PROJECT_DIR`

<details>
<summary>What the run showed</summary>

| Started in | `--setting-sources` | `apps/x` settings hook | Root `settings.json` hook | Root `settings.local.json` hook | `$CLAUDE_PROJECT_DIR` |
| --- | --- | --- | --- | --- | --- |
| `apps/x` | default | ran | not read | ran `apps/x/.claude/hooks/mark.sh` | `<repo>/apps/x` |
| `apps/x` | `project` | ran | not read | not read | `<repo>/apps/x` |
| `apps/y` | default | none there | not read | exit 127: `apps/y/.claude/hooks/mark.sh` missing | `<repo>/apps/y` |
| `apps/y` | `project` | none there | not read | not read | none ran |
| root | default | not read | ran | ran | `<repo>` |

The debug log's watched settings files agree: from `apps/x` they were the home's `settings.json`,
`apps/x/.claude/settings.json`, `apps/x/.claude/settings.local.json` and the root's `.claude/settings.local.json`, never
the root's `.claude/settings.json` (`runs/app-default/debug.txt`, `runs/app-without-claude-folder/debug.txt`).

</details>

For the monorepo: a subfolder's own `.claude/settings.json` hooks load, so a project's settings may live in its
subfolder. The root's `.claude/settings.json` does not load in a session started below it, so the root's lint hook never
runs there. `$CLAUDE_PROJECT_DIR` is the folder the session started in, so a root hook written
`"$CLAUDE_PROJECT_DIR"/.claude/...` finds no script from a subfolder; a hook script that must run from both finds itself
by its own path.

### P19: skills in a subfolder and its ancestors

<details>
<summary>What the run showed</summary>

From `apps/x` the skill listing held `marker-skill` and `root-skill`, under the default sources and under `project`;
from `apps/y` and from the root it held `root-skill` alone (`runs/*/transcript.jsonl`, the `skill_listing` attachment).

</details>

For the monorepo: skills load from the starting folder's `.claude/skills/` and from every ancestor's, so a root skill
reaches every project and a project's skill stays its own.

### P20: ancestor `.claude/rules/*.md` and `claudeMdExcludes`

<details>
<summary>What the run showed</summary>

From `apps/x` the `instructions` attachment held the root's `CLAUDE.md`, the root's unscoped rule and
`apps/x/CLAUDE.md`, under the default sources and under `project`; the rule scoped to `apps/x/**` was not among them at
the start. A `--settings` file holding `claudeMdExcludes` gave:

| `claudeMdExcludes` | Instruction files read from `apps/x` |
| --- | --- |
| none | root `CLAUDE.md`, root `rules/unconditional.md`, `apps/x/CLAUDE.md` |
| the root's `CLAUDE.md` and `.claude/rules/unconditional.md`, absolute | `apps/x/CLAUDE.md` |
| `<repo>/.claude/rules/**` | root `CLAUDE.md`, `apps/x/CLAUDE.md` |
| `<repo>/.claude/rules`, a folder | unchanged from none |
| `<repo>/.claude/rules/**` under `--setting-sources project` | root `CLAUDE.md`, `apps/x/CLAUDE.md` |

</details>

For the monorepo: an ancestor's unscoped rules load in a subfolder session, an absolute path or a glob in
`claudeMdExcludes` excludes them, and a bare folder path excludes nothing. Whether the scoped rule loads once the
session reads a file under `apps/x/` needs a model turn and was not run.

### P21: Turborepo's read-only cache flag

<details>
<summary>What the run showed</summary>

In a scratch Bun workspace with one package and one task, `turbo run probe` at 2.11.10: `--cache=local:r` on an empty
cache missed, ran the task and wrote no entry; the default run wrote one; `--cache=local:r` then replayed it as a hit;
after an edit, `--cache=local:r` missed and ran, still writing nothing (`turbo-lab/`).

</details>

For the monorepo: the flag reads hits and never writes, as the migration's earlier lab run found.

### P23: a session whose retries ran out on a network outage

<details>
<summary>What the run showed</summary>

The owner ran two sessions of Claude Code 2.1.327 on macOS 26.7.1 in a scratch repository, `/tmp/outage-probe/repo`,
outside every tracked repository, under `env -i HOME PATH USER`:
`claude -p --input-format stream-json --output-format stream-json --verbose --model haiku --permission-mode acceptEdits
--allowedTools Bash`. The one input line asked for `ping -c 61 127.0.0.1` through the Bash tool, to keep the turn open;
2.1.327 blocks a standalone `sleep` in its Bash tool. The owner turned the network off once the `tool_use` line came and
on again after the `result` line. The owner's notes name the login kind a subscription, which the `init` line's
`apiKeySource` `none` agrees with. The logs are in `.claude/.evidence/hephaestus-talos/stage-0/outage/` of the main
checkout, which git ignores.

- **Recording A, the default retries** (`a.stdout.jsonl`, the fixture `network-outage-retries-spent`): the ping ran
  about a minute, 63.2 seconds from `tool_use` to `tool_result`, and returned. The next request failed, and ten
  `system` lines of subtype `api_retry` followed, `attempt` 1 to 10, each with `max_retries` 10, `error_status` null
  and `error` `unknown`, and no `no_response` key.
  `retry_delay_ms` rose from 551 to 36483 and stayed between 32289 and 37588 from the seventh on, 173936 in all. Then
  came an `assistant` line with `model` `<synthetic>`, `is_api_error_message` true, `error` `server_error` and
  `api_error` `connection_failed`, and the stream ended on one `result` line: `is_error` true, `subtype` `success`,
  `api_error` `connection_failed`, `api_error_status` null, `terminal_reason` `api_error`, `stop_reason`
  `stop_sequence`, and the text "API Error: Can't reach the API server" with `ENOTFOUND`.
- **How long A's retries took:** the `api_retry` and `result` lines carry no timestamp. From the tool result's
  timestamp, after which the first retried request went out, to the synthetic `assistant` line just before the result,
  181.6 seconds passed; the result's `duration_ms` for the whole session was 245790.
- **One `rate_limit_event` came before the outage,** after the first answer: `status` `allowed` on the `seven_day`
  window. No `api_retry` line had `error_status` 429 or `error` `rate_limit`.
- **Recording B, `CLAUDE_CODE_MAX_RETRIES=2`** (`b.stdout.jsonl`, not committed): two `api_retry` lines, `attempt` 1 and
  2, each with `max_retries` 2, `error` `unknown` and `error_status` null, then the same synthetic `assistant` line and
  the same `result` fields as A. From the tool result to the synthetic `assistant` line 14.5 seconds passed, the
  `retry_delay_ms` summing to 1680. The setting bounded the session's retries to its 2.
- Both `stderr` logs were empty.

</details>

Selects: Talos's network-outage pattern matches the result's fields (`is_error` true, `api_error` `connection_failed`,
`terminal_reason` `api_error`) and the count of `api_retry` lines, never the result text; `subtype` `success` says
nothing, and a `rate_limit_event` whose `status` is `allowed` does not make the ending a usage limit.

### Not answered on 2026-11-15

- Whether `sandbox.network.allowLocalBinding` lets a sandboxed Bash bind and reach `127.0.0.1`: it needs a model turn
  that runs Bash, and no session under a scratch home was logged in.
- How the probe's Claude Code authenticates under a scratch home: it does not by itself. Pointing `CLAUDE_CONFIG_DIR` at
  the owner's real configuration was refused by the probing session's own permission check and not tried; a login of the
  scratch home, or a run under the owner's home, is the owner's call.
- A `PostToolUse` hook from a subfolder: no tool ran, so `SessionStart` stands in for every hook event in P18.

## A scratch run outside the probe record

**One session showed the Bash sandbox refusing writes that the Edit and Write tools made. It is not a numbered probe and
selected nothing.**

On 2026-10-31, during the documentation pass, one `claude` session ran eight scripted writes in a throwaway repository.
Its settings file was hand-written to resemble a [builder](../glossary.md#builder)'s rendered settings for job `J1` on
worktree `ticket-1`; `ClaudeCodeAdapter` did not render it. The Claude Code version and the command line were not
recorded, and the settings, prompt and result are in a scratch folder this repository does not keep.

The settings allowed Edit and Write of `ticket-1` and Bash writes to `hatch/J1`, with deny rules on `<data>`,
`<worktree>/.claude`, `<common>/packed-refs` and the main line's ref. No rule named `hatch/J2`, `<common>/config` or
`.githooks`.

| Step | Tool | Target | Result |
| --- | --- | --- | --- |
| 1 | Write | `hatch/J2/requests/` | Created the file |
| 2 | Bash | `hatch/J2/requests/` | `operation not permitted` |
| 3 | Edit, after a Read | `<common>/config` | Changed the file |
| 4 | Bash | `<common>/config` | `operation not permitted` |
| 5 | Write | `.githooks/` in the repository root | Created the file |
| 6 | Bash | `.githooks/` in the repository root | `operation not permitted` |
| 7 | Write | `ticket-1/.claude/` | "File is in a directory that is denied by your permission settings." |
| 8 | Write | `ticket-1/` | Created the file |

The run agrees with P5: a file tool meets deny rules only, and a path no rule names stays open to it.

It did not establish:

- that a session launched by the Overseer, under settings `ClaudeCodeAdapter` rendered, behaves the same way;
- how any role other than a builder fares;
- why Bash was refused at `<common>/config`, which no `denyWrite` named;
- that a request planted in `hatch/J2` is read and acted on: that step is read in code, not run.
