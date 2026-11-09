/**
 * `reachablePathsFrom`, the walk the guards share. What matters: it follows imports through each other, keeps the entries, ignores package
 * imports and stops at a cycle; and on the real graph the Bridge entry reaches its modules, which the include-list guard relies on.
 */
import { describe, expect, test } from 'bun:test';

import { importGraphScannerOf, reachablePathsFrom, repositoryRootOfThisCheckout } from './ImportGraph.ts';

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

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
