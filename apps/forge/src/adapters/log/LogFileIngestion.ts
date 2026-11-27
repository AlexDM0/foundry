/** log.jsonl read into the model's records: read, split into lines, parse, validate and map. The format's first version has nothing to migrate. */
import type { LogRecord }       from '../../lib/tracker-model/@types/LogRecord.ts';
import { storedFileTextOf }     from '../StoredFileText.ts';
import { StoredValueUtil }      from '../utils/StoredValueUtil.ts';
import type { LogFileReading }  from './@types/StoredLog.ts';
import { logRecordProblemOf }   from './LogRecordProblem.ts';
import { LogRecordMappingUtil } from './utils/LogRecordMappingUtil.ts';

export class LogFileIngestion {
  constructor(private readonly logFilePath: string) {}

  /**
   * Never throws. Strict like progress.json: one malformed line makes the whole log unreadable rather than silently shorter. The problem
   * names this file, because the tracker's log may come from progress.json instead and a reader must see which file is at fault.
   */
  read(): LogFileReading {
    const storedText = storedFileTextOf(this.logFilePath);
    if (storedText.verdict === 'absent') return storedText;
    const { logFilePath } = this;
    if (storedText.verdict === 'unreadable') return { verdict: 'unreadable', problem: { ...storedText.problem, logFilePath } };

    const records: LogRecord[] = [];
    const lines = storedText.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.trim() === '') continue;
      const lineNumber = i + 1;

      const parsedJson = StoredValueUtil.parsedJsonOf(line);
      if (parsedJson.verdict === 'unparseable') {
        return { verdict: 'unreadable', problem: { ...parsedJson.problem, logFilePath, lineNumber } };
      }

      const problem = logRecordProblemOf(parsedJson.value);
      if (problem !== null) return { verdict: 'unreadable', problem: { ...problem, logFilePath, lineNumber } };
      records.push(LogRecordMappingUtil.recordOf(parsedJson.value));
    }
    return { verdict: 'readable', records };
  }
}
