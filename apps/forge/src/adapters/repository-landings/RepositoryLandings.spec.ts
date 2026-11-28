/**
 * The journal and the tracker list are read by trackers of other forge releases, so each case pins a stored byte or a verdict: the
 * versioned line format, lines a reader skips without losing the rest, an append that keeps every stored line, and a tracker list that
 * keeps unknown keys and is never written over when it is newer or malformed, since another tracker's entry would be lost.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { RepositoryLanding, RepositoryLandingFiles } from './RepositoryLandings.ts';
import { RepositoryLandings }                             from './RepositoryLandings.ts';

const EXAMPLE_FOLDER_NAME = 'example-product';

const FIRST_LANDING: RepositoryLanding = {
  trackerId:   'tracker-example-one',
  target:      'main',
  previousTip: '1111111111111111111111111111111111111111',
  commit:      '2222222222222222222222222222222222222222',
};

const SIBLING_LANDING: RepositoryLanding = {
  trackerId:   'tracker-example-two',
  target:      'main',
  previousTip: '2222222222222222222222222222222222222222',
  commit:      '3333333333333333333333333333333333333333',
};

const GROUP_LANDING: RepositoryLanding = {
  trackerId:   'tracker-example-two',
  target:      'example/group-alpha',
  previousTip: '4444444444444444444444444444444444444444',
  commit:      '5555555555555555555555555555555555555555',
};

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function freshLandingFiles(): RepositoryLandingFiles {
  const gitCommonDirectory = createScratchDirectory('repository-landings');
  scratchDirectories.push(gitCommonDirectory);
  return RepositoryLandings.landingFilesOf(gitCommonDirectory, EXAMPLE_FOLDER_NAME);
}

function storedLines(files: RepositoryLandingFiles, lines: readonly string[]): void {
  mkdirSync(join(files.journalFilePath, '..'), { recursive: true });
  writeFileSync(files.journalFilePath, lines.join(''));
}

describe('the files', () => {
  test('lie in the named folder of the git common directory', () => {
    expect(RepositoryLandings.landingFilesOf('/example/repository/.git', EXAMPLE_FOLDER_NAME)).toEqual({
      journalFilePath:     join('/example/repository/.git', EXAMPLE_FOLDER_NAME, 'landings.jsonl'),
      lockDirectoryPath:   join('/example/repository/.git', EXAMPLE_FOLDER_NAME, 'landings.lock'),
      trackerListFilePath: join('/example/repository/.git', EXAMPLE_FOLDER_NAME, 'trackers.json'),
    });
  });
});

describe('the landing journal', () => {
  test('reads as no landings while it does not exist', () => {
    expect(RepositoryLandings.readLandingJournal(freshLandingFiles())).toEqual({ verdict: 'readable', landings: [], skippedLines: [] });
  });

  test('stores each landing as one versioned line, version first, in the order they were appended', () => {
    const files = freshLandingFiles();
    expect(RepositoryLandings.appendLanding(files, FIRST_LANDING)).toEqual({ verdict: 'appended' });
    expect(RepositoryLandings.appendLanding(files, SIBLING_LANDING)).toEqual({ verdict: 'appended' });

    // Retake by hand only when the journal's format version changes: a reader of an older release reads these bytes.
    expect(readFileSync(files.journalFilePath, 'utf8')).toBe([
      '{"version":1,"trackerId":"tracker-example-one","target":"main",'
        + '"previousTip":"1111111111111111111111111111111111111111","commit":"2222222222222222222222222222222222222222"}\n',
      '{"version":1,"trackerId":"tracker-example-two","target":"main",'
        + '"previousTip":"2222222222222222222222222222222222222222","commit":"3333333333333333333333333333333333333333"}\n',
    ].join(''));
    expect(RepositoryLandings.readLandingJournal(files)).toEqual({ verdict: 'readable', landings: [FIRST_LANDING, SIBLING_LANDING], skippedLines: [] });
  });

  test('skips and names a line that is not JSON, not a landing or of a newer version, and still reads every other line', () => {
    const files = freshLandingFiles();
    storedLines(files, [
      'not json\n',
      `${JSON.stringify({ ...FIRST_LANDING, version: 1 })}\n`,
      `${JSON.stringify({
        version: 1, trackerId: 'tracker-example-two', target: 'main', commit: '3333333333333333333333333333333333333333'
      })}\n`,
      `${JSON.stringify({ ...SIBLING_LANDING, version: 2 })}\n`,
      `${JSON.stringify({ ...SIBLING_LANDING })}\n`,
      '\n',
      `${JSON.stringify({ ...GROUP_LANDING, version: 1, laterKey: 'kept unread' })}\n`,
    ]);
    expect(RepositoryLandings.readLandingJournal(files)).toEqual({
      verdict:      'readable',
      landings:     [FIRST_LANDING, GROUP_LANDING],
      skippedLines: [
        { lineNumber: 1, problem: 'not-json' },
        { lineNumber: 3, problem: 'not-a-landing' },
        { lineNumber: 4, problem: 'newer-version' },
        { lineNumber: 5, problem: 'not-a-landing' },
      ],
    });
  });

  test('an append keeps every stored line as it is and ends an unterminated last line first', () => {
    const files = freshLandingFiles();
    const newerLine = `${JSON.stringify({ ...SIBLING_LANDING, version: 2 })}\n`;
    const unterminatedLine = JSON.stringify({ ...FIRST_LANDING, version: 1 });
    storedLines(files, [newerLine, unterminatedLine]);

    expect(RepositoryLandings.appendLanding(files, GROUP_LANDING)).toEqual({ verdict: 'appended' });
    const storedText = readFileSync(files.journalFilePath, 'utf8');
    expect(storedText.startsWith(`${newerLine}${unterminatedLine}\n`)).toBe(true);
    expect(RepositoryLandings.readLandingJournal(files)).toEqual({
      verdict:      'readable',
      landings:     [FIRST_LANDING, GROUP_LANDING],
      skippedLines: [{ lineNumber: 1, problem: 'newer-version' }],
    });
  });

  test('a journal that cannot be read is unreadable, and an append to it is unwritable', () => {
    const files = freshLandingFiles();
    mkdirSync(files.journalFilePath, { recursive: true });
    expect(RepositoryLandings.readLandingJournal(files)).toMatchObject({ verdict: 'unreadable' });
    expect(RepositoryLandings.appendLanding(files, FIRST_LANDING)).toMatchObject({ verdict: 'unwritable' });
  });

  test('the tips landed on a target are every tracker\'s, the caller\'s own included, and no other target\'s', () => {
    const landings = [FIRST_LANDING, GROUP_LANDING, SIBLING_LANDING];
    expect(RepositoryLandings.tipsLandedOn(landings, 'main')).toEqual([FIRST_LANDING.commit, SIBLING_LANDING.commit]);
    expect(RepositoryLandings.tipsLandedOn(landings, 'example/group-alpha')).toEqual([GROUP_LANDING.commit]);
    expect(RepositoryLandings.tipsLandedOn(landings, 'example/group-beta')).toEqual([]);
  });
});

describe('the tracker list', () => {
  const ROOT_TRACKER   = { trackerId: 'tracker-example-one', prefix: '', branchNamespace: null };
  const NESTED_TRACKER = { trackerId: 'tracker-example-two', prefix: 'apps/example', branchNamespace: 'example' };

  test('reads as no trackers while it does not exist', () => {
    expect(RepositoryLandings.readTrackerList(freshLandingFiles())).toEqual({ verdict: 'readable', trackers: [] });
  });

  test('stores each tracker under its id in a versioned document, a bare-name tracker with no namespace key', () => {
    const files = freshLandingFiles();
    expect(RepositoryLandings.writeTrackerEntry(files, ROOT_TRACKER)).toEqual({ verdict: 'written' });
    expect(RepositoryLandings.writeTrackerEntry(files, NESTED_TRACKER)).toEqual({ verdict: 'written' });

    expect(JSON.parse(readFileSync(files.trackerListFilePath, 'utf8'))).toEqual({
      version:  1,
      trackers: {
        'tracker-example-one': { prefix: '' },
        'tracker-example-two': { prefix: 'apps/example', branchNamespace: 'example' },
      },
    });
    expect(RepositoryLandings.readTrackerList(files)).toEqual({ verdict: 'readable', trackers: [ROOT_TRACKER, NESTED_TRACKER] });
  });

  test('a tracker written again keeps its place and every key the format does not know, and loses a namespace it no longer has', () => {
    const files = freshLandingFiles();
    mkdirSync(join(files.trackerListFilePath, '..'), { recursive: true });
    writeFileSync(files.trackerListFilePath, JSON.stringify({
      version:  1,
      laterKey: 'kept',
      trackers: {
        'tracker-example-two': { prefix: 'apps/example', branchNamespace: 'example', laterEntryKey: 'kept' },
        'tracker-example-one': { prefix: '' },
      },
    }));

    expect(RepositoryLandings.writeTrackerEntry(files, { trackerId: 'tracker-example-two', prefix: 'apps/moved', branchNamespace: null })).toEqual({ verdict: 'written' });
    expect(JSON.parse(readFileSync(files.trackerListFilePath, 'utf8'))).toEqual({
      version:  1,
      laterKey: 'kept',
      trackers: {
        'tracker-example-two': { laterEntryKey: 'kept', prefix: 'apps/moved' },
        'tracker-example-one': { prefix: '' },
      },
    });
    expect(Object.keys(JSON.parse(readFileSync(files.trackerListFilePath, 'utf8')).trackers)).toEqual(['tracker-example-two', 'tracker-example-one']);
  });

  test('a newer list reads as newer and is never written over', () => {
    const files = freshLandingFiles();
    const newerText = JSON.stringify({ version: 2, trackers: {} });
    mkdirSync(join(files.trackerListFilePath, '..'), { recursive: true });
    writeFileSync(files.trackerListFilePath, newerText);

    expect(RepositoryLandings.readTrackerList(files)).toEqual({ verdict: 'newer-version', version: 2 });
    expect(RepositoryLandings.writeTrackerEntry(files, ROOT_TRACKER)).toEqual({ verdict: 'newer-version', version: 2 });
    expect(readFileSync(files.trackerListFilePath, 'utf8')).toBe(newerText);
  });

  test('a malformed list names its problems, keeps the trackers it could read, and is never written over', () => {
    const files = freshLandingFiles();
    const malformedText = JSON.stringify({
      version:  1,
      trackers: {
        'tracker-example-one':   { prefix: '' },
        'tracker-example-two':   { prefix: 'apps/example', branchNamespace: '' },
        'tracker-example-three': 'not an entry',
      },
    });
    mkdirSync(join(files.trackerListFilePath, '..'), { recursive: true });
    writeFileSync(files.trackerListFilePath, malformedText);

    const reading = RepositoryLandings.readTrackerList(files);
    expect(reading).toMatchObject({ verdict: 'malformed', trackers: [ROOT_TRACKER] });
    expect(reading.verdict === 'malformed' ? reading.problems.length : 0).toBe(2);
    expect(RepositoryLandings.writeTrackerEntry(files, NESTED_TRACKER)).toMatchObject({ verdict: 'malformed' });
    expect(readFileSync(files.trackerListFilePath, 'utf8')).toBe(malformedText);
  });

  test('a list that is not JSON is malformed and never written over', () => {
    const files = freshLandingFiles();
    mkdirSync(join(files.trackerListFilePath, '..'), { recursive: true });
    writeFileSync(files.trackerListFilePath, 'not json');

    expect(RepositoryLandings.readTrackerList(files)).toMatchObject({ verdict: 'malformed', trackers: [] });
    expect(RepositoryLandings.writeTrackerEntry(files, ROOT_TRACKER)).toMatchObject({ verdict: 'malformed' });
    expect(readFileSync(files.trackerListFilePath, 'utf8')).toBe('not json');
  });

  test('a list that cannot be read is unreadable, and a write to it is refused the same way', () => {
    const files = freshLandingFiles();
    mkdirSync(files.trackerListFilePath, { recursive: true });
    expect(RepositoryLandings.readTrackerList(files)).toMatchObject({ verdict: 'unreadable' });
    expect(RepositoryLandings.writeTrackerEntry(files, ROOT_TRACKER)).toMatchObject({ verdict: 'unreadable' });
  });
});
