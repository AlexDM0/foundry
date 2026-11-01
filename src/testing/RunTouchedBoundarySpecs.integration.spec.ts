/**
 * The two suites, run for real: a scratch repository takes the repository's own `verify` line, `bunfig.toml` ignore and runner, with
 * the other steps stubbed, and plants a failing `*.integration.spec.ts` beside a listed boundary. A run that reached the planted spec
 * prints its marker and exits non-zero, so a clean diff proves it did not run and a touched boundary proves it did.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }                          from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';
import { repositoryRootOfThisCheckout }            from './ImportGraph.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from './ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from './ToolGuard.ts';

const CHECKOUT = repositoryRootOfThisCheckout();
const INTEGRATION_MARKER = 'PLANTED INTEGRATION SPEC RAN';
const DEFAULT_MARKER = 'PLANTED DEFAULT SPEC RAN';
const LISTED_BOUNDARY = 'src/lib/git/GitProcess.ts';
// Not the boundary's own spec, which the module rule alone would run: only `BOUNDARY_SPECS` ties this one to it.
const LISTED_BOUNDARY_SPEC = 'src/lib/git/Worktrees.integration.spec.ts';
const UNLISTED_FILE = 'src/Unlisted.ts';
const COPIED_FILES = ['src/testing/BoundarySpecs.ts', 'src/testing/RunTouchedBoundarySpecs.ts'];

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
  const repository = createScratchGitRepository('two-suites-');
  scratchRepositories.push(repository);
  plantFile(repository, 'package.json', plantedPackage());
  plantFile(repository, 'bunfig.toml', readFileSync(join(CHECKOUT, 'bunfig.toml'), 'utf8').replace(/^preload.*$/m, ''));
  plantFile(repository, 'bridge/testing/RunDomSpecs.ts', 'export {};\n');
  plantFile(repository, LISTED_BOUNDARY, 'export {};\n');
  plantFile(repository, UNLISTED_FILE, 'export {};\n');
  plantFile(repository, 'src/Default.spec.ts', `import { test } from 'bun:test';\ntest('default', () => { console.log('${DEFAULT_MARKER}'); });\n`);
  plantFile(repository, LISTED_BOUNDARY_SPEC, integrationSpecBody);
  for (const path of COPIED_FILES) plantFile(repository, path, readFileSync(join(CHECKOUT, path), 'utf8'));
  gitOutputIn(repository, ['add', '.']);
  gitOutputIn(repository, ['commit', '--quiet', '-m', 'Plant the two suites']);
  gitOutputIn(repository, ['branch', '--move', 'main']);
  gitOutputIn(repository, ['checkout', '--quiet', '-b', 'ticket-example']);
  return repository;
}

const FAILING_INTEGRATION_SPEC = `import { expect, test } from 'bun:test';\ntest('planted', () => { console.log('${INTEGRATION_MARKER}'); expect(1).toBe(2); });\n`;

function runScript(repository: string, script: string): { exitCode: number; output: string } {
  const finished = Bun.spawnSync(['bun', 'run', script], { cwd: repository, stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}${finished.stderr.toString()}` };
}

describeWhenGitIsPresent('`bun run verify` runs a real-system spec only for a touched boundary', () => {
  test('a clean diff starts the default suite and no integration spec', () => {
    const { exitCode, output } = runScript(createPlantedRepository(FAILING_INTEGRATION_SPEC), 'verify');
    expect(output).toContain(DEFAULT_MARKER);
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a committed change to an unlisted file starts no integration spec', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    commitFile(repository, UNLISTED_FILE, 'export const changed = true;\n');
    const { exitCode, output } = runScript(repository, 'verify');
    expect(output).not.toContain(INTEGRATION_MARKER);
    expect(exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a committed change to a listed boundary starts its spec, whose failure fails verify', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    commitFile(repository, LISTED_BOUNDARY, 'export const changed = true;\n');
    const { exitCode, output } = runScript(repository, 'verify');
    expect(output).toContain(INTEGRATION_MARKER);
    expect(exitCode).not.toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an uncommitted change to a listed boundary starts its spec too', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    plantFile(repository, LISTED_BOUNDARY, 'export const changed = true;\n');
    expect(runScript(repository, 'verify').output).toContain(INTEGRATION_MARKER);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a branch on a group branch answers for its own commits, not for the group\'s', () => {
    const repository = createPlantedRepository(FAILING_INTEGRATION_SPEC);
    gitOutputIn(repository, ['checkout', '--quiet', '-b', 'group-example']);
    commitFile(repository, LISTED_BOUNDARY, 'export const changed = true;\n');
    gitOutputIn(repository, ['checkout', '--quiet', '-b', 'ticket-on-the-group']);
    expect(runScript(repository, 'verify').output).not.toContain(INTEGRATION_MARKER);
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
