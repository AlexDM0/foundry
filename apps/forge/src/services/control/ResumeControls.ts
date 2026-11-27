/**
 * User's resume of interrupted work (decision 41), recorded in the hold with the forge up or down: an instruction the Playbook carries out
 * at its next pass under every hold a resume obeys, and an `interrupted:` hold lifted with no fresh attempt; `all` also lets an Apply a
 * start held `interrupted` commit again. `all` and `network-outage` with nothing waiting change nothing, so a monitor's one control may
 * send them to every forge.
 */
import type { Logged }             from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { Board }              from '../../lib/tracker-model/Board.ts';
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

function liftEveryInterruptedHold(board: Board, at: string): Logged['logged'] {
  const heldTicketIds = board.tickets().filter((ticket) => holdIsInterrupted(ticket.frontmatter.hold)).map((ticket) => ticket.frontmatter.id);
  return heldTicketIds.flatMap((ticketId) => board.liftInterruptedHold(ticketId, at).logged);
}

function resumeTicket(ticketReference: string, change: BoardTransaction): ResumeRecorded {
  return recordedFrom(change.board.resumeInterruptedTicket(ticketIdOfReference(change, ticketReference), change.at).logged);
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
