/**
 * The commit of an Apply's constitutions in its own worktree. What matters: the draft's text is written byte for byte and committed with
 * hooks off, a subject that says whether main had the file and no body, one entity's file alone the subject a list shares; main's blob
 * must be the one the record opened on; a commit git refuses is an unsigned one where the repository signs, carrying git's text; a commit
 * that changes any path outside its list is refused, fail closed, for one `CONSTITUTION.md` as for a forge with entities' list of
 * several; a list that is empty or names a path twice commits nothing; and a tracker below the repository's root commits its own
 * project's file. The folders are real; git answers from the recorded answer sets of
 * `src/services/hephaestus/testing/ConstitutionCommitAnswers.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createPlantedRepository }                             from '../../testing/RecordedAirlockGit.ts';
import { useRecordedGit }                                      from '../../testing/RecordedGit.ts';
import { removeScratchDirectory }                              from '../../testing/ScratchWorkspace.ts';
import { TWO_TRACKER_PROJECTS }                                from '../../testing/TwoTrackerFixture.ts';
import { ConstitutionCommits, type ConstitutionCommitRequest } from './ConstitutionCommits.ts';
import { RECORDED_AIRLOCK_IDS }                                from './testing/AirlocksHarness.ts';
import {
  commitWorktreeOf,
  CONSTITUTION_COMMIT_IDS,
  ConstitutionCommitAnswers,
  DRAFT_CONSTITUTION_TEXT,
  SEVERAL_FILES_SUBJECT,
  type ConstitutionCommitWalk
} from './testing/ConstitutionCommitAnswers.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP } = RECORDED_AIRLOCK_IDS;
const { COMMITTED_TIP, MAIN_BLOB, OTHER_BLOB } = CONSTITUTION_COMMIT_IDS;

const ENTITY_CONSTITUTION_PATH = 'packages/design-system/CONSTITUTION.md';

const ENTITY_CONSTITUTION_TEXT = '# Design system\n\n- Compose before you add a part.\n';

let repository: string | null = null;

afterEach(() => {
  if (repository === null) return;
  removeScratchDirectory(`${repository}-worktrees`);
  removeScratchDirectory(repository);
  repository = null;
});

function plantedRequest(changes: Partial<ConstitutionCommitRequest> = {}): ConstitutionCommitRequest {
  repository = createPlantedRepository('constitution-commits');
  return {
    repositoryRoot: repository,
    worktreesRoot:  `${repository}-worktrees`,
    jobId:          'J1',
    targetTip:      MAIN_TIP,
    constitutions:  [{ path: 'CONSTITUTION.md', baseBlob: MAIN_BLOB, markdown: DRAFT_CONSTITUTION_TEXT }],
    signsCommits:   false,
    ...changes,
  };
}

function entityConstitutions(): ConstitutionCommitRequest['constitutions'] {
  return [
    { path: 'CONSTITUTION.md', baseBlob: MAIN_BLOB, markdown: DRAFT_CONSTITUTION_TEXT },
    { path: ENTITY_CONSTITUTION_PATH, baseBlob: MAIN_BLOB, markdown: ENTITY_CONSTITUTION_TEXT },
  ];
}

function answering(request: ConstitutionCommitRequest, walk: Partial<ConstitutionCommitWalk> = {}): void {
  recordedGit.answerFrom(ConstitutionCommitAnswers.constitutionCommitAnswersOf({
    repository: request.repositoryRoot, jobId: request.jobId, mainTip: MAIN_TIP, committedTip: COMMITTED_TIP, ...walk
  }));
}

function commitCallsAsked(): (readonly string[])[] {
  return recordedGit.flowCalls().filter((asked) => asked[0] === 'commit');
}

describe('a commit', () => {
  test('writes the draft byte for byte in a detached worktree of the tip, stages that path and commits it with an update subject', () => {
    const request = plantedRequest();
    answering(request);

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'committed', commit: COMMITTED_TIP });

    const worktree = commitWorktreeOf(request.repositoryRoot, 'J1');
    expect(readFileSync(join(worktree, 'CONSTITUTION.md'), 'utf8')).toBe(DRAFT_CONSTITUTION_TEXT);
    expect(recordedGit.flowCalls()).toContainEqual(['worktree', 'add', '--quiet', '--detach', worktree, MAIN_TIP]);
    expect(recordedGit.flowCalls()).toContainEqual(['add', '--', 'CONSTITUTION.md']);
    expect(commitCallsAsked()).toEqual([['commit', '--no-verify', '-q', '-m', 'Update the repository constitution']]);
  });

  test('says it adds the constitution when main held no such file', () => {
    const request = plantedRequest({ constitutions: [{ path: 'CONSTITUTION.md', baseBlob: null, markdown: DRAFT_CONSTITUTION_TEXT }] });
    answering(request, { mainBlob: null });

    expect(ConstitutionCommits.commitConstitution(request).verdict).toBe('committed');
    expect(commitCallsAsked()).toEqual([['commit', '--no-verify', '-q', '-m', 'Add the repository constitution']]);
  });

  test('of a tracker below the repository\'s root commits the project\'s CONSTITUTION.md, made from the repository\'s root', () => {
    const request = plantedRequest();
    const repositoryRoot = realpathSync(request.repositoryRoot);
    const projectRequest = { ...request, repositoryRoot: join(request.repositoryRoot, TWO_TRACKER_PROJECTS.GAIA.folder) };
    const constitutionPath = `${TWO_TRACKER_PROJECTS.GAIA.folder}/CONSTITUTION.md`;
    mkdirSync(projectRequest.repositoryRoot, { recursive: true });
    recordedGit.answerFrom(ConstitutionCommitAnswers.constitutionCommitAnswersOf({
      repository: repositoryRoot, worktreesRoot: request.worktreesRoot, jobId: 'J1', mainTip: MAIN_TIP, committedTip: COMMITTED_TIP, constitutionPath
    }));

    expect(ConstitutionCommits.commitConstitution(projectRequest)).toEqual({ verdict: 'committed', commit: COMMITTED_TIP });
    const worktree = commitWorktreeOf(repositoryRoot, 'J1', request.worktreesRoot);
    expect(readFileSync(join(worktree, constitutionPath), 'utf8')).toBe(DRAFT_CONSTITUTION_TEXT);
    expect(recordedGit.flowCalls()).toContainEqual(['add', '--', constitutionPath]);
    expect(ConstitutionCommits.removeCommitWorktree(projectRequest.repositoryRoot, request.worktreesRoot, 'J1')).toBeNull();
  });

  test('of a list writes each draft, stages every listed path and commits them in one commit with one subject', () => {
    const request = plantedRequest({ constitutions: entityConstitutions() });
    answering(request, { constitutionPaths: ['CONSTITUTION.md', ENTITY_CONSTITUTION_PATH] });

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'committed', commit: COMMITTED_TIP });
    const worktree = commitWorktreeOf(request.repositoryRoot, 'J1');
    expect(readFileSync(join(worktree, 'CONSTITUTION.md'), 'utf8')).toBe(DRAFT_CONSTITUTION_TEXT);
    expect(readFileSync(join(worktree, ENTITY_CONSTITUTION_PATH), 'utf8')).toBe(ENTITY_CONSTITUTION_TEXT);
    expect(recordedGit.flowCalls()).toContainEqual(['add', '--', 'CONSTITUTION.md', ENTITY_CONSTITUTION_PATH]);
    expect(commitCallsAsked()).toEqual([['commit', '--no-verify', '-q', '-m', SEVERAL_FILES_SUBJECT]]);
  });

  test('of one entity\'s file alone commits it under the subject a list shares, since it is not the repository constitution', () => {
    const request = plantedRequest({ constitutions: [{ path: ENTITY_CONSTITUTION_PATH, baseBlob: MAIN_BLOB, markdown: ENTITY_CONSTITUTION_TEXT }] });
    answering(request, { constitutionPaths: [ENTITY_CONSTITUTION_PATH] });

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'committed', commit: COMMITTED_TIP });
    expect(recordedGit.flowCalls()).toContainEqual(['add', '--', ENTITY_CONSTITUTION_PATH]);
    expect(commitCallsAsked()).toEqual([['commit', '--no-verify', '-q', '-m', SEVERAL_FILES_SUBJECT]]);
  });

  test('the worktree it leaves is removed', () => {
    const request = plantedRequest();
    answering(request);
    ConstitutionCommits.commitConstitution(request);

    expect(ConstitutionCommits.removeCommitWorktree(request.repositoryRoot, request.worktreesRoot, 'J1')).toBeNull();
    expect(existsSync(commitWorktreeOf(request.repositoryRoot, 'J1'))).toBe(false);
  });
});

describe('a refused commit', () => {
  test('main\'s blob other than the record\'s base refuses constitution-moved before any worktree is made', () => {
    const request = plantedRequest();
    answering(request, { mainBlob: OTHER_BLOB });

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'refused', reason: 'constitution-moved', gitFailure: null });
    expect(existsSync(commitWorktreeOf(request.repositoryRoot, 'J1'))).toBe(false);
  });

  test('a commit git refuses is unsigned where the repository signs, else a git failure, each with git\'s text', () => {
    const signed = plantedRequest({ signsCommits: true });
    answering(signed, { commit: 'unsigned' });
    const unsigned = ConstitutionCommits.commitConstitution(signed);
    expect(unsigned).toMatchObject({ verdict: 'refused', reason: 'constitution-commit-unsigned' });
    expect(unsigned.verdict === 'refused' ? unsigned.gitFailure : null).toContain('gpg failed to sign the data');
    removeScratchDirectory(`${signed.repositoryRoot}-worktrees`);
    removeScratchDirectory(signed.repositoryRoot);

    const unsignedRepository = plantedRequest();
    answering(unsignedRepository, { commit: 'unsigned' });
    expect(ConstitutionCommits.commitConstitution(unsignedRepository)).toMatchObject({ verdict: 'refused', reason: 'git-failed' });
  });

  test('a commit that changes another path beside CONSTITUTION.md is refused constitution-commit-unexpected-paths', () => {
    const request = plantedRequest();
    answering(request, { paths: 'constitution-and-base' });

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'refused', reason: 'constitution-commit-unexpected-paths', gitFailure: null });
  });

  test('a list whose commit changes a path outside it is refused, so that path never lands', () => {
    const request = plantedRequest({ constitutions: entityConstitutions() });
    answering(request, { constitutionPaths: ['CONSTITUTION.md', ENTITY_CONSTITUTION_PATH], paths: 'constitution-and-base' });

    expect(ConstitutionCommits.commitConstitution(request)).toEqual({ verdict: 'refused', reason: 'constitution-commit-unexpected-paths', gitFailure: null });
  });

  test('an empty list or one that names a path twice is refused before git is asked', () => {
    const empty = plantedRequest({ constitutions: [] });
    expect(ConstitutionCommits.commitConstitution(empty)).toEqual({ verdict: 'refused', reason: 'constitution-commit-unexpected-paths', gitFailure: null });
    removeScratchDirectory(empty.repositoryRoot);

    const rootConstitution = { path: 'CONSTITUTION.md', baseBlob: MAIN_BLOB, markdown: DRAFT_CONSTITUTION_TEXT };
    const twice = plantedRequest({ constitutions: [rootConstitution, rootConstitution] });
    expect(ConstitutionCommits.commitConstitution(twice)).toEqual({ verdict: 'refused', reason: 'constitution-commit-unexpected-paths', gitFailure: null });
    expect(recordedGit.flowCalls()).toEqual([]);
  });
});
