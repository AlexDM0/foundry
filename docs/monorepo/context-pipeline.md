# Phases and hooks: a pipeline a board can extend

Nothing here is built. Statements about today's code come from forge at `e9b5d057` on the main line, and statements
about the rework from the branch `hephaestus-talos` at `76c56515`, where stage 8 of that run had just started.

The page [`research/context-pipeline/concept.html`](research/context-pipeline/concept.html) presents this design with
its difficulties, its impact and the arguments for and against it. Where the two differ, this document is right.

## 1. The shape

- **The phases that deliver an artifact are forge's, in a fixed order.** Intake delivers the ticket, plan delivers
  the plan, build delivers the commits and the Handoff, review delivers the Review, and the merge delivers the change
  on the main line.
- **Plan is a new phase.** A board switches it on and configures it.
- **The gates stay as they are.**
- **An approval is declared on an artifact:** which artifact, at which step, by which roles. Ticket review and merge
  approval are two such approvals, and keep what they do today.
- **A hook point follows each phase and the human review.** A board fills it with an ordered list of hooks. A hook is
  run by a command or by an agent, and forge knows three things about it: what it reads, whether it can
  block the flow, and which artifacts it produces.

```
intake ─▶ [hooks] ─▶ plan ─▶ [hooks] ─▶ build ─▶ [hooks] ─▶ review ─▶ [hooks] ─▶ merge approval ─▶ [hooks] ─▶ merge ─▶ [hooks]
 ticket               plan              commits,             Review               by User, if on                 on the
                                        Handoff                                                                  main line
```

A board that adds no hook and leaves plan off behaves as forge does now. The workflow stays fixed and programmed, so
decision 11 of the rework stands as written.

## 2. Decisions

Decisions 1 to 16 are the owner's own. Decisions 17 to 44 were recommended; the owner accepted them as a set on 21
November 2026, after an adversarial review of the design, and answered none of them one by one. Decisions 45 to 47
are the run's own. Decisions 5 and 7 carry the owner's additions of 23 November: approvals are declared on artifacts.

### The owner's

1. The pipeline keeps its fixed phases, and the deterministic gates stay.
2. Plan is a phase of its own that a board configures.
3. Between the phases that deliver artifacts there are hook points. A board adds a list of hooks to each.
4. A hook can be anything: a gate, a producer of an artifact that a later phase gets as context, a statistics
   tracker, a script that notifies another system with no verdict and no output. What forge needs to know is whether
   the hook can block the flow and which artifacts, if any, it produces. A hook that acts as a gate can also be set
   so that green continues and red halts for a person's review.
5. An artifact can need a person's approval. A board marks which artifacts need approval, at which step, and by which
   roles. The code of a ticket can be approved in the same way, as the human review of the code is. Forge tracks
   each approval on the artifact, for the audit trail and so that Gaia can show what is approved and by whom. That
   record steers nothing: the flow halts at the step where an approval is asked and passes once it is given. Not
   every artifact needs approval; that is the pipeline definition's choice. Ticket review is
   such an approval: on the ticket, after the ticket, by the roles the board names. An approval halts the ticket
   until a person accepts, and what the person does in the meantime is not the flow's concern. An example: an agent
   hook analyses patterns for test criteria and produces an artifact, a person approves it, and a later phase or
   hook gets that artifact as context.
6. Forge waits for each phase to finish, and for each hook. Nothing at a hook point runs beside the flow.
7. A merge is approved by a person or by the Airlock, as today. By a person, it is the approval of the code at the
   human review, and it keeps its merge queue and its order. The hook points are: after
   the ticket, after the build, after the review, after the human review and after the merge. This design adds one
   after the plan, where a board has a plan.
8. The first version is for one person who holds several roles, shaped so that a team fits later. A role is a label
   that routes and filters work. Nothing enforces it, and no login is part of this design. One signature is enough
   for an approval.
9. Forge keeps each artifact as a record of its own, as it keeps a ticket. Where artifacts are stored stays
   replaceable, so that an artifact can later live in a system outside forge.
10. One thing happens to a ticket at a time. Inside a phase, the agent may start subagents with tasks and
    deliverables of their own, as its brief defines. Forge sees one session, and records each subagent's tokens and
    time as it does for its own agents.
11. No ticket skips a phase or a hook in the first version. A short lane for small work is a later improvement.
12. Where an approval is defined, it is always followed, and no agent ever passes it. A person keeps a move by
    hand that pushes a ticket past one; it is recorded with who made it and why, and the ticket shows it. A ticket
    that waits for a person holds no agent slot: it is a branch that waits to be picked up.
13. The triggers are the ones forge has today. A source outside forge comes later.
14. A person who does not accept a document edits it, alone or in a conversation that the person leads and the agent
    assists. The result is a new version, and the person who edited may accept it. The ticket is held until someone
    accepts, and no count bounds it.
15. An accepted artifact can be reopened. The reopening is recorded in the audit trail. Every later phase that
    already finished evaluates its work again, in order, as an update and never a restart. When a build is running,
    it stops at the end of the agent's turn and User chooses: the same builder resumes with the change and keeps its
    commits, or the branch's work is discarded and a fresh builder starts from the target's tip.
16. A phase and a hook get what they declare and nothing else. What was said in a conversation reaches a later phase
    only when it is in an artifact.

### Accepted as a set

*What a hook is*

17. A hook declares what it reads: artifacts, and where it needs code, the code. A hook never works in the ticket's
    worktree. One that reads code gets a snapshot of the commit that was handed over, to use and throw away, as the
    pipeline agent gets a snapshot of the main line today. So no hook can change the repository, and none can leave
    files behind that the next job is blamed for.
18. A hook is run by a command or an agent, never by a person, and is never a phase's conversation. An approval is
    a halt with one event the flow knows, accept.
    Conversations that deliver an artifact belong to intake and plan; changing code belongs to build and review, and
    to a gate's `fix` line.
19. An artifact reaches an agent as labelled data in its first message, as the ticket's body does today, and in the
    message that resumes it when the artifact changed. It never joins the agent's instructions. Those keep coming
    from the main line only, so nothing a ticket or a branch contains can rewrite them.
20. A phase names the artifacts it gets, beside its instructions. The builder and the reviewer get the plan where a
    board has one.
21. A command hook's program comes from the main line or from the machine, never from the ticket's branch. A command
    hook may get secrets the board names. A hook that gets a secret reads artifacts only, never code. An agent hook
    never gets a secret.
22. Today's gates stay a mechanism of their own, and a hook replaces none. Ticket review and merge approval are
    approvals by decision 5 and keep their behaviour: only a person readies a ticket and no agent relays it; the
    approval of the code waits in the merge queue, and the order of accepting is the order of merging.
23. Forge refuses a list of hooks, when it is stored, that holds any of these: a hook that reads something no earlier
    phase or hook delivers; a hook with a secret that reads code; a blocking hook after the merge; a hook set to
    return the work that reads nothing its phase delivered, since the phase could never change its verdict.

*Versions and order*

24. A hook runs once for each version of what it reads. An approval is asked each time the flow reaches its step.
    The version of an artifact is the hash of its content. The version of a ticket covers what a person
    wrote, not the sections code adds. The version of code is the commit handed over. A hook that reads nothing runs
    once for each pass through its hook point.
25. The hooks of a hook point run in the order the board lists them, each after the one before it passed. The
    approvals asked at that step come after its hooks, so a person is asked only about what the checks let through.
    For now one accept from a person with any of the named roles is enough; how many an approval needs, and from
    whom, is the pipeline definition's to say. An artifact may need approval at more than one
    step.
26. A ticket at a hook point is in a state of its own, which every path that starts a phase or queues a merge checks.
    Today nothing holds a ticket between phases: the transaction that records passed gates also starts the review or
    queues the merge.
27. A person's edit pins an artifact a hook produced: the hook does not overwrite it. When the hook's inputs change,
    the person is asked again and may let the hook produce it anew.

*Outcomes*

28. A hook ends in one of three ways: yes, no, or could not run. An agent that ends without a verdict, a command that
    its bound stopped, and a declared artifact that is missing or lacks its headings all count as could not run.
29. Could not run is trouble with the run and never sends work back. Nothing runs the hook again by itself. A hook
    that neither blocks nor produces is recorded and the flow continues. For any other hook the ticket waits, with
    the failure shown, until a person runs the hook again or pushes the ticket past it by hand.
30. A blocking hook says what its no does: it returns the work, or it halts for a person. Returned work goes to the
    phase of that hook point and then passes every later phase and hook point again; a no after the review returns
    to the builder, and the review runs again. A no after the ticket returns the ticket to draft for User, whoever
    filed it.
31. Each hook point counts how often its hooks returned work. The board sets the count, two when it says nothing, and
    forge refuses none. Past the count the ticket is parked. The count is the hook point's own, apart from the count
    of red gates, and it is read from the log. A person's findings do not count and give the tries back.
32. A no that halts for a person shows that person the hook's output and waits for accept. Accepting continues the
    flow although the hook was red, needs a reason, and is recorded with who accepted which red. If the person
    changes the work first, the hook runs again on the new version.
33. Everything a person does to a halted ticket is recorded: an accept, an edit, findings sent to the builder. An
    approval shows what changed since the version that person accepted, what it was made from, why a hook was red,
    and how long the ticket has waited.
34. A command or agent hook has a bound: the bound of a gate line, and one minute for a hook that neither blocks nor
    produces unless the board sets more. An approval has none. Every run carries an identity of its own, which a
    hook that reports to another system can use to report once.

*The hook points*

35. The hooks after the ticket run when a ticket is submitted, whoever filed it, and before ticket review. The ticket
    is committed once they and the review have passed.
36. The hooks after the human review run after User accepted a merge and before an Airlock takes the ticket. An
    Airlock takes the earliest accepted ticket whose hooks have passed. Work returned from there leaves the merge
    queue, and its acceptance with it.
37. The hooks after the merge run when a ticket is delivered: for a ticket of a group, when its release lands. They
    hold no Airlock, and nothing there blocks.
38. A hook point whose phase is off is dormant, and its hooks are kept.

*The plan, people, change*

39. A board chooses how the plan is made: by a planner that works alone, or in a conversation between a person and
    the planner. The planner reads the committed ticket and a snapshot of the target, and delivers the plan as a
    record of forge, with the commit it was made against. An approval of the plan is declared on the plan.
40. The edit of decision 14 is a session forge hosts when a person asks for help with an artifact, as it hosts an
    intake. It is neither a hook nor a phase, and it holds a slot only while a turn runs.
41. An artifact can be reopened until its ticket enters the merge queue; after that, a change is a new ticket.
    Reopening stops the work under way first, and the session that resumes takes the new version as its start.
42. A new board gets today's pipeline: plan off, the approval of the ticket on, the approval of the code off, no
    hook. During setup the
    pipeline agent proposes a plan phase and hooks, and User adds what the board needs.
43. A ticket keeps the list of hooks it entered a hook point with. A change of a board's hooks applies from a
    ticket's next hook point; switching plan on or off applies to tickets committed afterwards.
44. In a forge with entities, each entity has its own hooks and its own plan setting, as it has its own gates. A
    package that a ticket crosses runs its own hooks after its build and after its review.

### The run's own

45. This work starts from the result of the rework, after its last stage, the rename, has landed. The rework run is
    live on `hephaestus-talos` and may change any file of this repository, so no code of this design is written
    before it ends.
46. Nothing that exists has to be kept, as in the rework: stored formats change outright and boards are set up anew.
47. A board with plan off and no hook is held against a frozen table of what forge does today: the git calls and a
    ticket's status at each point. Its log gains records and loses or changes none.

## 3. A hook

| It declares | Meaning |
| --- | --- |
| Runs by | A command, or an agent with a brief and a model |
| Reads | The artifacts it gets, and whether it gets a snapshot of the code |
| Blocks | Whether its "no" stops the flow, and if so what the no does: returns the work, or halts for a person with a role. |
| Produces | The named artifacts it leaves, each with the headings it must have |
| Network, secrets | Whether it reaches the network; for a command that reads no code, the secrets it gets |

Forge waits for every hook. The declarations decide what an outcome does:

| Blocks | Produces | A "no" | Could not run | Example |
| --- | --- | --- | --- | --- |
| No | Nothing | Has no meaning | Recorded and shown; the flow continues | A notifier, a statistics tracker |
| No | Artifacts | Has no meaning | The ticket waits for a person | Test criteria the reviewer reads |
| Yes | Nothing | Returns the work, or halts for a person | The ticket waits for a person | A check on the plan |
| Yes | Artifacts | The same, with the artifacts as findings | The ticket waits for a person | An architecture verification with its report |

A command says no through its exit status, as a gate does. An agent says no through a verdict in its report, as a
reviewer does.

### Approvals

An approval is a declaration on an artifact, not a hook. The flow halts at the step where it is asked and passes
once it is given. Forge records each accept with the version it was given for; that record is for the audit trail
and the board, and the flow does not read it. An artifact that no approval names is simply never asked about.

| Approval | On | Asked | By |
| --- | --- | --- | --- |
| Ticket review | The ticket | After the ticket | Roles A, B, C |
| Plan | The plan | After the plan | Roles B, C |
| Test criteria | `test-criteria`, which a hook produced | After the plan | Role B |
| Human review of the code | The code of the ticket | At the human review | User |

A person never says no. The ticket halts until accept, and what the person does before that (reads, edits the
artifact, sends findings to the builder, nothing) is outside the flow and on record. The review phase of this board
names `test-criteria`, and its reviewer gets the accepted version in its first message.

## 4. The hook points

| Hook point | What is handed over | When its hooks run | A "no" returns the work to |
| --- | --- | --- | --- |
| After the ticket | The ticket | When the ticket is submitted, before ticket review | Draft, for User |
| After the plan | The plan | When the plan phase ends | The planner, or the plan's conversation |
| After the build | The commits and the Handoff | After the commit checks and the build gates passed | The builder |
| After the review | The Review | After the review's own checks, before the merge queue | The builder; the review runs again |
| After the human review | The accepted change | After User's accept, before an Airlock takes the ticket | The builder; the ticket leaves the queue |
| After the merge | The landed change | When the ticket is delivered | Nothing: no hook blocks here |

## 5. The plan

- **Reads:** the committed ticket, the constitution, the planner's brief, a snapshot of the target.
- **Delivers:** the plan, a record of forge with versions, and the commit it was made against. A plan phase that ends
  without one is a failed pass.
- **Made by:** a planner alone, or a person with the planner in a conversation that the person closes, as an intake.
- **Read by:** the builder and the reviewer, beside the ticket. A reviewer judges Acceptance, as today; the plan is
  context, not a second list to judge.
- **Needs in forge:** a job kind and a role, their rights and checks, a step in the forecast, one more status, and
  the plan in the messages that start and resume a builder and a reviewer.

## 6. When things change

| What happens | What forge does | Decision |
| --- | --- | --- |
| A hook says no, set to return the work | Returns it to the phase of that hook point; past the hook point's count, parks the ticket | 30, 31 |
| A hook says no, set to halt for a person | Shows the person the hook's output and waits; an accept on a red needs a reason and is recorded | 32 |
| A hook could not run | Sends nothing back. The ticket waits for a person, unless the hook neither blocks nor produces | 29 |
| A person edits an artifact while a ticket is halted | Makes a new version and pins it; the hooks that read it run again, then the approval waits again | 14, 24, 27 |
| A person sends findings to the builder while a ticket is halted | Resumes the builder; the new commits pass the gates, the review and the hooks again | 30, 31 |
| A person reopens an artifact | Records it. Later finished phases update in order; hooks run again only where what they read changed, and each approval is asked again when the flow reaches its step | 15, 24, 41 |
| An artifact is reopened while a build runs | Stops the build at the end of the turn and asks User: resume with the change, or start fresh | 15 |
| A person pushes a ticket past a hook or an approval by hand | Records who and why, and shows it on the ticket | 12, 29 |

The audit trail is forge's log. It gains a record for each hook run and its outcome, each approval, edit, reopening
and move by hand, and each names the version it concerns.

## 7. What stays as it is

- **Gates,** their phases and their hashes, and the run on the merged tree.
- **What ticket review and merge approval do,** the merge queue and the order of accepting among it. They are now
  declared as approvals.
- **The Airlock** and the landing by compare-and-swap.
- **Talos.** A hook reaches it as a launch plan, as a gate line or a job does now.
- **Groups, release tickets, dependencies and epics,** the five stages of a crossing, incidents, slots and budgets.
- **Where instructions come from:** the main line, read at every launch and resume.
- **Decision 11 of the rework:** the workflow is fixed and programmed.

## 8. What changes, part by part

Sizes are estimates, on the rework's scale.

| Part | Change | Size |
| --- | --- | --- |
| The stored pipeline | A plan setting, and a list of hooks per hook point with its count | M |
| The Playbook and the lifecycle | A state for a ticket at a hook point, checked by every path that starts a phase or queues a merge; returns and their counts from the log | XL |
| The plan phase | A job kind, a role, its rights and checks, a forecast step, a status, the messages that carry the plan | L |
| Running a hook | Commands and agents under Talos, each on a snapshot, confined, with a bound, a run identity, a verdict and produced artifacts | L |
| Artifacts | The ticket, the plan, the Handoff, each Review and what hooks produce, as records with versions, pins and approvals | L |
| Commands | Accept, accept a red with a reason, edit an artifact, send findings, run a hook again, reopen, choose resume or fresh | M |
| The edit session | A hosted session for editing an artifact with an agent's help | M |
| Pipeline setup and its agent | Proposes the plan phase and hooks; refuses the lists of decision 23; User edits them | M |
| Gaia | A plan lane, the hooks of each hook point with their outcome, what an approver has to see, what waits on which role | L |
| Entities | Hooks and the plan setting per entity; a crossed package's hooks in its stages | M |
| Versions | A major change of the system version; a new install version for the planner's brief | S |

## 9. Stages

Each stage ends with the root's `bun run verify` green and a forge that works end to end on a scratch board, and each
brings its own part of Gaia. Work packages are cut when the base is fixed, since the rework still moves the files
they would name.

| Stage | What it delivers | Behaviour a person notices |
| --- | --- | --- |
| 0. Base and baseline | The rework landed; the frozen table of decision 47 | None |
| 1. Artifacts | The ticket, the Handoff and each Review as versioned records; the audit trail's new records | None |
| 2. Hook points | The state of a ticket at a hook point, on every path, with empty lists | None, and that is the test |
| 3. Hooks by command and agent | Snapshots, blocking and producing hooks, once per version, the counts, the bounds, could not run | A board can add a check or a notifier |
| 4. Approvals | Approvals declared on artifacts and on the code, tracked per version; red that asks a person; the edit session; what an approver sees | A board can ask for an approval of any artifact at any step |
| 5. The plan | The plan phase, alone and as a conversation; the plan in the builder's and reviewer's messages | A board can switch a plan on |
| 6. Reopening | Reopen, the update that runs through, pins, the halted build and its choice | An accepted plan can change without starting over |
| 7. Setup | The pipeline agent proposes hooks and a plan; the lists in Gaia | A board is extended without editing a file |
| 8. Entities | Hooks and plan per entity, and in a crossing | Each app and package has its own |

## 10. Left out on purpose

- A phase that a board defines, and any other order of phases.
- A hook that is a conversation, and a hook that changes code. So a hook cannot commit a design record or a
  changelog, and a separate agent cannot write tests before the build.
- A hook on the merged tree. Only the merge gates see it.
- A hook that runs once for a release instead of once for a ticket.
- Two hooks of one hook point at the same time.
- A short lane for small tickets.
- A trigger outside forge. A hook after the merge can already report to another system.
- Identity, permissions and roles that are enforced.

## 11. Risks

1. **What a producing hook leaves is unchecked** beyond its headings. It reaches an agent as data and not as
   instruction (decision 19), and an agent may still believe it.
2. **A builder can write for the judge.** A judging hook that reads the Handoff reads text the builder addressed to
   it. A judge's brief should make it look at the code and the plan.
3. **Judges multiply false reds.** Four judging hooks that are each wrong one time in ten send about a third of all
   tickets back for nothing. A noisy judge belongs on "halt for a person".
4. **An accept on a red lets work through that a check refused.** It needs a reason and is on record (decision 32),
   and nothing bounds how often a board does it.
5. **Each agent hook that reads code costs about as much as a review,** and it runs once per version, one after the
   other.
6. **Waiting for every hook** puts each one in the path of every ticket, up to its bound.
7. **A person is asked often.** Every approval is one more request per ticket, and one more for each version
   that changed what it covers.
8. **A halted ticket ages** while its target moves. The Airlock still catches a conflict at the merge.
9. **The state at a hook point touches every path** that moves a ticket today (decision 26). It is the largest and
   riskiest single change.
10. **A hook with a secret cannot look at code** (decision 21), which rules out a check that needs both, such as a
    migration tried against a staging system.
11. **Twenty-eight decisions were accepted as a set** (17 to 44). Decisions 26, 30 and 36 shape the most code.
