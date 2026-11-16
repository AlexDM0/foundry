# Refusals

> **Question:** This was refused: what does it mean, was anything written, and what do I do?
> **Time:** 2 minutes for the rules, then a search for the sentence.
> **Read first:** nothing; come here with the line that was printed.
> **Next:** [exit codes](../cli.md#exit-codes), [runbook](../operations/runbook.md).

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
3. **`--json` does not change a refusal, with seven exceptions.** A refused command prints its sentence on standard
   error and nothing on standard output, with or without `--json`. Under `--json`, `start`, `stop`, `init`, `update`,
   `version`, `machine` and `login-item` also print `{answerVersion, refusal, text}` on standard output: the code and
   the API sentence (rule 4), since a monitor shows it. A refusal worded from the arguments has the code
   `arguments-refused`.
4. **The [Bridge](../glossary.md#bridge) and a monitor show the API sentence,** beside the Bridge control that was used.
   It holds the same facts as the terminal's sentence, so the words in the first column match both. Where the terminal
   names a command or a flag, the API sentence names the Bridge control or a neutral action instead, or ends at the
   facts: User runs no command. "Run `ticket hold <ticket>` to keep it" reads "Hold it to keep it", and "Run `update`"
   reads "Update the board".
5. **A [session](../glossary.md#session) under a [job](../glossary.md#job) sees the same sentence too,** worded by its
   own command from the [Hatch](../glossary.md#hatch) reply.

![Three doors, a terminal command, a Bridge control and a session under a job, reach the same rules. A rule refuses with a code and facts and one wording util turns that into one sentence, which lands on standard error at exit 1 or 2, in a 409 answer shown beside the Bridge control, or, through a Hatch reply carrying the code, on the standard error of the session's own command.](../figures/refusals/one-refusal-three-doors.png)

*Words live in one place, so a sentence here is the sentence at every door; through the API it names no command.*

## The rules in full

**Few sentences show a code.** Only an incomplete-ticket reason such as `brief-missing` and a role refusal print a
code, both in parentheses. A Hatch reply file carries the code as data, in `detail`.

**Exit codes follow the status,** so check the exit code in a script, never the wording. A relayed refusal keeps its
status through the reply, so a session exits as a direct run would.

**The Bridge has three answers of its own.** All three come from the same route, and the Bridge prints them as sent.

| Answer | Shown as | Cause | What to do |
| --- | --- | --- | --- |
| 409 | The sentence, beside the Bridge control | Any refusal in this page, `refused` or `unrepaired`. | As the row says. |
| 423 | `The install version changed, so launches are held until the board is updated.` in the shell banner | Launches are held for an install change. | Update the board: run `update`. |
| 400 | `The command body is not a control command this Overseer knows` | The body is not a known control command, or a field of a [control contract](overseer-api.md#control-contract-1) kind, `chart-range-set`, `tracker-clear` or `ticket-deliver-by-hand` has the wrong type. Its code is `malformed-body`. | A client defect. Other route tokens are in [the Overseer API](overseer-api.md). |

## When something was written

"Nothing was written" means no stored tracker file changed: a refused command leaves `progress.json`, `log.jsonl` and
the tickets as they were. Taking the lock still writes its own files under
`.lock`; these carry no board data. These cases go further.

| Case | What stands | Why |
| --- | --- | --- |
| A relayed command is refused | One `hatch-applied` log record, always. Anything the command changed before it refused stays too. | The [Overseer](../glossary.md#overseer) commits the whole [lock hold](../glossary.md#lock-hold), even when one request in it was refused. |
| `baton-pass-failed` from `update` or `oversee restart` | The Overseer's `baton-pass-failed` log record, a second one if it loses its port, plus everything `update` installed. | The install finished, and the Overseer records the failed [Baton pass](../glossary.md#baton-pass) before anything reads it. |
| `lock-taken-over` | Whatever the [hold journal](../glossary.md#hold-journal) had committed. | The next command finishes it. |
| `worktree-repair-failed`, `worktree-has-uncommitted-work` | The tracker is unchanged, though the sentence reads "Nothing was written". A `recreate` may have saved its patch, and git may have done part of the step. | The git step runs inside the [lock hold](../glossary.md#lock-hold), before the board is written. |
| `malformed-hatch-reply` | Unknown. | The reply that would say is unreadable. |

## Lines that are not refusals

These lines come from a session's relayed command or from a hook, and each exits 0.

| Printed line | Exit | Meaning |
| --- | --- | --- |
| `queued <request>` | 0 | The Overseer did not answer in time, and the request still waits in the Hatch. |
| `nothing-to-do <request>` | 0 | The Overseer read the request, and the change was already made. |
| `done <request>` | 0 | The Overseer applied the request. |
| A deny in the JSON of `hook bash-domains` | 0 | The guard on a ticket's `network` line denied a tool call. A hook that errored would let the call through, so every failure answers deny. |

## Every printed refusal

- [Tickets and rows](#tickets-and-rows) (53)
- [Jobs and worktrees](#jobs-and-worktrees) (22)
- [Epics](#epics) (4)
- [Filing drafts](#filing-drafts) (10)
- [Decisions and incidents](#decisions-and-incidents) (13)
- [Gates and pipeline](#gates-and-pipeline) (7)
- [Pipeline setup](#pipeline-setup) (40)
- [Airlocks and landing](#airlocks-and-landing) (12)
- [Overseer and Baton](#overseer-and-baton) (17)
- [Hatch and roles](#hatch-and-roles) (11)
- [Install and version](#install-and-version) (6)
- [Tracker, lock and journal](#tracker-lock-and-journal) (6)
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
<summary>54 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no task #<task>` | `unknown-task` | The row id names no row. | Read the ids with `status`. | |
| `Task #<task> belongs to ticket #<ticket>, so moving it here` | `ticket-owned-row` | A `task` verb tried to move a row a ticket owns. | Run the `ticket` verb the sentence names, or `--force` to move the row alone. | |
| `Ticket #<ticket> already has task #<task>` | `ticket-already-has-row` | `task add --ticket` named a ticket that has a row. | Add `--force` to move the ticket to the added row, or drop `--ticket`. | |
| `is already on the board, so a second ticket cannot take its id` | `ticket-id-already-filed` | Two filings in one hold were given one id. | File the ticket again. | |
| `Task #<task> already belongs to ticket #<ticket>` | `task-belongs-to-another-ticket` | `ticket link` named a row another ticket owns. | Add `--force` to move it. | |
| `Ticket #<ticket> is already <status>, so nothing was changed` | `ticket-already-in-status` | The move targets the status the ticket holds. | Nothing. Exit 1 still, so a script sees the move did not happen. | |
| `and a move to <status> takes a ticket that is` | `illegal-ticket-move` | The legality table has no such move. | Use the sources the sentence lists, or `ticket status` to set it directly. | |
| `and no move returns a ticket to draft` | `move-to-draft` | A move targeted `draft`. Filing is the only way in. | Run `ticket hold` to keep it from being built. | |
| `is a draft ticket, so it was not moved` | `move-of-a-draft` | A move other than abandon named a draft ticket. | Run `ticket ready` first. | |
| `not a draft ticket, so nothing was readied` | `ready-of-a-ticket-not-in-draft` | `ticket ready` named a ticket past `draft`. | Nothing. A ticket past `draft` needs no readying; an abandoned one is settled. | |
| `Nothing was readied: ticket #<ticket> is incomplete` | `incomplete-tickets` | The body lacks a numbered Acceptance or a `## Brief`. The sentence names `acceptance-unnumbered` or `brief-missing`. | Number items `A1.`, write the Brief, ready again. | [cli.md](../cli.md) |
| `was not moved: abandon needs --reason` | `abandon-without-reason` | `ticket abandon` had no reason, or a blank one. | Pass `--reason`. | |
| `has no row, so --tokens has nowhere to be recorded` | `tokens-without-a-row` | `--tokens` on a move of a ticket with no row, as a draft ticket being abandoned. | Drop `--tokens`. | |
| `and another review pass needs a ticket that is in-review` | `rereview-outside-review` | `ticket rereview` outside `in-review`. | Follow the sentence when it offers `ticket status`, otherwise leave it. | |
| `has no in-progress review bar, so there is no review pass` | `review-record-without-a-review-bar` | Never printed: only the Overseer records a review, after opening the bar itself. | Nothing to do. | |
| `stores no round, so the pass cannot be recorded` | `review-bar-without-a-round` | Never printed: only the Overseer records a review, after opening the bar itself. | Nothing to do. | |
| `is not an in-progress review bar, so the review of ticket` | `review-record-on-a-row-that-is-not-a-review-bar` | Never printed: no caller names a bundle bar. | Nothing to do. | |
| `which was not claimed with ticket #<ticket>` | `review-record-on-a-bar-outside-the-bundle` | Never printed: no caller names a bundle bar. | Nothing to do. | |
| `and a claim takes a ticket that is` | `unclaimable-status` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `which must be reviewed or delivered before it is claimed` | `claim-waits-on-dependencies` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `is held, so it is not claimed` | `claim-of-a-held-ticket` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `is under review: its review row #<task> is in progress` | `claim-under-review` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `and --after names a predecessor that is in-review` | `claim-after-a-ticket-not-in-review` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `the two are not in one release bundle of the same group` | `claim-after-a-ticket-outside-the-bundle` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `it does not wait on #<ticket>` | `claim-after-a-ticket-it-does-not-wait-on` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `and the concurrency limit is <n>` | `concurrency-limit-reached` | Never printed: `Board.claimTickets` has no caller. | Nothing to do. | |
| `There is no ticket #<ticket>. Run` | `unknown-dependency` | A dependency names no ticket. | Read the ids with `ticket list`. | |
| `There is no ticket #<ticket>. Nothing was written.` | `unknown-linked-ticket` | `--introduced-by` or `--found-in-review` names no ticket. | Read the ids with `ticket list`. | |
| `That would make tickets wait on each other in a circle` | `dependency-loop` | The dependency closes a loop, printed as a path. | Remove one link of the path. | |
| `and only a bug names the ticket that introduced it` | `introduced-by-on-a-non-bug` | `introduced-by` on a `ticket` or `research`. | Set it on the bug. | |
| `cannot be introduced by itself` | `introduced-by-itself` | A bug named itself as the cause. | Name the cause. | |
| `and only a delivered ticket's change lets a bug escape` | `introduced-by-an-undelivered-ticket` | The named cause is not delivered. | Name a delivered ticket. | |
| `and its priority was not changed: it is already` | `priority-unchanged` | The ticket has that priority. | Nothing. | |
| `and its size was not changed: it is already` | `size-unchanged` | The ticket has that size. | Nothing. | |
| `only a draft or pending ticket can be lowered to low` | `lowering-a-ticket-that-is-not-pending` | `priority low` past `pending`. | Leave the priority. | |
| `and it was not edited: an agent may already be working from it` | `edit-of-a-ticket-past-pending` | `ticket edit` past `pending`. | Add `--force` only when no job is running on it: a body changed after launch makes Customs refuse the job's report (`ticket-body-changed`). | |
| `and its network line was not changed: it is set only while` | `network-of-a-ticket-past-pending` | `ticket network` past `pending`. | Abandon and refile, or leave it. | |
| `is not a public domain` | `network-domain-not-public` | A loopback name, a `.local` name or a private address. The plural reads `are not public domains`. | Name a public domain. | |
| `network line was not changed: it already reads` | `network-unchanged` | The line holds those domains. | Nothing. | |
| `and its agents were not changed: no agent will work it again` | `agents-of-a-settled-ticket` | `ticket agent` on a `delivered` or `abandoned` ticket. | Nothing. | |
| `and its agents were not changed: they already run on` | `agents-unchanged` | The ticket has that model and effort. | Nothing. | |
| `so there is nothing to <hold or unhold>` | `hold-of-a-settled-ticket` | `ticket hold` or `unhold` on a `delivered` or `abandoned` ticket. | Nothing. | |
| `Ticket #<ticket> is already held.` | `ticket-already-held` | The ticket has a hold. | Run `ticket show` for its reason. | |
| `Ticket #<ticket> is not held.` | `ticket-not-held` | `ticket unhold` on a ticket with no hold. | Nothing. | |
| `and its release mark was not <set or cleared>` | `release-mark-of-a-settled-ticket` | `ticket release-of` on a `delivered` or `abandoned` ticket. | Nothing. | |
| `belongs to no group, so it cannot be a group's release ticket` | `release-mark-of-an-ungrouped-ticket` | The ticket has no group. | File it in the group. | |
| `already has its release ticket` | `group-already-has-a-release-ticket` | A group has one open release ticket. The other form reads `is already the release ticket of group`. | Clear the mark the sentence names first, or nothing. | |
| `is not its group's release ticket` | `ticket-is-not-a-release-ticket` | `release-of --clear` on an unmarked ticket. | Nothing. | |
| `is not a usable group name` | `malformed-group-name` | `ticket add --group` named a group that is not lower-case letters and digits in words joined by single hyphens. | Name the group as `checkout-redesign` is named. | |
| `only in case, and a case-insensitive file system gives both one branch and one worktree` | `group-name-case-twin` | `ticket add --group` named a group that differs from an existing one only in case. | Use the existing group's name. | |
| `and no move takes a ticket to ready for review` | `move-to-ready-for-review` | `ticket status <ticket> ready-for-review`, or another move to that status. | Close the draft with `ticket submit` or `intake close`. | |
| `is ready for review, so it was not moved` | `move-of-a-ticket-ready-for-review` | A move of a `ready-for-review` ticket other than `ticket abandon`. | User reviews it and runs `ticket ready <ticket>`. | |
| `and carries the release mark of group <group>` | `reopen-beside-an-open-release-ticket` | Reopening would leave two open release tickets. | Clear the other mark first. | |
| `There is no readable ticket <reference>` | `no-readable-ticket` | No ticket has that id. A file that does not parse shows in `ticket list`. | Read the ids with `ticket list`. | [cli.md](../cli.md) |

</details>

### Jobs and worktrees

Words here: [job](../glossary.md#job), [worktree](../glossary.md#worktree),
[product owner](../glossary.md#product-owner), [decision](../glossary.md#decision), [incident](../glossary.md#incident).

<details open>
<summary>22 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no job <job>. Nothing was written.` | `unknown-job` | The id names no live job, and no ended job the move can reach. | Run `jobs` to list them. | |
| `is finished, and a finished job is never continued` | `job-finished` | A move named an ended job. `intake close` and `job message` also print this for a job still `stopping`. | Start a fresh ticket or intake. A closed product owner reopens through `job message`. | |
| `works no ticket, so no fresh agent can take its work over` | `job-has-no-ticket` | `job fresh` on a job with no ticket. | Use `job stop`. | |
| `so it has no intake to close or title` | `job-not-intake` | `intake close` or `intake title` named a job of another kind. | Name the product-owner job. | |
| `is blank: write a short title after --` | `intake-title-empty` | `intake title` with a title of only spaces, sent through the API or a Hatch. The terminal refuses earlier with a usage line. | Send a title. | [cli.md](../cli.md#intake-title) |
| `The option notes for job … are malformed` | `question-options-malformed` | `question options` notes that are not well formed: an unknown key, a blank text, an empty list or a label that repeats. The message names the field, such as `options[1].touches`. The terminal reads the notes as the Board does, so it refuses before it relays. | Fix the named field. | [cli.md](../cli.md#question-options) |
| `so it cannot move to <state>` | `job-move-illegal` | A job move outside the table, raised inside the Overseer or by a control command. | A defect in forge: file a bug with the printed line. `job stop` is the way out. | |
| `waits on a question for the user; a chat turn would answer it` | `job-awaits-user-answer` | `job message --incident` while the job or its ticket waits on an `agent-question`. | Answer the decision. | |
| `is the user's product-owner session; only the user chats with it` | `job-is-product-owner` | `job message --incident` at a product-owner job. | Send it without `--incident`, as User. | |
| `Name the product-owner job whose intake to close` | `intake-close-without-job` | A control command with no `jobId`. The terminal refuses earlier with a usage line, so an API caller sees this. | Send `jobId`. | |
| `Name the product-owner job whose intake to title` | `intake-title-without-job` | An `intake-title` control command with no `jobId`. The terminal refuses earlier with a usage line, so an API caller sees this. | Send `jobId`. | [cli.md](../cli.md#intake-title) |
| `Name the job whose question the option notes are for` | `question-options-without-job` | A `question-options` control command with no `jobId`. The terminal refuses earlier with a usage line, so an API caller sees this. | Send `jobId`. | [cli.md](../cli.md#question-options) |
| `The intake request is blank and carries no picture` | `intake-empty` | An `intake-start` control command whose text is only spaces and that names no picture, sent through the API. The terminal refuses earlier with a usage line. | Write the request, or attach a picture. | [overseer-api.md](overseer-api.md#commands) |
| `and only a product-owner intake takes pictures` | `pictures-not-taken` | A `job-message` naming pictures to a job that is not a product owner, the Assistant included. | Send the message as text. | [overseer-api.md](overseer-api.md#commands) |
| `is stored on this board: upload it again before you send it` | `picture-unknown` | A `job-message` or `intake-start` names a picture `<data>/pictures/` does not hold: never uploaded, or swept at an Overseer start before its command came. | Upload the picture again. | [overseer-api.md](overseer-api.md#commands) |
| `pictures, and one message carries at most` | `too-many-pictures` | A `job-message` or `intake-start` names more than `PICTURES_PER_MESSAGE_LIMIT` pictures. | Send them over more messages. | [overseer-api.md](overseer-api.md#commands) |
| `bytes, so it was not stored` | `picture-too-large` | `POST /api/pictures` with more than `PICTURE_SIZE_LIMIT_BYTES`, answered 413. | Send a smaller picture. | [overseer-api.md](overseer-api.md#routes) |
| `By its first bytes the picture is none of` | `picture-type-unsupported` | `POST /api/pictures` with bytes that are no PNG, JPEG, WebP or GIF, whatever its name or `Content-Type`, answered 415. | Send a picture of one of those types. | [overseer-api.md](overseer-api.md#routes) |
| `so it cannot be recorded delivered by hand` | `ticket-has-live-job` | `ticket deliver --by-hand` while a job works the ticket. | Run `job stop` first. | [cli.md](../cli.md) |
| `could not be read as a time, so it is not a range bound` | `chart-range-bound-unreadable` | `range`, or the Bridge's Save as the board's range, with a bound that is no time. | Write an ISO 8601 timestamp, `start`, `now` or a signed offset. | [cli.md](../cli.md#the-boards-lifetime) |
| `is not before --to` | `chart-range-backwards` | Two timestamps, or two bounds relative to now, out of order. | Swap them, or widen the window. | [cli.md](../cli.md#the-boards-lifetime) |
| `is not a whole number of minutes above zero` | `chart-range-tick-unreadable` | A `chart-range-set` whose `tickMinutes` is not a whole number above zero. | Send a whole number of minutes, or `null`. | [overseer-api.md](overseer-api.md#commands) |
| `so the board cannot be cleared under them` | `tracker-has-live-jobs` | `clear`, or the Bridge's Clear…, while a job other than the Assistant is live. | Stop the jobs, or wait until they end. | [cli.md](../cli.md#clear) |
| `still runs on the worktree of #<ticket>; stop it first` | `worktree-in-use` | `worktree repair` `recreate` or `unlock` with a job on the ticket. | Run `job stop`, then repair. | |
| `holds uncommitted work that could not be saved to a patch` | `worktree-has-uncommitted-work` | `recreate` found changes it could not read or save, or no job ever ran on the ticket, so there is no job folder to name for the patch. | Save the work by hand, then repair. | [runbook](../operations/runbook.md) |
| `Git refused the <step> repair of the worktree` | `worktree-repair-failed` | Git failed the repair step. The sentence ends with git's reason. | Fix what git names. A `recreate` patch may already be saved in the job folder. | [runbook](../operations/runbook.md) |

</details>

### Epics

Words here: [epic](../glossary.md#epic).

<details open>
<summary>4 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `is not a usable epic key` | `malformed-epic-key` | The key is not lower-case words joined by hyphens. | Use a key as the sentence shows. | |
| `There is already an epic <epic>` | `epic-already-exists` | The key is taken. | Run `epic edit`. | |
| `There is no epic <epic>` | `unknown-epic` | A key names no epic. | Run `epic list`. | |
| `was not removed: #<ticket> still names it` | `epic-still-named` | Tickets name the epic. Plural `still name it`. | Run `ticket epic <id> --remove <epic>` on each. | |

</details>

### Filing drafts

Words here: [filing draft](../glossary.md#filing-draft).

<details open>
<summary>10 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no open draft <draft>` | `unknown-draft` | The id names no open filing draft. | Run `draft list`. | |
| `was not claimed: <owner> holds it` | `draft-claimed-by-another-owner` | Another owner claimed the filing draft. | Add `--force`, or wait for `draft release`. | |
| `was not closed: there is no ticket` | `draft-closed-into-unknown-tickets` | `--tickets` names no ticket. | File the tickets first. | |
| `was not closed: <question> is still open` | `draft-has-open-questions` | Questions are unanswered. Plural `are still open`. | Run `draft answer` or `draft drop` on them. | |
| `has no question <question>` | `unknown-draft-question` | The question id is not in the filing draft. | Run `draft show`. | |
| `has no note or question <item>` | `unknown-draft-item` | `draft drop` named an item it does not hold. | Run `draft show`. | |
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
| `There is no decision <decision>` | `unknown-decision` | The id names no decision. | Run `decisions`. | |
| `is already settled, and the first answer wins` | `decision-already-answered` | Another answer came first. | Nothing. | |
| `so it takes one answer for each, not <n>` | `decision-answer-count` | Answer count differs from the question count. | Give one choice per question. | |
| `A decision asks at least one question` | `decision-without-questions` | A decision would open with none, as an escalated incident that carries no question. | Answer the incident instead. | |
| `so no two of its questions may read` | `decision-questions-repeat` | Two questions share their text, and answers key on it. | Reword one. | |
| `so it takes one choice of letters for each` | `decision-has-several-questions` | Free text on a decision of several questions. | Use letters, or answer in the Bridge. | |
| `does not name them by letter` | `decision-option-unknown` | A letter outside the options, or a repeated one. Most Overseer decisions have no options, so any letter prints this. | Use the option letters, or answer with `decide <E> -- <text>`. | |
| `takes one option, not` | `decision-single-choice` | Several letters on a single-select question. | Give one letter. | |
| `There is no incident <incident>` | `unknown-incident` | The id names no incident. | Run `incidents`. | |
| `is already closed` | `incident-closed` | Someone settled it. | Nothing. | |
| `which carries no agent's question to answer or escalate` | `incident-not-a-question` | Never printed: `requireIncidentAllows` refuses first, on the same two kinds. See `incident-move-not-allowed`. | Nothing to do. | |
| `has no open incident that allows <move>` | `no-open-incident` | An Airlock move needs an incident, and none allows this one. | Run `incidents`, then the move it allows. | |
| `name one with --incident` | `several-open-incidents` | Several open incidents allow the move. | Pass `--incident`. | |

</details>

### Gates and pipeline

Words here: [gate](../glossary.md#gate), [pipeline](../glossary.md#pipeline).

<details open>
<summary>7 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `There is no gate <gate>` | `unknown-gate` | `gate remove` or `gate order` named no gate. The tail reads `none is stored` or lists the gates. | Run `gate list`. | |
| `phase was not reordered` | `phase-order-not-a-reorder` | `gate order` did not name each gate the phase runs once, or named another gate. | Name each gate of the phase once; use `gate add <name> --phases` to change the phases a gate runs in. | |
| `must run in at least one phase` | `gate-without-phase` | A `pipeline-gate-add` command sent an empty `phases` list. `gate add --phases` refuses that as usage first. | Name at least one phase. | |
| `There is no phase <phase>` | `unknown-gate-phase` | A gate command named a phase other than `build`, `review` or `merge`. | Name one of the three phases. | |
| `cannot be read as a pipeline` | `malformed-pipeline` | `pipeline.json` is malformed. Every `gate` verb but `gate retry` refuses, so no `gate` verb overwrites a hand edit. | Repair or delete the file. | |
| `written by an earlier forge, in a pipeline format this one does not read` | `older-pipeline` | `pipeline.json` has no `version`, or one below 2: an earlier release wrote it, and no release converts it. `gate list` and every `gate` write refuse it, so none overwrites it. | Set the pipeline up again with `pipeline setup --replace-unreadable`, and Apply over the older file. | |
| `No gate pipeline is stored, so approval <approval> was not set` | `approval-without-pipeline` | `gate approval` on a board with no `pipeline.json`: a file holding only the switch would read as no gates on purpose. | Set the gates first with `gate add` or `gate none`. | [Concurrency and gates](../cli.md#concurrency-and-gates) |
| `No gate pipeline is stored, so the reach was not set` | `reach-without-pipeline` | `gate reach` on a board with no `pipeline.json`: a file holding only the reach would read as no gates on purpose. | Set the gates first with `gate add` or `gate none`. | [Concurrency and gates](../cli.md#concurrency-and-gates) |

</details>

### Pipeline setup

<details open>
<summary>40 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `Pipeline setup <id> is open, and only one setup is open at a time` | `setup-in-progress` | A second setup opened beside the open record. | Resume the open setup, or start it over. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `Pipeline setup <id> is not open` | `no-setup-open` | A setup move named a record that is not the open one, or none is open. | Read the open record's id again. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `The pipeline setup record cannot be read` | `pipeline-setup-unreadable` | `pipeline-setup.json` is malformed; nothing writes over it. | Repair or remove the file. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `No pipeline is stored, so there is nothing to update` | `no-pipeline-to-update` | An update or advise opened with no readable `pipeline.json`. | Set the pipeline up first. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `waits for its Apply to land` | `pipeline-apply-pending` | A setup move, a `gate` write, or an Apply of another revision while the record's Apply request is `committing` or `held`. | Cancel the Apply first. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `has no Apply to cancel or settle` | `no-apply-pending` | `pipeline apply-cancel` with no Apply request. | Nothing to do. | [Apply](../cli.md#apply) |
| `has a check not ended yet` | `pipeline-check-running` | `pipeline check` while the record's check is `queued` or `running`. | Wait for its result. | [Pipeline checks](../cli.md#pipeline-checks) |
| `changes or adds no gate, so there is nothing to check` | `no-gate-to-check` | `pipeline check` on a draft that changes or adds no gate against the base pipeline. | Change or add a gate first. | [Pipeline checks](../cli.md#pipeline-checks) |
| `still asks <ids>: answer every question before the Apply` | `setup-question-open` | An Apply while a setup question has no answer. | Answer each question named. | [Apply](../cli.md#apply) |
| `needs a recheck of <steps>` | `setup-step-needs-recheck` | An Apply while a step before Apply needs a recheck. | Continue each step named. | [Apply](../cli.md#apply) |
| `changed its snapshot, so its findings cannot be trusted` | `setup-snapshot-touched` | An Apply after a turn end of the pipeline agent found its snapshot changed. | Resume the setup, then apply. | [Apply](../cli.md#apply) |
| `The stored pipeline changed since pipeline setup <id> opened` | `pipeline-moved` | An Apply after a `gate` write changed the stored pipeline since the record opened. | Start the update again. | [Apply](../cli.md#apply) |
| `CONSTITUTION.md on the main line changed since pipeline setup <id> opened` | `constitution-moved` | An Apply after main's `CONSTITUTION.md` changed since the record opened, to a text other than the draft's. | Start the update again. | [Apply](../cli.md#apply) |
| `CONSTITUTION.md on the main line could not be read` | `main-constitution-unreadable` | An Apply, `pipeline update` or `advise` whose read of main's `CONSTITUTION.md` git could not answer; exit 2. | Check the repository with git, then run it again. | [Apply](../cli.md#apply) |
| `A budget cap of <n> USD is not above 0` | `billing-cap-not-positive` | A setup's API billing cap is 0 or below. | Give a positive cap, or none. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `so <step> was not continued` | `setup-step-not-current` | Continue, or the pipeline agent's `pipeline ready`, named a step other than the current one. | Name the current step. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `has not reached the <step> step` | `setup-step-not-reached` | A reopening named a step that never started, or one after the current step. Never printed: no verb reopens a step yet, and an edit reopens only an earlier step. | Go back only to a step at or before the current one. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `ends with an Apply, not a Continue` | `setup-step-not-continued` | Continue named the `apply` step. | Apply instead. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `has no question <id>` | `unknown-setup-question` | An answer named a question the record does not hold. | Read the record's questions again. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `names no option and holds no text` | `empty-setup-answer` | An answer with no letter, or with blank text. | Name a letter, or write the answer. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `A setup question takes 2 to 4 options` | `setup-question-option-count` | A setup question with too few or too many options. | Give two to four options. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `needs the option Claude recommends` | `setup-question-without-recommendation` | A setup question with no recommended option. | Name the recommended option. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `There is no option <letter>` | `unknown-setup-option-letters` | A recommendation or answer named a letter the question does not have. | Name one of its letters. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `the setup question takes one` | `several-letters-on-single-select-setup-question` | Several letters on a question that takes one. | Name one letter. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `The constitution has no text` | `constitution-empty` | The agent sent an empty constitution, or an Apply of a draft with no constitution text while main holds a `CONSTITUTION.md`. | Send the whole document. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `may hold at most <n>` | `constitution-too-long` | The constitution is longer than the limit. | Shorten it. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `the constitution does not hold that line that many times` | `constitution-source-unanchored` | A source names a line the text does not hold, or not that often. | Name a whole line of the text, without its line ending. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `a line takes one source` | `constitution-source-repeated` | Two sources name the same line. | Name one source per line. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `the SOURCES ticks of the setup do not select` | `constitution-source-not-ticked` | The agent named a source of a kind the record's SOURCES ticks leave off; with no constitution yet the ticks are `contributing` and `research`. | Name only the sources the ticks select, or tick that source first. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `The constitution of pipeline setup <id> is at revision` | `constitution-draft-stale` | User's edit carried an older revision. | Read it again, then edit. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `The draft pipeline of pipeline setup <id> is at revision` | `pipeline-draft-stale` | A draft edit carried an older revision. | Read it again, then edit. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `names no change` | `no-draft-edits` | A draft edit with no change in it. Never printed: an empty edit list is refused first, as `malformed-setup-command`. | Name at least one change. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `keeps the name its field gives it` | `draft-edit-name-mismatch` | A gate or prepare step edit whose value names another name than its field. | Use the field's name. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `The prepare steps were not reordered` | `prepare-order-not-a-reorder` | A prepare order that does not name each prepare step once. | Name each prepare step once. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `has no edit <id>` | `unknown-setup-edit` | Undo named an edit the record does not hold. | Read the record's edits again. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `is already undone` | `setup-edit-already-undone` | Undo named an edit that is already undone. | Nothing to do. | [pipeline-setup.json](../cli.md#datapipeline-setupjson) |
| `command's <field> is missing or is not of its shape` | `malformed-setup-command` | A setup command sent to the API, or relayed, lacks a field or holds one of the wrong shape, such as `edits[0].value`. The `pipeline` verbs refuse most of these as usage first; the pipeline agent's verbs read their payload through the same closed schema before they relay, so a field outside it, or an option offering "Other", is refused here. | Send the field as `docs/cli.md` gives it. | [Pipeline setup](../cli.md#pipeline-setup) |
| `The gate profile runs cannot be read` | `gate-profiles-unreadable` | `gate-profiles.json` is malformed; nothing writes over it. | Repair or remove the file. | [gate-profiles.json](../cli.md#datagate-profilesjson) |
| `has profile <id> in the <phase> phase not ended yet` | `gate-profile-running` | A second profile press on a gate and phase whose run is `queued` or `running`. | Wait for the run, or stop it. | [Gate profiles](../cli.md#gate-profiles) |
| `There is no gate profile <id>` | `unknown-profile-run` | A Stop named a run `gate-profiles.json` does not hold. | Read the runs again. | [gate-profiles.json](../cli.md#datagate-profilesjson) |
| `draft a pipeline that cannot be stored` | `pipeline-draft-invalid` | A draft edit, the pipeline agent's proposal or an Undo would leave a draft that `pipeline.json`'s validator refuses, such as a gate that runs in no phase. The tail is the validator's reason. | Send the edits that belong together in one move, as a gate with its phase order. | [Pipeline setup](../cli.md#pipeline-setup) |

</details>

### Airlocks and landing

Words here: [Airlock](../glossary.md#airlock), [Pass](../glossary.md#pass), [sweep](../glossary.md#sweep),
[target](../glossary.md#target), [group](../glossary.md#group), [release ticket](../glossary.md#release-ticket),
[incident](../glossary.md#incident).

<details open>
<summary>12 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `so it was not queued to merge` | `merge-queue-of-a-ticket-not-in-review` | Never printed: only an Overseer step queues a ticket, right after a passing review. | Nothing to do. | |
| `was not queued to merge: the Overseer's last green gate run was not on its HEAD tree` | `merge-queue-without-a-current-green` | Never printed: only an Overseer step queues a ticket, and each one checks first that the ticket's green is current on its tree and phase. | Nothing to do. | [Concurrency and gates](../cli.md#concurrency-and-gates) |
| `Merge approval is off, so ticket #<ticket> needs no accept` | `merge-approval-off` | `merge accept` or `merge update` with merge approval off. | Switch it on with `gate approval merge on`, or let the ticket land. | [Merge approval](../cli.md#merge-approval) |
| `and does not wait for merge: only a ticket in review whose review passed on a green tree, with no job on it, does` | `merge-accept-of-a-ticket-not-waiting` | `merge accept` named a ticket that does not wait for merge. | Run `merges` and accept a waiting ticket. | [Merge approval](../cli.md#merge-approval) |
| `was not accepted: its branch conflicts with <target> in <files>` | `merge-accept-would-conflict` | `merge accept` on a ticket whose branch git predicts to conflict with its target. | Run `merge update <ticket>` first. | [Merge approval](../cli.md#merge-approval) |
| `was not accepted: git could not predict its merge into <target>` | `merge-accept-prediction-failed` | `merge accept` when git could not predict the merge. | Check the repository with git, then accept again. | [Merge approval](../cli.md#merge-approval) |
| `and does not wait for merge, so its branch was not updated` | `merge-update-of-a-ticket-not-waiting` | `merge update` named a ticket that does not wait for merge. | Run `merges` and name a waiting ticket. | [Merge approval](../cli.md#merge-approval) |
| `The merge of <target> into ticket #<ticket>'s worktree failed` | `merge-update-failed` | `merge update`'s merge of the target into the ticket's worktree failed; the tail is git's reason. | Check the worktree with git, then run it again. | [Merge approval](../cli.md#merge-approval) |
| `holds the <target> Airlock, and a target merges one ticket at a time` | `airlock-held` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | |
| `is not queued to merge into <target>` | `merge-candidate-not-queued` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | |
| `queued to merge first` | `higher-priority-queued` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | |
| `is not refreshed: its release ticket` | `refresh-beside-a-queued-release` | Never printed: the Airlock sweep in a Pass tries this claim, drops a refusal, and derives the claim again later in the sweep or in the next Pass. | Nothing to do. | |

</details>

### Overseer and Baton

Words here: [Overseer](../glossary.md#overseer), [Baton](../glossary.md#baton), [Baton pass](../glossary.md#baton-pass),
[Watcher](../glossary.md#watcher). Recipe:
[Starting the Overseer is refused](../operations/runbook.md#starting-the-overseer-is-refused).

<details open>
<summary>19 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `is live, but its API did not answer, so nothing was started beside it` | `overseer-not-answering` | `start` found a live Overseer, or started one, whose API did not answer within the start's tries. | Run `stop`, then `start` again. | [cli.md](../cli.md#the-overseer) |
| `must be a positive whole number of milliseconds` | `malformed-overseer-poll-interval` | The test setting `FORGE_OVERSEER_POLL_INTERVAL_MILLISECONDS` holds another value. | Unset it or correct it. | |
| `must be two versions, the current and the minimum supported` | `malformed-versions-answer` | The test setting `FORGE_VERSIONS_ANSWER` holds another value. | Unset it or correct it. | [cli.md](../cli.md) |
| `Gates and install lines cannot run confined here, so the Overseer did not start` | `gate-confinement-unavailable` | `oversee` or `open` where the gate sandbox cannot start; the tail is the reason. | Install or enable the sandbox the reason names, then run it again. | |
| `needs git <version> or newer` | `git-below-floor` | `init`, `oversee` or `open` found a git below 2.38, or none on the `PATH`, before writing anything. | Install git 2.38 or newer. | [Adopting a repository](../cli.md#adopting-a-repository) |
| `cannot be created whole` | `baton-not-created-whole` | The Baton claim needs a hard link, and the filesystem refused it. | Move the data folder to a filesystem that allows hard links. | |
| `An Overseer already serves this board` | `overseer-already-running` | A live Baton names another Overseer. | Use it, or run `oversee stop`. | |
| `No Overseer serves this board` | `overseer-down` | The Overseer that `open` started was gone again before `open` read its Baton. | Run `open` again, or read `overseer.log`. | |
| `at the same moment and holds the newer Baton` | `overseer-contended` | Two starts raced and this one lost. | Nothing. The other one serves. | |
| `took this board over from the Baton` | `baton-taken` | A newer generation took over. **Exit 2.** | Nothing. The newer Overseer drives. | |
| `is in use, so the Overseer did not start` | `overseer-port-in-use` | The candidate ports are taken. The range form reads `Every port from`. | Pass a free `--port`. | |
| `so it cannot hold an Overseer Baton` | `overseer-identity-unreadable` | The start and boot of the process cannot be read. **Exit 2.** | A defect in forge: file a bug with the printed line. | |
| `before it answered` | `overseer-did-not-start` | The `--detach` child exited or never answered. The log may not hold why. | Read the log it names, or run `oversee` in the foreground. | |
| `is still live after being asked to stop` | `overseer-still-live` | The Baton stayed live through `OVERSEER_STOP_TRIES` tries. | Run `oversee status`, then stop it again. | |
| `The Baton pass to code <code version> failed at <step>` | `baton-pass-failed` | `update` or `oversee restart` read a failed Baton pass, or read no outcome within `BATON_PASS_OUTCOME_TRIES` tries. The Overseer prints it too if it loses its port. The old Overseer keeps driving unless that happens. See [Sentences that mislead](#sentences-that-mislead). | Run `oversee status` and read the Overseer log. If nobody drives, run `oversee --detach`. What `update` installed stands. | |
| `is sent to the live Overseer, never applied to the board` | `overseer-control-is-runtime-only` | Never printed: the API route, `oversee stop` and the Bouncer each stop `overseer-stop` and `overseer-restart` earlier. | Nothing to do. | |
| `so only it delivers tickets` | `overseer-owns-the-lifecycle` | `ticket deliver --by-hand` with a live Overseer. | Use Delivered by hand… on the ticket's form in the Bridge, or run `oversee stop` first. | [cli.md](../cli.md) |
| `did not bundle, so the Overseer cannot spawn Watchers` | `watcher-bundle-failed` | The Watcher entry in the forge program checkout, not the tracked repository, did not bundle. **Exit 2.** | Read the reason at the end of the line, then repair the program checkout. | |
| `cannot bind the Watcher endpoint` | `watcher-endpoint-does-not-fit` | This platform's limit refuses the endpoint, so no launch file was written. A drive pass turns this into a notice of the same kind. | Move the home folder to a shorter path. | |

</details>

### Machine limit and login item

Words here: [Overseer](../glossary.md#overseer), [job](../glossary.md#job).

<details open>
<summary>6 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `CPUs this machine has, so nothing was written` | `machine-agent-limit-above-cpus` | `machine limit <n>` or `machine-agent-limit-set` with a limit above the CPU count the runtime reports. | Set a limit from 1 to the CPU count. | [cli.md](../cli.md#concurrency-and-gates) |
| `is not a whole number of at least 1, so nothing was written` | `machine-agent-limit-not-whole` | `machine-agent-limit-set` with a limit that is not a whole number of at least 1. | Send a whole number. | [overseer-api.md](overseer-api.md#commands) |
| `newer than this program knows, so it was not written over` | `machine-limits-newer-version` | `<monitor>/machine-limits.json` holds a newer version. | Update this program. | [cli.md](../cli.md#concurrency-and-gates) |
| `is not a whole number of agents from 1 to` | `concurrency-limit-out-of-range` | `concurrency-set` posted to the API, or relayed, with a limit outside 1 to 10. The `concurrency` verb refuses the same value with its own words. | Send a whole number from 1 to 10. | [overseer-api.md](overseer-api.md#control-contract-1) |
| `No login item can start the Overseer on this machine` | `login-item-unavailable` | `login-item` on a platform with no login item, or where the item would never run. | Start the Overseer another way, such as `start`. | [cli.md](../cli.md#the-overseer) |
| `was not changed:` | `login-item-not-changed` | The system refused to write or remove the login item; the reason ends the line. | Read the reason, repair it, and run `login-item` again. | [cli.md](../cli.md#the-overseer) |

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
| `this job's role may not run it` | `command-not-allowed-for-role` | The Bouncer has no row for this command and role. | An agent stops and reports it. User runs it from a terminal. | |
| `a worker files only a low finding` | `worker-filing-flag` | A worker's filing with flags a finding may not take. | A worker files with `--priority low` and the allowed flags; the Overseer adds the finder dependency and group. | |
| `this job has already filed as many findings as one job may` | `worker-filing-limit` | `WORKER_FILINGS_PER_JOB` (10) reached. | Put the rest in the Handoff. | |
| `it changes only a draft ticket this job filed` | `not-own-draft` | A product owner reached for a ticket it did not file, or one past `draft`. | Touch only its own draft tickets. | |
| `this job is the agent of no open pipeline setup record` | `job-serves-no-setup` | A pipeline agent relayed a setup move while no open record names its job as the agent. | Nothing to do from the job: the record was started over or applied. | |
| `it is legal only as a move the named delivered incident allows` | `incident-move-not-allowed` | The incident was not delivered to this Assistant, or does not allow the move. A terminal move under `--incident` prints it too, and so do `incident answer`, `incident note` and `incident escalate` on a kind that does not list them, with no `--incident` flag involved. Some listed moves cannot succeed. | Use a move the incident allows. | |
| `a request may not name a job, a role or an admission` | `hatch-identity-mismatch` | A pipeline agent's request names a `setupId`; the Overseer stamps the record the agent serves. A `jobId`, `role` or `admission` never gets here: the Hatch format check below catches these fields first. | Send the verb with no setup id under the job. | |
| `names a job or role of its own` | `hatch-identity-mismatch` | A request carries `jobId`, `role` or `admission`, or a body id unlike its file name. The Assistant's job-targeting moves fall here. | The verb cannot be sent from a session. An Assistant settles the incident by another allowed move such as `ticket park <id> --incident <I> -- <reason>`, or leaves it for its default move; User can run the job move at a terminal with `--incident <I>`. A builder or reviewer reports it in the Handoff. | |
| `cannot run under job <job>: it is neither read-only nor` | `verb-not-relayable` | The verb has no control command and is not read-only. | Do it outside the job, or leave it for User. | |
| `The relayed request <request> is not a request the Overseer reads` | `malformed-hatch-request` | The request file does not parse, or lacks a numeric format version, a request id or a command kind, or its body field is unusable. A request naming another numeric version is not refused: it waits for an Overseer that reads it, and the verb prints `queued`. | Send it through the verb, never by hand. | |
| `cannot be read, so whether the request was applied is unknown` | `malformed-hatch-reply` | The reply file is broken. **Exit 2.** The request may have been applied. | Run `status`, then decide. | |

</details>

### Install and version

<details open>
<summary>6 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `from an older forge` | `install-version-mismatch` `older` | The installed files are older. | Run `update`. | |
| `from a newer forge` | `install-version-mismatch` `newer` | The installed files are newer. `init` and `update` refuse too. | Update the program, then run `update`. | |
| `carry no install version` | `install-version-mismatch` `unversioned` | `version.json` is missing beside installed files. | Run `update`. | |
| `gives no install version` | `install-version-mismatch` `unreadable` | `version.json` does not parse or holds no whole number. | Run `update`. | |
| `is a directory where forge keeps its install version file` | `install-version-mismatch` `manifest-is-a-directory` | A directory sits at the path. `init` and `update` refuse too. | Remove it, then run `update`. | |
| `is built to run beside it only in a repository` | `older-program-present` | The root holds the released program's data folder. | Use a scratch repository. | |

</details>

### Tracker, lock and journal

Words here: [tracker](../glossary.md#tracker), [lock hold](../glossary.md#lock-hold),
[hold journal](../glossary.md#hold-journal). Recipe: [Lock refusals](../operations/runbook.md#lock-refusals).

<details open>
<summary>6 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `tracker was found in <directory> or any directory above it` | `no-tracker-found` | No tracker up the tree. | Run `init` in the repository. | |
| `which FORGE_ROOT names` | `no-tracker-at-override` | The variable names a directory with no tracker. | Run `init` there, or unset it. | |
| `is holding <path> and did not release it` | `tracker-lock-held` | The lock stayed held through `LIMITS.LOCK_RETRY_COUNT` tries. **Exit 2.** | If nothing runs, remove that path and retry. | |
| `held <path> so long that another command took it over` | `lock-taken-over` | This command outlived the lock. **Exit 2.** | Run it again. The next command finishes what was committed. | |
| `holds an unfinished write that cannot be read` | `malformed-hold-journal` | `hold-journal.json` is broken. **Exit 2.** | Repair it, or remove it and leave that write unfinished. | |
| `could not be removed` | `hold-journal-unremovable` | The write finished, but something holds `hold-journal.json`. **Exit 2.** | Close what holds it and run a command; that command finishes it. | |

</details>

### Stored files

<details open>
<summary>5 sentences</summary>

| Printed words | Code | Cause | What to do | Home |
| --- | --- | --- | --- | --- |
| `cannot be read: it is not there` | `unreadable-tracker` `absent` | `progress.json` went between discovery and the read. **Exit 2.** | Run again. Without the file the next run finds no tracker. | |
| `cannot be read: <reason>` | `unreadable-tracker` `progress-file` | `progress.json` is malformed, or of an older format. **Exit 2.** | Repair it. The reason may carry `OLDER_FORMAT_ADVICE`. | |
| `The log cannot be read:` | `unreadable-tracker` `log-file` | `log.jsonl` has a bad line. **Exit 2.** | Repair the line it names. | |
| `Ticket file ignored:` | `malformed-ticket-file` | A command named a ticket whose file does not parse. **Exit 2.** | Repair the line it names. | [cli.md](../cli.md) |
| `already exists but cannot be read as <an epic or a draft>` | `unreadable-file-in-the-way` | A malformed file sits at the path the record would take. | Repair or delete it. | |

</details>

### Refusals with no code

These sentences come from `cli/` as text and carry no code.

<details open>
<summary>11 entries</summary>

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
| `- reads standard input, and standard input is a terminal` | 1 | `--body-file -`, `--request-file -` or `--file -` typed with nothing piped in. | Pipe the text in, or name a file. |

</details>

## What is not here

| Refused by | Where |
| --- | --- |
| [Customs](../glossary.md#customs): a report refused, routed to a resume or an incident | `src/services/lifecycle/Customs.ts` |
| Landing: `target-moved`, `dirty-checkout`, `acceptance-waived` and the rest, with the action each leads to | `src/services/overseer/Airlocks.ts` |
| The Hatch ladder: which check refuses a relayed command, in order | `src/services/control/Bouncer.ts` |
| HTTP guards: `forbidden`, `unauthorized`, `not-ready`, `not-found` | [Overseer API](overseer-api.md) |
| Argument errors: a missing id, an unknown option, an unknown command | `cli/`. Each prints its own remedy, most with a `Usage:` line, at exit 1. |

## Sentences that mislead

These rows print as listed above, and the sentence is not the whole truth.

| Code | What the sentence implies | What holds |
| --- | --- | --- |
| `tokens-without-a-row`, `lowering-a-ticket-that-is-not-pending` | A low ticket has no row until it is started. | `ticket ready` gives a row at any priority. |
| `worktree-repair-failed`, `worktree-has-uncommitted-work` | Nothing was written at all. | Only the tracker is untouched. See [When something was written](#when-something-was-written). |
| `job-finished` from `intake close` or `job message` | The job has ended. | It is `stopping`: it is ending, and takes no close or message. |
| `baton-pass-failed` from `update` or `oversee restart` after the old Overseer let go | The old Overseer keeps driving. | Both commands print before the old Overseer has taken its port back. If that fails, it exits and nobody drives. Only `oversee status` shows the end state. |
| `baton-pass-failed` with `could not be bound again`, at step `bind-port`, printed by the Overseer as it exits | The old Overseer keeps driving. | Nobody drives. Run `oversee --detach`. A successor's own `bind-port` failure, without these words, is taken back. |
| `baton-pass-failed` with `no outcome within`, at step `serve` of code `unknown` | The Baton pass failed. | No outcome was read in time. The pass may still end either way, or the Overseer may have exited. |
| `incident-move-not-allowed`, `worker-filing-flag` from a terminal or the Bridge | A relay through the Overseer. | The same rule ran directly in this command, and no Overseer was involved. |
| `hatch-identity-mismatch` on an Assistant's `job message` or `job fresh` | The session forged an identity. | The Assistant used a move its incident allows; the format check refuses any `jobId`. |

## Coverage

At commit e408bd50 a one-off script, not kept in the repository, matched every `case` in
`src/adapters/utils/OperationRefusalWordingUtil.ts`, every `reason` in `src/lib/tracker-model/BoardRefusal.ts` and every
key of `RoleCommandRefusalReason` to a `Code` cell here, and every code here to the source. No spec keeps this page in
step; rerun the comparison after changing a wording.

| Measure | Count |
| --- | --- |
| `reason` values in `BoardRefusalDetail` | 147 |
| `case` labels in the wording util: Board reasons, detail kinds, install mismatches | 200 (147, 48, 5) |
| `RoleCommandRefusalReason` values | 8 |
| Sentences with a code, in the families above | 206 |
| Of those, marked "Never printed" | 22 |
| Sentences with no code, under [Refusals with no code](#refusals-with-no-code) | 11 |

`board-refusal` is the wrapper around every Board reason, so it has no row of its own. `role-command-refused` has one
row per reason.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| The refusal and its status | `src/shared/OperationRefusal.ts` | `OperationRefusal`, `OperationRefusalDetail` | `src/shared/OperationRefusal.spec.ts` |
| A Board rule's refusal | `src/lib/tracker-model/BoardRefusal.ts` | `BoardRefusalDetail` | `src/lib/tracker-model/BoardRefusal.spec.ts` |
| All wording | `src/adapters/utils/OperationRefusalWordingUtil.ts` | `messageOf`, `boardRefusalMessageOf` | `src/adapters/utils/OperationRefusalWordingUtil.spec.ts` |
| The API sentence | `src/adapters/utils/OperationRefusalWordingUtil.ts` | `apiMessageOf` | `src/adapters/utils/OperationRefusalWordingUtil.apiChannel.spec.ts` |
| Exit codes | `cli/Main.ts` | `runCommandLine` | `cli/Main.spec.ts` |
| The Bridge's answer | `cli/overseer/routes/CommandRoute.ts` | `answerControlCommand` | `cli/overseer/routes/CommandRoute.spec.ts` |
| A relayed refusal | `src/services/overseer/HatchInbox.ts`, `cli/HatchUnderJob.ts` | `replyOf`, `hatchWhenUnderJob` | `cli/HatchUnderJob.spec.ts` |
| Role reasons | `src/shared/@types/RoleCommandRefusalReason.ts`, `src/services/control/Bouncer.ts` | `verdictOf` | `src/services/control/Bouncer.spec.ts` |
| Older files | `src/adapters/constants/OlderFormatAdvice.ts` | `OLDER_FORMAT_ADVICE` | `cli/OlderTrackerRefusal.spec.ts` |
