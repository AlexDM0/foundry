/**
 * The machine's temp folder, which a process outside the test run shares, kept while the run has moved `TMPDIR` into a folder of its own.
 * `src/testing/ScratchWorkspace.ts` sets it when it moves the run and clears it when it gives `TMPDIR` back.
 */
import { tmpdir } from 'node:os';

let folderBeforeTheRun: string | null = null;

export function rememberMachineTemporaryFolder(folder: string | null): void {
  folderBeforeTheRun = folder;
}

export function machineTemporaryFolder(): string {
  return folderBeforeTheRun ?? tmpdir();
}
