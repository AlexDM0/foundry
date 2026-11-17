# Orchestrator plan: Hephaestus, Talos and Gaia

This is the one plan an orchestrating session carries out. It holds the whole schedule: all 103 work packages in the
order they run, which of them run side by side, where the owner has to act, and how one package is handed to an agent,
checked and landed. The detail of a package lives in its stage file in this folder; the orchestrator never needs to
hold a stage file in its own context, only this plan and the status file.

Instruction for the orchestrating session:

> Carry out `docs/monorepo/hephaestus-talos-implementation/orchestrator.md` from where `status.md` in that folder
> says it stands.

## What the orchestrator does and does not do

- It schedules, hands out, checks and lands. It writes no product code itself.
- It reads this plan, `status.md`, and the results its agents return. It reads a stage file only to settle a
  disagreement between agents.
- It stops at every owner gate below and at every stop condition, and says plainly what it needs.
- It never pushes, never touches `~/.forge-monitor` or `~/.gaia`, never runs a forge verb in this checkout, never
  talks to a running forge and never starts a vendor session. Its agents are bound by the same rules.

## Branch and worktrees

- All work lands on one integration branch, `hephaestus-talos`, cut from `main` when the run starts. Where a stage
  file says "main", it means this branch. Nothing is pushed and nothing is merged into `main` without the owner's
  word.
- Every package runs in its own worktree under `.claude/worktrees/<package>` (for example
  `.claude/worktrees/wp2-07`), cut from the tip of the integration branch after the packages it depends on have
  landed. Stage 9 is the exception: its five packages share one worktree and become one commit.
- A package lands as exactly one commit with one plain subject line, no attribution of any kind, hooks never skipped.
  Packages that ran side by side land one after the other: the second rebases on the first and runs its "Done when"
  again before it lands.
- A worktree is removed once its package has landed.

## How one work package runs

For each package the orchestrator runs three agents in turn. Every agent is Opus; no other model is used. Effort is
medium, and high for a package that sets a protocol, a record format, recovery behaviour or the store's semantics, and
for every checker.

1. **Builder.** Brief: "Carry out work package `<WP>` of
   `docs/monorepo/hephaestus-talos-implementation/<stage file>` in the worktree `<path>`. Read
   `docs/monorepo/hephaestus-talos.md` and, in the stage file, the sections Goal, Depends on, Interfaces introduced,
   Traps and your own package in full. Do exactly that package and nothing of another. Finish on the package's 'Done
   when' commands and report their output. Commit once, with one plain subject line. If a step cannot be done as
   written, stop and report what blocks it; do not improvise around it."
2. **Checker.** A second agent that did not build it. Brief: "Check work package `<WP>` in `<path>` against its text
   in `<stage file>`. Run its 'Done when' commands yourself, and at the repository root
   `bun install --frozen-lockfile` and `bun run verify`. Read the diff: is everything the package names done, is
   anything done that it does not name, does a new name break `apps/forge/src/ComponentNames.spec.ts`, does any
   interface differ from 'Interfaces introduced'? Try to show that it is not done. Report pass or fail with the
   evidence."
3. **Fixer,** only on a fail: the builder's brief plus the checker's findings. Then the checker again. Two failed
   rounds on one package are a stop condition.

The orchestrator lands the package only after a pass, then writes the line for it in `status.md`.

## The status file

`docs/monorepo/hephaestus-talos-implementation/status.md` is the run's memory. The orchestrator creates it at the
start and changes it after every package and at every gate, in the same commit as nothing else. One line per package:

```
| WP2.7 | landed | <commit> | <one clause: anything the next package must know> |
```

The states are `waiting`, `running`, `landed`, `blocked` and `owner`. A session that starts fresh reads this file,
finds the first group that has not fully landed, and continues there. Where an agent found the code to differ from a
stage file, the orchestrator records it here and, if a later package depends on it, corrects that stage file in a
commit of its own before the package runs.

## Stop conditions

The orchestrator stops and reports, and does not work around, any of these:

- an owner gate below is reached;
- a package fails its check twice;
- the root's `bun run verify` is red on the integration branch after a landing;
- a builder reports that a step cannot be done as written, or that the code contradicts the stage file in a way that
  changes an interface;
- a package would need a decision listed under "Needs the owner" that has no answer and no accepted default;
- an agent would have to touch the real home, run a forge verb here or start a vendor session to finish.

## Owner gates

| Gate | When | What the owner does |
| --- | --- | --- |
| G0 | Before anything runs | Says go, and names the integration branch if it is not `hephaestus-talos` |
| G1 | During stage 0 | Records a session that ends on a network outage (WP0.3; the stage file gives the steps) |
| G2 | Before WP0.5 | Answers the owner decisions: fills in `owner-decisions.html` and hands over its JSON |
| G3 | WP1.2 | Settles the open branches and uncommitted edits, and stops both live trackers and their login items |
| G4 | End of WP2.13 | Asks for `bun run verify:integration`, which forge's rules allow only on a person's word |
| G5 | Before WP6.4 | Approves the changes to the rule files a person owns (`.claude/rules/*`, the root `CLAUDE.md`) |
| G6 | Before stage 9, and after it | Stops every forge and removes the login items before; pulls, sets up and sets the boards up anew after |
| G7 | End of the run | Decides whether and how the integration branch reaches `main` |

Two parts of the design have no work package: closing the agent port's leaks (design section 5) and ending the
hand-editing of stored records (design section 4). The orchestrator does not start them; the owner places them.

## The schedule

Groups run in the order given. Packages on one line of a group run side by side; a group marked "alone" runs one
package at a time. A group starts only when every package of the group before it has landed, unless a note says
otherwise. Each stage ends with its stage file's "Verification of the whole stage", run by a checker.

### Stages 0 and 1: `stage-0-1-trace-and-base.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 0-A | WP0.1, WP0.2 | Side by side. The owner does WP0.3 meanwhile (gate G1) |
| 0-B | WP0.4 | After WP0.3 |
| 0-C | WP0.5 | After WP0.1 and gate G2 |
| 0-D | WP1.1 | After WP0.5; may run beside WP0.4 |
| 0-E | WP1.2 | Alone. Gate G3: the owner acts, the agent only prepares and records |
| 0-F | Refresh the plan | Only when a branch landed on `main` in WP1.2, `entities/integration` above all. See below |
| 0-G | WP1.3 | Alone, last: the stage's gate |

**Refreshing the plan after a branch landed.** The stage files were written against `main` at `3e6cb660`. A branch that
lands after that makes their statements about the code stale: `entities/integration` alone changes 399 files, the
Playbook and the job's fields among them, and raises forge from 1.9 to 1.11. So when WP1.2 landed a branch, the
integration branch is cut from the new `main`, and before stage 2 starts the orchestrator runs one agent per stage
file, side by side, each with this brief: "The repository changed since
`docs/monorepo/hephaestus-talos-implementation/<stage file>` was written; `git diff 3e6cb660..main --stat` shows where.
Recheck every row of 'Today's code', every path and line a work package names, and every entry of 'Interfaces
introduced' against the code as it is now. Correct the file where the code moved; where a change of the branch makes a
work package wrong, larger or unneeded, rewrite that package and say so in your report. Change nothing but that stage
file." A checker then reads the seven reports for packages whose order or interfaces changed and corrects this
schedule to match. WP0.2's baseline of the recovery specs is run again on the new `main`.

### Stage 2: `stage-2-talos.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 2-A | WP2.1, WP2.2, WP2.3 | Side by side |
| 2-B | WP2.4 | Alone |
| 2-C | WP2.5, WP2.6, WP2.11 | Side by side |
| 2-D | WP2.7 | Alone |
| 2-E | WP2.8 | Alone |
| 2-F | WP2.9, WP2.10 | Side by side |
| 2-G | WP2.12 | Alone |
| 2-H | WP2.13 | Alone. A long session that cannot be split. Ends at gate G4 |
| 2-I | WP2.14 | Alone |
| 2-J | WP2.15 | Alone |
| 2-K | WP2.16 | Alone |
| 2-L | WP2.17 | Alone |
| 2-M | WP2.18 | Alone, last: recordings and the end-to-end check on a scratch forge |

### Stage 3: `stage-3-presence-recovery.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 3-A | WP3.1, WP3.4, WP3.5 | Side by side |
| 3-B | WP3.2, WP3.6 | Side by side |
| 3-C | WP3.3, WP3.7 | Side by side |
| 3-D | WP3.8 | Alone |
| 3-E | WP3.9 | Alone |
| 3-F | WP3.10 | Alone |
| 3-G | WP3.11, WP3.13 | Side by side |
| 3-H | WP3.12 | Alone |
| 3-I | WP3.14 | Alone, last: the crash matrix |

### Stage 4: `stage-4-packages.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 4-A | WP4.1 | Alone |
| 4-B | WP4.2 | Alone. A long session that cannot be split: the model moves with its 438 importers in one commit |
| 4-C | WP4.3 | Alone |
| 4-D | WP4.4 | Alone |
| 4-E | WP4.5, WP4.6, WP4.7 | Side by side. WP4.5 and WP4.6 both append to `packages/forge-contracts`; the second rebases |
| 4-F | WP4.8, WP4.9 | Side by side |

### Stage 5: `stage-5-store-port.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 5-A | WP5.1 | Alone |
| 5-B | WP5.2 | Alone |
| 5-C | WP5.3 | Alone |
| 5-D | WP5.4, WP5.5, WP5.6 | Side by side |
| 5-E | WP5.7 | Alone |
| 5-F | WP5.8 | Alone |
| 5-G | WP5.9, WP5.10 | Side by side |
| 5-H | WP5.11, WP5.12 | Side by side |

### Stages 6 and 7: `stage-6-7-gaia-views.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 6-A | WP6.1 | Alone |
| 6-B | WP6.2, WP7.2 | Side by side: WP7.2 changes only forge's skills and prompts |
| 6-C | WP6.3, WP6.4 | Side by side. Gate G5 before WP6.4 |
| 6-D | WP6.5 | Alone |
| 6-E | WP6.6 | Alone |
| 6-F | WP6.7 | Alone |
| 6-G | WP6.8 | Alone |
| 6-H | WP6.9 | Alone |
| 6-I | WP6.10, WP6.11, WP6.12, WP6.18, WP6.19, WP7.1 | Side by side. Each adds one line to three shared files; each rebases before it lands and keeps the others' lines |
| 6-J | WP6.13, WP6.14, WP6.15, WP6.16, WP6.17, WP6.20 | Side by side, with the same three shared lines |
| 6-K | WP6.21 | Alone |
| 6-L | WP6.22 | Alone |
| 6-M | WP6.23 | Alone, last: Gaia retires the frame |

### Stages 8 and 9: `stage-8-9-shrink-and-rename.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 8-A | WP8.1, WP8.3 | Side by side: WP8.3 changes only Gaia |
| 8-B | WP8.2 | Alone |
| 8-C | WP8.4, WP8.5 | Side by side |
| 8-D | WP8.6 | Alone |
| 8-E | WP8.7 | Alone |
| 8-F | WP8.8 | Alone |
| 8-G | WP8.9 | Alone |
| 8-H | WP8.10 | Alone |
| 8-I | WP8.11, WP8.12 | Side by side |
| 9-A | WP9.1, WP9.2, WP9.3, WP9.4, WP9.5 | Gate G6 first. One worktree, in order, one commit at the end of WP9.5. Gate G6 again after |

## When the run is done

Every line of `status.md` reads `landed`, the root's `bun install --frozen-lockfile` and `bun run verify` pass on the
integration branch, and each stage's "Verification of the whole stage" has passed. The orchestrator then reports what
landed, what the agents found that differed from the stage files, and what is left for the owner: gate G7 and the two
parts of the design that have no work package.
