/**
 * Every import edge of the repository's TypeScript, over the files the root, Bridge and design-system programs compile, read
 * syntactically with the compiler API so no type checking is paid for. A specifier naming a workspace package of the root `package.json`
 * resolves through that package's `exports`, as Bun and TypeScript resolve it. Planted sources add or replace files in memory, so a guard
 * can prove it still fires. The tree is read once per run and shared frozen: `bun test` runs every spec file in one process.
 */
import { readFileSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve
} from 'node:path';

import ts from 'typescript';

export type ImportForm = 'import' | 're-export' | 'dynamic-import';

/** A repository file reached by a relative or absolute path or through a workspace package's exports, or a package outside the repository. */
export type ImportTarget =
  | { readonly kind: 'repository-file'; readonly path: string }
  | { readonly kind: 'unexported-workspace-entry'; readonly specifier: string }
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
const PROGRAM_CONFIGURATION_PATHS = ['tsconfig.json', 'bridge/tsconfig.spec.json', 'design-system/tsconfig.spec.json'];

function repositoryPathOf(repositoryRoot: string, absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).split('\\').join('/');
}

function programFilePathsOf(repositoryRoot: string): readonly string[] {
  const unreportedDiagnostic = (): void => undefined;
  const parsingWatcher: ts.ParseConfigFileHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: unreportedDiagnostic };
  const filePaths = PROGRAM_CONFIGURATION_PATHS.flatMap((configurationPath) => {
    const parsedConfiguration = ts.getParsedCommandLineOfConfigFile(join(repositoryRoot, configurationPath), {}, parsingWatcher);
    return (parsedConfiguration?.fileNames ?? []).map((fileName) => repositoryPathOf(repositoryRoot, resolve(fileName)));
  });
  return [...new Set(filePaths)];
}

function stringLiteralTextOf(node: ts.Node | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
}

interface WorkspacePackageManifest {
  readonly name?:    string;
  readonly exports?: Readonly<Record<string, string>>;
}

/** Every entry the workspace packages of the root `package.json` export, keyed by the specifier a host writes: `<name>/<entry>`. */
function workspaceEntryPathsBySpecifierOf(repositoryRoot: string): ReadonlyMap<string, string> {
  const readManifest = (path: string): WorkspacePackageManifest & { readonly workspaces?: readonly string[] } => JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
  const entryPathsBySpecifier = new Map<string, string>();
  for (const workspaceFolder of readManifest('package.json').workspaces ?? []) {
    const { name, exports: entries = {} } = readManifest(posix.join(workspaceFolder, 'package.json'));
    for (const [entryKey, entryTarget] of Object.entries(entries)) {
      entryPathsBySpecifier.set(posix.join(name ?? workspaceFolder, entryKey), posix.join(workspaceFolder, entryTarget));
    }
  }
  return entryPathsBySpecifier;
}

interface SpecifierResolution {
  readonly repositoryRoot:                 string;
  readonly workspaceEntryPathsBySpecifier: ReadonlyMap<string, string>;
}

function workspacePackageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return (specifier.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1)).join('/');
}

function targetOf(fromPath: string, specifier: string, resolution: SpecifierResolution): ImportTarget {
  if (specifier.startsWith('.')) {
    return { kind: 'repository-file', path: posix.normalize(posix.join(posix.dirname(fromPath), specifier)) };
  }
  if (isAbsolute(specifier)) {
    return { kind: 'repository-file', path: repositoryPathOf(resolution.repositoryRoot, specifier) };
  }
  const workspaceEntryPath = resolution.workspaceEntryPathsBySpecifier.get(specifier);
  if (workspaceEntryPath !== undefined) {
    return { kind: 'repository-file', path: workspaceEntryPath };
  }
  const namesAWorkspacePackage = [...resolution.workspaceEntryPathsBySpecifier.keys()]
    .some((entrySpecifier) => workspacePackageNameOf(entrySpecifier) === workspacePackageNameOf(specifier));
  return namesAWorkspacePackage ? { kind: 'unexported-workspace-entry', specifier } : { kind: 'package', specifier };
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
  const resolution: SpecifierResolution = { repositoryRoot, workspaceEntryPathsBySpecifier: workspaceEntryPathsBySpecifierOf(repositoryRoot) };
  const sourceTexts: ReadonlyMap<string, string> = new Map(programFilePathsOf(repositoryRoot)
    .map((path) => [path, readFileSync(join(repositoryRoot, path), 'utf8')]));
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
