/**
 * Programs that only record. `src/testing/ProgramTrapGuard.ts` puts their folders first on the test run's `PATH` and
 * `cli/testing/CliProcess.ts` on every spawned binary's, so any process under the run that executes a trapped program reaches its stub,
 * which notes where it ran and exits non-zero, rather than starting a real agent session or reaching the host's GnuPG.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import { afterAll, beforeAll } from 'bun:test';

import { prependToExecutableSearchPath, removeFromExecutableSearchPath } from '../shared/Environment.ts';
import { type RecordedSystem, SYSTEM_OF_BOUNDARY }                       from './BoundaryRecordings.ts';
import { BOUNDARY_SPECS, INTEGRATION_SPEC_SUFFIX }                       from './BoundarySpecs.ts';
import { repositoryRootOfThisCheckout }                                  from './ImportGraph.ts';
import { createCanonicalScratchDirectory }                               from './ScratchWorkspace.ts';
import { SHARED_SCRATCH_ROOT }                                           from './TrackerIsolation.ts';

export type TrappedProgram = 'claude' | 'gpgconf';

interface ProgramTrap {
  /** What a run that reached the program would have done, as the stub and the failure word it. */
  readonly harm:            string;
  /** The recorded system whose boundary's real-system specs may take the trap off, or `null` when no spec may. */
  readonly releasingSystem: RecordedSystem | null;
}

export const PROGRAM_TRAPS: Readonly<Record<TrappedProgram, ProgramTrap>> = {
  claude:  { harm: 'start a real agent session', releasingSystem: null },
  gpgconf: { harm: 'reach the host GnuPG', releasingSystem: 'gpg' },
};

export const TRAPPED_PROGRAMS = Object.keys(PROGRAM_TRAPS) as readonly TrappedProgram[];

export const TRAPPED_EXIT_CODE = 97;
const EXECUTABLE_FILE_MODE     = 0o755;
const TRAPS_FOLDER_NAME        = 'program-traps';
const LASTING_TRAPS_FOLDER     = join(SHARED_SCRATCH_ROOT, TRAPS_FOLDER_NAME);

let runTrapsFolder: string | null = null;
let lastingTrapsAreWritten = false;

function attemptsFileOf(trapsFolder: string): string {
  return join(trapsFolder, 'attempts.log');
}

function stubSourceOf(program: TrappedProgram, attemptsFile: string | null): string {
  return [
    '#!/bin/sh',
    ...(attemptsFile === null ? [] : [`printf '${program} executed in %s with arguments: %s\\n' "$PWD" "$*" >> '${attemptsFile}'`]),
    `echo "${program} is trapped under the test run: no spec may ${PROGRAM_TRAPS[program].harm} (src/testing/ProgramTraps.ts)" >&2`,
    `exit ${TRAPPED_EXIT_CODE}`,
    '',
  ].join('\n');
}

/** Written beside and renamed into place, so a run starting meanwhile never executes a half-written stub. */
function writeStub(program: TrappedProgram, programFolder: string, attemptsFile: string | null, writerName: string): void {
  mkdirSync(programFolder, { recursive: true });
  const stubPath        = join(programFolder, program);
  const writtenStubPath = join(programFolder, `${program}-${writerName}`);
  writeFileSync(writtenStubPath, stubSourceOf(program, attemptsFile));
  chmodSync(writtenStubPath, EXECUTABLE_FILE_MODE);
  renameSync(writtenStubPath, stubPath);
}

/** The recording stubs' folder, made once per run in the run's scratch folder, which the end of the run removes. */
function runTrapsFolderMadeOnce(): string {
  if (runTrapsFolder !== null) return runTrapsFolder;
  const folder = createCanonicalScratchDirectory(TRAPS_FOLDER_NAME);
  for (const program of TRAPPED_PROGRAMS) writeStub(program, join(folder, program), attemptsFileOf(folder), 'run');
  runTrapsFolder = folder;
  return folder;
}

function lastingTrapsWrittenOnce(): void {
  if (lastingTrapsAreWritten) return;
  for (const program of TRAPPED_PROGRAMS) writeStub(program, join(LASTING_TRAPS_FOLDER, program), null, `${process.pid}`);
  lastingTrapsAreWritten = true;
}

/**
 * The run's stub first, then one that records nothing and outlasts every run, so a process outliving the run still finds a stub
 * rather than the real program. Each program has folders of its own, so one real-system spec can take one trap off.
 */
export function trapFoldersOf(program: TrappedProgram): readonly string[] {
  const folder = runTrapsFolderMadeOnce();
  lastingTrapsWrittenOnce();
  return [join(folder, program), join(LASTING_TRAPS_FOLDER, program)];
}

/** Every trapped program's folders, the run's recording stubs ahead of the lasting ones. */
export function programTrapFolders(): readonly string[] {
  const folder = runTrapsFolderMadeOnce();
  lastingTrapsWrittenOnce();
  return [...TRAPPED_PROGRAMS.map((program) => join(folder, program)), ...TRAPPED_PROGRAMS.map((program) => join(LASTING_TRAPS_FOLDER, program))];
}

/** Every attempt recorded since the last take, one line each, cleared as it is read. */
export function takeTrappedProgramAttempts(): string[] {
  if (runTrapsFolder === null) return [];
  const attemptsFile = attemptsFileOf(runTrapsFolder);
  if (!existsSync(attemptsFile)) return [];
  const attempts = readFileSync(attemptsFile, 'utf8').split('\n').filter((line) => line !== '');
  rmSync(attemptsFile, { force: true });
  return attempts;
}

export function failOnAnyTrappedProgramAttempt(): void {
  const attempts = takeTrappedProgramAttempts();
  if (attempts.length === 0) return;
  throw new Error(`No spec may run a trapped program (src/testing/ProgramTraps.ts), but one ran ${attempts.length} time(s): ${attempts.join('; ')}`);
}

interface SpawnOptionsWithEnvironment {
  env?: Record<string, string | undefined>;
}

/** Bun's spawn without `env` uses the environment as it was at start, before the traps; it is handed the given one instead. */
export function withTheEnvironment(spawnArguments: unknown[], environment: Record<string, string>): unknown[] {
  const [commandOrOptions, options] = spawnArguments;
  if (Array.isArray(commandOrOptions)) {
    const givenOptions = (options ?? {}) as SpawnOptionsWithEnvironment;
    return [commandOrOptions, { ...givenOptions, env: givenOptions.env ?? environment }];
  }
  const givenOptions = commandOrOptions as SpawnOptionsWithEnvironment;
  return [{ ...givenOptions, env: givenOptions.env ?? environment }];
}

interface WhichOptions {
  PATH?: string;
  cwd?:  string;
}

/** `Bun.which` without `PATH` searches the one from process start, before the traps, as spawn does; it is handed the given one instead. */
export function withTheSearchPath(whichArguments: unknown[], searchPath: string): unknown[] {
  const [programName, options] = whichArguments;
  const givenOptions = (options ?? {}) as WhichOptions;
  return [programName, { ...givenOptions, PATH: givenOptions.PATH ?? searchPath }];
}

export type TrapReleaseVerdict = { verdict: 'released' } | { verdict: 'refused'; reason: string };

/** Derived, never listed: a real-system spec that `BOUNDARY_SPECS` lists under a boundary whose recorded system is the program's own. */
export function trapReleaseVerdictOf(program: TrappedProgram, specPath: string): TrapReleaseVerdict {
  const { releasingSystem } = PROGRAM_TRAPS[program];
  if (releasingSystem === null) return { verdict: 'refused', reason: `no spec may take the ${program} trap off` };
  if (!specPath.endsWith(INTEGRATION_SPEC_SUFFIX)) return { verdict: 'refused', reason: `${specPath} is no real-system spec` };
  const releasingBoundaries = BOUNDARY_SPECS.filter(({ boundary, specs }) => specs.includes(specPath)
    && Object.hasOwn(SYSTEM_OF_BOUNDARY, boundary) && SYSTEM_OF_BOUNDARY[boundary] === releasingSystem);
  return releasingBoundaries.length > 0
    ? { verdict: 'released' }
    : { verdict: 'refused', reason: `${specPath} is listed under no boundary of the ${releasingSystem} system in src/testing/BoundarySpecs.ts` };
}

/**
 * Call at a real-system spec file's top level with `import.meta.path`: the file's cases reach the real program, and the file's end puts
 * the trap back. Refused, it throws as the file loads.
 */
export function releaseTrappedProgramForThisSpecFile(program: TrappedProgram, specFilePath: string): void {
  const specPath = relative(repositoryRootOfThisCheckout(), specFilePath).split(sep).join('/');
  const release = trapReleaseVerdictOf(program, specPath);
  if (release.verdict === 'refused') throw new Error(`The ${program} trap stays on: ${release.reason}.`);
  const folders = trapFoldersOf(program);
  beforeAll(() => {
    for (const folder of folders) removeFromExecutableSearchPath(folder);
  });
  afterAll(() => {
    for (const folder of [...folders].reverse()) prependToExecutableSearchPath(folder);
  });
}
