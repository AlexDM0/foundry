/**
 * No spec reaches the real home's `~/.agent-progress-monitor`. Three doors lead there: a spawned CLI inheriting `HOME`, an in-process context
 * given the real home, and a spec reading `homedir()` itself. The spawned home is observed through `usage --json`, which prints a folder under
 * the home without writing anything; the in-process doors are refused by the context helper; and the `homedir` scan first proves it finds
 * its one allowed reader, then names a planted one.
 */
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import ts from 'typescript';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }            from '../src/testing/ChildProcessCaseTimeout.ts';
import { repositoryRootOfThisCheckout }                       from '../src/testing/ImportGraph.ts';
import { useRecordedGit }                                     from '../src/testing/RecordedGit.ts';
import { repositoryTypeScriptSources, type RepositorySource } from '../src/testing/RepositorySources.ts';
import { removeScratchDirectory }                             from '../src/testing/ScratchWorkspace.ts';
import { trackerIsolationVerdictFor }                         from '../src/testing/TrackerIsolation.ts';
import { runCommandLine }                                     from './Main.ts';
import { createCapturedCommandContext }                       from './testing/CapturedCommandContext.ts';
import { runAgentProgress }                                   from './testing/CliProcess.ts';
import { createInitializedRecordedGitRepository }             from './testing/InitializedScratchRepository.ts';
import { COMMON_FOLDER_OUTSIDE }                              from './testing/RecordedGitStages.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

const HOME_DIRECTORY_FUNCTION = 'homedir';

const SPECS_ALLOWED_THE_REAL_HOME: string[] = [];

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function isTestCode(path: string): boolean {
  return path.endsWith('.spec.ts') || path.includes('/testing/') || path.startsWith('testing/');
}

function namesTheHomeDirectoryFunction(source: RepositorySource): boolean {
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): boolean => (ts.isIdentifier(node) && node.text === HOME_DIRECTORY_FUNCTION) || ts.forEachChild(node, visit) === true;
  return visit(sourceFile);
}

function testCodeReadingTheRealHome(sources: readonly RepositorySource[]): string[] {
  return sources.filter((source) => isTestCode(source.path) && namesTheHomeDirectoryFunction(source)).map((source) => source.path);
}

async function initializedScratchRepository(): Promise<string> {
  const repositoryDirectory = await createInitializedRecordedGitRepository('monitor-isolation', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

async function transcriptFolderSeenByAChildProcess(repositoryDirectory: string, environment?: Record<string, string>): Promise<string> {
  const childOptions = { currentDirectory: repositoryDirectory, recordedGitStage: [], ...(environment === undefined ? {} : { environment }) };
  const result       = await runAgentProgress(['usage', '--json'], childOptions);
  expect(result.exitCode, result.standardError).toBe(0);
  return (JSON.parse(result.standardOutput) as { transcriptFolder: string }).transcriptFolder;
}

/** The verdict asks git for the root of the folder, which lies in no repository. */
async function isolationVerdictOf(folder: string): Promise<ReturnType<typeof trackerIsolationVerdictFor>> {
  return await recordedGit.playStage([COMMON_FOLDER_OUTSIDE], async () => trackerIsolationVerdictFor(folder));
}

describe('a spawned CLI gets a scratch home', () => {
  test('inheriting this process\'s environment, its home lies in the scratch root', async () => {
    const repositoryDirectory = await initializedScratchRepository();
    expect(await isolationVerdictOf(await transcriptFolderSeenByAChildProcess(repositoryDirectory))).toBe('isolated');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('given an environment naming another HOME, its home still lies in the scratch root', async () => {
    const repositoryDirectory = await initializedScratchRepository();
    const transcriptFolder    = await transcriptFolderSeenByAChildProcess(repositoryDirectory, { HOME: '/', TMPDIR: tmpdir() });
    expect(await isolationVerdictOf(transcriptFolder)).toBe('isolated');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a home outside the scratch root is refused before anything is spawned', async () => {
    expect(runAgentProgress(['status'], { currentDirectory: tmpdir(), homeDirectory: '/' })).rejects.toThrow('is not isolated');
  });
});

describe('an in-process command never registers in a home it was not given', () => {
  test('a context given a home outside the scratch root is refused', async () => {
    const contextOutsideTheScratchRoot = async () => createCapturedCommandContext({ currentDirectory: join(tmpdir(), 'example'), homeDirectory: '/' });
    expect(recordedGit.playStage([COMMON_FOLDER_OUTSIDE], contextOutsideTheScratchRoot)).rejects.toThrow('is not isolated');
  });

  test('a mutating command under the default context leaves even its scratch home without a registry', async () => {
    const repositoryDirectory = await initializedScratchRepository();
    const context             = await recordedGit.playStage([], async () => createCapturedCommandContext({ currentDirectory: repositoryDirectory }));
    expect(await recordedGit.playStage([], async () => runCommandLine(['log', 'Example milestone'], context))).toBe(0);
    expect(await Bun.file(join(context.homeDirectory, '.agent-progress-monitor', 'projects.json')).exists()).toBe(false);
  });
});

describe('only the allowed specs read the real home', () => {
  const sources = repositoryTypeScriptSources(repositoryRootOfThisCheckout());

  test('the scan finds exactly the allowed readers', () => {
    expect(testCodeReadingTheRealHome(sources)).toEqual(SPECS_ALLOWED_THE_REAL_HOME);
  });

  test('a planted spec or helper calling homedir is named, and one naming it only in a sentence is not', () => {
    const importingIt = `import { ${HOME_DIRECTORY_FUNCTION} } from 'node:os';\nconst home = ${HOME_DIRECTORY_FUNCTION}();\n`;
    expect(testCodeReadingTheRealHome([
      { path: 'cli/Example.spec.ts', text: importingIt },
      { path: 'cli/testing/ExampleHelper.ts', text: importingIt },
      { path: 'cli/Sentence.spec.ts', text: `// never ${HOME_DIRECTORY_FUNCTION}\nconst note = '${HOME_DIRECTORY_FUNCTION}';\n` },
    ])).toEqual(['cli/Example.spec.ts', 'cli/testing/ExampleHelper.ts']);
  });
});
