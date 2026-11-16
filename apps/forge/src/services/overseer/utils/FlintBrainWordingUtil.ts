/** The forge's own words for Flint's brain in the monitor snapshot: its state, its end and a refusal. They name no command and no client. */
import type { MonitorFlintBrainEndedReason } from 'forge-contracts/MonitorSnapshotDocument';

import type { FlintBrainRefusal }  from '../@types/FlintBrainRun.ts';
import { MILLISECONDS_PER_SECOND } from '../constants/TimeUnits.ts';

const SECONDS_PER_MINUTE = 60;
const SECOND_DIGITS = 2;

/** `2:00` for two minutes: a duration shown, never compared. */
function durationTextOf(startedAt: string, endedAt: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / MILLISECONDS_PER_SECOND));
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(SECOND_DIGITS, '0')}`;
}

function refusalSentenceOf(refusal: FlintBrainRefusal): string {
  switch (refusal.code) {
    case 'no-flint':
      return 'Flint\'s brain cannot run confined here, so there is none.';
    case 'brain-already-running':
      return 'Flint\'s brain is already running.';
    case 'brain-not-running':
      return 'Flint\'s brain is not running.';
    case 'overseer-paused':
      return 'The Overseer is paused, so Flint\'s brain does not start.';
    case 'usage-limit-holds':
      return `The usage limit holds until ${refusal.resetsAt}, so Flint's brain does not start.`;
    case 'brain-failed-to-start':
      return 'Flint\'s brain failed to start.';
  }
}

function startingSentence(): string {
  return 'Flint\'s brain is starting.';
}

function runningSentence(): string {
  return 'Flint\'s brain chooses Flint\'s moves.';
}

function endedSentenceOf(reason: MonitorFlintBrainEndedReason, startedAt: string, endedAt: string): string {
  const duration = durationTextOf(startedAt, endedAt);
  switch (reason) {
    case 'time':
      return `Flint's brain stopped after ${duration}, its whole time.`;
    case 'stopped':
      return `Flint's brain was stopped after ${duration}.`;
    case 'usage-limit':
      return `Flint's brain stopped after ${duration}: the usage limit holds.`;
    case 'failed':
      return `Flint's brain failed after ${duration}.`;
  }
}

export const FlintBrainWordingUtil = Object.freeze({
  refusalSentenceOf,
  startingSentence,
  runningSentence,
  endedSentenceOf,
});
