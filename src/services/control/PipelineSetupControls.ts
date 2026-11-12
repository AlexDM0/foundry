/**
 * User's kinds of the pipeline setup record: start and update, billing, Continue, start over, an answer, the constitution, draft edits, Undo
 * and discard. A body is untrusted JSON, so each applier checks its nested payload and refuses `malformed-setup-command` before the Board
 * is touched. An answer, a constitution or draft edit, an Undo, a discard or a Continue also messages a live pipeline agent in the same
 * hold, in the caller's words.
 */
import { PipelineFile }              from '../../adapters/pipeline/PipelineFile.ts';
import { SetupPayloadSchemas }       from '../../adapters/pipeline-setup/SetupPayloadSchemas.ts';
import { JsonRecordUtil }            from '../../lib/json-record/JsonRecordUtil.ts';
import type { PipelineSetupChanged } from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { PipelineBilling }      from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ConstitutionSources,
  PipelineDraftEdit,
  PipelineSetupStep,
  SetupQuestionReply
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { PIPELINE_SETUP_STEPS }                                   from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { ControlCommandKind, ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext, SetupMessage }                      from '../../shared/@types/ControlContext.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import type { TrackerChange }                                     from '../tracker/TrackerPipeline.ts';
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

function draftEditsFieldOf(command: SentCommand): PipelineDraftEdit[] {
  const edits = fieldOf(command, 'edits');
  if (!Array.isArray(edits) || edits.length === 0) refuseMalformedSetupCommand(command.kind, 'edits');
  return edits.map((fieldEdit: unknown, index) => {
    const reading = SetupPayloadSchemas.draftEditReadingOf(fieldEdit, index);
    if (reading.verdict === 'malformed') refuseMalformedSetupCommand(command.kind, reading.field);
    return reading.value;
  });
}

/**
 * A live pipeline agent hears User's move in the same hold, so the next turn starts from it. A record with no agent yet, or an agent
 * that has ended or is stopping, gets no message: the record is what a later agent starts from.
 */
function messagedToTheAgent(changed: PipelineSetupChanged, change: TrackerChange, context: ControlContext, message: SetupMessage): PipelineSetupChanged {
  const { agentJobId } = changed.setup;
  const agent = agentJobId === null ? undefined : change.board.jobById(agentJobId);
  if (agent === undefined || agent.state === 'stopping') return changed;
  const messaged = change.board.messageJob(agent.id, context.setupMessageWordingOf(message), [], change.at);
  return { setup: changed.setup, logged: [...changed.logged, ...messaged.logged] };
}

function startSetup(command: CommandOf<'pipeline-setup-start'>, change: TrackerChange): PipelineSetupChanged {
  const billing = billingFieldOf(command);
  const replacesUnreadablePipeline = fieldOf(command, 'replacesUnreadablePipeline');
  if (typeof replacesUnreadablePipeline !== 'boolean') refuseMalformedSetupCommand(command.kind, 'replacesUnreadablePipeline');
  return change.board.openSetup({
    mode: 'setup', billing, replacesUnreadablePipeline, mainConstitution: null, storedAnnotations: []
  }, change.at);
}

/** An update starts from the stored pipeline, so an older or malformed file refuses with its own reason; its billing is the stored one. */
function startUpdate(_command: CommandOf<'pipeline-update-start'>, change: TrackerChange): PipelineSetupChanged {
  requireReadablePipeline(change);
  const billing = change.board.pipeline()?.billing ?? { mode: 'subscription' };
  return change.board.openSetup({
    mode: 'update', billing, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, change.at);
}

function setBilling(command: CommandOf<'pipeline-setup-billing'>, change: TrackerChange): PipelineSetupChanged {
  return change.board.setSetupBilling(textFieldOf(command, 'setupId'), billingFieldOf(command), change.at);
}

function moveStep(command: CommandOf<'pipeline-setup-step'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const step    = stepFieldOf(command);
  if (fieldOf(command, 'move') !== 'continue') refuseMalformedSetupCommand(command.kind, 'move');
  const changed = change.board.continueSetupStep(setupId, step, change.at);
  return messagedToTheAgent(changed, change, context, {
    kind: 'step-continued', setupId, step, currentStep: changed.setup.currentStep
  });
}

function startOver(command: CommandOf<'pipeline-setup-start-over'>, change: TrackerChange): PipelineSetupChanged {
  return change.board.startOverSetup(textFieldOf(command, 'setupId'), change.at);
}

function answerQuestion(command: CommandOf<'pipeline-setup-answer'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId    = textFieldOf(command, 'setupId');
  const questionId = textFieldOf(command, 'questionId');
  const reply      = replyFieldOf(command);
  const changed    = change.board.answerSetupQuestion(setupId, questionId, reply, change.at);
  return messagedToTheAgent(changed, change, context, {
    kind: 'question-answered', setupId, questionId, reply
  });
}

function editConstitution(command: CommandOf<'pipeline-constitution-edit'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId     = textFieldOf(command, 'setupId');
  const revision    = revisionFieldOf(command, 'revision');
  const markdown    = markdownFieldOf(command);
  const draftedFrom = sourcesFieldOf(command);
  if (markdown === undefined && draftedFrom === undefined) refuseMalformedSetupCommand(command.kind, 'markdown');
  const edit    = { revision, ...(markdown === undefined ? {} : { markdown }), ...(draftedFrom === undefined ? {} : { draftedFrom }) };
  const changed = change.board.editConstitution(setupId, edit, change.at);
  return messagedToTheAgent(changed, change, context, {
    kind:            'constitution-edited',
    setupId,
    revision:        changed.setup.constitution?.revision ?? revision,
    markdownChanged: markdown !== undefined,
    sourcesChanged:  draftedFrom !== undefined,
  });
}

/**
 * The draft a move leaves must pass the `pipeline.json` validator, as the stored record's read requires; otherwise the hold throws and
 * nothing is written, so no move leaves a record the board cannot read.
 */
export function requireStorableDraft(changed: PipelineSetupChanged): void {
  const reading = PipelineFile.documentReadingOf(JSON.parse(JSON.stringify(changed.setup.draft)));
  if (reading.verdict === 'readable') return;
  const reason = reading.verdict === 'malformed' ? reading.reason : reading.verdict;
  throw new OperationRefusal('refused', { kind: 'pipeline-draft-invalid', setupId: changed.setup.setupId, reason });
}

/** The edits land together at the next revision. */
function editDraft(command: CommandOf<'pipeline-draft-edit'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId  = textFieldOf(command, 'setupId');
  const revision = revisionFieldOf(command, 'draftRevision');
  const edits    = draftEditsFieldOf(command).map((edit) => ({ edit, summary: '' }));
  const changed  = change.board.editDraft(setupId, { by: 'user', revision, edits }, change.at);
  requireStorableDraft(changed);
  const newEdits = changed.setup.edits.slice(-edits.length);
  return messagedToTheAgent(changed, change, context, {
    kind:          'draft-edited',
    setupId,
    draftRevision: changed.setup.draftRevision,
    editIds:       newEdits.map((edit) => edit.editId),
    fields:        newEdits.map((edit) => edit.field),
  });
}

function undoDraftEdit(command: CommandOf<'pipeline-draft-undo'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const editId  = textFieldOf(command, 'editId');
  const changed = change.board.undoDraftEdit(setupId, editId, change.at);
  requireStorableDraft(changed);
  const undone  = changed.setup.edits.find((edit) => edit.editId === editId);
  if (undone === undefined) return changed;
  return messagedToTheAgent(changed, change, context, {
    kind: 'draft-edit-undone', setupId, draftRevision: changed.setup.draftRevision, editId, field: undone.field
  });
}

function discardDraft(command: CommandOf<'pipeline-draft-discard'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const changed = change.board.discardDraft(setupId, change.at);
  return messagedToTheAgent(changed, change, context, { kind: 'draft-discarded', setupId, draftRevision: changed.setup.draftRevision });
}

export const PIPELINE_SETUP_CONTROLS = {
  'pipeline-setup-start':       startSetup,
  'pipeline-setup-billing':     setBilling,
  'pipeline-setup-step':        moveStep,
  'pipeline-setup-start-over':  startOver,
  'pipeline-setup-answer':      answerQuestion,
  'pipeline-constitution-edit': editConstitution,
  'pipeline-update-start':      startUpdate,
  'pipeline-draft-edit':        editDraft,
  'pipeline-draft-undo':        undoDraftEdit,
  'pipeline-draft-discard':     discardDraft,
} as const;

/** The kinds User sends about the setup record, each applied here. */
export type PipelineSetupCommandKind = keyof typeof PIPELINE_SETUP_CONTROLS;
