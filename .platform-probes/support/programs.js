// Running programs and recording what happened, a refused spawn included, as plain values.
import { spawn } from 'node:child_process';

const DEFAULT_PROGRAM_TIMEOUT_MILLISECONDS = 30_000;
const SLEEPER_LIFETIME_MILLISECONDS = 120_000;
const RECORDED_OUTPUT_CHARACTERS = 2000;
const HOLDER_READY_TIMEOUT_MILLISECONDS = 15_000;

export const sleepMilliseconds = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function errorFactsOf(error) {
  return {
    name: error?.name ?? null,
    code: error?.code ?? null,
    errno: error?.errno ?? null,
    syscall: error?.syscall ?? null,
    message: String(error?.message ?? error),
  };
}

/** The value `action` returned, or the facts of what it threw. */
export async function attempt(action) {
  try {
    return { returned: (await action()) ?? null };
  } catch (error) {
    return { thrown: errorFactsOf(error) };
  }
}

export const recordedTextOf = (text) => text.slice(-RECORDED_OUTPUT_CHARACTERS);

export async function runProgram(argv, { cwd, env, timeoutMilliseconds = DEFAULT_PROGRAM_TIMEOUT_MILLISECONDS, keepWholeOutput = false } = {}) {
  let child;
  try {
    child = Bun.spawn(argv, {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      ...(cwd === undefined ? {} : { cwd }),
      ...(env === undefined ? {} : { env }),
    });
  } catch (error) {
    return { argv, spawnError: errorFactsOf(error) };
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMilliseconds);
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  await child.exited;
  clearTimeout(timer);
  return {
    argv,
    exitCode: child.exitCode,
    signalCode: child.signalCode ?? null,
    timedOut,
    stdout: keepWholeOutput ? stdout : recordedTextOf(stdout),
    stderr: recordedTextOf(stderr),
  };
}

export async function elevationOf() {
  if (process.platform === 'win32') {
    const session = await runProgram(['net', 'session']);
    return { adminCheck: 'net session', exitCode: session.exitCode ?? null };
  }
  return { adminCheck: 'uid', uid: process.getuid() };
}

export function programPathOf(programName) {
  return Bun.which(programName);
}

export function runPowershell(script, options) {
  return runProgram(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], options);
}

/** A process that outlives the probe's actions unless killed, detached into a group of its own unless told otherwise. */
export function startSleeper({ detached = true, cwd } = {}) {
  const sleeper = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${SLEEPER_LIFETIME_MILLISECONDS})`], {
    detached,
    stdio: 'ignore',
    ...(cwd === undefined ? {} : { cwd }),
  });
  sleeper.on('error', () => {});
  return sleeper;
}

/** A child that printed no pid reads as 0, and a signal to 0 reaches this probe's own process group, run-all included. */
const namesOneProcess = (pid) => Number.isInteger(pid) && pid > 0;

export function processIsAlive(pid) {
  if (!namesOneProcess(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killQuietly(pid) {
  if (!namesOneProcess(pid)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone, which is what was wanted.
  }
}

/** Kills `pid` from another process, so the kill is not Bun's own child handling. */
export function killFromOutside(pid) {
  return process.platform === 'win32'
    ? runProgram(['taskkill', '/F', '/PID', String(pid)])
    : runProgram(['/bin/kill', '-KILL', String(pid)]);
}

/** Windows only: a PowerShell process holding `path` open with the given FileShare, released by the returned action. */
export async function holdFileOnWindows(path, fileShare) {
  const script = [
    `$held = [IO.File]::Open('${path}', 'Open', 'Read', '${fileShare}')`,
    '[Console]::Out.WriteLine("held"); [Console]::Out.Flush()',
    'Start-Sleep -Seconds 60',
    '$held.Close()',
  ].join('; ');
  const holder = Bun.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const reader = holder.stdout.getReader();
  await Promise.race([reader.read(), sleepMilliseconds(HOLDER_READY_TIMEOUT_MILLISECONDS)]);
  return () => {
    holder.kill('SIGKILL');
    return holder.exited;
  };
}
