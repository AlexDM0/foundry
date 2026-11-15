/**
 * The compiled launcher `setup.ts` installs, run in a scratch repository that plants a bunfig preload and a `.env`. The cases that matter:
 * the planted preload stays unrun and the planted variable unset, for a command and for the hook; a missing preload path leaves the exit
 * code alone; the exit code and both streams match the direct run; and the program command the Overseer, its successor and the
 * install-change watch start from (`cli/CommandContext.ts`) is isolated the same way. Each claim is first watched failing without the
 * isolation, so the planting is proved to work.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
}                                                         from 'bun:test';
import { versionsFromTheBinary }                                          from '../src/services/overseer/InstallChangeWatch.ts';
import { ROOT_OVERRIDE_VARIABLE }                                         from '../src/shared/Environment.ts';
import { ToolRuntimeUtil }                                                from '../src/shared/ToolRuntimeUtil.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                        from '../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDirectory, removeScratchDirectory }                 from '../src/testing/ScratchWorkspace.ts';
import { childEnvironmentOf, runAgentProgress, type AgentProgressResult } from './testing/CliProcess.ts';

const CHECKOUT_ROOT = join(import.meta.dir, '..');
const ENTRY_POINT = join(CHECKOUT_ROOT, 'agent-progress.ts');
const PRELOAD_MARKER_FILE_NAME = 'planted-preload-ran';

let scratchDirectory = '';
let launcherPath = '';
let homeDirectory = '';
let plantedRepository = '';
let plantedRootOverride = '';
let missingPreloadRepository = '';
let cleanRepository = '';

function compileLauncher(outputPath: string): void {
  const compiled = Bun.spawnSync([
    process.execPath,
    'build',
    '--compile',
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--define',
    `LAUNCHER_BUN_PATH=${JSON.stringify(process.execPath)}`,
    '--define',
    `LAUNCHER_TOOL_DIRECTORY=${JSON.stringify(CHECKOUT_ROOT)}`,
    join(CHECKOUT_ROOT, 'launcher.ts'),
    '--outfile',
    outputPath,
  ], { cwd: CHECKOUT_ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (compiled.exitCode !== 0) throw new Error(`the launcher did not compile: ${compiled.stderr.toString()}`);
}

/** A preload that leaves a marker beside itself, and a `.env` pointing the root override at another scratch folder. */
function plantBunfigAndDotEnv(repository: string): void {
  writeFileSync(join(repository, 'bunfig.toml'), 'preload = ["./planted-preload.ts"]\n');
  writeFileSync(join(repository, 'planted-preload.ts'), `require('node:fs').writeFileSync(${JSON.stringify(join(repository, PRELOAD_MARKER_FILE_NAME))}, '');\n`);
  writeFileSync(join(repository, '.env'), `${ROOT_OVERRIDE_VARIABLE}=${plantedRootOverride}\n`);
}

/** The child gets a built environment, so the root override is unset unless the planted `.env` sets it. */
async function runLauncher(commandLineArguments: readonly string[], currentDirectory: string): Promise<AgentProgressResult> {
  const spawned = Bun.spawn([launcherPath, ...commandLineArguments], {
    cwd: currentDirectory, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: childEnvironmentOf({}, homeDirectory),
  });
  const [standardOutput, standardError, exitCode] = await Promise.all([
    new Response(spawned.stdout).text(), new Response(spawned.stderr).text(), spawned.exited,
  ]);
  return { exitCode, standardOutput, standardError };
}

function runDirectly(commandLineArguments: readonly string[], currentDirectory: string): Promise<AgentProgressResult> {
  return runAgentProgress(commandLineArguments, { currentDirectory, environment: {}, homeDirectory });
}

beforeAll(() => {
  scratchDirectory = createScratchDirectory('launcher');
  launcherPath = join(scratchDirectory, 'launcher-binary', 'agent-progress');
  compileLauncher(launcherPath);
  for (const folder of ['home', 'planted', 'planted-root-override', 'missing-preload', 'clean']) mkdirSync(join(scratchDirectory, folder));
  homeDirectory = join(scratchDirectory, 'home');
  plantedRepository = join(scratchDirectory, 'planted');
  plantedRootOverride = join(scratchDirectory, 'planted-root-override');
  missingPreloadRepository = join(scratchDirectory, 'missing-preload');
  cleanRepository = join(scratchDirectory, 'clean');
  plantBunfigAndDotEnv(plantedRepository);
  writeFileSync(join(missingPreloadRepository, 'bunfig.toml'), 'preload = ["./no-such-preload.ts"]\n');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

afterAll(() => {
  removeScratchDirectory(scratchDirectory);
});

describe('a planted bunfig preload and .env', () => {
  test('run inside the tool when it is started directly, which proves the planting', async () => {
    const result = await runDirectly(['status'], plantedRepository);
    expect(existsSync(join(plantedRepository, PRELOAD_MARKER_FILE_NAME))).toBe(true);
    expect(result.standardOutput + result.standardError).toContain(plantedRootOverride);
    removeScratchDirectory(join(plantedRepository, PRELOAD_MARKER_FILE_NAME));
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('stay unrun and unset for a command started through the launcher', async () => {
    const result = await runLauncher(['status'], plantedRepository);
    expect(existsSync(join(plantedRepository, PRELOAD_MARKER_FILE_NAME))).toBe(false);
    expect(result.standardOutput + result.standardError).not.toContain(plantedRootOverride);
    expect(result.standardOutput + result.standardError).toContain(plantedRepository);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('stay unrun for the SessionStart hook started through the launcher', async () => {
    const result = await runLauncher(['hook', 'session-start'], plantedRepository);
    expect(existsSync(join(plantedRepository, PRELOAD_MARKER_FILE_NAME))).toBe(false);
    expect(result.exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a missing preload path in a tracked bunfig', () => {
  test('makes the direct run exit 1, which proves the planting', async () => {
    expect((await runDirectly(['version', '--json'], missingPreloadRepository)).exitCode).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('leaves the exit code of a command started through the launcher alone', async () => {
    expect((await runLauncher(['version', '--json'], missingPreloadRepository)).exitCode).toBe(0);
    expect((await runLauncher(['no-such-command'], missingPreloadRepository)).exitCode).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('leaves the program command the Overseer starts its children from answering, where without the isolation it does not', async () => {
    const isolatedProgramCommand = [process.execPath, ...ToolRuntimeUtil.isolatingArgumentsOfThisCheckout(), ENTRY_POINT];
    expect(await versionsFromTheBinary([process.execPath, ENTRY_POINT], missingPreloadRepository)).toBeNull();
    expect(await versionsFromTheBinary(isolatedProgramCommand, missingPreloadRepository)).toEqual({ codeVersion: expect.any(String), installVersion: expect.any(Number) });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('the launcher', () => {
  test('passes the exit code and both streams of the tool through unchanged', async () => {
    for (const commandLineArguments of [['version', '--json'], ['no-such-command'], ['status']]) {
      expect(await runLauncher(commandLineArguments, cleanRepository)).toEqual(await runDirectly(commandLineArguments, cleanRepository));
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
