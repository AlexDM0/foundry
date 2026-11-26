/**
 * The board-wide files of forge's own that do not heal and that Hephaestus found unreadable: each is logged once and stays a header warning
 * until Hephaestus restarts, since a restart reads every such file again. A job's own files open an incident instead.
 */

/** A board-wide file's path inside the board's data folder, and why its ingestion could not read it. */
export interface UnreadableBoardFile {
  readonly file:   string;
  readonly reason: string;
}

export interface UnreadableBoardFiles {
  /** Keeps the file, logged with its reason the first time; a file reported again keeps its first reason. */
  report(unreadable: UnreadableBoardFile): void;
  files(): readonly UnreadableBoardFile[];
}

export function createUnreadableBoardFiles(log: (line: string) => void): UnreadableBoardFiles {
  const reported: UnreadableBoardFile[] = [];

  function report(unreadable: UnreadableBoardFile): void {
    if (reported.some((kept) => kept.file === unreadable.file)) return;
    reported.push({ file: unreadable.file, reason: unreadable.reason });
    log(`Hephaestus cannot read the board file ${unreadable.file} (${unreadable.reason}); the board header warns until Hephaestus restarts.`);
  }

  return { report, files: () => [...reported] };
}
