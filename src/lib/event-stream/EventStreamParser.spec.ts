/**
 * The parser hands out an event only when its closing blank line has arrived, wherever the chunks are cut: inside a field, inside a
 * line ending, or between events. What a stream leaves unfinished is never handed out, so a reader never sees half an event. The field
 * rules are the standard's: comments, a missing event name, several data lines, the space after the colon, and the id carried over.
 */
import { describe, expect, test } from 'bun:test';

import { eventStreamParserOf, type ServerSentEvent } from './EventStreamParser.ts';

const TWO_MONITOR_EVENTS = 'event: monitor\ndata: {"monitorVersion":1,"generation":3}\n\n: ping\n\nevent: monitor\ndata: {"monitorVersion":1,"generation":4}\n\n';

const FIRST_MONITOR_EVENT: ServerSentEvent  = { eventName: 'monitor', data: '{"monitorVersion":1,"generation":3}', lastEventId: '' };
const SECOND_MONITOR_EVENT: ServerSentEvent = { eventName: 'monitor', data: '{"monitorVersion":1,"generation":4}', lastEventId: '' };

function eventsOfChunks(chunks: readonly string[]): ServerSentEvent[] {
  const parser = eventStreamParserOf();
  return chunks.flatMap((chunk) => parser.eventsOf(chunk));
}

describe('an event stream cut into chunks', () => {
  test('hands out each event once its blank line arrives, and passes over a comment', () => {
    expect(eventsOfChunks([TWO_MONITOR_EVENTS])).toEqual([FIRST_MONITOR_EVENT, SECOND_MONITOR_EVENT]);
  });

  test('hands out the same events wherever the chunks are cut, down to one character each', () => {
    expect(eventsOfChunks([...TWO_MONITOR_EVENTS])).toEqual([FIRST_MONITOR_EVENT, SECOND_MONITOR_EVENT]);
    for (let cut = 1; cut < TWO_MONITOR_EVENTS.length; cut++) {
      expect(eventsOfChunks([TWO_MONITOR_EVENTS.slice(0, cut), TWO_MONITOR_EVENTS.slice(cut)])).toEqual([FIRST_MONITOR_EVENT, SECOND_MONITOR_EVENT]);
    }
  });

  test('hands out nothing of an event whose blank line never arrives', () => {
    const parser = eventStreamParserOf();
    expect(parser.eventsOf('event: monitor\ndata: {"monitorVersion":1,"generation":3}\n\nevent: monitor\ndata: {"monitorVer')).toEqual([FIRST_MONITOR_EVENT]);
    expect(parser.eventsOf('sion":1,"generation":4}\n')).toEqual([]);
  });

  test('reads line endings of a carriage return, a line feed or both, also when a chunk ends between the two', () => {
    expect(eventsOfChunks(['event: monitor\r\ndata: one\r\n\r\n'])).toEqual([{ eventName: 'monitor', data: 'one', lastEventId: '' }]);
    expect(eventsOfChunks(['event: monitor\rdata: one\r\r'])).toEqual([{ eventName: 'monitor', data: 'one', lastEventId: '' }]);
    expect(eventsOfChunks(['data: one\r', '\n', '\r', '\ndata: two\n\n'])).toEqual([
      { eventName: 'message', data: 'one', lastEventId: '' },
      { eventName: 'message', data: 'two', lastEventId: '' },
    ]);
  });

  test('takes a line feed after an empty chunk as the end of the line ending the carriage return began', () => {
    expect(eventsOfChunks(['data: one\r', '', '\n\n'])).toEqual([{ eventName: 'message', data: 'one', lastEventId: '' }]);
  });
});

describe('the fields of an event', () => {
  test('names an event without an event field message', () => {
    expect(eventsOfChunks(['data: plain\n\n'])).toEqual([{ eventName: 'message', data: 'plain', lastEventId: '' }]);
  });

  test('joins several data lines with a line feed, and keeps a value\'s spaces past the first', () => {
    expect(eventsOfChunks(['data: first\ndata:  second\ndata\n\n'])).toEqual([{ eventName: 'message', data: 'first\n second\n', lastEventId: '' }]);
  });

  test('hands out no event for a blank line after fields without data, and forgets their event name', () => {
    expect(eventsOfChunks(['event: monitor\n\ndata: later\n\n'])).toEqual([{ eventName: 'message', data: 'later', lastEventId: '' }]);
  });

  test('carries the newest id over to later events, and ignores an id holding a null character', () => {
    expect(eventsOfChunks(['id: 3-1\ndata: one\n\ndata: two\n\nid: 3-\u00002\ndata: three\n\n'])).toEqual([
      { eventName: 'message', data: 'one', lastEventId: '3-1' },
      { eventName: 'message', data: 'two', lastEventId: '3-1' },
      { eventName: 'message', data: 'three', lastEventId: '3-1' },
    ]);
  });

  test('ignores a retry field and a field it does not know', () => {
    expect(eventsOfChunks(['retry: 2000\nexample: value\ndata: kept\n\n'])).toEqual([{ eventName: 'message', data: 'kept', lastEventId: '' }]);
  });

  test('drops a byte order mark at the start of the stream only', () => {
    expect(eventsOfChunks(['﻿data: one\n\n', '﻿data: two\n\n'])).toEqual([{ eventName: 'message', data: 'one', lastEventId: '' }]);
  });
});
