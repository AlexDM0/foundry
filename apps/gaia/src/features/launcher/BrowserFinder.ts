/**
 * Finds the browser Gaia's window opens in: Google Chrome, else Microsoft Edge, each in the system's and then the user's Applications
 * folder. Both open an `--app` window on a profile of Gaia's own and report its windows over a debugging pipe (docs/architecture.md,
 * "Guards and sessions").
 */
import { accessSync, constants } from 'node:fs';
import { join }                  from 'node:path';

export type BrowserName = 'chrome' | 'edge';

export interface FoundBrowser {
  readonly browser: BrowserName;
  readonly program: string;
}

const SYSTEM_APPLICATIONS_FOLDER = '/Applications';

const USER_APPLICATIONS_FOLDER_NAME = 'Applications';

/** The program inside each browser's bundle, in the order Gaia prefers them. */
const PROGRAM_IN_BUNDLE_OF_BROWSER: readonly (readonly [BrowserName, string])[] = [
  ['chrome', join('Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')],
  ['edge', join('Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')],
];

/** Every place a browser may be, Chrome's before Edge's, the system's folder before the user's. */
export function browserCandidatesIn(homeDirectory: string): readonly FoundBrowser[] {
  const applicationsFolders = [SYSTEM_APPLICATIONS_FOLDER, join(homeDirectory, USER_APPLICATIONS_FOLDER_NAME)];
  return PROGRAM_IN_BUNDLE_OF_BROWSER.flatMap(([browser, programInBundle]) => applicationsFolders.map((folder) => ({ browser, program: join(folder, programInBundle) })));
}

export function programIsRunnable(programPath: string): boolean {
  try {
    accessSync(programPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first candidate whose program can run, or `null` when neither browser is there. */
export function foundBrowserIn(homeDirectory: string, programCanRun: (programPath: string) => boolean = programIsRunnable): FoundBrowser | null {
  return browserCandidatesIn(homeDirectory).find(({ program }) => programCanRun(program)) ?? null;
}
