/**
 * The forge reaches its stored board through the store port: no shipping line outside the store's adapter names where a record is kept. The
 * scan first proves it saw the tree and that the adapter really holds the forms, the allowlist is exact both ways (each entry names the
 * package that removes it), and each form is planted once. The adapter is an exact list of files and record format folders, never a folder
 * of `src/services/`. Comments, specs and testing folders are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                       from './testing/ImportGraph.ts';
import { memoisedPerSource, programTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

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
const RECORD_PATH_NAMES = 'progressFilePath|pipelineFilePath|pipelineSetupFilePath|gateProfilesFilePath|constitutionSourcesFilePath|ticketsDirectory|epicsDirectory'
  + '|draftsDirectory|holdJournalFilePathOf|epicFilePathOf|draftFilePathOf|everyTicketFilePathIn|everyEpicFilePathIn';
const STORE_MODULE_NAMES = 'TrackerPipeline|TrackerReader|TicketStore|EpicStore|DraftStore|StoreFolderListing|TrackerLock|HoldJournal|TrackerCreation'
  + '|LocalRecordAllocation|LocalStoreLayout|LocalStoreFiles|TrackerFiles|LocalFilesBoardStore|ProgressFileIngestion|ProgressFileWriter|LogFileIngestion'
  + '|LogFileWriter|TicketFileIngestion|TicketFileWriter|EpicFileIngestion|EpicFileWriter|DraftFileIngestion|DraftFileWriter|HoldJournalIngestion'
  + '|HoldJournalWriter';

const STORE_FORM_PATTERNS: Readonly<Record<StoreForm, readonly RegExp[]>> = {
  // Prose in a template literal is longer than the name, so help text and wording do not match.
  'record-file-name':   [new RegExp(`(['"\`])(?:${RECORD_FILE_NAMES})\\1`)],
  'record-folder-join': [/\bjoin\([^)]*(['"`])(?:tickets|epics|filing-cabinet)\1/],
  'record-path-name':   [
    new RegExp(`\\b(?:${RECORD_PATH_NAMES})\\b`),
    // The Overseer's own log and the registry's and the landing's locks use the same field names, so these match only on a workspace.
    /\b(?:workspace|Workspace)\??\.(?:logFilePath|lockDirectoryPath)\b/,
  ],
  'record-constant':       [/\bTRACKER_FILES\.(?!TRACKER_DIRECTORY_NAME\b|HTML_FILE_NAME\b)\w+/, /\bLOCAL_STORE_FILES\b/],
  // An import spread over several lines is matched on its `from` line, the line the allowlist names.
  'store-internal-import': [new RegExp(`\\bfrom\\s+['"][^'"]*\\/(?:${STORE_MODULE_NAMES})\\.ts['"]`)],
  // The pure members of these adapters (`contentsOf`, `documentReadingOf`, `storedDocumentOf` and kin) stay usable.
  'stored-record-read':    [/\b(?:PipelineFile|GateProfilesFile|PipelineSetupFile|ConstitutionSourcesFile)\.read\(/],
};

const STORE_FORMS = Object.keys(STORE_FORM_PATTERNS) as StoreForm[];

/** A listed file that does not exist yet is allowed; a later package adds it. */
const STORE_ADAPTER_FILES: readonly string[] = [
  'src/services/store/LocalFilesBoardStore.ts',
  'src/services/tracker/DraftStore.ts',
  'src/services/tracker/EpicStore.ts',
  'src/services/tracker/HoldJournal.ts',
  'src/services/tracker/LocalRecordAllocation.ts',
  'src/services/tracker/LocalStoreLayout.ts',
  'src/services/tracker/StoreFolderListing.ts',
  'src/services/tracker/TicketStore.ts',
  'src/services/tracker/TrackerCreation.ts',
  'src/services/tracker/TrackerLock.ts',
  'src/services/tracker/TrackerPipeline.ts',
  'src/services/tracker/TrackerReader.ts',
  'src/services/tracker/Workspace.ts',
  'src/services/tracker/constants/LocalStoreFiles.ts',
  'src/services/tracker/constants/TrackerFiles.ts',
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

/** `<path>: <form>: <trimmed line>`, sorted by path, each naming the package that removes it. */
const ALLOWED_STORE_LINES: Readonly<Record<string, string>> = {
  'cli/BoardStoreOf.ts: store-internal-import: import { createLocalFilesBoardStore }       from \'../src/services/store/LocalFilesBoardStore.ts\';':
    'The CLI\'s composition root picks the store\'s adapter.',
  'cli/InstalledFiles.ts: store-internal-import: import { TRACKER_FILES }                                       from \'../src/services/tracker/constants/TrackerFiles.ts\';':
    'Removed by WP5.11: the tracker folder and the page names leave `TRACKER_FILES` for `PRODUCT_NAMES`.',
  [
  'cli/adoption/init/InitCommand.ts: store-internal-import: import { TRACKER_FILES }                                  from'
    + ' \'../../../src/services/tracker/constants/TrackerFiles.ts\';'
  ]:
    'Removed by WP5.11: the tracker folder and the page names leave `TRACKER_FILES` for `PRODUCT_NAMES`.',
  [
  'cli/overseer/OverseerFlintBrain.ts: store-internal-import: import { requireProgressFile }                                                                  from'
    + ' \'../../src/services/tracker/TrackerReader.ts\';'
  ]:
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'cli/overseer/OverseerForeground.ts: store-internal-import: import { requireProgressFile } from \'../../src/services/tracker/TrackerReader.ts\';':
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'cli/overseer/routes/BoardStateReader.ts: record-path-name: const stored = storedFileTextOf(workspace.pipelineFilePath);':
    'Removed by WP5.10: the board state shows the stored pipeline text from the store.',
  'cli/overseer/routes/BoardStateReader.ts: store-internal-import: import { requireTracker }                            from \'../../../src/services/tracker/TrackerReader.ts\';':
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'cli/overseer/routes/OverseerRoutes.ts: record-path-name: const reading = GateProfilesFile.read(gateProfilesFilePath);':
    'Removed by WP5.10: the server reads the gate profiles through the store.',
  'cli/overseer/routes/OverseerRoutes.ts: record-path-name: function boardHoldsProfileRun(gateProfilesFilePath: string, profileRunId: string): boolean {':
    'Removed by WP5.10: the server reads the gate profiles through the store.',
  'cli/overseer/routes/OverseerRoutes.ts: record-path-name: if (afterLineNumber === null || !boardHoldsProfileRun(workspace.gateProfilesFilePath, profileRunId)) return null;':
    'Removed by WP5.10: the server reads the gate profiles through the store.',
  [
  'cli/overseer/routes/OverseerRoutes.ts: record-path-name: senderFactsOf: () => JobTranscript.senderFactsOf(logRecordsIn(workspace.logFilePath), workspace.trackerDirectory,'
    + ' jobId),'
  ]:
    'Removed by WP5.10: the server reads the log records through the store.',
  [
  'cli/overseer/routes/OverseerRoutes.ts: store-internal-import: import { LogFileIngestion }                                   from'
    + ' \'../../../src/adapters/log/LogFileIngestion.ts\';'
  ]:
    'Removed by WP5.10: the server reads the log records through the store.',
  'cli/overseer/routes/OverseerRoutes.ts: stored-record-read: const reading = GateProfilesFile.read(gateProfilesFilePath);':
    'Removed by WP5.10: the server reads the gate profiles through the store.',
  [
  'cli/overseer/routes/PresenceReader.ts: store-internal-import: import { requireTracker }                                  from'
    + ' \'../../../src/services/tracker/TrackerReader.ts\';'
  ]:
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'src/services/overseer/DrivePass.ts: record-path-name: const pipelineReading = PipelineFile.read(workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/DrivePass.ts: record-path-name: const reading  = PipelineFile.read(request.workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/DrivePass.ts: record-path-name: const reading = PipelineFile.read(request.workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/DrivePass.ts: record-path-name: digest.update(fileTextOrEmpty(workspace.gateProfilesFilePath)).update(\'\\0\');':
    'Removed by WP5.10: the pass fingerprint reads the stored files.',
  [
  'src/services/overseer/DrivePass.ts: record-path-name:'
    + ' digest.update(fileTextOrEmpty(workspace.progressFilePath)).update(\'\\0\').update(fileTextOrEmpty(workspace.logFilePath)).update(\'\\0\');'
  ]:
    'Removed by WP5.10: the pass fingerprint reads the stored files.',
  'src/services/overseer/DrivePass.ts: store-internal-import: import { requireProgressFile }                        from \'../tracker/TrackerReader.ts\';':
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'src/services/overseer/DrivePass.ts: store-internal-import: import { writeTracker }                               from \'../tracker/TrackerPipeline.ts\';':
    'Removed by WP5.10: the pass holds the board through the store\'s transaction.',
  'src/services/overseer/DrivePass.ts: stored-record-read: const pipelineReading = PipelineFile.read(workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/DrivePass.ts: stored-record-read: const reading  = PipelineFile.read(request.workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/DrivePass.ts: stored-record-read: const reading = PipelineFile.read(request.workspace.pipelineFilePath);':
    'Removed by WP5.10: the pass reads the one judged pipeline through the store.',
  'src/services/overseer/Regrouping.ts: store-internal-import: import { requireProgressFile }                              from \'../tracker/TrackerReader.ts\';':
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  'src/services/overseer/StartGate.ts: store-internal-import: import { requireProgressFile }                               from \'../tracker/TrackerReader.ts\';':
    'Removed by WP5.10: the Overseer reads through the store\'s read side.',
  [
  'src/services/tracker/RepositoryTrackerList.ts: store-internal-import: import { TRACKER_FILES }                                                      from'
    + ' \'./constants/TrackerFiles.ts\';'
  ]:
    'Removed by WP5.11: the tracker folder and the page names leave `TRACKER_FILES` for `PRODUCT_NAMES`.',
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

const REMOVAL_REASON_PATTERN = /^Removed by WP5\.\d+: \S/;
const COMPOSITION_ROOT_REASONS: readonly string[] = [
  'The CLI\'s composition root picks the store\'s adapter.',
  'The Overseer\'s composition root picks the store\'s adapter.',
];

function isAcceptedAllowanceReason(reason: string): boolean {
  return REMOVAL_REASON_PATTERN.test(reason) || COMPOSITION_ROOT_REASONS.includes(reason);
}

describe('the scan saw the tree', () => {
  const shippingPaths = SOURCES.map((source) => source.path).filter(isShippingCode);

  test('it reads the whole shipping tree and skips the specs', () => {
    expect(shippingPaths.length).toBeGreaterThan(400);
    expect(SOURCES.length).toBeGreaterThan(shippingPaths.length);
    expect(shippingPaths).toEqual(expect.arrayContaining([
      'cli/CommandContext.ts', 'src/services/overseer/DrivePass.ts', 'src/services/control/ControlService.ts', 'bridge/Main.tsx',
    ]));
    expect(shippingPaths).not.toContain('src/StoreBoundary.spec.ts');
  });

  test('it finds the adapter files that exist and a source in every record format folder', () => {
    expect(shippingPaths.filter(isStoreAdapter)).toEqual(expect.arrayContaining([
      'src/services/tracker/DraftStore.ts',
      'src/services/tracker/EpicStore.ts',
      'src/services/tracker/HoldJournal.ts',
      'src/services/tracker/StoreFolderListing.ts',
      'src/services/tracker/TicketStore.ts',
      'src/services/tracker/TrackerCreation.ts',
      'src/services/tracker/TrackerLock.ts',
      'src/services/tracker/TrackerPipeline.ts',
      'src/services/tracker/TrackerReader.ts',
      'src/services/tracker/Workspace.ts',
      'src/services/tracker/constants/TrackerFiles.ts',
    ]));
    for (const folder of STORE_ADAPTER_FOLDERS) expect(shippingPaths.some((path) => path.startsWith(folder))).toBe(true);
  });

  test('the forms it looks for really stand in the adapter', () => {
    const formsOf = (path: string) => (SOURCES.find((source) => source.path === path)?.text ?? '').split('\n').flatMap(formsNamedBy);
    expect(formsOf('src/services/tracker/constants/TrackerFiles.ts')).toContain('record-file-name');
    expect(formsOf('src/services/tracker/TrackerPipeline.ts')).toContain('store-internal-import');
    const formsInAdapter = new Set(SOURCES.filter((source) => isStoreAdapter(source.path)).flatMap((source) => source.text.split('\n').flatMap(formsNamedBy)));
    expect([...formsInAdapter]).toEqual(expect.arrayContaining(['record-file-name', 'record-path-name', 'record-constant', 'store-internal-import', 'stored-record-read']));
  });

  test('every shipping line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('the allowlist is sorted by path, and each entry names what removes it', () => {
    expect(ALLOWED_LINES).toEqual([...ALLOWED_LINES].sort());
    expect(Object.values(ALLOWED_STORE_LINES).filter((reason) => !isAcceptedAllowanceReason(reason))).toEqual([]);
  });
});

describe('the allowlist is exact both ways', () => {
  const removedEntry = ALLOWED_LINES[0] ?? '';
  const allowedEntry = 'src/services/overseer/Planted.ts: record-constant: const name = TRACKER_FILES.LOG_FILE_NAME;';

  test('removing an entry leaves its line a violation', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(boundaryReportOf(SOURCES, [...ALLOWED_LINES, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed line in its own file is a violation', () => {
    const doubledSite = { path: 'src/services/overseer/Planted.ts', text: 'const name = TRACKER_FILES.LOG_FILE_NAME;\nconst name = TRACKER_FILES.LOG_FILE_NAME;\n' };
    expect(boundaryReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });

  test('an allowed line in another file is a violation', () => {
    const plantedCopy = { path: 'src/services/overseer/PlantedCopy.ts', text: 'const name = TRACKER_FILES.LOG_FILE_NAME;\n' };
    expect(boundaryReportOf([plantedCopy], [allowedEntry])).toEqual({
      violations:       ['src/services/overseer/PlantedCopy.ts: record-constant: const name = TRACKER_FILES.LOG_FILE_NAME;'],
      unusedAllowances: [allowedEntry],
    });
  });
});

describe('the guard names each form, planted in memory', () => {
  const plantedPath = 'src/services/overseer/Planted.ts';

  const plantedForms: readonly (readonly [string, string, readonly StoreForm[]])[] = [
    ['a record file name in single quotes', 'const name = \'progress.json\';', ['record-file-name']],
    ['a record file name in double quotes', 'const name = "log.jsonl";', ['record-file-name']],
    ['a record folder name in a template literal', 'const name = `filing-cabinet`;', ['record-file-name']],
    ['the hold journal\'s name', 'const name = \'hold-journal.json\';', ['record-file-name']],
    ['a record folder joined', 'const folder = join(trackerDirectory, \'tickets\');', ['record-folder-join']],
    ['the epics folder joined', 'const folder = join(root, ".forge", "epics");', ['record-folder-join']],
    ['a record path field', 'const folder = workspace.ticketsDirectory;', ['record-path-name']],
    ['a record path helper', 'const path = holdJournalFilePathOf(workspace);', ['record-path-name']],
    ['the log path on a workspace', 'const path = request.workspace.logFilePath;', ['record-path-name']],
    ['the lock path on an optional workspace', 'const path = workspace?.lockDirectoryPath;', ['record-path-name']],
    ['a record name constant', 'const name = TRACKER_FILES.PIPELINE_FILE_NAME;', ['record-constant']],
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
      'const path = overseerFiles.logFilePath;',
      'const path = registry.lockDirectoryPath;',
      'const folder = TRACKER_FILES.TRACKER_DIRECTORY_NAME;',
      'const page = TRACKER_FILES.HTML_FILE_NAME;',
      'const text = PipelineFile.contentsOf(storedText);',
      'const location = file.filePath;',
    ]) {
      expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual([]);
    }
  });
});

describe('what the boundary exempts is exact', () => {
  const plantedLine = 'const name = TRACKER_FILES.LOG_FILE_NAME;';

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
    expect(violationsOfPlanted('bridge/Planted.dom.tsx', plantedLine)).toEqual([]);
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
