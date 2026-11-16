# Entities: one forge for a monorepo

> **Question:** How does one forge at the root of a monorepo give every app and package its own constitution,
> pipeline and agents, with one intake and one board?  
> **Time:** 35 minutes.  
> **Read first:** [The system in twenty minutes](../../../../apps/forge/docs/concepts/overview.md), and the first monorepo design in
> `docs/monorepo/design.md` at the repository root.  
> **Next:** [the same strategy as a page](strategy.html), [the pipeline builder's monorepo mode](pipeline-builder-monorepo-mode.md).

Strategy of 16 November 2026. Nothing here is built. It is the second iteration on monorepo support and may break
the first iteration's rules where it says so. Statements about today's code were checked against the files named in
[Sources](#sources); names of things that do not exist yet are proposals. The stage logic and the implementation
plan were each reviewed against `docs/cli.md` and the code, and this text holds the result.

## 1. Summary

- **Scope.** Entities exist only in a **top-level forge**: a tracker at the repository root whose pipeline names
  entities. A forge in a folder (`init --root`) and a root forge without entities keep today's behaviour.
- **Entity.** An app, a package or the root. It owns folders, a constitution, a pipeline and agent settings.
- **One job, one entity.** Every builder and reviewer works under one entity's constitution and writes that entity's
  files.
- **A ticket belongs to one entity.** Intake, on a strong model, splits a request into tickets per entity.
- **A border is crossed in stages,** on one branch, one job at a time: the app's builder proposes the package change,
  the package's builder makes it final, the package's reviewer reviews it, the app's builder adapts, the app's
  reviewer reviews last. One landing.
- **Outside the whitelist,** a need becomes a ticket of the other entity, and the first ticket waits on it.
- **First,** connect the scope check that exists but never runs, and settle the sandbox failures of folder forges.

## 2. Scope: three configurations

| Configuration | Tracker | Pipeline | Behaviour |
| --- | --- | --- | --- |
| Single repository | at the repository root | no `entities` | as today |
| Folder forges | in a folder, with a namespace | no `entities`; `reach` by path | as today, plus the fixes of step 0 |
| Top-level forge | at the repository root | `entities` | everything in this document |

- `entities` in the pipeline of a tracker in a folder is refused when the pipeline is stored.
- A repository uses one configuration: `init` already refuses a tracker above or below another.
- Folder forges get no entities, no stages and no package constitutions. A repository that wants a package's
  constitution enforced uses a top-level forge.

## 3. The model

### 3.1 Entity

| Field | Meaning |
| --- | --- |
| `key` | Stable name. Tickets, jobs, log records and the monitor store the key, never a path. |
| `kind` | `app`, `package` or `root`. Exactly one `root` entity exists, made by forge. It owns every path no other entity owns. |
| `home` | One or more repository folders, each leading with `/`. A deeper folder wins over a shallower one; two equal folders are refused. |
| `summary` | Two lines for intake's routing, written by the research pass. |
| `constitution` | `{path}`; by convention `CONSTITUTION.md` in the first home folder. Absent: the installed default constitution, as today. |
| `prepare`, `gates`, `phases`, `review` | The entity's pipeline, in today's format. A `package` that any entity whitelists must have `review`. |
| `agents` | Settings for `builder`, `reviewer`, `reReviewer`, `conflictReReviewer`. |
| `whitelist` | Keys of `package` entities its tickets may cross into by stages. |
| `reach` | Repository paths its builder may change directly: derived root files such as the lockfile. Same meaning as today. |
| `dependsOn` | Keys of entities it consumes. Decides whose gates run when a dependency changed. No circle. Every entity depends on `root` without saying so. |
| `concurrency` | Optional cap on its running jobs, under the board's limit. |

Forge-level keys stay at the top of `pipeline.json`: `airlock`, `approvals`, `billing`, and `agents` for
`productOwner`, `pipelineAgent` and `assistant`.

```json
{
  "version": 4,
  "prepare": [], "gates": [], "phases": { "build": [], "review": [], "merge": [] },
  "airlock": {}, "approvals": {}, "billing": {},
  "agents": { "productOwner": { "model": "opus", "effort": "high" } },
  "entities": {
    "gaia": {
      "kind": "app", "home": ["/apps/gaia"],
      "constitution": { "path": "/apps/gaia/CONSTITUTION.md" },
      "whitelist": ["design-system"],
      "reach": ["/bun.lock", "/package.json"],
      "dependsOn": ["design-system"],
      "gates": [{ "name": "verify", "in": "/", "run": "bun run gate:gaia" }]
    },
    "design-system": {
      "kind": "package", "home": ["/packages/design-system"],
      "constitution": { "path": "/packages/design-system/CONSTITUTION.md" },
      "review": {},
      "gates": [{ "name": "verify", "run": "bun run typecheck && bun run test" }]
    }
  }
}
```

### 3.2 Ownership

- Every tracked path has exactly one owner: the entity with the longest home folder that contains it, else `root`.
- `.forge/`, `.claude/` and `.mcp.json` at any depth stay protected from every agent.
- **Entity size is the release valve.** A border costs stages. A package private to one app is a further home folder
  of that app's entity, not an entity of its own.
- **The root entity is an ordinary entity for tickets.** The owner may give it gates and a constitution. Nobody can
  whitelist it. Without gates it is for a person, as the root of this repository is now.

### 3.3 Ticket

- `entity`: required to ready a ticket in a top-level forge. The owner assigns it in the Bridge; the CLI verb is
  `ticket entity`.
- `crosses`: optional list of whitelisted packages intake expects the ticket to cross into. A forecast for the
  board; what the branch really changed decides the stages.

### 3.4 Job

- A job gains `entity` (whose stage it runs) and `stage`. Its constitution, instruction list, model, effort, gates,
  prepare steps and toolchain grants all come from that entity.
- **A session starts at the worktree's root,** as a root tracker's does today. Its prompt names the folders it may
  change. Starting inside an entity's folder would cut off the lockfile and the root's settings, skills and
  `CLAUDE.md`.
- The session's Edit and Write rules list only the folders the stage may change. An edit elsewhere is denied at
  once. Bash is not stopped there; Customs judges what the job left.

## 4. Lifecycle

### 4.1 A ticket inside one entity

Build, review, landing, as today, with the entity's constitution, pipeline and agents.

### 4.2 A ticket that crosses into a whitelisted package

| # | Stage | Job | Under | May change | Ends with |
| --- | --- | --- | --- | --- | --- |
| 1 | `build` | the home entity's builder | home | home files, home `reach`, and a proposal in whitelisted package files | home gates |
| 2 | `package-build` | the package's builder | package | package files, package `reach` | package gates, then the gates of the package's dependents other than home |
| 3 | `package-review` | the package's reviewer | package | package files, package `reach` | the seal |
| 4 | `adapt` | the home entity's builder | home | home files, home `reach` | home gates |
| 5 | `review` | the home entity's reviewer | home | home files, home `reach` | ticket `reviewed` |
| 6 | landing | the Airlock | | | gates of every changed entity and its dependents on the merged tree |

- **What starts the stages.** After stage 1, Customs sorts the paths the branch itself changed past its target by
  owner. Home and `reach`: nothing more. A whitelisted package: stages 2 and 3 for it. Anything else: refused (E11).
- **Several packages.** Stages 2 and 3 run once per package, one package after the other, a package before the
  packages that depend on it.
- **The seal.** At the end of stage 3 the Overseer stores a hash of the ticket's own change to the package: the
  difference, on the package's folders and on the `reach` paths a package stage changed, between the target and the
  branch, with the target's merged-in commits left out. This is how Customs already judges a branch against its
  target. Later jobs of the ticket may not alter that change. A merge of the main line never breaks a seal.
- **Skipping `adapt`.** When, for every crossed package, the sealed change equals the ticket's own change at the
  end of stage 1, the proposal landed as written and stage 4 is skipped.
- **Ticket status.** A stage job never moves the ticket's status. The ticket is `in-progress` through stages 1 to 4
  and `in-review` in stage 5; the Playbook launches by the row's `stage`, not by the status.
- **Counters.** Red handoffs and failed passes are counted per stage and entity and start at zero when a stage
  starts. Today's bounds apply within a stage.
- **Review.** One bar per review stage, labelled with its entity. Rounds are numbered per stage, so the home
  review's round 1 is its first whatever the package review needed.
- **Handoff and Acceptance.** `## Handoff` has one part per stage that built, and a stage replaces only its own
  part. The evidence for the ticket's Acceptance is owned by the last home build stage: stage 4, or stage 1 when
  stage 4 was skipped.
- **Questions.** A question from any stage's agent goes to the owner, as today.

### 4.3 A need outside the whitelist

1. The agent of a build stage declares the need through its Hatch before it writes there: the entity, a title, a
   numbered Acceptance that holds the intended use, and a Brief. An incomplete need is refused back to the agent.
2. Its job ends with the outcome `needs-declared`. The branch and its commits stay.
3. The Overseer files the ticket for the other entity, stamped `filedByJob`, and submits it. With ticket review off
   it is `pending`; with it on it waits for the owner like any ticket, shown as blocking the first one. The first
   ticket gets it in `dependsOn`. The new ticket does not wait on the first.
4. The first ticket keeps its status, its `stage`, its seals and its counters. The Playbook launches nothing for a
   ticket with an unsettled dependency.
5. When the dependency is delivered, the stage that declared the need runs again: the main line is merged in, and
   the session is resumed, or a fresh one starts with the earlier notes.
6. **Priority.** The need's ticket runs at the highest priority among itself and the tickets that wait on it, also
   when one of them is raised later.

## 5. Edge cases

Each case names what happens. "Decision" means a decision opened for the owner, with the ticket held.

### 5.1 Ownership and scope

| Id | Case | Handling |
| --- | --- | --- |
| E1 | A path in no entity's home | Owned by `root`. |
| E2 | A home inside another home | The deeper home wins. A seal on the outer entity covers only the paths the outer entity owns. |
| E3 | Lockfile and root manifests | Listed in `reach`; changed directly. A `reach` path a package stage changed joins that package's seal. |
| E4 | A change to a root-owned or `reach` path | Counts as a change of `root`: the landing runs every entity's gates. |
| E5 | A file moved across a border | A change in both entities. The rule for each side applies. |
| E6 | A new folder at the root, such as a new package | Owned by `root` until the owner adds an entity. A ticket of an app cannot create it. |
| E7 | `.claude/`, `.mcp.json`, `.forge/` at any depth | Denied in the sandbox and refused by Customs in every entity home, not only at the root. |
| E8 | A change to a constitution | Only by a ticket of that entity whose body names the file (today's rule). Never in a package stage of another entity's ticket. |
| E9 | Generated files that one entity writes into another | The owner of the path decides. Put the output folder in the generating entity's home, or the change is a crossing. |

### 5.2 Stage 1, build

| Id | Case | Handling |
| --- | --- | --- |
| E10 | No package file changed | No stages; the single-entity flow. |
| E11 | The branch changed files of an entity that is neither home nor whitelisted | Customs refuses. The session is resumed once to take the change out and declare the need (4.3); a second refusal fails the job. |
| E12 | The need is for the `root` entity | A ticket of `root` when `root` has gates. Otherwise a Decision: the owner makes the change or declines. |
| E13 | The need would close a circle in `dependsOn` | Refused, as `ticket depends` refuses a circle today. Decision. |
| E14 | The ticket filed for a need is abandoned | The waiting ticket loses the dependency. Decision: continue without it, or abandon. |
| E15 | All the work belongs to another entity, or stage 1 changed only package files | Decision: move the ticket to that entity and drop the branch, or abandon. No status move reaches `ready-for-review` from a started ticket. |
| E16 | Home gates red with the proposal | Today's red handoff: the session is resumed. |
| E17 | The call budget ends mid-stage | Today's wind-down; the stage is resumed. |
| E18 | An Edit or Write outside the stage's folders | Denied at once by the session's edit rules. |
| E19 | A package is taken off the whitelist while the ticket crosses into it | Decision: finish under the old whitelist, or turn the package change into a need. |

### 5.3 Stage 2, package build

| Id | Case | Handling |
| --- | --- | --- |
| E20 | The package builder accepts the proposal as it is | It commits nothing and reports so. The package gates run on the proposal. |
| E21 | It reshapes what the package exposes | Normal. Stage 4 brings the app in line. |
| E22 | It refuses: the constitution forbids the change | Job outcome `refused` with its reason. Decision: drop the package change (back to stage 1 with the reason), turn it into a need (4.3), or abandon. |
| E23 | It changes files outside the package | Customs refuses; resumed once, then failed. |
| E24 | It needs a change in a third entity | A crossing is one level deep: only the ticket's home whitelist counts. The package builder declares a need (4.3) and the ticket waits in stage 2. |
| E25 | Package gates red | Red handoff to the package builder. |
| E26 | A dependent's gates red: the change breaks another app | Red handoff to the package builder: a package change must not break its dependents. If it cannot hold, Decision `dependent-broken`: the owner files tickets for the dependents in one `group` with this ticket. |
| E27 | The package has no gates | Nothing runs; the board shows the entity as unchecked, as `checks-not-set` does today. |
| E28 | The package has no constitution | The installed default constitution, as today. |
| E29 | Stage 2 would resume the wrong session | A stage resumes only a session of its own entity and stage. Stage 2 never resumes the home builder's session. |

### 5.4 Stage 3, package review and the seal

| Id | Case | Handling |
| --- | --- | --- |
| E30 | The reviewer fixes | It commits in package files; the package gates run on its last commit, as today. |
| E31 | The review finds too much | Today's re-review rounds, with the package's `reReviewer`, counted in this stage only. |
| E32 | The reviewer sees a problem in the app's files | It writes it in its review text, which stage 4 and stage 5 receive. It does not fix it and files no ticket. |
| E33 | A later job of the ticket alters the sealed change | Customs refuses; the session is resumed once to undo it. The Airlock's merge and conflict work are exempt. |
| E34 | The reviewer's verdict is that the change does not hold | Back to stage 2 with the review, within today's bound on rounds. This is not the one way back of E41. |
| E35 | The main line is merged in before the review, as today | The seal and the skip of `adapt` compare the ticket's own change, so the merge does not disturb them. |
| E36 | Human approval of the merge or the code | Once per ticket, at the end, as today. Not per stage. |

### 5.5 Stage 4, adapt

| Id | Case | Handling |
| --- | --- | --- |
| E40 | Nothing to adapt | Skipped (4.2). |
| E41 | The final package no longer gives the app what it needs | The builder reports that with its reason. The seal is lifted and the ticket returns to stage 2. This counts as a package return. |
| E42 | The builder wants a further package change | The same return as E41, with the new need written out. It does not write package files. |
| E43 | The stage 1 session can no longer be resumed | A fresh session on the branch, with the stage 1 handoff and the package review in its prompt. |
| E44 | Home gates red | Red handoff to the home builder. |
| E45 | A second package return of any kind (E41, E42, E65) | Decision `second-return`. The owner agreed to one way back. |

### 5.6 Stage 5, review

| Id | Case | Handling |
| --- | --- | --- |
| E50 | The reviewer fixes | In home files only. |
| E51 | The review does not hold | Back to stage 4. When stage 4 was skipped, the stage 1 session is resumed as stage 4, or a fresh home builder starts. |
| E52 | The cause lies in the package | Back to stage 4; the builder uses the return of E41. |
| E53 | A finding outside the ticket | Filed as a low ticket, as today, for the entity that owns the path. |

### 5.7 Landing

| Id | Case | Handling |
| --- | --- | --- |
| E60 | The main line merges cleanly | The gates of every entity the ticket changed, and of their dependents, run on the merged tree. |
| E61 | The main line changed the same package, no conflict | The seal stands. The two package changes are combined without a second package review; the gates decide. Accepted. |
| E62 | A conflict in package files | Resolved by the package's builder under the package's constitution, then reviewed by the package's `conflictReReviewer`, whatever the size. |
| E63 | A conflict in home files | Today's path: the ticket's last home worker, the home `conflictReReviewer` above the threshold. |
| E64 | Conflicts in both | The package's worker resolves its files and leaves the merge open; the home worker resolves the rest and commits the one merge. |
| E65 | A gate red on the merged tree, or a stale green that turns red | Routed to the entity that owns the gate. A package's or a dependent's gate: the seal is lifted, the ticket returns to stage 2, and it counts as a package return (E45). A home gate: stage 4. |
| E66 | The same before a review: a conflict or a red gate when the target is merged in | Routed by owner in the same way, not to "the builder". |
| E67 | The ticket is abandoned in any stage | The branch is dropped. Nothing of the package change reached the main line. |
| E68 | The ticket is in a `group` | The same stages; the target is the group branch. On a group target the landing runs only the ticket's own entities' gates; the dependents' gates run at the group's release. |

### 5.8 Scheduling

| Id | Case | Handling |
| --- | --- | --- |
| E70 | Slots | A stage's job holds one slot. Between stages the ticket holds none. |
| E71 | Order | A ticket between stages is launched before a ready ticket of the same priority, so started work finishes first. |
| E72 | An entity's cap | Counts the jobs whose `entity` is that entity, whatever ticket they serve. |
| E73 | Two tickets cross into one package at once | Allowed. Each seals its own change; the second to land meets E61 or E62. |
| E74 | The Overseer restarts mid-stage | The stage, the seals and the counters are stored on the row; jobs resume as today. |
| E75 | `ticket hold`, a job stopped, a fresh job asked | Between stages a hold holds, as between build and review today. A stop or a fresh job stays in its stage. |
| E76 | A usage limit | Today's wait; no stage rule. |

### 5.9 Intake and tickets

| Id | Case | Handling |
| --- | --- | --- |
| E80 | A request for several entities | A ticket per entity, ordered with `dependsOn`, or in one `group` when they must land together. |
| E81 | Intake cannot tell the entity | It asks the owner, as it asks any question today. |
| E82 | A mechanical change across every entity: a rename, a tool upgrade | Expand and contract through `dependsOn` (the package first, keeping the old name; each app; then the removal), or one `group` of per-entity tickets. No job writes two entities outside a crossing. |
| E83 | A worker's finding | Filed for the entity that owns the path it names. |
| E84 | A `research` ticket | Needs an entity; its output belongs in that entity's folders. Research for the whole repository is a ticket of `root`. |
| E85 | A draft names files outside its entity and whitelist | Filing refuses it. |

### 5.10 Configuration over time

| Id | Case | Handling |
| --- | --- | --- |
| E90 | An entity is added | Through the pipeline builder's update; open tickets are not touched. |
| E91 | An entity is removed or renamed while a ticket names it | Refused. First move or finish those tickets. |
| E92 | An entity's folder moves | Its `home` changes; the key and every ticket stay. |
| E93 | A constitution changes on the main line while a ticket runs | Each job reads the main line's text at launch, as today. A seal is not affected. |
| E94 | A root forge without entities becomes a top-level forge | Through the pipeline builder's update, refused while a ticket is in progress or in review. Pending tickets need an entity before they launch. |
| E95 | An older forge reads the new pipeline file | It refuses the file by its version, as it refuses any version it does not know. |
| E96 | Folder forges become one top-level forge | Not supported: clear the trackers and set up at the root. History is not carried over. |

## 6. Implementation

The order is the order to build in. Each step keeps `bun run verify` green. A forge without entities must stay as
it is after every step: every new git call sits behind an early return when the pipeline has no entities, the way
`changesStayInHomeAndReach` returns before git for a root tracker.

### Step 0. Make today's guard real

For folder forges, independent of entities.

- **Scope for builders and reviewers.** The Customs subject built in `src/services/overseer/JobLaunch.ts` carries
  no `projectScope`, so `changesStayInHomeAndReach` (V17) always passes and the stored `reach` is never read by the
  Overseer. Pass the tracker's prefix and the pipeline's `reach`. That also turns on the any-depth forms of V5 and
  V13 and the project-relative form of V11. Give the prefix to `agentConfigTouchedBeforeLaunch` too.
- **Instruction paths.** `InstructionFiles.trackedInstructionPathsOf` returns project paths where V11 compares git
  paths. Give it the prefix and map through `ProjectPathsUtil.toRepositoryPath`.
- **The merge step.** `src/services/lifecycle/MergeRun.ts` calls V10, V1 and V2 by name. For a tracker in a folder
  only, also run V17, V5 and V13 on a conflict resolution. The whole column cannot run there: V14 needs a launch
  snapshot no Airlock agent has. A single repository's landings stay untouched.
- **Specs.** A `JobLaunch` spec for a folder tracker that fails without a scope; `InstructionFiles.spec.ts`; the
  Airlock conflict specs for a folder tracker.
- **More frozen replays first.** `cli/overseer/FrozenRootTrackerGitCalls.json` covers two clean runs. Before any
  entity code, freeze a root tracker's git calls for a conflict, a red handoff and a review round as well.
- **Sandbox,** after a probe with a real session ([section 8](#8-the-sandbox-failures-of-a-folder-forge)).

### Step 1. The entity in the model

Internal only. The stored pipeline with entities is still refused until step 3 completes, so no forge can run on a
half-built model.

- `src/lib/tracker-model/@types/Pipeline.ts`: `PipelineEntity`, `entities?`, `PIPELINE_FORMAT_VERSION` 4.
  `PipelineUtil.formatVersionOf` writes 4 only when `entities` is present. The top-level `prepare`, `gates` and
  `phases` stay required and are empty beside `entities`.
- `PipelineUtil.pipelineOfEntity(pipeline, key)`: one resolver that returns an ordinary single pipeline for an
  entity. Every reader of gates, prepare steps, agents and the constitution goes through it, so readers keep one
  shape.
- `src/adapters/pipeline/PipelineFile.ts`: read and validate. Refusals: equal homes, an unknown key in `whitelist`
  or `dependsOn`, a whitelisted entity that is not a `package` or has no `review`, a circle in `dependsOn`,
  non-empty top-level `gates`, `prepare`, `constitution` or `reach` beside `entities`.
- The refusal of entities in a folder tracker sits where the prefix is known, in the tracker service that stores
  the pipeline, not in `PipelineFile`.
- `src/lib/tracker-model/utils/EntityOwnershipUtil.ts` (new, pure, DOM-safe): `ownerOf`, `pathsByOwnerOf`,
  `dependentsOf`, `stageOrderOf`.
- Ticket: `entity?`, `crosses?` in `@types/Ticket.ts`, `TicketFields`, the ticket file's ingestion and writer, and
  the filing draft's fields. `ticket add --entity`, `ticket entity`, and a control command so the Bridge can assign
  one. `ticket ready` refuses `ticket-without-entity`. Both wording channels of `OperationRefusalWordingUtil`.
- Rules and frozen files: the pipeline row of Deviations and `cli/OlderPipelineRefusal.spec.ts` name versions 2 and
  3; `docs/cli.md` with `resources/templates/Reference.md`; `cli/CommandTable.ts`, `cli/HelpText.ts`;
  `cli/FrozenInstalledSurface.json`; `INSTALL_VERSION` and the `InstallChangeWatch` recording; a minor of
  `FORGE_SYSTEM_VERSIONS` for the new command.

### Step 2. One job, one entity

- `@types/Job.ts`: `entity?`, `stage?`. The Bouncer's list of fields only the Overseer decides gains both.
- Constitution: `InstructionFiles.readingFor` and the main-line read resolve from the job's entity.
  `ConstitutionCommits.ts` refuses a commit of more than one path today and `Airlocks.ts` names the one fixed path;
  both take a list, and the rule under "Tickets" in `CLAUDE.md` changes with them.
- Gates: `GateRun`, the manifest in `JobLaunch.ts` and the merged-tree gates in `DrivePass.ts` take the entity's
  pipeline. The landing's gate set (changed entities, their dependents, every entity for a root change) belongs
  here. Gate stamps and the row's `pipelineHash` are per entity. A gate's `in` resolves from the entity's first
  home folder; a leading `/` is the repository root.
- Sandbox and edits: `WorkerProfiles` takes the toolchain from the job's entity and lists `.claude` in every entity
  home. `ClaudeCodeAdapter`'s Edit and Write rules list the stage's folders. Sessions start at the worktree's root.
- Customs: the scope check takes a list of writable folders; V5 and V13 take every entity home. The scope check
  joins `RESUMABLE_CUSTOMS_CHECKS` in `JobLaunch.ts`.
- `JobResumption.ts` and `LaunchSettings.ts`: a job resumes only a session of its own entity and stage.
- Counters in `Playbook.ts` and `FailedPassUtil`: per stage and entity.

### Step 3. Needs, and switching entities on

After this step a top-level forge runs with strict isolation: every change in another entity is that entity's own
ticket. A non-empty `whitelist` is still refused.

- A Hatch verb for a build stage's agent, `need --entity <key>`: `ControlCommand.ts`, `HatchFormatUtil.ts`, and the
  Bouncer, whose worker filing today demands priority `low` and an empty `dependsOn`.
- Job outcome `needs-declared` in `ReportSchemas.ts`, `Job.ts` and `JobStates.ts`.
- The Playbook launches nothing for a ticket with an unsettled dependency, whatever its status; the need's ticket
  takes the highest waiting priority.
- Decisions for E12 to E15 in `DecisionAndIncidentVocabulary.ts`; log records in `LogRecordSchema.ts` and
  `LogUtil`'s frozen table.
- Switch on: the reader accepts a pipeline with entities. Amend "Trackers in a repository" in `CLAUDE.md` and the
  docblock of `OverseerBuildJob.spec.ts`: the frozen replay holds for a root tracker without entities.
- A fixture repository of two apps and a shared package under one root tracker, recorded like `TwoTrackerFixture`.

### Step 4. Stages

- Row fields `stage`, `seals`, `packageReturns` and the per-stage counters: `@types/Task.ts`, the progress file's
  ingestion and writer, written only once set. A stage move table beside the ticket's legality table.
- `Playbook.ts`: the next launch comes from the stage; E71's order.
- `ReviewBars.ts`: a bar carries its stage's entity; rounds per stage.
- Customs: the stage's scope and the sealed change, both resumable; the Airlock exempt.
- `JobLaunch.ts`, `DrivePass.ts`: launch stage jobs; compute the crossing after stage 1; hash the ticket's own
  change for the seal and for skipping `adapt`.
- `Airlocks.ts` and `MergeRun.ts`: conflicts and red gates routed by owner; the two-worker merge of E64; the group
  rule of E68.
- The ticket file: `## Handoff` in parts per stage; Acceptance evidence owned by the last home build stage.
- Prompts in `resources/prompts/`: `PackageBuildPrompt.md`, `AdaptMessage.md`; `ReviewPrompt.md` gains its scope
  line. New text in ASD-STE100.
- Outcome `refused`; decisions `package-refused`, `second-return`, `dependent-broken`; log records for a stage
  started, a seal set, a seal lifted and a return.
- Specs: each case of 5.2 to 5.8 as a named claim on the fixture.

### Step 5. Setup and the pipeline builder's data

- `PipelineSetupVocabulary.ts`: the step `entities` after `research`; the finding topic `layout`.
- The setup record keeps its format version 1: `PipelineSetupFile` accepts only that version, so raising it would
  make every open record on every forge unreadable. Entities come as optional keys, written once set.
- Research per entity after the layout is confirmed; one pipeline-agent session per entity for research,
  constitution and design, its entity stamped by the Overseer as `setupId` is today.
- `PipelineDraftField` gains an entity scope and the fields of an entity's definition; `PipelineSetups.ts`,
  `SetupPayloadSchemas.ts`, `PipelineFactsAssembly.ts`.
- Gate profiles and the pipeline check keyed by entity.
- Apply: every changed constitution in one commit job; refusals for E91 and E94; the list of pending tickets
  without an entity.
- The Bridge's side is [the pipeline builder's monorepo mode](pipeline-builder-monorepo-mode.md).

### Step 6. Intake, board, monitor

- `skills/agent-po/SKILL.md`: route by entity, then split by mechanism; the product owner's prompt receives the
  entity map. The skill names `--entity`, so `INSTALL_VERSION` rises.
- Filing refuses E85.
- Bridge: entity filter and swimlanes on the Kanban, the stages of a crossing ticket, a per-entity pipeline view.
- `packages/forge-contracts`: entities and stages in the monitor snapshot as added keys. Gaia adopts that version.
- `concurrency` per entity; a higher default limit for a top-level forge.

## 7. What may not change

- A forge without `entities`: no new git call, no new stored key, the same pipeline file version, the same landing.
- A folder forge: only step 0.
- Stored tickets and setup records are never rewritten. New keys are written once set.
- One landing per ticket, through the Airlock, as today.

## 8. The sandbox failures of a folder forge

Reported for forge's `ticket-014` and Gaia's `ticket-001`. They do not depend on entities.

| Failure | Known | Next |
| --- | --- | --- |
| The agent cannot commit | Forge grants no git path; it relies on Claude Code's sandbox letting a linked worktree write the shared `.git`, which the vendor documents, `hooks/` and `config` excepted. A folder forge's session starts in the project folder inside the worktree, not at the worktree's root. | Probe: start a folder-forge session at the worktree's root and commit. Only if that fails, grant the worktree's admin folder, the exact ref and its lock; an object-store grant also allows deleting objects. |
| No local port | `sandbox.network.allowLocalBinding` is set nowhere and was never probed. It works on macOS only. | Set it on macOS after checking what an agent can then reach on localhost. |
| `.git/hooks` refused | By the vendor's design. Forge points agents at the tracked hooks folder through the environment. | No grant. Keep the script that writes there out of agent sessions. |
| `ps` refused | A sandbox profile cannot start a setuid program. The suites were moved to `pgrep`. | Check whether the failing run is older than that fix. |

A top-level forge starts its sessions at the worktree's root, where a root tracker commits today, so it does not
depend on the outcome of the commit probe.

## 9. Open decisions

- Whether "the proposal landed as written" compares the package's change byte for byte (assumed here) or only what
  the package exposes.
- Whether stage 4 resumes the stage 1 session when it exists (assumed here) or always starts fresh.
- The board's default concurrency for a top-level forge. A low-priority crossing ticket can wait long behind
  higher ones while its branch ages.
- Whether this repository moves from two folder forges to one top-level forge.

## Sources

- `docs/monorepo/design.md`, `docs/monorepo/migration.md` (repository root): the first iteration.
- `docs/cli.md`: trackers, `pipeline setup`, a build job, a review job, the Hatch, findings, ready tickets, holds.
- `src/services/lifecycle/Customs.ts`, `MergeRun.ts`, `Landing.ts`, `GateRun.ts`.
- `src/services/overseer/JobLaunch.ts`, `DrivePass.ts`, `InstructionFiles.ts`, `ConstitutionCommits.ts`,
  `WorkerProfiles.ts`, `SessionPlace.ts`, `Airlocks.ts`, `JobResumption.ts`, `Bouncer.ts`,
  `PipelineAgentSessions.ts`.
- `src/lib/claude-code/ClaudeCodeAdapter.ts`.
- `src/lib/tracker-model/@types/Pipeline.ts`, `Ticket.ts`, `Job.ts`; `Playbook.ts`, `ReviewBars.ts`;
  `constants/PipelineSetupVocabulary.ts`, `constants/PipelineDefaults.ts`, `constants/ConcurrencyLimits.ts`.
- `src/adapters/pipeline/PipelineFile.ts`, `PipelineSetupFile.ts`.
- `resources/prompts/ReviewPrompt.md`, `RedHandoffMessage.md`, `ResumeMessage.md`; `skills/agent-po/SKILL.md`.
- `bridge/views/pipeline/`: the pipeline builder as built.
- Claude Code documentation: [hooks](https://code.claude.com/docs/en/hooks.md),
  [sandboxing](https://code.claude.com/docs/en/sandboxing.md), [memory](https://code.claude.com/docs/en/memory.md).
