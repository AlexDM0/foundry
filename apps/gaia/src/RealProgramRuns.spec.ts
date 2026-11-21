/**
 * Only process-run starts another program, and every spec reaches other programs through the recorded-runs mock. A direct start is
 * allowed only in the exact list below, and the real boundary only in shipping code, in a recording spec and in the record command; both
 * lists are exact both ways. A reach is found in a file's syntax tree, so a sentence or a string is not one. The scan first proves it saw
 * the repository, and each form is planted to prove the guard names it.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

import { RECORDING_SPEC_SUFFIX } from './testing/BoundaryRecordings.ts';

/** Each file allowed to start a program without process-run, with the reason. */
const DIRECT_PROCESS_STARTS_ALLOWED: Readonly<Record<string, string>> = {
  'src/lib/process-run/ProcessRun.ts': 'the boundary to other programs itself',
  'src/Main.spec.ts':                  'runs Gaia\'s own program end to end, since other programs read its version answer from its output',
  'src/Main.serve.spec.ts':            'runs gaia serve as the program the launcher starts, and stops it with a signal',
  'src/testing/LeakCheck.ts':          'reads the repository\'s git status and lists the run\'s child processes, to find what a run left behind',
  'src/testing/LeakCheck.spec.ts':     'runs a planted test run under the preload, since the leak check judges a whole run',
  'page/testing/RunDomSpecs.ts':       'runs the board\'s DOM specs in their own isolated test run, which bun test does not discover',

  // A library of page/lib/ imports no Gaia file (`LibraryBoundaries.spec.ts`), so its test-only helpers cannot reach process-run.
  'page/lib/design-system/testing/RunDomSpecs.ts': 'runs the design-system library\'s DOM specs in their own isolated test run',
  'page/lib/flint/testing/RunDomSpecs.ts':         'runs the Flint library\'s DOM specs in their own isolated test run',
  'page/lib/brand/testing/RunDomSpecs.ts':         'runs the brand library\'s DOM specs in their own isolated test run',
  'page/lib/flint/testing/HeadlessChrome.ts':      'starts the browser that captures Flint\'s frames for a person to look at, test-only and run by no spec',
};

/** Each spec or test helper allowed to use the real process-run besides the recording specs, with the reason. */
const REAL_BOUNDARY_USES_ALLOWED_IN_TESTING: Readonly<Record<string, string>> = {
  'src/testing/RecordBoundary.ts': 'the record command runs a recording spec in its own test run',
  'src/testing/ScratchForge.ts':   'runs the forge program for the forge recording specs, under a scratch home in scratch repositories only',
};

const BUN_PROCESS_STARTS: ReadonlySet<string> = new Set(['spawn', 'spawnSync', '$']);
const BUN_MODULE = 'bun';
const WHOLE_BUN_MODULE_FORM = 'the whole bun module';
const CHILD_PROCESS_MODULE = /^(?:node:)?child_process$/;
const REAL_BOUNDARY_EXPORT = 'realProcessRun';
const REAL_BOUNDARY_MODULE = /(?:^|\/)process-run\/ProcessRun(?:\.ts)?$/;
const SCANNED_FOLDERS = ['src', 'page'];
const MINIMUM_SCANNED_SPEC_COUNT = 8;

interface ProgramReaches {
  readonly directStarts:     readonly string[];
  readonly realBoundaryUses: readonly string[];
}

function isChildProcessModule(node: typescript.Node | undefined): boolean {
  return node !== undefined && typescript.isStringLiteralLike(node) && CHILD_PROCESS_MODULE.test(node.text);
}

function isBunModule(node: typescript.Node | undefined): boolean {
  return node !== undefined && typescript.isStringLiteralLike(node) && node.text === BUN_MODULE;
}

function isModuleLoad(node: typescript.CallExpression): boolean {
  return node.expression.kind === typescript.SyntaxKind.ImportKeyword || (typescript.isIdentifier(node.expression) && node.expression.text === 'require');
}

/** A default or namespace import hands over the whole module, so every start in it is reachable. */
function importsTheWholeModule(declaration: typescript.ImportDeclaration): boolean {
  const clause = declaration.importClause;
  if (clause === undefined || clause.isTypeOnly) return false;
  return clause.name !== undefined || (clause.namedBindings !== undefined && typescript.isNamespaceImport(clause.namedBindings));
}

function bunImportStartOf(declaration: typescript.ImportDeclaration): string | null {
  if (importsTheWholeModule(declaration)) return WHOLE_BUN_MODULE_FORM;
  const taken = importedNamesOf(declaration).filter((name) => BUN_PROCESS_STARTS.has(name));
  return taken.length > 0 ? `Bun.${taken.join(', Bun.')}` : null;
}

function importsOnlyTypes(declaration: typescript.ImportDeclaration): boolean {
  const clause = declaration.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return clause.name === undefined && bindings !== undefined && typescript.isNamedImports(bindings) && bindings.elements.every((element) => element.isTypeOnly);
}

function importedNamesOf(declaration: typescript.ImportDeclaration): string[] {
  const bindings = declaration.importClause?.namedBindings;
  if (bindings === undefined || !typescript.isNamedImports(bindings)) return [];
  return bindings.elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text);
}

function directStartOf(node: typescript.Node): string | null {
  if (typescript.isPropertyAccessExpression(node) && typescript.isIdentifier(node.expression) && node.expression.text === 'Bun' && BUN_PROCESS_STARTS.has(node.name.text)) {
    return `Bun.${node.name.text}`;
  }
  if (typescript.isElementAccessExpression(node) && typescript.isIdentifier(node.expression) && node.expression.text === 'Bun'
    && typescript.isStringLiteralLike(node.argumentExpression) && BUN_PROCESS_STARTS.has(node.argumentExpression.text)) {
    return `Bun.${node.argumentExpression.text}`;
  }
  if (typescript.isVariableDeclaration(node) && typescript.isObjectBindingPattern(node.name) && node.initializer !== undefined
    && typescript.isIdentifier(node.initializer) && node.initializer.text === 'Bun') {
    const taken = node.name.elements.map((element) => (element.propertyName ?? element.name).getText()).filter((name) => BUN_PROCESS_STARTS.has(name));
    return taken.length > 0 ? `Bun.${taken.join(', Bun.')}` : null;
  }
  if (typescript.isImportDeclaration(node) && !importsOnlyTypes(node)) {
    if (isChildProcessModule(node.moduleSpecifier)) return 'child_process';
    if (isBunModule(node.moduleSpecifier)) return bunImportStartOf(node);
  }
  if (typescript.isCallExpression(node) && isModuleLoad(node)) {
    if (isChildProcessModule(node.arguments[0])) return 'child_process';
    if (isBunModule(node.arguments[0])) return WHOLE_BUN_MODULE_FORM;
  }
  return null;
}

function isRealBoundaryModule(node: typescript.Node | undefined): boolean {
  return node !== undefined && typescript.isStringLiteralLike(node) && REAL_BOUNDARY_MODULE.test(node.text);
}

function realBoundaryUseOf(node: typescript.Node): string | null {
  if (typescript.isCallExpression(node) && isModuleLoad(node)) return isRealBoundaryModule(node.arguments[0]) ? REAL_BOUNDARY_EXPORT : null;
  if (!typescript.isImportDeclaration(node) || importsOnlyTypes(node)) return null;
  const importsTheWholeBoundaryModule = importsTheWholeModule(node) && isRealBoundaryModule(node.moduleSpecifier);
  const reachesTheRealBoundary = importedNamesOf(node).includes(REAL_BOUNDARY_EXPORT) || importsTheWholeBoundaryModule;
  return reachesTheRealBoundary ? REAL_BOUNDARY_EXPORT : null;
}

function programReachesIn(path: string, sourceText: string): ProgramReaches {
  const sourceFile = typescript.createSourceFile(path, sourceText, typescript.ScriptTarget.Latest, true);
  const directStarts     = new Set<string>();
  const realBoundaryUses = new Set<string>();
  const visit = (node: typescript.Node): void => {
    const directStart     = directStartOf(node);
    const realBoundaryUse = realBoundaryUseOf(node);
    if (directStart !== null) directStarts.add(directStart);
    if (realBoundaryUse !== null) realBoundaryUses.add(realBoundaryUse);
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { directStarts: [...directStarts].sort(), realBoundaryUses: [...realBoundaryUses] };
}

function isSpec(path: string): boolean {
  return path.endsWith('.spec.ts') || path.endsWith('.spec.tsx');
}

function isTestingFile(path: string): boolean {
  return isSpec(path) || path.split('/').includes('testing');
}

interface ScannedSource {
  readonly path:    string;
  readonly reaches: ProgramReaches;
}

function repositorySources(): ScannedSource[] {
  const repositoryRoot = join(import.meta.dir, '..');
  return SCANNED_FOLDERS
    .flatMap((folder) => [...new Bun.Glob(`${folder}/**/*.{ts,tsx}`).scanSync({ cwd: repositoryRoot })])
    .map((path) => ({ path, reaches: programReachesIn(path, readFileSync(join(repositoryRoot, path), 'utf8')) }));
}

function programRunViolationsOf(sources: readonly ScannedSource[]): string[] {
  const directStarters = sources.filter(({ reaches }) => reaches.directStarts.length > 0);
  const testingBoundaryUsers = sources.filter(({ path, reaches }) => reaches.realBoundaryUses.length > 0 && isTestingFile(path) && !path.endsWith(RECORDING_SPEC_SUFFIX));
  const directStarterPaths       = new Set(directStarters.map(({ path }) => path));
  const testingBoundaryUserPaths = new Set(testingBoundaryUsers.map(({ path }) => path));
  return [
    ...directStarters.filter(({ path }) => !Object.hasOwn(DIRECT_PROCESS_STARTS_ALLOWED, path))
      .map(({ path, reaches }) => `${path} starts a program with ${reaches.directStarts.join(', ')}; reach it through process-run, and in a spec through RecordedRuns`),
    ...Object.keys(DIRECT_PROCESS_STARTS_ALLOWED).filter((path) => !directStarterPaths.has(path))
      .map((path) => `${path} is allowed a direct start but makes none; remove it from the list`),
    ...testingBoundaryUsers.filter(({ path }) => !Object.hasOwn(REAL_BOUNDARY_USES_ALLOWED_IN_TESTING, path))
      .map(({ path }) => `${path} uses the real ${REAL_BOUNDARY_EXPORT}; a spec uses recordedProcessRun, and only a recording spec runs the real one`),
    ...Object.keys(REAL_BOUNDARY_USES_ALLOWED_IN_TESTING).filter((path) => !testingBoundaryUserPaths.has(path))
      .map((path) => `${path} is allowed the real ${REAL_BOUNDARY_EXPORT} but does not use it; remove it from the list`),
  ];
}

describe('the programs a file may start', () => {
  test('the scan sees the specs and the boundary of the repository', () => {
    const scannedPaths = repositorySources().map(({ path }) => path);
    expect(scannedPaths).toContain('src/RealProgramRuns.spec.ts');
    expect(scannedPaths).toContain('src/lib/process-run/ProcessRun.ts');
    expect(scannedPaths.filter(isSpec).length).toBeGreaterThanOrEqual(MINIMUM_SCANNED_SPEC_COUNT);
  });

  test('no file starts a program outside process-run, and no spec runs the real process-run, beyond the exact lists', () => {
    expect(programRunViolationsOf(repositorySources())).toEqual([]);
  });
});

describe('the guard on program starts', () => {
  const plantedForms: readonly (readonly [string, string])[] = [
    ['Bun.spawn(["git", "status"]);', 'Bun.spawn'],
    ['Bun.spawnSync(["git", "status"]);', 'Bun.spawnSync'],
    ['await Bun.$`git status`;', 'Bun.$'],
    ['Bun["spawn"](["git"]);', 'Bun.spawn'],
    ['const { spawnSync } = Bun;', 'Bun.spawnSync'],
    ['import { $ } from "bun";', 'Bun.$'],
    ['import { spawn, spawnSync } from "bun";', 'Bun.spawn, Bun.spawnSync'],
    ['import { spawnSync as startProgram } from "bun";', 'Bun.spawnSync'],
    ['import * as bunModule from "bun";', WHOLE_BUN_MODULE_FORM],
    ['import bunModule from "bun";', WHOLE_BUN_MODULE_FORM],
    ['const loaded = await import("bun");', WHOLE_BUN_MODULE_FORM],
    ['import { execFileSync } from "node:child_process";', 'child_process'],
    ['import childProcess from "child_process";', 'child_process'],
    ['const loaded = await import("node:child_process");', 'child_process'],
    ['const loaded = require("child_process");', 'child_process'],
  ];

  for (const [plantedSource, expectedForm] of plantedForms) {
    test(`names ${expectedForm} in a planted ${plantedSource}`, () => {
      expect(programReachesIn('src/Planted.spec.ts', plantedSource).directStarts).toEqual([expectedForm]);
    });
  }

  const plantedBoundaryReaches: readonly string[] = [
    'import * as processRunModule from "../lib/process-run/ProcessRun.ts";',
    'const loaded = await import("../lib/process-run/ProcessRun.ts");',
    'const loaded = require("../lib/process-run/ProcessRun");',
  ];

  for (const plantedSource of plantedBoundaryReaches) {
    test(`names the real process-run reached through a planted ${plantedSource}`, () => {
      expect(programReachesIn('src/Planted.spec.ts', plantedSource).realBoundaryUses).toEqual([REAL_BOUNDARY_EXPORT]);
    });
  }

  test('does not count a named import from bun that starts no program', () => {
    expect(programReachesIn('src/Planted.spec.ts', 'import { plugin } from "bun";').directStarts).toEqual([]);
  });

  test('does not count a mention in a string, a comment or a type-only import', () => {
    const mentions = '// Bun.spawn\nconst sentence = "Bun.spawnSync and child_process";\nimport type { ChildProcess } from "node:child_process";';
    expect(programReachesIn('src/Planted.spec.ts', mentions)).toEqual({ directStarts: [], realBoundaryUses: [] });
  });

  test('names a planted spec that starts a program directly, or uses the real process-run, and passes a recording spec', () => {
    const realBoundaryImport = 'import { realProcessRun } from "../lib/process-run/ProcessRun.ts";';
    const violations = programRunViolationsOf([
      { path: 'src/lib/process-run/ProcessRun.ts', reaches: programReachesIn('ProcessRun.ts', 'Bun.spawn([]);') },
      { path: 'src/Main.spec.ts', reaches: programReachesIn('Main.spec.ts', 'Bun.spawnSync([]);') },
      { path: 'src/Main.serve.spec.ts', reaches: programReachesIn('Main.serve.spec.ts', 'Bun.spawn([]);') },
      { path: 'src/testing/LeakCheck.ts', reaches: programReachesIn('LeakCheck.ts', 'Bun.spawnSync([]);') },
      { path: 'src/testing/LeakCheck.spec.ts', reaches: programReachesIn('LeakCheck.spec.ts', 'Bun.spawnSync([]);') },
      { path: 'page/testing/RunDomSpecs.ts', reaches: programReachesIn('RunDomSpecs.ts', 'Bun.spawnSync([]);') },
      { path: 'page/lib/design-system/testing/RunDomSpecs.ts', reaches: programReachesIn('RunDomSpecs.ts', 'Bun.spawnSync([]);') },
      { path: 'page/lib/flint/testing/RunDomSpecs.ts', reaches: programReachesIn('RunDomSpecs.ts', 'Bun.spawnSync([]);') },
      { path: 'page/lib/brand/testing/RunDomSpecs.ts', reaches: programReachesIn('RunDomSpecs.ts', 'Bun.spawnSync([]);') },
      { path: 'page/lib/flint/testing/HeadlessChrome.ts', reaches: programReachesIn('HeadlessChrome.ts', 'Bun.spawn([]);') },
      { path: 'src/testing/RecordBoundary.ts', reaches: programReachesIn('RecordBoundary.ts', realBoundaryImport) },
      { path: 'src/testing/ScratchForge.ts', reaches: programReachesIn('ScratchForge.ts', realBoundaryImport) },
      { path: 'src/features/example/Example.spec.ts', reaches: programReachesIn('Example.spec.ts', 'Bun.spawnSync([]);') },
      { path: 'src/features/example/Other.spec.ts', reaches: programReachesIn('Other.spec.ts', realBoundaryImport) },
      { path: 'src/features/example/Example.recording.spec.ts', reaches: programReachesIn('Example.recording.spec.ts', realBoundaryImport) },
      { path: 'src/features/example/Example.ts', reaches: programReachesIn('Example.ts', realBoundaryImport) },
    ]);
    expect(violations).toEqual([
      'src/features/example/Example.spec.ts starts a program with Bun.spawnSync; reach it through process-run, and in a spec through RecordedRuns',
      'src/features/example/Other.spec.ts uses the real realProcessRun; a spec uses recordedProcessRun, and only a recording spec runs the real one',
    ]);
  });

  test('names an allowed file that no longer makes its reach, so each list stays exact', () => {
    expect(programRunViolationsOf([])).toEqual([
      ...Object.keys(DIRECT_PROCESS_STARTS_ALLOWED).map((path) => `${path} is allowed a direct start but makes none; remove it from the list`),
      ...Object.keys(REAL_BOUNDARY_USES_ALLOWED_IN_TESTING).map((path) => `${path} is allowed the real realProcessRun but does not use it; remove it from the list`),
    ]);
  });
});
