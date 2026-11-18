# Orchestrator plan: Hephaestus, Talos and Gaia

This is the one plan an orchestrating session carries out. It holds the whole schedule: all 113 work packages in the
order they run, which of them run side by side, where the owner has to act, and how one package is handed to an agent,
checked and landed. The detail of a package lives in its stage file in this folder; the orchestrator never needs to
hold a stage file in its own context, only this plan and the status file.

Instruction for the orchestrating session:

> Carry out `docs/monorepo/hephaestus-talos-implementation/orchestrator.md` from where `status.md` in that folder
> says it stands.

## What the orchestrator does and does not do

- It schedules, hands out, checks and lands. It writes no product code itself.
- It reads this plan, `status.md`, and the results its agents return. It reads a stage file only to settle a
  disagreement between agents. [`owner-answers.md`](owner-answers.md) holds the owner's answers and the run's approach;
  where a stage file disagrees with it, that file is right.
- It stops at every owner gate below and at every stop condition, and says plainly what it needs.
- It never pushes, never touches `~/.forge-monitor` or `~/.gaia`, never runs a forge verb in this checkout, never
  talks to a running forge and never starts a vendor session. Its agents are bound by the same rules.

## Branch and worktrees

- All work lands on one integration branch, `hephaestus-talos`, cut from `main` when the run starts. Where a stage
  file says "main", it means this branch. Nothing is pushed and nothing is merged into `main` without the owner's
  word.
- Every package runs in its own worktree under `.claude/worktrees/<package>` (for example
  `.claude/worktrees/wp2-07`), cut from the tip of the integration branch after the packages it depends on have
  landed. Stage 9 is the exception: its six packages share one worktree and become one commit.
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
   `docs/monorepo/hephaestus-talos.md`, `docs/monorepo/hephaestus-talos-implementation/owner-answers.md` and, in the
   stage file, the sections Goal, Depends on, Interfaces introduced,
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
- a package meets a question of behaviour that `owner-answers.md` and the design's decisions do not settle;
- an agent would have to touch the real home, run a forge verb here or start a vendor session to finish.

## Owner gates

The owner answers how the system behaves; the run decides the migration (`owner-answers.md`). The gates hold only acts
that the owner alone may do.

| Gate | When | What the owner does |
| --- | --- | --- |
| G0 | Before anything runs | Passed: said go, on the integration branch `hephaestus-talos` |
| G1 | During stage 0, and once WP2.2 has landed | Records recordings A and B, sessions that end on a network outage (WP0.3); later records the fake agent's outage scenario (`bun run record src/testing/fake-agent/`). No package of stage 2 waits on the second; stage 2's verification step 7, WP3.14's outage row and WP6.26's recorded situation do |
| G2 | Before WP0.5 | Passed on 2026-11-18: the answers are in `owner-answers.md` |
| G3 | Before WP1.2 | In `apps/forge`, then `apps/gaia`, with the installed program: `forge job stop --all`, `forge stop --now`, `forge login-item remove`, and `forge login-item status` reads `absent`; lets a running merge agent end first |
| G4 | End of WP2.13; optionally after WP3.14 and WP5.10 | Asks for `bun run verify:integration`, which forge's rules allow only on a person's word |
| G6 | Before stage 9, and after it | Before: stops every forge and removes each board's login item. After: pulls stage 9 into the installed clone, runs `setup`, sets each board up anew with `init`, adds the login items again |
| G7 | End of the run | Decides whether and how the integration branch reaches `main` |

Gate G5 is retired: no rule file waits on an approval (decision 34).

No work package yet plans the freeze of a committed ticket (decision 48, owner answer 14): the Board refusing an edit
of a ticket's content from committed onward, the content kept by content hash at the commit, and the move back into
`draft`. Its natural place is stage 5, after WP5.13, on the command `ticket-edit`. The orchestrator stops before group
5-A until the stage 5 file holds a package for it, and reports that it is missing.

## The schedule

Groups run in the order given. Packages on one line of a group run side by side; a group marked "alone" runs one
package at a time. A group starts only when every package of the group before it has landed, unless a note says
otherwise. Each stage ends with its stage file's "Verification of the whole stage", run by a checker.

### Stages 0 and 1: `stage-0-1-trace-and-base.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 0-A | WP0.1, WP0.2 | Landed. The owner does WP0.3 meanwhile (gate G1) |
| 0-B | WP0.4 | After WP0.3; may run beside 0-C and 0-D |
| 0-C | WP0.5 | After WP0.1; may run beside WP0.4 and WP1.1 |
| 0-D | WP1.1 | After WP0.1; may run beside WP0.4 and WP0.5 |
| 0-E | WP1.2 | Alone, after gate G3. The agent checks the machine, saves the dropped tickets' uncommitted changes and removes their worktrees and the leftover branches |
| 0-F | Refresh the plan | Landed: ran before 0-A on the owner's word. WP1.2 lands no branch, so it runs again only if `main` moves before stage 2. See below |
| 0-G | WP1.3 | Alone, last: the stage's gate. After 0-B to 0-E |

**Refreshing the plan after a branch landed.** The stage files were checked against `b4174bd9`, the integration branch
at the start, where every shipping file reads as at `0a648b2b`. If `main` moves before stage 2 starts, the integration
branch takes the new `main`, and the orchestrator runs the refresh: one agent per stage file, side by side, each with
this brief: "The repository changed since `docs/monorepo/hephaestus-talos-implementation/<stage file>` was checked;
`git diff b4174bd9..main --stat` shows where. Recheck every row of 'Today's code', every path and line a work package
names, and every entry of 'Interfaces introduced' against the code as it is now. Correct the file where the code moved;
where a change of the branch makes a work package wrong, larger or unneeded, rewrite that package and say so in your
report. Change nothing but that stage file." A checker then reads the seven reports for packages whose order or
interfaces changed and corrects this schedule to match. WP0.2's baseline of the recovery specs is run again on the new
`main`.

### Stage 2: `stage-2-talos.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 2-A | WP2.1, WP2.2, WP2.3 | Side by side. The fake agent's outage recording is the owner's (gate G1); no package waits on it |
| 2-B | WP2.4 | Alone |
| 2-C | WP2.5, WP2.6, WP2.11 | Side by side |
| 2-D | WP2.7 | Alone |
| 2-E | WP2.8 | Alone |
| 2-F | WP2.9, WP2.10 | Side by side |
| 2-G | WP2.12, WP2.19 | Side by side. WP2.19 lands before WP2.13: a pass that awaited a merged-tree gate would end the lease |
| 2-H | WP2.13 | Alone. A long session that cannot be split. Ends at gate G4 |
| 2-I | WP2.14 | Alone |
| 2-J | WP2.20 | Alone |
| 2-K | WP2.15 | Alone |
| 2-L | WP2.16 | Alone |
| 2-M | WP2.17 | Alone |
| 2-N | WP2.18 | Alone, last: recordings and the end-to-end check on a scratch forge |

### Stage 3: `stage-3-presence-recovery.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 3-A | WP3.1, WP3.4, WP3.5 | Side by side |
| 3-B | WP3.2, WP3.6 | Side by side |
| 3-C | WP3.3, WP3.7 | Side by side |
| 3-D | WP3.8 | Alone |
| 3-E | WP3.9 | Alone |
| 3-F | WP3.10, WP3.15 | Side by side |
| 3-G | WP3.11, WP3.13 | Side by side |
| 3-H | WP3.12 | Alone |
| 3-I | WP3.14 | Alone, last: the crash matrix. Its outage row waits for gate G1; gate G4 runs its real-system half |

### Stages 4 and 5

Stage 5 needs nothing of stage 4 and may start once stage 3 has finished: the tracker model stays in `apps/forge`.
Stage 4 and stage 5 then run as two lines side by side, each in its own group order, under one rule: the two stages
share files (`ControlCommand.ts`, `ControlService.ts`, `CommandRoute.ts`, `OperationRefusalWordingUtil.ts`,
`docs/reference/refusals.md`, and the mapping of a ticket into the contract), so WP4.5, WP4.8, WP4.10, WP4.11 and
WP4.12 never run beside WP5.4, WP5.6, WP5.7, WP5.8 or WP5.13. Each landing rebases on the other line's landings and
runs its "Done when" again. Stage 6 starts when both stages have finished.

#### Stage 4: `stage-4-packages.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 4-A | WP4.4 | Alone, first: the system minor every later package adds under |
| 4-B | WP4.5, WP4.6, WP4.7, WP4.12 | Side by side. WP4.5, WP4.6 and WP4.12 append to `packages/forge-contracts`, WP4.5 and WP4.12 change different functions of `CommandRoute.ts`; the second to land rebases and keeps both |
| 4-C | WP4.8 | Alone |
| 4-D | WP4.10 | Alone |
| 4-E | WP4.11 | Alone |
| 4-F | WP4.9 | Alone, last: the documents that describe the contract |

#### Stage 5: `stage-5-store-port.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 5-A | WP5.1 | Alone |
| 5-B | WP5.2 | Alone |
| 5-C | WP5.3 | Alone |
| 5-D | WP5.4, WP5.5, WP5.6 | Side by side |
| 5-E | WP5.7 | Alone |
| 5-F | WP5.13 | Alone: record locations leave the model and the output, and hand-editing ends |
| 5-G | WP5.8 | Alone |
| 5-H | WP5.9, WP5.10 | Side by side. Gate G4 may follow WP5.10 |
| 5-I | WP5.11, WP5.12 | Side by side |

### Stages 6 and 7: `stage-6-7-gaia-views.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 6-A | WP6.1 | Alone |
| 6-B | WP6.2, WP6.4, WP7.2 | Side by side: WP7.2 changes only forge's skills and prompts. WP6.4 splits `ContractVersions.ts`; a package after it puts its keys in the half WP6.4 named |
| 6-C | WP6.24 | Alone: Gaia's board model and ingestion |
| 6-D | WP6.25 | Alone: the page's board contract and Gaia's board commands |
| 6-E | WP6.3 | Alone |
| 6-F | WP6.5 | Alone |
| 6-G | WP6.6 | Alone |
| 6-H | WP6.7 | Alone |
| 6-I | WP6.8 | Alone |
| 6-J | WP6.9 | Alone |
| 6-K | WP6.10, WP6.11, WP6.12, WP6.18, WP6.19, WP7.1 | Side by side. Each adds one line to three shared files; each rebases before it lands and keeps the others' lines |
| 6-L | WP6.13, WP6.14, WP6.15, WP6.16, WP6.17, WP6.20 | Side by side, with the same three shared lines; `pipeline.css` is already linked and listed by WP6.8, so WP6.20 only adds rules to it. WP6.13 to WP6.17 need only WP6.12; WP6.20 needs WP6.19 |
| 6-M | WP6.21 | Alone |
| 6-N | WP6.26 | Alone. Its recorded situation needs the fake agent's outage scenario (gate G1) |
| 6-O | WP6.22 | Alone |
| 6-P | WP6.23 | Alone, last of this stage: Gaia retires the frame |

WP6.27, the Assistant's switch in Gaia, runs in stage 8 right after WP8.9 (group 8-H).

### Stages 8 and 9: `stage-8-9-shrink-and-rename.md`

| Group | Packages | Notes |
| --- | --- | --- |
| 8-A | WP8.1, WP8.3 | Side by side: WP8.3 changes only Gaia |
| 8-B | WP8.2 | Alone |
| 8-C | WP8.4, WP8.5 | Side by side |
| 8-D | WP8.6, WP8.13 | Side by side: WP8.6 changes forge and `forge-contracts`, WP8.13 Gaia, the three packages and their rules |
| 8-E | WP8.7 | Alone |
| 8-F | WP8.8 | Alone |
| 8-G | WP8.9 | Alone |
| 8-H | WP6.27 | Alone: stage 6's package, on the switch WP8.9 built |
| 8-I | WP8.10 | Alone |
| 8-J | WP8.11, WP8.12 | Side by side |
| 9-A | WP9.1, WP9.6, WP9.2, WP9.3, WP9.4, WP9.5 | Gate G6 first. One worktree, in this order, one commit at the end of WP9.5. Gate G6 again after |

## When the run is done

Every line of `status.md` reads `landed`, the root's `bun install --frozen-lockfile` and `bun run verify` pass on the
integration branch, and each stage's "Verification of the whole stage" has passed. The orchestrator then reports what
landed, what the agents found that differed from the stage files, and what is left for the owner: gates G6 (after
stage 9) and G7.
