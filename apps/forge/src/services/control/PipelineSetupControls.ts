/**
 * User's kinds of the pipeline setup record: start, update and advise, billing, Continue, start over, resume, an answer, the constitution,
 * draft edits, Undo, discard, a check, Apply and its cancel. A body is untrusted JSON, so each applier checks its nested payload and
 * refuses `malformed-setup-command` before the Board is touched. A start and an advise launch the record's pipeline agent, and a start over
 * stops it. An answer, a constitution or draft edit, an Undo, a discard, a Continue, a resume and a check also message the agent in the
 * same hold, in the caller's words, with what the move changed, and open it again when a stop closed it. An update, an advise and an Apply read main's
 * `CONSTITUTION.md` through the context.
 *
 * On a forge over entities each entity has a session of its own, its level: the Continue of the `entities` step launches one for each
 * entity of the draft, an update or advise opens at the forge or at one entity, and each move messages the session of the level it
 * changed, never another's.
 */
import { PipelineFile }                                    from '../../adapters/pipeline/PipelineFile.ts';
import { SetupPayloadSchemas }                             from '../../adapters/pipeline-setup/SetupPayloadSchemas.ts';
import { OperationRefusalWordingUtil }                     from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import { GitProcess }                                      from '../../lib/git/GitProcess.ts';
import { commitCountAheadOf }                              from '../../lib/git/MergeTree.ts';
import { JsonRecordUtil }                                  from '../../lib/json-record/JsonRecordUtil.ts';
import type { PipelineApplyChanged, PipelineSetupChanged } from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { EntityKey, Pipeline, PipelineBilling }       from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ApplyMainReading,
  ConstitutionSources,
  EntityConstitutionsOnMain,
  MainConstitution,
  PipelineDraftEdit,
  PipelineDraftField,
  PipelineSetup,
  PipelineSetupOpening,
  PipelineSetupStep,
  SetupQuestionReply
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                             from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                           from '../../lib/tracker-model/BoardRefusal.ts';
import { PENDING_APPLY_REQUEST_STATES, PIPELINE_SETUP_STEPS }     from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { EntityValidationUtil }                                   from '../../lib/tracker-model/utils/EntityValidationUtil.ts';
import { PipelineChangeUtil }                                     from '../../lib/tracker-model/utils/PipelineChangeUtil.ts';
import { PipelineDraftEditUtil }                                  from '../../lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { PipelineUtil }                                           from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommandKind, ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext, DraftFieldValue, SetupMessage }     from '../../shared/@types/ControlContext.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import { EntityFoldersUtil }                                      from '../../shared/utils/EntityFoldersUtil.ts';
import { mainLineOf }                                             from '../lifecycle/MergeTargets.ts';
import type { TrackerChange }                                     from '../tracker/TrackerPipeline.ts';
import { entityAssignmentRequestOf }                              from './EntityAssignmentRequest.ts';
import { requireReadablePipeline }                                from './SettingControls.ts';

interface SentCommand {
  kind: ControlCommandKind;
}

const BILLING_KEYS = ['mode', 'maxBudgetUsd'];

const CONSTITUTION_SOURCE_KEYS = ['contributing', 'research', 'installedDefault'] as const;

const OPTION_LETTERS_PATTERN = /^[a-z]+$/u;

export function refuseMalformedSetupCommand(commandKind: ControlCommandKind, field: string): never {
  throw new OperationRefusal('refused', { kind: 'malformed-setup-command', commandKind, field });
}

function fieldOf(command: SentCommand, field: string): unknown {
  return Object.hasOwn(command, field) ? (command as unknown as Record<string, unknown>)[field] : undefined;
}

export function textFieldOf(command: SentCommand, field: string): string {
  const value = fieldOf(command, field);
  if (typeof value !== 'string' || value.trim() === '') refuseMalformedSetupCommand(command.kind, field);
  return value;
}

function revisionFieldOf(command: SentCommand, field: string): number {
  const value = fieldOf(command, field);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) refuseMalformedSetupCommand(command.kind, field);
  return value;
}

function valueIsATextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Only a mode and a budget, as `pipeline.json` stores them; a cap that is no positive number is the Board's `billing-cap-not-positive`. */
function billingFieldOf(command: SentCommand): PipelineBilling {
  const value = fieldOf(command, 'billing');
  if (!JsonRecordUtil.valueIsAPlainObject(value) || Object.keys(value).some((key) => !BILLING_KEYS.includes(key))) refuseMalformedSetupCommand(command.kind, 'billing');
  const { mode, maxBudgetUsd } = value;
  if (mode === 'subscription' && maxBudgetUsd === undefined) return { mode };
  if (mode !== 'api') refuseMalformedSetupCommand(command.kind, 'billing');
  if (maxBudgetUsd === undefined) return { mode };
  if (typeof maxBudgetUsd !== 'number' || !Number.isFinite(maxBudgetUsd)) refuseMalformedSetupCommand(command.kind, 'billing');
  return { mode, maxBudgetUsd };
}

function stepFieldOf(command: SentCommand): PipelineSetupStep {
  const value = fieldOf(command, 'step');
  const step  = PIPELINE_SETUP_STEPS.find((candidate) => candidate === value);
  if (step === undefined) refuseMalformedSetupCommand(command.kind, 'step');
  return step;
}

/** A decision's answer form: letters, `a` or `ac` per entry, or free text. */
function replyFieldOf(command: SentCommand): SetupQuestionReply {
  const answer = fieldOf(command, 'answer');
  if (!JsonRecordUtil.valueIsAPlainObject(answer)) refuseMalformedSetupCommand(command.kind, 'answer');
  const { form, text, choices } = answer;
  if (form === 'text' && typeof text === 'string') return { text };
  if (form !== 'letters' || !valueIsATextList(choices) || !choices.every((choice) => OPTION_LETTERS_PATTERN.test(choice))) refuseMalformedSetupCommand(command.kind, 'answer');
  return { letters: choices.flatMap((choice) => [...choice]) };
}

function sourcesFieldOf(command: SentCommand): ConstitutionSources | undefined {
  const value = fieldOf(command, 'draftedFrom');
  if (value === undefined) return undefined;
  const isWhole = JsonRecordUtil.valueIsAPlainObject(value) && Object.keys(value).length === CONSTITUTION_SOURCE_KEYS.length
    && CONSTITUTION_SOURCE_KEYS.every((key) => typeof value[key] === 'boolean');
  if (!isWhole) refuseMalformedSetupCommand(command.kind, 'draftedFrom');
  return { contributing: value['contributing'] === true, research: value['research'] === true, installedDefault: value['installedDefault'] === true };
}

function markdownFieldOf(command: SentCommand): string | undefined {
  const value = fieldOf(command, 'markdown');
  if (value !== undefined && typeof value !== 'string') refuseMalformedSetupCommand(command.kind, 'markdown');
  return value;
}

/** The level a command names: an entity's key, or `undefined` for the forge when the command names none. */
function entityFieldOf(command: SentCommand): EntityKey | undefined {
  return Object.hasOwn(command, 'entity') ? textFieldOf(command, 'entity') : undefined;
}

/** A level named by an entity must be one the pipeline holds; the forge always is. */
function requireEntityLevel(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey | undefined): void {
  if (entityKey === undefined) return;
  const entities = pipeline?.entities ?? {};
  if (!Object.hasOwn(entities, entityKey)) throw new BoardRefusal({ reason: 'setup-entity-unknown', entity: entityKey, entityKeys: Object.keys(entities) });
}

function draftEditsFieldOf(command: SentCommand): PipelineDraftEdit[] {
  const edits = fieldOf(command, 'edits');
  if (!Array.isArray(edits) || edits.length === 0) refuseMalformedSetupCommand(command.kind, 'edits');
  return edits.map((edit: unknown, index) => {
    const reading = SetupPayloadSchemas.typedDraftEditReadingOf(edit, index);
    if (reading.verdict === 'malformed') refuseMalformedSetupCommand(command.kind, reading.field);
    return reading.value;
  });
}

/** The pipeline-agent session of a level: the record's own for the forge, the entity's part's for an entity; null while it has none. */
export function agentJobIdAt(setup: Readonly<PipelineSetup>, entityKey?: EntityKey): string | null {
  if (entityKey === undefined) return setup.agentJobId;
  const entities = setup.entities ?? {};
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.agentJobId ?? null : null;
}

function entityKeysOfParts(setup: Readonly<PipelineSetup>): EntityKey[] {
  return Object.keys(setup.entities ?? {});
}

/** Absent or `true`: a copy's edits are stored under one `batch`; any other value is malformed. */
function copyFlagFieldOf(command: SentCommand): { isACopy?: true } {
  const value = fieldOf(command, 'isACopy');
  if (value === undefined) return {};
  if (value !== true) refuseMalformedSetupCommand(command.kind, 'isACopy');
  return { isACopy: true };
}

/** A copy goes from one entity to others: only a draft with entities takes one, and only with edits of fields inside an entity. */
function refuseACopyOutsideEntities(setupId: string, setup: Readonly<PipelineSetup> | null, edits: readonly PipelineDraftEdit[]): void {
  if (setup?.draft?.entities === undefined) throw new OperationRefusal('refused', { kind: 'draft-copy-outside-entities', setupId, fields: [] });
  const fieldsOutside = edits.map(PipelineDraftEditUtil.fieldOf).filter((field) => levelOfField(field) === undefined);
  if (fieldsOutside.length > 0) throw new OperationRefusal('refused', { kind: 'draft-copy-outside-entities', setupId, fields: fieldsOutside });
}

/**
 * The record's pipeline agent hears User's move in the same hold, so the next turn starts from it: a live one gets the message, and one a
 * stop closed opens again with its conversation. A record with no agent, an agent whose input is closing, or one that ended otherwise gets
 * no message: the record is what a later agent starts from. With an entity key it is that entity's session.
 */
function messagedToTheAgent(
  changed: PipelineSetupChanged, change: TrackerChange, context: ControlContext, message: SetupMessage, entityKey?: EntityKey
): PipelineSetupChanged {
  return messagedToTheSetupAgent(changed, change.board, context.setupMessageWordingOf(message), change.at, entityKey);
}

/** The same for the Overseer, which words its own message; a record whose agent at the level takes no message is returned as it was. */
export function messagedToTheSetupAgent(changed: PipelineSetupChanged, board: Board, text: string, at: string, entityKey?: EntityKey): PipelineSetupChanged {
  const agentJobId = agentJobIdAt(changed.setup, entityKey);
  if (agentJobId === null || !agentTakesAMessage(board, agentJobId)) return changed;
  const messaged = board.messageJobAsOverseer(agentJobId, text, at);
  return { setup: changed.setup, logged: [...changed.logged, ...messaged.logged] };
}

/** A move of the whole record: first the forge's session hears it, then each entity's session. */
function messagedToEveryAgent(changed: PipelineSetupChanged, change: TrackerChange, context: ControlContext, message: SetupMessage): PipelineSetupChanged {
  return entityKeysOfParts(changed.setup).reduce(
    (latest, entityKey) => messagedToTheAgent(latest, change, context, message, entityKey),
    messagedToTheAgent(changed, change, context, message),
  );
}

/** The level a draft field belongs to: an entity's key for a field inside that entity; the forge for every other, an entity's definition too. */
function levelOfField(field: PipelineDraftField): EntityKey | undefined {
  const scope = PipelineDraftEditUtil.entityScopeOf(field);
  return scope === null || scope.field === null ? undefined : scope.entityKey;
}

/**
 * A draft move's message per level, each with only its own fields: the forge's session hears the forge's fields, and every one when no
 * field is inside an entity; an entity's session hears its fields, only when the move changed one.
 */
function messagedPerLevel(
  changed: PipelineSetupChanged,
  change: TrackerChange,
  context: ControlContext,
  fields: readonly PipelineDraftField[],
  messageOf: (keeps: (field: PipelineDraftField) => boolean) => SetupMessage,
): PipelineSetupChanged {
  const entityKeys = [...new Set(fields.flatMap((field) => levelOfField(field) ?? []))];
  const forgeKeeps = (field: PipelineDraftField): boolean => levelOfField(field) === undefined;
  const forgeHears = entityKeys.length === 0 || fields.some(forgeKeeps);
  const forgeMessaged = forgeHears ? messagedToTheAgent(changed, change, context, messageOf(forgeKeeps)) : changed;
  return entityKeys.reduce(
    (latest, entityKey) => messagedToTheAgent(latest, change, context, messageOf((field) => levelOfField(field) === entityKey), entityKey),
    forgeMessaged,
  );
}

function agentTakesAMessage(board: Board, agentJobId: string): boolean {
  const live = board.jobById(agentJobId);
  if (live !== undefined) return live.state !== 'stopping';
  return board.endedJobOutcomeOf(agentJobId)?.outcome === 'closed';
}

/** A new pipeline agent for the record, or for one entity's part of it: launched by User's command alone, never by the lifecycle. */
function startedAgentOf(changed: PipelineSetupChanged, change: TrackerChange, entityKey?: EntityKey): PipelineSetupChanged {
  const launched = change.board.startPipelineAgent(change.at, entityKey);
  const attached = change.board.attachSetupAgent(changed.setup.setupId, launched.job.id, null, entityKey);
  return { setup: attached.setup, logged: [...changed.logged, ...launched.logged] };
}

/** Once the layout is confirmed, each entity of the draft whose part has no session gets one, for its research, constitution and design. */
function startedEntityAgentsOf(changed: PipelineSetupChanged, change: TrackerChange): PipelineSetupChanged {
  return Object.keys(changed.setup.draft?.entities ?? {})
    .filter((entityKey) => agentJobIdAt(changed.setup, entityKey) === null)
    .reduce((latest, entityKey) => startedAgentOf(latest, change, entityKey), changed);
}

/** Main's `CONSTITUTION.md`, `null` when main holds none; a read git cannot answer refuses, since a guess would hide a change on main. */
function mainConstitutionOf(change: TrackerChange, context: ControlContext): MainConstitution | null {
  const reading = context.mainConstitutionOf(change.workspace.rootDirectory);
  if (reading.verdict === 'unreadable') throw new OperationRefusal('unrepaired', { kind: 'main-constitution-unreadable', reason: reading.reason });
  return reading.verdict === 'read' ? reading.constitution : null;
}

/**
 * Main's constitution that a record opens on, with the stored sources of that very text; main is read only where the Board can open a
 * record, so a refused start asks git nothing.
 */
function openingConstitutionOf(change: TrackerChange, context: ControlContext): Pick<PipelineSetupOpening, 'mainConstitution' | 'storedAnnotations'> {
  const mainConstitution = change.board.pipelineSetup() === null ? mainConstitutionOf(change, context) : null;
  const storedSources    = change.board.storedConstitutionSources();
  const storedAnnotations = mainConstitution !== null && storedSources?.blob === mainConstitution.blob ? storedSources.annotations : [];
  return { mainConstitution, storedAnnotations };
}

/** A first setup opens on main's `CONSTITUTION.md` too, so its Apply finds main as the record saw it and never writes over a file unseen. */
function startSetup(command: CommandOf<'pipeline-setup-start'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const billing = billingFieldOf(command);
  const replacesUnreadablePipeline = fieldOf(command, 'replacesUnreadablePipeline');
  if (typeof replacesUnreadablePipeline !== 'boolean') refuseMalformedSetupCommand(command.kind, 'replacesUnreadablePipeline');
  const opened = change.board.openSetup({
    mode: 'setup', billing, replacesUnreadablePipeline, ...openingConstitutionOf(change, context)
  }, change.at);
  return startedAgentOf(opened, change);
}

/**
 * An update or advise starts from the stored pipeline, so an older or malformed file refuses with its own reason, as does a level the
 * stored pipeline has no entity for; its billing is the stored one, and its constitution main's text with the stored sources of that very
 * text.
 */
function updateOpeningOf(mode: 'update' | 'advise', change: TrackerChange, context: ControlContext, entityKey: EntityKey | undefined): PipelineSetupOpening {
  requireReadablePipeline(change);
  requireEntityLevel(change.board.pipeline(), entityKey);
  const billing = change.board.pipeline()?.billing ?? { mode: 'subscription' };
  const constitutionOpening = change.board.pipeline() === null ? { mainConstitution: null, storedAnnotations: [] } : openingConstitutionOf(change, context);
  return {
    mode, billing, replacesUnreadablePipeline: false, ...constitutionOpening
  };
}

/** An update or advise record opened at its level: at an entity, the record names that entity and holds its part. */
function openedAtLevelOf(mode: 'update' | 'advise', change: TrackerChange, context: ControlContext, entityKey: EntityKey | undefined): PipelineSetupChanged {
  const opened = change.board.openSetup(updateOpeningOf(mode, change, context, entityKey), change.at);
  if (entityKey === undefined) return opened;
  return { setup: change.board.openSetupAtEntity(opened.setup.setupId, entityKey).setup, logged: opened.logged };
}

/** An update at an entity names that level, so a resume opens that entity's session and none at the forge. */
function startUpdate(command: CommandOf<'pipeline-update-start'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  return openedAtLevelOf('update', change, context, entityFieldOf(command));
}

/**
 * `advise` opens an advise record on the stored pipeline and launches its pipeline agent, which proposes edits of the record's draft; at
 * an entity, the session is that entity's.
 */
export function startAdvice(command: CommandOf<'pipeline-agent-advise'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const entityKey = entityFieldOf(command);
  return startedAgentOf(openedAtLevelOf('advise', change, context, entityKey), change, entityKey);
}

function setBilling(command: CommandOf<'pipeline-setup-billing'>, change: TrackerChange): PipelineSetupChanged {
  return change.board.setSetupBilling(textFieldOf(command, 'setupId'), billingFieldOf(command), change.at);
}

function moveStep(command: CommandOf<'pipeline-setup-step'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const step    = stepFieldOf(command);
  if (fieldOf(command, 'move') !== 'continue') refuseMalformedSetupCommand(command.kind, 'move');
  const changed = change.board.continueSetupStep(setupId, step, change.at);
  const messaged = messagedToEveryAgent(changed, change, context, {
    kind: 'step-continued', setupId, mode: changed.setup.mode, step, currentStep: changed.setup.currentStep
  });
  return step === 'entities' ? startedEntityAgentsOf(messaged, change) : messaged;
}

/**
 * Every live agent of the record, the forge's and each entity's, is stopped in the same hold; the Overseer removes the snapshot once no
 * pipeline agent runs.
 */
function startOver(command: CommandOf<'pipeline-setup-start-over'>, change: TrackerChange): PipelineSetupChanged {
  const changed  = change.board.startOverSetup(textFieldOf(command, 'setupId'), change.at);
  const agentJobIds = [changed.setup.agentJobId, ...entityKeysOfParts(changed.setup).map((entityKey) => agentJobIdAt(changed.setup, entityKey))];
  const stopped = agentJobIds.flatMap((agentJobId) => {
    const agent = agentJobId === null ? undefined : change.board.jobById(agentJobId);
    return agent === undefined || agent.state === 'stopping' ? [] : change.board.requestJobStop(agent.id, 'stop', change.at).logged;
  });
  return stopped.length === 0 ? changed : { setup: changed.setup, logged: [...changed.logged, ...stopped] };
}

/** Every path whose content differs between the two commits, as git spells it; `null` when git cannot answer. */
function pathsChangedBetween(repositoryRoot: string, fromCommit: string, toCommit: string): string[] | null {
  const run = GitProcess.run(repositoryRoot, ['diff', '--name-only', '--no-renames', '-z', fromCommit, toCommit, '--']);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\0').filter((path) => path !== '');
}

interface MainLineMove {
  mainTip:            string;
  mainMovedByCommits: number;
  changedPaths:       string[];
}

/** Read-only: how far main moved past the snapshot. `null` when it did not move, or when git cannot tell, which moves nothing. */
function mainLineMoveOf(repositoryRoot: string, snapshotCommit: string | null): MainLineMove | null {
  if (snapshotCommit === null) return null;
  const mainTip = GitProcess.resolvedCommitOf(repositoryRoot, mainLineOf(repositoryRoot));
  if (mainTip === null || mainTip === snapshotCommit) return null;
  const mainMovedByCommits = commitCountAheadOf(repositoryRoot, snapshotCommit, mainTip);
  const changedPaths = pathsChangedBetween(repositoryRoot, snapshotCommit, mainTip);
  return mainMovedByCommits === null || changedPaths === null ? null : { mainTip, mainMovedByCommits, changedPaths };
}

/**
 * Opens the record's agent again. When main moved past the snapshot, the record takes main's tip as its snapshot commit and the changed
 * paths, research needs a recheck, and the message names the paths; the Overseer checks the snapshot out at that commit before the
 * agent's next launch. An agent that ended other than by a stop is replaced by a new one, which starts from the record.
 */
function resumeSetup(command: CommandOf<'pipeline-setup-resume'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const setup   = change.board.pipelineSetup();
  if (setup?.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
  const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
  if (setup.applyRequest !== null && pendingStates.includes(setup.applyRequest.state)) throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
  const move    = mainLineMoveOf(change.workspace.rootDirectory, setup.snapshotCommit);
  const resumed = move === null ? { setup, logged: [] } : change.board.resumeSetup(setupId, move.mainTip, move.changedPaths, change.at);
  const message: SetupMessage = {
    kind: 'setup-resumed', setupId, mainMovedByCommits: move?.mainMovedByCommits ?? 0, changedPaths: move?.changedPaths ?? []
  };
  return resumedLevelsOf(resumed.setup).reduce((latest, entityKey) => resumedAgentOf(latest, change, context, message, entityKey), resumed);
}

/**
 * The levels a resume opens: the level the record opened at, the forge unless an update or advise opened at an entity; and each other
 * entity whose part a session served. A part that only a check or an edit made is no level.
 */
function resumedLevelsOf(setup: Readonly<PipelineSetup>): (EntityKey | undefined)[] {
  const servedEntityKeys = entityKeysOfParts(setup)
    .filter((entityKey) => entityKey !== setup.openedAtEntity && agentJobIdAt(setup, entityKey) !== null);
  return [setup.openedAtEntity, ...servedEntityKeys];
}

/** A level with no agent gets one; one that takes a message hears the resume; one that ended other than by a stop is replaced. */
function resumedAgentOf(
  resumed: PipelineSetupChanged, change: TrackerChange, context: ControlContext, message: SetupMessage, entityKey: EntityKey | undefined
): PipelineSetupChanged {
  const agentJobId = agentJobIdAt(resumed.setup, entityKey);
  if (agentJobId === null) return startedAgentOf(resumed, change, entityKey);
  if (agentTakesAMessage(change.board, agentJobId)) return messagedToTheAgent(resumed, change, context, message, entityKey);
  // A live agent whose input is closing ends `closed`, and User's next move opens it again.
  if (change.board.jobById(agentJobId) !== undefined) return resumed;
  return startedAgentOf(resumed, change, entityKey);
}

function answerQuestion(command: CommandOf<'pipeline-setup-answer'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId    = textFieldOf(command, 'setupId');
  const questionId = textFieldOf(command, 'questionId');
  const reply      = replyFieldOf(command);
  const changed    = change.board.answerSetupQuestion(setupId, questionId, reply, change.at);
  return messagedToTheAgent(changed, change, context, {
    kind: 'question-answered', setupId, questionId, reply
  }, questionLevelOf(changed.setup, questionId));
}

/** The entity whose part holds the question; the forge's own questions, and an id no part holds, are the forge's. */
function questionLevelOf(setup: Readonly<PipelineSetup>, questionId: string): EntityKey | undefined {
  return entityKeysOfParts(setup).find((entityKey) => setup.entities?.[entityKey]?.questions.some((question) => question.questionId === questionId) === true);
}

function editConstitution(command: CommandOf<'pipeline-constitution-edit'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId     = textFieldOf(command, 'setupId');
  const revision    = revisionFieldOf(command, 'revision');
  const markdown    = markdownFieldOf(command);
  const draftedFrom = sourcesFieldOf(command);
  if (markdown === undefined && draftedFrom === undefined) refuseMalformedSetupCommand(command.kind, 'markdown');
  const entityKey = entityFieldOf(command);
  if (change.board.pipelineSetup()?.setupId === setupId) requireEntityLevel(change.board.pipelineSetup()?.draft ?? null, entityKey);
  const edit    = { revision, ...(markdown === undefined ? {} : { markdown }), ...(draftedFrom === undefined ? {} : { draftedFrom }) };
  const changed = change.board.editConstitution(setupId, edit, change.at, entityKey);
  const constitution = entityKey === undefined ? changed.setup.constitution : changed.setup.entities?.[entityKey]?.constitution ?? null;
  return messagedToTheAgent(changed, change, context, {
    kind:        'constitution-edited',
    setupId,
    revision:    constitution?.revision ?? revision,
    markdown:    markdown === undefined ? null : constitution?.markdown ?? markdown,
    draftedFrom: draftedFrom === undefined ? null : { ...(constitution?.draftedFrom ?? draftedFrom) },
  }, entityKey);
}

/**
 * The draft a move would leave must pass the draft's read of the setup record, which is the `pipeline.json` validator but for the entities'
 * set check: entities the validator refuses are kept while User works on them, and Continue and Apply wait for none. It is checked before
 * the move touches the Board: a relayed command shares the Overseer's hold, which a refusal does not undo, so no move leaves a record the
 * board cannot read.
 */
export function requireStorableDraft(setupId: string, draft: Readonly<Pipeline>): void {
  const reading = PipelineFile.draftReadingOf(PipelineFile.storedDocumentOf(draft));
  if (reading.verdict === 'readable') return;
  const reason = reading.verdict === 'malformed' ? reading.reason : reading.verdict;
  throw new OperationRefusal('refused', { kind: 'pipeline-draft-invalid', setupId, reason });
}

/** The draft a move works on: the record's own, else the base it starts from, the stored pipeline or the minimal one. */
function workingDraftOf(board: Board): Pipeline {
  return structuredClone(board.pipelineSetup()?.draft ?? board.pipeline() ?? PipelineUtil.minimalPipelineOf()) as Pipeline;
}

/** Each field a move changed with its value now, so the agent, which cannot read the record, keeps the draft as User left it. */
function draftChangesOf(before: Readonly<Pipeline>, changed: PipelineSetupChanged): DraftFieldValue[] {
  const after = changed.setup.draft ?? PipelineUtil.minimalPipelineOf();
  return PipelineChangeUtil.changesBetween(before, after, false).map(({ field, after: value }) => ({ field, value }));
}

function changeFieldsOf(changes: readonly DraftFieldValue[]): PipelineDraftField[] {
  return changes.map((fieldChange) => fieldChange.field);
}

/** Every refusal of the draft's entities, worded as the reason a stored pipeline would be refused for, which the pipeline agent hears. */
function standingEntityRefusalsOf(draft: Readonly<Pipeline> | null): string[] {
  return EntityValidationUtil.refusalsOf(draft?.entities ?? {}).map(OperationRefusalWordingUtil.entityRefusalReasonOf);
}

/** The edits land together at the next revision, entities the validator refuses included. */
function editDraft(command: CommandOf<'pipeline-draft-edit'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId  = textFieldOf(command, 'setupId');
  const revision = revisionFieldOf(command, 'draftRevision');
  const edits    = draftEditsFieldOf(command).map((edit) => ({ edit, summary: '' }));
  const copyFlag = copyFlagFieldOf(command);
  const before   = workingDraftOf(change.board);
  const request  = {
    by: 'user' as const, revision, edits, ...copyFlag
  };
  requireStorableDraft(setupId, change.board.draftAfterEdits(setupId, request));
  if (copyFlag.isACopy === true) refuseACopyOutsideEntities(setupId, change.board.pipelineSetup(), edits.map(({ edit }) => edit));
  const changed  = change.board.editDraft(setupId, request, change.at);
  const newEdits = changed.setup.edits.slice(-edits.length);
  const changes  = draftChangesOf(before, changed);
  const standingEntityRefusals = standingEntityRefusalsOf(changed.setup.draft);
  return messagedPerLevel(changed, change, context, [...newEdits.map((edit) => edit.field), ...changeFieldsOf(changes)], (keeps) => {
    const keptEdits = newEdits.filter((edit) => keeps(edit.field));
    return {
      kind:          'draft-edited',
      setupId,
      draftRevision: changed.setup.draftRevision,
      editIds:       keptEdits.map((edit) => edit.editId),
      fields:        keptEdits.map((edit) => edit.field),
      changes:       changes.filter((fieldChange) => keeps(fieldChange.field)),
      standingEntityRefusals,
    };
  });
}

/** Absent or `true`: the Undo takes back the edit's whole copy at once; any other value is malformed. */
function wholeBatchFieldOf(command: SentCommand): boolean {
  const value = fieldOf(command, 'wholeBatch');
  if (value === undefined) return false;
  if (value !== true) refuseMalformedSetupCommand(command.kind, 'wholeBatch');
  return true;
}

/** A copy's set undone at once: each level's session hears the edits of its own level, as it heard them made. */
function undoDraftBatch(setupId: string, editId: string, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const before   = workingDraftOf(change.board);
  requireStorableDraft(setupId, change.board.draftAfterBatchUndo(setupId, editId));
  const standing = new Set(change.board.pipelineSetup()?.edits.filter((edit) => !edit.undone).map((edit) => edit.editId));
  const changed  = change.board.undoDraftBatch(setupId, editId, change.at);
  const undone   = changed.setup.edits.filter((edit) => edit.undone && standing.has(edit.editId));
  const changes  = draftChangesOf(before, changed);
  return messagedPerLevel(changed, change, context, [...undone.map((edit) => edit.field), ...changeFieldsOf(changes)], (keeps) => {
    const keptEdits = undone.filter((edit) => keeps(edit.field));
    return {
      kind:          'draft-batch-undone',
      setupId,
      draftRevision: changed.setup.draftRevision,
      editIds:       keptEdits.map((edit) => edit.editId),
      fields:        keptEdits.map((edit) => edit.field),
      changes:       changes.filter((fieldChange) => keeps(fieldChange.field)),
    };
  });
}

function undoDraftEdit(command: CommandOf<'pipeline-draft-undo'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const editId  = textFieldOf(command, 'editId');
  if (wholeBatchFieldOf(command)) return undoDraftBatch(setupId, editId, change, context);
  const before  = workingDraftOf(change.board);
  requireStorableDraft(setupId, change.board.draftAfterUndo(setupId, editId));
  const changed = change.board.undoDraftEdit(setupId, editId, change.at);
  const undone  = changed.setup.edits.find((edit) => edit.editId === editId);
  if (undone === undefined) return changed;
  return messagedToTheAgent(changed, change, context, {
    kind: 'draft-edit-undone', setupId, draftRevision: changed.setup.draftRevision, editId, field: undone.field, changes: draftChangesOf(before, changed)
  }, levelOfField(undone.field));
}

function discardDraft(command: CommandOf<'pipeline-draft-discard'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const before  = workingDraftOf(change.board);
  const changed = change.board.discardDraft(setupId, change.at);
  const changes = draftChangesOf(before, changed);
  return messagedPerLevel(changed, change, context, changeFieldsOf(changes), (keeps) => ({
    kind: 'draft-discarded', setupId, draftRevision: changed.setup.draftRevision, changes: changes.filter((fieldChange) => keeps(fieldChange.field))
  }));
}

/**
 * The Overseer runs the queued checks at its next pass; the agent hears which gates it runs. On a draft over entities, each entity the
 * draft touched has its own check, and its session hears only its gates.
 */
function requestCheck(command: CommandOf<'pipeline-check'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const changed = change.board.requestPipelineCheck(setupId, change.at);
  const messageOf = (gateNames: readonly string[]): SetupMessage => ({
    kind: 'check-requested', setupId, draftRevision: changed.setup.draftRevision, gateNames
  });
  if (changed.setup.draft?.entities === undefined) return messagedToTheAgent(changed, change, context, messageOf(changed.setup.check?.gateNames ?? []));
  return entityKeysOfParts(changed.setup)
    .filter((entityKey) => changed.setup.entities?.[entityKey]?.check?.state === 'queued')
    .reduce((latest, entityKey) => messagedToTheAgent(latest, change, context, messageOf(latest.setup.entities?.[entityKey]?.check?.gateNames ?? []), entityKey), changed);
}

function revisionAndResumeOf(command: CommandOf<'pipeline-apply'>): { draftRevision: number; resumesBoard: boolean } {
  const draftRevision = revisionFieldOf(command, 'draftRevision');
  const resumesBoard  = fieldOf(command, 'resumesBoard');
  if (typeof resumesBoard !== 'boolean') refuseMalformedSetupCommand(command.kind, 'resumesBoard');
  return { draftRevision, resumesBoard };
}

type EntityConstitutionsReading = { verdict: 'read'; readings: EntityConstitutionsOnMain } | { verdict: 'unreadable'; reason: string };

/**
 * Each entity's constitution file on main, at the path its draft entity names or in its first home, read only on a draft over entities;
 * unreadable, with git's reason, when git could not answer one of them.
 */
function entityConstitutionsOf(change: TrackerChange, context: ControlContext): EntityConstitutionsReading {
  const entities = change.board.pipelineSetup()?.draft?.entities ?? {};
  const readings: Record<EntityKey, MainConstitution | null> = {};
  for (const [entityKey, entity] of Object.entries(entities)) {
    const reading = context.mainConstitutionOf(change.workspace.rootDirectory, EntityFoldersUtil.constitutionPathOf(entity));
    if (reading.verdict === 'unreadable') return reading;
    readings[entityKey] = reading.verdict === 'read' ? reading.constitution : null;
  }
  return { verdict: 'read', readings };
}

/** What an Apply reads of main: the forge's `CONSTITUTION.md` and, on a draft over entities, each entity's file. */
function applyMainReadingOf(mainConstitution: MainConstitution | null, entityConstitutions: EntityConstitutionsOnMain | undefined): ApplyMainReading {
  return { mainConstitution, ...(entityConstitutions === undefined ? {} : { entityConstitutions }), entityAssignmentRequestOf, };
}

function draftHasEntities(change: TrackerChange): boolean {
  return change.board.pipelineSetup()?.draft?.entities !== undefined;
}

/**
 * Stage 1 of an Apply. An unreadable `pipeline.json` is replaced only by a record opened to replace it; main's constitution is read for
 * the Board, and on a draft over entities each entity's file, and the Board refuses, waits for the constitution commit, or applies at
 * once when main already holds every draft's text.
 */
function applySetup(command: CommandOf<'pipeline-apply'>, change: TrackerChange, context: ControlContext): PipelineApplyChanged {
  const setupId = textFieldOf(command, 'setupId');
  const { draftRevision, resumesBoard } = revisionAndResumeOf(command);
  if (change.board.pipelineSetup()?.replacesUnreadablePipeline !== true) requireReadablePipeline(change);
  const mainConstitution = mainConstitutionOf(change, context);
  let entityConstitutions: EntityConstitutionsOnMain | undefined;
  if (change.board.pipelineSetup()?.setupId === setupId && draftHasEntities(change)) {
    const reading = entityConstitutionsOf(change, context);
    if (reading.verdict === 'unreadable') throw new OperationRefusal('unrepaired', { kind: 'main-constitution-unreadable', reason: reading.reason });
    entityConstitutions = reading.readings;
  }
  return change.board.requestApply(setupId, { draftRevision, resumesBoard, ...applyMainReadingOf(mainConstitution, entityConstitutions) }, change.at);
}

/**
 * At the Overseer's start, in its first hold: an Apply cut short after it stored the pipeline finishes. Main is read only while a record
 * and a pipeline are both stored, and a read git cannot answer leaves the record for the next start.
 */
export function finishHalfAppliedSetup(change: TrackerChange, context: ControlContext): PipelineApplyChanged | null {
  if (change.board.pipelineSetup() === null || change.board.pipeline() === null) return null;
  const reading = context.mainConstitutionOf(change.workspace.rootDirectory);
  if (reading.verdict === 'unreadable') return null;
  const entityReading = draftHasEntities(change) ? entityConstitutionsOf(change, context) : undefined;
  if (entityReading?.verdict === 'unreadable') return null;
  return change.board.finishHalfAppliedSetup(applyMainReadingOf(reading.verdict === 'read' ? reading.constitution : null, entityReading?.readings), change.at);
}

function cancelApply(command: CommandOf<'pipeline-apply-cancel'>, change: TrackerChange): PipelineSetupChanged {
  return change.board.cancelApply(textFieldOf(command, 'setupId'), change.at);
}

export const PIPELINE_SETUP_CONTROLS = {
  'pipeline-setup-start':       startSetup,
  'pipeline-setup-billing':     setBilling,
  'pipeline-setup-step':        moveStep,
  'pipeline-setup-start-over':  startOver,
  'pipeline-setup-resume':      resumeSetup,
  'pipeline-setup-answer':      answerQuestion,
  'pipeline-constitution-edit': editConstitution,
  'pipeline-update-start':      startUpdate,
  'pipeline-draft-edit':        editDraft,
  'pipeline-draft-undo':        undoDraftEdit,
  'pipeline-draft-discard':     discardDraft,
  'pipeline-check':             requestCheck,
  'pipeline-apply':             applySetup,
  'pipeline-apply-cancel':      cancelApply,
} as const;

/** The kinds User sends about the setup record, each applied here. */
export type PipelineSetupCommandKind = keyof typeof PIPELINE_SETUP_CONTROLS;
