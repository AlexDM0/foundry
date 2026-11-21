/**
 * The two suites and the recordings, run for real: a scratch folder takes the repository's own `verify` and `record` lines,
 * `bunfig.toml` ignore and recording tools, with the other steps stubbed, and plants a `*.integration.spec.ts` under a listed boundary.
 * `verify` never reaches the planted spec, also with its boundary touched; `record` runs it and writes its answer under a stamp; and a
 * planted stale stamp fails `verify`, which names the record command.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join }           from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { recordingPathOf }                                from './BoundaryRecordings.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from './ChildProcessCaseTimeout.ts';
import { repositoryRootOfThisCheckout }                   from './ImportGraph.ts';
import { installedVersionOf }                             from './InstalledSystemVersion.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { describeWhenGitIsPresent }                       from './ToolGuard.ts';

const CHECKOUT = repositoryRootOfThisCheckout();
const INTEGRATION_MARKER = 'PLANTED INTEGRATION SPEC RAN';
const DEFAULT_MARKER = 'PLANTED DEFAULT SPEC RAN';
const LISTED_BOUNDARY = 'src/lib/git/GitProcess.ts';
const RECORD_COMMAND = `bun run record ${LISTED_BOUNDARY}`;
// Not the boundary's own spec, which the module rule alone would run: only `BOUNDARY_SPECS` ties this one to it.
const LISTED_BOUNDARY_SPEC = 'src/lib/git/Worktrees.integration.spec.ts';
const RECORDING_PATH = recordingPathOf(LISTED_BOUNDARY, process.platform);
const COPIED_FILES = [
  'src/testing/BoundaryRecordings.ts',
  'src/testing/BoundarySpecs.ts',
  'src/testing/CheckRecordingStamps.ts',
  'src/testing/InstalledSystemVersion.ts',
  'src/testing/MachineTemporaryFolder.ts',
  'src/testing/RecordBoundary.ts',
  'src/testing/RecordedAnswers.ts',
  'src/testing/RecordingStamps.ts',
  'src/testing/fake-agent/ClaudeWireRecorder.ts',
  'src/testing/fake-agent/RecordedClaudeLines.ts',
];
const PLANTED_CALL_SHAPE = 'git planted --shape';
const PLANTED_ANSWER = { exitCode: 0, stdout: 'planted answer' };

const scratchRepositories: string[] = [];

afterEach(() => {
  for (const repository of scratchRepositories.splice(0)) removeScratchDirectory(repository);
});

function plantFile(repository: string, path: string, content: string): void {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), content);
}

function plantedPackage(): string {
  const { scripts } = JSON.parse(readFileSync(join(CHECKOUT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  return JSON.stringify({ scripts: { ...scripts, typecheck: 'true', lint: 'true' } });
}

function createPlantedRepository(integrationSpecBody: string): string {
  const repository = createScratchDirectory('two-suites-');
  scratchRepositories.push(repository);
  plantFile(repository, 'package.json', plantedPackage());
  plantFile(repository, 'bunfig.toml', readFileSync(join(CHECKOUT, 'bunfig.toml'), 'utf8').replace(/^preload.*$/m, ''));
  plantFile(repository, LISTED_BOUNDARY, 'export {};\n');
  plantFile(repository, 'src/Default.spec.ts', `import { test } from 'bun:test';\ntest('default', () => { console.log('${DEFAULT_MARKER}'); });\n`);
  plantFile(repository, LISTED_BOUNDARY_SPEC, integrationSpecBody);
  for (const path of COPIED_FILES) plantFile(repository, path, readFileSync(join(CHECKOUT, path), 'utf8'));
  return repository;
}

const FAILING_INTEGRATION_SPEC = `import { expect, test } from 'bun:test';\ntest('planted', () => { console.log('${INTEGRATION_MARKER}'); expect(1).toBe(2); });\n`;

const RECORDING_INTEGRATION_SPEC = [
  'import { test } from \'bun:test\';',
  'import { recordAnswer } from \'../../testing/RecordedAnswers.ts\';',
  `test('planted', () => { console.log('${INTEGRATION_MARKER}'); recordAnswer('${PLANTED_CALL_SHAPE}', ${JSON.stringify(PLANTED_ANSWER)}); });`,
  '',
].join('\n');

function runScript(repository: string, script: string, scriptArguments: readonly string[] = []): { exitCode: number; output: string } {
  const finished = Bun.spawnSync(['bun', 'run', script, ...scriptArguments], { cwd: repository, stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}${finished.stderr.toString()}` };
}

describeWhenGitIsPresent('`bun run verify` runs no real-system spec and checks the recording stamps', () => {
  test('a clean diff starts the default suite and no integration spec, and lists the boundary with no recording', () => {
    const { exitCode, output } = runScript(createPlantedRepository(FAILING_INTEGRATION_SPEC), 'verify');
    expect(output).toContain(DEFAULT_MARKER);
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(output).toContain(`${LISTED_BOUNDARY} is not finished for ${process.platform}: it has no recording. Record it with \`${RECORD_COMMAND}\`.`);
    expect(exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a change to a listed boundary starts no integration spec', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    plantFile(repository, LISTED_BOUNDARY, 'export const changed = true;\n');
    const { exitCode, output } = runScript(repository, 'verify');
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a planted stale stamp fails verify and names the boundary and its record command', () => {
    const repository = createPlantedRepository(RECORDING_INTEGRATION_SPEC);
    expect(runScript(repository, 'record', [LISTED_BOUNDARY]).exitCode).toBe(0);
    const recording = JSON.parse(readFileSync(join(repository, RECORDING_PATH), 'utf8')) as { stamp: { version: string } };
    plantFile(repository, RECORDING_PATH, JSON.stringify({ ...recording, stamp: { ...recording.stamp, version: '0.0.0-planted' } }));
    const { exitCode, output } = runScript(repository, 'verify');
    expect(output).toContain(`The recording of ${LISTED_BOUNDARY} on ${process.platform} is stale: it is stamped git 0.0.0-planted`);
    expect(output).toContain(`Record it again with \`${RECORD_COMMAND}\`.`);
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(exitCode).not.toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describeWhenGitIsPresent('`bun run record <boundary>` records one boundary', () => {
  test('it runs the boundary\'s specs and writes their answers under a stamp of the system version and the OS, which verify accepts', () => {
    const repository = createPlantedRepository(RECORDING_INTEGRATION_SPEC);
    const recorded = runScript(repository, 'record', [LISTED_BOUNDARY]);
    expect(recorded.output).toContain(INTEGRATION_MARKER);
    expect(recorded.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(repository, RECORDING_PATH), 'utf8'))).toEqual({
      stamp: {
        boundary: LISTED_BOUNDARY, system: 'git', version: installedVersionOf('git'), os: process.platform
      },
      answers: [{ callShape: PLANTED_CALL_SHAPE, answer: PLANTED_ANSWER }],
    });
    const verified = runScript(repository, 'verify');
    expect(verified.output).not.toContain(`${LISTED_BOUNDARY} is not finished`);
    expect(verified.exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a failing spec records nothing and fails the command', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    const { exitCode, output } = runScript(repository, 'record', [LISTED_BOUNDARY]);
    expect(output).toContain(INTEGRATION_MARKER);
    expect(existsSync(join(repository, RECORDING_PATH))).toBe(false);
    expect(exitCode).not.toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a name that is no boundary fails the command and lists the boundaries', () => {
    const { exitCode, output } = runScript(createPlantedRepository(FAILING_INTEGRATION_SPEC), 'record', ['src/Unlisted.ts']);
    expect(output).toContain('src/Unlisted.ts is no boundary.');
    expect(output).toContain(`  ${LISTED_BOUNDARY}`);
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(exitCode).not.toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describeWhenGitIsPresent('`bun run verify:integration` runs every real-system spec', () => {
  test('a failing one fails the command on a clean diff', () => {
    const { exitCode, output } = runScript(createPlantedRepository(FAILING_INTEGRATION_SPEC), 'verify:integration');
    expect(output).toContain(INTEGRATION_MARKER);
    expect(output).not.toContain(DEFAULT_MARKER);
    expect(exitCode).not.toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a passing one passes the command', () => {
    const passing = `import { test } from 'bun:test';\ntest('planted', () => { console.log('${INTEGRATION_MARKER}'); });\n`;
    const { exitCode, output } = runScript(createPlantedRepository(passing), 'verify:integration');
    expect(output).toContain(INTEGRATION_MARKER);
    expect(exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
