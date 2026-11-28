/**
 * The answer for a platform with no adapter yet: every capability refuses through its own value or verdict, an identity reading as unknown and a
 * stop as refused, so nothing is guessed and a command that needs no process still runs.
 */
import {
  childEndOf,
  processIsGone,
  sameProcess,
  startedBefore
} from './ProcessIdentity.ts';
import type { ProcessSupervision } from './ProcessSupervision.ts';

export function createUnsupportedProcessSupervision(platform: string): ProcessSupervision {
  const refusal = { verdict: 'refused', refusal: { cause: 'no-adapter', platformName: platform } } as const;
  return Object.freeze({
    identityOf:                () => null,
    identitySourcesOf:         () => [],
    sameProcess,
    startedBefore,
    processIsGone,
    treeMembersOf:             () => null,
    stopTree:                  () => refusal,
    stopProcess:               () => refusal,
    spawnOptionsFor:           () => ({ detached: false }),
    endOf:                     childEndOf,
    fallbackStopIsForced:      true,
    stopSignals:               ['SIGTERM', 'SIGINT', 'SIGHUP'] as const,
    bootStartedAtEpochSeconds: () => null,
  });
}
