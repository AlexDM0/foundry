/**
 * Talos runs from the program on disk for as long as its board, so what it may reach is held here: the static import closure of `talos.ts`
 * and of its synchronous-calls thread's entry stays inside the program in `talos/`, the packages its main module declares (its contract in
 * `src/domain/talos/` among them) and, in turn, the packages theirs declare, which never reach the board, the tickets or git. Its shipped
 * files, and the declared packages' files it reaches, name no product and no vendor. A planted import of another lib package, one of a
 * forbidden builtin and a planted vendor name prove the tests fire.
 */
import { describe, expect, test } from 'bun:test';

import {
  type ImportGraph,
  importGraphScannerOf,
  reachablePathsFrom,
  repositoryRootOfThisCheckout
} from '../src/testing/ImportGraph.ts';

const TALOS_BINARY_PATH = 'talos.ts';
const TALOS_PROGRAM_FOLDER = 'talos/';
/** The worker's entry, which `SynchronousCallsClient.ts` starts by its URL, so no import reaches it. */
const SYNCHRONOUS_CALLS_THREAD_PATH = 'talos/SynchronousCallsThread.ts';
const TALOS_MAIN_MODULE_PATH = 'talos/Talos.ts';
const TALOS_CONTRACT_FOLDER = 'src/domain/talos/';
const DECLARED_PACKAGE_PATTERN = /`src\/((?:lib|domain)\/[a-z-]+)`/g;
const HEADER_COMMENT = /^\/\*\*([\s\S]*?)\*\//;
/** `src/<layer>/<package>/<Module>.ts`: a package's main module sits directly in its folder. */
const MAIN_MODULE_DEPTH = 4;

/** What Talos must never reach: the tracker and its model, the git primitives, and the app layers above `src/domain/`. */
const FORBIDDEN_FOLDERS = ['src/domain/tracker-model/', 'src/lib/git/', 'src/shared/', 'src/adapters/', 'src/services/', 'cli/'];
const FORBIDDEN_NAMES = /agent-progress|claude|anthropic/i;

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

function headerOf(graph: ImportGraph, modulePath: string): string {
  return HEADER_COMMENT.exec(graph.sourceTextOf(modulePath))?.[1]?.replace(/\n\s*\*/g, ' ') ?? '';
}

function packageFoldersDeclaredIn(graph: ImportGraph, modulePath: string): readonly string[] {
  return [...headerOf(graph, modulePath).matchAll(DECLARED_PACKAGE_PATTERN)].map((match) => `src/${match[1] ?? ''}/`);
}

function isTestOnly(path: string): boolean {
  return path.endsWith('.spec.ts') || path.split('/').includes('testing');
}

/** The packages the program's main module declares and, in turn, those their own main modules declare. */
function packageFoldersReachableOf(graph: ImportGraph): readonly string[] {
  const reachable = new Set<string>();
  const pending = [...packageFoldersDeclaredIn(graph, TALOS_MAIN_MODULE_PATH)];
  for (let folder = pending.pop(); folder !== undefined; folder = pending.pop()) {
    if (reachable.has(folder)) continue;
    reachable.add(folder);
    const packageFolder = folder;
    const mainModulePaths = graph.scannedPaths.filter((path) => path.startsWith(packageFolder) && path.split('/').length === MAIN_MODULE_DEPTH
      && !isTestOnly(path) && headerOf(graph, path).includes('depends on'));
    pending.push(...mainModulePaths.flatMap((path) => packageFoldersDeclaredIn(graph, path)));
  }
  return [...reachable].sort();
}

function closureOf(graph: ImportGraph): readonly string[] {
  return [...reachablePathsFrom(graph, [TALOS_BINARY_PATH, SYNCHRONOUS_CALLS_THREAD_PATH])].sort();
}

function builtinsReachedBy(graph: ImportGraph, closure: readonly string[]): readonly string[] {
  const closurePaths = new Set(closure);
  const builtins = graph.edges.flatMap((edge) => (closurePaths.has(edge.fromPath) && edge.target.kind === 'package' ? [edge.target.specifier] : []));
  return [...new Set(builtins)].sort();
}

/** Every file of the closure outside the program and its declared packages, and every test-only file in it. */
function strayPathsOf(graph: ImportGraph): readonly string[] {
  const allowedFolders = [TALOS_PROGRAM_FOLDER, ...packageFoldersReachableOf(graph)];
  return closureOf(graph).filter((path) => path !== TALOS_BINARY_PATH
    && (!allowedFolders.some((folder) => path.startsWith(folder)) || isTestOnly(path)));
}

/** Every shipped file of the program and of its contract, and every file of the closure: what it reaches in its declared packages. */
function shippedPathsOf(graph: ImportGraph): readonly string[] {
  const shippedOwnPaths = graph.scannedPaths.filter((path) => [TALOS_PROGRAM_FOLDER, TALOS_CONTRACT_FOLDER].some((folder) => path.startsWith(folder))
    && !isTestOnly(path));
  return [...new Set([...shippedOwnPaths, ...closureOf(graph)])].sort();
}

function pathsNamingAProductOrVendor(graph: ImportGraph): readonly string[] {
  return shippedPathsOf(graph).filter((path) => FORBIDDEN_NAMES.test(graph.sourceTextOf(path)));
}

describe('the Talos closure', () => {
  test('the scan reaches the Talos program, its thread, its contract and every declared package from talos.ts', () => {
    expect(packageFoldersDeclaredIn(SCANNER.graph, TALOS_MAIN_MODULE_PATH)).toEqual([
      'src/domain/talos/', 'src/lib/atomic-file/', 'src/lib/line-patterns/', 'src/lib/local-endpoint/', 'src/lib/process-identity/',
    ]);
    expect(packageFoldersReachableOf(SCANNER.graph)).toEqual(expect.arrayContaining(['src/lib/json-record/', 'src/lib/owner-only-files/']));
    expect(closureOf(SCANNER.graph)).toEqual(expect.arrayContaining([
      TALOS_BINARY_PATH,
      TALOS_MAIN_MODULE_PATH,
      SYNCHRONOUS_CALLS_THREAD_PATH,
      'talos/ChildSupervisor.ts',
      'talos/TalosSocketServer.ts',
      'src/domain/talos/TalosFrames.ts',
      'src/lib/atomic-file/AtomicFile.ts',
      'src/lib/process-identity/ProcessIdentity.ts',
    ]));
  });

  test('stays inside the program and its declared packages', () => {
    expect(strayPathsOf(SCANNER.graph)).toEqual([]);
  });

  test('a planted import of another lib package, in the program or its contract, is named', () => {
    for (const plantedPath of ['talos/StreamLines.ts', 'src/domain/talos/TalosFiles.ts']) {
      const adapterSpecifier = plantedPath.startsWith(TALOS_PROGRAM_FOLDER) ? '../src/lib/claude-code/ClaudeCodeAdapter.ts' : '../../lib/claude-code/ClaudeCodeAdapter.ts';
      const plantedSource = `import { CLAUDE_CODE_ADAPTER } from '${adapterSpecifier}';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
      expect(strayPathsOf(SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource })), plantedPath).toContain('src/lib/claude-code/ClaudeCodeAdapter.ts');
    }
  });

  test('never reaches the board, the ticket files or git, and reaches only the builtins it lists', () => {
    const closure = closureOf(SCANNER.graph);
    expect(closure.filter((path) => FORBIDDEN_FOLDERS.some((folder) => path.startsWith(folder)))).toEqual([]);
    expect(builtinsReachedBy(SCANNER.graph, closure)).toEqual(['bun:ffi', 'node:crypto', 'node:fs', 'node:net', 'node:path']);
  });

  test('a planted import of a forbidden builtin is named', () => {
    const plantedPath = 'src/domain/talos/TalosFiles.ts';
    const plantedSource = `import { spawnSync } from 'node:child_process';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    const plantedGraph = SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource });
    expect(builtinsReachedBy(plantedGraph, closureOf(plantedGraph))).toContain('node:child_process');
  });

  test('its shipped files, those of its contract and of its declared packages that the closure reaches, name no product and no vendor', () => {
    const shippedPaths = shippedPathsOf(SCANNER.graph);
    expect(shippedPaths.length).toBeGreaterThanOrEqual(10);
    expect(shippedPaths).toEqual(expect.arrayContaining([
      TALOS_BINARY_PATH, 'src/domain/talos/ChildRecord.ts', 'src/lib/atomic-file/AtomicFile.ts', 'src/lib/process-identity/ProcessIdentity.ts',
    ]));
    expect(pathsNamingAProductOrVendor(SCANNER.graph)).toEqual([]);
  });

  test('a vendor name planted in a declared package the closure reaches is named', () => {
    const plantedPath = 'src/lib/atomic-file/AtomicFile.ts';
    const plantedSource = `// written for claude\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    expect(pathsNamingAProductOrVendor(SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource }))).toEqual([plantedPath]);
  });
});
