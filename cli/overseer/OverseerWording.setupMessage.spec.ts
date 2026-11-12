/**
 * The message a User setup move sends the pipeline agent. What matters: every kind is worded, an answer carries the letters or the free
 * text as given, and an edit names the fields and the revision, so the agent knows what to read again before its next proposal.
 */
import { expect, test } from 'bun:test';

import type { SetupMessage } from '../../src/shared/@types/ControlContext.ts';
import { OverseerWording }   from './OverseerWording.ts';

test.each<[SetupMessage, string]>([
  [{
    kind: 'question-answered', setupId: 'S1', questionId: 'Q3', reply: { letters: ['a', 'c'] }
  }, 'User answered Q3: a, c.'],
  [{
    kind: 'question-answered', setupId: 'S1', questionId: 'Q4', reply: { text: 'Only on the main line.' }
  }, 'User answered Q4: Only on the main line.'],
  [{
    kind: 'step-continued', setupId: 'S1', step: 'research', currentStep: 'constitution'
  }, 'User completed the research step. The current step is constitution.'],
  [
    {
      kind: 'constitution-edited', setupId: 'S1', revision: 4, markdownChanged: true, sourcesChanged: true
    },
    'User changed the text and the SOURCES ticks of the constitution (revision 4). Read the constitution again before you change it.',
  ],
  [
    {
      kind: 'draft-edited', setupId: 'S1', draftRevision: 5, editIds: ['E6', 'E7'], fields: ['gate:lint', 'phase-order:build']
    },
    'User changed the draft pipeline (revision 5): gate:lint, phase-order:build. Read the draft again before you propose a change.',
  ],
  [
    {
      kind: 'draft-edit-undone', setupId: 'S1', draftRevision: 6, editId: 'E6', field: 'gate:lint'
    },
    'User undid edit E6 (gate:lint) of the draft pipeline (revision 6).',
  ],
  [{ kind: 'draft-discarded', setupId: 'S1', draftRevision: 7 }, 'User discarded all proposed changes to the draft pipeline (revision 7).'],
])('%o is worded for the agent', (message, wording) => {
  expect(OverseerWording.setupMessageWordingOf(message)).toBe(wording);
});
