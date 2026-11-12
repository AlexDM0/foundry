/**
 * The repository's own scratch root, `.scratch/`, and this test run's folder in it. Every spec works below it, and the helpers refuse a
 * path anywhere else. Test-only: nothing that ships may import `src/testing/`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import {
  isAbsolute,
  join,
  relative,
  sep
} from 'node:path';

const SCRATCH_ROOT_FOLDER_NAME = '.scratch';
const RUN_FOLDER_PREFIX        = 'run-';
const SCRATCH_HOME_FOLDER_NAME = 'home';
const SCRATCH_TEMPORARY_FOLDER_NAME = 'temporary';

let currentRunFolder: string | null = null;

export function scratchRoot(): string {
  return join(import.meta.dir, '..', '..', SCRATCH_ROOT_FOLDER_NAME);
}

export function runFolderPrefix(): string {
  return RUN_FOLDER_PREFIX;
}

export function scratchHomeFolderName(): string {
  return SCRATCH_HOME_FOLDER_NAME;
}

export function scratchTemporaryFolderName(): string {
  return SCRATCH_TEMPORARY_FOLDER_NAME;
}

export function pathLiesInsideScratchRoot(candidatePath: string): boolean {
  if (!isAbsolute(candidatePath)) return false;
  const root           = realpathSync(scratchRoot());
  const resolvedTarget = existsSync(candidatePath) ? realpathSync(candidatePath) : candidatePath;
  const pathFromRoot   = relative(root, resolvedTarget);
  return pathFromRoot !== '' && !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot);
}

/** This run's own folder, made at first use; another run on the machine has its own. */
export function runScratchFolder(): string {
  if (currentRunFolder === null) {
    mkdirSync(scratchRoot(), { recursive: true });
    currentRunFolder = realpathSync(mkdtempSync(join(scratchRoot(), RUN_FOLDER_PREFIX)));
  }
  return currentRunFolder;
}

export function existingRunScratchFolder(): string | null {
  return currentRunFolder;
}

/** The scratch `HOME` every spec runs under, so no spec reaches the account's `~/.gaia` or `~/.forge-monitor`. */
export function scratchHomeDirectory(): string {
  const home = join(runScratchFolder(), SCRATCH_HOME_FOLDER_NAME);
  mkdirSync(home, { recursive: true });
  return home;
}

/** The scratch `TMPDIR` every spec runs under, so what a spec leaves in the temporary folder is this run's to find. */
export function scratchTemporaryDirectory(): string {
  const temporary = join(runScratchFolder(), SCRATCH_TEMPORARY_FOLDER_NAME);
  mkdirSync(temporary, { recursive: true });
  return temporary;
}

export function createScratchDirectory(prefix: string): string {
  return mkdtempSync(join(runScratchFolder(), `${prefix}-`));
}

export function removeScratchPath(target: string): void {
  if (!pathLiesInsideScratchRoot(target)) throw new Error(`${target} is not inside the scratch root ${scratchRoot()}; refusing to remove it`);
  rmSync(target, { recursive: true, force: true });
}

export function removeRunScratchFolder(): void {
  if (currentRunFolder === null) return;
  removeScratchPath(currentRunFolder);
  currentRunFolder = null;
}
