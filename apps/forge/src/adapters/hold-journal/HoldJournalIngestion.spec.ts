/**
 * The journal's stored format both ways. What matters: the writer's file reads back as the same files; paths are stored relative to the
 * data folder and one that would leave it is malformed, since replay writes wherever a path points; and nothing malformed ever throws.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, win32 }                            from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { HoldJournalIngestion, type JournaledFile }       from './HoldJournalIngestion.ts';
import { HoldJournalProblemWording }                      from './HoldJournalProblemWording.ts';
import { createHoldJournalWriter }                        from './HoldJournalWriter.ts';

let scratchDirectory: string | null = null;

let dataDirectory = '';

const journalFilePath = (): string => join(dataDirectory, 'hold-journal.json');

const reading = (): ReturnType<HoldJournalIngestion['read']> => new HoldJournalIngestion(journalFilePath(), dataDirectory).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('hold-journal-ingestion');
  dataDirectory = join(scratchDirectory, 'data');
  mkdirSync(dataDirectory, { recursive: true });
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same files, with paths stored relative to the data folder', () => {
  const files: JournaledFile[] = [
    { kind: 'written', filePath: join(dataDirectory, 'progress.json'), contents: '{}\n' },
    { kind: 'removed', filePath: join(dataDirectory, 'tickets', '002-example.md') },
  ];

  createHoldJournalWriter(journalFilePath(), dataDirectory).write(files);

  expect(reading()).toEqual({ verdict: 'readable', files });
  expect(JSON.parse(readFileSync(journalFilePath(), 'utf8'))).toEqual({
    version: 1,
    files:   [{ path: 'progress.json', contents: '{}\n' }, { path: 'tickets/002-example.md', removed: true }],
  });
});

test('a Windows relative path is stored with forward slashes, so the reader takes what the writer stored there', () => {
  const windowsDataDirectory = 'C:\\Users\\Alex Example\\.agent-progress';
  const files: JournaledFile[] = [
    { kind: 'written', filePath: win32.join(windowsDataDirectory, 'progress.json'), contents: '{}\n' },
    { kind: 'removed', filePath: win32.join(windowsDataDirectory, 'tickets', '002-example.md') },
  ];

  createHoldJournalWriter(journalFilePath(), windowsDataDirectory, win32).write(files);

  expect(reading()).toEqual({
    verdict: 'readable',
    files:   [
      { kind: 'written', filePath: join(dataDirectory, 'progress.json'), contents: '{}\n' },
      { kind: 'removed', filePath: join(dataDirectory, 'tickets', '002-example.md') },
    ],
  });
});

test.each([
  ['a backslash path', '{"version":1,"files":[{"path":"tickets\\\\002-example.md","contents":""}]}', 'files[0].path is not a path inside the data folder'],
  ['a drive-relative path', '{"version":1,"files":[{"path":"C:foo","contents":""}]}', 'files[0].path is not a path inside the data folder'],
  ['a drive-rooted path', '{"version":1,"files":[{"path":"C:/example","contents":""}]}', 'files[0].path is not a path inside the data folder'],
  ['not JSON', '{', 'it is not valid JSON'],
  ['another version', '{"version":2,"files":[]}', 'its version is not 1'],
  ['a path leaving the data folder', '{"version":1,"files":[{"path":"tickets/../../outside.md","contents":""}]}', 'files[0].path is not a path inside the data folder'],
  ['an absolute path', '{"version":1,"files":[{"path":"/etc/example","contents":""}]}', 'files[0].path is not a path inside the data folder'],
  ['both contents and removed', '{"version":1,"files":[{"path":"log.jsonl","contents":"","removed":true}]}', 'files[0] holds neither a string "contents" nor "removed": true'],
  ['an entry that is not an object', '{"version":1,"files":[5]}', 'files[0] is not an object'],
])('%s is malformed, never a throw', (_case, storedText, reason) => {
  writeFileSync(journalFilePath(), storedText);

  const journalReading = reading();

  expect(journalReading.verdict).toBe('malformed');
  expect(journalReading.verdict === 'malformed' ? HoldJournalProblemWording.sentenceOf(journalReading.problem) : '').toContain(reason);
});
