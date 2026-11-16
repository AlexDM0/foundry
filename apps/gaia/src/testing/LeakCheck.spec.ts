/**
 * The leak check must fail a run that leaves a file in the scratch root, name each other place it guards when a spec leaves something
 * there, fail a run that leaves a child process running, and pass a run that cleans up. A change inside a guarded home folder that was
 * already there is named as a warning and fails no run, since a live Gaia or forge on the machine writes there too. Each case runs a planted
 * spec in a child `bun test` under the same preload, since the check judges a whole run and this run must stay clean. The child's real home
 * is this run's scratch home, so the real-home cases never reach the real one. Gaia shares its repository with forge, so the git status
 * it judges is its own folder's: a file a forge run leaves beside it is no leak of Gaia's, planted in a scratch repository of the same shape.
 * A scratch forge's short home link lives outside the scratch root, so its link root is judged too; a scratch folder stands in for it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import { describe, expect, test }   from 'bun:test';

import { environmentCopy, homeDirectory }               from '../services/Environment.ts';
import { gitStatusLinesBelow, scratchForgeLinkLeaksOf } from './LeakCheck.ts';
import {
  createScratchDirectory,
  pathLiesInsideScratchRoot,
  removeScratchPath,
  scratchRoot,
} from './ScratchRoot.ts';

const CHILD_RUN_TIMEOUT_MILLISECONDS = 20_000;

/** Bun keeps its transpiler cache under `HOME`; the child's would land in this run's scratch home, so it runs without one. */
const NO_TRANSPILER_CACHE = { BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' };

interface ChildRunResult {
  readonly exitCode:      number;
  readonly standardError: string;
}

function plantedRunOf(specBody: string): ChildRunResult {
  const plantedFolder = createScratchDirectory('planted-run');
  try {
    const preloadPath    = join(import.meta.dir, 'TestRunPreload.ts');
    const scratchModule  = join(import.meta.dir, 'ScratchRoot.ts');
    writeFileSync(join(plantedFolder, 'bunfig.toml'), `[test]\npreload = [${JSON.stringify(preloadPath)}]\n`);
    writeFileSync(join(plantedFolder, 'Planted.spec.ts'), [
      'import { test } from \'bun:test\';',
      'import { writeFileSync } from \'node:fs\';',
      'import { join } from \'node:path\';',
      `import { runScratchFolder } from ${JSON.stringify(scratchModule)};`,
      specBody,
    ].join('\n'));
    const finished = Bun.spawnSync([process.execPath, 'test'], {
      cwd:    plantedFolder,
      env:    { ...environmentCopy(), ...NO_TRANSPILER_CACHE },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return { exitCode: finished.exitCode, standardError: finished.stderr.toString() };
  } finally {
    removeScratchPath(plantedFolder);
  }
}

function killIfStillRunning(processId: number): void {
  try {
    process.kill(processId, 'SIGKILL');
  } catch {
    // The sleeper already ended.
  }
}

describe('the leak check after a run', () => {
  test('fails a run whose spec leaves a file in the scratch root, and names the file', () => {
    const result = plantedRunOf('test(\'leaves a file\', () => { writeFileSync(join(runScratchFolder(), \'left-behind.txt\'), \'planted\'); });');
    expect(result.exitCode).not.toBe(0);
    expect(result.standardError).toContain('left-behind.txt was left in the run\'s scratch folder');
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);

  test('fails a run whose spec leaves an entry in each other guarded place, and names each one', () => {
    const straightInScratchRoot = join(scratchRoot(), `planted-${process.pid}.txt`);
    const guardedInRealHome     = join(homeDirectory(), '.gaia');
    expect(pathLiesInsideScratchRoot(guardedInRealHome)).toBe(true);
    try {
      const result = plantedRunOf([
        'import { mkdirSync } from \'node:fs\';',
        'import { tmpdir } from \'node:os\';',
        'test(\'leaves an entry in each guarded place\', () => {',
        '  writeFileSync(join(process.env[\'HOME\'] ?? \'\', \'left-in-home.txt\'), \'planted\');',
        '  writeFileSync(join(tmpdir(), \'left-in-temporary.txt\'), \'planted\');',
        `  writeFileSync(${JSON.stringify(straightInScratchRoot)}, 'planted');`,
        `  mkdirSync(${JSON.stringify(guardedInRealHome)});`,
        '});',
      ].join('\n'));
      expect(result.exitCode).not.toBe(0);
      expect(result.standardError).toContain('left-in-home.txt was left in the scratch home');
      expect(result.standardError).toContain('left-in-temporary.txt was left in the scratch temporary folder');
      expect(result.standardError).toContain(`${straightInScratchRoot} was left in the scratch root`);
      expect(result.standardError).toContain(`${guardedInRealHome} appeared in the real home folder`);
    } finally {
      removeScratchPath(straightInScratchRoot);
      removeScratchPath(guardedInRealHome);
    }
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);

  test('fails a run whose spec leaves a child process running, and names the process', () => {
    const result = plantedRunOf([
      'test(\'leaves a sleeper running\', () => {',
      '  const sleeper = Bun.spawn([\'sleep\', \'30\'], { stdout: \'ignore\', stderr: \'ignore\' });',
      '  sleeper.unref();',
      '  console.error(`planted sleeper ${sleeper.pid}`);',
      '});',
    ].join('\n'));
    const sleeperProcessId = /planted sleeper (\d+)/.exec(result.standardError)?.[1];
    if (sleeperProcessId !== undefined) killIfStillRunning(Number(sleeperProcessId));
    expect(result.exitCode).not.toBe(0);
    expect(result.standardError).toContain(`process ${sleeperProcessId} (sleep 30) was still running`);
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);

  test('warns of a change inside a guarded home folder that was there before the run, names each entry, and fails no run for it', () => {
    const guardedFolder = join(homeDirectory(), '.gaia');
    const changedFile   = join(guardedFolder, 'server.json');
    const addedFile     = join(guardedFolder, 'token');
    mkdirSync(guardedFolder);
    writeFileSync(changedFile, '{}');
    try {
      const result = plantedRunOf([
        'test(\'changes the guarded folder\', () => {',
        `  writeFileSync(${JSON.stringify(changedFile)}, '{"serverVersion":1}');`,
        `  writeFileSync(${JSON.stringify(addedFile)}, 'planted');`,
        '});',
      ].join('\n'));
      expect(result.standardError).toContain('A running Gaia or forge writes there too, so this fails no run');
      expect(result.standardError).toContain(`${changedFile} changed`);
      expect(result.standardError).toContain(`${addedFile} appeared`);
      expect(result.standardError).not.toContain('The test run left');
      expect(result.exitCode).toBe(0);
    } finally {
      removeScratchPath(guardedFolder);
    }
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);

  test('passes a run whose spec removes what it made', () => {
    const result = plantedRunOf([
      'import { rmSync } from \'node:fs\';',
      'test(\'cleans up\', () => { const made = join(runScratchFolder(), \'made.txt\'); writeFileSync(made, \'planted\'); rmSync(made); });',
    ].join('\n'));
    expect(result.standardError).not.toContain('The test run left');
    expect(result.exitCode).toBe(0);
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);
});

describe('the git status the leak check judges', () => {
  test('holds a file left in Gaia\'s folder and passes over one left beside it in the same repository', () => {
    const repositoryFolder = createScratchDirectory('planted-repository');
    try {
      const gaiaFolder  = join(repositoryFolder, 'apps', 'gaia');
      const forgeFolder = join(repositoryFolder, 'apps', 'forge');
      mkdirSync(gaiaFolder, { recursive: true });
      mkdirSync(forgeFolder, { recursive: true });
      const initialized = Bun.spawnSync(['git', 'init', '--quiet'], {
        cwd:    repositoryFolder,
        env:    environmentCopy(),
        stdout: 'ignore',
        stderr: 'ignore',
      });
      expect(initialized.exitCode).toBe(0);
      writeFileSync(join(forgeFolder, 'left-by-forge.txt'), 'planted');
      expect(gitStatusLinesBelow(gaiaFolder)).toEqual([]);
      writeFileSync(join(gaiaFolder, 'left-by-gaia.txt'), 'planted');
      expect(gitStatusLinesBelow(gaiaFolder)).toEqual(['?? apps/gaia/left-by-gaia.txt']);
    } finally {
      removeScratchPath(repositoryFolder);
    }
  });
});

describe('the scratch forges\' link root the leak check judges', () => {
  test('names the link root when a scratch forge made it and left it', () => {
    const linkRoot = createScratchDirectory('link-root');
    try {
      expect(scratchForgeLinkLeaksOf(linkRoot, null)).toEqual([`${linkRoot} was left by a scratch forge`]);
    } finally {
      removeScratchPath(linkRoot);
    }
  });

  test('names each link folder left in a link root that was there before, and passes over the ones that were', () => {
    const linkRoot = createScratchDirectory('link-root');
    try {
      mkdirSync(join(linkRoot, 'forge-before'));
      mkdirSync(join(linkRoot, 'forge-left'));
      expect(scratchForgeLinkLeaksOf(linkRoot, new Set(['forge-before'])))
        .toEqual([`${join(linkRoot, 'forge-left')} was left in the scratch forges' link root`]);
    } finally {
      removeScratchPath(linkRoot);
    }
  });

  test('finds no leak when the link root is gone', () => {
    const linkRoot = createScratchDirectory('link-root');
    removeScratchPath(linkRoot);
    expect(scratchForgeLinkLeaksOf(linkRoot, null)).toEqual([]);
  });
});
