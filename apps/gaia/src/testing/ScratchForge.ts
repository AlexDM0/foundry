/**
 * A forge for the forge recording specs: the program `GAIA_RECORDING_FORGE_PROGRAM` names, run under a scratch home in scratch
 * repositories, never anywhere else. Every run pins `FORGE_ROOT` to its own working directory, so the forge's walk up for a tracker never
 * reaches a board above the scratch root, and launches the forge's scripted fake agent, so nothing spends a subscription. What a recording
 * keeps passes through `exampleTextOf`, which replaces the scratch paths and the values each run draws afresh with fixed example values.
 * Test-only.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';

import {
  realProcessRun,
  type FinishedRunAnswer,
  type ProcessRun,
  type ProgramRunRequest,
} from '../lib/process-run/ProcessRun.ts';
import { environmentCopy, forgeProgramToRecordFrom } from '../services/Environment.ts';

import {
  createScratchDirectory,
  pathLiesInsideScratchRoot,
  removeScratchPath,
  scratchForgeLinkRoot,
} from './ScratchRoot.ts';

/** One value a recording keeps in place of what this run drew: a scratch path, a tracker id, a port or a process id. */
export interface ExampleValue {
  readonly drawn:   string;
  readonly example: string;
}

export interface ScratchForge {
  readonly home:                 () => string;
  /** The real process-run with the forge's environment; it refuses a working directory outside the scratch root. */
  readonly processRun:           ProcessRun;
  /** The same, with `openerFolder` first on `PATH`, where `forge open` finds a stand-in for the browser opener; `null` changes nothing. */
  readonly processRunWithOpener: (openerFolder: string | null) => ProcessRun;
  /** A git repository below the scratch root, for one board. */
  readonly createRepository:     (folderName: string) => Promise<string>;
  /** Runs the forge program in `repository` and answers how it finished; any other answer fails the recording. */
  readonly run:                  (repository: string, programArguments: readonly string[]) => Promise<FinishedRunAnswer>;
  /** Runs a verb that must succeed and answers its JSON document. */
  readonly runForDocument:       (repository: string, programArguments: readonly string[]) => Promise<Record<string, unknown>>;
  /** The registry entry of the board in `repository`, as the forge wrote it under the scratch home. */
  readonly registryEntryOf:      (trackerId: string) => Record<string, unknown> | null;
  readonly exampleValueFor:      (exampleValue: ExampleValue) => void;
  /** `text` with every value drawn by this run replaced by its example, the longest first so no path is replaced inside another. */
  readonly exampleTextOf:        (text: string) => string;
  /** Stops each Overseer still live in the scratch repositories, ends what still runs from them, and removes them, then the scratch home. */
  readonly remove:               () => Promise<void>;
}

/** What a recording asks of its scratch forge beyond the program `GAIA_RECORDING_FORGE_PROGRAM` names, run with the forge's defaults. */
export interface ScratchForgeOptions {
  /** The forge program to run in place of the one `GAIA_RECORDING_FORGE_PROGRAM` names, such as a forge from before system versions. */
  readonly program?:        string;
  /** Forge's own settings beside its repository override and fake agent, such as `FORGE_VERSIONS_ANSWER`. */
  readonly forgeVariables?: Readonly<Record<string, string>>;
}

/** The forge's own variables: its repository override and its scripted fake agent. */
const FORGE_ROOT_VARIABLE = 'FORGE_ROOT';
const FORGE_FAKE_AGENT_VARIABLE = 'FORGE_FAKE_AGENT';
const FORGE_RUN_TIMEOUT_MILLISECONDS = 120_000;
const GIT_TIMEOUT_MILLISECONDS = 30_000;
const PROCESS_LIST_TIMEOUT_MILLISECONDS = 10_000;
/** `pgrep`'s exit code when no process matches. */
const NO_PROCESS_MATCHED_EXIT_CODE = 1;
const MONITOR_FOLDER_NAME = '.forge-monitor';
const SHORT_HOME_LINK_NAME = 'home';
const REGISTRY_FILE_NAME = 'projects.json';

export function forgeProgramToRun(recordingName: string): string {
  const forgeProgram = forgeProgramToRecordFrom();
  if (forgeProgram === null) throw new Error(`Name the forge program to record from: GAIA_RECORDING_FORGE_PROGRAM=<path> bun run record ${recordingName}.`);
  return forgeProgram;
}

function refuseOutsideTheScratchRoot(workingDirectory: string): void {
  if (!pathLiesInsideScratchRoot(workingDirectory)) throw new Error(`A scratch forge runs only below the scratch root, and was asked to run in ${workingDirectory}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tries every repository past a failed one and rethrows the first failure; a repository leaves the list only once it is gone, so a second
 * call retries the rest.
 */
export async function removeEachRepository(repositories: string[], stopAndRemoveRepository: (repository: string) => Promise<void>): Promise<void> {
  const failures: unknown[] = [];
  for (const repository of [...repositories]) {
    try {
      await stopAndRemoveRepository(repository);
      repositories.splice(repositories.indexOf(repository), 1);
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length > 0) throw failures[0];
}

/** Removes one scratch forge's link folder, then the link root once no other scratch forge's link is left in it. */
export function removeShortHomeLink(shortHomeLinkFolder: string, linkRoot: string): void {
  rmSync(shortHomeLinkFolder, { recursive: true, force: true });
  if (existsSync(linkRoot) && readdirSync(linkRoot).length === 0) rmdirSync(linkRoot);
}

export function createScratchForge(recordingName: string, options: ScratchForgeOptions = {}): ScratchForge {
  const program   = options.program ?? forgeProgramToRun(recordingName);
  const forgeHome = createScratchDirectory('forge-home');
  mkdirSync(scratchForgeLinkRoot(), { recursive: true });
  const shortHomeLinkFolder = mkdtempSync(join(scratchForgeLinkRoot(), 'forge-'));
  const shortForgeHome = join(shortHomeLinkFolder, SHORT_HOME_LINK_NAME);
  symlinkSync(forgeHome, shortForgeHome);
  const repositories: string[]   = [];
  const exampleValues: ExampleValue[] = [{ drawn: program, example: '/Users/example/.bun/bin/forge' }];

  function forgeEnvironmentFor(workingDirectory: string, openerFolder: string | null): Record<string, string> {
    const environment = environmentCopy();
    const searchPath  = openerFolder === null ? environment['PATH'] ?? '' : `${openerFolder}${delimiter}${environment['PATH'] ?? ''}`;
    return {
      ...environment,
      ...options.forgeVariables,
      PATH:                        searchPath,
      HOME:                        shortForgeHome,
      [FORGE_ROOT_VARIABLE]:       workingDirectory,
      [FORGE_FAKE_AGENT_VARIABLE]: '1',
    };
  }

  /** Each start reads the environment afresh, so `FORGE_ROOT` is the working directory of the request being started. */
  function processRunIn(workingDirectory: string, openerFolder: string | null): ProcessRun {
    refuseOutsideTheScratchRoot(workingDirectory);
    return realProcessRun(() => forgeEnvironmentFor(workingDirectory, openerFolder));
  }

  function processRunWithOpener(openerFolder: string | null): ProcessRun {
    return {
      run:           (request: ProgramRunRequest) => processRunIn(request.workingDirectory, openerFolder).run(request),
      startOwned:    (request) => processRunIn(request.workingDirectory, openerFolder).startOwned(request),
      startDetached: (request) => processRunIn(request.workingDirectory, openerFolder).startDetached(request),
    };
  }

  const processRun = processRunWithOpener(null);

  async function run(repository: string, programArguments: readonly string[]): Promise<FinishedRunAnswer> {
    const answer = await processRun.run({
      program, programArguments, workingDirectory: repository, timeoutMilliseconds: FORGE_RUN_TIMEOUT_MILLISECONDS,
    });
    if (answer.verdict !== 'finished') throw new Error(`forge ${programArguments.join(' ')} answered ${JSON.stringify(answer)}`);
    return answer;
  }

  async function runForDocument(repository: string, programArguments: readonly string[]): Promise<Record<string, unknown>> {
    const answer = await run(repository, programArguments);
    if (answer.exitCode !== 0) throw new Error(`forge ${programArguments.join(' ')} answered ${JSON.stringify(answer)}`);
    const document = JSON.parse(answer.standardOutput) as unknown;
    if (!isRecord(document)) throw new Error(`forge ${programArguments.join(' ')} printed no JSON object: ${answer.standardOutput}`);
    return document;
  }

  async function createRepository(folderName: string): Promise<string> {
    const repository = createScratchDirectory(folderName);
    repositories.push(repository);
    const gitInit = await realProcessRun(environmentCopy).run({
      program: 'git', programArguments: ['init', '--quiet'], workingDirectory: repository, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS,
    });
    if (gitInit.verdict !== 'finished' || gitInit.exitCode !== 0) throw new Error(`git init answered ${JSON.stringify(gitInit)}`);
    return repository;
  }

  function registryEntryOf(trackerId: string): Record<string, unknown> | null {
    const registryPath = join(forgeHome, MONITOR_FOLDER_NAME, REGISTRY_FILE_NAME);
    if (!existsSync(registryPath)) return null;
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as unknown;
    const projects = isRecord(registry) && isRecord(registry['projects']) ? registry['projects'] : {};
    const entry = Object.hasOwn(projects, trackerId) ? projects[trackerId] : null;
    return isRecord(entry) ? entry : null;
  }

  function exampleTextOf(text: string): string {
    const homeExamples = [{ drawn: forgeHome, example: '/Users/example' }, { drawn: shortForgeHome, example: '/Users/example' }];
    const longestFirst = [...exampleValues, ...homeExamples].sort((a, b) => b.drawn.length - a.drawn.length);
    return longestFirst.reduce((exampleText, { drawn, example }) => exampleText.replaceAll(drawn, example), text);
  }

  /** The processes still running from the repository's own files, such as Talos and its agent, which outlive an Overseer's stop. */
  async function processIdsRunningFrom(repository: string): Promise<number[]> {
    const listed = await realProcessRun(environmentCopy).run({
      program: 'pgrep', programArguments: ['-f', repository], workingDirectory: repository, timeoutMilliseconds: PROCESS_LIST_TIMEOUT_MILLISECONDS,
    });
    if (listed.verdict !== 'finished' || (listed.exitCode !== 0 && listed.exitCode !== NO_PROCESS_MATCHED_EXIT_CODE)) {
      throw new Error(`pgrep answered ${JSON.stringify(listed)}`);
    }
    return listed.standardOutput.split('\n').filter((line) => line.trim() !== '').map(Number);
  }

  async function stopAndRemoveRepository(repository: string): Promise<void> {
    if (existsSync(join(repository, '.forge'))) await run(repository, ['stop', '--now', '--json']);
    for (const processId of await processIdsRunningFrom(repository)) process.kill(processId, 'SIGKILL');
    removeScratchPath(repository);
  }

  async function remove(): Promise<void> {
    await removeEachRepository(repositories, stopAndRemoveRepository);
    removeScratchPath(forgeHome);
    removeShortHomeLink(shortHomeLinkFolder, scratchForgeLinkRoot());
  }

  return {
    home:            () => forgeHome,
    processRun,
    processRunWithOpener,
    createRepository,
    run,
    runForDocument,
    registryEntryOf,
    exampleValueFor: (exampleValue) => exampleValues.push(exampleValue),
    exampleTextOf,
    remove,
  };
}
