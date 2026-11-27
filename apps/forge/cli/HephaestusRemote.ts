/**
 * What the CLI does to a Hephaestus it is not: start one detached, ask the live one to stop, and wait for its Hephaestus lock to go. A stop goes to the
 * API with the token; when the API does not answer, the Hephaestus lock's process is ended, its identity checked first. Talos and its children are
 * never touched. A Hephaestus lock left naming a dead process says Hephaestus's own stop never finished, which the outcome reports for the caller
 * to repair. A clean restart of Talos is only asked of the live Hephaestus, which sends Talos its quit.
 */
import { readFileSync } from 'node:fs';

import type { PlatformPorts }                                                    from '../src/lib/platform-ports/PlatformPortsFor.ts';
import type { HephaestusFiles }                                                  from '../src/services/hephaestus/HephaestusFiles.ts';
import { type HephaestusLockReading, type HephaestusLockRecord, HephaestusLock } from '../src/services/hephaestus/HephaestusLock.ts';
import { Presence }                                                              from '../src/services/hephaestus/Presence.ts';
import { outlivingProgramEnvironment, hephaestusPollIntervalOverride }           from '../src/shared/Environment.ts';
import { OperationRefusal }                                                      from '../src/shared/OperationRefusal.ts';
import {
  HEPHAESTUS_READY_INTERVAL_MILLISECONDS,
  HEPHAESTUS_READY_TRIES,
  HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS,
  HEPHAESTUS_STOP_INTERVAL_MILLISECONDS,
  HEPHAESTUS_STOP_TRIES,
  RESTART_RELEASE_TRIES,
  RESTART_REQUEST_TIMEOUT_MILLISECONDS
} from '../src/shared/constants/HephaestusLimits.ts';
import type { CommandContext }      from './CommandContext.ts';
import { hephaestusPollScheduleOf } from './HephaestusPollSchedule.ts';

export type RuntimeStopKind = 'hephaestus-stop' | 'hephaestus-restart';

/** `clean`: Hephaestus finished its own stop. `forced`: this command ended it by force. `unfinished`: it ended by itself before its stop finished. */
export type HephaestusEnding = 'clean' | 'forced' | 'unfinished';

/** `found-dead`: the newest Hephaestus lock already named a dead process, so its Hephaestus's own stop never finished; an unreadable one has no record. */
export type StopOutcome =
  | { verdict: 'was-down' }
  | { verdict: 'stopped'; record: HephaestusLockRecord; generation: number; ending: HephaestusEnding }
  | { verdict: 'found-dead'; record: HephaestusLockRecord | null; generation: number };

function tokenIn(record: HephaestusLockRecord): string | null {
  try {
    return readFileSync(record.tokenFile, 'utf8').trim();
  } catch {
    return null;
  }
}

async function identityAnswers(record: HephaestusLockRecord): Promise<boolean> {
  try {
    const response = await fetch(new URL('api/identity', record.url), { signal: AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS) });
    return response.ok;
  } catch {
    return false;
  }
}

async function identityDocumentOf(record: HephaestusLockRecord): Promise<Readonly<Record<string, unknown>> | null> {
  try {
    const response = await fetch(new URL('api/identity', record.url), { signal: AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS) });
    if (!response.ok) return null;
    const document = await response.json() as unknown;
    return typeof document === 'object' && document !== null && !Array.isArray(document) ? document as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The live Hephaestus's identity once its API answers, looked for on the schedule a detached start waits on; `null` when it never answered. */
async function identityOnceItAnswers(record: HephaestusLockRecord): Promise<Readonly<Record<string, unknown>> | null> {
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_READY_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const identity = await identityDocumentOf(record);
    if (identity !== null) return identity;
    await Bun.sleep(schedule.intervalMilliseconds);
  }
  return null;
}

async function commandWasTaken(record: HephaestusLockRecord, kind: RuntimeStopKind, now: boolean): Promise<boolean> {
  const token = tokenIn(record);
  if (token === null) return false;
  try {
    const response = await fetch(new URL('api/commands', record.url), {
      method:  'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body:    JSON.stringify({ kind, now }),
      signal:  AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ends only the process the Hephaestus lock names, still being that process: a reused pid is never signalled. What it answers is what the wait below sees.
 * True when a forced end took effect, which no listener of that process ever hears.
 */
function forcedTheHephaestusLockProcess({ processSupervision }: PlatformPorts, record: HephaestusLockRecord): boolean {
  const currentIdentity = processSupervision.identityOf(record.processId);
  const hephaestusLockIdentity   = { processId: record.processId, startStamp: record.processStartStamp, bootIdentity: record.bootIdentity };
  if (currentIdentity === null || !processSupervision.sameProcess(currentIdentity, hephaestusLockIdentity)) return false;
  const { fallbackStopIsForced } = processSupervision;
  const outcome = processSupervision.stopProcess(record.processId, fallbackStopIsForced ? 'force' : 'ask');
  return fallbackStopIsForced && outcome.verdict === 'signalled';
}

/** The Hephaestus lock's last reading: gone or naming a dead identity lets a successor start, as after a crash; `null` when it still names a live one. */
async function hephaestusLockReadingOnceGone(ports: PlatformPorts, files: HephaestusFiles, generation: number): Promise<HephaestusLockReading | null> {
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_STOP_TRIES, intervalMilliseconds: HEPHAESTUS_STOP_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
    if (newest.verdict !== 'live' || newest.generation !== generation) return newest;
    await Bun.sleep(schedule.intervalMilliseconds);
  }
  return null;
}

/** No Hephaestus lock left means Hephaestus released it, the last act of its own stop; a newer one overtaking a forced end leaves that end forced. */
function endingOf(reading: HephaestusLockReading, generation: number, forced: boolean): HephaestusEnding {
  if (reading.verdict === 'none') return 'clean';
  if (forced) return 'forced';
  return reading.verdict === 'dead' && reading.generation === generation ? 'unfinished' : 'clean';
}

async function stopTheLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles, kind: RuntimeStopKind, now: boolean): Promise<StopOutcome> {
  const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
  if (newest.verdict === 'none') return { verdict: 'was-down' };
  if (newest.verdict === 'dead') return { verdict: 'found-dead', record: newest.record, generation: newest.generation };
  const { generation, record } = newest;
  const forced = !await commandWasTaken(record, kind, now) && forcedTheHephaestusLockProcess(ports, record);
  const reading = await hephaestusLockReadingOnceGone(ports, files, generation);
  if (reading === null) throw new OperationRefusal('refused', { kind: 'hephaestus-still-live', url: record.url, processId: record.processId });
  return {
    verdict: 'stopped', record, generation, ending: endingOf(reading, generation, forced)
  };
}

export type RestartOutcome =
  | { verdict: 'was-down' }
  | { verdict: 'not-taken'; record: HephaestusLockRecord }
  | { verdict: 'restarted'; successorCodeVersion: string; url: string };

type RestartAnswer =
  | { verdict: 'taken' }
  | { verdict: 'not-taken' }
  | { verdict: 'refused'; successorCodeVersion: string; step: string; error: string };

function textFieldOf(fields: unknown, key: string): string {
  const value = typeof fields === 'object' && fields !== null && Object.hasOwn(fields, key) ? (fields as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : 'unknown';
}

/** The live Hephaestus answers a restart once the code on disk reported its preflight: taken, or refused `restart-failed` with its step. */
async function restartAnswerOf(record: HephaestusLockRecord, now: boolean): Promise<RestartAnswer> {
  const token = tokenIn(record);
  if (token === null) return { verdict: 'not-taken' };
  try {
    const response = await fetch(new URL('api/commands', record.url), {
      method:  'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body:    JSON.stringify({ kind: 'hephaestus-restart', now }),
      signal:  AbortSignal.timeout(RESTART_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (response.ok) return { verdict: 'taken' };
    const { refusal, fields } = await response.json() as { refusal?: unknown; fields?: unknown };
    if (refusal !== 'restart-failed') return { verdict: 'not-taken' };
    return {
      verdict: 'refused', successorCodeVersion: textFieldOf(fields, 'successorCodeVersion'), step: textFieldOf(fields, 'step'), error: textFieldOf(fields, 'error')
    };
  } catch {
    return { verdict: 'not-taken' };
  }
}

type SuccessorWait =
  | { verdict: 'serves'; record: HephaestusLockRecord }
  | { verdict: 'still-held' }
  | { verdict: 'none' };

/**
 * Waits for the successor: another process than the one restarted, holding the Hephaestus lock, its API answering. The restarted process may
 * hold the lock for long while it finishes a landing, so the successor's own tries count only once that process is gone. `still-held`: it
 * never let go. `none`: it is gone and no successor served.
 */
async function successorOnceItServes(ports: PlatformPorts, files: HephaestusFiles, restarted: HephaestusLockRecord): Promise<SuccessorWait> {
  const override = hephaestusPollIntervalOverride();
  const release = hephaestusPollScheduleOf({ tries: RESTART_RELEASE_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, override);
  const start = hephaestusPollScheduleOf({ tries: HEPHAESTUS_STOP_TRIES + HEPHAESTUS_READY_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, override);
  let triesSinceItLetGo = 0;
  for (let attempt = 0; attempt < release.tries + start.tries; attempt++) {
    const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
    const stillHeld = newest.verdict === 'live' && newest.record.processId === restarted.processId;
    if (newest.verdict === 'live' && !stillHeld && await identityAnswers(newest.record)) return { verdict: 'serves', record: newest.record };
    if (stillHeld && attempt >= release.tries) return { verdict: 'still-held' };
    if (!stillHeld && ++triesSinceItLetGo > start.tries) return { verdict: 'none' };
    await Bun.sleep(release.intervalMilliseconds);
  }
  return { verdict: 'still-held' };
}

function handedOver(files: HephaestusFiles, generation: number): boolean {
  const presence = Presence.readPresence(files);
  return presence.verdict === 'read' && presence.record.generation === generation && presence.record.ending?.kind === 'handed-over';
}

/**
 * Asks the live Hephaestus for its checked restart and waits for the successor to serve. A refused preflight is refused `restart-failed`, the
 * old Hephaestus still driving, as is one that never let go; a successor that never served is refused the same at `serve`, with no Hephaestus
 * on the board. A Hephaestus whose API does not take the command, and a board no Hephaestus serves, are the caller's to stop and start.
 */
async function restartTheLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles, now: boolean): Promise<RestartOutcome> {
  const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
  if (newest.verdict === 'none' || newest.record === null) return { verdict: 'was-down' };
  const { record } = newest;
  const answer: RestartAnswer = newest.verdict === 'live' ? await restartAnswerOf(record, now) : { verdict: 'not-taken' };
  const unanswered: RestartOutcome = newest.verdict === 'live' ? { verdict: 'not-taken', record } : { verdict: 'was-down' };
  if (answer.verdict === 'refused') {
    throw new OperationRefusal('refused', {
      kind: 'restart-failed', successorCodeVersion: answer.successorCodeVersion, step: answer.step, error: answer.error, url: record.url
    });
  }
  // A generation that handed over without answering this command is being restarted by another one: its successor is waited for first.
  if (answer.verdict === 'not-taken' && !handedOver(files, newest.generation)) return unanswered;
  const waited = await successorOnceItServes(ports, files, record);
  if (waited.verdict === 'serves') return { verdict: 'restarted', successorCodeVersion: waited.record.codeVersion, url: waited.record.url };
  if (answer.verdict === 'not-taken') return waited.verdict === 'none' ? { verdict: 'was-down' } : unanswered;
  throw new OperationRefusal('refused', {
    kind:                 'restart-failed',
    successorCodeVersion: 'unknown',
    step:                 'serve',
    error:                waited.verdict === 'none' ? 'the successor did not serve' : 'the old Hephaestus did not let go of the board',
    url:                  waited.verdict === 'none' ? null : record.url,
  });
}

/** The same program with its streams dropped, in the root so it holds no worktree as its working directory; Hephaestus logs to `hephaestus.log` itself. */
async function startDetached(
  context: Pick<CommandContext, 'programCommand' | 'platformPorts'>,
  rootDirectory: string,
  files: HephaestusFiles,
  runArguments: readonly string[],
): Promise<string> {
  if (context.programCommand.length === 0) throw new OperationRefusal('unrepaired', 'This process has no program command to start a detached Hephaestus from.');
  const child = Bun.spawn([...context.programCommand, 'start', '--foreground', ...runArguments], {
    cwd:    rootDirectory,
    env:    outlivingProgramEnvironment(),
    stdin:  'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    ...context.platformPorts.processSupervision.spawnOptionsFor('detached-program'),
  });
  child.unref();
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_READY_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    // A child that ends before the interval is over has already answered: it did not start.
    await Promise.race([Bun.sleep(schedule.intervalMilliseconds), child.exited]);
    if (child.exitCode !== null) break;
    const newest = HephaestusLock.newestOf(context.platformPorts, files.hephaestusDirectory);
    if (newest.verdict === 'live' && newest.record.processId === child.pid && await identityAnswers(newest.record)) return newest.record.url;
  }
  // A child that lost the Hephaestus lock to a Hephaestus started at the same time leaves the board served all the same.
  const racingHephaestusLock = HephaestusLock.newestOf(context.platformPorts, files.hephaestusDirectory);
  if (child.exitCode !== null && racingHephaestusLock.verdict === 'live' && await identityAnswers(racingHephaestusLock.record)) return racingHephaestusLock.record.url;
  throw new OperationRefusal('refused', { kind: 'hephaestus-did-not-start', exitCode: child.exitCode, logFilePath: files.logFilePath });
}

/** The live Hephaestus's state document, read with the Hephaestus lock's token; `null` when the token is unreadable or Hephaestus does not answer. */
async function stateOf(record: HephaestusLockRecord): Promise<unknown> {
  const token = tokenIn(record);
  if (token === null) return null;
  try {
    const response = await fetch(new URL('api/state', record.url), {
      headers: { authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS),
    });
    return response.ok ? await response.json() as unknown : null;
  } catch {
    return null;
  }
}

/** `not-taken`: no Hephaestus is live, or its API did not answer the command; `done` and `nothing-to-do` are the live Hephaestus's outcome. */
export type TalosRestartRequestOutcome = 'done' | 'nothing-to-do' | 'not-taken';

/** Asks the live Hephaestus for a clean restart of its Talos; Hephaestus alone sends Talos the quit and starts the next one. */
async function restartTheTalosOf(ports: PlatformPorts, files: HephaestusFiles): Promise<TalosRestartRequestOutcome> {
  const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
  const token = newest.verdict === 'live' ? tokenIn(newest.record) : null;
  if (newest.verdict !== 'live' || token === null) return 'not-taken';
  try {
    const response = await fetch(new URL('api/commands', newest.record.url), {
      method:  'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body:    JSON.stringify({ kind: 'talos-restart' }),
      signal:  AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) return 'not-taken';
    const { outcome } = await response.json() as { outcome?: unknown };
    return outcome === 'done' || outcome === 'nothing-to-do' ? outcome : 'not-taken';
  } catch {
    return 'not-taken';
  }
}

export const HephaestusRemote = Object.freeze({
  stopTheLiveHephaestus, restartTheLiveHephaestus, startDetached, identityAnswers, identityOnceItAnswers, stateOf, restartTheTalosOf
});
