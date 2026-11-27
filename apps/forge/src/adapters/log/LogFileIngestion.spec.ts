/**
 * The log is read strictly, like progress.json: a missing file is an empty log, never an unreadable one; blank lines are no records;
 * and any other line that is not a well-formed record makes the whole file unreadable, naming the file, its 1-based line and the field,
 * because a person repairs it by hand from that reason alone. A field added later as optional, such as `job-launched`'s `intakeText`,
 * `entity` or `stage`, leaves a line stored before it readable.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { afterAll, expect, test }                 from 'bun:test';

import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { LogFileReading }                            from './@types/StoredLog.ts';
import { LogFileIngestion }                               from './LogFileIngestion.ts';
import { LogFileProblemWording }                          from './LogFileProblemWording.ts';

const FILED_AT   = '2026-09-18T20:30:00+02:00';
const STARTED_AT = '2026-09-18T20:40:00+02:00';

const FILED: LogRecord = {
  at:       FILED_AT,
  kind:     'ticket-filed',
  ticketId: '003',
  fields:   { title: 'Example checkout flow' },
};

const STARTED: LogRecord = {
  at:       STARTED_AT,
  kind:     'ticket-started',
  ticketId: '003',
  fields:   {},
};

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchLogFilePath(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return join(directory, 'log.jsonl');
}

function readBack(prefix: string, text: string): { logFilePath: string; reading: LogFileReading } {
  const logFilePath = scratchLogFilePath(prefix);
  writeFileSync(logFilePath, text);
  return { logFilePath, reading: new LogFileIngestion(logFilePath).read() };
}

function reasonOf(reading: LogFileReading): string {
  return reading.verdict === 'unreadable' ? LogFileProblemWording.sentenceOf(reading.problem) : `a ${reading.verdict} log`;
}

test('a missing log.jsonl is absent, not unreadable', () => {
  expect(new LogFileIngestion(scratchLogFilePath('log-absent')).read()).toEqual({ verdict: 'absent' });
});

test('an empty file is a readable log with no records', () => {
  expect(readBack('log-empty', '').reading).toEqual({ verdict: 'readable', records: [] });
});

test('records come back in file order', () => {
  const { reading } = readBack('log-order', `${JSON.stringify(FILED)}\n${JSON.stringify(STARTED)}\n`);
  expect(reading).toEqual({ verdict: 'readable', records: [FILED, STARTED] });
});

test('blank and whitespace-only lines are skipped, and a last line without a newline still reads', () => {
  const { reading } = readBack('log-blank-lines', `\n${JSON.stringify(FILED)}\n   \n\t\n${JSON.stringify(STARTED)}`);
  expect(reading).toEqual({ verdict: 'readable', records: [FILED, STARTED] });
});

test('a malformed record makes the file unreadable, naming the file, its 1-based line and the field', () => {
  const malformed = JSON.stringify({ at: STARTED_AT, kind: 'note', fields: { text: 7 } });
  const { logFilePath, reading } = readBack('log-bad-field', `${JSON.stringify(FILED)}\n\n${malformed}\n`);
  expect(reading.verdict).toBe('unreadable');
  expect(reasonOf(reading)).toBe(`${logFilePath}, line 3: fields.text is not a string`);
});

test('a line that is not JSON makes the file unreadable and says so', () => {
  const { logFilePath, reading } = readBack('log-not-json', `${JSON.stringify(FILED)}\n{ this is not json\n`);
  expect(reasonOf(reading)).toStartWith(`${logFilePath}, line 2: it is not valid JSON (`);
});

test('a directory where the file should be is unreadable, never absent', () => {
  const logFilePath = scratchLogFilePath('log-directory');
  mkdirSync(logFilePath);
  const reading = new LogFileIngestion(logFilePath).read();
  expect(reading.verdict).toBe('unreadable');
  expect(reasonOf(reading)).toStartWith(`${logFilePath}: it could not be read (`);
});

test('a read leaves the file byte for byte, a hand-spaced line included', () => {
  const text = `${JSON.stringify(FILED, null, 1).replaceAll('\n', '')}\n\n`;
  const { logFilePath, reading } = readBack('log-read-only', text);
  expect(reading.verdict).toBe('readable');
  expect(readFileSync(logFilePath, 'utf8')).toBe(text);
});

test('a product-owner launch stored before intakeText existed still reads, and one stored with it reads it back', () => {
  const fields = {
    kind: 'product-owner', role: 'product-owner', ticketIds: [], attempt: 1, target: null, parentJobId: null
  } as const;
  const older: LogRecord    = {
    at: STARTED_AT, kind: 'job-launched', jobId: 'J3', fields: { ...fields, ticketIds: [] }
  };
  const withText: LogRecord = {
    at: STARTED_AT, kind: 'job-launched', jobId: 'J3', fields: { ...fields, ticketIds: [], intakeText: 'Alex Example asks for a basket.' }
  };
  const { reading } = readBack('log-intake-text', `${JSON.stringify(older)}\n${JSON.stringify(withText)}\n`);
  expect(reading).toEqual({ verdict: 'readable', records: [older, withText] });
});

test('a launch stored without entity and stage reads back without them, and one stored with them reads them back', () => {
  const fields = {
    kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
  } as const;
  const withoutStage: LogRecord = {
    at: STARTED_AT, kind: 'job-launched', jobId: 'J4', fields: { ...fields, ticketIds: ['001'] }
  };
  const withStage: LogRecord = {
    at:     STARTED_AT,
    kind:   'job-launched',
    jobId:  'J5',
    fields: {
      ...fields, ticketIds: ['001'], entity: 'shop', stage: 1
    }
  };
  const text = `${JSON.stringify(withoutStage)}\n${JSON.stringify(withStage)}\n`;
  const { logFilePath, reading } = readBack('log-launch-stage', text);
  expect(reading).toEqual({ verdict: 'readable', records: [withoutStage, withStage] });
  expect(readFileSync(logFilePath, 'utf8')).toBe(text);
  const firstFields = reading.verdict === 'readable' ? reading.records[0]?.fields : undefined;
  expect(Object.keys(firstFields ?? {})).toEqual(['kind', 'role', 'ticketIds', 'attempt', 'target', 'parentJobId']);
});

test('a start classification and a resume instruction read back as stored, the start\'s optional fields only where written', () => {
  const firstStart: LogRecord = { at: STARTED_AT, kind: 'start-classified', fields: { kind: 'first-start', startOrigin: 'user' } };
  const suspectedCrash: LogRecord = {
    at:     STARTED_AT,
    kind:   'start-classified',
    fields: {
      kind: 'machine-went-down', startOrigin: 'successor', previousGeneration: 2, crashSuspected: true, crashLogNumber: 2
    }
  };
  const resumeInstructed: LogRecord = {
    at: STARTED_AT, kind: 'job-resume-instructed', jobId: 'J4', fields: { childInstance: 3 }
  };
  const text = `${[firstStart, suspectedCrash, resumeInstructed].map((record) => JSON.stringify(record)).join('\n')}\n`;
  const { logFilePath, reading } = readBack('log-start-and-resume', text);
  expect(reading).toEqual({ verdict: 'readable', records: [firstStart, suspectedCrash, resumeInstructed] });
  expect(readFileSync(logFilePath, 'utf8')).toBe(text);
  const firstFields = reading.verdict === 'readable' ? reading.records[0]?.fields : undefined;
  expect(Object.keys(firstFields ?? {})).toEqual(['kind', 'startOrigin']);
});
