/**
 * The closed shapes of the setup payloads. What matters: a well-formed payload reads to the typed value the Board takes; every missing,
 * misshapen or unknown field is named, never thrown; the agent can offer no "Other" option; a draft field outside the closed union is
 * malformed; a source path or a finding's path must stay inside the repository; and the constitution's markdown is kept byte for byte.
 */
import { describe, expect, test } from 'bun:test';

import type { ResearchScript } from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { SetupPayloadSchemas } from './SetupPayloadSchemas.ts';

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
