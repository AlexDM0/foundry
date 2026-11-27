/**
 * The tracker's log is log.jsonl alone: beside a progress.json, any log.jsonl comes back as its own records, an absent one as empty and an
 * unreadable one with its own problem.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createLogFileWriter }                            from '../../adapters/log/LogFileWriter.ts';
import { createProgressFileWriter }                       from '../../adapters/progress/ProgressFileWriter.ts';
import type { LogRecord }                                 from '../../domain/tracker-model/@types/LogRecord.ts';
import { emptyProgress }                                  from '../../testing/ProgressFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { localStoreLayoutOf }                             from './LocalStoreLayout.ts';
import { readTracker, type TrackerReading }               from './TrackerReader.ts';
import { workspacePathsFor, type Workspace }              from './Workspace.ts';

const NOTE: LogRecord = { at: '2026-09-18T20:30:00+02:00', kind: 'note', fields: { text: 'Example note naming #001' } };

const FINISHED_RECORD: LogRecord = {
  at:       '2026-09-18T21:00:00+02:00',
  kind:     'ticket-finished',
  ticketId: '001',
  fields:   {},
};

let workspace: Workspace;

function writeVersionTwoProgressFile(): void {
  createProgressFileWriter(localStoreLayoutOf(workspace).progressRecordPath).write(emptyProgress());
}

function storedLogOrVerdictOf(reading: TrackerReading): unknown {
  return reading.verdict === 'readable' ? reading.contents.storedLog : reading;
}

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('tracker-reader-log-file'));
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
  writeVersionTwoProgressFile();
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

test('a readable log.jsonl comes back as its records, whatever they hold', () => {
  for (const records of [[], [NOTE], [FINISHED_RECORD], [FINISHED_RECORD, NOTE], [NOTE, NOTE, FINISHED_RECORD]]) {
    createLogFileWriter(localStoreLayoutOf(workspace).logRecordPath).write(records);
    expect(storedLogOrVerdictOf(readTracker(workspace)), JSON.stringify(records)).toEqual({ records });
  }
});

test('an absent log.jsonl is an empty log', () => {
  expect(storedLogOrVerdictOf(readTracker(workspace))).toEqual({ records: [] });
});

test('an unreadable log.jsonl keeps its own problem, which names the log file and no progress file', () => {
  writeFileSync(localStoreLayoutOf(workspace).logRecordPath, 'not JSON\n');

  const reading = readTracker(workspace);
  const problem = reading.verdict === 'unreadable' && reading.unreadableFile === 'log-file' ? reading.problem : null;

  expect(problem).toMatchObject({ code: 'not-json', logFilePath: localStoreLayoutOf(workspace).logRecordPath, lineNumber: 1 });
});
