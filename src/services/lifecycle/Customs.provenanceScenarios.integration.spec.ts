/**
 * Records the git scenarios `src/services/lifecycle/Customs.provenance.spec.ts` replays: each case walks a real repository through the states
 * of one replayed case, and at each state records every call V12 to V14, the launch snapshot and the pre-launch config check make, for a
 * reviewer and a builder, with the snapshot and without. `bun run record src/lib/git/GitProcess.ts` runs this spec.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join }                          from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { captureGitScenario, GIT_SCENARIOS } from '../../testing/RecordedGitScenarios.ts';
import {
  addWorktree,
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import {
  agentConfigTouchedBeforeLaunch,
  CUSTOMS_CHECKS,
  type CustomsSubject,
  launchSnapshotOf
} from './Customs.ts';

const MAIN_LINE = 'main';
const TICKET_BODY = '## Acceptance\nA1. The example holds.\n';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

/** A repository on main with base.ts committed as the start, its start state recorded. */
function startedRepository(): { directory: string; startCommit: string } {
  const directory = realpathSync(createScratchGitRepository('customs-provenance-scenarios'));
  scratchDirectories.push(directory, `${directory}-worktrees`);
  gitOutputIn(directory, ['branch', '-m', MAIN_LINE]);
  const startCommit = commitFile(directory, 'base.ts', 'export const base = true;\n');
  recordState(GIT_SCENARIOS.ONE_COMMIT, directory, startCommit);
  return { directory, startCommit };
}

function subjectIn(directory: string, startCommit: string, role: 'builder' | 'reviewer'): CustomsSubject {
  return {
    role,
    worktreePath:     directory,
    startCommit,
    report:           {},
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: '',
    jobId:            'J7',
    logRecords:       [],
    refMovesAllowed:  {
      ownBranch: MAIN_LINE, otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
    },
  };
}

/** Records the state as `scenario`, its start, the commits named and HEAD, when no other name holds it, as `<head>`. */
function recordState(scenario: string, directory: string, startCommit: string, namedCommits: Record<string, string> = {}): void {
  const head = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  const commits: Record<string, string> = { '<start>': startCommit, ...namedCommits };
  if (!Object.values(commits).includes(head)) commits['<head>'] = head;
  captureGitScenario(scenario, { repositoryDirectory: directory, commits }, () => {
    const launchSnapshot = launchSnapshotOf(directory);
    expect(launchSnapshot).not.toBeNull();
    for (const role of ['reviewer', 'builder'] as const) {
      const withoutSnapshot = subjectIn(directory, startCommit, role);
      const subjects = launchSnapshot === null ? [withoutSnapshot] : [withoutSnapshot, { ...withoutSnapshot, launchSnapshot }];
      for (const subject of subjects) {
        for (const check of [CUSTOMS_CHECKS.V12, CUSTOMS_CHECKS.V13, CUSTOMS_CHECKS.V14]) check(subject);
      }
    }
    agentConfigTouchedBeforeLaunch(directory, MAIN_LINE);
  });
}

function writeFileIn(directory: string, path: string, content: string): void {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), content);
}

function commitPath(directory: string, path: string, content: string): string {
  writeFileIn(directory, path, content);
  return commitFile(directory, path, content);
}

function git(directory: string, gitArguments: readonly string[]): string {
  return gitOutputIn(directory, gitArguments);
}

describeWhenGitIsPresent('the git scenarios the Customs provenance spec replays', () => {
  test('agent configuration committed and undone, and an untracked .mcp.json', () => {
    const { directory, startCommit } = startedRepository();
    writeFileSync(join(directory, '.mcp.json'), '{}\n');
    recordState(GIT_SCENARIOS.MCP_FILE_UNTRACKED, directory, startCommit);
    removeScratchDirectory(join(directory, '.mcp.json'));
    commitPath(directory, '.claude/settings.json', '{"hooks":{}}\n');
    git(directory, ['rm', '-q', '.claude/settings.json']);
    git(directory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', 'Undo']);
    recordState(GIT_SCENARIOS.AGENT_CONFIG_UNDONE, directory, startCommit);
  });

  test('a core.hooksPath, a commit beside it and a hook committed under it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['config', 'core.hooksPath', 'example-hooks']);
    mkdirSync(join(directory, 'other-hooks'));
    mkdirSync(join(directory, 'example-hooks'));
    recordState(GIT_SCENARIOS.HOOKS_PATH_SET, directory, startCommit);
    commitPath(directory, 'other-hooks/pre-commit', 'exit 0\n');
    recordState(GIT_SCENARIOS.HOOKS_PATH_OTHER_FOLDER_COMMIT, directory, startCommit);
    commitPath(directory, 'example-hooks/pre-commit', 'exit 0\n');
    recordState(GIT_SCENARIOS.HOOKS_PATH_HOOK_COMMIT, directory, startCommit);
  });

  test('a nested core.hooksPath and a hook committed under it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['config', 'core.hooksPath', 'tools/git-hooks']);
    mkdirSync(join(directory, 'tools', 'git-hooks'), { recursive: true });
    recordState(GIT_SCENARIOS.NESTED_HOOKS_PATH_SET, directory, startCommit);
    commitPath(directory, 'tools/git-hooks/pre-commit', 'exit 0\n');
    recordState(GIT_SCENARIOS.NESTED_HOOKS_PATH_HOOK_COMMIT, directory, startCommit);
  });

  test.each([
    [GIT_SCENARIOS.CLAUDE_FOLDER_IN_CAPITALS, '.CLAUDE/settings.json'],
    [GIT_SCENARIOS.CLAUDE_FOLDER_CAPITALISED, '.Claude/agents/example.md'],
    [GIT_SCENARIOS.MCP_FILE_IN_CAPITALS, '.MCP.json'],
  ])('%s', (scenario, gitPath) => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, gitPath, '{}\n');
    recordState(scenario, directory, startCommit);
  });

  test('an honest different case outside the protected names', () => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, 'Src/Example.ts', 'export const example = true;\n');
    commitPath(directory, 'Example.MCP.json', '{}\n');
    recordState(GIT_SCENARIOS.HONEST_CAPITALS_COMMITTED, directory, startCommit);
  });

  test('a ticket branch, and agent configuration committed on it', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-007']);
    recordState(GIT_SCENARIOS.TICKET_BRANCH_MADE, directory, startCommit);
    commitPath(directory, '.claude/settings.json', '{}\n');
    recordState(GIT_SCENARIOS.TICKET_BRANCH_ADDS_AGENT_CONFIG, directory, startCommit);
  });

  test('the own branch moving, then a foreign branch appearing', () => {
    const { directory, startCommit } = startedRepository();
    commitPath(directory, 'feature.ts', 'export const feature = true;\n');
    recordState(GIT_SCENARIOS.OWN_BRANCH_MOVED, directory, startCommit);
    git(directory, ['branch', 'example-foreign', startCommit]);
    recordState(GIT_SCENARIOS.FOREIGN_BRANCH_ADDED, directory, startCommit);
  });

  test('a target and another job\'s branch made at the start', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'example-target', startCommit]);
    git(directory, ['branch', 'ticket-009', startCommit]);
    recordState(GIT_SCENARIOS.TARGET_AND_JOB_BRANCH_ADDED, directory, startCommit);
  });

  test('another worktree detached at the start, then moved', () => {
    const { directory, startCommit } = startedRepository();
    const otherWorktree = addWorktree(directory, 'example-detached');
    git(otherWorktree, ['checkout', '-q', '--detach', startCommit]);
    recordState(GIT_SCENARIOS.DETACHED_WORKTREE_AT_START, directory, startCommit);
    const moved = commitPath(otherWorktree, 'moved.ts', 'export const moved = true;\n');
    recordState(GIT_SCENARIOS.DETACHED_WORKTREE_MOVED, directory, startCommit, { '<moved>': moved });
  });

  test('a group release landing while a build job is live', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'group-example', startCommit]);
    git(directory, ['branch', 'ticket-378', startCommit]);
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    recordState(GIT_SCENARIOS.GROUP_RELEASE_LAUNCHED, directory, startCommit);
    commitPath(directory, 'built.ts', 'export const built = true;\n');
    const landed = commitPath(directory, 'released.ts', 'export const released = true;\n');
    git(directory, ['branch', '-f', MAIN_LINE, landed]);
    git(directory, ['branch', '-D', 'group-example', 'ticket-378']);
    recordState(GIT_SCENARIOS.GROUP_RELEASE_LANDED, directory, startCommit, { '<landed>': landed });
  });

  test('a refresh worktree added, merged into and removed while a build job is live', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    const refreshWorktree = addWorktree(directory, 'refresh-group-example');
    git(refreshWorktree, ['checkout', '-q', '--detach', startCommit]);
    git(directory, ['branch', '-D', 'worktree/refresh-group-example']);
    recordState(GIT_SCENARIOS.REFRESH_WORKTREE_ADDED, directory, startCommit);
    const moved = commitPath(refreshWorktree, 'refreshed.ts', 'export const refreshed = true;\n');
    recordState(GIT_SCENARIOS.REFRESH_WORKTREE_MERGED_INTO, directory, startCommit, { '<moved>': moved });
    git(directory, ['worktree', 'remove', '--force', refreshWorktree]);
    recordState(GIT_SCENARIOS.REFRESH_WORKTREE_REMOVED, directory, startCommit, { '<moved>': moved });
  });

  test('a ticket landing on the main line mid-build, its branch then made again and deleted', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['checkout', '-q', '-b', 'ticket-020']);
    recordState(GIT_SCENARIOS.OWN_TICKET_BRANCH_MADE, directory, startCommit);
    git(directory, ['branch', 'ticket-019', startCommit]);
    git(directory, ['checkout', '-q', 'ticket-019']);
    const landed = commitPath(directory, 'reviewed.ts', 'export const reviewed = true;\n');
    git(directory, ['branch', '-f', MAIN_LINE, landed]);
    git(directory, ['checkout', '-q', 'ticket-020']);
    recordState(GIT_SCENARIOS.TICKET_LANDED_MID_BUILD, directory, startCommit, { '<landed>': landed });
    git(directory, ['branch', '-D', 'ticket-019']);
    git(directory, ['branch', 'ticket-019', startCommit]);
    recordState(GIT_SCENARIOS.LANDED_TICKET_BRANCH_REMADE, directory, startCommit, { '<landed>': landed });
    git(directory, ['branch', '-D', 'ticket-019']);
    recordState(GIT_SCENARIOS.LANDED_TICKET_BRANCH_DELETED, directory, startCommit, { '<landed>': landed });
  });

  test('another ticket landing on the own target, then a protected ref and the own target moving', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'ticket-001', startCommit]);
    git(directory, ['branch', 'example-protected', startCommit]);
    git(directory, ['checkout', '-q', '-b', 'ticket-002']);
    recordState(GIT_SCENARIOS.OTHER_TICKET_LAUNCHED, directory, startCommit);
    git(directory, ['checkout', '-q', 'ticket-001']);
    const landed = commitPath(directory, 'palette.txt', 'colour: Example\n');
    git(directory, ['branch', '-f', MAIN_LINE, landed]);
    git(directory, ['checkout', '-q', 'ticket-002']);
    const ownTip = commitPath(directory, 'shade.txt', 'shade: Example\n');
    const named = { '<landed>': landed, '<own tip>': ownTip };
    recordState(GIT_SCENARIOS.OTHER_TICKET_LANDED, directory, startCommit, named);
    git(directory, ['branch', '-f', 'example-protected', ownTip]);
    recordState(GIT_SCENARIOS.PROTECTED_BRANCH_MOVED, directory, startCommit, named);
    git(directory, ['branch', '-f', 'example-protected', startCommit]);
    git(directory, ['branch', '-f', MAIN_LINE, ownTip]);
    recordState(GIT_SCENARIOS.OWN_TARGET_MOVED_PAST_LANDING, directory, startCommit, named);
  });

  test('another ticket\'s branch and a group branch deleted', () => {
    const { directory, startCommit } = startedRepository();
    git(directory, ['branch', 'ticket-021', startCommit]);
    git(directory, ['branch', 'group-example', startCommit]);
    recordState(GIT_SCENARIOS.BRANCHES_TO_DELETE_MADE, directory, startCommit);
    git(directory, ['branch', '-D', 'ticket-021', 'group-example']);
    recordState(GIT_SCENARIOS.BRANCHES_DELETED, directory, startCommit);
  });
});
