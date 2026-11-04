/**
 * The one shared guard for a spec that needs a tool, or a machine condition, the machine may lack. An unmet requirement skips the suite
 * with the requirement named in its title and records the skip for `src/testing/TestRunReport.ts`; with
 * `EVERY_TOOL_REQUIRED_VARIABLE` set it registers a failing test naming the requirement instead.
 */
import { describe, test } from 'bun:test';

import { EVERY_TOOL_REQUIRED_VARIABLE, everyToolIsRequired }  from '../shared/Environment.ts';
import { boundaryIsRecordedFor, unfinishedBoundaryWordingOf } from './BoundaryRecordings.ts';
import { scratchRootLiesOutsideTheFixedTemporaryFolders }     from './FixedTemporaryFolders.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitIsAvailable,
  removeScratchDirectory
} from './ScratchWorkspace.ts';

export type RequiredTool = 'git' | 'bash';

export type RecordedBoundaryRequirement = 'git-recording' | 'process-table-recording' | 'local-endpoint-recording';

export type SpecRequirement =
  | RequiredTool
  | RecordedBoundaryRequirement
  | 'git-merge-tree-stdin'
  | 'sandbox-exec'
  | 'scratch-root-outside-tmp'
  | 'chrome'
  | 'macos'
  | 'not-root';

/** The boundary of `BOUNDARY_SPECS` whose recording for this OS a spec playing it needs. */
export const BOUNDARY_OF_RECORDING_REQUIREMENT: Readonly<Record<RecordedBoundaryRequirement, string>> = {
  'git-recording':            'src/lib/git/GitProcess.ts',
  'process-table-recording':  'src/lib/process-identity/',
  'local-endpoint-recording': 'src/lib/watcher/LocalEndpointFor.ts',
};

function recordingIsPresent(requirement: RecordedBoundaryRequirement): () => boolean {
  return () => boundaryIsRecordedFor(BOUNDARY_OF_RECORDING_REQUIREMENT[requirement], process.platform);
}

const ROOT_USER_ID = 0;

/** Root passes every permission bit, so a spec proving a refused write cannot see the refusal. Windows has no user id here. */
function notRunningAsRoot(): boolean {
  return typeof process.getuid !== 'function' || process.getuid() !== ROOT_USER_ID;
}

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec';

const CHROME_APPLICATION_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const CHROME_COMMAND_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

/** The Chrome or Chromium a headless check drives, the macOS application first, then one on the PATH; `null` when there is none. */
export function chromeExecutablePath(): string | null {
  const application = CHROME_APPLICATION_PATHS.find((path) => Bun.file(path).size > 0);
  if (application !== undefined) return application;
  for (const commandName of CHROME_COMMAND_NAMES) {
    const found = Bun.which(commandName);
    if (found !== null) return found;
  }
  return null;
}

export interface SkippedSpec {
  readonly title:            string;
  readonly unmetRequirement: SpecRequirement;
}

function bashIsAvailable(): boolean {
  return Bun.which('bash') !== null;
}

function plantedPairMergesOnStandardInput(): boolean {
  const repositoryDirectory = createScratchGitRepository('merge-tree-stdin-probe');
  try {
    commitFile(repositoryDirectory, 'planted.txt', 'planted\n');
    const finished = Bun.spawnSync(['git', 'merge-tree', '--stdin'], {
      cwd:    repositoryDirectory,
      stdin:  new TextEncoder().encode('HEAD^ HEAD\n'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return finished.exitCode === 0 && finished.stdout.toString().startsWith('1\0');
  } catch {
    return false;
  } finally {
    removeScratchDirectory(repositoryDirectory);
  }
}

let gitMergeTreeStandardInputAnswer: boolean | null = null;

/** Runs the feature on a planted pair, once per run, rather than reading git's version number. */
function gitMergeTreeStandardInputWorks(): boolean {
  gitMergeTreeStandardInputAnswer ??= gitIsAvailable() && plantedPairMergesOnStandardInput();
  return gitMergeTreeStandardInputAnswer;
}

/** Applies a permissive profile rather than checking the file, since a process already under a sandbox may not apply another. */
function sandboxExecApplies(): boolean {
  try {
    return Bun.spawnSync({ cmd: [SANDBOX_EXEC_PATH, '-p', '(version 1)(allow default)', '/usr/bin/true'], stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
  } catch {
    return false;
  }
}

const REQUIREMENT_IS_MET: Readonly<Record<SpecRequirement, () => boolean>> = {
  'git':                      gitIsAvailable,
  'bash':                     bashIsAvailable,
  'git-merge-tree-stdin':     gitMergeTreeStandardInputWorks,
  'sandbox-exec':             sandboxExecApplies,
  'scratch-root-outside-tmp': scratchRootLiesOutsideTheFixedTemporaryFolders,
  'chrome':                   () => chromeExecutablePath() !== null,
  'macos':                    () => process.platform === 'darwin',
  'not-root':                 notRunningAsRoot,
  'git-recording':            recordingIsPresent('git-recording'),
  'process-table-recording':  recordingIsPresent('process-table-recording'),
  'local-endpoint-recording': recordingIsPresent('local-endpoint-recording'),
};

const UNMET_REQUIREMENT_WORDING: Readonly<Record<SpecRequirement, string>> = {
  'git':                      'git is missing',
  'bash':                     'bash is missing',
  'git-merge-tree-stdin':     'git merge-tree --stdin is missing',
  'sandbox-exec':             'sandbox-exec cannot apply a profile here',
  'scratch-root-outside-tmp': 'the scratch root lies under /tmp or /var/tmp',
  'chrome':                   'Chrome is missing',
  'macos':                    'this machine is not macOS',
  'not-root':                 'this run is root, which no permission bit refuses',
  'git-recording':            unfinishedBoundaryWordingOf(BOUNDARY_OF_RECORDING_REQUIREMENT['git-recording'], process.platform),
  'process-table-recording':  unfinishedBoundaryWordingOf(BOUNDARY_OF_RECORDING_REQUIREMENT['process-table-recording'], process.platform),
  'local-endpoint-recording': unfinishedBoundaryWordingOf(BOUNDARY_OF_RECORDING_REQUIREMENT['local-endpoint-recording'], process.platform),
};

type SpecBody = () => void | Promise<unknown>;

const skippedSpecs: SkippedSpec[] = [];

export function titleNamingTheUnmetRequirement(title: string, requirement: SpecRequirement): string {
  return `${title} [${UNMET_REQUIREMENT_WORDING[requirement]}]`;
}

function failBecauseRequirementIsUnmet(requirement: SpecRequirement): never {
  throw new Error(`Every tool is required (${EVERY_TOOL_REQUIRED_VARIABLE} is set), but ${UNMET_REQUIREMENT_WORDING[requirement]} on this machine.`);
}

function describeWhenRequirementIsMet(requirement: SpecRequirement, title: string, body: () => void): void {
  if (REQUIREMENT_IS_MET[requirement]()) {
    describe(title, body);
    return;
  }
  const namedTitle = titleNamingTheUnmetRequirement(title, requirement);
  if (everyToolIsRequired()) {
    test(namedTitle, () => failBecauseRequirementIsUnmet(requirement));
    return;
  }
  skippedSpecs.push({ title, unmetRequirement: requirement });
  describe.skip(namedTitle, body);
}

function testWhenRequirementIsMet(requirement: SpecRequirement, claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  if (REQUIREMENT_IS_MET[requirement]()) {
    test(claim, body, timeoutMilliseconds);
    return;
  }
  const namedClaim = titleNamingTheUnmetRequirement(claim, requirement);
  if (everyToolIsRequired()) {
    test(namedClaim, () => failBecauseRequirementIsUnmet(requirement));
    return;
  }
  skippedSpecs.push({ title: claim, unmetRequirement: requirement });
  test.skip(namedClaim, body);
}

export function describeWhenGitIsPresent(title: string, body: () => void): void {
  describeWhenRequirementIsMet('git', title, body);
}

export function testWhenGitIsPresent(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('git', claim, body, timeoutMilliseconds);
}

/** For a spec that plays recorded git (`src/testing/RecordedGit.ts`) and starts no git process. */
export function describeWhenGitIsRecorded(title: string, body: () => void): void {
  describeWhenRequirementIsMet('git-recording', title, body);
}

export function testWhenGitIsRecorded(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('git-recording', claim, body, timeoutMilliseconds);
}

type RecordingRequirements = readonly [RecordedBoundaryRequirement, ...RecordedBoundaryRequirement[]];

/** For a spec of the Watcher stages (`src/testing/RecordedWatcherStages.ts`), which play all three. */
export const EVERY_RECORDING_REQUIREMENT: RecordingRequirements = ['git-recording', 'process-table-recording', 'local-endpoint-recording'];

/** The first requirement with no recording for this OS, or the first of all when each one is recorded. */
function decidingRequirementOf(requirements: RecordingRequirements): RecordedBoundaryRequirement {
  return requirements.find((requirement) => !REQUIREMENT_IS_MET[requirement]()) ?? requirements[0];
}

/** For a spec that plays the recorded process table (`src/testing/RecordedProcessTable.ts`) or local endpoint, and maybe git too. */
export function describeWhenRecorded(requirements: RecordingRequirements, title: string, body: () => void): void {
  describeWhenRequirementIsMet(decidingRequirementOf(requirements), title, body);
}

export function testWhenRecorded(requirements: RecordingRequirements, claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet(decidingRequirementOf(requirements), claim, body, timeoutMilliseconds);
}

/** For a spec predicting merges: git with `merge-tree --write-tree` and `--stdin`. */
export function describeWhenGitMergeTreeStdinIsPresent(title: string, body: () => void): void {
  describeWhenRequirementIsMet('git-merge-tree-stdin', title, body);
}

/** For a spec proving what a Seatbelt profile really refuses a child. */
export function testWhenSandboxExecApplies(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('sandbox-exec', claim, body, timeoutMilliseconds);
}

export function testWhenBashIsPresent(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('bash', claim, body, timeoutMilliseconds);
}

/** For a spec whose spawned child must reach a tracker outside every temp folder: `TMPDIR` moves the child's `tmpdir()`, never these two. */
export function testWhenTheScratchRootIsOutsideTmp(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('scratch-root-outside-tmp', claim, body, timeoutMilliseconds);
}

/** For a check that loads a page in headless Chrome. */
export function testWhenChromeIsPresent(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('chrome', claim, body, timeoutMilliseconds);
}

/** For a spec of what only the macOS adapter promises: a Linux start stamp counts ticks since boot, not epoch seconds. */
export function testWhenOnMacOs(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('macos', claim, body, timeoutMilliseconds);
}

/** For a spec proving that a permission bit refuses a write; `src/SpecSkips.spec.ts` holds the exact list of its callers. */
export function testWhenNotRunningAsRoot(claim: string, body: SpecBody, timeoutMilliseconds?: number): void {
  testWhenRequirementIsMet('not-root', claim, body, timeoutMilliseconds);
}

export function skippedSpecsSoFar(): readonly SkippedSpec[] {
  return [...skippedSpecs];
}
