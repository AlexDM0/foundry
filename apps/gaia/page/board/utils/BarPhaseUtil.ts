/**
 * Which phase each stretch of a chart bar shows, so a segment is coloured by its own phase and never by the state its row is in now.
 * DOM-free and clock-free: the bar's run arrives in epoch milliseconds.
 */

import type { BoardTaskPhaseDocument }             from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardTaskStatus } from '../../@types/board/BoardVocabulary.ts';
import { TimeUtil }                                from './TimeUtil.ts';

export interface BarPhaseSpan {
  status:                 BoardTaskStatus;
  startEpochMilliseconds: number;
  endEpochMilliseconds:   number;
}

/** Each recorded phase runs from its own stamp to the next readable one, cut to the bar's run; a phase the run does not cover is left out. */
function phaseSpansOf(history: readonly BoardTaskPhaseDocument[] | null | undefined, barStartEpochMilliseconds: number, barEndEpochMilliseconds: number): BarPhaseSpan[] {
  const stamped = (history ?? []).flatMap((phase) => {
    const atEpochMilliseconds = TimeUtil.epochMillisecondsOf(phase.at);
    return atEpochMilliseconds === null ? [] : [{ status: phase.status, atEpochMilliseconds }];
  });
  return stamped.flatMap((phase, index) => {
    const nextAt                 = stamped[index + 1]?.atEpochMilliseconds ?? barEndEpochMilliseconds;
    const startEpochMilliseconds = Math.max(phase.atEpochMilliseconds, barStartEpochMilliseconds);
    const endEpochMilliseconds   = Math.min(nextAt, barEndEpochMilliseconds);
    return endEpochMilliseconds > startEpochMilliseconds ? [{ status: phase.status, startEpochMilliseconds, endEpochMilliseconds }] : [];
  });
}

/** A review pass, `reviewPassRound` from 1, reads in its round's review fill; any other segment reads as the phase it shows. */
function segmentStateOf(phaseStatus: BoardTaskStatus, reviewPassRound: number | null): BoardDisplayState {
  return reviewPassRound === null ? phaseStatus : reviewPassStateOf(reviewPassRound);
}

/** A review pass's fill by its round from 1, whatever phase its row is in. */
function reviewPassStateOf(reviewPassRound: number): BoardDisplayState {
  return reviewPassRound === 1 ? 'reviewing' : 're-review';
}

export const BarPhaseUtil = {
  phaseSpansOf,
  segmentStateOf,
  reviewPassStateOf,
} as const;
