# The context pipeline: steps a board defines, over one context

Nothing here is built. Statements about today's code come from forge at `e9b5d057` on the main line, and statements
about the rework from the branch `hephaestus-talos` at `76c56515`, where stage 8 of that run had just started. The
brainstorm this design came from is [`research/context-pipeline/concept.html`](research/context-pipeline/concept.html);
where the two differ, this document is right.

## 1. The shape

Today forge runs one pipeline, written in code: intake, ticket review, build, review, merge approval, landing. A board
switches parts of it on or off and sets the gates, the briefs and the models. This design makes the pipeline a
definition that a board owns.

- A pipeline starts at a **trigger**, which puts the ticket into the **context** of that ticket.
- A **step** declares what it reads from the context, runs an agent or waits for a person, and adds named
  **artifacts** to the context.
- Forge ships the **kinds** of step, of acceptance and of way back. A board chooses, orders and configures steps of
  those kinds, and may add steps forge never heard of: a plan, a test evaluation, an architecture verification.
- Two things stay code in every pipeline: what a session committed is checked against git, and code reaches a main
  line only through the Airlock.

Forge after the rework is the default definition. A board that changes nothing behaves as forge does now.

## 2. Decisions

Decisions 1 to 18 are the owner's answers of 21 November 2026. Decisions 19 to 28 were put to the owner as
recommendations and not answered before the owner ended the questions; they stand as recommended until the owner
changes one. Decisions 29 to 31 are the run's own, on how to get there.

### Answered by the owner

1. The first version is for one person who holds several roles, shaped so that a team fits later. Every step names
   the roles that may pick it up. A role is a label that routes and filters work. Nothing enforces it, and no login
   is part of this design. So nobody owns a step, one signature is enough for a sign-off, and an agent's question
   goes to User, as today.
2. A board composes its pipeline from the step kinds that forge ships. The kinds are fixed; the steps are free. A
   board adds a step of its own, with its own brief and its own artifacts, and forge does not have to design that
   scenario first.
3. The workflow is fixed per board by its definition, and no longer once for every forge. This changes the first half
   of decision 11 of the rework ("The forge follows a fixed, programmed workflow, and the user is a step in it"). The
   second half stands, and so does the rest of that decision: the forge decides no question of the user's.
4. Forge keeps each artifact as a record of its own, as it keeps a ticket. Where artifacts are stored stays
   replaceable, so that an artifact can later live in a system outside forge.
5. A ticket stands on one step at a time. Inside a step, the agent may start subagents with tasks and deliverables of
   their own, as that step's brief defines.
6. Forge sees one step and one session, whatever the session starts. It does not start, track or accept a subagent
   by itself, but it records each subagent's tokens and time as it does for its own agents. A step may emit several
   named artifacts, and they are accepted or refused together.
7. No ticket skips a step in the first version: every ticket takes every step of its definition. A short lane for
   small work is a later improvement. When it comes, a code review that is switched on is never skipped.
8. A human step may sit anywhere in a definition. A pipeline may also have none after the ticket is made and run by
   itself from there. Where a human step is defined, it is always followed. A ticket that waits at a human step holds
   no agent slot: it is a branch that waits to be picked up, however long that takes.
9. No agent ever passes a human step. A person keeps a move by hand that pushes a ticket past one. That move is
   recorded with who made it and why, and the ticket shows it.
10. The triggers are the ones forge has today: a request to make a ticket, a draft filed directly, a finding that a
    builder or reviewer files, a need that a build of an entity declares, and the fix ticket that an answer to a
    broken dependent files. A source outside forge comes later, as one more kind of trigger.
11. A refused sign-off opens an edit. The artifact opens in a conversation that the person leads and the agent
    assists. Closing the edit gives a new version, which needs the sign-off again, and the person who edited may sign
    it. The ticket is held from the refusal until that version is signed. No count bounds this.
12. An accepted artifact can be reopened. The reopening is recorded in the audit trail, and the new version needs a
    new sign-off where the pipeline requires one.
13. A change in one step makes every later step that already finished evaluate its work again, in order. This is an
    update and never a restart. Each sign-off that the pipeline requires is asked again.
14. When a spec or a plan is reopened while a build runs, the build stops at the end of the agent's turn and forge
    asks User to choose. Re-evaluate: the same builder resumes with the change in front of it, keeps its commits and
    decides what to redo. Rebuild: the work on the branch is discarded and a fresh builder starts from the target's
    tip. An artifact can be reopened until its ticket enters the merge queue; after that, a change is a new ticket.
15. A step names what accepts its output: a person's sign-off, commands that pass, the verdict of a judging agent, or
    nothing, in which case the ticket moves on when the step ends.
16. A judging step ends in a verdict: it passes, or it has findings. The definition says which earlier step the
    findings send the work back to.
17. A step gets what it declares and the repo it stands in, and nothing else. What was said in an earlier
    conversation reaches a later step only when it is in an artifact.
18. A step declares where it works: outside the repo, in a worktree it may only read, or in a worktree it may change.
    This holds for every kind of step, so a judging step that may commit fixes, as the reviewer does today, is one
    that declares a worktree it may change.

### Recommended, and not answered

19. A step with no acceptance is still checked for its output: forge moves the ticket on only when the step left
    every artifact it declared. A missing artifact is a failed pass. A fresh session tries again, and after two the
    ticket is held.
20. Two things are the same in every pipeline and no definition switches them off. A step that leaves commits is
    checked against git: a clean worktree, only paths inside the scope it declared, nothing in forge's own data. And
    code reaches a main line only through the Airlock, with the merged tree gated.
21. Every way back is bounded. The definition sets how many times a judging step may send work back, two when it
    says nothing, and forge refuses a definition that sets no limit. A judging step may send work back to any earlier
    step, a human step among them; the ticket then waits for that person as at any human step.
22. When a step that was a conversation has to update after an earlier change, its agent updates the artifact by
    itself and shows what changed. The person's part is the sign-off, which shows only the difference from the
    version signed before. A person who disagrees refuses, which opens the edit of decision 11.
23. An update runs through the agent steps by itself, one after the other, and stops only at a human step. A person's
    reopening gives every step its tries back, so no count that was used up before the change parks the ticket.
24. A definition may list the headings an artifact must have, as a ticket today needs a numbered Acceptance and a
    Brief. An artifact with no such list is free-form.
25. In a forge with entities, the forge has one definition for everything up to the moment a ticket has its entity,
    and each entity has a definition of its own for what follows. A crossing between entities stays the flow forge
    has today. In a package that a ticket crosses, only the package's build and its judging steps run, never its
    document steps or its human steps.
26. Every step belongs to one of four fixed phases, whatever the board calls the step: before the build, build,
    check, land. A ticket at a step is in one of four fixed states: waiting, running, waiting for a person, held. The
    board shows one lane for each step, and the phases let Gaia line up forges and entities whose steps differ.
27. A new board gets today's pipeline. During setup the pipeline agent offers more steps, a spec, a plan or a
    judging step among them, and User adds what the board needs.
28. A change of the steps of a definition, one added, removed or moved, applies to the tickets that are committed
    after it. A ticket under way finishes on the steps it started with. A change inside a step, its brief, its model
    or its commands, applies at that step's next launch, as it does today.

### The run's own

29. This work starts from the result of the rework, after its last stage, the rename, has landed. The rework run
    is live on `hephaestus-talos` and may change any file of this repository, so no code of this
    design is written before it ends.
30. Nothing that exists has to be kept, as in the rework. The stored pipeline, the ticket record and the served
    documents change outright, and boards are set up anew.
31. The default definition is held against a frozen table of what forge does today, taken before stage 2 changes
    anything: the git calls, the status of a ticket at each point and the records of the log. The rule that a tracker
    with no entities asks git exactly what it asked before stays in force through every stage.

## 3. The model

### 3.1 Context

The context of a ticket is everything that exists for it so far. A step declares the items it reads. Three kinds of
reference exist, and forge already uses all three without naming them:

| Reference | Meaning | Today |
| --- | --- | --- |
| Pinned | This exact version of a document | A committed ticket is kept by content hash, and agents build from that |
| Tracking | What the main line holds when the session starts | The constitution and every tracked instruction file, read from the main line at each launch and resume, never from the ticket's branch |
| Working copy | A place to stand, read and perhaps change | A worktree on the ticket's branch, cut from the target's tip |

A context item also says how it reaches the agent: put into its first message, placed on disk, or made reachable
through the network line of the step. Forge records the hash of everything a launch read, as it does today for
instruction files.

### 3.2 Artifact

An artifact is a document with a name the board chose, a version, the versions of the artifacts it was made from and
its sign-offs. Forge writes an artifact from what a step left, never the agent directly into the record, which is how
the Handoff and each Review are written today. The ticket, the Handoff and each Review become artifacts. A repo ref
is not an artifact: it moves, and only the Airlock moves a target.

### 3.3 Step

A step has these parts. The brief gave the first five; decisions 15 to 18 add the rest.

| Part | What it says |
| --- | --- |
| Reads | The context items the step gets (decision 17) |
| Runs | The agent's description and instruction, its model and effort, and whether it is a conversation with a person or a session that works alone |
| Who | The roles that may pick the step up or sign it, as labels (decision 1) |
| Works in | Outside the repo, a worktree to read, or a worktree to change, with the paths and the network it may reach (decision 18) |
| Emits | One or more named artifacts, with the headings each must have (decisions 6 and 24) |
| Accepted by | A sign-off, commands that pass, a judging verdict, or nothing (decisions 15 and 19) |
| Way back | For a judging step, the earlier step its findings return to and how often (decisions 16 and 21) |
| Phase | Before the build, build, check or land (decision 26) |

### 3.4 The catalogue

| Kind of step | What it is | Today's instances |
| --- | --- | --- |
| Conversation | A person and an agent, over several turns, until the person closes it. Holds no agent slot between turns | Intake |
| Agent work | A session that works alone and ends with a report | Build |
| Judging | A session that works alone and ends with a verdict | Review |
| Sign-off | No agent. A person accepts or refuses | Ticket review, merge approval |
| Landing | No agent on the normal path. The Airlock | Landing |

A board defines as many steps of the first four kinds as it wants. A pipeline whose steps change code ends in exactly
one landing.

## 4. What forge checks when a definition is stored

A definition that fails one of these is refused when it is stored, with the reason, and never found out by a running
ticket.

- Every item a step reads is emitted by an earlier step or by the trigger, or is a standing item of the board.
- Every judging step names an earlier step for its findings and a finite count (decision 21).
- A step that works in a worktree it may change is followed, somewhere, by the landing (decision 20).
- Every step has a phase, and the phases do not run backwards along the line.
- Step names are unique in a definition.

A definition is strict, as `pipeline.json` is today: an unknown key makes it malformed.

## 5. When things change

| What happens | What forge does | Decision |
| --- | --- | --- |
| A person refuses a sign-off | Holds the ticket and opens the artifact for an edit, led by the person. The new version is signed again | 11 |
| A person reopens an accepted artifact | Records it in the audit trail. Every later finished step updates, in order; agent steps by themselves, human steps waiting for their person | 12, 13, 22, 23 |
| An artifact is reopened while a build runs | Stops the build at the end of the turn and asks User: re-evaluate or rebuild | 14 |
| A judging step has findings | Resumes the session of the step the definition names, with the findings; past the count, holds the ticket | 16, 21 |
| A step with no acceptance leaves an artifact out | Counts a failed pass and starts a fresh session; two hold the ticket | 19 |
| A person pushes a ticket past a human step by hand | Records who and why, and shows it on the ticket | 9 |
| The steps of the definition change | Applies them to tickets committed afterwards | 28 |

The audit trail is forge's log. It gains a record for each sign-off, refusal, reopening, update and move by hand, and
each names the version of the artifact it concerns.

## 6. What stays as it is

- **Talos** starts children from the launch plan it is given. A step reaches it as a launch plan, as a job does now.
- **The Airlock** and the landing by compare-and-swap, one per target.
- **Groups, release tickets, dependencies and epics** stay data of the board. A release still lands a bundle of
  tickets in one landing, outside any definition.
- **Incidents, the Assistant's switch, notices and the outage pause.** They concern the run, not the work.
- **Launch slots, the machine's agent limit, the usage limit and the budget.** They apply to whatever step wants to
  start.
- **The store port and the contract with Gaia,** in their shape. Their documents and command kinds grow.
- **The crossing of entities,** as a built-in flow (decision 25).

## 7. What changes, part by part

Sizes are estimates, on the rework's scale.

| Part | Change | Size |
| --- | --- | --- |
| The stored pipeline | Triggers, steps and artifacts in place of fixed phases, roles and approvals | L |
| The Playbook | Still pure. It reads where a ticket stands in its definition and what is accepted, and says what may start | XL |
| Customs | Checks chosen by the kind of step, the scope the step declared and the headings of its artifacts | L |
| The ticket record | A ticket with a set of artifacts, each with versions, sources and sign-offs | L |
| Statuses and served documents | A ticket's step and state in place of a fixed status. A major change of the system version | XL |
| Commands | Pick up a step, sign, refuse, reopen, choose re-evaluate or rebuild, move by hand | M |
| Prompts and briefs | Agent descriptions and instructions that name artifacts, in place of prompts written for seven fixed roles | M |
| Pipeline setup and its agent | The agent composes steps from the catalogue; the check of section 4 guards what it proposes | L |
| Gaia | A lane for each step, a conversation for each conversation step, what waits on which role, an editor for the definition | XL |
| Entities | A definition for each entity after the forge's own | L |

## 8. Stages

Each stage ends with the root's `bun run verify` green and a forge that works end to end on a scratch board. Each
stage brings its own part of Gaia, so no stage leaves behaviour that cannot be seen. The work packages of a stage are
cut when its base is fixed, since the rework still moves the files they would name.

| Stage | What it delivers | Behaviour a person notices |
| --- | --- | --- |
| 0. Base and baseline | The rework landed. The frozen table of today's default path (decision 31) | None |
| 1. Artifacts | The ticket, the Handoff and each Review as versioned artifacts with sign-offs on record; the audit trail's new records | None |
| 2. The definition | The stored definition, its check, and the default definition. The Playbook reads it. The frozen table holds | None, and that is the test |
| 3. Steps before the build | Conversation and agent steps before the build, with sign-off, refusal as an edit, and the artifact's headings | A board can add a spec and a plan |
| 4. Steps after the build | Judging steps with their way back; human steps anywhere; the waiting state | A board can add a test evaluation or an architecture verification |
| 5. Reopening | Reopen, the update that runs through, the halted build and its choice | An accepted spec can change without starting over |
| 6. Setup | The pipeline agent offers steps; the definition's editor in Gaia | A board is set up without writing a definition by hand |
| 7. Entities | A definition for each entity | Each app and package has its own steps |

## 9. Left out on purpose

- A short lane for small tickets (decision 7).
- A trigger outside forge, and with it the question of which is the truth after an import (decision 10).
- Identity, permissions and roles that are enforced (decision 1).
- Two steps of one ticket at the same time (decision 5).
- A step over several tickets, such as a sign-off on a release.
- An artifact kept as a file in the repository, or in a system outside forge (decision 4 keeps it possible).

## 10. Risks

1. **A step that nothing accepts** (decision 15) hands whatever it produced to every later step. Decisions 19 and 24
   check that the output exists and has its headings, and nothing checks that it is right.
2. **An update that runs through** (decisions 13 and 23) can spend a build, a review and their gates again for a
   one-word change of a spec. Forge shows what an update will run before a person reopens.
3. **A ticket that waits in mid-pipeline** (decision 8) ages while its target moves. The Airlock still catches a
   conflict at the landing, later than a person would like.
4. **The baseline is the test of stage 2,** and it is only as good as the frozen table. A path the table misses can
   change without a spec going red.
5. **The views were built for fixed statuses** during the rework. Stage 2 changes what they read.
6. **A definition for each entity** multiplies what the pipeline agent designs and what a reader has to learn.
7. **Ten decisions are recommendations** the owner has not answered (19 to 28). Decisions 20, 25 and 28 shape the
   most code.
