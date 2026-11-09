/**
 * Runs every Bridge DOM spec, `bridge/**\/*.dom.tsx`, which `bun test` does not discover: in one isolated run under the skip report and
 * the happy-dom preload, each file in a fresh global, so a DOM never leaks into the main run or from one spec into the next. Finding no
 * DOM spec is a failure, so a renamed folder cannot pass by running nothing. `bun run verify` runs it after `bun test`.
 */
import { join } from 'node:path';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const DOM_SPEC_PATTERN = 'bridge/**/*.dom.tsx';
const PRELOADS = ['./src/testing/TestRunReport.ts', './bridge/testing/HappyDom.ts'];

const domSpecPaths = [...new Bun.Glob(DOM_SPEC_PATTERN).scanSync({ cwd: REPOSITORY_ROOT })].sort();

if (domSpecPaths.length === 0) {
  console.error(`No DOM spec matches ${DOM_SPEC_PATTERN}.`);
  process.exitCode = 1;
} else {
  const preloadArguments = PRELOADS.flatMap((preload) => ['--preload', preload]);
  const specArguments = domSpecPaths.map((domSpecPath) => `./${domSpecPath}`);
  const finished = Bun.spawnSync(['bun', 'test', '--isolate', ...preloadArguments, ...specArguments], { cwd: REPOSITORY_ROOT, stdout: 'inherit', stderr: 'inherit' });
  if (finished.exitCode !== 0) process.exitCode = 1;
}
