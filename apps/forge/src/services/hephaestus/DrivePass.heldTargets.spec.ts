/**
 * A main line held by its checkout, behind the DrivePass's sweep: when User cleans main, the next sweep allocates again, though an unforced
 * wake runs no pass since the checkout is not in the fingerprint. Git answers from
 * `src/services/hephaestus/testing/ConstitutionCommitAnswers.ts`; the Assistant's session plays `src/testing/RecordedTalosStages.ts`.
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
}                from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { Board }                                               from '../../lib/tracker-model/Board.ts';
import { WorktreesFolder }                                          from '../../shared/WorktreesFolder.ts';
import { createScratchDrivePass }                                   from '../../testing/DrivePassHarness.ts';
import { fakeAgentAdapter, fakeStartedLine }                        from '../../testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                      from '../../testing/FakeGateConfinement.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                                  from '../../testing/LockTakers.ts';
import { nativePlatformPorts }                                      from '../../testing/NativePlatformPorts.ts';
import { commitResolved, createPlantedRepository, revisionMissing } from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { type RecordedTalosStages, useRecordedTalosStages }                            from '../../testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }                              from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }                           from '../../testing/ToolGuard.ts';
import { EXAMPLE_TICKET_FILE_NAME, writeReadableTracker }                              from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                                                   from '../../testing/WaitUntil.ts';
import { localStoreLayoutOf }                                                          from '../tracker/LocalStoreLayout.ts';
import { writeTracker }                                                                from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor, type Workspace }                                           from '../tracker/Workspace.ts';
import type { DrivePass }                                                              from './DrivePass.ts';
import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf }                         from './InstructionFiles.ts';
import { HARNESS_AT, RECORDED_AIRLOCK_IDS }                                            from './testing/AirlocksHarness.ts';
import { CONSTITUTION_COMMIT_IDS, ConstitutionCommitAnswers, DRAFT_CONSTITUTION_TEXT } from './testing/ConstitutionCommitAnswers.ts';

const recordedGit = useRecordedGit();
const world = useRecordedTalosStages(nativePlatformPorts());

const MAIN_LINE = 'main';
const STAMP = '2026-11-13T10:00:00+01:00';
const { MAIN_TIP } = RECORDED_AIRLOCK_IDS;
const { BRANCH, PATH } = RECORDED_PLACEHOLDERS;

/** The Assistant starts and then waits on its stdin, so it stays live through the spec. */
const WAITING_ASSISTANT = fakeAgentAdapter([{ kind: 'print', line: fakeStartedLine('fake-assistant') }, { kind: 'await-line' }, { kind: 'await-line' }]);

let ports: RecordedTalosStages['ports'];
let repository = '';
let workspace: Workspace;
let monitorFolder = '';
let drivePass: DrivePass | null = null;

/** What each pass asks beside the commit's walk: the main line's tip and CLAUDE.md, the signing setting, and the board's lone ticket branch. */
function passReads(): RecordedGitStage {
  return [
    commitResolved(MAIN_LINE, MAIN_TIP),
    { gitArguments: ['show', `${MAIN_LINE}:CLAUDE.md`], answeredAs: GIT_CALL_SHAPES.FILE_NOT_ON_BRANCH, filledIn: { [BRANCH]: MAIN_LINE, [PATH]: 'CLAUDE.md' } },
    { gitArguments: ['config', '--bool', 'commit.gpgsign'], answeredAs: GIT_CALL_SHAPES.COMMIT_SIGNING_OFF },
    revisionMissing('refs/heads/ticket-001'),
  ];
}

function commitWalkOf(jobId: string, mainCheckout: 'clean' | 'constitution-modified'): RecordedGitStage {
  return ConstitutionCommitAnswers.constitutionCommitAnswersOf({
    repository,
    worktreesRoot: WorktreesFolder.worktreesRootOf(repository),
    jobId,
    mainTip:       MAIN_TIP,
    committedTip:  CONSTITUTION_COMMIT_IDS.COMMITTED_TIP,
    mainBlob:      null,
    mainCheckout,
    afterLanding:  passReads(),
  });
}

function startedDrivePass(): DrivePass {
  return createScratchDrivePass({
    platformPorts:   { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:   world.processStarts,
    workspace,
    now:             () => new Date(Date.parse(STAMP)),
    formatStamp:     () => STAMP,
    talosConnection: () => world.connectionFor(workspace.trackerDirectory),
    agentAdapter:    WAITING_ASSISTANT,
    monitorFolder,
    mainLine:        MAIN_LINE,
    log:             () => undefined,
  });
}

/** An update's Apply of a constitution main does not hold yet: the request waits for its commit. */
function requestApply(board: Board, at: string): void {
  board.addGate({ name: 'checks', run: 'true' }, at);
  board.setAssistant(true, at);
  board.setHephaestusState('running', at);
  const { setupId } = board.openSetup({
    mode: 'update', billing: { mode: 'subscription' }, agent: null, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, at).setup;
  board.editConstitution(setupId, { revision: 0, markdown: DRAFT_CONSTITUTION_TEXT }, at);
  board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, at);
}

function loggedKinds(): string[] {
  return readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8').trimEnd().split('\n').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

async function passOnce(current: DrivePass, forced: boolean): Promise<void> {
  current.wake(forced);
  await current.idle();
}

beforeEach(async () => {
  ({ ports } = world);
  repository    = createPlantedRepository('held-targets');
  workspace     = workspacePathsFor(repository);
  monitorFolder = createScratchDirectory('held-targets-monitor');
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
  writeReadableTracker(workspace);
  rmSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, EXAMPLE_TICKET_FILE_NAME));
  for (const path of [CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('assistant')]) {
    mkdirSync(join(repository, path, '..'), { recursive: true });
    writeFileSync(join(repository, path), 'Example instructions.\n');
  }
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        HARNESS_AT,
    now:       () => new Date(Date.parse(STAMP)),
    mutate:    (change) => requestApply(change.board, change.at)
  });
});

afterEach(async () => {
  await drivePass?.stop();
  drivePass = null;
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repository);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a main line held by its checkout', () => {
  test('the sweep after the pass that held it runs a pass, which lands the commit once User cleaned the checkout', async () => {
    recordedGit.answerFrom(commitWalkOf('J2', 'constitution-modified'));
    const current = startedDrivePass();
    drivePass = current;
    await current.regroup();
    // Settled once an unforced wake runs no pass: the Assistant's start events are applied and the held pass's fingerprint stands.
    await waitUntil(async () => {
      const { passes } = current.state();
      await passOnce(current, false);
      return current.state().passes === passes;
    }, () => 'the passes settling');
    expect(current.state().notices).toEqual([{
      kind: 'dirty-main-checkout', target: MAIN_LINE, branch: MAIN_LINE, blockingFiles: ['CONSTITUTION.md']
    }]);
    expect(loggedKinds()).toContain('pipeline-apply-held');

    recordedGit.answerFrom(commitWalkOf('J3', 'clean'));
    await passOnce(current, false);
    expect(loggedKinds(), 'an unforced wake reads the same fingerprint').not.toContain('pipeline-applied');

    current.sweep();
    await current.idle();
    expect(loggedKinds()).toContain('pipeline-applied');
    expect(current.state().notices).toEqual([]);
  });
});
