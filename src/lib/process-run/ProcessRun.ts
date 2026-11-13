/**
 * The boundary to other programs: run one with arguments in a working directory and a bounded wait, and collect its exit code and output;
 * start one owned, which the caller stops and whose end it awaits; or start one detached that outlives Gaia. Every answer is a verdict,
 * never a throw for an ordinary outcome.
 */
import { statSync }  from 'node:fs';
import { constants } from 'node:os';

export interface ProgramRunRequest {
  readonly program:             string;
  readonly programArguments:    readonly string[];
  readonly workingDirectory:    string;
  readonly timeoutMilliseconds: number;
}

export interface DetachedStartRequest {
  readonly program:          string;
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
}

export type OwnedStartRequest = DetachedStartRequest;

/** `program`: no runnable file by that name or path. `working-directory`: the directory to run in is gone or is no directory. */
export type MissingForARun = 'program' | 'working-directory';

export interface NotFoundAnswer {
  readonly verdict: 'not-found';
  readonly missing: MissingForARun;
}

export interface FinishedRunAnswer {
  readonly verdict:        'finished';
  readonly exitCode:       number;
  readonly standardOutput: string;
  readonly standardError:  string;
}

export type ProgramRunAnswer = FinishedRunAnswer | NotFoundAnswer | { readonly verdict: 'timed-out' };

export type DetachedStartAnswer = NotFoundAnswer | { readonly verdict: 'started'; readonly processId: number };

/** A child the caller owns: it runs until it ends by itself or the caller stops it. It outlives a caller that ends without stopping it. */
export interface OwnedChild {
  readonly processId: number;
  /** Settles with the exit code once the child has ended, by itself or by `stop`, as a shell reports it. */
  readonly exited:    Promise<number>;
  /** Asks the child to end, with `SIGTERM`; a child that has already ended is left alone. */
  readonly stop:      () => void;
}

export type OwnedStartAnswer = NotFoundAnswer | { readonly verdict: 'started'; readonly child: OwnedChild };

export interface ProcessRun {
  readonly run:           (request: ProgramRunRequest) => Promise<ProgramRunAnswer>;
  readonly startOwned:    (request: OwnedStartRequest) => OwnedStartAnswer;
  readonly startDetached: (request: DetachedStartRequest) => DetachedStartAnswer;
}

/** The environment a child is handed, read at each start. */
export type ChildEnvironmentSource = () => Readonly<Record<string, string>>;

/** A shell reports a child ended by a signal as this plus the signal's number. */
const SHELL_EXIT_CODE_BASE_FOR_A_SIGNAL = 128;

/** The errors with which the system refuses to start a program by that name or path; any other start error is not an answer. */
const PROGRAM_NOT_FOUND_ERROR_CODES: ReadonlySet<string> = new Set(['ENOENT', 'EACCES', 'ENOTDIR']);

function directoryExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function programNotFoundOrThrow(startError: unknown): NotFoundAnswer {
  const errorCode = startError instanceof Error && 'code' in startError ? startError.code : undefined;
  if (typeof errorCode === 'string' && PROGRAM_NOT_FOUND_ERROR_CODES.has(errorCode)) return { verdict: 'not-found', missing: 'program' };
  throw startError;
}

function exitCodeOf(exitCode: number | null, signalName: NodeJS.Signals | null): number {
  if (exitCode !== null) return exitCode;
  const signalNumber = signalName === null ? 0 : constants.signals[signalName];
  return SHELL_EXIT_CODE_BASE_FOR_A_SIGNAL + signalNumber;
}

/**
 * The real boundary. `childEnvironment` is required and read at every start: Bun hands a child started without `env` the environment
 * this process started with, so a moved `HOME` would not reach it. Gaia passes `environmentCopy` of `src/services/Environment.ts`.
 */
export function realProcessRun(childEnvironment: ChildEnvironmentSource): ProcessRun {
  async function run(request: ProgramRunRequest): Promise<ProgramRunAnswer> {
    if (!directoryExists(request.workingDirectory)) return { verdict: 'not-found', missing: 'working-directory' };
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
    try {
      child = Bun.spawn([request.program, ...request.programArguments], {
        cwd:    request.workingDirectory,
        env:    { ...childEnvironment() },
        stdin:  'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
    } catch (startError) {
      return programNotFoundOrThrow(startError);
    }
    const finished = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    let boundTimer: ReturnType<typeof setTimeout> | undefined;
    const boundRanOut = new Promise<'timed-out'>((resolve) => {
      boundTimer = setTimeout(() => resolve('timed-out'), request.timeoutMilliseconds);
    });
    const outcome = await Promise.race([finished, boundRanOut]);
    clearTimeout(boundTimer);
    if (outcome === 'timed-out') {
      child.kill('SIGKILL');
      // A grandchild may hold the output open after the child is gone; the answer does not wait for it.
      finished.catch(() => undefined);
      await child.exited;
      return { verdict: 'timed-out' };
    }
    const [standardOutput, standardError] = outcome;
    return {
      verdict:  'finished',
      exitCode: exitCodeOf(child.exitCode, child.signalCode),
      standardOutput,
      standardError,
    };
  }

  function startOwned(request: OwnedStartRequest): OwnedStartAnswer {
    if (!directoryExists(request.workingDirectory)) return { verdict: 'not-found', missing: 'working-directory' };
    let child: Bun.Subprocess<'ignore', 'ignore', 'ignore'>;
    try {
      child = Bun.spawn([request.program, ...request.programArguments], {
        cwd:    request.workingDirectory,
        env:    { ...childEnvironment() },
        stdin:  'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
      });
    } catch (startError) {
      return programNotFoundOrThrow(startError);
    }
    return {
      verdict: 'started',
      child:   {
        processId: child.pid,
        exited:    child.exited.then(() => exitCodeOf(child.exitCode, child.signalCode)),
        stop:      () => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        },
      },
    };
  }

  function startDetached(request: DetachedStartRequest): DetachedStartAnswer {
    if (!directoryExists(request.workingDirectory)) return { verdict: 'not-found', missing: 'working-directory' };
    try {
      const child = Bun.spawn([request.program, ...request.programArguments], {
        cwd:      request.workingDirectory,
        env:      { ...childEnvironment() },
        detached: true,
        stdin:    'ignore',
        stdout:   'ignore',
        stderr:   'ignore',
      });
      child.unref();
      return { verdict: 'started', processId: child.pid };
    } catch (startError) {
      return programNotFoundOrThrow(startError);
    }
  }

  return { run, startOwned, startDetached };
}
