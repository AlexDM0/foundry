/** Reads what a failed file call says: Windows answers these three codes when an editor, an indexer or a virus scanner holds the file. */
const HELD_FILE_ERROR_CODES: readonly unknown[] = ['EPERM', 'EBUSY', 'EACCES'];

export function errorCodeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

export function failureMeansTheFileIsHeld(error: unknown): boolean {
  return HELD_FILE_ERROR_CODES.includes(errorCodeOf(error));
}
