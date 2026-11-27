/**
 * `namespace` over a scratch tracker, git answered from the recorded branch lists. What matters: a board with none reads as bare names
 * and its progress file holds no key; a name is stored, logged once and printed with the branch names it gives; a name that is not one,
 * a branch named as the program, a branch left under the board's bare names, a job on a branch, and a namespace another tracker of the
 * repository lists are refused at exit 1 with every file as it was; the Assistant and the product owner, which work on no branch and which
 * a Hephaestus's stop leaves on the board, hold no name back; a name taken lists the board in the repository's tracker list.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { RepositoryLandings }      from '../../../src/adapters/repository-landings/RepositoryLandings.ts';
import type { Job }                from '../../../src/domain/tracker-model/@types/Job.ts';
import { localStoreLayoutOf }      from '../../../src/services/tracker/LocalStoreLayout.ts';
import { repositoryTrackerListOf } from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { workspacePathsFor }       from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }           from '../../../src/shared/constants/ProductNames.ts';
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
import { storedProgressOf }                       from '../../testing/StoredProgress.ts';

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
  const layout = localStoreLayoutOf(workspace);
  return [layout.progressRecordPath, layout.logRecordPath].map((filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''));
}

function storedNamespace(): unknown {
  return (JSON.parse(readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).progressRecordPath, 'utf8')) as Record<string, unknown>)['branchNamespace'];
}

/** A job left running on the board, as a Hephaestus's stop leaves its Assistant. */
function writeRunningJobs(jobs: readonly Pick<Job, 'id' | 'kind' | 'role' | 'ticketIds'>[]): void {
  const runningJobs = jobs.map((job): Job => ({
    ...job,
    parentJobId:        null,
    attempt:            1,
    target:             job.ticketIds.length === 0 ? null : 'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
  }));
  const progress = { ...storedProgressOf(repositoryDirectory), jobs: runningJobs, nextJobId: runningJobs.length + 1 };
  writeFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).progressRecordPath, `${JSON.stringify(progress, null, 2)}\n`);
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

  test('the Assistant and the product owner, which work on no branch, hold no name back', async () => {
    writeRunningJobs([
      {
        id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: []
      },
      {
        id: 'J2', kind: 'product-owner', role: 'product-owner', ticketIds: []
      },
    ]);

    const set = await recordedGit.playStage(branchListOf('main'), async () => runWithExitCode(['namespace', 'web']));

    expect(set.exitCode, set.context.errorText()).toBe(0);
    expect(storedNamespace()).toBe('web');
  });

  test('a job on a branch is refused at exit 1, counted without the Assistant beside it, asking git nothing', async () => {
    writeRunningJobs([
      {
        id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: []
      },
      {
        id: 'J2', kind: 'build', role: 'builder', ticketIds: ['001']
      },
    ]);
    const before = storedFiles();

    const refused = await runWithExitCode(['namespace', 'web']);

    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('The board has 1 job(s) on it, which run under its current branch names');
    expect(storedFiles()).toEqual(before);
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

  test('a name taken lists the board, at the repository root, in the repository\'s tracker list', async () => {
    const set = await recordedGit.playStage(branchListOf('main'), async () => runWithExitCode(['namespace', 'web']));
    const list = repositoryTrackerListOf(repositoryDirectory);

    expect(set.exitCode, set.context.errorText()).toBe(0);
    expect(list === null ? null : RepositoryLandings.readTrackerList(list.files)).toEqual({
      verdict:  'readable',
      trackers: [{ trackerId: (JSON.parse(storedFiles()[0] ?? '{}') as { trackerId: string }).trackerId, prefix: '', branchNamespace: 'web' }],
    });
  });

  test('a namespace another tracker of the repository lists is refused before git is asked, with every file as it was', async () => {
    const list = repositoryTrackerListOf(repositoryDirectory);
    if (list === null) throw new Error('the scratch repository keeps no list');
    mkdirSync(join(repositoryDirectory, 'apps', 'gaia', PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    mkdirSync(join(list.files.trackerListFilePath, '..'), { recursive: true });
    RepositoryLandings.writeTrackerEntry(list.files, { trackerId: 'tracker-example-gaia', prefix: 'apps/gaia', branchNamespace: 'gaia' });
    const before = storedFiles();

    const refused = await runWithExitCode(['namespace', 'gaia']);

    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('The namespace gaia is the tracker\'s in the folder apps/gaia of');
    expect(storedFiles()).toEqual(before);
  });
});
