/**
 * The Watcher bundle is built from `watcher.ts` alone and pinned while agents run, so what it may reach is held here: its static import
 * closure stays inside `src/lib/watcher/`, the packages that package's main module declares and the packages theirs declare, which never
 * reach the board, the tickets or git, and its shipped files name no product and no vendor. A planted import of another lib package, and
 * one of a forbidden builtin, prove the guards fire.
 */
import { describe, expect, test } from 'bun:test';

import {
  type ImportGraph,
  importGraphScannerOf,
  reachablePathsFrom,
  repositoryRootOfThisCheckout
} from '../../testing/ImportGraph.ts';

const WATCHER_BINARY_PATH = 'watcher.ts';
const WATCHER_PACKAGE_FOLDER = 'src/lib/watcher/';
const WATCHER_MAIN_MODULE_PATH = 'src/lib/watcher/Watcher.ts';
const DECLARED_PACKAGE_PATTERN = /`src\/lib\/([a-z-]+)`/g;
const HEADER_COMMENT = /^\/\*\*([\s\S]*?)\*\//;

/** What the Watcher must never reach: the tracker and its model, the git primitives, and the app layers above `src/lib/`. */
const FORBIDDEN_FOLDERS = ['src/lib/tracker-model/', 'src/lib/git/', 'src/shared/', 'src/adapters/', 'src/services/', 'cli/'];
const FORBIDDEN_NAMES = /agent-progress|claude|anthropic/i;

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

function headerOf(graph: ImportGraph, modulePath: string): string {
  return HEADER_COMMENT.exec(graph.sourceTextOf(modulePath))?.[1]?.replace(/\n\s*\*/g, ' ') ?? '';
}

function packageFoldersDeclaredIn(graph: ImportGraph, modulePath: string): readonly string[] {
  return [...headerOf(graph, modulePath).matchAll(DECLARED_PACKAGE_PATTERN)].map((match) => `src/lib/${match[1] ?? ''}/`);
}

function declaredPackageFoldersOf(graph: ImportGraph): readonly string[] {
  return packageFoldersDeclaredIn(graph, WATCHER_MAIN_MODULE_PATH);
}

/** A declared package may reach the packages its own main module declares, as `src/lib/talos` reaches `src/lib/owner-only-files`. */
function packageFoldersReachableOf(graph: ImportGraph): readonly string[] {
  const declaredFolders = declaredPackageFoldersOf(graph);
  const mainModulePaths = graph.scannedPaths.filter((path) => declaredFolders.some((folder) => path.startsWith(folder))
    && path.split('/').length === 4 && !path.endsWith('.spec.ts') && headerOf(graph, path).includes('depends on'));
  return [...new Set([...declaredFolders, ...mainModulePaths.flatMap((path) => packageFoldersDeclaredIn(graph, path))])];
}

function closureOf(graph: ImportGraph): readonly string[] {
  return [...reachablePathsFrom(graph, [WATCHER_BINARY_PATH])].sort();
}

function builtinsReachedBy(graph: ImportGraph, closure: readonly string[]): readonly string[] {
  const closurePaths = new Set(closure);
  const builtins = graph.edges.flatMap((edge) => (closurePaths.has(edge.fromPath) && edge.target.kind === 'package' ? [edge.target.specifier] : []));
  return [...new Set(builtins)].sort();
}

/** Every file of the closure outside the package and its declared packages, and every test-only file in it. */
function strayPathsOf(graph: ImportGraph): readonly string[] {
  const allowedFolders = [WATCHER_PACKAGE_FOLDER, ...packageFoldersReachableOf(graph)];
  return closureOf(graph).filter((path) => path !== WATCHER_BINARY_PATH
    && (!allowedFolders.some((folder) => path.startsWith(folder)) || path.endsWith('.spec.ts') || path.split('/').includes('testing')));
}

describe('the Watcher bundle closure', () => {
  test('the scan reaches the Watcher package and every declared package from watcher.ts', () => {
    expect(declaredPackageFoldersOf(SCANNER.graph)).toEqual(['src/lib/atomic-file/', 'src/lib/process-identity/', 'src/lib/talos/']);
    expect(packageFoldersReachableOf(SCANNER.graph)).toContain('src/lib/owner-only-files/');
    expect(closureOf(SCANNER.graph)).toEqual(expect.arrayContaining([
      WATCHER_BINARY_PATH, WATCHER_MAIN_MODULE_PATH, 'src/lib/talos/EventLog.ts', 'src/lib/atomic-file/AtomicFile.ts', 'src/lib/process-identity/ProcessIdentity.ts',
    ]));
  });

  test('stays inside the package and its declared packages', () => {
    expect(strayPathsOf(SCANNER.graph)).toEqual([]);
  });

  test('a planted import of another lib package is named', () => {
    const plantedPath = 'src/lib/watcher/WatcherFiles.ts';
    const plantedSource = `import { CLAUDE_CODE_ADAPTER } from '../claude-code/ClaudeCodeAdapter.ts';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    const strayPaths = strayPathsOf(SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource }));
    expect(strayPaths).toContain('src/lib/claude-code/ClaudeCodeAdapter.ts');
  });

  test('never reaches the board, the ticket files or git', () => {
    const closure = closureOf(SCANNER.graph);
    expect(closure.filter((path) => FORBIDDEN_FOLDERS.some((folder) => path.startsWith(folder)))).toEqual([]);
    expect(builtinsReachedBy(SCANNER.graph, closure)).toEqual(['bun:ffi', 'node:crypto', 'node:fs', 'node:net', 'node:path']);
  });

  test('a planted import of a forbidden builtin is named', () => {
    const plantedPath = 'src/lib/watcher/WatcherFiles.ts';
    const plantedSource = `import { spawnSync } from 'node:child_process';\n${SCANNER.graph.sourceTextOf(plantedPath)}`;
    const plantedGraph = SCANNER.graphWithPlantedFiles({ [plantedPath]: plantedSource });
    expect(builtinsReachedBy(plantedGraph, closureOf(plantedGraph))).toContain('node:child_process');
  });

  test('holds only the Windows supervision, file replace and pipe files, and only the kernel file reaches the foreign function binding, which it opens on its first call', () => {
    const closure = closureOf(SCANNER.graph);
    expect(closure).toContain('src/lib/process-identity/ProcessSupervisionFor.ts');
    expect(closure).toContain('src/lib/talos/LocalEndpointFor.ts');
    expect(closure.filter((path) => path.split('/').at(-1)?.startsWith('Windows') === true).sort()).toEqual([
      'src/lib/atomic-file/WindowsFileReplace.ts',
      'src/lib/process-identity/WindowsKernelProcessApi.ts',
      'src/lib/process-identity/WindowsProcessIdentity.ts',
      'src/lib/process-identity/WindowsProcessTree.ts',
      'src/lib/talos/WindowsPipeEndpoint.ts',
    ]);
    const bindingImporters = SCANNER.graph.edges.filter((edge) => edge.target.kind === 'package' && edge.target.specifier === 'bun:ffi' && closure.includes(edge.fromPath));
    expect(bindingImporters.map((edge) => edge.fromPath)).toEqual(['src/lib/process-identity/WindowsKernelProcessApi.ts']);
  });

  test('its shipped files name no product and no vendor', () => {
    const shippedPackagePaths = SCANNER.graph.scannedPaths.filter((path) => path.startsWith(WATCHER_PACKAGE_FOLDER) && !path.endsWith('.spec.ts'));
    expect(shippedPackagePaths.length).toBeGreaterThanOrEqual(5);
    expect(shippedPackagePaths.filter((path) => FORBIDDEN_NAMES.test(SCANNER.graph.sourceTextOf(path)))).toEqual([]);
  });
});
