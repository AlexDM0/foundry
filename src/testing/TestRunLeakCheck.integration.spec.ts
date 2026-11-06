/**
 * The leak check of `src/testing/TestRunReport.ts`, watched failing on one planted leak of each kind. Each case runs `bun test` in a child
 * whose working directory is a scratch folder, never this checkout. What matters: a run that leaves nothing passes; an entry left in the
 * run's temp folder, an entry put straight in the shared scratch root and a process still working in a run folder (an Overseer successor
 * among them) each fail the run and are named, the full report on standard error; and a case its deadline cut short stops the successor
 * it started in its own teardown. A parallel run's planted shared-root entry may join a report, so a case counts only its own line.
 * The child runs and the processes are real; the child finds no git on its PATH, so it checks no git state.
 * `TestRunLeakCheck.gitState.spec.ts` holds the git side of the check: a worktree, a branch and a new file in the repository, and a
 * branch another process makes with no worktree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join }     from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from './ChildProcessCaseTimeout.ts';
import { inheritedEnvironment }                           from './InheritedEnvironment.ts';
import { processIsRunning }                               from './ProcessesInFolder.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { SHARED_SCRATCH_ROOT }                            from './TrackerIsolation.ts';

const TEST_RUN_REPORT_MODULE_PATH = join(import.meta.dir, 'TestRunReport.ts');
const SCRATCH_WORKSPACE_PATH      = join(import.meta.dir, 'ScratchWorkspace.ts');
const PROCESSES_IN_FOLDER_PATH    = join(import.meta.dir, 'ProcessesInFolder.ts');
const ENVIRONMENT_PATH            = join(import.meta.dir, '..', 'shared', 'Environment.ts');
const FIXTURE_FILE_NAME           = 'LeakFixture.spec.ts';
const CUT_SHORT_DEADLINE_MILLISECONDS = 200;
/** Only the command line of an Overseer successor, which the planted process carries; split, so no guard reads it as an Overseer start. */
const SUCCESSOR_ARGUMENTS = 'oversee --successor-of 1'.split(' ');

let repositoryDirectory = '';
let recordDirectory     = '';
let plantedScratchRootEntry = '';

interface FinishedTestRun {
  readonly exitCode:      number;
  readonly output:        string;
  readonly standardError: string;
}

beforeEach(() => {
  repositoryDirectory     = createScratchDirectory('leak-check');
  recordDirectory         = createScratchDirectory('leak-check-records');
  plantedScratchRootEntry = join(SHARED_SCRATCH_ROOT, `planted-${basename(repositoryDirectory)}`);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(`${repositoryDirectory}-worktrees`);
  removeScratchDirectory(recordDirectory);
  removeScratchDirectory(plantedScratchRootEntry);
});

/**
 * A fixture process that lives until it is stopped, working in the fixture's `plantedFolder` under its run folder, spawned without Bun's
 * flag that ends a child with its parent, as an Overseer spawns its successor; its pid is written where the case reads it.
 */
function plantedProcessSource(extraArguments: readonly string[]): string {
  const spawnerScript = [
    `const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)', ...${JSON.stringify(extraArguments)}],`,
    '  { stdin: \'ignore\', stdout: \'ignore\', stderr: \'ignore\' });',
    'child.unref();',
    'console.log(child.pid);',
  ].join(' ');
  return [
    `  const spawner = Bun.spawnSync([process.execPath, '-e', ${JSON.stringify(spawnerScript)}], {`,
    '    cwd: plantedFolder, env: outlivingProgramEnvironment(), stdout: \'pipe\', stderr: \'ignore\',',
    '  });',
    `  writeFileSync(${JSON.stringify(join(recordDirectory, 'planted-pid'))}, spawner.stdout.toString().trim());`,
  ].join('\n');
}

interface FixtureParts {
  readonly plantedBody:       string;
  readonly teardown?:         string;
  readonly deadlineArgument?: string;
}

function fixtureSource({ plantedBody, teardown = '', deadlineArgument = '' }: FixtureParts): string {
  return [
    'import { mkdirSync, writeFileSync } from \'node:fs\';',
    'import { tmpdir } from \'node:os\';',
    'import { join } from \'node:path\';',
    'import { afterEach, expect, test } from \'bun:test\';',
    `import { createScratchDirectory } from ${JSON.stringify(SCRATCH_WORKSPACE_PATH)};`,
    `import { stopProcessesReachingInto } from ${JSON.stringify(PROCESSES_IN_FOLDER_PATH)};`,
    `import { outlivingProgramEnvironment } from ${JSON.stringify(ENVIRONMENT_PATH)};`,
    `const repository = ${JSON.stringify(repositoryDirectory)};`,
    'const plantedFolder = createScratchDirectory(\'planted-process\');',
    'void [mkdirSync, writeFileSync, tmpdir, join, stopProcessesReachingInto, outlivingProgramEnvironment, repository, afterEach];',
    teardown,
    'test(\'plants\', async () => {',
    plantedBody,
    '  expect(true).toBe(true);',
    `}${deadlineArgument});`,
  ].join('\n');
}

function testRunOf(source: string): FinishedTestRun {
  writeFileSync(join(repositoryDirectory, FIXTURE_FILE_NAME), source);
  const finished = Bun.spawnSync([process.execPath, 'test', '--preload', TEST_RUN_REPORT_MODULE_PATH, `./${FIXTURE_FILE_NAME}`], {
    cwd:    repositoryDirectory,
    env:    { ...inheritedEnvironment(), PATH: dirname(process.execPath) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const standardError = finished.stderr.toString();
  return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}\n${standardError}`, standardError };
}

function plantedProcessId(): number {
  return Number(readFileSync(join(recordDirectory, 'planted-pid'), 'utf8'));
}

test('a run that leaves only its run folders and Node\'s compile cache passes, and prints no leak report', () => {
  const plantedBody = '  createScratchDirectory(\'kept-until-the-run-ends\');\n  mkdirSync(join(tmpdir(), \'node-compile-cache\'));';
  const { exitCode, output } = testRunOf(fixtureSource({ plantedBody }));
  expect(exitCode, output).toBe(0);
  expect(output).not.toContain('thing(s) behind');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an entry left in the run\'s temp folder fails the run, named', () => {
  const { exitCode, output } = testRunOf(fixtureSource({ plantedBody: '  writeFileSync(join(tmpdir(), \'planted-temporary-entry\'), \'\');' }));
  expect(exitCode, output).not.toBe(0);
  expect(output).toMatch(/The test run left \d+ thing\(s\) behind:/);
  expect(output).toMatch(/planted-temporary-entry was left in the run's temp folder/);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a failed run prints the full leak report on standard error, whatever Bun shows for the throw', () => {
  const { exitCode, standardError } = testRunOf(fixtureSource({ plantedBody: '  writeFileSync(join(tmpdir(), \'planted-temporary-entry\'), \'\');' }));
  expect(exitCode, standardError).not.toBe(0);
  expect(standardError).toMatch(/The test run left \d+ thing\(s\) behind:\n(?: {2}.*\n)*? {2}\S*planted-temporary-entry was left in the run's temp folder/);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an entry put straight in the shared scratch root fails the run, named', () => {
  const { exitCode, output } = testRunOf(fixtureSource({ plantedBody: `  mkdirSync(${JSON.stringify(plantedScratchRootEntry)});` }));
  expect(exitCode, output).not.toBe(0);
  expect(output).toContain(`${plantedScratchRootEntry} was left in the shared scratch root`);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a process still working in a run folder fails the run, named, and the check stops it', () => {
  const { exitCode, output } = testRunOf(fixtureSource({ plantedBody: plantedProcessSource([]) }));
  expect(exitCode, output).not.toBe(0);
  expect(output).toContain(`a process ${plantedProcessId()} (`);
  expect(output).toContain('still ran; the check stopped it');
  expect(processIsRunning(plantedProcessId())).toBe(false);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an Overseer successor left running fails the run, named by its command line', () => {
  const { exitCode, output } = testRunOf(fixtureSource({ plantedBody: plantedProcessSource(SUCCESSOR_ARGUMENTS) }));
  expect(exitCode, output).not.toBe(0);
  expect(output).toMatch(new RegExp(`a process ${plantedProcessId()} \\(.*oversee --successor-of 1\\) still ran`));
  expect(processIsRunning(plantedProcessId())).toBe(false);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a case its deadline cut short stops, in its teardown, the successor it started', () => {
  const { exitCode, output } = testRunOf(fixtureSource({
    plantedBody:      `${plantedProcessSource(SUCCESSOR_ARGUMENTS)}\n  await new Promise(() => {});`,
    teardown:         'afterEach(async () => { await stopProcessesReachingInto(plantedFolder); });',
    deadlineArgument: `, ${CUT_SHORT_DEADLINE_MILLISECONDS}`,
  }));
  expect(exitCode, output).not.toBe(0);
  expect(output).toContain('timed out after');
  expect(output).not.toContain('still ran');
  expect(processIsRunning(plantedProcessId())).toBe(false);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
