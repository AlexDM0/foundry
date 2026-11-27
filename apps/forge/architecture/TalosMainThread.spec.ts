/**
 * Talos's main loop never blocks: no module that `talos.ts` loads at run time, outside what its synchronous-calls thread loads, calls a
 * synchronous primitive (an identifier ending in `Sync`, `spawnSync` and `Bun.sleepSync` among them, or `Atomics.wait`), since a blocked loop
 * delays every frame and reads as a gap to the lease. The one exception, the last log line of a Talos whose call failed, is an exact
 * allowlist entry naming its function, each call counted. A module both threads load is the thread's, so what the main thread takes from
 * one that reaches a synchronous primitive is an exact list too. The scan follows value imports only: the import graph records `import type`
 * as an edge too, and a type-only import loads nothing at run time. Each form is planted and watched failing.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { type ImportGraph, importGraphScannerOf, repositoryRootOfThisCheckout } from '../src/testing/ImportGraph.ts';

const TALOS_BINARY_PATH = 'talos.ts';
const TALOS_MAIN_MODULE_PATH = 'src/lib/talos/Talos.ts';
const SYNCHRONOUS_CALLS_THREAD_PATH = 'src/lib/talos/SynchronousCallsThread.ts';
const SYNCHRONOUS_CALL_NAME = /Sync$/;
const ATOMICS_WAIT = 'Atomics.wait';

/** `<path>: <enclosing function>: <called name>`, one entry per call, each with why it stays. */
const ALLOWED_BLOCKING_CALLS: Readonly<Record<string, string>> = {
  'src/lib/talos/Talos.ts: fail: appendFileSync':
    'The cause of a failed synchronous call: the thread that would write it may be what failed, and the process exits right after it.',
};

/** `<path>: <use>` of a module both threads load that reaches a synchronous primitive, each with why it does not block the main thread. */
const ALLOWED_SHARED_MODULE_USES: Readonly<Record<string, string>> = {
  'src/lib/talos/Talos.ts: processSupervisionFor(…).spawnOptionsFor':
    'The spawn options of a kind, a constant object; every process-table read and signal of the port runs on the thread.',
  'src/lib/talos/Talos.ts: localEndpointFor(…)':
    'Talos\'s ports narrow it to `serverOf`, which creates a server; preparing and releasing the endpoint run on the thread.',
};

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

function sourceFileOf(graph: ImportGraph, path: string): ts.SourceFile {
  return ts.createSourceFile(path, graph.sourceTextOf(path), ts.ScriptTarget.Latest, true);
}

function importsOnlyTypes({ importClause }: ts.ImportDeclaration): boolean {
  if (importClause === undefined) return false;
  if (importClause.isTypeOnly) return true;
  const { name, namedBindings } = importClause;
  return name === undefined && namedBindings !== undefined && ts.isNamedImports(namedBindings) && namedBindings.elements.every((element) => element.isTypeOnly);
}

/** The specifiers a module loads at run time: its value imports and its dynamic imports. */
function runtimeSpecifiersOf(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !importsOnlyTypes(node)) specifiers.add(node.moduleSpecifier.text);
    const [firstArgument] = ts.isCallExpression(node) ? node.arguments : [];
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && firstArgument !== undefined && ts.isStringLiteral(firstArgument)) {
      specifiers.add(firstArgument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function runtimeClosureOf(graph: ImportGraph, entryPath: string): ReadonlySet<string> {
  const reached = new Set([entryPath]);
  const pending = [entryPath];
  while (pending.length > 0) {
    const fromPath = pending.pop() ?? '';
    const runtimeSpecifiers = runtimeSpecifiersOf(sourceFileOf(graph, fromPath));
    for (const edge of graph.edges) {
      if (edge.fromPath !== fromPath || edge.target.kind !== 'repository-file' || !runtimeSpecifiers.has(edge.specifier)) continue;
      if (reached.has(edge.target.path)) continue;
      reached.add(edge.target.path);
      pending.push(edge.target.path);
    }
  }
  return reached;
}

function enclosingFunctionNameOf(node: ts.Node): string {
  for (let ancestor = node.parent; ancestor !== undefined; ancestor = ancestor.parent) {
    const declaredName = ts.isFunctionDeclaration(ancestor) || ts.isVariableDeclaration(ancestor) || ts.isMethodDeclaration(ancestor) || ts.isPropertyAssignment(ancestor)
      ? ancestor.name
      : undefined;
    if (declaredName !== undefined && ts.isIdentifier(declaredName)) return declaredName.text;
  }
  return '<module>';
}

/** One entry per call, so a second call at an allowlisted site is a second entry. */
function blockingCallsIn(graph: ImportGraph, path: string): string[] {
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calledName = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      const blockingName = callee.getText() === ATOMICS_WAIT ? ATOMICS_WAIT : calledName !== null && SYNCHRONOUS_CALL_NAME.test(calledName) ? calledName : null;
      if (blockingName !== null) calls.push(`${path}: ${enclosingFunctionNameOf(node)}: ${blockingName}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFileOf(graph, path));
  return calls;
}

/** The modules of Talos's main thread: what `talos.ts` loads, less what the synchronous-calls thread loads too. */
function mainThreadModulesOf(graph: ImportGraph): readonly string[] {
  const threadClosure = runtimeClosureOf(graph, SYNCHRONOUS_CALLS_THREAD_PATH);
  return [...runtimeClosureOf(graph, TALOS_BINARY_PATH)].filter((path) => !threadClosure.has(path)).sort();
}

function blockingCallsOnTheMainThread(graph: ImportGraph): readonly string[] {
  return mainThreadModulesOf(graph).flatMap((path) => blockingCallsIn(graph, path)).sort();
}

/** Each allowlist entry covers one call: a second call at its site is named. */
function violationsOf(graph: ImportGraph): readonly string[] {
  const uncoveredAllowances = new Set(Object.keys(ALLOWED_BLOCKING_CALLS));
  return blockingCallsOnTheMainThread(graph).filter((call) => !uncoveredAllowances.delete(call));
}

/** The modules both threads load whose own closure calls a synchronous primitive. */
function blockingSharedModulesOf(graph: ImportGraph): ReadonlySet<string> {
  const threadClosure = runtimeClosureOf(graph, SYNCHRONOUS_CALLS_THREAD_PATH);
  const sharedModules = [...runtimeClosureOf(graph, TALOS_BINARY_PATH)].filter((path) => threadClosure.has(path));
  return new Set(sharedModules.filter((path) => [...runtimeClosureOf(graph, path)].some((reachedPath) => blockingCallsIn(graph, reachedPath).length > 0)));
}

/** The use of an imported binding: `name`, `name(…)`, or `name(…).member` when the main thread takes a member of what the call answers. */
function useOf(reference: ts.Identifier): string {
  const { parent } = reference;
  if (!ts.isCallExpression(parent) || parent.expression !== reference) return reference.text;
  return ts.isPropertyAccessExpression(parent.parent) ? `${reference.text}(…).${parent.parent.name.text}` : `${reference.text}(…)`;
}

function sharedModuleUsesOnTheMainThread(graph: ImportGraph): readonly string[] {
  const blockingSharedModules = blockingSharedModulesOf(graph);
  return mainThreadModulesOf(graph).flatMap((path) => {
    const sourceFile = sourceFileOf(graph, path);
    const importedNames = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || importsOnlyTypes(statement)) continue;
      const { text: specifier } = statement.moduleSpecifier;
      const edge = graph.edges.find((candidate) => candidate.fromPath === path && candidate.specifier === specifier);
      if (edge?.target.kind !== 'repository-file' || !blockingSharedModules.has(edge.target.path)) continue;
      const namedBindings = statement.importClause?.namedBindings;
      if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) for (const element of namedBindings.elements) importedNames.add(element.name.text);
    }
    const uses: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) return;
      if (ts.isIdentifier(node) && importedNames.has(node.text)) uses.push(`${path}: ${useOf(node)}`);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return uses;
  }).sort();
}

function plantedInTheMainModule(importLine: string, plantedFiles: Readonly<Record<string, string>> = {}): ImportGraph {
  return SCANNER.graphWithPlantedFiles({ ...plantedFiles, [TALOS_MAIN_MODULE_PATH]: `${importLine}\n${SCANNER.graph.sourceTextOf(TALOS_MAIN_MODULE_PATH)}` });
}

describe('the scan saw the main thread', () => {
  test('it reaches the main module, the socket server and the child supervisor, and leaves what the thread loads to the thread', () => {
    const mainThreadModules = mainThreadModulesOf(SCANNER.graph);
    expect(mainThreadModules).toEqual(expect.arrayContaining([
      TALOS_BINARY_PATH, TALOS_MAIN_MODULE_PATH, 'src/lib/talos/ChildSupervisor.ts', 'src/lib/talos/TalosSocketServer.ts', 'src/lib/talos/SynchronousCallsClient.ts',
    ]));
    expect(runtimeClosureOf(SCANNER.graph, TALOS_BINARY_PATH)).toContain('src/lib/process-identity/ProcessSupervisionFor.ts');
    expect(mainThreadModules).not.toContain('src/lib/process-identity/ProcessSupervisionFor.ts');
  });

  test('a type-only import loads nothing: the event log, which the main thread names only as types, is not reached', () => {
    expect(runtimeClosureOf(SCANNER.graph, TALOS_BINARY_PATH)).not.toContain('src/lib/talos/EventLog.ts');
    expect(blockingCallsIn(SCANNER.graph, 'src/lib/talos/EventLog.ts').length).toBeGreaterThan(0);
  });
});

test('no module of the main thread calls a synchronous primitive but the allowlisted ones, and every allowlist entry is found', () => {
  expect(violationsOf(SCANNER.graph)).toEqual([]);
  expect(blockingCallsOnTheMainThread(SCANNER.graph)).toEqual(Object.keys(ALLOWED_BLOCKING_CALLS).sort());
});

test('the main thread takes from a module both threads load, that reaches a synchronous primitive, only the listed uses, and each is found', () => {
  expect([...blockingSharedModulesOf(SCANNER.graph)]).toEqual(expect.arrayContaining([
    'src/lib/process-identity/ProcessSupervisionFor.ts', 'src/lib/talos/LocalEndpointFor.ts',
  ]));
  expect(sharedModuleUsesOnTheMainThread(SCANNER.graph)).toEqual(Object.keys(ALLOWED_SHARED_MODULE_USES).sort());
});

describe('each form is named', () => {
  const plantedPath = 'src/lib/talos/PlantedBlocking.ts';

  test.each([
    ['a synchronous file read', 'readFileSync(\'/example\');', 'readFileSync'],
    ['a synchronous spawn', 'Bun.spawnSync([\'example\']);', 'spawnSync'],
    ['a blocking sleep', 'Bun.sleepSync(50);', 'sleepSync'],
    ['an atomics wait', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);', 'Atomics.wait'],
  ])('%s in a module the main thread loads', (_formName, plantedLine, calledName) => {
    const plantedFiles = { [plantedPath]: `export function blockAWhile(): void {\n  ${plantedLine}\n}\n` };
    const graph = plantedInTheMainModule('import { blockAWhile } from \'./PlantedBlocking.ts\';', plantedFiles);
    expect(violationsOf(graph)).toEqual([`${plantedPath}: blockAWhile: ${calledName}`]);
  });

  test('a value import of a module calling a synchronous primitive is named; a type-only import of it is not', () => {
    const plantedSource = [
      'export interface PlantedHandle { readonly descriptor: number }',
      'export function plantedOpen(): number {',
      '  return openSync(\'/example\', \'a\');',
      '}',
    ].join('\n');
    const plantedFiles = { [plantedPath]: `${plantedSource}\n` };
    expect(violationsOf(plantedInTheMainModule('import { plantedOpen } from \'./PlantedBlocking.ts\';', plantedFiles))).toEqual([`${plantedPath}: plantedOpen: openSync`]);
    expect(violationsOf(plantedInTheMainModule('import type { PlantedHandle } from \'./PlantedBlocking.ts\';', plantedFiles))).toEqual([]);
    expect(violationsOf(plantedInTheMainModule('import { type PlantedHandle } from \'./PlantedBlocking.ts\';', plantedFiles))).toEqual([]);
  });

  test('a second synchronous write in another function of the main module is not covered by its allowlist entry', () => {
    const plantedWrite = 'export function plantedWrite(): void {\n  appendFileSync(\'/example\', \'example\');\n}\n';
    const graph = SCANNER.graphWithPlantedFiles({ [TALOS_MAIN_MODULE_PATH]: `${SCANNER.graph.sourceTextOf(TALOS_MAIN_MODULE_PATH)}\n${plantedWrite}` });
    expect(violationsOf(graph)).toEqual(['src/lib/talos/Talos.ts: plantedWrite: appendFileSync']);
  });

  test('a second synchronous write at the allowlisted site itself is not covered by its allowlist entry', () => {
    const allowedWrite = 'appendFileSync(talosLogPath, `talos failed: ';
    const mainModuleSource = SCANNER.graph.sourceTextOf(TALOS_MAIN_MODULE_PATH);
    expect(mainModuleSource).toContain(allowedWrite);
    const graph = SCANNER.graphWithPlantedFiles({ [TALOS_MAIN_MODULE_PATH]: mainModuleSource.replace(allowedWrite, `appendFileSync(talosLogPath, 'again');\n${allowedWrite}`) });
    expect(violationsOf(graph)).toEqual(['src/lib/talos/Talos.ts: fail: appendFileSync']);
  });

  test('a new main-thread use of a module both threads load, that reaches a synchronous primitive, is named', () => {
    const plantedUse = 'export function plantedIdentity(): unknown {\n  return processSupervisionFor(\'darwin\', undefined).identityOf(1);\n}\n';
    const graph = SCANNER.graphWithPlantedFiles({ [TALOS_MAIN_MODULE_PATH]: `${SCANNER.graph.sourceTextOf(TALOS_MAIN_MODULE_PATH)}\n${plantedUse}` });
    expect(sharedModuleUsesOnTheMainThread(graph)).toContain('src/lib/talos/Talos.ts: processSupervisionFor(…).identityOf');
  });
});
