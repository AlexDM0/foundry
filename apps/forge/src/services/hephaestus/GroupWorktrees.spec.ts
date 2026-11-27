/**
 * A group's own worktree. What matters: the first launch creates `group-<name>` from the main line's tip, a later one reuses the branch as
 * it stands rather than resetting it to main, a refresh worktree is detached so it never moves the group branch, and the release's removal
 * deletes the branch only through `branch -d`, never forced. A leftover folder git does not read as a worktree is never reused, so git
 * never runs in the checkout above it. The folders are real; git plays recorded answers, each case a stage in production's order, so a call
 * the stage does not name fails the case. A folder git makes is made by the case, where git would have made it.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import { GroupWorktrees }                                 from './GroupWorktrees.ts';

const recordedGit = useRecordedGit();

const GROUP_BRANCH = 'group-example';
const GROUP_TIP = '1'.repeat(40);
const NEWER_GROUP_TIP = '5'.repeat(40);
const MERGED_IN_TIP = '6'.repeat(40);

let repository: string | null = null;

afterEach(() => {
  if (repository === null) return;
  removeScratchDirectory(`${repository}-worktrees`);
  removeScratchDirectory(repository);
  repository = null;
});

interface Scene {
  root:            string;
  worktreesRoot:   string;
  groupWorktree:   string;
  refreshWorktree: string;
}

function scene(): Scene {
  const root = realpathSync(createScratchDirectory('group-worktrees'));
  repository = root;
  // A worktree reading keeps only printed paths that exist, so the common folder git names is there.
  mkdirSync(join(root, '.git'));
  const worktreesRoot = `${root}-worktrees`;
  return {
    root, worktreesRoot, groupWorktree: join(worktreesRoot, GROUP_BRANCH), refreshWorktree: join(worktreesRoot, `refresh-${GROUP_BRANCH}`),
  };
}

function resolvedArguments(revision: string): string[] {
  return ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`];
}

function unresolved(revision: string): RecordedGitStep {
  return { gitArguments: resolvedArguments(revision), answeredAs: GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION };
}

function resolvedTo(revision: string, commit: string): RecordedGitStep {
  return { gitArguments: resolvedArguments(revision), answeredAs: GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED, filledIn: { [RECORDED_PLACEHOLDERS.COMMIT]: commit } };
}

function groupWorktreeMadeFromMain({ groupWorktree }: Scene): RecordedGitStep[] {
  return [
    unresolved(`refs/heads/${GROUP_BRANCH}`),
    { gitArguments: ['worktree', 'add', '--quiet', '-b', GROUP_BRANCH, groupWorktree, 'main'], answeredAs: GIT_CALL_SHAPES.QUIET_WORKTREE_ADD_ON_A_NEW_BRANCH },
  ];
}

function refreshWorktreeAddedAt({ refreshWorktree }: Scene, tip: string): RecordedGitStep {
  return { gitArguments: ['worktree', 'add', '--quiet', '--detach', refreshWorktree, tip], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED };
}

const TOP_LEVEL_ARGUMENTS = ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'];

function commonFolderOf(root: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    answeredAs:   GIT_CALL_SHAPES.ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT,
    filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: root },
  };
}

/** `GitWorktrees.worktreeStateOf` on a folder that is a linked worktree of the repository. */
function readAsACheckout(root: string, folder: string): RecordedGitStep[] {
  return [
    {
      gitArguments: TOP_LEVEL_ARGUMENTS,
      answeredAs:   GIT_CALL_SHAPES.WORKTREE_TOP_AND_COMMON_FOLDER,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: folder, [RECORDED_PLACEHOLDERS.REPOSITORY]: root },
    },
    commonFolderOf(root),
  ];
}

function readAsNoCheckout(root: string): RecordedGitStep[] {
  return [{ gitArguments: TOP_LEVEL_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.TOP_LEVEL_IN_NO_REPOSITORY }, commonFolderOf(root)];
}

function removed(folder: string): RecordedGitStep {
  return { gitArguments: ['worktree', 'remove', folder], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: folder };
}

function refreshWorktreeAtTheOlderTip(worktrees: Scene): void {
  GroupWorktrees.prepareRefreshWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, GROUP_TIP);
  mkdirSync(worktrees.refreshWorktree, { recursive: true });
}

describeWhenGitIsRecorded('a group worktree', () => {
  test('is created on group-<name> from the main line\'s tip at the first launch', async () => {
    const worktrees = scene();
    const prepared = await recordedGit.playStage(groupWorktreeMadeFromMain(worktrees), () => Promise.resolve(
      GroupWorktrees.prepareGroupWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, 'main')
    ));
    expect(prepared).toEqual({ verdict: 'ready', path: worktrees.groupWorktree });
  });

  test('reuses an existing group branch as it stands, never moving it to main', async () => {
    const worktrees = scene();
    const stage = [
      resolvedTo(`refs/heads/${GROUP_BRANCH}`, GROUP_TIP),
      { gitArguments: ['worktree', 'add', '--quiet', worktrees.groupWorktree, GROUP_BRANCH], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_ON_AN_EXISTING_BRANCH },
    ];
    const prepared = await recordedGit.playStage(stage, () => Promise.resolve(
      GroupWorktrees.prepareGroupWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, 'main')
    ));
    expect(prepared).toEqual({ verdict: 'ready', path: worktrees.groupWorktree });
  });

  test('a refresh worktree is detached at the group tip, and the release removes the group and deletes its merged branch', async () => {
    const worktrees = scene();
    const stage = [
      ...groupWorktreeMadeFromMain(worktrees),
      refreshWorktreeAddedAt(worktrees, GROUP_TIP),
      removed(worktrees.refreshWorktree),
      removed(worktrees.groupWorktree),
      { gitArguments: ['branch', '-d', GROUP_BRANCH], answeredAs: GIT_CALL_SHAPES.BRANCH_DELETE_OF_A_MERGED_BRANCH, filledIn: { [RECORDED_PLACEHOLDERS.BRANCH]: GROUP_BRANCH } },
    ];
    await recordedGit.playStage(stage, () => {
      GroupWorktrees.prepareGroupWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, 'main');
      mkdirSync(worktrees.groupWorktree, { recursive: true });
      expect(GroupWorktrees.prepareRefreshWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, GROUP_TIP))
        .toEqual({ verdict: 'ready', path: worktrees.refreshWorktree });
      mkdirSync(worktrees.refreshWorktree, { recursive: true });
      expect(GroupWorktrees.removeWorktree(worktrees.root, worktrees.refreshWorktree)).toBeNull();
      expect(GroupWorktrees.removeGroup(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH)).toBeNull();
      return Promise.resolve();
    });
  });

  test('a leftover refresh worktree at an older group tip is detached at the new tip before the merge', async () => {
    const worktrees = scene();
    const stage = [
      refreshWorktreeAddedAt(worktrees, GROUP_TIP),
      ...readAsACheckout(worktrees.root, worktrees.refreshWorktree),
      resolvedTo('HEAD', GROUP_TIP),
      unresolved('MERGE_HEAD'),
      { gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'], answeredAs: GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_CLEAN },
      { gitArguments: ['checkout', '--quiet', '--detach', NEWER_GROUP_TIP], answeredAs: GIT_CALL_SHAPES.CHECKOUT_DETACHED },
    ];
    const prepared = await recordedGit.playStage(stage, () => {
      refreshWorktreeAtTheOlderTip(worktrees);
      return Promise.resolve(GroupWorktrees.prepareRefreshWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, NEWER_GROUP_TIP));
    });
    expect(prepared).toEqual({ verdict: 'ready', path: worktrees.refreshWorktree });
  });

  test('a leftover refresh worktree away from the tip with uncommitted changes or a merge in progress is refused git-failed, naming it', async () => {
    const worktrees = scene();
    const dirtyStage = [
      refreshWorktreeAddedAt(worktrees, GROUP_TIP),
      ...readAsACheckout(worktrees.root, worktrees.refreshWorktree),
      resolvedTo('HEAD', GROUP_TIP),
      unresolved('MERGE_HEAD'),
      { gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'], answeredAs: GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_MODIFIED },
    ];
    const dirty = await recordedGit.playStage(dirtyStage, () => {
      refreshWorktreeAtTheOlderTip(worktrees);
      writeFileSync(join(worktrees.refreshWorktree, 'base.ts'), 'export const base = 2;\n');
      return Promise.resolve(GroupWorktrees.prepareRefreshWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, NEWER_GROUP_TIP));
    });
    expect(dirty).toEqual({ verdict: 'git-failed', problem: { code: 'refresh-changes-uncommitted', path: worktrees.refreshWorktree } });

    const mergingStage = [...readAsACheckout(worktrees.root, worktrees.refreshWorktree), resolvedTo('HEAD', GROUP_TIP), resolvedTo('MERGE_HEAD', MERGED_IN_TIP)];
    const merging = await recordedGit.playStage(mergingStage, () => Promise.resolve(
      GroupWorktrees.prepareRefreshWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, NEWER_GROUP_TIP)
    ));
    expect(merging).toEqual({ verdict: 'git-failed', problem: { code: 'refresh-merge-in-progress', path: worktrees.refreshWorktree } });
  });

  test('a group branch holding work main lacks is kept: branch -d refuses it and the reason comes back', async () => {
    const worktrees = scene();
    const stage = [
      ...groupWorktreeMadeFromMain(worktrees),
      removed(worktrees.groupWorktree),
      { gitArguments: ['branch', '-d', GROUP_BRANCH], answeredAs: GIT_CALL_SHAPES.BRANCH_DELETE_OF_AN_UNMERGED_BRANCH, filledIn: { [RECORDED_PLACEHOLDERS.BRANCH]: GROUP_BRANCH } },
    ];
    const problem = await recordedGit.playStage(stage, () => {
      GroupWorktrees.prepareGroupWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, 'main');
      mkdirSync(worktrees.groupWorktree, { recursive: true });
      return Promise.resolve(GroupWorktrees.removeGroup(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH));
    });
    expect(problem).toMatchObject({ code: 'git-exited', gitArguments: ['branch', '-d', GROUP_BRANCH] });
    expect(problem?.code === 'git-exited' ? problem.gitMessage : '').toContain(`'${GROUP_BRANCH}' is not fully merged`);
  });

  test('a leftover folder inside the checkout that is no worktree is refused, never reused, and git never runs in the checkout above it', async () => {
    const { root } = scene();
    const worktreesRoot = join(root, '.claude', 'worktrees');
    mkdirSync(join(worktreesRoot, `refresh-${GROUP_BRANCH}`), { recursive: true });
    mkdirSync(join(worktreesRoot, GROUP_BRANCH), { recursive: true });
    const stage = [...readAsNoCheckout(root), ...readAsNoCheckout(root), unresolved(`refs/heads/${GROUP_BRANCH}`), ...readAsNoCheckout(root), ...readAsNoCheckout(root)];

    await recordedGit.playStage(stage, () => {
      expect(GroupWorktrees.prepareRefreshWorktree(root, worktreesRoot, GROUP_BRANCH, GROUP_TIP))
        .toEqual({ verdict: 'git-failed', problem: { code: 'leftover-not-a-checkout', path: join(worktreesRoot, `refresh-${GROUP_BRANCH}`) } });
      expect(GroupWorktrees.prepareGroupWorktree(root, worktreesRoot, GROUP_BRANCH, 'main'))
        .toEqual({ verdict: 'git-failed', problem: { code: 'leftover-not-a-checkout', path: join(worktreesRoot, GROUP_BRANCH) } });
      expect(GroupWorktrees.cleanupIsStillDeclined(root, worktreesRoot, GROUP_BRANCH, 'refresh')).toBe(true);
      return Promise.resolve();
    });
  });

  // A case-insensitive file system gives `group-Example` and `group-example` one folder; planted here as another branch in the folder, on every OS.
  test('a folder that is a checkout of another group\'s branch never answers ready, and its branch stays where it is', async () => {
    const worktrees = scene();
    mkdirSync(worktrees.groupWorktree, { recursive: true });
    const stage = [
      unresolved(`refs/heads/${GROUP_BRANCH}`),
      ...readAsACheckout(worktrees.root, worktrees.groupWorktree),
      { gitArguments: ['symbolic-ref', '--quiet', 'HEAD'], answeredAs: GIT_CALL_SHAPES.BRANCH_OF_A_WORKTREE, filledIn: { [RECORDED_PLACEHOLDERS.BRANCH]: 'group-Example' } },
    ];
    const prepared = await recordedGit.playStage(stage, () => Promise.resolve(
      GroupWorktrees.prepareGroupWorktree(worktrees.root, worktrees.worktreesRoot, GROUP_BRANCH, 'main')
    ));
    expect(prepared).toEqual({ verdict: 'git-failed', problem: { code: 'checkout-of-another-branch', path: worktrees.groupWorktree, expectedBranch: GROUP_BRANCH } });
  });
});
