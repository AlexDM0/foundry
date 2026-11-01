import { rmSync }        from 'node:fs';
import { relative, sep } from 'node:path';

import { writeFileAtomically }                                                    from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                           from '../../shared/utils/JsonTextUtil.ts';
import { HOLD_JOURNAL_FORMAT_VERSION, STORED_PATH_SEPARATOR, type JournaledFile } from './HoldJournalIngestion.ts';

type StoredJournalEntry = { path: string; contents: string } | { path: string; removed: true };

/**
 * Through `src/lib/atomic-file/AtomicFile.ts`, so a journal on disk is always whole: it is the hold's commit point. A stored path has one wire
 * form on every platform; `pathRules` lets a spec write as another platform does.
 */
export function createHoldJournalWriter(
  journalFilePath: string,
  dataDirectory: string,
  pathRules: { relative: (from: string, to: string) => string; sep: string } = { relative, sep },
): {
    write(files: readonly JournaledFile[]): void;
    remove(): void;
  } {
  function storedEntryOf(file: JournaledFile): StoredJournalEntry {
    const path = pathRules.relative(dataDirectory, file.filePath).split(pathRules.sep).join(STORED_PATH_SEPARATOR);
    return file.kind === 'written' ? { path, contents: file.contents } : { path, removed: true };
  }

  function write(files: readonly JournaledFile[]): void {
    writeFileAtomically(journalFilePath, JsonTextUtil.storedFileTextOf({ version: HOLD_JOURNAL_FORMAT_VERSION, files: files.map(storedEntryOf) }));
  }

  function remove(): void {
    rmSync(journalFilePath, { force: true });
  }

  return { write, remove };
}
