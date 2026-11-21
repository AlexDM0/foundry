/**
 * The board stream's events read as change signals. What matters: the recorded stream's `board` event asks for the board document anew and
 * none of its data is read, each part event names its part, and the handshake and an event name Gaia does not know map to nothing.
 */
import { describe, expect, test } from 'bun:test';

import { BoardEventIngestion }         from './BoardEventIngestion.ts';
import { recordedBoardStreamEventsOf } from './testing/BoardDocuments.ts';

const INGESTION = new BoardEventIngestion();

describe('eventOf', () => {
  test('reads the recorded stream: the handshake maps to nothing, the board event asks for the board anew', async () => {
    const events = await recordedBoardStreamEventsOf();
    expect(events.map((event) => INGESTION.eventOf(event.eventName))).toEqual([null, { kind: 'board-changed' }]);
  });

  test('names the part each part event changed', () => {
    for (const part of ['job', 'decision', 'incident', 'overseer', 'usage', 'profile', 'pipeline'] as const) {
      expect(INGESTION.eventOf(part)).toEqual({ kind: 'part-changed', part });
    }
  });

  test('maps an event name Gaia does not know to nothing, an inherited name included', () => {
    expect(INGESTION.eventOf('example-added-event')).toBeNull();
    expect(INGESTION.eventOf('constructor')).toBeNull();
  });
});
