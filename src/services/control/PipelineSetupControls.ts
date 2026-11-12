/**
 * User's kinds of the pipeline setup record: start, update and advise, billing, Continue, start over, resume, an answer, the constitution,
 * draft edits, Undo, discard, a check, Apply and its cancel. A body is untrusted JSON, so each applier checks its nested payload and
 * refuses `malformed-setup-command` before the Board is touched. A start and an advise launch the record's pipeline agent, and a start over
 * stops it. An answer, a constitution or draft edit, an Undo, a discard, a Continue, a resume and a check also message the agent in the
 * same hold, in the caller's words, with what the move changed, and open it again when a stop closed it. An update, an advise and an Apply read main's
 * `CONSTITUTION.md` through the context.
 */
import { PipelineFile }                                    from '../../adapters/pipeline/PipelineFile.ts';
import { SetupPayloadSchemas }                             from '../../adapters/pipeline-setup/SetupPayloadSchemas.ts';
import { GitProcess }                                      from '../../lib/git/GitProcess.ts';
import { commitCountAheadOf }                              from '../../lib/git/MergeTree.ts';
import { JsonRecordUtil }                                  from '../../lib/json-record/JsonRecordUtil.ts';
import type { PipelineApplyChanged, PipelineSetupChanged } from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { Pipeline, PipelineBilling }                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ConstitutionSources,
  MainConstitution,
  PipelineDraftEdit,
  PipelineSetupOpening,
  PipelineSetupStep,
  SetupQuestionReply
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                             from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                           from '../../lib/tracker-model/BoardRefusal.ts';
import { PENDING_APPLY_REQUEST_STATES, PIPELINE_SETUP_STEPS }     from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { PipelineChangeUtil }                                     from '../../lib/tracker-model/utils/PipelineChangeUtil.ts';
import { PipelineUtil }                                           from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommandKind, ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext, DraftFieldValue, SetupMessage }     from '../../shared/@types/ControlContext.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import { mainLineOf }                                             from '../lifecycle/MergeTargets.ts';
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
 * The record's pipeline agent hears User's move in the same hold, so the next turn starts from it: a live one gets the message, and one a
 * stop closed opens again with its conversation. A record with no agent, an agent whose input is closing, or one that ended otherwise gets
 * no message: the record is what a later agent starts from.
 */
function messagedToTheAgent(changed: PipelineSetupChanged, change: TrackerChange, context: ControlContext, message: SetupMessage): PipelineSetupChanged {
  return messagedToTheSetupAgent(changed, change.board, context.setupMessageWordingOf(message), change.at);
}

/** The same for the Overseer, which words its own message; a record whose agent takes no message is returned as it was. */
export function messagedToTheSetupAgent(changed: PipelineSetupChanged, board: Board, text: string, at: string): PipelineSetupChanged {
  const { agentJobId } = changed.setup;
  if (agentJobId === null || !agentTakesAMessage(board, agentJobId)) return changed;
  const messaged = board.messageJob(agentJobId, text, [], at);
  return { setup: changed.setup, logged: [...changed.logged, ...messaged.logged] };
}

function agentTakesAMessage(board: Board, agentJobId: string): boolean {
  const live = board.jobById(agentJobId);
  if (live !== undefined) return live.state !== 'stopping';
  return board.endedJobOutcomeOf(agentJobId)?.outcome === 'closed';
}

/** A new pipeline agent for the record: launched by User's command alone, never by the lifecycle. */
function startedAgentOf(changed: PipelineSetupChanged, change: TrackerChange): PipelineSetupChanged {
  const launched = change.board.startPipelineAgent(change.at);
  const attached = change.board.attachSetupAgent(changed.setup.setupId, launched.job.id, null);
  return { setup: attached.setup, logged: [...changed.logged, ...launched.logged] };
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
 * An update or advise starts from the stored pipeline, so an older or malformed file refuses with its own reason; its billing is the
 * stored one, and its constitution main's text with the stored sources of that very text.
 */
function updateOpeningOf(mode: 'update' | 'advise', change: TrackerChange, context: ControlContext): PipelineSetupOpening {
  requireReadablePipeline(change);
  const billing = change.board.pipeline()?.billing ?? { mode: 'subscription' };
  const constitutionOpening = change.board.pipeline() === null ? { mainConstitution: null, storedAnnotations: [] } : openingConstitutionOf(change, context);
  return {
    mode, billing, replacesUnreadablePipeline: false, ...constitutionOpening
  };
}

function startUpdate(_command: CommandOf<'pipeline-update-start'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  return change.board.openSetup(updateOpeningOf('update', change, context), change.at);
}

/** `advise` opens an advise record on the stored pipeline and launches its pipeline agent, which proposes edits of the record's draft. */
export function startAdvice(_command: CommandOf<'pipeline-agent-advise'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  return startedAgentOf(change.board.openSetup(updateOpeningOf('advise', change, context), change.at), change);
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
    kind: 'step-continued', setupId, mode: changed.setup.mode, step, currentStep: changed.setup.currentStep
  });
}

/** The record's live agent is stopped in the same hold; the Overseer removes the snapshot once no pipeline agent runs. */
function startOver(command: CommandOf<'pipeline-setup-start-over'>, change: TrackerChange): PipelineSetupChanged {
  const changed  = change.board.startOverSetup(textFieldOf(command, 'setupId'), change.at);
  const { agentJobId } = changed.setup;
  const agent = agentJobId === null ? undefined : change.board.jobById(agentJobId);
  if (agent === undefined || agent.state === 'stopping') return changed;
  return { setup: changed.setup, logged: [...changed.logged, ...change.board.requestJobStop(agent.id, 'stop', change.at).logged] };
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
  const { agentJobId } = resumed.setup;
  if (agentJobId === null) return startedAgentOf(resumed, change);
  if (agentTakesAMessage(change.board, agentJobId)) return messagedToTheAgent(resumed, change, context, message);
  // A live agent whose input is closing ends `closed`, and User's next move opens it again.
  if (change.board.jobById(agentJobId) !== undefined) return resumed;
  return startedAgentOf(resumed, change);
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
  const { constitution } = changed.setup;
  return messagedToTheAgent(changed, change, context, {
    kind:        'constitution-edited',
    setupId,
    revision:    constitution?.revision ?? revision,
    markdown:    markdown === undefined ? null : constitution?.markdown ?? markdown,
    draftedFrom: draftedFrom === undefined ? null : { ...(constitution?.draftedFrom ?? draftedFrom) },
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

/** The draft a move works on: the record's own, else the base it starts from, the stored pipeline or the minimal one. */
function workingDraftOf(board: Board): Pipeline {
  return structuredClone(board.pipelineSetup()?.draft ?? board.pipeline() ?? PipelineUtil.minimalPipelineOf()) as Pipeline;
}

/** Each field a move changed with its value now, so the agent, which cannot read the record, keeps the draft as User left it. */
function draftChangesOf(before: Readonly<Pipeline>, changed: PipelineSetupChanged): DraftFieldValue[] {
  const after = changed.setup.draft ?? PipelineUtil.minimalPipelineOf();
  return PipelineChangeUtil.changesBetween(before, after, false).map(({ field, after: value }) => ({ field, value }));
}

/** The edits land together at the next revision. */
function editDraft(command: CommandOf<'pipeline-draft-edit'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId  = textFieldOf(command, 'setupId');
  const revision = revisionFieldOf(command, 'draftRevision');
  const edits    = draftEditsFieldOf(command).map((edit) => ({ edit, summary: '' }));
  const before   = workingDraftOf(change.board);
  const changed  = change.board.editDraft(setupId, { by: 'user', revision, edits }, change.at);
  requireStorableDraft(changed);
  const newEdits = changed.setup.edits.slice(-edits.length);
  return messagedToTheAgent(changed, change, context, {
    kind:          'draft-edited',
    setupId,
    draftRevision: changed.setup.draftRevision,
    editIds:       newEdits.map((edit) => edit.editId),
    fields:        newEdits.map((edit) => edit.field),
    changes:       draftChangesOf(before, changed),
  });
}

function undoDraftEdit(command: CommandOf<'pipeline-draft-undo'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const editId  = textFieldOf(command, 'editId');
  const before  = workingDraftOf(change.board);
  const changed = change.board.undoDraftEdit(setupId, editId, change.at);
  requireStorableDraft(changed);
  const undone  = changed.setup.edits.find((edit) => edit.editId === editId);
  if (undone === undefined) return changed;
  return messagedToTheAgent(changed, change, context, {
    kind: 'draft-edit-undone', setupId, draftRevision: changed.setup.draftRevision, editId, field: undone.field, changes: draftChangesOf(before, changed)
  });
}

function discardDraft(command: CommandOf<'pipeline-draft-discard'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const before  = workingDraftOf(change.board);
  const changed = change.board.discardDraft(setupId, change.at);
  return messagedToTheAgent(changed, change, context, {
    kind: 'draft-discarded', setupId, draftRevision: changed.setup.draftRevision, changes: draftChangesOf(before, changed)
  });
}

/** The Overseer runs the queued check at its next pass; the agent hears which gates it runs. */
function requestCheck(command: CommandOf<'pipeline-check'>, change: TrackerChange, context: ControlContext): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const changed = change.board.requestPipelineCheck(setupId, change.at);
  const { check } = changed.setup;
  return messagedToTheAgent(changed, change, context, {
    kind: 'check-requested', setupId, draftRevision: changed.setup.draftRevision, gateNames: check?.gateNames ?? []
  });
}

function revisionAndResumeOf(command: CommandOf<'pipeline-apply'>): { draftRevision: number; resumesBoard: boolean } {
  const draftRevision = revisionFieldOf(command, 'draftRevision');
  const resumesBoard  = fieldOf(command, 'resumesBoard');
  if (typeof resumesBoard !== 'boolean') refuseMalformedSetupCommand(command.kind, 'resumesBoard');
  return { draftRevision, resumesBoard };
}

/**
 * Stage 1 of an Apply. An unreadable `pipeline.json` is replaced only by a record opened to replace it; main's constitution is read for
 * the Board, which refuses, waits for the constitution commit, or applies at once when main already holds the draft's text.
 */
function applySetup(command: CommandOf<'pipeline-apply'>, change: TrackerChange, context: ControlContext): PipelineApplyChanged {
  const setupId = textFieldOf(command, 'setupId');
  const { draftRevision, resumesBoard } = revisionAndResumeOf(command);
  if (change.board.pipelineSetup()?.replacesUnreadablePipeline !== true) requireReadablePipeline(change);
  return change.board.requestApply(setupId, { draftRevision, resumesBoard, mainConstitution: mainConstitutionOf(change, context) }, change.at);
}

/**
 * At the Overseer's start, in its first hold: an Apply cut short after it stored the pipeline finishes. Main is read only while a record
 * and a pipeline are both stored, and a read git cannot answer leaves the record for the next start.
 */
export function finishHalfAppliedSetup(change: TrackerChange, context: ControlContext): PipelineApplyChanged | null {
  if (change.board.pipelineSetup() === null || change.board.pipeline() === null) return null;
  const reading = context.mainConstitutionOf(change.workspace.rootDirectory);
  if (reading.verdict === 'unreadable') return null;
  return change.board.finishHalfAppliedSetup(reading.verdict === 'read' ? reading.constitution : null, change.at);
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
