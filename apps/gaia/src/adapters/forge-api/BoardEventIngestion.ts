/**
 * The ingestion of a forge's board event stream (`GET /api/v2/events`) into Gaia's `BoardEvent`. Every event of it carries the forge's
 * internal board state, never a contract document, so Gaia reads only the event's name: `board` asks for the board document anew through
 * `ForgeClient.boardOf`, and each part event names the part that changed. An event name Gaia does not know, the handshake's included, maps
 * to nothing and is passed over.
 */
import type { BoardEvent } from '../../shared/@types/board/BoardEvent.ts';

/** The one place that decides how Gaia reads the board stream: as change signals, with the board read whole from its document. */
const BOARD_EVENT_OF_EVENT_NAME: Readonly<Record<string, BoardEvent>> = {
  board:    { kind: 'board-changed' },
  job:      { kind: 'part-changed', part: 'job' },
  decision: { kind: 'part-changed', part: 'decision' },
  incident: { kind: 'part-changed', part: 'incident' },
  overseer: { kind: 'part-changed', part: 'overseer' },
  usage:    { kind: 'part-changed', part: 'usage' },
  profile:  { kind: 'part-changed', part: 'profile' },
  pipeline: { kind: 'part-changed', part: 'pipeline' },
};

export class BoardEventIngestion {
  public eventOf(eventName: string): BoardEvent | null {
    return Object.hasOwn(BOARD_EVENT_OF_EVENT_NAME, eventName) ? BOARD_EVENT_OF_EVENT_NAME[eventName] ?? null : null;
  }
}
