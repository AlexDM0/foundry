/**
 * The leak check must fail a run that leaves a file in the scratch root, name each other place it guards when a spec leaves something
 * there, and pass a run that cleans up. Each case runs a planted spec in a child `bun test` under the same preload, since the check judges
 * a whole run and this run must stay clean. The child's real home is this run's scratch home, so the real-home case never reaches the real one.
 */
import { writeFileSync }          from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { environmentCopy, homeDirectory } from '../services/Environment.ts';
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

  test('passes a run whose spec removes what it made', () => {
    const result = plantedRunOf([
      'import { rmSync } from \'node:fs\';',
      'test(\'cleans up\', () => { const made = join(runScratchFolder(), \'made.txt\'); writeFileSync(made, \'planted\'); rmSync(made); });',
    ].join('\n'));
    expect(result.standardError).not.toContain('left');
    expect(result.exitCode).toBe(0);
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);
});
