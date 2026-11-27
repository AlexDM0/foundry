/**
 * The closed shapes of the setup payloads: a well-formed payload reads to the typed value the Board takes, every missing, misshapen or
 * unknown field is named, never thrown, paths stay inside the repository, and the constitution's markdown is kept byte for byte.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineDraftEdit, ResearchScript } from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { SetupPayloadSchemas }                    from './SetupPayloadSchemas.ts';

const QUESTION = {
  step:        'design',
  subject:     { kind: 'gate', reference: 'test' },
  question:    'Run the tests before each review?',
  context:     'Example Agency runs them in CI.',
  options:     ['Yes', 'Only on merge'],
  recommended: ['a'],
  multiple:    false,
};

describe('a finding', () => {
  test('reads with its script, and with only a label and topic', () => {
    const script: ResearchScript = {
      name: 'test', run: 'bun test', meaning: 'Runs the unit tests', gateCandidate: 'gate', needs: ['network']
    };
    expect(SetupPayloadSchemas.findingReadingOf({
      topic: 'scripts', label: 'Unit tests', value: 'bun test', sourcePaths: ['package.json'], script
    })).toEqual({
      verdict: 'read',
      value:   {
        topic: 'scripts', label: 'Unit tests', value: 'bun test', sourcePaths: ['package.json'], script
      },
    });
    expect(SetupPayloadSchemas.findingReadingOf({ topic: 'note', label: 'No CI' })).toEqual({
      verdict: 'read',
      value:   {
        topic: 'note', label: 'No CI', value: null, sourcePaths: [], script: null
      },
    });
  });

  test.each([
    ['payload', 'scripts'],
    ['topic', { topic: 'gossip', label: 'x' }],
    ['label', { topic: 'note', label: ' ' }],
    ['value', { topic: 'note', label: 'x', value: 3 }],
    ['sourcePaths[0]', { topic: 'note', label: 'x', sourcePaths: ['../outside.md'] }],
    ['sourcePaths[0]', { topic: 'note', label: 'x', sourcePaths: ['/etc/passwd'] }],
    ['script.gateCandidate', {
      topic:  'scripts',
      label:  'x',
      script: {
        name: 'dev', run: 'bun dev', meaning: 'Serves', gateCandidate: 'maybe'
      }
    }],
    ['severity', { topic: 'note', label: 'x', severity: 'high' }],
  ])('names %s', (field, payload) => {
    expect(SetupPayloadSchemas.findingReadingOf(payload)).toEqual({ verdict: 'malformed', field });
  });
});

describe('a question', () => {
  test('reads to the Board\'s asking, its options lettered in order', () => {
    expect(SetupPayloadSchemas.questionReadingOf(QUESTION)).toEqual({
      verdict: 'read',
      value:   {
        step:               'design',
        subject:            { kind: 'gate', reference: 'test' },
        question:           QUESTION.question,
        context:            QUESTION.context,
        optionTexts:        ['Yes', 'Only on merge'],
        recommendedLetters: ['a'],
        multiple:           false,
      },
    });
  });

  test.each(['Other', 'other: write your own', 'Other (say which)', 'OTHER.'])('refuses the option "%s"', (option) => {
    expect(SetupPayloadSchemas.questionReadingOf({ ...QUESTION, options: ['Yes', option] })).toEqual({ verdict: 'malformed', field: 'options[1]' });
  });

  test('an option that only starts with the word is kept', () => {
    expect(SetupPayloadSchemas.questionReadingOf({ ...QUESTION, options: ['Yes', 'Otherwise skip it'] }).verdict).toBe('read');
  });

  test.each([
    ['step', { ...QUESTION, step: 'billing' }],
    ['subject.kind', { ...QUESTION, subject: { kind: 'ticket', reference: '7' } }],
    ['multiple', { ...QUESTION, multiple: 'yes' }],
    ['recommended', { ...QUESTION, recommended: 'a' }],
    ['options[0]', { ...QUESTION, options: [3, 'No'] }],
    ['other', { ...QUESTION, other: true }],
  ])('names %s', (field, payload) => {
    expect(SetupPayloadSchemas.questionReadingOf(payload)).toEqual({ verdict: 'malformed', field });
  });
});

describe('the constitution', () => {
  const markdown = '# Example Agency\r\n\r\n- Keep it small.\r\n';

  test('keeps the markdown byte for byte and reads its sources', () => {
    const sources = [{
      lineText: '- Keep it small.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
    }] as const;
    expect(SetupPayloadSchemas.constitutionReadingOf({ markdown, sources })).toEqual({ verdict: 'read', value: { markdown, annotations: sources } });
  });

  test.each([
    ['markdown', { sources: [] }],
    ['sources', { markdown, sources: 'CONTRIBUTING.md' }],
    ['sources[0].occurrence', {
      markdown,
      sources: [{
        lineText: '- Keep it small.', occurrence: 1.5, kind: 'research', path: null
      }]
    }],
    ['sources[0].kind', {
      markdown,
      sources: [{
        lineText: '- Keep it small.', occurrence: 1, kind: 'rumour', path: null
      }]
    }],
    ['sources[0].path', {
      markdown,
      sources: [{
        lineText: '- Keep it small.', occurrence: 1, kind: 'research', path: '~/notes.md'
      }]
    }],
    ['sources[0].path', {
      markdown,
      sources: [{
        lineText: '- Keep it small.', occurrence: 1, kind: 'research', path: 'docs\\notes.md'
      }]
    }],
    ['sources[0].rule', {
      markdown,
      sources: [{
        lineText: '- Keep it small.', occurrence: 1, kind: 'research', rule: 'R1'
      }]
    }],
  ])('names %s', (field, payload) => {
    expect(SetupPayloadSchemas.constitutionReadingOf(payload)).toEqual({ verdict: 'malformed', field });
  });
});

describe('a proposal', () => {
  test('reads each edit of the closed field union with its summary', () => {
    expect(SetupPayloadSchemas.proposalReadingOf({
      edits: [
        { field: 'gate:test', value: { name: 'test', run: 'bun test' }, summary: 'Run the tests.' },
        { field: 'phase-order:build', value: ['test'], summary: 'Run them while building.' },
        { field: 'approval:merge', value: true, summary: 'User accepts each merge.' },
      ],
    })).toEqual({
      verdict: 'read',
      value:   [
        { edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } }, summary: 'Run the tests.' },
        { edit: { target: 'phase-order', phase: 'build', names: ['test'] }, summary: 'Run them while building.' },
        { edit: { target: 'approval', approval: 'merge', value: true }, summary: 'User accepts each merge.' },
      ],
    });
  });

  test.each([
    ['edits', { edits: [] }],
    ['edits[0].field', { edits: [{ field: 'gates', value: null, summary: 'All gates.' }] }],
    ['edits[0].field', { edits: [{ field: 'role:janitor', value: null, summary: 'Tidy up.' }] }],
    ['edits[0].field', { edits: [{ field: '/phases/build', value: [], summary: 'A pointer.' }] }],
    ['edits[0].value', { edits: [{ field: 'gate:test', value: 'bun test', summary: 'Run the tests.' }] }],
    ['edits[0].summary', { edits: [{ field: 'review', value: null }] }],
    ['edits[0].by', {
      edits: [{
        field: 'review', value: null, summary: 'No review.', by: 'user'
      }]
    }],
  ])('names %s', (field, payload) => {
    expect(SetupPayloadSchemas.proposalReadingOf(payload)).toEqual({ verdict: 'malformed', field });
  });
});

describe('the ticket writing fields', () => {
  test('the route, the spec and plan approvals and the two document agents read from a proposal', () => {
    expect(SetupPayloadSchemas.proposalReadingOf({
      edits: [
        { field: 'ticket-writing', value: 'spec-then-plan', summary: 'Write a spec, then a plan.' },
        { field: 'approval:spec', value: false, summary: 'The pipeline approves the spec.' },
        { field: 'approval:plan', value: null, summary: 'User approves the plan.' },
        { field: 'role:planAgent', value: { model: 'opus', effort: 'high' }, summary: 'Plan with Opus.' },
        { field: 'ticket-writing', value: null, summary: 'One ticket.' },
      ],
    })).toEqual({
      verdict: 'read',
      value:   [
        { edit: { target: 'ticket-writing', value: 'spec-then-plan' }, summary: 'Write a spec, then a plan.' },
        { edit: { target: 'approval', approval: 'spec', value: false }, summary: 'The pipeline approves the spec.' },
        { edit: { target: 'approval', approval: 'plan', value: null }, summary: 'User approves the plan.' },
        { edit: { target: 'role', role: 'planAgent', value: { model: 'opus', effort: 'high' } }, summary: 'Plan with Opus.' },
        { edit: { target: 'ticket-writing', value: null }, summary: 'One ticket.' },
      ],
    });
  });

  test('a route outside the two, or an approval that is not a switch, names the value', () => {
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'ticket-writing', value: 'spec-only' }, 0)).toEqual({ verdict: 'malformed', field: 'edits[0].value' });
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'ticket-writing', value: true }, 0)).toEqual({ verdict: 'malformed', field: 'edits[0].value' });
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'approval:plan', value: 'on' }, 0)).toEqual({ verdict: 'malformed', field: 'edits[0].value' });
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'approval:release', value: true }, 0)).toEqual({ verdict: 'malformed', field: 'edits[0].field' });
  });

  test('the route never reads inside an entity, and the document agents are forge-level roles', () => {
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'entity:api/ticket-writing', value: 'spec-then-plan' }, 0))
      .toEqual({ verdict: 'malformed', field: 'edits[0].field' });
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'entity:api/role:specAgent', value: null }, 0))
      .toEqual({ verdict: 'malformed', field: 'edits[0].field' });
  });
});

describe('a ready step and a User field edit', () => {
  test('a ready step is one the agent works on', () => {
    expect(SetupPayloadSchemas.readyStepReadingOf({ step: 'constitution' })).toEqual({ verdict: 'read', value: 'constitution' });
    expect(SetupPayloadSchemas.readyStepReadingOf({ step: 'apply' })).toEqual({ verdict: 'malformed', field: 'step' });
  });

  test('a User field edit names its index, and keeps keys beside field and value', () => {
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'review', value: null }, 2)).toEqual({ verdict: 'read', value: { target: 'review', value: null } });
    expect(SetupPayloadSchemas.draftEditReadingOf('review', 2)).toEqual({ verdict: 'malformed', field: 'edits[2]' });
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: 'phase-order:build', value: 'test' }, 0)).toEqual({ verdict: 'malformed', field: 'edits[0].value' });
  });
});

describe('an edit of an entity', () => {
  test('reads a definition and each field inside an entity', () => {
    expect(SetupPayloadSchemas.proposalReadingOf({
      edits: [
        { field: 'entity:api', value: { kind: 'app', home: ['/apps/api'], summary: 'The API.' }, summary: 'Add the API.' },
        { field: 'entity:web', value: null, summary: 'Fold web.' },
        { field: 'entity:api/gate:test', value: { name: 'test', run: 'bun test' }, summary: 'Run the tests.' },
        { field: 'entity:api/role:builder', value: { model: 'opus' }, summary: 'Build with Opus.' },
        { field: 'entity:api/whitelist', value: ['design'], summary: 'Cross into design.' },
        { field: 'entity:api/reach', value: ['/bun.lock'], summary: 'Reach the lockfile.' },
        { field: 'entity:api/depends-on', value: null, summary: 'Depend on the root alone.' },
        { field: 'entity:api/concurrency', value: 2, summary: 'Two jobs at once.' },
      ],
    })).toEqual({
      verdict: 'read',
      value:   [
        { edit: { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'], summary: 'The API.' } }, summary: 'Add the API.' },
        { edit: { target: 'entity', entityKey: 'web', value: null }, summary: 'Fold web.' },
        {
          edit:    { target: 'within-entity', entityKey: 'api', edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } } },
          summary: 'Run the tests.'
        },
        { edit: { target: 'within-entity', entityKey: 'api', edit: { target: 'role', role: 'builder', value: { model: 'opus' } } }, summary: 'Build with Opus.' },
        { edit: { target: 'within-entity', entityKey: 'api', edit: { target: 'whitelist', value: ['design'] } }, summary: 'Cross into design.' },
        { edit: { target: 'within-entity', entityKey: 'api', edit: { target: 'reach', value: ['/bun.lock'] } }, summary: 'Reach the lockfile.' },
        { edit: { target: 'within-entity', entityKey: 'api', edit: { target: 'depends-on', value: null } }, summary: 'Depend on the root alone.' },
        { edit: { target: 'within-entity', entityKey: 'api', edit: { target: 'concurrency', value: 2 } }, summary: 'Two jobs at once.' },
      ],
    });
  });

  test.each<[string, unknown, unknown]>([
    ['edits[0].field', 'entity:api/approval:merge', true],
    ['edits[0].field', 'entity:api/role:productOwner', null],
    ['edits[0].field', 'entity:/gate:test', null],
    ['edits[0].value.kind', 'entity:api', { kind: 'service', home: ['/apps/api'] }],
    ['edits[0].value.home', 'entity:api', { kind: 'app' }],
    ['edits[0].value.owner', 'entity:api', { kind: 'app', home: ['/apps/api'], owner: 'Alex Example' }],
    ['edits[0].value', 'entity:api/concurrency', 0],
    ['edits[0].value', 'entity:api/concurrency', 1.5],
    ['edits[0].value[1]', 'entity:api/whitelist', ['design', ' ']],
    ['edits[0].value', 'entity:api/reach', '/bun.lock'],
    ['edits[0].value', 'entity:api/gate:test', 'bun test'],
  ])('names %s of %s', (field, draftField, value) => {
    expect(SetupPayloadSchemas.draftEditReadingOf({ field: draftField, value }, 0)).toEqual({ verdict: 'malformed', field });
  });
});

describe('a typed edit', () => {
  const TYPED_EDITS: readonly PipelineDraftEdit[] = [
    { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } },
    { target: 'gate', name: 'test', value: null },
    { target: 'phase-order', phase: 'build', names: ['test'] },
    { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install' } },
    { target: 'prepare-order', names: ['install'] },
    { target: 'review', value: { name: 'review', reReview: { thresholdLines: 40 } } },
    { target: 'constitution', value: { path: 'CONSTITUTION.md' } },
    { target: 'role', role: 'assistant', value: { model: 'opus', effort: 'high' } },
    { target: 'airlock', value: null },
    { target: 'approval', approval: 'merge', value: true },
    { target: 'approval', approval: 'spec', value: false },
    { target: 'approval', approval: 'plan', value: null },
    { target: 'ticket-writing', value: 'spec-then-plan' },
    { target: 'ticket-writing', value: null },
    { target: 'role', role: 'specAgent', value: { model: 'sonnet', effort: 'medium' } },
    { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'], summary: 'The API.' } },
    { target: 'entity', entityKey: 'web', value: null },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'role', role: 'builder', value: { model: 'opus' } } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'whitelist', value: ['design'] } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'reach', value: ['/bun.lock'] } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'depends-on', value: null } },
    { target: 'within-entity', entityKey: 'api', edit: { target: 'concurrency', value: 2 } },
  ];

  test('reads each target to the same edit', () => {
    for (const edit of TYPED_EDITS) {
      expect(SetupPayloadSchemas.typedDraftEditReadingOf(edit, 0), JSON.stringify(edit)).toEqual({ verdict: 'read', value: edit });
    }
  });

  test.each([
    ['edits[1]', 'gate:test'],
    ['edits[1].target', { field: 'gate:test', value: null }],
    ['edits[1].target', { target: 'gates', value: null }],
    ['edits[1].target', { target: 'whitelist', value: ['design'] }],
    ['edits[1].edit.target', { target: 'within-entity', entityKey: 'api', edit: { target: 'approval', approval: 'merge', value: true } }],
    ['edits[1].name', { target: 'gate', value: null }],
    ['edits[1].phase', { target: 'phase-order', phase: 'deploy', names: [] }],
    ['edits[1].role', { target: 'role', role: 'janitor', value: null }],
    ['edits[1].edit.role', { target: 'within-entity', entityKey: 'api', edit: { target: 'role', role: 'assistant', value: null } }],
    ['edits[1].entityKey', { target: 'entity', value: null }],
    ['edits[1].value', { target: 'gate', name: 'test', value: 'bun test' }],
    ['edits[1].names', { target: 'phase-order', phase: 'build', names: 'test' }],
    ['edits[1].value', { target: 'approval', approval: 'merge', value: 'on' }],
    ['edits[1].value.home', { target: 'entity', entityKey: 'api', value: { kind: 'app' } }],
    ['edits[1].edit.value', { target: 'within-entity', entityKey: 'api', edit: { target: 'concurrency', value: 0 } }],
    ['edits[1].value', { target: 'review', value: 'review' }],
    ['edits[1].value', { target: 'ticket-writing', value: 'spec-only' }],
    ['edits[1].approval', { target: 'approval', approval: 'release', value: true }],
    ['edits[1].edit.target', { target: 'within-entity', entityKey: 'api', edit: { target: 'ticket-writing', value: 'spec-then-plan' } }],
    ['edits[1].field', { target: 'review', value: null, field: 'review' }],
  ])('names %s', (field, edit) => {
    expect(SetupPayloadSchemas.typedDraftEditReadingOf(edit, 1)).toEqual({ verdict: 'malformed', field });
  });
});
