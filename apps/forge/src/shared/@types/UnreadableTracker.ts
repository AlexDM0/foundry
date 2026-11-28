import type { LogFileProblem }      from './LogFileProblem.ts';
import type { ProgressFileProblem } from './ProgressFileProblem.ts';

/** Why a tracker's stored files could not be read: the file that failed and, when it is there but broken, what is wrong with it. */
export type UnreadableTracker =
  | { verdict: 'absent'; filePath: string }
  | { verdict: 'unreadable'; unreadableFile: 'progress-file'; filePath: string; problem: ProgressFileProblem }
  | { verdict: 'unreadable'; unreadableFile: 'log-file'; filePath: string; problem: LogFileProblem };
