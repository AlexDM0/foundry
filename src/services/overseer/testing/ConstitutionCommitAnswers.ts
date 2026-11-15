/**
 * The recorded git answers of a constitution commit job's walk through the main line's Airlock, one set for each state the repository is in,
 * and an update record on a harness board whose Apply waits for that commit. Test-only.
 */
import { join } from 'node:path';

import type { MainConstitution } from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }            from '../../../lib/tracker-model/Board.ts';
import {
  ancestryAsked,
  commitResolved,
  currentBranchRead,
  stepIn
} from '../../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../../testing/RecordedGit.ts';
import { CONSTITUTION_COMMITS_FOLDER } from '../ConstitutionCommits.ts';
import { CONSTITUTION_FILE_PATH }      from '../InstructionFiles.ts';
import { HARNESS_AT }                  from './AirlocksHarness.ts';

const MAIN_LINE = 'main';

const { BLOB, COMMIT, PATH } = RECORDED_PLACEHOLDERS;

/** More planted ids: the commits a constitution commit job makes, and the blobs of `CONSTITUTION.md`. */
export const CONSTITUTION_COMMIT_IDS = {
  COMMITTED_TIP:        '9'.repeat(40),
  SECOND_COMMITTED_TIP: `${'9'.repeat(39)}0`,
  MAIN_BLOB:            'e'.repeat(40),
  COMMITTED_BLOB:       'f'.repeat(40),
  OTHER_BLOB:           `${'e'.repeat(39)}0`,
} as const;

/** What main's `CONSTITUTION.md` holds when the update record opens. */
export const MAIN_CONSTITUTION: MainConstitution = {
  path:     CONSTITUTION_FILE_PATH,
  markdown: '# Example Agency\n\n- Keep the basket page fast.\n',
  blob:     CONSTITUTION_COMMIT_IDS.MAIN_BLOB,
};

/** The text User's edit gives the draft, which the commit writes. */
export const DRAFT_CONSTITUTION_TEXT = `${MAIN_CONSTITUTION.markdown}- Name things in full.\n`;

/** The merge gate the stored pipeline holds, which a constitution commit never runs. */
export const PLANTED_MERGE_GATE = 'merge-tests';

export const UPDATE_SUBJECT = 'Update the repository constitution';

/** `worktreesRoot` is the Airlocks harness's unless given, such as a DrivePass's worktrees folder inside the repository. */
export function commitWorktreeOf(repository: string, jobId: string, worktreesRoot = `${repository}-worktrees`): string {
  return join(worktreesRoot, CONSTITUTION_COMMITS_FOLDER, jobId);
}

/**
 * A merge gate stored, an update record opened on main's constitution, User's edit of its text, and Apply requested: the request waits
 * for its commit. Returns the record's id.
 */
export function requestConstitutionApply(board: Board, resumesBoard = false): string {
  board.addGate({ name: PLANTED_MERGE_GATE, run: 'bun test' }, HARNESS_AT, ['merge']);
  const { setupId } = board.openSetup({
    mode: 'update', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: MAIN_CONSTITUTION, storedAnnotations: []
  }, HARNESS_AT).setup;
  board.editConstitution(setupId, { revision: 0, markdown: DRAFT_CONSTITUTION_TEXT }, HARNESS_AT);
  board.requestApply(setupId, { draftRevision: 0, resumesBoard, mainConstitution: MAIN_CONSTITUTION }, HARNESS_AT);
  return setupId;
}

export interface ConstitutionCommitWalk {
  repository:     string;
  /** The Airlocks harness's worktrees folder unless set. */
  worktreesRoot?: string;
  jobId:          string;
  /** The main line's tip the job claims on. */
  mainTip:        string;
  committedTip:   string;
  /** Main's blob of `CONSTITUTION.md` at `mainTip`; `MAIN_BLOB` unless set, `null` for no file. */
  mainBlob?:      string | null;
  /** git refuses the commit for a signer that fails, or commits. */
  commit?:        'committed' | 'unsigned';
  /** The commit changes `CONSTITUTION.md` alone, or `base.ts` beside it. */
  paths?:         'constitution-only' | 'constitution-and-base';
  /** The main checkout is clean, or holds a change to `CONSTITUTION.md` that stops the fast-forward. */
  mainCheckout?:  'clean' | 'constitution-modified';
  /** The main line's tip at the landing; `mainTip` unless set, as when someone moved main by hand. */
  tipAtLanding?:  string;
  /** What else answers once the commit landed. */
  afterLanding?:  RecordedGitStage;
}

function blobRead(commit: string, blob: string | null): RecordedGitStep {
  const gitArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}:${CONSTITUTION_FILE_PATH}`];
  return blob === null
    ? { gitArguments, answeredAs: GIT_CALL_SHAPES.BLOB_OF_A_MISSING_PATH }
    : { gitArguments, answeredAs: GIT_CALL_SHAPES.BLOB_OF_A_PATH, filledIn: { [BLOB]: blob } };
}

function forcedRemoval(repository: string, worktree: string): RecordedGitStep {
  return stepIn(repository, { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.FORCED_REMOVE_OF_A_CLEAN_WORKTREE, removesFolder: worktree });
}

/** The landing reads in the main checkout, and its fast-forward, which hands on to `landed` once git moved main. */
function landingSteps(walk: Required<Omit<ConstitutionCommitWalk, 'afterLanding' | 'worktreesRoot'>>, landed: RecordedGitStage): RecordedGitStep[] {
  const { repository, committedTip, tipAtLanding } = walk;
  const modified = walk.mainCheckout === 'constitution-modified';
  const fastForward = ['merge', '--ff-only', '--quiet', committedTip];
  return [
    stepIn(repository, currentBranchRead(MAIN_LINE)),
    commitResolved(`refs/heads/${MAIN_LINE}`, tipAtLanding),
    ancestryAsked(committedTip, tipAtLanding, committedTip === tipAtLanding),
    stepIn(repository, {
      gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      ...modified
        ? { answeredAs: GIT_CALL_SHAPES.NUL_STATUS_OF_A_MODIFIED_PATH, filledIn: { [PATH]: CONSTITUTION_FILE_PATH } }
        : { answeredAs: GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT },
    }),
    stepIn(repository, {
      gitArguments: ['status', '--porcelain=v1', '--untracked-files=no'],
      ...modified
        ? { answeredAs: GIT_CALL_SHAPES.TRACKED_STATUS_OF_A_MODIFIED_PATH, filledIn: { [PATH]: CONSTITUTION_FILE_PATH } }
        : { answeredAs: GIT_CALL_SHAPES.STATUS_OF_TRACKED_FILES_CLEAN },
    }),
    stepIn(repository, {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', committedTip, '--'],
      answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
      filledIn:     { [PATH]: CONSTITUTION_FILE_PATH },
    }),
    stepIn(repository, modified
      ? { gitArguments: fastForward, answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_A_PATH, filledIn: { [PATH]: CONSTITUTION_FILE_PATH, [COMMIT]: committedTip } }
      : { gitArguments: fastForward, answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT, movesTo: landed }),
  ];
}

/**
 * The answers of one constitution commit job, from its claim to its landing: main's tip and blob, the worktree added, the text staged and
 * committed, the commit's paths and blob read, the fast-forward landing and the worktree removed. The fast-forward hands on to a set where
 * main stands at the commit.
 */
function constitutionCommitAnswersOf(walk: ConstitutionCommitWalk): RecordedGitStage {
  const settled = {
    mainBlob: CONSTITUTION_COMMIT_IDS.MAIN_BLOB, commit: 'committed', paths: 'constitution-only', mainCheckout: 'clean', tipAtLanding: walk.mainTip, ...walk
  } as const;
  const {
    repository, jobId, mainTip, committedTip, mainBlob
  } = settled;
  const worktree = commitWorktreeOf(repository, jobId, walk.worktreesRoot);
  const commitArguments = ['commit', '--no-verify', '-q', '-m', mainBlob === null ? 'Add the repository constitution' : UPDATE_SUBJECT];
  const sharedSteps: RecordedGitStep[] = [
    blobRead(mainTip, mainBlob),
    blobRead(committedTip, CONSTITUTION_COMMIT_IDS.COMMITTED_BLOB),
    stepIn(repository, { gitArguments: ['worktree', 'add', '--quiet', '--detach', worktree, mainTip], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: worktree }),
    stepIn(worktree, { gitArguments: ['add', '--', CONSTITUTION_FILE_PATH], answeredAs: GIT_CALL_SHAPES.STAGE_OF_A_CHANGED_PATH }),
    stepIn(worktree, settled.commit === 'unsigned'
      ? { gitArguments: commitArguments, answeredAs: GIT_CALL_SHAPES.COMMIT_UNSIGNED_BY_A_FAILING_SIGNER }
      : { gitArguments: commitArguments, answeredAs: GIT_CALL_SHAPES.COMMIT_OF_A_STAGED_PATH }),
    stepIn(worktree, commitResolved('HEAD', settled.commit === 'unsigned' ? mainTip : committedTip)),
    stepIn(worktree, {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', mainTip, committedTip, '--'],
      answeredAs:   settled.paths === 'constitution-only' ? GIT_CALL_SHAPES.PATHS_BETWEEN_TWO_COMMITS : GIT_CALL_SHAPES.TWO_PATHS_BETWEEN_TWO_COMMITS,
      filledIn:     { [PATH]: CONSTITUTION_FILE_PATH },
    }),
    forcedRemoval(repository, worktree),
  ];
  const landed: RecordedGitStep[] = [
    commitResolved(`refs/heads/${MAIN_LINE}`, committedTip),
    stepIn(repository, commitResolved('HEAD', committedTip)),
    ...sharedSteps,
    ...walk.afterLanding ?? [],
  ];
  return [...sharedSteps, ...landingSteps(settled, landed), ...walk.afterLanding ?? []];
}

export const ConstitutionCommitAnswers = Object.freeze({ constitutionCommitAnswersOf });
