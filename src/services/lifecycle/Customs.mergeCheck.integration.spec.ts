/**
 * V10's conflict-marker and whitespace check on real git. What matters: a resolution in a repository holding CRLF blobs passes, because the CR
 * is the file's line ending; a real trailing space or a left conflict marker still refuses; and several hundred long conflicted paths are cut
 * into argvs under `GIT_PATHSPEC_ARGUMENT_CHARACTERS`, a bad file in the last argv still refusing. Each planted case is shown to bite raw git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { GIT_PATHSPEC_ARGUMENT_CHARACTERS } from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                 from '../../lib/git/utils/GitArgumentsUtil.ts';
import { TicketBodyHashUtil }               from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
}                                           from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }            from '../../testing/ToolGuard.ts';
import { CUSTOMS_CHECKS, type CustomsSubject } from './Customs.ts';

const TICKET_BODY = '## Report\nExample report.\n';

const MANY_CONFLICTED_PATHS = 300;

const LONG_FOLDER_NAME = `example-${'folder'.repeat(16)}`;

let repositoryDirectory = '';

beforeEach(() => {
  repositoryDirectory = createScratchGitRepository('customs-merge-check');
  // A machine's own `core.autocrlf` would strip each CR on add, and the repository would then hold no CRLF blob.
  gitOutputIn(repositoryDirectory, ['config', 'core.autocrlf', 'false']);
  commitFile(repositoryDirectory, 'base.ts', 'export const base = true;\n');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function headCommit(): string {
  return gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
}

function writeEach(paths: readonly string[], contentOf: (path: string) => string): void {
  for (const path of paths) writeFileSync(join(repositoryDirectory, path), contentOf(path));
}

function commitEverything(message: string): string {
  gitOutputIn(repositoryDirectory, ['add', '-A']);
  gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  return headCommit();
}

/** Each path changed on both sides from one base, merged with conflicts, and committed with `resolutionOf` as each file's content. */
function conflictedMergeOf(paths: readonly string[], lineEnding: string, resolutionOf: (path: string) => string): { branchTip: string; targetTip: string } {
  writeEach(paths, () => `base line${lineEnding}`);
  const baseCommit = commitEverything('Add the base files');
  writeEach(paths, () => `branch line${lineEnding}`);
  const branchTip = commitEverything('Change the files on the branch');
  gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'example-target', baseCommit]);
  writeEach(paths, () => `target line${lineEnding}`);
  const targetTip = commitEverything('Change the files on the target');
  gitOutputIn(repositoryDirectory, ['checkout', '-q', '-']);
  expect(() => gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'merge', '-q', '--no-ff', '--no-commit', 'example-target'])).toThrow();
  writeEach(paths, resolutionOf);
  commitEverything('Merge the example target');
  return { branchTip, targetTip };
}

function resolverSubject(merge: { branchTip: string; targetTip: string }, conflictedFiles: readonly string[]): CustomsSubject {
  return {
    role:             'resolver',
    worktreePath:     repositoryDirectory,
    startCommit:      merge.branchTip,
    report:           {},
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(TICKET_BODY),
    merge:            { ...merge, conflictedFiles },
  };
}

function v10RefusalOf(subject: CustomsSubject): string | null {
  const verdict = CUSTOMS_CHECKS.V10(subject);
  return verdict.verdict === 'refused' ? verdict.reason : null;
}

function rawCheckFails(branchTip: string, paths: readonly string[]): boolean {
  return Bun.spawnSync(['git', 'diff', '--check', branchTip, 'HEAD', '--', ...paths], { cwd: repositoryDirectory }).exitCode !== 0;
}

describeWhenGitIsPresent('V10 in a repository holding CRLF blobs', () => {
  test('a clean resolution with CRLF line endings passes, though plain `git diff --check` reads each CR as trailing whitespace', () => {
    const paths = ['example.txt'];
    const merge = conflictedMergeOf(paths, '\r\n', () => 'branch line\r\ntarget line\r\n');

    expect(rawCheckFails(merge.branchTip, paths)).toBe(true);
    expect(v10RefusalOf(resolverSubject(merge, paths))).toBeNull();
  });

  test('a real trailing space before the CRLF still refuses', () => {
    const paths = ['example.txt'];
    const merge = conflictedMergeOf(paths, '\r\n', () => 'branch line\r\ntarget line \r\n');

    expect(v10RefusalOf(resolverSubject(merge, paths))).toBe('merge-unresolved');
  });

  test('a conflict marker left in a CRLF file still refuses', () => {
    const paths = ['example.txt'];
    const merge = conflictedMergeOf(paths, '\r\n', () => '<<<<<<< HEAD\r\nbranch line\r\n=======\r\ntarget line\r\n>>>>>>> example-target\r\n');

    expect(v10RefusalOf(resolverSubject(merge, paths))).toBe('merge-unresolved');
  });

  test('the repository\'s own `core.whitespace` still holds beside the CR rule, so a trailing space it allows passes', () => {
    gitOutputIn(repositoryDirectory, ['config', 'core.whitespace', '-blank-at-eol']);
    const paths = ['example.txt'];
    const merge = conflictedMergeOf(paths, '\r\n', () => 'branch line\r\ntarget line \r\n');

    expect(v10RefusalOf(resolverSubject(merge, paths))).toBeNull();
  });
});

describeWhenGitIsPresent('V10 over several hundred long conflicted paths', () => {
  function longPaths(): string[] {
    mkdirSync(join(repositoryDirectory, LONG_FOLDER_NAME));
    return Array.from({ length: MANY_CONFLICTED_PATHS }, (_unused, i) => `${LONG_FOLDER_NAME}/example-conflicted-file-${String(i).padStart(4, '0')}.txt`);
  }

  test('the paths need more than one argv, and a clean resolution of them all passes', () => {
    const paths = longPaths();
    const merge = conflictedMergeOf(paths, '\n', () => 'branch line\ntarget line\n');
    const chunks = GitArgumentsUtil.pathspecChunksOf(paths, GIT_PATHSPEC_ARGUMENT_CHARACTERS);

    expect(paths.join(' ').length).toBeGreaterThan(GIT_PATHSPEC_ARGUMENT_CHARACTERS);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.join(' ').length).toBeLessThan(GIT_PATHSPEC_ARGUMENT_CHARACTERS);
    expect(v10RefusalOf(resolverSubject(merge, paths))).toBeNull();
  });

  test('a trailing space in the last path, which lies in the last argv, still refuses', () => {
    const paths = longPaths();
    const lastPath = paths.at(-1);
    const merge = conflictedMergeOf(paths, '\n', (path) => (path === lastPath ? 'branch line\ntarget line \n' : 'branch line\ntarget line\n'));

    expect(v10RefusalOf(resolverSubject(merge, paths))).toBe('merge-unresolved');
  });
});
