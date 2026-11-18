# Moving this repository to one top-level forge

> **Question:** What does this repository look like as one forge at the root with entities, and what does the owner do to get
> there from today's two folder forges?  
> **Time:** 15 minutes.  
> **Read first:** [the entities strategy](research/monorepo-entities/strategy.md), and "The two trackers" in the root `CLAUDE.md`.  
> **For:** the owner's review (step U7.1 of the entities work), before the rehearsal on a copy (U7.2) and the move itself (U7.3).

Plan of 18 November 2026, built on branch `entities/integration`. Nothing here has moved yet. The board facts below were read from
the two live trackers on that date without running a forge command; `progress.json` was last written on 16 November.

## 1. Summary

- Today two folder forges run here: forge's at `apps/forge` (branch namespace `forge`) and Gaia's at `apps/gaia` (namespace `gaia`).
  Each reaches the shared packages through its `reach` list.
- After the move, one forge sits at the repository root, with no namespace. Its pipeline names eight entities: the apps `forge` and
  `gaia`, a package entity for each of the five folders in `packages/`, and `root`.
- Today's reach into packages becomes a **whitelist**: forge's tickets may cross into all five packages, Gaia's into
  `design-system` and `system-versions`, as today. A crossing now runs in stages under the package's own review.
- The workspace dependencies decide whose gates run: a change to a package gates every app that depends on it.
- Folder forges cannot be converted (strategy E96). The two trackers are retired and a new one is set up at the root. Ticket
  history is not carried over. Each open ticket is finished first or filed again under its entity.
- The proposed `pipeline.json` is at `.claude/.evidence/monorepo-entities/proposed-pipeline.json` in the main checkout. This
  branch's pipeline reader reads it with no refusal (section 7).

## 2. Today

| | forge's tracker | Gaia's tracker |
| --- | --- | --- |
| Home | `apps/forge/` | `apps/gaia/` |
| Branch namespace | `forge` | `gaia` |
| Pipeline file version | 3 | 3 |
| Reach | `/packages/design-system`, `/packages/flint`, `/packages/forge-contracts`, `/packages/brand`, `/packages/system-versions`, `/package.json`, `/bun.lock`, `/turbo.json` | `/packages/design-system`, `/packages/system-versions`, `/package.json`, `/bun.lock`, `/turbo.json` |
| Prepare | `install`: `bun install --frozen-lockfile`, in `/` | the same |
| Gates | `verify`: `bun run gate:forge`, in `/`; `cache-audit`: `bun run cache:audit`, Overseer only, merge phase | `verify`: `bun run gate:gaia`; `cache-audit` the same |
| Phases | build `verify`; review `verify`; merge `verify`, `cache-audit` | the same |
| Review | on, re-review above 750 lines | off (no `review` key) |
| Reviewer agents | reviewer opus, high; re-reviewer opus, medium; each reads the constitution and the reviewer brief | defaults |
| Merge train | re-review above 750 lines | not set |
| Ticket approval | off | on (the default) |
| Constitution | the installed default (no `constitution` key) | the installed default |
| Board limit | 4 jobs | 2 jobs |
| Overseer | `running` in `progress.json` | `running`; decision E1 parked (section 8) |

Both `verify` gates also declare `definedBy` `/turbo.json`, `/package.json`, `/bun.lock` and write the one turbo cache,
`/Users/alexdemulder/development/forge/.turbo/cache`.

## 3. The entities

| Key | Kind | Home | Why |
| --- | --- | --- | --- |
| `forge` | app | `/apps/forge` | Today's forge tracker home. |
| `gaia` | app | `/apps/gaia` | Today's Gaia tracker home. |
| `brand` | package | `/packages/brand` | Forge's mark, used by both apps. |
| `design-system` | package | `/packages/design-system` | The shared React components; the one package with a constitution. |
| `flint` | package | `/packages/flint` | The worker sprite; forge's only. |
| `forge-contracts` | package | `/packages/forge-contracts` | What a forge serves and reads; Gaia builds against it. |
| `system-versions` | package | `/packages/system-versions` | The version model both apps share. |
| `root` | root | `/` | Every path no other entity owns: the workspace manifest, `bun.lock`, `turbo.json`, `scripts/`, `docs/`, `.githooks/`, `.claude/`, this repository's `README.md` and `CLAUDE.md`. |

Every package is its own entity, as the task asked, and each has a review. A package that an app whitelists must have one; the
reader refuses the pipeline otherwise. No package is private to one app in a way that would make it a further home of that app:
`flint` and `brand` are forge's by rule, but Gaia depends on `brand`, and `flint` stands alone by its own README.

Each entity carries a two-line `summary` that intake routes tickets by. They are drafts from each folder's README; the research step
of the pipeline builder may rewrite them.

The root entity has no gates and no constitution. The pipeline builder calls this "Kept for a person". It matches the rule in the
root `CLAUDE.md` today: `scripts/`, `docs/monorepo/`, the root `CLAUDE.md` and `.claude/` are a person's to change.

## 4. Whitelists, reach and dependencies

**Whitelists come from today's reach lists.** Each package path in a tracker's reach becomes that package's key:

| Entity | Whitelist |
| --- | --- |
| `forge` | `design-system`, `flint`, `forge-contracts`, `brand`, `system-versions` |
| `gaia` | `design-system`, `system-versions` |
| each package, `root` | none |

**Reach shrinks to root files.** An entity's `reach` may name only paths the root entity owns (owner's answer A13). The validator
refuses a reach path inside another entity's home (`reach-inside-another-home`), so the package folders leave `reach`, and the
whitelist covers them. Every app and package keeps `/package.json`, `/bun.lock` and `/turbo.json`, which today's package work
could also change. A change to one of those files is a change of the root entity, and every entity depends on the root, so such a
landing runs every entity's gates.

**Dependencies come from the `workspace:^` declarations** in each `package.json`:

| Entity | `dependsOn` | Declared in |
| --- | --- | --- |
| `forge` | `brand`, `design-system`, `flint`, `forge-contracts`, `system-versions` | `apps/forge/package.json` |
| `gaia` | `brand`, `design-system`, `forge-contracts`, `system-versions` | `apps/gaia/package.json` |
| `forge-contracts` | `system-versions` | `packages/forge-contracts/package.json` |
| `brand`, `design-system`, `flint`, `system-versions` | none | |

Gaia depends on `brand` and `forge-contracts` but does not whitelist them. This keeps today's rule: those packages are forge's, and
Gaia only consumes them. A Gaia ticket that needs a change there declares a need, and forge files a ticket for that package.

What the dependencies decide at landing, checked against the proposed file:

| A landing changes | Gates that run |
| --- | --- |
| only `apps/forge` | `forge` |
| `packages/design-system` | `design-system`, `forge`, `gaia` |
| `packages/system-versions` | `system-versions`, `forge`, `gaia`, `forge-contracts` |
| `bun.lock`, or any other root path | every entity's |

## 5. Gates

Each entity keeps today's prepare step and gate pair. Every line runs at the repository root (`in: /`). Without that, a step would
run in the entity's first home folder.

| Entity | `verify` runs | Phases |
| --- | --- | --- |
| `forge` | `bun run gate:forge` | build `verify`; review `verify`; merge `verify`, `cache-audit` |
| `gaia` | `bun run gate:gaia` | the same |
| each package | `TURBO_TELEMETRY_DISABLED=1 BUN_RUNTIME_VERSION=$(bun --version) bun scripts/TurboGate.ts <package>` | the same |
| `root` | no gates | none |

- `gate:<app>` is `scripts/TurboGate.ts <app>` with the two environment settings in front. It runs every workspace's `typecheck`,
  `lint`, `test` and `test:dom` through turbo, then the `check` of that one workspace. The root `package.json` has no
  `gate:<package>` script, so a package's line calls the same script with the package's name and the same environment settings.
  `BUN_RUNTIME_VERSION` is part of turbo's cache key, so a line without it would never replay the cache. No package has a `check`
  script. Turbo then runs no task for it (checked with a dry run), so a package gate is the whole-workspace part of the app gates.
- `cache-audit` (`bun run cache:audit`, Overseer only, merge phase) is in every gated entity's merge phase, because each entity's
  merge phase runs only its own gates. A landing that gates several entities therefore runs the audit once for each of them.
- Every gate keeps `definedBy` `/turbo.json`, `/package.json`, `/bun.lock` and `writes` the main checkout's turbo cache folder.

## 6. Constitutions and forge-level settings

**Constitutions that exist:** only `packages/design-system/CONSTITUTION.md`. The `design-system` entity names it
(`constitution.path` is `packages/design-system/CONSTITUTION.md`, relative, with no leading `/`; the reader refuses a leading `/`).
Every other entity uses the installed default constitution, as both trackers do today. The apps' rules stay in
`apps/forge/CLAUDE.md` and `apps/gaia/CLAUDE.md`, which Claude Code reads for every session. A change here: today forge's agents
change `design-system` under the default constitution. After the move, the package stages of a crossing run under the package's own
constitution and reviewer.

**Forge-level settings** sit once at the top of the file:

| Setting | Proposed | From |
| --- | --- | --- |
| Merge train | re-review above 750 lines | forge's (Gaia had none) |
| Ticket approval | off | forge's (Gaia's was on) |
| Product owner, pipeline agent, assistant | defaults (opus) | neither tracker set them |
| Billing | not set (subscription) | neither tracker set it |

**Per-entity agents:** `forge` and every package get forge's reviewer and re-reviewer settings, since forge's tracker reviews all
package work today. `gaia` keeps the defaults and no review, as today.

**Concurrency.** No entity cap is proposed. The board's limit is a board setting, not part of the pipeline. A new tracker starts at
2 jobs; today the two boards together allow 6.

## 7. The proposed pipeline and its check

The file is at `/Users/alexdemulder/development/forge/.claude/.evidence/monorepo-entities/proposed-pipeline.json` (ignored by git).
It was written through this branch's `PipelineFile.contentsOf`, so it is in the exact form an Apply stores. Version 4, empty top-level
`prepare`, `gates` and `phases`, the settings of section 6, and the eight entities.

The check read a scratch copy through `PipelineFile.read` with a small Bun script outside the repository. It ran no spec and no
forge command:

- verdict `readable`, no refusal; `EntityValidationUtil.refusalsOf` returns none;
- `PipelineUtil.formatVersionOf` gives 4;
- written back through `contentsOf`, the text is byte-identical;
- `pipelineOfEntity` gives each entity its gates as in section 5, review on for `forge` and the packages, off for `gaia` and `root`;
- ownership: `/apps/forge/...` is `forge`'s, `/packages/design-system/...` is `design-system`'s, and `/bun.lock` and
  `/scripts/...` are `root`'s; the landing gate sets are those of section 4.

For the rehearsal (U7.2), the cache folder in `writes` must name the scratch clone's `.turbo/cache`, not the main checkout's.

## 8. Open tickets and how each is carried

No board has a delivered ticket; every ticket below is open. Statuses are from `progress.json`, and the ticket files agree. Each
in-progress ticket's branch has no commit past `main`. Its work is uncommitted in its worktree, because the folder forges' sandbox
refuses an agent's commit (strategy §8). Gaia's E1 asks the owner about exactly that.

**forge's board** (`apps/forge/.forge`)

| Id | Title | Status | Depends on | Uncommitted work | Entity | Carried by |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Delete the dead Board.claimTickets and its claim refusals | in progress | | 27 files, +71 −734 | `forge` | finish first |
| 002 | Remove the ticket rereview --start-review flag | pending | 001 | | `forge` | re-file |
| 003 | Remove the fixed waiting-on gap from the known gaps | pending | 002 | | `forge` | re-file |
| 004 | Refuse pictures for an agent adapter that takes none | pending | 001 | | `forge` | re-file |
| 005 | Resume a job transcript stream after a whole log line, never inside one | in progress | | 5 files, +117 −22 | `forge` | finish first |
| 006 | Read each session job's Watcher log once per board state | pending | | | `forge` | re-file |
| 007 | Render the Kanban card stamp through the design-system Stamp part | pending | | | `forge` | re-file |
| 008 | Keep the Bridge up when the URL hash has a malformed escape | in progress | | none | `forge` | re-file |
| 009 | Claim the Airlock for a green queued ticket before the sweep regates stale ones | in progress | | 2 files, +40 −8 | `forge` | finish first |
| 010 | Act on a tracker write that lands while a DrivePass runs | pending | | | `forge` | re-file |
| 011 | Run merged-tree gates outside the DrivePass so one long gate blocks nothing else | pending | 009, 010 | | `forge` | re-file |
| 012 | Refuse login-item-not-changed when the login item file cannot be written or removed | pending | | | `forge` | re-file |
| 013 | Let a stop end an Overseer that is still finishing its start | pending | | | `forge` | re-file |
| 014 | Turn off Storybook telemetry in the design-system package's build | in progress | | 1 file, +1 | `design-system` | finish first |

**Gaia's board** (`apps/gaia/.forge`)

| Id | Title | Status | Depends on | Uncommitted work | Entity | Carried by |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Word Gaia's leak check for Gaia's own folder | in progress, parked (E1) | | 2 files, +7 −4 | `gaia` | finish first |

**Finish first** applies to an in-progress ticket with work in its worktree. The folder sandbox still refuses the agent's commit,
so finishing means: the owner reviews the worktree's diff, commits it on the ticket branch, lands it on `main`, and records it with
`ticket deliver --by-hand`. If a ticket is not worth finishing by hand, it is re-filed instead, and its worktree diff is lost unless
the owner saves it.

**Re-file** applies to every other ticket. After the new pipeline is applied, the ticket is filed again on the new board with its
entity, with its Brief and Acceptance copied over. This keeps no history and gives a new id:

- **Paths in the Brief change.** Today's Briefs name paths from the tracker's home (`src/lib/...`, `bridge/...`). The new board
  reads a path on the `Work belongs in:` line from the repository root. So `src/lib/...` would be a root path, and filing would
  refuse it (`work-outside-entity`). Write `apps/forge/src/lib/...`. Ticket 010 also names `.readme-graphics/bridge-demo.sh`, which
  is `apps/forge/.readme-graphics/bridge-demo.sh`.
- **Dependencies change to the new ids.** 002 and 004 depend on 001, and 003 on 002. When 001 lands first, 002 and 004 need no
  dependency. 011 depends on 009 (landed first) and on 010's new id.
- **Ticket 008** has no work in its worktree, so it is re-filed like a pending ticket.
- **Ticket 007** changes only forge files (`bridge/views/kanban/`); it uses the design-system's Stamp part without changing it, so it
  needs no `crosses`.
- **Ticket 014**, if re-filed instead of finished, is a `design-system` ticket. The new board puts its build under the package's
  constitution.

## 9. The owner's steps (U7.3)

Only the owner does these, after the rehearsal (U7.2) reached landing for every entity and one crossing. The order matters:

1. **Install a forge that reads entities.** The installed forge runs from the second clone. It must be on a release that holds this
   branch's work (pipeline file version 4), merged to `main` and pulled into that clone. An older forge refuses the new pipeline by
   its version (E95).
2. **Stop new work.** Pause both boards so that no new job starts, and file no new tickets on either.
3. **Finish the "finish first" tickets** of section 8 and land each. Keep a copy of every ticket file to re-file (both `tickets/`
   folders) outside the trackers.
4. **Stop both Overseers**, and remove each board's login item if one is set.
5. **Clear both trackers.** `clear` is refused while a job other than the Assistant is live. It keeps the tracker and its entry in the
   repository's tracker list.
6. **Retire the two folder trackers.** `init` at the root is refused while `<git common dir>/forge/trackers.json` lists a tracker
   below the root (`tracker-below`). Clearing does not remove that entry, and no verb does. So the owner:
   - removes the two entries (`apps/forge`, namespace `forge`; `apps/gaia`, namespace `gaia`) from
     `/Users/alexdemulder/development/forge/.git/forge/trackers.json`;
   - moves `apps/forge/.forge` and `apps/gaia/.forge` out of the repository as an archive. Otherwise a command run inside an app
     folder still finds the old tracker first, and the archive keeps the log and the tickets;
   - removes the ticket worktrees under `apps/forge/.forge-worktrees/` and `apps/gaia/.forge-worktrees/` and the branches
     `forge/forge/ticket-*` and `forge/gaia/ticket-*` once their work is landed or saved;
   - removes each app's installed hook and skills (`apps/forge/.claude/settings.local.json`, `apps/gaia/.claude/settings.local.json`,
     and the `skills/` folders there), which the root `init` installs again at the root.
7. **`init` at the root**, with no `--root` and no `--namespace`.
8. **Set up the pipeline** with the pipeline builder in monorepo mode. Research, then the entities step: accept the entities of
   section 3. Then constitution and design per entity, toward the proposed file. Then Apply. Then set the board's limit (section 10).
9. **Re-file the tickets** of section 8 under their entities, and start the Overseer.

## 10. Proposed change to the root `CLAUDE.md`

The owner edits the root `CLAUDE.md`. This is the proposed diff of "The two trackers" and the package line above it:

```diff
@@ -14,24 +14,28 @@

 - `packages/design-system` is reached by both apps: whichever app's change it is, its `CONSTITUTION.md`, the one constitution of a
   package here, and `.claude/rules/design-system.md`.
-- `packages/flint`, `packages/forge-contracts` and `packages/brand` are forge's (`.claude/rules/flint.md` for Flint). Nothing in a
-  package forge depends on names Gaia.
+- `packages/flint`, `packages/forge-contracts` and `packages/brand` are forge's: only forge's tickets cross into them
+  (`.claude/rules/flint.md` for Flint). Nothing in a package forge depends on names Gaia.
 - `packages/system-versions` is both apps'; it names no server.

-## The two trackers
+## The tracker

-From the landing on, each app has its own forge tracker in its own folder, and no tracker sits at the repository root:
+From the move on, one forge tracker sits at the repository root, with no branch namespace, and its pipeline names an entity for
+each app and each package:

-| Tracker | Home | Branch namespace | Reach beyond its home |
-| --- | --- | --- | --- |
-| forge's | `apps/forge/` | `forge` | every package forge depends on (`/packages/design-system`, `/packages/flint`, `/packages/forge-contracts`, `/packages/brand`, `/packages/system-versions`), `/package.json`, `/bun.lock`, `/turbo.json` |
-| Gaia's | `apps/gaia/` | `gaia` | `/packages/design-system`, `/packages/system-versions`, `/package.json`, `/bun.lock`, `/turbo.json` |
+| Entity | Kind | Home | Crosses into (whitelist) | Reach beyond its home |
+| --- | --- | --- | --- | --- |
+| `forge` | app | `apps/forge/` | `design-system`, `flint`, `forge-contracts`, `brand`, `system-versions` | `/package.json`, `/bun.lock`, `/turbo.json` |
+| `gaia` | app | `apps/gaia/` | `design-system`, `system-versions` | `/package.json`, `/bun.lock`, `/turbo.json` |
+| `brand`, `design-system`, `flint`, `forge-contracts`, `system-versions` | package, each with a review | `packages/<name>/` | none | `/package.json`, `/bun.lock`, `/turbo.json` |
+| `root` | root | every path no other entity owns | none | none |

-- A tracker's agents change only its home and its reach; Customs refuses the rest. `scripts/`, `docs/monorepo/`, this file and
-  `.claude/` are in neither tracker's reach: a person changes them.
-- Each tracker's gate runs at the repository root (`--in /`) through `bun run gate:<app>`, and an Overseer-only merge gate runs
-  `bun run cache:audit`; `docs/monorepo/design.md` holds the exact gate lines. So a ticket of one app cannot turn the other red through
-  a shared package, and turbo replays what the ticket did not touch.
+- A ticket belongs to one entity. Its jobs change only that entity's home and reach; a change to a whitelisted package is made in
+  stages under that package's constitution and reviewer, and any other entity's change is a ticket of that entity. Customs refuses
+  the rest. The root entity has no gates: `scripts/`, `docs/monorepo/`, this file and `.claude/` stay a person's.
+- Each entity's gate runs at the repository root: `bun run gate:<app>` for an app, `scripts/TurboGate.ts` with the package's name for
+  a package, and an Overseer-only merge gate runs `bun run cache:audit`. A landing runs the gates of every entity it changes and of
+  every entity that depends on one, so a change to a shared package gates both apps, and turbo replays what the ticket did not touch.
 - The installed forge runs from a second clone outside this repository, updated by pulling; nobody runs this checkout's forge.

 ## Rules for the whole repository
```

Other text that the move makes out of date, for the owner or a later ticket:

- `docs/monorepo/design.md` (owner only): decision 6 and the gate lines describe two trackers.
- `apps/gaia/CLAUDE.md`: rule 1 ("the packages Gaia's tracker reaches"), the gate paragraph, and the sentence that Gaia's tracker
  lives in `apps/gaia/.forge`.
- The root `README.md`: the `gate:forge`, `gate:gaia` row and the link text "the two trackers".

## 11. Decisions for the owner

1. **Gaia's review.** Today Gaia has none, and the proposal keeps that. Gaia whitelists two packages, and stage 5 of a crossing is
   the app's own review, so turning Gaia's review on is recommended.
2. **Ticket approval.** Off as forge has it, or on as Gaia has it. It is one setting for the whole forge.
3. **Package gate lines.** Keep the direct `scripts/TurboGate.ts <package>` line, or add `gate:<package>` scripts to the root
   `package.json` so that every gate reads `bun run gate:<name>`.
4. **The board's limit and entity caps.** The two boards allow 6 jobs together today; a new tracker starts at 2. One option keeps
   today's split: a board limit of 6, a cap of 4 on `forge` and 2 on `gaia`.
5. **The cache audit per entity.** It runs once for each gated entity of a landing. Keep that, or drop it from the package entities
   and accept that a package-only landing is not audited.
6. **Constitutions for the apps.** Keep the installed default, as today, or let the constitution step draft
   `apps/forge/CONSTITUTION.md` and `apps/gaia/CONSTITUTION.md`.
7. **Finish or re-file** each in-progress ticket of section 8. Each one to be finished needs the owner's commit by hand.
