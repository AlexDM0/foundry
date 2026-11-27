/**
 * Code documents itself: an inline comment is a why of one or two lines, any comment (file headers and docblocks included) holds at most
 * five lines, and no comment names a ticket, acceptance or question id, a plan section or an artboard. Comments are read from the syntax
 * tree, so `//` in a string is not one; the scan proves it read runs of each size, and each form is planted.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

interface ScannedSource {
  readonly path: string;
  readonly text: string;
}

interface CommentRun {
  readonly firstLine:  number;
  readonly lineCount:  number;
  readonly isDocblock: boolean;
  readonly text:       string;
}

const LONGEST_INLINE_COMMENT_LINES = 2;
const LONGEST_COMMENT_LINES = 5;
// A ticket, acceptance or question id (`E85`, `A4`, `W5.6`), an artboard (`A2Proposal`), a work package or a plan section.
const REFERENCE_PATTERNS: readonly RegExp[] = [
  /\b[A-Z]\d{1,3}(?:\.\d+)*\b/,
  /\b[A-Z]\d[A-Z][a-z]/,
  /\bWP\s?\d/,
  /\bplan\s+(?:section\s+)?\d/i,
  /\b(?:ticket|acceptance)\s+#?\d/i,
];

/** Files with comments longer than five lines, each with its count; the sweep shrinks this to nothing and nothing joins it. */
const LONG_COMMENTS_AWAITING_THE_SWEEP: Readonly<Record<string, number>> = {
  'architecture/AgentVendorNames.spec.ts':                1,
  'architecture/LibraryBoundaries.spec.ts':               1,
  'architecture/PageImportDirection.spec.ts':             1,
  'architecture/RealProgramRuns.spec.ts':                 1,
  'architecture/StyleContract.spec.ts':                   1,
  'architecture/WorkspaceDependencies.spec.ts':           1,
  'page/shell/BrandStatusModel.spec.ts':                  1,
  'page/shell/GaiaApp.spec.tsx':                          1,
  'page/shell/GaiaApp.tsx':                               1,
  'page/shell/PageClock.spec.ts':                         1,
  'page/shell/Rail.spec.tsx':                             1,
  'page/shell/RailModel.setup.spec.ts':                   1,
  'page/shell/RailModel.spec.ts':                         1,
  'page/shell/RailModel.ts':                              1,
  'page/testing/ArtboardScreens.tsx':                     1,
  'page/testing/MarkupTree.spec.ts':                      1,
  'page/testing/MarkupTree.ts':                           1,
  'page/testing/ReactElementTree.spec.tsx':               1,
  'page/testing/ReactElementTree.ts':                     1,
  'page/testing/RunDomSpecs.ts':                          1,
  'page/testing/fixtures/fleet-outage-endings.ts':        1,
  'page/testing/fixtures/fleet-versions.ts':              1,
  'page/testing/fixtures/storefront-tickets-board.ts':    1,
  'page/views/activity/ActivityModel.spec.ts':            1,
  'page/views/activity/ActivityModel.ts':                 1,
  'page/views/activity/ActivityView.spec.tsx':            1,
  'page/views/activity/ActivityView.tsx':                 1,
  'page/views/agents/AgentsModel.spec.ts':                1,
  'page/views/agents/AgentsModel.ts':                     1,
  'page/views/agents/AgentsView.spec.tsx':                2,
  'page/views/agents/SelectedAgentPanel.spec.tsx':        1,
  'page/views/attention/AttentionLayout.spec.tsx':        1,
  'page/views/attention/AttentionLayout.tsx':             1,
  'page/views/attention/AttentionModel.spec.ts':          1,
  'page/views/attention/AttentionView.spec.tsx':          1,
  'page/views/attention/NoForgeYet.spec.tsx':             1,
  'page/views/attention/NoForgeYet.tsx':                  1,
  'page/views/forge/ForgeLayout.setup.spec.tsx':          1,
  'page/views/forge/ForgeLayout.spec.tsx':                1,
  'page/views/forge/ForgeLayout.tsx':                     1,
  'page/views/forge/ForgeLayout.versions.spec.tsx':       1,
  'page/views/forge/ForgeModel.runningVersions.spec.tsx': 1,
  'page/views/forge/ForgeModel.spec.ts':                  1,
  'page/views/forge/ForgeModel.ts':                       1,
  'page/views/forge/ForgeModel.versions.spec.ts':         1,
  'page/views/forge/ForgePresenceModel.spec.ts':          1,
  'page/views/forge/ForgePresenceModel.ts':               1,
  'page/views/forge/ForgeView.spec.tsx':                  1,
  'page/views/forge/ForgeView.tsx':                       1,
  'page/views/forges/AddRepositoryDialog.spec.tsx':       1,
  'page/views/forges/AddRepositoryDialog.tsx':            1,
  'page/views/forges/ForgesLayout.spec.tsx':              1,
  'page/views/forges/ForgesLayout.tsx':                   1,
  'page/views/forges/ForgesModel.spec.ts':                1,
  'page/views/forges/ForgesModel.ts':                     1,
  'page/views/forges/ForgesView.spec.tsx':                1,
  'page/views/forges/ForgesView.tsx':                     1,
  'page/views/forges/GaiaPanel.spec.tsx':                 1,
  'page/views/forges/GaiaPanel.tsx':                      1,
  'page/views/forges/GaiaPanelModel.spec.ts':             1,
  'page/views/forges/GaiaPanelModel.ts':                  1,
  'page/views/forges/WhatNotifiesDialog.tsx':             1,
};

/** Files whose comments name a reference, each with its count of such comments; it only shrinks. */
const REFERENCES_AWAITING_THE_SWEEP: Readonly<Record<string, number>> = {
  'page/shell/BrandStatusModel.spec.ts':               1,
  'page/shell/GaiaApp.spec.tsx':                       1,
  'page/shell/RailModel.spec.ts':                      1,
  'page/shell/RailModel.ts':                           1,
  'page/shell/WindowTitle.spec.ts':                    1,
  'page/testing/ArtboardScreens.tsx':                  27,
  'page/testing/VersionsPartsSheet.spec.tsx':          1,
  'page/testing/VersionsPartsSheet.tsx':               3,
  'page/testing/fixtures/fleet-at-limit.spec.ts':      1,
  'page/testing/fixtures/fleet-at-limit.ts':           1,
  'page/testing/fixtures/fleet-degraded.spec.ts':      1,
  'page/testing/fixtures/fleet-degraded.ts':           1,
  'page/testing/fixtures/fleet-empty.spec.ts':         1,
  'page/testing/fixtures/fleet-empty.ts':              1,
  'page/testing/fixtures/fleet-five-forges.spec.ts':   1,
  'page/testing/fixtures/fleet-five-forges.ts':        1,
  'page/testing/fixtures/fleet-outage-endings.ts':     1,
  'page/testing/fixtures/fleet-versions.ts':           3,
  'page/testing/fixtures/storefront-board.ts':         1,
  'page/testing/fixtures/storefront-tickets-board.ts': 1,
  'page/views/activity/ActivityModel.spec.ts':         1,
  'page/views/activity/ActivityView.spec.tsx':         1,
  'page/views/activity/ActivityView.tsx':              1,
  'page/views/agents/AgentsModel.spec.ts':             1,
  'page/views/agents/AgentsTable.tsx':                 1,
  'page/views/agents/AgentsView.spec.tsx':             3,
  'page/views/agents/AgentsView.tsx':                  1,
  'page/views/attention/AttentionLayout.spec.tsx':     1,
  'page/views/attention/AttentionLayout.tsx':          1,
  'page/views/attention/AttentionModel.spec.ts':       1,
  'page/views/attention/AttentionModel.ts':            11,
  'page/views/attention/AttentionView.spec.tsx':       1,
  'page/views/attention/AttentionView.tsx':            2,
  'page/views/attention/NoForgeYet.spec.tsx':          1,
  'page/views/attention/NoForgeYet.tsx':               1,
  'page/views/forge/ForgeLayout.spec.tsx':             1,
  'page/views/forge/ForgeLayout.tsx':                  1,
  'page/views/forge/ForgeLayout.versions.spec.tsx':    1,
  'page/views/forge/ForgeModel.spec.ts':               1,
  'page/views/forge/ForgeModel.ts':                    1,
  'page/views/forge/ForgeModel.versions.spec.ts':      1,
  'page/views/forge/ForgeView.spec.tsx':               1,
  'page/views/forge/ForgeView.tsx':                    1,
  'page/views/forges/AddRepositoryDialog.spec.tsx':    1,
  'page/views/forges/AddRepositoryDialog.tsx':         1,
  'page/views/forges/ForgesLayout.spec.tsx':           1,
  'page/views/forges/ForgesLayout.tsx':                1,
  'page/views/forges/ForgesModel.spec.ts':             2,
  'page/views/forges/ForgesModel.ts':                  8,
  'page/views/forges/ForgesView.spec.tsx':             1,
  'page/views/forges/GaiaPanel.spec.tsx':              1,
  'page/views/forges/GaiaPanel.tsx':                   2,
  'page/views/forges/GaiaPanelModel.spec.ts':          1,
  'page/views/forges/GaiaPanelModel.ts':               2,
  'page/views/forges/WhatNotifiesDialog.spec.tsx':     1,
  'page/views/forges/WhatNotifiesDialog.tsx':          2,
};
const ONLY_A_LINE_BREAK_BETWEEN = /^[ \t]*\r?\n[ \t]*$/;

interface CommentRanges {
  readonly ranges:                          ts.CommentRange[];
  readonly positionsLeadingADocumentedNode: ReadonlySet<number>;
}

const DOCUMENTED_DECLARATION_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.ExportAssignment,
]);
// A tool-gated `describeWhen…` and `testWhen…` takes a docblock the same way.
const DOCUMENTED_CALLEE_NAME = /^(?:test|describe|it)(?:When[A-Z]\w*)?$/;

function calleeRootNameOf(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression)) {
    return calleeRootNameOf(expression.expression);
  }
  return null;
}

function nodeTakesADocblock(node: ts.Node): boolean {
  if (DOCUMENTED_DECLARATION_KINDS.has(node.kind)) {
    return true;
  }
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
    const calleeName = calleeRootNameOf(node.expression.expression);
    return calleeName !== null && DOCUMENTED_CALLEE_NAME.test(calleeName);
  }
  return false;
}

function commentRangesOf(sourceFile: ts.SourceFile): CommentRanges {
  const rangesByPosition = new Map<number, ts.CommentRange>();
  const positionsLeadingADocumentedNode = new Set<number>();
  const text = sourceFile.getFullText();
  const collect = (node: ts.Node): void => {
    const leadingRanges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    for (const range of [...leadingRanges, ...ts.getTrailingCommentRanges(text, node.getEnd()) ?? []]) {
      rangesByPosition.set(range.pos, range);
    }
    if (nodeTakesADocblock(node)) {
      leadingRanges.forEach((range) => positionsLeadingADocumentedNode.add(range.pos));
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  collect(sourceFile.endOfFileToken);
  return { ranges: [...rangesByPosition.values()].sort((a, b) => a.pos - b.pos), positionsLeadingADocumentedNode };
}

function commentRunsOf(path: string, text: string): CommentRun[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const lineOf = (position: number): number => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const { ranges, positionsLeadingADocumentedNode } = commentRangesOf(sourceFile);
  const firstCodePosition = sourceFile.statements[0]?.getStart(sourceFile) ?? sourceFile.endOfFileToken.getStart(sourceFile);
  const isDocblock = (range: ts.CommentRange, index: number): boolean => text.startsWith('/**', range.pos)
    && ((index === 0 && range.end <= firstCodePosition) || positionsLeadingADocumentedNode.has(range.pos));
  const runs: CommentRun[] = [];
  let previous: ts.CommentRange | null = null;
  for (const [index, range] of ranges.entries()) {
    const commentText = text.slice(range.pos, range.end);
    const lineCount = lineOf(range.end) - lineOf(range.pos) + 1;
    if (isDocblock(range, index)) {
      runs.push({
        firstLine: lineOf(range.pos), lineCount, isDocblock: true, text: commentText
      });
      previous = null;
      continue;
    }
    const lastRun = runs.at(-1);
    const continuesTheRun = previous !== null && lastRun !== undefined && range.kind === ts.SyntaxKind.SingleLineCommentTrivia
      && previous.kind === ts.SyntaxKind.SingleLineCommentTrivia && ONLY_A_LINE_BREAK_BETWEEN.test(text.slice(previous.end, range.pos));
    if (continuesTheRun) {
      runs[runs.length - 1] = { ...lastRun, lineCount: lastRun.lineCount + lineCount, text: `${lastRun.text}\n${commentText}` };
    } else {
      runs.push({
        firstLine: lineOf(range.pos), lineCount, isDocblock: false, text: commentText
      });
    }
    previous = range;
  }
  return runs;
}

function commentWallsIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => !run.isDocblock && run.lineCount > LONGEST_INLINE_COMMENT_LINES)
    .map((run) => `${path}:${run.firstLine} holds a ${run.lineCount}-line comment`);
}

function commentWallsOf(path: string, text: string): string[] {
  return commentWallsIn(path, commentRunsOf(path, text));
}

function longCommentsIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => run.lineCount > LONGEST_COMMENT_LINES)
    .map((run) => `${path}:${run.firstLine} holds a ${run.lineCount}-line comment`);
}

const CODE_SPAN = /`[^`\n]*`/g;

function namesAReference(commentText: string): boolean {
  const prose = commentText.replace(CODE_SPAN, '');
  return REFERENCE_PATTERNS.some((pattern) => pattern.test(prose));
}

function referencesIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => namesAReference(run.text))
    .map((run) => `${path}:${run.firstLine} names a ticket, acceptance, plan or artboard reference`);
}

function countsPerFile(findings: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) {
    const path = finding.slice(0, finding.indexOf(':'));
    counts[path] = (counts[path] ?? 0) + 1;
  }
  return counts;
}

const SCANNED_FOLDERS = ['src', 'page', 'architecture'];
const LIBRARY_FOLDERS = ['page/lib/design-system/', 'page/lib/flint/', 'page/lib/brand/'];
const UNSCANNED_PATH_PARTS = ['node_modules', 'storybook-static'];

function gaiaSources(): ScannedSource[] {
  const gaiaRoot = join(import.meta.dir, '..');
  return SCANNED_FOLDERS
    .flatMap((folder) => [...new Bun.Glob(`${folder}/**/*.{ts,tsx}`).scanSync({ cwd: gaiaRoot })])
    .filter((path) => !path.split('/').some((part) => UNSCANNED_PATH_PARTS.includes(part)))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(gaiaRoot, path), 'utf8') }));
}

const SOURCES = gaiaSources();
const runsBySource = new Map(SOURCES.map((source) => [source, commentRunsOf(source.path, source.text)]));
const commentRunsOfSource = (source: ScannedSource): CommentRun[] => runsBySource.get(source) ?? [];

test('the scan reads the server, the page and each library', () => {
  const paths = SOURCES.map((source) => source.path);
  expect(paths).toEqual(expect.arrayContaining(['src/Main.ts', 'page/Main.tsx']));
  for (const libraryFolder of LIBRARY_FOLDERS) {
    expect(paths.some((path) => path.startsWith(libraryFolder))).toBe(true);
  }
});

describe('no inline comment runs past two lines', () => {
  test('the scan reads inline comments of one line and of two lines across the tree', () => {
    const runLengths = SOURCES.flatMap((source) => commentRunsOfSource(source).filter((run) => !run.isDocblock).map((run) => run.lineCount));
    expect(runLengths.filter((lineCount) => lineCount === 1).length).toBeGreaterThan(LONGEST_INLINE_COMMENT_LINES);
    expect(runLengths.filter((lineCount) => lineCount === LONGEST_INLINE_COMMENT_LINES).length).toBeGreaterThan(LONGEST_INLINE_COMMENT_LINES);
  });

  test('no file in the tree holds a comment wall', () => {
    expect(SOURCES.flatMap((source) => commentWallsIn(source.path, commentRunsOfSource(source)))).toEqual([]);
  });

  test.each([
    ['three `//` lines in a function', 'function work(): void {\n  // one\n  // two\n  // three\n  run();\n}\n'],
    ['three `//` lines opening a file', '// one\n// two\n// three\nexport const VALUE = 1;\n'],
    ['three `//` lines closing a file', 'export const VALUE = 1;\n// one\n// two\n// three\n'],
    ['a three-line block comment', 'function work(): void {\n  /* one\n     two\n     three */\n  run();\n}\n'],
    ['a three-line `/** */` above a call in a function', 'function work(): void {\n  /** one\n   * two\n   * three */\n  run();\n}\n'],
    ['a three-line `/** */` above a return in a callback', 'run(() => {\n  /** one\n   * two\n   * three */\n  return 1;\n});\n'],
    ['a three-line `/** */` below the code that opens a file', 'run();\n/** one\n * two\n * three */\nrun();\n'],
  ])('a planted wall of %s is named', (_form, plantedText) => {
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([expect.stringContaining('3-line comment')]);
  });

  const documentedLine = (code: string): string => `/**\n * A docblock of\n * four lines.\n */\n${code}\n`;
  test.each([
    ['a file header', documentedLine('import { run } from \'./Run.ts\';')],
    ['a function', 'run();\n' + documentedLine('function work(): void {}')],
    [
      'a class, its constructor, method, accessor and property',
      documentedLine('class Work {') + documentedLine('readonly size = 1;') + documentedLine('constructor() {}') + documentedLine('run(): void {}')
        + documentedLine('get total(): number { return 1; }') + '}\n',
    ],
    ['an interface and its members', documentedLine('interface Work {') + documentedLine('readonly size: number;') + documentedLine('run(): void;') + '}\n'],
    ['a type alias', 'run();\n' + documentedLine('type Work = number;')],
    ['an enum and its member', documentedLine('enum Work {') + documentedLine('Done,') + '}\n'],
    ['a variable statement in a function', 'function work(): void {\n' + documentedLine('const size = 1;') + 'run(size);\n}\n'],
    ['an object literal property', 'run({\n' + documentedLine('size: 1,') + '});\n'],
    [
      'a tool-gated `describeWhen…()` and `testWhen…()` call',
      'run();\n' + documentedLine('describeWhenGitIsPresent(\'work\', () => {') + documentedLine('testWhenBashIsPresent(\'runs\', () => {});') + '});\n',
    ],
    ['an export', 'run();\n' + documentedLine('export { run };') + documentedLine('export default run;')],
    [
      'a `test()` and a `test.each()()` call in a `describe()` call',
      'run();\n' + documentedLine('describe(\'work\', () => {') + documentedLine('test(\'runs\', () => {});')
        + documentedLine('test.each([1])(\'runs %d\', () => {});') + documentedLine('it(\'runs\', () => {});') + '});\n',
    ],
  ])('a long docblock leading %s passes', (_form, plantedText) => {
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([]);
  });

  test('a two-line comment, a long docblock, trailing comments on code lines and `//` inside strings pass', () => {
    const plantedText = [
      '/**',
      ' * A header of',
      ' * four lines.',
      ' */',
      'function work(): void {',
      '  // one',
      '  // two',
      '  run(); // a',
      '  run(); // b',
      '  run(); // c',
      '  const address = `https://example.com/${"//"}`;',
      '  const other = \'// not a comment\';',
      '}',
    ].join('\n');
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([]);
  });
});

describe('no comment runs past five lines', () => {
  test('the scan reads docblocks of up to five lines across the tree', () => {
    const docblockLengths = SOURCES.flatMap((source) => commentRunsOfSource(source).filter((run) => run.isDocblock).map((run) => run.lineCount));
    expect(docblockLengths.filter((lineCount) => lineCount === LONGEST_COMMENT_LINES).length).toBeGreaterThan(LONGEST_COMMENT_LINES);
  });

  test('only the files awaiting the sweep hold a longer comment, each as often as listed', () => {
    expect(countsPerFile(SOURCES.flatMap((source) => longCommentsIn(source.path, commentRunsOfSource(source)))))
      .toEqual(LONG_COMMENTS_AWAITING_THE_SWEEP);
  });

  test.each([
    ['a six-line file header', '/**\n * one\n * two\n * three\n * four\n */\nexport const VALUE = 1;\n'],
    ['a six-line docblock on a function', 'run();\n/**\n * one\n * two\n * three\n * four\n */\nfunction work(): void {}\n'],
  ])('a planted %s is named', (_form, plantedText) => {
    expect(longCommentsIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([expect.stringContaining('6-line comment')]);
  });

  test('a five-line docblock passes', () => {
    const plantedText = '/**\n * one\n * two\n * three\n */\nexport const VALUE = 1;\n';
    expect(longCommentsIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([]);
  });
});

describe('no comment names a ticket, acceptance, plan or artboard reference', () => {
  test('only the files awaiting the sweep name one, each as often as listed', () => {
    expect(countsPerFile(SOURCES.flatMap((source) => referencesIn(source.path, commentRunsOfSource(source)))))
      .toEqual(REFERENCES_AWAITING_THE_SWEEP);
  });

  test.each([
    ['a ticket id', '// Refused outside its entity (E85).\nrun();\n'],
    ['an acceptance id with a part', '// As W5.6 asks.\nrun();\n'],
    ['an artboard', '/** The A2Proposal board. */\nfunction work(): void {}\n'],
    ['a work package', '// Removed by WP2.\nrun();\n'],
    ['a plan section', '// See PLAN 7.3.\nrun();\n'],
    ['a ticket number', '// Filed as ticket 12.\nrun();\n'],
  ])('a planted %s is named', (_form, plantedText) => {
    expect(referencesIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toHaveLength(1);
  });

  test('a pointer to a tracked document, a version, an id format in a code span and an id in code pass', () => {
    const plantedText = '// Why: `docs/cli.md`, "Exit codes", on ES2022 and UTF-8; ids run `P1`, `P2`.\nconst id = \'E85\';\n';
    expect(referencesIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([]);
  });
});
