/**
 * The Tests rule in the root `CLAUDE.md` that a spec never opens a page, a tab or a window: no spec or spec helper starts the default
 * browser opener (`open`, `xdg-open`, `cmd /c start`, the Windows protocol handler, or what `openerFor` gives). A start is a process start
 * or a shell tag whose arguments hold an opener program, or a name bound to an opener. A spec also reaches the opener through
 * `openInTheDefaultBrowser`, `openCommand` or a run of the `open` command line: in this process only a mock of `Bun.spawn` or of the opener
 * module keeps the page shut, and a spawned binary is not let run `open`; an exact allowlist names each unmocked run and why it opens no
 * page. The scan proves it saw the specs, the opener of the open command's specs and the reaches of the tree, and each form is planted to
 * prove the guard names it.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import type { RepositorySource }        from './testing/RepositorySources.ts';
import { repositoryTypeScriptSources }  from './testing/RepositorySources.ts';

const PROCESS_STARTS = new Set([
  'Bun.spawn',
  'Bun.spawnSync',
  'exec',
  'execFile',
  'execFileSync',
  'execSync',
  'realCommandAnswerOf',
  'spawn',
  'spawnSync',
]);
const SHELL_TAGS = new Set(['$', 'Bun.$']);
const OPENER_PROGRAMS = new Set(['open', 'xdg-open', 'rundll32.exe', 'url.dll,FileProtocolHandler']);
const WINDOWS_SHELLS = new Set(['cmd', 'cmd.exe']);
const WINDOWS_START_COMMAND = 'start';
const OPENER_FACTORY = 'openerFor';
const IN_PROCESS_OPENER_REACHES = new Set(['openInTheDefaultBrowser', 'openCommand']);
const IN_PROCESS_COMMAND_RUNNER = 'runCommandLine';
const SPAWNED_COMMAND_RUNNERS = new Set(['runAgentProgress', 'runAgentProgressBesideRecordedGit', 'startAgentProgress']);
const OPEN_COMMAND_VERB = 'open';
const OPENER_MODULE_FILE = 'OpenInTheDefaultBrowser.ts';
/** Each file that runs the `open` command line with no mock, and why no page opens. */
const OPEN_RUNS_THAT_OPEN_NO_PAGE: Readonly<Record<string, string>> = {
  'bridge/testing/HeadlessBridgeCheck.ts':          'a stub opener that only writes its arguments is first on PATH',
  'cli/Main.spec.ts':                               'open is refused overseer-down: no Overseer serves the scratch board',
  'cli/RegisterWrittenTracker.integration.spec.ts': 'open is refused overseer-down, spawned with a PATH that holds only Bun and no opener',
  'cli/tracking/open/OpenCommand.spec.ts':          'open is refused overseer-down: no Overseer serves the scratch board',
};
const DOM_SPEC_SUFFIX = '.dom.tsx';
const MINIMUM_SCANNED_FILE_COUNT = 100;

function isScanned(path: string): boolean {
  return path.endsWith('.spec.ts') || path.endsWith(DOM_SPEC_SUFFIX) || path.split('/').includes('testing');
}

function programNameOf(word: string): string {
  return word.split(/[\\/]/).pop() ?? word;
}

/** A plain string is one argv entry; a template is a shell line, read word by word. */
function wordsOf(node: ts.Node): string[] {
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text.split(/\s+/);
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text.split(/\s+/);
  return [];
}

function subtreeOf(node: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [node];
  ts.forEachChild(node, (child) => {
    nodes.push(...subtreeOf(child));
  });
  return nodes;
}

function holdsAnOpener(nodes: readonly ts.Node[], openerNames: ReadonlySet<string>): boolean {
  const programNames = new Set(nodes.flatMap(wordsOf).map(programNameOf));
  if ([...OPENER_PROGRAMS].some((program) => programNames.has(program))) return true;
  if (programNames.has(WINDOWS_START_COMMAND) && [...WINDOWS_SHELLS].some((shell) => programNames.has(shell))) return true;
  return nodes.some((node) => (ts.isCallExpression(node) && node.expression.getText() === OPENER_FACTORY)
    || (ts.isIdentifier(node) && openerNames.has(node.text)));
}

function boundNamesOf(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : boundNamesOf(element.name)));
}

/** Every name bound to an opener, followed until no new name is found: `const argv = [...opener.argv, url]` binds one too. */
function openerNamesIn(sourceFile: ts.SourceFile): Set<string> {
  const declarations = subtreeOf(sourceFile).filter(ts.isVariableDeclaration);
  const openerNames = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      const names = boundNamesOf(declaration.name).filter((name) => !openerNames.has(name));
      if (names.length === 0 || declaration.initializer === undefined || !holdsAnOpener(subtreeOf(declaration.initializer), openerNames)) continue;
      for (const name of names) openerNames.add(name);
      grew = true;
    }
  }
  return openerNames;
}

function startArgumentsOf(node: ts.Node): ts.Node[] | null {
  if (ts.isCallExpression(node) && PROCESS_STARTS.has(node.expression.getText())) return [...node.arguments];
  if (ts.isTaggedTemplateExpression(node) && SHELL_TAGS.has(node.tag.getText())) return [node.template];
  return null;
}

function opensAPage(source: RepositorySource): boolean {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const openerNames = openerNamesIn(sourceFile);
  return subtreeOf(sourceFile).some((node) => {
    const startArguments = startArgumentsOf(node);
    return startArguments !== null && holdsAnOpener(startArguments.flatMap(subtreeOf), openerNames);
  });
}

/** Only a bare name: `SessionWordingUtil.openCommand()` is another function. */
function calleeNameOf(call: ts.CallExpression): string {
  return ts.isIdentifier(call.expression) ? call.expression.text : '';
}

/** Any argument: `runAgentProgressBesideRecordedGit` takes its command line third. */
function runsTheOpenCommand(call: ts.CallExpression): boolean {
  return call.arguments.some((commandLine) => {
    if (!ts.isArrayLiteralExpression(commandLine)) return false;
    const [verb] = commandLine.elements;
    return verb !== undefined && ts.isStringLiteralLike(verb) && verb.text === OPEN_COMMAND_VERB;
  });
}

function reachesTheOpenerInThisProcess(call: ts.CallExpression): boolean {
  const calleeName = calleeNameOf(call);
  return IN_PROCESS_OPENER_REACHES.has(calleeName) || (calleeName === IN_PROCESS_COMMAND_RUNNER && runsTheOpenCommand(call));
}

function mocksTheOpener(sourceFile: ts.SourceFile): boolean {
  return subtreeOf(sourceFile).filter(ts.isCallExpression).some((call) => {
    const [target, member] = call.arguments;
    const callee = call.expression.getText();
    if (callee === 'spyOn') return target?.getText() === 'Bun' && member !== undefined && ts.isStringLiteralLike(member) && member.text === 'spawn';
    return callee === 'mock.module' && target !== undefined && ts.isStringLiteralLike(target) && target.text.endsWith(OPENER_MODULE_FILE);
  });
}

/** In this process a mock of `Bun.spawn` or of the opener module catches the opener; a spawned binary is out of its reach. */
function reachesTheOpenerUnmocked(source: RepositorySource): boolean {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const calls = subtreeOf(sourceFile).filter(ts.isCallExpression);
  if (calls.some((call) => SPAWNED_COMMAND_RUNNERS.has(calleeNameOf(call)) && runsTheOpenCommand(call))) return true;
  return calls.some(reachesTheOpenerInThisProcess) && !mocksTheOpener(sourceFile);
}

function pageOpeningViolationsOf(sources: readonly RepositorySource[], allowedOpenRuns: Readonly<Record<string, string>> = {}): string[] {
  return sources.filter(({ path }) => isScanned(path)).flatMap((source) => {
    if (opensAPage(source)) return [`${source.path} starts the default browser opener`];
    if (Object.hasOwn(allowedOpenRuns, source.path)) return [];
    if (reachesTheOpenerUnmocked(source)) return [`${source.path} reaches the default browser opener with no mock of Bun.spawn`];
    return [];
  });
}

const SOURCES = repositoryTypeScriptSources(repositoryRootOfThisCheckout());

describe('the scan itself', () => {
  test('it sees the specs and the opener that the open command\'s specs bind', () => {
    expect(SOURCES.filter(({ path }) => isScanned(path)).length).toBeGreaterThan(MINIMUM_SCANNED_FILE_COUNT);
    const openerSpec = SOURCES.find(({ path }) => path === 'cli/OpenInTheDefaultBrowser.integration.spec.ts');
    expect(openerSpec).toBeDefined();
    const sourceFile = ts.createSourceFile(openerSpec?.path ?? '', openerSpec?.text ?? '', ts.ScriptTarget.Latest, true);
    expect([...openerNamesIn(sourceFile)]).toContain('opener');
  });

  test('it sees the specs that reach the opener in this process', () => {
    const reachingSpecs = SOURCES.filter(({ path }) => isScanned(path)).filter(({ path, text }) => {
      const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      return subtreeOf(sourceFile).filter(ts.isCallExpression).some(reachesTheOpenerInThisProcess);
    }).map(({ path }) => path);
    expect(reachingSpecs).toEqual(expect.arrayContaining(['cli/OpenInTheDefaultBrowser.spec.ts', 'cli/tracking/open/OpenCommand.spec.ts']));
  });
});

describe('the tree', () => {
  test('no spec or spec helper starts the default browser opener', () => {
    expect(pageOpeningViolationsOf(SOURCES, OPEN_RUNS_THAT_OPEN_NO_PAGE)).toEqual([]);
  });

  test('every allowed open run is one the guard names without its allowance', () => {
    const allowedPaths = Object.keys(OPEN_RUNS_THAT_OPEN_NO_PAGE);
    const named = pageOpeningViolationsOf(SOURCES.filter(({ path }) => allowedPaths.includes(path)));
    expect(named).toEqual(allowedPaths.map((path) => `${path} reaches the default browser opener with no mock of Bun.spawn`));
  });
});

describe('a planted spec is named', () => {
  test.each([
    ['`open` in an argv', 'Bun.spawn([\'open\', url]);'],
    ['`open` by its absolute path', 'Bun.spawnSync([\'/usr/bin/open\', url]);'],
    ['`xdg-open` in an argv', 'Bun.spawnSync([\'xdg-open\', url]);'],
    ['`cmd /c start` in an argv', 'Bun.spawn([\'cmd\', \'/c\', \'start\', \'\', url]);'],
    ['`cmd /c start` in one shell line', 'execSync(`cmd.exe /c start "" ${url}`);'],
    ['the Windows protocol handler', 'Bun.spawn([rundll32, \'url.dll,FileProtocolHandler\', url]);'],
    ['`open` in the Bun shell', 'await Bun.$`open ${url}`;'],
    ['`xdg-open` in the imported Bun shell', 'await $`xdg-open ${url}`;'],
    ['`open` through `child_process`', 'spawn(\'open\', [url]);'],
    ['`openerFor` in the argv', 'Bun.spawn([...openerFor(process.platform, systemFolder).argv, url]);'],
    ['a name bound to `openerFor`', 'const opener = openerFor(process.platform, systemFolder);\nrealCommandAnswerOf([...opener.argv, url]);'],
    [
      'a name bound through another name',
      'const { argv } = openerFor(\'darwin\', systemFolder);\nconst command = [...argv, url];\nBun.spawnSync(command);',
    ],
    ['an argv bound to `open`', 'const command = [\'open\', url];\nBun.spawn(command);'],
  ])('%s', (_form, text) => {
    expect(pageOpeningViolationsOf([{ path: 'cli/Example.spec.ts', text }])).toEqual(['cli/Example.spec.ts starts the default browser opener']);
  });

  test.each([
    ['`openInTheDefaultBrowser` with no mock', 'openInTheDefaultBrowser(context, url);'],
    ['`openCommand` with no mock', 'await openCommand(commandArguments, context);'],
    ['the `open` command line run in this process with no mock', 'await runCommandLine([\'open\'], context);'],
    ['a spy on another member of Bun', 'spyOn(Bun, \'spawnSync\');\nopenInTheDefaultBrowser(context, url);'],
    ['a mock of another module', 'mock.module(\'./OpenerFor.ts\', () => ({}));\nopenInTheDefaultBrowser(context, url);'],
    ['the `open` command line in a spawned binary, mocked here', 'spyOn(Bun, \'spawn\');\nawait runAgentProgress([\'open\'], options);'],
    ['the `open` command line in a started binary', 'startAgentProgress([\'open\'], options);'],
    ['the `open` command line third in a binary spawned beside recorded git', 'await runAgentProgressBesideRecordedGit(recordedGit, stage, [\'open\'], options);'],
  ])('%s', (_form, text) => {
    expect(pageOpeningViolationsOf([{ path: 'cli/Example.spec.ts', text }]))
      .toEqual(['cli/Example.spec.ts reaches the default browser opener with no mock of Bun.spawn']);
  });

  test('a spec helper is scanned too', () => {
    const planted = { path: 'cli/testing/ExampleHelper.ts', text: 'Bun.spawn([\'open\', url]);' };
    expect(pageOpeningViolationsOf([planted])).toEqual(['cli/testing/ExampleHelper.ts starts the default browser opener']);
  });
});

describe('what the guard leaves alone', () => {
  test.each([
    [
      'an opener argv that is only recorded',
      'const opener = openerFor(process.platform, systemFolder);\nrecordCommandAnswer({ argv: [...opener.argv, url] }, placeholders, answer);',
    ],
    ['a missing opener', 'realCommandAnswerOf([join(scratch, \'missing-opener\'), url]);'],
    ['a `start` that no Windows shell runs', 'Bun.spawn([\'agent-progress\', \'task\', \'start\', \'1\']);'],
    ['a sentence about opening', 'const note = \'the opener opens a page\';'],
    ['an opener on a mock', 'recorded.spawn([\'open\', url]);'],
    ['`openInTheDefaultBrowser` under a spy on Bun.spawn', 'spyOn(Bun, \'spawn\').mockImplementation(fake);\nopenInTheDefaultBrowser(context, url);'],
    ['the `open` command line under a mock of the opener module', 'mock.module(\'../../OpenInTheDefaultBrowser.ts\', () => ({}));\nawait runCommandLine([\'open\'], context);'],
    ['a member of another object named `openCommand`', 'SessionWordingUtil.openCommand();'],
    ['another command line run in this process', 'await runCommandLine([\'status\', \'--json\'], context);'],
    ['another command line in a spawned binary', 'await runAgentProgress([\'render\'], options);'],
  ])('%s', (_form, text) => {
    expect(pageOpeningViolationsOf([{ path: 'cli/Example.spec.ts', text }])).toEqual([]);
  });

  test('a shipping module is not scanned', () => {
    const shippingModule = { path: 'cli/OpenInTheDefaultBrowser.ts', text: 'const opener = openerFor(platform, folder);\nBun.spawn([...opener.argv, url]);' };
    expect(pageOpeningViolationsOf([shippingModule])).toEqual([]);
  });
});
