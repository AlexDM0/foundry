/**
 * The board-wide files of forge's own that do not heal and that Hephaestus found unreadable: each is logged once and stays a header warning
 * until Hephaestus restarts, since a restart reads every such file again. A job's own files open an incident instead.
 */
import type { UnreadableFileProblem }       from '../../adapters/@types/UnreadableFileProblem.ts';
import { UnreadableFileProblemWordingUtil } from '../../adapters/utils/UnreadableFileProblemWordingUtil.ts';

/** A board-wide file's path inside the board's data folder, and why its ingestion could not read it. */
export interface UnreadableBoardFile {
  readonly file:    string;
  readonly problem: UnreadableFileProblem;
}

export interface UnreadableBoardFiles {
  /** Keeps the file, logged with its problem the first time; a file reported again keeps its first problem. */
  report(unreadable: UnreadableBoardFile): void;
  files(): readonly UnreadableBoardFile[];
}

export function createUnreadableBoardFiles(log: (line: string) => void): UnreadableBoardFiles {
  const reported: UnreadableBoardFile[] = [];

  function report(unreadable: UnreadableBoardFile): void {
    if (reported.some((kept) => kept.file === unreadable.file)) return;
    reported.push({ file: unreadable.file, problem: unreadable.problem });
    const sentence = UnreadableFileProblemWordingUtil.sentenceOf(unreadable.problem);
    log(`Hephaestus cannot read the board file ${unreadable.file} (${sentence}); the board header warns until Hephaestus restarts.`);
  }

  return { report, files: () => [...reported] };
}
