/**
 * The forge reaches its stored board through the store port: no shipping line outside the store's adapter, an exact list of files and record
 * format folders, names where a record is kept, but the two composition roots that pick the adapter. Comments, specs and testing folders are
 * not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                       from '../src/testing/ImportGraph.ts';
import { memoisedPerSource, programTypeScriptSources, type RepositorySource } from '../src/testing/RepositorySources.ts';

type StoreForm =
  | 'record-file-name'
  | 'record-folder-join'
  | 'record-path-name'
  | 'record-constant'
  | 'store-internal-import'
  | 'stored-record-read';

interface BoundaryReport {
  /** `<path>: <form>: <trimmed line>`, one per scanned occurrence the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

const RECORD_FILE_NAMES = 'progress\\.json|pipeline\\.json|pipeline-setup\\.json|gate-profiles\\.json|constitution-sources\\.json|log\\.jsonl|hold-journal\\.json'
  + '|filing-cabinet';
const RECORD_PATH_HELPER_NAMES = 'epicFilePathOf|draftFilePathOf|everyTicketFilePathIn|everyEpicFilePathIn|ticketDocumentRecordPathOf|ticketDocumentVersionPathOf'
  + '|everyTicketDocumentFilePathIn';
const STORE_MODULE_NAMES = 'TrackerPipeline|TrackerReader|TicketStore|EpicStore|DraftStore|StoreFolderListing|TrackerLock|HoldJournal|TrackerCreation'
  + '|LocalRecordAllocation|LocalStoreLayout|LocalStoreFiles|LocalFilesBoardStore|ProgressFileIngestion|ProgressFileWriter|LogFileIngestion'
  + '|LogFileWriter|TicketFileIngestion|TicketFileWriter|EpicFileIngestion|EpicFileWriter|DraftFileIngestion|DraftFileWriter|HoldJournalIngestion'
  + '|HoldJournalWriter|TicketDocumentStore|TicketDocumentsFileIngestion|TicketDocumentsFileWriter|TicketDocumentContentFile';

const STORE_FORM_PATTERNS: Readonly<Record<StoreForm, readonly RegExp[]>> = {
  // Prose in a template literal is longer than the name, so help text and wording do not match.
  'record-file-name':   [new RegExp(`(['"\`])(?:${RECORD_FILE_NAMES})\\1`)],
  'record-folder-join': [/\bjoin\([^)]*(['"`])(?:tickets|epics|filing-cabinet|ticket-documents)\1/],
  'record-path-name':   [
    new RegExp(`\\b(?:${RECORD_PATH_HELPER_NAMES})\\b`),
    /\b(?:localStoreLayoutOf|LocalStoreLayout|boardIsStoredAt)\b/,
    /\b\w+(?:RecordPath|RecordsFolder)\b|\bstoreLockFolder\b|\bholdJournalPath\b/,
  ],
  'record-constant':       [/\bLOCAL_STORE_FILES\b/],
  // An import spread over several lines is matched on its `from` line, the line the allowlist names.
  'store-internal-import': [new RegExp(`\\bfrom\\s+['"][^'"]*\\/(?:${STORE_MODULE_NAMES})\\.ts['"]`)],
  // The pure members of these adapters (`contentsOf`, `documentReadingOf`, `storedDocumentOf` and kin) stay usable.
  'stored-record-read':    [/\b(?:PipelineFile|GateProfilesFile|PipelineSetupFile|ConstitutionSourcesFile)\.read\(/],
};

const STORE_FORMS = Object.keys(STORE_FORM_PATTERNS) as StoreForm[];

const STORE_ADAPTER_FILES: readonly string[] = [
  'src/services/store/LocalFilesBoardStore.ts',
  'src/services/tracker/DraftStore.ts',
  'src/services/tracker/EpicStore.ts',
  'src/services/tracker/HoldJournal.ts',
  'src/services/tracker/LocalRecordAllocation.ts',
  'src/services/tracker/LocalStoreLayout.ts',
  'src/services/tracker/StoreFolderListing.ts',
  'src/services/tracker/TicketDocumentStore.ts',
  'src/services/tracker/TicketStore.ts',
  'src/services/tracker/TrackerCreation.ts',
  'src/services/tracker/TrackerLock.ts',
  'src/services/tracker/TrackerPipeline.ts',
  'src/services/tracker/TrackerReader.ts',
  'src/services/tracker/Workspace.ts',
  'src/services/tracker/constants/LocalStoreFiles.ts',
];

/** The record format adapters: each reads and writes one stored record. */
const STORE_ADAPTER_FOLDERS: readonly string[] = [
  'src/adapters/drafts/',
  'src/adapters/epics/',
  'src/adapters/hold-journal/',
  'src/adapters/log/',
  'src/adapters/pipeline-setup/',
  'src/adapters/pipeline/',
  'src/adapters/progress/',
  'src/adapters/tickets/',
];

const CLI_COMPOSITION_ROOT_REASON = 'The CLI\'s composition root picks the store\'s adapter.';
const HEPHAESTUS_COMPOSITION_ROOT_REASON = 'Hephaestus\'s composition root picks the store\'s adapter.';

/** `<path>: <form>: <trimmed line>`, sorted by path: only the composition roots, which pick the store's adapter. */
const ALLOWED_STORE_LINES: Readonly<Record<string, string>> = {
  'cli/BoardStoreOf.ts: store-internal-import: import { createLocalFilesBoardStore }       from \'../src/services/store/LocalFilesBoardStore.ts\';':
    CLI_COMPOSITION_ROOT_REASON,
  'cli/hephaestus/HephaestusForeground.ts: store-internal-import: import { createLocalFilesBoardStore } from \'../../src/services/store/LocalFilesBoardStore.ts\';':
    HEPHAESTUS_COMPOSITION_ROOT_REASON,
};

const ALLOWED_LINES = Object.keys(ALLOWED_STORE_LINES);

function isShippingCode(path: string): boolean {
  return !/\.spec\.tsx?$|\.dom\.tsx$/.test(path) && !path.startsWith('testing/') && !path.includes('/testing/');
}

function isStoreAdapter(path: string): boolean {
  return STORE_ADAPTER_FILES.includes(path) || STORE_ADAPTER_FOLDERS.some((folder) => path.startsWith(folder));
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*', '#!'].some((marker) => line.startsWith(marker));
}

function formsNamedBy(line: string): StoreForm[] {
  return STORE_FORMS.filter((form) => STORE_FORM_PATTERNS[form].some((pattern) => pattern.test(line)));
}

const formLinesOfSource = memoisedPerSource((source): readonly string[] => source.text.split('\n')
  .map((line) => line.trim())
  .filter((line) => !isCommentLine(line))
  .flatMap((line) => formsNamedBy(line).map((form) => `${source.path}: ${form}: ${line}`)));

/** Every form on every code line of the shipping files outside the adapter. */
function formLinesIn(sources: readonly RepositorySource[]): string[] {
  return sources.filter((source) => isShippingCode(source.path) && !isStoreAdapter(source.path)).flatMap(formLinesOfSource);
}

function boundaryReportOf(sources: readonly RepositorySource[], allowedLines: readonly string[]): BoundaryReport {
  const found = formLinesIn(sources);
  return {
    violations:       found.filter((line, index) => !allowedLines.includes(line) || found.indexOf(line) !== index),
    unusedAllowances: allowedLines.filter((line) => !found.includes(line)),
  };
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());

function violationsOfPlanted(path: string, plantedLine: string): readonly string[] {
  return boundaryReportOf([{ path, text: `${plantedLine}\n` }], []).violations;
}

const COMPOSITION_ROOT_PATHS: readonly string[] = ['cli/BoardStoreOf.ts', 'cli/hephaestus/HephaestusForeground.ts'];
const COMPOSITION_ROOT_REASONS: readonly string[] = [CLI_COMPOSITION_ROOT_REASON, HEPHAESTUS_COMPOSITION_ROOT_REASON];

describe('the scan saw the tree', () => {
  const shippingPaths = SOURCES.map((source) => source.path).filter(isShippingCode);

  test('it reads the whole shipping tree and skips the specs', () => {
    expect(shippingPaths.length).toBeGreaterThan(400);
    expect(SOURCES.length).toBeGreaterThan(shippingPaths.length);
    expect(shippingPaths).toEqual(expect.arrayContaining([
      'cli/CommandContext.ts', 'src/services/hephaestus/DrivePass.ts', 'src/services/control/ControlService.ts',
    ]));
    expect(shippingPaths).not.toContain('architecture/StoreBoundary.spec.ts');
  });

  test('it finds every adapter file and a source in every record format folder', () => {
    expect(shippingPaths.filter(isStoreAdapter)).toEqual(expect.arrayContaining([...STORE_ADAPTER_FILES]));
    for (const folder of STORE_ADAPTER_FOLDERS) expect(shippingPaths.some((path) => path.startsWith(folder))).toBe(true);
  });

  test('the forms it looks for really stand in the adapter', () => {
    const formsOf = (path: string) => (SOURCES.find((source) => source.path === path)?.text ?? '').split('\n').flatMap(formsNamedBy);
    expect(formsOf('src/services/tracker/constants/LocalStoreFiles.ts')).toContain('record-file-name');
    expect(formsOf('src/services/tracker/LocalStoreLayout.ts')).toEqual(expect.arrayContaining(['record-path-name', 'record-constant']));
    expect(formsOf('src/services/tracker/TrackerPipeline.ts')).toContain('store-internal-import');
    const formsInAdapter = new Set(SOURCES.filter((source) => isStoreAdapter(source.path)).flatMap((source) => source.text.split('\n').flatMap(formsNamedBy)));
    expect([...formsInAdapter]).toEqual(expect.arrayContaining(['record-file-name', 'record-path-name', 'record-constant', 'store-internal-import', 'stored-record-read']));
  });

  test('every shipping line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('the allowlist is sorted by path and holds exactly the two composition roots', () => {
    expect(ALLOWED_LINES).toEqual([...ALLOWED_LINES].sort());
    expect(ALLOWED_LINES.map((line) => line.slice(0, line.indexOf(':')))).toEqual([...COMPOSITION_ROOT_PATHS]);
    expect(Object.values(ALLOWED_STORE_LINES)).toEqual([...COMPOSITION_ROOT_REASONS]);
  });
});

describe('the allowlist is exact both ways', () => {
  const removedEntry = ALLOWED_LINES[0] ?? '';
  const allowedEntry = 'src/services/hephaestus/Planted.ts: record-constant: const name = LOCAL_STORE_FILES.LOG_FILE_NAME;';

  test('removing an entry leaves its line a violation', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(boundaryReportOf(SOURCES, [...ALLOWED_LINES, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed line in its own file is a violation', () => {
    const doubledSite = { path: 'src/services/hephaestus/Planted.ts', text: 'const name = LOCAL_STORE_FILES.LOG_FILE_NAME;\nconst name = LOCAL_STORE_FILES.LOG_FILE_NAME;\n' };
    expect(boundaryReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });

  test('an allowed line in another file is a violation', () => {
    const plantedCopy = { path: 'src/services/hephaestus/PlantedCopy.ts', text: 'const name = LOCAL_STORE_FILES.LOG_FILE_NAME;\n' };
    expect(boundaryReportOf([plantedCopy], [allowedEntry])).toEqual({
      violations:       ['src/services/hephaestus/PlantedCopy.ts: record-constant: const name = LOCAL_STORE_FILES.LOG_FILE_NAME;'],
      unusedAllowances: [allowedEntry],
    });
  });
});

describe('the test names each form, planted in memory', () => {
  const plantedPath = 'src/services/hephaestus/Planted.ts';

  const plantedForms: readonly (readonly [string, string, readonly StoreForm[]])[] = [
    ['a record file name in single quotes', 'const name = \'progress.json\';', ['record-file-name']],
    ['a record file name in double quotes', 'const name = "log.jsonl";', ['record-file-name']],
    ['a record folder name in a template literal', 'const name = `filing-cabinet`;', ['record-file-name']],
    ['the hold journal\'s name', 'const name = \'hold-journal.json\';', ['record-file-name']],
    ['a record folder joined', 'const folder = join(trackerDirectory, \'tickets\');', ['record-folder-join']],
    ['the epics folder joined', 'const folder = join(root, ".forge", "epics");', ['record-folder-join']],
    ['the ticket documents folder joined', 'const folder = join(dataFolder, \'ticket-documents\', ticketId);', ['record-folder-join']],
    ['a ticket documents path helper', 'const path = ticketDocumentRecordPathOf(workspace, ticketId);', ['record-path-name']],
    ['a record path helper', 'const path = epicFilePathOf(workspace, epicKey);', ['record-path-name']],
    ['the local store\'s layout', 'const layout = localStoreLayoutOf(workspace);', ['record-path-name']],
    ['the layout\'s type', 'let layout: LocalStoreLayout;', ['record-path-name']],
    ['the stored board check', 'const stored = boardIsStoredAt(rootDirectory);', ['record-path-name']],
    ['a record path', 'const path = layout.progressRecordPath;', ['record-path-name']],
    ['a record folder', 'const folder = layout.ticketRecordsFolder;', ['record-path-name']],
    ['the store\'s lock folder', 'const folder = layout.storeLockFolder;', ['record-path-name']],
    ['the hold journal\'s path', 'const path = layout.holdJournalPath;', ['record-path-name']],
    ['a record name constant', 'const name = LOCAL_STORE_FILES.PIPELINE_FILE_NAME;', ['record-constant']],
    ['the local store\'s names', 'const names = LOCAL_STORE_FILES;', ['record-constant']],
    ['an import of a store module', 'import { requireTracker } from \'../tracker/TrackerReader.ts\';', ['store-internal-import']],
    ['the from line of a record format adapter\'s import', '} from \'../../adapters/log/LogFileWriter.ts\';', ['store-internal-import']],
    ['a stored record read', 'const reading = PipelineFile.read(location);', ['stored-record-read']],
  ];

  test.each(plantedForms)('%s', (_formName, plantedLine, expectedForms) => {
    expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual(expectedForms.map((form) => `${plantedPath}: ${form}: ${plantedLine}`));
  });

  test('every form and every pattern is planted above', () => {
    expect([...new Set(plantedForms.flatMap(([, , forms]) => forms))].sort()).toEqual([...STORE_FORMS].sort());
    const plantedLines = plantedForms.map(([, plantedLine]) => plantedLine);
    const unplantedPatterns = Object.values(STORE_FORM_PATTERNS).flat().filter((pattern) => !plantedLines.some((line) => pattern.test(line)));
    expect(unplantedPatterns).toEqual([]);
  });

  test('a name in prose, a word that is no record and a place that is no record pass', () => {
    for (const plantedLine of [
      'const advice = `Set up pipeline.json again`;',
      'const approval = \'tickets\';',
      'const path = hephaestusFiles.logFilePath;',
      'const path = registry.lockDirectoryPath;',
      'const folder = PRODUCT_NAMES.DATA_FOLDER;',
      'const page = workspace.htmlFilePath;',
      'const path = talosRecordPathOf(boardFolder, startNumber);',
      'const text = PipelineFile.contentsOf(storedText);',
      'const location = file.filePath;',
    ]) {
      expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual([]);
    }
  });
});

describe('what the boundary exempts is exact', () => {
  const plantedLine = 'const name = LOCAL_STORE_FILES.LOG_FILE_NAME;';

  test('every adapter file and every record format folder may name a record', () => {
    for (const path of [...STORE_ADAPTER_FILES, ...STORE_ADAPTER_FOLDERS.map((folder) => `${folder}PlantedIngestion.ts`)]) {
      expect(violationsOfPlanted(path, plantedLine)).toEqual([]);
    }
  });

  test('another file beside the adapter is judged like any other', () => {
    for (const path of ['src/services/tracker/PlantedHelper.ts', 'src/services/store/PlantedStore.ts', 'src/adapters/board-document/PlantedMapper.ts', 'cli/Planted.ts']) {
      expect(violationsOfPlanted(path, plantedLine)).toEqual([`${path}: record-constant: ${plantedLine}`]);
    }
  });

  test('a comment, a spec, a DOM spec and a testing folder are not scanned', () => {
    expect(violationsOfPlanted('src/Planted.ts', `// ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted('src/Planted.ts', ` * ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted('cli/Planted.spec.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('cli/Planted.dom.tsx', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('src/testing/Planted.ts', plantedLine)).toEqual([]);
  });
});

const BOARD_STORE_ADAPTER_PATTERN = /^src\/services\/store\/\w+BoardStore\.ts$/;
const BOARD_STORE_PORT_PATH = 'src/services/store/BoardStore.ts';
const BOARD_STORE_CONTRACT_PATH = 'src/services/store/BoardStore.contract.spec.ts';

function boardStoreAdapterNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, '');
}

/** The board store adapters no code line of the contract spec names. */
function adaptersTheContractDoesNotName(sources: readonly RepositorySource[]): string[] {
  const contractCodeLines = (sources.find((source) => source.path === BOARD_STORE_CONTRACT_PATH)?.text ?? '').split('\n')
    .map((line) => line.trim())
    .filter((line) => !isCommentLine(line));
  return sources.map((source) => source.path)
    .filter((path) => isShippingCode(path) && BOARD_STORE_ADAPTER_PATTERN.test(path) && path !== BOARD_STORE_PORT_PATH)
    .filter((adapter) => !contractCodeLines.some((line) => new RegExp(`\\b${boardStoreAdapterNameOf(adapter)}\\b`).test(line)));
}

describe('every board store adapter is named by the contract', () => {
  test('the scan sees the contract and the local adapter', () => {
    const paths = SOURCES.map((source) => source.path);
    expect(paths).toEqual(expect.arrayContaining([BOARD_STORE_CONTRACT_PATH, BOARD_STORE_PORT_PATH, 'src/services/store/LocalFilesBoardStore.ts']));
    expect(paths.filter((path) => BOARD_STORE_ADAPTER_PATTERN.test(path))).toContain('src/services/store/LocalFilesBoardStore.ts');
  });

  test('every adapter is named on a code line of the contract', () => {
    expect(adaptersTheContractDoesNotName(SOURCES)).toEqual([]);
  });

  test('an adapter the contract does not name fails, and so does one only a comment of the contract names', () => {
    const plantedAdapter = { path: 'src/services/store/PlantedRemoteBoardStore.ts', text: 'export const planted = 1;\n' };
    const contractWithAComment = {
      path: BOARD_STORE_CONTRACT_PATH,
      text: `${SOURCES.find((source) => source.path === BOARD_STORE_CONTRACT_PATH)?.text ?? ''}// PlantedRemoteBoardStore\n`,
    };
    const otherSources = SOURCES.filter((source) => source.path !== BOARD_STORE_CONTRACT_PATH);

    expect(adaptersTheContractDoesNotName([...SOURCES, plantedAdapter])).toEqual([plantedAdapter.path]);
    expect(adaptersTheContractDoesNotName([...otherSources, contractWithAComment, plantedAdapter])).toEqual([plantedAdapter.path]);
  });

  test('a contract naming the adapter by its import or its subject name passes it, and a spec beside it is no adapter', () => {
    const plantedAdapter = { path: 'src/services/store/PlantedRemoteBoardStore.ts', text: 'export const planted = 1;\n' };
    const plantedSpec = { path: 'src/services/store/PlantedOtherBoardStore.spec.ts', text: 'export const planted = 1;\n' };
    const otherSources = SOURCES.filter((source) => source.path !== BOARD_STORE_CONTRACT_PATH);
    const importingContract = { path: BOARD_STORE_CONTRACT_PATH, text: 'import { createPlanted } from \'./PlantedRemoteBoardStore.ts\';\nLocalFilesBoardStore\n' };
    const namingContract = { path: BOARD_STORE_CONTRACT_PATH, text: '{ name: \'PlantedRemoteBoardStore over a fake server\', build },\nLocalFilesBoardStore\n' };

    expect(adaptersTheContractDoesNotName([...otherSources, importingContract, plantedAdapter, plantedSpec])).toEqual([]);
    expect(adaptersTheContractDoesNotName([...otherSources, namingContract, plantedAdapter, plantedSpec])).toEqual([]);
  });
});
