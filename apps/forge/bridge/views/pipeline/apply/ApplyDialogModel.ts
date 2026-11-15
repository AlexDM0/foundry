/**
 * The first Apply's model (A4), pure: the "Resume the board" line from the pending tickets and the concurrency limit, the note that
 * Apply commits the constitution first, and the `pipeline-apply` command, which carries the checkbox's value as it shows.
 */
import type { PipelineSetup }      from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody } from '../../../api/CommandClient.ts';

const CONSTITUTION_NOTE = 'Apply commits CONSTITUTION.md to main, then stores the pipeline.';

/** "The 3 pending tickets start building, 2 at a time." */
function resumeTextOf(pendingTicketCount: number, concurrencyLimit: number | null): string {
  const pace = concurrencyLimit === null ? '' : `, ${concurrencyLimit} at a time`;
  if (pendingTicketCount === 0) return `No ticket is pending yet. New tickets start building${pace}.`;
  if (pendingTicketCount === 1) return `The pending ticket starts building${pace}.`;
  return `The ${pendingTicketCount} pending tickets start building${pace}.`;
}

/** Shown while the draft holds a constitution, which Apply commits to main before it stores the pipeline. */
function constitutionNoteOf(record: PipelineSetup): string | null {
  return record.constitution === null ? null : CONSTITUTION_NOTE;
}

function applyCommandOf(record: PipelineSetup, resumesBoard: boolean): ControlCommandBody {
  return {
    kind: 'pipeline-apply', setupId: record.setupId, draftRevision: record.draftRevision, resumesBoard,
  };
}

export const ApplyDialogModel = Object.freeze({
  resumeTextOf,
  constitutionNoteOf,
  applyCommandOf,
});
