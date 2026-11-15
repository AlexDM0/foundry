/**
 * The questions the Overseer itself opens, as User reads them in the question panel. What matters: `checks-not-set` says in its own words
 * that no pipeline is set and how one gets set, never the generic sentence that names only its kind; a kind with no wording of its own
 * still gets that generic sentence.
 */
import { expect, test } from 'bun:test';

import { PRODUCT_NAMES }   from '../../src/shared/constants/ProductNames.ts';
import { OverseerWording } from './OverseerWording.ts';

test('checks-not-set says that no pipeline is set and that the setup\'s Apply sets one and withdraws the question', () => {
  const wording = OverseerWording.decisionWordingOf({ kind: 'checks-not-set', ticketIds: [], jobId: null });

  expect(wording.questions).toEqual([{
    question:    'No pipeline is set, so no ticket builds. Set up the pipeline on the Pipeline page, then press Apply.',
    header:      'checks-not-set',
    multiSelect: false,
    options:     [],
  }]);
  expect(wording.context).toContain('Apply withdraws this question.');
  expect(wording.context).toContain(`\`${PRODUCT_NAMES.PROGRAM} gate none\``);
  expect(JSON.stringify(wording)).not.toContain('needs a decision');
});

test('a kind with no wording of its own is named in the generic sentence', () => {
  const wording = OverseerWording.decisionWordingOf({ kind: 'target-moved', ticketIds: ['004'], jobId: null });

  expect(wording.questions[0]?.question).toBe('The Overseer needs a decision (target-moved) about #004.');
});
