---
paths:
  - "apps/forge/skills/**"
  - "apps/forge/resources/prompts/**"
  - "apps/forge/resources/templates/**"
  - "apps/forge/cli/adoption/**"
---

# Skills

- Two skills, split by audience. `skills/agent-po/` is PO intake: it loads in any session asked to file a ticket and
  as an Overseer product-owner job's first line, holds the whole filing procedure, files every ticket as a draft with a
  numbered Acceptance and a `## Brief`, and readies drafts only on User's yes in User's own session (under the Overseer
  it closes intake instead); it loads no other skill. `skills/agent-progress-orchestrate/` is the interactive wrapper
  around a running Overseer (`oversee`): it reads its state, starts it on User's go, turns User's intent into verbs,
  loads `forge-po` for intake and may wait on `await`; it never drives the lifecycle or handles an incident, which
  are the Overseer's and its Assistant's.
- No agent preloads a skill, and nothing installs a worker definition. An Overseer's roles read the instruction files
  `pipeline.json` names, by default the ones `init` and `update` install in the data folder's `briefs/defaults/`, and
  fixed prompts under `resources/prompts/`.
- The pipeline agent loads no skill. Only `pipeline setup`, `pipeline update` and `advise` start one. The Overseer
  starts no new one by itself: it only resumes a pipeline agent that a stop interrupted. Its instructions are the fixed
  prompts `resources/prompts/PipelineAgent*.md` and the brief that `pipeline.json` names, by default
  `briefs/defaults/pipelineAgent.md`.
- No skill file lists commands: `forge help` is the reference. Both skills name it and
  `.forge/reference.md`, installed from `resources/templates/Reference.md`, which holds only what help does
  not print and follows `docs/cli.md`.
- A `SKILL.md` `description` is its trigger, naming the words a user says. Skill files cite only commands, paths in
  a tracked repository, or files beside them; naming a skill the host may offer, such as `grill-me`, is no citation.
- `skills/agent-progress-orchestrate/` repeats nothing from `skills/agent-po/`, writes rules as instructions,
  and never restates what the Overseer decides. Call budgets are `DISPATCH_PROTOCOL`
  (`src/shared/constants/DispatchProtocol.ts`), stated by the Overseer's job prompts and never by an installed file.
  The rework threshold is the pipeline's `review.reReview.thresholdLines`; with no re-review, no round is granted. Only
  with no pipeline, `DISPATCH_PROTOCOL` gives the default through `LIFECYCLE_LIMITS`. No installed file states it.
  Neither skill nor the installed guidance names a by-hand lifecycle verb but `ticket deliver --by-hand`, held by
  `cli/HelpText.spec.ts`.
- `init` and `update` copy both into the tracked repository's git-ignored `.claude/skills/`, never globally, and
  remove the files a retired skill folder installed there with its `.gitignore` entry; `setup.ts` only removes the
  `~/.claude/skills/` symlinks into this checkout that earlier versions made.
