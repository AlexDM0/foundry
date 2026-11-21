/**
 * The crash logs in a scratch board folder. What matters: an assembled log keeps every input, and an input that could not be read stays `null`
 * rather than reading as empty; a crash log is never rewritten, so a second writer of the same crash leaves the first byte for byte; a crash
 * of a Baton generation that came round again gets a number of its own, one above the highest on disk; the log tail keeps only the last
 * lines of a long log; listing ignores every other file; a read is a verdict, never a throw.
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
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
import { hephaestusFilesIn, type HephaestusFiles }                   from './HephaestusFiles.ts';
import { CRASH_LOG_FORMAT_VERSION, CRASH_LOG_TAIL_READ_BOUND_BYTES } from './constants/PresenceLimits.ts';

const PRESENCE: PresenceRecord = {
  presenceVersion:     2,
  generation:          4,
  process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
  codeVersion:         'example-code',
  startOrigin:         'successor',
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
    component:         'hephaestus',
    suspected:         false,
    classification:    null,
    recordedAt:        '2026-11-19T09:03:10.000+01:00',
    recordedBy:        { generation: 4, startOrigin: 'successor', crashPath: true },
    error:             CrashLog.errorOf('uncaught-exception', new TypeError('example failure')),
    presence:          PRESENCE,
    batonHolder:       null,
    heartbeat:         HEARTBEAT,
    activeJobs:        [CrashLog.activeJobOf(JOB)],
    talosChildren:     [{ state: 'running', instance: 2 }],
    logTail:           ['first line', 'last line'],
    ...overrides,
  };
}

let boardFolder = '';
let files: HephaestusFiles = hephaestusFilesIn('');

beforeEach(() => {
  boardFolder = createScratchDirectory('crash-log');
  files = hephaestusFilesIn(boardFolder);
  mkdirSync(files.hephaestusDirectory);
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
      component:         'hephaestus',
      suspected:         false,
      classification:    null,
      recordedAt:        '2026-11-19T09:03:10.000+01:00',
      recordedBy:        { generation: 4, startOrigin: 'successor', crashPath: true },
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
  test('the first crash log is number 1, and the same crash written again answers already-written and leaves it byte for byte', () => {
    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()))).toEqual({ verdict: 'written', crashLogNumber: 1 });
    const firstText = readFileSync(CrashLog.pathOf(files, 1), 'utf8');
    const again = CrashLog.writeOnce(files, CrashLog.assemble(inputsOf({ logTail: ['a later, shorter tail'], error: null })));
    expect(again).toEqual({ verdict: 'already-written', crashLogNumber: 1 });
    expect(readFileSync(CrashLog.pathOf(files, 1), 'utf8')).toBe(firstText);
    expect(CrashLog.list(files)).toEqual([1]);
  });

  test('a crash of a generation that came round again, by another process, gets a number of its own and keeps the generation inside', () => {
    CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()));
    const laterRun = { ...PRESENCE, process: { ...PRESENCE.process, processId: 4343, startStamp: '1700009000' } };

    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf({ presence: laterRun })))).toEqual({ verdict: 'written', crashLogNumber: 2 });

    const reading = CrashLog.read(files, 2);
    expect(reading.verdict === 'read' ? reading.record : null).toMatchObject({ crashedGeneration: 4, crashedProcess: { processId: 4343 } });
  });

  test('numbers rise from the highest log on disk: removing an older one frees no number, and an emptied folder starts again at 1', () => {
    for (const processId of [1001, 1002]) {
      CrashLog.writeOnce(files, CrashLog.assemble(inputsOf({ presence: { ...PRESENCE, process: { ...PRESENCE.process, processId } } })));
    }
    rmSync(CrashLog.pathOf(files, 1));
    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()))).toEqual({ verdict: 'written', crashLogNumber: 3 });

    for (const crashLogNumber of CrashLog.list(files)) rmSync(CrashLog.pathOf(files, crashLogNumber));
    expect(CrashLog.writeOnce(files, CrashLog.assemble(inputsOf()))).toEqual({ verdict: 'written', crashLogNumber: 1 });
  });

  test('with no presence record, the dead Baton\'s holder names the crashed process', () => {
    const batonHolder = { processId: 5151, startStamp: '1700000100', bootIdentity: 'example-boot' };
    expect(CrashLog.assemble(inputsOf({ presence: null, batonHolder })).crashedProcess).toEqual(batonHolder);
  });

  test('a written log reads back as itself', () => {
    const record = CrashLog.assemble(inputsOf());
    CrashLog.writeOnce(files, record);
    expect(CrashLog.read(files, 1)).toEqual({ verdict: 'read', record: JSON.parse(JSON.stringify(record)) });
  });

  test('a missing log reads as absent, and a malformed one, or one naming no generation, as unreadable', () => {
    expect(CrashLog.read(files, 9)).toEqual({ verdict: 'absent' });
    mkdirSync(files.crashLogDirectory, { recursive: true });
    writeFileSync(CrashLog.pathOf(files, 5), 'not json');
    expect(CrashLog.read(files, 5).verdict).toBe('unreadable');
    writeFileSync(CrashLog.pathOf(files, 6), JSON.stringify({ ...CrashLog.assemble(inputsOf()), crashedGeneration: 'four' }));
    expect(CrashLog.read(files, 6)).toEqual({ verdict: 'unreadable', reason: 'crashedGeneration is not a generation or null' });
  });
});

describe('listing the crash logs', () => {
  test('lists every number ascending and ignores a file of another name', () => {
    expect(CrashLog.list(files)).toEqual([]);
    mkdirSync(files.crashLogDirectory, { recursive: true });
    for (const crashLogNumber of [12, 3, 7]) writeFileSync(CrashLog.pathOf(files, crashLogNumber), '{}');
    for (const name of ['crash-0.json', 'crash-4.json.1234.tmp', 'notes.txt', 'crash-x.json']) writeFileSync(join(files.crashLogDirectory, name), '{}');
    expect(CrashLog.list(files)).toEqual([3, 7, 12]);
  });
});

describe('the tail of the Hephaestus log', () => {
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
