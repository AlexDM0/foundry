/**
 * The redo journal on real files. What matters: the journal is whole on disk before the first target file changes and gone after the last;
 * the fence runs before and after the journal and before every file, so a taken-over hold writes nothing further and leaves no journal of
 * its own that was never applied; replay rewrites every file verbatim, so replaying twice leaves the same bytes even over a hand-edited
 * log; and a malformed journal is refused before any file is touched.
 * A file whose bytes on disk already are its new contents is neither journaled nor written, judged by its bytes alone: a hold that changes
 * nothing makes no file move at all, observed through a recording file replace and the files' inodes, yet still runs its fence.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, win32 } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import type { JournaledFile }                             from '../../adapters/hold-journal/HoldJournalIngestion.ts';
import { createHoldJournalWriter }                        from '../../adapters/hold-journal/HoldJournalWriter.ts';
import type { FileReplace }                               from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                       from '../../lib/atomic-file/FileReplaceFor.ts';
import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { LIMITS }                                         from '../../shared/constants/Limits.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import {
  commitHold,
  holdJournalFilePathOf,
  readHoldJournal,
  replayHoldJournal,
  type HoldFence,
} from './HoldJournal.ts';
import { LockGenerationSteps, NO_LOCK_HOLDER_READS_AS_GONE, withLock } from './TrackerLock.ts';
import { workspacePathsFor, type Workspace }                           from './Workspace.ts';
import { thrownFailureOf }                                             from './testing/ThrownFailure.ts';

const now = (): Date => new Date('2026-09-18T18:05:00Z');

const OPEN_FENCE: HoldFence = { requireStillHeld: () => {} };

const HAND_EDITED_LOG_TEXT = '{"kind":"note","at":"2026-09-18T10:15:00+02:00","fields":{"text":"Example session started"}}\n\n';

let workspace: Workspace;

function ticketFilePath(): string {
  return join(workspace.ticketsDirectory, '001-example-checkout-page.md');
}

function exampleFiles(): JournaledFile[] {
  return [
    { kind: 'written', filePath: workspace.progressFilePath, contents: '{\n  "version": 1\n}\n' },
    { kind: 'written', filePath: ticketFilePath(), contents: '---\nid: 001\n---\nExample body\n' },
    { kind: 'removed', filePath: join(workspace.epicsDirectory, 'example-epic.md') },
    { kind: 'written', filePath: workspace.logFilePath, contents: '{"at":"2026-09-18T10:15:00+02:00","kind":"note","fields":{"text":"Example"}}\n' },
  ];
}

function storedBytesOf(files: readonly JournaledFile[]): (string | null)[] {
  return files.map((file) => (existsSync(file.filePath) ? readFileSync(file.filePath, 'utf8') : null));
}

/** Leaves the disk as the hold would: every written file with its new contents, every removed one gone. */
function storeAlready(files: readonly JournaledFile[]): void {
  for (const file of files) {
    mkdirSync(join(file.filePath, '..'), { recursive: true });
    if (file.kind === 'written') writeFileSync(file.filePath, file.contents);
    else rmSync(file.filePath, { force: true });
  }
}

/** An atomic replace lands a new inode, so a file keeping its inode was never written. */
function inodesOf(filePaths: readonly string[]): number[] {
  return filePaths.map((filePath) => statSync(filePath).ino);
}

/** The real moves, each one recorded: a journal cycle shows as its removal, a written file as its replace. */
function recordingFileReplace(movedPaths: string[]): FileReplace {
  const realFileReplace = fileReplaceOfThisProcess();
  return {
    ...realFileReplace,
    replaceFile: (temporaryPath, targetPath) => {
      movedPaths.push(targetPath);
      return realFileReplace.replaceFile(temporaryPath, targetPath);
    },
    removeHeldFile: (path) => {
      movedPaths.push(path);
      return realFileReplace.removeHeldFile(path);
    },
  };
}

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('hold-journal'));
  mkdirSync(workspace.epicsDirectory, { recursive: true });
  writeFileSync(join(workspace.epicsDirectory, 'example-epic.md'), 'an epic the hold removes\n');
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

describe('commitHold', () => {
  test('the journal holds every file, the log as its whole new text, before the first target changes, and is gone after the last', () => {
    const files = exampleFiles();
    const observed: { journal: ReturnType<typeof readHoldJournal>; ticketExisted: boolean }[] = [];

    commitHold(workspace, files, OPEN_FENCE, (filePath) => {
      if (filePath === workspace.progressFilePath) observed.push({ journal: readHoldJournal(workspace), ticketExisted: existsSync(ticketFilePath()) });
    });

    expect(observed).toEqual([{ journal: { verdict: 'readable', files }, ticketExisted: false }]);
    expect(storedBytesOf(files)).toEqual(files.map((file) => (file.kind === 'written' ? file.contents : null)));
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('a fence that refuses before the journal leaves no journal and no file written', async () => {
    const refusal = new Error('taken over');
    const failure = await thrownFailureOf(() => Promise.resolve(commitHold(workspace, exampleFiles(), { requireStillHeld: () => { throw refusal; } })));

    expect(failure).toBe(refusal);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
    expect(existsSync(workspace.progressFilePath)).toBe(false);
  });

  // A holder paused past the lock's staleness between its first fence and the journal write must not leave a stale journal to replay.
  test('a fence that refuses once the journal is written removes the journal, and no file is written', async () => {
    let fenceChecks = 0;
    const refusal = new Error('taken over');
    const fence: HoldFence = {
      requireStillHeld: () => {
        fenceChecks++;
        if (fenceChecks > 1) throw refusal;
      },
    };

    const failure = await thrownFailureOf(() => Promise.resolve(commitHold(workspace, exampleFiles(), fence)));

    expect(failure).toBe(refusal);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
    expect(existsSync(workspace.progressFilePath)).toBe(false);
  });

  test('the fence runs before every file: refused after the first, the rest stay as they were and the journal stays for the successor', async () => {
    let fenceChecks = 0;
    const fence: HoldFence = {
      requireStillHeld: () => {
        fenceChecks++;
        // The checks before and after the journal and the progress file's pass; the ticket's is the first after the takeover.
        if (fenceChecks > 3) throw new Error('taken over');
      },
    };

    await thrownFailureOf(() => Promise.resolve(commitHold(workspace, exampleFiles(), fence)));

    expect(existsSync(workspace.progressFilePath)).toBe(true);
    expect(existsSync(ticketFilePath())).toBe(false);
    expect(readHoldJournal(workspace).verdict).toBe('readable');
  });

  test('a hold whose every file already holds its new bytes moves no file and writes no journal, yet runs its fence', () => {
    const files = exampleFiles();
    storeAlready(files);
    const writtenFilePaths = files.flatMap((file) => (file.kind === 'written' ? [file.filePath] : []));
    const inodesBefore = inodesOf(writtenFilePaths);
    const movedPaths: string[] = [];
    const filesWritten: string[] = [];
    let fenceChecks = 0;

    commitHold(workspace, files, { requireStillHeld: () => { fenceChecks++; } }, (filePath) => filesWritten.push(filePath), recordingFileReplace(movedPaths));

    expect(movedPaths).toEqual([]);
    expect(filesWritten).toEqual([]);
    expect(inodesOf(writtenFilePaths)).toEqual(inodesBefore);
    expect(fenceChecks).toBe(1);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('a mixed hold journals and writes only the files whose bytes change, in their order, and leaves the rest in place', () => {
    const files = exampleFiles();
    const [progressFile, ticketFile, epicRemoval, logFile] = files;
    if (progressFile === undefined || ticketFile === undefined || epicRemoval === undefined || logFile === undefined) throw new Error('four example files');
    storeAlready([progressFile, logFile]);
    const inodesBefore = inodesOf([progressFile.filePath, logFile.filePath]);
    const journaledWhenTheFirstFileLanded: ReturnType<typeof readHoldJournal>[] = [];
    const filesWritten: string[] = [];

    commitHold(workspace, files, OPEN_FENCE, (filePath) => {
      if (filesWritten.length === 0) journaledWhenTheFirstFileLanded.push(readHoldJournal(workspace));
      filesWritten.push(filePath);
    });

    expect(journaledWhenTheFirstFileLanded).toEqual([{ verdict: 'readable', files: [ticketFile, epicRemoval] }]);
    expect(filesWritten).toEqual([ticketFile.filePath, epicRemoval.filePath]);
    expect(inodesOf([progressFile.filePath, logFile.filePath])).toEqual(inodesBefore);
    expect(storedBytesOf(files)).toEqual(files.map((file) => (file.kind === 'written' ? file.contents : null)));
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('bytes that differ are written though they decode to the same text', () => {
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    const truncatedSequenceBytes = Buffer.from([0xf0, 0x90, 0x80]);
    const replacementCharacter = '\uFFFD';
    writeFileSync(workspace.progressFilePath, truncatedSequenceBytes);
    expect(truncatedSequenceBytes.toString('utf8')).toBe(replacementCharacter);

    commitHold(workspace, [{ kind: 'written', filePath: workspace.progressFilePath, contents: replacementCharacter }], OPEN_FENCE);

    expect(readFileSync(workspace.progressFilePath)).toEqual(Buffer.from(replacementCharacter, 'utf8'));
  });

  test('an entry is written when an earlier entry of the hold changes its path, though the disk held its bytes before the hold', () => {
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    writeFileSync(workspace.progressFilePath, 'the bytes on disk\n');

    commitHold(workspace, [
      { kind: 'written', filePath: workspace.progressFilePath, contents: 'an earlier entry\n' },
      { kind: 'written', filePath: workspace.progressFilePath, contents: 'the bytes on disk\n' },
    ], OPEN_FENCE);

    expect(readFileSync(workspace.progressFilePath, 'utf8')).toBe('the bytes on disk\n');
  });
});

describe('a hold under the real lock', () => {
  test('a newer generation taken over the hold refuses lock-taken-over as unrepaired, and nothing further is written', async () => {
    const failure = await thrownFailureOf(() => withLock(workspace, (hold) => {
      const takeover = LockGenerationSteps.attemptedAcquire(
        workspace.lockDirectoryPath,
        { processId: process.pid, acquiredAt: '2026-09-18T20:05:00+02:00' },
        now().getTime() + LIMITS.LOCK_STALE_MILLISECONDS + 1,
        NO_LOCK_HOLDER_READS_AS_GONE,
      );
      expect(takeover.verdict).toBe('acquired');
      commitHold(workspace, exampleFiles(), hold);
    }, now, NO_LOCK_HOLDER_READS_AS_GONE));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('unrepaired');
    expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({ kind: 'lock-taken-over', lockDirectoryPath: workspace.lockDirectoryPath });
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
    expect(existsSync(workspace.progressFilePath)).toBe(false);
  });

  test('a hold that changes nothing still refuses lock-taken-over once taken over', async () => {
    storeAlready(exampleFiles());

    const failure = await thrownFailureOf(() => withLock(workspace, (hold) => {
      LockGenerationSteps.attemptedAcquire(
        workspace.lockDirectoryPath,
        { processId: process.pid, acquiredAt: '2026-09-18T20:05:00+02:00' },
        now().getTime() + LIMITS.LOCK_STALE_MILLISECONDS + 1,
        NO_LOCK_HOLDER_READS_AS_GONE,
      );
      commitHold(workspace, exampleFiles(), hold);
    }, now, NO_LOCK_HOLDER_READS_AS_GONE));

    expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({ kind: 'lock-taken-over', lockDirectoryPath: workspace.lockDirectoryPath });
  });

  test('every acquisition replays a journal it finds before the action runs', async () => {
    const files = exampleFiles();
    createHoldJournalWriter(holdJournalFilePathOf(workspace), workspace.trackerDirectory).write(files);

    const bytesSeenByTheAction = await withLock(workspace, () => storedBytesOf(files), now, NO_LOCK_HOLDER_READS_AS_GONE);

    expect(bytesSeenByTheAction).toEqual(files.map((file) => (file.kind === 'written' ? file.contents : null)));
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('a malformed journal is refused as unrepaired at acquisition, the action never runs and every file stays', async () => {
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    writeFileSync(holdJournalFilePathOf(workspace), '{"version":1,"files":"not a list"}\n');
    writeFileSync(workspace.logFilePath, HAND_EDITED_LOG_TEXT);
    let actionRan = false;

    const failure = await thrownFailureOf(() => withLock(workspace, () => { actionRan = true; }, now, NO_LOCK_HOLDER_READS_AS_GONE));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('unrepaired');
    expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({
      kind:            'malformed-hold-journal',
      journalFilePath: holdJournalFilePathOf(workspace),
      reason:          'its "files" is not a list',
    });
    expect(actionRan).toBe(false);
    expect(readFileSync(workspace.logFilePath, 'utf8')).toBe(HAND_EDITED_LOG_TEXT);
  });
});

describe('replayHoldJournal', () => {
  test('replaying twice yields the same bytes, over a hand-edited log with a blank line and reordered keys', () => {
    const files = exampleFiles();
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    writeFileSync(workspace.logFilePath, HAND_EDITED_LOG_TEXT);
    const journalWriter = createHoldJournalWriter(holdJournalFilePathOf(workspace), workspace.trackerDirectory);

    journalWriter.write(files);
    replayHoldJournal(workspace, OPEN_FENCE);
    const bytesAfterTheFirstReplay = storedBytesOf(files);
    journalWriter.write(files);
    replayHoldJournal(workspace, OPEN_FENCE);

    expect(bytesAfterTheFirstReplay).toEqual(files.map((file) => (file.kind === 'written' ? file.contents : null)));
    expect(storedBytesOf(files)).toEqual(bytesAfterTheFirstReplay);
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test('a cut-short hold whose journal a Windows writer stored replays at the next lock acquisition, and the board stays up', async () => {
    const windowsDataDirectory = 'C:\\Users\\Alex Example\\.agent-progress';
    mkdirSync(workspace.ticketsDirectory, { recursive: true });
    createHoldJournalWriter(holdJournalFilePathOf(workspace), windowsDataDirectory, win32).write([
      { kind: 'written', filePath: win32.join(windowsDataDirectory, 'tickets', '001-example-checkout-page.md'), contents: 'Example body\n' },
    ]);

    await withLock(workspace, () => {}, now, NO_LOCK_HOLDER_READS_AS_GONE);

    expect(readFileSync(ticketFilePath(), 'utf8')).toBe('Example body\n');
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(false);
  });

  test.each([
    ['commit', async (fileReplace: FileReplace) => commitHold(workspace, exampleFiles(), OPEN_FENCE, () => {}, fileReplace)],
    ['replay', async (fileReplace: FileReplace) => {
      createHoldJournalWriter(holdJournalFilePathOf(workspace), workspace.trackerDirectory).write(exampleFiles());
      replayHoldJournal(workspace, OPEN_FENCE, fileReplace);
    }],
  ])('a journal that cannot be removed fails the %s and stays, never a stale replay nobody was told of', async (_step, hold) => {
    const realFileReplace = fileReplaceOfThisProcess();
    const heldJournalFileReplace: FileReplace = {
      ...realFileReplace,
      removeHeldFile: (path) => (path === holdJournalFilePathOf(workspace)
        ? { verdict: 'held', failure: Object.assign(new Error('held'), { code: 'EBUSY' }) }
        : realFileReplace.removeHeldFile(path)),
    };

    const refusal = await thrownFailureOf(() => hold(heldJournalFileReplace));

    expect(refusalIsOperationRefusal(refusal)).toBe(true);
    expect(refusal).toEqual(expect.objectContaining({
      status: 'unrepaired',
      detail: { kind: 'hold-journal-unremovable', journalFilePath: holdJournalFilePathOf(workspace), reason: 'Error: held' },
    }));
    expect(existsSync(holdJournalFilePathOf(workspace))).toBe(true);
  });

  test('a journal already gone is the state the removal reaches for', () => {
    const goneJournalFileReplace: FileReplace = {
      ...fileReplaceOfThisProcess(),
      removeHeldFile: () => {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      },
    };

    expect(() => commitHold(workspace, exampleFiles(), OPEN_FENCE, () => {}, goneJournalFileReplace)).not.toThrow();
  });

  test('no journal leaves every file alone', () => {
    mkdirSync(workspace.trackerDirectory, { recursive: true });
    writeFileSync(workspace.logFilePath, HAND_EDITED_LOG_TEXT);

    replayHoldJournal(workspace, OPEN_FENCE);

    expect(readFileSync(workspace.logFilePath, 'utf8')).toBe(HAND_EDITED_LOG_TEXT);
  });
});
