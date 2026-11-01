/**
 * The split of the Tests rules in the root `CLAUDE.md`: a default spec names no real process, git or socket call, and each that still
 * does is an allowlist entry for the ticket that moves it; a real-system spec is a `*.integration.spec.ts` file that `BOUNDARY_SPECS`
 * lists. A call is found in the syntax tree of the spec itself, so a sentence or a planted string is not a use, and a helper counts by
 * the export a spec imports. A production module a spec calls in-process is not followed: nearly every command reaches git that way.
 * The scan first proves it saw the specs and the shipping call sites, and each form is planted to prove the guard names it.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import {
  BOUNDARY_SPECS,
  boundaryIsTouched,
  INTEGRATION_SPEC_SUFFIX,
  integrationSpecsTouchedBy
} from './testing/BoundarySpecs.ts';
import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import type { RepositorySource }        from './testing/RepositorySources.ts';
import { repositoryTypeScriptSources }  from './testing/RepositorySources.ts';

/** Each file here still makes a real call in the default suite, until the ticket named moves it. */
const REAL_SYSTEM_ALLOWLIST: Readonly<Record<string, '#572'>> = {
  'cli/overseer/OverseerApi.spec.ts':           '#572',
  'cli/overseer/OverseerCommand.spec.ts':       '#572',
  'src/PlatformProbes.spec.ts':                 '#572',
  'src/services/lifecycle/Customs.spec.ts':     '#572',
  'src/services/overseer/Airlocks.spec.ts':     '#572',
  'src/services/overseer/BatonPass.spec.ts':    '#572',
  'src/services/overseer/WatcherFleet.spec.ts': '#572',
};

const BUN_REAL_CALLS = new Set(['$', 'spawn', 'spawnSync', 'serve', 'connect', 'listen', 'udpSocket']);
const REAL_MODULE_PATTERN = /^(?:node:)?(?:child_process|net|http|https|http2|dgram|tls|dns)$/;
const REAL_HELPER_EXPORTS = new Set([
  'addWorktree',
  'childIgnoringStop',
  'commitFile',
  'connectToWatcher',
  'createAirlocksHarness',
  'createScratchGitRepository',
  'createWatcherJob',
  'currentBranchOf',
  'gitOutputIn',
  'jsonPrintedByAChildProcess',
  'parentOfDetachedChild',
  'parentOfSleepingChild',
  'PlantedWatcher',
  'readTheBridgeHeadless',
  'runAgentProgress',
  'sleepingProcess',
  'startAgentProgress',
]);
const MINIMUM_SPEC_FILE_COUNT = 100;
const DOM_SPEC_SUFFIX = '.dom.tsx';
const SHIPPING_REAL_CALL_FORM_COUNT_FLOOR = 10;

function propertyCallFormOf(node: ts.PropertyAccessExpression): string | null {
  if (!ts.isIdentifier(node.expression)) return null;
  if (node.expression.text === 'Bun' && BUN_REAL_CALLS.has(node.name.text)) return `Bun.${node.name.text}`;
  return node.expression.text === 'GitProcess' && node.name.text === 'run' ? 'GitProcess.run' : null;
}

function importsOnlyTypes({ importClause }: ts.ImportDeclaration): boolean {
  if (importClause === undefined) return false;
  if (importClause.isTypeOnly) return true;
  const { name, namedBindings } = importClause;
  return name === undefined && namedBindings !== undefined && ts.isNamedImports(namedBindings) && namedBindings.elements.every((element) => element.isTypeOnly);
}

function importFormsOf(node: ts.ImportDeclaration): string[] {
  if (!ts.isStringLiteral(node.moduleSpecifier) || importsOnlyTypes(node)) return [];
  const moduleForms = REAL_MODULE_PATTERN.test(node.moduleSpecifier.text) ? [node.moduleSpecifier.text] : [];
  const namedBindings = node.importClause?.namedBindings;
  const helperForms = namedBindings !== undefined && ts.isNamedImports(namedBindings)
    ? namedBindings.elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text)
      .filter((name) => REAL_HELPER_EXPORTS.has(name) || (name === '$' && node.moduleSpecifier.getText().includes('bun')))
    : [];
  return [...moduleForms, ...helperForms];
}

function loadedModuleFormOf(node: ts.CallExpression): string | null {
  const isLoad = node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require');
  const [moduleName] = node.arguments;
  return isLoad && moduleName !== undefined && ts.isStringLiteralLike(moduleName) && REAL_MODULE_PATTERN.test(moduleName.text) ? moduleName.text : null;
}

function nodeFormsOf(node: ts.Node): string[] {
  if (ts.isPropertyAccessExpression(node)) return [propertyCallFormOf(node)].filter((form) => form !== null);
  if (ts.isImportDeclaration(node)) return importFormsOf(node);
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'WebSocket') return ['WebSocket'];
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') return ['fetch'];
    return [loadedModuleFormOf(node)].filter((form) => form !== null);
  }
  return [];
}

function realCallFormsIn(source: RepositorySource): string[] {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const forms = new Set<string>();
  const visit = (node: ts.Node): void => {
    for (const form of nodeFormsOf(node)) forms.add(form);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...forms].sort();
}

function isIntegrationSpec(path: string): boolean {
  return path.endsWith(INTEGRATION_SPEC_SUFFIX);
}

function isDefaultSpec(path: string): boolean {
  return (path.endsWith('.spec.ts') || path.endsWith(DOM_SPEC_SUFFIX)) && !isIntegrationSpec(path);
}

function isShippingFile(path: string): boolean {
  return !path.endsWith('.spec.ts') && !path.endsWith(DOM_SPEC_SUFFIX) && !path.split('/').includes('testing') && !path.startsWith('.');
}

function suiteViolationsOf(sources: readonly RepositorySource[], allowlist: Readonly<Record<string, string>>): string[] {
  const allowed = (path: string): boolean => Object.hasOwn(allowlist, path);
  const defaultSpecs = sources.filter(({ path }) => isDefaultSpec(path));
  const callingSpecs = defaultSpecs.filter((source) => realCallFormsIn(source).length > 0);
  const callingPaths = new Set(callingSpecs.map(({ path }) => path));
  return [
    ...callingSpecs.filter(({ path }) => !allowed(path))
      .map((source) => `${source.path} is a default spec calling ${realCallFormsIn(source).join(', ')}`),
    ...Object.keys(allowlist).filter((path) => !callingPaths.has(path)).map((path) => `the allowlist names ${path}, which makes no real call`),
    ...sources.filter(({ path }) => isIntegrationSpec(path)).filter((source) => realCallFormsIn(source).length === 0)
      .map((source) => `${source.path} is an integration spec making no real call`),
  ];
}

function boundaryListViolationsOf(sources: readonly RepositorySource[], listedPathExists: (path: string) => boolean): string[] {
  const listedSpecs = new Set(BOUNDARY_SPECS.flatMap(({ specs }) => specs));
  const integrationSpecs = sources.map(({ path }) => path).filter(isIntegrationSpec);
  const boundaries = BOUNDARY_SPECS.map(({ boundary }) => boundary);
  return [
    ...integrationSpecs.filter((path) => !listedSpecs.has(path)).map((path) => `${path} is listed under no boundary`),
    ...[...listedSpecs].filter((path) => !integrationSpecs.includes(path)).map((path) => `BOUNDARY_SPECS names ${path}, which does not exist`),
    ...boundaries.filter((path) => !listedPathExists(path)).map((path) => `BOUNDARY_SPECS lists the boundary ${path}, which does not exist`),
    ...sources.filter(({ path }) => isShippingFile(path) && !boundaries.some((boundary) => boundaryIsTouched(boundary, path)))
      .filter((source) => realCallFormsIn(source).some((form) => form !== 'GitProcess.run'))
      .map((source) => `${source.path} makes a real call and is no listed boundary`),
  ];
}

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();
const SOURCES = repositoryTypeScriptSources(REPOSITORY_ROOT);

describe('the scan itself', () => {
  test('it sees the specs of both suites and the shipping call sites', () => {
    expect(SOURCES.filter(({ path }) => isDefaultSpec(path)).length).toBeGreaterThan(MINIMUM_SPEC_FILE_COUNT);
    expect(SOURCES.filter(({ path }) => isIntegrationSpec(path)).length).toBeGreaterThan(Object.keys(REAL_SYSTEM_ALLOWLIST).length);
    const shippingCallers = SOURCES.filter(({ path }) => isShippingFile(path)).filter((source) => realCallFormsIn(source).length > 0);
    expect(shippingCallers.length).toBeGreaterThan(SHIPPING_REAL_CALL_FORM_COUNT_FLOOR);
    expect(shippingCallers.map(({ path }) => path)).toContain('src/lib/git/GitProcess.ts');
  });
});

describe('the suites of the tree', () => {
  test('no default spec outside the allowlist calls the real system, and every entry still does', () => {
    expect(suiteViolationsOf(SOURCES, REAL_SYSTEM_ALLOWLIST)).toEqual([]);
  });

  test('every real-system spec is listed under a boundary, and every shipping call site is a boundary', () => {
    expect(boundaryListViolationsOf(SOURCES, (path) => existsSync(join(REPOSITORY_ROOT, path)))).toEqual([]);
  });
});

describe('a planted spec is named', () => {
  test.each([
    ['`Bun.spawn`', 'Bun.spawn([\'true\']);', 'Bun.spawn'],
    ['`Bun.spawnSync`', 'Bun.spawnSync([\'true\']);', 'Bun.spawnSync'],
    ['`Bun.serve`', 'Bun.serve({ fetch: handler });', 'Bun.serve'],
    ['`Bun.connect`', 'Bun.connect(options);', 'Bun.connect'],
    ['`Bun.listen`', 'Bun.listen(options);', 'Bun.listen'],
    ['`Bun.udpSocket`', 'Bun.udpSocket(options);', 'Bun.udpSocket'],
    ['the Bun shell as a tag', 'await Bun.$`git status`;', 'Bun.$'],
    ['`fetch`', 'await fetch(address);', 'fetch'],
    ['a WebSocket', 'new WebSocket(address);', 'WebSocket'],
    ['`GitProcess.run`', 'GitProcess.run(directory, [\'status\']);', 'GitProcess.run'],
    ['a child process import', 'import { spawn } from \'node:child_process\';', 'node:child_process'],
    ['an unprefixed import', 'import { spawn } from \'child_process\';', 'child_process'],
    ['a socket import', 'import { createServer } from \'node:net\';', 'node:net'],
    ['a socket import beside an inline type', 'import { createServer, type Socket } from \'node:net\';', 'node:net'],
    ['an http import', 'import http from \'node:http\';', 'node:http'],
    ['a dynamic import', 'await import(\'node:child_process\');', 'node:child_process'],
    ['a `require`', 'require(\'node:net\');', 'node:net'],
    ['the Bun shell', 'import { $ } from \'bun\';', '$'],
    ['a helper starting the binary', 'import { runAgentProgress } from \'./testing/CliProcess.ts\';', 'runAgentProgress'],
    ['a helper running git', 'import { gitOutputIn as git } from \'./testing/ScratchWorkspace.ts\';', 'gitOutputIn'],
    ['a helper starting a child', 'import { jsonPrintedByAChildProcess } from \'./testing/JsonPrintedByAChildProcess.ts\';', 'jsonPrintedByAChildProcess'],
  ])('%s', (_form, text, form) => {
    const planted = { path: 'cli/Example.spec.ts', text };
    expect(suiteViolationsOf([planted], {})).toEqual([`cli/Example.spec.ts is a default spec calling ${form}`]);
  });

  test('in a DOM spec too', () => {
    expect(suiteViolationsOf([{ path: 'bridge/Example.dom.tsx', text: 'await fetch(address);' }], {})).toEqual(['bridge/Example.dom.tsx is a default spec calling fetch']);
  });

  test.each(Object.keys(REAL_SYSTEM_ALLOWLIST).map((path) => [path]))('%s passes on the allowlist and not off it', (path) => {
    const source = SOURCES.filter((candidate) => candidate.path === path);
    expect(suiteViolationsOf(source, { [path]: '#571' })).toEqual([]);
    expect(suiteViolationsOf(source, {})).toEqual([expect.stringContaining(`${path} is a default spec calling`)]);
  });
});

describe('what the guard leaves alone', () => {
  test('a sentence, a string, a type-only import, a stub\'s name and a shipping module pass', () => {
    expect(suiteViolationsOf([
      {
        path: 'cli/Words.spec.ts',
        text: [
          '// Bun.spawn',
          'const line = \'await fetch(address)\';',
          'import type { Socket } from \'node:net\';',
          'import { type Server } from \'node:net\';',
          'const fetchOf = stub;',
          'fetchOf();',
        ].join('\n'),
      },
      { path: 'cli/Shipping.ts', text: 'Bun.spawn([\'true\']);\n' },
    ], {})).toEqual([]);
  });

  test('a real call in an integration spec passes', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.integration.spec.ts', text: 'Bun.spawn([\'true\']);\n' }], {})).toEqual([]);
  });
});

describe('the lists stay exact both ways', () => {
  test('an allowlist entry that makes no real call is named', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.spec.ts', text: 'export {};\n' }], { 'cli/Example.spec.ts': '#571' }))
      .toEqual(['the allowlist names cli/Example.spec.ts, which makes no real call']);
  });

  test('an allowlist entry whose file is gone is named', () => {
    expect(suiteViolationsOf([], { 'cli/Gone.spec.ts': '#572' })).toEqual(['the allowlist names cli/Gone.spec.ts, which makes no real call']);
  });

  test('an integration spec making no real call is named', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.integration.spec.ts', text: 'export {};\n' }], {}))
      .toEqual(['cli/Example.integration.spec.ts is an integration spec making no real call']);
  });

  test('every entry of the allowlist names #572', () => {
    expect(new Set(Object.values(REAL_SYSTEM_ALLOWLIST))).toEqual(new Set(['#572']));
  });

  const allListed = BOUNDARY_SPECS.flatMap(({ specs }) => specs).map((path) => ({ path, text: 'Bun.spawn([\'true\']);\n' }));

  test('an unlisted integration spec is named', () => {
    const planted = { path: 'cli/Unlisted.integration.spec.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(boundaryListViolationsOf([...allListed, planted], () => true)).toEqual(['cli/Unlisted.integration.spec.ts is listed under no boundary']);
  });

  test('a listed spec that does not exist is named', () => {
    const [firstListed, ...others] = [...new Set(allListed.map(({ path }) => path))];
    const sources = others.map((path) => ({ path, text: 'Bun.spawn([\'true\']);\n' }));
    expect(boundaryListViolationsOf(sources, () => true)).toEqual([`BOUNDARY_SPECS names ${firstListed}, which does not exist`]);
  });

  test('a boundary that does not exist is named', () => {
    const [firstBoundary] = BOUNDARY_SPECS;
    expect(boundaryListViolationsOf(allListed, (path) => path !== firstBoundary?.boundary))
      .toEqual([`BOUNDARY_SPECS lists the boundary ${firstBoundary?.boundary}, which does not exist`]);
  });

  test('a shipping call site that is no boundary is named', () => {
    const planted = { path: 'cli/NewCaller.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(boundaryListViolationsOf([...allListed, planted], () => true)).toEqual(['cli/NewCaller.ts makes a real call and is no listed boundary']);
  });
});

describe('what a change runs', () => {
  const integrationSpecPaths = [...new Set(BOUNDARY_SPECS.flatMap(({ specs }) => specs))];

  test('a change to no boundary runs nothing', () => {
    expect(integrationSpecsTouchedBy(['cli/tickets/TicketAdd.ts', 'docs/cli.md'], integrationSpecPaths)).toEqual([]);
  });

  test.each(BOUNDARY_SPECS.map(({ boundary, specs }) => [boundary, specs] as const))('a change to %s runs its specs', (boundary, specs) => {
    const changedPath = boundary.endsWith('/') ? `${boundary}Example.md` : boundary;
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toEqual(expect.arrayContaining([...specs]));
  });

  test.each([
    ['src/lib/process-identity/DarwinProcessIdentity.ts', 'src/lib/process-identity/ProcessIdentity.integration.spec.ts'],
    ['src/lib/gate-confinement/DarwinSeatbelt.ts', 'src/services/overseer/ProcessWatcherSandbox.integration.spec.ts'],
    ['src/lib/shell-line/PosixShellLine.ts', 'src/lib/shell-line/ShellLine.contract.integration.spec.ts'],
    ['src/lib/executable-resolver/PosixExecutableResolver.ts', 'src/lib/executable-resolver/ExecutableResolver.planted.integration.spec.ts'],
    ['src/lib/watcher/PosixSocketEndpoint.ts', 'src/lib/watcher/LocalEndpoint.contract.integration.spec.ts'],
    ['src/lib/watcher/WatcherSocketServer.ts', 'src/lib/watcher/Watcher.protocol.integration.spec.ts'],
  ])('a change to the implementation %s behind a port runs %s', (changedPath, spec) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toContain(spec);
  });

  test.each(['package.json', 'bunfig.toml', 'src/testing/BoundarySpecs.ts'])('a change to %s proves the split again', (changedPath) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toEqual(['src/testing/RunTouchedBoundarySpecs.integration.spec.ts']);
  });

  test('a changed integration spec runs itself, and a module its own aspects', () => {
    expect(integrationSpecsTouchedBy(['src/lib/git/Worktrees.integration.spec.ts'], integrationSpecPaths)).toEqual(['src/lib/git/Worktrees.integration.spec.ts']);
    expect(integrationSpecsTouchedBy(['src/services/overseer/JobLaunch.ts'], integrationSpecPaths)).toEqual([
      'src/services/overseer/JobLaunch.gating.integration.spec.ts',
      'src/services/overseer/JobLaunch.integration.spec.ts',
      'src/services/overseer/JobLaunch.retry.integration.spec.ts',
    ]);
  });

  test('a listed spec that is gone from the tree is not run', () => {
    expect(integrationSpecsTouchedBy(['eslint.config.js'], [])).toEqual([]);
  });
});
