/**
 * A job's sandbox refusal both ways. What matters: what the writer stores reads back as the same step with its refusal worded; a missing
 * file is absent, the job confinement refused nothing; and a file that is not JSON, of another version or none, or with the step or the
 * reason of the wrong shape is unreadable, never a refusal ignored, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                               from '../../testing/ScratchWorkspace.ts';
import type { SandboxRefusalProblem }                                                   from './@types/SandboxRefusalProblem.ts';
import { SANDBOX_REFUSAL_FORMAT_VERSION, type SandboxRefusal, SandboxRefusalIngestion } from './SandboxRefusalIngestion.ts';
import { createSandboxRefusalWriter }                                                   from './SandboxRefusalWriter.ts';

let scratchDirectory = '';

const refusalFilePath = (): string => join(scratchDirectory, 'sandbox-refusal.json');

const reading = (): ReturnType<SandboxRefusalIngestion['read']> => new SandboxRefusalIngestion(refusalFilePath()).read();

const REFUSAL: SandboxRefusal = { step: 'gate-1', reason: 'the sandbox cannot be applied' };

beforeEach(() => {
  scratchDirectory = createScratchDirectory('sandbox-refusal-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same step, its refusal worded, with its version', () => {
  createSandboxRefusalWriter(refusalFilePath()).write({ step: 'gate-1', refusal: { code: 'denied-root-unmade', deniedRoot: '/example/root' } });
  expect(reading()).toEqual({ verdict: 'readable', refusal: { step: 'gate-1', reason: 'the denied folder /example/root could not be made, so it would get no read-only mount' } });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(refusalFilePath(), '{"step": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a refusal of another version, or of none, is unreadable', () => {
  writeFileSync(refusalFilePath(), `${JSON.stringify({ ...REFUSAL, version: SANDBOX_REFUSAL_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: SANDBOX_REFUSAL_FORMAT_VERSION } });
  writeFileSync(refusalFilePath(), `${JSON.stringify(REFUSAL)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: SANDBOX_REFUSAL_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, SandboxRefusalProblem]>([
  ['step', { step: 1 }, { code: 'field-is-not', field: 'step', expected: 'text' }],
  ['reason', { reason: undefined }, { code: 'field-is-not', field: 'reason', expected: 'text' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  writeFileSync(refusalFilePath(), `${JSON.stringify({ version: SANDBOX_REFUSAL_FORMAT_VERSION, ...REFUSAL, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new SandboxRefusalIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
