/**
 * Real processes for a spec, each its own detached leader and each started through `process.execPath`, so no double needs a shell or a Unix tool:
 * a sleeper, a parent of a sleeping child, and a child that takes no graceful stop.
 */
import { OUTLIVES_EVERY_WAIT_SECONDS } from './WaitUntil.ts';

const MILLISECONDS_PER_SECOND = 1000;

const SLEEP_LINE = `setInterval(() => undefined, ${OUTLIVES_EVERY_WAIT_SECONDS * MILLISECONDS_PER_SECOND});`;
const SLEEPER_SCRIPT = `console.log(process.pid); ${SLEEP_LINE}`;
const STOP_IGNORING_SCRIPT = `process.on("SIGTERM", () => undefined); console.log(process.pid); ${SLEEP_LINE}`;
const SPAWN_OPTIONS = '{ stdin: "ignore", stdout: "ignore", stderr: "ignore" }';
const DETACHED_SPAWN_OPTIONS = '{ stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true }';

function parentScriptSpawningWith(spawnOptions: string): string {
  return [
    `const child = Bun.spawn([process.execPath, "-e", ${JSON.stringify(SLEEP_LINE)}], ${spawnOptions});`,
    'child.unref();',
    'console.log(child.pid);',
    SLEEP_LINE,
  ].join(' ');
}

/** The lines of a child script that start a sleeper leading a group of its own and print its process id, as a Bash tool command does. */
export const SPAWN_DETACHED_SLEEPER_LINES = [
  `const child = Bun.spawn([process.execPath, "-e", ${JSON.stringify(SLEEP_LINE)}], ${DETACHED_SPAWN_OPTIONS});`,
  'child.unref();',
  'console.log(child.pid);',
].join(' ');

export interface ProcessDouble {
  readonly processId:         number;
  /** The first line it printed, once it has: a double's process id, or its child's. */
  readonly reportedProcessId: number;
}

async function firstLineOf(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
    if (text.includes('\n')) break;
  }
  return text.trim();
}

async function startedDouble(script: string): Promise<ProcessDouble> {
  const double = Bun.spawn([process.execPath, '-e', script], {
    stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', detached: true
  });
  return { processId: double.pid, reportedProcessId: Number(await firstLineOf(double.stdout)) };
}

export function sleepingProcess(): Promise<ProcessDouble> {
  return startedDouble(SLEEPER_SCRIPT);
}

/** `reportedProcessId` is the child, in the parent's group. */
export function parentOfSleepingChild(): Promise<ProcessDouble> {
  return startedDouble(parentScriptSpawningWith(SPAWN_OPTIONS));
}

/** `reportedProcessId` is the child, leading a group of its own, as a Bash tool command does below a session. */
export function parentOfDetachedChild(): Promise<ProcessDouble> {
  return startedDouble(parentScriptSpawningWith(DETACHED_SPAWN_OPTIONS));
}

/** Answers once its handler is in place. */
export function childIgnoringStop(): Promise<ProcessDouble> {
  return startedDouble(STOP_IGNORING_SCRIPT);
}
