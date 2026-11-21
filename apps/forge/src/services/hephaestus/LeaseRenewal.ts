/**
 * Hephaestus's renewal of its Talos's supervision lease, on a timer of the main loop with no thread and no connection of its own, so a
 * renewal is only worth what the main loop proves. A heartbeat measures real time, so the timer reads the wall clock; progress is a pass
 * number, never an elapsed time: the same pass in flight at two ticks in a row withholds the renewal.
 */
import type { LeaseRenewer }    from '../../lib/talos/TalosRecord.ts';
import type { TalosConnection } from './TalosConnection.ts';

export interface PassProgress {
  /** The number of the pass running now, counted from 1 over Hephaestus's life; `null` between passes. */
  readonly passInFlight: () => number | null;
}

export interface LeaseRenewalRequest {
  /** The connection `ensureTalos` answered, read at each renewal, so a Talos started while serving is followed. */
  connection:           () => TalosConnection | null;
  renewer:              LeaseRenewer;
  intervalMilliseconds: number;
  tickGapMilliseconds:  number;
  passProgress:         PassProgress;
  wallNowMilliseconds:  () => number;
  log:                  (sentence: string) => void;
  /** After each renewal Talos answered `done`; stage 3 writes the heartbeat here. */
  onRenewed?:           (renewedAtWallMilliseconds: number) => void;
}

export interface LeaseRenewal {
  readonly stop: () => void;
}

/** A renewal never throws into the main loop: whatever fails waits for the next tick. */
function quietly(action: () => void): void {
  try {
    action();
  } catch {
    // A log or a hook that throws must not stop the renewals that follow.
  }
}

export function startLeaseRenewal(request: LeaseRenewalRequest): LeaseRenewal {
  const log = (sentence: string): void => quietly(() => request.log(sentence));

  const renew = async (renewedAtWallMilliseconds: number): Promise<void> => {
    const connection = request.connection();
    if (connection === null) {
      log('The lease renewal found no connection to Talos.');
      return;
    }
    const answer = await connection.send({ kind: 'lease-renewal', renewer: request.renewer }).catch(() => 'no-answer' as const);
    if (answer === 'no-answer') {
      log('Talos did not answer a lease renewal.');
      return;
    }
    if (answer.verdict === 'refused') {
      log(`Talos refused a lease renewal: ${answer.reason}.`);
      return;
    }
    const { onRenewed } = request;
    if (onRenewed !== undefined) quietly(() => onRenewed(renewedAtWallMilliseconds));
  };
  const renewInTheBackground = (renewedAtWallMilliseconds: number): void => {
    renew(renewedAtWallMilliseconds).catch(() => undefined);
  };

  let previousTickWallMilliseconds = request.wallNowMilliseconds();
  let passSeenAtThePreviousTick = request.passProgress.passInFlight();
  let withheldStreakLogged = false;
  const tick = (): void => {
    const wallNowMilliseconds = request.wallNowMilliseconds();
    const sinceThePreviousTick = wallNowMilliseconds - previousTickWallMilliseconds;
    previousTickWallMilliseconds = wallNowMilliseconds;
    const passInFlight = request.passProgress.passInFlight();
    // A late tick, or one before its predecessor, is a gap: a sleep may have caught the pass, so it renews and compares afresh from here.
    const isGap = sinceThePreviousTick < 0 || sinceThePreviousTick > request.intervalMilliseconds + request.tickGapMilliseconds;
    const samePassStillInFlight = !isGap && passInFlight !== null && passInFlight === passSeenAtThePreviousTick;
    passSeenAtThePreviousTick = passInFlight;
    if (samePassStillInFlight) {
      if (!withheldStreakLogged) log(`The lease renewal is withheld: pass ${passInFlight} has run for more than one renewal interval.`);
      withheldStreakLogged = true;
      return;
    }
    withheldStreakLogged = false;
    renewInTheBackground(wallNowMilliseconds);
  };

  renewInTheBackground(previousTickWallMilliseconds);
  const timer = setInterval(tick, request.intervalMilliseconds);
  // The renewals end with the process, never hold it open.
  timer.unref();
  return Object.freeze({ stop: () => clearInterval(timer) });
}
