/**
 * The ingestion of a forge's board event stream (`GET /api/v4/events`) into Gaia's `BoardEvent`. Events carry the forge's internal state,
 * never a contract document, so Gaia reads only the name: `board` asks for the board document anew, a part event names the part that
 * changed, and a name Gaia does not know, the handshake's included, maps to nothing.
 */
import type { BoardEvent } from '../../shared/@types/board/BoardEvent.ts';

/** The one place that decides how Gaia reads the board stream: as change signals, with the board read whole from its document. */
const BOARD_EVENT_OF_EVENT_NAME: Readonly<Record<string, BoardEvent>> = {
  board:      { kind: 'board-changed' },
  job:        { kind: 'part-changed', part: 'job' },
  decision:   { kind: 'part-changed', part: 'decision' },
  incident:   { kind: 'part-changed', part: 'incident' },
  hephaestus: { kind: 'part-changed', part: 'hephaestus' },
  usage:      { kind: 'part-changed', part: 'usage' },
  profile:    { kind: 'part-changed', part: 'profile' },
  pipeline:   { kind: 'part-changed', part: 'pipeline' },
  documents:  { kind: 'part-changed', part: 'documents' },
};

export class BoardEventIngestion {
  public eventOf(eventName: string): BoardEvent | null {
    return Object.hasOwn(BOARD_EVENT_OF_EVENT_NAME, eventName) ? BOARD_EVENT_OF_EVENT_NAME[eventName] ?? null : null;
  }
}
