/**
 * The recorded-runs mock must answer exactly what the real process-run recorded, and fail the spec on everything it cannot answer from a
 * recording: a call with no recorded answer, a working directory the real run would refuse, a recording that is absent for an OS, and an
 * answer set that holds two answers or a misfitting answer for one call shape.
 */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { ProgramRunRequest } from '../lib/process-run/ProcessRun.ts';
import { homeDirectory }          from '../services/Environment.ts';

import {
  detachedStartCallShapeOf,
  ownedStartCallShapeOf,
  recordedProcessRun,
  recordedRunsOf,
  recordedSituationRunsOf,
  runCallShapeOf,
  situationCallShapeOf,
} from './RecordedRuns.ts';

const SHORT_BOUND_MILLISECONDS = 200;
/** 128 and the number of `SIGTERM`, as a shell reports it, and the exit code the recording's refusing program ends with. */
const EXIT_CODE_OF_A_TERMINATED_PROGRAM = 143;
const EXIT_CODE_OF_A_REFUSAL = 3;

function processRunRequest(program: string, programArguments: readonly string[]): ProgramRunRequest {
  return {
    program, programArguments, workingDirectory: homeDirectory(), timeoutMilliseconds: SHORT_BOUND_MILLISECONDS
  };
}

describe('the recorded process run', () => {
  test('answers bun --version with the run recorded from the real program', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    expect(await processRun.run(processRunRequest('bun', ['--version']))).toEqual({
      verdict:        'finished',
      exitCode:       0,
      standardOutput: expect.stringMatching(/^\d+\.\d+\.\d+\n$/),
      standardError:  '',
    });
  });

  test('answers a missing program, a run past its bound and a missing detached program as they were recorded', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    expect(await processRun.run(processRunRequest('gaia-example-missing-program', ['--version']))).toEqual({ verdict: 'not-found', missing: 'program' });
    expect(await processRun.run(processRunRequest('sleep', ['30']))).toEqual({ verdict: 'timed-out' });
    expect(processRun.startDetached({ program: 'gaia-example-missing-program', programArguments: [], workingDirectory: homeDirectory() }))
      .toEqual({ verdict: 'not-found', missing: 'program' });
  });

  test('fails a run with no recorded answer and names its call shape', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    await expect(processRun.run(processRunRequest('bun', ['--revision']))).rejects.toThrow(`No recorded answer for ${runCallShapeOf('bun', ['--revision'])}`);
  });

  test('fails a detached start with no recorded answer and names its call shape', () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    expect(() => processRun.startDetached({ program: 'bun', programArguments: ['--version'], workingDirectory: homeDirectory() }))
      .toThrow(`No recorded answer for ${detachedStartCallShapeOf('bun', ['--version'])}`);
  });

  test('fails a recorded call asked to run in a directory that does not exist, where the real run answers not-found', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    const request    = { ...processRunRequest('bun', ['--version']), workingDirectory: join(homeDirectory(), 'gone') };
    await expect(processRun.run(request)).rejects.toThrow('which is no directory; the real run answers not-found there');
  });

  test('lists the call shapes it answered, in order', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    await processRun.run(processRunRequest('sleep', ['30']));
    await processRun.run(processRunRequest('bun', ['--version']));
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf('sleep', ['30']), runCallShapeOf('bun', ['--version'])]);
  });

  test('refuses an answer set with two answers for one call shape', () => {
    const callShape = runCallShapeOf('sleep', ['30']);
    expect(() => recordedProcessRun([{ callShape, answer: { verdict: 'timed-out' } }, { callShape, answer: { verdict: 'timed-out' } }]))
      .toThrow(`Two recorded answers for ${callShape}`);
  });

  test('keeps a recorded owned child running until its stop, then answers the exit code it was recorded ending with', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    const answer     = processRun.startOwned({ program: 'sleep', programArguments: ['30'], workingDirectory: homeDirectory() });
    if (answer.verdict !== 'started') throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    const sleeperShape = ownedStartCallShapeOf('sleep', ['30']);
    expect(processRun.ownedChildrenRunning()).toEqual([sleeperShape]);
    answer.child.stop();
    answer.child.stop();
    expect(await answer.child.exited).toBe(EXIT_CODE_OF_A_TERMINATED_PROGRAM);
    expect(processRun.ownedChildrenRunning()).toEqual([]);
    expect(processRun.ownedChildrenStopped()).toEqual([sleeperShape]);
  });

  test('ends a recorded owned child that ended by itself at once, and counts no stop of it', async () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    const answer     = processRun.startOwned({ program: 'sh', programArguments: ['-c', 'exit 3'], workingDirectory: homeDirectory() });
    if (answer.verdict !== 'started') throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    expect(await answer.child.exited).toBe(EXIT_CODE_OF_A_REFUSAL);
    answer.child.stop();
    expect(processRun.ownedChildrenRunning()).toEqual([]);
    expect(processRun.ownedChildrenStopped()).toEqual([]);
    expect(processRun.startOwned({ program: 'gaia-example-missing-program', programArguments: [], workingDirectory: homeDirectory() }))
      .toEqual({ verdict: 'not-found', missing: 'program' });
  });

  test('fails an owned start with no recorded answer and names its call shape', () => {
    const processRun = recordedProcessRun(recordedRunsOf('process-run'));
    expect(() => processRun.startOwned({ program: 'bun', programArguments: ['--version'], workingDirectory: homeDirectory() }))
      .toThrow(`No recorded answer for ${ownedStartCallShapeOf('bun', ['--version'])}`);
  });

  test('refuses an owned start answer recorded without its ending', () => {
    const callShape = ownedStartCallShapeOf('sleep', ['30']);
    const answerWithoutEnding = { verdict: 'started', processId: 1 } as const;
    expect(() => recordedProcessRun([{ callShape, answer: answerWithoutEnding }])).toThrow(`The answer recorded for ${callShape} is no process-run answer`);
  });

  test('refuses a detached start answer recorded for a run', () => {
    const callShape = runCallShapeOf('sleep', ['30']);
    expect(() => recordedProcessRun([{ callShape, answer: { verdict: 'started', processId: 1 } }])).toThrow(`The answer recorded for ${callShape} is no process-run answer`);
  });
});

describe('the recorded runs of a recording', () => {
  test('fail the spec for an OS with no recording, naming the command that takes it', () => {
    expect(() => recordedRunsOf('process-run', 'example-os')).toThrow('process-run has no recording for example-os');
    expect(() => recordedRunsOf('process-run', 'example-os')).toThrow('`bun run record process-run`');
  });

  test('of one situation hold that situation\'s answers only, keyed without the situation', () => {
    const compileShape = runCallShapeOf('/usr/bin/clang', ['-arch', 'arm64', '-mmacosx-version-min=12.0', '-Os', '-Wall', '-Werror', '-o', 'launch-arm64', 'launch.c']);
    const installRuns  = recordedSituationRunsOf('app-install-programs', 'installs');
    const refusedRuns  = recordedSituationRunsOf('app-install-programs', 'compiler-refuses');
    expect(installRuns.find((run) => run.callShape === compileShape)?.answer).toMatchObject({ verdict: 'finished', exitCode: 0 });
    expect(refusedRuns.map((run) => run.callShape)).toEqual([compileShape]);
    expect(refusedRuns[0]?.answer).toMatchObject({ verdict: 'finished', exitCode: 1 });
    expect(situationCallShapeOf('installs', compileShape)).toBe(`installs: ${compileShape}`);
  });

  test('of a situation that was never recorded hold no answer', () => {
    expect(recordedSituationRunsOf('app-install-programs', 'example-situation')).toEqual([]);
  });
});
