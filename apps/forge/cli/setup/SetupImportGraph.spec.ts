/**
 * Setup runs on a fresh clone, before its own `bun install` step, so nothing it loads may import an installed package: every module it
 * reaches imports only other files of the checkout and the runtime's built-in modules.
 */
import { readFileSync }     from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test }     from 'bun:test';

const SETUP_ENTRY_PATH = resolve(import.meta.dir, '../../setup.ts');
const BUILT_IN_MODULE_PREFIXES = ['node:', 'bun:'];
const TYPESCRIPT_TRANSPILER = new Bun.Transpiler({ loader: 'ts' });

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** Each package specifier a module in setup's import graph names at run time, with the module that names it. */
function packageImportsReachedFrom(entryPath: string): string[] {
  const visitedModulePaths = new Set<string>();
  const packageImports: string[] = [];
  const pendingModulePaths = [entryPath];
  for (let modulePath = pendingModulePaths.pop(); modulePath !== undefined; modulePath = pendingModulePaths.pop()) {
    if (visitedModulePaths.has(modulePath)) continue;
    visitedModulePaths.add(modulePath);
    for (const { path: specifier } of TYPESCRIPT_TRANSPILER.scan(readFileSync(modulePath, 'utf8')).imports) {
      if (isRelativeSpecifier(specifier)) pendingModulePaths.push(resolve(dirname(modulePath), specifier));
      else if (!BUILT_IN_MODULE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) packageImports.push(`${modulePath} imports ${specifier}`);
    }
  }
  return packageImports;
}

test('setup loads no installed package, so it starts on a clone that has never run bun install', () => {
  expect(packageImportsReachedFrom(SETUP_ENTRY_PATH)).toEqual([]);
});

test('the walk sees a package import when a module in the graph has one', () => {
  const hephaestusForegroundPath = resolve(import.meta.dir, '../hephaestus/HephaestusForeground.ts');
  expect(packageImportsReachedFrom(hephaestusForegroundPath).length).toBeGreaterThan(0);
});
