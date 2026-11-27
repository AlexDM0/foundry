/**
 * `worktree repair` and `gate retry` (design section 8.3). A repair runs its git step in the hold, so no launch races it; a retry only
 * settles the incident, after which the Airlock gates the merged tree again or the policy launches the ticket's next attempt.
 */
import { join }                          from 'node:path';
import type { Logged }                   from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { Incident }                 from '../../domain/tracker-model/@types/Incident.ts';
import { BoardRefusal }                  from '../../domain/tracker-model/BoardRefusal.ts';
import type { ControlCommandOf }         from '../../shared/@types/ControlCommand.ts';
import { WorktreesFolder }               from '../../shared/WorktreesFolder.ts';
import type { BoardTransaction }         from '../tracker/BoardTransaction.ts';
import { projectLocationOf }             from '../tracker/ProjectLocation.ts';
import { ticketIdOfReference }           from './ControlTicketLookup.ts';
import { handledUnder, incidentForMove } from './IncidentControls.ts';
import { WorktreeRepair }                from './WorktreeRepair.ts';

const STEPS_NEEDING_AN_IDLE_WORKTREE = ['recreate', 'unlock'] as const;

/** The incident's job, else the newest job launched on the ticket: whose folder keeps a `recreate` patch. */
function jobIdForPatchOf(change: BoardTransaction, ticketId: string, incident: Readonly<Incident> | null): string | null {
  if (incident?.jobId !== null && incident?.jobId !== undefined) return incident.jobId;
  const launched = change.board.logRecordsSoFar().filter((record) => record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId));
  const newest = launched.at(-1);
  return newest?.kind === 'job-launched' ? newest.jobId : null;
}

function repairWorktree(command: ControlCommandOf<'worktree-repair'>, change: BoardTransaction): Logged {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  const incident = incidentForMove(change, command, { name: `#${ticketId}`, concerns: (open) => open.ticketIds.includes(ticketId) }, false);
  if (STEPS_NEEDING_AN_IDLE_WORKTREE.some((step) => step === command.step)) {
    // Any job still on the board for the ticket may hold its agent group or a line child in the worktree.
    const jobIds = change.board.jobs().filter((job) => job.ticketIds.includes(ticketId)).map((job) => job.id);
    if (jobIds.length > 0) throw new BoardRefusal({ reason: 'worktree-in-use', ticketId, jobIds });
  }
  const { rootDirectory, trackerDirectory } = change.workspace;
  const worktreePath = WorktreesFolder.ticketWorktreeOf(rootDirectory, ticketId);
  const jobId = jobIdForPatchOf(change, ticketId, incident);
  const repaired = WorktreeRepair.repair({
    repositoryRoot: projectLocationOf(rootDirectory).repositoryRoot, worktreePath, step: command.step, jobFolder: jobId === null ? null : join(trackerDirectory, 'jobs', jobId),
  });
  if (repaired.verdict === 'uncommitted-work-not-saved') throw new BoardRefusal({ reason: 'worktree-has-uncommitted-work', ticketId, worktreePath });
  if (repaired.verdict === 'git-failed') throw new BoardRefusal({
    reason: 'worktree-repair-failed', ticketId, step: command.step, gitReason: repaired.reason
  });
  const recorded = change.board.recordWorktreeRepaired(ticketId, { step: command.step, patchPath: repaired.patchPath }, change.at);
  return handledUnder(change, incident?.id, 'worktree-repair', recorded);
}

/** With no incident to settle there is nothing to retry: a merge job's slot gates on its own, and an ended build gated already. */
function retryGate(command: ControlCommandOf<'gate-retry'>, change: BoardTransaction): Logged & { changed?: false } {
  const incident = incidentForMove(change, command, { name: command.jobId, concerns: (open) => open.jobId === command.jobId }, false);
  if (incident === null) return { logged: [], changed: false };
  return handledUnder(change, incident.id, 'gate-retry', { logged: [] });
}

export const REPAIR_CONTROLS = {
  'worktree-repair': repairWorktree,
  'gate-retry':      retryGate,
} as const;
