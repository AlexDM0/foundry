/**
 * Runs every DOM spec of the board, `page/board/**\/*.dom.tsx`, which `bun test` does not discover: in one isolated run under Gaia's test
 * preload, which moves `HOME` and `TMPDIR` into scratch and judges leaks, and the happy-dom preload, each file in a fresh global, so a DOM
 * never leaks into the main run or from one spec into the next. Finding no DOM spec is a failure, so a renamed folder cannot pass by running
 * nothing. `bun run verify` runs it after `bun test`.
 */
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

const GAIA_FOLDER = join(import.meta.dir, '..', '..');
const DOM_SPEC_PATTERNS = ['page/board/**/*.dom.tsx'];
const PRELOADS = ['./src/testing/TestRunPreload.ts', './page/testing/HappyDom.ts'];

const domSpecPathsByPattern = DOM_SPEC_PATTERNS.map((pattern) => ({ pattern, paths: [...new Bun.Glob(pattern).scanSync({ cwd: GAIA_FOLDER })] }));
const unmatchedPatterns = domSpecPathsByPattern.filter(({ paths }) => paths.length === 0).map(({ pattern }) => pattern);
const domSpecPaths = domSpecPathsByPattern.flatMap(({ paths }) => paths).sort();

if (unmatchedPatterns.length > 0) {
  console.error(`No DOM spec matches ${unmatchedPatterns.join(' or ')}.`);
  process.exitCode = 1;
} else {
  const preloadArguments = PRELOADS.flatMap((preload) => ['--preload', preload]);
  const specArguments = domSpecPaths.map((domSpecPath) => `./${domSpecPath}`);
  // With its output on a pipe, as under turbo, Bun 1.4.2's isolated run at times misses the exit of a leak check's git child and spins
  // for good; on a file it never did, so the run writes to one and its output is printed when it ends.
  const outputFolder = mkdtempSync(join(tmpdir(), 'gaia-dom-run-'));
  const outputPath = join(outputFolder, 'output.log');
  const outputDescriptor = openSync(outputPath, 'a');
  try {
    const finished = Bun.spawnSync(['bun', 'test', '--isolate', ...preloadArguments, ...specArguments], {
      cwd:    GAIA_FOLDER,
      stdout: outputDescriptor,
      stderr: outputDescriptor,
    });
    if (finished.exitCode !== 0) process.exitCode = 1;
  } finally {
    closeSync(outputDescriptor);
    process.stdout.write(readFileSync(outputPath));
    rmSync(outputFolder, { recursive: true, force: true });
  }
}
