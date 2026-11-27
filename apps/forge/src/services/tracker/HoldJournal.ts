/**
 * The redo journal every tracker write commits through. A hold writes `hold-journal.json` with the new contents of every file it changes
 * before it touches one, so a hold cut short anywhere after that is finished, verbatim, by the next lock holder replaying it.
 */
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { isDeepStrictEqual }                 from 'node:util';

import { HoldJournalIngestion, type HoldJournalReading, type JournaledFile } from '../../adapters/hold-journal/HoldJournalIngestion.ts';
import { createHoldJournalWriter }                                           from '../../adapters/hold-journal/HoldJournalWriter.ts';
import { removeHeldFile, writeFileAtomically }                               from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                                  from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                          from '../../lib/atomic-file/FileReplaceFor.ts';
import { errorCodeOf }                                                       from '../../lib/atomic-file/HeldFileFailure.ts';
import { OperationRefusal }                                                  from '../../shared/OperationRefusal.ts';
import type { HoldFence }                                                    from './GenerationLock.ts';
import { localStoreLayoutOf }                                                from './LocalStoreLayout.ts';
import type { Workspace }                                                    from './Workspace.ts';

/** Lock-free and never throws, for `status`. */
export function readHoldJournal(workspace: Workspace): HoldJournalReading {
  return new HoldJournalIngestion(localStoreLayoutOf(workspace).holdJournalPath, workspace.trackerDirectory).read();
}

function removeUnlessAbsent(path: string, fileReplace: FileReplace): void {
  try {
    removeHeldFile(path, fileReplace);
  } catch (failure) {
    if (errorCodeOf(failure) !== 'ENOENT') throw failure;
  }
}

function apply(file: JournaledFile, fileReplace: FileReplace): void {
  if (file.kind === 'written') writeFileAtomically(file.filePath, file.contents, fileReplace);
  else removeUnlessAbsent(file.filePath, fileReplace);
}

/** A journal left behind unannounced would replay over whatever is hand-edited next, so one that stays fails the hold. */
function deleteJournal(workspace: Workspace, fileReplace: FileReplace): void {
  const journalFilePath = localStoreLayoutOf(workspace).holdJournalPath;
  try {
    removeUnlessAbsent(journalFilePath, fileReplace);
  } catch (failure) {
    throw new OperationRefusal('unrepaired', { kind: 'hold-journal-unremovable', journalFilePath, systemError: String(failure) });
  }
}

/** Fenced before every file and before the journal goes, since a successor may already have replayed it and written its own. */
function applyThenDeleteJournal(
  workspace: Workspace,
  files: readonly JournaledFile[],
  fence: HoldFence,
  afterFileWritten: (filePath: string) => void,
  fileReplace: FileReplace,
): void {
  for (const file of files) {
    fence.requireStillHeld();
    apply(file, fileReplace);
    afterFileWritten(file.filePath);
  }
  fence.requireStillHeld();
  deleteJournal(workspace, fileReplace);
}

/** Whether the disk already holds what the entry would leave: a written file byte for byte, a removed one absent. A failed read says no. */
function diskAlreadyHolds(file: JournaledFile): boolean {
  try {
    if (file.kind === 'removed') {
      lstatSync(file.filePath);
      return false;
    }
    const wantedBytes = Buffer.from(file.contents, 'utf8');
    if (statSync(file.filePath).size !== wantedBytes.length) return false;
    return readFileSync(file.filePath).equals(wantedBytes);
  } catch (failure) {
    return file.kind === 'removed' && errorCodeOf(failure) === 'ENOENT';
  }
}

/** The entries that change the disk, in order; a path an earlier kept entry touches stays, since the disk no longer predicts it. */
function entriesThatChangeTheDisk(files: readonly JournaledFile[]): JournaledFile[] {
  const keptPaths = new Set<string>();
  const kept: JournaledFile[] = [];
  for (const file of files) {
    if (!keptPaths.has(file.filePath) && diskAlreadyHolds(file)) continue;
    keptPaths.add(file.filePath);
    kept.push(file);
  }
  return kept;
}

/**
 * A holder paused between its fence and its journal write may write the journal after a successor took the lock and committed; left
 * behind, it would replay stale contents over the successor's. So the fence runs again once the journal is on disk, and a taken-over
 * hold removes the journal while it still holds this hold's entries.
 */
function writeJournalWhileHeld(workspace: Workspace, changingFiles: readonly JournaledFile[], fence: HoldFence, fileReplace: FileReplace): void {
  createHoldJournalWriter(localStoreLayoutOf(workspace).holdJournalPath, workspace.trackerDirectory).write(changingFiles);
  try {
    fence.requireStillHeld();
  } catch (failure) {
    const reading = readHoldJournal(workspace);
    if (reading.verdict === 'readable' && isDeepStrictEqual(reading.files, changingFiles)) removeUnlessAbsent(localStoreLayoutOf(workspace).holdJournalPath, fileReplace);
    throw failure;
  }
}

/**
 * Run under the lock, so no other holder changes a file between its comparison and the commit. Only the files whose bytes change are
 * journaled and written; a hold that changes none writes nothing, though its fence still runs. `afterFileWritten` is the step a spec
 * interrupts to cut a hold short between two files.
 */
export function commitHold(
  workspace: Workspace,
  files: readonly JournaledFile[],
  fence: HoldFence,
  afterFileWritten: (filePath: string) => void = () => {},
  fileReplace: FileReplace = fileReplaceOfThisProcess(),
): void {
  const changingFiles = entriesThatChangeTheDisk(files);
  fence.requireStillHeld();
  if (changingFiles.length === 0) return;
  writeJournalWhileHeld(workspace, changingFiles, fence, fileReplace);
  applyThenDeleteJournal(workspace, changingFiles, fence, afterFileWritten, fileReplace);
}

/**
 * Run first by every acquisition of a tracker's lock: finishes the hold a journal on disk records, every file rewritten or removed verbatim,
 * so replaying twice leaves the same bytes. A malformed journal is refused as unrepaired, before anything reads a possibly torn board.
 */
export function replayHoldJournal(workspace: Workspace, fence: HoldFence, fileReplace: FileReplace = fileReplaceOfThisProcess()): void {
  const reading = readHoldJournal(workspace);
  if (reading.verdict === 'absent') return;
  if (reading.verdict === 'malformed') {
    throw new OperationRefusal('unrepaired', { kind: 'malformed-hold-journal', journalFilePath: localStoreLayoutOf(workspace).holdJournalPath, problem: reading.problem });
  }
  applyThenDeleteJournal(workspace, reading.files, fence, () => {}, fileReplace);
}
