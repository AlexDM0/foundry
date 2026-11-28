/**
 * Gaia's own update (`docs/architecture.md`, "Gaia's own update"): it checks the clone Gaia runs from against origin's main at its start,
 * every hour and when asked; an update fast-forwards the clone and runs forge's setup, which compiles the forge command again; a restart
 * quits Gaia.app and opens it again on the new code, and a reboot does so at any time but during an update. The status rides on every fleet document.
 */
import type { FastForwardVerdict, GaiaCheckout, UpstreamReading }    from '../../adapters/gaia-checkout/GaiaCheckout.ts';
import type { DetachedStartRequest, ProcessRun }                     from '../../lib/process-run/ProcessRun.ts';
import type { ClockTimer, ClockTimers }                              from '../../services/Clock.ts';
import type { CommandVerdict }                                       from '../../shared/@types/CommandVerdict.ts';
import type { GaiaCommand, GaiaUpdateCommand }                       from '../../shared/@types/GaiaCommand.ts';
import type { GaiaUpdateFailure, GaiaUpdateState, GaiaUpdateStatus } from '../../shared/@types/GaiaUpdateStatus.ts';

/** What Gaia quits and opens again: the Gaia.app that started this server, and the launcher process it runs. */
export interface GaiaRelaunchTarget {
  readonly appBundlePath:     string;
  readonly launcherProcessId: number;
}

export interface GaiaUpdateOptions {
  readonly checkout:                   GaiaCheckout;
  readonly processRun:                 Pick<ProcessRun, 'startDetached'>;
  /** `null` for a Gaia started from a terminal, which no Gaia.app started and which cannot open itself again. */
  readonly relaunchTarget:             GaiaRelaunchTarget | null;
  /** Where the relaunch runs: a folder that exists. */
  readonly workingDirectory:           string;
  readonly timers:                     ClockTimers;
  readonly onStatusChanged:            () => void;
  readonly checkIntervalMilliseconds?: number;
}

export interface GaiaUpdate {
  readonly status:       () => GaiaUpdateStatus;
  /** Checks at once, then every interval, until `stop`. */
  readonly start:        () => void;
  readonly stop:         () => void;
  readonly carry:        (command: GaiaUpdateCommand) => Promise<CommandVerdict>;
  /** Settles once the check or update on its way has ended. */
  readonly untilSettled: () => Promise<void>;
}

const CHECK_INTERVAL_MILLISECONDS = 3_600_000;

const GAIA_UPDATE_COMMAND_KINDS: ReadonlySet<GaiaCommand['kind']> = new Set(['gaia-update-check', 'gaia-update', 'gaia-restart', 'gaia-reboot']);

export function isGaiaUpdateCommand(command: GaiaCommand): command is GaiaUpdateCommand {
  return GAIA_UPDATE_COMMAND_KINDS.has(command.kind);
}

/** The states a check may start from: no check, update or restart is on its way, and no update waits for its restart. */
const STATES_A_CHECK_STARTS_FROM: ReadonlySet<GaiaUpdateState> = new Set(['up-to-date', 'available', 'not-known']);

/** A reboot waits for an update to finish, so the clone and the forge command are never left halfway. */
const STATES_A_REBOOT_STARTS_FROM: ReadonlySet<GaiaUpdateState> = new Set(['checking', 'up-to-date', 'available', 'not-known', 'restart-needed']);

const SHELL_PROGRAM = '/bin/sh';
const OPEN_PROGRAM = '/usr/bin/open';
/** Polls of the launcher's end before Gaia.app opens again regardless, a fifth of a second apart. */
const LAUNCHER_END_POLLS = 150;
/**
 * Asks the launcher to close Gaia as a quit does, waits for its end, which stops this server too, and opens Gaia.app as a new instance,
 * since the old bundle process may still be ending and would only bring its window forward.
 */
const RELAUNCH_SCRIPT = [
  'kill -TERM "$1"',
  'polls=0',
  `while kill -0 "$1" 2>/dev/null && [ "$polls" -lt ${LAUNCHER_END_POLLS} ]; do sleep 0.2; polls=$((polls + 1)); done`,
  `exec ${OPEN_PROGRAM} -n "$2"`,
].join('\n');
const RELAUNCH_SCRIPT_NAME = 'gaia-relaunch';

export function relaunchRequestOf(target: GaiaRelaunchTarget, workingDirectory: string): DetachedStartRequest {
  return {
    program:          SHELL_PROGRAM,
    programArguments: ['-c', RELAUNCH_SCRIPT, RELAUNCH_SCRIPT_NAME, String(target.launcherProcessId), target.appBundlePath],
    workingDirectory,
  };
}

function failureOfFastForward(verdict: Exclude<FastForwardVerdict, 'fast-forwarded'>): GaiaUpdateFailure {
  return verdict === 'local-changes' ? 'local-changes' : 'diverged';
}

export function createGaiaUpdate(options: GaiaUpdateOptions): GaiaUpdate {
  const restartIsPossible = options.relaunchTarget !== null;
  const checkIntervalMilliseconds = options.checkIntervalMilliseconds ?? CHECK_INTERVAL_MILLISECONDS;
  let status: GaiaUpdateStatus = {
    state: 'checking', commitsBehind: 0, failure: null, restartIsPossible
  };
  let workOnItsWay: Promise<void> = Promise.resolve();
  let checkTimer: ClockTimer | null = null;

  function publish(state: GaiaUpdateState, commitsBehind: number, failure: GaiaUpdateFailure | null): void {
    status = {
      state, commitsBehind, failure, restartIsPossible
    };
    options.onStatusChanged();
  }

  function publishReading(reading: UpstreamReading): void {
    if (reading.verdict !== 'read') {
      publish('not-known', 0, reading.verdict);
      return;
    }
    publish(reading.commitsBehind > 0 ? 'available' : 'up-to-date', reading.commitsBehind, null);
  }

  async function check(): Promise<void> {
    publish('checking', status.commitsBehind, null);
    publishReading(await options.checkout.upstreamReading());
  }

  async function update(): Promise<void> {
    const { commitsBehind } = status;
    publish('updating', commitsBehind, null);
    const reading = await options.checkout.upstreamReading();
    if (reading.verdict !== 'read') {
      publishReading(reading);
      return;
    }
    if (reading.commitsBehind === 0) {
      publish('up-to-date', 0, null);
      return;
    }
    const fastForwardVerdict = await options.checkout.fastForward();
    if (fastForwardVerdict !== 'fast-forwarded') {
      publish('available', reading.commitsBehind, failureOfFastForward(fastForwardVerdict));
      return;
    }
    // The clone holds the new code once it has moved, so a failed setup still waits for a restart, with the failure shown beside it.
    const setupVerdict = await options.checkout.forgeSetup();
    publish('restart-needed', 0, setupVerdict === 'set-up' ? null : 'forge-setup-failed');
  }

  /** A relaunch that did not start leaves the state as it was, with the failure beside it. */
  function restart(): CommandVerdict {
    if (options.relaunchTarget === null) return { verdict: 'not-supported' };
    const startAnswer = options.processRun.startDetached(relaunchRequestOf(options.relaunchTarget, options.workingDirectory));
    if (startAnswer.verdict !== 'started') {
      publish(status.state, status.commitsBehind, 'restart-not-started');
      return { verdict: 'done' };
    }
    publish('restarting', 0, null);
    return { verdict: 'done' };
  }

  function startWork(work: () => Promise<void>): void {
    workOnItsWay = work();
  }

  function scheduleNextCheck(): void {
    checkTimer = options.timers.start(() => {
      if (STATES_A_CHECK_STARTS_FROM.has(status.state)) startWork(check);
      scheduleNextCheck();
    }, checkIntervalMilliseconds);
  }

  async function carry(command: GaiaUpdateCommand): Promise<CommandVerdict> {
    switch (command.kind) {
      case 'gaia-update-check':
        if (!STATES_A_CHECK_STARTS_FROM.has(status.state)) return { verdict: 'nothing-to-do' };
        startWork(check);
        await workOnItsWay;
        return { verdict: 'done' };
      case 'gaia-update':
        if (status.state !== 'available') return { verdict: 'nothing-to-do' };
        // The update takes minutes; the page follows it on the fleet documents, not on this answer.
        startWork(update);
        return { verdict: 'done' };
      case 'gaia-restart':
        if (status.state !== 'restart-needed') return { verdict: 'nothing-to-do' };
        return restart();
      case 'gaia-reboot':
        if (!STATES_A_REBOOT_STARTS_FROM.has(status.state)) return { verdict: 'nothing-to-do' };
        return restart();
    }
  }

  return {
    status: () => status,
    start:  () => {
      startWork(check);
      scheduleNextCheck();
    },
    stop: () => {
      checkTimer?.cancel();
      checkTimer = null;
    },
    carry,
    untilSettled: () => workOnItsWay,
  };
}
