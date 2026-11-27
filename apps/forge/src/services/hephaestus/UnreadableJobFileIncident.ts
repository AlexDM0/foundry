/**
 * A file Hephaestus stored for one job that its ingestion finds unreadable is a bug, so the job does not go on as if the file said nothing.
 * The `system-file-unreadable` incident goes to the Assistant, whose moves are a fresh agent or a park; its default parks the ticket, which
 * puts the decision in front of User. A job holds one such incident per file while it stands open. A session job neither move can heal, the
 * Assistant or a document or pipeline agent, is retired instead, so a fresh one boots or launches by the board's own rules.
 */
import type { Incident }  from '../../lib/tracker-model/@types/Incident.ts';
import type { LogRecord } from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }     from '../../lib/tracker-model/Board.ts';

const UNREADABLE_FILE_INCIDENT_KIND = 'system-file-unreadable';

/** The job the file belongs to, the file's path inside the board's data folder, and why its ingestion could not read it. */
export interface UnreadableJobFile {
  readonly jobId:  string;
  readonly file:   string;
  readonly reason: string;
}

function openIncidentsOf(board: Board, jobId: string): readonly Readonly<Incident>[] {
  return board.incidents().filter((incident) => incident.kind === UNREADABLE_FILE_INCIDENT_KIND && incident.jobId === jobId);
}

/** Opens the incident unless one stands open for the job and the file, or the job has left the board; answers what it logged. */
function openOnce(board: Board, unreadable: UnreadableJobFile, at: string): readonly LogRecord[] {
  const job = board.jobById(unreadable.jobId);
  if (job === undefined) return [];
  if (openIncidentsOf(board, job.id).some((incident) => incident.facts['file'] === unreadable.file)) return [];
  return board.openIncident({
    kind:        UNREADABLE_FILE_INCIDENT_KIND,
    ticketIds:   job.ticketIds,
    jobId:       job.id,
    facts:       { file: unreadable.file, reason: unreadable.reason },
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
