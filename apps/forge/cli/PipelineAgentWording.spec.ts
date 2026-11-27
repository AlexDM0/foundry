/**
 * The message a User setup move sends the pipeline agent. What matters: every kind is worded, an answer carries the letters or the free
 * text as given, and an edit names the fields and the revision and carries what changed: the constitution's whole new text and ticks, each
 * draft field with its value now, since the agent has no read of the record and would otherwise lose User's change. A Continue
 * carries the next step's block, since the session works on in the same conversation, unless that block is the one it already works
 * under; a resume names how far main moved, in the singular for one commit, and the paths that changed. A check's request names the gates
 * it runs, and its end gives the agent each gate's verdict, its runs and the end of its output, or why the check could not run.
 */
import { expect, test } from 'bun:test';

import type { SetupMessage }    from '../src/shared/@types/ControlContext.ts';
import { fakeAgentAdapter }     from '../src/testing/FakeAgentAdapter.ts';
import { PipelineAgentWording } from './PipelineAgentWording.ts';

const PROMPT_FILLS = fakeAgentAdapter().promptFills;

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
      kind: 'draft-edit-undone', setupId: 'S1', draftRevision: 6, editId: 'E6', field: 'gate:lint', changes: [{ field: 'gate:lint', value: null }]
    },
    'User undid edit E6 (gate:lint) of the draft pipeline (revision 6).\n\n'
      + 'The draft now holds these values:\n- `gate:lint`: null (the draft holds no value here)',
  ],
  [
    {
      kind: 'draft-batch-undone', setupId: 'S1', draftRevision: 8, editIds: ['E2', 'E3'], fields: ['gate:lint', 'gate:test'], changes: []
    },
    'User undid the edits E2, E3 (gate:lint, gate:test) of the draft pipeline together (revision 8).\n\nNo value of the draft changed.',
  ],
  [
    {
      kind: 'draft-discarded', setupId: 'S1', draftRevision: 7, changes: []
    },
    'User discarded all proposed changes to the draft pipeline (revision 7).\n\nNo value of the draft changed.',
  ],
])('%o is worded for the agent', (message, wording) => {
  expect(PipelineAgentWording.setupMessageWordingOf(message, PROMPT_FILLS)).toBe(wording);
});

test('a constitution edit carries the whole new text and the new SOURCES ticks, so the agent keeps User\'s change without a read', () => {
  const wording = PipelineAgentWording.setupMessageWordingOf({
    kind:        'constitution-edited',
    setupId:     'S1',
    revision:    4,
    markdown:    '## Rules\n\n- Example rule with ``` a fence.\n',
    draftedFrom: { contributing: true, research: false, installedDefault: true },
  }, PROMPT_FILLS);
  expect(wording).toBe([
    'User changed the constitution (revision 4). Keep User\'s change when you change the constitution.',
    'The full text is now:',
    '````markdown\n## Rules\n\n- Example rule with ``` a fence.\n````',
    'The SOURCES ticks now select: CONTRIBUTING.md, the installed default constitution.',
  ].join('\n\n'));
  expect(wording).not.toContain('again');
});

test('a constitution edit of the ticks alone carries no text, and one of the text alone no ticks', () => {
  const ticksOnly = PipelineAgentWording.setupMessageWordingOf({
    kind: 'constitution-edited', setupId: 'S1', revision: 5, markdown: null, draftedFrom: { contributing: false, research: false, installedDefault: false }
  }, PROMPT_FILLS);
  expect(ticksOnly).toBe('User changed the constitution (revision 5). Keep User\'s change when you change the constitution.\n\nThe SOURCES ticks now select: none.');
  const textOnly = PipelineAgentWording.setupMessageWordingOf({
    kind: 'constitution-edited', setupId: 'S1', revision: 6, markdown: 'Example text.', draftedFrom: null
  }, PROMPT_FILLS);
  expect(textOnly).not.toContain('SOURCES');
  expect(textOnly).toContain('```markdown\nExample text.\n```');
});

test('a draft edit carries each changed field with its value now as JSON, so the agent never reads the draft again', () => {
  const wording = PipelineAgentWording.setupMessageWordingOf({
    kind:          'draft-edited',
    setupId:       'S1',
    draftRevision: 5,
    editIds:       ['E6', 'E7'],
    fields:        ['gate:lint', 'phase-order:build'],
    changes:       [
      { field: 'gate:lint', value: { name: 'lint', run: 'bun run lint' } },
      { field: 'phase-order:build', value: ['lint', 'test'] },
    ],
    standingEntityRefusals: [],
  }, PROMPT_FILLS);
  expect(wording).toBe([
    'User changed the draft pipeline (revision 5): gate:lint, phase-order:build. Keep User\'s change when you propose a change.',
    '',
    'The draft now holds these values:',
    '- `gate:lint`: {"name":"lint","run":"bun run lint"}',
    '- `phase-order:build`: ["lint","test"]',
  ].join('\n'));
});

test('a draft edit that leaves the entities refused names each refusal that stands, which Continue and Apply wait on', () => {
  const wording = PipelineAgentWording.setupMessageWordingOf({
    kind:                   'draft-edited',
    setupId:                'S1',
    draftRevision:          6,
    editIds:                ['E8'],
    fields:                 ['entity:admin'],
    changes:                [{ field: 'entity:admin', value: { kind: 'app', home: ['/apps/web'] } }],
    standingEntityRefusals: ['the entities web, admin share the home "/apps/web"'],
  }, PROMPT_FILLS);
  expect(wording.endsWith([
    'The draft\'s entities still hold these refusals, so Continue and Apply wait until User resolves them:',
    '- the entities web, admin share the home "/apps/web"',
  ].join('\n'))).toBe(true);
});

test.each([
  ['research', 'entities', '### Entities'],
  ['entities', 'constitution', '### Constitution'],
  ['research', 'constitution', '### Constitution'],
  ['constitution', 'design', '### Pipeline design'],
] as const)('a Continue from %s carries the block of the %s step', (step, currentStep, heading) => {
  const wording = PipelineAgentWording.setupMessageWordingOf({
    kind: 'step-continued', setupId: 'S1', mode: 'setup', step, currentStep
  }, PROMPT_FILLS);

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
  expect(PipelineAgentWording.setupMessageWordingOf(message, PROMPT_FILLS)).toBe(wording);
});

test('a check\'s request names the gates Hephaestus runs', () => {
  expect(PipelineAgentWording.setupMessageWordingOf({
    kind: 'check-requested', setupId: 'S1', draftRevision: 3, gateNames: ['tests', 'lint']
  }, PROMPT_FILLS)).toBe('User asked for a check of draft revision 3. Hephaestus runs these gates two times in a fresh worktree of main: tests, lint. '
    + 'You get the result in a later message. Do not run a gate or a script yourself.');
});

test('a checked result gives each gate\'s verdict, its runs and the end of its output, with every hole filled', () => {
  const wording = PipelineAgentWording.setupMessageWordingOf({
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
  }, PROMPT_FILLS);

  expect(wording).toContain('draft revision\n3 changes or adds');
  expect(wording).toContain(`at commit ${'c'.repeat(40)}`);
  expect(wording).toContain('Prepare steps: run 1 passed, run 2 passed.');
  expect(wording).toContain('- `tests`: disagreeing. Runs: failed, passed. The end of the output:\n\n```\n1 test failed\n```');
  expect(wording).toContain('- `lint`: green. Runs: passed, passed.\n');
  expect(wording).toContain('pipeline propose');
  expect(wording).not.toContain('{{');
});

test('a check that could not run says why', () => {
  expect(PipelineAgentWording.setupMessageWordingOf({
    kind:    'check-ended',
    setupId: 'S1',
    check:   {
      draftRevision: 3, gateNames: ['tests'], state: 'cannot-run', result: null, reason: 'example sandbox tool missing'
    },
  }, PROMPT_FILLS)).toBe('User\'s check of draft revision 3 could not run: example sandbox tool missing. Tell User. Do not run a gate or a script yourself.');
});
