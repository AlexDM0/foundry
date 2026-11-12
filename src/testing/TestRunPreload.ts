/**
 * Preloaded by `bunfig.toml`: moves `HOME` and `TMPDIR` into the run's scratch folder and takes the leak check's baseline when it loads; after the whole
 * run, fails it on whatever it left behind and removes the run's scratch folder. Its statements are its registration, the reason it may do
 * work at load.
 */
import { afterAll } from 'bun:test';

import {
  homeDirectory,
  moveHomeDirectoryTo,
  moveTemporaryDirectoryTo,
  temporaryDirectory,
} from '../services/Environment.ts';
import {
  leakReport,
  leaksAfterTheRunFolderWent,
  runFolderLeaksOf,
  spawnedGitStatusLines,
  takeTestRunBaseline,
} from './LeakCheck.ts';
import {
  existingRunScratchFolder,
  removeRunScratchFolder,
  scratchHomeDirectory,
  scratchTemporaryDirectory,
} from './ScratchRoot.ts';

const baseline = takeTestRunBaseline(homeDirectory(), temporaryDirectory(), spawnedGitStatusLines);
moveHomeDirectoryTo(scratchHomeDirectory());
moveTemporaryDirectoryTo(scratchTemporaryDirectory());

afterAll(() => {
  const leaks = runFolderLeaksOf(existingRunScratchFolder());
  moveHomeDirectoryTo(baseline.realHomeDirectory);
  moveTemporaryDirectoryTo(baseline.realTemporaryDirectory);
  removeRunScratchFolder();
  leaks.push(...leaksAfterTheRunFolderWent(baseline, spawnedGitStatusLines));
  if (leaks.length === 0) return;
  // Bun may show a throw from this hook only as an unnamed failure, so the report goes to standard error first.
  console.error(leakReport(leaks));
  throw new Error(leakReport(leaks));
});
