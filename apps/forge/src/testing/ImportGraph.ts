/**
 * Every import edge of the program's TypeScript, over the files the root and Bridge programs and each workspace package the program declares
 * compile, read syntactically with the compiler API so no type checking is paid for. A declared package's files sit under a virtual folder
 * named after it (`design-system/atoms/Button.tsx`), and a specifier naming it resolves through its `exports`, as Bun and TypeScript resolve
 * it. Planted sources add or replace files in memory, so a guard can prove it still fires. The tree is read once per run and shared frozen:
 * `bun test` runs every spec file in one process.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve
} from 'node:path';

import ts from 'typescript';

import type { DeclaredWorkspacePackage }                       from './RepositorySources.ts';
import { declaredWorkspacePackagesOf, workspaceRootOfProgram } from './RepositorySources.ts';

export type ImportForm = 'import' | 're-export' | 'dynamic-import';

/**
 * A repository file reached by a relative or absolute path or through a workspace package's exports, or a package outside the repository.
 * A file outside the program and its declared packages keeps its path from the program root (`../gaia/src/Main.ts`), and a workspace
 * package the program does not declare is named apart: Bun's hoisted install would resolve it all the same.
 */
export type ImportTarget =
  | { readonly kind: 'repository-file'; readonly path: string }
  | { readonly kind: 'unexported-workspace-entry'; readonly specifier: string }
  | { readonly kind: 'undeclared-workspace-package'; readonly specifier: string }
  | { readonly kind: 'package'; readonly specifier: string };

export interface ImportEdge {
  readonly fromPath:  string;
  readonly line:      number;
  readonly form:      ImportForm;
  /** The module specifier as the importing file writes it. */
  readonly specifier: string;
  readonly target:    ImportTarget;
}

export interface ImportGraph {
  readonly repositoryRoot:                 string;
  /** Repository-relative, with forward slashes, sorted. */
  readonly scannedPaths:                   readonly string[];
  readonly edges:                          readonly ImportEdge[];
  readonly sourceTextOf:                   (path: string) => string;
  /** Each specifier a workspace package's `exports` lists, such as `design-system/Button`, and the repository file it names. */
  readonly workspaceEntryPathsBySpecifier: ReadonlyMap<string, string>;
}

/** Each spec project holds its shipping project plus the specs, so these together name every file the type check compiles. */
const PROGRAM_CONFIGURATION_PATHS = ['tsconfig.json', 'bridge/tsconfig.spec.json'];
const PACKAGE_SPEC_CONFIGURATION_PATH = 'tsconfig.spec.json';
const PACKAGE_CONFIGURATION_PATH = 'tsconfig.json';

function forwardSlashed(path: string): string {
  return path.split('\\').join('/');
}

function isBelow(folder: string, absolutePath: string): boolean {
  const relativePath = relative(folder, absolutePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

/** A path as the guards name it: under a declared package's virtual folder when it lies in the package, else relative to the program root. */
function programPathOf(programRoot: string, workspacePackages: readonly DeclaredWorkspacePackage[], absolutePath: string): string {
  const owningPackage = workspacePackages.find((workspacePackage) => isBelow(workspacePackage.folder, absolutePath));
  return owningPackage === undefined
    ? forwardSlashed(relative(programRoot, absolutePath))
    : posix.join(owningPackage.name, forwardSlashed(relative(owningPackage.folder, absolutePath)));
}

/** The path the guards name for a file at this absolute location, under a declared package's virtual folder when it lies in one. */
export function programPathOfLocation(programRoot: string, location: string): string {
  return programPathOf(programRoot, declaredWorkspacePackagesOf(programRoot), location);
}

function fileLocationOf(programRoot: string, workspacePackages: readonly DeclaredWorkspacePackage[], path: string): string {
  const [topFolder = '', ...rest] = path.split('/');
  const owningPackage = workspacePackages.find((workspacePackage) => workspacePackage.name === topFolder);
  return owningPackage === undefined ? join(programRoot, path) : join(owningPackage.folder, ...rest);
}

/** Where a path the guards name is read: a virtual package path in the package's real folder, any other path under the program root. */
export function programFileLocationOf(programRoot: string, path: string): string {
  return fileLocationOf(programRoot, declaredWorkspacePackagesOf(programRoot), path);
}

/** The name of every member of the program's Bun workspace, the program itself included. */
function workspaceMemberNamesOf(programRoot: string): ReadonlySet<string> {
  const workspaceRoot = workspaceRootOfProgram(programRoot);
  const manifestNameOf = (folder: string): unknown => (JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { readonly name?: unknown }).name;
  const { workspaces: memberPatterns } = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as { readonly workspaces?: unknown };
  const memberNames = (Array.isArray(memberPatterns) ? memberPatterns : [])
    .filter((pattern): pattern is string => typeof pattern === 'string')
    .flatMap((pattern) => [...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: workspaceRoot })])
    .map((manifestPath) => manifestNameOf(join(workspaceRoot, dirname(manifestPath))))
    .filter((name): name is string => typeof name === 'string');
  return new Set(memberNames);
}

/** A package with no spec project compiles its specs in its one project. */
function packageConfigurationLocationOf(packageFolder: string): string {
  const specConfigurationLocation = join(packageFolder, PACKAGE_SPEC_CONFIGURATION_PATH);
  return existsSync(specConfigurationLocation) ? specConfigurationLocation : join(packageFolder, PACKAGE_CONFIGURATION_PATH);
}

function programFilePathsOf(programRoot: string, workspacePackages: readonly DeclaredWorkspacePackage[]): readonly string[] {
  const unreportedDiagnostic = (): void => undefined;
  const configurationParseHost: ts.ParseConfigFileHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: unreportedDiagnostic };
  const configurationLocations = [
    ...PROGRAM_CONFIGURATION_PATHS.map((configurationPath) => join(programRoot, configurationPath)),
    ...workspacePackages.map((workspacePackage) => packageConfigurationLocationOf(workspacePackage.folder)),
  ];
  const filePaths = configurationLocations.flatMap((configurationLocation) => {
    const parsedConfiguration = ts.getParsedCommandLineOfConfigFile(configurationLocation, {}, configurationParseHost);
    if (parsedConfiguration === undefined) throw new Error(`${configurationLocation} could not be read`);
    return parsedConfiguration.fileNames.map((fileName) => programPathOf(programRoot, workspacePackages, resolve(fileName)));
  });
  return [...new Set(filePaths)];
}

function stringLiteralTextOf(node: ts.Node | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
}

/** Every entry the declared workspace packages export, keyed by the specifier a host writes, `<name>/<entry>`, naming its virtual path. */
function workspaceEntryPathsBySpecifierOf(workspacePackages: readonly DeclaredWorkspacePackage[]): ReadonlyMap<string, string> {
  const entryPathsBySpecifier = new Map<string, string>();
  for (const workspacePackage of workspacePackages) {
    const manifest = JSON.parse(readFileSync(join(workspacePackage.folder, 'package.json'), 'utf8')) as { readonly exports?: Readonly<Record<string, unknown>> };
    for (const [entryKey, entryTarget] of Object.entries(manifest.exports ?? {})) {
      if (typeof entryTarget === 'string') entryPathsBySpecifier.set(posix.join(workspacePackage.name, entryKey), posix.join(workspacePackage.name, entryTarget));
    }
  }
  return entryPathsBySpecifier;
}

interface SpecifierResolution {
  readonly repositoryRoot:                 string;
  readonly workspacePackages:              readonly DeclaredWorkspacePackage[];
  readonly workspaceMemberNames:           ReadonlySet<string>;
  readonly workspaceEntryPathsBySpecifier: ReadonlyMap<string, string>;
}

function workspacePackageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return (specifier.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1)).join('/');
}

function targetOf(fromPath: string, specifier: string, resolution: SpecifierResolution): ImportTarget {
  if (specifier.startsWith('.')) {
    const importerLocation = fileLocationOf(resolution.repositoryRoot, resolution.workspacePackages, fromPath);
    return { kind: 'repository-file', path: programPathOf(resolution.repositoryRoot, resolution.workspacePackages, resolve(dirname(importerLocation), specifier)) };
  }
  if (isAbsolute(specifier)) {
    return { kind: 'repository-file', path: programPathOf(resolution.repositoryRoot, resolution.workspacePackages, specifier) };
  }
  const workspaceEntryPath = resolution.workspaceEntryPathsBySpecifier.get(specifier);
  if (workspaceEntryPath !== undefined) {
    return { kind: 'repository-file', path: workspaceEntryPath };
  }
  const namesAWorkspacePackage = [...resolution.workspaceEntryPathsBySpecifier.keys()]
    .some((entrySpecifier) => workspacePackageNameOf(entrySpecifier) === workspacePackageNameOf(specifier));
  if (namesAWorkspacePackage) return { kind: 'unexported-workspace-entry', specifier };
  return resolution.workspaceMemberNames.has(workspacePackageNameOf(specifier)) ? { kind: 'undeclared-workspace-package', specifier } : { kind: 'package', specifier };
}

function edgesOf(fromPath: string, sourceText: string, resolution: SpecifierResolution): readonly ImportEdge[] {
  const sourceFile = ts.createSourceFile(fromPath, sourceText, ts.ScriptTarget.ESNext, true, fromPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edges: ImportEdge[] = [];
  const record = (node: ts.Node, form: ImportForm, specifier: string | null): void => {
    if (specifier === null) {
      return;
    }
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    edges.push(Object.freeze({
      fromPath, line, form, specifier, target: Object.freeze(targetOf(fromPath, specifier, resolution))
    }));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      record(node, 'import', stringLiteralTextOf(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      record(node, 're-export', stringLiteralTextOf(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node, 'import', stringLiteralTextOf(node.moduleReference.expression));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      record(node, 'dynamic-import', stringLiteralTextOf(node.arguments[0]));
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      record(node, 'import', stringLiteralTextOf(node.argument.literal));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edges;
}

export interface ImportGraphScanner {
  readonly graph:                 ImportGraph;
  /** The graph with these repository-relative sources added, or put in place of the file at the same path; the tree on disk is untouched. */
  readonly graphWithPlantedFiles: (plantedSources: Readonly<Record<string, string>>) => ImportGraph;
}

const scannersByRoot = new Map<string, ImportGraphScanner>();

export function importGraphScannerOf(repositoryRoot: string): ImportGraphScanner {
  const known = scannersByRoot.get(repositoryRoot);
  if (known !== undefined) return known;
  const scanner = scannerOf(repositoryRoot);
  scannersByRoot.set(repositoryRoot, scanner);
  return scanner;
}

function scannerOf(repositoryRoot: string): ImportGraphScanner {
  const workspacePackages = declaredWorkspacePackagesOf(repositoryRoot);
  const resolution: SpecifierResolution = {
    repositoryRoot,
    workspacePackages,
    workspaceMemberNames:           workspaceMemberNamesOf(repositoryRoot),
    workspaceEntryPathsBySpecifier: workspaceEntryPathsBySpecifierOf(workspacePackages),
  };
  const sourceTexts: ReadonlyMap<string, string> = new Map(programFilePathsOf(repositoryRoot, workspacePackages)
    .map((path) => [path, readFileSync(programFileLocationOf(repositoryRoot, path), 'utf8')]));
  const edgesByPath: ReadonlyMap<string, readonly ImportEdge[]> = new Map([...sourceTexts]
    .map(([path, sourceText]) => [path, Object.freeze(edgesOf(path, sourceText, resolution))]));
  const graphOf = (texts: ReadonlyMap<string, string>, edgesByScannedPath: ReadonlyMap<string, readonly ImportEdge[]>): ImportGraph => Object.freeze({
    repositoryRoot,
    scannedPaths:                   Object.freeze([...edgesByScannedPath.keys()].sort()),
    edges:                          Object.freeze([...edgesByScannedPath.values()].flat()),
    sourceTextOf:                   (path: string) => texts.get(path) ?? '',
    workspaceEntryPathsBySpecifier: resolution.workspaceEntryPathsBySpecifier,
  });
  const scanner: ImportGraphScanner = {
    graph:                 graphOf(sourceTexts, edgesByPath),
    graphWithPlantedFiles: (plantedSources) => {
      const plantedTexts = new Map(sourceTexts);
      const plantedEdgesByPath = new Map(edgesByPath);
      for (const [plantedPath, plantedSource] of Object.entries(plantedSources)) {
        plantedTexts.set(plantedPath, plantedSource);
        plantedEdgesByPath.set(plantedPath, edgesOf(plantedPath, plantedSource, resolution));
      }
      return graphOf(plantedTexts, plantedEdgesByPath);
    },
  };
  return Object.freeze(scanner);
}

/** The entries themselves and every repository file they import, directly or through each other; a package import is not followed. */
export function reachablePathsFrom(graph: ImportGraph, entryPaths: readonly string[]): ReadonlySet<string> {
  const targetPathsByImporter = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.target.kind === 'repository-file') {
      const targetPaths = targetPathsByImporter.get(edge.fromPath) ?? [];
      targetPaths.push(edge.target.path);
      targetPathsByImporter.set(edge.fromPath, targetPaths);
    }
  }
  const pending = [...entryPaths];
  const reached = new Set(entryPaths);
  while (pending.length > 0) {
    for (const targetPath of targetPathsByImporter.get(pending.pop() ?? '') ?? []) {
      if (!reached.has(targetPath)) {
        reached.add(targetPath);
        pending.push(targetPath);
      }
    }
  }
  return reached;
}

export function repositoryRootOfThisCheckout(): string {
  return resolve(dirname(import.meta.path), '..', '..');
}
