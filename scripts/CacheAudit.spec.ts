/**
 * The cache audit. What matters: the target reference is `main` unless one is named, and anything else is refused with the usage; a red
 * task, or one that never ran, is selected and a task with no script is not; a hash selects its own cache files and no other's; and, end
 * to end in a scratch repository with a planted red spec, the audit removes the cache entry planted under the red task's hash, keeps every
 * other entry and exits 1, while a named target with nothing changed since it audits nothing and exits 0.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

import {
  CACHE_AUDIT_USAGE,
  cacheAuditRequestOf,
  cacheEntryFileNamesOf,
  redTasksOf,
  removeCacheEntriesOf,
  type SummarizedTask
} from './CacheAudit.ts';

const SCRATCH_ROOT = join(import.meta.dir, '.scratch');
const WORKSPACE_TOOLS_FOLDER = join(import.meta.dir, '..', 'node_modules', '.bin');
const CACHE_AUDIT_SCRIPT = join(import.meta.dir, 'CacheAudit.ts');
const END_TO_END_CASE_TIMEOUT_MILLISECONDS = 60_000;
/** The audit runs these four; the example package has a script for `test` alone, so the other three are tasks with no script. */
const AUDITED_TASKS = ['typecheck', 'lint', 'test', 'test:dom'];
const RED_HASH = '1111111111111111';
const OTHER_HASH = '2222222222222222';

const GREEN_SPEC = 'import { expect, test } from "bun:test";\n\ntest("passes", () => { expect(1).toBe(1); });\n';
const PLANTED_RED_SPEC = 'import { expect, test } from "bun:test";\n\ntest("is planted red", () => { expect(1).toBe(2); });\n';

function summarizedTask(taskId: string, hash: string, exitCode: number | undefined, command = 'bun test'): SummarizedTask {
  const task = { taskId, hash, command };
  return exitCode === undefined ? task : { ...task, execution: { exitCode } };
}

describe('the request', () => {
  test('audits what changed since main when no target is named, and since the named one otherwise', () => {
    expect([cacheAuditRequestOf([]), cacheAuditRequestOf(['origin/release'])]).toEqual([
      { kind: 'audit', targetReference: 'main' },
      { kind: 'audit', targetReference: 'origin/release' },
    ]);
  });

  test('answers --help with the usage, and refuses an unknown flag or a second argument', () => {
    expect([cacheAuditRequestOf(['--help']), cacheAuditRequestOf(['--target=main']), cacheAuditRequestOf(['main', 'feature'])]).toEqual([
      { kind: 'help' },
      { kind: 'refused' },
      { kind: 'refused' },
    ]);
  });

  test('the usage line says why the target is main by default', () => {
    expect(CACHE_AUDIT_USAGE).toContain('`main` when none is named, since forge hands a gate no target');
  });
});

describe('the hash selection', () => {
  test('selects a red task and one that never ran, and neither a green task nor one with no script', () => {
    const tasks = [
      summarizedTask('example#test', RED_HASH, 1),
      summarizedTask('example#lint', '3333333333333333', undefined),
      summarizedTask('example#typecheck', OTHER_HASH, 0),
      summarizedTask('example#test:dom', '4444444444444444', undefined, '<NONEXISTENT>'),
    ];
    expect(redTasksOf(tasks).map((task) => task.taskId)).toEqual(['example#test', 'example#lint']);
  });

  test('a hash selects its archive and its meta file, and no entry of a hash it only begins', () => {
    const cacheFileNames = [`${RED_HASH}.tar.zst`, `${RED_HASH}-meta.json`, `${RED_HASH}1.tar.zst`, `${OTHER_HASH}.tar.zst`];
    expect(cacheEntryFileNamesOf(RED_HASH, cacheFileNames)).toEqual([`${RED_HASH}.tar.zst`, `${RED_HASH}-meta.json`]);
  });
});

describe('the purge', () => {
  let scratchFolder = '';

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    scratchFolder = mkdtempSync(join(SCRATCH_ROOT, 'cache-audit-'));
  });

  afterAll(() => {
    rmSync(scratchFolder, { recursive: true, force: true });
  });

  function scratchEnvironment(): Record<string, string> {
    return {
      // The workspace's `turbo` first, as `bun run` puts it; the rest of the search path finds the `node` its launcher runs on.
      PATH:                     `${WORKSPACE_TOOLS_FOLDER}:${process.env['PATH'] ?? ''}`,
      HOME:                     join(scratchFolder, 'home'),
      TMPDIR:                   join(scratchFolder, 'temporary'),
      TURBO_TELEMETRY_DISABLED: '1',
      GIT_CONFIG_NOSYSTEM:      '1',
    };
  }

  function runIn(folder: string, command: readonly string[]): { exitCode: number; standardOutput: string; output: string } {
    const finished = Bun.spawnSync([...command], {
      cwd:    folder,
      env:    scratchEnvironment(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const standardOutput = finished.stdout.toString();
    return { exitCode: finished.exitCode, standardOutput, output: `${standardOutput}${finished.stderr.toString()}` };
  }

  function git(repositoryFolder: string, gitArguments: readonly string[]): void {
    const finished = runIn(repositoryFolder, ['git', '-c', 'user.name=Alex Example', '-c', 'user.email=alex@example.com', ...gitArguments]);
    expect(finished).toMatchObject({ exitCode: 0 });
  }

  /** A workspace of one package whose `main` is green, with the planted red spec committed on a branch beside it. */
  function scratchRepositoryWithPlantedRedSpec(): string {
    const repositoryFolder = mkdtempSync(join(scratchFolder, 'repository-'));
    mkdirSync(join(scratchFolder, 'home'), { recursive: true });
    mkdirSync(join(scratchFolder, 'temporary'), { recursive: true });
    mkdirSync(join(repositoryFolder, 'packages', 'example'), { recursive: true });
    writeFileSync(join(repositoryFolder, 'package.json'), JSON.stringify({
      name:           'example-workspace',
      private:        true,
      packageManager: 'bun@1.4.2',
      workspaces:     ['packages/*'],
    }));
    writeFileSync(join(repositoryFolder, 'turbo.json'), JSON.stringify({ tasks: Object.fromEntries(AUDITED_TASKS.map((task) => [task, { outputs: [] }])) }));
    writeFileSync(join(repositoryFolder, '.gitignore'), '.turbo/\nnode_modules/\n');
    writeFileSync(join(repositoryFolder, 'packages', 'example', 'package.json'), JSON.stringify({ name: 'example', private: true, scripts: { test: 'bun test' } }));
    writeFileSync(join(repositoryFolder, 'packages', 'example', 'Example.spec.ts'), GREEN_SPEC);
    git(repositoryFolder, ['init', '--quiet', '--initial-branch=main']);
    git(repositoryFolder, ['add', '--all']);
    git(repositoryFolder, ['commit', '--quiet', '--message=Green']);
    git(repositoryFolder, ['checkout', '--quiet', '-b', 'change']);
    writeFileSync(join(repositoryFolder, 'packages', 'example', 'Planted.spec.ts'), PLANTED_RED_SPEC);
    git(repositoryFolder, ['add', '--all']);
    git(repositoryFolder, ['commit', '--quiet', '--message=Plant a red spec']);
    return repositoryFolder;
  }

  function plantedTaskHash(repositoryFolder: string): string {
    const dryRun = runIn(repositoryFolder, ['turbo', 'run', 'test', '--dry=json']);
    const [plantedTask] = (JSON.parse(dryRun.standardOutput) as { tasks: SummarizedTask[] }).tasks;
    return plantedTask?.hash ?? '';
  }

  function plantCacheEntries(repositoryFolder: string, hashes: readonly string[]): string {
    const cacheFolder = join(repositoryFolder, '.turbo', 'cache');
    mkdirSync(cacheFolder, { recursive: true });
    for (const hash of hashes) {
      writeFileSync(join(cacheFolder, `${hash}.tar.zst`), 'planted');
      writeFileSync(join(cacheFolder, `${hash}-meta.json`), '{}');
    }
    return cacheFolder;
  }

  test('removes the cache files of each red task\'s hash and leaves the rest', () => {
    const cacheFolder = plantCacheEntries(mkdtempSync(join(scratchFolder, 'cache-')), [RED_HASH, OTHER_HASH]);
    removeCacheEntriesOf(cacheFolder, [summarizedTask('example#test', RED_HASH, 1)]);
    expect(readdirSync(cacheFolder).sort()).toEqual([`${OTHER_HASH}-meta.json`, `${OTHER_HASH}.tar.zst`]);
  });

  test('end to end, removes the entry planted under the planted red spec\'s task hash, keeps the other and exits 1', () => {
    const repositoryFolder = scratchRepositoryWithPlantedRedSpec();
    const redHash = plantedTaskHash(repositoryFolder);
    const cacheFolder = plantCacheEntries(repositoryFolder, [redHash, OTHER_HASH]);
    const audit = runIn(repositoryFolder, [process.execPath, CACHE_AUDIT_SCRIPT]);
    expect([audit.exitCode, audit.output.includes(`example#test is red; removed 2 cache files of ${redHash}.`)]).toEqual([1, true]);
    expect(readdirSync(cacheFolder).sort()).toEqual([`${OTHER_HASH}-meta.json`, `${OTHER_HASH}.tar.zst`]);
  }, END_TO_END_CASE_TIMEOUT_MILLISECONDS);

  test('end to end, a named target with nothing changed since it audits no task, keeps every entry and exits 0', () => {
    const repositoryFolder = scratchRepositoryWithPlantedRedSpec();
    const redHash = plantedTaskHash(repositoryFolder);
    const cacheFolder = plantCacheEntries(repositoryFolder, [redHash]);
    const audit = runIn(repositoryFolder, [process.execPath, CACHE_AUDIT_SCRIPT, 'change']);
    expect(audit.exitCode).toBe(0);
    expect(readdirSync(cacheFolder).sort()).toEqual([`${redHash}-meta.json`, `${redHash}.tar.zst`]);
  }, END_TO_END_CASE_TIMEOUT_MILLISECONDS);

  test('end to end, a target that names no commit runs nothing and exits 1 with the usage', () => {
    const repositoryFolder = scratchRepositoryWithPlantedRedSpec();
    const audit = runIn(repositoryFolder, [process.execPath, CACHE_AUDIT_SCRIPT, 'no-such-branch']);
    expect([audit.exitCode, audit.output.includes('no-such-branch names no commit'), audit.output.includes(CACHE_AUDIT_USAGE)]).toEqual([1, true, true]);
  }, END_TO_END_CASE_TIMEOUT_MILLISECONDS);
});
