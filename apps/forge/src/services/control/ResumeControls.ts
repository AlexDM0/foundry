/**
 * User's resume of interrupted work, recorded in the hold with the forge up or down: an instruction the Playbook carries out at its next pass, and an
 * `interrupted:` hold lifted with no fresh attempt. `all` and `network-outage` with nothing waiting change nothing, so a monitor's one control may
 * send them to every forge.
 */
import type { Logged }             from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { Job }                from '../../lib/tracker-model/@types/Job.ts';
import type { Board }              from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }            from '../../lib/tracker-model/BoardRefusal.ts';
import { INTERRUPTED_HOLD_PREFIX } from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import type { ControlCommandOf }   from '../../shared/@types/ControlCommand.ts';
import { LIFECYCLE_LIMITS }        from '../../shared/constants/LifecycleLimits.ts';
import type { BoardTransaction }   from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }     from './ControlTicketLookup.ts';

interface ResumeRecorded extends Logged {
  changed: boolean;
}

function recordedFrom(logged: Logged['logged']): ResumeRecorded {
  return { logged, changed: logged.length > 0 };
}

function holdIsInterrupted(hold: string | undefined): boolean {
  return hold?.startsWith(INTERRUPTED_HOLD_PREFIX) === true;
}

function waitingJobIdsOfTicket(board: Board, ticketId: string): string[] {
  const waits = (job: Readonly<Job>): boolean => job.state === 'interrupted' || board.lostLineAwaitsResume(job);
  return board.jobs().filter((job) => waits(job) && job.ticketIds.includes(ticketId)).map((job) => job.id);
}

function liftEveryInterruptedHold(board: Board, at: string): Logged['logged'] {
  const heldTicketIds = board.tickets().filter((ticket) => holdIsInterrupted(ticket.frontmatter.hold)).map((ticket) => ticket.frontmatter.id);
  return heldTicketIds.flatMap((ticketId) => board.liftInterruptedHold(ticketId, at).logged);
}

/** Refused `ticket-not-interrupted` when the ticket has neither a job that waits for a resume nor an `interrupted:` hold. */
function resumeTicket(ticketReference: string, change: BoardTransaction): ResumeRecorded {
  const { board, at } = change;
  const ticketId      = ticketIdOfReference(change, ticketReference);
  const jobIds        = waitingJobIdsOfTicket(board, ticketId);
  const holdLifts     = holdIsInterrupted(board.ticketByReference(ticketId)?.frontmatter.hold);
  if (jobIds.length === 0 && !holdLifts) throw new BoardRefusal({ reason: 'ticket-not-interrupted', ticketId });
  const instructed = jobIds.flatMap((jobId) => board.instructResume(jobId, at).logged);
  const lifted     = holdLifts ? board.liftInterruptedHold(ticketId, at).logged : [];
  return recordedFrom([...instructed, ...lifted]);
}

function resumeInterruptedWork(command: ControlCommandOf<'interrupted-work-resume'>, change: BoardTransaction): ResumeRecorded {
  const { board, at } = change;
  const { target }    = command;
  if (target === 'all') {
    const instructed = board.instructResumeOfEveryWaitingJob(LIFECYCLE_LIMITS, at).logged;
    return recordedFrom([...instructed, ...liftEveryInterruptedHold(board, at), ...board.liftInterruptedApply(at).logged]);
  }
  if (target === 'network-outage') return recordedFrom(board.instructResumeOfEveryNetworkOutageJob(at).logged);
  if ('jobId' in target) return recordedFrom(board.instructResume(target.jobId, at).logged);
  return resumeTicket(target.ticketReference, change);
}

export const RESUME_CONTROLS = { 'interrupted-work-resume': resumeInterruptedWork, };
