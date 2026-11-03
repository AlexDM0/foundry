/**
 * The split of the Tests rules in the root `CLAUDE.md`: a default spec names no real process, git or socket call, and each that still
 * does is an allowlist entry for the ticket that moves it; a real-system spec is a `*.integration.spec.ts` file that `BOUNDARY_SPECS`
 * lists. A call is found in the syntax tree of the spec itself, so a sentence or a planted string is not a use, and a helper counts by
 * the export a spec imports. A production module a spec calls in-process is not followed: nearly every command reaches git that way.
 * The scan first proves it saw the specs and the shipping call sites, and each form is planted to prove the guard names it.
 * Real git is held tighter: only the git boundary specs run it. A spec helper counts by each export that reaches git, followed through
 * its siblings and the helpers it imports, so a new git-running helper needs no list entry. A spec reaches a helper by a named import,
 * by a member of a namespace import, or by a default import.
 */
import { existsSync }  from 'node:fs';
import { join, posix } from 'node:path';

import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import {
  BOUNDARY_SPECS,
  boundaryIsTouched,
  INTEGRATION_SPEC_SUFFIX,
  integrationSpecsTouchedBy
} from './testing/BoundarySpecs.ts';
import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import type { RepositorySource }        from './testing/RepositorySources.ts';
import { repositoryTypeScriptSources }  from './testing/RepositorySources.ts';

/** Each file here still makes a real call in the default suite, until the ticket named moves it. */
const REAL_SYSTEM_ALLOWLIST: Readonly<Record<string, string>> = {};

const BUN_REAL_CALLS = new Set(['$', 'spawn', 'spawnSync', 'serve', 'connect', 'listen', 'udpSocket']);
const REAL_MODULE_PATTERN = /^(?:node:)?(?:child_process|net|http|https|http2|dgram|tls|dns)$/;
const REAL_HELPER_EXPORTS = new Set([
  'addWorktree',
  'childIgnoringStop',
  'commitFile',
  'connectToWatcher',
  'createAirlocksHarness',
  'createScratchGitRepository',
  'createWatcherJob',
  'currentBranchOf',
  'gitOutputIn',
  'jsonPrintedByAChildProcess',
  'parentOfDetachedChild',
  'parentOfSleepingChild',
  'PlantedWatcher',
  'readTheBridgeHeadless',
  'runAgentProgress',
  'runAgentProgressBesideRecordedGit',
  'runRenderedCommandLine',
  'sleepingProcess',
  'startAgentProgress',
]);
const MINIMUM_SPEC_FILE_COUNT = 100;
const DOM_SPEC_SUFFIX = '.dom.tsx';
const SHIPPING_REAL_CALL_FORM_COUNT_FLOOR = 10;

function propertyCallFormOf(node: ts.PropertyAccessExpression): string | null {
  if (!ts.isIdentifier(node.expression)) return null;
  if (node.expression.text === 'Bun' && BUN_REAL_CALLS.has(node.name.text)) return `Bun.${node.name.text}`;
  return node.expression.text === 'GitProcess' && node.name.text === 'run' ? 'GitProcess.run' : null;
}

function importsOnlyTypes({ importClause }: ts.ImportDeclaration): boolean {
  if (importClause === undefined) return false;
  if (importClause.isTypeOnly) return true;
  const { name, namedBindings } = importClause;
  return name === undefined && namedBindings !== undefined && ts.isNamedImports(namedBindings) && namedBindings.elements.every((element) => element.isTypeOnly);
}

function importFormsOf(node: ts.ImportDeclaration): string[] {
  if (!ts.isStringLiteral(node.moduleSpecifier) || importsOnlyTypes(node)) return [];
  const moduleForms = REAL_MODULE_PATTERN.test(node.moduleSpecifier.text) ? [node.moduleSpecifier.text] : [];
  const namedBindings = node.importClause?.namedBindings;
  const helperForms = namedBindings !== undefined && ts.isNamedImports(namedBindings)
    ? namedBindings.elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text)
      .filter((name) => REAL_HELPER_EXPORTS.has(name) || (name === '$' && node.moduleSpecifier.getText().includes('bun')))
    : [];
  return [...moduleForms, ...helperForms];
}

function loadedModuleFormOf(node: ts.CallExpression): string | null {
  const isLoad = node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require');
  const [moduleName] = node.arguments;
  return isLoad && moduleName !== undefined && ts.isStringLiteralLike(moduleName) && REAL_MODULE_PATTERN.test(moduleName.text) ? moduleName.text : null;
}

function nodeFormsOf(node: ts.Node): string[] {
  if (ts.isPropertyAccessExpression(node)) return [propertyCallFormOf(node)].filter((form) => form !== null);
  if (ts.isImportDeclaration(node)) return importFormsOf(node);
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'WebSocket') return ['WebSocket'];
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') return ['fetch'];
    if (node.expression.getText() === 'WatcherFleet.spawnWatcher') return ['WatcherFleet.spawnWatcher'];
    return [loadedModuleFormOf(node)].filter((form) => form !== null);
  }
  return [];
}

function formsIn(source: RepositorySource, formsOfNode: (node: ts.Node) => string[]): string[] {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const forms = new Set<string>();
  const visit = (node: ts.Node): void => {
    for (const form of formsOfNode(node)) forms.add(form);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...forms].sort();
}

function realCallFormsIn(source: RepositorySource): string[] {
  return formsIn(source, nodeFormsOf);
}

/** A wait on the real clock makes a spec real-system too, but only there: shipping code sleeps, and `src/SpecSleeps.spec.ts` holds the default specs. */
function realSystemFormsOfIntegrationSpec(source: RepositorySource): string[] {
  return formsIn(source, (node) => {
    const isSleep = ts.isPropertyAccessExpression(node) && node.getText() === 'Bun.sleep';
    return isSleep ? ['Bun.sleep'] : nodeFormsOf(node);
  });
}

function isIntegrationSpec(path: string): boolean {
  return path.endsWith(INTEGRATION_SPEC_SUFFIX);
}

function isDefaultSpec(path: string): boolean {
  return (path.endsWith('.spec.ts') || path.endsWith(DOM_SPEC_SUFFIX)) && !isIntegrationSpec(path);
}

function isShippingFile(path: string): boolean {
  return !path.endsWith('.spec.ts') && !path.endsWith(DOM_SPEC_SUFFIX) && !path.split('/').includes('testing') && !path.startsWith('.');
}

function suiteViolationsOf(sources: readonly RepositorySource[], allowlist: Readonly<Record<string, string>>): string[] {
  const allowed = (path: string): boolean => Object.hasOwn(allowlist, path);
  const defaultSpecs = sources.filter(({ path }) => isDefaultSpec(path));
  const callingSpecs = defaultSpecs.filter((source) => realCallFormsIn(source).length > 0);
  const callingPaths = new Set(callingSpecs.map(({ path }) => path));
  return [
    ...callingSpecs.filter(({ path }) => !allowed(path))
      .map((source) => `${source.path} is a default spec calling ${realCallFormsIn(source).join(', ')}`),
    ...Object.keys(allowlist).filter((path) => !callingPaths.has(path)).map((path) => `the allowlist names ${path}, which makes no real call`),
    ...sources.filter(({ path }) => isIntegrationSpec(path)).filter((source) => realSystemFormsOfIntegrationSpec(source).length === 0)
      .map((source) => `${source.path} is an integration spec making no real call`),
  ];
}

function boundaryListViolationsOf(sources: readonly RepositorySource[], listedPathExists: (path: string) => boolean): string[] {
  const listedSpecs = new Set(BOUNDARY_SPECS.flatMap(({ specs }) => specs));
  const integrationSpecs = sources.map(({ path }) => path).filter(isIntegrationSpec);
  const boundaries = BOUNDARY_SPECS.map(({ boundary }) => boundary);
  return [
    ...integrationSpecs.filter((path) => !listedSpecs.has(path)).map((path) => `${path} is listed under no boundary`),
    ...[...listedSpecs].filter((path) => !integrationSpecs.includes(path)).map((path) => `BOUNDARY_SPECS names ${path}, which does not exist`),
    ...boundaries.filter((path) => !listedPathExists(path)).map((path) => `BOUNDARY_SPECS lists the boundary ${path}, which does not exist`),
    ...sources.filter(({ path }) => isShippingFile(path) && !boundaries.some((boundary) => boundaryIsTouched(boundary, path)))
      .filter((source) => realCallFormsIn(source).some((form) => form !== 'GitProcess.run'))
      .map((source) => `${source.path} makes a real call and is no listed boundary`),
  ];
}

/** Each spec here still runs real git outside the git boundary specs, until the ticket named moves it to recorded git answers. */
const REAL_GIT_ALLOWLIST: Readonly<Record<string, string>> = {
  'bridge/HeadlessBridge.integration.spec.ts':                             '#680',
  'cli/RegisterWrittenTracker.integration.spec.ts':                        '#680',
  'cli/adoption/init/InitCommand.integration.spec.ts':                     '#680',
  'cli/adoption/update/UpdateCommand.integration.spec.ts':                 '#680',
  'cli/overseer/OverseerApi.integration.spec.ts':                          '#681',
  'cli/overseer/OverseerBuildJob.integration.spec.ts':                     '#681',
  'cli/overseer/OverseerCommand.integration.spec.ts':                      '#681',
  'cli/overseer/OverseerDrivePass.integration.spec.ts':                    '#681',
  'cli/overseer/OverseerWording.instructions.integration.spec.ts':         '#681',
  'cli/overseer/routes/BoardStateReader.integration.spec.ts':              '#681',
  'src/ComponentNames.integration.spec.ts':                                '#633',
  'src/LineEndingPolicy.integration.spec.ts':                              '#633',
  'src/services/control/WorktreeRepair.integration.spec.ts':               '#633',
  'src/services/lifecycle/Customs.integration.spec.ts':                    '#633',
  'src/services/lifecycle/Customs.mergeCheck.integration.spec.ts':         '#633',
  'src/services/lifecycle/Customs.onboarder.integration.spec.ts':          '#633',
  'src/services/lifecycle/Customs.provenance.integration.spec.ts':         '#633',
  'src/services/lifecycle/GateRun.integration.spec.ts':                    '#633',
  'src/services/lifecycle/Landing.integration.spec.ts':                    '#633',
  'src/services/lifecycle/ProposalTwiceRun.integration.spec.ts':           '#633',
  'src/services/lifecycle/ReviewOutcome.integration.spec.ts':              '#633',
  'src/services/overseer/Airlocks.airlockAgents.integration.spec.ts':      '#633',
  'src/services/overseer/Airlocks.integration.spec.ts':                    '#633',
  'src/services/overseer/CrashMatrix.integration.spec.ts':                 '#633',
  'src/services/overseer/GroupWorktrees.integration.spec.ts':              '#633',
  'src/services/overseer/JobLaunch.gating.integration.spec.ts':            '#633',
  'src/services/overseer/JobLaunch.retry.integration.spec.ts':             '#633',
  'src/services/overseer/JobLaunch.targetCatchUp.integration.spec.ts':     '#633',
  'src/services/overseer/Onboarding.leftoverSnapshot.integration.spec.ts': '#633',
  'src/services/overseer/WorkerProfiles.resolver.integration.spec.ts':     '#633',
  'src/testing/CheckRecordingStamps.integration.spec.ts':                  '#633',
  'src/testing/TestRunLeakCheck.integration.spec.ts':                      '#633',
};

/** Test tooling that is no spec helper and may run git: the stamp check reads the git version, and the tool guard asks if git is there. */
const GIT_RUNNING_TOOLING = new Set(['src/testing/InstalledSystemVersion.ts', 'src/testing/ToolGuard.ts']);
const GIT_PROCESS_MOCK_CALLS = ['useRecordedGit('];
const GIT_BOUNDARY_SPEC_PATTERN = /^src\/lib\/git\/[^/]+\.integration\.spec\.ts$/;
const PROCESS_START_NAMES = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']);
const SHELL_TAG_TEXTS = new Set(['$', 'Bun.$']);
const GIT_PROGRAM = 'git';
const NAMED_GIT_HELPERS = [
  'addWorktree',
  'commitFile',
  'commitResolution',
  'createAirlocksHarness',
  'createInitializedScratchRepository',
  'createScratchGitRepository',
  'gitOutputIn',
  'heldFileGit',
];

function isGitBoundarySpec(path: string): boolean {
  return GIT_BOUNDARY_SPEC_PATTERN.test(path);
}

function isSpecHelper(path: string): boolean {
  return !path.endsWith('.spec.ts') && !path.endsWith(DOM_SPEC_SUFFIX) && path.split('/').includes('testing') && !GIT_RUNNING_TOOLING.has(path);
}

function isGitLiteral(node: ts.Node | undefined): boolean {
  return node !== undefined && ts.isStringLiteralLike(node) && node.text === GIT_PROGRAM;
}

/** The program a process start names first: a string, the head of an argument array, or the head of a `cmd` array. */
function startsGit(firstArgument: ts.Expression | undefined): boolean {
  if (firstArgument === undefined) return false;
  if (ts.isArrayLiteralExpression(firstArgument)) return isGitLiteral(firstArgument.elements[0]);
  if (!ts.isObjectLiteralExpression(firstArgument)) return isGitLiteral(firstArgument);
  return firstArgument.properties.some((property) => ts.isPropertyAssignment(property) && property.name.getText() === 'cmd'
    && ts.isArrayLiteralExpression(property.initializer) && isGitLiteral(property.initializer.elements[0]));
}

function calledNameOf(callee: ts.Expression): string | null {
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

function gitFormOf(node: ts.Node): string | null {
  if (ts.isTaggedTemplateExpression(node) && SHELL_TAG_TEXTS.has(node.tag.getText())) {
    return node.template.getText().slice(1).startsWith(`${GIT_PROGRAM} `) ? `${node.tag.getText()}\`git` : null;
  }
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'GitProcess') return `GitProcess.${callee.name.text}`;
  const calledName = calledNameOf(callee);
  return calledName !== null && PROCESS_START_NAMES.has(calledName) && startsGit(node.arguments[0]) ? `${callee.getText()}(git)` : null;
}

function gitFormsIn(node: ts.Node): string[] {
  const forms = new Set<string>();
  const visit = (child: ts.Node): void => {
    const form = gitFormOf(child);
    if (form !== null) forms.add(form);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...forms];
}

function identifiersIn(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

/** Each value a module imports, by its local name, mapped to the name its module exports. */
function valueImportsOf(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || importsOnlyTypes(statement)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements.filter(({ isTypeOnly }) => !isTypeOnly)) imports.set(element.name.text, (element.propertyName ?? element.name).text);
  }
  return imports;
}

function valueImportDeclarationsOf(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
  return sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement)).filter((statement) => !importsOnlyTypes(statement));
}

/** The members a module reaches through a namespace import, `Name.member`, each the name its module exports. */
function namespaceMembersOf(sourceFile: ts.SourceFile): string[] {
  const namespaces = new Set(valueImportDeclarationsOf(sourceFile).flatMap(({ importClause }) => {
    const namedBindings = importClause?.namedBindings;
    return namedBindings !== undefined && ts.isNamespaceImport(namedBindings) ? [namedBindings.name.text] : [];
  }));
  const members = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.expression) && namespaces.has(child.expression.text)) members.add(child.name.text);
    ts.forEachChild(child, visit);
  };
  visit(sourceFile);
  return [...members];
}

/** The repository paths of the relative modules a module takes a default import from. */
function defaultImportPathsOf(sourceFile: ts.SourceFile, importerPath: string): string[] {
  return valueImportDeclarationsOf(sourceFile).flatMap(({ importClause, moduleSpecifier }) => {
    const isRelativeDefault = importClause?.name !== undefined && ts.isStringLiteral(moduleSpecifier) && moduleSpecifier.text.startsWith('.');
    return isRelativeDefault ? [posix.normalize(posix.join(posix.dirname(importerPath), moduleSpecifier.text))] : [];
  });
}

/** The name of the declaration a module exports as its default: `export default function name`, or `export default name;`. */
function defaultExportNameOf(sourceFile: ts.SourceFile): string | null {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals !== true && ts.isIdentifier(statement.expression)) return statement.expression.text;
    const isNamedDeclaration = (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined;
    const isDefault = ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword);
    if (isNamedDeclaration && isDefault) return statement.name.text;
  }
  return null;
}

function isGitProcessForm(form: string): boolean {
  return form.startsWith('GitProcess.');
}

interface HelperDeclaration {
  readonly path:       string;
  readonly name:       string;
  readonly isExported: boolean;
  readonly gitForms:   readonly string[];
  readonly references: ReadonlySet<string>;
  readonly imports:    ReadonlyMap<string, string>;
  readonly siblings:   ReadonlySet<string>;
}

function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

function helperDeclarationsOf(source: RepositorySource): HelperDeclaration[] {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const imports = valueImportsOf(sourceFile);
  const named = sourceFile.statements.flatMap((statement): { name: string; node: ts.Node; statement: ts.Statement }[] => {
    const isNamedDeclaration = (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined;
    if (isNamedDeclaration) return [{ name: statement.name.text, node: statement, statement }];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name))
      .map((declaration) => ({ name: declaration.name.getText(), node: declaration, statement }));
  });
  const siblings = new Set(named.map(({ name }) => name));
  return named.map(({ name, node, statement }) => ({
    path:       source.path,
    name,
    isExported: isExported(statement),
    gitForms:   gitFormsIn(node),
    references: identifiersIn(node),
    imports,
    siblings,
  }));
}

/**
 * The exports of the spec helpers that run git, themselves or through a sibling or another helper, found until nothing is added.
 * `countsAsGit` leaves out the `GitProcess` forms for a spec that mocks `GitProcess`.
 */
function gitRunningHelperExportsOf(sources: readonly RepositorySource[], countsAsGit: (form: string) => boolean = () => true): GitRunningHelpers {
  const helperSources = sources.filter(({ path }) => isSpecHelper(path));
  const declarations = helperSources.flatMap(helperDeclarationsOf);
  const gitRunning = new Set(declarations.filter(({ gitForms }) => gitForms.some(countsAsGit)));
  const gitExports = new Set([...gitRunning].filter(({ isExported: exported }) => exported).map(({ name }) => name));
  const runsGitThroughAnother = (declaration: HelperDeclaration): boolean => [...declaration.references].some((reference) => {
    const imported = declaration.imports.get(reference);
    if (imported !== undefined) return gitExports.has(imported);
    return declaration.siblings.has(reference) && [...gitRunning].some((other) => other.siblings === declaration.siblings && other.name === reference);
  });
  for (let added = true; added;) {
    const newlyRunning = declarations.filter((declaration) => !gitRunning.has(declaration) && runsGitThroughAnother(declaration));
    for (const declaration of newlyRunning) {
      gitRunning.add(declaration);
      if (declaration.isExported) gitExports.add(declaration.name);
    }
    added = newlyRunning.length > 0;
  }
  const gitRunningDefaults = new Map<string, string>();
  for (const source of helperSources) {
    const defaultName = defaultExportNameOf(ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true));
    const runsGit = [...gitRunning].some((declaration) => declaration.path === source.path && declaration.name === defaultName);
    if (defaultName !== null && runsGit) gitRunningDefaults.set(source.path.replace(/\.tsx?$/, ''), defaultName);
  }
  return { namedExports: gitExports, defaultsByPath: gitRunningDefaults };
}

/** The named exports of the spec helpers that run git, and each helper whose default export does, by its path without the extension. */
interface GitRunningHelpers {
  readonly namedExports:   ReadonlySet<string>;
  readonly defaultsByPath: ReadonlyMap<string, string>;
}

interface GitHelperExports {
  readonly byAnyRoute:           GitRunningHelpers;
  readonly besideAMockedProcess: GitRunningHelpers;
}

function gitHelperExportsOf(sources: readonly RepositorySource[]): GitHelperExports {
  return {
    byAnyRoute:           gitRunningHelperExportsOf(sources),
    besideAMockedProcess: gitRunningHelperExportsOf(sources, (form) => !isGitProcessForm(form)),
  };
}

/** A spec that calls `useRecordedGit` has `GitProcess` mocked, so only a git process started by other means is real there. */
function realGitFormsOfSpec(source: RepositorySource, gitHelperExports: GitHelperExports): string[] {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const mocksGitProcess = GIT_PROCESS_MOCK_CALLS.some((mockCall) => source.text.includes(mockCall));
  const helpers = mocksGitProcess ? gitHelperExports.besideAMockedProcess : gitHelperExports.byAnyRoute;
  const namedForms = [...valueImportsOf(sourceFile).values(), ...namespaceMembersOf(sourceFile)].filter((imported) => helpers.namedExports.has(imported));
  const defaultForms = defaultImportPathsOf(sourceFile, source.path).flatMap((path) => {
    const defaultName = helpers.defaultsByPath.get(path.replace(/\.tsx?$/, ''));
    return defaultName === undefined ? [] : [defaultName];
  });
  const helperForms = [...namedForms, ...defaultForms];
  const ownForms = gitFormsIn(sourceFile).filter((form) => !mocksGitProcess || !isGitProcessForm(form));
  return [...new Set([...ownForms, ...helperForms])].sort();
}

function realGitViolationsOf(
  sources: readonly RepositorySource[],
  allowlist: Readonly<Record<string, string>>,
  gitHelperExports: GitHelperExports = gitHelperExportsOf(sources),
): string[] {
  const specs = sources.filter(({ path }) => (path.endsWith('.spec.ts') || path.endsWith(DOM_SPEC_SUFFIX)) && !isGitBoundarySpec(path));
  const gitRunningSpecs = specs.map((source) => ({ path: source.path, forms: realGitFormsOfSpec(source, gitHelperExports) })).filter(({ forms }) => forms.length > 0);
  const gitRunningPaths = new Set(gitRunningSpecs.map(({ path }) => path));
  return [
    ...gitRunningSpecs.filter(({ path }) => !Object.hasOwn(allowlist, path))
      .map(({ path, forms }) => `${path} runs real git outside the git boundary specs through ${forms.join(', ')}`),
    ...Object.keys(allowlist).filter((path) => !gitRunningPaths.has(path)).map((path) => `the real git allowlist names ${path}, which runs no real git`),
  ];
}

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();
const SOURCES = repositoryTypeScriptSources(REPOSITORY_ROOT);

describe('the scan itself', () => {
  test('it sees the specs of both suites and the shipping call sites', () => {
    expect(SOURCES.filter(({ path }) => isDefaultSpec(path)).length).toBeGreaterThan(MINIMUM_SPEC_FILE_COUNT);
    expect(SOURCES.filter(({ path }) => isIntegrationSpec(path)).length).toBeGreaterThan(Object.keys(REAL_SYSTEM_ALLOWLIST).length);
    const shippingCallers = SOURCES.filter(({ path }) => isShippingFile(path)).filter((source) => realCallFormsIn(source).length > 0);
    expect(shippingCallers.length).toBeGreaterThan(SHIPPING_REAL_CALL_FORM_COUNT_FLOOR);
    expect(shippingCallers.map(({ path }) => path)).toContain('src/lib/git/GitProcess.ts');
  });
});

describe('git runs only in the git boundary specs', () => {
  const gitHelperExports = gitHelperExportsOf(SOURCES);

  test('the scan finds every named helper that runs git', () => {
    expect([...gitHelperExports.byAnyRoute.namedExports]).toEqual(expect.arrayContaining(NAMED_GIT_HELPERS));
  });

  test('no spec outside the git boundary specs and the allowlist runs real git, and every entry still does', () => {
    expect(realGitViolationsOf(SOURCES, REAL_GIT_ALLOWLIST, gitHelperExports)).toEqual([]);
  });

  const plantedPath = 'cli/Example.spec.ts';

  test.each([
    ['`GitProcess`', 'GitProcess.run(directory, [\'status\']);', 'GitProcess.run'],
    ['`spawnSync(\'git\'`', 'spawnSync(\'git\', [\'status\']);', 'spawnSync(git)'],
    ['`Bun.spawn([\'git\'`', 'Bun.spawn([\'git\', \'status\']);', 'Bun.spawn(git)'],
    ['a `cmd` array', 'Bun.spawnSync({ cmd: [\'git\', \'status\'] });', 'Bun.spawnSync(git)'],
    ['the Bun shell', 'await $`git status`;', '$`git'],
    ...NAMED_GIT_HELPERS.map((helper) => [`the helper \`${helper}\``, `import { ${helper} as renamed } from './testing/Helper.ts';`, helper] as const),
  ])('a planted spec running git through %s is named', (_form, text, form) => {
    expect(realGitViolationsOf([{ path: plantedPath, text }], {}, gitHelperExports))
      .toEqual([`${plantedPath} runs real git outside the git boundary specs through ${form}`]);
  });

  test('a planted helper that runs git through another helper is named in the spec that imports it', () => {
    const helper = {
      path: 'cli/testing/PlantedHelper.ts',
      text: [
        'import { gitOutputIn } from \'../../src/testing/ScratchWorkspace.ts\';',
        'function headOf(directory: string): string { return gitOutputIn(directory, [\'rev-parse\', \'HEAD\']); }',
        'export function plantedRepository(directory: string): string { return headOf(directory); }',
        'export function plantedName(): string { return \'example\'; }',
      ].join('\n'),
    };
    const helperSources = [...SOURCES.filter(({ path }) => isSpecHelper(path)), helper];
    const importing = { path: plantedPath, text: 'import { plantedName, plantedRepository } from \'./testing/PlantedHelper.ts\';\n' };
    expect(realGitViolationsOf([...helperSources, importing], {})).toEqual([`${plantedPath} runs real git outside the git boundary specs through plantedRepository`]);
    expect(realGitViolationsOf([...helperSources, { path: plantedPath, text: 'import { plantedName } from \'./testing/PlantedHelper.ts\';\n' }], {})).toEqual([]);
  });

  test('a planted spec running git through a namespace import of a helper is named, and one reaching only a member that runs no git is not', () => {
    const namespaceImport = 'import * as Workspace from \'./testing/ScratchWorkspace.ts\';\n';
    expect(realGitViolationsOf([{ path: plantedPath, text: `${namespaceImport}Workspace.gitOutputIn(directory, ['status']);\n` }], {}, gitHelperExports))
      .toEqual([`${plantedPath} runs real git outside the git boundary specs through gitOutputIn`]);
    expect(realGitViolationsOf([{ path: plantedPath, text: `${namespaceImport}Workspace.createScratchDirectory('example');\n` }], {}, gitHelperExports)).toEqual([]);
  });

  test.each([
    ['`export default function`', 'export default function plantedGit(directory: string): string { return gitOutputIn(directory, [\'status\']); }'],
    ['`export default name;`', 'function plantedGit(directory: string): string { return gitOutputIn(directory, [\'status\']); }\nexport default plantedGit;'],
  ])('a planted spec running git through a default import of a helper declared with %s is named', (_form, declaration) => {
    const helper = { path: 'cli/testing/PlantedDefault.ts', text: `import { gitOutputIn } from '../../src/testing/ScratchWorkspace.ts';\n${declaration}\n` };
    const helperSources = [...SOURCES.filter(({ path }) => isSpecHelper(path)), helper];
    const importing = { path: plantedPath, text: 'import runGit from \'./testing/PlantedDefault.ts\';\nrunGit(directory);\n' };
    expect(realGitViolationsOf([...helperSources, importing], {})).toEqual([`${plantedPath} runs real git outside the git boundary specs through plantedGit`]);
    const quietHelper = { path: helper.path, text: 'export default function plantedName(): string { return \'example\'; }\n' };
    expect(realGitViolationsOf([...SOURCES.filter(({ path }) => isSpecHelper(path)), quietHelper, importing], {})).toEqual([]);
  });

  test('a planted spec passes on the allowlist and not off it', () => {
    const planted = { path: plantedPath, text: 'GitProcess.run(directory, [\'status\']);\n' };
    expect(realGitViolationsOf([planted], { [plantedPath]: '#631' }, gitHelperExports)).toEqual([]);
    expect(realGitViolationsOf([planted], {}, gitHelperExports)).toHaveLength(1);
  });

  test('an allowlist entry that runs no real git is named, and so is one whose file is gone', () => {
    expect(realGitViolationsOf([{ path: plantedPath, text: 'export {};\n' }], { [plantedPath]: '#631', 'cli/Gone.spec.ts': '#631' }, gitHelperExports)).toEqual([
      `the real git allowlist names ${plantedPath}, which runs no real git`,
      'the real git allowlist names cli/Gone.spec.ts, which runs no real git',
    ]);
  });

  test('the git boundary specs, the tooling, a sentence and a git process found by name pass', () => {
    expect(realGitViolationsOf([
      { path: 'src/lib/git/Example.integration.spec.ts', text: 'Bun.spawnSync([\'git\', \'status\']);\n' },
      { path: 'src/testing/ToolGuard.ts', text: 'export function gitIsThere(): boolean { return Bun.spawnSync([\'git\', \'--version\']).success; }\n' },
      { path: plantedPath, text: 'import { gitIsThere } from \'./testing/ToolGuard.ts\';\n// spawnSync(\'git\')\nconst line = \'git status\';\nBun.which(\'git\');\n' },
    ], {})).toEqual([]);
  });

  test.each(GIT_PROCESS_MOCK_CALLS)('a spec that mocks `GitProcess` with %s) runs no real git through it, and does through a process it starts itself', (mockCall) => {
    const mockingText = `${mockCall});\nGitProcess.run(directory, ['status']);\nimport { heldFileGit } from './testing/HeldFileGit.ts';\n`;
    expect(realGitViolationsOf([{ path: plantedPath, text: mockingText }], {}, gitHelperExports)).toEqual([]);
    expect(realGitViolationsOf([{ path: plantedPath, text: `${mockCall});\nimport { gitOutputIn } from './testing/ScratchWorkspace.ts';\n` }], {}, gitHelperExports))
      .toEqual([`${plantedPath} runs real git outside the git boundary specs through gitOutputIn`]);
  });

  test('a spec without a mock of `GitProcess` runs real git through a helper that calls it', () => {
    expect(realGitViolationsOf([{ path: plantedPath, text: 'import { heldFileGit } from \'./testing/HeldFileGit.ts\';\n' }], {}, gitHelperExports))
      .toEqual([`${plantedPath} runs real git outside the git boundary specs through heldFileGit`]);
  });
});

describe('the suites of the tree', () => {
  test('no default spec outside the allowlist calls the real system, and every entry still does', () => {
    expect(suiteViolationsOf(SOURCES, REAL_SYSTEM_ALLOWLIST)).toEqual([]);
  });

  test('every real-system spec is listed under a boundary, and every shipping call site is a boundary', () => {
    expect(boundaryListViolationsOf(SOURCES, (path) => existsSync(join(REPOSITORY_ROOT, path)))).toEqual([]);
  });
});

describe('a planted spec is named', () => {
  test.each([
    ['`Bun.spawn`', 'Bun.spawn([\'true\']);', 'Bun.spawn'],
    ['`Bun.spawnSync`', 'Bun.spawnSync([\'true\']);', 'Bun.spawnSync'],
    ['`Bun.serve`', 'Bun.serve({ fetch: handler });', 'Bun.serve'],
    ['`Bun.connect`', 'Bun.connect(options);', 'Bun.connect'],
    ['`Bun.listen`', 'Bun.listen(options);', 'Bun.listen'],
    ['`Bun.udpSocket`', 'Bun.udpSocket(options);', 'Bun.udpSocket'],
    ['the Bun shell as a tag', 'await Bun.$`git status`;', 'Bun.$'],
    ['`fetch`', 'await fetch(address);', 'fetch'],
    ['a WebSocket', 'new WebSocket(address);', 'WebSocket'],
    ['`GitProcess.run`', 'GitProcess.run(directory, [\'status\']);', 'GitProcess.run'],
    ['a child process import', 'import { spawn } from \'node:child_process\';', 'node:child_process'],
    ['an unprefixed import', 'import { spawn } from \'child_process\';', 'child_process'],
    ['a socket import', 'import { createServer } from \'node:net\';', 'node:net'],
    ['a socket import beside an inline type', 'import { createServer, type Socket } from \'node:net\';', 'node:net'],
    ['an http import', 'import http from \'node:http\';', 'node:http'],
    ['a dynamic import', 'await import(\'node:child_process\');', 'node:child_process'],
    ['a `require`', 'require(\'node:net\');', 'node:net'],
    ['the Bun shell', 'import { $ } from \'bun\';', '$'],
    ['a helper starting the binary', 'import { runAgentProgress } from \'./testing/CliProcess.ts\';', 'runAgentProgress'],
    ['a helper running git', 'import { gitOutputIn as git } from \'./testing/ScratchWorkspace.ts\';', 'gitOutputIn'],
    ['a helper starting a child', 'import { jsonPrintedByAChildProcess } from \'./testing/JsonPrintedByAChildProcess.ts\';', 'jsonPrintedByAChildProcess'],
    ['a real Watcher start', 'WatcherFleet.spawnWatcher(ports, options);', 'WatcherFleet.spawnWatcher'],
  ])('%s', (_form, text, form) => {
    const planted = { path: 'cli/Example.spec.ts', text };
    expect(suiteViolationsOf([planted], {})).toEqual([`cli/Example.spec.ts is a default spec calling ${form}`]);
  });

  test('in a DOM spec too', () => {
    expect(suiteViolationsOf([{ path: 'bridge/Example.dom.tsx', text: 'await fetch(address);' }], {})).toEqual(['bridge/Example.dom.tsx is a default spec calling fetch']);
  });

  test('a planted spec passes on the allowlist and not off it', () => {
    const planted = { path: 'cli/Example.spec.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(suiteViolationsOf([planted], { [planted.path]: '#571' })).toEqual([]);
    expect(suiteViolationsOf([planted], {})).toEqual(['cli/Example.spec.ts is a default spec calling Bun.spawn']);
  });
});

describe('what the guard leaves alone', () => {
  test('a sentence, a string, a type-only import, a stub\'s name and a shipping module pass', () => {
    expect(suiteViolationsOf([
      {
        path: 'cli/Words.spec.ts',
        text: [
          '// Bun.spawn',
          'const line = \'await fetch(address)\';',
          'import type { Socket } from \'node:net\';',
          'import { type Server } from \'node:net\';',
          'const fetchOf = stub;',
          'fetchOf();',
        ].join('\n'),
      },
      { path: 'cli/Shipping.ts', text: 'Bun.spawn([\'true\']);\n' },
    ], {})).toEqual([]);
  });

  test('a real call in an integration spec passes', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.integration.spec.ts', text: 'Bun.spawn([\'true\']);\n' }], {})).toEqual([]);
  });

  test('a wait on the real clock makes an integration spec real, and is no real call in a default spec', () => {
    // A reference rather than a call, so that `src/SpecSleeps.spec.ts` finds no fixed wait in this file.
    expect(suiteViolationsOf([
      { path: 'cli/Example.integration.spec.ts', text: 'const waitOnTheClock = Bun.sleep;\n' },
      { path: 'cli/Example.spec.ts', text: 'const waitOnTheClock = Bun.sleep;\n' },
    ], {})).toEqual([]);
  });

  test('a stand-in Watcher start passes in a default spec', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.spec.ts', text: 'world.processStarts.spawnWatcher(ports, options);\n' }], {})).toEqual([]);
  });
});

describe('the lists stay exact both ways', () => {
  test('an allowlist entry that makes no real call is named', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.spec.ts', text: 'export {};\n' }], { 'cli/Example.spec.ts': '#571' }))
      .toEqual(['the allowlist names cli/Example.spec.ts, which makes no real call']);
  });

  test('an allowlist entry whose file is gone is named', () => {
    expect(suiteViolationsOf([], { 'cli/Gone.spec.ts': '#572' })).toEqual(['the allowlist names cli/Gone.spec.ts, which makes no real call']);
  });

  test('an integration spec making no real call is named', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.integration.spec.ts', text: 'export {};\n' }], {}))
      .toEqual(['cli/Example.integration.spec.ts is an integration spec making no real call']);
  });

  test('the allowlist is empty: every default spec has moved', () => {
    expect(REAL_SYSTEM_ALLOWLIST).toEqual({});
  });

  const allListed = BOUNDARY_SPECS.flatMap(({ specs }) => specs).map((path) => ({ path, text: 'Bun.spawn([\'true\']);\n' }));

  test('an unlisted integration spec is named', () => {
    const planted = { path: 'cli/Unlisted.integration.spec.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(boundaryListViolationsOf([...allListed, planted], () => true)).toEqual(['cli/Unlisted.integration.spec.ts is listed under no boundary']);
  });

  test('a listed spec that does not exist is named', () => {
    const [firstListed, ...others] = [...new Set(allListed.map(({ path }) => path))];
    const sources = others.map((path) => ({ path, text: 'Bun.spawn([\'true\']);\n' }));
    expect(boundaryListViolationsOf(sources, () => true)).toEqual([`BOUNDARY_SPECS names ${firstListed}, which does not exist`]);
  });

  test('a boundary that does not exist is named', () => {
    const [firstBoundary] = BOUNDARY_SPECS;
    expect(boundaryListViolationsOf(allListed, (path) => path !== firstBoundary?.boundary))
      .toEqual([`BOUNDARY_SPECS lists the boundary ${firstBoundary?.boundary}, which does not exist`]);
  });

  test('a shipping call site that is no boundary is named', () => {
    const planted = { path: 'cli/NewCaller.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(boundaryListViolationsOf([...allListed, planted], () => true)).toEqual(['cli/NewCaller.ts makes a real call and is no listed boundary']);
  });
});

describe('what a change runs', () => {
  const integrationSpecPaths = [...new Set(BOUNDARY_SPECS.flatMap(({ specs }) => specs))];

  test('a change to no boundary runs nothing', () => {
    expect(integrationSpecsTouchedBy(['cli/tickets/TicketAdd.ts', 'docs/cli.md'], integrationSpecPaths)).toEqual([]);
  });

  test.each(BOUNDARY_SPECS.map(({ boundary, specs }) => [boundary, specs] as const))('a change to %s runs its specs', (boundary, specs) => {
    const changedPath = boundary.endsWith('/') ? `${boundary}Example.md` : boundary;
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toEqual(expect.arrayContaining([...specs]));
  });

  test.each([
    ['src/lib/process-identity/DarwinProcessIdentity.ts', 'src/lib/process-identity/ProcessIdentity.integration.spec.ts'],
    ['src/lib/gate-confinement/DarwinSeatbelt.ts', 'src/services/overseer/ProcessWatcherSandbox.integration.spec.ts'],
    ['src/lib/shell-line/PosixShellLine.ts', 'src/lib/shell-line/ShellLine.contract.integration.spec.ts'],
    ['src/lib/executable-resolver/PosixExecutableResolver.ts', 'src/lib/executable-resolver/ExecutableResolver.planted.integration.spec.ts'],
    ['src/lib/watcher/PosixSocketEndpoint.ts', 'src/lib/watcher/LocalEndpoint.contract.integration.spec.ts'],
    ['src/lib/watcher/WatcherSocketServer.ts', 'src/lib/watcher/Watcher.protocol.integration.spec.ts'],
  ])('a change to the implementation %s behind a port runs %s', (changedPath, spec) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toContain(spec);
  });

  test.each(['package.json', 'src/testing/BoundarySpecs.ts'])('a change to %s proves the split again', (changedPath) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toEqual(['src/testing/CheckRecordingStamps.integration.spec.ts']);
  });

  test('a change to bunfig.toml proves the split and the shared case deadline again', () => {
    expect(integrationSpecsTouchedBy(['bunfig.toml'], integrationSpecPaths)).toEqual([
      'src/testing/CheckRecordingStamps.integration.spec.ts',
      'src/testing/SharedCaseDeadlinePreload.integration.spec.ts',
    ]);
  });

  test.each([
    ['src/testing/SharedCaseDeadlinePreload.ts', 'src/testing/SharedCaseDeadlinePreload.integration.spec.ts'],
    ['src/services/overseer/WatcherBundle.ts', 'src/services/overseer/WatcherBundle.integration.spec.ts'],
    ['src/services/overseer/WatcherFleet.ts', 'src/services/overseer/WatcherBundle.integration.spec.ts'],
  ])('a change to %s runs %s', (changedPath, spec) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toContain(spec);
  });

  test('a changed integration spec runs itself, and a module its own aspects', () => {
    expect(integrationSpecsTouchedBy(['src/lib/git/Worktrees.integration.spec.ts'], integrationSpecPaths)).toEqual(['src/lib/git/Worktrees.integration.spec.ts']);
    expect(integrationSpecsTouchedBy(['src/services/overseer/JobLaunch.ts'], integrationSpecPaths)).toEqual([
      'src/services/overseer/JobLaunch.gating.integration.spec.ts',
      'src/services/overseer/JobLaunch.integration.spec.ts',
      'src/services/overseer/JobLaunch.retry.integration.spec.ts',
      'src/services/overseer/JobLaunch.targetCatchUp.integration.spec.ts',
    ]);
  });

  test('a listed spec that is gone from the tree is not run', () => {
    expect(integrationSpecsTouchedBy(['eslint.config.js'], [])).toEqual([]);
  });
});
