---
paths:
  - "apps/forge/skills/**"
  - "apps/forge/resources/prompts/**"
  - "apps/forge/resources/templates/**"
  - "apps/forge/cli/adoption/**"
---

# Skills

- Two skills, split by audience. `skills/agent-po/` is PO intake: it loads in any session asked to file a ticket and
  as a Hephaestus product-owner job's first line, holds the whole filing procedure, files every ticket as a draft with a
  numbered Acceptance and a `## Brief`, and readies drafts only on User's yes in User's own session (under Hephaestus
  it closes intake instead); it loads no other skill. `skills/agent-pipeline/` is pipeline setup: it holds the whole
  setup procedure (the five relayed verbs, the questions rule, the lines rule and the research, entities, constitution
  and design steps), runs in User's own session as in the pipeline agent, and loads no other skill.
- No agent preloads a skill, and nothing installs a worker definition. Hephaestus's roles read the instruction files
  `pipeline.json` names, by default the ones `init` and `update` install in the data folder's `briefs/defaults/`, and
  fixed prompts under `resources/prompts/`.
- The pipeline agent loads its skill as its first line, as the product owner does. Only `pipeline setup`,
  `pipeline update` and `advise` start one. Hephaestus starts no new one by itself: it only resumes a pipeline agent
  that a stop interrupted. Its first message is `resources/prompts/PipelineAgentPrompt.md` with the setup record's
  facts and the current step's prompt, which names the step of the skill only; the rules live in the skill. Its role
  brief is the one `pipeline.json` names, by default `briefs/defaults/pipelineAgent.md`.
- No skill file lists commands: `forge help` is the reference. Every skill names it and
  `.forge/reference.md`, installed from `resources/templates/Reference.md`, which holds only what help does
  not print and follows `docs/cli.md`.
- A `SKILL.md` `description` is its trigger, naming the words a user says. Where a skill quotes the line that runs a
  skill, write the fill `{{skillLine}}` or `{{productOwnerSkillLine}}`: the agent adapter gives the line. The
  pipeline setup skill's table of the five relayed verbs is the one list of commands a skill holds: help does not
  print them. Skill files
  cite only commands, paths in a tracked repository, or files beside them; naming a skill the host may offer, such as
  `grill-me`, is no citation.
- Call budgets are `DISPATCH_PROTOCOL` (`src/shared/constants/DispatchProtocol.ts`), stated by Hephaestus's job prompts
  and never by an installed file.
  The rework threshold is the pipeline's `review.reReview.thresholdLines`; with no re-review, no round is granted. Only
  with no pipeline, `DISPATCH_PROTOCOL` gives the default through `LIFECYCLE_LIMITS`. No installed file states it.
  No skill nor the installed guidance names a by-hand lifecycle verb but `ticket deliver --by-hand`, held by
  `cli/HelpText.spec.ts`.
- `init` and `update` copy both, never globally, into the git-ignored folder the agent adapter's installer names
  for each bundle (`AgentInstaller.instructionBundleFolderOf`; Claude Code's `.claude/skills/<name>/`). What an earlier
  version installed elsewhere, a retired skill folder or a global link, they and `setup.ts` leave for its owner.
