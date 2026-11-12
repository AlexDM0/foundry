/** The one module that reads the environment, through getters that read it at each call, never a snapshot. */
import { homedir } from 'node:os';

/** `HOME`, so every spec can run under a scratch home; the account's home folder when it is unset. */
export function homeDirectory(): string {
  const home = process.env['HOME'];
  return home === undefined || home === '' ? homedir() : home;
}

/** Test-only: moves `HOME` for the rest of the run, so no spec can reach the account's real home folder. */
export function moveHomeDirectoryTo(directory: string): void {
  process.env['HOME'] = directory;
}
