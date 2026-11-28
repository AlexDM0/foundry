/**
 * A stored file a job's ingestion cannot read is a bug, so the job does not go on as if it said nothing: the `system-file-unreadable` incident
 * goes to the Assistant, whose default parks the ticket for User. A session job neither a fresh agent nor a park can heal is retired instead,
 * so a fresh one launches by the board's own rules.
 */
import type { UnreadableFileProblem } from '../../adapters/@types/UnreadableFileProblem.ts';
import type { Incident }              from '../../domain/tracker-model/@types/Incident.ts';
import type { LogRecord }             from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Board }                 from '../../domain/tracker-model/Board.ts';
import { PARKED_HOLD_PREFIX }         from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { StoredFileProblemFactsUtil } from '../../shared/utils/StoredFileProblemFactsUtil.ts';

const UNREADABLE_FILE_INCIDENT_KIND = 'system-file-unreadable';

/** The job the file belongs to, the file's path inside the board's data folder, and why its ingestion could not read it. */
export interface UnreadableJobFile {
  readonly jobId:   string;
  readonly file:    string;
  readonly problem: UnreadableFileProblem;
}

function openIncidentsOf(board: Board, jobId: string): readonly Readonly<Incident>[] {
  return board.incidents().filter((incident) => incident.kind === UNREADABLE_FILE_INCIDENT_KIND && incident.jobId === jobId);
}

/**
 * Opens the incident unless one stands open for the job and the file, the job has left the board, or a ticket of the job stays parked on such
 * an incident, so a job a park left behind does not open it again; answers what it logged.
 */
function openOnce(board: Board, unreadable: UnreadableJobFile, at: string): readonly LogRecord[] {
  const job = board.jobById(unreadable.jobId);
  if (job === undefined) return [];
  const parkedHold = `${PARKED_HOLD_PREFIX}${UNREADABLE_FILE_INCIDENT_KIND}`;
  if (job.ticketIds.some((ticketId) => board.ticketByReference(ticketId)?.frontmatter.hold === parkedHold)) return [];
  if (openIncidentsOf(board, job.id).some((incident) => incident.facts['file'] === unreadable.file)) return [];
  return board.openIncident({
    kind:        UNREADABLE_FILE_INCIDENT_KIND,
    ticketIds:   job.ticketIds,
    jobId:       job.id,
    facts:       { file: unreadable.file, ...StoredFileProblemFactsUtil.factsOf(unreadable.problem) },
    defaultMove: 'ticket-park',
  }, at).logged;
}

/** True while the job waits on a move for one of its unreadable files: a pass does not take the job's next step on what it could not read. */
function standsOpenFor(board: Board, jobId: string): boolean {
  return openIncidentsOf(board, jobId).length > 0;
}

/**
 * For a session job neither move heals: unless it is already stopping or ended, opens the incident for the record and moves a running
 * job to `stopping`, so its input closes and it ends.
 */
function openAndRetire(board: Board, unreadable: UnreadableJobFile, at: string): void {
  const job = board.jobById(unreadable.jobId);
  if (job === undefined || job.state === 'stopping') return;
  openOnce(board, unreadable, at);
  if (job.state === 'running') board.moveJob(job.id, 'stopping', at);
}

export const UnreadableJobFileIncident = Object.freeze({ openOnce, openAndRetire, standsOpenFor });
