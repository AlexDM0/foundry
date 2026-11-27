import type { LogRecord }      from '../../../domain/tracker-model/@types/LogRecord.ts';
import type { LogFileProblem } from '../../../shared/@types/LogFileProblem.ts';

export interface StoredLog {
  records: LogRecord[];
}

export type LogFileReading =
  | { verdict: 'readable'; records: LogRecord[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: LogFileProblem };

export type StoredLogReading = ({ verdict: 'readable' } & StoredLog) | { verdict: 'unreadable'; problem: LogFileProblem };
