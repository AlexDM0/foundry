/**
 * The turbo gate. What matters: it takes exactly one workspace name and refuses anything else with the usage; and, end to end in a scratch
 * workspace, a first gate runs the task and reports a miss where forge asked for a report, the same gate again replays it and reports a
 * hit, both close with the workspace's own check, and a gate forge handed no path writes no report.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { GATE_REPORT_VARIABLE }              from './GateCacheReport.ts';
import { gateWorkspaceOf, TURBO_GATE_USAGE } from './TurboGate.ts';

const SCRATCH_ROOT = join(import.meta.dir, '.scratch');
const WORKSPACE_TOOLS_FOLDER = join(import.meta.dir, '..', 'node_modules', '.bin');
const TURBO_GATE_SCRIPT = join(import.meta.dir, 'TurboGate.ts');
const END_TO_END_CASE_TIMEOUT_MILLISECONDS = 60_000;
/** The check's only trace, since a gate shows a passing task's output to nobody. */
const CHECK_MARKER = 'checked.marker';

describe('the request', () => {
  test('takes one workspace name and refuses none, two or a flag', () => {
    expect([gateWorkspaceOf(['forge']), gateWorkspaceOf([]), gateWorkspaceOf(['forge', 'gaia']), gateWorkspaceOf(['--filter=forge'])])
      .toEqual(['forge', null, null, null]);
  });

  test('the usage names the workspace argument', () => {
    expect(TURBO_GATE_USAGE).toContain('bun scripts/TurboGate.ts <workspace>');
  });
});

describe('the gate', () => {
  let scratchFolder = '';

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    scratchFolder = mkdtempSync(join(SCRATCH_ROOT, 'turbo-gate-'));
    mkdirSync(join(scratchFolder, 'home'), { recursive: true });
    mkdirSync(join(scratchFolder, 'temporary'), { recursive: true });
  });

  afterAll(() => {
    rmSync(scratchFolder, { recursive: true, force: true });
  });

  function runIn(folder: string, command: readonly string[], extraEnvironment: Record<string, string> = {}): { exitCode: number; output: string } {
    const finished = Bun.spawnSync([...command], {
      cwd: folder,
      env: {
        // The workspace's `turbo` first, as `bun run` puts it; the rest of the search path finds the `node` its launcher runs on.
        PATH:                     `${WORKSPACE_TOOLS_FOLDER}:${process.env['PATH'] ?? ''}`,
        HOME:                     join(scratchFolder, 'home'),
        TMPDIR:                   join(scratchFolder, 'temporary'),
        TURBO_TELEMETRY_DISABLED: '1',
        GIT_CONFIG_NOSYSTEM:      '1',
        ...extraEnvironment,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}${finished.stderr.toString()}` };
  }

  /** A workspace of one package with a green spec and a check, committed, so turbo hashes it from git. */
  function scratchWorkspace(): string {
    const repositoryFolder = mkdtempSync(join(scratchFolder, 'repository-'));
    mkdirSync(join(repositoryFolder, 'packages', 'example'), { recursive: true });
    writeFileSync(join(repositoryFolder, 'package.json'), JSON.stringify({
      name:           'example-workspace',
      private:        true,
      packageManager: 'bun@1.4.2',
      workspaces:     ['packages/*'],
    }));
    const cachedTasks = Object.fromEntries(['typecheck', 'lint', 'test', 'test:dom'].map((task) => [task, { outputs: [] }]));
    writeFileSync(join(repositoryFolder, 'turbo.json'), JSON.stringify({ tasks: { ...cachedTasks, check: { cache: false } } }));
    writeFileSync(join(repositoryFolder, '.gitignore'), `.turbo/\nnode_modules/\n${CHECK_MARKER}\n`);
    const examplePackage = { name: 'example', private: true, scripts: { test: 'bun test', check: `touch ${CHECK_MARKER}` } };
    writeFileSync(join(repositoryFolder, 'packages', 'example', 'package.json'), JSON.stringify(examplePackage));
    const greenSpec = 'import { expect, test } from "bun:test";\n\ntest("passes", () => { expect(1).toBe(1); });\n';
    writeFileSync(join(repositoryFolder, 'packages', 'example', 'Example.spec.ts'), greenSpec);
    const git = ['git', '-c', 'user.name=Alex Example', '-c', 'user.email=alex@example.com'];
    for (const gitArguments of [['init', '--quiet', '--initial-branch=main'], ['add', '--all'], ['commit', '--quiet', '--message=Example']]) {
      expect(runIn(repositoryFolder, [...git, ...gitArguments]).exitCode).toBe(0);
    }
    return repositoryFolder;
  }

  test('end to end, reports a miss on the first run and a hit on the next, each closed by the check', () => {
    const repositoryFolder = scratchWorkspace();
    const reportPathOf = (name: string): string => join(scratchFolder, 'temporary', `${name}.json`);
    const checkMarker = join(repositoryFolder, 'packages', 'example', CHECK_MARKER);
    const first = runIn(repositoryFolder, [process.execPath, TURBO_GATE_SCRIPT, 'example'], { [GATE_REPORT_VARIABLE]: reportPathOf('first') });
    const firstChecked = existsSync(checkMarker);
    rmSync(checkMarker, { force: true });
    const second = runIn(repositoryFolder, [process.execPath, TURBO_GATE_SCRIPT, 'example'], { [GATE_REPORT_VARIABLE]: reportPathOf('second') });

    expect([first.exitCode, second.exitCode, firstChecked, existsSync(checkMarker)]).toEqual([0, 0, true, true]);
    expect([JSON.parse(readFileSync(reportPathOf('first'), 'utf8')), JSON.parse(readFileSync(reportPathOf('second'), 'utf8'))])
      .toEqual([{ version: 1, cache: 'miss' }, { version: 1, cache: 'hit' }]);
  }, END_TO_END_CASE_TIMEOUT_MILLISECONDS);

  test('end to end, writes no report where forge handed no path, and leaves no run summary behind', () => {
    const repositoryFolder = scratchWorkspace();
    const gate = runIn(repositoryFolder, [process.execPath, TURBO_GATE_SCRIPT, 'example']);

    expect(gate.exitCode).toBe(0);
    const runSummariesFolder = join(repositoryFolder, '.turbo', 'runs');
    expect(existsSync(runSummariesFolder) ? readdirSync(runSummariesFolder) : []).toEqual([]);
  }, END_TO_END_CASE_TIMEOUT_MILLISECONDS);
});
