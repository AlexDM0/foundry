/**
 * The leak check must fail a run that leaves a file in the scratch root and pass one that cleans up. Each case runs a planted spec in a
 * child `bun test` under the same preload, since the check judges a whole run and this run must stay clean.
 */
import { writeFileSync }          from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchPath } from './ScratchRoot.ts';

const CHILD_RUN_TIMEOUT_MILLISECONDS = 20_000;

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
    const finished = Bun.spawnSync([process.execPath, 'test'], { cwd: plantedFolder, stdout: 'pipe', stderr: 'pipe' });
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

  test('passes a run whose spec removes what it made', () => {
    const result = plantedRunOf([
      'import { rmSync } from \'node:fs\';',
      'test(\'cleans up\', () => { const made = join(runScratchFolder(), \'made.txt\'); writeFileSync(made, \'planted\'); rmSync(made); });',
    ].join('\n'));
    expect(result.standardError).not.toContain('left');
    expect(result.exitCode).toBe(0);
  }, CHILD_RUN_TIMEOUT_MILLISECONDS);
});
