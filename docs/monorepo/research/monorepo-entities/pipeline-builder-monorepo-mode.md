# The pipeline builder's monorepo mode

> **Question:** What must the pipeline builder do when a forge has entities?  
> **Time:** 15 minutes.  
> **Read first:** [Entities: one forge for a monorepo](strategy.md), sections 2 to 4.  
> **For:** the redesign of the Bridge's pipeline view. This is a functional brief. It names what the owner must be
> able to see and do, and what data carries it. It prescribes no layout, component or visual form.

Brief of 16 November 2026. Nothing here is built. Paths are from `apps/forge/`.

## 1. What the builder is today

The pipeline view (`bridge/views/pipeline/`) shows one of five screens, chosen by `PipelineViewModel.screenOf`:
the setup landing, the setup resume summary, a setup step, the constitution editor, or the flow (live or editing).

| Part | Today |
| --- | --- |
| Setup steps | `billing`, `research`, `constitution`, `design`, `apply`, in a stepper. |
| Research | One pass. Findings by topic, scripts, the agent's questions, the chat. Stop and Continue. |
| Constitution | One markdown document, Edit or Preview, the roles that read it, the SOURCES ticks, the chat. |
| Design and the flow | One graph of four phases (Ticket, Build, Review, Merge) with step cards, insert slots and one gates table. Dialogs for an agent step, the review step, the merge step and a gate. |
| Editing | A draft edited field by field (`pipeline-draft-edit`), a Changes list with undo per edit, Discard, a pipeline check, gate profiling, Apply. |
| Modes | `setup` shows the stepper. `update` and `advise` show the editing flow. |
| Apply | Two stages: the constitution commit, then `pipeline.json`. |

The fields a draft edit can address are `gate:<name>`, `phase-order:<phase>`, `prepare:<name>`, `prepare-order`,
`role:<role>`, `review`, `airlock`, `approval:tickets|merge` and `constitution`. None carries an entity.

## 2. The two modes

- **Single mode** is today's builder. It applies when the pipeline has no entities. Nothing in it changes, and no
  entity control shows.
- **Monorepo mode** applies when the setup record or the stored pipeline has entities. It exists only for a forge at
  the repository root.

The builder never asks the owner to pick a mode up front. Research reports the repository's layout; when it finds
several stand-alone codebases, the builder proposes monorepo mode in the new `entities` step, and the owner accepts
it or stays in single mode.

## 3. Two levels of settings

Everything the owner edits in monorepo mode sits on one of two levels. The builder must make the current level
plain at all times and let the owner move between them.

| Level | Settings |
| --- | --- |
| **Forge** | Billing; approvals (tickets, merge); the Airlock's settings; the board's concurrency; the agents `productOwner`, `pipelineAgent`, `assistant`; the list of entities. |
| **Entity** | Kind, home folders, summary; constitution; prepare steps; gates and their phases; review settings; the agents `builder`, `reviewer`, `reReviewer`, `conflictReReviewer`; whitelist; reach; depends on; concurrency cap. |

## 4. What the owner must be able to do

### 4.1 The `entities` step (new, after research)

- See every entity research proposes: key, kind, home folders, summary, whether a constitution already exists in
  its folder, and which entities it depends on.
- Accept, remove or add an entity; rename a key; change a kind; add or remove a home folder.
- **Fold** a package into an app: make its folder a further home of the app's entity and remove the package entity.
  The step must explain the trade: a border costs stages on every ticket that crosses it.
- Set, per app, its whitelist (which packages its tickets may cross into) and its reach (root files its builder may
  change directly).
- See, for each pair of app and whitelisted package, that a crossing will run in stages (section 4.5).
- Answer the pipeline agent's questions about the layout, as questions are answered today.
- Decline monorepo mode: continue in single mode with one pipeline for the repository.
- See the root entity, which always exists and owns every path no other entity owns, and choose whether it gets
  gates and a constitution of its own or stays for a person.
- See every refusal in the owner's words before Continue: two entities with the same home folder, an unknown key
  in a whitelist, a whitelisted entity that is not a package or has no review step, a circle in "depends on".

### 4.2 Research

- Research first reports the layout, then runs per entity. The owner sees which entities are researched, running or
  waiting, and each entity's findings and scripts apart from the repository's.
- Stop works per entity session and for all.

### 4.3 Constitution

- One document per entity. The owner sees all entities with the state of each: adopted from the repository as it
  is, drafted, the installed default, or not started.
- Open one entity's document in today's editor, with its own SOURCES ticks, its own revision and its own chat.
- A constitution that already exists in an entity's folder is adopted byte for byte unless the owner edits it.
- The "read by roles" list shows that entity's builder and reviewers only.

### 4.4 Design, the flow and editing

- Choose the level: the forge, or one entity. The flow, the gates table, the dialogs, the Changes list and the
  pipeline agent's chat all show the chosen level.
- At an entity: today's flow for that entity's prepare steps, gates, phases, review step and its four agents.
- At the forge: the product owner step, the approvals, the merge step with the Airlock's settings, concurrency.
  No gates: a gate always belongs to an entity.
- The Changes list groups edits by level and entity. Undo works per edit as today. Discard discards all.
- The owner can copy one entity's gates, prepare steps or agent settings to another entity as a set of ordinary
  edits, since sibling packages often start alike.
- Gate profiling and the pipeline check run per entity; a check covers the entities the draft touched.
- The pipeline agent can be asked about one entity or about the forge (`advise`).

### 4.5 The crossing (read-only)

For an app with a whitelist, the builder shows how a ticket that crosses into a package will run: build, package
build, package review, adapt, review, landing. Each stage names the entity whose constitution, agent and gates
apply, taken from the two entities' own settings. The owner edits nothing here; it follows from the entities. Its
purpose is that the owner sees the cost and the order before accepting a whitelist entry.

### 4.6 Apply

- The Apply dialog lists what changes per level and entity, and which constitutions will be committed.
- All new or changed constitutions land in one commit job; the pending state names how many.
- Apply is refused, with the reason in the owner's words, when it would remove or rename an entity a ticket names,
  or turn a single pipeline into entities while a ticket is in progress or in review.
- After a first Apply in monorepo mode, the product owner gives every pending ticket without an entity one, from the
  ticket and the files it names. The builder shows its progress and each ticket's entity with the reason, read-only:
  the owner assigns nothing. Where the product owner cannot tell, it asks the owner, as intake does (E81).

### 4.7 The live view

- The live pipeline shows the forge level and every entity, each with its own state: checked, or without gates.
- Live activity (a running gate, a profile run) names its entity.
- "Update pipeline" and "Ask the pipeline agent" keep their meaning and open at the level the owner is on.

## 5. Data the redesign can rely on

These are additions the strategy plans in its step 5; the redesign names what it needs from them, and does not
invent others.

| Today | In monorepo mode |
| --- | --- |
| `Pipeline` with one `prepare`, `gates`, `phases`, `constitution`, `agents`, `review` | The same keys per entity under `entities`; forge-level keys at the top. |
| Draft fields `gate:<name>`, `role:<role>`, `constitution`, … | The same fields with an entity scope, and new fields for an entity's definition, whitelist, reach, depends on and concurrency. Forge-level fields keep their names. |
| `PipelineSetup` with one `findings`, one `constitution` draft, one `draft`, one `check` | The layout finding; findings, a constitution draft and a check per entity; one draft that holds every entity. |
| Setup steps `billing`, `research`, `constitution`, `design`, `apply` | The step `entities` after `research`. The setup record keeps its format version; entities are optional keys in it. |
| An instruction entry `{kind:'constitution'}` with no target; `InstructionsEditor` shows one fixed constitution | The entry means the constitution of the entity whose agent is edited. |
| No ticket control in the pipeline view | Still none. A product-owner job assigns the entities of 4.6, with its progress per ticket. |
| Route `#pipeline/edit/constitution` | A route per entity. |
| Gate profiles and cache marks keyed by gate name and phase | Keyed by entity, gate name and phase. |
| One pipeline agent, one meter | One pipeline-agent session per entity during research, constitution and design; the meter shows each. |
| `PipelineFacts` (`pipeline`, `pipelineSetup`, `pipelineFlow`) | The same three, each with its entities. Added keys only, so single mode reads what it reads today. |

## 6. Rules the redesign must keep

- The owner runs no command: no sentence in the Bridge names a command line or a flag.
- Internal values are string-literal unions; a display word exists only where it differs from the value.
- The Bridge imports the design system only through the entries its `package.json` exports, and the design system's
  `CONSTITUTION.md` governs any change to it.
- Everything the Bridge reaches stays DOM-safe.
- Single mode is not restyled or restructured by this work.

## 7. Out of scope

- The visual design.
- The Kanban, ticket and merge-queue views, which gain an entity filter and the stages of a crossing ticket; the
  strategy's step 6 covers them.
- Folder forges. They have no entities and keep today's builder.

## 8. Questions for the redesign to answer

- How the owner keeps their place when a forge has many entities (ten or more).
- How an entity without gates or with the default constitution is made noticeable without blocking Apply.
- How the per-entity agent chats and the forge-level chat relate, and where a question from one entity's session
  shows when the owner is at another level.
- How the Changes list stays readable when one gesture (copy to another entity) makes many edits.
