/** The one module that reads the environment, through getters that read it at each call, never a snapshot. */
import { homedir, tmpdir } from 'node:os';

import { PRODUCT_NAMES } from '../shared/constants/ProductNames.ts';

/** `HOME`, so every spec can run under a scratch home; the account's home folder when it is unset. */
export function homeDirectory(): string {
  const home = process.env['HOME'];
  return home === undefined || home === '' ? homedir() : home;
}

/** `TMPDIR`, read at each call, so the test preload can give a run a temporary folder of its own. */
export function temporaryDirectory(): string {
  return tmpdir();
}

/**
 * `GAIA_RECORDING_FORGE_PROGRAM`: the forge program that `bun run record forge-program` runs, such as a forge checkout's
 * `agent-progress.ts`, so the record command names the forge it records from and no spec guesses one on this machine. `null` when unset.
 */
export function forgeProgramToRecordFrom(): string | null {
  const forgeProgram = process.env[`${PRODUCT_NAMES.environmentPrefix}RECORDING_FORGE_PROGRAM`];
  return forgeProgram === undefined || forgeProgram === '' ? null : forgeProgram;
}

/** The environment as it is now, for a child process: Bun hands a child without `env` the environment this process started with. */
export function environmentCopy(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

/** Test-only: moves `HOME` for the rest of the run, so no spec can reach the account's real home folder. */
export function moveHomeDirectoryTo(directory: string): void {
  process.env['HOME'] = directory;
}

/** Test-only: moves `TMPDIR` for the rest of the run, so what a spec leaves in the temporary folder is found and named. */
export function moveTemporaryDirectoryTo(directory: string): void {
  process.env['TMPDIR'] = directory;
}
