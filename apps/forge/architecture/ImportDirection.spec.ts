/**
 * The Imports rules of `.claude/rules/forge.md`, held over the root program and each workspace package forge declares: no package imports the
 * forge, a package is reached by its declared name and never by a file path, only the agent port's seam and adapters import the vendor's
 * adapter, and no `cli/` command set imports another, the command table composing them.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import type { ImportEdge, ImportGraph }                                              from '../src/testing/ImportGraph.ts';
import { importGraphScannerOf, programFileLocationOf, repositoryRootOfThisCheckout } from '../src/testing/ImportGraph.ts';
import { declaredWorkspacePackagesOf }                                               from '../src/testing/RepositorySources.ts';

type ImportViolation =
  | 'layer-imports-upward'
  | 'command-imports-a-sibling-command'
  | 'command-set-imports-another-set'
  | 'cli-root-imports-a-set'
  | 'workspace-package-reached-by-path'
  | 'workspace-entry-not-exported'
  | 'workspace-package-not-declared'
  | 'import-leaves-the-program'
  | 'binary-imports-beyond-cli'
  | 'talos-binary-imports-beyond-its-package'
  | 'test-helper-imported-outside-its-allowlist'
  | 'package-imports-an-undeclared-package'
  | 'tracker-model-reaches-outside-itself'
  | 'vendor-adapter-imported-outside-its-seam'
  | 'import-cycle'
  | 'barrel';

type Layer =
  | 'binary'
  | 'talos-binary'
  | 'talos-program'
  | 'launcher-binary'
  | 'setup-binary'
  | 'lib'
  | 'domain'
  | 'shared'
  | 'adapters'
  | 'render-service'
  | 'tracker-service'
  | 'lifecycle-service'
  | 'control-service'
  | 'store-service'
  | 'hephaestus-service'
  | 'test-support'
  | 'architecture'
  | 'cli'
  | 'workspace-package'
  | 'unplaced';

interface Finding {
  readonly violation:     ImportViolation;
  readonly sentence:      string;
  readonly involvedPaths: readonly string[];
}

const BINARY_PATH = 'agent-progress.ts';
const TALOS_BINARY_PATH = 'talos.ts';
/** The second entry program, beside `cli/`: what `talos.ts` runs. */
const TALOS_PROGRAM_FOLDER = 'talos/';
/** The installed command `setup.ts` compiles, which starts `agent-progress.ts`; it reaches only `src/shared/` for the runtime arguments. */
const LAUNCHER_BINARY_PATH = 'launcher.ts';
/** Machine setup, which the bootstrap scripts start; it reaches only its own steps under `cli/setup/`. */
const SETUP_BINARY_PATH = 'setup.ts';
const VENDOR_ADAPTER_PATH = 'src/lib/claude-code/ClaudeCodeAdapter.ts';
const VENDOR_ADAPTER_PACKAGE_FOLDER = 'src/lib/claude-code/';
/** The one shipping module that chooses the adapter; everything else reaches a session through the launcher port it hands over. */
const VENDOR_ADAPTER_SEAM = 'cli/CommandContext.ts';
/** The fake agent, an adapter of the same port that replays the vendor's recorded wire. */
const FAKE_AGENT_ADAPTER_FILES: readonly string[] = ['src/testing/FakeAgentAdapter.ts', 'src/testing/FakeReportingSessions.ts'];
const FAKE_AGENT_ADAPTER_FOLDER = 'src/testing/fake-agent/';
const SOURCE_LAYERS = [
  'lib', 'domain', 'shared', 'adapters', 'render-service', 'tracker-service', 'lifecycle-service', 'control-service', 'store-service', 'hephaestus-service',
] as const satisfies readonly Layer[];

/** What each layer may import, a folder in a testing folder aside: those are judged by `TESTING_FOLDER_IMPORTERS` alone. */
const LAYER_REACH: Readonly<Record<Layer, readonly Layer[]>> = {
  'binary':             ['cli'],
  // Narrowed further to its own program by directionFinding.
  'talos-binary':       ['talos-program'],
  'talos-program':      ['lib', 'domain', 'talos-program'],
  'launcher-binary':    ['shared'],
  'setup-binary':       ['cli'],
  'lib':                ['lib'],
  'domain':             ['lib', 'domain'],
  'shared':             ['lib', 'domain', 'shared', 'workspace-package'],
  'adapters':           ['lib', 'domain', 'shared', 'adapters', 'workspace-package'],
  'render-service':     ['lib', 'domain', 'shared', 'adapters', 'render-service', 'workspace-package'],
  'tracker-service':    ['lib', 'domain', 'shared', 'adapters', 'render-service', 'tracker-service', 'workspace-package'],
  'lifecycle-service':  ['lib', 'domain', 'shared', 'adapters', 'render-service', 'tracker-service', 'lifecycle-service', 'workspace-package'],
  'control-service':    ['lib', 'domain', 'shared', 'adapters', 'render-service', 'tracker-service', 'lifecycle-service', 'control-service', 'workspace-package'],
  'store-service':      ['lib', 'domain', 'shared', 'adapters', 'render-service', 'tracker-service', 'lifecycle-service', 'control-service', 'store-service', 'workspace-package'],
  'hephaestus-service': [...SOURCE_LAYERS, 'workspace-package'],
  'test-support':       [...SOURCE_LAYERS, 'workspace-package'],
  'architecture':       [],
  'cli':                [...SOURCE_LAYERS, 'cli', 'workspace-package'],
  // Narrowed further to its own package and those its package.json declares by workspacePackageDeclarationFinding.
  'workspace-package':  ['workspace-package'],
  'unplaced':           [],
};

/**
 * Each test-only folder and the folders whose specs, or whose own test-only folders, may import it. An entry naming a file rather than a
 * folder lets that one shipping module import it: `cli/CommandContext.ts` chooses the fake agent under the fake-agent switch. Exact both
 * ways: every `testing/` folder in the tree has an entry, and every importer folder or file is used by at least one import.
 */
const TESTING_FOLDER_IMPORTERS: Readonly<Record<string, readonly string[]>> = {
  'src/testing/':                      ['src/', 'talos/', 'cli/', 'architecture/', VENDOR_ADAPTER_SEAM],
  'talos/testing/':                    ['src/lib/local-endpoint/', 'src/testing/'],
  'src/domain/tracker-model/testing/': ['src/domain/tracker-model/'],
  'src/adapters/progress/testing/':    ['src/adapters/'],
  'src/services/tracker/testing/':     ['src/services/tracker/'],
  'src/services/hephaestus/testing/':  ['src/services/hephaestus/'],
  'cli/testing/':                      ['cli/'],
};

/** One allowed import, as an exact importer and target. */
interface ExactReach {
  readonly importer: string;
  readonly target:   string;
}

/** The folders whose specs may import the Talos program, to run its own socket server against Hephaestus's client; exact both ways. */
const TALOS_PROGRAM_SPEC_IMPORTERS: readonly string[] = ['src/services/hephaestus/'];

/** Imports of a command set by another set or by the `cli/` root that the rules let through, exact both ways; none today. */
const COMMAND_SET_REACHES: readonly ExactReach[] = [];

/** The one file at the `cli/` root that imports the command sets: it composes them into the verbs `cli/Main.ts` dispatches. */
const COMMAND_SET_COMPOSER = 'cli/CommandTable.ts';

interface Allowlists {
  readonly testingFolderImporters:    Readonly<Record<string, readonly string[]>>;
  readonly commandSetReaches:         readonly ExactReach[];
  readonly talosProgramSpecImporters: readonly string[];
}

const ALLOWLISTS: Allowlists = {
  testingFolderImporters:    TESTING_FOLDER_IMPORTERS,
  commandSetReaches:         COMMAND_SET_REACHES,
  talosProgramSpecImporters: TALOS_PROGRAM_SPEC_IMPORTERS,
};

/** Folders inside a `cli/` set that hold what the set's commands share rather than one command. */
const CLI_SET_SHARED_FOLDERS = ['@types', 'constants', 'utils'];
/** Folders directly under `cli/` that hold what every set shares rather than one set of commands. */
const CLI_SHARED_FOLDERS = ['@types', 'arguments', 'constants', 'testing', 'utils'];
const TRACKER_MODEL_FOLDER = 'src/domain/tracker-model/';
/** The layers made of packages, each package a folder directly under the layer's folder that declares the packages it imports. */
const PACKAGE_LAYER_FOLDERS = ['lib', 'domain'] as const;
const PACKAGE_DEPENDENCY_SENTENCE = /depends on ([^.]+)/i;
const PACKAGE_REFERENCE = /`src\/((?:lib|domain)\/[a-z-]+)`/g;
const HEADER_COMMENT = /^\/\*\*([\s\S]*?)\*\//;
const SPEC_SUFFIX = '.spec.ts';

function isSpec(path: string): boolean {
  return path.endsWith(SPEC_SUFFIX);
}

/** A path's place in the rules never changes, and every scan of a planted graph asks again of each edge's two paths. */
function memoisedPerPath<Answer>(answerOf: (path: string) => Answer): (path: string) => Answer {
  const answers = new Map<string, Answer>();
  return (path) => {
    if (answers.has(path)) return answers.get(path) as Answer;
    const answer = answerOf(path);
    answers.set(path, answer);
    return answer;
  };
}

function isInside(path: string, folder: string): boolean {
  return path.startsWith(folder);
}

/** Each workspace package forge declares, with the workspace packages its own `package.json` names in any dependency field. */
interface WorkspacePackageDeclarations {
  readonly name:             string;
  readonly declaredPackages: readonly string[];
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

function workspacePackageDeclarationsOf(repositoryRoot: string): readonly WorkspacePackageDeclarations[] {
  const packageNames = declaredWorkspacePackagesOf(repositoryRoot).map(({ name }) => name);
  return packageNames.map((name): WorkspacePackageDeclarations => {
    const manifest = JSON.parse(readFileSync(programFileLocationOf(repositoryRoot, `${name}/package.json`), 'utf8')) as Readonly<Record<string, unknown>>;
    const namedPackages = DEPENDENCY_FIELDS.flatMap((field) => Object.keys((manifest[field] ?? {}) as Readonly<Record<string, unknown>>));
    return { name, declaredPackages: namedPackages.filter((namedPackage) => packageNames.includes(namedPackage)) };
  });
}

const WORKSPACE_PACKAGES = workspacePackageDeclarationsOf(repositoryRootOfThisCheckout());

/** The declared workspace package whose virtual folder holds the path, or null for a path of the program. */
const workspacePackageOf = memoisedPerPath((path: string): WorkspacePackageDeclarations | null => {
  return WORKSPACE_PACKAGES.find((workspacePackage) => isInside(path, `${workspacePackage.name}/`)) ?? null;
});

const layerOf = memoisedPerPath((path: string): Layer => {
  if (path === BINARY_PATH) return 'binary';
  if (path === TALOS_BINARY_PATH) return 'talos-binary';
  if (path === LAUNCHER_BINARY_PATH) return 'launcher-binary';
  if (path === SETUP_BINARY_PATH) return 'setup-binary';
  const [topFolder, layerFolder, unitFolder] = path.split('/');
  if (topFolder === 'cli') return 'cli';
  if (topFolder === 'talos' && layerFolder !== undefined) return 'talos-program';
  if (topFolder === 'architecture') return isSpec(path) && layerFolder !== undefined ? 'architecture' : 'unplaced';
  if (workspacePackageOf(path) !== null) return 'workspace-package';
  if (topFolder !== 'src' || layerFolder === undefined) return 'unplaced';
  if (unitFolder === undefined) return 'unplaced';
  switch (layerFolder) {
    case 'lib':
      return path.split('/').length > 3 ? 'lib' : 'unplaced';
    case 'domain':
      return path.split('/').length > 3 ? 'domain' : 'unplaced';
    case 'shared':
      return 'shared';
    case 'adapters':
      return 'adapters';
    case 'services':
      if (unitFolder === 'render') return 'render-service';
      if (unitFolder === 'tracker') return 'tracker-service';
      if (unitFolder === 'lifecycle') return 'lifecycle-service';
      if (unitFolder === 'control') return 'control-service';
      if (unitFolder === 'store') return 'store-service';
      return unitFolder === 'hephaestus' ? 'hephaestus-service' : 'unplaced';
    case 'testing':
      return 'test-support';
    default:
      return 'unplaced';
  }
});

/** The folder up to and including the first segment named `name`, or null outside one. */
function enclosingFolderNamed(path: string, name: string): string | null {
  const segments = path.split('/');
  const index = segments.slice(0, -1).indexOf(name);
  return index === -1 ? null : `${segments.slice(0, index + 1).join('/')}/`;
}

const testingFolderOf = memoisedPerPath((path: string): string | null => {
  return enclosingFolderNamed(path, 'testing');
});

/** `lib/<package>` or `domain/<package>`: the package of a package layer that holds the path, or null outside one. */
const packageOf = memoisedPerPath((path: string): string | null => {
  const [topFolder, layerFolder, packageFolder] = path.split('/');
  const inAPackageLayer = topFolder === 'src' && PACKAGE_LAYER_FOLDERS.some((folder) => folder === layerFolder);
  return inAPackageLayer && path.split('/').length > 3 ? `${layerFolder}/${packageFolder}` : null;
});

/** `cli/<set>/`: a folder directly under `cli/` that is not one of the folders every set shares. */
const commandSetFolderOf = memoisedPerPath((path: string): string | null => {
  const segments = path.split('/');
  const [topFolder, setFolder] = segments;
  if (topFolder !== 'cli' || setFolder === undefined || segments.length < 3) return null;
  return CLI_SHARED_FOLDERS.includes(setFolder) ? null : `cli/${setFolder}/`;
});

/** `cli/<set>/<command>/`: a folder of a set that is not one of the folders the set's commands share. */
const commandFolderOf = memoisedPerPath((path: string): string | null => {
  const segments = path.split('/');
  const [topFolder, setFolder, commandFolder] = segments;
  if (topFolder !== 'cli' || setFolder === undefined || commandFolder === undefined || segments.length < 4) return null;
  return CLI_SET_SHARED_FOLDERS.includes(commandFolder) ? null : `cli/${setFolder}/${commandFolder}/`;
});

const isTestOnly = memoisedPerPath((path: string): boolean => {
  return isSpec(path) || testingFolderOf(path) !== null;
});

/** The packages each package's main module names in its header, the one module of the package whose header says what it depends on. */
function declaredPackageDependenciesOf(graph: ImportGraph): ReadonlyMap<string, readonly string[]> {
  const declarations = new Map<string, string[]>();
  for (const path of graph.scannedPaths) {
    const unitPackage = packageOf(path);
    if (unitPackage === null || isTestOnly(path) || path.split('/').length !== 4) continue;
    const header = HEADER_COMMENT.exec(graph.sourceTextOf(path))?.[1]?.replace(/\n\s*\*/g, ' ') ?? '';
    const dependencySentence = PACKAGE_DEPENDENCY_SENTENCE.exec(header)?.[1];
    if (dependencySentence === undefined) continue;
    if (declarations.has(unitPackage)) throw new Error(`two modules of src/${unitPackage}/ say what it depends on; only its main module does`);
    declarations.set(unitPackage, [...dependencySentence.matchAll(PACKAGE_REFERENCE)].map((match) => match[1] ?? ''));
  }
  return declarations;
}

function describeTarget(edge: ImportEdge): string {
  return edge.target.kind === 'repository-file' ? edge.target.path : edge.target.specifier;
}

function edgeFinding(edge: ImportEdge, violation: ImportViolation, reason: string): Finding {
  const involvedPaths = edge.target.kind === 'repository-file' ? [edge.fromPath, edge.target.path] : [edge.fromPath];
  return { violation, sentence: `${edge.fromPath}:${edge.line} imports ${describeTarget(edge)}: ${reason}`, involvedPaths };
}

function testingFolderFinding(edge: ImportEdge, targetPath: string, allowlists: Allowlists): Finding | null {
  const targetTestingFolder = testingFolderOf(targetPath);
  if (targetTestingFolder === null || testingFolderOf(edge.fromPath) === targetTestingFolder) return null;
  const importerFolders = Object.hasOwn(allowlists.testingFolderImporters, targetTestingFolder) ? allowlists.testingFolderImporters[targetTestingFolder] ?? [] : [];
  const importerIsListed = (importerEntry: string): boolean => (importerEntry.endsWith('/')
    ? isTestOnly(edge.fromPath) && isInside(edge.fromPath, importerEntry)
    : edge.fromPath === importerEntry);
  if (importerFolders.some(importerIsListed)) return null;
  const listedFolders = importerFolders.filter((importerEntry) => importerEntry.endsWith('/'));
  const listedFiles   = importerFolders.filter((importerEntry) => !importerEntry.endsWith('/'));
  const filesSuffix   = listedFiles.length === 0 ? '' : ` and ${listedFiles.join(', ')}`;
  const allowed       = importerFolders.length === 0 ? 'nothing, as it has no allowlist entry' : `only the specs of ${listedFolders.join(', ')}${filesSuffix}`;
  return edgeFinding(edge, 'test-helper-imported-outside-its-allowlist', `${targetTestingFolder} is test-only and may be imported by ${allowed}`);
}

function isListedTalosProgramSpecImport(edge: ImportEdge, targetPath: string, allowlists: Allowlists): boolean {
  return layerOf(targetPath) === 'talos-program' && isTestOnly(edge.fromPath)
    && allowlists.talosProgramSpecImporters.some((importerFolder) => isInside(edge.fromPath, importerFolder));
}

function directionFinding(edge: ImportEdge, targetPath: string, allowlists: Allowlists): Finding | null {
  const fromLayer = layerOf(edge.fromPath);
  const targetLayer = layerOf(targetPath);
  if (isListedTalosProgramSpecImport(edge, targetPath, allowlists)) return null;
  if (fromLayer === 'talos-binary' && !isInside(targetPath, TALOS_PROGRAM_FOLDER)) {
    return edgeFinding(edge, 'talos-binary-imports-beyond-its-package', `${TALOS_BINARY_PATH} imports only ${TALOS_PROGRAM_FOLDER}`);
  }
  if (testingFolderOf(targetPath) !== null || LAYER_REACH[fromLayer].includes(targetLayer)) return null;
  if (fromLayer === 'binary') {
    return edgeFinding(edge, 'binary-imports-beyond-cli', `${BINARY_PATH} imports only cli/`);
  }
  return edgeFinding(edge, 'layer-imports-upward', `${fromLayer} reaches only ${LAYER_REACH[fromLayer].join(', ') || 'nothing'}, not ${targetLayer}`);
}

function commandFinding(edge: ImportEdge, targetPath: string): Finding | null {
  const fromCommand = commandFolderOf(edge.fromPath);
  const targetCommand = commandFolderOf(targetPath);
  if (fromCommand === null || targetCommand === null || fromCommand === targetCommand) return null;
  if (commandSetFolderOf(edge.fromPath) !== commandSetFolderOf(targetPath)) return null;
  return edgeFinding(edge, 'command-imports-a-sibling-command', `the command folder ${fromCommand} imports another command's folder; hoist what both need above them`);
}

function commandSetFinding(edge: ImportEdge, targetPath: string, allowlists: Allowlists): Finding | null {
  const fromSet = commandSetFolderOf(edge.fromPath);
  const targetSet = commandSetFolderOf(targetPath);
  if (fromSet === null || targetSet === null || fromSet === targetSet) return null;
  if (allowlists.commandSetReaches.some((reach) => reach.importer === edge.fromPath && reach.target === targetPath)) return null;
  return edgeFinding(edge, 'command-set-imports-another-set', `the command set ${fromSet} imports another set's folder; hoist what both need above them`);
}

function commandSetFromTheRootFinding(edge: ImportEdge, targetPath: string, allowlists: Allowlists): Finding | null {
  const targetSet = commandSetFolderOf(targetPath);
  if (layerOf(edge.fromPath) !== 'cli' || commandSetFolderOf(edge.fromPath) !== null || targetSet === null) return null;
  if (edge.fromPath === COMMAND_SET_COMPOSER || isTestOnly(edge.fromPath)) return null;
  if (allowlists.commandSetReaches.some((reach) => reach.importer === edge.fromPath && reach.target === targetPath)) return null;
  return edgeFinding(edge, 'cli-root-imports-a-set', `the cli/ root imports the command set ${targetSet}, which only ${COMMAND_SET_COMPOSER} composes; hoist what it needs`);
}

/** Outside its own folder, a workspace package is imported by its name: a relative or absolute path is a finding. */
function workspacePackagePathFinding(edge: ImportEdge, targetPath: string): Finding | null {
  const targetPackage = workspacePackageOf(targetPath);
  if (targetPackage === null || workspacePackageOf(edge.fromPath) === targetPackage) return null;
  if (edge.specifier === targetPackage.name || edge.specifier.startsWith(`${targetPackage.name}/`)) return null;
  return edgeFinding(
    edge,
    'workspace-package-reached-by-path',
    `outside ${targetPackage.name}/, the package is imported as ${targetPackage.name}/<entry>, an entry its package.json exports`,
  );
}

/** A package reaches another only once its own `package.json` declares it, as it will once split off. */
function workspacePackageDeclarationFinding(edge: ImportEdge, targetPath: string): Finding | null {
  const fromPackage = workspacePackageOf(edge.fromPath);
  const targetPackage = workspacePackageOf(targetPath);
  if (fromPackage === null || targetPackage === null || fromPackage === targetPackage) return null;
  if (fromPackage.declaredPackages.includes(targetPackage.name)) return null;
  return edgeFinding(edge, 'workspace-package-not-declared', `the package.json of ${fromPackage.name} does not declare ${targetPackage.name}`);
}

function packageFinding(edge: ImportEdge, declarations: ReadonlyMap<string, readonly string[]>): Finding | null {
  const fromPackage = packageOf(edge.fromPath);
  if (fromPackage === null) return null;
  if (isInside(edge.fromPath, TRACKER_MODEL_FOLDER) && !isTestOnly(edge.fromPath)) {
    const staysInside = edge.target.kind === 'repository-file' && isInside(edge.target.path, TRACKER_MODEL_FOLDER) && testingFolderOf(edge.target.path) === null;
    return staysInside ? null : edgeFinding(edge, 'tracker-model-reaches-outside-itself', `${TRACKER_MODEL_FOLDER} imports nothing outside its own folder and no builtin`);
  }
  const targetPackage = edge.target.kind === 'repository-file' ? packageOf(edge.target.path) : null;
  if (targetPackage === null || targetPackage === fromPackage || (declarations.get(fromPackage) ?? []).includes(targetPackage)) return null;
  // An import of a layer above is the direction's finding alone.
  if (edge.target.kind === 'repository-file' && !LAYER_REACH[layerOf(edge.fromPath)].includes(layerOf(edge.target.path))) return null;
  return edgeFinding(edge, 'package-imports-an-undeclared-package', `the header of src/${fromPackage}/'s main module does not name src/${targetPackage}`);
}

/** A path that climbs out of the program root and lies in no declared package reaches another member of the workspace, or beyond it. */
function programExitFinding(edge: ImportEdge, targetPath: string): Finding | null {
  if (!targetPath.startsWith('../')) return null;
  return edgeFinding(
    edge,
    'import-leaves-the-program',
    'it lies outside the program and the workspace packages its package.json declares; another member of the workspace is imported by its name',
  );
}

function isVendorAdapterImporter(path: string): boolean {
  return isInside(path, VENDOR_ADAPTER_PACKAGE_FOLDER) || path === VENDOR_ADAPTER_SEAM || isInside(path, FAKE_AGENT_ADAPTER_FOLDER)
    || FAKE_AGENT_ADAPTER_FILES.includes(path);
}

function vendorSeamFinding(edge: ImportEdge, targetPath: string): Finding | null {
  if (!isInside(targetPath, VENDOR_ADAPTER_PACKAGE_FOLDER) || isVendorAdapterImporter(edge.fromPath)) return null;
  return edgeFinding(edge, 'vendor-adapter-imported-outside-its-seam', 'only the agent port\'s seam and its adapters import the vendor\'s adapter');
}

function edgeFindingsOf(edge: ImportEdge, declarations: ReadonlyMap<string, readonly string[]>, allowlists: Allowlists): readonly (Finding | null)[] {
  if (edge.form === 're-export') {
    return [edgeFinding(edge, 'barrel', 'a re-export makes one module stand for others')];
  }
  const packageVerdict = packageFinding(edge, declarations);
  if (edge.target.kind !== 'repository-file') {
    const talosBinaryVerdict = layerOf(edge.fromPath) === 'talos-binary'
      ? edgeFinding(edge, 'talos-binary-imports-beyond-its-package', `${TALOS_BINARY_PATH} imports only ${TALOS_PROGRAM_FOLDER}`)
      : null;
    const unexportedEntryVerdict = edge.target.kind === 'unexported-workspace-entry'
      ? edgeFinding(edge, 'workspace-entry-not-exported', 'the package.json of its workspace package exports no such entry')
      : null;
    const undeclaredPackageVerdict = edge.target.kind === 'undeclared-workspace-package'
      ? edgeFinding(edge, 'workspace-package-not-declared', 'it names a member of the workspace that package.json does not declare as a workspace:^ dependency')
      : null;
    return [packageVerdict, talosBinaryVerdict, unexportedEntryVerdict, undeclaredPackageVerdict];
  }
  const targetPath = edge.target.path;
  const programExitVerdict = programExitFinding(edge, targetPath);
  if (programExitVerdict !== null) return [programExitVerdict];
  return [
    directionFinding(edge, targetPath, allowlists),
    commandFinding(edge, targetPath),
    commandSetFinding(edge, targetPath, allowlists),
    commandSetFromTheRootFinding(edge, targetPath, allowlists),
    testingFolderFinding(edge, targetPath, allowlists),
    vendorSeamFinding(edge, targetPath),
    workspacePackagePathFinding(edge, targetPath),
    workspacePackageDeclarationFinding(edge, targetPath),
    packageVerdict,
  ];
}

/** Tarjan's strongly connected components: each component of more than one file, or a file importing itself, is a loop. */
function cyclesIn(edges: readonly (readonly [string, string])[]): readonly (readonly string[])[] {
  const successors = new Map<string, string[]>();
  for (const [fromNode, toNode] of edges) {
    const nodeSuccessors = successors.get(fromNode) ?? [];
    nodeSuccessors.push(toNode);
    successors.set(fromNode, nodeSuccessors);
  }
  const visitOrder = new Map<string, number>();
  const lowestReachable = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (node: string): void => {
    const order = visitOrder.size;
    visitOrder.set(node, order);
    lowestReachable.set(node, order);
    stack.push(node);
    onStack.add(node);
    for (const successor of successors.get(node) ?? []) {
      if (!visitOrder.has(successor)) {
        visit(successor);
        lowestReachable.set(node, Math.min(lowestReachable.get(node) ?? order, lowestReachable.get(successor) ?? order));
      } else if (onStack.has(successor)) {
        lowestReachable.set(node, Math.min(lowestReachable.get(node) ?? order, visitOrder.get(successor) ?? order));
      }
    }
    if (lowestReachable.get(node) !== order) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member !== undefined) {
        onStack.delete(member);
        component.push(member);
      }
    } while (member !== undefined && member !== node);
    if (component.length > 1 || (successors.get(node) ?? []).includes(node)) {
      cycles.push(component.sort());
    }
  };
  for (const node of [...successors.keys()].sort()) {
    if (!visitOrder.has(node)) visit(node);
  }
  return cycles;
}

function cycleFindingsOf(graph: ImportGraph): readonly Finding[] {
  const fileEdges = graph.edges.flatMap((edge): (readonly [string, string])[] => (edge.target.kind === 'repository-file' ? [[edge.fromPath, edge.target.path]] : []));
  const packageEdges = fileEdges.flatMap(([fromPath, targetPath]): (readonly [string, string])[] => {
    const fromPackage = packageOf(fromPath);
    const targetPackage = packageOf(targetPath);
    return fromPackage === null || targetPackage === null || fromPackage === targetPackage ? [] : [[`src/${fromPackage}/`, `src/${targetPackage}/`]];
  });
  return [...cyclesIn(fileEdges), ...cyclesIn(packageEdges)].map((cycle): Finding => ({
    violation:     'import-cycle',
    sentence:      `an import cycle loops through ${cycle.join(' → ')}`,
    involvedPaths: cycle,
  }));
}

function findingsOf(graph: ImportGraph, allowlists: Allowlists): readonly Finding[] {
  const declarations = declaredPackageDependenciesOf(graph);
  const edgeFindings = graph.edges.flatMap((edge) => edgeFindingsOf(edge, declarations, allowlists)).filter((finding) => finding !== null);
  const indexFileFindings = graph.scannedPaths
    .filter((path) => path.split('/').at(-1) === 'index.ts')
    .map((path): Finding => ({ violation: 'barrel', sentence: `${path} is an index file, which stands for the modules beside it`, involvedPaths: [path] }));
  return [...edgeFindings, ...cycleFindingsOf(graph), ...indexFileFindings];
}

/** An allowlist entry or a header declaration no import uses any more: each allowlist is exact in both directions. */
function unusedAllowancesOf(graph: ImportGraph, allowlists: Allowlists): readonly string[] {
  const fileEdges = graph.edges.flatMap((edge) => (edge.target.kind === 'repository-file' ? [{ fromPath: edge.fromPath, targetPath: edge.target.path }] : []));
  const testingFoldersInTree = new Set(graph.scannedPaths.flatMap((path) => testingFolderOf(path) ?? []));
  const listedTestingFolders = Object.keys(allowlists.testingFolderImporters);
  const unusedImporters = Object.entries(allowlists.testingFolderImporters).flatMap(([testingFolder, importerFolders]) => importerFolders
    .filter((importerFolder) => !fileEdges.some(({ fromPath, targetPath }) => testingFolderOf(targetPath) === testingFolder
      && testingFolderOf(fromPath) !== testingFolder
      && isInside(fromPath, importerFolder)))
    .map((importerFolder) => `TESTING_FOLDER_IMPORTERS lets ${importerFolder} import ${testingFolder}, and nothing there does`));
  const importedPackages = new Set(fileEdges.flatMap(({ fromPath, targetPath }) => {
    const fromPackage = packageOf(fromPath);
    const targetPackage = packageOf(targetPath);
    return fromPackage === null || targetPackage === null ? [] : [`${fromPackage} → ${targetPackage}`];
  }));
  const unusedDeclarations = [...declaredPackageDependenciesOf(graph)].flatMap(([unitPackage, dependencies]) => dependencies
    .filter((dependency) => !importedPackages.has(`${unitPackage} → ${dependency}`))
    .map((dependency) => `the header of src/${unitPackage}/ names src/${dependency}, which the package does not import`));
  const unusedTalosProgramSpecImporters = allowlists.talosProgramSpecImporters
    .filter((importerFolder) => !graph.edges.some((edge) => edge.target.kind === 'repository-file'
      && isInside(edge.fromPath, importerFolder) && isListedTalosProgramSpecImport(edge, edge.target.path, allowlists)))
    .map((importerFolder) => `TALOS_PROGRAM_SPEC_IMPORTERS lets the specs of ${importerFolder} import ${TALOS_PROGRAM_FOLDER}, and none does`);
  const unusedCommandSetReaches = allowlists.commandSetReaches
    .filter((reach) => !fileEdges.some(({ fromPath, targetPath }) => fromPath === reach.importer && targetPath === reach.target))
    .map((reach) => `COMMAND_SET_REACHES lets ${reach.importer} import ${reach.target}, and it does not`);
  return [
    ...[...testingFoldersInTree].filter((folder) => !listedTestingFolders.includes(folder)).map((folder) => `${folder} has no TESTING_FOLDER_IMPORTERS entry`),
    ...unusedCommandSetReaches,
    ...unusedTalosProgramSpecImporters,
    ...listedTestingFolders.filter((folder) => !testingFoldersInTree.has(folder)).map((folder) => `TESTING_FOLDER_IMPORTERS lists ${folder}, which holds no file`),
    ...unusedImporters,
    ...unusedDeclarations,
  ].sort();
}

function sentencesAbout(findings: readonly Finding[], violation: ImportViolation): readonly string[] {
  return findings.filter((finding) => finding.violation === violation).map((finding) => finding.sentence).sort();
}

const SCANNER = importGraphScannerOf(repositoryRootOfThisCheckout());
const GRAPH = SCANNER.graph;
const FINDINGS = findingsOf(GRAPH, ALLOWLISTS);

/** Only findings that involve a planted file, or a folder holding one, count, so a violation elsewhere in the tree cannot sway a self-test. */
function plantedFindingsOf(plantedSources: Readonly<Record<string, string>>): readonly Finding[] {
  const plantedPaths = Object.keys(plantedSources);
  const involvesAPlantedFile = (involvedPath: string): boolean => plantedPaths
    .some((plantedPath) => plantedPath === involvedPath || (involvedPath.endsWith('/') && isInside(plantedPath, involvedPath)));
  return findingsOf(SCANNER.graphWithPlantedFiles(plantedSources), ALLOWLISTS).filter((finding) => finding.involvedPaths.some(involvesAPlantedFile));
}

function plantedSentencesOf(plantedSources: Readonly<Record<string, string>>): readonly string[] {
  return plantedFindingsOf(plantedSources).map((finding) => `${finding.violation} — ${finding.sentence}`).sort();
}

function importing(specifier: string): string {
  return `import { planted } from '${specifier}';\nexport const plantedValue = planted;\n`;
}

describe('the scan itself', () => {
  /** The floors are round numbers well under today's counts, to fail a scan that read the wrong tree or only one program. */
  test('it read the root program and its declared packages and found the imports inside the repository in each', () => {
    const repositoryEdges = GRAPH.edges.filter((edge) => edge.target.kind === 'repository-file');
    expect(GRAPH.scannedPaths).toContain(BINARY_PATH);
    expect(GRAPH.scannedPaths).toContain(TALOS_BINARY_PATH);
    expect(GRAPH.scannedPaths).toContain(LAUNCHER_BINARY_PATH);
    expect(GRAPH.scannedPaths).toContain(SETUP_BINARY_PATH);
    for (const topFolder of ['cli/', 'talos/', 'forge-contracts/', 'src/lib/', 'src/domain/', 'src/shared/', 'src/adapters/', 'src/services/', 'src/testing/']) {
      expect(GRAPH.scannedPaths.filter((path) => isInside(path, topFolder)).length, `files under ${topFolder}`).toBeGreaterThanOrEqual(5);
      expect(repositoryEdges.filter((edge) => isInside(edge.fromPath, topFolder)).length, `imports made under ${topFolder}`).toBeGreaterThanOrEqual(5);
    }
    expect(repositoryEdges.length, 'imports inside the repository').toBeGreaterThanOrEqual(1500);
  });

  test('it sees dynamic, package and builtin imports as well as static ones inside the repository', () => {
    expect(GRAPH.edges.some((edge) => edge.form === 'dynamic-import' && edge.fromPath === 'cli/CommandTable.ts'), 'the command table\'s lazy imports').toBe(true);
    expect(GRAPH.edges.some((edge) => edge.target.kind === 'package' && edge.target.specifier === 'bun:test'), 'the test runner').toBe(true);
    expect(GRAPH.edges.some((edge) => edge.target.kind === 'package' && edge.target.specifier === 'node:fs'), 'a builtin').toBe(true);
  });

  test('it places each declared package in the workspace-package layer, each with files', () => {
    const packageNames = WORKSPACE_PACKAGES.map(({ name }) => name);
    expect(packageNames).toEqual(['forge-contracts', 'system-versions']);
    for (const name of packageNames) {
      const packagePaths = GRAPH.scannedPaths.filter((path) => isInside(path, `${name}/`));
      expect(packagePaths.length, `files under ${name}/`).toBeGreaterThan(0);
      expect(packagePaths.filter((path) => layerOf(path) !== 'workspace-package'), `files under ${name}/ placed elsewhere`).toEqual([]);
    }
    expect(WORKSPACE_PACKAGES.find(({ name }) => name === 'forge-contracts')?.declaredPackages).toEqual(['system-versions']);
  });

  /** A file no rule places is judged by none, so it fails here until its folder is placed in a layer. */
  test('every scanned file belongs to a layer the rules name', () => {
    expect(GRAPH.scannedPaths.filter((path) => layerOf(path) === 'unplaced')).toEqual([]);
  });

  test('it finds the command sets, the command folders, the packages of lib and domain and the header that declares a package dependency', () => {
    const commandFolders = new Set(GRAPH.scannedPaths.flatMap((path) => commandFolderOf(path) ?? []));
    const commandSetFolders = new Set(GRAPH.scannedPaths.flatMap((path) => commandSetFolderOf(path) ?? []));
    const layerPackages = new Set(GRAPH.scannedPaths.flatMap((path) => packageOf(path) ?? []));
    expect(commandFolders.size, 'command folders under cli/').toBeGreaterThanOrEqual(10);
    expect(commandSetFolders.size, 'command sets under cli/').toBeGreaterThanOrEqual(10);
    const composedSets = new Set(GRAPH.edges.flatMap((edge) => (edge.fromPath === COMMAND_SET_COMPOSER && edge.target.kind === 'repository-file'
      ? commandSetFolderOf(edge.target.path) ?? []
      : [])));
    const rootShippingFiles = GRAPH.scannedPaths.filter((path) => layerOf(path) === 'cli' && commandSetFolderOf(path) === null && !isTestOnly(path));
    expect(composedSets.size, 'command sets the command table composes').toBeGreaterThanOrEqual(10);
    expect(rootShippingFiles.length, 'shipping files at the cli/ root and in its shared folders').toBeGreaterThanOrEqual(20);
    expect([...layerPackages].filter((unitPackage) => unitPackage.startsWith('lib/')).length, 'packages under src/lib/').toBeGreaterThanOrEqual(4);
    expect([...layerPackages].filter((unitPackage) => unitPackage.startsWith('domain/')), 'packages under src/domain/').toContain('domain/tracker-model');
    expect(declaredPackageDependenciesOf(GRAPH).get('lib/claude-code')).toEqual(['lib/agent-launch', 'lib/atomic-file', 'lib/git', 'lib/json-record', 'lib/line-patterns']);
    expect(declaredPackageDependenciesOf(GRAPH).get('domain/talos')).toEqual(['lib/atomic-file', 'lib/json-record', 'lib/line-patterns', 'lib/process-identity']);
  });

  test('it resolves a declared package\'s specifiers through its package.json exports, each source entry exists and forge uses them', () => {
    expect(GRAPH.workspaceEntryPathsBySpecifier.get('forge-contracts/ForgeSystemVersions')).toBe('forge-contracts/constants/ForgeSystemVersions.ts');
    expect(GRAPH.workspaceEntryPathsBySpecifier.get('system-versions/SystemVersionUtil')).toBe('system-versions/utils/SystemVersionUtil.ts');
    const sourceEntryPaths = [...GRAPH.workspaceEntryPathsBySpecifier.values()].filter((path) => /\.tsx?$/.test(path));
    expect(sourceEntryPaths.filter((path) => !GRAPH.scannedPaths.includes(path))).toEqual([]);
    const importsByName = GRAPH.edges.filter((edge) => layerOf(edge.fromPath) !== 'workspace-package' && edge.specifier.startsWith('forge-contracts/'));
    expect(importsByName.length, 'forge\'s imports of the contracts package by name').toBeGreaterThanOrEqual(50);
    expect(importsByName.filter((edge) => edge.target.kind !== 'repository-file')).toEqual([]);
  });

  test('every allowlist entry and every declared lib dependency is still used, and every testing folder is listed', () => {
    expect(unusedAllowancesOf(GRAPH, ALLOWLISTS)).toEqual([]);
  });
});

describe('the test still names each violation, planted in memory', () => {
  test('a layer importing upward, and not one importing below itself', () => {
    expect(plantedSentencesOf({ 'src/adapters/log/PlantedWording.ts': importing('../../services/render/BoardFacts.ts') })).toEqual([
      'layer-imports-upward — src/adapters/log/PlantedWording.ts:1 imports src/services/render/BoardFacts.ts: '
        + 'adapters reaches only lib, domain, shared, adapters, workspace-package, not render-service',
    ]);
    expect(plantedSentencesOf({ 'src/services/render/PlantedStep.ts': importing('../tracker/TrackerLock.ts') })).toEqual([
      'layer-imports-upward — src/services/render/PlantedStep.ts:1 imports src/services/tracker/TrackerLock.ts: '
        + 'render-service reaches only lib, domain, shared, adapters, render-service, workspace-package, not tracker-service',
    ]);
    expect(plantedSentencesOf({ 'src/lib/git/PlantedStep.ts': importing('../../domain/tracker-model/Board.ts') })).toEqual([
      'layer-imports-upward — src/lib/git/PlantedStep.ts:1 imports src/domain/tracker-model/Board.ts: lib reaches only lib, not domain',
    ]);
    expect(plantedSentencesOf({ 'src/domain/planted/PlantedRule.ts': importing('../../shared/Environment.ts') })).toEqual([
      'layer-imports-upward — src/domain/planted/PlantedRule.ts:1 imports src/shared/Environment.ts: domain reaches only lib, domain, not shared',
    ]);
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.ts': importing('../domain/tracker-model/Board.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.ts': importing('../../cli/Main.ts') })).toEqual([
      'layer-imports-upward — src/shared/PlantedValue.ts:1 imports cli/Main.ts: shared reaches only lib, domain, shared, workspace-package, not cli',
    ]);
    expect(plantedSentencesOf({ 'src/services/tracker/PlantedStep.ts': importing('../render/BoardFacts.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/tracker/PlantedStep.ts': importing('../hephaestus/PlantedPass.ts') })).toEqual([
      'layer-imports-upward — src/services/tracker/PlantedStep.ts:1 imports src/services/hephaestus/PlantedPass.ts: '
        + 'tracker-service reaches only lib, domain, shared, adapters, render-service, tracker-service, workspace-package, not hephaestus-service',
    ]);
    expect(plantedSentencesOf({ 'src/services/hephaestus/PlantedPass.ts': importing('../tracker/TrackerLock.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/control/PlantedControl.ts': importing('../tracker/TrackerLock.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/hephaestus/PlantedPass.ts': importing('../control/ControlService.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/tracker/PlantedStep.ts': importing('../control/ControlService.ts') })).toEqual([
      'layer-imports-upward — src/services/tracker/PlantedStep.ts:1 imports src/services/control/ControlService.ts: '
        + 'tracker-service reaches only lib, domain, shared, adapters, render-service, tracker-service, workspace-package, not control-service',
    ]);
    expect(plantedSentencesOf({ 'src/services/control/PlantedControl.ts': importing('../hephaestus/PlantedPass.ts') })).toEqual([
      'layer-imports-upward — src/services/control/PlantedControl.ts:1 imports src/services/hephaestus/PlantedPass.ts: '
        + 'control-service reaches only lib, domain, shared, adapters, render-service, tracker-service, lifecycle-service, control-service, '
        + 'workspace-package, not hephaestus-service',
    ]);
    expect(plantedSentencesOf({ 'src/services/lifecycle/PlantedGate.ts': importing('../tracker/TrackerLock.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/control/PlantedControl.ts': importing('../lifecycle/PlantedGate.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/control/PlantedControl.ts': importing('../store/BoardStore.ts') })).toEqual([
      'layer-imports-upward — src/services/control/PlantedControl.ts:1 imports src/services/store/BoardStore.ts: '
        + 'control-service reaches only lib, domain, shared, adapters, render-service, tracker-service, lifecycle-service, control-service, workspace-package, not store-service',
    ]);
    expect(plantedSentencesOf({ 'src/services/store/PlantedStore.ts': importing('../control/ControlService.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/hephaestus/PlantedPass.ts': importing('../store/BoardStore.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/lifecycle/PlantedGate.ts': importing('../control/ControlService.ts') })).toEqual([
      'layer-imports-upward — src/services/lifecycle/PlantedGate.ts:1 imports src/services/control/ControlService.ts: '
        + 'lifecycle-service reaches only lib, domain, shared, adapters, render-service, tracker-service, lifecycle-service, workspace-package, not control-service',
    ]);
  });

  test('a command folder importing a sibling command\'s folder, and not the set\'s shared files or cli/utils/', () => {
    expect(plantedSentencesOf({ 'cli/tracking/log/PlantedStep.ts': importing('../status/StatusCommand.ts') })).toEqual([
      'command-imports-a-sibling-command — cli/tracking/log/PlantedStep.ts:1 imports cli/tracking/status/StatusCommand.ts: '
        + 'the command folder cli/tracking/log/ imports another command\'s folder; hoist what both need above them',
    ]);
    const importingHoistedFiles = `${importing('../RenderDashboardOrRefuse.ts')}${importing('../../utils/PlantedUtil.ts').replaceAll('planted', 'plantedUtil')}`;
    expect(plantedSentencesOf({ 'cli/tracking/log/PlantedStep.ts': importingHoistedFiles })).toEqual([]);
  });

  test('a command set importing another set\'s top-level file, constants or command folder, and not cli/\'s shared folders or top-level files', () => {
    expect(plantedSentencesOf({ 'cli/jobs/PlantedStep.ts': importing('../adoption/TrackerRefresh.ts') })).toEqual([
      'command-set-imports-another-set — cli/jobs/PlantedStep.ts:1 imports cli/adoption/TrackerRefresh.ts: '
        + 'the command set cli/jobs/ imports another set\'s folder; hoist what both need above them',
    ]);
    expect(plantedSentencesOf({ 'cli/tracking/log/PlantedStep.ts': importing('../../adoption/constants/AgentInstall.ts') })).toEqual([
      'command-set-imports-another-set — cli/tracking/log/PlantedStep.ts:1 imports cli/adoption/constants/AgentInstall.ts: '
        + 'the command set cli/tracking/ imports another set\'s folder; hoist what both need above them',
    ]);
    expect(plantedSentencesOf({ 'cli/tracking/log/PlantedStep.ts': importing('../../adoption/init/InitCommand.ts') })).toEqual([
      'command-set-imports-another-set — cli/tracking/log/PlantedStep.ts:1 imports cli/adoption/init/InitCommand.ts: '
        + 'the command set cli/tracking/ imports another set\'s folder; hoist what both need above them',
    ]);
    const importingSharedFiles = `${importing('../../constants/JobVerbs.ts')}${importing('../../RecordedIncidentMove.ts').replaceAll('planted', 'plantedMove')}`;
    expect(plantedSentencesOf({ 'cli/tracking/log/PlantedStep.ts': importingSharedFiles })).toEqual([]);
  });

  test('the cli/ root or a shared folder importing a command set, and not the command table, the root\'s specs or cli/testing/', () => {
    expect(plantedSentencesOf({ 'cli/PlantedContext.ts': importing('./hephaestus/StartCommand.ts') })).toEqual([
      'cli-root-imports-a-set — cli/PlantedContext.ts:1 imports cli/hephaestus/StartCommand.ts: '
        + 'the cli/ root imports the command set cli/hephaestus/, which only cli/CommandTable.ts composes; hoist what it needs',
    ]);
    expect(plantedSentencesOf({ 'cli/utils/PlantedUtil.ts': importing('../tracking/status/StatusCommand.ts') })).toEqual([
      'cli-root-imports-a-set — cli/utils/PlantedUtil.ts:1 imports cli/tracking/status/StatusCommand.ts: '
        + 'the cli/ root imports the command set cli/tracking/, which only cli/CommandTable.ts composes; hoist what it needs',
    ]);
    expect(plantedSentencesOf({ 'cli/CommandTable.ts': `${GRAPH.sourceTextOf('cli/CommandTable.ts')}${importing('./hephaestus/StartCommand.ts')}` }))
      .toEqual([]);
    expect(plantedSentencesOf({ 'cli/PlantedSurface.spec.ts': importing('./hephaestus/StartCommand.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'cli/testing/PlantedMoves.ts': importing('../tickets/utils/TicketLookupUtil.ts') })).toEqual([]);
  });

  test('a package of the workspace-package layer importing the forge, or another package by path or undeclared, and the forge reaching it from below shared/', () => {
    expect(plantedSentencesOf({ 'forge-contracts/constants/PlantedValue.ts': importing('../../../apps/forge/src/shared/Environment.ts') })).toEqual([
      'layer-imports-upward — forge-contracts/constants/PlantedValue.ts:1 imports src/shared/Environment.ts: workspace-package reaches only workspace-package, not shared',
    ]);
    expect(plantedSentencesOf({ 'forge-contracts/constants/PlantedValue.ts': importing('../../system-versions/utils/SystemVersionUtil.ts') })).toEqual([
      'workspace-package-reached-by-path — forge-contracts/constants/PlantedValue.ts:1 imports system-versions/utils/SystemVersionUtil.ts: '
        + 'outside system-versions/, the package is imported as system-versions/<entry>, an entry its package.json exports',
    ]);
    expect(plantedSentencesOf({ 'system-versions/utils/PlantedValue.ts': importing('forge-contracts/ForgeSystemVersions') })).toEqual([
      'workspace-package-not-declared — system-versions/utils/PlantedValue.ts:1 imports forge-contracts/constants/ForgeSystemVersions.ts: '
        + 'the package.json of system-versions does not declare forge-contracts',
    ]);
    expect(plantedSentencesOf({ 'src/lib/local-time/PlantedStep.ts': importing('forge-contracts/ForgeSystemVersions') })).toEqual([
      'layer-imports-upward — src/lib/local-time/PlantedStep.ts:1 imports forge-contracts/constants/ForgeSystemVersions.ts: lib reaches only lib, not workspace-package',
    ]);
    expect(plantedSentencesOf({ 'forge-contracts/constants/PlantedValue.ts': importing('system-versions/SystemVersionUtil') })).toEqual([]);
    const importingByName = `${importing('forge-contracts/ForgeSystemVersions')}${importing('system-versions/SystemVersionUtil').replaceAll('planted', 'plantedUtil')}`;
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.ts': importingByName })).toEqual([]);
  });

  test('a workspace package named with an entry its package.json does not export, by a new name or by a file path under its name', () => {
    const unexportedReason = 'the package.json of its workspace package exports no such entry';
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.ts': importing('forge-contracts/PlantedEntry') })).toEqual([
      `workspace-entry-not-exported — src/shared/PlantedValue.ts:1 imports forge-contracts/PlantedEntry: ${unexportedReason}`,
    ]);
    expect(plantedSentencesOf({ 'cli/PlantedView.ts': importing('forge-contracts/constants/ForgeSystemVersions.ts') })).toEqual([
      `workspace-entry-not-exported — cli/PlantedView.ts:1 imports forge-contracts/constants/ForgeSystemVersions.ts: ${unexportedReason}`,
    ]);
    const absoluteVersionsPath = `${repositoryRootOfThisCheckout().replaceAll('\\', '/')}/../../packages/forge-contracts/constants/ForgeSystemVersions.ts`;
    expect(plantedSentencesOf({ 'cli/PlantedView.ts': importing(absoluteVersionsPath) })).toEqual([
      'workspace-package-reached-by-path — cli/PlantedView.ts:1 imports forge-contracts/constants/ForgeSystemVersions.ts: '
        + 'outside forge-contracts/, the package is imported as forge-contracts/<entry>, an entry its package.json exports',
    ]);
  });

  test('a package or the forge reaching another member of the workspace by path, or by a name package.json does not declare', () => {
    const leavesReason = 'it lies outside the program and the workspace packages its package.json declares; another member of the workspace is imported by its name';
    expect(plantedSentencesOf({ 'forge-contracts/constants/PlantedValue.ts': importing('../../../apps/gaia/src/Main.ts') })).toEqual([
      `import-leaves-the-program — forge-contracts/constants/PlantedValue.ts:1 imports ../gaia/src/Main.ts: ${leavesReason}`,
    ]);
    expect(plantedSentencesOf({ 'system-versions/PlantedValue.ts': importing('../../apps/gaia/page/Main.tsx') })).toEqual([
      `import-leaves-the-program — system-versions/PlantedValue.ts:1 imports ../gaia/page/Main.tsx: ${leavesReason}`,
    ]);
    expect(plantedSentencesOf({ 'cli/hephaestus/PlantedPart.ts': importing('../../../../packages/design-system/atoms/Button.tsx') })).toEqual([
      `import-leaves-the-program — cli/hephaestus/PlantedPart.ts:1 imports ../../packages/design-system/atoms/Button.tsx: ${leavesReason}`,
    ]);
    const undeclaredReason = 'it names a member of the workspace that package.json does not declare as a workspace:^ dependency';
    expect(plantedSentencesOf({ 'cli/hephaestus/PlantedPart.ts': importing('gaia/page/Main.tsx') })).toEqual([
      `workspace-package-not-declared — cli/hephaestus/PlantedPart.ts:1 imports gaia/page/Main.tsx: ${undeclaredReason}`,
    ]);
    expect(plantedSentencesOf({ 'forge-contracts/constants/PlantedValue.ts': importing('forge') })).toEqual([
      `workspace-package-not-declared — forge-contracts/constants/PlantedValue.ts:1 imports forge: ${undeclaredReason}`,
    ]);
    expect(plantedSentencesOf({ 'system-versions/PlantedValue.ts': importing('gaia/src/Main.ts') })).toEqual([
      `workspace-package-not-declared — system-versions/PlantedValue.ts:1 imports gaia/src/Main.ts: ${undeclaredReason}`,
    ]);
    const importingDeclaredAndOutsidePackages = `${importing('forge-contracts/ForgeSystemVersions')}${importing('marked').replaceAll('planted', 'plantedMarked')}`;
    expect(plantedSentencesOf({ 'cli/hephaestus/PlantedPart.ts': importingDeclaredAndOutsidePackages })).toEqual([]);
  });

  test('the binary importing anything but cli/', () => {
    expect(plantedSentencesOf({ 'agent-progress.ts': importing('./src/shared/Environment.ts') })).toEqual([
      'binary-imports-beyond-cli — agent-progress.ts:1 imports src/shared/Environment.ts: agent-progress.ts imports only cli/',
    ]);
  });

  test('the Talos binary importing anything but its package, another lib package, cli/ and a builtin included, and not its package', () => {
    expect(plantedSentencesOf({ 'talos.ts': importing('./src/lib/claude-code/ClaudeCodeAdapter.ts') })).toEqual([
      'talos-binary-imports-beyond-its-package — talos.ts:1 imports src/lib/claude-code/ClaudeCodeAdapter.ts: talos.ts imports only talos/',
      'vendor-adapter-imported-outside-its-seam — talos.ts:1 imports src/lib/claude-code/ClaudeCodeAdapter.ts: '
        + 'only the agent port\'s seam and its adapters import the vendor\'s adapter',
    ]);
    expect(plantedSentencesOf({ 'talos.ts': importing('./cli/Main.ts') })).toEqual([
      'talos-binary-imports-beyond-its-package — talos.ts:1 imports cli/Main.ts: talos.ts imports only talos/',
    ]);
    expect(plantedSentencesOf({ 'talos.ts': importing('node:fs') })).toEqual([
      'talos-binary-imports-beyond-its-package — talos.ts:1 imports node:fs: talos.ts imports only talos/',
    ]);
    expect(plantedSentencesOf({ 'talos.ts': importing('./talos/Talos.ts') })).toEqual([]);
  });

  test('the Talos program importing above lib and domain, and imported by shipping code or a spec outside its allowlist', () => {
    expect(plantedSentencesOf({ 'talos/PlantedStep.ts': importing('../src/shared/Environment.ts') })).toEqual([
      'layer-imports-upward — talos/PlantedStep.ts:1 imports src/shared/Environment.ts: talos-program reaches only lib, domain, talos-program, not shared',
    ]);
    expect(plantedSentencesOf({ 'talos/PlantedStep.ts': importing('../src/domain/talos/TalosFrames.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/services/hephaestus/PlantedPass.ts': importing('../../../talos/Talos.ts') })).toEqual([
      'layer-imports-upward — src/services/hephaestus/PlantedPass.ts:1 imports talos/Talos.ts: '
        + 'hephaestus-service reaches only lib, domain, shared, adapters, render-service, tracker-service, lifecycle-service, control-service, '
        + 'store-service, hephaestus-service, workspace-package, not talos-program',
    ]);
    expect(plantedSentencesOf({ 'src/services/tracker/Planted.spec.ts': importing('../../../talos/TalosSocketServer.ts') })).toEqual([
      'layer-imports-upward — src/services/tracker/Planted.spec.ts:1 imports talos/TalosSocketServer.ts: '
        + 'tracker-service reaches only lib, domain, shared, adapters, render-service, tracker-service, workspace-package, not talos-program',
    ]);
    expect(plantedSentencesOf({ 'src/services/hephaestus/Planted.spec.ts': importing('../../../talos/TalosSocketServer.ts') })).toEqual([]);
  });

  test('a test-only folder imported by shipped code, by a spec outside its allowlist or with no entry at all, and not by an allowed spec', () => {
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.ts': importing('../testing/ScratchWorkspace.ts') })).toEqual([
      'test-helper-imported-outside-its-allowlist — src/shared/PlantedValue.ts:1 imports src/testing/ScratchWorkspace.ts: '
        + 'src/testing/ is test-only and may be imported by only the specs of src/, talos/, cli/, architecture/ and cli/CommandContext.ts',
    ]);
    expect(plantedSentencesOf({ 'cli/PlantedContext.ts': importing('../src/testing/FakeAgentAdapter.ts') })).toEqual([
      'test-helper-imported-outside-its-allowlist — cli/PlantedContext.ts:1 imports src/testing/FakeAgentAdapter.ts: '
        + 'src/testing/ is test-only and may be imported by only the specs of src/, talos/, cli/, architecture/ and cli/CommandContext.ts',
    ]);
    expect(plantedSentencesOf({ 'cli/CommandContext.ts': `${GRAPH.sourceTextOf('cli/CommandContext.ts')}${importing('../src/testing/ScratchWorkspace.ts')}` }))
      .toEqual([]);
    expect(plantedSentencesOf({ 'src/services/tracker/PlantedStep.spec.ts': importing('../../../cli/testing/CliProcess.ts') })).toEqual([
      'test-helper-imported-outside-its-allowlist — src/services/tracker/PlantedStep.spec.ts:1 imports cli/testing/CliProcess.ts: '
        + 'cli/testing/ is test-only and may be imported by only the specs of cli/',
    ]);
    expect(plantedSentencesOf({
      'src/shared/PlantedValue.spec.ts':      importing('./testing/PlantedFixture.ts'),
      'src/shared/testing/PlantedFixture.ts': 'export const planted = 1;\n',
    })).toEqual([
      'test-helper-imported-outside-its-allowlist — src/shared/PlantedValue.spec.ts:1 imports src/shared/testing/PlantedFixture.ts: '
        + 'src/shared/testing/ is test-only and may be imported by nothing, as it has no allowlist entry',
    ]);
    expect(plantedSentencesOf({ 'src/shared/PlantedValue.spec.ts': importing('../testing/ScratchWorkspace.ts') })).toEqual([]);
  });

  test('the vendor\'s adapter imported outside its seam, by a service, a test helper or any spec outside its package, and not by the seam', () => {
    const vendorSentenceOf = (importerPath: string, targetPath = 'src/lib/claude-code/ClaudeCodeAdapter.ts'): string => 'vendor-adapter-imported-outside-its-seam — '
      + `${importerPath}:1 imports ${targetPath}: only the agent port's seam and its adapters import the vendor's adapter`;
    expect(plantedSentencesOf({ 'src/services/hephaestus/PlantedLaunch.ts': importing('../../lib/claude-code/ClaudeCodeAdapter.ts') }))
      .toEqual([vendorSentenceOf('src/services/hephaestus/PlantedLaunch.ts')]);
    expect(plantedSentencesOf({ 'src/testing/PlantedAdapter.ts': importing('../lib/claude-code/ClaudeCodeAdapter.ts') }))
      .toEqual([vendorSentenceOf('src/testing/PlantedAdapter.ts')]);
    expect(plantedSentencesOf({ 'cli/hephaestus/PlantedRun.spec.ts': importing('../../src/lib/claude-code/ClaudeCodeAdapter.ts') }))
      .toEqual([vendorSentenceOf('cli/hephaestus/PlantedRun.spec.ts')]);
    expect(plantedSentencesOf({ 'cli/hephaestus/PlantedRun.realAgent.spec.ts': importing('../../src/lib/claude-code/ClaudeCodeAdapter.ts') }))
      .toEqual([vendorSentenceOf('cli/hephaestus/PlantedRun.realAgent.spec.ts')]);
    expect(plantedSentencesOf({ 'src/lib/claude-code/PlantedPlan.ts': importing('./ClaudeCodeAdapter.ts') })).toEqual([]);
  });

  test('any file of the vendor\'s adapter imported outside the seam and the adapters fails, and not from the seam or the fake agent', () => {
    const transcriptsPath = 'src/lib/claude-code/ClaudeTranscripts.ts';
    expect(plantedSentencesOf({ 'src/services/hephaestus/Planted.ts': importing('../../lib/claude-code/ClaudeTranscripts.ts') })).toEqual([
      'vendor-adapter-imported-outside-its-seam — src/services/hephaestus/Planted.ts:1 imports '
        + `${transcriptsPath}: only the agent port's seam and its adapters import the vendor's adapter`,
    ]);
    const seamText = `${GRAPH.sourceTextOf(VENDOR_ADAPTER_SEAM)}${importing('../src/lib/claude-code/ClaudeTranscripts.ts').replaceAll('planted', 'plantedTranscripts')}`;
    expect(sentencesAbout(plantedFindingsOf({ [VENDOR_ADAPTER_SEAM]: seamText }), 'vendor-adapter-imported-outside-its-seam')).toEqual([]);
    const fakeAgentPath = 'src/testing/FakeAgentAdapter.ts';
    const fakeAgentText = `${GRAPH.sourceTextOf(fakeAgentPath)}${importing('../lib/claude-code/ClaudeTranscripts.ts').replaceAll('planted', 'plantedTranscripts')}`;
    expect(sentencesAbout(plantedFindingsOf({ [fakeAgentPath]: fakeAgentText }), 'vendor-adapter-imported-outside-its-seam')).toEqual([]);
    expect(plantedSentencesOf({ 'src/testing/fake-agent/PlantedStep.ts': importing('../../lib/claude-code/ClaudeTranscripts.ts') })).toEqual([]);
  });

  test('a lib or domain package importing a package its main module\'s header does not name, and not one it names', () => {
    expect(plantedSentencesOf({ 'src/lib/utils/PlantedUtil.ts': importing('../git/GitProcess.ts') })).toEqual([
      'package-imports-an-undeclared-package — src/lib/utils/PlantedUtil.ts:1 imports src/lib/git/GitProcess.ts: '
        + 'the header of src/lib/utils/\'s main module does not name src/lib/git',
    ]);
    expect(plantedSentencesOf({ 'src/lib/git/utils/PlantedUtil.ts': importing('../../atomic-file/AtomicFile.ts') })).toEqual([]);
    expect(plantedSentencesOf({ 'src/domain/planted/PlantedRule.ts': importing('../../lib/git/GitProcess.ts') })).toEqual([
      'package-imports-an-undeclared-package — src/domain/planted/PlantedRule.ts:1 imports src/lib/git/GitProcess.ts: '
        + 'the header of src/domain/planted/\'s main module does not name src/lib/git',
    ]);
    const declaringHeader = '/** A planted rule that depends on `src/lib/git`. */\n';
    expect(plantedSentencesOf({ 'src/domain/planted/PlantedRule.ts': `${declaringHeader}${importing('../../lib/git/GitProcess.ts')}` })).toEqual([]);
  });

  test('the tracker model importing a builtin or a file outside its folder, and not a spec of it importing the test runner', () => {
    expect(plantedSentencesOf({ 'src/domain/tracker-model/utils/PlantedUtil.ts': importing('node:fs') })).toEqual([
      'tracker-model-reaches-outside-itself — src/domain/tracker-model/utils/PlantedUtil.ts:1 imports node:fs: '
        + 'src/domain/tracker-model/ imports nothing outside its own folder and no builtin',
    ]);
    expect(plantedSentencesOf({ 'src/domain/tracker-model/utils/PlantedUtil.ts': importing('../../../lib/utils/TimeUtil.ts') })).toEqual([
      'tracker-model-reaches-outside-itself — src/domain/tracker-model/utils/PlantedUtil.ts:1 imports src/lib/utils/TimeUtil.ts: '
        + 'src/domain/tracker-model/ imports nothing outside its own folder and no builtin',
    ]);
    expect(plantedSentencesOf({ 'src/domain/tracker-model/utils/PlantedUtil.spec.ts': importing('bun:test') })).toEqual([]);
  });

  test('an import cycle between two files, and between two lib packages through different files', () => {
    expect(plantedSentencesOf({
      'src/shared/utils/PlantedFirst.ts':  importing('./PlantedSecond.ts'),
      'src/shared/utils/PlantedSecond.ts': importing('./PlantedFirst.ts'),
    })).toEqual(['import-cycle — an import cycle loops through src/shared/utils/PlantedFirst.ts → src/shared/utils/PlantedSecond.ts']);
    const libPackageCycle = plantedFindingsOf({
      'src/lib/utils/PlantedFirst.ts': importing('../git/PlantedSecond.ts'),
      'src/lib/git/PlantedSecond.ts':  'export const planted = 1;\n',
      'src/lib/git/PlantedThird.ts':   importing('../utils/PlantedFirst.ts'),
    });
    expect(sentencesAbout(libPackageCycle, 'import-cycle')).toEqual(['an import cycle loops through src/lib/git/ → src/lib/utils/']);
  });

  test('a barrel, in either re-export spelling, and an index file', () => {
    expect(plantedSentencesOf({
      'cli/utils/PlantedBarrel.ts': 'export { planted } from \'./PlantedView.ts\';\nexport * from \'./PlantedView.ts\';\n',
      'cli/utils/PlantedView.ts':   'export const planted = 1;\n',
    })).toEqual([
      'barrel — cli/utils/PlantedBarrel.ts:1 imports cli/utils/PlantedView.ts: a re-export makes one module stand for others',
      'barrel — cli/utils/PlantedBarrel.ts:2 imports cli/utils/PlantedView.ts: a re-export makes one module stand for others',
    ]);
    expect(plantedSentencesOf({ 'src/shared/utils/index.ts': 'export const planted = 1;\n' })).toEqual([
      'barrel — src/shared/utils/index.ts is an index file, which stands for the modules beside it',
    ]);
  });

  test('an allowlist entry or a declared lib dependency nothing uses any more, and a testing folder without an entry', () => {
    const plantedAllowlists: Allowlists = {
      testingFolderImporters:    { ...TESTING_FOLDER_IMPORTERS, 'cli/testing/': ['cli/', 'src/'], 'src/retired/testing/': ['src/'] },
      commandSetReaches:         [...COMMAND_SET_REACHES, { importer: 'cli/adoption/update/UpdateCommand.ts', target: 'cli/hephaestus/Retired.ts' }],
      talosProgramSpecImporters: [...TALOS_PROGRAM_SPEC_IMPORTERS, 'src/services/tracker/'],
    };
    const mainModulePath = 'src/lib/claude-code/ClaudeTranscripts.ts';
    const plantedHeader = GRAPH.sourceTextOf(mainModulePath).replace('depends on `src/lib/agent-launch`', 'depends on `src/lib/gate-confinement`, `src/lib/agent-launch`');
    const plantedGraph = SCANNER.graphWithPlantedFiles({ [mainModulePath]: plantedHeader, 'src/shared/testing/PlantedFixture.ts': 'export const planted = 1;\n' });
    expect(unusedAllowancesOf(plantedGraph, plantedAllowlists)).toEqual([
      'COMMAND_SET_REACHES lets cli/adoption/update/UpdateCommand.ts import cli/hephaestus/Retired.ts, and it does not',
      'TALOS_PROGRAM_SPEC_IMPORTERS lets the specs of src/services/tracker/ import talos/, and none does',
      'TESTING_FOLDER_IMPORTERS lets src/ import cli/testing/, and nothing there does',
      'TESTING_FOLDER_IMPORTERS lets src/ import src/retired/testing/, and nothing there does',
      'TESTING_FOLDER_IMPORTERS lists src/retired/testing/, which holds no file',
      'src/shared/testing/ has no TESTING_FOLDER_IMPORTERS entry',
      'the header of src/lib/claude-code/ names src/lib/gate-confinement, which the package does not import',
    ]);
  });
});

describe('the imports of the tree', () => {
  test('no layer imports upward: each reaches only the layers below it and itself', () => {
    expect(sentencesAbout(FINDINGS, 'layer-imports-upward')).toEqual([]);
  });

  test('no cli/ command folder imports a sibling command\'s folder', () => {
    expect(sentencesAbout(FINDINGS, 'command-imports-a-sibling-command')).toEqual([]);
  });

  test('no cli/ command set imports another set\'s folder but through COMMAND_SET_REACHES', () => {
    expect(sentencesAbout(FINDINGS, 'command-set-imports-another-set')).toEqual([]);
  });

  test('the cli/ root imports no command set but in the command table and test code, or through COMMAND_SET_REACHES', () => {
    expect(sentencesAbout(FINDINGS, 'cli-root-imports-a-set')).toEqual([]);
  });

  test('outside its own folder, every workspace package is imported by its name, never by a file path', () => {
    expect(sentencesAbout(FINDINGS, 'workspace-package-reached-by-path')).toEqual([]);
  });

  test('no import leaves the program and its declared packages by a path, and every workspace package imported by name is declared', () => {
    expect(sentencesAbout(FINDINGS, 'import-leaves-the-program')).toEqual([]);
    expect(sentencesAbout(FINDINGS, 'workspace-package-not-declared')).toEqual([]);
  });

  test('every specifier naming a workspace package is an entry its package.json exports', () => {
    expect(sentencesAbout(FINDINGS, 'workspace-entry-not-exported')).toEqual([]);
  });

  test('agent-progress.ts imports only cli/', () => {
    expect(sentencesAbout(FINDINGS, 'binary-imports-beyond-cli')).toEqual([]);
  });

  test('talos.ts imports only talos/', () => {
    expect(sentencesAbout(FINDINGS, 'talos-binary-imports-beyond-its-package')).toEqual([]);
  });

  test('nothing that ships imports a testing folder, and each testing folder is imported only by the specs its entry names', () => {
    expect(sentencesAbout(FINDINGS, 'test-helper-imported-outside-its-allowlist')).toEqual([]);
  });

  test('only the agent port\'s seam and its adapters import the vendor\'s adapter, and the seam imports ClaudeCodeAdapter.ts', () => {
    expect(sentencesAbout(FINDINGS, 'vendor-adapter-imported-outside-its-seam')).toEqual([]);
    expect(GRAPH.edges.some((edge) => edge.fromPath === VENDOR_ADAPTER_SEAM && edge.target.kind === 'repository-file' && edge.target.path === VENDOR_ADAPTER_PATH))
      .toBe(true);
  });

  test('a package of lib or domain imports only the packages its main module\'s header names', () => {
    expect(sentencesAbout(FINDINGS, 'package-imports-an-undeclared-package')).toEqual([]);
  });

  test('the tracker model imports nothing outside its own folder and no builtin', () => {
    expect(sentencesAbout(FINDINGS, 'tracker-model-reaches-outside-itself')).toEqual([]);
  });

  test('no import cycle exists, between files or between packages of lib and domain', () => {
    expect(sentencesAbout(FINDINGS, 'import-cycle')).toEqual([]);
  });

  test('no file re-exports another, and no index file exists', () => {
    expect(sentencesAbout(FINDINGS, 'barrel')).toEqual([]);
  });
});
