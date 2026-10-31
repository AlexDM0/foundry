# Resume brief: finish the documentation pass

This folder is temporary. It holds what a fresh session needs to finish the pass, and the last step deletes it. It is
not part of the documentation set and is not linked from `docs/README.md`.

## The goal

The owner asked for perfect, visual, human-readable, layered documentation for the entire project in `docs/`: data
model, internal architecture, diagrams, interactive pages and a glossary, with all existing documentation in scope.
Every document is reviewed for accuracy, readability and quality, including whether more could be visual and whether
each figure is readable, clear and understandable.

## Where it stands

The owner froze the pass after the first whole-set review round, before its repairs.

| Step | State |
| --- | --- |
| Design: maps, three proposals, one plan, a critic | Done |
| 42 documents and labs, each with a writer, three reviewers and a fix loop | Done |
| `docs/cli.md` and `docs/README.md`, the same loop | Done |
| Integration: gaps, glossary, open findings, links, `CLAUDE.md`, deletions, figure corners | Done |
| Whole-set round 1 review | Six of seven reviewers reported; the figures reviewer did not finish |
| Repairs of round 1 | **Not started** |
| Whole-set round 2 and the final checks | **Not started** |

The set stands at 40 Markdown files, 4 labs in `docs/interactive/`, 37 figure folders under `docs/figures/` and 119 gap
entries in `docs/reference/known-gaps.md`. Nothing under `src/`, `cli/`, `bridge/`, `resources/`, `skills/`, `setup.sh`
or `package.json` was edited. `CLAUDE.md` and the `.readme-graphics/` scripts were, on purpose, and the README
screenshots were retaken.

The pass is not on the board: it has no ticket, so no orchestrator picks it up.

## Files here

| File | Holds |
| --- | --- |
| `whole-set-round-1-findings.json` | 112 open findings, 30 major and 82 minor, across 49 files. Each names the one file to change, the evidence and the fix |
| `figures-review-notes.md` | What the unfinished figures reviewer confirmed. Leads, not a review |
| `style-guide.md` | The writing law for every writer and reviewer |
| `figure-conventions.md` | The figure and lab law |
| `unverifiable-left.md` | What the pass could not settle, and what would settle each item |

The owner's machine also keeps git-ignored working material in the main checkout's `.claude/.evidence/group-docs/`: the
plan (`plan.json`, one file per document under `plan/`), the subsystem maps, hand-backs, review results, the gap triage,
the sweep scripts in `scratch/set-checks/` and the last workflow script `integrate-workflow.js`. Use them when present,
and open the code for every claim whatever they say. Nothing below depends on them.

## What to do, in order

1. **Branch.** Make a worktree under `.claude/worktrees/` on a new branch from the tip of `group-code-lifecycle`. Do
   not work directly on the group branch.
2. **Catch up with the code.** The documents were checked against commit `70ce56de`, and they say so in 23 files. Read
   `git log 70ce56de..HEAD -- src cli bridge resources skills` and update what changed. Already known: `5115e03d`
   added the refusal `incident-target-mismatch` in `src/services/control/Bouncer.ts`, so
   `docs/reference/refusals.md` and any count of refusal reasons need it. Finish by replacing the stated commit
   everywhere with the commit actually checked.
3. **Finish the figures review.** Rerun it as one agent per figure folder. The first attempt was one agent over every
   figure: images fall out of an agent's context after a few dozen, and it reread them for an hour and never reported.
   Each agent reads at most about ten images. Start from `figures-review-notes.md`, and judge whether the set is one
   visual system and where a document still lacks a picture.
4. **Repair.** Group the round 1 findings and the figures findings by file. Run one fixer per file in parallel, so no
   two touch one file. A fixer checks each finding against the code before applying it, because reviewers can be
   wrong, and lists what it rejects. A figure folder counts as one file.
5. **Sweep again.** Rerun the seven whole-set reviewers read-only: mechanical, cold reader, consistency, operator,
   figures (split as in step 3), labs and completeness. Repair and repeat until a round holds no blocker or major
   finding, at most two more rounds. Tell them what was already rejected, so it does not come back.
6. **Give the rules a home.** `docs/development/contributing.md` takes the lasting rules of `style-guide.md` and
   `figure-conventions.md`. A round 1 finding asks for exactly this.
7. **Final checks.** `git add` everything first, because `src/ComponentNames.spec.ts` reads `git ls-files`. Run the
   sweep's scripted checks, then the commands below.
8. **Delete this folder**, rebase onto the group branch and fast-forward `group-code-lifecycle`. Commit subjects are
   one plain line. Never merge or push to main: this group is never released there.

```bash
bun test src/ComponentNames.spec.ts src/ProseWrap.spec.ts cli/HelpText.flags.spec.ts cli/HelpText.spec.ts
```

```bash
bun test cli/ReferenceCopies.spec.ts cli/InstalledSurface.spec.ts
```

```bash
bun run verify
```

## The mechanical sweep

Throwaway scripts, never committed, over `docs/**`, `README.md` and the labs:

- Every relative link, image and anchor resolves, explicit `<a id>` anchors included.
- Every embedded PNG has its SVG beside it, every figure is embedded exactly once, and no file is orphaned.
- Every gap anchor linked exists, and every gap has a row in the index table of `docs/reference/known-gaps.md`.
- Every glossary term linked exists, and every document and lab is in `docs/README.md`.
- Every `CONSTANT_NAME` (value) in documents, labs and figures matches the code. Every count is re-derived from code.
- Every refusal code in `OperationRefusalWordingUtil.ts` and `BoardRefusal.ts` has a row in
  `docs/reference/refusals.md`, both ways. Every variable in `src/shared/Environment.ts` has a row in `docs/cli.md`,
  both ways.
- The 120-column wrap holds with the exemptions of `src/ProseWrap.spec.ts`, which covers no file under `docs/` except
  `cli.md` and `backlog.md`. Banned words, em dashes and the blockquote skeleton hold as `style-guide.md` says.

## How to run it

- Use the Workflow tool when the owner opts in with ultracode. Agents take `opus` at `medium` effort, and `high` for
  the consistency and completeness reviewers. Never a Fable agent.
- Give every agent absolute paths in the worktree and have it start shell commands with `cd` into it. The main checkout
  is a different, older codebase.
- Agents never commit, and they never change source, specs, prompts, skills, `package.json` or `setup.sh`. A defect
  goes to `docs/reference/known-gaps.md`.
- Never run the CLI under development against this repository's tracker, and never run `init`, `update` or `clear`
  here. Scratch repositories use `AGENT_PROGRESS_V2_ROOT`.
- Watchers outlive the Overseer. Every agent that starts a board stops it and kills what is left, and uses fake agents.
  In round 1 a scratch board left a real `claude -p` session running for over three hours.
- Keep a structured reply short and plain: two fixers failed on malformed JSON from long replies. The session limit
  stopped the first writing run, so commit before each large stage.

## Report at the end

Tell the owner what landed and anything left open, compiled from `docs/reference/known-gaps.md`: the agent-facing prompt
defects, the help text `cli/HelpText.ts` still prints, and any unsettled item in `unverifiable-left.md`. Say that
nothing enters `docs/backlog.md` without the owner's agreement, and that `src/ProseWrap.spec.ts` could be extended over
`docs/`.
