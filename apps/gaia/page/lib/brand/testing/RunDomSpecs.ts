/**
 * Runs every DOM spec of the brand library, `**\/*.dom.tsx`, which `bun test` does not discover: in one isolated run under this library's
 * happy-dom preload, each file in a fresh global, so a DOM never leaks into the main run or from one spec into the next. Finding no DOM
 * spec is a failure, so a renamed folder cannot pass by running nothing. The host's `test:dom` script runs it.
 */
const LIBRARY_FOLDER = `${import.meta.dir}/..`;
const DOM_SPEC_PATTERN = '**/*.dom.tsx';
const HAPPY_DOM_PRELOAD = './testing/HappyDomPreload.ts';

const domSpecPaths = [...new Bun.Glob(DOM_SPEC_PATTERN).scanSync({ cwd: LIBRARY_FOLDER })]
  .map((path) => path.split('\\').join('/'))
  .filter((path) => !path.split('/').includes('node_modules'))
  .sort();

if (domSpecPaths.length === 0) {
  console.error(`No DOM spec matches ${DOM_SPEC_PATTERN}.`);
  process.exitCode = 1;
} else {
  const specArguments = domSpecPaths.map((domSpecPath) => `./${domSpecPath}`);
  const finished = Bun.spawnSync(['bun', 'test', '--isolate', '--preload', HAPPY_DOM_PRELOAD, ...specArguments], { cwd: LIBRARY_FOLDER, stdout: 'inherit', stderr: 'inherit' });
  if (finished.exitCode !== 0) process.exitCode = 1;
}
