/**
 * The pending Apply's model against hand-made `applyState` facts. What matters: while committing, the line names the commit, or the
 * ticket whose landing holds main; every stored hold and refusal reason is worded as a sentence, with the blocking files where the reason
 * has them; only a refused request offers Apply again, and only a signing failure offers the text of CONSTITUTION.md; the resume
 * summary's one line says the same; Cancel apply names the record.
 */
import { describe, expect, test } from 'bun:test';

import type { ApplyStateFacts }    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ApplyRequestReason } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ApplyPendingStateModel }  from './ApplyPendingStateModel.ts';

const EVERY_REASON: readonly ApplyRequestReason[] = [
  'not-on-target-branch',
  'dirty-checkout',
  'target-file-held',
  'git-failed',
  'constitution-commit-unsigned',
  'constitution-commit-unexpected-paths',
  'constitution-moved',
  'pipeline-moved',
  'entity-named-by-tickets',
  'entities-while-tickets-in-flight',
];

function applyState(changes: Partial<ApplyStateFacts> & Pick<ApplyStateFacts, 'state'>): ApplyStateFacts {
  return {
    draftRevision: 7, resumesBoard: true, commitJobId: 'J9', reason: null, blockingFiles: [], ticketIdHoldingMain: null, ...changes,
  };
}

describe('committing', () => {
  test('names the commit, or the ticket whose landing holds main, and offers no Apply', () => {
    expect(ApplyPendingStateModel.pendingViewOf(applyState({ state: 'committing' }))).toEqual({
      state: 'committing', text: 'Committing CONSTITUTION.md to main', nextStep: null, offersConstitutionText: false, offersApplyAgain: false,
    });
    expect(ApplyPendingStateModel.pendingViewOf(applyState({ state: 'committing', ticketIdHoldingMain: '14' })).text)
      .toBe('Waiting for the merge train: 14 is landing');
  });
});

describe('held and refused', () => {
  test('a hold names the blocking files and waits for main to be clean', () => {
    const view = ApplyPendingStateModel.pendingViewOf(applyState({ state: 'held', reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }));
    expect(view).toEqual({
      state:                  'held',
      text:                   'Main has uncommitted changes to CONSTITUTION.md.',
      nextStep:               'The commit runs on its own once main is clean. Cancel apply to change the draft.',
      offersConstitutionText: false,
      offersApplyAgain:       false,
    });
  });

  test('every stored reason is worded as its own sentence', () => {
    const sentences = EVERY_REASON.map((reason) => ApplyPendingStateModel.pendingViewOf(applyState({ state: 'refused', reason })).text);
    expect(new Set(sentences).size).toBe(EVERY_REASON.length);
    expect(sentences.every((sentence) => sentence.endsWith('.'))).toBe(true);
  });

  test('only a signing failure offers the text of CONSTITUTION.md; every refusal offers Apply again', () => {
    const unsigned = ApplyPendingStateModel.pendingViewOf(applyState({ state: 'refused', reason: 'constitution-commit-unsigned' }));
    expect(unsigned).toMatchObject({ offersConstitutionText: true, offersApplyAgain: true });
    expect(unsigned.nextStep).toBe('Commit this text as CONSTITUTION.md on main by hand, signed, then press Apply again.');
    const moved = ApplyPendingStateModel.pendingViewOf(applyState({ state: 'refused', reason: 'constitution-moved' }));
    expect(moved).toMatchObject({ offersConstitutionText: false, offersApplyAgain: true });
  });
});

describe('the resume summary line and Cancel apply', () => {
  test('the summary line says the state and the reason', () => {
    expect(ApplyPendingStateModel.summaryTextOf(applyState({ state: 'committing' }))).toBe('Committing CONSTITUTION.md to main');
    expect(ApplyPendingStateModel.summaryTextOf(applyState({ state: 'held', reason: 'not-on-target-branch' })))
      .toBe('Held. The main checkout is not on the main branch.');
  });

  test('Cancel apply names the record', () => {
    expect(ApplyPendingStateModel.cancelCommandOf('S1')).toEqual({ kind: 'pipeline-apply-cancel', setupId: 'S1' });
  });
});
