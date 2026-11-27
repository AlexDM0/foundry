/**
 * `gate-profiles.json` both ways. What matters: written runs read back whole and write back byte for byte, the file's own keys first and
 * every top-level key this build does not know after them, in stored order; a gate's `in` and `network` and a run's `cacheReport` and
 * `entity` are written only when set, so a file from before entities reads and writes back byte for byte; no file is `absent`; and a file
 * nobody could trust whole, a key in a run the read does not know, a cache report outside its words or an entity that is no text included,
 * is `malformed` with a reason naming the offending part, never a throw.
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

import type { GateProfiles }                              from '../../domain/tracker-model/@types/GateProfile.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GateProfilesFile }                               from './GateProfilesFile.ts';

const EXAMPLE_PROFILES: GateProfiles = {
  formatVersion: 1,
  nextRunNumber: 4,
  runs:          [
    {
      profileRunId: 'P2',
      setupId:      'S1',
      phase:        'merge',
      gate:         {
        name: 'browser-tests', run: 'bun run test:browser', in: 'web', network: ['registry.npmjs.org']
      },
      gateHash:            'example-gate-hash',
      prepare:             [{ name: 'install', run: 'bun install --frozen-lockfile' }],
      state:               'passed',
      stopRequested:       false,
      elapsedMilliseconds: 41_200,
      cacheReport:         'partial',
    },
    {
      profileRunId:        'P3',
      setupId:             null,
      phase:               'build',
      gate:                { name: 'typecheck', run: 'bun run typecheck' },
      gateHash:            'another-gate-hash',
      prepare:             [],
      state:               'running',
      stopRequested:       true,
      elapsedMilliseconds: null,
    },
  ],
  extra: [['exampleFutureKey', { kept: true }]],
};

let folder = '';
let filePath = '';

beforeEach(() => {
  folder   = createScratchDirectory('gate-profiles-file');
  filePath = join(folder, 'gate-profiles.json');
});

afterEach(() => {
  removeScratchDirectory(folder);
});

describe('a well-formed file', () => {
  test('reads back whole and writes back byte for byte, an unknown top-level key kept after the own keys', () => {
    writeFileSync(filePath, GateProfilesFile.contentsOf(EXAMPLE_PROFILES));
    const written = readFileSync(filePath, 'utf8');

    const reading = GateProfilesFile.read(filePath);

    expect(reading).toEqual({ verdict: 'readable', profiles: EXAMPLE_PROFILES });
    if (reading.verdict !== 'readable') throw new Error('the file did not read');
    expect(GateProfilesFile.contentsOf(reading.profiles)).toBe(written);
    expect(Object.keys(JSON.parse(written) as object)).toEqual(['formatVersion', 'nextRunNumber', 'runs', 'exampleFutureKey']);
  });

  test('a gate with no folder and no network is written with neither key', () => {
    const written = JSON.parse(GateProfilesFile.contentsOf(EXAMPLE_PROFILES)) as { runs: { gate: object }[] };

    expect(written.runs[1]?.gate).toEqual({ name: 'typecheck', run: 'bun run typecheck' });
  });

  test('a run whose gate reported no cache is written with no cacheReport key', () => {
    const written = JSON.parse(GateProfilesFile.contentsOf(EXAMPLE_PROFILES)) as { runs: object[] };

    expect(written.runs.map((run) => Object.hasOwn(run, 'cacheReport'))).toEqual([true, false]);
  });

  test('a run of an entity\'s gate reads back with its entity and writes back byte for byte; a run without one is written without the key', () => {
    const [entityRun, plainRun] = EXAMPLE_PROFILES.runs;
    if (entityRun === undefined || plainRun === undefined) throw new Error('the example has two runs');
    const profiles: GateProfiles = { ...EXAMPLE_PROFILES, runs: [{ ...entityRun, entity: 'web', gate: { ...entityRun.gate, in: '/apps/web' } }, plainRun] };
    writeFileSync(filePath, GateProfilesFile.contentsOf(profiles));
    const written = readFileSync(filePath, 'utf8');

    const reading = GateProfilesFile.read(filePath);

    expect(reading).toEqual({ verdict: 'readable', profiles });
    if (reading.verdict !== 'readable') throw new Error('the file did not read');
    expect(GateProfilesFile.contentsOf(reading.profiles)).toBe(written);
    expect((JSON.parse(written) as { runs: object[] }).runs.map((run) => Object.hasOwn(run, 'entity'))).toEqual([true, false]);
  });

  test('a file written before entities, as stored text, writes back byte for byte', () => {
    const storedText = `${JSON.stringify(JSON.parse(GateProfilesFile.contentsOf(EXAMPLE_PROFILES)), null, 2)}\n`;
    writeFileSync(filePath, storedText);

    const reading = GateProfilesFile.read(filePath);

    if (reading.verdict !== 'readable') throw new Error('the file did not read');
    expect(GateProfilesFile.contentsOf(reading.profiles)).toBe(storedText);
  });

  test('no file reads as absent', () => {
    expect(GateProfilesFile.read(filePath)).toEqual({ verdict: 'absent' });
  });
});

describe('a file nobody can trust whole is malformed, never a throw', () => {
  const runOf = (change: Record<string, unknown>): unknown => ({ ...EXAMPLE_PROFILES.runs[0], ...change });
  const documentWith = (change: Record<string, unknown>): string => JSON.stringify({
    formatVersion: 1, nextRunNumber: 4, runs: [], ...change
  });

  test.each([
    ['text that is not JSON', '{ "formatVersion": 1,', 'JSON'],
    ['another format version', documentWith({ formatVersion: 2 }), 'formatVersion is 2'],
    ['a missing run list', JSON.stringify({ formatVersion: 1, nextRunNumber: 1 }), 'runs is missing'],
    ['a run number below 1', documentWith({ nextRunNumber: 0 }), 'nextRunNumber'],
    ['a key in a run the read does not know', documentWith({ runs: [runOf({ startedAt: 'now' })] }), 'runs[0].startedAt is not a key'],
    ['an unknown state', documentWith({ runs: [runOf({ state: 'finished' })] }), 'runs[0].state is "finished"'],
    ['an unknown phase', documentWith({ runs: [runOf({ phase: 'deploy' })] }), 'runs[0].phase is "deploy"'],
    ['a run id that is no run id', documentWith({ runs: [runOf({ profileRunId: 'R1' })] }), 'runs[0].profileRunId'],
    ['a gate that writes', documentWith({ runs: [runOf({ gate: { name: 'tests', run: 'bun test', writes: ['~/.cache'] } })] }), 'runs[0].gate.writes is not a key'],
    ['a negative duration', documentWith({ runs: [runOf({ elapsedMilliseconds: -1 })] }), 'runs[0].elapsedMilliseconds'],
    ['an unknown cache report', documentWith({ runs: [runOf({ cacheReport: 'warm' })] }), 'runs[0].cacheReport is "warm"'],
    ['an entity that is no text', documentWith({ runs: [runOf({ entity: 7 })] }), 'runs[0].entity is not a text'],
  ])('%s', (_case, text, reasonPart) => {
    writeFileSync(filePath, text);

    const reading = GateProfilesFile.read(filePath);

    expect(reading.verdict).toBe('malformed');
    expect(reading.verdict === 'malformed' ? reading.reason : '').toContain(reasonPart);
  });
});
