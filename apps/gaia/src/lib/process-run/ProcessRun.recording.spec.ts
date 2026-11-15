/**
 * The real-system spec of process-run, run only by `bun run record process-run`: it starts real programs, checks what the boundary makes
 * of each outcome, and records the answer of every stable call shape for the recorded-runs mock. The cases that matter: a finished run
 * with its exit code and output, a program that is not there, a run that outlives its bound and is ended, a run its caller cancels, before
 * or after the start, the working directory, the environment a child is handed, an owned start that runs until it is stopped or ends by
 * itself, the channel on an owned child's descriptors 3 and 4, both ways, and its end when the child stops reading or ends, and a detached
 * start that outlives the call.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { environmentCopy, homeDirectory, moveHomeDirectoryTo }             from '../../services/Environment.ts';
import { recordAnswer }                                                    from '../../testing/BoundaryRecordings.ts';
import { detachedStartCallShapeOf, ownedStartCallShapeOf, runCallShapeOf } from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                       from '../../testing/ScratchRoot.ts';

import { realProcessRun, type ProgramRunRequest } from './ProcessRun.ts';

const RECORDING_NAME = 'process-run';
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SHORT_BOUND_MILLISECONDS = 200;
const MISSING_PROGRAM = 'gaia-example-missing-program';
const SECONDS_A_SLEEPER_WOULD_RUN = '30';
const EXIT_CODE_OF_A_REFUSAL = 3;
const POLL_MILLISECONDS = 20;
const POLL_TRIES = 250;
/** Enough copies of a message that the socket's buffer holds them not all, so the write is still flushing when the child stops reading. */
const TIMES_A_MESSAGE_OVERFILLS_THE_SOCKET = 100_000;
const STOP_READING_FILE_NAME = 'stop-reading';
/** 128 and the number of `SIGTERM`, as a shell reports it. */
const EXIT_CODE_OF_A_TERMINATED_PROGRAM = 143;

const scratchDirectories: string[] = [];

function scratchDirectory(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchPath(directory);
});

function runRequest(program: string, programArguments: readonly string[], timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): ProgramRunRequest {
  return {
    program, programArguments, workingDirectory: scratchDirectory('process-run'), timeoutMilliseconds
  };
}

function processIsRunning(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

describe('a run of a program', () => {
  test('answers bun --version finished, with exit code 0 and the version on standard output', async () => {
    const answer = await realProcessRun(environmentCopy).run(runRequest('bun', ['--version']));
    expect(answer).toEqual({
      verdict: 'finished', exitCode: 0, standardOutput: expect.stringMatching(/^\d+\.\d+\.\d+\n$/), standardError: ''
    });
    recordAnswer(RECORDING_NAME, runCallShapeOf('bun', ['--version']), answer);
  });

  test('answers a refusal finished, with its own exit code and its sentence on standard error', async () => {
    const programArguments = ['--eval', `process.stderr.write('Refused by the example.'); process.exitCode = ${EXIT_CODE_OF_A_REFUSAL};`];
    const answer = await realProcessRun(environmentCopy).run(runRequest('bun', programArguments));
    expect(answer).toEqual({
      verdict: 'finished', exitCode: EXIT_CODE_OF_A_REFUSAL, standardOutput: '', standardError: 'Refused by the example.'
    });
    recordAnswer(RECORDING_NAME, runCallShapeOf('bun', programArguments), answer);
  });

  test('answers not-found for a program that is not on the path', async () => {
    const answer = await realProcessRun(environmentCopy).run(runRequest(MISSING_PROGRAM, ['--version']));
    expect(answer).toEqual({ verdict: 'not-found', missing: 'program' });
    recordAnswer(RECORDING_NAME, runCallShapeOf(MISSING_PROGRAM, ['--version']), answer);
  });

  test('answers not-found for a file that cannot be run', async () => {
    const answer = await realProcessRun(environmentCopy).run(runRequest(join(import.meta.dir, 'ProcessRun.ts'), []));
    expect(answer).toEqual({ verdict: 'not-found', missing: 'program' });
  });

  test('answers timed-out for a program that outlives its bound', async () => {
    const answer = await realProcessRun(environmentCopy).run(runRequest('sleep', [SECONDS_A_SLEEPER_WOULD_RUN], SHORT_BOUND_MILLISECONDS));
    expect(answer).toEqual({ verdict: 'timed-out' });
    recordAnswer(RECORDING_NAME, runCallShapeOf('sleep', [SECONDS_A_SLEEPER_WOULD_RUN]), answer);
  });

  test('ends a program that outlives its bound before it answers', async () => {
    const request   = runRequest('sh', ['-c', `printf %s $$ > process-id; exec sleep ${SECONDS_A_SLEEPER_WOULD_RUN}`], SHORT_BOUND_MILLISECONDS);
    const answer    = await realProcessRun(environmentCopy).run(request);
    const processId = Number(readFileSync(join(request.workingDirectory, 'process-id'), 'utf8'));
    expect(answer).toEqual({ verdict: 'timed-out' });
    expect(processIsRunning(processId)).toBe(false);
  });

  test('ends a program whose cancellation fires, and answers the exit code of a terminated program', async () => {
    const cancellation = new AbortController();
    const request      = { ...runRequest('sh', ['-c', `printf %s $$ > process-id; exec sleep ${SECONDS_A_SLEEPER_WOULD_RUN}`]), cancellation: cancellation.signal };
    const answering    = realProcessRun(environmentCopy).run(request);
    const processIdFile = join(request.workingDirectory, 'process-id');
    for (let i = 0; i < POLL_TRIES && !existsSync(processIdFile); i++) await Bun.sleep(POLL_MILLISECONDS);
    cancellation.abort();
    expect(await answering).toEqual({
      verdict: 'finished', exitCode: EXIT_CODE_OF_A_TERMINATED_PROGRAM, standardOutput: '', standardError: ''
    });
    expect(processIsRunning(Number(readFileSync(processIdFile, 'utf8')))).toBe(false);
  });

  test('ends a program at once whose cancellation fired before the start, without a throw', async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const request = { ...runRequest('sleep', [SECONDS_A_SLEEPER_WOULD_RUN]), cancellation: cancellation.signal };
    expect(await realProcessRun(environmentCopy).run(request)).toEqual({
      verdict: 'finished', exitCode: EXIT_CODE_OF_A_TERMINATED_PROGRAM, standardOutput: '', standardError: ''
    });
  });

  test('answers the shell exit code of a program ended by a signal', async () => {
    const answer = await realProcessRun(environmentCopy).run(runRequest('sh', ['-c', 'kill -TERM $$']));
    expect(answer).toEqual({
      verdict: 'finished', exitCode: EXIT_CODE_OF_A_TERMINATED_PROGRAM, standardOutput: '', standardError: ''
    });
  });

  test('runs the program in the working directory it is given', async () => {
    const request = runRequest('pwd', []);
    expect(await realProcessRun(environmentCopy).run(request)).toEqual({
      verdict: 'finished', exitCode: 0, standardOutput: `${request.workingDirectory}\n`, standardError: ''
    });
  });

  test('answers not-found for a working directory that does not exist, and starts nothing', async () => {
    const request = { ...runRequest('pwd', []), workingDirectory: join(scratchDirectory('process-run'), 'gone') };
    expect(await realProcessRun(environmentCopy).run(request)).toEqual({ verdict: 'not-found', missing: 'working-directory' });
  });

  test('hands the child the environment as it is at the start, so a moved home reaches it', async () => {
    const runHome   = homeDirectory();
    const movedHome = scratchDirectory('moved-home');
    try {
      moveHomeDirectoryTo(movedHome);
      const answer = await realProcessRun(environmentCopy).run(runRequest('sh', ['-c', 'printf %s "$HOME"']));
      expect(answer).toEqual({
        verdict: 'finished', exitCode: 0, standardOutput: movedHome, standardError: ''
      });
    } finally {
      moveHomeDirectoryTo(runHome);
    }
  });
});

describe('an owned start', () => {
  test('runs the program until it is stopped, then answers the exit code of a terminated program', async () => {
    const request = { program: 'sleep', programArguments: [SECONDS_A_SLEEPER_WOULD_RUN], workingDirectory: scratchDirectory('owned') };
    const answer  = realProcessRun(environmentCopy).startOwned(request);
    if (answer.verdict !== 'started') throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    expect(processIsRunning(answer.child.processId)).toBe(true);
    answer.child.stop();
    const exitCode = await answer.child.exited;
    expect(exitCode).toBe(EXIT_CODE_OF_A_TERMINATED_PROGRAM);
    expect(processIsRunning(answer.child.processId)).toBe(false);
    const recordedAnswer = { verdict: 'started', processId: answer.child.processId, ending: { by: 'stop', exitCode } };
    recordAnswer(RECORDING_NAME, ownedStartCallShapeOf('sleep', [SECONDS_A_SLEEPER_WOULD_RUN]), recordedAnswer);
  });

  test('answers the exit code of a program that ends by itself, and a later stop changes nothing', async () => {
    const programArguments = ['-c', `exit ${EXIT_CODE_OF_A_REFUSAL}`];
    const answer = realProcessRun(environmentCopy).startOwned({ program: 'sh', programArguments, workingDirectory: scratchDirectory('owned') });
    if (answer.verdict !== 'started') throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    const exitCode = await answer.child.exited;
    answer.child.stop();
    expect(exitCode).toBe(EXIT_CODE_OF_A_REFUSAL);
    recordAnswer(RECORDING_NAME, ownedStartCallShapeOf('sh', programArguments), { verdict: 'started', processId: answer.child.processId, ending: { by: 'itself', exitCode } });
  });

  test('answers not-found for a program that is not on the path, and for a working directory that does not exist', () => {
    const processRun = realProcessRun(environmentCopy);
    const answer     = processRun.startOwned({ program: MISSING_PROGRAM, programArguments: [], workingDirectory: scratchDirectory('owned') });
    expect(answer).toEqual({ verdict: 'not-found', missing: 'program' });
    recordAnswer(RECORDING_NAME, ownedStartCallShapeOf(MISSING_PROGRAM, []), answer);
    expect(processRun.startOwned({ program: 'sleep', programArguments: ['1'], workingDirectory: join(scratchDirectory('owned'), 'gone') }))
      .toEqual({ verdict: 'not-found', missing: 'working-directory' });
  });
});

describe('the channel of an owned start', () => {
  test('carries text to the child on its descriptor 3 and back from its descriptor 4, and closes once the child ends', async () => {
    const programArguments = ['-c', 'IFS= read -r line <&3; printf "echo:%s" "$line" >&4'];
    const answer = realProcessRun(environmentCopy).startOwned({
      program: 'sh', programArguments, workingDirectory: scratchDirectory('owned'), withChannel: true
    });
    if (answer.verdict !== 'started' || answer.child.channel === null) throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    const { channel } = answer.child;
    const pieces: string[] = [];
    channel.onText((text) => pieces.push(text));
    channel.write('Example message\n');
    expect(await answer.child.exited).toBe(0);
    await channel.closed;
    expect(pieces.join('')).toBe('echo:Example message');
  });

  test('hands no channel to a start that does not ask for one', async () => {
    const answer = realProcessRun(environmentCopy).startOwned({ program: 'sh', programArguments: ['-c', 'exit 0'], workingDirectory: scratchDirectory('owned') });
    if (answer.verdict !== 'started') throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    expect(answer.child.channel).toBeNull();
    expect(await answer.child.exited).toBe(0);
  });

  test('ends without a throw when the child no longer reads what is written, while the child still runs', async () => {
    const programArguments = ['-c', `exec 3<&-; exec sleep ${SECONDS_A_SLEEPER_WOULD_RUN}`];
    const answer = realProcessRun(environmentCopy).startOwned({
      program: 'sh', programArguments, workingDirectory: scratchDirectory('owned'), withChannel: true
    });
    if (answer.verdict !== 'started' || answer.child.channel === null) throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    const { channel } = answer.child;
    try {
      let channelIsClosed = false;
      void channel.closed.then(() => {
        channelIsClosed = true;
      });
      for (let i = 0; i < POLL_TRIES && !channelIsClosed; i++) {
        expect(() => channel.write('Example message\n')).not.toThrow();
        await Bun.sleep(POLL_MILLISECONDS);
      }
      expect(channelIsClosed).toBe(true);
      expect(processIsRunning(answer.child.processId)).toBe(true);
      expect(() => channel.write('Example message after the end\n')).not.toThrow();
    } finally {
      answer.child.stop();
      await answer.child.exited;
    }
  });

  test('ends without a throw when the child stops reading while a write it has not read yet is still flushing', async () => {
    const workingDirectory = scratchDirectory('owned');
    const programArguments = [
      '-c', `while [ ! -e ${STOP_READING_FILE_NAME} ]; do sleep ${POLL_MILLISECONDS / 1000}; done; exec 3<&-; exec sleep ${SECONDS_A_SLEEPER_WOULD_RUN}`
    ];
    const answer = realProcessRun(environmentCopy).startOwned({
      program: 'sh', programArguments, workingDirectory, withChannel: true
    });
    if (answer.verdict !== 'started' || answer.child.channel === null) throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    const { channel } = answer.child;
    try {
      expect(() => channel.write('Example message\n'.repeat(TIMES_A_MESSAGE_OVERFILLS_THE_SOCKET))).not.toThrow();
      writeFileSync(join(workingDirectory, STOP_READING_FILE_NAME), '');
      await channel.closed;
      expect(processIsRunning(answer.child.processId)).toBe(true);
    } finally {
      answer.child.stop();
      await answer.child.exited;
    }
  });

  test('closes when the caller closes it, and a write after that is dropped without a throw', async () => {
    const answer = realProcessRun(environmentCopy).startOwned({
      program: 'sleep', programArguments: [SECONDS_A_SLEEPER_WOULD_RUN], workingDirectory: scratchDirectory('owned'), withChannel: true
    });
    if (answer.verdict !== 'started' || answer.child.channel === null) throw new Error(`The owned start answered ${JSON.stringify(answer)}`);
    answer.child.channel.close();
    await answer.child.channel.closed;
    expect(() => answer.child.channel?.write('Example message\n')).not.toThrow();
    answer.child.stop();
    expect(await answer.child.exited).toBe(EXIT_CODE_OF_A_TERMINATED_PROGRAM);
  });
});

describe('a detached start', () => {
  test('starts the program in a process group of its own and answers its process id', async () => {
    const processRun = realProcessRun(environmentCopy);
    const answer     = processRun.startDetached({ program: 'sleep', programArguments: [SECONDS_A_SLEEPER_WOULD_RUN], workingDirectory: scratchDirectory('detached') });
    if (answer.verdict !== 'started') throw new Error(`The detached start answered ${JSON.stringify(answer)}`);
    try {
      expect(processIsRunning(answer.processId)).toBe(true);
      const processGroup = await processRun.run(runRequest('ps', ['-o', 'pgid=', '-p', String(answer.processId)]));
      expect(processGroup).toEqual({
        verdict: 'finished', exitCode: 0, standardOutput: expect.stringMatching(new RegExp(`^\\s*${answer.processId}\\n$`)), standardError: ''
      });
    } finally {
      process.kill(answer.processId, 'SIGKILL');
    }
  });

  test('answers not-found for a program that is not on the path', () => {
    const answer = realProcessRun(environmentCopy).startDetached({ program: MISSING_PROGRAM, programArguments: [], workingDirectory: scratchDirectory('detached') });
    expect(answer).toEqual({ verdict: 'not-found', missing: 'program' });
    recordAnswer(RECORDING_NAME, detachedStartCallShapeOf(MISSING_PROGRAM, []), answer);
  });
});
