/**
 * The boundary to other programs: run one with arguments in a working directory and a bounded wait, which its caller may also cancel, and
 * collect its exit code and output; start one owned, which the caller stops and whose end it awaits; or start one detached that outlives
 * Gaia. Every answer is a verdict, never a throw for an ordinary outcome.
 */
import { closeSync, statSync } from 'node:fs';
import { constants }           from 'node:os';

export interface ProgramRunRequest {
  readonly program:             string;
  readonly programArguments:    readonly string[];
  readonly workingDirectory:    string;
  readonly timeoutMilliseconds: number;
  /** Ends the program with `SIGTERM` once it fires, even before the start; the run then answers as any program ended by a signal does. */
  readonly cancellation?:       AbortSignal;
}

export interface DetachedStartRequest {
  readonly program:          string;
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
}

export interface OwnedStartRequest extends DetachedStartRequest {
  /** Hands the child a channel on its descriptors 3, which it reads, and 4, which it writes. */
  readonly withChannel?: boolean;
}

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

/** Text to and from an owned child over its descriptors 3 and 4; only the caller and the child hold them. */
export interface ChildChannel {
  readonly write:  (text: string) => void;
  /** Hands each listener every piece of text the child writes, as it arrives: a piece is no message, and may hold several or part of one. */
  readonly onText: (listener: (text: string) => void) => void;
  /** Settles once the channel is closed, by the caller or by the child's end. */
  readonly closed: Promise<void>;
  readonly close:  () => void;
}

/** A child the caller owns: it runs until it ends by itself or the caller stops it. It outlives a caller that ends without stopping it. */
export interface OwnedChild {
  readonly processId: number;
  /** Settles with the exit code once the child has ended, by itself or by `stop`, as a shell reports it. */
  readonly exited:    Promise<number>;
  /** Asks the child to end, with `SIGTERM`; a child that has already ended is left alone. */
  readonly stop:      () => void;
  /** The channel the start asked for with `withChannel`, or `null`. */
  readonly channel:   ChildChannel | null;
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

/** The child reads its descriptor 3 and writes its descriptor 4; each is one end of a socket pair whose other end the caller holds. */
const CHANNEL_STDIO = ['socket-fd', 'socket-fd'] as const;

function closeDescriptor(descriptor: number): void {
  try {
    closeSync(descriptor);
  } catch {
    // Already closed: the channel's end is the same either way.
  }
}

function channelOver(writtenDescriptor: number, readDescriptor: number): ChildChannel {
  const writer    = Bun.file(writtenDescriptor).writer();
  const reader    = Bun.file(readDescriptor).stream().pipeThrough(new TextDecoderStream()).getReader();
  const listeners: ((text: string) => void)[] = [];
  let channelIsClosed = false;
  let markClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  const close = (): void => {
    if (channelIsClosed) return;
    channelIsClosed = true;
    void reader.cancel().catch(() => undefined);
    closeDescriptor(writtenDescriptor);
    closeDescriptor(readDescriptor);
    markClosed();
  };
  void (async () => {
    try {
      for (let piece = await reader.read(); !piece.done; piece = await reader.read()) {
        for (const listener of listeners) listener(piece.value);
      }
    } catch {
      // A read that fails ends the channel as the child's end does.
    }
    close();
  })();
  return {
    write: (text) => {
      if (channelIsClosed) return;
      try {
        writer.write(text);
        // A flush the child no longer reads rejects later, with a broken pipe, and ends the channel as a failed write does.
        void Promise.resolve(writer.flush()).catch(close);
      } catch {
        close();
      }
    },
    onText: (listener) => {
      listeners.push(listener);
    },
    closed,
    close,
  };
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
    const endTheProgram = (): void => {
      child.kill('SIGTERM');
    };
    request.cancellation?.addEventListener('abort', endTheProgram, { once: true });
    if (request.cancellation?.aborted === true) endTheProgram();
    const finished = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    let boundTimer: ReturnType<typeof setTimeout> | undefined;
    const boundRanOut = new Promise<'timed-out'>((resolve) => {
      boundTimer = setTimeout(() => resolve('timed-out'), request.timeoutMilliseconds);
    });
    const outcome = await Promise.race([finished, boundRanOut]);
    clearTimeout(boundTimer);
    request.cancellation?.removeEventListener('abort', endTheProgram);
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
        cwd:   request.workingDirectory,
        env:   { ...childEnvironment() },
        stdio: request.withChannel === true ? ['ignore', 'ignore', 'ignore', ...CHANNEL_STDIO] : ['ignore', 'ignore', 'ignore'],
      });
    } catch (startError) {
      return programNotFoundOrThrow(startError);
    }
    const [, , , writtenDescriptor, readDescriptor] = child.stdio;
    const channel = typeof writtenDescriptor === 'number' && typeof readDescriptor === 'number' ? channelOver(writtenDescriptor, readDescriptor) : null;
    return {
      verdict: 'started',
      child:   {
        processId: child.pid,
        exited:    child.exited.then(() => exitCodeOf(child.exitCode, child.signalCode)),
        stop:      () => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        },
        channel,
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
