/**
 * Two Tests rules of the root `CLAUDE.md`: a suite is a `.spec.ts` file, never `.test.ts`, `.spec.tsx` or `.dom.tsx`, since forge has
 * no page and runs no DOM suite, and no spec or test helper creates the real
 * process context, whose working directory, clock and home are the live ones. The context is found by its factory's name as an identifier
 * in the syntax tree, so a sentence naming it is not a use. The scan first proves it saw the specs and the factory's real callers, and
 * each form is planted to prove the guard names it.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { repositoryRootOfThisCheckout }                from './testing/ImportGraph.ts';
import type { RepositorySource }                       from './testing/RepositorySources.ts';
import { memoisedPerSource, programTypeScriptSources } from './testing/RepositorySources.ts';

const PROCESS_CONTEXT_FACTORY = 'createProcessContext';
const RETIRED_TEST_SUFFIX = '.test.ts';
const UNRUN_COMPONENT_SPEC_SUFFIX = '.spec.tsx';
const DOM_SPEC_SUFFIX = '.dom.tsx';
const MINIMUM_SPEC_FILE_COUNT = 100;

function isTestCode(path: string): boolean {
  return path.endsWith('.spec.ts') || path.endsWith(DOM_SPEC_SUFFIX) || path.includes('/testing/') || path.startsWith('testing/');
}

function namesTheProcessContextFactoryIn(sourceFile: ts.SourceFile): boolean {
  const visit = (node: ts.Node): boolean => (ts.isIdentifier(node) && node.text === PROCESS_CONTEXT_FACTORY) || ts.forEachChild(node, visit) === true;
  return visit(sourceFile);
}

const OVERSEER_START_WORD     = 'oversee';
/** `start` starts the Overseer detached; as a word it is common, so only an argument list a command line runner is given counts. */
const START_VERB_WORD         = 'start';
const COMMAND_LINE_RUNNERS    = new Set(['runAgentProgress', 'startAgentProgress', 'runCommandLine', 'runAgentProgressBesideRecordedGit']);
const OVERSEER_SUBCOMMANDS    = new Set(['stop', 'restart', 'pause', 'resume', 'status', 'talos-restart']);
const ANY_FREE_PORT_OPTION  = ['--port', '0'];

function stringElementOf(element: ts.Expression | undefined): string | null {
  return element !== undefined && ts.isStringLiteralLike(element) ? element.text : null;
}

/**
 * An argument list that starts an Overseer, `['oversee', …]` with no subcommand or `['start', …]`, binds `--port 0`, so no spec takes a board's
 * real port.
 */
function startsAnOverseerOnAFixedPort(array: ts.ArrayLiteralExpression): boolean {
  const elements = [...array.elements];
  const startWord = stringElementOf(elements[0]);
  const givenToARunner = ts.isCallExpression(array.parent) && ts.isIdentifier(array.parent.expression) && COMMAND_LINE_RUNNERS.has(array.parent.expression.text);
  if (startWord !== OVERSEER_START_WORD && !(startWord === START_VERB_WORD && givenToARunner)) return false;
  if (OVERSEER_SUBCOMMANDS.has(stringElementOf(elements[1]) ?? '')) return false;
  return !elements.some((element, index) => stringElementOf(element) === ANY_FREE_PORT_OPTION[0] && stringElementOf(elements[index + 1]) === ANY_FREE_PORT_OPTION[1]);
}

function overseerStartsOnAFixedPortIn(sourceFile: ts.SourceFile): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node) && startsAnOverseerOnAFixedPort(node)) count++;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

interface SyntaxFacts {
  readonly namesTheProcessContextFactory: boolean;
  readonly overseerStartsOnAFixedPort:    number;
}

const NO_SYNTAX_FACTS: SyntaxFacts = { namesTheProcessContextFactory: false, overseerStartsOnAFixedPort: 0 };

/** Both forms spell out a word, the factory's name or a start word, so a source holding none needs no syntax tree. */
const syntaxFactsOf = memoisedPerSource((source): SyntaxFacts => {
  const namesAStartWord = source.text.includes(OVERSEER_START_WORD) || source.text.includes(START_VERB_WORD);
  if (!source.text.includes(PROCESS_CONTEXT_FACTORY) && !namesAStartWord) return NO_SYNTAX_FACTS;
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  return { namesTheProcessContextFactory: namesTheProcessContextFactoryIn(sourceFile), overseerStartsOnAFixedPort: overseerStartsOnAFixedPortIn(sourceFile) };
});

function namesTheProcessContextFactory(source: RepositorySource): boolean {
  return syntaxFactsOf(source).namesTheProcessContextFactory;
}

function testFileViolationsOf(sources: readonly RepositorySource[]): string[] {
  return [
    ...sources.filter((source) => source.path.endsWith(RETIRED_TEST_SUFFIX)).map((source) => `${source.path} is a .test.ts file`),
    // `bun test` would run a `.spec.tsx` without a DOM, and nothing runs a `.dom.tsx`.
    ...sources.filter((source) => source.path.endsWith(UNRUN_COMPONENT_SPEC_SUFFIX)).map((source) => `${source.path} is a .spec.tsx file`),
    ...sources.filter((source) => source.path.endsWith(DOM_SPEC_SUFFIX)).map((source) => `${source.path} is a DOM spec, which nothing in forge runs`),
    ...sources.filter((source) => isTestCode(source.path) && namesTheProcessContextFactory(source))
      .map((source) => `${source.path} creates the real process context`),
    ...sources.filter((source) => isTestCode(source.path) && syntaxFactsOf(source).overseerStartsOnAFixedPort > 0)
      .map((source) => `${source.path} starts an Overseer without --port 0`),
  ];
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());

describe('suites are spec files that never create the real process context', () => {
  test('the scan sees the specs and the factory\'s real callers outside them', () => {
    expect(SOURCES.filter((source) => source.path.endsWith('.spec.ts')).length).toBeGreaterThan(MINIMUM_SPEC_FILE_COUNT);
    expect(SOURCES.filter(namesTheProcessContextFactory).map((source) => source.path)).toEqual(['agent-progress.ts', 'cli/CommandContext.ts']);
  });

  test('no file in the tree breaks either rule', () => {
    expect(testFileViolationsOf(SOURCES)).toEqual([]);
  });

  const importingTheFactory = `import { ${PROCESS_CONTEXT_FACTORY} } from '../cli/CommandContext.ts';\nconst context = ${PROCESS_CONTEXT_FACTORY}();\n`;

  test.each([
    ['a `.test.ts` suite', { path: 'cli/Example.test.ts', text: 'export {};\n' }],
    ['a `.spec.tsx` suite', { path: 'cli/Example.spec.tsx', text: 'export {};\n' }],
    ['a DOM spec', { path: 'cli/Example.dom.tsx', text: 'export {};\n' }],
    ['a spec creating the context', { path: 'cli/Example.spec.ts', text: importingTheFactory }],
    ['a test helper creating the context', { path: 'cli/testing/ExampleHelper.ts', text: importingTheFactory }],
  ])('a planted %s is named', (_form, plantedSource) => {
    expect(testFileViolationsOf([plantedSource])).toEqual([expect.stringContaining(plantedSource.path)]);
  });

  test('the scan sees the specs that start an Overseer, all on --port 0', () => {
    const startingOverseers = SOURCES.filter((source) => isTestCode(source.path) && source.text.includes(`'${ANY_FREE_PORT_OPTION[0]}', '${ANY_FREE_PORT_OPTION[1]}'`));
    expect(startingOverseers.map((source) => source.path)).toContain('cli/overseer/OverseerCommand.integration.spec.ts');
  });

  test.each([
    ['a bare start', 'runAgentProgress([\'oversee\'], options);'],
    ['a detached start', 'runAgentProgress([\'oversee\', \'--detach\'], options);'],
    ['a start on a board\'s own port', 'startAgentProgress([\'oversee\', \'--port\', \'4930\'], options);'],
    ['a start verb with no port', 'runAgentProgress([\'start\', \'--json\'], options);'],
  ])('a spec planting %s is named', (_form, plantedLine) => {
    expect(testFileViolationsOf([{ path: 'cli/Example.spec.ts', text: plantedLine }])).toEqual(['cli/Example.spec.ts starts an Overseer without --port 0']);
  });

  test('an Overseer on --port 0, an oversee subcommand, a shipping module starting an Overseer and a start word given to no runner pass', () => {
    expect(testFileViolationsOf([
      { path: 'cli/Example.spec.ts', text: 'startAgentProgress([\'oversee\', \'--detach\', \'--port\', \'0\'], options);\nrunAgentProgress([\'oversee\', \'stop\'], options);\n' },
      { path: 'cli/Shipping.ts', text: 'spawn([\'oversee\']);\n' },
      { path: 'src/Example.spec.ts', text: 'const bounds = [[\'start\', \'now\']];\n' },
    ])).toEqual([]);
  });

  test('a spec that only names the factory in a sentence, and a shipping module calling it, pass', () => {
    expect(testFileViolationsOf([
      { path: 'cli/Example.spec.ts', text: `// never ${PROCESS_CONTEXT_FACTORY}\nconst note = '${PROCESS_CONTEXT_FACTORY}';\n` },
      { path: 'cli/Shipping.ts', text: importingTheFactory },
    ])).toEqual([]);
  });
});
