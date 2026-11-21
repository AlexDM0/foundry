/**
 * What the CLI does to a Hephaestus it is not: start one detached, ask the live one to stop, and wait for its Baton to go. A stop goes to the
 * API with the token; when the API does not answer, the Baton's process is ended, its identity checked first. Talos and its children are
 * never touched. A Baton left naming a dead process says Hephaestus's own stop never finished, which the outcome reports for the caller
 * to repair. A clean restart of Talos is only asked of the live Hephaestus, which sends Talos its quit.
 */
import { readFileSync } from 'node:fs';

import type { PlatformPorts }                                          from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { type BatonReading, type BatonRecord, Baton }                  from '../../src/services/hephaestus/Baton.ts';
import { BatonPass }                                                   from '../../src/services/hephaestus/BatonPass.ts';
import type { HephaestusFiles }                                        from '../../src/services/hephaestus/HephaestusFiles.ts';
import { outlivingProgramEnvironment, hephaestusPollIntervalOverride } from '../../src/shared/Environment.ts';
import { OperationRefusal }                                            from '../../src/shared/OperationRefusal.ts';
import {
  BATON_PASS_OUTCOME_TRIES,
  BATON_PASS_READY_INTERVAL_MILLISECONDS,
  HEPHAESTUS_READY_INTERVAL_MILLISECONDS,
  HEPHAESTUS_READY_TRIES,
  HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS,
  HEPHAESTUS_STOP_INTERVAL_MILLISECONDS,
  HEPHAESTUS_STOP_TRIES
} from '../../src/shared/constants/HephaestusLimits.ts';
import type { CommandContext }      from '../CommandContext.ts';
import { hephaestusPollScheduleOf } from './HephaestusPollSchedule.ts';

export type RuntimeStopKind = 'hephaestus-stop' | 'hephaestus-restart';

/** `clean`: Hephaestus finished its own stop. `forced`: this command ended it by force. `unfinished`: it ended by itself before its stop finished. */
export type HephaestusEnding = 'clean' | 'forced' | 'unfinished';

/** `found-dead`: the newest Baton already named a dead process, so its Hephaestus's own stop never finished; an unreadable Baton has no record. */
export type StopOutcome =
  | { verdict: 'was-down' }
  | { verdict: 'stopped'; record: BatonRecord; generation: number; ending: HephaestusEnding }
  | { verdict: 'found-dead'; record: BatonRecord | null; generation: number };

function tokenIn(record: BatonRecord): string | null {
  try {
    return readFileSync(record.tokenFile, 'utf8').trim();
  } catch {
    return null;
  }
}

async function identityAnswers(record: BatonRecord): Promise<boolean> {
  try {
    const response = await fetch(new URL('api/identity', record.url), { signal: AbortSignal.timeout(HEPHAESTUS_REQUEST_TIMEOUT_MILLISECONDS) });
    return response.ok;
  } catch {
    return false;
  }
}

async function identityDocumentOf(record: BatonRecord): Promise<Readonly<Record<string, unknown>> | null> {
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
async function identityOnceItAnswers(record: BatonRecord): Promise<Readonly<Record<string, unknown>> | null> {
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_READY_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const identity = await identityDocumentOf(record);
    if (identity !== null) return identity;
    await Bun.sleep(schedule.intervalMilliseconds);
  }
  return null;
}

async function commandWasTaken(record: BatonRecord, kind: RuntimeStopKind, now: boolean): Promise<boolean> {
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
 * Ends only the process the Baton names, still being that process: a reused pid is never signalled. What it answers is what the wait below sees.
 * True when a forced end took effect, which no listener of that process ever hears.
 */
function forcedTheBatonProcess({ processSupervision }: PlatformPorts, record: BatonRecord): boolean {
  const currentIdentity = processSupervision.identityOf(record.processId);
  const batonIdentity   = { processId: record.processId, startStamp: record.processStartStamp, bootIdentity: record.bootIdentity };
  if (currentIdentity === null || !processSupervision.sameProcess(currentIdentity, batonIdentity)) return false;
  const { fallbackStopIsForced } = processSupervision;
  const outcome = processSupervision.stopProcess(record.processId, fallbackStopIsForced ? 'force' : 'ask');
  return fallbackStopIsForced && outcome.verdict === 'signalled';
}

/** The Baton's last reading: gone or naming a dead identity lets a successor start, as after a crash; `null` when it still names a live one. */
async function batonReadingOnceGone(ports: PlatformPorts, files: HephaestusFiles, generation: number): Promise<BatonReading | null> {
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_STOP_TRIES, intervalMilliseconds: HEPHAESTUS_STOP_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const newest = Baton.newestBatonOf(ports, files.hephaestusDirectory);
    if (newest.verdict !== 'live' || newest.generation !== generation) return newest;
    await Bun.sleep(schedule.intervalMilliseconds);
  }
  return null;
}

/** No Baton left means Hephaestus released it, the last act of its own stop; a newer one overtaking a forced end leaves that end forced. */
function endingOf(reading: BatonReading, generation: number, forced: boolean): HephaestusEnding {
  if (reading.verdict === 'none') return 'clean';
  if (forced) return 'forced';
  return reading.verdict === 'dead' && reading.generation === generation ? 'unfinished' : 'clean';
}

async function stopTheLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles, kind: RuntimeStopKind, now: boolean): Promise<StopOutcome> {
  const newest = Baton.newestBatonOf(ports, files.hephaestusDirectory);
  if (newest.verdict === 'none') return { verdict: 'was-down' };
  if (newest.verdict === 'dead') return { verdict: 'found-dead', record: newest.record, generation: newest.generation };
  const { generation, record } = newest;
  const forced = !await commandWasTaken(record, kind, now) && forcedTheBatonProcess(ports, record);
  const reading = await batonReadingOnceGone(ports, files, generation);
  if (reading === null) throw new OperationRefusal('refused', { kind: 'hephaestus-still-live', url: record.url, processId: record.processId });
  return {
    verdict: 'stopped', record, generation, ending: endingOf(reading, generation, forced)
  };
}

export type RestartOutcome =
  | { verdict: 'was-down' }
  | { verdict: 'not-taken'; record: BatonRecord }
  | { verdict: 'baton-passed'; successorCodeVersion: string; url: string };

/**
 * Asks the live Hephaestus for its checked Baton pass and reads the outcome it leaves in its Baton pass file; a failed one is refused
 * `baton-pass-failed`, the old Hephaestus still driving. A Hephaestus whose API does not take the command is the caller's to stop and restart.
 */
async function handOverTheLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles, now: boolean): Promise<RestartOutcome> {
  const newest = Baton.newestBatonOf(ports, files.hephaestusDirectory);
  if (newest.verdict !== 'live') return { verdict: 'was-down' };
  if (!await commandWasTaken(newest.record, 'hephaestus-restart', now)) return { verdict: 'not-taken', record: newest.record };
  const batonPassFilePath = BatonPass.batonPassFilePathOf(files.hephaestusDirectory, newest.generation);
  const schedule = hephaestusPollScheduleOf({ tries: BATON_PASS_OUTCOME_TRIES, intervalMilliseconds: BATON_PASS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const report = BatonPass.readBatonPass(batonPassFilePath);
    if (report?.state === 'serving') return { verdict: 'baton-passed', successorCodeVersion: report.successorCodeVersion, url: report.url };
    if (report?.state === 'failed') {
      throw new OperationRefusal('refused', {
        kind: 'baton-pass-failed', successorCodeVersion: report.successorCodeVersion, step: report.step, error: report.error, url: newest.record.url
      });
    }
    await Bun.sleep(schedule.intervalMilliseconds);
  }
  throw new OperationRefusal('refused', {
    kind: 'baton-pass-failed', successorCodeVersion: 'unknown', step: 'serve', error: `no outcome within ${schedule.tries} tries`, url: newest.record.url
  });
}

/** The same program with its streams dropped, in the root so it holds no worktree as its working directory; Hephaestus logs to `hephaestus.log` itself. */
async function startDetached(
  context: Pick<CommandContext, 'programCommand' | 'platformPorts'>,
  rootDirectory: string,
  files: HephaestusFiles,
  runArguments: readonly string[],
): Promise<string> {
  if (context.programCommand.length === 0) throw new Error('This process has no program command to start a detached Hephaestus from.');
  const child = Bun.spawn([...context.programCommand, 'start', '--foreground', ...runArguments], {
    cwd:    rootDirectory,
    env:    outlivingProgramEnvironment(),
    stdin:  'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    ...context.platformPorts.processSupervision.spawnOptionsFor('hephaestus'),
  });
  child.unref();
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_READY_TRIES, intervalMilliseconds: HEPHAESTUS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    // A child that ends before the interval is over has already answered: it did not start.
    await Promise.race([Bun.sleep(schedule.intervalMilliseconds), child.exited]);
    if (child.exitCode !== null) break;
    const newest = Baton.newestBatonOf(context.platformPorts, files.hephaestusDirectory);
    if (newest.verdict === 'live' && newest.record.processId === child.pid && await identityAnswers(newest.record)) return newest.record.url;
  }
  // A child that lost the Baton to a Hephaestus started at the same time leaves the board served all the same.
  const racingBaton = Baton.newestBatonOf(context.platformPorts, files.hephaestusDirectory);
  if (child.exitCode !== null && racingBaton.verdict === 'live' && await identityAnswers(racingBaton.record)) return racingBaton.record.url;
  throw new OperationRefusal('refused', { kind: 'hephaestus-did-not-start', exitCode: child.exitCode, logFilePath: files.logFilePath });
}

/** The live Hephaestus's state document, read with the Baton's token; `null` when the token is unreadable or Hephaestus does not answer. */
async function stateOf(record: BatonRecord): Promise<unknown> {
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
  const newest = Baton.newestBatonOf(ports, files.hephaestusDirectory);
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
  stopTheLiveHephaestus, handOverTheLiveHephaestus, startDetached, identityAnswers, identityOnceItAnswers, stateOf, restartTheTalosOf
});
