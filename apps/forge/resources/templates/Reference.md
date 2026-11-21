# {{program}} — the file formats and the states

**The command reference is `{{program}} help`** — every command, every flag, printed by the tool
itself and therefore never out of step with it. Run it when you need a flag you do not remember;
nothing here repeats it.

What is here is what the tool does not print: the ticket's fields and the Brief it carries, what each
move does to the Gantt row, the jobs, decisions and incidents Hephaestus keeps, how a finding travels, what a session
under a job may run, where a review bar is drawn, how a row's tokens are credited, what counts against the limit,
the time axis and the exit codes. `{{program}} init` and `update` install it as `{{dataFolder}}/reference.md` and
rewrite it on every run, so a hand edit is undone; read it when a skill or a prompt sends you here, not before.

## A ticket

The ticket is known by its `id`. The CLI writes its keys in this order, omitting an optional key it does not have:

```
---
id: "003"
title: "Double-click a role to edit it"
type: "ticket"
priority: "high"
model: "sonnet"
effort: "high"
hold: "waiting for the design review"
status: "in-progress"
filed: "2026-09-18T20:11:03+02:00"
updated: "2026-09-18T20:40:00+02:00"
started: "2026-09-18T20:40:00+02:00"
finished: null
delivered: null
abandonedAt: null
group: "role-editor"
branch: "ticket/role-editor"
commit: "0a1b2c3"
reason: "…"
releasesGroup: true
dependsOn: "001, 002"
epics: "loyalty-programme, checkout-redesign"
network: "api.example.com, cdn.example.com"
entity: "web"
crosses: "design-system"
filedByJob: "J12"
contentHash: "5f1d3c9a0b7e2468"
task: 17
---
# 003 — Double-click a role to edit it

## Report
…
```

| key | written | value |
|---|---|---|
| `id`, `title`, `type`, `status`, `filed`, `updated` | always; required | `type`: ticket, bug, research; a stored change or feature reads as ticket and is written back as stored. `status`: draft, ready-for-review, committed, in-progress, in-review, reviewed, delivered, abandoned. `updated` is stamped on every move. |
| `priority`, `size`, `model`, `effort` | only once named | `priority`: low, normal, high. `size`: XS, S, M, L, XL, XXL, in capitals. `model`: haiku, sonnet, opus, fable. `effort`: low, medium, high, xhigh, max. Absent reads as normal, as no size, and as opus and medium, so an older ticket is never rewritten to gain them. |
| `hold` | only while held | the hold's reason, empty without one; any value but `null`, a bare `hold:` included, is held. Set and remove it with `ticket hold` and `unhold`. |
| `started`, `finished`, `delivered`, `abandonedAt` | always | a timestamp or `null`; an absent one reads as `null` |
| `group`, `branch`, `commit`, `reason` | when given | text; `reason` is dropped by `reopen`. Set `group` with `ticket add --group` or `ticket group`. |
| `releasesGroup` | only on a group's release ticket | `true`; absent or `null` is not the release ticket, any other value makes the file malformed. Set and remove it with `ticket release-of`. |
| `dependsOn` | when non-empty | ticket ids, written `"001, 002"`, read from any mix of commas and spaces with or without `#` or padding. Set it with `ticket depends`, which refuses a missing id or a circle; bare ids replace the list, `--add` and `--remove` change it. |
| `epics` | when non-empty | epic keys, written `"loyalty-programme, checkout-redesign"` and read like `dependsOn`, in order: the first is the primary epic. A part that is not an epic key makes the file malformed; a key whose epic is gone is kept. Set it with `ticket epic`, which refuses an epic that does not exist. |
| `network` | only once set | the public domains the ticket's agents may reach, written `"api.example.com, cdn.example.com"` and read like `epics`, lower case, in order. A domain that is not public makes the file malformed. Set it with `ticket add --network` or `ticket network`, only while the ticket is a draft or committed; `--clear` removes it. |
| `entity` | only once assigned | the key of the entity whose pipeline builds the ticket, in a forge with entities, written `"web"`; a blank one makes the file malformed. Set it with `ticket add --entity` or `ticket entity`, only while the ticket is a draft, ready for review or committed; the reason goes to the `entity-assigned` log record, never the file. In a forge with entities a ticket without one never becomes `committed`. |
| `crosses` | only once set | the keys of the whitelisted packages intake expects the ticket to cross into, written `"design-system, contracts"` and read like `epics`: a forecast for the board, never what decides the stages. No verb sets it. |
| `introducedBy` | only once named, on a bug | one ticket id, written `"005"`, read like a `dependsOn` entry: the delivered ticket whose change introduced the bug. Set it with `ticket add --introduced-by` or `ticket introduced-by`, which refuse a ticket that is not a bug and a cause that is missing, the ticket itself or not delivered; an empty cause removes it. |
| `foundInReview` | only once named | one ticket id, written and read like `introducedBy`: the ticket whose review found this one. Set only at filing, with `ticket add --found-in-review`, which refuses a ticket that does not exist. |
| `filedByJob` | only on a ticket a job filed | the id of the job whose Hatch filed it, written `"J12"`, stamped by Hephaestus from the Hatch folder's job, never from the request |
| `contentHash` | once the ticket was committed | the hash (64-bit FNV-1a, 16 hex digits) of the title and body kept when the ticket became committed, and moved by forge's own records in the body (the Handoff, a review, waived items, an answer); absent on a draft and on a ticket ready for review. The title and body read are always the kept ones, so a change of the file's text is undone at the next write. Any other value makes the file malformed. |
| `task` | always | the row's id as an unquoted integer, or `null` for a draft, and for a low ticket filed before install version 17 and never started; a quoted `task` makes the file malformed |

**The frontmatter is a deliberately small YAML subset.** One `key: value` per line, split at the
first `': '`, so `title: Fix: the thing` keeps its second colon; `key:` alone is an empty value.
A value is `null`, a double-quoted JSON string, or an unquoted scalar kept as text; only `task` reads
an unquoted integer as a number, so any other value keeps its leading zeros. A `#` comment starts in
column 0 with one hash; a line opening on two to six `#` followed by whitespace or nothing, indented
or not, is a markdown heading and makes the file malformed, as does any other indented line, a list
item or a bare word. There are no nested maps, lists or block scalars. The closing fence is the
*first later* line equal to `---`, so a body may contain horizontal rules. A leading byte order mark
is dropped and CRLF is kept.

A ticket stored with a status that is not a ticket status, the retired `open` or `done` included, is
malformed at its status line, the reason ending in the advice to run `{{program}} update` with a
release that still reads it.

The body is preserved byte for byte from the ticket template (Report, Wanted, Acceptance, Handoff),
`--body` or `--body-file`; an empty body falls back to the template. `ticket edit` replaces the body or
appends to it; `ticket edit --title`
rewrites only the `title` line, and a first body line still reading `# <id> — <old title>`, never the file name. A
committed ticket's title and body are not edited: from `committed` onward `ticket edit` is refused. A malformed ticket
file is listed as ignored rather than failing `status`.
A new ticket id is one past the highest of every file name, every parsed id and every ticket a row names;
gaps are tolerated, never filled.

**The Acceptance is numbered.** Each item of `## Acceptance` starts a line with `A1.`, `A2.`, …, its
continuation lines beneath it up to a blank line or the next item; an item is never renumbered and its
number never reused. `A3. Waived: <reason>` marks an item the user waived. A review's `## Review` holds
one line per item, bulleted or not: `A2 holds — <evidence>`, `A2 does not hold — <gap>` or
`A3 waived — <reason>`. A landing reads only the latest `## Review`, a heading inside a code fence not
counting as one: an item is accounted for when the Acceptance marks it waived, or when that Review has a
`holds` or `waived` line for it and no `does not hold` one.

**The Brief is the builder's brief.** A ticket's `## Brief` is what its builder reads as its scope and contract,
beside the Report, Wanted and Acceptance. `ticket ready` refuses a draft whose `## Acceptance` holds no numbered
item (`acceptance-unnumbered`) or that has no `## Brief` holding a non-blank line (`brief-missing`), so every
ticket that builds carries both.

## The Brief template

What only the filer knows goes into the `## Brief`, at the end of the ticket body when it is filed: where the work
belongs, the facts its builder would otherwise go and discover, and the claims its reviewer is to test. Hephaestus
builds other tickets beside it, so `Out of bounds` names what this ticket must not touch, and two tickets that
rewrite one file are ordered with `--depends-on` rather than fenced here. A Brief never states a worktree, a branch,
a claim or a merge step: Hephaestus's prompts name them.

```
## Brief
Work belongs in: <the files you expect it to touch>.
If satisfying the Acceptance block genuinely requires a file outside that list, edit it and say so
in the Handoff, naming the file and why.
Out of bounds regardless: <the files this ticket must not touch>.
Facts you do not need to look up:
1. <fact the agent would otherwise search for>
2. <fact, contract or file location>
Open exactly these, in one message: <path>:<lines>, <path>:<lines>.
Fails review if false: <two or three claims, each with the measurement behind it>.
```

**Brief the invariant, not the instances you happen to know.** When a ticket fixes one instance of a defect, state
the rule it is an instance of and make the search an Acceptance item, with the count of sites examined reported.

## What each move does to the Gantt row

The **from** column is the matrix the named verbs enforce and Hephaestus's moves keep; `ticket status <id> <status>`
skips it. **its row** is the status stored; **pill** is what that row then reads on the chart.

| move | from | ticket status | its row | pill | stamps written | log line |
|---|---|---|---|---|---|---|
| `ticket add` | — | draft | none, at any priority | `Draft` | `filed` | `Ticket #003 filed: <title>` |
| `ticket ready` | draft, for every id named, each with a numbered `## Acceptance`, a `## Brief` holding a non-blank line and, in a forge with entities, an `entity` and no path on its `Work belongs in:` line outside that entity (`work-outside-entity`); ready-for-review too when User runs it without `--incident` | committed | created `committed`, at any priority | `To do` | — | `Ticket #003 committed`, one per ticket |
| `ticket submit`, `intake close` with ticket review on | draft, each complete one, with no path on its `Work belongs in:` line outside its `entity` in a forge with entities; an incomplete one stays draft | ready-for-review | none | `Ready for review` | — | `Ticket #003 ready for review`, one per ticket |
| `ticket submit`, `intake close` with ticket review off | draft, each complete one, with an `entity` and no path on its `Work belongs in:` line outside that entity in a forge with entities; an incomplete one stays draft | committed | created `committed`, at any priority | `To do` | — | `Ticket #003 committed`, one per ticket |
| a build job prepares its worktree, or a review finds an item that does not hold | committed; in-review | in-progress | `in-progress`; created for a ticket without one | `In progress` | `started` if null; the row's end cleared | `Ticket #003 started` |
| a build job passes its gate | in-progress | in-review | `in-review` | `Awaiting review`; `Reviewing` while a review bar of the ticket is in progress | `finished` if null | `Ticket #003 in review` |
| a review job launches | in-review | in-review, unchanged | `in-review`, plus an in-progress review row for the job's round | `Reviewing` | — | `Review row #18 started: <name>` |
| a group ticket's merge lands on its group branch | in-review | reviewed | `reviewed`, its `reviewed` stamp set if unset | `Awaiting merge` | `finished` if null | `Ticket #003 reviewed` |
| a merge lands on the main line | in-review; reviewed for a release bundle's ticket landed with its group's release ticket | reviewed (unless already), then delivered | `delivered`; in-progress review rows delivered | `Done` | `finished` and `delivered` if null; `branch`, `commit` | the reviewed and delivered lines, and one per review row closed |
| `ticket deliver --by-hand` | anything but draft, while no Hephaestus is live and no job of the ticket is | delivered | `delivered` | `Done` | `delivered` if null | `Ticket #003 delivered` |
| `ticket abandon` | anything but delivered, abandoned | abandoned | `abandoned`; none created for a ticket without one | `Abandoned` | `abandonedAt`, always; the row's end if it had started | `Ticket #003 abandoned: <reason>` |
| `ticket reopen` | anything but draft and committed; a group's release ticket only while no other release ticket of its group is open | committed | `committed`, its start, end, `reviewed` and `reviewRound` cleared | `To do` | all four cleared; `reason` dropped | `Ticket #003 reopened` |
| `ticket unready` | committed, while no job of the ticket is on the board | draft | removed | `Draft` | — | `Ticket #003 unreadied` |
| `ticket priority … low` | draft, committed | unchanged | kept | — | — | `Ticket #003 priority normal → low` |
| `ticket priority` from low | any | unchanged | created when it has none and is not a draft: `committed` while the ticket is committed, else seeded from its stamps | per status | — | `Ticket #003 priority low → normal` |

A closing stamp is written only while it is still null, while `abandonedAt` is written every time:
re-entering a status is a correction, abandoning twice is deciding twice. Every move to a status other
than in-review finishes and delivers the ticket's in-progress review bar, with one log line each.

Filing the row is the first entry in its `history`, and each move appends another, so the detail
panel can say when the row reached each state and how long it sat there — the wait
between `To do` and `In progress` being the queue time. `task update --status` is not appended: it
corrects a row rather than moving it.

Moving a ticket to the status it already has is refused and logs nothing; a review round is counted on its review
bar, never as a move. A ticket taken straight to in-review, reviewed or delivered with `ticket status`, having
never started, gets a row whose start is stamped along with its end — an end without a start would draw from the
origin of the chart. There is no `paused` ticket status: `task pause <id>` records a waiting row and the ticket
stays where it was.

**`Done` on the chart means merged**: a row stored as `in-review` is waiting for its review or its merge, and one
stored as `reviewed` for its group's release. A free-standing row — a chore, anything with no branch to merge —
reaches `Done` through `{{program}} task deliver <id>` once its work is accepted.

## Jobs, decisions and incidents

**A job** is one agent session Hephaestus launched, kept on the board while it lives: a `build` or `review` job on a
ticket, a `merge` job holding a target's Airlock (with a `merge-agent` job: the last worker of the ticket, resumed for a
conflict or a red merged tree, or a conflict re-reviewer of a large resolution), a `product-owner` job running an
intake, and the one `assistant` job, the Assistant. A conflict re-reviewer can also run under a `build` or `review` job
in `merging-main`, when merge approval is on. `{{program}} jobs` lists them with their state (`launching`, `preparing`,
`running`, `in-customs`, `gating`, `waiting-for-answer`, `stopping`, …); `job show` and `job attach` read one. A job is
verified by code before anything it reports counts: its report, its commits and the checks line run on its tree.

**A decision** is a question for User, kept on the board until answered: an agent's own question (`agent-question`),
a parked ticket, a proposed waiver, a refused landing or merge, and the other kinds
Hephaestus opens from the facts. `{{program}} decisions` lists the open ones; `decide` answers one with Hephaestus
up or down, the first answer winning. An agent's question carries exactly its words, never anybody's opinion.

**An incident** is operational trouble Hephaestus's code cannot settle alone, never addressed to User: an agent's
`system` or `ticket` question, a failed setup, a job out of calls, a blocked or lost job, a gate that cannot run, a
quiet job, or a delivered ticket's findings. Each kind allows a fixed set of moves (`{{program}} incidents` shows them)
and has a default. While the board's Assistant is on, the incident goes to the Assistant, and takes its default when
the Assistant's turn ends without a move; what only User can settle the Assistant escalates as a decision. While the
Assistant is off, as on a new board, the incident takes its default at once.

**A notice** is a condition shown in the header and in `jobs` while it holds, never stored and never answered: an
install version that changed, a dirty main checkout, an attribution trailer, review rounds that do not converge.

## Findings and the by-hand rule

**A finding** is a low ticket that a builder, reviewer or merge-gate fixer filed with `ticket add --priority low`
through its Hatch. Hephaestus writes the tickets of the filing job (the finders) into its `dependsOn`. When a finder
has a group, the finding goes into that group. The worker cannot set either.

- When ticket review is off, a complete finding is committed at once. It builds only after its finders are reviewed or
  delivered, so it builds on the code of its finders.
- When ticket review is on, a complete finding goes to ready-for-review and waits for User's `ticket ready`.
- A finding with an incomplete body stays a draft.
- When a finder is abandoned, each finding of it that did not start goes to ready-for-review and loses that
  dependency, in the same write, whatever the ticket review switch says. User decides if it still applies.

A finding is a low ticket, so it launches after the ready normal and high tickets. Priority only sets the order of
the ready tickets: it never stops a ticket from being ready.

**Nothing is moved through the lifecycle by hand.** Hephaestus launches, verifies, merges and delivers; the one
record-only verb is `{{program}} ticket deliver <id> --by-hand`, which records as delivered a ticket User finished and
landed outside Hephaestus. It is refused while a Hephaestus is live (`hephaestus-owns-the-lifecycle`) and while a job of
the ticket is.

## Under a job: the Hatch

A session Hephaestus launched cannot write the data folder. Its read-only commands run directly; a command that
would change the board goes through its job's Hatch folder, the Hatch: the CLI writes the request there and waits for
Hephaestus's reply, printing `done <requestId>` or `nothing-to-do <requestId>` when Hephaestus applied it, the
refusal worded as a direct run words it, or `queued <requestId>` when no reply came in time, which Hephaestus still
applies. Never repeat a `queued` command. Each role may run only what its prompt names; anything else is refused.

The pipeline agent changes its setup record with five relayed commands. These commands are not in help. Under the
job, do not name the setup record: Hephaestus adds it. Write the payload as JSON after `--`, or give it in a file or
on standard input with `--file <path>` or `--file -`.

| Command | Payload |
| --- | --- |
| `{{program}} pipeline finding` | `{topic, label, value?, sourcePaths?, script?: {name, run, meaning, gateCandidate, needs?}}` |
| `{{program}} pipeline ask` | `{step, subject?: {kind, reference}, question, context?, options, recommended, multiple?}` |
| `{{program}} pipeline draft-constitution` | `{markdown, sources: [{lineText, occurrence, kind, path}]}` |
| `{{program}} pipeline propose` | `{edits: [{field, value, summary}]}` |
| `{{program}} pipeline ready <step>` | no payload; the step is `research`, `constitution` or `design` |

- A question has two to four options. Recommend exactly one option, or one or more when `multiple` is true. Do not
  give an "Other" option: User can always write a free answer.
- Send the whole constitution each time. A source names one full line of the text, without its line ending, and
  `occurrence` counts equal lines from 1. One line takes one source. A source path is relative to the repository.
- A proposal edit names one field of the draft (`gate:<name>`, `phase-order:<phase>`, `prepare:<name>`,
  `prepare-order`, `role:<role>`, `review`, `airlock`, `approval:<approval>` or `constitution`) and one summary
  sentence. The draft that the edits make must be a valid `pipeline.json`, so send a gate and its phase order together.
- `pipeline ready` only tells User that the step can continue. It does not move a step.
- The pipeline agent may also run `{{program}} question options`. It cannot run a ticket command.

In a forge with entities, a builder changes only the homes and the `reach` of its own entity. In stage 1 it can also
write a proposal in the home of a package that its entity whitelists. When the work needs a change in a different
entity, do not make that change. Declare a need with
`{{program}} need declare "<title>" --entity <key> --body-file <path>`. The body is the body of a ticket: a numbered
`## Acceptance` that gives the intended use, and a `## Brief`. Under the job, do not name the job: Hephaestus adds
it. Hephaestus refuses these needs:

- A need that is not complete (`need-incomplete`).
- A need for an entity that the pipeline does not name (`need-entity-unknown`).
- A need for the entity of the job (`need-of-own-entity`).
- A need from a job that is not a build job of an entity (`need-outside-an-entity-build`).
- A sixth need from one job (`need-limit-reached`).
- A need for a package whose change for the ticket a package review sealed (`need-for-sealed-package`).

## Where a review bar is drawn

A review job's bar stores the ticket it reviews in its `reviewOf` field. On the Progress tab a review pass is drawn
as a segment on that ticket's own row; with **Review passes as rows** pressed in the chart head's Row options menu
each review row sits directly above it instead, indented one level, latest round first, so round 1 is right above
the ticket, with its own bar, pill and times. A review whose ticket has no row on the chart — one hidden as long
done — is drawn where its filing puts it.

## A row's tokens

When a job ends, Hephaestus credits its tokens, every token the session and its subagents processed, to the row it
worked: a build's, a fixer's or a merge job's to its ticket's row, a review's to its review bar. A resumed session is
credited only what it grew by since its last credit. Product-owner and Assistant jobs have no row: their tokens are
kept on the job. `--tokens` on a `task` verb **sets** a row's count.

## Jobs against the limit

**A slot is a build or review job.** The concurrency limit bounds the build and review jobs in flight; merge,
product-owner and Assistant jobs hold no slot. Priority orders the ready tickets, high, normal, then low, then the
order they were readied in; a review or a fixer's rebuild never goes ahead of a ready build of a higher priority.

## The time axis

`{{program}} range` sets the tracker's stored default window, which is served with the board. A
relative bound is stored as you wrote it and resolved on each read, so `--from -2h --to now` always
means the last two hours.

## Exit codes

| code | meaning | examples |
|---|---|---|
| **0** | done, or there was nothing to do | also a command under a job that printed `done`, `nothing-to-do` or `queued` with its request id, `stop` with no live Hephaestus, every `hook session-start` run, and every `hook bash-domains` and `hook stage-edits` run, a deny answered through its JSON |
| **1** | a refusal the caller can act on | no tracker here (run `{{program}} init`), no such task or ticket, a missing `--reason`, a move the matrix refuses, readying a ticket that is not a draft or lacks a numbered Acceptance or a Brief (`incomplete-tickets`), lowering a ticket that is not a draft or committed, a `network` domain that is not public, `ticket deliver --by-hand` while a Hephaestus is live (`hephaestus-owns-the-lifecycle`), an answer to a decision already answered, a move its incident does not allow, a command under a job that its role may not run or that Hephaestus refused, a second Hephaestus (`hephaestus-already-running`), installed files of another install version (every command but `init`, `update`, `help`, `status`, `version`, `stop`, `talos-restart` and `machine`; run `{{program}} update`), `init` or `update` over files a newer {{program}} installed, `hook` given a wrong event word, an extra argument or an option, and an unknown command |
| **2** | a state the tool will not repair on its own | an unreadable or malformed progress file, an unreadable or malformed log.jsonl, a malformed ticket file a command names, a lock it could not take, a Hephaestus whose Baton a newer generation took (`baton-taken`), and any error the tool did not expect |

Check the code rather than the wording.
