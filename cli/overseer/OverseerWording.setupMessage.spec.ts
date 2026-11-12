/**
 * The message a User setup move sends the pipeline agent. What matters: every kind is worded, an answer carries the letters or the free
 * text as given, and an edit names the fields and the revision, so the agent knows what to read again before its next proposal. A Continue
 * carries the next step's block, since the session works on in the same conversation, unless that block is the one it already works
 * under; a resume names how far main moved, in the singular for one commit, and the paths that changed. A check's request names the gates
 * it runs, and its end gives the agent each gate's verdict, its runs and the end of its output, or why the check could not run.
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

test('a check\'s request names the gates the Overseer runs', () => {
  expect(OverseerWording.setupMessageWordingOf({
    kind: 'check-requested', setupId: 'S1', draftRevision: 3, gateNames: ['tests', 'lint']
  })).toBe('User asked for a check of draft revision 3. The Overseer runs these gates two times in a fresh worktree of main: tests, lint. '
    + 'You get the result in a later message. Do not run a gate or a script yourself.');
});

test('a checked result gives each gate\'s verdict, its runs and the end of its output, with every hole filled', () => {
  const wording = OverseerWording.setupMessageWordingOf({
    kind:    'check-ended',
    setupId: 'S1',
    check:   {
      draftRevision: 3,
      gateNames:     ['tests', 'lint'],
      state:         'checked',
      result:        {
        snapshotCommit: 'c'.repeat(40),
        prepare:        { failedSteps: [null, null], output: '' },
        gates:          [
          {
            name: 'tests', outcomes: ['failed', 'passed'], durationsMilliseconds: [1200, 900], verdict: 'disagreeing', output: '1 test failed\n'
          },
          {
            name: 'lint', outcomes: ['passed', 'passed'], durationsMilliseconds: [300, 310], verdict: 'green', output: ''
          },
        ],
      },
      reason: null,
    },
  });

  expect(wording).toContain('draft revision\n3 changes or adds');
  expect(wording).toContain(`at commit ${'c'.repeat(40)}`);
  expect(wording).toContain('Prepare steps: run 1 passed, run 2 passed.');
  expect(wording).toContain('- `tests`: disagreeing. Runs: failed, passed. The end of the output:\n\n```\n1 test failed\n```');
  expect(wording).toContain('- `lint`: green. Runs: passed, passed.\n');
  expect(wording).toContain('pipeline propose');
  expect(wording).not.toContain('{{');
});

test('a check that could not run says why', () => {
  expect(OverseerWording.setupMessageWordingOf({
    kind:    'check-ended',
    setupId: 'S1',
    check:   {
      draftRevision: 3, gateNames: ['tests'], state: 'cannot-run', result: null, reason: 'example sandbox tool missing'
    },
  })).toBe('User\'s check of draft revision 3 could not run: example sandbox tool missing. Tell User. Do not run a gate or a script yourself.');
});
