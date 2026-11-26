/**
 * The page's folders import one way: the shell draws the views, so no view and nothing shared imports the shell, and nothing shared
 * imports a view; the board, which a view may draw, imports neither the shell nor a view. Inside the board no view imports another,
 * `board/shared/` imports no view and no shell, only `Board.tsx` and `board/testing/` import the shell, and `page/shared/` imports nothing of
 * the board, today's breaks aside, held exactly. And the page reaches no forge: no module the page project compiles, the shared files its
 * tsconfig names among them, imports `forge-contracts` or a path under `apps/forge/`, and no page module or shared file reaches a file
 * outside `page/` but those shared files; read through the compiler, the page program compiles no Gaia file the tsconfig leaves out,
 * nothing under `apps/forge/` and no `forge-contracts` file. Gaia's own components under
 * `page/components/` import no shell, view or board. The Flint library is imported only from `page/board/`; that every import of a library
 * names its interface file is `LibraryBoundaries.spec.ts`'s to hold. What matters: the rules read every shipping module, specs aside,
 * since a spec may render the whole shell; and each guard is first proved on a planted case, in memory.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative }               from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const PAGE_FOLDER = import.meta.dir;
const GAIA_FOLDER = join(PAGE_FOLDER, '..');
const WORKSPACE_ROOT = join(GAIA_FOLDER, '..', '..');
const PAGE_PROJECT_PATH = join(PAGE_FOLDER, 'tsconfig.json');
const FORGE_APP_PATH_PREFIX = 'apps/forge/';
const FORGE_CONTRACTS_PACKAGE = 'forge-contracts';
const FLINT_LIBRARY_FOLDER_PREFIX = 'page/lib/flint/';
const BOARD_FOLDER_PREFIX = 'page/board/';

/** Each folder that must not reach another, with the folders it must not import. */
const FORBIDDEN_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  views:      ['shell'],
  shared:     ['shell', 'views'],
  board:      ['shell', 'views'],
  components: ['shell', 'views', 'board'],
};

const FORGE_CONTRACTS_FOLDER_PREFIX = 'packages/forge-contracts/';

function shippingModulesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.(?:spec|dom)\.tsx?$/.test(path))
    .map((path) => join(folder, path));
}

function importSpecifiersOf(source: string): string[] {
  return typescript.preProcessFile(source, true, true).importedFiles.map((importedFile) => importedFile.fileName);
}

/** The page folder each relative import of a module lands in, by its first segment under `page/`. */
function importedPageFoldersOf(modulePath: string, source: string): string[] {
  return importSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(PAGE_FOLDER, join(dirname(modulePath), specifier)).split('/')[0] ?? '');
}

function forbiddenImportsOf(folder: string, modulePath: string, source: string): string[] {
  const forbidden = FORBIDDEN_IMPORTS[folder] ?? [];
  return importedPageFoldersOf(modulePath, source)
    .filter((importedFolder) => forbidden.includes(importedFolder))
    .map((importedFolder) => `${relative(PAGE_FOLDER, modulePath)} imports page/${importedFolder}`);
}

function pageProject(): typescript.ParsedCommandLine {
  const { config } = typescript.readConfigFile(PAGE_PROJECT_PATH, (path) => typescript.sys.readFile(path)) as { config: unknown };
  return typescript.parseJsonConfigFileContent(config, typescript.sys, PAGE_FOLDER);
}

/** Every module the page project names, as the compiler lists them from the tsconfig: the page's own and the shared files it names. */
function pageProjectModules(): string[] {
  return pageProject().fileNames;
}

/** Every file the page program compiles outside `node_modules`: the named modules and each file they reach, through any import. */
function pageProgramFiles(): string[] {
  const project = pageProject();
  return typescript.createProgram(project.fileNames, project.options).getSourceFiles()
    .map((sourceFile) => sourceFile.fileName)
    .filter((path) => !path.split('/').includes('node_modules'));
}

/**
 * A compiled file the page may not hold: a Gaia file the tsconfig does not name (reached through a named one), a file under `apps/forge/`,
 * or a `forge-contracts` file.
 */
function compiledFileSentencesOf(compiledFiles: readonly string[], namedFiles: readonly string[]): string[] {
  return compiledFiles.flatMap((path) => {
    const workspaceName = relative(WORKSPACE_ROOT, path);
    const gaiaName = relative(GAIA_FOLDER, path);
    if (workspaceName.startsWith(FORGE_APP_PATH_PREFIX)) return [`${workspaceName} is under ${FORGE_APP_PATH_PREFIX} and the page program compiles it`];
    if (workspaceName.startsWith(FORGE_CONTRACTS_FOLDER_PREFIX)) {
      return [`${workspaceName} is a forge-contracts file the page program compiles`];
    }
    const isGaiaFile = !gaiaName.startsWith('..');
    if (isGaiaFile && !gaiaName.startsWith('page/') && !namedFiles.includes(path)) return [`${gaiaName} is compiled by the page program but page/tsconfig.json does not name it`];
    return [];
  });
}

function sharedFilesOf(projectModules: readonly string[]): ReadonlySet<string> {
  return new Set(projectModules
    .filter((modulePath) => relative(PAGE_FOLDER, modulePath).startsWith('..'))
    .map((modulePath) => relative(GAIA_FOLDER, modulePath)));
}

/**
 * A module's reaches past the page's boundary: an import of `forge-contracts`, of a path under
 * `apps/forge/`, and, for a page module or a shared file, of a file outside `page/` that the project does not name as a shared file.
 */
function forgeReachesOf(modulePath: string, source: string, sharedFiles: ReadonlySet<string>): string[] {
  const moduleName = relative(GAIA_FOLDER, modulePath);
  return importSpecifiersOf(source).flatMap((specifier) => {
    if (specifier === FORGE_CONTRACTS_PACKAGE || specifier.startsWith(`${FORGE_CONTRACTS_PACKAGE}/`)) {
      return [`${moduleName} imports ${specifier}`];
    }
    if (!specifier.startsWith('.')) return specifier.includes(FORGE_APP_PATH_PREFIX) ? [`${moduleName} imports ${specifier}`] : [];
    const importedPath = join(dirname(modulePath), specifier);
    if (relative(WORKSPACE_ROOT, importedPath).startsWith(FORGE_APP_PATH_PREFIX)) return [`${moduleName} imports ${specifier}, under ${FORGE_APP_PATH_PREFIX}`];
    const importedName = relative(GAIA_FOLDER, importedPath);
    const landsOutsideThePage = !importedName.startsWith('page/');
    if (landsOutsideThePage && !sharedFiles.has(importedName)) return [`${moduleName} imports ${importedName}, which page/tsconfig.json does not name`];
    return [];
  });
}

/** A page module's imports of the Flint library: only a module under `page/board/` reaches it. */
function flintReachesOf(modulePath: string, source: string): string[] {
  const moduleName = relative(GAIA_FOLDER, modulePath);
  if (moduleName.startsWith(BOARD_FOLDER_PREFIX) || moduleName.startsWith(FLINT_LIBRARY_FOLDER_PREFIX)) return [];
  return importSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(GAIA_FOLDER, join(dirname(modulePath), specifier)))
    .filter((importedName) => importedName.startsWith(FLINT_LIBRARY_FOLDER_PREFIX))
    .map((importedName) => `${moduleName} imports ${importedName} outside ${BOARD_FOLDER_PREFIX}`);
}

const BOARD_SHELL_FOLDER_PREFIX = 'page/board/shell/';
const BOARD_SHARED_FOLDER_PREFIX = 'page/board/shared/';
const BOARD_TESTING_FOLDER_PREFIX = 'page/board/testing/';
const BOARD_ENTRY_MODULE = 'page/board/Board.tsx';
const PAGE_SHARED_FOLDER_PREFIX = 'page/shared/';

interface BoardImportRule {
  readonly breach:     string;
  readonly isBrokenBy: (moduleName: string, importedName: string) => boolean;
}

interface BoardImportReport {
  readonly breaks:           readonly string[];
  readonly unusedAllowances: readonly string[];
}

interface ScannedModule {
  readonly path:   string;
  readonly source: string;
}

/** The view a page name sits in, by its folder under `page/board/views/`; a file directly in that folder is no view. */
function viewFolderOf(pageName: string): string | null {
  return /^page\/board\/views\/([^/]+)\//.exec(pageName)?.[1] ?? null;
}

/** Each import holds to at most one rule's breach, so the shell rule leaves `board/shared/` and `page/shared/` to their own rules. */
const BOARD_IMPORT_RULES: readonly BoardImportRule[] = [
  {
    breach:     'a view imports another view',
    isBrokenBy: (moduleName, importedName) => {
      const moduleView = viewFolderOf(moduleName);
      const importedView = viewFolderOf(importedName);
      return moduleView !== null && importedView !== null && moduleView !== importedView;
    },
  },
  {
    breach:     'board/shared/ imports a view',
    isBrokenBy: (moduleName, importedName) => moduleName.startsWith(BOARD_SHARED_FOLDER_PREFIX) && viewFolderOf(importedName) !== null,
  },
  {
    breach:     'board/shared/ imports the shell',
    isBrokenBy: (moduleName, importedName) => moduleName.startsWith(BOARD_SHARED_FOLDER_PREFIX) && importedName.startsWith(BOARD_SHELL_FOLDER_PREFIX),
  },
  {
    breach:     'only Board.tsx and board/testing/ import the shell',
    isBrokenBy: (moduleName, importedName) => importedName.startsWith(BOARD_SHELL_FOLDER_PREFIX)
      && moduleName !== BOARD_ENTRY_MODULE
      && ![BOARD_SHELL_FOLDER_PREFIX, BOARD_TESTING_FOLDER_PREFIX, BOARD_SHARED_FOLDER_PREFIX, PAGE_SHARED_FOLDER_PREFIX].some((prefix) => moduleName.startsWith(prefix)),
  },
  {
    breach:     'page/shared/ imports the board',
    isBrokenBy: (moduleName, importedName) => moduleName.startsWith(PAGE_SHARED_FOLDER_PREFIX) && importedName.startsWith(BOARD_FOLDER_PREFIX),
  },
];

/** A module's imports that break the board's isolation, each as `<module> imports <file> (<breach>)`, named from Gaia's folder. */
function boardImportBreaksOf(modulePath: string, source: string): string[] {
  const moduleName = relative(GAIA_FOLDER, modulePath);
  return importSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(GAIA_FOLDER, join(dirname(modulePath), specifier)))
    .flatMap((importedName) => BOARD_IMPORT_RULES
      .filter((rule) => rule.isBrokenBy(moduleName, importedName))
      .map((rule) => `${moduleName} imports ${importedName} (${rule.breach})`));
}

function boardImportReportOf(modules: readonly ScannedModule[], allowances: readonly string[]): BoardImportReport {
  const found = modules.flatMap((scannedModule) => boardImportBreaksOf(scannedModule.path, scannedModule.source));
  return {
    breaks:           found.filter((line) => !allowances.includes(line)),
    unusedAllowances: allowances.filter((line) => !found.includes(line)),
  };
}

/** Today's breaks of the board's isolation, each list named for the change that ends it; an allowance nothing breaks fails the spec. */
const ALLOWED_BOARD_BREAKS: Readonly<Record<string, readonly string[]>> = {
  'waits on the design-system package, which replaces ItemPresence': [
    'page/board/conversation/ChatThread.tsx imports page/board/shell/ItemPresence.ts (only Board.tsx and board/testing/ import the shell)',
    'page/board/conversation/DecisionCard.tsx imports page/board/shell/ItemPresence.ts (only Board.tsx and board/testing/ import the shell)',
    'page/board/conversation/TranscriptLog.tsx imports page/board/shell/ItemPresence.ts (only Board.tsx and board/testing/ import the shell)',
    'page/board/views/assistant/AssistantView.tsx imports page/board/shell/ItemPresence.ts (only Board.tsx and board/testing/ import the shell)',
    'page/board/views/questions/QuestionsView.tsx imports page/board/shell/ItemPresence.ts (only Board.tsx and board/testing/ import the shell)',
  ],
  'waits on composing the Kanban with the merge queue in the shell': [
    'page/board/views/kanban/KanbanTabView.tsx imports page/board/shell/WaitingOnUserModel.ts (only Board.tsx and board/testing/ import the shell)',
    'page/board/views/kanban/KanbanTabView.tsx imports page/board/views/merge-queue/MergeQueueModel.ts (a view imports another view)',
    'page/board/views/kanban/KanbanTabView.tsx imports page/board/views/merge-queue/MergeQueueView.tsx (a view imports another view)',
  ],
  'waits on hoisting the ticket helpers to board/shared/tickets/': [
    'page/board/views/documents/TicketDocumentsView.tsx imports page/board/views/tickets/InDraftModel.ts (a view imports another view)',
    'page/board/views/documents/TicketDocumentsView.tsx imports page/board/views/tickets/TicketsModel.ts (a view imports another view)',
    'page/board/views/tickets/InDraftModel.ts imports page/board/views/intake/IntakeModel.ts (a view imports another view)',
  ],
};

const ALLOWED_BOARD_BREAK_LINES = Object.values(ALLOWED_BOARD_BREAKS).flat();
describe('the page\'s import direction', () => {
  test('the guard catches a view that imports the shell and a shared module that imports a view', () => {
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { RailModel } from \'../../shell/RailModel.ts\';'))
      .toEqual(['views/agents/Planted.ts imports page/shell']);
    expect(forbiddenImportsOf('shared', join(PAGE_FOLDER, 'shared', 'utils', 'Planted.ts'), 'import type { AgentsContent } from \'../../views/agents/AgentsModel.ts\';'))
      .toEqual(['shared/utils/Planted.ts imports page/views']);
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { HashRouter } from \'../../shared/HashRouter.ts\';')).toEqual([]);
  });

  test('the guard catches a board module that imports the shell or a view, and passes a view that imports the board', () => {
    expect(forbiddenImportsOf('board', join(PAGE_FOLDER, 'board', 'shell', 'Planted.ts'), 'import { RailModel } from \'../../shell/RailModel.ts\';'))
      .toEqual(['board/shell/Planted.ts imports page/shell']);
    expect(forbiddenImportsOf('board', join(PAGE_FOLDER, 'board', 'Planted.tsx'), 'import { AgentsView } from \'../views/agents/AgentsView.tsx\';'))
      .toEqual(['board/Planted.tsx imports page/views']);
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'forge', 'Planted.tsx'), 'import { BoardRoot } from \'../../board/shell/BoardRoot.tsx\';')).toEqual([]);
  });

  test('the guard catches a component of Gaia that imports the shell, a view or the board, and passes one that imports a library', () => {
    const plantedComponent = join(PAGE_FOLDER, 'components', 'Planted.tsx');
    expect(forbiddenImportsOf('components', plantedComponent, 'import { RailModel } from \'../shell/RailModel.ts\';')).toEqual(['components/Planted.tsx imports page/shell']);
    expect(forbiddenImportsOf('components', plantedComponent, 'import { BoardRoot } from \'../board/shell/BoardRoot.tsx\';'))
      .toEqual(['components/Planted.tsx imports page/board']);
    expect(forbiddenImportsOf('components', plantedComponent, 'import { Button } from \'../lib/design-system/DesignSystemInterface.ts\';')).toEqual([]);
  });

  test('no view and nothing shared imports the shell, nothing shared imports a view, the board imports neither, and no component imports any', () => {
    expect(shippingModulesUnder(join(PAGE_FOLDER, 'components')).length).toBeGreaterThan(0);
    const forbidden = Object.keys(FORBIDDEN_IMPORTS).flatMap((folder) => shippingModulesUnder(join(PAGE_FOLDER, folder))
      .flatMap((modulePath) => forbiddenImportsOf(folder, modulePath, readFileSync(modulePath, 'utf8'))));
    expect(forbidden).toEqual([]);
  });
});

describe('the board\'s isolation', () => {
  const plantedKanbanModule = join(PAGE_FOLDER, 'board', 'views', 'kanban', 'cards', 'Planted.tsx');
  const plantedBoardSharedModule = join(PAGE_FOLDER, 'board', 'shared', 'routing', 'Planted.ts');

  test('the guard names a view, nested or not, that imports another view, and passes its own folder and ViewTitle', () => {
    expect(boardImportBreaksOf(plantedKanbanModule, 'import { MergeQueueView } from \'../../merge-queue/MergeQueueView.tsx\';'))
      .toEqual(['page/board/views/kanban/cards/Planted.tsx imports page/board/views/merge-queue/MergeQueueView.tsx (a view imports another view)']);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'board', 'views', 'tickets', 'Planted.ts'), 'import type { IntakeModel } from \'../intake/model/IntakeModel.ts\';'))
      .toEqual(['page/board/views/tickets/Planted.ts imports page/board/views/intake/model/IntakeModel.ts (a view imports another view)']);
    expect(boardImportBreaksOf(plantedKanbanModule, 'import { KanbanModel } from \'../KanbanModel.ts\';')).toEqual([]);
    expect(boardImportBreaksOf(plantedKanbanModule, 'import { ViewTitle } from \'../../ViewTitle.tsx\';')).toEqual([]);
  });

  test('the guard names board/shared/ importing a view or the shell, and passes it importing the board\'s utils', () => {
    expect(boardImportBreaksOf(plantedBoardSharedModule, 'import { QuestionsModelUtil } from \'../../views/questions/QuestionsModel.ts\';'))
      .toEqual(['page/board/shared/routing/Planted.ts imports page/board/views/questions/QuestionsModel.ts (board/shared/ imports a view)']);
    expect(boardImportBreaksOf(plantedBoardSharedModule, 'import { HeaderModel } from \'../../shell/HeaderModel.ts\';'))
      .toEqual(['page/board/shared/routing/Planted.ts imports page/board/shell/HeaderModel.ts (board/shared/ imports the shell)']);
    expect(boardImportBreaksOf(plantedBoardSharedModule, 'import { TimeUtil } from \'../../utils/TimeUtil.ts\';')).toEqual([]);
  });

  test('the guard names the shell imported from a view, a board folder or the page, and passes Board.tsx, board/testing/ and the shell itself', () => {
    const shellImport = (depth: number): string => `import { HeaderModel } from '${'../'.repeat(depth)}board/shell/HeaderModel.ts';`;
    expect(boardImportBreaksOf(plantedKanbanModule, shellImport(4)))
      .toEqual(['page/board/views/kanban/cards/Planted.tsx imports page/board/shell/HeaderModel.ts (only Board.tsx and board/testing/ import the shell)']);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'board', 'conversation', 'Planted.tsx'), shellImport(2)))
      .toEqual(['page/board/conversation/Planted.tsx imports page/board/shell/HeaderModel.ts (only Board.tsx and board/testing/ import the shell)']);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'shell', 'Planted.tsx'), shellImport(1)))
      .toEqual(['page/shell/Planted.tsx imports page/board/shell/HeaderModel.ts (only Board.tsx and board/testing/ import the shell)']);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'board', 'Board.tsx'), shellImport(1))).toEqual([]);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'board', 'testing', 'Planted.ts'), shellImport(2))).toEqual([]);
    expect(boardImportBreaksOf(join(PAGE_FOLDER, 'board', 'shell', 'Planted.tsx'), 'import { HeaderModel } from \'./HeaderModel.ts\';')).toEqual([]);
  });

  test('the guard names page/shared/ importing anything under page/board/, and passes it importing the page\'s types', () => {
    const plantedPageSharedModule = join(PAGE_FOLDER, 'shared', 'Planted.ts');
    expect(boardImportBreaksOf(plantedPageSharedModule, 'import { HeaderModel } from \'../board/shell/HeaderModel.ts\';'))
      .toEqual(['page/shared/Planted.ts imports page/board/shell/HeaderModel.ts (page/shared/ imports the board)']);
    expect(boardImportBreaksOf(plantedPageSharedModule, 'import { TimeUtil } from \'../board/utils/TimeUtil.ts\';'))
      .toEqual(['page/shared/Planted.ts imports page/board/utils/TimeUtil.ts (page/shared/ imports the board)']);
    expect(boardImportBreaksOf(plantedPageSharedModule, 'import type { BoardTab } from \'../@types/board/BoardVocabulary.ts\';')).toEqual([]);
  });

  const scannedModules: readonly ScannedModule[] = shippingModulesUnder(PAGE_FOLDER).map((path) => ({ path, source: readFileSync(path, 'utf8') }));

  test('the scan reads the board\'s shell, its views and the page around it, and no spec', () => {
    const scannedNames = scannedModules.map((scannedModule) => relative(GAIA_FOLDER, scannedModule.path));
    expect(scannedNames).toContain(BOARD_ENTRY_MODULE);
    expect(scannedNames).toContain('page/board/shell/BoardApp.tsx');
    expect(scannedNames.filter((moduleName) => viewFolderOf(moduleName) !== null).length).toBeGreaterThan(0);
    expect(scannedNames.filter((moduleName) => /\.(?:spec|dom)\.tsx?$/.test(moduleName))).toEqual([]);
  });

  test('no shipping module breaks the board\'s isolation but the allowed breaks, and every allowance is still used', () => {
    expect(boardImportReportOf(scannedModules, ALLOWED_BOARD_BREAK_LINES)).toEqual({ breaks: [], unusedAllowances: [] });
  });

  test('removing an allowance leaves its break named, and an allowance nothing breaks is named', () => {
    const removedAllowance = ALLOWED_BOARD_BREAK_LINES[0] ?? '';
    const plantedAllowance = 'page/board/views/agents/Planted.tsx imports page/board/views/kanban/KanbanView.tsx (a view imports another view)';
    expect(boardImportReportOf(scannedModules, ALLOWED_BOARD_BREAK_LINES.slice(1))).toEqual({ breaks: [removedAllowance], unusedAllowances: [] });
    expect(boardImportReportOf(scannedModules, [...ALLOWED_BOARD_BREAK_LINES, plantedAllowance])).toEqual({ breaks: [], unusedAllowances: [plantedAllowance] });
  });
});

describe('the page\'s reach past its boundary', () => {
  const plantedSharedFiles: ReadonlySet<string> = new Set(['src/shared/constants/PageContractVersions.ts']);
  const plantedBoardModule = join(PAGE_FOLDER, 'board', 'Planted.ts');

  test('the guard names a page module that imports forge-contracts, by its package or by one of its exports', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import type { ForgeBoardDocument } from \'forge-contracts/ForgeBoardDocument\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports forge-contracts/ForgeBoardDocument']);
    expect(forgeReachesOf(plantedBoardModule, 'export * from \'forge-contracts\';', plantedSharedFiles)).toEqual(['page/board/Planted.ts imports forge-contracts']);
  });

  test('the guard names a module that imports a path under apps/forge/, relative or by a package path', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import { Board } from \'../../../forge/src/shared/model/Board.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports ../../../forge/src/shared/model/Board.ts, under apps/forge/']);
    expect(forgeReachesOf(plantedBoardModule, 'import { Board } from \'forge-monorepo/apps/forge/src/shared/model/Board.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports forge-monorepo/apps/forge/src/shared/model/Board.ts']);
  });

  test('the guard names a shared file the page includes that imports forge-contracts', () => {
    const plantedSharedModule = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    expect(forgeReachesOf(plantedSharedModule, 'import { HEPHAESTUS_CONTRACT_VERSIONS } from \'forge-contracts/HephaestusContractVersions\';', plantedSharedFiles))
      .toEqual(['src/shared/constants/PageContractVersions.ts imports forge-contracts/HephaestusContractVersions']);
  });

  test('the guard names a page module that reaches a file outside page/ the tsconfig does not name, and passes one it names', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import { CONTRACT_VERSIONS } from \'../../src/shared/constants/ContractVersions.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports src/shared/constants/ContractVersions.ts, which page/tsconfig.json does not name']);
    expect(forgeReachesOf(plantedBoardModule, 'import { PAGE_CONTRACT_VERSIONS } from \'../../src/shared/constants/PageContractVersions.ts\';', plantedSharedFiles)).toEqual([]);
  });

  test('the guard names a shared file the page includes that imports a file outside page/ the tsconfig does not name', () => {
    const plantedSharedModule = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    expect(forgeReachesOf(plantedSharedModule, 'import { CONTRACT_VERSIONS } from \'./ContractVersions.ts\';', plantedSharedFiles))
      .toEqual(['src/shared/constants/PageContractVersions.ts imports src/shared/constants/ContractVersions.ts, which page/tsconfig.json does not name']);
    expect(forgeReachesOf(plantedSharedModule, 'import { PAGE_CONTRACT_VERSIONS } from \'./PageContractVersions.ts\';', plantedSharedFiles)).toEqual([]);
  });

  test('the compiled-file guard names an unnamed Gaia file, a file under apps/forge/ and every forge-contracts file', () => {
    const namedSharedFile = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    const plantedCompiledFiles = [
      join(PAGE_FOLDER, 'Main.tsx'),
      namedSharedFile,
      join(GAIA_FOLDER, 'src', 'shared', 'constants', 'ContractVersions.ts'),
      join(WORKSPACE_ROOT, 'apps', 'forge', 'src', 'shared', 'model', 'Board.ts'),
      join(WORKSPACE_ROOT, 'packages', 'forge-contracts', '@types', 'ForgeBoardDocument.ts'),
      join(WORKSPACE_ROOT, 'packages', 'forge-contracts', '@types', 'IdentityDocument.ts'),
      join(PAGE_FOLDER, 'lib', 'design-system', 'atoms', 'Button.tsx'),
    ];
    expect(compiledFileSentencesOf(plantedCompiledFiles, [namedSharedFile])).toEqual([
      'src/shared/constants/ContractVersions.ts is compiled by the page program but page/tsconfig.json does not name it',
      'apps/forge/src/shared/model/Board.ts is under apps/forge/ and the page program compiles it',
      'packages/forge-contracts/@types/ForgeBoardDocument.ts is a forge-contracts file the page program compiles',
      'packages/forge-contracts/@types/IdentityDocument.ts is a forge-contracts file the page program compiles',
    ]);
  });

  test('the guard names any page module that imports forge-contracts, none excepted', () => {
    const plantedForgeViewPath = join(PAGE_FOLDER, 'views', 'forge', 'ForgeView.tsx');
    expect(forgeReachesOf(plantedForgeViewPath, 'import type { ForgeBoardDocument } from \'forge-contracts/ForgeBoardDocument\';', plantedSharedFiles))
      .toEqual(['page/views/forge/ForgeView.tsx imports forge-contracts/ForgeBoardDocument']);
  });

  test('the scan reads the page\'s modules and the shared files its tsconfig names, and no spec', () => {
    const projectModuleNames = pageProjectModules().map((modulePath) => relative(GAIA_FOLDER, modulePath));
    expect(projectModuleNames).toContain('page/Main.tsx');
    expect(projectModuleNames).toContain('page/views/forge/ForgeView.tsx');
    expect(projectModuleNames).toContain('src/shared/constants/PageContractVersions.ts');
    expect(projectModuleNames).not.toContain('src/shared/constants/ContractVersions.ts');
    expect(projectModuleNames.filter((moduleName) => /\.(?:spec|dom)\.tsx?$/.test(moduleName))).toEqual([]);
  });

  test('no module the page project compiles reaches forge-contracts or apps/forge/', () => {
    const projectModules = pageProjectModules();
    const sharedFiles = sharedFilesOf(projectModules);
    expect(projectModules.flatMap((modulePath) => forgeReachesOf(modulePath, readFileSync(modulePath, 'utf8'), sharedFiles))).toEqual([]);
  });

  test('the page program, read through the compiler, compiles the library files it reaches and no file it may not hold', () => {
    const compiledFiles = pageProgramFiles();
    expect(compiledFiles.map((path) => relative(GAIA_FOLDER, path))).toContain('page/lib/design-system/atoms/Button.tsx');
    expect(compiledFileSentencesOf(compiledFiles, pageProjectModules())).toEqual([]);
  });
});

describe('Flint on the page', () => {
  const flintInterfaceImport = 'import { Flint } from \'../../lib/flint/FlintInterface.ts\';';

  test('the guard names Flint imported outside page/board/, and passes a board module and Flint\'s own', () => {
    expect(flintReachesOf(join(PAGE_FOLDER, 'views', 'agents', 'Planted.tsx'), flintInterfaceImport))
      .toEqual(['page/views/agents/Planted.tsx imports page/lib/flint/FlintInterface.ts outside page/board/']);
    expect(flintReachesOf(join(PAGE_FOLDER, 'Planted.tsx'), 'import { mindOf } from \'./lib/flint/mind/Mind.ts\';'))
      .toEqual(['page/Planted.tsx imports page/lib/flint/mind/Mind.ts outside page/board/']);
    expect(flintReachesOf(join(PAGE_FOLDER, 'board', 'flint', 'Planted.tsx'), flintInterfaceImport)).toEqual([]);
    expect(flintReachesOf(join(PAGE_FOLDER, 'lib', 'flint', 'react', 'Planted.tsx'), 'import { createFlint } from \'../CreateFlint.ts\';')).toEqual([]);
  });

  test('every page module that imports Flint sits under page/board/, and the board does import it', () => {
    const shippingPageModules = shippingModulesUnder(PAGE_FOLDER).filter((modulePath) => !relative(PAGE_FOLDER, modulePath).startsWith('lib/'));
    const flintImporters = shippingPageModules.filter((modulePath) => readFileSync(modulePath, 'utf8').includes('lib/flint/FlintInterface.ts'));
    expect(flintImporters.length).toBeGreaterThan(0);
    expect(shippingPageModules.flatMap((modulePath) => flintReachesOf(modulePath, readFileSync(modulePath, 'utf8')))).toEqual([]);
  });
});
