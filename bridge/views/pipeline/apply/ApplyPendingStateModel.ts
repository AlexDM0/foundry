/**
 * The model of a pending Apply, pure: what the commit of `CONSTITUTION.md` waits on, worded from the facts' `applyState`. While it
 * commits, the work or the ticket whose landing holds main; when held or refused, the stored reason as a sentence with the files that
 * block main, what User can do next, and whether the dialog offers the exact text to commit by hand. The resume summary shows the same
 * state on one line.
 */
import type { ApplyStateFacts }    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ApplyRequestReason } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody } from '../../../api/CommandClient.ts';

export interface ApplyPendingView {
  readonly state:                  ApplyStateFacts['state'];
  /** The state's own line: the work under way, or the reason the commit holds or was refused. */
  readonly text:                   string;
  /** What User can do next; null while the commit is under way. */
  readonly nextStep:               string | null;
  /** A signing failure: the dialog offers the exact text of `CONSTITUTION.md`, which User may commit by hand. */
  readonly offersConstitutionText: boolean;
  /** Only a refused request can be applied again; a committing or held one waits. */
  readonly offersApplyAgain:       boolean;
}

const CONSTITUTION_FILE_NAME = 'CONSTITUTION.md';

const COMMITTING_TEXT = `Committing ${CONSTITUTION_FILE_NAME} to main`;

const HELD_NEXT_STEP = 'The commit runs on its own once main is clean. Cancel apply to change the draft.';

const UNSIGNED_NEXT_STEP = `Commit this text as ${CONSTITUTION_FILE_NAME} on main by hand, signed, then press Apply again.`;

const REFUSED_NEXT_STEP = 'Press Apply to try again, or cancel apply to change the draft.';

function filesTextOf(blockingFiles: readonly string[]): string {
  return blockingFiles.length === 0 ? CONSTITUTION_FILE_NAME : blockingFiles.join(', ');
}

/** The stored reason as a sentence, with the files that block main where the reason has them. */
function reasonSentenceOf(reason: ApplyRequestReason | null, blockingFiles: readonly string[]): string {
  switch (reason) {
    case 'dirty-checkout':
      return `Main has uncommitted changes to ${filesTextOf(blockingFiles)}.`;
    case 'not-on-target-branch':
      return 'The main checkout is not on the main branch.';
    case 'target-file-held':
      return `A file of the main checkout is held: ${filesTextOf(blockingFiles)}.`;
    case 'git-failed':
      return 'Git failed to commit or land the constitution.';
    case 'constitution-commit-unsigned':
      return 'Git could not sign the commit, and nothing commits unsigned.';
    case 'constitution-commit-unexpected-paths':
      return `The commit changed more than ${CONSTITUTION_FILE_NAME}, so it did not land.`;
    case 'constitution-moved':
      return `${CONSTITUTION_FILE_NAME} changed on main since the draft started from it.`;
    case null:
      return 'No reason was recorded.';
  }
}

/** "Committing CONSTITUTION.md to main", or "Waiting for the merge train: 14 is landing" while a ticket's landing holds main. */
function committingTextOf(applyState: ApplyStateFacts): string {
  return applyState.ticketIdHoldingMain === null ? COMMITTING_TEXT : `Waiting for the merge train: ${applyState.ticketIdHoldingMain} is landing`;
}

function pendingViewOf(applyState: ApplyStateFacts): ApplyPendingView {
  const { state } = applyState;
  if (state === 'committing') {
    return {
      state, text: committingTextOf(applyState), nextStep: null, offersConstitutionText: false, offersApplyAgain: false,
    };
  }
  const text = reasonSentenceOf(applyState.reason, applyState.blockingFiles);
  if (state === 'held') {
    return {
      state, text, nextStep: HELD_NEXT_STEP, offersConstitutionText: false, offersApplyAgain: false,
    };
  }
  const unsigned = applyState.reason === 'constitution-commit-unsigned';
  return {
    state, text, nextStep: unsigned ? UNSIGNED_NEXT_STEP : REFUSED_NEXT_STEP, offersConstitutionText: unsigned, offersApplyAgain: true,
  };
}

/** The one line the resume summary gives the Apply step: the work under way, or "Held." or "Refused." with the reason. */
function summaryTextOf(applyState: ApplyStateFacts): string {
  if (applyState.state === 'committing') return committingTextOf(applyState);
  const reason = reasonSentenceOf(applyState.reason, applyState.blockingFiles);
  return `${applyState.state === 'held' ? 'Held' : 'Refused'}. ${reason}`;
}

function cancelCommandOf(setupId: string): ControlCommandBody {
  return { kind: 'pipeline-apply-cancel', setupId };
}

export const ApplyPendingStateModel = Object.freeze({
  pendingViewOf,
  summaryTextOf,
  cancelCommandOf,
});
