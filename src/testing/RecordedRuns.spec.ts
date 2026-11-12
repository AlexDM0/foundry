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
  recordedProcessRun,
  recordedRunsOf,
  runCallShapeOf,
} from './RecordedRuns.ts';

const SHORT_BOUND_MILLISECONDS = 200;

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
});
