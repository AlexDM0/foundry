/**
 * The crash path of a live process on a scratch data folder, with a fake lease renewal and a fake registry write. What matters: the crash log
 * and the presence ending `crashed` are on disk before the registry is told, so a dying process has made them; the renewal stops, so Talos's
 * lease runs out and the agents wait; a registry write that never settles is cut off at the bound; a crash log already there is kept; an
 * input that throws leaves its part null and the path never throws. No spec here registers a process listener.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import type { CrashLogRecord }                                        from './@types/CrashLogRecord.ts';
import type { PresenceRecord }                                        from './@types/PresenceRecord.ts';
import { CrashLog }                                                   from './CrashLog.ts';
import { CrashPath, type CrashPathContext, type RegistryCrashReport } from './CrashPath.ts';
import { overseerFilesIn, type OverseerFiles }                        from './OverseerFiles.ts';
import { Presence }                                                   from './Presence.ts';

const CRASHED_AT = '2026-11-19T09:03:10.000+01:00';

const SHORT_REGISTRY_BOUND_MILLISECONDS = 20;

let boardFolder = '';
let files: OverseerFiles = overseerFilesIn('');

beforeEach(() => {
  boardFolder = createScratchDirectory('crash-path');
  files = overseerFilesIn(boardFolder);
  mkdirSync(files.overseerDirectory);
  Presence.writeStartedPresence(files, {
    generation:          4,
    process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
    codeVersion:         'example-code',
    startOrigin:         'user',
    startedAt:           '2026-11-19T09:00:00.000+01:00',
    startClassification: null,
  });
  Presence.writeHeartbeat(files, 4, '2026-11-19T09:03:00.000+01:00');
});

afterEach(() => {
  removeScratchDirectory(boardFolder);
});

interface FakeCrashPath {
  context:         CrashPathContext;
  renewalStops:    () => number;
  registryReports: RegistryCrashReport[];
  logLines:        string[];
}

function fakeCrashPathOf(overrides: Partial<CrashPathContext> = {}): FakeCrashPath {
  let renewalStops = 0;
  const registryReports: RegistryCrashReport[] = [];
  const logLines: string[] = [];
  const context: CrashPathContext = {
    files,
    generation:         4,
    activeJobs:         () => [],
    talosChildren:      () => [{ state: 'running' }],
    stopLeaseRenewal:   () => { renewalStops += 1; },
    writeRegistryCrash: async (report) => { registryReports.push(report); },
    stampNow:           () => CRASHED_AT,
    log:                (line) => { logLines.push(line); },
    ...overrides,
  };
  return {
    context, renewalStops: () => renewalStops, registryReports, logLines
  };
}

function storedPresence(): PresenceRecord {
  const reading = Presence.readPresence(files);
  if (reading.verdict !== 'read') throw new Error(`presence.json reads ${reading.verdict}`);
  return reading.record;
}

function storedCrashLog(): CrashLogRecord {
  const reading = CrashLog.read(files, 4);
  if (reading.verdict !== 'read') throw new Error(`the crash log reads ${reading.verdict}`);
  return reading.record;
}

const OVERSEER_CRASH = { component: 'overseer', error: CrashLog.errorOf('uncaught-exception', new Error('example failure')) } as const;

describe('the crash path', () => {
  test('the crash log and the presence ending crashed are written before the registry is told', async () => {
    const seenAtTheRegistryStep: { crashLog: boolean; ending: PresenceRecord['ending'] }[] = [];
    const fake = fakeCrashPathOf({
      writeRegistryCrash: async () => {
        seenAtTheRegistryStep.push({ crashLog: existsSync(CrashLog.pathOf(files, 4)), ending: storedPresence().ending });
      },
    });
    const outcome = await CrashPath.record(fake.context, OVERSEER_CRASH);
    expect(seenAtTheRegistryStep).toEqual([{
      crashLog: true,
      ending:   {
        kind: 'crashed', component: 'overseer', crashLogGeneration: 4, at: CRASHED_AT
      },
    }]);
    expect(outcome).toEqual({
      crashLogPath: CrashLog.pathOf(files, 4), crashLog: 'created', presence: 'written', registry: 'written'
    });
  });

  test('the crash log keeps the crashed generation, its last beat, the error and the inputs, written by the crash path', async () => {
    await CrashPath.record(fakeCrashPathOf().context, OVERSEER_CRASH);
    expect(storedCrashLog()).toMatchObject({
      crashedGeneration: 4,
      component:         'overseer',
      suspected:         false,
      classification:    null,
      recordedBy:        { generation: 4, startOrigin: 'user', crashPath: true },
      crashedProcess:    { processId: 4242 },
      lastHeartbeat:     { sequence: 1, at: '2026-11-19T09:03:00.000+01:00' },
      error:             { origin: 'uncaught-exception', name: 'Error', message: 'example failure' },
      activeJobs:        [],
      talosChildren:     [{ state: 'running' }],
    });
  });

  test('the lease renewal is stopped synchronously, so Talos stops the agents at their turn end and they wait', () => {
    const fake = fakeCrashPathOf({ writeRegistryCrash: () => new Promise(() => undefined), registryBoundMilliseconds: SHORT_REGISTRY_BOUND_MILLISECONDS });
    const recording = CrashPath.record(fake.context, OVERSEER_CRASH);
    expect(fake.renewalStops()).toBe(1);
    return recording;
  });

  test('the registry is told the crash in the shape of its presence key', async () => {
    const fake = fakeCrashPathOf();
    await CrashPath.record(fake.context, { component: 'talos', error: null });
    expect(fake.registryReports).toEqual([{
      generation: 4,
      at:         CRASHED_AT,
      crash:      {
        component: 'talos', suspected: false, errorName: null, errorMessage: null, crashLogPath: CrashLog.pathOf(files, 4)
      },
    }]);
  });

  test('a registry write that never settles is cut off at the bound', async () => {
    const fake = fakeCrashPathOf({ writeRegistryCrash: () => new Promise(() => undefined), registryBoundMilliseconds: SHORT_REGISTRY_BOUND_MILLISECONDS });
    expect((await CrashPath.record(fake.context, OVERSEER_CRASH)).registry).toBe('cut-off');
  });

  test('a registry write that fails is logged, and the path still settles', async () => {
    const fake = fakeCrashPathOf({ writeRegistryCrash: () => Promise.reject(new Error('example registry failure')) });
    expect((await CrashPath.record(fake.context, OVERSEER_CRASH)).registry).toBe('failed');
    expect(fake.logLines.some((line) => line.includes('example registry failure'))).toBe(true);
  });

  test('a crash log already there is kept', async () => {
    await CrashPath.record(fakeCrashPathOf().context, OVERSEER_CRASH);
    const firstText = readFileSync(CrashLog.pathOf(files, 4), 'utf8');
    const outcome = await CrashPath.record(fakeCrashPathOf().context, { component: 'talos', error: null });
    expect(outcome.crashLog).toBe('already-exists');
    expect(readFileSync(CrashLog.pathOf(files, 4), 'utf8')).toBe(firstText);
  });

  test('an input that throws leaves its part null, and a renewal stop that throws is logged, never thrown', async () => {
    const fake = fakeCrashPathOf({
      activeJobs:       () => { throw new Error('example unreadable board'); },
      stopLeaseRenewal: () => { throw new Error('example renewal failure'); },
    });
    const outcome = await CrashPath.record(fake.context, OVERSEER_CRASH);
    expect(outcome.crashLog).toBe('created');
    expect(storedCrashLog().activeJobs).toBeNull();
    expect(fake.logLines.some((line) => line.includes('example renewal failure'))).toBe(true);
  });

  test('a newer generation\'s presence is never given the crashed ending, and the log names no process of it', async () => {
    const fake = fakeCrashPathOf({ generation: 3 });
    const outcome = await CrashPath.record(fake.context, OVERSEER_CRASH);
    expect(outcome.presence).toBe('not-this-generation');
    expect(storedPresence().ending).toBeNull();
    const reading = CrashLog.read(files, 3);
    expect(reading.verdict === 'read' ? reading.record.crashedProcess : 'unread').toBeNull();
  });
});
