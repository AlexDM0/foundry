/**
 * The crash logs in a scratch board folder. What matters: an assembled log keeps every input, and an input that could not be read stays `null`
 * rather than reading as empty; a crash log is never rewritten, so a racing second writer leaves the first byte for byte; the log tail keeps only
 * the last lines of a long log; listing ignores every other file; a read is a verdict, never a throw.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                                  from '../../lib/tracker-model/@types/Job.ts';
import { createScratchDirectory, removeScratchDirectory }            from '../../testing/ScratchWorkspace.ts';
import type { CrashLogInputs }                                       from './@types/CrashLogRecord.ts';
import type { HeartbeatRecord, PresenceRecord }                      from './@types/PresenceRecord.ts';
import { CrashLog }                                                  from './CrashLog.ts';
import { overseerFilesIn, type OverseerFiles }                       from './OverseerFiles.ts';
import { CRASH_LOG_FORMAT_VERSION, CRASH_LOG_TAIL_READ_BOUND_BYTES } from './constants/PresenceLimits.ts';

const PRESENCE: PresenceRecord = {
  presenceVersion:     1,
  generation:          4,
  process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
  codeVersion:         'example-code',
  startOrigin:         'login-item',
  startedAt:           '2026-11-19T09:00:00.000+01:00',
  startClassification: null,
  abandonedPasses:     { inARow: 0, last: null },
  ending:              null,
};

const HEARTBEAT: HeartbeatRecord = {
  heartbeatVersion: 1, generation: 4, sequence: 12, at: '2026-11-19T09:03:00.000+01:00'
};

const JOB = {
  id:                 'J7',
  kind:               'build',
  role:               'builder',
  ticketIds:          ['004'],
  parentJobId:        null,
  attempt:            1,
  target:             'main',
  state:              'running',
  interruption:       'talos-paused',
  childInstance:      2,
  eventCursor:        { instance: 2, sequence: 31 },
  answeredRequestIds: [],
  crashResumes:       0,
  airlock:            {
    target: 'main', targetTip: 'example-target-tip', branchTip: 'example-branch-tip', phase: 'gating'
  },
} as unknown as Job;

function inputsOf(overrides: Partial<CrashLogInputs> = {}): CrashLogInputs {
  return {
    crashedGeneration: 4,
    component:         'overseer',
    suspected:         false,
    classification:    null,
    recordedAt:        '2026-11-19T09:03:10.000+01:00',
    recordedBy:        { generation: 4, startOrigin: 'login-item', crashPath: true },
    error:             CrashLog.errorOf('uncaught-exception', new TypeError('example failure')),
    presence:          PRESENCE,
    heartbeat:         HEARTBEAT,
    activeJobs:        [CrashLog.activeJobOf(JOB)],
    talosChildren:     [{ state: 'running', instance: 2 }],
    logTail:           ['first line', 'last line'],
    ...overrides,
  };
}

let boardFolder = '';
let files: OverseerFiles = overseerFilesIn('');

beforeEach(() => {
  boardFolder = createScratchDirectory('crash-log');
  files = overseerFilesIn(boardFolder);
  mkdirSync(files.overseerDirectory);
});

afterEach(() => {
  removeScratchDirectory(boardFolder);
});

describe('assembling a crash log', () => {
  test('an assembled log holds each input', () => {
    const record = CrashLog.assemble(inputsOf());
    expect(record).toEqual({
      crashLogVersion:   CRASH_LOG_FORMAT_VERSION,
      crashedGeneration: 4,
      component:         'overseer',
      suspected:         false,
      classification:    null,
      recordedAt:        '2026-11-19T09:03:10.000+01:00',
      recordedBy:        { generation: 4, startOrigin: 'login-item', crashPath: true },
      crashedProcess:    PRESENCE.process,
      codeVersion:       'example-code',
      startedAt:         '2026-11-19T09:00:00.000+01:00',
      lastHeartbeat:     { sequence: 12, at: '2026-11-19T09:03:00.000+01:00' },
      error:             expect.objectContaining({ origin: 'uncaught-exception', name: 'TypeError', message: 'example failure' }),
      activeJobs:        [{
        jobId:         'J7',
        kind:          'build',
        role:          'builder',
        ticketIds:     ['004'],
        state:         'running',
        interruption:  'talos-paused',
        instance:      2,
        airlockPhase:  'gating',
        eventSequence: 31,
      }],
      talosChildren: [{ state: 'running', instance: 2 }],
      logTail:       ['first line', 'last line'],
    });
    expect(record.error?.stack).toContain('example failure');
  });

  test('an input that could not be read is kept null, never read as empty', () => {
    const record = CrashLog.assemble(inputsOf({
      error: null, presence: null, heartbeat: null, activeJobs: null, talosChildren: null, logTail: null
    }));
    expect(record).toMatchObject({
      error:          null,
      crashedProcess: null,
      codeVersion:    null,
      startedAt:      null,
      lastHeartbeat:  null,
      activeJobs:     null,
      talosChildren:  null,
      logTail:        null,
    });
  });

  test('a thrown value that is not an error keeps its text and no stack', () => {
    expect(CrashLog.errorOf('unhandled-rejection', 'example reason')).toEqual({
      origin: 'unhandled-rejection', name: 'string', message: 'example reason', stack: null
    });
  });
});

describe('writing a crash log once', () => {
  test('the second write of a generation answers already-exists and leaves the first file byte for byte', () => {
    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()))).toBe('created');
    const firstText = readFileSync(CrashLog.pathOf(files, 4), 'utf8');
    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf({ logTail: ['a later, shorter tail'], error: null })))).toBe('already-exists');
    expect(readFileSync(CrashLog.pathOf(files, 4), 'utf8')).toBe(firstText);
  });

  test('a written log reads back as itself', () => {
    const record = CrashLog.assemble(inputsOf());
    CrashLog.writeOnce(files, record);
    expect(CrashLog.read(files, 4)).toEqual({ verdict: 'read', record: JSON.parse(JSON.stringify(record)) });
  });

  test('a missing log reads as absent, and a malformed or misnamed one as unreadable', () => {
    expect(CrashLog.read(files, 9)).toEqual({ verdict: 'absent' });
    mkdirSync(files.crashLogDirectory, { recursive: true });
    writeFileSync(CrashLog.pathOf(files, 5), 'not json');
    expect(CrashLog.read(files, 5).verdict).toBe('unreadable');
    CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()));
    writeFileSync(CrashLog.pathOf(files, 6), readFileSync(CrashLog.pathOf(files, 4), 'utf8'));
    expect(CrashLog.read(files, 6)).toEqual({ verdict: 'unreadable', reason: 'crashedGeneration is not 6' });
  });
});

describe('listing the crash logs', () => {
  test('lists every generation ascending and ignores a file of another name', () => {
    expect(CrashLog.list(files)).toEqual([]);
    for (const generation of [12, 3, 7]) CrashLog.writeOnce(files, CrashLog.assemble(inputsOf({ crashedGeneration: generation })));
    for (const name of ['crash-0.json', 'crash-4.json.1234.tmp', 'notes.txt', 'crash-x.json']) writeFileSync(join(files.crashLogDirectory, name), '{}');
    expect(CrashLog.list(files)).toEqual([3, 7, 12]);
  });
});

describe('the tail of the Overseer log', () => {
  test('keeps the last lines of a log longer than the bound', () => {
    const lines = Array.from({ length: 50 }, (_unused, index) => `line ${index + 1}`);
    writeFileSync(files.logFilePath, `${lines.join('\n')}\n`);
    expect(CrashLog.logTailOf(files.logFilePath, 5)).toEqual(['line 46', 'line 47', 'line 48', 'line 49', 'line 50']);
  });

  test('keeps all of a shorter log, its last line kept also without a line end', () => {
    writeFileSync(files.logFilePath, 'line 1\nline 2\nline 3');
    expect(CrashLog.logTailOf(files.logFilePath, 5)).toEqual(['line 1', 'line 2', 'line 3']);
  });

  test('a log larger than the read bound is read only from its end, and the line the bound cut into is left out', () => {
    const cutLine = 'x'.repeat(CRASH_LOG_TAIL_READ_BOUND_BYTES);
    writeFileSync(files.logFilePath, `first line\n${cutLine}\nline 2\nline 3\n`);
    expect(CrashLog.logTailOf(files.logFilePath, 5)).toEqual(['line 2', 'line 3']);
  });

  test('a log that cannot be read gives no tail rather than a throw', () => {
    expect(CrashLog.logTailOf(join(boardFolder, 'absent.log'))).toBeNull();
  });
});
