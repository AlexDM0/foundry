/** The `FileReplace` port: the three file moves atomic writes rest on, each with the same meaning everywhere. */
export interface FileReplace {
  /** One step: a reader holding `targetPath` sees the old file or the new one. */
  replaceFile(temporaryPath: string, targetPath: string): void;
  removeHeldFile(path: string): void;
  /** Fails rather than replaces when the target exists. */
  createExclusively(temporaryPath: string, targetPath: string): 'created' | 'already-exists';
}
