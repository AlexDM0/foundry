READER. A capable engineer who has never seen this project. Assume strong general engineering knowledge and zero project knowledge. Link `glossary.md#<term>` on a project word's first use in each document. Link only terms on the glossary's fixed list; ask for others in your hand-back.

TRUTH. The worktree is the truth; source is frozen at commit 70ce56de because this pass changes none. Maps are leads, not sources: open the code for every claim. The design material is for rationale only and is never cited as authority. Describe what the code does, as built, in present tense. No future tense, no 'used to', 'previously', 'now', 'new', 'legacy' except the code's own identifiers. Plans live only in docs/backlog.md. A map conflict is settled in code, never by choosing a map.

SAFETY. Never run the CLI under development against this repository's tracker. Never run init, update or clear here. To see behaviour, use a scratch repository under the scratchpad with `AGENT_PROGRESS_V2_ROOT`; `AGENT_PROGRESS_ROOT` is silently ignored by this build. Importing a constant in `bun -e` to check a table is fine. Never fix source, prompts, skills, specs, package.json or setup.sh.

ONE OWNER PER FILE. A writer touches only its own file and its figure folder. It never edits another document, even to add a link back. Hand-back lists: new defects with evidence, links wanted from other documents, glossary terms wanted, anything unverifiable. The integration pass applies them.

SKELETON, every Markdown document:
`# Title`
A blockquote of four lines: **Question:** the reader's question. **Time:** minutes. **Read first:** links. **Next:** at most three links.
`## In one screen`: under 15 lines plus the main figure. A reader who stops here has the idea and is not misled.
Body sections, general to specific, each opening with its conclusion.
`## Invariants` where a mechanism has them: numbered sentences that are always true.
`## In the code`: a table of concept, path, symbol, spec that holds it.
Aim for under about 350 lines; put deep lookup tables in `<details>`. Reference documents, the glossary and the runbook may adapt the skeleton but keep the blockquote.

PICTURE FIRST. When a concept is structural, the figure comes before the prose and the prose adds what the figure cannot. Do not narrate a figure. Tables for anything enumerable, a figure for shape, prose for why.

LAYERS DO NOT REPEAT. The concept layer gives one sentence and at most one simple figure. The home document gives the rules. The lab lets you try it. A deeper figure adds structure and never redraws the same picture.

ONE HOME FOR EACH FACT. State a fact only in its home; elsewhere name it and link.
Names and placeholders, terms: glossary.md.
Commands, flags, exit codes, environment variables, ticket format, log kinds, stored formats including the fields of `pipeline.json`: cli.md.
Entities, relations, identity, the three stores: data-model/entities.md.
Statuses, states, legality, hold forms, Overseer states: data-model/state-machines.md.
Write order mechanics, lock, journal, log as input, broken-file table: data-model/storage.md.
Every path, writer, lifetime, write mode: data-model/on-disk-atlas.md.
Layers and packages: architecture/code-map.md.
Pass order, Playbook, launch choice: architecture/the-pass.md.
Job flow, worktree and branch lifecycle, review moves, rework ladder, failed-pass counting: architecture/build-and-review.md.
Customs checks, report schemas, gate verdicts, what the pipeline means, onboarder: architecture/customs-and-gates.md.
Airlock phases, merge order, landing, groups, release, refresh: architecture/airlocks-and-groups.md.
Process tree, protocol, discovery, port derivation, identity, liveness, job, instance, session and attempt: architecture/watchers.md.
Baton, start and stop, Baton pass and its failure matrix: architecture/baton.md.
Crash matrix, Regrouping, interruption causes, at-most-once table, usage limit: architecture/failure-and-recovery.md.
Role table, launch order, instruction sources, token crediting: architecture/roles-and-launch.md.
Confinement layers, actual profiles, who may write what as enforced, the gate `writes` rule, network, secrets: architecture/confinement.md.
Control contract, Hatch, Bouncer, verb routes under a job, control frames reaching a session: architecture/control-and-hatch.md.
Decision, incident and notice tables, agent questions, answer delivery: architecture/questions-and-incidents.md.
Assistant, findings path, product-owner intake: architecture/assistant-and-intake.md.
What `review-stats` and `usage` mean, cause links on a ticket: architecture/measurement.md.
Client architecture, client state: architecture/bridge.md.
Command flow, install, two versions, hooks: architecture/cli-and-install.md.
Views, tabs, controls, daily routines: operations/running-a-board.md.
First-run path: operations/getting-started.md.
Recipes: operations/runbook.md.
Routes, guards, SSE, BoardState, job live facts, integration: reference/overseer-api.md.
Deciders, every bound value, clock exceptions: reference/deciders-and-bounds.md.
Every printed refusal: reference/refusals.md.
Defects: reference/known-gaps.md.
Vendor contract, transcript layout and evidence: development/overseer-claude-probe.md.
Guards and tests: development/guards-and-testing.md.
Why: development/decisions.md.
Product names, seams, residue: development/porting.md.
Rules: CLAUDE.md, linked, never restated.
Plans: docs/backlog.md.

NUMBERS. A value lives in reference/deciders-and-bounds.md. Anywhere else, name the constant; if a sentence needs the value, write `CONSTANT_NAME` (value), so a grep finds every copy and the number sweep checks it. Counts of kinds are derived from code. Codebase counts carry the commit.

AS BUILT. Say what the code does, then `> **As built.**` with a link to `known-gaps.md#<anchor>` using the anchors the plan fixes. Only known-gaps.md explains a defect. Other callouts: `> **Why.**` for rationale a reader would ask for, `> **Careful.**` for a trap. Use them sparingly.

CITATIONS. Repo-rooted paths in backticks with a symbol, never a line number: `src/services/overseer/DrivePass.ts`, `runOnePass`. Relative Markdown links only; every link and anchor must resolve. Link a document by file, and a heading only when you own it or the plan fixes it.

NAMES. Component names exactly, capitalised: Overseer, Watcher, Pass, Playbook, Hatch, Customs, Airlock, Assistant, Baton, Regrouping, Bouncer, Bridge. Read `RETIRED_NAMES` in `src/ComponentNames.spec.ts` before writing: it is matched by substring over every tracked file including .svg and .html, and it holds ordinary-looking hyphenated strings. Never quote one, not even to say it is retired. No 'formerly' note. Do not call the Overseer a runner or the Watcher a host. Commands are `agent-progress-v2 <verb>`. Folders are `<data>`, `<worktrees>`, `<monitor>`, defined in the glossary. Environment variables carry the `AGENT_PROGRESS_V2_` prefix.

OVERLOADED WORDS. Never a bare 'slot', 'draft' or 'pass' where two meanings are possible. Pass, capitalised, is the Overseer's loop; 'failed pass' only as the bound; 'review round' for a review; 'Baton pass' only for the Overseer hand-over; 'red-handoff note' for `gate-failure.md`. Slots: launch slot, Airlock slot, gate slot, epic colour slot. Drafts: filing draft, draft ticket. 'Orchestrator' only for the optional wrapper session, and in the glossary. Say 'gates', not 'checks line'. No v1 voice: no dispatcher, no 'the page regenerates', no `ticket start`.

PEOPLE. 'User' with a capital is the person running the board, matching the code. 'You' is the reader, and only getting-started, running-a-board, the runbook and contributing address the reader. 'The owner' is the project's owner.

PROSE. English. Short declarative sentences. Lead with the conclusion. Active voice: say who does what. Paragraphs of at most five lines. Bold sparingly. No em dashes in new prose; the three copied cli.md sections are exempt. No emojis. No filler: never 'simply', 'just', 'easily', 'obviously', 'robust', 'seamless', 'powerful', 'leverage', 'note that', 'it is worth noting', 'in order to'. Say what happens, not that something 'handles' or 'manages' it. Every sentence should change what the reader believes or can do.

MARKDOWN. Paragraph lines wrap at 120 columns; table rows, fences and a line holding one code span are exempt. One `#` title. Heading text stable. Fenced code carries a language. Runbook commands are pasteable.

EXAMPLES. Obviously synthetic: Alex Example, Example Agency, Example Storefront, ticket #003 'Double-click a role to edit it'. The Bridge tour may name #012 'One-page checkout' as what the screenshots show.

DOCUMENT REVIEW. Each reviewer scores five things and fixes before passing.
Accuracy: open the code behind every claim, table and number. A value not found in code fails; a claim that cannot be verified is removed, not softened.
Readability: could this reader follow it cold, is each section led by its conclusion, does 'In one screen' stand alone.
Quality: one home, no repeat, nothing stale, no filler, all links resolve.
Visual: for each block of prose or table ask whether a figure would teach it faster, and add it if yes.
Figures: read each PNG back. State its one-sentence message; fail it if that does not come naturally. Check for cramped, clipped or crossed text, and whether a stranger could explain it.