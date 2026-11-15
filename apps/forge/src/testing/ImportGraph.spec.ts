/**
 * `reachablePathsFrom`, the walk the guards share, and the resolution of each specifier. What matters: it follows imports through each
 * other, keeps the entries, ignores package imports and stops at a cycle; on the real graph the Bridge entry reaches its modules, which the
 * include-list guard relies on; and a workspace package's specifier resolves through its `exports` as Bun and TypeScript resolve it, which
 * the import-direction guard relies on to tell an import by name from one by path.
 */
import { describe, expect, test } from 'bun:test';

import { importGraphScannerOf, reachablePathsFrom, repositoryRootOfThisCheckout } from './ImportGraph.ts';

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

describe('the target of a specifier', () => {
  const targetsOf = (specifiers: readonly string[]): readonly unknown[] => {
    const plantedSource = specifiers.map((specifier, i) => `import { planted${i} } from '${specifier}';\n`).join('');
    return SCANNER.graphWithPlantedFiles({ 'bridge/Planted.ts': plantedSource }).edges
      .filter((edge) => edge.fromPath === 'bridge/Planted.ts')
      .map((edge) => ({ specifier: edge.specifier, target: edge.target }));
  };

  test('a relative or absolute path is the repository file it names, and a workspace package\'s exported entry is the file its exports map names', () => {
    const absoluteSpecifier = `${repositoryRootOfThisCheckout().replaceAll('\\', '/')}/src/shared/Environment.ts`;
    expect(targetsOf(['./shell/HashRouter.ts', absoluteSpecifier, 'design-system/Button'])).toEqual([
      { specifier: './shell/HashRouter.ts', target: { kind: 'repository-file', path: 'bridge/shell/HashRouter.ts' } },
      { specifier: absoluteSpecifier, target: { kind: 'repository-file', path: 'src/shared/Environment.ts' } },
      { specifier: 'design-system/Button', target: { kind: 'repository-file', path: 'design-system/atoms/Button.tsx' } },
    ]);
  });

  test('a workspace package\'s name with an entry its exports do not list stays unresolved, and any other package is a package', () => {
    expect(targetsOf(['design-system/atoms/Button.tsx', 'react'])).toEqual([
      { specifier: 'design-system/atoms/Button.tsx', target: { kind: 'unexported-workspace-entry', specifier: 'design-system/atoms/Button.tsx' } },
      { specifier: 'react', target: { kind: 'package', specifier: 'react' } },
    ]);
  });
});

describe('reachablePathsFrom', () => {
  test('follows imports through each other, keeps the entries, skips packages and stops at a cycle', () => {
    const graph = SCANNER.graphWithPlantedFiles({
      'planted/Entry.ts':       'import { middle } from \'./Middle.ts\';\nimport ts from \'typescript\';\n',
      'planted/Middle.ts':      'export { leaf } from \'./nested/Leaf.ts\';\n',
      'planted/nested/Leaf.ts': 'import type { Entry } from \'../Entry.ts\';\n',
      'planted/Unreached.ts':   'import { middle } from \'./Middle.ts\';\n',
    });

    expect([...reachablePathsFrom(graph, ['planted/Entry.ts'])].sort()).toEqual(['planted/Entry.ts', 'planted/Middle.ts', 'planted/nested/Leaf.ts']);
  });

  test('the graph is read once per root and frozen, and a planted graph leaves it untouched', () => {
    expect(importGraphScannerOf(repositoryRootOfThisCheckout())).toBe(SCANNER);
    expect(Object.isFrozen(SCANNER.graph.edges)).toBe(true);
    const plantedPath = 'planted/Entry.ts';
    SCANNER.graphWithPlantedFiles({ [plantedPath]: 'import { middle } from \'./Middle.ts\';\n' });
    expect(SCANNER.graph.scannedPaths).not.toContain(plantedPath);
    expect(SCANNER.graph.sourceTextOf(plantedPath)).toBe('');
  });

  test('on the real graph, the Bridge entry reaches its app shell and its Kanban view', () => {
    const bridgeReach = [...reachablePathsFrom(SCANNER.graph, ['bridge/Main.tsx'])];

    expect(bridgeReach).toContain('bridge/shell/BridgeApp.tsx');
    expect(bridgeReach).toContain('bridge/views/kanban/KanbanView.tsx');
  });
});
