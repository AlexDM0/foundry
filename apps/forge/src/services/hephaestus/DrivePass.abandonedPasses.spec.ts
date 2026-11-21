/**
 * A pass abandoned on one of the tracker lock's expected conditions, and a crash for anything else. What matters: a pass whose hold throws
 * `tracker-lock-held` three times in a row raises the notice and writes the count to presence, and the next pass that runs to its end clears
 * both; an abandoned forced pass is tried again at the next wake-up, even one with nothing observed changed; a pass that throws a plain error
 * runs the crash path once and no wake-up runs another pass. The throws come from the hold's first phase; git answers from the recorded flow
 * stages and Talos from `src/testing/RecordedTalosStages.ts`.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { OperationRefusal }                                  from '../../shared/OperationRefusal.ts';
import { createScratchDrivePass }                            from '../../testing/DrivePassHarness.ts';
import { fakeAgentAdapter }                                  from '../../testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                               from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                               from '../../testing/NativePlatformPorts.ts';
import { useRecordedGit }                                    from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                           from '../../testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }  from '../../testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT } from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                              from '../../testing/TrackerFileFixtures.ts';
import { localStoreLayoutOf }                                from '../tracker/LocalStoreLayout.ts';
import { workspacePathsFor, type Workspace }                 from '../tracker/Workspace.ts';
import type { PresenceRecord }                               from './@types/PresenceRecord.ts';
import type { DrivePass }                                    from './DrivePass.ts';
import { hephaestusFilesIn }                                 from './HephaestusFiles.ts';
import { Presence }                                          from './Presence.ts';

const recordedGit = useRecordedGit();
const world = useRecordedTalosStages(nativePlatformPorts());

const STAMP = '2026-11-19T22:11:03+01:00';

let ports: RecordedTalosStages['ports'];
let repository = '';
let workspace: Workspace;
let monitorFolder = '';
let hephaestusLog: string[] = [];
let drivePass: DrivePass | null = null;
/** What the hold's first phase throws at each pass, in order; a pass past the list runs to its end. */
let throwsOfThePasses: unknown[] = [];
let holdsEntered = 0;
let crashesHandedToTheCrashPath: unknown[] = [];

function lockHeld(): OperationRefusal {
  return new OperationRefusal('unrepaired', { kind: 'tracker-lock-held', lockDirectoryPath: join(workspace.trackerDirectory, 'example-lock') });
}

function startedDrivePass(): DrivePass {
  const started = createScratchDrivePass({
    platformPorts:     { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace,
    now:               () => new Date(Date.parse(STAMP)),
    formatStamp:       () => STAMP,
    talosConnection:   () => world.connectionFor(workspace.trackerDirectory),
    agentAdapter:      fakeAgentAdapter(),
    monitorFolder,
    mainLine:          RECORDED_FLOW_MAIN_LINE,
    // A decision the Playbook opens needs a question, as Hephaestus's own wording gives it.
    decisionWordingOf: (draft) => ({
      questions: [{
        question: `Example ${draft.kind}?`, header: draft.kind, multiSelect: false, options: []
      }],
      context: ''
    }),
    log:            (line) => hephaestusLog.push(line),
    afterHoldPhase: (phase) => {
      if (phase !== 'relayed-commands') return;
      holdsEntered += 1;
      const thrown: unknown = throwsOfThePasses.shift();
      if (thrown !== undefined) throw thrown;
    },
    onPassCrashed: (thrown) => {
      crashesHandedToTheCrashPath.push(thrown);
      return Promise.resolve();
    },
  });
  Presence.writeStartedPresence(hephaestusFilesIn(workspace.trackerDirectory), {
    generation:          started.state().generation,
    process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
    codeVersion:         'code-example',
    startOrigin:         'user',
    startedAt:           STAMP,
    startClassification: null,
  });
  drivePass = started;
  return started;
}

async function passOnce(current: DrivePass, forced: boolean): Promise<void> {
  current.wake(forced);
  await current.idle();
}

function storedAbandonedPasses(): PresenceRecord['abandonedPasses'] {
  const reading = Presence.readPresence(hephaestusFilesIn(workspace.trackerDirectory));
  if (reading.verdict !== 'read') throw new Error(`presence.json reads ${reading.verdict}`);
  return reading.record.abandonedPasses;
}

function abandonedNotices(current: DrivePass): unknown[] {
  return current.state().notices.filter((notice) => notice.kind === 'passes-abandoned');
}

beforeEach(() => {
  ({ ports } = world);
  repository = createScratchDirectory('abandoned-passes');
  mkdirSync(join(repository, '.git'));
  recordedGit.enterFlowStage('tracker ready', repository);
  workspace = workspacePathsFor(repository);
  monitorFolder = createScratchDirectory('h');
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
  writeReadableTracker(workspace);
  hephaestusLog = [];
  throwsOfThePasses = [];
  holdsEntered = 0;
  crashesHandedToTheCrashPath = [];
});

afterEach(async () => {
  await drivePass?.stop();
  drivePass = null;
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repository);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a pass abandoned on a held lock', () => {
  test('three in a row raise the notice and write the count to presence, and the next completed pass clears both', async () => {
    const current = startedDrivePass();
    throwsOfThePasses = [lockHeld(), lockHeld()];
    await passOnce(current, true);
    await passOnce(current, true);
    expect(abandonedNotices(current)).toEqual([]);
    expect(storedAbandonedPasses().inARow).toBe(2);

    throwsOfThePasses = [lockHeld()];
    await passOnce(current, true);
    expect(abandonedNotices(current)).toEqual([{ kind: 'passes-abandoned', inARow: 3, reason: 'tracker-lock-held' }]);
    expect(storedAbandonedPasses()).toEqual({ inARow: 3, last: { reason: 'tracker-lock-held', detail: lockHeld().message, at: STAMP } });
    expect(hephaestusLog).toContain(`Drive pass abandoned (tracker-lock-held); it waits for the next wake-up: ${lockHeld().message}`);
    expect(crashesHandedToTheCrashPath).toEqual([]);

    await passOnce(current, true);
    expect(abandonedNotices(current)).toEqual([]);
    expect(storedAbandonedPasses()).toEqual({ inARow: 0, last: { reason: 'tracker-lock-held', detail: lockHeld().message, at: STAMP } });
  });

  test('an abandoned forced pass is tried again at the next wake-up, though nothing observed changed', async () => {
    const current = startedDrivePass();
    await passOnce(current, true);
    await passOnce(current, false);
    const holdsOfTheSettledBoard = holdsEntered;

    throwsOfThePasses = [lockHeld()];
    await passOnce(current, true);
    expect(holdsEntered).toBe(holdsOfTheSettledBoard + 1);
    await passOnce(current, false);
    expect(holdsEntered).toBe(holdsOfTheSettledBoard + 2);
    expect(storedAbandonedPasses().inARow).toBe(0);
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a pass that throws anything else', () => {
  test('a plain error runs the crash path once, and no wake-up runs a further pass', async () => {
    const current = startedDrivePass();
    const crash = new Error('example unexpected failure');
    throwsOfThePasses = [crash];
    await passOnce(current, true);
    expect(crashesHandedToTheCrashPath).toEqual([crash]);
    expect(hephaestusLog).toContain('Drive pass crashed: example unexpected failure; the crash path runs and no further pass runs.');

    await passOnce(current, true);
    current.sweep();
    await current.idle();
    expect(holdsEntered).toBe(1);
    expect(crashesHandedToTheCrashPath).toEqual([crash]);
    expect(storedAbandonedPasses().inARow).toBe(0);
  });
});
