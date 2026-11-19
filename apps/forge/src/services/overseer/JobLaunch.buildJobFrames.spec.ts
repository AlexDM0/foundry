/**
 * A build job's wind-down, close and stop frames to the board's Talos, a recording one answering for it. What matters: a Talos that
 * answers no frame on one pass is sent it on a later pass, its marker written only once Talos took it; a frame whose marker was written is
 * never sent again, a restarted Overseer included, since the marker is all that carries over (delivery is at least once: an Overseer that
 * dies before the marker sends it again); a child no longer live is sent nothing and leaves no marker; and a session resumed after a red
 * handoff gets its own wind-down at the resume budget, counted from the resume.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join }                      from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                                        from '../../lib/tracker-model/@types/Job.ts';
import { DISPATCH_PROTOCOL }                                               from '../../shared/constants/DispatchProtocol.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET, SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import { clientEntryLinesOf }                                              from '../../testing/ClientEntryLines.ts';
import { type FrameRecordingTalos, frameRecordingTalos }                   from '../../testing/FrameRecordingTalos.ts';
import { nativePlatformPorts }                                             from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                                    from '../../testing/PlantedChild.ts';
import { createScratchDirectory, removeScratchDirectory }                  from '../../testing/ScratchWorkspace.ts';
import { type BuildJobFrameRequest, JobLaunch }                            from './JobLaunch.ts';
import { jobFolderIn }                                                     from './OverseerFiles.ts';
import { RedHandoff, type RedHandoffFacts }                                from './RedHandoff.ts';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id:                 'J2',
    kind:               'build',
    role:               'builder',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}

function redHandoffFactsIn(jobFolder: string): RedHandoffFacts {
  return {
    kind:                'gate',
    name:                'tests',
    command:             'bun test',
    fixCommand:          null,
    commit:              'example-commit',
    exitCode:            1,
    batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
    fullLogPath:         join(jobFolder, 'gate.log'),
    resume:              1,
    resumesAllowed:      2,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: 1,
  };
}


describe('a build job\'s frames to its session', () => {
  let trackerDirectory = '';
  let talos: FrameRecordingTalos;
  let request: BuildJobFrameRequest;

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('build-frames');
    talos            = frameRecordingTalos(trackerDirectory, nativePlatformPorts());
    request = {
      boardChildren:   talos.boardChildren,
      trackerDirectory,
      agentAdapter:    { chatLineOf: (message) => `chat:${message}` },
      windDownMessage: 'Example wind-down',
    };
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
  });

  /** The job's session at `instance`, live under the board's Talos. */
  function plantLiveSession(job: Job, instance = 1): void {
    talos.plantLiveChild(jobFolderIn(trackerDirectory, job.id), instance);
  }

  /** The client entries of the frames Talos took while `during` ran. */
  async function framesSentWhile(during: () => Promise<void>): Promise<readonly string[]> {
    const framesBefore = talos.frames().length;
    await during();
    return clientEntryLinesOf(talos.frames().slice(framesBefore));
  }

  /** A pass Talos answers nothing of, then two it answers: the frames it took and the marker after each phase. */
  async function passesAcrossARefusal(job: Job, marker: string): Promise<{ markedWhileRefusing: boolean; frames: readonly string[]; marked: boolean }> {
    plantLiveSession(job);
    const markerPath = join(jobFolderIn(trackerDirectory, job.id), marker);
    talos.answers(false);
    await JobLaunch.deliverBuildJobFrames(request, job, 0);
    talos.answers(true);
    const markedWhileRefusing = existsSync(markerPath);
    const frames = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(request, job, 0);
      await JobLaunch.deliverBuildJobFrames(request, job, 0);
    });
    return { markedWhileRefusing, frames, marked: existsSync(markerPath) };
  }

  test('a stopping job\'s stop frame reaches Talos on the pass after one it answered nothing of, marked only then and sent once', async () => {
    const outcome = await passesAcrossARefusal(buildJob({ state: 'stopping' }), 'stop-sent');
    expect(outcome).toEqual({ markedWhileRefusing: false, frames: [JSON.stringify({ act: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS })], marked: true });
  });

  test('an in-customs job\'s close reaches Talos on the pass after one it answered nothing of, marked only then and sent once', async () => {
    const outcome = await passesAcrossARefusal(buildJob({ state: 'in-customs' }), 'input-closed');
    expect(outcome).toEqual({ markedWhileRefusing: false, frames: [JSON.stringify({ act: 'close' })], marked: true });
  });

  test('a job over its call budget is sent its wind-down turn on the pass after a refused one', async () => {
    const job = buildJob();
    plantLiveSession(job);
    const calls = DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET;
    talos.answers(false);
    await JobLaunch.deliverBuildJobFrames(request, job, calls);
    talos.answers(true);
    const frames = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(request, job, calls);
    });
    expect(frames).toEqual([JSON.stringify({ act: 'write-line', line: 'chat:Example wind-down' })]);
  });

  test('a session resumed after a red handoff is sent its own wind-down at the resume budget, counted from the resume', async () => {
    const job = buildJob({ childInstance: 2 });
    const jobFolder = jobFolderIn(trackerDirectory, job.id);
    RedHandoff.writeRedHandoff(jobFolder, redHandoffFactsIn(jobFolder), 'expected 2, received 3');
    writeFileSync(join(jobFolder, 'wind-down-sent'), '');
    plantLiveSession(job, 2);
    const frames = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(request, job, RED_HANDOFF_RESUME_CALL_BUDGET - 1);
      await JobLaunch.deliverBuildJobFrames(request, job, RED_HANDOFF_RESUME_CALL_BUDGET);
    });
    expect(frames).toEqual([JSON.stringify({ act: 'write-line', line: 'chat:Example wind-down' })]);
    expect(existsSync(join(jobFolder, 'wind-down-sent-2'))).toBe(true);
  });

  test('a frame taken before an Overseer restart is not sent again by the restarted one', async () => {
    const job = buildJob({ state: 'stopping' });
    plantLiveSession(job);
    const beforeRestart = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(request, job, 0);
    });
    const restartedRequest: BuildJobFrameRequest = { ...request };
    const afterRestart = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(restartedRequest, buildJob({ state: 'stopping' }), 0);
    });
    expect([beforeRestart.length, afterRestart]).toEqual([1, []]);
  });

  test('a child no longer live is sent nothing and leaves no marker', async () => {
    const job = buildJob({ state: 'stopping' });
    // A record that reads ended with no end is a child whose Talos was lost.
    PlantedChild.plantChildRecord({ boardFolder: trackerDirectory, childFolder: `jobs/${job.id}`, instance: 1 }, { state: 'ended', end: null });
    const frames = await framesSentWhile(async () => {
      await JobLaunch.deliverBuildJobFrames(request, job, 0);
    });
    expect([frames, existsSync(join(jobFolderIn(trackerDirectory, job.id), 'stop-sent'))]).toEqual([[], false]);
  });
});
