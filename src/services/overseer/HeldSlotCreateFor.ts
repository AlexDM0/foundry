/**
 * The selector of what a held-file failure on a gate slot create means. Windows refuses a create over a slot that is being deleted with the
 * held-file codes, so there the slot reads as taken; on POSIX the same codes are a permission fault.
 */
export function heldSlotCreateMeansTakenFor(platform: string): boolean {
  return platform === 'win32';
}

/** The gate slots have no context to take the platform from, as the `FileReplace` port they create through, so this reads it at call time. */
export function heldSlotCreateMeansTakenInThisProcess(): boolean {
  return heldSlotCreateMeansTakenFor(process.platform);
}
