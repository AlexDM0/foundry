/**
 * The split of the Tests rules in the root `CLAUDE.md`: a default spec makes no real process, git or socket call, and a real-system spec is a
 * `*.integration.spec.ts` file that `BOUNDARY_SPECS` lists; only the git boundary specs run real git. Calls are found in the syntax tree and
 * followed through the spec helpers they import, never into production modules, which nearly all reach git.
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
} from '../src/testing/BoundarySpecs.ts';
import { repositoryRootOfThisCheckout }                from '../src/testing/ImportGraph.ts';
import type { RepositorySource }                       from '../src/testing/RepositorySources.ts';
import { memoisedPerSource, programTypeScriptSources } from '../src/testing/RepositorySources.ts';

/** Each file here still makes a real call in the default suite, until the ticket named moves it. */
const REAL_SYSTEM_ALLOWLIST: Readonly<Record<string, string>> = {};

const BUN_REAL_CALLS = new Set(['$', 'spawn', 'spawnSync', 'serve', 'connect', 'listen', 'udpSocket']);
const REAL_MODULE_PATTERN = /^(?:node:)?(?:child_process|net|http|https|http2|dgram|tls|dns)$/;
const BUN_MODULE = 'bun';
/**
 * The real helper exports the derivation from the spec helpers cannot find: the tooling's probes, which start a process through a
 * dispatch table; helpers that reach a socket or Talos through a shipping module, which the scan does not follow; and
 * helpers that build or signal a process, which are no call forms.
 */
const NAMED_REAL_HELPER_EXPORTS = [
  'connectProtocolClientToTalos',
  'describeWhenGitMergeTreeStdinIsPresent',
  'installedVersionOf',
  'startScratchBoardTalos',
  'processIsRunning',
  'testWhenSandboxExecApplies',
];
/**
 * Calls of the gate boundary, which runs each gate as a real process: an integration spec that makes one, or that starts processes through
 * `REAL_PROCESS_STARTS`, makes a real call. Shipping code makes them too, so they count only in an integration spec.
 */
const GATE_PROCESS_STARTS = new Set([
  'GateRun.runGate',
  'GateRun.runPipeline',
  'GateLineRun.runLine',
  'GateLineRun.runOnce',
  'ProposalTwiceRun.runProposalTwice',
]);
/** The real platform folder watch, which shipping code starts too, so it counts only in an integration spec, as the gate starts do. */
const FOLDER_WATCH_STARTS = new Set(['QuietWatch.watchQuietly']);
/** The run of a chosen program with its version arguments, which shipping code makes too, so it counts only in an integration spec. */
const PROGRAM_CHECK_STARTS = new Set(['runProgramCheck']);
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
    if (node.expression.getText() === 'spawnTalos') return ['spawnTalos'];
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

/**
 * A wait on the real clock makes a spec real-system too, but only there: shipping code sleeps, and `architecture/SpecSleeps.spec.ts` holds
 * the default specs.
 */
function realSystemFormsOfIntegrationSpec(source: RepositorySource): string[] {
  return formsIn(source, (node) => {
    const isSleep = ts.isPropertyAccessExpression(node) && node.getText() === 'Bun.sleep';
    const integrationOnlyStart = ts.isCallExpression(node) ? node.expression.getText() : '';
    if (GATE_PROCESS_STARTS.has(integrationOnlyStart) || FOLDER_WATCH_STARTS.has(integrationOnlyStart) || PROGRAM_CHECK_STARTS.has(integrationOnlyStart)) {
      return [integrationOnlyStart];
    }
    if (ts.isIdentifier(node) && node.text === 'REAL_PROCESS_STARTS') return ['REAL_PROCESS_STARTS'];
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

const realCallFormsOf = memoisedPerSource(realCallFormsIn);

function suiteViolationsOf(sources: readonly RepositorySource[], allowlist: Readonly<Record<string, string>>): string[] {
  const allowed = (path: string): boolean => Object.hasOwn(allowlist, path);
  const defaultSpecs = sources.filter(({ path }) => isDefaultSpec(path));
  const callingSpecs = defaultSpecs.filter((source) => realCallFormsOf(source).length > 0);
  const callingPaths = new Set(callingSpecs.map(({ path }) => path));
  return [
    ...callingSpecs.filter(({ path }) => !allowed(path))
      .map((source) => `${source.path} is a default spec calling ${realCallFormsOf(source).join(', ')}`),
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
      .filter((source) => realCallFormsOf(source).some((form) => form !== 'GitProcess.run'))
      .map((source) => `${source.path} makes a real call and is no listed boundary`),
  ];
}

/** Each spec here still runs real git outside the git boundary specs, until the ticket named moves it to recorded git answers. */
const REAL_GIT_ALLOWLIST: Readonly<Record<string, string>> = {};

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
  readonly realCalls:  readonly string[];
  readonly references: ReadonlySet<string>;
  readonly imports:    ReadonlyMap<string, string>;
  readonly siblings:   ReadonlySet<string>;
}

function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

/** The local names a module binds from a module that reaches the real system: a socket or process module, or a process call of Bun. */
function realModuleBindingsOf(sourceFile: ts.SourceFile): Set<string> {
  return new Set(valueImportDeclarationsOf(sourceFile).flatMap(({ importClause, moduleSpecifier }) => {
    if (importClause === undefined || !ts.isStringLiteral(moduleSpecifier)) return [];
    const isRealModule = REAL_MODULE_PATTERN.test(moduleSpecifier.text);
    const { namedBindings } = importClause;
    const defaultBinding = isRealModule && importClause.name !== undefined ? [importClause.name.text] : [];
    if (namedBindings === undefined) return defaultBinding;
    if (ts.isNamespaceImport(namedBindings)) return isRealModule ? [namedBindings.name.text] : [];
    const isBunCall = (exported: string): boolean => moduleSpecifier.text === BUN_MODULE && (exported === '$' || BUN_REAL_CALLS.has(exported));
    return [...defaultBinding, ...namedBindings.elements.filter((element) => !element.isTypeOnly)
      .filter((element) => isRealModule || isBunCall((element.propertyName ?? element.name).text)).map((element) => element.name.text)];
  }));
}

/** A property form counts only where it is called, so a stub that saves `Bun.spawnSync` to restore it starts nothing. */
function isCalledProperty(node: ts.Node): boolean {
  const { parent } = node;
  return (ts.isCallExpression(parent) && parent.expression === node) || (ts.isTaggedTemplateExpression(parent) && parent.tag === node);
}

/** `GitProcess` is left to the git guard, since a spec that mocks it runs no process through a helper that calls it. */
function realCallsIn(node: ts.Node, realModuleBindings: ReadonlySet<string>): string[] {
  const calls = new Set<string>();
  const visit = (child: ts.Node): void => {
    const isUncalledProperty = ts.isPropertyAccessExpression(child) && !isCalledProperty(child);
    for (const form of isUncalledProperty ? [] : nodeFormsOf(child)) if (!isGitProcessForm(form)) calls.add(form);
    if (ts.isIdentifier(child) && realModuleBindings.has(child.text)) calls.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...calls];
}

function helperDeclarationsIn(path: string, sourceFile: ts.SourceFile): HelperDeclaration[] {
  const imports = valueImportsOf(sourceFile);
  const realModuleBindings = realModuleBindingsOf(sourceFile);
  const named = sourceFile.statements.flatMap((statement): { name: string; node: ts.Node; statement: ts.Statement }[] => {
    const isNamedDeclaration = (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined;
    if (isNamedDeclaration) return [{ name: statement.name.text, node: statement, statement }];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name))
      .map((declaration) => ({ name: declaration.name.getText(), node: declaration, statement }));
  });
  const siblings = new Set(named.map(({ name }) => name));
  return named.map(({ name, node, statement }) => ({
    path,
    name,
    isExported: isExported(statement),
    gitForms:   gitFormsIn(node),
    realCalls:  realCallsIn(node, realModuleBindings),
    references: identifiersIn(node),
    imports,
    siblings,
  }));
}

interface HelperFacts {
  readonly declarations:      readonly HelperDeclaration[];
  readonly defaultExportName: string | null;
}

const helperFactsOf = memoisedPerSource((source): HelperFacts => {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  return { declarations: helperDeclarationsIn(source.path, sourceFile), defaultExportName: defaultExportNameOf(sourceFile) };
});

function helperDeclarationsOf(source: RepositorySource): readonly HelperDeclaration[] {
  return helperFactsOf(source).declarations;
}

/**
 * The exports of the spec helpers that run git, themselves or through a sibling or another helper, found until nothing is added.
 * `countsAsGit` leaves out the `GitProcess` forms for a spec that mocks `GitProcess`.
 */
function gitRunningHelperExportsOf(sources: readonly RepositorySource[], countsAsGit: (form: string) => boolean = () => true): GitRunningHelpers {
  return reachingHelperExportsOf(sources, ({ gitForms }) => gitForms.some(countsAsGit));
}

/** The named exports of the spec helpers that reach the real system, themselves or through a sibling or another helper. */
function realCallingHelperExportsOf(sources: readonly RepositorySource[]): Set<string> {
  return new Set([...reachingHelperExportsOf(sources, ({ realCalls }) => realCalls.length > 0).namedExports, ...NAMED_REAL_HELPER_EXPORTS]);
}

function reachingHelperExportsOf(sources: readonly RepositorySource[], reachesDirectly: (declaration: HelperDeclaration) => boolean): GitRunningHelpers {
  const helperSources = sources.filter(({ path }) => isSpecHelper(path));
  const declarations = helperSources.flatMap(helperDeclarationsOf);
  const reaching = new Set<HelperDeclaration>();
  const reachingExports = new Set<string>();
  /** A file's declarations share one `siblings` set, so it keys the names reaching the system in that file. */
  const reachingNamesBySiblings = new Map<ReadonlySet<string>, Set<string>>();
  const markReaching = (declaration: HelperDeclaration): void => {
    reaching.add(declaration);
    if (declaration.isExported) reachingExports.add(declaration.name);
    const reachingSiblings = reachingNamesBySiblings.get(declaration.siblings) ?? new Set<string>();
    reachingSiblings.add(declaration.name);
    reachingNamesBySiblings.set(declaration.siblings, reachingSiblings);
  };
  declarations.filter(reachesDirectly).forEach(markReaching);
  const reachesThroughAnother = (declaration: HelperDeclaration): boolean => [...declaration.references].some((reference) => {
    const imported = declaration.imports.get(reference);
    if (imported !== undefined) return reachingExports.has(imported);
    return declaration.siblings.has(reference) && reachingNamesBySiblings.get(declaration.siblings)?.has(reference) === true;
  });
  for (let added = true; added;) {
    const newlyRunning = declarations.filter((declaration) => !reaching.has(declaration) && reachesThroughAnother(declaration));
    newlyRunning.forEach(markReaching);
    added = newlyRunning.length > 0;
  }
  const reachingDefaults = new Map<string, string>();
  for (const source of helperSources) {
    const defaultName = helperFactsOf(source).defaultExportName;
    const reachesTheSystem = [...reaching].some((declaration) => declaration.path === source.path && declaration.name === defaultName);
    if (defaultName !== null && reachesTheSystem) reachingDefaults.set(source.path.replace(/\.tsx?$/, ''), defaultName);
  }
  return { namedExports: reachingExports, defaultsByPath: reachingDefaults };
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
const SOURCES = programTypeScriptSources(REPOSITORY_ROOT);
const REAL_HELPER_EXPORTS = realCallingHelperExportsOf(SOURCES);
const MINIMUM_INTEGRATION_SPEC_FILE_COUNT = 70;
const MINIMUM_DERIVED_REAL_HELPER_EXPORT_COUNT = 20;

describe('the scan itself', () => {
  test('it sees the specs of both suites and the shipping call sites', () => {
    expect(SOURCES.filter(({ path }) => isDefaultSpec(path)).length).toBeGreaterThan(MINIMUM_SPEC_FILE_COUNT);
    expect(SOURCES.filter(({ path }) => isIntegrationSpec(path)).length).toBeGreaterThan(MINIMUM_INTEGRATION_SPEC_FILE_COUNT);
    const shippingCallers = SOURCES.filter(({ path }) => isShippingFile(path)).filter((source) => realCallFormsOf(source).length > 0);
    expect(shippingCallers.length).toBeGreaterThan(SHIPPING_REAL_CALL_FORM_COUNT_FLOOR);
    expect(shippingCallers.map(({ path }) => path)).toContain('src/lib/git/GitProcess.ts');
  });
});

describe('the real helper exports', () => {
  const helperSources = SOURCES.filter(({ path }) => isSpecHelper(path));
  const derived = reachingHelperExportsOf(SOURCES, ({ realCalls }) => realCalls.length > 0).namedExports;

  test('the derivation finds the helpers that start the binary, a child or git', () => {
    expect(derived.size).toBeGreaterThan(MINIMUM_DERIVED_REAL_HELPER_EXPORT_COUNT);
    expect([...derived]).toEqual(expect.arrayContaining(['runAgentProgress', 'jsonPrintedByAChildProcess', 'gitOutputIn', 'sleepingProcess']));
  });

  test('each named export exists in a testing folder and is one the derivation cannot find', () => {
    const exportedNames = new Set(SOURCES.filter(({ path }) => path.split('/').includes('testing'))
      .flatMap(helperDeclarationsOf).filter(({ isExported: exported }) => exported).map(({ name }) => name));
    expect(NAMED_REAL_HELPER_EXPORTS.filter((name) => !exportedNames.has(name) || derived.has(name))).toEqual([]);
  });

  test.each([
    ['`Bun.spawnSync`', 'export function planted(): void { Bun.spawnSync([\'true\']); }'],
    ['a child process import', 'import { spawnSync } from \'node:child_process\';\nexport function planted(): void { spawnSync(\'true\'); }'],
    ['the Bun shell', 'import { $ } from \'bun\';\nexport async function planted(): Promise<void> { await $`true`; }'],
    ['a socket', 'export async function planted(): Promise<void> { await fetch(address); }'],
    ['a sibling that starts a process', 'function start(): void { Bun.spawn([\'true\']); }\nexport function planted(): void { start(); }'],
    ['another helper', 'import { sleepingProcess } from \'./ProcessDoubles.ts\';\nexport function planted(): void { sleepingProcess(); }'],
  ])('a planted helper reaching the system through %s is derived', (_form, text) => {
    const planted = { path: 'src/testing/PlantedHelper.ts', text };
    expect(reachingHelperExportsOf([...helperSources, planted], ({ realCalls }) => realCalls.length > 0).namedExports).toContain('planted');
  });

  test.each([
    ['a stub that saves `Bun.spawnSync`', 'export function planted(): void { const saved = Bun.spawnSync; Bun.spawnSync = saved; }'],
    ['`GitProcess`, which the git guard holds', 'export function planted(): void { GitProcess.run(directory, [\'status\']); }'],
    ['a type-only socket import', 'import type { Socket } from \'node:net\';\nexport function planted(socket: Socket): Socket { return socket; }'],
  ])('a planted helper with %s is not derived', (_form, text) => {
    const planted = { path: 'src/testing/PlantedHelper.ts', text };
    expect(reachingHelperExportsOf([...helperSources, planted], ({ realCalls }) => realCalls.length > 0).namedExports).not.toContain('planted');
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
    ['a real Talos start', 'spawnTalos(ports, request);', 'spawnTalos'],
  ])('%s', (_form, text, form) => {
    const planted = { path: 'cli/Example.spec.ts', text };
    expect(suiteViolationsOf([planted], {})).toEqual([`cli/Example.spec.ts is a default spec calling ${form}`]);
  });

  test('in a DOM spec too', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.dom.tsx', text: 'await fetch(address);' }], {})).toEqual(['cli/Example.dom.tsx is a default spec calling fetch']);
  });

  test('a planted spec passes on the allowlist and not off it', () => {
    const planted = { path: 'cli/Example.spec.ts', text: 'Bun.spawn([\'true\']);\n' };
    expect(suiteViolationsOf([planted], { [planted.path]: '#571' })).toEqual([]);
    expect(suiteViolationsOf([planted], {})).toEqual(['cli/Example.spec.ts is a default spec calling Bun.spawn']);
  });
});

describe('what the test leaves alone', () => {
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
    // A reference rather than a call, so that `architecture/SpecSleeps.spec.ts` finds no fixed wait in this file.
    expect(suiteViolationsOf([
      { path: 'cli/Example.integration.spec.ts', text: 'const waitOnTheClock = Bun.sleep;\n' },
      { path: 'cli/Example.spec.ts', text: 'const waitOnTheClock = Bun.sleep;\n' },
    ], {})).toEqual([]);
  });

  test.each([
    ['a gate process', 'await GateRun.runGate(request);\n'],
    ['a gate pipeline', 'await GateRun.runPipeline(request);\n'],
    ['a gate line', 'await GateLineRun.runLine(request, line, directory, confinement);\n'],
    ['one run of gate lines', 'await GateLineRun.runOnce(request);\n'],
    ['a proposal\'s two gate runs', 'await ProposalTwiceRun.runProposalTwice(request);\n'],
    ['the real process starts', 'const starts = REAL_PROCESS_STARTS;\n'],
    ['a folder watch', 'const handle = QuietWatch.watchQuietly(request);\n'],
    ['a program\'s version run', 'const answer = await runProgramCheck(request);\n'],
  ])('%s makes an integration spec real, and is no real call in a default spec', (_form, text) => {
    const integrationSpec = { path: 'src/Example.integration.spec.ts', text };
    expect(suiteViolationsOf([integrationSpec, { path: 'src/Example.spec.ts', text }], {})).toEqual([]);
    expect(suiteViolationsOf([{ ...integrationSpec, text: 'await GateRun.observe(request);\n' }], {}))
      .toEqual(['src/Example.integration.spec.ts is an integration spec making no real call']);
  });

  test('a stand-in Talos start passes in a default spec', () => {
    expect(suiteViolationsOf([{ path: 'cli/Example.spec.ts', text: 'world.processStarts.startTalos(ports, request);\n' }], {})).toEqual([]);
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
    ['src/lib/gate-confinement/DarwinSeatbelt.ts', 'src/services/hephaestus/LineSandbox.integration.spec.ts'],
    ['src/lib/shell-line/PosixShellLine.ts', 'src/lib/shell-line/ShellLine.contract.integration.spec.ts'],
    ['src/lib/executable-resolver/PosixExecutableResolver.ts', 'src/lib/executable-resolver/ExecutableResolver.planted.integration.spec.ts'],
    ['src/lib/local-endpoint/PosixSocketEndpoint.ts', 'src/lib/local-endpoint/LocalEndpoint.contract.integration.spec.ts'],
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
    ['src/services/hephaestus/TalosStart.ts', 'cli/hephaestus/ChildSpawnOptions.integration.spec.ts'],
  ])('a change to %s runs %s', (changedPath, spec) => {
    expect(integrationSpecsTouchedBy([changedPath], integrationSpecPaths)).toContain(spec);
  });

  test('a changed integration spec runs itself, and a module its own aspects', () => {
    expect(integrationSpecsTouchedBy(['src/lib/git/Worktrees.integration.spec.ts'], integrationSpecPaths)).toEqual(['src/lib/git/Worktrees.integration.spec.ts']);
    const exampleSpecPaths = [
      'src/services/example/ExampleModule.integration.spec.ts',
      'src/services/example/ExampleModule.aspect.integration.spec.ts',
      'src/services/example/ExampleModuleOther.integration.spec.ts',
    ];
    expect(integrationSpecsTouchedBy(['src/services/example/ExampleModule.ts'], exampleSpecPaths)).toEqual([
      'src/services/example/ExampleModule.aspect.integration.spec.ts',
      'src/services/example/ExampleModule.integration.spec.ts',
    ]);
  });

  test('a listed spec that is gone from the tree is not run', () => {
    expect(integrationSpecsTouchedBy(['eslint.config.js'], [])).toEqual([]);
  });
});
