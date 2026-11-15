/**
 * Runs every DOM spec of the package, `**\/*.dom.tsx`, which `bun test` does not discover: in one isolated run under the happy-dom preload,
 * each file in a fresh global, so a DOM never leaks into the main run or from one spec into the next. Finding no DOM spec is a failure, so
 * a renamed folder cannot pass by running nothing.
 */
import { PACKAGE_FOLDER } from './PackageFiles.ts';

const DOM_SPEC_PATTERN = '**/*.dom.tsx';
const PRELOAD = './testing/HappyDom.ts';

const domSpecPaths = [...new Bun.Glob(DOM_SPEC_PATTERN).scanSync({ cwd: PACKAGE_FOLDER })].filter((path) => !path.includes('node_modules')).sort();

if (domSpecPaths.length === 0) {
  console.error(`No DOM spec matches ${DOM_SPEC_PATTERN}.`);
  process.exitCode = 1;
} else {
  const specArguments = domSpecPaths.map((path) => `./${path}`);
  const finished = Bun.spawnSync(['bun', 'test', '--isolate', '--preload', PRELOAD, ...specArguments], { cwd: PACKAGE_FOLDER, stdout: 'inherit', stderr: 'inherit' });
  if (finished.exitCode !== 0) process.exitCode = 1;
}
