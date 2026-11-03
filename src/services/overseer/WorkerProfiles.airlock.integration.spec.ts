/**
 * An Airlock agent under the real Seatbelt sandbox, its write rules the builder profile's denies over the linked-worktree carve-out (the
 * worktree and the shared `.git` writable). What matters: every path git writes to conclude a conflicting merge in a linked worktree is
 * writable to the confined child, and the same child cannot move the target branch's ref. The sandbox and the files are real; git answers
 * from the recorded flow stage `worktree made` of `src/testing/RecordedGitFlow.ts`, and the paths a merge commit writes are recorded from
 * real git. Skipped through `src/testing/ToolGuard.ts` where `sandbox-exec` does not apply.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { join }                          from 'node:path';
import { afterEach, beforeEach, expect } from 'bun:test';

import { dataFoldersFor }                                       from '../../lib/data-folders/DataFoldersFor.ts';
import { PRODUCT_NAMES }                                        from '../../shared/constants/ProductNames.ts';
import { useRecordedGit }                                       from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE, RECORDED_FLOW_TICKET_BRANCH } from '../../testing/RecordedGitFlow.ts';
import { createScratchDirectory, removeScratchDirectory }       from '../../testing/ScratchWorkspace.ts';
import { testWhenSandboxExecApplies }                           from '../../testing/ToolGuard.ts';
import { NO_TOOLCHAIN, WorkerProfiles }                         from './WorkerProfiles.ts';
import { createProcessWatcherSandbox }                          from './testing/SeatbeltSpecSandbox.ts';

const recordedGit = useRecordedGit();

const TICKET_BRANCH = RECORDED_FLOW_TICKET_BRANCH;
const WORKTREE_NAME = RECORDED_FLOW_TICKET_BRANCH;
const OBJECT_FOLDER = 'objects/18';
const OBJECT_NAME = '1e7917e875400802cadfaf86a94640d288aa04';
const TARGET_TIP_TEXT = 'the target tip\n';
const MERGE_WAITING_FILES = ['AUTO_MERGE', 'MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE'];

let repository = '';

beforeEach(() => {
  repository = realpathSync(createScratchDirectory('airlock-agent-sandbox'));
});

afterEach(() => {
  removeScratchDirectory(repository);
});

/**
 * The writes of `git commit --no-edit` concluding a conflicted merge in the linked worktree, below the shared `.git`, each through its lock
 * and rename as git makes it. Retake: merge with a conflict in a linked worktree, `touch` a stamp, commit, and list
 * `find <common .git> -newer <stamp>`; the merge files the commit deletes are listed with `ls` before it.
 */
function mergeCommitWritesOf(adminFolder: string): string {
  return [
    `mkdir -p ${OBJECT_FOLDER} && printf object > ${OBJECT_FOLDER}/tmp_obj && mv ${OBJECT_FOLDER}/tmp_obj ${OBJECT_FOLDER}/${OBJECT_NAME}`,
    `printf index > ${adminFolder}/index.lock && mv ${adminFolder}/index.lock ${adminFolder}/index`,
    `printf message > ${adminFolder}/COMMIT_EDITMSG`,
    `printf entry >> ${adminFolder}/logs/HEAD`,
    `rm ${MERGE_WAITING_FILES.map((mergeFile) => `${adminFolder}/${mergeFile}`).join(' ')}`,
    `printf tip > refs/heads/${TICKET_BRANCH}.lock && mv refs/heads/${TICKET_BRANCH}.lock refs/heads/${TICKET_BRANCH}`,
    `printf entry >> logs/refs/heads/${TICKET_BRANCH}`,
  ].join(' && ');
}

/** The layout real git keeps below the shared `.git` before the commit: the ref folders, and the merge files of the waiting merge. */
function plantMergeWaitingLayout(commonGitDirectory: string, mainLine: string): string {
  const adminFolder = join('worktrees', WORKTREE_NAME);
  mkdirSync(join(commonGitDirectory, 'refs', 'heads'), { recursive: true });
  mkdirSync(join(commonGitDirectory, 'logs', 'refs', 'heads'), { recursive: true });
  mkdirSync(join(commonGitDirectory, adminFolder, 'logs'), { recursive: true });
  writeFileSync(join(commonGitDirectory, 'refs', 'heads', mainLine), TARGET_TIP_TEXT);
  for (const mergeFile of MERGE_WAITING_FILES) writeFileSync(join(commonGitDirectory, adminFolder, mergeFile), '');
  return adminFolder;
}

testWhenSandboxExecApplies('a sandboxed Airlock agent writes every path its merge commit in a linked worktree writes, and cannot move the target branch', () => {
  const mainLine = RECORDED_FLOW_MAIN_LINE;
  const worktree = join(repository, PRODUCT_NAMES.WORKTREES_FOLDER, WORKTREE_NAME);
  mkdirSync(worktree, { recursive: true });
  recordedGit.enterFlowStage('worktree made', repository);
  const facts = WorkerProfiles.sandboxFactsOf({
    repositoryRoot:       repository,
    dataFolder:           join(repository, '.agent-progress-v2'),
    monitorFolder:        join(repository, 'monitor'),
    homeDirectory:        join(repository, 'home'),
    worktree,
    ownBranch:            TICKET_BRANCH,
    mainLine,
    groupPrefix:          'group-',
    hatchDirectory:       join(repository, 'hatch'),
    executableSearchPath: [],
    cacheFolderStyle:     dataFoldersFor('darwin', ''),
    sandboxDenyShape:     'path-rules',
    credentialPaths:      [join(repository, 'home', '.ssh')],
    guardCommand:         null,
  }, null);
  const adminFolder = plantMergeWaitingLayout(facts.commonGitDirectory, mainLine);
  const profile = WorkerProfiles.profileOf('builder', facts, NO_TOOLCHAIN);
  const sandbox = createProcessWatcherSandbox();
  const profilePath = join(repository, 'airlock-agent.sb');
  writeFileSync(profilePath, sandbox.profileTextOf({
    worktree,
    worktreeAdminFolder:  facts.commonGitDirectory,
    homeDirectory:        facts.homeDirectory,
    temporaryDirectory:   null,
    cachePaths:           [],
    executableSearchPath: [],
    cacheFolderStyle:     facts.cacheFolderStyle,
    deniedWritableRoots:  profile.deniedWritableRoots,
    deniedReadableRoots:  profile.deniedReadableRoots,
    network:              false,
  }));
  const fakeAirlockAgentScript = [
    `${mergeCommitWritesOf(adminFolder)} && echo merge-committed`,
    `printf moved > refs/heads/${mainLine}.lock 2>/dev/null && mv refs/heads/${mainLine}.lock refs/heads/${mainLine} 2>/dev/null && echo target-moved`,
  ].join('; ');
  const run = Bun.spawnSync({ cmd: sandbox.sandboxedArgvOf(profilePath, ['/bin/sh', '-c', fakeAirlockAgentScript]), cwd: facts.commonGitDirectory, stderr: 'ignore' });
  expect(run.stdout.toString().split('\n').filter((line) => line !== '')).toEqual(['merge-committed']);
  expect(existsSync(join(facts.commonGitDirectory, 'refs', 'heads', TICKET_BRANCH))).toBe(true);
  expect(readFileSync(join(facts.commonGitDirectory, 'refs', 'heads', mainLine), 'utf8')).toBe(TARGET_TIP_TEXT);
});
