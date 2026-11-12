/**
 * The message a User setup move sends the pipeline agent. What matters: every kind is worded, an answer carries the letters or the free
 * text as given, and an edit names the fields and the revision, so the agent knows what to read again before its next proposal. A Continue
 * carries the next step's block, since the session works on in the same conversation, unless that block is the one it already works
 * under; a resume names how far main moved, in the singular for one commit, and the paths that changed.
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
    kind: 'step-continued', setupId: 'S1', mode: 'setup', step: 'billing', currentStep: 'research'
  }, 'User completed the billing step. The current step is research.'],
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

test.each([
  ['research', 'constitution', '### Constitution'],
  ['constitution', 'design', '### Pipeline design'],
] as const)('a Continue from %s carries the block of the %s step', (step, currentStep, heading) => {
  const wording = OverseerWording.setupMessageWordingOf({
    kind: 'step-continued', setupId: 'S1', mode: 'setup', step, currentStep
  });

  expect(wording.startsWith(`User completed the ${step} step. The current step is ${currentStep}.\n\n${heading}\n`)).toBe(true);
  expect(wording).not.toContain('{{');
});

test.each<[SetupMessage, string]>([
  [{
    kind: 'setup-resumed', setupId: 'S1', mainMovedByCommits: 0, changedPaths: []
  }, 'User resumed the setup. Main did not move.'],
  [
    {
      kind: 'setup-resumed', setupId: 'S1', mainMovedByCommits: 1, changedPaths: ['package.json']
    },
    'User resumed the setup. Main moved 1 commit. These paths changed: package.json. Check the findings that name them.',
  ],
  [
    {
      kind: 'setup-resumed', setupId: 'S1', mainMovedByCommits: 3, changedPaths: ['package.json', 'Makefile']
    },
    'User resumed the setup. Main moved 3 commits. These paths changed: package.json, Makefile. Check the findings that name them.',
  ],
])('a resume is worded as %o', (message, wording) => {
  expect(OverseerWording.setupMessageWordingOf(message)).toBe(wording);
});
