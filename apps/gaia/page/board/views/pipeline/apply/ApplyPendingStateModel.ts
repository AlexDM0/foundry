/**
 * The model of a pending Apply, pure: what the commit of `CONSTITUTION.md` waits on, worded from the facts' `applyState`. While it
 * commits, the work or the ticket whose landing holds main; when held or refused, the stored reason as a sentence with the files that
 * block main, what User can do next, and whether the dialog offers the exact text to commit by hand. The resume summary shows the same
 * state on one line. Over entities the commit holds each drafted constitution, so the pending state counts them and words the reasons for
 * the constitutions rather than for `CONSTITUTION.md`.
 */
import { PAGE_CONTRACT_VERSIONS }       from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }    from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardApplyStateDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardApplyRequestReason } from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                from '../../../../shared/utils/CountTextUtil.ts';

export interface ApplyPendingView {
  readonly state:                  BoardApplyStateDocument['state'];
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

const INTERRUPTED_NEXT_STEP = 'Resume all interrupted work to commit again. Cancel apply to change the draft.';

const UNSIGNED_NEXT_STEP = `Commit this text as ${CONSTITUTION_FILE_NAME} on main by hand, signed, then press Apply again.`;

const ENTITIES_UNSIGNED_NEXT_STEP = 'Commit the drafted constitutions on main by hand, signed, then press Apply again.';

const REFUSED_NEXT_STEP = 'Press Apply to try again, or cancel apply to change the draft.';

/**
 * How many drafted constitutions of entities the commit holds; null on a forge without entities, whose commit holds `CONSTITUTION.md`
 * alone.
 */
export type EntityConstitutionCount = number | null;

function filesTextOf(blockingFiles: readonly string[], entityConstitutionCount: EntityConstitutionCount): string {
  if (blockingFiles.length > 0) return blockingFiles.join(', ');
  return entityConstitutionCount === null ? CONSTITUTION_FILE_NAME : 'the constitution files';
}

/** Over entities, the reasons that name the constitution file name the constitutions instead; null for every other reason. */
function entitiesReasonSentenceOf(reason: BoardApplyRequestReason | null): string | null {
  switch (reason) {
    case 'git-failed':
      return 'Git failed to commit or land the constitutions.';
    case 'constitution-commit-unexpected-paths':
      return 'The commit changed more than the constitutions, so it did not land.';
    case 'constitution-moved':
      return 'A constitution changed on main since the Apply read it.';
    default:
      return null;
  }
}

/** The stored reason as a sentence, with the files that block main where the reason has them. */
function reasonSentenceOf(reason: BoardApplyRequestReason | null, blockingFiles: readonly string[], entityConstitutionCount: EntityConstitutionCount = null): string {
  const entitiesSentence = entityConstitutionCount === null ? null : entitiesReasonSentenceOf(reason);
  if (entitiesSentence !== null) return entitiesSentence;
  switch (reason) {
    case 'interrupted':
      return 'The commit was cut short when the machine or Hephaestus went down, so it waits for a resume.';
    case 'dirty-checkout':
      return `Main has uncommitted changes to ${filesTextOf(blockingFiles, entityConstitutionCount)}.`;
    case 'not-on-target-branch':
      return 'The main checkout is not on the main branch.';
    case 'target-file-held':
      return `A file of the main checkout is held: ${filesTextOf(blockingFiles, entityConstitutionCount)}.`;
    case 'git-failed':
      return 'Git failed to commit or land the constitution.';
    case 'constitution-commit-unsigned':
      return 'Git could not sign the commit, and nothing commits unsigned.';
    case 'constitution-commit-unexpected-paths':
      return `The commit changed more than ${CONSTITUTION_FILE_NAME}, so it did not land.`;
    case 'constitution-moved':
      return `${CONSTITUTION_FILE_NAME} changed on main since the draft started from it.`;
    case 'pipeline-moved':
      return 'The stored pipeline changed by hand while the commit waited, so the commit did not land.';
    case 'entity-named-by-tickets':
      return 'A ticket took an entity that the draft removes while the commit waited, so the commit did not land.';
    case 'entities-while-tickets-in-flight':
      return 'A ticket started while the commit waited, and the pipeline cannot turn into entities under it, so the commit did not land.';
    case null:
      return 'No reason was recorded.';
  }
}

/** "Committing CONSTITUTION.md to main", or "Waiting for the merge train: 14 is landing" while a ticket's landing holds main. */
function committingTextOf(applyState: BoardApplyStateDocument, entityConstitutionCount: EntityConstitutionCount = null): string {
  if (applyState.ticketIdHoldingMain !== null) return `Waiting for the merge train: ${applyState.ticketIdHoldingMain} is landing`;
  if (entityConstitutionCount === null) return COMMITTING_TEXT;
  if (entityConstitutionCount === 0) return 'Committing the constitutions to main';
  return `Committing ${CountTextUtil.countedPhrase(entityConstitutionCount, 'constitution', 'constitutions')} to main in one commit`;
}

function pendingViewOf(applyState: BoardApplyStateDocument, entityConstitutionCount: EntityConstitutionCount = null): ApplyPendingView {
  const { state } = applyState;
  if (state === 'committing') {
    return {
      state, text: committingTextOf(applyState, entityConstitutionCount), nextStep: null, offersConstitutionText: false, offersApplyAgain: false,
    };
  }
  const text = reasonSentenceOf(applyState.reason, applyState.blockingFiles, entityConstitutionCount);
  if (state === 'held') {
    const nextStep = applyState.reason === 'interrupted' ? INTERRUPTED_NEXT_STEP : HELD_NEXT_STEP;
    return {
      state, text, nextStep, offersConstitutionText: false, offersApplyAgain: false,
    };
  }
  const unsigned = applyState.reason === 'constitution-commit-unsigned';
  if (unsigned && entityConstitutionCount !== null) {
    return {
      state, text, nextStep: ENTITIES_UNSIGNED_NEXT_STEP, offersConstitutionText: false, offersApplyAgain: true,
    };
  }
  return {
    state, text, nextStep: unsigned ? UNSIGNED_NEXT_STEP : REFUSED_NEXT_STEP, offersConstitutionText: unsigned, offersApplyAgain: true,
  };
}

/** The one line the resume summary gives the Apply step: the work under way, or "Held." or "Refused." with the reason. */
function summaryTextOf(applyState: BoardApplyStateDocument): string {
  if (applyState.state === 'committing') return committingTextOf(applyState);
  const reason = reasonSentenceOf(applyState.reason, applyState.blockingFiles);
  return `${applyState.state === 'held' ? 'Held' : 'Refused'}. ${reason}`;
}

function cancelCommandOf(setupId: string): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-apply-cancel', setupId };
}

export const ApplyPendingStateModel = Object.freeze({
  pendingViewOf,
  summaryTextOf,
  cancelCommandOf,
});
