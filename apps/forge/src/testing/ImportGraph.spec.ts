/**
 * `reachablePathsFrom`, the walk the guards share, and the resolution of each specifier. What matters: it follows imports through each
 * other, keeps the entries, ignores package imports and stops at a cycle; on the real graph the binary reaches its command surface; and
 * a workspace package's specifier resolves through its `exports` as Bun and TypeScript resolve it, which
 * the import-direction guard relies on to tell an import by name from one by path; and each workspace package the program declares is read
 * from its own folder under a virtual folder named after it, so the guards hold it as they held the folder it once was; a relative path
 * resolves from the importer's real folder, a package with no spec project is read through its one project, and a member of the
 * workspace the program does not declare is named apart.
 */
import { describe, expect, test } from 'bun:test';

import {
  importGraphScannerOf,
  programFileLocationOf,
  reachablePathsFrom,
  repositoryRootOfThisCheckout
} from './ImportGraph.ts';

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

describe('the target of a specifier', () => {
  const targetsOf = (specifiers: readonly string[], importerPath = 'cli/Planted.ts'): readonly unknown[] => {
    const plantedSource = specifiers.map((specifier, i) => `import { planted${i} } from '${specifier}';\n`).join('');
    return SCANNER.graphWithPlantedFiles({ [importerPath]: plantedSource }).edges
      .filter((edge) => edge.fromPath === importerPath)
      .map((edge) => ({ specifier: edge.specifier, target: edge.target }));
  };

  test('a relative or absolute path is the repository file it names, and a workspace package\'s exported entry is the file its exports map names', () => {
    const absoluteSpecifier = `${repositoryRootOfThisCheckout().replaceAll('\\', '/')}/src/shared/Environment.ts`;
    expect(targetsOf(['./utils/ProgramAnswerUtil.ts', absoluteSpecifier, 'forge-contracts/ForgeSystemVersions', 'system-versions/SystemVersionUtil'])).toEqual([
      { specifier: './utils/ProgramAnswerUtil.ts', target: { kind: 'repository-file', path: 'cli/utils/ProgramAnswerUtil.ts' } },
      { specifier: absoluteSpecifier, target: { kind: 'repository-file', path: 'src/shared/Environment.ts' } },
      { specifier: 'forge-contracts/ForgeSystemVersions', target: { kind: 'repository-file', path: 'forge-contracts/constants/ForgeSystemVersions.ts' } },
      { specifier: 'system-versions/SystemVersionUtil', target: { kind: 'repository-file', path: 'system-versions/utils/SystemVersionUtil.ts' } },
    ]);
  });

  test('a workspace package\'s name with an entry its exports do not list stays unresolved, and any other package is a package', () => {
    const unexportedSpecifier = 'forge-contracts/constants/ForgeSystemVersions.ts';
    expect(targetsOf([unexportedSpecifier, 'marked'])).toEqual([
      { specifier: unexportedSpecifier, target: { kind: 'unexported-workspace-entry', specifier: unexportedSpecifier } },
      { specifier: 'marked', target: { kind: 'package', specifier: 'marked' } },
    ]);
  });

  test('a member of the workspace the program does not declare is named apart from a package outside the workspace, the program itself included', () => {
    expect(targetsOf(['gaia/page/Main.tsx', 'gaia', 'forge'])).toEqual([
      { specifier: 'gaia/page/Main.tsx', target: { kind: 'undeclared-workspace-package', specifier: 'gaia/page/Main.tsx' } },
      { specifier: 'gaia', target: { kind: 'undeclared-workspace-package', specifier: 'gaia' } },
      { specifier: 'forge', target: { kind: 'undeclared-workspace-package', specifier: 'forge' } },
    ]);
  });

  test('a relative path resolves from the importer\'s real folder, so a package file reaching the program lands on the program\'s path', () => {
    const specifiers = [
      './ForgeSystemVersions.ts', '../../system-versions/utils/SystemVersionUtil.ts', '../../../apps/forge/src/shared/Environment.ts', '../../../apps/gaia/src/Main.ts',
    ];
    expect(targetsOf(specifiers, 'forge-contracts/constants/Planted.ts')).toEqual([
      { specifier: './ForgeSystemVersions.ts', target: { kind: 'repository-file', path: 'forge-contracts/constants/ForgeSystemVersions.ts' } },
      { specifier: '../../system-versions/utils/SystemVersionUtil.ts', target: { kind: 'repository-file', path: 'system-versions/utils/SystemVersionUtil.ts' } },
      { specifier: '../../../apps/forge/src/shared/Environment.ts', target: { kind: 'repository-file', path: 'src/shared/Environment.ts' } },
      { specifier: '../../../apps/gaia/src/Main.ts', target: { kind: 'repository-file', path: '../gaia/src/Main.ts' } },
    ]);
  });
});

describe('the declared workspace packages', () => {
  /** Floors well under today's counts, to fail a scan that found a package folder empty or read none. */
  test('each is read under a virtual folder named after it, from the package\'s own folder', () => {
    const floorsByPackage = [['forge-contracts', 5], ['system-versions', 3]] as const;
    for (const [packageName, floor] of floorsByPackage) {
      expect(SCANNER.graph.scannedPaths.filter((path) => path.startsWith(`${packageName}/`)).length, `files of ${packageName}`).toBeGreaterThanOrEqual(floor);
    }
    expect(programFileLocationOf(repositoryRootOfThisCheckout(), 'forge-contracts/package.json')).toEndWith('/packages/forge-contracts/package.json');
    expect(programFileLocationOf(repositoryRootOfThisCheckout(), 'cli/Main.ts')).toBe(`${repositoryRootOfThisCheckout()}/cli/Main.ts`);
  });

  test('a package with no spec project has its specs read through its one project', () => {
    expect(SCANNER.graph.scannedPaths).toContain('forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts');
    expect(SCANNER.graph.scannedPaths).toContain('system-versions/utils/SystemVersionUtil.spec.ts');
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

  test('on the real graph, the binary reaches its command surface and the command table', () => {
    const binaryReach = [...reachablePathsFrom(SCANNER.graph, ['agent-progress.ts'])];

    expect(binaryReach).toContain('cli/Main.ts');
    expect(binaryReach).toContain('cli/CommandTable.ts');
  });
});
