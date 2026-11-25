---
name: {{skillName}}
description: >-
  Set up or change the pipeline of an {{program}} board with the user: find
  out how the repository is built and checked, propose its entities, draft
  its constitution and design its gates, prepare steps, roles and merge
  train, all through the board's pipeline setup record. Use this skill when
  the user says "set up the pipeline", "change the gates", "review the
  pipeline" or "{{skillLine}}", and as the first line of a pipeline agent job.
---

# Setting up an {{program}} pipeline

You and the user set up the pipeline of this project: its prepare steps, its gates, its agent steps, the instructions
of each role and its merge train. The board keeps the work in one pipeline setup record. You change the record only
with the commands below; the user reads it on the board and answers you there.
`{{program}} help` prints every command and flag; `{{dataFolder}}/reference.md` holds the payloads and the exit codes.

Read the files. Do not run a script. Do not change a file of the repository, and never write a file under
`{{dataFolder}}/` with a file tool.

## The setup record

- Under a pipeline agent job, the verbs name no setup record: Hephaestus adds the record that the job serves.
- Outside a job, the first word after the verb names the record, such as `{{program}} pipeline finding S1 -- <JSON>`.
  When no record is open, start one with `{{program}} pipeline setup --agent machine` for a first pipeline, or give
  the path of the agent program that the user names after `--agent`. Start one with `{{program}} pipeline update` for
  a stored pipeline. Each verb's `--json` prints the record as the move left it.
- The user moves the steps on. Your `pipeline ready <step>` only tells the user that the step can continue.

## Your commands

Send each result with one of these commands. Write the payload as JSON after `--`, or give it on standard input with
`--file -`.

| Command | Payload |
| --- | --- |
| `{{program}} pipeline finding` | `{topic, label, value?, sourcePaths?, script?: {name, run, meaning, gateCandidate, needs?}}` |
| `{{program}} pipeline ask` | `{step, subject?: {kind, reference}, question, context?, options, recommended, multiple?}` |
| `{{program}} pipeline draft-constitution` | `{markdown, sources: [{lineText, occurrence, kind, path}]}` |
| `{{program}} pipeline propose` | `{edits: [{field, value, summary}]}` |
| `{{program}} pipeline ready <step>` | no payload; the step is `research`, `entities`, `constitution` or `design` |

When a command is refused, it prints the reason. Correct the payload and send the command again. Do not send a
command again when it printed `queued`: Hephaestus applies it later.

## Questions

Ask the user only what the repository does not tell you. Ask with `{{program}} pipeline ask`:

- Give two to four options. The options get the letters `a`, `b`, `c` and `d` in their order.
- `recommended` is a list of letters. Put the letter of exactly one option in it. When `multiple` is true, put one
  or more letters in it.
- Do not give an "Other" option. The board lets the user write a free answer.
- Give the question a subject when it is about one node, gate, rule or finding. Only that subject waits for the answer.
- Do not wait for the answer. Do the other work of the step.

## Lines

Write each prepare and gate line in the grammar it runs in on this machine. Under a job, the job's message names the
grammar. Outside a job, `{{program}} help` names it at `gate add`.

## The steps

Do the steps in this order. Do only the current step: the record names it, and a job's message names it too.

### Research

Find out how this project is built, checked and changed.

Read these files when they exist: the README, `CONTRIBUTING.md`, the instruction file of your agent, `CONSTITUTION.md`,
the package and build files (such as `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` or a `Makefile`), the
lint and format configuration, and the CI configuration. When the project is one folder of a larger repository, read
them both in the project's folder and at the repository root.

Record each fact as one finding with `{{program}} pipeline finding`. Put the paths that show the fact in
`sourcePaths`. Use these topics:

- `stack`: a language, a runtime, a package manager or a framework. Put its version in `value`.
- `scripts`: one script that installs, builds, checks, tests or starts the code. Give its `script`: the name, the
  command line that it runs, what it does, and `gateCandidate`. A script that starts a server or watches files is
  `not-a-gate`. When you are not sure, write `unsure`. Put in `needs` what the script needs in addition to the tree,
  such as the network, a database or a secret.
- `conventions`: a rule that the repository writes down, or a rule that its code obeys.
- `continuous-integration`: what the CI runs, and when it runs.
- `note`: an area that has no tests, an existing `CONSTITUTION.md`, or a different fact that a gate or the
  constitution needs.
- `layout`: one app or one package of the repository that has its own folder. Put its folder in `label`, relative to
  the repository root, such as `apps/web`. Put what it is in `value`, such as `Next.js app`. Put its package or build
  file in `sourcePaths`. Record one `layout` finding for each app and each package.

Record each fact one time. When a finding needs a recheck, read its paths again. Then record the correct fact as a new
finding. Then run `{{program}} pipeline ready research`. In the first setup of the board, when you recorded more than
one `layout` finding, the next step is the entities step. Else the next step is the constitution.

### Entities

Do this step only when the repository has more than one app or package. Propose each app and each package as an
entity of this board. Each entity gets its own constitution, gates and reviewers. The user accepts the entities, or
keeps one pipeline for all of the repository.

Use the `layout` findings of the setup record. When a `layout` finding is wrong, read its paths again and record the
correct fact as a new `layout` finding. Send all of the entities in one `{{program}} pipeline propose`:

- Give each entity one edit of the field `entity:<key>`. The value is `{kind, home, summary?}`.
- `key`: a short name in lower case, such as `web` or `ui`. Use the name of the entity's folder. Do not use the key
  `root`.
- `kind`: `app` for code that people use or deploy. `package` for code that other entities use.
- `home`: the folders of the entity, from the repository root, each with a leading `/`, such as `["/apps/web"]`.
  Two entities must not have the same folder.
- `summary`: one or two sentences about what the entity is. The product owner reads them to find the entity of a
  ticket.
- When the package file of an entity declares a different entity of the repository as a dependency, also give the
  edit `entity:<key>/depends-on`. Its value is the list of the keys of these entities. Put these edits after the
  edits that make the entities.
- Do not propose an entity for the root of the repository. The root entity always exists. It owns each path that no
  other entity owns.
- Do not propose a whitelist or a reach. The user sets them in this step.

When you cannot find out if a folder is an entity, ask with the step `entities`. When the question is about one
`layout` finding, give it the subject `finding` and the id of that finding.

The board keeps an entities draft, and the draft can hold refusals of its entities, such as two entities with the
same folder. Continue and Apply are refused while a refusal stands. When the user changes the draft, the message names
each refusal that stands after the change. Do not resolve a refusal on your own. When the user asks you to fix one,
propose the edits that resolve it. When the user keeps one pipeline for the repository, do not propose entities again.

When you proposed the entities, run `{{program}} pipeline ready entities`.

### Constitution

Write the constitution of this project: one markdown document that the builder, the reviewer and the re-reviewer read
before they work on a ticket. Apply commits it to the main line as `CONSTITUTION.md` in the project's folder.

- Write only rules about this project: its structure, its conventions, its tests and its code style. Do not write
  a rule about how {{program}} works, for example who fixes a red gate or when a review starts.
- Use the sources that the SOURCES ticks of the setup record select: `CONTRIBUTING.md`, your research findings and
  the installed default constitution.
- Write one whole document. Use a `#` title, a `##` heading for each section and a `-` item for each rule.
- Send the whole document each time with `{{program}} pipeline draft-constitution --file -`. Do not send a section or
  a difference.
- Do not write a source into the text: no comment, marker, link, footnote or front matter for a source.
- Name the source of a line only in the `sources` list: `lineText` is the exact text of the line without its line
  ending; `occurrence` is 1 for the first line with that text; `kind` is `contributing`, `research` or
  `installed-default`; `path` is the repository path of the source file, or `null`. Give one source for a line at most.
- When the user changed the constitution, keep the changes in your next draft.

When the constitution is ready, run `{{program}} pipeline ready constitution`.

### Pipeline design

Propose the whole pipeline of this board as edits of the draft with `{{program}} pipeline propose`. Use the findings
and the answers of the user.

- Give each edit one field, the whole new value of the field and one summary sentence. The user reads the sentence
  on the board.
- The fields are `gate:<name>`, `phase-order:<phase>`, `prepare:<name>`, `prepare-order`, `role:<role>`, `review`,
  `airlock`, `approval:<approval>`, `ticket-writing` and `constitution`. The value `null` removes a gate, a prepare
  step, the review or the merge train. On a role, an approval or `ticket-writing`, `null` sets the default again.
- A gate is `{name, run, fix?, in?, definedBy?, network?, writes?}`. `in` is the folder the gate runs in, from the
  project's folder, or from the repository root when it starts with `/`; leave it out to run in the project's folder.
  Put the files that define the gate in `definedBy`, a file above the project's folder with a leading `/`. Put the
  domains that it reaches in `network`. Put the folders that it writes outside the worktree in `writes`.
- Put each gate in the phases where it must pass, with `phase-order:build`, `phase-order:review` and
  `phase-order:merge`. Build gates pass before the review. Review gates pass after the fixes of the reviewer. Merge
  gates pass on the merged tree before main moves. Put the fastest gate first in each phase.
- Send a new gate and the phase orders that name it in the same proposal.
- Do not make a gate from a script that starts a server or watches files.
- A prepare step is `{name, run, in?}`, its `in` written as a gate's. It installs what a new worktree needs. The
  prepare steps run in the order of `prepare-order`, before the build gates.
- A role is `{model?, effort?, instructions?}`. The roles are `productOwner`, `specAgent`, `planAgent`, `builder`,
  `reviewer`, `reReviewer`, `conflictReReviewer`, `pipelineAgent` and `assistant`. The models are `haiku`, `sonnet`,
  `opus` and `fable`. The efforts are `low`, `medium`, `high`, `xhigh` and `max`. Change a role only when the project
  needs it.
- The review is `{name, reReview?: {thresholdLines}}`. The merge train is `{reReview?: {thresholdLines}}`. A
  re-review runs when the fixes change more lines than `thresholdLines`.
- The approvals are `tickets`, `merge`, `spec` and `plan`. Each one is `true` or `false`.
- `ticket-writing` sets how a ticket is written. It is `one-ticket` or `spec-then-plan`. The default is
  `one-ticket`: the product owner writes the ticket, and the user reviews it when the `tickets` approval is on.
- With `spec-then-plan`, the product owner writes only the Report and the Wanted of a ticket. Then the spec agent
  writes the spec, and the plan agent writes the plan after the spec is approved. The plan replaces the Brief. The
  user approves each document when its approval, `spec` or `plan`, is on. When an approval is off, the pipeline
  approves the document when its agent calls it ready. A ticket is ready for the builder only when both documents are
  approved.
- Propose `spec-then-plan` only when the tickets of this project need a design before the build. Ask the user first.
- The builder and the reviewer can also have `documents`: `{spec?, plan?}`, each `always`, `if-person-approved` or
  `never`. `always` gives the approved document. `if-person-approved` gives the plan only when the user approved it on
  the current spec. The reviewer always reads the spec. Set `documents` only when the user asks for it.
- When the user writes to you, change the draft with edits. Then tell the user in one sentence what you changed.
- When only the user can decide, ask with the subject `node` or `gate`.

When the draft is complete, run `{{program}} pipeline ready design`.
