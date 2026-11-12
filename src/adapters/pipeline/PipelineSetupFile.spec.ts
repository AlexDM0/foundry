/**
 * `pipeline-setup.json` both ways. What matters: a written record reads back whole and writes back byte for byte, its own keys first in a
 * fixed order and every top-level key this build does not know after them, in stored order; the constitution's markdown is kept byte for
 * byte; a record with no check is written with no `check` key, and one with a check keeps it before `nextNumbers`; no file is `absent`; and a
 * file nobody could trust whole, a nested key the read does not know included, is `malformed` with a reason
 * naming the offending part, never a throw.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import type { PipelineSetup }                             from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { PipelineSetupFile }                              from './PipelineSetupFile.ts';

const EXAMPLE_SETUP: PipelineSetup = {
  formatVersion:   1,
  setupId:         'S2',
  mode:            'setup',
  baseContentHash: null,
  stepStates:      {
    billing: 'done', research: 'done', constitution: 'needs-recheck', design: 'in-progress', apply: 'not-started'
  },
  currentStep:     'design',
  billing:         { mode: 'api', maxBudgetUsd: 4.5 },
  agentJobId:      'J7',
  snapshotCommit:  'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  readyToContinue: ['design'],
  findings:        [
    {
      findingId:   'F1',
      topic:       'scripts',
      label:       'Type check',
      value:       'bun run typecheck',
      sourcePaths: ['package.json'],
      script:      {
        name: 'typecheck', run: 'bun run typecheck', meaning: 'Checks the types', gateCandidate: 'gate', needs: []
      },
      needsRecheck: false,
    },
    {
      findingId: 'F2', topic: 'note', label: 'No CI', value: null, sourcePaths: [], script: null, needsRecheck: true
    },
  ],
  questions: [
    {
      questionId:  'Q1',
      step:        'design',
      subject:     { kind: 'gate', reference: 'test' },
      question:    'Run the tests on merge?',
      context:     'Example Agency runs them in CI',
      options:     [{ letter: 'a', text: 'Yes' }, { letter: 'b', text: 'No' }],
      recommended: ['a'],
      multiple:    false,
      answer:      { letters: ['a'], answeredAt: '2026-11-12T10:00:00+01:00' },
    },
    {
      questionId:  'Q2',
      step:        'research',
      subject:     null,
      question:    'Which folder holds the docs?',
      context:     '',
      options:     [{ letter: 'a', text: 'docs/' }, { letter: 'b', text: 'site/' }],
      recommended: ['a'],
      multiple:    false,
      answer:      null,
    },
  ],
  constitution: {
    markdown:    '# Example constitution\r\n\n- Keep every change small.\n\n```ts\nconst example = 1;\n```\n',
    annotations: [{
      lineText: '- Keep every change small.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
    }],
    draftedFrom: { contributing: true, research: false, installedDefault: true },
    baseBlob:    null,
    revision:    3,
  },
  draft: {
    version: 2, prepare: [], gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'], review: [], merge: ['test'] }, review: { name: 'Review' }
  },
  draftRevision: 4,
  edits:         [{
    editId: 'E1', by: 'agent', field: 'gate:test', summary: 'Run the tests.', undone: false
  }],
  replacesUnreadablePipeline: true,
  applyRequest:               {
    draftRevision: 4, resumesBoard: true, commitJobId: null, state: 'held', reason: 'dirty-checkout'
  },
  nextNumbers: { finding: 3, question: 3, edit: 2 },
  extra:       [['exampleLaterKey', { kept: true }], ['anotherKey', [1, 2]]],
};

const EXAMPLE_CHECKED: PipelineSetup = {
  ...EXAMPLE_SETUP,
  check: {
    draftRevision: 4,
    gateNames:     ['test'],
    state:         'checked',
    result:        {
      snapshotCommit: 'b2c3d4e5f60718293a4b5c6d7e8f9012345678a1',
      prepare:        { failedSteps: [null, null], output: '' },
      gates:          [{
        name: 'test', outcomes: ['failed', 'passed'], durationsMilliseconds: [4200, 3900], verdict: 'disagreeing', output: '1 test failed\n'
      }],
    },
    reason: null,
  },
};

let scratchDirectory = '';
let setupFilePath    = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-setup-file');
  setupFilePath    = join(scratchDirectory, 'pipeline-setup.json');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function storedDocument(): Record<string, unknown> {
  return JSON.parse(PipelineSetupFile.contentsOf(EXAMPLE_SETUP)) as Record<string, unknown>;
}

function readingOfDocument(document: unknown): ReturnType<typeof PipelineSetupFile.read> {
  writeFileSync(setupFilePath, JSON.stringify(document));
  return PipelineSetupFile.read(setupFilePath);
}

describe('a readable record', () => {
  test('no file reads as absent', () => {
    expect(PipelineSetupFile.read(setupFilePath)).toEqual({ verdict: 'absent' });
  });

  test('a written record reads back whole, unknown keys and the markdown included, and writes back byte for byte', () => {
    const text = PipelineSetupFile.contentsOf(EXAMPLE_SETUP);
    writeFileSync(setupFilePath, text);

    const reading = PipelineSetupFile.read(setupFilePath);

    expect(reading).toEqual({ verdict: 'readable', setup: EXAMPLE_SETUP });
    if (reading.verdict !== 'readable') throw new Error('the record did not read');
    expect(PipelineSetupFile.contentsOf(reading.setup)).toBe(text);
    expect(readFileSync(setupFilePath, 'utf8')).toBe(text);
  });

  test('the record\'s own keys come first in a fixed order, then the unknown ones in stored order', () => {
    expect(Object.keys(storedDocument())).toEqual([
      'formatVersion',
      'setupId',
      'mode',
      'baseContentHash',
      'stepStates',
      'currentStep',
      'billing',
      'agentJobId',
      'snapshotCommit',
      'readyToContinue',
      'findings',
      'questions',
      'constitution',
      'draft',
      'draftRevision',
      'edits',
      'replacesUnreadablePipeline',
      'applyRequest',
      'nextNumbers',
      'exampleLaterKey',
      'anotherKey',
    ]);
  });

  test('a check reads back whole and writes back byte for byte, before nextNumbers', () => {
    const text = PipelineSetupFile.contentsOf(EXAMPLE_CHECKED);
    writeFileSync(setupFilePath, text);

    const reading = PipelineSetupFile.read(setupFilePath);

    expect(reading).toEqual({ verdict: 'readable', setup: EXAMPLE_CHECKED });
    if (reading.verdict !== 'readable') throw new Error('the record did not read');
    expect(PipelineSetupFile.contentsOf(reading.setup)).toBe(text);
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys.slice(keys.indexOf('applyRequest'), keys.indexOf('nextNumbers') + 1)).toEqual(['applyRequest', 'check', 'nextNumbers']);
  });

  test('a nested record built in another key order is written in the read\'s order', () => {
    const [firstFinding] = EXAMPLE_SETUP.findings;
    if (firstFinding === undefined) throw new Error('the example has a finding');
    const reversedFinding = Object.fromEntries(Object.entries(firstFinding).reverse()) as typeof firstFinding;
    const reordered: PipelineSetup = { ...EXAMPLE_SETUP, findings: [reversedFinding] };

    expect(PipelineSetupFile.contentsOf(reordered)).toBe(PipelineSetupFile.contentsOf({ ...EXAMPLE_SETUP, findings: [firstFinding] }));
  });
});

describe('a malformed record', () => {
  test.each<[string, (document: Record<string, unknown>) => unknown, string]>([
    ['not an object', () => [], 'the document is not a JSON object'],
    ['another format version', (document) => ({ ...document, formatVersion: 2 }), 'formatVersion is 2, and this build reads 1'],
    ['a missing key', ({ setupId: _setupId, ...rest }) => rest, 'setupId is missing'],
    ['a setup id of another shape', (document) => ({ ...document, setupId: 'D1' }), 'setupId is "D1", and it has to be a setup id such as S1'],
    ['an unknown step state',
      (document) => ({ ...document, stepStates: { ...(document['stepStates'] as object), design: 'paused' } }),
      'stepStates.design is "paused", which is not one of not-started, in-progress, done, needs-recheck'],
    ['a nested key the read does not know',
      (document) => ({
        ...document,
        nextNumbers: {
          finding: 1, question: 1, edit: 1, rule: 1
        }
      }),
      'nextNumbers.rule is not a key of nextNumbers; the keys are finding, question, edit'],
    ['a draft that is not a pipeline', (document) => ({ ...document, draft: { version: 2, prepare: [], gates: [] } }), 'draft is not a pipeline: phases is missing'],
    ['an edit naming no draft field',
      (document) => ({
        ...document,
        edits: [{
          editId: 'E1', by: 'user', field: 'rule:R1', summary: 'x', undone: false
        }]
      }),
      'edits[0].field is not a draft field'],
    ['an annotation at occurrence 0', (document) => ({
      ...document,
      constitution: {
        ...(document['constitution'] as object),
        annotations: [{
          lineText: 'x', occurrence: 0, kind: 'research', path: null
        }]
      },
    }), 'constitution.annotations[0].occurrence is not a whole number of at least 1'],
    ['a check in an unknown state',
      (document) => ({
        ...document,
        check: {
          draftRevision: 1, gateNames: ['test'], state: 'paused', result: null, reason: null
        }
      }),
      'check.state is "paused", which is not one of queued, running, checked, cannot-run, stopped'],
    ['a checked gate with an unknown outcome',
      (document) => ({
        ...document,
        check: {
          draftRevision: 1,
          gateNames:     ['test'],
          state:         'checked',
          result:        {
            snapshotCommit: 'example',
            prepare:        { failedSteps: [null], output: '' },
            gates:          [{
              name: 'test', outcomes: ['flaky'], durationsMilliseconds: [1], verdict: 'red', output: ''
            }]
          },
          reason: null,
        }
      }),
      'check.result.gates[0].outcomes[0] is "flaky", which is not one of passed, failed, cannot-run'],
    ['a billing cap with a subscription',
      (document) => ({ ...document, billing: { mode: 'subscription', maxBudgetUsd: 2 } }),
      'billing.maxBudgetUsd is present with mode subscription'],
  ])('%s is malformed with its reason', (_case, documentOf, reason) => {
    expect(readingOfDocument(documentOf(storedDocument()))).toEqual({ verdict: 'malformed', reason });
  });

  test('text that is not JSON is malformed, never a throw', () => {
    writeFileSync(setupFilePath, '{ "formatVersion": 1,');

    expect(PipelineSetupFile.read(setupFilePath).verdict).toBe('malformed');
  });
});
