/** The `FileReplace` port: the file moves atomic writes rest on, each with the same meaning everywhere. */
export type ExclusiveCreation = 'created' | 'already-exists';

/** A file something else holds is an answer, carrying the last failure; any other failure stays a throw. */
export type HeldFileMove = { verdict: 'moved' } | { verdict: 'held'; failure: unknown };

export interface FileReplace {
  /** One step: a reader holding `targetPath` sees the old file or the new one. */
  replaceFile(temporaryPath: string, targetPath: string): HeldFileMove;
  removeHeldFile(path: string): HeldFileMove;
  /** Fails rather than replaces when the target exists. Where hard links fail it creates the target by exclusive open, so a reader can see part of it. */
  createExclusively(temporaryPath: string, targetPath: string, contents: string): ExclusiveCreation;
  /** As `createExclusively`, for a file whose partial reading misleads: a reader sees it whole or absent, and a link failure stays a throw. */
  createWholeExclusively(temporaryPath: string, targetPath: string): ExclusiveCreation;
}
