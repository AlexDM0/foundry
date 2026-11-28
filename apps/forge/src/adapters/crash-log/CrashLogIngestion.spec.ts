/**
 * A crash log both ways, and a Talos child record copied into one. What matters: the writer's log reads back as the same record and is never
 * written over; a missing log is absent; not JSON, another or no `crashLogVersion`, and each wrong field are unreadable with a reason; a child
 * record is copied as stored, parsed where it is JSON and its text where it is not; nothing throws.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { CrashLogRecord }                            from './@types/CrashLogRecord.ts';
import { CrashLogIngestion }                              from './CrashLogIngestion.ts';
import { CrashLogProblemWording }                         from './CrashLogProblemWording.ts';
import { createCrashLogWriter }                           from './CrashLogWriter.ts';
import { TalosChildRecordCopy }                           from './TalosChildRecordCopy.ts';

const RECORD: CrashLogRecord = {
  crashLogVersion:   2,
  crashedGeneration: 4,
  component:         'hephaestus',
  suspected:         false,
  classification:    null,
  recordedAt:        '2026-11-19T09:30:00.000+01:00',
  recordedBy:        { generation: 4, startOrigin: 'user', crashPath: true },
  crashedProcess:    { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
  codeVersion:       'example-code',
  startedAt:         '2026-11-19T09:00:00.000+01:00',
  lastHeartbeat:     { sequence: 12, at: '2026-11-19T09:29:45.000+01:00' },
  error:             {
    origin: 'uncaught-exception', name: 'Error', message: 'example failure', stack: null
  },
  activeJobs: [{
    jobId:         'J7',
    kind:          'build',
    role:          'builder',
    ticketIds:     ['004'],
    state:         'running',
    interruption:  null,
    instance:      2,
    airlockPhase:  null,
    eventSequence: 31,
  }],
  talosChildren: [{ state: 'running' }, 'example text that was no JSON'],
  logTail:       ['example line'],
};

let scratchDirectory = '';

const crashLogFilePath = (): string => join(scratchDirectory, 'crash-1.json');

const reading = (): ReturnType<CrashLogIngestion['read']> => new CrashLogIngestion(crashLogFilePath()).read();

/** The reading with its problem worded, as User reads it. */
function wordedReadingOf(read: ReturnType<CrashLogIngestion['read']>): object {
  return read.verdict === 'unreadable' ? { verdict: read.verdict, reason: CrashLogProblemWording.sentenceOf(read.problem) } : read;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('crash-log-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('what the writer creates reads back as the same record, and a second creation leaves the first log as it is', () => {
  expect(createCrashLogWriter(crashLogFilePath()).create(RECORD)).toBe('created');
  const firstText = readFileSync(crashLogFilePath(), 'utf8');

  expect(createCrashLogWriter(crashLogFilePath()).create({ ...RECORD, logTail: null })).not.toBe('created');
  expect(readFileSync(crashLogFilePath(), 'utf8')).toBe(firstText);
  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
});

test('a missing log is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('a log that is not JSON is unreadable', () => {
  writeFileSync(crashLogFilePath(), 'not json');

  expect(reading()).toMatchObject({ verdict: 'unreadable', problem: { code: 'not-json' } });
});

test.each([
  ['another version', { crashLogVersion: 1 }, 'its crashLogVersion is not 2'],
  ['no version', { crashLogVersion: undefined }, 'its crashLogVersion is not 2'],
  ['a generation that is no number', { crashedGeneration: 'four' }, 'crashedGeneration is not a generation or null'],
  ['an unknown component', { component: 'example-component' }, 'component is not a crashed component'],
  ['a suspicion that is no flag', { suspected: 'no' }, 'suspected is not a flag'],
  ['a classification of an unknown kind', { classification: { kind: 'example-kind' } }, 'classification is neither null nor a start classification'],
  ['no time of recording', { recordedAt: undefined }, 'recordedAt is not a string'],
  ['a recorder of an unknown origin', { recordedBy: { generation: null, startOrigin: 'example-origin', crashPath: false } }, 'recordedBy is not who recorded the crash'],
  ['a crashed process with no identity', { crashedProcess: { processId: 4242 } }, 'crashedProcess is neither null nor a process identity'],
  ['a code version that is no text', { codeVersion: 7 }, 'codeVersion and startedAt are each a string or null'],
  ['a beat with no sequence', { lastHeartbeat: { at: '2026-11-19T09:29:45.000+01:00' } }, 'lastHeartbeat is neither null nor a beat'],
  ['an error of an unknown origin', { error: { ...RECORD.error, origin: 'example-origin' } }, 'error is neither null nor a crash error'],
  ['a job with no id', { activeJobs: [{ ...RECORD.activeJobs?.[0], jobId: undefined }] }, 'activeJobs is neither null nor a list of jobs'],
  ['children that are no list', { talosChildren: {} }, 'talosChildren is neither null nor a list'],
  ['a tail line that is no text', { logTail: [7] }, 'logTail is neither null nor a list of lines'],
])('%s is unreadable', (_case, changes, reason) => {
  writeFileSync(crashLogFilePath(), JSON.stringify({ ...RECORD, ...changes }));

  expect(wordedReadingOf(reading())).toEqual({ verdict: 'unreadable', reason });
});

test('a child record is copied as stored: parsed where it is JSON, its text where it is not, and nothing where none was written', () => {
  const childRecordFilePath = join(scratchDirectory, 'child-1.json');
  const copy = (): ReturnType<TalosChildRecordCopy['read']> => new TalosChildRecordCopy(childRecordFilePath).read();
  expect(copy()).toEqual({ verdict: 'absent' });

  writeFileSync(childRecordFilePath, '{"formatVersion":1,"state":"running"}');
  expect(copy()).toEqual({ verdict: 'readable', copy: { formatVersion: 1, state: 'running' } });

  writeFileSync(childRecordFilePath, '{"formatVersion":1,');
  expect(copy()).toEqual({ verdict: 'readable', copy: '{"formatVersion":1,' });
});
