/**
 * `namespace` over a scratch tracker, git answered from the recorded branch lists. What matters: a board with none reads as bare names
 * and its progress file holds no key; a name is stored, logged once and printed with the branch names it gives; a name that is not one,
 * a branch named as the program, and a branch left under the board's bare names are refused at exit 1 with every file as it was.
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { workspacePathsFor } from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }     from '../../../src/shared/constants/ProductNames.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  useRecordedGit
} from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { storedLogTextOf }                        from '../../testing/StoredLogText.ts';

const FROZEN_NOW = new Date('2026-11-16T09:00:00Z');

const { PROGRAM } = PRODUCT_NAMES;

let repositoryDirectory = '';

const recordedGit = useRecordedGit();

/** The repository's branches as `for-each-ref` lists them: the one recorded branch, named as the case needs. */
function branchListOf(branch: string): RecordedGitStage {
  return [{
    gitArguments: ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_NAMES_OF_ONE,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: branch },
  }];
}

function storedFiles(): string[] {
  const workspace = workspacePathsFor(repositoryDirectory);
  return [workspace.progressFilePath, workspace.logFilePath].map((filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''));
}

function storedNamespace(): unknown {
  return (JSON.parse(readFileSync(workspacePathsFor(repositoryDirectory).progressFilePath, 'utf8')) as Record<string, unknown>)['branchNamespace'];
}

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('namespace-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the namespace command', () => {
  test('a board that never set one prints bare names and null, and its progress file holds no key', async () => {
    const printed = await runWithExitCode(['namespace']);
    const printedJson = await runWithExitCode(['namespace', '--json']);

    expect(printed.context.outputText()).toBe('None: the board\'s ticket branches are ticket-<id>.');
    expect(JSON.parse(printedJson.context.outputText())).toEqual({ branchNamespace: null });
    expect(storedNamespace()).toBeUndefined();
  });

  test('a name is stored in progress.json, logged once, and printed with the branch names it gives', async () => {
    const set = await recordedGit.playStage(branchListOf('main'), async () => runWithExitCode(['namespace', 'web', '--json']));

    expect(set.exitCode, set.context.errorText()).toBe(0);
    expect(JSON.parse(set.context.outputText())).toEqual({ branchNamespace: 'web' });
    expect(storedNamespace()).toBe('web');
    expect(storedLogTextOf(repositoryDirectory)).toContain('"kind":"branch-namespace-set","fields":{"namespace":"web"}');
    expect((await runWithExitCode(['namespace'])).context.outputText()).toBe(`web: the board's ticket branches are ${PROGRAM}/web/ticket-<id>.`);
  });

  test('a name that is not one is refused at exit 1 with the usage, asking git nothing', async () => {
    const before = storedFiles();
    for (const written of ['Web', 'web/api', '-web']) {
      const refused = await runWithExitCode(['namespace', written]);
      expect(refused.exitCode, written).toBe(1);
      expect(refused.context.errorText()).toContain(`"${written}" is not a namespace`);
    }
    expect(storedFiles()).toEqual(before);
  });

  test('a branch named as the program, or one left under the board\'s bare names, is refused at exit 1 with every file as it was', async () => {
    const before = storedFiles();
    const blocked = await recordedGit.playStage(branchListOf(PROGRAM), async () => runWithExitCode(['namespace', 'web']));
    const leftBehind = await recordedGit.playStage(branchListOf('ticket-003'), async () => runWithExitCode(['namespace', 'web']));

    expect([blocked.exitCode, leftBehind.exitCode]).toEqual([1, 1]);
    expect(blocked.context.errorText()).toContain(`The branch ${PROGRAM} leaves git no room for branches named ${PROGRAM}/web/ticket-<id>`);
    expect(leftBehind.context.errorText()).toContain('The board\'s branches ticket-003 are under its current names');
    expect(storedFiles()).toEqual(before);
  });
});
