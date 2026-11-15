/**
 * The `include` lists of `bridge/tsconfig.json`, `design-system/tsconfig.json` and `flint/tsconfig.json`, held against what each project
 * reaches: every file outside its folder that its shipping modules import, directly or through each other, and every shipping module of
 * the tracker model, which the Bridge compiles whole to prove the package DOM-safe. The design-system and Flint packages are workspace
 * packages with projects of their own: the Bridge imports each by name, TypeScript finds its files through the exports of its
 * `package.json`, and the list names none of them. The comparison is exact both ways, so a missing entry and one nothing needs both
 * fail. The scan first proves it found each project's reach, and each form is planted once in memory to prove the guard still names it.
 */
import { posix } from 'node:path';

import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import type { ImportGraph }      from './testing/ImportGraph.ts';
import {
  importGraphScannerOf,
  programFileLocationOf,
  reachablePathsFrom,
  repositoryRootOfThisCheckout
} from './testing/ImportGraph.ts';

interface IncludeListContract {
  readonly configurationPath:       string;
  readonly projectFolder:           string;
  /** Folders whose every shipping module the project compiles, reached or not. */
  readonly wholePackageFolders:     readonly string[];
  /** The globs naming the project's own folder, one per source extension. */
  readonly ownFolderGlobs:          readonly string[];
  /** Folders of workspace packages, reached by package name through their exports: the list names no file of one. */
  readonly workspacePackageFolders: readonly string[];
}

const TRACKER_MODEL_FOLDER = 'src/lib/tracker-model/';
const DESIGN_SYSTEM_FOLDER = 'design-system/';
const FLINT_FOLDER = 'flint/';

const BRIDGE_PROJECT: IncludeListContract = {
  configurationPath:       'bridge/tsconfig.json',
  projectFolder:           'bridge/',
  wholePackageFolders:     [TRACKER_MODEL_FOLDER],
  ownFolderGlobs:          ['./**/*.ts', './**/*.tsx'],
  workspacePackageFolders: [DESIGN_SYSTEM_FOLDER, FLINT_FOLDER],
};

const DESIGN_SYSTEM_PROJECT: IncludeListContract = {
  configurationPath:       'design-system/tsconfig.json',
  projectFolder:           DESIGN_SYSTEM_FOLDER,
  wholePackageFolders:     [],
  ownFolderGlobs:          ['./**/*.ts', './**/*.tsx'],
  workspacePackageFolders: [],
};

const FLINT_PROJECT: IncludeListContract = {
  configurationPath:       'flint/tsconfig.json',
  projectFolder:           FLINT_FOLDER,
  wholePackageFolders:     [],
  ownFolderGlobs:          ['./**/*.ts', './**/*.tsx'],
  workspacePackageFolders: [],
};

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());

function isShippingModule(path: string): boolean {
  return !path.endsWith('.spec.ts') && !path.endsWith('.dom.tsx') && !path.split('/').includes('testing');
}

function includeEntriesOf(configurationPath: string): readonly string[] {
  const { config } = ts.readConfigFile(programFileLocationOf(repositoryRootOfThisCheckout(), configurationPath), ts.sys.readFile) as { config?: { include?: string[] } };
  return config?.include ?? [];
}

/** Repository-relative paths of the entries that name one file; the project's own glob is not a list entry. */
function listedPathsOf(project: IncludeListContract, includeEntries: readonly string[]): readonly string[] {
  return includeEntries.filter((entry) => !entry.includes('*')).map((entry) => posix.normalize(posix.join(project.projectFolder, entry)));
}

function reachedPathsOf(project: IncludeListContract, graph: ImportGraph): ReadonlySet<string> {
  const shippingModulePaths = graph.scannedPaths.filter((path) => path.startsWith(project.projectFolder) && isShippingModule(path));
  const isInAWorkspacePackage = (path: string): boolean => project.workspacePackageFolders.some((folder) => path.startsWith(folder));
  const graphStoppingAtWorkspacePackages: ImportGraph = {
    ...graph,
    edges: graph.edges.filter((edge) => !isInAWorkspacePackage(edge.fromPath)),
  };
  const reachedOutside = [...reachablePathsFrom(graphStoppingAtWorkspacePackages, shippingModulePaths)]
    .filter((path) => !path.startsWith(project.projectFolder) && !isInAWorkspacePackage(path));
  const wholePackagePaths = graph.scannedPaths.filter((path) => isShippingModule(path) && project.wholePackageFolders.some((folder) => path.startsWith(folder)));
  return new Set([...reachedOutside, ...wholePackagePaths]);
}

function includeListSentencesOf(project: IncludeListContract, includeEntries: readonly string[], graph: ImportGraph): readonly string[] {
  const listedPaths = new Set(listedPathsOf(project, includeEntries));
  const reachedPaths = reachedPathsOf(project, graph);
  const missing = [...reachedPaths].filter((path) => !listedPaths.has(path)).sort();
  const unneeded = [...listedPaths].filter((path) => !reachedPaths.has(path)).sort();
  return [
    ...missing.map((path) => `${project.configurationPath} does not list ${path}, which ${project.projectFolder} reaches: add it to the include list`),
    ...unneeded.map((path) => `${project.configurationPath} lists ${path}, which nothing ${project.projectFolder} ships reaches: remove it from the include list`),
  ];
}

describe('the scan itself', () => {
  /** Floors well under today's counts, to fail a scan that read the wrong tree or followed no import. */
  test('it finds the Bridge\'s reach outside its folder, beyond the tracker model it compiles whole', () => {
    const bridgeReach = [...reachedPathsOf(BRIDGE_PROJECT, SCANNER.graph)];
    expect(bridgeReach.filter((path) => !path.startsWith(TRACKER_MODEL_FOLDER)).length, 'Bridge files reached outside the model').toBeGreaterThanOrEqual(4);
    expect(bridgeReach.filter((path) => path.startsWith(TRACKER_MODEL_FOLDER)).length, 'tracker model modules').toBeGreaterThanOrEqual(20);
    expect(bridgeReach, 'Bridge files reached').toContain('src/shared/constants/ProductNames.ts');
  });

  test('it reads the include list, which names the Bridge\'s own folder by one glob per source extension', () => {
    const includeEntries = includeEntriesOf(BRIDGE_PROJECT.configurationPath);
    expect(listedPathsOf(BRIDGE_PROJECT, includeEntries).length).toBeGreaterThanOrEqual(1);
    expect(includeEntries.filter((entry) => entry.includes('*'))).toEqual([...BRIDGE_PROJECT.ownFolderGlobs]);
  });
});

test('bridge/tsconfig.json lists every file the Bridge reaches and the whole tracker model, and nothing else', () => {
  expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntriesOf(BRIDGE_PROJECT.configurationPath), SCANNER.graph)).toEqual([]);
});

test('design-system/tsconfig.json lists only the package\'s own folder, which reaches nothing outside it', () => {
  const includeEntries = includeEntriesOf(DESIGN_SYSTEM_PROJECT.configurationPath);
  expect(includeEntries).toEqual([...DESIGN_SYSTEM_PROJECT.ownFolderGlobs]);
  expect(includeListSentencesOf(DESIGN_SYSTEM_PROJECT, includeEntries, SCANNER.graph)).toEqual([]);
});

test('flint/tsconfig.json lists only the package\'s own folder, which reaches nothing outside it', () => {
  const includeEntries = includeEntriesOf(FLINT_PROJECT.configurationPath);
  expect(includeEntries).toEqual([...FLINT_PROJECT.ownFolderGlobs]);
  expect(includeListSentencesOf(FLINT_PROJECT, includeEntries, SCANNER.graph)).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  test('a needed entry removed from the list', () => {
    const includeEntries = includeEntriesOf(BRIDGE_PROJECT.configurationPath).filter((entry) => entry !== '../src/lib/html-escape/HtmlEscapeUtil.ts');
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntries, SCANNER.graph)).toEqual([
      'bridge/tsconfig.json does not list src/lib/html-escape/HtmlEscapeUtil.ts, which bridge/ reaches: add it to the include list',
    ]);
  });

  test('a tracker model module no Bridge module imports, removed from the list', () => {
    const includeEntries = includeEntriesOf(BRIDGE_PROJECT.configurationPath).filter((entry) => entry !== '../src/lib/tracker-model/Logger.ts');
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntries, SCANNER.graph)).toEqual([
      'bridge/tsconfig.json does not list src/lib/tracker-model/Logger.ts, which bridge/ reaches: add it to the include list',
    ]);
  });

  test('an entry nothing needs, added to the list', () => {
    const includeEntries = [...includeEntriesOf(BRIDGE_PROJECT.configurationPath), '../src/shared/Environment.ts'];
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntries, SCANNER.graph)).toEqual([
      'bridge/tsconfig.json lists src/shared/Environment.ts, which nothing bridge/ ships reaches: remove it from the include list',
    ]);
  });

  test('a new outside file a Bridge module imports, directly or through a listed file', () => {
    const graph = SCANNER.graphWithPlantedFiles({
      'bridge/PlantedStep.ts':            'import { planted } from \'../src/shared/PlantedValue.ts\';\nexport const step = planted;\n',
      'src/shared/PlantedValue.ts':       'import { deeper } from \'./PlantedDeeperValue.ts\';\nexport const planted = deeper;\n',
      'src/shared/PlantedDeeperValue.ts': 'export const deeper = 1;\n',
    });
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntriesOf(BRIDGE_PROJECT.configurationPath), graph)).toEqual([
      'bridge/tsconfig.json does not list src/shared/PlantedDeeperValue.ts, which bridge/ reaches: add it to the include list',
      'bridge/tsconfig.json does not list src/shared/PlantedValue.ts, which bridge/ reaches: add it to the include list',
    ]);
  });

  test('a file of the design-system workspace package named in the list, which the package\'s exports already reach', () => {
    const graph = SCANNER.graphWithPlantedFiles({ 'bridge/PlantedPart.ts': 'import { SegmentMeter } from \'design-system/SegmentMeter\';\nexport const part = SegmentMeter;\n' });
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntriesOf(BRIDGE_PROJECT.configurationPath), graph)).toEqual([]);
    const includeEntries = [...includeEntriesOf(BRIDGE_PROJECT.configurationPath), '../design-system/molecules/SegmentMeter.tsx'];
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntries, graph)).toEqual([
      'bridge/tsconfig.json lists design-system/molecules/SegmentMeter.tsx, which nothing bridge/ ships reaches: remove it from the include list',
    ]);
  });

  test('a file outside the design-system package that one of its modules imports', () => {
    const graph = SCANNER.graphWithPlantedFiles({ 'design-system/PlantedPart.ts': 'import { planted } from \'../src/shared/PlantedValue.ts\';\nexport const part = planted;\n' });
    expect(includeListSentencesOf(DESIGN_SYSTEM_PROJECT, includeEntriesOf(DESIGN_SYSTEM_PROJECT.configurationPath), graph)).toEqual([
      'design-system/tsconfig.json does not list src/shared/PlantedValue.ts, which design-system/ reaches: add it to the include list',
    ]);
  });

  test('a file of the Flint workspace package named in the list, which the package\'s exports already reach', () => {
    const graph = SCANNER.graphWithPlantedFiles({ 'bridge/PlantedSprite.ts': 'import { createFlint } from \'flint\';\nexport const sprite = createFlint;\n' });
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntriesOf(BRIDGE_PROJECT.configurationPath), graph)).toEqual([]);
    const includeEntries = [...includeEntriesOf(BRIDGE_PROJECT.configurationPath), '../flint/CreateFlint.ts'];
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntries, graph)).toEqual([
      'bridge/tsconfig.json lists flint/CreateFlint.ts, which nothing bridge/ ships reaches: remove it from the include list',
    ]);
  });

  test('a file outside the Flint package that one of its modules imports', () => {
    const graph = SCANNER.graphWithPlantedFiles({ 'flint/PlantedPart.ts': 'import { planted } from \'../src/shared/PlantedValue.ts\';\nexport const part = planted;\n' });
    expect(includeListSentencesOf(FLINT_PROJECT, includeEntriesOf(FLINT_PROJECT.configurationPath), graph)).toEqual([
      'flint/tsconfig.json does not list src/shared/PlantedValue.ts, which flint/ reaches: add it to the include list',
    ]);
  });

  test('an import only a spec or a testing helper makes is not a reach', () => {
    const graph = SCANNER.graphWithPlantedFiles({
      'bridge/PlantedStep.spec.ts':    'import { planted } from \'../src/shared/PlantedValue.ts\';\nexport const step = planted;\n',
      'bridge/testing/PlantedHelp.ts': 'import { planted } from \'../../src/shared/PlantedValue.ts\';\nexport const help = planted;\n',
      'src/shared/PlantedValue.ts':    'export const planted = 1;\n',
    });
    expect(includeListSentencesOf(BRIDGE_PROJECT, includeEntriesOf(BRIDGE_PROJECT.configurationPath), graph)).toEqual([]);
  });
});
