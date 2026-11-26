/**
 * A red handoff's facts both ways. What matters: what the writer stores reads back as the same facts, a merge conflict's tip and a spent
 * scope resume kept; a missing file is absent, a job that never went red; and a file that is not JSON, of another version or none, or with
 * any field of the wrong shape is unreadable, never a job that did not go red, so no resume ladder restarts on it, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                        from '../../testing/ScratchWorkspace.ts';
import { RED_HANDOFF_FORMAT_VERSION, type RedHandoffFacts, RedHandoffIngestion } from './RedHandoffIngestion.ts';
import { createRedHandoffWriter }                                                from './RedHandoffWriter.ts';

let scratchDirectory = '';

const factsFilePath = (): string => join(scratchDirectory, 'red-handoff.json');

const reading = (): ReturnType<RedHandoffIngestion['read']> => new RedHandoffIngestion(factsFilePath()).read();

const GATE_FACTS: RedHandoffFacts = {
  kind:                'gate',
  name:                'tests',
  command:             'bun test',
  fixCommand:          null,
  commit:              'head-commit',
  exitCode:            1,
  gateFailureNotePath: '/example/jobs/J1/gate-failure.md',
  fullLogPath:         '/example/jobs/J1/gate.log',
  resume:              1,
  resumesAllowed:      2,
  interruptedInstance: 1,
  callBudget:          50,
};

beforeEach(() => {
  scratchDirectory = createScratchDirectory('red-handoff-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each<[string, RedHandoffFacts]>([
  ['a red gate', GATE_FACTS],
  ['a conflicted merge with a spent scope resume', {
    ...GATE_FACTS, kind: 'merge-conflict', name: 'main', command: null, exitCode: null, fullLogPath: null, mergedTip: 'target-tip', scopeResumed: true
  }],
])('what the writer stores of %s reads back as the same facts', (_handoff, facts) => {
  createRedHandoffWriter(factsFilePath()).write(facts);
  expect(reading()).toEqual({ verdict: 'readable', facts });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(factsFilePath(), '{"kind": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('facts of another version, or of none, are unreadable', () => {
  writeFileSync(factsFilePath(), `${JSON.stringify({ ...GATE_FACTS, version: RED_HANDOFF_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${RED_HANDOFF_FORMAT_VERSION}` });
  writeFileSync(factsFilePath(), `${JSON.stringify(GATE_FACTS)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${RED_HANDOFF_FORMAT_VERSION}` });
});

test.each([
  ['kind', { kind: 'lint' }, 'its "kind" is not a red handoff kind'],
  ['name', { name: null }, 'its "name" is not text'],
  ['command', { command: 1 }, 'its "command" is not text or null'],
  ['commit', { commit: null }, 'its "commit" is not a commit'],
  ['exitCode', { exitCode: '1' }, 'its "exitCode" is not an exit code or null'],
  ['gateFailureNotePath', { gateFailureNotePath: undefined }, 'its "gateFailureNotePath" is not a path'],
  ['resume', { resume: -1 }, 'its "resume" is not a count'],
  ['interruptedInstance', { interruptedInstance: 1.5 }, 'its "interruptedInstance" is not a child instance'],
  ['mergedTip', { mergedTip: 3 }, 'its "mergedTip" is not a commit'],
  ['scopeResumed', { scopeResumed: false }, 'its "scopeResumed" is not true'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  writeFileSync(factsFilePath(), `${JSON.stringify({ version: RED_HANDOFF_FORMAT_VERSION, ...GATE_FACTS, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new RedHandoffIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
