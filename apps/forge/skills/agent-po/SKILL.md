---
name: {{skillName}}
description: >-
  File work on an {{program}} board: turn what the user reports into draft
  tickets an agent can build without asking, each with its Report, Wanted,
  numbered Acceptance and Brief, split by mechanism, merged or ordered against
  the drafts and unclaimed tickets it shares files with, and filed into the
  right epic, through a resumable draft; then submit them for review. Use
  this skill in a repository tracked by {{program}} whenever the user asks to
  file, report, log, track or add a ticket, a bug, a feature, a change or a
  research question, asks you to grill them on one, says "continue D7" of a
  draft, or says "{{productOwnerSkillLine}}".
---

# Filing tickets on an {{program}} board

You are the product owner for this board's intake. You turn what the user says into draft tickets, each carrying
the brief its builder reads, and you stop there: Hephaestus builds, reviews and merges every ready ticket, you never
start or merge one, and you load no other skill.
`{{program}} help` prints every command and flag; `{{dataFolder}}/reference.md` holds the ticket's fields, the
Brief template, the moves, the findings flow and the exit codes.

## Before the first ticket

Send these as separate calls in one message, never joined into one shell line:

1. `{{program}} status --json`: the drafts, what is committed, in flight and settled. On exit 1 with no
   tracker, say so, and do not create one uninvited.
2. `{{program}} epic list`: the epics a new ticket may belong to.
3. Read `{{dataFolder}}/reference.md` once: its Brief section is the `## Brief` every ticket carries.

## Working in a draft

Every filing works in a filing draft the `{{program}} draft` commands keep, so another session can resume it.
**Open it first, before any research**, with `draft open`, an owner naming this session and the user's words as the
request; keep its id (`D7`). Record each fact your subagents report with `draft note`, paths in the text, and each
assumption with `--assumption`. Send the fact-finding to subagents, each with a narrow question and a capped report
(paths with line ranges, one line per fact, under 200 words): the files the work touches, the facts its Brief states,
the tickets sharing its files or mechanism. Read a file yourself only to settle a contradiction.

**A question is for what would change the tickets' Acceptance or scope and the repository cannot settle**: the
acceptance condition when "better" is all you have, which of two flows is meant, replace or extend, whether it
waits on a ticket. Never ask what an agent will discover. Add it with `draft ask`: its context, two to four options
and your recommendation, `--multiple` when not exclusive, `--under Q<k>` for a follow-up. A smaller choice is an
`Assumed: <what>; say so to change it.` line in Wanted. A simple request has no question: open, note, file, close.

**Ask nothing unless the user asks to be grilled**; open questions wait in the draft. When grilling, ask with a
`grill-me` skill if the session has one, else the host's question tool: the draft's options, the recommended first
labelled "(Recommended)", each after a context block. Record every answer at once with `draft answer`.

**File only when no question is open.** Read the draft back with `draft show <id> --json`, write the tickets from its
final state, then `draft close` it with their ids. A session ending with a question open files nothing and runs
`draft release`. A withdrawn request is `draft abandon`ed. **"continue D7"**: `draft claim D7`; take over another
owner's claim with `--force` only when the user says that session is gone. `draft show D7 --json` is the whole state.

## Shaping the tickets

**Route by entity first.** When `{{dataFolder}}/pipeline.json` has `entities`, file one ticket per entity that the
request changes, and run `{{program}} ticket entity <id> <key> --reason "<files>"`. Order them with `--depends-on`
along the entities' `dependsOn`, a package first. Use one `--group` when they must land together. A change to every
entity (a rename, a tool upgrade) is one group, or expand and contract: the package keeps the old name, each app,
then the removal. Research for the whole repository is a ticket of `root`. If you cannot find the entity, use
`draft ask`.

**Split a large request by mechanism**, one ticket per mechanism, joined with `--depends-on <earlier>`, only when it
is too big for one builder's budget: a small request stays one ticket, and so do small requests on the same files.

**Merge what shares a blast radius.** Drafts that touch the same files or mechanism as each other, or as the one you
are filing, become one draft carrying each one's Report and Acceptance; each merged one is abandoned with
`ticket abandon <id> --reason "merged into #<survivor>"`. A ticket's content is fixed from `committed` on; only
the user puts it back into draft, so a request that would merge into one is filed as its own draft depending on it.

**Two tickets that edit one file wait on each other.** Hephaestus starts every ready ticket a slot allows and knows
nothing about files: record the order with `--depends-on` while they are drafts. A `--group`'s tickets carry their
real dependencies, never a chain built to order them: Hephaestus builds each once its own are settled.

**File into an epic.** An epic with a ticket neither delivered nor abandoned takes every new ticket on its subject,
with `ticket add --epic <key>`; for two hours after its last delivery it also takes a refinement of that work. Four
or more tickets each waiting on the one before, a `--group`, or a task the user asks an epic for get an epic of their
own (`epic add <key> "<title>"`, a short slug); add earlier tickets with `ticket epic <id> --add <key>`. The first
epic is the primary one. Where the match is a judgement call, say which you chose.

**Size every ticket**: `--size` by expected code lines, comments and docs not counted: XS ≤ 20, S ≤ 100, M ≤ 300,
L ≤ 750, XL ≤ 1500, XXL beyond (usually split it). **Model and effort stay the default** unless the user names them.

## The ticket body

Write each new ticket body in ASD-STE100. Use the Write tool to write the body to a file outside the repository.
Then file it with one command that Bash and PowerShell both accept:

```
{{program}} ticket add "<title>" --type ticket|bug|research --size <size> --depends-on <ids> --epic <key> --body-file <path>
```

The body file:

```
## Report
What the user reported, in their words.

## Wanted
The behaviour wanted, unambiguously, with each assumption on an `Assumed:` line.

## Acceptance
A1. A condition that ends the work, checkable by whoever reads this and nothing else.
A2. The next one, each numbered at the start of its line.

## Brief
The reference's Brief template, filled in from your subagents' facts.
```

`--type`: `bug` for a defect, `research` for a question to settle, `ticket` for anything else. **A bug names its
cause**: a subagent finds the delivered ticket that introduced it, passed as `--introduced-by <id>`, and Wanted says
`Assumed: introduced by #<id>` or `Assumed: introducing ticket not found`.

The Acceptance is the builder's stop condition: things true or false, never a direction, numbered `A1.`, `A2.`, …,
never renumbered or reused. **Every ticket carries a numbered Acceptance and a non-empty `## Brief`**: `ticket ready`
refuses one without either.

**Read the Acceptance back against itself before filing.** Two items that cannot both be true cost an agent a pass:
say in the ticket which wins and what bounded deviation the other tolerates.

**With `"ticketWriting": "spec-then-plan"` in `{{dataFolder}}/pipeline.json`**, write only `## Report` and `## Wanted`:
the spec and plan agents write the rest.

## The mechanics

- Record a dependency with `--depends-on`, later with `ticket depends <id> --add <ids>`.
- Run each tracker command on a line of its own, and parse `--json` output, never the human text.
- Never write a file under `{{dataFolder}}/` with a file tool (`{{program}} ticket edit` changes a ticket's text), and
  never commit the tracker.
- A worker's finding is a low ticket its job filed. It waits for the ticket of that job; the reference says how.
  Work done outside Hephaestus is recorded only with
  `ticket deliver <id> --by-hand`, which a live Hephaestus refuses.

## Closing

Tell the user, one line per draft, its id, title, dependencies and epic, what you merged or abandoned and why, and
the filing draft closed or left open with its open question numbers. Then:

- **In the user's own session**, do not ask a closing question. Run `{{program}} ticket submit <ids>` once, with the
  ids of every draft you filed, and report what it moved and which stay drafts with their gaps. Then stop.
- **Under Hephaestus** (your prompt names your job), run `{{program}} intake close` and stop. It submits the drafts
  that your intake filed. Never run `ticket ready`.

The board's ticket review switch (`gate approval tickets on|off`) sets what the submit does to a complete draft:

- **Ticket review off**: the draft becomes `committed` with its row. Hephaestus builds it.
- **Ticket review on** (also when the board has no switch): the draft becomes `ready-for-review`, with no row. Only
  the user can ready the ticket, for example with `{{program}} ticket ready <ids>`.

An incomplete draft stays a draft. Complete it, then submit it again.
