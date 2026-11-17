/**
 * The job and intake kinds of the control contract. Each records in the hold and the Overseer carries it out, so every one works with the
 * Overseer down; `job fresh` is a stop whose job ends `replaced`, so the policy launches the next attempt on the same worktree. Naming an
 * incident marks it handled by the move in the same hold.
 */
import { TicketAcceptanceUtil }                from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import { JsonRecordUtil }                      from '../../lib/json-record/JsonRecordUtil.ts';
import type { PictureReference }               from '../../lib/tracker-model/@types/Job.ts';
import { BoardRefusal }                        from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommandOf }               from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                    from '../../shared/OperationRefusal.ts';
import { PICTURES_PER_MESSAGE_LIMIT }          from '../../shared/constants/OverseerLimits.ts';
import { PictureStore }                        from '../tracker/PictureStore.ts';
import type { TrackerChange }                  from '../tracker/TrackerPipeline.ts';
import { handledUnder, requireIncidentAllows } from './IncidentControls.ts';
import { startAdvice }                         from './PipelineSetupControls.ts';

function isPictureReference(value: unknown): value is PictureReference {
  return JsonRecordUtil.valueIsAPlainObject(value) && typeof value['pictureId'] === 'string' && typeof value['name'] === 'string';
}

/**
 * The pictures a command names, refused before the Board: over `PICTURES_PER_MESSAGE_LIMIT` as `too-many-pictures`, one the board's store
 * does not hold as `picture-unknown`. A `pictures` that is no list of them fails on its shape, as a body lacking a field does.
 */
function storedPicturesOf(pictures: unknown, change: TrackerChange): PictureReference[] {
  if (pictures === undefined) return [];
  if (!Array.isArray(pictures) || !pictures.every(isPictureReference)) throw new TypeError('pictures is not a list of { pictureId, name }');
  if (pictures.length > PICTURES_PER_MESSAGE_LIMIT) {
    throw new OperationRefusal('refused', { kind: 'too-many-pictures', pictureCount: pictures.length, limit: PICTURES_PER_MESSAGE_LIMIT });
  }
  const unknownPicture = pictures.find((picture) => !PictureStore.pictureIsStored(change.workspace.trackerDirectory, picture.pictureId));
  if (unknownPicture !== undefined) throw new OperationRefusal('refused', { kind: 'picture-unknown', pictureId: unknownPicture.pictureId });
  return pictures.map((picture) => ({ pictureId: picture.pictureId, name: picture.name }));
}

function closeIntake(command: ControlCommandOf<'intake-close'>, change: TrackerChange) {
  if (command.jobId === undefined) throw new OperationRefusal('refused', { kind: 'intake-close-without-job' });
  return change.board.closeIntake(command.jobId, command.proposedDraftSets, TicketAcceptanceUtil.readinessGapsOf, change.at);
}

function titleIntake(command: ControlCommandOf<'intake-title'>, change: TrackerChange) {
  if (command.jobId === undefined) throw new OperationRefusal('refused', { kind: 'intake-title-without-job' });
  return change.board.titleIntake(command.jobId, command.title, change.at);
}

/** The command's fields are read as untrusted JSON: the Board refuses notes that are not well formed. */
function noteQuestionOptions(command: ControlCommandOf<'question-options'>, change: TrackerChange) {
  if (command.jobId === undefined) throw new OperationRefusal('refused', { kind: 'question-options-without-job' });
  return change.board.noteQuestionOptions(command.jobId, { question: command.question, options: command.options });
}

/** Recorded only: the Overseer files the need as its entity's ticket. The body is read as `ticket ready` reads a draft's. */
function declareNeed(command: ControlCommandOf<'need-declare'>, change: TrackerChange) {
  if (command.jobId === undefined) throw new OperationRefusal('refused', { kind: 'need-declare-without-job' });
  const declaration = { entity: command.entity, title: command.title, body: command.bodyText };
  return change.board.declareNeed(command.jobId, declaration, TicketAcceptanceUtil.readinessGapsOf);
}

function freshAgent(command: ControlCommandOf<'job-fresh'>, change: TrackerChange) {
  if (command.incidentId !== undefined) requireIncidentAllows(change, command.incidentId, command);
  return handledUnder(change, command.incidentId, 'job-fresh', change.board.requestJobStop(command.jobId, 'fresh', change.at));
}

/** A chat turn under an incident never reaches a job waiting on User's answer, nor User's own product-owner session. */
function messageJob(command: ControlCommandOf<'job-message'>, change: TrackerChange) {
  const pictures = storedPicturesOf(command.pictures, change);
  if (command.incidentId === undefined) return change.board.messageJob(command.jobId, command.text, pictures, change.at);
  requireIncidentAllows(change, command.incidentId, command);
  const job = change.board.jobById(command.jobId);
  if (job?.kind === 'product-owner') throw new BoardRefusal({ reason: 'job-is-product-owner', jobId: command.jobId });
  const ticketAwaitsUser = change.board.decisions().some((decision) => decision.kind === 'agent-question'
    && decision.ticketIds.some((ticketId) => job?.ticketIds.includes(ticketId) === true));
  if (job?.state === 'waiting-for-answer' || ticketAwaitsUser) throw new BoardRefusal({ reason: 'job-awaits-user-answer', jobId: command.jobId });
  return handledUnder(change, command.incidentId, 'job-message', change.board.messageJob(command.jobId, command.text, pictures, change.at));
}

export const JOB_CONTROLS = {
  'job-stop':     (command: ControlCommandOf<'job-stop'>, change: TrackerChange) => change.board.requestJobStop(command.jobId, command.mode, change.at),
  'job-fresh':    freshAgent,
  'job-stop-all': (command: ControlCommandOf<'job-stop-all'>, change: TrackerChange) => change.board.stopAllJobs(command.mode, change.at),
  'job-message':  messageJob,
  'intake-start': (command: ControlCommandOf<'intake-start'>, change: TrackerChange) => change.board.startIntake(
    command.text, storedPicturesOf(command.pictures, change), change.at
  ),
  'pipeline-agent-advise': startAdvice,
  'intake-close':          closeIntake,
  'intake-title':          titleIntake,
  'question-options':      noteQuestionOptions,
  'need-declare':          declareNeed,
} as const;
