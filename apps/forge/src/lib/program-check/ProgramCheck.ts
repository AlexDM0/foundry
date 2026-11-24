/**
 * Runs a program once by its absolute path with its arguments and ends it at a time bound: how forge asks a program it was only told the
 * path of for its version before it keeps it. It depends on no other lib package.
 */
export interface ProgramCheckRequest {
  readonly programPath:         string;
  readonly arguments:           readonly string[];
  /** The whole environment of the run; nothing is inherited. */
  readonly environment:         Readonly<Record<string, string>>;
  readonly timeoutMilliseconds: number;
}

/** `did-not-start`: the program could not be started, with the system's code, such as `ENOENT` or `EACCES`. */
export type ProgramCheckAnswer =
  | { readonly kind: 'answered'; readonly exitCode: number; readonly output: string }
  | { readonly kind: 'did-not-start'; readonly code: string }
  | { readonly kind: 'timed-out' };

export type ProgramCheckRun = (request: ProgramCheckRequest) => Promise<ProgramCheckAnswer>;

const TIMED_OUT = 'timed-out';

function codeOf(problem: unknown): string {
  return problem instanceof Error && 'code' in problem && typeof problem.code === 'string' ? problem.code : String(problem);
}

/** Resolves `timed-out` once the bound passes; the returned stop clears the timer, so an answered run leaves nothing behind. */
function timeoutOf(milliseconds: number): { readonly expiry: Promise<typeof TIMED_OUT>; readonly stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), milliseconds);
  });
  return { expiry, stop: () => clearTimeout(timer) };
}

/** Its standard output and error together, as a person running it would read them; a program that keeps its output open past the bound times out. */
export const runProgramCheck: ProgramCheckRun = async (request) => {
  let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  try {
    child = Bun.spawn({
      cmd:         [request.programPath, ...request.arguments],
      env:         { ...request.environment },
      stdin:       'ignore',
      stdout:      'pipe',
      stderr:      'pipe',
      windowsHide: true,
    });
  } catch (problem) {
    return { kind: 'did-not-start', code: codeOf(problem) };
  }
  const timeout = timeoutOf(request.timeoutMilliseconds);
  const finished = Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const ending = await Promise.race([finished, timeout.expiry]);
  timeout.stop();
  if (ending === TIMED_OUT) {
    child.kill('SIGKILL');
    return { kind: 'timed-out' };
  }
  const [exitCode, standardOutput, standardError] = ending;
  return { kind: 'answered', exitCode, output: `${standardOutput}${standardError}` };
};
