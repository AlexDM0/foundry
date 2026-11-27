/**
 * Preloaded by `bunfig.toml`: gives the run its own temp folder and takes the leak check's baseline at load; after the run, fails it on what
 * it left behind (`src/testing/TestRunLeakCheck.ts`), removes its scratch and temp folders, and prints every spec the tool guard skipped, so
 * a skip is never silent. Its statements are its own registration, the reason it may do work at load.
 */
import { tmpdir }   from 'node:os';
import { join }     from 'node:path';
import { afterAll } from 'bun:test';

import { EVERY_TOOL_REQUIRED_VARIABLE }            from '../shared/Environment.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';
import {
  existingRunScratchRoot,
  moveTheRunIntoATemporaryFolderOfItsOwn,
  removeRunScratchFolder,
  removeRunTemporaryFolder,
  runTemporaryFolder
}                                       from './ScratchWorkspace.ts';
import {
  leakReport,
  leaksAfterTheRunFoldersWent,
  processLeaksOf,
  spawnedGitLinesIn,
  takeTestRunBaseline,
  temporaryFolderLeaksOf
}                                                            from './TestRunLeakCheck.ts';
import { skippedSpecsSoFar, titleNamingTheUnmetRequirement } from './ToolGuard.ts';

const PROGRAM_ROOT = join(import.meta.dir, '..', '..');

const baseline = takeTestRunBaseline(tmpdir(), PROGRAM_ROOT, spawnedGitLinesIn);
moveTheRunIntoATemporaryFolderOfItsOwn();

function reportSkippedSpecs(): void {
  const skippedSpecs = skippedSpecsSoFar();
  if (skippedSpecs.length === 0) return;
  const failInstead = `set ${EVERY_TOOL_REQUIRED_VARIABLE}=1 to fail them instead`;
  console.log(`${skippedSpecs.length} spec(s) skipped for a missing tool or machine condition (${failInstead}):`);
  for (const skippedSpec of skippedSpecs) {
    console.log(`  ${titleNamingTheUnmetRequirement(skippedSpec.title, skippedSpec.unmetRequirement)}`);
  }
}

afterAll(async () => {
  const folders = { scratchFolder: existingRunScratchRoot(), temporaryFolder: runTemporaryFolder() };
  const leaks   = [...await processLeaksOf(folders), ...temporaryFolderLeaksOf(folders)];
  removeRunScratchFolder();
  removeRunTemporaryFolder();
  leaks.push(...leaksAfterTheRunFoldersWent(baseline, folders, spawnedGitLinesIn));
  reportSkippedSpecs();
  if (leaks.length === 0) return;
  // Bun may show a throw from this hook only as `(fail) (unnamed)`, so the report goes to standard error first.
  console.error(leakReport(leaks));
  throw new Error(leakReport(leaks));
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
