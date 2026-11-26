/**
 * A merged-tree gate's kept outcome both ways. What matters: what the writer stores, every optional field included, reads back as the same
 * gate, under its own `formatVersion` key; a missing file is absent; anything else is unreadable, never a throw, since an Airlock settled on
 * a malformed gate could merge a tree no gate judged.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { MergedTreeGate }                            from './@types/MergedTreeGate.ts';
import { MergedTreeGateOutcomeIngestion }                 from './MergedTreeGateOutcomeIngestion.ts';
import { createMergedTreeGateOutcomeWriter }              from './MergedTreeGateOutcomeWriter.ts';

let scratchDirectory: string | null = null;

let outcomeFilePath = '';

const reading = (): ReturnType<MergedTreeGateOutcomeIngestion['read']> => new MergedTreeGateOutcomeIngestion(outcomeFilePath).read();

const PASSED_GATE: MergedTreeGate = {
  outcome: 'passed', step: null, output: '', stamp: null
};

const RED_GATE: MergedTreeGate = {
  outcome:      'failed',
  step:         'tests',
  entity:       'shop',
  output:       'expected 2, received 3',
  stamp:        { phase: 'merge', phaseHash: 'example-phase-hash', entityPhaseHashes: { shop: 'example-shop-hash' } },
  cacheReports: { phase: 'merge', gates: [{ gateName: 'tests', cacheReport: 'partial' }, { gateName: 'lint', cacheReport: null }] },
  stepRuns:     {
    phase: 'merge',
    steps: [{
      stepKind: 'gate', stepName: 'tests', entity: 'shop', runMilliseconds: 1200, ending: 'failed'
    }]
  },
};

const storedWith = (gate: unknown, formatVersion: unknown = 1): string => JSON.stringify({ formatVersion, gate });

beforeEach(() => {
  scratchDirectory = createScratchDirectory('merged-tree-gate-outcome');
  outcomeFilePath = join(scratchDirectory, 'outcome.json');
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each([['a pass', PASSED_GATE], ['a red gate with every field', RED_GATE]])('what the writer stores for %s reads back the same', (_case, gate) => {
  createMergedTreeGateOutcomeWriter(outcomeFilePath).write(gate);

  expect(reading()).toEqual({ verdict: 'readable', gate });
});

test.each([
  ['not JSON', '{"formatVersion": 1, "gate": ', 'it is not valid JSON'],
  ['no format version', JSON.stringify({ gate: PASSED_GATE }), 'its formatVersion is not 1'],
  ['another format version', storedWith(PASSED_GATE, 2), 'its formatVersion is not 1'],
  ['no gate', storedWith(undefined), '"gate" is not an object'],
  ['an unknown outcome', storedWith({ ...PASSED_GATE, outcome: 'green' }), '"gate.outcome"'],
  ['a step that is no text', storedWith({ ...PASSED_GATE, step: 3 }), '"gate.step"'],
  ['an entity that is no text', storedWith({ ...PASSED_GATE, entity: 3 }), '"gate.entity"'],
  ['no output', storedWith({ ...PASSED_GATE, output: undefined }), '"gate.output"'],
  ['a stamp with no hash', storedWith({ ...PASSED_GATE, stamp: { phase: 'merge' } }), '"gate.stamp"'],
  ['entity hashes that are no text', storedWith({ ...PASSED_GATE, stamp: { phase: 'merge', phaseHash: 'h', entityPhaseHashes: { shop: 1 } } }), 'entityPhaseHashes'],
  ['a cache report of an unknown kind', storedWith({ ...PASSED_GATE, cacheReports: { phase: 'merge', gates: [{ gateName: 'tests', cacheReport: 'warm' }] } }), 'cacheReports'],
  ['step runs with no steps', storedWith({ ...PASSED_GATE, stepRuns: { phase: 'merge' } }), '"gate.stepRuns"'],
  ['a step run with no run time', storedWith({ ...PASSED_GATE, stepRuns: { phase: 'merge', steps: [{ stepKind: 'gate', stepName: 't', ending: 'passed' }] } }), 'stepRuns'],
])('%s is unreadable, never a throw', (_case, storedText, reason) => {
  writeFileSync(outcomeFilePath, storedText);

  const outcomeReading = reading();

  expect(outcomeReading.verdict).toBe('unreadable');
  expect(outcomeReading.verdict === 'unreadable' ? outcomeReading.reason : '').toContain(reason);
});
