/**
 * Talos runs from the program on disk for as long as its board, so what it may reach is held here: the static import closure of `talos.ts`
 * and of its synchronous-calls thread's entry stays inside `src/lib/talos/`, the packages its main module declares and the packages theirs
 * declare, which never reach the board, the tickets or git, and its shipped files, the declared packages' files it reaches among them, name no
 * product and no vendor. A planted import of another lib package, one of a forbidden builtin and a planted vendor name prove the tests fire.
 */
import { describe, expect, test } from 'bun:test';

import {
  type ImportGraph,
  importGraphScannerOf,
  reachablePathsFrom,
  repositoryRootOfThisCheckout
} from '../src/testing/ImportGraph.ts';

const TALOS_BINARY_PATH = 'talos.ts';
/** The worker's entry, which `SynchronousCallsClient.ts` starts by its URL, so no import reaches it. */
const SYNCHRONOUS_CALLS_THREAD_PATH = 'src/lib/talos/SynchronousCallsThread.ts';
const TALOS_PACKAGE_FOLDER = 'src/lib/talos/';
const TALOS_MAIN_MODULE_PATH = 'src/lib/talos/Talos.ts';
const DECLARED_PACKAGE_PATTERN = /`src\/lib\/([a-z-]+)`/g;
const HEADER_COMMENT = /^\/\*\*([\s\S]*?)\*\//;

/** What Talos must never reach: the tracker and its model, the git primitives, and the app layers above `src/lib/`. */
const FORBIDDEN_FOLDERS = ['src/domain/tracker-model/', 'src/lib/git/', 'src/shared/', 'src/adapters/', 'src/services/', 'cli/'];
const FORBIDDEN_NAMES = /agent-progress|claude|anthropic/i;

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

function headerOf(graph: ImportGraph, modulePath: string): string {
  return HEADER_COMMENT.exec(graph.sourceTextOf(modulePath))?.[1]?.replace(/\n\s*\*/g, ' ') ?? '';
}

function packageFoldersDeclaredIn(graph: ImportGraph, modulePath: string): readonly string[] {
  return [...headerOf(graph, modulePath).matchAll(DECLARED_PACKAGE_PATTERN)].map((match) => `src/lib/${match[1] ?? ''}/`);
}

/** A declared package may reach the packages its own main module declares. */
function packageFoldersReachableOf(graph: ImportGraph): readonly string[] {
  const declaredFolders = packageFoldersDeclaredIn(graph, TALOS_MAIN_MODULE_PATH);
  const mainModulePaths = graph.scannedPaths.filter((path) => declaredFolders.some((folder) => path.startsWith(folder))
    && path.split('/').length === 4 && !path.endsWith('.spec.ts') && headerOf(graph, path).includes('depends on'));
  return [...new Set([...declaredFolders, ...mainModulePaths.flatMap((path) => packageFoldersDeclaredIn(graph, path))])];
}

function closureOf(graph: ImportGraph): readonly string[] {
  return [...reachablePathsFrom(graph, [TALOS_BINARY_PATH, SYNCHRONOUS_CALLS_THREAD_PATH])].sort();
}

function builtinsReachedBy(graph: ImportGraph, closure: readonly string[]): readonly string[] {
  const closurePaths = new Set(closure);
  const builtins = graph.edges.flatMap((edge) => (closurePaths.has(edge.fromPath) && edge.target.kind === 'package' ? [edge.target.specifier] : []));
  return [...new Set(builtins)].sort();
}

/** Every file of the closure outside the package and its declared packages, and every test-only file in it. */
function strayPathsOf(graph: ImportGraph): readonly string[] {
  const allowedFolders = [TALOS_PACKAGE_FOLDER, ...packageFoldersReachableOf(graph)];
  return closureOf(graph).filter((path) => path !== TALOS_BINARY_PATH
    && (!allowedFolders.some((folder) => path.startsWith(folder)) || path.endsWith('.spec.ts') || path.split('/').includes('testing')));
}

/** Every shipped file of the package, and every file of the closure: `talos.ts` and what it reaches in its declared packages. */
function shippedPathsOf(graph: ImportGraph): readonly string[] {
  const shippedPackagePaths = graph.scannedPaths.filter((path) => path.startsWith(TALOS_PACKAGE_FOLDER) && !path.endsWith('.spec.ts'));
  return [...new Set([...shippedPackagePaths, ...closureOf(graph)])].sort();
}

function pathsNamingAProductOrVendor(graph: ImportGraph): readonly string[] {
  return shippedPathsOf(graph).filter((path) => FORBIDDEN_NAMES.test(graph.sourceTextOf(path)));
}

describe('the Talos closure', () => {
  test('the scan reaches the Talos package, its thread and every declared package from talos.ts', () => {
    expect(packageFoldersDeclaredIn(SCANNER.graph, TALOS_MAIN_MODULE_PATH)).toEqual([
      'src/lib/atomic-file/', 'src/lib/json-record/', 'src/lib/owner-only-files/', 'src/lib/process-identity/',
    ]);
    expect(closureOf(SCANNER.graph)).toEqual(expect.arrayContaining([
      TALOS_BINARY_PATH,
      TALOS_MAIN_MODULE_PATH,
      SYNCHRONOUS_CALLS_THREAD_PATH,
      'src/lib/talos/ChildSupervisor.ts',
      'src/lib/talos/TalosSocketServer.ts',
      'src/lib/atomic-file/AtomicFile.ts',
      'src/lib/process-identity/ProcessIdentity.ts',
    ]));
  });

  test('stays inside the package and its declared packages', () => {
    expect(strayPathsOf(SCANNER.graph)).toEqual([]);
  });

  test('a planted import of another lib package is named', () => {
    const plantedPath = 'src/lib/talos/TalosFiles.ts';
    const plantedSource = `import { CLAUDE_CODE_ADAPTER } from '../claude-code/ClaudeCodeAdapter.ts';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    expect(strayPathsOf(SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource }))).toContain('src/lib/claude-code/ClaudeCodeAdapter.ts');
  });

  test('never reaches the board, the ticket files or git, and reaches only the builtins it lists', () => {
    const closure = closureOf(SCANNER.graph);
    expect(closure.filter((path) => FORBIDDEN_FOLDERS.some((folder) => path.startsWith(folder)))).toEqual([]);
    expect(builtinsReachedBy(SCANNER.graph, closure)).toEqual(['bun:ffi', 'node:crypto', 'node:fs', 'node:net', 'node:path']);
  });

  test('a planted import of a forbidden builtin is named', () => {
    const plantedPath = 'src/lib/talos/TalosFiles.ts';
    const plantedSource = `import { spawnSync } from 'node:child_process';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    const plantedGraph = SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource });
    expect(builtinsReachedBy(plantedGraph, closureOf(plantedGraph))).toContain('node:child_process');
  });

  test('its shipped files, those of its declared packages that the closure reaches among them, name no product and no vendor', () => {
    const shippedPaths = shippedPathsOf(SCANNER.graph);
    expect(shippedPaths.length).toBeGreaterThanOrEqual(10);
    expect(shippedPaths).toEqual(expect.arrayContaining([TALOS_BINARY_PATH, 'src/lib/atomic-file/AtomicFile.ts', 'src/lib/process-identity/ProcessIdentity.ts']));
    expect(pathsNamingAProductOrVendor(SCANNER.graph)).toEqual([]);
  });

  test('a vendor name planted in a declared package the closure reaches is named', () => {
    const plantedPath = 'src/lib/atomic-file/AtomicFile.ts';
    const plantedSource = `// written for claude\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    expect(pathsNamingAProductOrVendor(SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource }))).toEqual([plantedPath]);
  });
});
