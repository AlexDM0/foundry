/**
 * V10's conflict-marker and whitespace check, on git answers recorded from real merges by `src/lib/git/RecordedGitAnswers.integration.spec.ts`.
 * What matters: V10 checks a resolution with `cr-at-eol` added to the repository's own `core.whitespace`, so a resolution in a repository
 * holding CRLF blobs passes; a real trailing space or a left conflict marker still refuses; and several hundred long conflicted paths are cut
 * into argvs under `GIT_PATHSPEC_ARGUMENT_CHARACTERS`, each one checked, a bad file in the last argv still refusing.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import { GIT_PATHSPEC_ARGUMENT_CHARACTERS } from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                 from '../../lib/git/utils/GitArgumentsUtil.ts';
import { fakeAgentAdapter }                 from '../../testing/FakeAgentAdapter.ts';
import {
  GIT_CALL_SHAPES,
  type GitCallShape,
  type RecordedGitStage,
  recordedLongConflictedPaths,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import type { CustomsSubject }                            from './@types/CustomsSubject.ts';
import { CUSTOMS_CHECKS }                                 from './Customs.ts';

const TICKET_BODY = '## Report\nExample report.\n';
const BRANCH_TIP = '1'.repeat(40);
const TARGET_TIP = '2'.repeat(40);
const MERGE_COMMIT = '3'.repeat(40);
const COMMITS_FILLED_IN = { '<commit>': MERGE_COMMIT, '<first tip>': BRANCH_TIP, '<second tip>': TARGET_TIP };

const { playStage } = useRecordedGit();

let worktreeDirectory = '';

beforeEach(() => {
  worktreeDirectory = createScratchDirectory('customs-merge-check');
});

afterEach(() => {
  removeScratchDirectory(worktreeDirectory);
});

function airlockAgentSubject(conflictedFiles: readonly string[]): CustomsSubject {
  return {
    role:                'airlock-agent',
    worktreePath:        worktreeDirectory,
    startCommit:         BRANCH_TIP,
    report:              {},
    ticketBody:          TICKET_BODY,
    contentHashAtLaunch: '0123456789abcdef',
    ticketContentHash:   '0123456789abcdef',
    merge:               { branchTip: BRANCH_TIP, targetTip: TARGET_TIP, conflictedFiles },
    agentNaming:         fakeAgentAdapter(),
  };
}

/** The calls V10 makes up to its checks: the unmerged paths, the merge in range and the repository's whitespace rule. */
function callsBeforeTheChecks(whitespaceRule: GitCallShape = GIT_CALL_SHAPES.WHITESPACE_RULE_UNSET): RecordedGitStage {
  return [
    { gitArguments: ['ls-files', '-u'], answeredAs: GIT_CALL_SHAPES.NO_UNMERGED_PATH },
    { gitArguments: ['rev-list', '--merges', '--reverse', `${BRANCH_TIP}..HEAD`, `^${TARGET_TIP}`], answeredAs: GIT_CALL_SHAPES.MERGE_IN_RANGE, filledIn: COMMITS_FILLED_IN },
    { gitArguments: ['config', '--get', 'core.whitespace'], answeredAs: whitespaceRule },
  ];
}

function checkOf(rule: string, paths: readonly string[], answeredAs: GitCallShape): RecordedGitStage[number] {
  return { gitArguments: ['-c', `core.whitespace=${rule}`, 'diff', '--check', BRANCH_TIP, 'HEAD', '--', ...paths], answeredAs };
}

const PARENTS_OF_THE_MERGE: RecordedGitStage[number] = {
  gitArguments: ['rev-list', '--parents', '-n', '1', MERGE_COMMIT],
  answeredAs:   GIT_CALL_SHAPES.PARENTS_OF_THE_MERGE,
  filledIn:     COMMITS_FILLED_IN,
};

async function v10RefusalIn(stage: RecordedGitStage, conflictedFiles: readonly string[]): Promise<string | null> {
  const verdict = await playStage(stage, () => Promise.resolve(CUSTOMS_CHECKS.V10(airlockAgentSubject(conflictedFiles))));
  return verdict.verdict === 'refused' ? verdict.reason : null;
}

describeWhenGitIsRecorded('V10 in a repository holding CRLF blobs', () => {
  const paths = ['example.txt'];

  test('a clean resolution with CRLF line endings passes, checked with cr-at-eol', async () => {
    expect(await v10RefusalIn([
      ...callsBeforeTheChecks(),
      checkOf('cr-at-eol', paths, GIT_CALL_SHAPES.CHECK_OF_A_CLEAN_CRLF_RESOLUTION),
      PARENTS_OF_THE_MERGE,
    ], paths)).toBeNull();
  });

  test('a real trailing space before the CRLF still refuses', async () => {
    expect(await v10RefusalIn([...callsBeforeTheChecks(), checkOf('cr-at-eol', paths, GIT_CALL_SHAPES.CHECK_OF_A_CRLF_TRAILING_SPACE)], paths))
      .toBe('merge-unresolved');
  });

  test('a conflict marker left in a CRLF file still refuses', async () => {
    expect(await v10RefusalIn([...callsBeforeTheChecks(), checkOf('cr-at-eol', paths, GIT_CALL_SHAPES.CHECK_OF_A_CRLF_CONFLICT_MARKER)], paths))
      .toBe('merge-unresolved');
  });

  test('the repository\'s own `core.whitespace` still holds beside the CR rule, so a trailing space it allows passes', async () => {
    expect(await v10RefusalIn([
      ...callsBeforeTheChecks(GIT_CALL_SHAPES.WHITESPACE_RULE_SET),
      checkOf('-blank-at-eol,cr-at-eol', paths, GIT_CALL_SHAPES.CHECK_OF_AN_ALLOWED_TRAILING_SPACE),
      PARENTS_OF_THE_MERGE,
    ], paths)).toBeNull();
  });
});

describeWhenGitIsRecorded('V10 over several hundred long conflicted paths', () => {
  const paths = recordedLongConflictedPaths();
  const chunks = GitArgumentsUtil.pathspecChunksOf(paths, GIT_PATHSPEC_ARGUMENT_CHARACTERS);

  test('the paths need more than one argv, and a clean resolution of them all passes, each argv checked', async () => {
    expect(paths.join(' ').length).toBeGreaterThan(GIT_PATHSPEC_ARGUMENT_CHARACTERS);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.join(' ').length).toBeLessThan(GIT_PATHSPEC_ARGUMENT_CHARACTERS);
    expect(await v10RefusalIn([
      ...callsBeforeTheChecks(),
      ...chunks.map((chunk) => checkOf('cr-at-eol', chunk, GIT_CALL_SHAPES.CHECK_OF_CLEAN_LONG_PATHS)),
      PARENTS_OF_THE_MERGE,
    ], paths)).toBeNull();
  });

  test('a trailing space in the last path, which lies in the last argv, still refuses', async () => {
    const lastChunk = chunks.at(-1) ?? [];
    expect(await v10RefusalIn([
      ...callsBeforeTheChecks(),
      ...chunks.slice(0, -1).map((chunk) => checkOf('cr-at-eol', chunk, GIT_CALL_SHAPES.CHECK_OF_CLEAN_LONG_PATHS)),
      checkOf('cr-at-eol', lastChunk, GIT_CALL_SHAPES.CHECK_OF_A_LONG_PATH_TRAILING_SPACE),
    ], paths)).toBe('merge-unresolved');
  });
});
