# Refusals

> **Question:** This was refused: what does it mean, was anything written, and what do I do?
> **Time:** 2 minutes for the rules, then a search for the sentence.
> **Read first:** nothing; come here with the line that was printed.
> **Next:** [exit codes](../cli.md#exit-codes), [runbook](../operations/runbook.md), [known gaps](known-gaps.md).

## In one screen

Search this page for the words that were printed. A person sees the sentence, not its code, so the first column of
every table holds the sentence's fixed words, with `<ticket>`, `<status>` and the like for what changes. A printed
backtick ends a fragment, so a fragment never spans one. The `Code` column is the name to grep for in `src/`.

In the tables a command is written without its `forge` prefix: `jobs` means `forge jobs`.

A [refusal](../glossary.md#refusal) is the tool declining to do something, on purpose. Five rules cover nearly all of
them:

1. **A refusal writes nothing.** The change is dropped before any stored [tracker](../glossary.md#tracker) file is
   touched. The exceptions are named under [When something was written](#when-something-was-written).
2. **`refused` exits 1 and `unrepaired` exits 2.** The rule is in [cli.md](../cli.md#exit-codes). Every row here is exit
   1 unless it says exit 2.
3. **`--json` does not change a refusal.** A refused command prints its sentence on standard error and nothing on
   standard output, with or without `--json`.
4. **The [Bridge](../glossary.md#bridge) shows the same sentence,** beside the Bridge control that was used.
5. **A [session](../glossary.md#session) under a [job](../glossary.md#job) sees the same sentence too,** worded by its
   own command from the [Hatch](../glossary.md#hatch) reply.

![Three doors, a terminal command, a Bridge control and a session under a job, reach the same rules. A rule refuses with a code and facts and one wording util turns that into one sentence, which lands on standard error at exit 1 or 2, in a 409 answer shown beside the Bridge control, or, through a Hatch reply carrying the code, on the standard error of the session's own command.](../figures/refusals/one-refusal-three-doors.png)

*Words live in one place, so a sentence here is the sentence at every door.*

## The rules in full

**Few sentences show a code.** Only an incomplete-ticket reason such as `brief-missing` and a role refusal print a
code, both in parentheses. A Hatch reply file carries the code as data, in `detail`.

**Exit codes follow the status,** so check the exit code in a script, never the wording. A relayed refusal keeps its
status through the reply, so a session exits as a direct run would.

**The Bridge has three answers of its own.** All three come from the same route, and the Bridge prints them as sent.

| Answer | Shown as | Cause | What to do |
| --- | --- | --- | --- |
| 409 | The sentence, beside the Bridge control | Any refusal in this page, `refused` or `unrepaired`. | As the row says. |
| 423 | `The install version changed` in the shell banner | Launches are held for an install change. | Run `update`. See the [known gap](known-gaps.md#gap-job-stop-while-install-held) on stopping a job meanwhile. |
| 400 | `malformed-body` | The body is not a known [control command](../architecture/control-and-hatch.md). | A client defect. Other route tokens are in [the Overseer API](overseer-api.md). |

## When something was written

"Nothing was written" means no stored tracker file changed: a refused command leaves `progress.json`, `log.jsonl` and
the tickets as they were. Taking the lock still writes its own files under
[`.lock`](../data-model/on-disk-atlas.md); these carry no board data. These cases go further.

| Case | What stands | Why |
| --- | --- | --- |
| A relayed command is refused | One `hatch-applied` log record, always. Anything the command changed before it refused stays too. | The [Overseer](../glossary.md#overseer) commits the whole [lock hold](../glossary.md#lock-hold), even when one request in it was refused. [Known gap](known-gaps.md#gap-refused-relayed-command-partial). |
| `baton-pass-failed` from `update` or `oversee restart` | The Overseer's `baton-pass-failed` log record, a second one if it loses its port, plus everything `update` installed. | The install finished, and the Overseer records the failed [Baton pass](../glossary.md#baton-pass) before anything reads it. |
| `lock-taken-over` | Whatever the [hold journal](../glossary.md#hold-journal) had committed. | The next command finishes it. See [storage](../data-model/storage.md). |
| `worktree-repair-failed`, `worktree-has-uncommitted-work` | The tracker is unchanged, though the sentence reads "Nothing was written". A `recreate` may have saved its patch, and git may have done part of the step. | The git step runs inside the [lock hold](../glossary.md#lock-hold), before the board is written. |
| `malformed-hatch-reply` | Unknown. | The reply that would say is unreadable. |

## Lines that are not refusals

These lines come from a session's relayed command or from a hook, and each exits 0.

| Printed line | Exit | Meaning |
| --- | --- | --- |
| `queued <request>` | 0 | The Overseer did not answer in time, and the request still waits in the Hatch. |
| `nothing-to-do <request>` | 0 | The Overseer read the request, and the change was already made. |
| `done <request>` | 0 | The Overseer applied the request. |
| A deny in the JSON of `hook bash-domains` | 0 | The guard on a ticket's `network` line denied a tool call. A [hook](../architecture/cli-and-install.md) that errored would let the call through, so every failure answers deny. |

## Every printed refusal

- [Tickets and rows](#tickets-and-rows) (49)
- [Jobs and worktrees](#jobs-and-worktrees) (12)
- [Epics](#epics) (4)
- [Filing drafts](#filing-drafts) (10)
- [Decisions and incidents](#decisions-and-incidents) (13)
- [Gates and pipeline](#gates-and-pipeline) (2)
- [Airlocks and landing](#airlocks-and-landing) (7)
- [Overseer and Baton](#overseer-and-baton) (12)
- [Hatch and roles](#hatch-and-roles) (11)
- [Install and version](#install-and-version) (6)
- [Tracker, lock and journal](#tracker-lock-and-journal) (5)
- [Stored files](#stored-files) (5)
- [Refusals with no code](#refusals-with-no-code) (10)

A browser's find works on the page as it stands: every family is open.

Sentences that start "Ticket #`<ticket>` is `<status>`" are listed by the words after that opening, since the opening
is shared. Search for the later part of the line. "Never printed" marks a sentence the code can word and no path
reaches; it is listed so a grep of a code ends here.

### Tickets and rows

Words here: [ticket](../glossary.md#ticket), [task](../glossary.md#task), [row](../glossary.md#row),
[draft ticket](../glossary.md#draft-ticket), [ticket hold](../glossary.md#ticket-hold),
[review bar](../glossary.md#review-bar), [group](../glossary.md#group), [release ticket](../glossary.md#release-ticket),
[Customs](../glossary.md#customs).

<details open>
<summary>49 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no task #<task>` | `unknown-task` | The row id names no row. | Read the ids with `status`. | [state machines](../data-model/state-machines.md) |
| `Task #<task> belongs to ticket #<ticket>, so moving it here` | `ticket-owned-row` | A `task` verb tried to move a row a ticket owns. | Run the `ticket` verb the sentence names, or `--force` to move the row alone. | [state machines](../data-model/state-machines.md) |
| `Ticket #<ticket> already has task #<task>` | `ticket-already-has-row` | `task add --ticket` named a ticket that has a row. | Add `--force` to move the ticket to the added row, or drop `--ticket`. | [entities](../data-model/entities.md) |
| `Task #<task> already belongs to ticket #<ticket>` | `task-belongs-to-another-ticket` | `ticket link` named a row another ticket owns. | Add `--force` to move it. | [entities](../data-model/entities.md) |
| `Ticket #<ticket> is already <status>, so nothing was changed` | `ticket-already-in-status` | The move targets the status the ticket holds. | Nothing. Exit 1 still, so a script sees the move did not happen. | [state machines](../data-model/state-machines.md) |
| `and a move to <status> takes a ticket that is` | `illegal-ticket-move` | The legality table has no such move. | Use the sources the sentence lists, or `ticket status` to set it directly. | [state machines](../data-model/state-machines.md) |
| `and no move returns a ticket to draft` | `move-to-draft` | A move targeted `draft`. Filing is the only way in. | Run `ticket hold` to keep it from being built. | [state machines](../data-model/state-machines.md) |
| `is a draft ticket, so it was not moved` | `move-of-a-draft` | A move other than abandon named a draft ticket. | Run `ticket ready` first. | [state machines](../data-model/state-machines.md) |
| `not a draft ticket, so nothing was readied` | `ready-of-a-ticket-not-in-draft` | `ticket ready` named a ticket past `draft`. | Nothing. A ticket past `draft` needs no readying; an abandoned one is settled. | [state machines](../data-model/state-machines.md) |
| `Nothing was readied: ticket #<ticket> is incomplete` | `incomplete-tickets` | The body lacks a numbered Acceptance or a `## Brief`. The sentence names `acceptance-unnumbered` or `brief-missing`. | Number items `A1.`, write the Brief, ready again. | [cli.md](../cli.md) |
| `was not moved: abandon needs --reason` | `abandon-without-reason` | `ticket abandon` had no reason, or a blank one. | Pass `--reason`. | [state machines](../data-model/state-machines.md) |
| `has no row, so --tokens has nowhere to be recorded` | `tokens-without-a-row` | `--tokens` on a move of a ticket with no row, as a draft ticket being abandoned. | Drop `--tokens`. [known gap](known-gaps.md#gap-stale-prose-in-code) | [entities](../data-model/entities.md) |
| `and another review pass needs a ticket that is in-review` | `rereview-outside-review` | `ticket rereview` outside `in-review`. | Follow the sentence when it offers `ticket status`, otherwise leave it. | [state machines](../data-model/state-machines.md) |
| `has no in-progress review bar, so there is no review pass` | `review-record-without-a-review-bar` | Never printed: only the Overseer records a review, after opening the bar itself. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [build and review](../architecture/build-and-review.md) |
| `stores no round, so the pass cannot be recorded` | `review-bar-without-a-round` | Never printed: only the Overseer records a review, after opening the bar itself. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [build and review](../architecture/build-and-review.md) |
| `is not an in-progress review bar, so the review of ticket` | `review-record-on-a-row-that-is-not-a-review-bar` | Never printed: no caller names a bundle bar. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [build and review](../architecture/build-and-review.md) |
| `which was not claimed with ticket #<ticket>` | `review-record-on-a-bar-outside-the-bundle` | Never printed: no caller names a bundle bar. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [build and review](../architecture/build-and-review.md) |
| `and a claim takes a ticket that is` | `unclaimable-status` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `which must be reviewed or delivered before it is claimed` | `claim-waits-on-dependencies` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `is held, so it is not claimed` | `claim-of-a-held-ticket` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `is under review: its review row #<task> is in progress` | `claim-under-review` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `and --after names a predecessor that is in-review` | `claim-after-a-ticket-not-in-review` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `the two are not in one release bundle of the same group` | `claim-after-a-ticket-outside-the-bundle` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `it does not wait on #<ticket>` | `claim-after-a-ticket-it-does-not-wait-on` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `and the concurrency limit is <n>` | `concurrency-limit-reached` | Never printed: `Board.claimTickets` has no caller. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [state machines](../data-model/state-machines.md) |
| `There is no ticket #<ticket>. Run` | `unknown-dependency` | A dependency names no ticket. | Read the ids with `ticket list`. | [entities](../data-model/entities.md) |
| `There is no ticket #<ticket>. Nothing was written.` | `unknown-linked-ticket` | `--introduced-by` or `--found-in-review` names no ticket. | Read the ids with `ticket list`. | [entities](../data-model/entities.md) |
| `That would make tickets wait on each other in a circle` | `dependency-loop` | The dependency closes a loop, printed as a path. | Remove one link of the path. | [entities](../data-model/entities.md) |
| `and only a bug names the ticket that introduced it` | `introduced-by-on-a-non-bug` | `introduced-by` on a `ticket` or `research`. | Set it on the bug. | [entities](../data-model/entities.md) |
| `cannot be introduced by itself` | `introduced-by-itself` | A bug named itself as the cause. | Name the cause. | [entities](../data-model/entities.md) |
| `and only a delivered ticket's change lets a bug escape` | `introduced-by-an-undelivered-ticket` | The named cause is not delivered. | Name a delivered ticket. | [entities](../data-model/entities.md) |
| `and its priority was not changed: it is already` | `priority-unchanged` | The ticket has that priority. | Nothing. | [entities](../data-model/entities.md) |
| `and its size was not changed: it is already` | `size-unchanged` | The ticket has that size. | Nothing. | [entities](../data-model/entities.md) |
| `only a draft or pending ticket can be lowered to low` | `lowering-a-ticket-that-is-not-pending` | `priority low` past `pending`. | Leave the priority. [known gap](known-gaps.md#gap-stale-prose-in-code) | [entities](../data-model/entities.md) |
| `and it was not edited: an agent may already be working from it` | `edit-of-a-ticket-past-pending` | `ticket edit` past `pending`. | Add `--force` only when no job is running on it: a body changed after launch makes Customs refuse the job's report (`ticket-body-changed`). | [Customs and gates](../architecture/customs-and-gates.md) |
| `and its network line was not changed: it is set only while` | `network-of-a-ticket-past-pending` | `ticket network` past `pending`. | Abandon and refile, or leave it. | [confinement](../architecture/confinement.md) |
| `is not a public domain` | `network-domain-not-public` | A loopback name, a `.local` name or a private address. The plural reads `are not public domains`. | Name a public domain. | [confinement](../architecture/confinement.md) |
| `network line was not changed: it already reads` | `network-unchanged` | The line holds those domains. | Nothing. | [confinement](../architecture/confinement.md) |
| `and its agents were not changed: no agent will work it again` | `agents-of-a-settled-ticket` | `ticket agent` on a `delivered` or `abandoned` ticket. | Nothing. | [state machines](../data-model/state-machines.md) |
| `and its agents were not changed: they already run on` | `agents-unchanged` | The ticket has that model and effort. | Nothing. | [entities](../data-model/entities.md) |
| `so there is nothing to <hold or unhold>` | `hold-of-a-settled-ticket` | `ticket hold` or `unhold` on a `delivered` or `abandoned` ticket. | Nothing. | [state machines](../data-model/state-machines.md) |
| `Ticket #<ticket> is already held.` | `ticket-already-held` | The ticket has a hold. | Run `ticket show` for its reason. | [state machines](../data-model/state-machines.md) |
| `Ticket #<ticket> is not held.` | `ticket-not-held` | `ticket unhold` on a ticket with no hold. | Nothing. | [state machines](../data-model/state-machines.md) |
| `and its release mark was not <set or cleared>` | `release-mark-of-a-settled-ticket` | `ticket release-of` on a `delivered` or `abandoned` ticket. | Nothing. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `belongs to no group, so it cannot be a group's release ticket` | `release-mark-of-an-ungrouped-ticket` | The ticket has no group. | File it in the group. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `already has its release ticket` | `group-already-has-a-release-ticket` | A group has one open release ticket. The other form reads `is already the release ticket of group`. | Clear the mark the sentence names first, or nothing. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `is not its group's release ticket` | `ticket-is-not-a-release-ticket` | `release-of --clear` on an unmarked ticket. | Nothing. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `and carries the release mark of group <group>` | `reopen-beside-an-open-release-ticket` | Reopening would leave two open release tickets. | Clear the other mark first. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `There is no readable ticket <reference>` | `no-readable-ticket` | No ticket has that id. A file that does not parse shows in `ticket list`. | Read the ids with `ticket list`. | [cli.md](../cli.md) |

</details>

### Jobs and worktrees

Words here: [job](../glossary.md#job), [worktree](../glossary.md#worktree),
[product owner](../glossary.md#product-owner), [decision](../glossary.md#decision), [incident](../glossary.md#incident).

<details open>
<summary>14 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no job <job>. Nothing was written.` | `unknown-job` | The id names no live job, and no ended job the move can reach. | Run `jobs` to list them. | [watchers](../architecture/watchers.md) |
| `is finished, and a finished job is never continued` | `job-finished` | A move named an ended job. `intake close` and `job message` also print this for a job still `stopping`. | Start a fresh ticket or intake. A closed product owner reopens through `job message`. | [watchers](../architecture/watchers.md) |
| `works no ticket, so no fresh agent can take its work over` | `job-has-no-ticket` | `job fresh` on a job with no ticket. | Use `job stop`. | [watchers](../architecture/watchers.md) |
| `so it has no intake to close or title` | `job-not-intake` | `intake close` or `intake title` named a job of another kind. | Name the product-owner job. | [Assistant and intake](../architecture/assistant-and-intake.md) |
| `is blank: write a short title after --` | `intake-title-empty` | `intake title` with a title of only spaces, sent through the API or a Hatch. The terminal refuses earlier with a usage line. | Send a title. | [cli.md](../cli.md#intake-title) |
| `so it cannot move to <state>` | `job-move-illegal` | A job move outside the table, raised inside the Overseer or by a control command. | A defect in forge: file a bug with the printed line. `job stop` is the way out. | [state machines](../data-model/state-machines.md) |
| `waits on a question for the user; a chat turn would answer it` | `job-awaits-user-answer` | `job message --incident` while the job or its ticket waits on an `agent-question`. | Answer the decision. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `is the user's product-owner session; only the user chats with it` | `job-is-product-owner` | `job message --incident` at a product-owner job. | Send it without `--incident`, as User. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `Name the product-owner job whose intake to close` | `intake-close-without-job` | A control command with no `jobId`. The terminal refuses earlier with a usage line, so an API caller sees this. | Send `jobId`. | [Assistant and intake](../architecture/assistant-and-intake.md) |
| `Name the product-owner job whose intake to title` | `intake-title-without-job` | An `intake-title` control command with no `jobId`. The terminal refuses earlier with a usage line, so an API caller sees this. | Send `jobId`. | [cli.md](../cli.md#intake-title) |
| `so it cannot be recorded delivered by hand` | `ticket-has-live-job` | `ticket deliver --by-hand` while a job works the ticket. | Run `job stop` first. | [cli.md](../cli.md) |
| `still runs on the worktree of #<ticket>; stop it first` | `worktree-in-use` | `worktree repair` `recreate` or `unlock` with a job on the ticket. | Run `job stop`, then repair. | [build and review](../architecture/build-and-review.md) |
| `holds uncommitted work that could not be saved to a patch` | `worktree-has-uncommitted-work` | `recreate` found changes it could not read or save, or no job ever ran on the ticket, so there is no job folder to name for the patch. | Save the work by hand, then repair. | [runbook](../operations/runbook.md) |
| `Git refused the <step> repair of the worktree` | `worktree-repair-failed` | Git failed the repair step. The sentence ends with git's reason. | Fix what git names. A `recreate` patch may already be saved in the job folder. | [runbook](../operations/runbook.md) |

</details>

### Epics

Words here: [epic](../glossary.md#epic).

<details open>
<summary>4 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `is not a usable epic key` | `malformed-epic-key` | The key is not lower-case words joined by hyphens. | Use a key as the sentence shows. | [entities](../data-model/entities.md) |
| `There is already an epic <epic>` | `epic-already-exists` | The key is taken. | Run `epic edit`. | [entities](../data-model/entities.md) |
| `There is no epic <epic>` | `unknown-epic` | A key names no epic. | Run `epic list`. | [entities](../data-model/entities.md) |
| `was not removed: #<ticket> still names it` | `epic-still-named` | Tickets name the epic. Plural `still name it`. | Run `ticket epic <id> --remove <epic>` on each. | [entities](../data-model/entities.md) |

</details>

### Filing drafts

Words here: [filing draft](../glossary.md#filing-draft).

<details open>
<summary>10 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no open draft <draft>` | `unknown-draft` | The id names no open filing draft. | Run `draft list`. | [entities](../data-model/entities.md) |
| `was not claimed: <owner> holds it` | `draft-claimed-by-another-owner` | Another owner claimed the filing draft. | Add `--force`, or wait for `draft release`. | [entities](../data-model/entities.md) |
| `was not closed: there is no ticket` | `draft-closed-into-unknown-tickets` | `--tickets` names no ticket. | File the tickets first. | [entities](../data-model/entities.md) |
| `was not closed: <question> is still open` | `draft-has-open-questions` | Questions are unanswered. Plural `are still open`. | Run `draft answer` or `draft drop` on them. | [entities](../data-model/entities.md) |
| `has no question <question>` | `unknown-draft-question` | The question id is not in the filing draft. | Run `draft show`. | [entities](../data-model/entities.md) |
| `has no note or question <item>` | `unknown-draft-item` | `draft drop` named an item it does not hold. | Run `draft show`. | [entities](../data-model/entities.md) |
| `A question takes <n> to <n> options` | `draft-question-option-count` | Option count outside the bounds. | Give that many options. | [cli.md](../cli.md) |
| `A question needs --recommended <letter>` | `draft-question-without-recommendation` | A control command with no recommendation. The terminal refuses earlier with a usage line, so an API caller sees this. | Send the recommendation. | [cli.md](../cli.md) |
| `There is no option <letter>: the options are` | `unknown-draft-option-letters` | A letter outside the question's options. | Use a listed letter. | [cli.md](../cli.md) |
| `names several options, and the question takes one` | `several-letters-on-single-select-question` | Several letters on a single-select question. | Give one, or ask with `--multiple`. | [cli.md](../cli.md) |

</details>

### Decisions and incidents

Words here: [decision](../glossary.md#decision), [incident](../glossary.md#incident), [Airlock](../glossary.md#airlock),
[Assistant](../glossary.md#assistant).

<details open>
<summary>13 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no decision <decision>` | `unknown-decision` | The id names no decision. | Run `decisions`. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `is already settled, and the first answer wins` | `decision-already-answered` | Another answer came first. | Nothing. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `so it takes one answer for each, not <n>` | `decision-answer-count` | Answer count differs from the question count. | Give one choice per question. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `A decision asks at least one question` | `decision-without-questions` | A decision would open with none, as an escalated incident that carries no question. | Answer the incident instead. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `so no two of its questions may read` | `decision-questions-repeat` | Two questions share their text, and answers key on it. | Reword one. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `so it takes one choice of letters for each` | `decision-has-several-questions` | Free text on a decision of several questions. | Use letters, or answer in the Bridge. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `does not name them by letter` | `decision-option-unknown` | A letter outside the options, or a repeated one. Most Overseer decisions have no options, so any letter prints this: [known gap](known-gaps.md#gap-overseer-decisions-have-no-options). | Use the option letters, or answer with `decide <E> -- <text>`. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `takes one option, not` | `decision-single-choice` | Several letters on a single-select question. | Give one letter. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `There is no incident <incident>` | `unknown-incident` | The id names no incident. | Run `incidents`. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `is already closed` | `incident-closed` | Someone settled it. | Nothing. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `which carries no agent's question to answer or escalate` | `incident-not-a-question` | Never printed: `requireIncidentAllows` refuses first, on the same two kinds. See `incident-move-not-allowed`. [known gap](known-gaps.md#gap-dead-code-and-unused-states) | Nothing to do. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `has no open incident that allows <move>` | `no-open-incident` | An Airlock move needs an incident, and none allows this one. | Run `incidents`, then the move it allows. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `name one with --incident` | `several-open-incidents` | Several open incidents allow the move. | Pass `--incident`. | [questions and incidents](../architecture/questions-and-incidents.md) |

</details>

### Gates and pipeline

Words here: [gate](../glossary.md#gate), [pipeline](../glossary.md#pipeline).

<details open>
<summary>2 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no gate <gate>` | `unknown-gate` | `gate remove` named no gate. The tail reads `none is stored` or lists the gates. | Run `gate list`. | [Customs and gates](../architecture/customs-and-gates.md) |
| `cannot be read as a pipeline` | `malformed-pipeline` | `pipeline.json` is malformed. Every `gate` verb but `gate retry` refuses, so no `gate` verb overwrites a hand edit. An accepted proposal does: [known gap](known-gaps.md#gap-proposal-overwrites-malformed-pipeline). | Repair or delete the file. | [Customs and gates](../architecture/customs-and-gates.md) |

</details>

### Airlocks and landing

Words here: [Airlock](../glossary.md#airlock), [Pass](../glossary.md#pass), [sweep](../glossary.md#sweep),
[target](../glossary.md#target), [group](../glossary.md#group), [release ticket](../glossary.md#release-ticket),
[incident](../glossary.md#incident).

<details open>
<summary>7 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `so it was not queued to merge` | `merge-queue-of-a-ticket-not-in-review` | Never printed: only an Overseer step queues a ticket, right after a passing review. | Nothing to do. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `holds the <target> Airlock, and a target merges one ticket at a time` | `airlock-held` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `is not queued to merge into <target>` | `merge-candidate-not-queued` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `queued to merge first` | `higher-priority-queued` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| `is not refreshed: its release ticket` | `refresh-beside-a-queued-release` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | [Airlocks and groups](../architecture/airlocks-and-groups.md) |

</details>

### Overseer and Baton

Words here: [Overseer](../glossary.md#overseer), [Baton](../glossary.md#baton), [Baton pass](../glossary.md#baton-pass),
[Watcher](../glossary.md#watcher). Recipe:
[Starting the Overseer is refused](../operations/runbook.md#starting-the-overseer-is-refused).

<details open>
<summary>14 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `must be a positive whole number of milliseconds` | `malformed-overseer-poll-interval` | The test setting `FORGE_OVERSEER_POLL_INTERVAL_MILLISECONDS` holds another value. | Unset it or correct it. | [Baton](../architecture/baton.md) |
| `cannot be created whole` | `baton-not-created-whole` | The Baton claim needs a hard link, and the filesystem refused it. | Move the data folder to a filesystem that allows hard links. | [Baton](../architecture/baton.md) |
| `An Overseer already serves this board` | `overseer-already-running` | A live Baton names another Overseer. | Use it, or run `oversee stop`. | [Baton](../architecture/baton.md) |
| `No Overseer serves this board` | `overseer-down` | `open` found no live Baton. | Run `oversee --detach`. | [Baton](../architecture/baton.md) |
| `at the same moment and holds the newer Baton` | `overseer-contended` | Two starts raced and this one lost. | Nothing. The other one serves. | [Baton](../architecture/baton.md) |
| `took this board over from the Baton` | `baton-taken` | A newer generation took over. **Exit 2.** | Nothing. The newer Overseer drives. | [Baton](../architecture/baton.md) |
| `is in use, so the Overseer did not start` | `overseer-port-in-use` | The candidate ports are taken. The range form reads `Every port from`. | Pass a free `--port`. | [watchers](../architecture/watchers.md) |
| `so it cannot hold an Overseer Baton` | `overseer-identity-unreadable` | The start and boot of the process cannot be read. **Exit 2.** | A defect in forge: file a bug with the printed line. | [Baton](../architecture/baton.md) |
| `before it answered` | `overseer-did-not-start` | The `--detach` child exited or never answered. The log may not hold why: [known gap](known-gaps.md#gap-detached-start-loses-its-error). | Read the log it names, or run `oversee` in the foreground. | [Baton](../architecture/baton.md) |
| `is still live after being asked to stop` | `overseer-still-live` | The Baton stayed live through `OVERSEER_STOP_TRIES` tries. | Run `oversee status`, then stop it again. | [Baton](../architecture/baton.md) |
| `The Baton pass to code <code version> failed at <step>` | `baton-pass-failed` | `update` or `oversee restart` read a failed Baton pass, or read no outcome within `BATON_PASS_OUTCOME_TRIES` tries. The Overseer prints it too if it loses its port. The old Overseer keeps driving unless that happens. See [Sentences that mislead](#sentences-that-mislead). | Run `oversee status` and read the Overseer log. If nobody drives, run `oversee --detach`. What `update` installed stands. | [Baton](../architecture/baton.md) |
| `is sent to the live Overseer, never applied to the board` | `overseer-control-is-runtime-only` | Never printed: the API route, `oversee stop` and the Bouncer each stop `overseer-stop` and `overseer-restart` earlier. | Nothing to do. | [control and Hatch](../architecture/control-and-hatch.md) |
| `so only it delivers tickets` | `overseer-owns-the-lifecycle` | `ticket deliver --by-hand` with a live Overseer. | Run `oversee stop` first. | [cli.md](../cli.md) |
| `did not bundle, so the Overseer cannot spawn Watchers` | `watcher-bundle-failed` | The Watcher entry in the forge program checkout, not the tracked repository, did not bundle. **Exit 2.** | Read the reason at the end of the line, then repair the program checkout. | [watchers](../architecture/watchers.md) |
| `cannot bind the Watcher endpoint` | `watcher-endpoint-does-not-fit` | This platform's limit refuses the endpoint, so no launch file was written. A drive pass turns this into a notice of the same kind. | Move the home folder to a shorter path. | [watchers](../architecture/watchers.md) |

</details>

### Hatch and roles

Words here: [Hatch](../glossary.md#hatch), [Bouncer](../glossary.md#bouncer), [role](../glossary.md#role),
[Assistant](../glossary.md#assistant), [product owner](../glossary.md#product-owner), [finding](../glossary.md#finding),
[draft ticket](../glossary.md#draft-ticket), [incident](../glossary.md#incident), [builder](../glossary.md#builder),
[reviewer](../glossary.md#reviewer), [Handoff](../glossary.md#handoff).

<details open>
<summary>11 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `this job's role may not run it` | `command-not-allowed-for-role` | The Bouncer has no row for this command and role. | An agent stops and reports it. User runs it from a terminal. | [control and Hatch](../architecture/control-and-hatch.md) |
| `a worker files only a low finding` | `worker-filing-flag` | A worker's filing with flags a finding may not take. | A worker files with `--priority low` and the allowed flags; the Overseer adds the finder dependency and group. | [control and Hatch](../architecture/control-and-hatch.md) |
| `this job has already filed as many findings as one job may` | `worker-filing-limit` | `WORKER_FILINGS_PER_JOB` (10) reached. | Put the rest in the Handoff. | [control and Hatch](../architecture/control-and-hatch.md) |
| `it changes only a draft ticket this job filed` | `not-own-draft` | A product owner reached for a ticket it did not file, or one past `draft`. | Touch only its own draft tickets. | [Assistant and intake](../architecture/assistant-and-intake.md) |
| `it is legal only as a move the named delivered incident allows` | `incident-move-not-allowed` | The incident was not delivered to this Assistant, or does not allow the move. A terminal move under `--incident` prints it too, and so do `incident answer`, `incident note` and `incident escalate` on a kind that does not list them, with no `--incident` flag involved. Some listed moves [cannot succeed](known-gaps.md#gap-allowed-moves-cannot-succeed). | Use a move the incident allows. | [questions and incidents](../architecture/questions-and-incidents.md) |
| `a request may not name a job, a role or an admission` | `hatch-identity-mismatch` | Never printed: the Hatch format check below catches these fields first. | Nothing to do. | [control and Hatch](../architecture/control-and-hatch.md) |
| `names a job or role of its own` | `hatch-identity-mismatch` | A request carries `jobId`, `role` or `admission`, or a body id unlike its file name. The Assistant's job-targeting moves fall here. [known gap](known-gaps.md#gap-assistant-job-moves-refused-at-hatch) | The verb cannot be sent from a session. An Assistant settles the incident by another allowed move such as `ticket park <id> --incident <I> -- <reason>`, or leaves it for its default move; User can run the job move at a terminal with `--incident <I>`. A builder or reviewer reports it in the Handoff. | [control and Hatch](../architecture/control-and-hatch.md) |
| `cannot run under job <job>: it is neither read-only nor` | `verb-not-relayable` | The verb has no control command and is not read-only. | Do it outside the job, or leave it for User. | [control and Hatch](../architecture/control-and-hatch.md) |
| `The relayed request <request> is not a request the Overseer reads` | `malformed-hatch-request` | The request file does not parse, or lacks a numeric format version, a request id or a command kind, or its body field is unusable. A request naming another numeric version is not refused: it waits for an Overseer that reads it, and the verb prints `queued`. | Send it through the verb, never by hand. | [control and Hatch](../architecture/control-and-hatch.md) |
| `cannot be read, so whether the request was applied is unknown` | `malformed-hatch-reply` | The reply file is broken. **Exit 2.** The request may have been applied. | Run `status`, then decide. | [control and Hatch](../architecture/control-and-hatch.md) |

</details>

### Install and version

<details open>
<summary>6 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `from an older forge` | `install-version-mismatch` `older` | The installed files are older. | Run `update`. | [CLI and install](../architecture/cli-and-install.md) |
| `from a newer forge` | `install-version-mismatch` `newer` | The installed files are newer. `init` and `update` refuse too. | Update the program, then run `update`. | [CLI and install](../architecture/cli-and-install.md) |
| `carry no install version` | `install-version-mismatch` `unversioned` | `version.json` is missing beside installed files. | Run `update`. | [CLI and install](../architecture/cli-and-install.md) |
| `gives no install version` | `install-version-mismatch` `unreadable` | `version.json` does not parse or holds no whole number. | Run `update`. | [CLI and install](../architecture/cli-and-install.md) |
| `is a directory where forge keeps its install version file` | `install-version-mismatch` `manifest-is-a-directory` | A directory sits at the path. `init` and `update` refuse too. | Remove it, then run `update`. | [CLI and install](../architecture/cli-and-install.md) |
| `is built to run beside it only in a repository` | `older-program-present` | The root holds the released program's data folder. | Use a scratch repository. | [CLI and install](../architecture/cli-and-install.md) |

</details>

### Tracker, lock and journal

Words here: [tracker](../glossary.md#tracker), [lock hold](../glossary.md#lock-hold),
[hold journal](../glossary.md#hold-journal). Recipe: [Lock refusals](../operations/runbook.md#lock-refusals).

<details open>
<summary>5 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `tracker was found in <directory> or any directory above it` | `no-tracker-found` | No tracker up the tree. | Run `init` in the repository. | [CLI and install](../architecture/cli-and-install.md) |
| `which FORGE_ROOT names` | `no-tracker-at-override` | The variable names a directory with no tracker. | Run `init` there, or unset it. | [CLI and install](../architecture/cli-and-install.md) |
| `is holding <path> and did not release it` | `tracker-lock-held` | The lock stayed held through `LIMITS.LOCK_RETRY_COUNT` tries. **Exit 2.** | If nothing runs, remove that path and retry. | [storage](../data-model/storage.md) |
| `held <path> so long that another command took it over` | `lock-taken-over` | This command outlived the lock. **Exit 2.** | Run it again. The next command finishes what was committed. | [storage](../data-model/storage.md) |
| `holds an unfinished write that cannot be read` | `malformed-hold-journal` | `hold-journal.json` is broken. **Exit 2.** | Repair it, or remove it and leave that write unfinished. | [storage](../data-model/storage.md) |
| `could not be removed` | `hold-journal-unremovable` | The write finished, but something holds `hold-journal.json`. **Exit 2.** | Close what holds it and run a command; that command finishes it. | [storage](../data-model/storage.md) |

</details>

### Stored files

<details open>
<summary>5 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `cannot be read: it is not there` | `unreadable-tracker` `absent` | `progress.json` went between discovery and the read. **Exit 2.** | Run again. Without the file the next run finds no tracker. | [storage](../data-model/storage.md) |
| `cannot be read: <reason>` | `unreadable-tracker` `progress-file` | `progress.json` is malformed, or of an older format. **Exit 2.** | Repair it. The reason may carry `OLDER_FORMAT_ADVICE`. | [storage](../data-model/storage.md) |
| `The log cannot be read:` | `unreadable-tracker` `log-file` | `log.jsonl` has a bad line. **Exit 2.** | Repair the line it names. | [storage](../data-model/storage.md) |
| `Ticket file ignored:` | `malformed-ticket-file` | A command named a ticket whose file does not parse. **Exit 2.** | Repair the line it names. | [cli.md](../cli.md) |
| `already exists but cannot be read as <an epic or a draft>` | `unreadable-file-in-the-way` | A malformed file sits at the path the record would take. | Repair or delete it. | [storage](../data-model/storage.md) |

</details>

### Refusals with no code

These sentences come from `cli/` as text and carry no code.

<details open>
<summary>10 entries</summary>

| Printed words | Exit | Cause | What to do |
| --- | --- | --- | --- |
| `A tracker already governs this directory` | 1 | `init` below another tracker's root. | Run `update` at the root it names. |
| `is inside a bare git repository` | 1 | `init` in a bare repository. | Run in a checkout, or pass `--root`. |
| `would create the tracker in` | 1 | `FORGE_ROOT` names another directory. | Unset it, or pass that directory as `--root`. |
| `which forge no longer installs for` | 1 | `version.json` names a retired agent host. | Remove the files it names, then rerun. |
| `The skill folder <path> could not be read` | 2 | The program checkout lacks a skill folder. | Reinstall or restore the program checkout. |
| `No text was generated for the installed file` | 2 | The install table and the program checkout disagree. Three more sentences share this cause: `An installed part lists no file.`, `No files were read for the installed skill`, `The install lists no briefs.` | Reinstall or restore the program checkout. |
| `There is no job <job>.` | 1 | `job show` or `job attach`, with a usage line. | Run `jobs`. |
| `There is no ticket <reference>.` | 1 | `task add --ticket`. | Run `ticket list`. |
| `--review-of names ticket <reference>, and there is none` | 1 | `task add --review-of`. | Run `ticket list`. |
| `clear needs --yes when standard input is not a terminal` | 1 | `clear` with nobody to confirm. | Pass `--yes`, knowing what `clear` removes. |

</details>

## What is not here

| Refused by | Where |
| --- | --- |
| [Customs](../glossary.md#customs): a report refused, routed to a resume or an incident | [Customs and gates](../architecture/customs-and-gates.md) |
| Landing: `target-moved`, `dirty-checkout`, `acceptance-waived` and the rest, with the action each leads to | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| The Hatch ladder: which check refuses a relayed command, in order | [Control and Hatch](../architecture/control-and-hatch.md) |
| HTTP guards: `forbidden`, `unauthorized`, `not-ready`, `not-found` | [Overseer API](overseer-api.md) |
| Argument errors: a missing id, an unknown option, an unknown command | `cli/`. Each prints its own remedy, most with a `Usage:` line, at exit 1. |

## Sentences that mislead

These rows print as listed above, and the sentence is not the whole truth.

| Code | What the sentence implies | What holds | Gap |
| --- | --- | --- | --- |
| `tokens-without-a-row`, `lowering-a-ticket-that-is-not-pending` | A low ticket has no row until it is started. | `ticket ready` gives a row at any priority. | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `worktree-repair-failed`, `worktree-has-uncommitted-work` | Nothing was written at all. | Only the tracker is untouched. See [When something was written](#when-something-was-written). | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `job-finished` from `intake close` or `job message` | The job has ended. | It is `stopping`: it is ending, and takes no close or message. | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `baton-pass-failed` from `update` or `oversee restart` after the old Overseer let go | The old Overseer keeps driving. | Both commands print before the old Overseer has taken its port back. If that fails, it exits and nobody drives. Only `oversee status` shows the end state. | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `baton-pass-failed` with `could not be bound again`, at step `bind-port`, printed by the Overseer as it exits | The old Overseer keeps driving. | Nobody drives. Run `oversee --detach`. A successor's own `bind-port` failure, without these words, is taken back. | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `baton-pass-failed` with `no outcome within`, at step `serve` of code `unknown` | The Baton pass failed. | No outcome was read in time. The pass may still end either way, or [the Overseer may have exited](known-gaps.md#gap-baton-failure-record-throws). | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `incident-move-not-allowed`, `worker-filing-flag` from a terminal or the Bridge | A relay through the Overseer. | The same rule ran directly in this command, and no Overseer was involved. | [Stale prose](known-gaps.md#gap-stale-prose-in-code) |
| `hatch-identity-mismatch` on an Assistant's `job message` or `job fresh` | The session forged an identity. | The Assistant used a move its incident allows; the format check refuses any `jobId`. | [Assistant job moves](known-gaps.md#gap-assistant-job-moves-refused-at-hatch) |

## Coverage

At commit 70ce56de a one-off script, not kept in the repository, matched every `case` in
`src/adapters/utils/OperationRefusalWordingUtil.ts`, every `reason` in `src/lib/tracker-model/BoardRefusal.ts` and every
key of `RoleCommandRefusalReason` to a `Code` cell here, and every code here to the source. No spec keeps this page in
step; rerun the comparison after changing a wording.

| Measure | Count |
| --- | --- |
| `reason` values in `BoardRefusalDetail` | 93 |
| `case` labels in the wording util: Board reasons, detail kinds, install mismatches | 130 (93, 32, 5) |
| `RoleCommandRefusalReason` values | 7 |
| Sentences with a code, in the families above | 136 |
| Of those, marked "Never printed" | 20 |
| Sentences with no code, under [Refusals with no code](#refusals-with-no-code) | 10 |

`board-refusal` is the wrapper around every Board reason, so it has no row of its own. `role-command-refused` has one
row per reason.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| The refusal and its status | `src/shared/OperationRefusal.ts` | `OperationRefusal`, `OperationRefusalDetail` | `src/shared/OperationRefusal.spec.ts` |
| A Board rule's refusal | `src/lib/tracker-model/BoardRefusal.ts` | `BoardRefusalDetail` | `src/lib/tracker-model/BoardRefusal.spec.ts` |
| All wording | `src/adapters/utils/OperationRefusalWordingUtil.ts` | `messageOf`, `boardRefusalMessageOf` | `src/adapters/utils/OperationRefusalWordingUtil.spec.ts` |
| Exit codes | `cli/Main.ts` | `runCommandLine` | `cli/Main.spec.ts` |
| The Bridge's answer | `cli/overseer/routes/CommandRoute.ts` | `answerControlCommand` | `cli/overseer/routes/CommandRoute.spec.ts` |
| A relayed refusal | `src/services/overseer/HatchInbox.ts`, `cli/HatchUnderJob.ts` | `replyOf`, `hatchWhenUnderJob` | `cli/HatchUnderJob.spec.ts` |
| Role reasons | `src/shared/@types/RoleCommandRefusalReason.ts`, `src/services/control/Bouncer.ts` | `verdictOf` | `src/services/control/Bouncer.spec.ts` |
| Older files | `src/adapters/constants/OlderFormatAdvice.ts` | `OLDER_FORMAT_ADVICE` | `cli/OlderTrackerRefusal.spec.ts` |
