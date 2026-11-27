/** progress.json read into the model: read, validate, map. */
import type { TrackerProgress }       from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { ProgressFileProblem }   from '../../shared/@types/ProgressFileProblem.ts';
import { storedFileTextOf }           from '../StoredFileText.ts';
import { StoredValueUtil }            from '../utils/StoredValueUtil.ts';
import { ProgressFileMappingUtil }    from './utils/ProgressFileMappingUtil.ts';
import { ProgressFileValidationUtil } from './utils/ProgressFileValidationUtil.ts';

export type ProgressFileReading =
  | { verdict: 'readable'; progress: TrackerProgress }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: ProgressFileProblem };

export class ProgressFileIngestion {
  constructor(private readonly progressRecordPath: string) {}

  /**
   * Never throws: an unreadable file comes back as a verdict whose problem names the offending field.
   * A file that exists but cannot be read is `unreadable`, never `absent`, because `absent` is the answer that invites `init` to replace a good file.
   */
  read(): ProgressFileReading {
    const storedText = storedFileTextOf(this.progressRecordPath);
    if (storedText.verdict !== 'readable') return storedText;

    const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
    if (parsedJson.verdict === 'unparseable') return { verdict: 'unreadable', problem: parsedJson.problem };

    const validated = ProgressFileValidationUtil.readingOf(parsedJson.value);
    if (validated.verdict === 'unreadable') return validated;
    return { verdict: 'readable', progress: ProgressFileMappingUtil.progressOf(validated.document) };
  }
}
