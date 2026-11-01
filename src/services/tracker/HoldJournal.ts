/**
 * The redo journal every tracker write commits through. A hold writes `hold-journal.json` with every file's new contents before it touches
 * one, so a hold cut short anywhere after that is finished, verbatim, by the next lock holder replaying it.
 */
import { join } from 'node:path';

import { HoldJournalIngestion, type HoldJournalReading, type JournaledFile } from '../../adapters/hold-journal/HoldJournalIngestion.ts';
import { createHoldJournalWriter }                                           from '../../adapters/hold-journal/HoldJournalWriter.ts';
import { removeHeldFile, writeFileAtomically }                               from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                                  from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                          from '../../lib/atomic-file/FileReplaceFor.ts';
import { errorCodeOf }                                                       from '../../lib/atomic-file/HeldFileFailure.ts';
import { OperationRefusal }                                                  from '../../shared/OperationRefusal.ts';
import type { Workspace }                                                    from './Workspace.ts';
import { TRACKER_FILES }                                                     from './constants/TrackerFiles.ts';

/** What a hold checks before each write: it throws once the hold's lock was taken over, so a stale holder writes nothing further. */
export interface HoldFence {
  requireStillHeld(): void;
}

export function holdJournalFilePathOf(workspace: Workspace): string {
  return join(workspace.trackerDirectory, TRACKER_FILES.HOLD_JOURNAL_FILE_NAME);
}

/** Lock-free and never throws, for `status`. */
export function readHoldJournal(workspace: Workspace): HoldJournalReading {
  return new HoldJournalIngestion(holdJournalFilePathOf(workspace), workspace.trackerDirectory).read();
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
  const journalFilePath = holdJournalFilePathOf(workspace);
  try {
    removeUnlessAbsent(journalFilePath, fileReplace);
  } catch (failure) {
    throw new OperationRefusal('unrepaired', { kind: 'hold-journal-unremovable', journalFilePath, reason: String(failure) });
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

/** `afterFileWritten` is the step a spec interrupts to cut a hold short between two files. */
export function commitHold(
  workspace: Workspace,
  files: readonly JournaledFile[],
  fence: HoldFence,
  afterFileWritten: (filePath: string) => void = () => {},
  fileReplace: FileReplace = fileReplaceOfThisProcess(),
): void {
  fence.requireStillHeld();
  createHoldJournalWriter(holdJournalFilePathOf(workspace), workspace.trackerDirectory).write(files);
  applyThenDeleteJournal(workspace, files, fence, afterFileWritten, fileReplace);
}

/**
 * Run first by every acquisition of a tracker's lock: finishes the hold a journal on disk records, every file rewritten or removed verbatim,
 * so replaying twice leaves the same bytes. A malformed journal is refused as unrepaired, before anything reads a possibly torn board.
 */
export function replayHoldJournal(workspace: Workspace, fence: HoldFence, fileReplace: FileReplace = fileReplaceOfThisProcess()): void {
  const reading = readHoldJournal(workspace);
  if (reading.verdict === 'absent') return;
  if (reading.verdict === 'malformed') {
    throw new OperationRefusal('unrepaired', { kind: 'malformed-hold-journal', journalFilePath: holdJournalFilePathOf(workspace), reason: reading.reason });
  }
  applyThenDeleteJournal(workspace, reading.files, fence, () => {}, fileReplace);
}
