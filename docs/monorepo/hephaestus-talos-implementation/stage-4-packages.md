# Stage 4: The standing contract and the served facts

## Goal

`packages/forge-contracts` declares the board document and the board's command kinds with types of its own, which import
nothing from forge's model. Forge maps its model into that document and each contract command into its model in typed
adapters of its own, and serves the document at `GET /api/v1/board`. The document carries the finished facts that the
Bridge's views compute today with forge's code: attention entries with a typed target, worded notices and warnings,
today's figures, open decisions in answering order, the controls each ticket and job offers, resolved priority, stop
holds, repeat-review facts, effective pipelines per entity, limits and defaults, and a question's recommendation. Each
refusal reaches a client as its reason code, its structured fields and the sentence the command line prints. The forge
keeps an unfinished entities draft and refuses Continue and Apply while any of its refusals stands. The tracker model,
its spec helpers, the readings and the refusal wording stay in `apps/forge`; no package is extracted. Forge's system
version is one minor higher, `bun run verify` is green at the root, and a forge on a scratch board serves the document
end to end.

## Depends on

Stages that must be finished before the first work package starts:

- **Stage 1**, so the base does not move under the stage.
- **Stages 2 and 3**, merged. Both raise forge's system version and add to `forge-contracts` (stage 3 adds
  `interrupted-work-resume`, the `presence` endpoint and the helper `endpointAddedIn` of its WP3.12, which WP4.8 uses).
  Stage 3's new causes, resume policy and log records are part of what the board document maps. Every count and line
  number below is read at `b4174bd9`; each work package reads its cited places again on the tree it runs on.

Stage 5 runs after this stage. Nothing of the model moves, so the store port works on
`apps/forge/src/lib/tracker-model/` where it is, but the two stages change the same files (the command union, the
control service, the command route and the refusal wording among them), so no package of stage 5 runs beside one of
this stage.

What this stage hands to later stages:

- **Stage 6 (Gaia hosts the views):** the board document at `GET /api/v1/board` (registry endpoint `board` at version
  1), its part documents and the value lists of its unions in `forge-contracts`, the board command kinds as
  `ForgeBoardCommand` in `forge-contracts/BoardCommand`, and every refusal as a `ForgeRefusalDocument`. Gaia maps the
  board document into its own model in `apps/gaia/src/adapters/forge-api/`; the page imports no `forge-contracts` type
  (decision 51). Every fact a moved view reads is served, so a view's model reads a fact and recomputes no forge rule.
  The worker model and effort and the rework threshold arrive here as limits and defaults (WP4.10), so stage 6's WP6.1
  adds none of them. Gaia stays at the forge version stage 3 left until stage 6 raises `SUPPORTED_FORGE_VERSION`.
- **Stage 6's event stream:** the stream's `board` event and its part events (`job`, `decision`, `incident`,
  `pipeline`) at their versioned path carry this stage's documents, built by this stage's assembly (WP4.8); stage 6
  versions the stream and adds the handshake.
- **Stage 8 (shrink the HTTP surface):** `GET /api/state` and the unversioned `board` event stay the Bridge's and the
  CLI's internal reading until the Bridge is deleted; the monitor document's `route` strings stay Bridge fragments
  until then. Flint's brain is in no contract document of this stage.
- **Stage 9 (rename):** the contract's documents keep today's word `overseer` in field names (`overseer` on the board
  document, `OverseerRuntimeState`); renaming them is part of the rename.

## Decisions this stage carries out

- **2:** the forge owns the data model; a client reads documents and sends commands.
- **11:** a question's recommendation stays visible: forge maps the vendor's mark into a field of the decision document
  (WP4.10).
- **19:** the read API is versioned: the board document is served at `/api/v1/board` under a new system minor.
- **22 and 47:** outside the forge, state changes through a command; the kinds the views send join the contract.
- **25:** Flint's brain is left out of the core: no contract document of this stage carries it.
- **32:** nothing that exists has to be kept: the setup record's stored format and the command route's refusal body
  change outright; no older shape is read.
- **33 and 49:** no package is created. Forge and Gaia share only `forge-contracts` and `system-versions`; the tracker
  model, its spec helpers, the readings (`src/shared/monitor/`) and the refusal wording stay in `apps/forge`.
- **44:** the forge keeps an unfinished entities draft; Continue and Apply are refused while any refusal stands
  (WP4.11).
- **45:** forge serves each refusal as its reason code, its structured fields and the command line's sentence (WP4.12).
- **50:** the contract's types stand alone; forge maps model to documents and commands to model in typed adapters of its
  own, and serves finished facts in the board document.
- **51:** the contract names no client and holds no mapping; each client maps the documents into its own model.

Decisions of the run that this stage takes:

- **The board document is a new endpoint, `board`, not `state`.** `GET /api/state` serves the internal `BoardState`,
  the status document spread with an index signature, and the Bridge and the CLI read it
  (`apps/forge/cli/tracking/status/ConfinementInForceReading.ts:19`, `apps/forge/cli/overseer/OverseerCommand.ts:150`).
  A versioned path is served by rewriting it to the unversioned route (`OverseerServer.ts:601-620`), so a contract
  document at `/api/v1/state` would be the internal body. The contract's document is served at `/api/board` and
  registered as `board` at version 1; `/api/state` is never registered.
- **The contract's documents mirror the field names the Bridge's documents read** (`apps/forge/bridge/@types/`, seven
  files, and `apps/forge/bridge/views/agents/AgentJobDocument.ts`), with typed jobs, decisions and incidents in place of
  `IdentifiedRecord`, typed notices in place of `{ kind, [fact]: unknown }`, and pipeline history entries in place of
  raw log records. The views stage 6 moves then map field for field.
- **The value lists of the wire's unions join the contract** (gate phases, the role lists, agent efforts, statuses):
  the views iterate them. The contract's README widens "types, versions and the registry only" to name them.
- **Forge's command union keeps its own members**, typed in the model's terms. A contract command is mapped into it by
  a typed util, and a spec holds every contract kind mapped.
- **`pipeline-draft-edit` carries typed edits**, the contract's union of a draft edit, not encoded field strings. The
  CLI's `pipeline edit <field> <value>` keeps its grammar and maps it to a typed edit at the CLI boundary through
  forge's own codec. The pipeline agent's `pipeline-draft-propose` is not a contract kind and keeps its field grammar.
- **The served sentence of a refusal is the command line's**, from `OperationRefusalWordingUtil.messageOf`, on the
  command route and in every document. The `api` channel of the wording util stays for the CLI's `--json` answer
  (`cli/utils/ProgramAnswerUtil.ts:37`) and the Bridge's two readers until stage 8.
- **The structured fields of a refusal are typed as JSON values in general** and with a union of their own for the
  entity refusals, which a view places on an entity's row.
- **A board command is offered when forge's own rule accepts it now.** The controls a ticket and a job offer are a
  query of the Board, built from the predicates its moves check, and a spec holds that every offered command is accepted
  and every other refused. Where today's Bridge offers differently (`DetailControlsModel.ts:55-74` is a hand copy), the
  Board's answer wins and the commit lists the differences.
- **Today's figures carry their calendar date.** A reader shows them only on that date; the forge does not republish at
  midnight.
- **A question's recommendation is a stored field.** The agent adapter, the one place that knows the vendor's mark,
  strips it from an option's label when it maps the question, and the stored decision's option carries
  `isRecommended` (stage 2, WP2.26). The decision document's option carries that label and `recommended`, the stored
  `isRecommended`; no forge adapter imports the agent adapter (`src/AgentBoundary.spec.ts`,
  `src/ImportDirection.spec.ts`).
- **`forge-contracts`' own version** rises by one minor with this stage's system minor, from whatever stage 3 left,
  and from here on with every system minor, as its README says.
- **The committed ticket's rules are not this stage's** (decision 48, Out of scope): this stage only names the status
  `committed` in the contract's vocabulary and serves `noAgentHasPickedItUp`.

## Today's code

Read at `b4174bd9`.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The tracker model, 117 shipping files, 548 importers in forge | `apps/forge/src/lib/tracker-model/` | Kept in place; the mappers read it |
| The readings: attention entries, today's figures, notice, draft and open-decision utils, the Bridge fragment util | `apps/forge/src/shared/monitor/` | Kept; `AttentionEntries.ts` gains a typed target (WP4.10) |
| The monitor document already serves attention entries, notices, warnings and today's figures, worded and computed from the board state | `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts:352-356`; `packages/forge-contracts/@types/MonitorSnapshotDocument.ts:151-170` | Kept; the board document serves the same readings (WP4.10) |
| The monitor's attention entries carry a Bridge fragment as `route` | `MonitorSnapshotDocument.ts:60`; `src/shared/monitor/utils/BridgeFragmentUtil.ts:7-9` | Kept until stage 8; the board document carries a typed target |
| `forge-contracts` at package version `1.0.0`: 9 command kinds, the identity, summary and monitor documents, versions and registry; its modules import only `system-versions/` | `packages/forge-contracts/package.json:3`, `:8-19`; `PackageIsolation.spec.ts:18`, `:31-38` | Gains the board document, the board commands and the refusal document; the isolation guard already refuses an import of forge's model |
| The README: "Types, versions and the registry only" | `packages/forge-contracts/README.md:21-24` | Widened to the value lists of the wire's unions (WP4.6) |
| forge's system version 1.18, before stages 2 and 3 | `packages/forge-contracts/constants/ForgeSystemVersions.ts:41` | Raised one minor over what stage 3 left (WP4.4) |
| The registry's endpoints, each at 1.0 | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:38-49` | Gains `board` at version 1 (WP4.8) |
| `GET /api/state` answers the internal `BoardState`; a versioned path is rewritten to its unversioned route | `apps/forge/src/services/overseer/OverseerServer.ts:539`, `:601-614` | `/api/state` kept unregistered; `/api/board` added (WP4.8) |
| `BoardState`: an index signature over the spread status document, `notices: unknown[]`, raw `Decision[]` and `Incident[]`, `batonPassWarning: unknown` | `apps/forge/src/services/overseer/BoardState.ts:46`, `:168-186`, `:342-379` | Kept as the internal reading; the mapper reads it (WP4.8) |
| The status document is built as an untyped `object` | `apps/forge/cli/StatusDocuments.ts:25`, `:41-63` | Typed (WP4.7) |
| The Bridge's documents: field mirrors of the served state, importing model types | `apps/forge/bridge/@types/BoardStateDocument.ts` (222 lines) and six slice files; `bridge/views/agents/AgentJobDocument.ts` | Kept in the Bridge until stage 8; the contract redeclares their fields with its own types (WP4.6) |
| The board document's `jobs`, `decisions` and `incidents` are `IdentifiedRecord`, `notices` an index signature, `usage` `unknown` | `bridge/@types/BoardStateDocument.ts:20-22`, `:41-44`, `:177-181` | Typed documents of their own in the contract (WP4.6) |
| The pipeline facts are a served document type that sits in the model: "values only, never words" | `apps/forge/src/lib/tracker-model/@types/PipelineFacts.ts:1-3` (339 lines); `Pipeline.ts` (177), `PipelineSetup.ts` (462) | Redeclared as contract documents; the model's types stay (WP4.6) |
| forge's command union: 79 kinds, the board kinds among them, `pipeline-draft-edit` with field strings | `apps/forge/src/shared/@types/ControlCommand.ts:38-56`, `:67-258`, `:205` | Kept; a contract command maps into it (WP4.5) |
| The Bridge sends 34 kinds outside the control contract's 9 | a syntax-tree scan of the Bridge's shipping files against `ControlCommand.ts` | Join the contract (WP4.5) |
| The draft edits arrive as field strings and are read into typed edits | `apps/forge/src/services/control/PipelineSetupControls.ts:137-145`; `src/adapters/pipeline-setup/SetupPayloadSchemas.ts` | Read as typed edits (WP4.5) |
| Senders of `pipeline-draft-edit`: the CLI verb and two Bridge models, the entities step through the flow sender | `apps/forge/cli/pipeline/PipelineEdit.ts`; `bridge/views/pipeline/flow/PipelineFlowModel.ts`, `bridge/views/pipeline/editing/CopyBetweenEntitiesDialogModel.ts` | Send typed edits (WP4.5) |
| A refused command answers 409 `{controlVersion, refusal, text}` with the API sentence | `apps/forge/cli/overseer/routes/CommandRoute.ts:3-4`, `:107-110`; `cli/overseer/routes/OverseerRoutes.ts:100` | Answers `{controlVersion, refusal, fields, text}` with the command line's sentence (WP4.12) |
| The wording util words each refusal for two channels, `command-line` and `api` | `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts:35`, `:707`, `:938-944` | Kept; the served sentence is `messageOf`'s |
| A draft edit that leaves an unstorable draft is refused `pipeline-draft-invalid` with the first refusal | `PipelineSetupControls.ts:445-450`, `:477`, `:506`, `:529`; `PipelineAgentControls.ts:89` | An entity refusal refuses no edit (WP4.11) |
| The setup record's draft is read through the stored pipeline's reader, which checks the entities together | `apps/forge/src/adapters/pipeline/PipelineSetupFile.ts:290-294`; `PipelineFile.ts:483-495` | The draft is read without the set check (WP4.11) |
| The entities step holds edits on the page until the set validates | `apps/forge/bridge/views/pipeline/setup/EntitiesStep.tsx:176-195`; `EntityRefusalsModel.ts:86-87` | Kept in the Bridge; Gaia reads served refusals (stage 6) |
| The entity validator returns verdicts with keys, no wording | `apps/forge/src/lib/tracker-model/utils/EntityValidationUtil.ts:9-18` | Kept; its verdicts are served (WP4.11) |
| Continue and Apply | `apps/forge/src/lib/tracker-model/PipelineSetups.ts:301-317`, `:734-760`, `:924-936` | Refuse while entity refusals stand (WP4.11) |
| The Bridge predicts the E94 Apply refusal | `bridge/views/pipeline/apply/ApplyDialogModel.ts:133-153` | Kept in the Bridge; the Apply refusal is served (WP4.10) |
| The Bridge decides a ticket's controls by hand-written status comparisons | `apps/forge/bridge/views/detail-panel/DetailControlsModel.ts:55-74` | Kept in the Bridge; offered controls are served (WP4.10) |
| Rule constants the views read: status classes, first repeat-review round, default priority, stop holds, concurrency bounds, worker model and effort, rework threshold | `tracker-model/constants/Statuses.ts:16-22`, `ReviewRounds.ts:2`, `TicketFields.ts:18`, `JobStopHolds.ts:11`, `ConcurrencyLimits.ts:2-8`; `src/shared/constants/OverseerLimits.ts:37-39`, `DispatchProtocol.ts:10` | Kept in forge; their effect is served (WP4.10) |
| A question's recommendation is a `(Recommended)` suffix the Bridge reads off the label (stored as `isRecommended` on the decision's option from stage 2's WP2.26 on) | `bridge/views/question-panel/QuestionPanelModel.ts:229`, `:239`; `tracker-model/@types/Decision.ts:35-46` | Served as a field (WP4.10) |
| Boundary recordings of the command routes, the server and the Bridge's command client | `apps/forge/src/testing/recordings/darwin/cli__overseer__routes.json`, `src__services__overseer__OverseerServer.ts.json`, `bridge__api__CommandClient.ts.json` | Recorded again where a work package changes the answer |
| Gaia supports forge 1.1 and warns while forge is ahead | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` | Kept (stage 6 raises it) |

## Work packages

Every work package runs in its own worktree under `.claude/worktrees/<name>`, cut from the integration branch after the
packages it depends on merged, and ends with a single commit: one plain subject line, no AI attribution, never
`--no-verify`. Every work package leaves `bun install --frozen-lockfile && bun run verify` green at the root.

Order and parallelism:

```
WP4.4 ──┬─► WP4.5 ─────────────────────────────────────┐
        ├─► WP4.6 ─┬─► WP4.8 ──► WP4.10 ──► WP4.11 ◄───┘ ──► WP4.9
        ├─► WP4.7 ─┘               ▲
        └─► WP4.12 ────────────────┘
```

- WP4.4 runs **alone**, first: it raises the version every later package adds under, so no two packages edit
  `ForgeSystemVersions.ts`.
- WP4.5, WP4.6, WP4.7 and WP4.12 may run **in parallel**. WP4.5, WP4.6 and WP4.12 append `exports` entries and README
  rows to `packages/forge-contracts`, and WP4.5 and WP4.12 change different functions of `CommandRoute.ts`; the second
  to merge rebases and keeps both.
- WP4.8 runs after WP4.6 and WP4.7. WP4.10 runs after WP4.8 and WP4.12. WP4.11 runs after WP4.10 and WP4.5: it edits
  the same assembly and serves fixes as typed edits. WP4.9 runs last.

### WP4.4: Raise the system version and the contract package's version

**Purpose.** Forge's system version rises by one minor for everything this stage adds, and `forge-contracts`' own
version rises with it. Runs alone, first; small.

**Files.**

- Change: `packages/forge-contracts/constants/ForgeSystemVersions.ts`, `packages/forge-contracts/package.json`,
  `packages/forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts` (only if it pins the current version),
  `apps/forge/docs/reference/overseer-api.md` (section "System versions"), `bun.lock` if the version change moves it.

**What to do.**

1. `ForgeSystemVersions.ts`: raise `current.minor` by one over what stage 3 left. Call that version **S4** below.
   Append one clause to the docblock's list of minors: S4 adds the board document at `/api/v1/board`, the board
   command kinds, the refusal's structured fields and the command line's sentence on a refused command, and keeps an
   unfinished entities draft; each only adds.
2. `package.json` of `forge-contracts`: raise `version` by one minor over what it has on the tree (`1.0.0` at
   `b4174bd9`, unless stages 2 and 3 raised it). Run `bun install` at the root once; commit `bun.lock` if it changed.
3. `overseer-api.md`, "System versions": name S4 and what it adds, as in step 1.

**Specs to write or change.** None new. `ForgeCompatibilityRegistry.spec.ts` must stay green: no endpoint is added
here, so a client built for S4 calls the endpoints a client of the version before calls.

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun run lint && bun test
cd ../../apps/gaia && bun run check          # prints the warning that Gaia supports an older forge, and exits 0
cd ../.. && bun install --frozen-lockfile && bun run verify                            # green
```

### WP4.5: The board commands join the contract with types of their own

**Purpose.** Every command kind the Bridge sends is declared in `forge-contracts` with payload types the contract
declares itself. `pipeline-draft-edit` carries typed edits. Forge maps each contract command into its own command union
in a typed adapter. Parallel with WP4.6, WP4.7 and WP4.12; ordered with stage 5's WP5.6 and WP5.7.

**Files.**

- Create `packages/forge-contracts/@types/BoardCommand.ts` ("Interfaces introduced", item 3).
- Create `apps/forge/src/adapters/board-commands/utils/BoardCommandMappingUtil.ts` and its spec: the contract's
  command to forge's.
- Create `apps/forge/cli/overseer/routes/CommandRoute.boardContract.spec.ts`: the pin of the board kinds, beside
  `CommandRoute.controlContract.spec.ts`.
- Create `apps/forge/bridge/CommandKindsInContract.spec.ts`: a guard at the Bridge's root, like
  `bridge/StyleContract.spec.ts`, since it reads the Bridge's sources.
- Change: `packages/forge-contracts/package.json` (`exports`) and `README.md`;
  `apps/forge/src/shared/@types/ControlCommand.ts` (`pipeline-draft-edit`'s `edits`);
  `apps/forge/src/shared/constants/OverseerApiContracts.ts`; `apps/forge/cli/overseer/routes/CommandRoute.ts`;
  `apps/forge/src/services/control/PipelineSetupControls.ts`;
  `apps/forge/src/adapters/pipeline-setup/SetupPayloadSchemas.ts` and its spec;
  `apps/forge/cli/pipeline/PipelineEdit.ts`; `apps/forge/bridge/views/pipeline/flow/PipelineFlowModel.ts`,
  `bridge/views/pipeline/editing/CopyBetweenEntitiesDialogModel.ts`, `bridge/views/pipeline/setup/EntitiesStepModel.ts`
  and the sender they share; `apps/forge/docs/reference/overseer-api.md` (section "Commands"); `apps/forge/docs/cli.md`
  if it shows the body.

**What to do.**

1. Measure the kinds first. List every `ControlCommand` kind that appears as the value of a `kind` property in an
   object literal of a shipping file of `apps/forge/bridge/` (not `*.spec.ts`, not `*.dom.tsx`, not `testing/`),
   taking both branches when the value is a conditional of two string literals (`bridge/shell/Header.tsx`). Use the
   TypeScript syntax tree, not a text search: a `case 'pipeline-gates-none':` in
   `bridge/views/pipeline/live/FlowActivityPanelModel.ts` names a log record. Subtract `CONTROL_CONTRACT_KINDS`
   (`OverseerApiContracts.ts:26-36`, plus what stage 3 added). At `b4174bd9` the result is the 34 kinds of
   "Interfaces introduced", item 3; use the measured list if it differs and name the difference in the commit's body.
2. Write `BoardCommand.ts`. Every payload type is declared in the file or imported from another contract file:
   `ChartRangeRequest`, `TrackerClearScope`, `DecisionAnswerFormDocument`, `PictureReferenceDocument`, `EntityKey`,
   `PipelineBillingDocument`, `ConstitutionSourcesDocument`, `PipelineSetupStep`, `TicketPriority`, `GatePhase` (the
   unions from `constants/BoardVocabulary.ts` of WP4.6 where they are value lists; if WP4.6 has not merged, declare the
   union here and let WP4.6 move it, whichever merges second rebases), and `PipelineDraftEditDocument`, the typed edit:
   field for field the model's `PipelineDraftEdit` (`tracker-model/@types/PipelineSetup.ts:401-419`) with the types it
   names redeclared. Every field and array `readonly`. `job-stop`'s mode is `ForgeJobStopMode`.
3. Add `"./BoardCommand": "./@types/BoardCommand.ts"` to `exports` and a README row.
4. `ControlCommand.ts`: `pipeline-draft-edit`'s `edits` become `readonly PipelineDraftEdit[]` (the model's typed edit).
   The other board members stay as they are. `PipelineFieldEdit` stays forge's, for the agent's
   `pipeline-draft-propose`.
5. `SetupPayloadSchemas.ts`: add `typedDraftEditReadingOf(value, index)`, which reads one typed edit structurally
   (target, keys, value shapes) into a `PipelineDraftEdit` or a `malformed` verdict naming the field; the field-string
   reader stays for the agent's proposals. `draftEditsFieldOf` (`PipelineSetupControls.ts:137-145`) uses the typed
   reader.
6. `cli/pipeline/PipelineEdit.ts`: map the verb's `<field> <value>` to a typed edit with forge's codec
   (`PipelineDraftEditUtil` and `SetupPayloadSchemas.draftEditReadingOf`) before it builds the command. The verb's
   grammar and wording do not change.
7. The Bridge's senders send typed edits: delete `EntitiesStepModel.fieldEditsOf` and the field encoding in
   `PipelineFlowModel.ts` and `CopyBetweenEntitiesDialogModel.ts`; they already hold `PipelineDraftEdit` values.
8. `BoardCommandMappingUtil.controlCommandOf(command: ForgeBoardCommand): ControlCommand`: one branch per kind, typed,
   copying each readonly array into the model's form; `pipeline-draft-edit`'s edits map from
   `PipelineDraftEditDocument` to `PipelineDraftEdit`. The branches sit in a `Record<ForgeBoardCommand['kind'], ...>`
   so a new contract kind fails the typecheck until it is mapped.
9. `CommandRoute.ts`: a body of a board kind that passed the route's field checks (`:152`) is handed to the service
   as `controlCommandOf`'s result. A body that fails the typed reading answers 400 `malformed-body` as today.
10. `OverseerApiContracts.ts`: add `BOARD_COMMAND_CONTRACT_KINDS`, the measured kinds in the order of
    "Interfaces introduced", `as const satisfies readonly ForgeBoardCommand['kind'][]`, and correct the docblock of
    `CONTROL_CONTRACT_KINDS` (`:21-25`): every kind in neither list may change without raising the system version.
11. `overseer-api.md`: a subsection "Board commands" under "Commands" listing the kinds, the typed draft edit, and that
    they are part of the contract from S4 under `controlVersion` 1.
12. Record again `cli/overseer/routes` (`bun run record cli/overseer/routes` in `apps/forge`) and commit the recording,
    since a `pipeline-draft-edit` body changed.

**Specs to write or change.**

- `CommandRoute.boardContract.spec.ts`, its docblock saying which cases matter: `BOARD_COMMAND_CONTRACT_KINDS` covers
  `ForgeBoardCommand['kind']` exactly, both ways (a type-level check annotated `true`, and a runtime comparison against
  the keys of a `Record<ForgeBoardCommand['kind'], true>`); no kind is in both lists; one board kind applied through the
  route answers 200 `{controlVersion: 1, outcome, result}` on a scratch board (`ticket-priority` on a filed ticket,
  outcome `done`), and a body of that kind with no `ticketReference` answers 400 `malformed-body`; a
  `pipeline-draft-edit` with a typed `within-entity` edit lands, and one with a field string is malformed.
- `BoardCommandMappingUtil.spec.ts`: each kind maps to forge's command of the same kind with equal fields; a typed
  draft edit of each target maps to the model's.
- `SetupPayloadSchemas.spec.ts`: the typed reader reads each target and refuses a missing key, a wrong value shape and
  an unknown target, each naming the field.
- `bridge/CommandKindsInContract.spec.ts`: every kind a shipping Bridge file sends is in `CONTROL_CONTRACT_KINDS` or
  `BOARD_COMMAND_CONTRACT_KINDS`. It proves its scan (it finds `overseer-pause` in `bridge/shell/Header.tsx` and at
  least 30 kinds), and plants a file sending `ticket-add` (refused) and one with `case 'pipeline-gates-none':` (passed).
- The CLI's spec of `pipeline edit` keeps passing with the typed body; the Bridge's DOM specs of the flow and copy
  dialogs keep passing.

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./cli/overseer/routes/ \
  ./src/adapters/board-commands/ ./src/adapters/pipeline-setup/ ./cli/pipeline/ ./bridge/CommandKindsInContract.spec.ts
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

### WP4.6: The board documents join the contract with types of their own

**Purpose.** The documents a board view reads are `forge-contracts` types that import nothing from forge's model: the
board document and its parts, with the value lists of the wire's unions. Nothing serves them yet; WP4.8 does. Parallel
with WP4.5, WP4.7 and WP4.12.

**Files.**

- Create in `packages/forge-contracts/`: `constants/BoardVocabulary.ts`, `@types/ForgeBoardDocument.ts`,
  `@types/BoardPageDocuments.ts`, `@types/BoardJobDocuments.ts`, `@types/BoardConversationDocuments.ts`,
  `@types/BoardPipelineDocuments.ts`, `@types/BoardMergeQueueDocument.ts`, `@types/BoardLimitsDocument.ts`
  ("Interfaces introduced", items 1 and 2).
- Create `apps/forge/src/adapters/board-document/BoardVocabulary.parity.spec.ts`: each contract union against the
  model's.
- Change: `packages/forge-contracts/package.json` (`exports`) and `README.md` (the exports table and "What it holds").

**What to do.**

1. Read every field the Bridge's documents declare: `apps/forge/bridge/@types/BoardStateDocument.ts`,
   `ConversationDocuments.ts`, `DetailBoardState.ts`, `EpicsBoardState.ts`, `KanbanBoardState.ts`,
   `ProgressBoardState.ts`, `TicketsBoardState.ts`, the limits types (`bridge/utils/TimeUtil.ts:12-24`,
   `bridge/@types/Timeline.ts:4-16`) and `bridge/views/agents/AgentJobDocument.ts`, and the model types they name
   (`PipelineFacts.ts`, `Pipeline.ts`, `PipelineSetup.ts`, `Task.ts`, `Ticket.ts`, `Job.ts`, `Draft.ts`, `Decision.ts`,
   `Incident.ts`, `LogRecord.ts`, `TicketForecast.ts`, `TrackerProgress.ts`).
2. Write `BoardVocabulary.ts`: each union the documents name that a view iterates or compares, as a value list
   `as const` and its type (`export type GatePhase = (typeof GATE_PHASES)[number]`): ticket statuses, priorities, types
   and sizes, display states, task phases and statuses, ticket stages, draft states, job states, gate phases, the
   pipeline agent roles, the forge-level agent roles, entity kinds and agent efforts. A union no view iterates is a type
   only. The ticket statuses read `draft`, `ready-for-review`, `committed`, `in-progress`, `in-review`, `reviewed`,
   `delivered`, `abandoned`, and the task statuses, task phases and display states say `committed` where the model
   still says `pending`: committed is the state's name (decision 48), and stage 5's WP5.14 renames the model's value.
3. Write the part documents with the field names the Bridge's documents use, every field and array `readonly`, every
   type declared in the package. Where the Bridge has `IdentifiedRecord`, write the job, decision and incident documents
   from the Bridge's view files and the model's records (`BoardJobDocument`, `BoardDecisionDocument`,
   `BoardIncidentDocument`); where it has `LogRecord`, write `BoardPipelineHistoryEntryDocument` with the cases the
   pipeline history shows (`bridge/views/pipeline/live/FlowActivityPanelModel.ts` lists them). `notices` become
   `BoardNoticeDocument` (WP4.10 adds the sentence), `usage` becomes `BoardUsageDocument`.
4. Leave out what is not the contract's: Flint's brain (`flintBrain`, decision 25), the Bridge's identity view
   (`OverseerIdentity`), the session and embed fields, and the view models `Timeline.ts` and `DependencyGraph.ts`.
5. Word each docblock for any reader: "a view", never "the Bridge" (`README.md:3-5`); no client word may appear
   (`PackageIsolation.spec.ts:21`).
6. Add the eight entries to `exports` and README rows. Widen "What it holds" to "Types, versions, the registry, and the
   value lists of the unions its documents carry".
7. Write the parity spec in forge: for each union of `BoardVocabulary.ts`, a helper type
   `MutuallyAssignable<ContractUnion, ModelUnion>` annotated `true`, and for each value list a runtime equality with the
   model's list where the model has one (`GATE_PHASES`, the role lists, `AGENT_EFFORTS`). The four unions that hold the
   status compare with the model's union with `pending` replaced by `committed` (`Exclude<ModelUnion, 'pending'> |
   'committed'`); WP5.14 deletes that replacement with the model's rename.

**Specs to write or change.**

- `BoardVocabulary.parity.spec.ts`, its docblock: "What matters: the contract's vocabulary is the model's, so a value
  added on either side fails here before a reader meets it." A planted mismatch is a compile error, which the typecheck
  watches; the docblock says so.
- `forge-contracts/PackageIsolation.spec.ts` passes on the new files unchanged: no import outside `system-versions/`,
  no client word.

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/adapters/board-document/
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
grep -rn "tracker-model\|apps/" packages/forge-contracts --include='*.ts'                          # prints nothing
```

### WP4.7: Type the status document that the board state spreads

**Purpose.** The `status --json --full` document has a named type, so the board state's fields that come from it
(`project`, `concurrency`, `confinement` and the rest) are typed, and the mapper of WP4.8 reads them without the index
signature. Parallel with WP4.5, WP4.6 and WP4.12.

**Files.**

- Create `apps/forge/src/adapters/@types/StatusDocument.ts`: in the adapters layer because its fields are the return
  types of adapter utils (`StatusDocumentUtil`, `ProgressFileMappingUtil`, `TicketJsonUtil`).
- Change: `apps/forge/cli/StatusDocuments.ts` (`:25`, `:41-63`); `apps/forge/src/services/overseer/BoardState.ts`
  (`:137`, `:168-169`, `:357`); every reader of a field of `BoardState` through its index signature.

**What to do.**

1. Write `FullStatusDocument` with one key per key `fullDocumentOf` writes (`StatusDocuments.ts:46-62`), each typed by
   its producer (`ReturnType<typeof StatusDocumentUtil.boardWorkOf>` and the like); give `derivedDocumentOf`'s
   `concurrency` (`:25`, typed `object`) its real type.
2. `fullDocumentOf` returns `FullStatusDocument`. `workingDocumentOf` keeps `object`: the board state does not spread
   it.
3. `BoardStateReading.statusDocument` (`BoardState.ts:137`) becomes `FullStatusDocument`. Replace the index signature
   (`:169`) by extending `Omit<FullStatusDocument, <the keys BoardState declares itself>>`.
4. Fix every reader that read an undeclared field through the index signature, `summaryOf`'s
   `state['ticketCountByStatus']` (`BoardState.ts:390`) among them; the typecheck lists them.

**Specs to write or change.** The spec of the `status` command that prints `--json --full`: the printed document's
keys equal the keys `FullStatusDocument` names, both ways, read from a scratch board (a frozen key list taken from
today's output, with a comment saying how to retake it). `BoardState.spec.ts` keeps passing unchanged.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/BoardState.spec.ts \
  ./cli/tracking/status/
grep -n "\[statusField: string\]" src/services/overseer/BoardState.ts                 # prints nothing
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

### WP4.8: Forge maps its board into the contract and serves it at v1

**Purpose.** A typed output mapper in forge's adapters turns the model and the board state into the contract's board
document, and the Overseer serves it at `GET /api/v1/board`. The mapper's types are the proof that the served document
is the contract's. Runs after WP4.6 and WP4.7.

**Files.**

- Create in `apps/forge/src/adapters/board-document/utils/`: `BoardPageMappingUtil.ts`, `BoardJobMappingUtil.ts`,
  `BoardConversationMappingUtil.ts`, `BoardPipelineMappingUtil.ts`, `BoardMergeQueueMappingUtil.ts`, each with its
  spec: pure mappers from model records and facts to the part documents.
- Create `apps/forge/src/services/overseer/BoardDocumentAssembly.ts` and its spec: the board document from a
  `BoardState` and its reading, built from the mappers.
- Change: `apps/forge/src/services/overseer/OverseerServer.ts` (the `/api/board` route), the routes object that
  answers `state()` (add `board()`), `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts` and its spec,
  `packages/forge-contracts/README.md` (the `ForgeBoardDocument` row names its path),
  `apps/forge/src/services/overseer/OverseerServer.spec.ts`, `apps/forge/src/testing/RecordedOverseerFetch.ts` if a
  replayed call needs the new path, `apps/forge/docs/reference/overseer-api.md` (sections "Routes", "Versioned paths"
  and a new "The board document").

**What to do.**

1. Write each mapper as a util of pure functions, one per part: the model's types in, the contract's out, every field
   named, no spread of a model record into a document, so a field added to the model reaches no reader until a mapper
   names it. A ticket's or a row's status, a task phase and a display state map the model's `pending` to `committed`
   in one function of `BoardPageMappingUtil.ts`, which WP5.14 deletes. Map a log record to a pipeline history entry
   only for the cases `BoardPipelineHistoryEntryDocument` declares, and drop the others.
2. Write `BoardDocumentAssembly.boardDocumentOf(state: BoardState): ForgeBoardDocument`, typed by its return, reading
   the typed status fields of WP4.7. It computes nothing a mapper does not.
3. Serve it: `dataRouteOf` (`OverseerServer.ts:535-552`) answers `GET /api/board` with `routes.board()` behind
   `readerIsAuthorized`, as `/api/state`. The routes object builds `board()` from the same state reading as `state()`.
4. Register it: `endpointAddedIn('board', 1, S4)` in `ForgeCompatibilityRegistry.ts`. The server then serves
   `/api/v1/board` by its rewrite (`OverseerServer.ts:601-620`). `/api/state` stays unregistered.
5. `ForgeCompatibilityRegistry.spec.ts`: the current endpoints gain `'endpoint board at v1'`; correct the header
   sentence that says the endpoints are the same since 1.0; a client built for the version before S4 is served no
   `board` endpoint, one built for S4 calls it at version 1.
6. `overseer-api.md`: the routes table and the versioned paths gain `GET /api/v1/board`; a section "The board
   document" points to `forge-contracts/ForgeBoardDocument` as the one description of its fields and says
   `GET /api/state` is internal.
7. Record again `src/services/overseer/OverseerServer.ts` (`bun run record src/services/overseer/OverseerServer.ts`)
   and commit the recording.

**Specs to write or change.**

- Each mapper's spec against its own contract: a fixture record of each kind maps to the document field by field; an
  optional model field absent stays absent or `null` as the document declares; a log record of an undeclared case maps
  to no history entry.
- `BoardDocumentAssembly.spec.ts`, its docblock: "What matters: the document a client reads is built from the same
  reading the Bridge's state is, field for field where both carry a field." On a scratch board with a ticket, a job, a
  decision, an incident and an open pipeline setup, each field the Bridge's documents also read holds the value
  `BoardState` holds.
- `OverseerServer.spec.ts`: `GET /api/v1/board` with the token answers 200 with the assembly's document; without the
  token, 401; `GET /api/v2/board`, 404 `not-found`; `GET /api/state` answers as before.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/adapters/board-document/ \
  ./src/services/overseer/BoardDocumentAssembly.spec.ts ./src/services/overseer/OverseerServer.spec.ts
cd ../../packages/forge-contracts && bun test
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

### WP4.9: The documents that describe the contract

**Purpose.** The prose outside the code says where the board document, the board commands and the refusal document
live, and that the model, the readings and the wording stay in forge. Documents only; runs last.

**Files.**

- Change: `docs/monorepo/design.md` (the paragraph on `forge-contracts`, today `:114-116`, and the package layout, today
  `:35-45`, only where it names what `forge-contracts` holds); `apps/forge/docs/reference/overseer-api.md` (section
  "BoardState", today `:364` and on: internal, read by the Bridge and the CLI; the contract's document is "The board
  document"); `apps/forge/CLAUDE.md` (the imports diagram's `forge-contracts` line names the board document and the
  mappers in `src/adapters/board-document/` and `src/adapters/board-commands/`; a rule: a served document is built only
  by a typed mapper, never by spreading a model record); `packages/forge-contracts/README.md` if a package left a row
  out.

**What to do.** State each fact once and point to its source of truth (the package README for what the contract holds,
`overseer-api.md` for routes and versions). Do not edit `docs/monorepo/hephaestus-talos.md`, the design record.

**Specs to write or change.** None. `DocumentSpecCitations.spec.ts` and `ProseWrap.spec.ts` must stay green.

**Done when.** `cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/DocumentSpecCitations.spec.ts
./src/ProseWrap.spec.ts` passes, and `bun install --frozen-lockfile && bun run verify` is green at the root.

### WP4.10: The board document serves the facts the views recompute

**Purpose.** Every reading and rule a Bridge view computes with forge's code today arrives in the board document as a
finished fact, so a view moved in stage 6 reads values and recomputes no forge rule. Runs after WP4.8 and WP4.12.

**Files.**

- Create `packages/forge-contracts/@types/BoardReadingDocuments.ts` ("Interfaces introduced", item 4); change
  `ForgeBoardDocument.ts`, `BoardPageDocuments.ts`, `BoardJobDocuments.ts`, `BoardConversationDocuments.ts`,
  `BoardPipelineDocuments.ts` and `BoardLimitsDocument.ts` to carry the facts below.
- Create `apps/forge/src/adapters/board-document/utils/BoardReadingMappingUtil.ts` and its spec.
- Create `apps/forge/src/services/overseer/BoardOffers.parity.spec.ts`: offered controls against the Board, and
  against today's Bridge.
- Change: `apps/forge/src/shared/monitor/AttentionEntries.ts` and its spec (a typed target beside the route);
  `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts` (the route from the target);
  `apps/forge/src/lib/tracker-model/Board.ts` and the modules it composes for the offer queries, with specs;
  `apps/forge/src/lib/tracker-model/PipelineSetups.ts` (`applyRefusalOf`); `BoardDocumentAssembly.ts` and its spec;
  the mappers of WP4.8 that gain a field; `apps/forge/docs/reference/overseer-api.md` ("The board document").

**What to do.**

1. **Attention.** `attentionEntriesOf` returns, beside today's fields, `target: BoardTarget` (`{ subject: 'decision' |
   'ticket' | 'draft' | 'job' | 'incident'; id: string }`), the thing the entry opens. The monitor assembly turns the
   target into today's `route` with `BridgeFragmentUtil`, so the monitor document does not change. The board document's
   `attention` carries the target and no route.
2. **Notices and warnings.** `notices` carry `kind`, their facts and `sentence` (`NoticeWordingUtil.noticeSentenceOf`);
   an incident-defaulted notice also carries `causeSentence` (`NoticeWordingUtil.defaultCauseTextOf`); `warnings` as the
   monitor serves them (`NoticeWordingUtil.warningsOf`).
3. **Today's figures.** `today: { calendarDate, deliveredTickets, tokens }` from `todayFiguresOf`, with the calendar
   date it counted. A reader shows them only on that date.
4. **Open decisions.** `openDecisionIds` in answering order and `escalatedDecisionIds`
   (`OpenDecisionsUtil.openDecisionsOf`).
5. **Per ticket** (`BoardTicketFactsDocument` on each page ticket): `resolvedPriority`
   (`TicketDefaultsUtil.ticketPriorityOf`); `settlesADependency`, `isClosed`, `noAgentHasPickedItUp` (the status
   classes of `Statuses.ts:16-22`; the last is `TICKET_STATUSES_EDITABLE_WITHOUT_FORCE`, which the Bridge reads as "no
   agent has claimed it", `EntityWorkModel.ts:102-107`, and which stage 5's WP5.14 names after this fact);
   `reviewRound` resolved where the views fall back to `FIRST_REPEAT_REVIEW_ROUND`, and `isRepeatReview`;
   `offers: BoardTicketOffersDocument`.
6. **Per job** (`BoardJobDocument`): `stopHolds: { stop, windDown }`, the hold each stop mode leaves
   (`jobStopHoldOf`); `offers: BoardJobOffersDocument`.
7. **Offers.** Add to the Board `ticketOffersOf(ticketId)` and `jobOffersOf(jobId)`, built from the predicates the
   moves themselves check (`TicketMoveLegality.ts`, `JobMoveLegality.ts`, the hold, park, network, priority and
   deliver-by-hand rules, the merge queue's wait), one predicate per move shared by the move and the query, never a
   second copy. A ticket offers the board command kinds it accepts now and its priority choices; a job the stop modes,
   `job-fresh` and `job-message` it accepts now.
8. **Per entity** (`BoardPipelineDocuments`): `effectivePipeline`, the pipeline an entity runs
   (`PipelineUtil.pipelineOfEntity`), on each entity of the applied pipeline and of the draft; on each draft entity
   `dependentEntityKeys`, its transitive dependents (`EntityOwnershipUtil.dependentsOf`,
   `src/lib/tracker-model/utils/EntityOwnershipUtil.ts`), which the crossing and fold dialogs show.
9. **The Apply refusal.** Add to `PipelineSetups` `applyRefusalOf(setupId, reading): BoardRefusalDetail | null`, the
   first refusal `requestApply` would give now, sharing the checks of `refuseUnappliable`, `refuseEntityChanges`,
   `refuseMovedConstitution` and `refuseMovedPipeline` (`PipelineSetups.ts:924-1012`) rather than copying them, with the
   main reading the board state already has (`PipelineSources.mainLineTexts`). The setup document carries
   `applyRefusal: ForgeRefusalDocument | null`, worded as WP4.12 words a refusal.
10. **Limits and defaults** (`BoardLimitsDocument`): the concurrency bounds (`ConcurrencyLimits.ts:2-8`), the worker
    model and effort (`OverseerLimits.ts:37-39`), the rework threshold (`DispatchProtocol.ts:10`), the default ticket
    priority, the first repeat-review round, the default instructions per agent role and the re-review step
    (`DEFAULT_INSTRUCTIONS_OF_ROLE` and `RE_REVIEW_THRESHOLD_STEP_LINES`,
    `src/lib/tracker-model/constants/PipelineDefaults.ts:5-8`), and the page limits WP4.6 declared.
11. **What stages 2 and 3 added.** Each job document carries its `interruption` cause, as the monitor job does (stage
    2's WP2.11, with stage 3's causes). The pipeline facts carry `stepRunTimes` (stage 2's WP2.20) as
    `BoardPipelineStepRunTimeDocument` (`entity`, `stepKind`, `stepName`, `phase`, `runMilliseconds`, `ending`),
    declared with types of their own.
12. **A question's recommendation.** The decision document's option carries the stored option's `label` and its
    `isRecommended` as `recommended` (stage 2, WP2.26, where the agent adapter strips the vendor's mark). Nothing here
    reads a label's mark.
13. Write `BoardReadingMappingUtil` for the readings and wire every fact into `BoardDocumentAssembly`; the readings are
    computed from the same `BoardState` the monitor assembly reads.
14. `overseer-api.md`: the board document section lists the served facts and says which are worded by forge (attention
    meta, notices, warnings, refusals) and which a reader words (state words, counts, tokens).

**Specs to write or change.**

- `AttentionEntries.spec.ts`: each attention kind's target; `MonitorSnapshotAssembly.spec.ts`: the monitor's routes
  are unchanged.
- The Board's specs of the offer queries: for every ticket status, with and without a hold, the offered kinds; for
  every job state, the offered modes.
- `BoardOffers.parity.spec.ts`, its docblock: "What matters: an offered command is one the Board accepts, and a command
  not offered is one it refuses." For each ticket status and hold state on a fixture board, every board ticket kind is
  applied in a fresh copy: an offered kind is accepted, any other refused. A second test compares the offers with a
  frozen table taken from today's `DetailControlsModel.controlsOf` (with a comment saying how to retake it), and lists
  each difference as an expected entry; it is deleted with the Bridge in stage 8.
- `PipelineSetups.apply.spec.ts`: `applyRefusalOf` gives the refusal `requestApply` gives, for each refusal kind it
  covers, and `null` where `requestApply` proceeds.
- `BoardDocumentAssembly.spec.ts`: a stored option's `isRecommended` is served as `recommended`.
- `BoardDocumentAssembly.spec.ts`: each fact on the scratch board of WP4.8, and today's figures carrying the date of
  the reading's clock.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/shared/monitor/ \
  ./src/adapters/board-document/ ./src/services/overseer/ \
  ./src/lib/tracker-model/PipelineSetups.apply.spec.ts ./src/lib/tracker-model/Board.ticketMoves.spec.ts
cd ../../packages/forge-contracts && bun run typecheck && bun test
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

### WP4.11: The forge keeps an unfinished entities draft

**Purpose.** An edit that leaves the draft's entities refused by the entity validator is kept, not refused. The
refusals are served on the setup document with their fix, the pipeline agent hears them, and Continue and Apply are
refused while any stands. Runs after WP4.10 and WP4.5.

**Files.**

- Change: `apps/forge/src/adapters/pipeline/PipelineFile.ts` (split the entities' mapping from their set check);
  `apps/forge/src/adapters/pipeline/PipelineSetupFile.ts` (the draft read without the set check, and the record's format
  version raised); `apps/forge/src/services/control/PipelineSetupControls.ts` and `PipelineAgentControls.ts` (an edit is
  kept with entity refusals); `apps/forge/src/lib/tracker-model/PipelineSetups.ts` and `BoardRefusal.ts` (the new
  refusal); `apps/forge/src/lib/tracker-model/utils/EntityValidationUtil.ts` only if a refusal needs a key it lacks;
  `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`;
  `apps/forge/resources/prompts/PipelineAgentEntities.md`; `packages/forge-contracts/@types/BoardPipelineDocuments.ts`
  (the entity refusal documents); the pipeline mapper of WP4.8 and its spec; the specs named below.

**What to do.**

1. In `PipelineFile.ts`, split `entitiesOf` (`:483-495`): `entitiesOf` maps each entity and returns them;
   `entitiesProblemOf` keeps running `EntityValidationUtil.refusalsOf` for the stored pipeline, so `pipeline.json`
   with refused entities stays unreadable. Export a reading of a draft that maps the entities without the set check.
2. `PipelineSetupFile.ts`: `draftOf` (`:290-294`) reads the draft through that reading. Raise the setup record's
   format version; an older record is set up anew, as every board is (decision 32).
3. `PipelineSetupControls.ts` and `PipelineAgentControls.ts`: `requireStorableDraft` (`:445-450`) refuses a draft that
   is malformed for any other reason, as today, and never for an entity refusal. Edits, undo and batch undo by the
   user and the agent's proposals all follow it.
4. `BoardRefusal.ts`: add
   `{ reason: 'entity-refusals-stand'; setupId: string; reasons: readonly EntityRefusalReason[] }`.
   `continueSetupStep` (`PipelineSetups.ts:301`) and `refuseUnappliable` (`:924`) throw it while
   `EntityValidationUtil.refusalsOf` of the draft's entities finds any; `applyRefusalOf` of WP4.10 then gives it too.
   Word it in `OperationRefusalWordingUtil` for both channels.
5. Serve the refusals: the setup document carries `entityRefusals: readonly BoardEntityRefusalDocument[]`, each with
   its typed reason and keys, the entity whose row shows it, `sentence` (the command line's sentence of
   `pipeline-draft-invalid` for that reason, `OperationRefusalWordingUtil.entityRefusalReasonOf`), and
   `fix: { label, edits } | null`, the one gesture that resolves it, as typed draft edits of WP4.5. The fixes are the
   ones `bridge/views/pipeline/setup/EntityRefusalsModel.ts:27-84` builds today: write that rule, labels included, as
   a forge adapter util beside the pipeline mapper, since a fix is forge's rule. The Bridge keeps its own until stage 8
   deletes it.
6. The pipeline agent hears the standing refusals: the `draft-edited` message to its level
   (`PipelineSetupControls.ts:482-491`) carries the sentences of the refusals that stand after the edit. In
   `PipelineAgentEntities.md`, say that the draft may hold refusals while the user works, that Continue and Apply wait
   for none, and that the agent proposes the fix when it is asked.

**Specs to write or change.**

- `PipelineFile.entities.spec.ts`: a stored pipeline with two root entities is unreadable; a draft with them reads.
- `PipelineSetupFile.spec.ts`: a record whose draft holds refused entities reads and writes back unchanged.
- `PipelineSetups.spec.ts`: Continue of any step and Apply are refused `entity-refusals-stand` while a refusal stands,
  and proceed once an edit clears it; an edit that leaves a refusal lands at the next revision.
- The control specs: a user's edit and an agent's proposal that leave two entities on one home land; an edit with a
  malformed value is still refused `pipeline-draft-invalid`.
- The pipeline mapper's spec: each refusal kind of `EntityValidationUtil` with its row, sentence and fix, the fixes
  taken from the cases of today's `EntityRefusalsModel.spec.ts`.
- The Bridge's entities step keeps passing unchanged: it holds edits on the page and sends only a passing set.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/adapters/pipeline/ \
  ./src/services/control/ ./src/lib/tracker-model/PipelineSetups.spec.ts ./src/adapters/board-document/
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

### WP4.12: Each refusal is served as its code, its fields and its sentence

**Purpose.** A client reads every refusal as forge's reason code, its structured fields and the sentence the command
line prints, on a refused command and in every document that carries one. Parallel with WP4.5, WP4.6 and WP4.7.

**Files.**

- Create `packages/forge-contracts/@types/ForgeRefusalDocument.ts` ("Interfaces introduced", item 5).
- Create `apps/forge/src/adapters/utils/RefusalDocumentUtil.ts` and its spec: an `OperationRefusal` to its document.
- Change: `apps/forge/cli/overseer/routes/CommandRoute.ts` (`:3-4`, `:65`, `:107-110`, `:131`, `:156`);
  `apps/forge/cli/overseer/routes/OverseerRoutes.ts:100`; `CommandRoute.controlContract.spec.ts`;
  `packages/forge-contracts/package.json` (`exports`) and `README.md`; `apps/forge/docs/reference/overseer-api.md`
  ("Commands", "Control contract 1").

**What to do.**

1. Write `ForgeRefusalDocument`: `{ code, fields, sentence }`, `fields` a record of JSON values.
2. `RefusalDocumentUtil.refusalDocumentOf(refusal: OperationRefusal): ForgeRefusalDocument`: `code` is
   `reasonCodeOf(refusal.detail)` (`src/shared/OperationRefusal.ts:85`), or `refused` without a detail; `fields` the
   detail without its `kind`, and for a `board-refusal` the board refusal's detail without its `reason`; `sentence`
   `OperationRefusalWordingUtil.messageOf(refusal)`, the command line's.
3. `CommandRoute.ts`: `refusedAnswerOf` answers 409 `{controlVersion, refusal, fields, text}` with `text` the command
   line's sentence; the 400 malformed, the 409 verdict at `:131` and the 423 install hold carry `fields: {}` (or the
   verdict's fields). Correct the file's docblock (`:3-4`), which says the sentence names no command line.
4. `OverseerRoutes.ts:100`: the refusal answer carries the same document.
5. `overseer-api.md`: the answer shapes and that `text` is the command line's sentence, from S4.
6. Record again `cli/overseer/routes` and `bridge/api/CommandClient.ts` and commit the recordings.

**Specs to write or change.**

- `RefusalDocumentUtil.spec.ts`: a board refusal's code, fields and sentence; a detail of another kind; a refusal
  without a detail; the sentence is `messageOf`'s, not `apiMessageOf`'s, for a refusal whose two channels differ.
- `CommandRoute.controlContract.spec.ts`: a refused control command answers `fields` and the command line's sentence.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./cli/overseer/routes/ \
  ./src/adapters/utils/RefusalDocumentUtil.spec.ts
cd ../../packages/forge-contracts && bun run typecheck && bun test
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # green
```

## Interfaces introduced

### 1. The value lists of the wire's unions

`packages/forge-contracts/constants/BoardVocabulary.ts`, exported as `forge-contracts/BoardVocabulary`. Each list is the
model's list, held by forge's parity spec:

```ts
export const GATE_PHASES = [/* the model's GATE_PHASES, in its order */] as const;
export type GatePhase = (typeof GATE_PHASES)[number];
// and likewise: TICKET_STATUSES, TICKET_PRIORITIES, TICKET_TYPES, TICKET_SIZES, DISPLAY_STATES, TASK_PHASES,
// TASK_STATUSES, TICKET_STAGES, DRAFT_STATES, JOB_STATES, PIPELINE_AGENT_ROLES, FORGE_LEVEL_AGENT_ROLES,
// ENTITY_KINDS, AGENT_EFFORTS
export const TICKET_STATUSES = ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'] as const;
```

The status lists say `committed` where the model says `pending` until stage 5's WP5.14 (decision 48).

### 2. The board document

Exported entries, each `./@types/<Name>.ts`: `./ForgeBoardDocument`, `./BoardPageDocuments`, `./BoardJobDocuments`,
`./BoardConversationDocuments`, `./BoardPipelineDocuments`, `./BoardMergeQueueDocument`, `./BoardLimitsDocument`,
`./BoardReadingDocuments` (WP4.10). Served at `GET /api/v1/board` with the bearer token: 200 with the document, 401
`unauthorized`, 404 `not-found` at any other version. Registry entry `{ kind: 'endpoint', endpoint: 'board', version:
1, introducedIn: S4, lastNeededBy: null, source: 'shipped' }`.

```ts
export interface ForgeBoardDocument {
  readonly project:          string;
  readonly overseer:         BoardOverseerDocument;        // state, paused, codeVersion, batonPassWarning
  readonly concurrency:      BoardConcurrencyDocument;
  readonly launchSlots:      BoardLaunchSlotsDocument;
  readonly confinement:      'confined' | 'unavailable' | 'unconfined-by-design';
  readonly usage:            BoardUsageDocument;
  readonly page:             BoardPageDocument;            // tickets with their facts and offers, epics, drafts, limits
  readonly mergeQueue:       BoardMergeQueueDocument;
  readonly jobs:             readonly BoardJobDocument[];  // with live facts, stop holds and offers
  readonly endedJobs:        readonly BoardEndedJobDocument[];
  readonly decisions:        readonly BoardDecisionDocument[];
  readonly incidents:        readonly BoardIncidentDocument[];
  readonly questionHistory:  readonly BoardQuestionHistoryEntryDocument[];
  readonly ticketForecasts:  readonly BoardTicketForecastDocument[];
  readonly pipeline:         BoardAppliedPipelineDocument | null;
  readonly pipelineSetup:    BoardPipelineSetupDocument | null;   // the draft, entity refusals, the Apply refusal
  readonly pipelineFlow:     BoardPipelineFlowDocument | null;
  readonly profileRuns:      readonly BoardGateProfileRunDocument[];
  readonly gateCacheMarks:   readonly BoardGateCacheMarkDocument[];
  readonly pipelineHistory:  readonly BoardPipelineHistoryEntryDocument[];
  readonly pipelineChoices:  BoardPipelineChoicesDocument;
  readonly entityAssignment: BoardEntityAssignmentDocument | null;
  readonly pictureLimits:    BoardPictureLimitsDocument | null;
  readonly limits:           BoardLimitsDocument;          // WP4.10's limits and defaults
  readonly notices:          readonly BoardNoticeDocument[];
  readonly warnings:         readonly BoardNoticeDocument[];
  readonly attention:        readonly BoardAttentionEntryDocument[];
  readonly today:            BoardTodayDocument;
  readonly openDecisionIds:  readonly string[];            // answering order
  readonly escalatedDecisionIds: readonly string[];
}
```

The fields of each part are the Bridge's documents' (WP4.6, step 1), readonly throughout, with the facts of WP4.10 and
WP4.11 added. A field the Bridge's documents mark optional only "so a board from an older Overseer shows it empty" is
required here: no older forge is read (decision 32).

### 3. The board commands

`packages/forge-contracts/@types/BoardCommand.ts`, the 34 kinds measured at `b4174bd9`, with payload types declared in
the contract:

```ts
export type ForgeBoardCommand =
  | { readonly kind: 'chart-range-set'; readonly range: ChartRangeRequest }
  | { readonly kind: 'decision-answer'; readonly decisionId: string; readonly answer: DecisionAnswerFormDocument }
  | { readonly kind: 'gate-profile-start'; readonly setupId: string | null; readonly gateName: string; readonly phase: GatePhase; readonly entity?: EntityKey }
  | { readonly kind: 'gate-profile-stop'; readonly profileRunId: string }
  | { readonly kind: 'intake-close'; readonly jobId?: string; readonly proposedDraftSets: readonly (readonly string[])[] }
  | { readonly kind: 'intake-start'; readonly text: string; readonly pictures?: readonly PictureReferenceDocument[] }
  | { readonly kind: 'job-fresh'; readonly jobId: string; readonly incidentId?: string }
  | { readonly kind: 'job-message'; readonly jobId: string; readonly text: string; readonly pictures?: readonly PictureReferenceDocument[]; readonly incidentId?: string }
  | { readonly kind: 'job-stop'; readonly jobId: string; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'merge-accept'; readonly ticketReference: string }
  | { readonly kind: 'merge-update'; readonly ticketReference: string }
  | { readonly kind: 'pipeline-agent-advise'; readonly entity?: EntityKey }
  | { readonly kind: 'pipeline-apply'; readonly setupId: string; readonly draftRevision: number; readonly resumesBoard: boolean }
  | { readonly kind: 'pipeline-apply-cancel'; readonly setupId: string }
  | { readonly kind: 'pipeline-check'; readonly setupId: string }
  | { readonly kind: 'pipeline-constitution-edit'; readonly setupId: string; readonly revision: number; readonly markdown?: string; readonly draftedFrom?: ConstitutionSourcesDocument; readonly entity?: EntityKey }
  | { readonly kind: 'pipeline-draft-discard'; readonly setupId: string }
  | { readonly kind: 'pipeline-draft-edit'; readonly setupId: string; readonly draftRevision: number; readonly edits: readonly PipelineDraftEditDocument[]; readonly isACopy?: true }
  | { readonly kind: 'pipeline-draft-undo'; readonly setupId: string; readonly editId: string; readonly wholeBatch?: true }
  | { readonly kind: 'pipeline-setup-answer'; readonly setupId: string; readonly questionId: string; readonly answer: DecisionAnswerFormDocument }
  | { readonly kind: 'pipeline-setup-billing'; readonly setupId: string; readonly billing: PipelineBillingDocument }
  | { readonly kind: 'pipeline-setup-resume'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-start'; readonly billing: PipelineBillingDocument; readonly replacesUnreadablePipeline: boolean }
  | { readonly kind: 'pipeline-setup-start-over'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-step'; readonly setupId: string; readonly step: PipelineSetupStep; readonly move: 'continue' }
  | { readonly kind: 'pipeline-update-start'; readonly entity?: EntityKey }
  | { readonly kind: 'ticket-deliver-by-hand'; readonly ticketReference: string; readonly branch?: string; readonly commit?: string }
  | { readonly kind: 'ticket-hold'; readonly ticketReference: string; readonly reason: string }
  | { readonly kind: 'ticket-network'; readonly ticketReference: string; readonly domains: readonly string[] }
  | { readonly kind: 'ticket-park'; readonly ticketReference: string; readonly reason: string; readonly incidentId?: string }
  | { readonly kind: 'ticket-priority'; readonly ticketReference: string; readonly priority: TicketPriority }
  | { readonly kind: 'ticket-ready'; readonly ticketReferences: readonly string[] }
  | { readonly kind: 'ticket-unhold'; readonly ticketReference: string }
  | { readonly kind: 'tracker-clear'; readonly scope: TrackerClearScope };
```

The fields are those of `apps/forge/src/shared/@types/ControlCommand.ts:67-258` for the same kinds, but
`pipeline-draft-edit`'s `edits`. `PipelineDraftEditDocument` is the model's `PipelineDraftEdit` field for field
(targets `steps` and its kinds, `role`, `airlock`, `approval`, `entity`, `within-entity`), every type it names declared
in the contract. If the package's line width breaks a member over lines, keep one field per line.

In forge: `ControlCommand` keeps its members; `BoardCommandMappingUtil.controlCommandOf` maps a `ForgeBoardCommand` to
it; `BOARD_COMMAND_CONTRACT_KINDS` in `OverseerApiContracts.ts` lists the 34 kinds in the order above. Answers are
unchanged but for WP4.12: 200 `{controlVersion: 1, outcome, result}`, 400 `malformed-body`, 409 a refusal, 423 while
launches are held.

### 4. The served readings and facts

`packages/forge-contracts/@types/BoardReadingDocuments.ts`:

```ts
export type BoardTargetSubject = 'decision' | 'ticket' | 'draft' | 'job' | 'incident';

export interface BoardTarget {
  readonly subject: BoardTargetSubject;
  readonly id:      string;
}

/** The monitor's attention entry without its route, with the thing it opens. */
export interface BoardAttentionEntryDocument {
  readonly key:                     string;
  readonly kind:                    BoardAttentionKind;
  readonly idText:                  string;
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  readonly metaText:                string | null;
  readonly stamp:                   string;
  readonly stampWord:               BoardAttentionStampWord;
  readonly actionLabel:             BoardAttentionActionLabel;
  readonly target:                  BoardTarget;
}

export interface BoardNoticeDocument {
  readonly kind:           string;
  readonly facts:          Readonly<Record<string, ForgeJsonValue>>;
  readonly sentence:       string;
  readonly causeSentence?: string;
}

/** Counted on `calendarDate`, the forge's local date; a reader shows them only on that date. */
export interface BoardTodayDocument {
  readonly calendarDate:     string;
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

export interface BoardTicketFactsDocument {
  readonly resolvedPriority:       TicketPriority;
  readonly settlesADependency:     boolean;
  readonly isClosed:               boolean;
  readonly noAgentHasPickedItUp:   boolean;
  readonly reviewRound:            number | null;
  readonly isRepeatReview:         boolean;
}

/** The board command kinds this ticket accepts now, and the priorities it may move to. */
export interface BoardTicketOffersDocument {
  readonly kinds:           readonly ForgeBoardCommand['kind'][];
  readonly priorityChoices: readonly TicketPriority[];
}

export interface BoardJobOffersDocument {
  readonly stopModes:    readonly ForgeJobStopMode[];
  readonly takesFresh:   boolean;
  readonly takesMessage: boolean;
}

export interface BoardJobStopHoldsDocument {
  readonly stop:     string;
  readonly windDown: string;
}
```

`BoardLimitsDocument` gains `concurrency: { lowest, ceiling, default }`, `workerModel`, `workerEffort`,
`reworkRoundThresholdLines`, `defaultTicketPriority`, `firstRepeatReviewRound`, `defaultInstructionsOfRole` and
`reReviewThresholdStepLines`, beside the page limits. `BoardJobDocument` carries `interruption`; each draft entity
carries `dependentEntityKeys`; the pipeline facts carry `stepRunTimes: readonly BoardPipelineStepRunTimeDocument[]`.
`BoardDecisionDocument`'s options carry `label` without the vendor's mark and `recommended: boolean`.
`BoardPipelineSetupDocument` carries `applyRefusal: ForgeRefusalDocument | null` and `entityRefusals` (item 6).

### 5. The refusal document

`packages/forge-contracts/@types/ForgeRefusalDocument.ts`, exported as `forge-contracts/ForgeRefusalDocument`:

```ts
export type ForgeJsonValue = string | number | boolean | null | readonly ForgeJsonValue[] | { readonly [field: string]: ForgeJsonValue };

/** A refusal as forge gives it: its reason code, the facts it names, and the sentence its command line prints. */
export interface ForgeRefusalDocument {
  readonly code:     string;
  readonly fields:   Readonly<Record<string, ForgeJsonValue>>;
  readonly sentence: string;
}
```

`POST /api/v1/commands` answers a refusal 409 `{controlVersion: 1, refusal: <code>, fields, text: <sentence>}`; 400
and 423 carry `fields: {}`.

### 6. The entity refusals

In `BoardPipelineDocuments.ts`:

```ts
export type BoardEntityRefusalReason =
  | 'more-than-one-root' | 'equal-homes' | 'reach-inside-another-home' | 'unknown-whitelist-key'
  | 'unknown-dependency-key' | 'whitelisted-entity-not-package' | 'whitelisted-package-without-review' | 'dependency-circle';

export interface BoardEntityRefusalDocument {
  readonly reason:     BoardEntityRefusalReason;
  readonly entityKeys: readonly EntityKey[];
  /** The entity whose row shows the refusal. */
  readonly shownOn:    EntityKey;
  readonly sentence:   string;
  readonly fix:        { readonly label: string; readonly edits: readonly PipelineDraftEditDocument[] } | null;
}
```

In forge: `BoardRefusal` gains `entity-refusals-stand`, thrown by Continue and Apply; the setup record's format version
is one higher, its draft read without the entities' set check.

## Traps

- **A versioned path is the unversioned route.** The server rewrites `/api/v<n>/<endpoint>` to `/api/<endpoint>`
  (`OverseerServer.ts:601-620`), so a registry entry named `state` would serve the internal `BoardState`. The contract's
  document has its own route, `/api/board`; never register `state`.
- **The contract names no client and imports nothing.** `forge-contracts/PackageIsolation.spec.ts` refuses any import
  but `system-versions/` and the words `gaia` and `fleet` in any file, README and manifest included. A docblock copied
  from the Bridge says "the Bridge"; reword it to "a view".
- **A spread is not a mapping.** `BoardState` spreads the status document and raw records (`BoardState.ts:341-382`).
  A mapper that spreads a model record into a document compiles while it leaks every field the model gains; name each
  field.
- **Readonly contract types meet mutable model types.** The contract is `readonly` throughout and the model's types are
  not (`PipelineFacts.ts` has no `readonly`). Copy arrays in the command mapper; never cast and never drop `readonly`
  from the contract.
- **Two vocabularies drift silently.** A status added to the model and not to the contract compiles in one direction
  only; the parity spec of WP4.6 is the guard. Run it before relying on the typecheck.
- **The Bridge keeps running on its own documents.** It reads `/api/state` and the unversioned `board` event with its
  own types and computes its readings on the client until stage 8. Nothing in this stage changes what it reads, but the
  typed draft edits of WP4.5 and the stored draft of WP4.11 reach it. Its DOM specs are out of the gates (the old
  implementation may break before stage 8 deletes it); `bun run test:dom:bridge` in `apps/forge` runs them by hand.
- **The setup record's draft and the stored pipeline share a reader.** `PipelineSetupFile.ts:292` reads the draft with
  `PipelineFile.documentReadingOf`, which refuses refused entities. Keep the set check for `pipeline.json` and drop it
  only for the draft, or a stored pipeline with two roots becomes readable.
- **An offered control must never be a second copy of a rule.** A query beside the move with its own status list
  drifts as `DetailControlsModel.ts` does; share the predicate with the move.
- **The Apply refusal needs main's reading.** `requestApply` reads main's constitution and pipeline from its request
  (`PipelineSetups.ts:734-760`); `applyRefusalOf` takes the reading the board state already holds, never a git call of
  its own in the assembly.
- **The command line's sentence may name a command.** WP4.12 serves it as the owner decided (decision 45); Gaia's rule
  that no screen tells the user to run a command (`apps/gaia/CLAUDE.md`, rule 4) is stage 6's to reconcile.
- **Recordings replay answers.** `cli__overseer__routes.json`, `bridge__api__CommandClient.ts.json` and
  `src__services__overseer__OverseerServer.ts.json` hold forge's answers; a changed answer or body is recorded again in
  the work package that changes it, or a replaying spec checks code against a body forge does not send.
- **A text search for command kinds finds log records.** `'pipeline-gates-none'` appears as a `case` label of a log
  record kind (`FlowActivityPanelModel.ts`). Measure the kinds from object literals' `kind` properties.
- **Copies of the repository sit inside the checkout.** `apps/forge/.forge-worktrees/` and `apps/gaia/.forge-worktrees/`
  hold tracker worktrees; a scan or grep that does not skip `.forge-worktrees`, `.forge`, `.claude` and `node_modules`
  reports false hits.
- **Line numbers drift.** Stages 2 and 3 change `ControlCommand.ts`, `forge-contracts` and the overseer services. Read
  each cited place before editing it.

## Verification of the whole stage

At the repository root, in a fresh worktree of the integration branch after the last work package merged:

```
bun install --frozen-lockfile
bun run verify
bun run gate:forge
bun run gate:gaia
```

The specs that matter most, inside each workspace folder:

```
(cd packages/forge-contracts && bun run typecheck && bun run lint && bun test)
(cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/adapters/board-document/ ./src/adapters/board-commands/ \
  ./src/adapters/utils/RefusalDocumentUtil.spec.ts ./src/services/overseer/ ./cli/overseer/routes/ \
  ./src/lib/tracker-model/PipelineSetups.spec.ts ./bridge/CommandKindsInContract.spec.ts)
(cd apps/gaia && bun run check)      # the warning that Gaia supports an older forge; exit 0
grep -rn "tracker-model\|apps/" packages/forge-contracts --include='*.ts'      # prints nothing
```

The Bridge on a real Overseer in a headless browser (skips without Chrome; one named file, as
`apps/forge/CLAUDE.md:20-22` allows):

```
cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./bridge/HeadlessBridge.integration.spec.ts
```

The end-to-end check on a scratch forge. Use `apps/gaia/src/testing/ScratchForge.ts`, or the same setup by hand: a
scratch home and repository under a short scratch root, `FORGE_ROOT` pinned, the fake agent (`FORGE_FAKE_AGENT=1`),
never `~/.forge-monitor` or `~/.gaia`. Check in order:

1. `init` in the scratch repository; `ticket add` one ticket; `ticket ready` it; `status --json` prints the ticket.
2. `start --json`: it answers with the Overseer's URL. Read the bearer token from the file the Baton record's
   `tokenFile` names (`apps/forge/src/services/overseer/OverseerFiles.ts`).
3. `GET <url>api/versions`: `current` is S4. `GET <url>api/v1/board` with the token: 200, with `page.tickets[0]`
   carrying `facts.resolvedPriority` and `offers.kinds`, `attention`, `today.calendarDate`, `limits` and no
   `flintBrain`; `GET <url>api/v2/board`: 404; `GET <url>api/v1/state`: 404.
4. `POST <url>api/v1/commands` with `{"kind":"ticket-priority","ticketReference":"1","priority":"high"}` and the token:
   200, `controlVersion` 1, outcome `done`; `GET <url>api/v1/board` shows `resolvedPriority` `high`. The same body for a
   ticket that does not exist: 409 with `refusal`, `fields` and the command line's sentence as `text`.
5. `pipeline setup` through the CLI to the entities step, an edit that gives two entities one home: the edit lands,
   `pipelineSetup.entityRefusals` holds `equal-homes` with a fix, and `pipeline-setup-step` with `continue` answers 409
   `entity-refusals-stand`; the fix's edits sent as `pipeline-draft-edit` clear it.
6. `GET <url>`: 200, the Bridge's page; the board view lists the ticket.
7. `stop`; remove the scratch home and repository; the leak check of the run, or `git status --porcelain` and a listing
   of the scratch root, finds nothing left.

Repository state: `git status --porcelain` prints nothing; `apps/forge/src/lib/tracker-model` and
`apps/forge/src/shared/monitor` exist where they were; `packages/` holds no new package.

## Out of scope

- Moving any view into Gaia, Gaia's mapping of the board document into its own model, its page contract, raising
  `SUPPORTED_FORGE_VERSION` and recording Gaia's forge answers again: stage 6.
- The documents of the event stream at a versioned path, the job transcript stream, the gate-profile stream and the
  pictures: stage 6 versions them, carrying this stage's part documents.
- Command kinds the Bridge does not send today (filing, drafts, incidents, epics, `ticket-add`): stage 6 or 7 adds each
  with the view that sends it; the Bridge guard of WP4.5 asks for it.
- The committed ticket's rules (decision 48): its content fixed and kept by content hash, and the move back into
  draft, are stage 5's WP5.16 and WP5.17. The content edit `ticket-edit` exists and stays off `ForgeBoardCommand`, as
  does `ticket-unready`; Gaia's editing screen, after this run, adds both under a system minor.
- The store port and any change to `apps/forge/src/services/tracker/`: stage 5.
- Deleting `GET /api/state`, the Bridge, its readings on the client, Flint's brain and the monitor's Bridge routes, and
  folding `design-system`, `flint` and `brand` into Gaia's page: stage 8.
- Renaming `Overseer` in documents, types or fields: stage 9.
- What follows an ending on a network outage, and the bound of an install line: stages 2 and 3.
- Extracting any part of the model, the readings or the wording into a package: decision 49 keeps them in forge.

## Needs the owner

Nothing. Every question of this stage is settled by the owner's answers 10, 11 and 13 or is the run's call, recorded
under "Decisions this stage carries out".

## Not established

- How many type errors the mappers of WP4.8 meet, and whether every field the Bridge's documents declare is one the
  server sends; no compile has yet held the documents against the server. A field no producer has is dropped from the
  contract, with the reason in the commit's body.
- How large the board document grows on a large forge, and the cost of building it beside `BoardState` on each request;
  no recorded board of a large forge exists to measure it from.
- Which offers differ between the Board's rules and today's `DetailControlsModel.controlsOf`; WP4.10's parity spec
  lists them.
- Whether the pipeline agent, prompted as WP4.11 says, proposes fixes for standing refusals well; only a vendor session
  shows it, which no session of this run starts.
- The exact list of command kinds after stages 2 and 3; WP4.5 measures it again.
- Whether `endpointAddedIn` exists as stage 3's WP3.12 describes; stage 3 is not built.
- Whether `apps/gaia/src/testing/ScratchForge.ts` can be driven outside a recording spec for the end-to-end check, or
  must be set up by hand.
